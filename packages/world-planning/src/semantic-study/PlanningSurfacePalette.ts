/** Flat, soft natural colours shared by the planning map and whitebox. */
export const PLANNING_SURFACES = [
  { id: "grass", label: "草地", channel: "R", color: [179, 200, 137] },
  { id: "soil", label: "泥土（道路、广场）", channel: "G", color: [226, 207, 164] },
  { id: "water", label: "水域", channel: "B", color: [44, 143, 202] }
] as const;
/** sRGB swatches shared by vector terrain and layer legends. */
export const PLANNING_SURFACE_CSS = {
  ...Object.fromEntries(
    PLANNING_SURFACES.map((s) => [s.id, "#" + s.color.map((v) => v.toString(16).padStart(2, "0")).join("")])
  ),
  flowers: "#d786b9"
} as Record<"grass" | "soil" | "water" | "flowers", string>;
/** Object colours are identical in plan and whitebox; lighting is separate. */
export const PLANNING_OBJECT_CSS = {
  ocean: "#307dbf",
  actor: "#397dcc",
  building: "#e8c493",
  buildingEdge: "#967653",
  rock: "#a8b7ac",
  rockEdge: "#708879",
  tree: "#7f9f71",
  trunk: "#947456",
  door: "#af6554",
  ink: "#40594f",
  village: "#9c986a",
  group: "#a190ac",
  obb: "#699f9b"
} as const;
export function planningColor(css: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** Pale water swatches for the unlit top-down planning map. */
export const PLANNING_MAP_WATER_CSS = { ocean: "#b7dce9", water: "#a6d5e7" } as const;
