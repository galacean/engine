import type { Matrix } from "@galacean/engine-math";
import { Logger } from "../base";
import type { Component } from "../Component";

const shearToleranceSquared = 1e-8;

/** @internal Warn when a sheared transform cannot be represented by the collision shape. */
export function warnIfColliderSheared(worldMatrix: Matrix, collider: Component): boolean {
  // A rotated, non-uniformly scaled ancestor can make the transformed axes non-orthogonal.
  const e = worldMatrix.elements;
  const xLengthSquared = e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
  const yLengthSquared = e[4] * e[4] + e[5] * e[5] + e[6] * e[6];
  const zLengthSquared = e[8] * e[8] + e[9] * e[9] + e[10] * e[10];
  const xy = e[0] * e[4] + e[1] * e[5] + e[2] * e[6];
  const xz = e[0] * e[8] + e[1] * e[9] + e[2] * e[10];
  const yz = e[4] * e[8] + e[5] * e[9] + e[6] * e[10];
  if (
    xy * xy > shearToleranceSquared * xLengthSquared * yLengthSquared ||
    xz * xz > shearToleranceSquared * xLengthSquared * zLengthSquared ||
    yz * yz > shearToleranceSquared * yLengthSquared * zLengthSquared
  ) {
    Logger.warn(
      `${collider.constructor.name}: the world transform of "${collider.entity.name}" is sheared, which physics cannot represent; the shape ignores the shear.`
    );
    return true;
  }
  return false;
}
