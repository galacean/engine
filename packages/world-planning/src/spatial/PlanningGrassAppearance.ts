import type { PlanningComponentDefinition } from "./PlanningComponents";
import type { PlanningDocument } from "./PlanningDocument";
import type { PlanningSystemDeclaration } from "./PlanningSystemDeclaration";
import { ComponentRegistry, resolveComponent } from "./SpatialDocument";
import {
  SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS as defaults,
  freezeSeedWorldGrassColorFieldTuning,
  type SeedWorldGrassColorFieldTuning
} from "@galacean/engine-vegetation/world/SeedWorldGrassColorField";

/** The existing Terrain/Grass shared palette, authored through the same parameter transaction. */
export const GRASS_APPEARANCE_COMPONENT: PlanningComponentDefinition = {
  type: "grassAppearance",
  label: "草地与低草配色",
  version: 1,
  tab: "ecology",
  presentation: true,
  description:
    "Terrain/Grass 的两个线性 RGB 色场端点，仅地表草层与低草叶片共同使用。高草与杂草、匍匐地被、花茎叶、树冠及灌木使用独立 plantMaterial，不继承这两个颜色；完整植被集合可用 world.parameters.materials.inspect/apply 按真实生态层和部位编辑。",
  fields: [
    ...(["colorA", "colorB"] as const).flatMap((slot) =>
      (["r", "g", "b"] as const).map((channel, index) => ({
        key: `${slot}.${channel}`,
        label: `${slot === "colorA" ? "草地暗部" : "草地亮部"} · ${channel.toUpperCase()}`,
        type: "number" as const,
        min: 0,
        max: 1,
        unit: "线性 RGB",
        combine: "override" as const,
        default: defaults[slot][index],
        description:
          "现有世界色场的两个线性 RGB 端点，同时更新地表草层和低草叶片；不是光照阴影颜色，不改树叶、花瓣、道路、纹理或分布。"
      }))
    ),
    { key: "saturation", label: "草地色场饱和度倍率", type: "number", min: 0, unit: "倍", default: defaults.saturation }
  ]
};
export const GRASS_APPEARANCE_DECLARATION: PlanningSystemDeclaration = {
  id: "grass-appearance",
  title: "草地配色",
  skill: "vegetation",
  components: [
    {
      type: "grassAppearance",
      domain: "vegetation",
      knowledge: [
        "grassAppearance 修改 Terrain/Grass 已有的共享草地色场。colorA、colorB 是地表和低草叶片共同使用的线性 RGB 两个端点，受原有色场、真实光照和后处理影响。树叶、树干、花瓣由 plantMaterial 的独立槽控制。",
        "草地、树叶、花瓣的固有色要分别由所属的颜色能力表达，不能用全局色温替代。光照和后处理用于照明和整幅调色。过强的全局暖调会同时改变天空和所有对象。"
      ]
    },
    {
      type: "surfacePalette",
      domain: "vegetation",
      knowledge: [
        "surfacePalette 的 color.r/g/b 是裸地材质的线性 RGB；road.r/g/b 可独立设置道路色，未覆盖的道路通道继承 color。草地关闭后仍消费裸地色。它不改变照明、天空、草地或植物材质。"
      ]
    }
  ]
};
const registry = new ComponentRegistry();
registry.register(GRASS_APPEARANCE_COMPONENT);
/** Bare ground and paved surfaces have their own material colour. Disabling
 * grass must not reveal the unrelated original beige palette in an ice world. */
export const SURFACE_PALETTE_COMPONENT: PlanningComponentDefinition = {
  type: "surfacePalette",
  label: "裸地与道路配色",
  version: 1,
  tab: "ecology",
  presentation: true,
  fields: (["color", "road"] as const).flatMap((slot) =>
    (["r", "g", "b"] as const).map((channel) => ({
      key: slot + "." + channel,
      label: (slot === "road" ? "道路固有色 · " : "地表固有色 · ") + channel.toUpperCase(),
      type: "number" as const,
      min: 0,
      max: 1,
      unit: "线性 RGB",
      combine: "override" as const,
      description: "现有 Terrain 材质颜色；道路可独立覆盖，缺省继承地表色。不修改草地、光照、天空或地形。"
    }))
  )
};
registry.register(SURFACE_PALETTE_COMPONENT);
export function readSurfacePalette(
  document: PlanningDocument,
  inherited: readonly [number, number, number],
  slot: "color" | "road" = "color"
): readonly [number, number, number] {
  if (!document.entities.world?.components.surfacePalette) return inherited;
  const { values } = resolveComponent(document, "world", "surfacePalette", registry);
  return (["r", "g", "b"] as const).map((channel, i) =>
    Number(values[slot + "." + channel] ?? values["color." + channel] ?? inherited[i])
  ) as [number, number, number];
}
export function readGrassAppearance(document: PlanningDocument): SeedWorldGrassColorFieldTuning {
  const resolved = document.entities.world?.components.grassAppearance
    ? resolveComponent(document, "world", "grassAppearance", registry)
    : undefined;
  const values = resolved?.values ?? {};
  registry.validate("grassAppearance", values);
  const color = (slot: "colorA" | "colorB") =>
    (["r", "g", "b"] as const).map((channel, index) =>
      Number(values[`${slot}.${channel}`] ?? defaults[slot][index])
    ) as [number, number, number];
  const mask = (slot: "colorA" | "colorB") =>
    (["r", "g", "b"] as const).map((channel) => (resolved?.sources[`${slot}.${channel}`]?.length ? 1 : 0)) as [
      number,
      number,
      number
    ];
  const surface = document.entities.world?.components.surfacePalette
    ? resolveComponent(document, "world", "surfacePalette", registry)
    : undefined;
  const authoredSurface = ["color", "road"].some((slot) =>
    (["r", "g", "b"] as const).some((channel) => surface?.sources[slot + "." + channel]?.length)
  );
  return freezeSeedWorldGrassColorFieldTuning({
    ...defaults,
    colorA: color("colorA"),
    colorB: color("colorB"),
    colorOverrideA: mask("colorA"),
    colorOverrideB: mask("colorB"),
    saturation: Number(values.saturation ?? defaults.saturation),
    // The native road field otherwise replaces roadColor at strength 1. An
    // authored surface palette must reach the same ground evaluation used by
    // Terrain, grass roots and rock-ground blending, rather than being hidden
    // by the original yellow/green road endpoints.
    ...(authoredSurface ? { roadColorStrength: 0 } : {})
  });
}
