import type { SpatialField } from "@galacean/engine-world-planning/spatial/SpatialDocument";
/** One display conversion for optimistic edits and resolved values; never changes authored units. */
export function formatSpatialFieldValue(field: SpatialField, value: unknown): string {
  if (value === undefined) return "未设置";
  if (typeof value !== "number") return field.optionLabels?.[String(value)] ?? String(value);
  if (field.display)
    return (value * field.display.scale + field.display.offset).toFixed(field.display.precision) + field.display.unit;
  if (field.unit === "%") return Math.round(value * 100) + "%";
  const precision = Math.min(8, Math.max(2, Math.ceil(-Math.log10(field.step ?? 0.01))));
  return [String(Number(value.toFixed(precision))), field.unit].filter(Boolean).join(" ");
}
