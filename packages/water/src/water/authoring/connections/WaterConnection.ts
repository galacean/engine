/** Fixed, initial-generation connections. Coordinates use world XZ metres. */
export interface WaterConnectionV1 {
  readonly id: string;
  /** First body owns the negative side of the directed cross-section. */
  readonly bodies: readonly [string, string];
  readonly section: readonly [readonly [number, number], readonly [number, number]];
  readonly transitionLengths: readonly [number, number];
}

/** A sampled terrain shoreline, shared by the two sides of a connection. */
export interface WaterConnectionShoreField {
  readonly origin: readonly [number, number];
  readonly spacing: number;
  readonly distances: readonly number[];
}
export const WATER_CONNECTION_SHORE_SIZE = 65;
export const WATER_CONNECTION_SHORE_RANGE = 64;

/** Serializable backend input; shared by CPU coverage and material bindings. */
export interface WaterConnectionPort {
  readonly id: string;
  readonly center: readonly [number, number];
  readonly normal: readonly [number, number];
  readonly halfWidth: number;
  readonly length: number;
  /** Intersection of the two source bounds; independent of visual transition length. */
  readonly coverageBounds: readonly [number, number, number, number];
  readonly shoreField: WaterConnectionShoreField;
  readonly side: -1 | 1;
  readonly environmentTransition: boolean;
}

export const MAX_WATER_CONNECTION_PORTS = 4;

export function decodeWaterConnectionPorts(value: unknown): readonly WaterConnectionPort[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_WATER_CONNECTION_PORTS)
    throw new Error("Water connection ports exceed the supported per-body limit.");
  const ids = new Set<string>();
  return Object.freeze(
    value.map((p): WaterConnectionPort => {
      if (
        !p ||
        typeof p.id !== "string" ||
        !p.id ||
        ids.has(p.id) ||
        !Array.isArray(p.center) ||
        p.center.length !== 2 ||
        !p.center.every(Number.isFinite) ||
        !Array.isArray(p.normal) ||
        p.normal.length !== 2 ||
        !p.normal.every(Number.isFinite) ||
        Math.abs(Math.hypot(...(p.normal as [number, number])) - 1) > 1e-6 ||
        !Number.isFinite(p.halfWidth) ||
        p.halfWidth <= 0 ||
        !Number.isFinite(p.length) ||
        p.length <= 0 ||
        (p.side !== -1 && p.side !== 1) ||
        typeof p.environmentTransition !== "boolean" ||
        !Array.isArray(p.coverageBounds) ||
        p.coverageBounds.length !== 4 ||
        !p.coverageBounds.every(Number.isFinite) ||
        p.coverageBounds[0] >= p.coverageBounds[2] ||
        p.coverageBounds[1] >= p.coverageBounds[3] ||
        !p.shoreField ||
        !Array.isArray(p.shoreField.origin) ||
        p.shoreField.origin.length !== 2 ||
        !p.shoreField.origin.every(Number.isFinite) ||
        !Number.isFinite(p.shoreField.spacing) ||
        p.shoreField.spacing <= 0 ||
        !Array.isArray(p.shoreField.distances) ||
        p.shoreField.distances.length !== WATER_CONNECTION_SHORE_SIZE ** 2 ||
        !p.shoreField.distances.every(
          (d: unknown) => typeof d === "number" && Number.isFinite(d) && Math.abs(d) <= WATER_CONNECTION_SHORE_RANGE
        )
      )
        throw new Error("Invalid Water connection port.");
      ids.add(p.id);
      return Object.freeze({
        id: p.id,
        center: Object.freeze(p.center.map((v: number) => (v === 0 ? 0 : v))) as readonly [number, number],
        normal: Object.freeze(p.normal.map((v: number) => (v === 0 ? 0 : v))) as readonly [number, number],
        halfWidth: p.halfWidth,
        length: p.length,
        coverageBounds: Object.freeze([...p.coverageBounds]) as readonly [number, number, number, number],
        shoreField: Object.freeze({
          origin: Object.freeze([...p.shoreField.origin]) as readonly [number, number],
          spacing: p.shoreField.spacing,
          distances: Object.freeze([...p.shoreField.distances])
        }),
        side: p.side,
        environmentTransition: p.environmentTransition
      });
    })
  );
}

const UNCONNECTED_SURFACE = Object.freeze({
  covered: true,
  motion: 1,
  reflection: 1
});

export function sampleWaterConnection(ports: readonly WaterConnectionPort[] | undefined, x: number, z: number) {
  if (!ports?.length) return UNCONNECTED_SURFACE;
  let covered = true,
    motion = 1,
    reflection = 1;
  for (const port of ports) {
    const dx = x - port.center[0],
      dz = z - port.center[1];
    const along = dx * port.normal[0] + dz * port.normal[1];
    const across = Math.abs(dx * port.normal[1] - dz * port.normal[0]);
    const bounds = port.coverageBounds;
    if (
      across <= port.halfWidth &&
      x >= bounds[0] &&
      z >= bounds[1] &&
      x <= bounds[2] &&
      z <= bounds[3] &&
      (along * port.side < 0 || (along === 0 && port.side < 0))
    )
      covered = false;
    if (Math.abs(along) > port.length || across > port.halfWidth) continue;
    const t = Math.min(1, Math.abs(along) / port.length);
    const weight = t * t * (3 - 2 * t);
    motion = Math.min(motion, weight);
    if (port.environmentTransition) reflection = Math.min(reflection, weight);
  }
  return { covered, motion, reflection };
}

/** Static ports are world-authored. Moving a connected body requires recompiling the group. */
export function assertWaterConnectionTransform(
  ports: readonly WaterConnectionPort[] | undefined,
  transform: { readonly position: readonly number[]; readonly yawDegrees: number; readonly scaleXZ: readonly number[] }
) {
  if (
    ports?.length &&
    (transform.position.some((v) => v !== 0) || transform.yawDegrees !== 0 || transform.scaleXZ.some((v) => v !== 1))
  )
    throw new RangeError("Static connected Water bodies require the authored world transform.");
}

/** Bilinear interpolation and edge blend match WaterConnections.glsl exactly. */
export function sampleWaterConnectionShore(
  ports: readonly WaterConnectionPort[] | undefined,
  x: number,
  z: number,
  original: number
): number {
  let result = original;
  for (const port of ports ?? []) {
    const field = port.shoreField,
      size = WATER_CONNECTION_SHORE_SIZE;
    const u = (x - field.origin[0]) / field.spacing,
      v = (z - field.origin[1]) / field.spacing;
    const edge = Math.min(u, v, size - 1 - u, size - 1 - v);
    if (edge <= 0) continue;
    const column = Math.min(size - 2, Math.floor(u)),
      row = Math.min(size - 2, Math.floor(v));
    const tx = u - column,
      tz = v - row,
      index = row * size + column,
      d = field.distances;
    const top = d[index] * (1 - tx) + d[index + 1] * tx;
    const bottom = d[index + size] * (1 - tx) + d[index + size + 1] * tx;
    const t = Math.min(1, edge / 4),
      weight = t * t * (3 - 2 * t);
    result += (top * (1 - tz) + bottom * tz - result) * weight;
  }
  return result;
}
