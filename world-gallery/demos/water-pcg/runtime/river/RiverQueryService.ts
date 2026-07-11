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
import type { RiverQuerySourceData, RiverSamplePoint } from "../../compiler/river/types";
import type { RiverQueryResult } from "./types";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function read(source: RiverQuerySourceData, sampleIndex: number, componentIndex: number): number {
  return source.samples.at(sampleIndex * source.stride + componentIndex) ?? 0;
}

function makeFlowDirection(source: RiverQuerySourceData, aIndex: number, bIndex: number): Vector3 {
  const dx = read(source, bIndex, 0) - read(source, aIndex, 0);
  const dz = read(source, bIndex, 2) - read(source, aIndex, 2);
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 0.0001) {
    return new Vector3(read(source, aIndex, 7), 0, read(source, aIndex, 8));
  }
  return new Vector3(dx / length, 0, dz / length);
}

function interpolateSampleValue(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function queryRiver(source: RiverQuerySourceData, worldPosition: Vector3): RiverQueryResult {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestT = 0;
  let bestIndex = 0;

  for (let i = 0; i < source.sampleCount - 1; i++) {
    const ax = read(source, i, 0);
    const az = read(source, i, 2);
    const bx = read(source, i + 1, 0);
    const bz = read(source, i + 1, 2);
    const abx = bx - ax;
    const abz = bz - az;
    const apx = worldPosition.x - ax;
    const apz = worldPosition.z - az;
    const abLengthSq = abx * abx + abz * abz;
    const t = abLengthSq > 0.0001 ? clamp01((apx * abx + apz * abz) / abLengthSq) : 0;
    const closestX = ax + abx * t;
    const closestZ = az + abz * t;
    const dx = worldPosition.x - closestX;
    const dz = worldPosition.z - closestZ;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestT = t;
      bestIndex = i;
    }
  }

  const nextIndex = Math.min(bestIndex + 1, source.sampleCount - 1);
  const surfaceHeight = interpolateSampleValue(read(source, bestIndex, 1), read(source, nextIndex, 1), bestT);
  const flowDirection = makeFlowDirection(source, bestIndex, nextIndex);
  const width = interpolateSampleValue(read(source, bestIndex, 4), read(source, nextIndex, 4), bestT);
  const depth = interpolateSampleValue(read(source, bestIndex, 5), read(source, nextIndex, 5), bestT);
  const flowSpeed = interpolateSampleValue(read(source, bestIndex, 6), read(source, nextIndex, 6), bestT);
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
