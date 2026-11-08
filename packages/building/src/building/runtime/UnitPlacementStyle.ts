/** Material presets and placement names, independent of any author document. */
export type MaterialUnit = "brick" | "roof_tile" | "wooden_plank";
export type ArrangementRule =
  | "auto"
  | "overlap_rows"
  | "staggered_rows"
  | "grid"
  | "horizontal_rows"
  | "parallel_rows"
  | "posts_and_rails";
export const arrangementRules: [ArrangementRule, ...ArrangementRule[]] = [
  "auto",
  "overlap_rows",
  "staggered_rows",
  "grid",
  "horizontal_rows",
  "parallel_rows",
  "posts_and_rails"
];
export function materialArrangement(unit: MaterialUnit): Exclude<ArrangementRule, "auto"> {
  return unit === "brick" ? "staggered_rows" : unit === "roof_tile" ? "overlap_rows" : "parallel_rows";
}
