import { constructionDecorationDefinition } from "./ConstructionDecorationCatalog";
import type { ConstructionDecorationSpec } from "./ConstructionDecorations";

export function parseDecorationSpecs(input: unknown): ConstructionDecorationSpec[] {
  if (!Array.isArray(input)) throw Error("decorations must be an array");
  const ids = new Set<string>();
  return input.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Invalid decoration");
    const d = raw as Record<string, unknown>;
    for (const key of Object.keys(d))
      if (
        ![
          "id",
          "variationKey",
          "kind",
          "type",
          "host",
          "uv",
          "rank",
          "seed",
          "woodColor",
          "frameMaterial",
          "u",
          "bottom",
          "width",
          "height",
          "enabled",
          "lightIntensity",
          "lightColor"
        ].includes(key)
      )
        throw Error("Unknown decoration field " + key);
    if (typeof d.id !== "string" || !d.id || ids.has(d.id)) throw Error("Duplicate/empty decoration id");
    ids.add(d.id);
    if (d.variationKey !== undefined && (typeof d.variationKey !== "string" || !d.variationKey))
      throw Error("Invalid attachment variation key");
    if (!["door", "window", "wall-lamp", "lantern", "opening", "hatch"].includes(d.kind as string))
      throw Error("Unknown decoration kind");
    if (d.type !== undefined && (typeof d.type !== "string" || !constructionDecorationDefinition(d.type)))
      throw Error("Unknown decoration type " + String(d.type));
    if (d.host !== undefined && d.host !== "wall" && d.host !== "roof") throw Error("Unknown decoration host");
    if (d.rank !== undefined && ![1, 2, 3].includes(d.rank as number)) throw Error("Decoration rank must be 1, 2 or 3");
    if (
      d.seed !== undefined &&
      (!Number.isInteger(d.seed) || (d.seed as number) < 0 || (d.seed as number) > 0xffffffff)
    )
      throw Error("Decoration seed must be a uint32");
    if (d.seed !== undefined && d.host === "roof")
      throw Error("Decoration seed requires a wall host; native roof attachments own their seed");
    if (
      d.woodColor !== undefined &&
      (!Number.isInteger(d.woodColor) || (d.woodColor as number) < 0 || (d.woodColor as number) > 10)
    )
      throw Error("Decoration woodColor must be an integer in [0,10]");
    if (d.frameMaterial !== undefined && d.frameMaterial !== "wood" && d.frameMaterial !== "wall")
      throw Error("Decoration frameMaterial must be wood or wall");
    for (const k of ["bottom", "width", "height"])
      if (typeof d[k] !== "number" || !Number.isFinite(d[k])) throw Error("Finite decoration " + k + " required");
    if (d.u !== undefined && (typeof d.u !== "number" || !Number.isFinite(d.u) || d.u < 0 || d.u >= 1))
      throw Error("Decoration u must be in [0,1)");
    if (
      d.uv !== undefined &&
      (!Array.isArray(d.uv) ||
        d.uv.length !== 2 ||
        !d.uv.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1))
    )
      throw Error("Decoration roof uv must contain two finite values in [0,1]");
    if ((d.host ?? "wall") === "wall" && d.u === undefined) throw Error("Wall decoration requires u");
    if (d.host === "roof" && d.uv === undefined) throw Error("Roof decoration requires uv");
    if ((d.width as number) <= 0 || (d.height as number) <= 0 || (d.bottom as number) < 0)
      throw Error("Positive decoration size and nonnegative bottom required");
    if (d.enabled !== undefined && typeof d.enabled !== "boolean") throw Error("Invalid decoration enabled");
    if (
      d.lightIntensity !== undefined &&
      (typeof d.lightIntensity !== "number" || !Number.isFinite(d.lightIntensity) || d.lightIntensity < 0)
    )
      throw Error("Nonnegative finite light intensity required");
    if (
      d.lightColor !== undefined &&
      (!Number.isInteger(d.lightColor) || (d.lightColor as number) < 0 || (d.lightColor as number) > 4)
    )
      throw Error("Lantern lightColor must be an integer in [0,4]");
    return structuredClone(d) as unknown as ConstructionDecorationSpec;
  });
}
