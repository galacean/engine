export type SeedWorldCameraMode = "orbit" | "roam";

export interface SeedWorldCameraBookmark {
  readonly position: readonly [x: number, y: number, z: number];
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly mode: SeedWorldCameraMode;
  readonly orbitDistanceMetres?: number;
}

export const SEED_WORLD_CAMERA_QUERY_PARAMETER = "camera";
export const SEED_WORLD_CAMERA_MODE_QUERY_PARAMETER = "cameraMode";
export const SEED_WORLD_ORBIT_DISTANCE_QUERY_PARAMETER = "orbitDistance";

const CAMERA_VALUE_COUNT = 5;
const MAXIMUM_ABSOLUTE_PITCH_DEGREES = 89.9;

/**
 * Reads one camera bookmark from the page query.
 *
 * The compact `camera` value stores `x,y,z,yaw,pitch`. Yaw is measured clockwise
 * from world +Z towards +X, while positive pitch looks upward.
 *
 * @param query URL query containing an optional camera bookmark.
 * @returns The parsed bookmark, or `undefined` when no camera value is present.
 * @throws When a present camera bookmark is malformed or outside its supported angle range.
 */
export function parseSeedWorldCameraBookmark(query: URLSearchParams): SeedWorldCameraBookmark | undefined {
  const cameraValue = query.get(SEED_WORLD_CAMERA_QUERY_PARAMETER);
  if (cameraValue === null || cameraValue.trim() === "") return undefined;
  const values = parseFiniteTuple(cameraValue, CAMERA_VALUE_COUNT, SEED_WORLD_CAMERA_QUERY_PARAMETER);
  const pitchDegrees = values[4];
  if (Math.abs(pitchDegrees) > MAXIMUM_ABSOLUTE_PITCH_DEGREES) {
    throw new RangeError(
      `Seed World camera pitch must be between -${MAXIMUM_ABSOLUTE_PITCH_DEGREES} and ${MAXIMUM_ABSOLUTE_PITCH_DEGREES} degrees`
    );
  }

  const modeValue = query.get(SEED_WORLD_CAMERA_MODE_QUERY_PARAMETER);
  const mode = modeValue === null || modeValue === "" ? "roam" : modeValue;
  if (mode !== "orbit" && mode !== "roam") {
    throw new RangeError(`Seed World camera mode must be "orbit" or "roam", received "${mode}"`);
  }

  const orbitDistanceValue = query.get(SEED_WORLD_ORBIT_DISTANCE_QUERY_PARAMETER);
  let orbitDistanceMetres: number | undefined;
  if (orbitDistanceValue !== null && orbitDistanceValue.trim() !== "") {
    orbitDistanceMetres = Number(orbitDistanceValue);
    if (!Number.isFinite(orbitDistanceMetres) || orbitDistanceMetres <= 0) {
      throw new RangeError("Seed World orbit distance must be a finite positive number");
    }
  }

  return Object.freeze({
    position: Object.freeze([values[0], values[1], values[2]] as const),
    yawDegrees: normalizeYawDegrees(values[3]),
    pitchDegrees,
    mode,
    ...(mode === "orbit" && orbitDistanceMetres !== undefined ? { orbitDistanceMetres } : {})
  });
}

/**
 * Writes one camera bookmark into an existing page query.
 * @param query Mutable query to update.
 * @param bookmark Current camera pose and control mode.
 * @returns The same query instance for composition with other URL state.
 */
export function writeSeedWorldCameraBookmark(
  query: URLSearchParams,
  bookmark: SeedWorldCameraBookmark
): URLSearchParams {
  const cameraValue = [
    ...bookmark.position.map((value) => formatCameraNumber(value, 3)),
    formatCameraNumber(normalizeYawDegrees(bookmark.yawDegrees), 3),
    formatCameraNumber(bookmark.pitchDegrees, 3)
  ].join(",");
  query.set(SEED_WORLD_CAMERA_QUERY_PARAMETER, cameraValue);
  query.set(SEED_WORLD_CAMERA_MODE_QUERY_PARAMETER, bookmark.mode);
  if (bookmark.mode === "orbit" && bookmark.orbitDistanceMetres !== undefined) {
    query.set(SEED_WORLD_ORBIT_DISTANCE_QUERY_PARAMETER, formatCameraNumber(bookmark.orbitDistanceMetres, 3));
  } else {
    query.delete(SEED_WORLD_ORBIT_DISTANCE_QUERY_PARAMETER);
  }
  return query;
}

/**
 * Formats only the camera-related query fragment shown in the HUD.
 * @param bookmark Current camera bookmark.
 * @returns Human-copyable, unescaped query parameters.
 */
export function formatSeedWorldCameraBookmarkQuery(bookmark: SeedWorldCameraBookmark): string {
  const query = writeSeedWorldCameraBookmark(new URLSearchParams(), bookmark);
  const values = [
    `${SEED_WORLD_CAMERA_QUERY_PARAMETER}=${query.get(SEED_WORLD_CAMERA_QUERY_PARAMETER)}`,
    `${SEED_WORLD_CAMERA_MODE_QUERY_PARAMETER}=${query.get(SEED_WORLD_CAMERA_MODE_QUERY_PARAMETER)}`
  ];
  const orbitDistance = query.get(SEED_WORLD_ORBIT_DISTANCE_QUERY_PARAMETER);
  if (orbitDistance !== null) values.push(`${SEED_WORLD_ORBIT_DISTANCE_QUERY_PARAMETER}=${orbitDistance}`);
  return values.join("&");
}

/**
 * Resolves the displayed yaw and pitch from a normalized or non-normalized world-forward vector.
 * @param forward World-space view direction.
 * @returns Yaw and pitch using the Seed World URL convention.
 */
export function resolveSeedWorldCameraAngles(
  forward: Readonly<{ x: number; y: number; z: number }>
): Readonly<{ yawDegrees: number; pitchDegrees: number }> {
  const length = Math.hypot(forward.x, forward.y, forward.z);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new RangeError("Seed World camera forward vector must be finite and non-zero");
  }
  const normalizedX = forward.x / length;
  const normalizedY = forward.y / length;
  const normalizedZ = forward.z / length;
  return Object.freeze({
    yawDegrees: normalizeYawDegrees((Math.atan2(normalizedX, normalizedZ) * 180) / Math.PI),
    pitchDegrees: (Math.asin(Math.min(1, Math.max(-1, normalizedY))) * 180) / Math.PI
  });
}

/**
 * Reconstructs a world-forward unit vector from the URL yaw and pitch convention.
 * @param yawDegrees Clockwise heading from world +Z towards +X.
 * @param pitchDegrees Positive angles look upward.
 * @returns World-space unit direction as `[x, y, z]`.
 */
export function resolveSeedWorldCameraForward(
  yawDegrees: number,
  pitchDegrees: number
): readonly [x: number, y: number, z: number] {
  const yawRadians = (yawDegrees * Math.PI) / 180;
  const pitchRadians = (pitchDegrees * Math.PI) / 180;
  const horizontalScale = Math.cos(pitchRadians);
  return Object.freeze([
    Math.sin(yawRadians) * horizontalScale,
    Math.sin(pitchRadians),
    Math.cos(yawRadians) * horizontalScale
  ] as const);
}

function parseFiniteTuple(value: string, count: number, label: string): number[] {
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.length !== count || entries.some((entry) => entry === "")) {
    throw new RangeError(`Seed World ${label} must contain exactly ${count} comma-separated numbers`);
  }
  const values = entries.map(Number);
  if (values.some((entry) => !Number.isFinite(entry))) {
    throw new RangeError(`Seed World ${label} must contain only finite numbers`);
  }
  return values;
}

function normalizeYawDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function formatCameraNumber(value: number, fractionDigits: number): string {
  const zeroThreshold = 0.5 * 10 ** -fractionDigits;
  const normalized = Math.abs(value) < zeroThreshold ? 0 : value;
  return normalized.toFixed(fractionDigits).replace(/0+$/, "").replace(/\.$/, "");
}
