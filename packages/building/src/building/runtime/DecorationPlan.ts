import { parseDecorationSpecs } from "./DecorationParameters";
import { resolveDecorationConfig } from "./ConstructionDecorationConfig";
import { constructionDecorationDefinition } from "./ConstructionDecorationCatalog";
import type { ConstructionDecorationSpec } from "./ConstructionDecorations";
import type { PublishedWallProfile } from "./PublishedWallProfile";

export function normalizeDecorationPlan(input: unknown, flatRoof: boolean): ConstructionDecorationSpec[] {
  return parseDecorationSpecs(input).map((spec) => {
    const resolved = resolveDecorationConfig(spec, flatRoof);
    const typeId = resolved.type;
    const type = typeId === undefined ? undefined : constructionDecorationDefinition(typeId);
    if (!type) return spec;
    return {
      ...spec,
      type: typeId,
      kind: resolved.kind
    };
  });
}

/** Defaults are derived only once into authored specs. IDs are face/slot based,
 * so material, height and LOD changes do not re-seed unrelated decorations. */
export function planFacadeDecorations(
  building: { kind?: string; height: number; circle?: { radius: number }; rectangle?: { size: number[] } },
  profile?: PublishedWallProfile
): ConstructionDecorationSpec[] {
  if (building.kind) return [];
  const circle = building.circle;
  const widths = circle
    ? [
        (Math.PI * circle.radius) / 2,
        (Math.PI * circle.radius) / 2,
        (Math.PI * circle.radius) / 2,
        (Math.PI * circle.radius) / 2
      ]
    : [
        building.rectangle!.size[1],
        building.rectangle!.size[0],
        building.rectangle!.size[1],
        building.rectangle!.size[0]
      ];
  const perimeter = widths.reduce((a, b) => a + b, 0);
  const specs: ConstructionDecorationSpec[] = [];

  let start = 0;
  for (let face = 0; face < 4; face++) {
    const length = widths[face];
    const u = (start + length * 0.5) / perimeter;
    const coordinate = profile?.projected.coord(u);
    const usable =
      coordinate && profile
        ? (profile.top[coordinate[0]] - profile.bottom[coordinate[0]]) * (1 - coordinate[1]) +
          (profile.top[coordinate[0] + 1] - profile.bottom[coordinate[0] + 1]) * coordinate[1]
        : building.height - 0.46;
    if (face === 1 && length > 1.35 && usable > 1.65) {
      const width = Math.min(1.25, length * 0.45),
        height = Math.min(2.25, usable * 0.82);
      specs.push({ id: "entrance", kind: "door", u, bottom: 0, width, height });
      if (length > 2.6)
        specs.push({
          id: "entrance-lamp",
          kind: "wall-lamp",
          u: (start + length * 0.5 + width * 0.5 + 0.38) / perimeter,
          bottom: Math.min(1.65, usable - 0.8),
          width: 0.44,
          height: 0.9,
          lightIntensity: 1.4
        });
    } else if (length > 1.1 && usable > 1.5) {
      const count = Math.max(1, Math.floor((length - 0.5) / 3));
      for (let slot = 0; slot < count; slot++) {
        const height = Math.min(1.35, usable * 0.47),
          bottom = Math.min(0.85, usable - height - 0.15);
        specs.push({
          id: `window-${face}-${slot}`,
          kind: "window",
          u: (start + (length * (slot + 0.5)) / count) / perimeter,
          bottom,
          width: Math.min(0.9, (length * 0.5) / count),
          height,
          lightIntensity: 0.12
        });
      }
    }
    start += length;
  }
  return specs;
}
