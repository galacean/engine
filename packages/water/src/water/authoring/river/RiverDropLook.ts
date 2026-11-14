import { createImmutableWaterSnapshot } from "../identity/WaterImmutableSnapshot";

export interface RiverDropTexture {
  readonly assetId: string;
  readonly contentHash: string;
}

export interface RiverDropFlowLayer {
  readonly scale: readonly [number, number];
  /** UV units per second, in curtain coordinates: V increases from lip to landing. */
  readonly velocity: readonly [number, number];
}

/** Presentation of every explicit drop in one River; no hydrology or terrain editing. */
export interface RiverDropLook {
  readonly textures: Readonly<
    Record<"directional" | "cloud" | "lines" | "edge" | "voronoi" | "foam" | "mist" | "splash", RiverDropTexture>
  >;
  readonly layers: Readonly<
    Record<"directional" | "cloud" | "lines" | "edge" | "voronoi" | "foam", RiverDropFlowLayer>
  >;
  readonly curtain: {
    readonly lineDistortion: number;
    readonly lineOpacity: number;
    readonly lineReveal: number;
    readonly bottomFoamStart: number;
    readonly bottomFoamThreshold: number;
    readonly edgeCutout: number;
    readonly edgeFoamThreshold: number;
    readonly edgeFoamOpacity: number;
    readonly entryFade: number;
    readonly dotsThreshold: number;
    readonly dotsOpacity: number;
  };
  readonly impact: {
    readonly scale: readonly [number, number];
    readonly velocity: number;
    readonly distortion: number;
    readonly lengthMultiplier: number;
    readonly lengthPower: number;
    readonly widthPower: number;
    readonly threshold: number;
  };
  /** Linear RGB: dark body, light body, streaks, turbulent white water. */
  readonly colors: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number]
  ];
  /** Multiplier for texture advection, splash and falling-droplet time. Zero freezes all drop effects. */
  readonly speed: number;
  readonly opacity: number;
  readonly normalStrength: number;
  readonly colorContrast: number;
  readonly parallaxDepth: number;
  readonly foamOpacity: number;
  readonly sprayOpacity: number;
  readonly mistOpacity: number;
}

export function resolveRiverDropLook(value: RiverDropLook): Readonly<RiverDropLook> {
  if (!value || typeof value !== "object") throw new TypeError("River drop Look must be an object.");
  for (const slot of ["directional", "cloud", "lines", "edge", "voronoi", "foam", "mist", "splash"] as const) {
    const reference = value.textures?.[slot];
    if (
      !reference ||
      typeof reference.assetId !== "string" ||
      !reference.assetId.trim() ||
      typeof reference.contentHash !== "string" ||
      !/^[a-f\d]{64}$/i.test(reference.contentHash)
    )
      throw new TypeError(`River drop texture '${slot}' requires an asset id and SHA-256 identity.`);
  }
  for (const [slot, layer] of Object.entries(value.layers ?? {})) {
    for (const tuple of [layer.scale, layer.velocity])
      if (!Array.isArray(tuple) || tuple.length !== 2 || !tuple.every(Number.isFinite))
        throw new TypeError(`River drop layer '${slot}' requires finite scale and velocity pairs.`);
    if (layer.scale.some((v) => v <= 0)) throw new RangeError("River drop texture scale must be positive.");
  }
  for (const slot of ["directional", "cloud", "lines", "edge", "voronoi", "foam"])
    if (!value.layers?.[slot as keyof RiverDropLook["layers"]])
      throw new TypeError(`Missing River drop layer '${slot}'.`);
  const required = {
    curtain: [
      "lineDistortion",
      "lineOpacity",
      "lineReveal",
      "bottomFoamStart",
      "bottomFoamThreshold",
      "edgeCutout",
      "edgeFoamThreshold",
      "edgeFoamOpacity",
      "entryFade",
      "dotsThreshold",
      "dotsOpacity"
    ],
    impact: ["velocity", "distortion", "lengthMultiplier", "lengthPower", "widthPower", "threshold"]
  } as const;
  for (const group of ["curtain", "impact"] as const) {
    if (!value[group]) throw new TypeError("River drop curtain and impact configuration are required.");
    for (const field of required[group]) {
      const number = (value[group] as unknown as Record<string, number>)[field];
      if (!Number.isFinite(number)) throw new TypeError(`Invalid River drop ${group}.${field}.`);
      if (field !== "velocity" && number < 0)
        throw new RangeError(`River drop ${group}.${field} must be non-negative.`);
    }
  }
  if (
    !Array.isArray(value.impact.scale) ||
    value.impact.scale.length !== 2 ||
    value.impact.scale.some((v) => !Number.isFinite(v) || v <= 0)
  )
    throw new RangeError("Invalid River drop impact texture scale.");
  if (
    value.curtain.entryFade < 0 ||
    value.curtain.lineReveal < 0 ||
    value.impact.lengthPower < 0 ||
    value.impact.widthPower < 0
  )
    throw new RangeError("River drop fade powers must be non-negative.");
  for (const field of [
    "bottomFoamThreshold",
    "edgeCutout",
    "edgeFoamThreshold",
    "edgeFoamOpacity",
    "dotsThreshold",
    "dotsOpacity"
  ] as const)
    if (value.curtain[field] > 1) throw new RangeError(`River drop curtain.${field} must not exceed one.`);
  if (value.curtain.bottomFoamStart >= 1 || value.impact.threshold > 1)
    throw new RangeError("River drop foam masks require a non-empty transition interval.");
  if (
    !Array.isArray(value.colors) ||
    value.colors.length !== 4 ||
    !value.colors.every(
      (color) => Array.isArray(color) && color.length === 3 && color.every((v) => Number.isFinite(v) && v >= 0)
    )
  )
    throw new TypeError("River drop colors must contain four finite, non-negative linear RGB colors.");
  for (const field of [
    "speed",
    "opacity",
    "normalStrength",
    "colorContrast",
    "parallaxDepth",
    "foamOpacity",
    "sprayOpacity",
    "mistOpacity"
  ] as const) {
    if (!Number.isFinite(value[field]) || value[field] < 0)
      throw new RangeError(`River drop ${field} must be finite and non-negative.`);
  }
  for (const field of ["opacity", "foamOpacity", "sprayOpacity", "mistOpacity"] as const)
    if (value[field] > 1) throw new RangeError(`River drop ${field} must not exceed one.`);
  return createImmutableWaterSnapshot(value);
}
