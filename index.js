import config from "./config.json" with { type: "json" }
import path from "node:path"
import fs from "node:fs"

const pack = path.join(config.packs, config.source)
const assets = path.join(pack, "assets/minecraft")

const lang = JSON.parse(fs.readFileSync(path.join(assets, "lang", `${config.language}.json`)))

const limitedSpecials = []
for (const item of config.limited_specials) {
  if (item.includes("{{colour}}")) {
    for (const colour of config.colours) {
      limitedSpecials.push(item.replace("{{colour}}", colour ? colour + "_" : ""))
    }
  } else {
    limitedSpecials.push(item)
  }
}

const items = []

const names = new Set
for (const file of fs.readdirSync(path.join(assets, "items"))) {
  const id = file.slice(0, -5)
  if (config.skip.includes(id)) {
    continue
  }
  const definition = JSON.parse(fs.readFileSync(path.join(assets, "items", file)))
  let name = config.new.includes(id) ? (lang[`block.minecraft.${id}.new`] ?? lang[`item.minecraft.${id}.new`]) : lang[`block.minecraft.${id}`] ?? lang[`item.minecraft.${id}`]
  if (config.title_case.includes(name)) {
    name = id.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ")
  }
  if (names.has(name)) {
    console.error(`DUPLICATE NAME FOR "${id}":`, name)
    process.exit()
  }
  names.add(name)
  const data = {
    id,
    name: [
      name
    ]
  }
  if (!data.name.includes(name.toLowerCase())) {
    data.name.push(name.toLowerCase())
  }
  if (!data.name.includes(name.toUpperCase())) {
    data.name.push(name.toUpperCase())
  }
  while (true) {
    if (definition.model.type === "minecraft:select") {
      if (config.select_prefers_case.includes(id)) {
        definition.model = definition.model.cases[0].model
      } else {
        definition.model = definition.model.fallback
      }
      continue
    }
    if (definition.model.type === "minecraft:condition") {
      if (config.condition_prefers_true.includes(id)) {
        definition.model = definition.model.on_true
      } else {
        definition.model = definition.model.on_false
      }
      continue
    }
    if (definition.model.type === "minecraft:range_dispatch") {
      definition.model = definition.model.entries[0].model
      continue
    }
    break
  }
  if (definition.model.type === "minecraft:model") {
    data.definition = definition.model
    if (definition.model.model.startsWith("minecraft:item/")) {
      data.model = JSON.parse(fs.readFileSync(path.join(assets, "models", definition.model.model.replace("minecraft:", "") + ".json")))
      data.type = "item"
      if (!data.model.textures) {
        data.type = "block"
        data.definition.model = data.model.parent
      }
    } else {
      data.type = "block"
    }
  } else if (definition.model.type === "minecraft:special") {
    data.type = "special"
    data.definition = definition.model
    if (!limitedSpecials.some(e => e === id)) {
      if (
        !id.includes("shulker_box") &&
        !id.includes("chest") &&
        !id.includes("conduit")
      ) {
        console.warn("UNCHECKED SPECIAL ITEM:", id)
      }
    }
  } else {
    console.log("UNHANDLED ITEM:", id)
    continue
  }
  items.push(data)
}

if (fs.existsSync("output/assets")) {
  fs.rmSync("output/assets", { recursive: true })
}
fs.mkdirSync("output/assets/minecraft/models/item/shulker_box", { recursive: true })
fs.mkdirSync("output/assets/minecraft/items", { recursive: true })
fs.writeFileSync("output/pack.mcmeta", JSON.stringify({
  pack: {
    description: config.description,
    pack_format: JSON.parse(fs.readFileSync(path.join(pack, "pack.mcmeta"))).pack.pack_format
  }
}))
fs.copyFileSync("assets/pack.png", "output/pack.png")
fs.writeFileSync("output/assets/minecraft/models/item/shulker_box/shulker_box_item.json", JSON.stringify(JSON.parse(fs.readFileSync("assets/item.json", "utf8"))))
fs.writeFileSync("output/assets/minecraft/models/item/shulker_box/shulker_box_item_double_tint.json", JSON.stringify(JSON.parse(fs.readFileSync("assets/item_double_tint.json", "utf8"))))

for (const colour of config.colours) {
  fs.writeFileSync(path.join("output/assets/minecraft/models/item/shulker_box", `${colour ? colour + "_" : ""}shulker_box_background.json`), JSON.stringify(JSON.parse(fs.readFileSync("assets/background.json", "utf8").replaceAll("{{colour}}", colour ? colour + "_" : ""))))
  fs.writeFileSync(path.join("output/assets/minecraft/models/item/shulker_box", `${colour ? colour + "_" : ""}shulker_box_surround.json`), JSON.stringify(JSON.parse(fs.readFileSync("assets/surround.json", "utf8").replaceAll("{{colour}}", colour ? colour + "_" : ""))))
  const standard = {
    type: "special",
    base: `item/${colour ? colour + "_" : ""}shulker_box`,
    model: {
      type: "shulker_box",
      texture: `shulker${colour ? "_" + colour : ""}`
    }
  }
  const definition = {
    model: {
      type: "select",
      property: "display_context",
      cases: [
        {
          when: [
            "gui",
            "fixed"
          ],
          model: {
            type: "select",
            property: "component",
            component: "custom_name",
            cases: [],
            fallback: standard
          }
        },
        {
          when: "head",
          model: standard
        }
      ],
      fallback: {
        type: "select",
        property: "component",
        component: "custom_name",
        cases: [],
        fallback: standard
      }
    }
  }
  for (const item of items) {
    if (item.id === `${colour ? colour + "_" : ""}shulker_box`) {
      continue
    }
    definition.model.cases[0].model.cases.push({
      when: item.name,
      model: {
        type: "composite",
        models: [
          {
            type: "model",
            model: `item/shulker_box/${colour ? colour + "_" : ""}shulker_box_background`
          },
          item.definition
        ]
      }
    })
    if (item.type === "block" || item.type === "special") {
      if (item.type === "special" && limitedSpecials.some(e => e === item.id)) {
        definition.model.fallback.cases.push({
          when: item.name,
          model: standard
        })
      } else {
        definition.model.fallback.cases.push({
          when: item.name,
          model: {
            type: "composite",
            models: [
              {
                type: "model",
                model: `item/shulker_box/${colour ? colour + "_" : ""}shulker_box_surround`
              },
              item.definition
            ]
          }
        })
      }
    } else if (item.type === "item") {
      if (item.definition.tints?.length == 2) {
        fs.writeFileSync(path.join("output/assets/minecraft/models/item/shulker_box", item.id + ".json"), JSON.stringify({
          parent: "item/shulker_box/shulker_box_item_double_tint",
          textures: {
            base: item.model.textures.layer0,
            overlay: item.model.textures.layer1
          }
        }))
      } else {
        fs.writeFileSync(path.join("output/assets/minecraft/models/item/shulker_box", item.id + ".json"), JSON.stringify({
          parent: "item/shulker_box/shulker_box_item",
          textures: {
            item: item.model.textures.layer0
          }
        }))
      }
      const model = {
        type: "model",
        model: "item/shulker_box/" + item.id
      }
      if (item.definition.tints) {
        model.tints = item.definition.tints
      }
      definition.model.fallback.cases.push({
        when: item.name,
        model: {
          type: "composite",
          models: [
            standard,
            model
          ]
        }
      })
    }
  }
  fs.writeFileSync(path.join("output/assets/minecraft/items", `${colour ? colour + "_" : ""}shulker_box.json`), JSON.stringify(definition).replaceAll("minecraft:", ""))
}