import * as z from "zod";
import { Color } from "@galacean/engine-math";
import { isSimplePolygon, polygonDistance } from "../geometry/V2Geometry";

const rgb = z.tuple([
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255)
]);
const id = z.string().trim().min(1).max(240);
const point = z.strictObject({ x: z.number().finite(), z: z.number().finite() });
const parts = ["foliageColorRgb", "barkColorRgb"] as const;
export type VegetationColorPart = (typeof parts)[number];
export const colorableAssetKinds = ["tree", "shrub", "forest", "shrubland", "flower-field"] as const;
export const vegetationColorPatchSchema = z
  .strictObject({
    foliageColorRgb: rgb.nullable().optional(),
    barkColorRgb: rgb.nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "Specify at least one plant part")
  .nullable();
export type VegetationColorPatch = z.infer<typeof vegetationColorPatchSchema>;
const shape = z
  .discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("circle"), center: point, radiusMetres: z.number().positive() }),
    z.strictObject({ kind: z.literal("polygon"), points: z.array(point).min(3) })
  ])
  .refine(
    (value) => value.kind === "circle" || isSimplePolygon(value.points),
    "A color polygon needs a simple outline with nonzero area"
  );
export const vegetationTintAreaSchema = z.strictObject({
  shape,
  targetKinds: z.array(z.enum(["tree", "shrub", "flower"])).min(1),
  assetIds: z.array(id).min(1).optional(),
  featherMetres: z.number().nonnegative()
});
const assetTarget = z.strictObject({ kind: z.literal("asset"), id, assetKind: z.enum(colorableAssetKinds) });
const areaTarget = vegetationTintAreaSchema.extend({ kind: z.literal("area"), id });
export const vegetationColorTargetSchema = z.discriminatedUnion("kind", [assetTarget, areaTarget]);
export type VegetationColorTarget = z.infer<typeof vegetationColorTargetSchema>;
const pigment = z
  .strictObject({ foliageColorRgb: rgb.optional(), barkColorRgb: rgb.optional() })
  .refine((value) => !!(value.foliageColorRgb || value.barkColorRgb), "A saved override needs a plant pigment");
export const vegetationColorResourceSchema = z.strictObject({
  resourceType: z.literal("vegetation-color"),
  resourceId: z.string().min(1),
  properties: z
    .strictObject({ target: vegetationColorTargetSchema, colors: pigment })
    .refine(
      ({ target, colors }) =>
        !colors.barkColorRgb ||
        (target.kind === "area"
          ? target.targetKinds.some((kind) => kind !== "flower")
          : target.assetKind !== "flower-field"),
      "A bark pigment requires trees or shrubs"
    )
});
export type VegetationColorResource = z.infer<typeof vegetationColorResourceSchema>;
export type VegetationRgb = z.infer<typeof rgb>;
export function vegetationColorKey(target: VegetationColorTarget): string {
  return JSON.stringify(["vegetation-color", target.kind === "area" ? "area" : target.assetKind, target.id]);
}
export function patchVegetationColor(
  previous: VegetationColorResource | undefined,
  target: VegetationColorTarget,
  patch: VegetationColorPatch
): VegetationColorResource | undefined {
  const colors = { ...previous?.properties.colors };
  for (const part of parts) {
    if (patch === null || patch[part] === null) delete colors[part];
    else if (patch[part] !== undefined) colors[part] = [...patch[part]];
  }
  return Object.keys(colors).length
    ? { resourceType: "vegetation-color", resourceId: vegetationColorKey(target), properties: { target, colors } }
    : undefined;
}

export interface VegetationColorSample {
  id: string;
  kind: "tree" | "shrub" | "flower";
  assetId?: string;
  ownerId?: string;
  regionId?: string;
  position?: readonly number[];
}
const partState = z.strictObject({
  source: z.enum(["instance", "area", "species-default"]),
  sourceId: z.string().optional().describe("单株或最上层生效区域的稳定标识。"),
  colorRgb: rgb.nullable().describe("生效覆盖的合成色，使用 sRGB 整数 0–255。继承物种默认色时为 null。"),
  weight: z.number().min(0).max(1).describe("合成色对基础反照率的覆盖权重，包含边缘羽化。")
});
export const vegetationColorStateSchema = z.strictObject({ foliage: partState, bark: partState });
type PartState = z.infer<typeof partState>;
const inherited: PartState = { source: "species-default", colorRgb: null, weight: 0 };

export function vegetationAreaWeight(
  target: Extract<VegetationColorTarget, { kind: "area" }>,
  sample: VegetationColorSample
): number {
  if (
    !sample.position ||
    !target.targetKinds.includes(sample.kind) ||
    (target.assetIds && (!sample.assetId || !target.assetIds.includes(sample.assetId)))
  )
    return 0;
  const [x, , z] = sample.position;
  const shape = target.shape;
  const depth =
    shape.kind === "circle"
      ? shape.radiusMetres - Math.hypot(x - shape.center.x, z - shape.center.z)
      : -polygonDistance({ x, z }, shape.points);
  if (depth < 0) return 0;
  if (!target.featherMetres) return 1;
  const t = Math.min(1, depth / target.featherMetres);
  return t * t * (3 - 2 * t);
}

/** A plant's own pigment wins. Brush layers composite newest first over its owner's pigment. */
export class VegetationColors {
  private readonly assets = new Map<string, Map<string, VegetationColorResource["properties"]["colors"]>>();
  private readonly areas: VegetationColorResource[] = [];
  constructor(readonly records: readonly VegetationColorResource[]) {
    for (const record of records) {
      const { target } = record.properties;
      if (target.kind === "area") this.areas.push(record);
      else {
        let group = this.assets.get(target.assetKind);
        if (!group) this.assets.set(target.assetKind, (group = new Map()));
        group.set(target.id, record.properties.colors);
      }
    }
    this.areas.reverse();
  }
  resolve(sample: VegetationColorSample, part: VegetationColorPart): PartState {
    if (!this.records.length || (sample.kind === "flower" && part === "barkColorRgb")) return inherited;
    const ownerKind = sample.kind === "tree" ? "forest" : sample.kind === "shrub" ? "shrubland" : "flower-field";
    // A template flower cushion has its own stable flower-field reference.
    const own = this.assets.get(sample.kind === "flower" ? "flower-field" : sample.kind)?.get(sample.id)?.[part];
    if (own) return { colorRgb: own, weight: 1, source: "instance", sourceId: sample.id };
    const owners = this.assets.get(ownerKind);
    if (!this.areas.length && !owners) return inherited;
    let contribution = 0;
    let firstColor: VegetationRgb | undefined;
    let sourceId: string | undefined;
    let mixed: number[] | undefined;
    const composite = (colorRgb: VegetationRgb, alpha: number, id: string) => {
      const gain = (1 - contribution) * alpha;
      if (!firstColor) {
        firstColor = colorRgb;
        sourceId = id;
      } else {
        mixed ??= firstColor.map((value) => Color.sRGBToLinearSpace(value / 255) * contribution);
        for (let i = 0; i < 3; i++) mixed[i] += Color.sRGBToLinearSpace(colorRgb[i] / 255) * gain;
      }
      contribution = alpha === 1 ? 1 : contribution + gain;
    };
    for (const {
      properties: { target, colors }
    } of this.areas) {
      const colorRgb = colors[part];
      if (!colorRgb || target.kind !== "area") continue;
      const weight = vegetationAreaWeight(target, sample);
      if (weight > 0) composite(colorRgb, weight, target.id);
      if (contribution === 1) break;
    }
    if (contribution < 1 && owners) {
      for (const id of [sample.regionId, sample.ownerId]) {
        const color = id && owners.get(id)?.[part];
        if (id && color) {
          composite(color, 1, id);
          break;
        }
      }
    }
    if (!firstColor) return inherited;
    const colorRgb = mixed
      ? (mixed.map((value) => Math.round(255 * Color.linearToSRGBSpace(value / contribution))) as VegetationRgb)
      : firstColor;
    return { colorRgb, weight: Math.min(1, contribution), source: "area", sourceId };
  }
  changedSamples(previous?: VegetationColors): (sample: VegetationColorSample) => boolean {
    const before = new Map(previous?.records.map((record) => [record.resourceId, record]));
    const areaIds = new Set(this.areas.map((record) => record.resourceId));
    const sharedOld = previous?.areas.filter((record) => areaIds.has(record.resourceId)) ?? [];
    const sharedNew = this.areas.filter((record) => before.has(record.resourceId));
    const targets: VegetationColorTarget[] = [];
    sharedNew.forEach((record, index) => {
      if (record.resourceId !== sharedOld[index]?.resourceId) targets.push(record.properties.target);
    });
    for (const record of this.records) {
      const old = before.get(record.resourceId);
      before.delete(record.resourceId);
      if (old && JSON.stringify(old.properties) === JSON.stringify(record.properties)) continue;
      targets.push(record.properties.target);
      if (old) targets.push(old.properties.target);
    }
    for (const record of before.values()) targets.push(record.properties.target);
    const ids = new Set(targets.filter((target) => target.kind === "asset").map((target) => target.id));
    const areas = targets.filter((target) => target.kind === "area");
    return (sample) =>
      ids.has(sample.id) ||
      (!!sample.regionId && ids.has(sample.regionId)) ||
      (!!sample.ownerId && ids.has(sample.ownerId)) ||
      areas.some((target) => vegetationAreaWeight(target, sample) > 0);
  }
  shaderCode(sample: VegetationColorSample, part: VegetationColorPart): number | undefined {
    const { colorRgb, weight } = this.resolve(sample, part);
    if (!colorRgb) return;
    return encodePlantPigment(colorRgb, weight);
  }
}

// Native assembly records have one full-coverage LOD float. Preserve the signed [-1,1] fade
// range. IEEE-754 exponent pairs 128..253 carry 63 coverage levels per sign and sRGB888:
// the lowest exponent bit holds red bit 7, the 23 mantissa bits hold the rest of RGB.
// All encodings are finite normal floats. AssetAssemblyInstancing.glsl decodes them in the VS.
const pigmentBits = new Uint32Array(1);
const pigmentFloat = new Float32Array(pigmentBits.buffer);
export function encodePlantPigment(rgb: VegetationRgb, weight: number): number | undefined {
  const coverage = Math.round(weight * 126);
  if (!coverage) return;
  const level = coverage - 1;
  pigmentBits[0] =
    (level >= 63 ? 0x80000000 : 0) | 0x40000000 | (level % 63 << 24) | (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  return pigmentFloat[0];
}
