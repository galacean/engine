import { add, sub, mul, div, sqrt, f32, RoofCurve, roofHeight, flare } from "./RecoveredRoofMath";
import { shapeCurve } from "./RecoveredWallConnectionHoles";
import type { WallConnectionShape } from "./WallConnectionTypes";
export type TerrainHeight = (x: number, z: number) => number;

/** Original publisher 0x101578140 / resample 0x1018221e0.
 * Terrain is an explicit source sampler (Seed World may supply its own field).
 * No captured public profile or native address participates in generation.
 */
export function samplePublishedWallPath(
  shape: WallConnectionShape,
  terrain: TerrainHeight,
  groundMinimum = 0,
  hostTerrain = false
) {
  const control = shapeCurve(shape, 0.5),
    points: [number, number, number][] = [];
  const floor = hostTerrain ? -Infinity : groundMinimum > 0 ? f32(groundMinimum) : f32(-2.7);
  const append = (p: number[]) => {
    const y = f32(terrain(p[0], p[1]));
    if (!Number.isFinite(y)) throw Error("Terrain sampler returned a nonfinite height");
    points.push([p[0], Math.max(floor, y), p[1]]);
  };
  append(control.points[0]);
  for (let i = 1; i < control.points.length; i++) {
    const a = control.points[i - 1],
      b = control.points[i],
      dx = sub(b[0], a[0]),
      dz = sub(b[1], a[1]);
    const length = Math.max(f32(1e-8), sqrt(add(mul(dx, dx), mul(dz, dz))));
    // fcvtau rounds positive values to nearest, with ties away from zero.
    let n = Math.max(2, Math.floor(div(1, Math.min(div(0.5, length), 1)) + 0.5) + 1);
    if (shape.type === "rectangle") n = n % 2 === 0 ? n + 1 : n;
    for (let j = 1; j < n; j++) {
      const t = div(j, sub(n, 1)),
        s = sub(1, t);
      append([add(mul(a[0], s), mul(b[0], t)), add(mul(a[1], s), mul(b[1], t))]);
    }
  }
  const ground = new RoofCurve(points),
    projected = new RoofCurve(points.map((p) => [p[0], p[2]]));
  return { control, ground, projected, points };
}

/** Level top branch of init-wall-height 0x10102a… (shape tags 0 and 1).
 * Gable and path-cut profiles must be derived by their own upstream producers;
 * they cannot silently be flattened into this level-top entry.
 */
export function publishLevelWallProfile(
  shape: WallConnectionShape,
  height: number,
  terrain: TerrainHeight,
  groundMinimum = 0,
  hostTerrain = false
) {
  if (!Number.isFinite(height) || !Number.isFinite(groundMinimum)) throw Error("Finite wall height required");
  const path = samplePublishedWallPath(shape, terrain, groundMinimum, hostTerrain);
  const bottom = path.points.map((p) => p[1]);
  const topY = hostTerrain
    ? sub(add(Math.max(...bottom), height), 0.46)
    : Math.max(f32(0.96000004), sub(add(Math.max(-2.5, ...bottom), height), 0.46));
  return {
    ...path,
    bottom,
    top: bottom.map(() => topY),
    third: bottom.map(() => 0),
    topY,
    maxY: topY,
    maxYGable: topY,
    minGround: Math.min(...bottom),
    maxGround: Math.max(...bottom)
  };
}

/** Original 512² unsigned terrain source, sample_at_world_xz 0x1016aa8f0.
 * Source bytes are author/environment data, not generated building meshes.
 * The two coordinate modes intentionally preserve original edge extrapolation.
 */
export function originalTerrainSampler(
  values: Uint16Array,
  minHeight = -2.5,
  maxHeight = 20,
  texelCentered = false
): TerrainHeight {
  if (values.length !== 512 * 512) throw Error("Original terrain source must have 512² samples");
  const decode = (i: number) => {
    const t = div(values[i], 65535);
    return add(mul(minHeight, sub(1, t)), mul(maxHeight, t));
  };
  const mix = (a: number, b: number, t: number) => add(a, mul(sub(b, a), t));
  return (x, z) => {
    let u = add(div(x, 130), 0.5),
      v = add(div(z, 130), 0.5);
    let ix: number, iz: number, jx: number, jz: number;
    if (texelCentered) {
      u = Math.max(0, sub(mul(Math.min(1, u), 512), 0.5));
      v = Math.max(0, sub(mul(Math.min(1, v), 512), 0.5));
      ix = Math.floor(u);
      iz = Math.floor(v);
      jx = Math.min(ix + 1, 511);
      jz = Math.min(iz + 1, 511);
    } else {
      u = mul(Math.min(1, Math.max(0, u)), 512);
      v = mul(Math.min(1, Math.max(0, v)), 512);
      ix = Math.min(Math.floor(u), 510);
      iz = Math.min(Math.floor(v), 510);
      jx = ix + 1;
      jz = iz + 1;
    }
    const tx = sub(u, ix),
      tz = sub(v, iz);
    ix = Math.min(ix, 511);
    iz = Math.min(iz, 511);
    return mix(
      mix(decode(iz * 512 + ix), decode(jz * 512 + ix), tz),
      mix(decode(iz * 512 + jx), decode(jz * 512 + jx), tz),
      tx
    );
  };
}

export interface PublishedWallRoof {
  profile: number;
  height_parameter: number;
  ridge_parameter: number;
  eave_parameter: number;
  axis: 0 | 1;
}
export interface PublishedWallProfileOptions {
  roof?: PublishedWallRoof;
  groundMinimum?: number;
  material?: 0 | 1;
  halftimbered?: boolean;
  hostTerrain?: boolean;
}
/** Original init_wall_height_and_arch_segment_height 0x10102ac60 gable branch.
 * topY remains the eave height used by the roof owner; maxYGable is a separate
 * published bound. Circular roofs do not create rectangular gable walls. */
export function publishWallProfile(
  shape: WallConnectionShape,
  height: number,
  terrain: TerrainHeight,
  options: PublishedWallProfileOptions = {}
) {
  return applyWallRoofProfile(
    publishLevelWallProfile(shape, height, terrain, options.groundMinimum ?? 0, options.hostTerrain),
    shape,
    options
  );
}

/** Roof publication consumes a level contour, independently of terrain
 * sampling. Wood keeps the native overhang branch's zero vertical extension;
 * stone/default adds .46. The published upper bound still includes .46 for
 * both materials (0x10102ac60). Never feed a previously raised gable back in. */
export function applyWallRoofProfile(
  level: ReturnType<typeof publishLevelWallProfile>,
  shape: WallConnectionShape,
  options: PublishedWallProfileOptions = {}
) {
  const roof = options.roof;
  const empty = {
    ...level,
    gable: null as null | { height: number; ranges: [number, number, number, number]; kind: 0 | 1 },
    roofRise: 0
  };
  if (!roof || shape.type !== "rectangle" || roof.height_parameter <= f32(0.1) || f32(roof.ridge_parameter) !== 1)
    return empty;
  if (
    [roof.profile, roof.height_parameter, roof.ridge_parameter, roof.eave_parameter].some((x) => !Number.isFinite(x)) ||
    ![0, 1].includes(roof.axis)
  )
    throw Error("Finite original roof profile required");
  // WallMaterial::gable_roof_style (0x10121ce0c) returns material | style==2.
  // Half-timber style omits the eave expansion of the height fit; this does
  // not remove the eave from the roof itself.
  const kind = options.halftimbered ? 1 : (options.material ?? 0),
    extension = kind === 0 ? f32(0.46) : 0;
  const s = {
      type: "native_rectangular_roof_profile" as const,
      tip_offset: [0, 0],
      profile: roof.profile,
      height_parameter: roof.height_parameter,
      ridge_parameter: roof.ridge_parameter,
      eave_parameter: roof.eave_parameter,
      axis: roof.axis,
      edge_mode: 0,
      base_height: level.topY
    },
    footprint = { center: shape.center, orientation: shape.orientation, width: shape.width, depth: shape.depth },
    H = roofHeight(s, footprint),
    perimeter = mul(add(shape.width, shape.depth), 2),
    first = div(shape.depth, perimeter),
    ranges = (roof.axis === 0 ? [0, first, 0.5, add(0.5, first)] : [first, 0.5, add(0.5, first), 1]) as [
      number,
      number,
      number,
      number
    ],
    half = mul(roof.axis === 0 ? shape.depth : shape.width, 0.5),
    profileFit = Math.min(1, Math.max(0, div(sub(roof.profile, 0.5), 0.5))),
    expanded = options.halftimbered ? half : add(half, mul(flare(s), profileFit)),
    ratio = div(add(expanded, 0.28), half),
    padding = mul(div(0.5, level.control.length), 0.95),
    exponent = add(mul(roof.profile, 1.5), mul(sub(1, roof.profile), 0.5));
  let seamAddition: number | null = null;
  const top = level.top.map((value, i) => {
    const u = level.projected.knots[i];
    let next = value;
    for (let j = 0; j < 4; j += 2) {
      const lo = ranges[j],
        hi = ranges[j + 1];
      if (u >= sub(lo, padding) && u < add(hi, padding)) {
        const t = Math.min(1, Math.max(0, div(sub(u, lo), sub(hi, lo)))),
          a = Math.abs(sub(t, 0.5)),
          p = f32(Math.pow(sub(1, div(add(a, a), ratio)), exponent)),
          addition = add(mul(sub(1, p), extension), mul(p, add(extension, H)));
        next = add(next, addition);
        if (extension > 0 && u === 1) seamAddition = addition;
      }
    }
    return next;
  });
  if (seamAddition !== null) top[0] = add(top[0], seamAddition);
  return {
    ...level,
    top,
    gable: { height: level.topY, ranges, kind },
    roofRise: H,
    maxYGable: add(add(level.topY, H), 0.46)
  };
}

export type PublishedWallProfile = ReturnType<typeof publishLevelWallProfile> & {
  roofRise?: number;
  gable?: null | { height: number; ranges: [number, number, number, number]; kind: 0 | 1 };
};
