/**
 * Runtime water queries for the river prototype.
 *
 * Rendering a river mesh is not enough for an engine-level water system; gameplay
 * code also needs to ask whether a world position is in water, how deep it is, what
 * direction the flow moves, and how far the point is from the bank. This file keeps
 * that render-independent query logic beside the sampled river path so actors,
 * particles, audio, physics, or AI systems can consume river data without reading
 * mesh vertices or material state directly.
 */
import { Vector3 } from "@galacean/engine-math";
import { RiverQueryResult, RiverSamplePoint } from "./types";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function makeFlowDirection(a: RiverSamplePoint, b: RiverSamplePoint): Vector3 {
  const dx = b.position.x - a.position.x;
  const dz = b.position.z - a.position.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 0.0001) {
    return new Vector3(a.tangent.x, 0, a.tangent.z);
  }
  return new Vector3(dx / length, 0, dz / length);
}

function interpolateSampleValue(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function queryRiver(samples: RiverSamplePoint[], worldPosition: Vector3): RiverQueryResult {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestT = 0;
  let bestIndex = 0;

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i].position;
    const b = samples[i + 1].position;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const apx = worldPosition.x - a.x;
    const apz = worldPosition.z - a.z;
    const abLengthSq = abx * abx + abz * abz;
    const t = abLengthSq > 0.0001 ? clamp01((apx * abx + apz * abz) / abLengthSq) : 0;
    const closestX = a.x + abx * t;
    const closestZ = a.z + abz * t;
    const dx = worldPosition.x - closestX;
    const dz = worldPosition.z - closestZ;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestT = t;
      bestIndex = i;
    }
  }

  const a = samples[bestIndex];
  const b = samples[Math.min(bestIndex + 1, samples.length - 1)];
  const surfaceHeight = a.position.y + (b.position.y - a.position.y) * bestT;
  const flowDirection = makeFlowDirection(a, b);
  const width = interpolateSampleValue(a.width, b.width, bestT);
  const depth = interpolateSampleValue(a.depth, b.depth, bestT);
  const flowSpeed = interpolateSampleValue(a.flowSpeed, b.flowSpeed, bestT);
  const halfWidth = width * 0.5;
  const distanceToBank = halfWidth - bestDistance;

  return {
    inWater: bestDistance <= halfWidth,
    surfaceHeight,
    depth: Math.max(0, depth * clamp01(distanceToBank / Math.max(halfWidth, 0.001))),
    flowDirection,
    flowSpeed,
    distanceToBank
  };
}

export function getPointAtRiverT(samples: RiverSamplePoint[], t: number): Vector3 {
  const totalLength = samples[samples.length - 1]?.distance ?? 0;
  const targetDistance = totalLength * clamp01(t);

  for (let i = 1; i < samples.length; i++) {
    const current = samples[i];
    if (current.distance < targetDistance) {
      continue;
    }
    const previous = samples[i - 1];
    const segmentLength = Math.max(current.distance - previous.distance, 0.001);
    const segmentT = clamp01((targetDistance - previous.distance) / segmentLength);
    return new Vector3(
      previous.position.x + (current.position.x - previous.position.x) * segmentT,
      previous.position.y + (current.position.y - previous.position.y) * segmentT,
      previous.position.z + (current.position.z - previous.position.z) * segmentT
    );
  }

  const last = samples[samples.length - 1].position;
  return new Vector3(last.x, last.y, last.z);
}
