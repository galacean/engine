/** Recovered RoofShingle64 gravity equations; no GPU ownership or scheduling. */
export const ROOF_INSTANCE_STRIDE = 64;

export const gravityVertexSource = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in uvec4 record0;
layout(location=1) in uvec4 record1;
layout(location=2) in uvec4 record2;
layout(location=3) in uvec4 record3;
uniform uint firstInstance;
uniform uint instanceCount;
uniform float dt;
uniform float wallHeightDelta;
uniform float roofPivotY;
uniform float animationT;
flat out uvec4 result0;
flat out uvec4 result1;
flat out uvec4 result2;
flat out uvec4 result3;
void main() {
  result0 = record0; result1 = record1; result2 = record2; result3 = record3;
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
  uint i = uint(gl_VertexID);
  if (i < firstInstance || i - firstInstance >= instanceCount) return;
  float height = uintBitsToFloat(record0.w);
  bool lowering = wallHeightDelta < 0.0 && wallHeightDelta / dt > -120.0;
  bool followRoof = lowering && height <= roofPivotY - wallHeightDelta;
  float tileT = floor(unpackHalf2x16(record1.w).y * 50.0) * 0.0199999995529651641845703125;
  float velocity = unpackHalf2x16(record2.w).x +
    (-98.100006103515625 * mix(1.0, 0.4000000059604644775390625, tileT)) * dt;
  float proposed = (followRoof ? roofPivotY : height) + velocity * dt;
  float nextHeight, nextVelocity;
  if (proposed <= roofPivotY) {
    nextVelocity = min(15.0, max((wallHeightDelta / dt) * 0.16599999368190765380859375, velocity));
    nextHeight = max(proposed, roofPivotY);
  } else {
    nextVelocity = velocity;
    nextHeight = proposed;
  }
  uint hash = record3.y;
  hash += hash << 10u; hash ^= hash >> 6u; hash += hash << 3u; hash ^= hash >> 11u;
  float settled;
  if (tileT > 0.89999997615814208984375) {
    settled = roofPivotY;
  } else {
    float randomValue = uintBitsToFloat(((hash + (hash << 15u)) & 8388607u) | 1065353216u) - 1.0;
    float speed = (5.0 * mix(0.0, 2.0, 1.0 - (((tileT * tileT) * tileT) * tileT))) *
      ((randomValue * tileT > 0.300000011920928955078125) ? 1.0 : 1000.0);
    settled = mix(nextHeight, roofPivotY, 1.0 - exp(-dt * speed));
  }
  float distanceToRoof = abs(roofPivotY - settled);
  float rotation = nextVelocity > 0.0
    ? (1.0 - exp(((-distanceToRoof) * distanceToRoof) * distanceToRoof)) * (-1.57000005245208740234375)
    : 0.0;
  result0.w = floatBitsToUint(settled);
  // The original shader rounds BOTH halves on EVERY step, not only on export.
  result2.w = packHalf2x16(vec2(nextVelocity, rotation));
  result3.x = floatBitsToUint(animationT);
}`;

export function validateGravityStep(step, count) {
  if (!step || typeof step !== "object") throw new TypeError("Gravity step must be an object");
  for (const key of ["first_instance", "instance_count"])
    if (!Number.isSafeInteger(step[key]) || step[key] < 0 || step[key] > 0xffffffff)
      throw new RangeError(`Gravity ${key} must be uint32`);
  if (step.first_instance + step.instance_count > count) throw new RangeError("Gravity step exceeds instance buffer");
  for (const key of ["dt", "wall_height_delta", "roof_pivot_y", "animation_t"])
    if (typeof step[key] !== "number" || !Number.isFinite(Math.fround(step[key])))
      throw new RangeError(`Gravity ${key} must be finite float32`);
  if (Math.fround(step.dt) <= 0) throw new RangeError("Gravity dt must be positive float32");
}
