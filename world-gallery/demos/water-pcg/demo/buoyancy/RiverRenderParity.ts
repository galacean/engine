/** CPU-visible River surface oracle used by the deterministic buoyancy parity gate. */
import { Vector3 } from "@galacean/engine-math";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import {
  createRiverSurfaceMotionSampleOutput,
  evaluateRiverSurfaceMotion
} from "../../compiler/river/RiverSurfaceMotion";
import type { RiverCompiledData, RiverGeometryData } from "../../compiler/river/types";
import { createWaterSurfaceSample, type WaterSurfaceProvider } from "../../runtime/query/WaterSurfaceProvider";

const RENDER_PARITY_BANK_EPSILON = 1e-4;
const TRIANGLE_EPSILON = 1e-6;

interface RiverRenderSurface {
  readonly label: string;
  readonly kind: "reach" | "junction";
  readonly geometry: RiverGeometryData;
  readonly dynamic: boolean;
}

interface TriangleSample {
  firstIndex: number;
  secondIndex: number;
  thirdIndex: number;
  firstWeight: number;
  secondWeight: number;
  thirdWeight: number;
}

export interface BuoyancyRenderParityResult {
  readonly surfaceTime: number;
  readonly sampledVertexCount: number;
  readonly skippedBoundaryVertexCount: number;
  readonly missedVertexCount: number;
  readonly sampledJunctionVertexCount: number;
  readonly overlappingVertexCount: number;
  readonly occludedVertexCount: number;
  readonly maxHeightError: number;
  readonly maxErrorSource: string;
}

function findTriangleXZ(geometry: RiverGeometryData, pointX: number, pointZ: number, out: TriangleSample): boolean {
  const end = geometry.drawStart + geometry.drawCount;
  for (let offset = geometry.drawStart; offset + 2 < end; offset += 3) {
    const firstIndex = geometry.indices.at(offset);
    const secondIndex = geometry.indices.at(offset + 1);
    const thirdIndex = geometry.indices.at(offset + 2);
    if (firstIndex === undefined || secondIndex === undefined || thirdIndex === undefined) continue;
    const first = geometry.positions[firstIndex];
    const second = geometry.positions[secondIndex];
    const third = geometry.positions[thirdIndex];
    const denominator = (second[2] - third[2]) * (first[0] - third[0]) + (third[0] - second[0]) * (first[2] - third[2]);
    if (Math.abs(denominator) <= TRIANGLE_EPSILON) continue;
    const firstWeight =
      ((second[2] - third[2]) * (pointX - third[0]) + (third[0] - second[0]) * (pointZ - third[2])) / denominator;
    const secondWeight =
      ((third[2] - first[2]) * (pointX - third[0]) + (first[0] - third[0]) * (pointZ - third[2])) / denominator;
    const thirdWeight = 1 - firstWeight - secondWeight;
    if (firstWeight < -TRIANGLE_EPSILON || secondWeight < -TRIANGLE_EPSILON || thirdWeight < -TRIANGLE_EPSILON) {
      continue;
    }
    out.firstIndex = firstIndex;
    out.secondIndex = secondIndex;
    out.thirdIndex = thirdIndex;
    out.firstWeight = firstWeight;
    out.secondWeight = secondWeight;
    out.thirdWeight = thirdWeight;
    return true;
  }
  return false;
}

function createRenderSurfaces(data: RiverCompiledData): RiverRenderSurface[] {
  const surfaces: RiverRenderSurface[] = [];
  for (let index = 0; index < data.reaches.length; index++) {
    const reach = data.reaches[index];
    surfaces.push({
      label: `reach-${index}`,
      kind: "reach",
      geometry: reach.artifact.surfaceGeometry,
      dynamic: reach.config.quality.material.level !== RiverQualityLevel.Low
    });
  }
  for (let index = 0; index < data.junctions.length; index++) {
    const junction = data.junctions[index];
    const materialReach = data.reaches[junction.materialSourceReachIndex];
    surfaces.push({
      label: `junction-${index}`,
      kind: "junction",
      geometry: junction.surfaceGeometry,
      dynamic: materialReach.config.quality.material.level !== RiverQualityLevel.Low
    });
  }
  return surfaces;
}

/**
 * Compares Provider samples with the highest rendered surface at each sampled XZ.
 * Lower overlapping River triangles are depth-occluded and are not valid water-surface oracles.
 */
export function measureRiverRenderParity(
  provider: WaterSurfaceProvider,
  data: RiverCompiledData,
  surfaceTime: number
): BuoyancyRenderParityResult {
  const surfaces = createRenderSurfaces(data);
  const worldPosition = new Vector3();
  const providerSample = createWaterSurfaceSample();
  const triangle = {
    firstIndex: 0,
    secondIndex: 0,
    thirdIndex: 0,
    firstWeight: 0,
    secondWeight: 0,
    thirdWeight: 0
  };
  const motion = createRiverSurfaceMotionSampleOutput();
  const coordinates = {
    signedAcrossDistance: 0,
    networkFlowTime: 0,
    halfWidth: 0,
    flowSpeed: 0
  };
  let sampledVertexCount = 0;
  let skippedBoundaryVertexCount = 0;
  let missedVertexCount = 0;
  let sampledJunctionVertexCount = 0;
  let overlappingVertexCount = 0;
  let occludedVertexCount = 0;
  let maxHeightError = 0;
  let maxErrorSource = "";

  const evaluateVertexHeight = (surface: RiverRenderSurface, vertexIndex: number): number | undefined => {
    const geometry = surface.geometry;
    let height = geometry.positions[vertexIndex][1];
    if (!surface.dynamic) return height;
    const uv1 = geometry.uv1s[vertexIndex];
    const uv2 = geometry.uv2s?.[vertexIndex];
    const uv3 = geometry.uv3s?.[vertexIndex];
    if (!uv1 || !uv2 || !uv3) return undefined;
    coordinates.signedAcrossDistance = uv2[0];
    coordinates.networkFlowTime = uv2[1];
    coordinates.halfWidth = uv3[0];
    coordinates.flowSpeed = uv1[0];
    evaluateRiverSurfaceMotion(data.surfaceMotion, coordinates, surfaceTime, motion);
    height += motion.height;
    return height;
  };

  const evaluateSurfaceHeight = (surface: RiverRenderSurface, pointX: number, pointZ: number): number | undefined => {
    const geometry = surface.geometry;
    if (!findTriangleXZ(geometry, pointX, pointZ, triangle)) return undefined;
    const firstHeight = evaluateVertexHeight(surface, triangle.firstIndex);
    const secondHeight = evaluateVertexHeight(surface, triangle.secondIndex);
    const thirdHeight = evaluateVertexHeight(surface, triangle.thirdIndex);
    if (firstHeight === undefined || secondHeight === undefined || thirdHeight === undefined) return undefined;
    return (
      firstHeight * triangle.firstWeight + secondHeight * triangle.secondWeight + thirdHeight * triangle.thirdWeight
    );
  };

  for (const sourceSurface of surfaces) {
    const geometry = sourceSurface.geometry;
    for (let vertexIndex = 0; vertexIndex < geometry.positions.length; vertexIndex++) {
      const position = geometry.positions[vertexIndex];
      const uv2 = geometry.uv2s?.[vertexIndex];
      const uv3 = geometry.uv3s?.[vertexIndex];
      if (uv2 && uv3 && Math.abs(uv2[0]) >= uv3[0] - RENDER_PARITY_BANK_EPSILON) {
        skippedBoundaryVertexCount++;
        continue;
      }
      const sourceHeight = evaluateVertexHeight(sourceSurface, vertexIndex);
      if (sourceHeight === undefined) {
        missedVertexCount++;
        continue;
      }

      let visibleHeight = Number.NEGATIVE_INFINITY;
      let surfaceHitCount = 0;
      for (const candidateSurface of surfaces) {
        const candidateHeight = evaluateSurfaceHeight(candidateSurface, position[0], position[2]);
        if (candidateHeight === undefined) continue;
        surfaceHitCount++;
        visibleHeight = Math.max(visibleHeight, candidateHeight);
      }
      if (surfaceHitCount === 0) {
        missedVertexCount++;
        continue;
      }
      if (surfaceHitCount > 1) overlappingVertexCount++;
      if (sourceHeight < visibleHeight - TRIANGLE_EPSILON) occludedVertexCount++;

      worldPosition.set(position[0], position[1], position[2]);
      if (!provider.sampleSurface(worldPosition, providerSample)) {
        missedVertexCount++;
        continue;
      }
      sampledVertexCount++;
      if (sourceSurface.kind === "junction") sampledJunctionVertexCount++;
      const error = Math.abs(providerSample.surfacePosition.y - visibleHeight);
      if (error > maxHeightError) {
        maxHeightError = error;
        maxErrorSource = `${sourceSurface.label}:vertex-${vertexIndex}`;
      }
    }
  }

  if (sampledVertexCount === 0) maxHeightError = Number.POSITIVE_INFINITY;
  return {
    surfaceTime,
    sampledVertexCount,
    skippedBoundaryVertexCount,
    missedVertexCount,
    sampledJunctionVertexCount,
    overlappingVertexCount,
    occludedVertexCount,
    maxHeightError,
    maxErrorSource
  };
}
