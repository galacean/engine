import type { Camera } from "@galacean/engine-core";
import { Layer } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WATER_OPTICS_LAB_SURFACE_Y } from "./constants";

type Vector3Tuple = readonly [number, number, number];

export const WATER_OPTICS_PLANAR_ANCHOR_ID = "planar-anchor-lime";
export const WATER_OPTICS_PLANAR_ANCHOR_LAYER = Layer.Layer28;
export const WATER_OPTICS_PLANAR_ANCHOR_POSITION = Object.freeze([3.5, 4.5, -5.3] as const);
export const WATER_OPTICS_PLANAR_ANCHOR_SIZE = Object.freeze([0.28, 0.28, 0.28] as const);
export const WATER_OPTICS_PLANAR_ANCHOR_COLOR = Object.freeze([0.06, 1, 0.015, 1] as const);
export const WATER_OPTICS_PLANAR_ANCHOR_SEARCH_RADIUS_PX = 24;
export const WATER_OPTICS_PLANAR_ANCHOR_MAXIMUM_ERROR_PX = 3;

const RAY_EPSILON = 1e-7;

type WaterOpticsPlanarAnchorSourceCamera = Pick<Camera, "entity" | "worldToScreenPoint">;

export interface WaterOpticsPlanarAnchorExpectedPoint {
  readonly markerWorldPoint: Vector3Tuple;
  readonly reflectedMarkerWorldPoint: Vector3Tuple;
  readonly sourceCameraWorldPoint: Vector3Tuple;
  readonly waterIntersectionWorldPoint: Vector3Tuple;
  readonly waterSurfaceY: number;
  readonly rayParameter: number;
  readonly expectedScreenX: number;
  readonly expectedScreenY: number;
  readonly expectedScreenDepth: number;
}

export interface WaterOpticsPlanarAnchorSearchBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface WaterOpticsPlanarAnchorAnalysis {
  readonly width: number;
  readonly height: number;
  readonly expectedScreenX: number;
  readonly expectedScreenY: number;
  readonly observedScreenX: number | null;
  readonly observedScreenY: number | null;
  readonly errorX: number | null;
  readonly errorY: number | null;
  readonly errorPx: number | null;
  readonly searchRadiusPx: number;
  readonly searchBounds: Readonly<WaterOpticsPlanarAnchorSearchBounds>;
  readonly contributingPixelCount: number;
  readonly totalGreenAdvantage: number;
  readonly signalDetected: boolean;
  readonly maximumErrorPx: number;
  readonly passed: boolean;
}

function assertFiniteVector(name: string, vector: Readonly<Vector3>): void {
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || !Number.isFinite(vector.z)) {
    throw new Error(`${name} must contain only finite coordinates.`);
  }
}

function freezeVectorTuple(x: number, y: number, z: number): Vector3Tuple {
  return Object.freeze([x, y, z] as const);
}

/**
 * Computes the source-screen position at which the fixed marker should appear
 * in a physically correct horizontal mirror. This deliberately does not use
 * the Planar Camera view-projection matrix.
 */
export function createWaterOpticsPlanarAnchorExpectedPoint(
  sourceCamera: WaterOpticsPlanarAnchorSourceCamera,
  markerWorldPoint: Vector3Tuple = WATER_OPTICS_PLANAR_ANCHOR_POSITION,
  waterSurfaceY = WATER_OPTICS_LAB_SURFACE_Y
): Readonly<WaterOpticsPlanarAnchorExpectedPoint> {
  if (!Number.isFinite(waterSurfaceY)) throw new Error("Water surface height must be finite.");
  const marker = new Vector3(...markerWorldPoint);
  const source = sourceCamera.entity.transform.worldPosition;
  assertFiniteVector("Planar anchor marker", marker);
  assertFiniteVector("Source Camera position", source);

  const reflectedMarker = new Vector3(marker.x, waterSurfaceY * 2 - marker.y, marker.z);
  const directionX = reflectedMarker.x - source.x;
  const directionY = reflectedMarker.y - source.y;
  const directionZ = reflectedMarker.z - source.z;
  if (Math.abs(directionY) <= RAY_EPSILON) {
    throw new Error("Source-to-reflected-anchor ray is parallel to the water surface.");
  }

  const rayParameter = (waterSurfaceY - source.y) / directionY;
  if (!Number.isFinite(rayParameter) || rayParameter <= 0 || rayParameter >= 1) {
    throw new Error("Source-to-reflected-anchor ray does not cross the water surface before the virtual marker.");
  }

  const waterIntersection = new Vector3(
    source.x + directionX * rayParameter,
    waterSurfaceY,
    source.z + directionZ * rayParameter
  );
  const expectedScreenPoint = sourceCamera.worldToScreenPoint(waterIntersection, new Vector3());
  assertFiniteVector("Planar anchor expected screen point", expectedScreenPoint);

  return Object.freeze({
    markerWorldPoint: freezeVectorTuple(marker.x, marker.y, marker.z),
    reflectedMarkerWorldPoint: freezeVectorTuple(reflectedMarker.x, reflectedMarker.y, reflectedMarker.z),
    sourceCameraWorldPoint: freezeVectorTuple(source.x, source.y, source.z),
    waterIntersectionWorldPoint: freezeVectorTuple(waterIntersection.x, waterIntersection.y, waterIntersection.z),
    waterSurfaceY,
    rayParameter,
    expectedScreenX: expectedScreenPoint.x,
    expectedScreenY: expectedScreenPoint.y,
    expectedScreenDepth: expectedScreenPoint.z
  });
}

/**
 * Finds the lime marker in a full-resolution RGBA capture. The search is a
 * fixed +/-24 pixel square and uses green advantage as the centroid weight.
 */
export function analyzeWaterOpticsPlanarAnchor(
  rgbaPixels: ArrayLike<number>,
  width: number,
  height: number,
  expectedScreenX: number,
  expectedScreenY: number
): Readonly<WaterOpticsPlanarAnchorAnalysis> {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("Planar anchor capture dimensions must be positive integers.");
  }
  if (rgbaPixels.length < width * height * 4) {
    throw new Error("Planar anchor RGBA buffer is smaller than the declared full-resolution capture.");
  }
  if (
    !Number.isFinite(expectedScreenX) ||
    !Number.isFinite(expectedScreenY) ||
    expectedScreenX < 0 ||
    expectedScreenX >= width ||
    expectedScreenY < 0 ||
    expectedScreenY >= height
  ) {
    throw new Error("Planar anchor expected point must be finite and inside the full-resolution capture.");
  }

  const minX = Math.max(0, Math.ceil(expectedScreenX - WATER_OPTICS_PLANAR_ANCHOR_SEARCH_RADIUS_PX));
  const minY = Math.max(0, Math.ceil(expectedScreenY - WATER_OPTICS_PLANAR_ANCHOR_SEARCH_RADIUS_PX));
  const maxX = Math.min(width - 1, Math.floor(expectedScreenX + WATER_OPTICS_PLANAR_ANCHOR_SEARCH_RADIUS_PX));
  const maxY = Math.min(height - 1, Math.floor(expectedScreenY + WATER_OPTICS_PLANAR_ANCHOR_SEARCH_RADIUS_PX));
  const searchBounds = Object.freeze({ minX, minY, maxX, maxY });

  let totalGreenAdvantage = 0;
  let weightedX = 0;
  let weightedY = 0;
  let contributingPixelCount = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const offset = (y * width + x) * 4;
      const red = rgbaPixels[offset];
      const green = rgbaPixels[offset + 1];
      const blue = rgbaPixels[offset + 2];
      const alpha = rgbaPixels[offset + 3] / 255;
      const greenAdvantage = Math.max(0, green - Math.max(red, blue)) * alpha;
      if (greenAdvantage <= 0) continue;
      totalGreenAdvantage += greenAdvantage;
      weightedX += (x + 0.5) * greenAdvantage;
      weightedY += (y + 0.5) * greenAdvantage;
      contributingPixelCount++;
    }
  }

  const signalDetected = totalGreenAdvantage > 0;
  const observedScreenX = signalDetected ? weightedX / totalGreenAdvantage : null;
  const observedScreenY = signalDetected ? weightedY / totalGreenAdvantage : null;
  const errorX = observedScreenX === null ? null : observedScreenX - expectedScreenX;
  const errorY = observedScreenY === null ? null : observedScreenY - expectedScreenY;
  const errorPx = errorX === null || errorY === null ? null : Math.hypot(errorX, errorY);

  return Object.freeze({
    width,
    height,
    expectedScreenX,
    expectedScreenY,
    observedScreenX,
    observedScreenY,
    errorX,
    errorY,
    errorPx,
    searchRadiusPx: WATER_OPTICS_PLANAR_ANCHOR_SEARCH_RADIUS_PX,
    searchBounds,
    contributingPixelCount,
    totalGreenAdvantage,
    signalDetected,
    maximumErrorPx: WATER_OPTICS_PLANAR_ANCHOR_MAXIMUM_ERROR_PX,
    passed: signalDetected && errorPx !== null && errorPx <= WATER_OPTICS_PLANAR_ANCHOR_MAXIMUM_ERROR_PX
  });
}
