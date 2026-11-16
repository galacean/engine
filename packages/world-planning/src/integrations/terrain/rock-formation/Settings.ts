import type { PlanningComponentDefinition } from "../../../spatial/PlanningComponents";
import type { PlanningDocument } from "../../../spatial/PlanningDocument";
import { ComponentRegistry, resolveComponent } from "../../../spatial/SpatialDocument";
import { readRockColorBlend, ROCK_COLOR_FIELDS, type RockColorBlend } from "./ColorPalette";

export interface RockFormationSettings {
  colorBlend: RockColorBlend;
}

export const ROCK_FORMATION_COMPONENT: PlanningComponentDefinition = {
  type: "rockFormation",
  label: "Rock palette / 岩石配色",
  version: 1,
  tab: "world",
  sparseGlobal: true,
  presentation: true,
  fields: ROCK_COLOR_FIELDS.map((field) => ({ ...field, kinds: ["world"] }))
};

export const ROCK_OBB_COMPONENT: PlanningComponentDefinition = {
  type: "rockObb",
  label: "Rock OBB / 岩石包围盒",
  version: 1,
  tab: "world",
  kinds: ["rockObb"],
  description: "改变岩石可占据的宽、高、深。模型保留自身比例，按包围盒等比缩放。",
  fields: (
    [
      ["width", "Width / 宽度"],
      ["height", "Height / 高度"],
      ["depth", "Depth / 深度"]
    ] as const
  ).map(([key, label]) => ({ key, label, type: "number", unit: "m", min: 0.1, max: 2048, step: 0.5 }))
};

export const rockFormationRegistry = new ComponentRegistry();
rockFormationRegistry.register(ROCK_FORMATION_COMPONENT);
rockFormationRegistry.register(ROCK_OBB_COMPONENT);

export function readRockFormationSettings(document: PlanningDocument): RockFormationSettings {
  const values = document.entities.world?.components.rockFormation
    ? resolveComponent(document, "world", "rockFormation", rockFormationRegistry).values
    : {};
  return { colorBlend: readRockColorBlend(values) };
}
