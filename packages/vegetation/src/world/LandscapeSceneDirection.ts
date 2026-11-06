import type { LandscapePoint, VegetationLandscapeRequest } from "./VegetationLandscapePlan";

export type LandscapeLinearRgb = readonly [number, number, number];

/** Linear albedo adjustment relative to the original asset, never the previous edit. */
export interface LandscapeColorAdjustment {
  readonly saturation: number;
  readonly exposureEV: number;
  readonly tint: LandscapeLinearRgb;
  readonly foliageOnly: boolean;
}

/** An upstream agent resolves language into this contract. No keyword/preset interpreter lives here. */
export interface LandscapeSceneDirection {
  readonly version: 1;
  readonly intent: { readonly theme: string; readonly style: string; readonly mood: string };
  readonly focusId: string;
  readonly viewId: string;
  /** Coordinates are subject widths: +X is view-right, +Z is away from the observer.
   * Rectangles become ordinary world-space growth influences; they never relocate rendered instances. */
  readonly zones: readonly {
    readonly id: string;
    readonly center: LandscapePoint;
    readonly halfSize: LandscapePoint;
    readonly feather: number;
    readonly density: Readonly<Record<string, number>>;
  }[];
  readonly layers: readonly {
    readonly layerId: string;
    readonly densityScale?: number;
    readonly sizeScale?: number;
    /** Additional vertical scale, preserving ground coverage and horizontal spacing. */
    readonly heightScale?: number;
    readonly depthWeights?: readonly [number, number, number];
    readonly color?: LandscapeColorAdjustment;
  }[];
  readonly grass: {
    readonly colorA: LandscapeLinearRgb;
    readonly colorB: LandscapeLinearRgb;
    readonly saturation: number;
  };
  /** Scene-wide, linear source values consumed by the existing lighting owner. */
  readonly lighting: {
    readonly sunlight: { readonly color: LandscapeLinearRgb; readonly intensity: number };
    readonly environment: { readonly diffuse: number; readonly specular: number };
  };
}

export interface CompiledLandscapeSceneDirection {
  readonly direction: LandscapeSceneDirection;
  readonly request: VegetationLandscapeRequest;
  readonly zones: readonly { readonly id: string; readonly polygon: readonly LandscapePoint[] }[];
}

/** Validate the entire request before any world or rendering mutation. */
export function compileLandscapeSceneDirection(
  base: VegetationLandscapeRequest,
  input: LandscapeSceneDirection
): CompiledLandscapeSceneDirection {
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`Scene direction: ${message}`);
  };
  const finite = (v: number, min = 0, max = Infinity) => Number.isFinite(v) && v >= min && v <= max;
  const rgb = (v: LandscapeLinearRgb) => Array.isArray(v) && v.length === 3 && v.every((c) => finite(c, 0, 1));
  const point = (v: LandscapePoint) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
  check(!!input && input.version === 1, "unsupported version");
  check(
    !!input.intent &&
      [input.intent.theme, input.intent.style, input.intent.mood].every(
        (value) => typeof value === "string" && value.trim().length > 0
      ),
    "theme, style and mood are required"
  );
  const focus = base.focalTargets.find((f) => f.id === input.focusId);
  const view = base.views.find((v) => v.id === input.viewId);
  check(!!focus && !!view, "unknown focus or reference view");
  check(Array.isArray(input.zones) && Array.isArray(input.layers), "zones and layers are required");
  const layerIds = new Set(base.layers.map((l) => l.id));
  check(new Set(input.layers.map((l) => l.layerId)).size === input.layers.length, "duplicate layer adjustment");
  for (const layer of input.layers) {
    check(layerIds.has(layer.layerId), `unknown layer ${layer.layerId}`);
    check(layer.densityScale === undefined || finite(layer.densityScale), "invalid density scale");
    check(layer.sizeScale === undefined || (finite(layer.sizeScale) && layer.sizeScale > 0), "invalid size scale");
    check(
      layer.heightScale === undefined || (finite(layer.heightScale) && layer.heightScale > 0),
      "invalid height scale"
    );
    check(
      layer.depthWeights === undefined ||
        (Array.isArray(layer.depthWeights) &&
          layer.depthWeights.length === 3 &&
          layer.depthWeights.every((v) => finite(v, 0, 1))),
      "invalid depth weights"
    );
    if (layer.color)
      check(
        finite(layer.color.saturation, 0, 1) &&
          Number.isFinite(layer.color.exposureEV) &&
          Number.isFinite(2 ** layer.color.exposureEV) &&
          rgb(layer.color.tint) &&
          typeof layer.color.foliageOnly === "boolean",
        "invalid linear colour adjustment"
      );
  }
  check(new Set(input.zones.map((z) => z.id)).size === input.zones.length, "duplicate zone id");
  for (const zone of input.zones) {
    check(
      typeof zone.id === "string" &&
        zone.id.length > 0 &&
        point(zone.center) &&
        point(zone.halfSize) &&
        zone.halfSize.every((v) => v > 0) &&
        finite(zone.feather),
      "invalid zone geometry"
    );
    check(
      !!zone.density && Object.entries(zone.density).every(([id, value]) => layerIds.has(id) && finite(value)),
      `unknown layer or invalid density in ${zone.id}`
    );
  }
  check(
    !!input.grass && rgb(input.grass.colorA) && rgb(input.grass.colorB) && finite(input.grass.saturation, 0, 2),
    "invalid grass palette"
  );
  const light = input.lighting;
  check(
    !!light?.sunlight &&
      !!light.environment &&
      rgb(light.sunlight.color) &&
      finite(light.sunlight.intensity) &&
      finite(light.environment.diffuse) &&
      finite(light.environment.specular),
    "invalid lighting"
  );

  const direction = structuredClone(input);
  const center: LandscapePoint = [
    (focus!.bounds.min[0] + focus!.bounds.max[0]) / 2,
    (focus!.bounds.min[2] + focus!.bounds.max[2]) / 2
  ];
  const dx = center[0] - view!.eye[0],
    dz = center[1] - view!.eye[2],
    distance = Math.hypot(dx, dz);
  check(distance > 0, "reference view must be horizontally separated from the subject");
  const forward: LandscapePoint = [dx / distance, dz / distance];
  const right: LandscapePoint = [-forward[1], forward[0]];
  // Project the actual bounds onto view-right; this works for arbitrary subjects and orientations.
  const width =
    Math.abs(right[0]) * (focus!.bounds.max[0] - focus!.bounds.min[0]) +
    Math.abs(right[1]) * (focus!.bounds.max[2] - focus!.bounds.min[2]);
  check(width > 0, "subject has no horizontal extent");
  const world = (x: number, z: number): LandscapePoint => [
    center[0] + width * (right[0] * x + forward[0] * z),
    center[1] + width * (right[1] * x + forward[1] * z)
  ];
  const influences = direction.zones.map((zone) => {
    const [x, z] = zone.center,
      [w, d] = zone.halfSize;
    return {
      id: `direction:${zone.id}`,
      description: zone.id,
      polygon: { outer: [world(x - w, z - d), world(x + w, z - d), world(x + w, z + d), world(x - w, z + d)] },
      falloff: zone.feather * width,
      densityMultipliers: zone.density
    };
  });
  const adjustments = new Map(direction.layers.map((l) => [l.layerId, l]));
  const request: VegetationLandscapeRequest = {
    ...structuredClone(base),
    influences: [...structuredClone(base.influences ?? []), ...influences],
    layers: base.layers.map((layer) => {
      const edit = adjustments.get(layer.id);
      if (!edit) return structuredClone(layer);
      const scale = edit.sizeScale ?? 1,
        density = edit.densityScale ?? 1;
      const range = (value: readonly [number, number]): readonly [number, number] => [
        value[0] * scale,
        value[1] * scale
      ];
      return {
        ...structuredClone(layer),
        density: layer.density * density,
        ...(layer.minimumDensity === undefined ? {} : { minimumDensity: layer.minimumDensity * density }),
        scale: range(layer.scale),
        palette: layer.palette.map((member) => ({
          ...member,
          ...(member.scale ? { scale: range(member.scale) } : {}),
          ...(member.heightScale || edit.heightScale !== undefined
            ? {
                heightScale: range(member.heightScale ?? member.scale ?? layer.scale).map(
                  (v) => v * (edit.heightScale ?? 1)
                ) as [number, number]
              }
            : {})
        })),
        depthWeights: edit.depthWeights ?? layer.depthWeights
      };
    })
  };
  return { direction, request, zones: influences.map((zone) => ({ id: zone.id, polygon: zone.polygon.outer })) };
}

/** Rec.709 linear luminance, albedo-domain desaturation, then exposure and tint. */
export function adjustLandscapeColor(
  color: LandscapeLinearRgb,
  adjustment: LandscapeColorAdjustment
): LandscapeLinearRgb {
  const luminance = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
  return color.map((component, axis) =>
    Math.min(
      1,
      Math.max(
        0,
        (luminance + (component - luminance) * adjustment.saturation) *
          2 ** adjustment.exposureEV *
          adjustment.tint[axis]
      )
    )
  ) as unknown as LandscapeLinearRgb;
}
