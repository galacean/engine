import type { ConstructionPositionMesh } from "./ConstructionGeometryAssets";
import { createWoodArchAtlasMesh, woodArchAtlasLevel } from "./RecoveredWoodArchAtlas";
import { validateWoodArchFrame } from "./RecoveredWoodArchFrame";
import { add, sub, mul, div, sqrt, lerp, cross, dot, f32 } from "./RecoveredRoofMath";
import type { ConstructionWoodArchPart, ConstructionWoodArchPillar } from "./ConstructionWoodArchRender";

const normalize = (v: number[]) => {
  const length = sqrt(dot(v, v));
  if (!(length > 0)) throw Error("Degenerate wood arch structural basis");
  return v.map((n) => div(n, length));
};

/** The original wooden-frame vertex position expression, evaluated only when
 * structural queries are requested. Same atlas level, cap rows, bevel section,
 * sample interpolation and end-plane adjustment as the GPU. No texture/noise,
 * colour, camera, entrance state or LOD policy enters structural identity. */
export function woodArchFrameGeometry(part: ConstructionWoodArchPart) {
  const frame = part.frame;
  validateWoodArchFrame(frame);
  const count = frame.records.length / 12,
    level = woodArchAtlasLevel(count, frame.ends);
  const atlas = createWoodArchAtlasMesh(level),
    positions: number[] = [];
  const halfDepth = mul(frame.section[1], 0.5),
    halfWidth = mul(frame.section[0], 0.5);
  const bevel = mul(Math.min(f32(frame.section[2]), mul(Math.min(halfDepth, halfWidth), 0.95)), 0.4);
  const section = [
    [-halfDepth, -halfWidth],
    [-halfDepth, sub(halfWidth, bevel)],
    [add(-halfDepth, bevel), halfWidth],
    [sub(halfDepth, bevel), halfWidth],
    [halfDepth, sub(halfWidth, bevel)],
    [halfDepth, add(-halfWidth, bevel)],
    [sub(halfDepth, bevel), -halfWidth],
    [add(-halfDepth, bevel), -halfWidth],
    [-halfDepth, -halfWidth]
  ];
  const step = 1 / (1 << level),
    capStart = !!(frame.ends & 1),
    capEnd = !!(frame.ends & 2);
  for (let row = 0; row <= 1 << level; row++) {
    const z = row * step;
    const startCenter = capStart && z < step,
      endCenter = capEnd && z > 1 - step;
    const curveFraction = startCenter
      ? 0
      : endCenter
        ? 1
        : div(sub(z, capStart ? step : 0), sub(capEnd ? 1 - step : 1, capStart ? step : 0));
    const curvePosition = mul(curveFraction, count - 1);
    const sample = Math.min(Math.floor(curvePosition), count - 2),
      t = Math.min(1, Math.max(0, sub(curvePosition, sample)));
    const interpolate = (offset: number) =>
      [0, 1, 2].map((axis) =>
        lerp(frame.records[sample * 12 + offset + axis], frame.records[(sample + 1) * 12 + offset + axis], t)
      );
    const center = interpolate(0),
      tangent = normalize(interpolate(4)),
      normal = normalize(interpolate(8));
    const across = normalize(cross(normal, tangent));
    const clipEnd =
      !startCenter &&
      !endCenter &&
      ((capStart && !!(frame.ends & 4) && z <= step) || (capEnd && !!(frame.ends & 8) && z >= 1 - step));
    for (const [x, y] of section) {
      let offset = startCenter || endCenter ? [0, 0, 0] : normal.map((n, axis) => add(mul(n, x), mul(across[axis], y)));
      if (clipEnd) {
        const horizontal = [tangent[0], 0, tangent[2]],
          length = sqrt(dot(horizontal, horizontal));
        if (length > f32(0.0001)) {
          const capNormal = horizontal.map((v) => div(v, length));
          const distance = div(-dot(capNormal, offset), dot(capNormal, tangent));
          offset = offset.map((v, axis) => add(v, mul(tangent[axis], distance)));
        }
      }
      for (let axis = 0; axis < 3; axis++) positions.push(add(center[axis], offset[axis]));
    }
  }
  return { owner: part.ownerId, positions, indices: Array.from(atlas.indices) };
}

const seedRandom = (value: number) => {
  let x = (value + (value << 10)) >>> 0;
  x = (x ^ (x >>> 6)) >>> 0;
  x = (x + (x << 3)) >>> 0;
  x = (x ^ (x >>> 11)) >>> 0;
  x = (x + (x << 15)) >>> 0;
  return (x & 0x7fffff) / 0x800000;
};

/** Native wood template + seeded orientation + affine transform. The arch
 * pillar producer publishes zero end-remap flags; other plank variants must
 * use their own geometry owner. World-space shading noise is deliberately
 * excluded, matching the building structural-query convention. */
export function woodArchPillarGeometry(part: ConstructionWoodArchPillar, mesh: ConstructionPositionMesh | undefined) {
  if (!mesh) throw Error("Missing wood pillar geometry in construction library");
  if (part.bytes.byteLength !== 80) throw Error("Invalid wooden arch pillar record");
  const data = new DataView(part.bytes),
    matrix = Array.from({ length: 12 }, (_, i) => data.getFloat32(i * 4, true));
  if (!matrix.every(Number.isFinite) || data.getUint32(60, true) !== 0)
    throw Error("Unsupported wooden arch pillar geometry");
  const seed = (data.getInt32(48, true) + data.getInt32(52, true)) | 0;
  const angle = mul(1.57, Math.floor(mul(seedRandom((seed + 45) | 0), 4)));
  const sine = f32(Math.sin(angle)),
    cosine = f32(Math.cos(angle)),
    flipped = seedRandom((seed + 500) | 0) > 0.5;
  const positions: number[] = [],
    source = mesh.positions;
  for (let i = 0; i < source.length; i += 3) {
    let x = source[i],
      y = source[i + 1];
    const z = source[i + 2];
    if (flipped) {
      const sourceX = x,
        sourceY = sub(y, 1);
      x = add(mul(-0.9999987483024597, sourceX), mul(0.0015925479819998145, sourceY));
      y = add(mul(-0.0015925479819998145, sourceX), mul(-0.9999987483024597, sourceY));
    }
    const rotatedX = sub(mul(x, cosine), mul(z, sine)),
      rotatedZ = add(mul(x, sine), mul(z, cosine));
    for (let axis = 0; axis < 3; axis++)
      positions.push(
        add(
          add(add(mul(rotatedX, matrix[axis]), mul(y, matrix[3 + axis])), mul(rotatedZ, matrix[6 + axis])),
          matrix[9 + axis]
        )
      );
  }
  return { owner: part.ownerId, positions, indices: mesh.indices.slice() };
}
