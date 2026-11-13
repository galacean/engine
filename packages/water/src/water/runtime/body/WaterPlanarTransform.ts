/**
 * Pure planar rigid transform shared by finite WaterBody representations.
 *
 * Water stays horizontal: translation and world-Y yaw are supported, while
 * X/Z scale must remain one so metres keep the same meaning for depth, shore
 * distance, flow velocity, queries, and spatial fields.
 */

export interface WaterPlanarTransformV1 {
  readonly position: readonly [x: number, y: number, z: number];
  readonly yawDegrees: number;
  readonly scaleXZ: readonly [x: number, z: number];
}

export interface WaterPlanarPoint3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface WaterPlanarBounds3 {
  readonly minimum: WaterPlanarPoint3;
  readonly maximum: WaterPlanarPoint3;
}

export interface CompiledWaterPlanarTransformV1 {
  readonly schemaVersion: 1;
  readonly source: Readonly<WaterPlanarTransformV1>;
  readonly cosine: number;
  readonly sine: number;
}

const UNIT_SCALE_EPSILON = 1e-8;

function assertFinite(value: number, path: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${path} must be finite.`);
}

function freezePoint(x: number, y: number, z: number): Readonly<WaterPlanarPoint3> {
  return Object.freeze({ x, y, z });
}

export function compileWaterPlanarTransform(
  transform: Readonly<WaterPlanarTransformV1>
): Readonly<CompiledWaterPlanarTransformV1> {
  transform.position.forEach((value, index) => assertFinite(value, `$.position[${index}]`));
  assertFinite(transform.yawDegrees, "$.yawDegrees");
  transform.scaleXZ.forEach((value, index) => assertFinite(value, `$.scaleXZ[${index}]`));
  if (
    Math.abs(transform.scaleXZ[0] - 1) > UNIT_SCALE_EPSILON ||
    Math.abs(transform.scaleXZ[1] - 1) > UNIT_SCALE_EPSILON
  ) {
    throw new RangeError("Finite WaterBody scaleXZ must remain [1, 1].");
  }
  const radians = (transform.yawDegrees * Math.PI) / 180;
  return Object.freeze({
    schemaVersion: 1,
    source: Object.freeze({
      position: Object.freeze([...transform.position] as [number, number, number]),
      yawDegrees: transform.yawDegrees,
      scaleXZ: Object.freeze([1, 1] as const)
    }),
    cosine: Math.cos(radians),
    sine: Math.sin(radians)
  });
}

export function waterLocalPointToWorld(
  transform: Readonly<CompiledWaterPlanarTransformV1>,
  point: Readonly<WaterPlanarPoint3>
): Readonly<WaterPlanarPoint3> {
  const { position } = transform.source;
  return freezePoint(
    position[0] + point.x * transform.cosine + point.z * transform.sine,
    position[1] + point.y,
    position[2] - point.x * transform.sine + point.z * transform.cosine
  );
}

export function waterWorldPointToLocal(
  transform: Readonly<CompiledWaterPlanarTransformV1>,
  point: Readonly<WaterPlanarPoint3>
): Readonly<WaterPlanarPoint3> {
  const { position } = transform.source;
  const x = point.x - position[0];
  const z = point.z - position[2];
  return freezePoint(
    x * transform.cosine - z * transform.sine,
    point.y - position[1],
    x * transform.sine + z * transform.cosine
  );
}

/** Conservative world AABB for a local finite-water AABB after planar yaw. */
export function waterLocalBoundsToWorld(
  transform: Readonly<CompiledWaterPlanarTransformV1>,
  bounds: Readonly<WaterPlanarBounds3>
): Readonly<WaterPlanarBounds3> {
  const corners = [
    freezePoint(bounds.minimum.x, bounds.minimum.y, bounds.minimum.z),
    freezePoint(bounds.minimum.x, bounds.minimum.y, bounds.maximum.z),
    freezePoint(bounds.minimum.x, bounds.maximum.y, bounds.minimum.z),
    freezePoint(bounds.minimum.x, bounds.maximum.y, bounds.maximum.z),
    freezePoint(bounds.maximum.x, bounds.minimum.y, bounds.minimum.z),
    freezePoint(bounds.maximum.x, bounds.minimum.y, bounds.maximum.z),
    freezePoint(bounds.maximum.x, bounds.maximum.y, bounds.minimum.z),
    freezePoint(bounds.maximum.x, bounds.maximum.y, bounds.maximum.z)
  ].map((corner) => waterLocalPointToWorld(transform, corner));
  return Object.freeze({
    minimum: freezePoint(
      Math.min(...corners.map(({ x }) => x)),
      Math.min(...corners.map(({ y }) => y)),
      Math.min(...corners.map(({ z }) => z))
    ),
    maximum: freezePoint(
      Math.max(...corners.map(({ x }) => x)),
      Math.max(...corners.map(({ y }) => y)),
      Math.max(...corners.map(({ z }) => z))
    )
  });
}

export function waterPlanarTransformIsIdentity(transform: Readonly<CompiledWaterPlanarTransformV1>): boolean {
  const { position, yawDegrees } = transform.source;
  return position[0] === 0 && position[1] === 0 && position[2] === 0 && yawDegrees === 0;
}
