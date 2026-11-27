/** Visual-only authoring. Source locations and water velocity never belong to a Look. */
export const WATER_CONTACT_EFFECT_KINDS = ["splash", "mist", "whitewater"] as const;
export type WaterContactEffectKind = (typeof WATER_CONTACT_EFFECT_KINDS)[number];
export interface WaterContactEffectStyle {
  readonly enabled: boolean;
  readonly textureId: string;
  readonly atlasColumns: number;
  readonly atlasRows: number;
  readonly color: readonly [number, number, number];
  readonly opacity: number;
  readonly size: number;
  readonly lifetime: number;
  readonly density: number;
  readonly rise: number;
  readonly spread: number;
}
export type WaterContactEffectsLook = Readonly<Record<WaterContactEffectKind, WaterContactEffectStyle>>;

export function resolveWaterContactEffectsLook(input: unknown): WaterContactEffectsLook {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Water contact effects require an object.");
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((k) => !WATER_CONTACT_EFFECT_KINDS.includes(k as WaterContactEffectKind)))
    throw new TypeError("Unknown contact effect kind.");
  const resolved = {} as Record<WaterContactEffectKind, WaterContactEffectStyle>;
  for (const kind of WATER_CONTACT_EFFECT_KINDS) {
    const style = data[kind] as WaterContactEffectStyle;
    if (!style || typeof style !== "object" || Array.isArray(style)) throw new TypeError(`Missing ${kind} style.`);
    const fields = [
      "enabled",
      "textureId",
      "atlasColumns",
      "atlasRows",
      "color",
      "opacity",
      "size",
      "lifetime",
      "density",
      "rise",
      "spread"
    ];
    if (Object.keys(style).some((key) => !fields.includes(key))) throw new TypeError(`Unknown ${kind} parameter.`);
    if (typeof style.enabled !== "boolean" || typeof style.textureId !== "string" || !style.textureId.trim())
      throw new TypeError(`Invalid ${kind} switch or texture.`);
    for (const [key, min, max] of [
      ["opacity", 0, 1],
      ["size", 0.05, 8],
      ["lifetime", 0.1, 8],
      ["density", 0, 1],
      ["rise", 0, 5],
      ["spread", 0, 8],
      ["atlasColumns", 1, 16],
      ["atlasRows", 1, 16]
    ] as const) {
      const value = style[key];
      if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`Invalid ${kind}.${key}.`);
    }
    if (!Number.isInteger(style.atlasColumns) || !Number.isInteger(style.atlasRows))
      throw new RangeError("Atlas dimensions must be integers.");
    if (
      !Array.isArray(style.color) ||
      style.color.length !== 3 ||
      [0, 1, 2].some((i) => !Number.isFinite(style.color[i]) || style.color[i] < 0 || style.color[i] > 1)
    )
      throw new RangeError("Effect color requires linear RGB in [0,1].");
    resolved[kind] = Object.freeze({
      ...style,
      color: Object.freeze([...style.color]) as readonly [number, number, number]
    });
  }
  return Object.freeze(resolved);
}
