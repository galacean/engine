import { MathUtil, Vector3 } from "@galacean/engine-math";
import type { BuoyancyPointForceInput, BuoyancyPointForceOutput, BuoyancySolverScratch } from "./types";

const MAX_FINITE_NUMBER = Number.MAX_VALUE;

function isFiniteVector(value: Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function finiteOrSaturated(value: number): number {
  if (Number.isFinite(value)) return value === 0 ? 0 : value;
  if (Number.isNaN(value)) return 0;
  return value > 0 ? MAX_FINITE_NUMBER : -MAX_FINITE_NUMBER;
}

function sanitizeVector(value: Vector3): void {
  value.set(finiteOrSaturated(value.x), finiteOrSaturated(value.y), finiteOrSaturated(value.z));
}

function resetOutput(out: BuoyancyPointForceOutput): void {
  out.force.set(0, 0, 0);
  out.submergedRatio = 0;
  out.radiusCubedWeight = 0;
  out.verticalSpeed = 0;
}

/** Pure, backend-independent math used by the water-pcg buoyancy component. */
export class BuoyancySolver {
  /** Returns a finite radius-cubed contribution, or zero for an invalid radius. */
  static computeRadiusCubed(radius: number): number {
    if (!Number.isFinite(radius) || radius <= 0) return 0;
    const radiusCubed = radius * radius * radius;
    return Number.isFinite(radiusCubed) ? radiusCubed : 0;
  }

  /** Returns this Pontoon's normalized radius-cubed weight. */
  static computeRadiusCubedWeight(radius: number, totalRadiusCubed: number): number {
    if (!Number.isFinite(totalRadiusCubed) || totalRadiusCubed <= 0) return 0;
    const radiusCubed = BuoyancySolver.computeRadiusCubed(radius);
    if (radiusCubed === 0 || radiusCubed > totalRadiusCubed) return 0;
    const weight = radiusCubed / totalRadiusCubed;
    return Number.isFinite(weight) ? weight : 0;
  }

  /**
   * Computes the submerged fraction of a sphere cut by the sampled surface plane.
   * `up` may be non-normalized; a zero or invalid direction safely produces zero.
   */
  static computeSubmergedRatio(pontoonCenter: Vector3, surfacePosition: Vector3, up: Vector3, radius: number): number {
    if (
      BuoyancySolver.computeRadiusCubed(radius) === 0 ||
      !isFiniteVector(pontoonCenter) ||
      !isFiniteVector(surfacePosition) ||
      !isFiniteVector(up)
    ) {
      return 0;
    }

    const upLength = Math.hypot(up.x, up.y, up.z);
    if (!Number.isFinite(upLength) || upLength <= MathUtil.zeroTolerance) return 0;
    const centerDepth =
      ((surfacePosition.x - pontoonCenter.x) * up.x +
        (surfacePosition.y - pontoonCenter.y) * up.y +
        (surfacePosition.z - pontoonCenter.z) * up.z) /
      upLength;
    if (!Number.isFinite(centerDepth)) return 0;

    const normalizedHeight = MathUtil.clamp(centerDepth / radius + 1, 0, 2);
    // PI cancels from capVolume / sphereVolume, yielding x^2 * (3 - x) / 4.
    return (normalizedHeight * normalizedHeight * (3 - normalizedHeight)) / 4;
  }

  /**
   * Computes `linearVelocity + omegaRadians x (point - centerOfMass)` without allocations.
   * Source vectors are never mutated. Invalid input produces a zero vector.
   */
  static computePointVelocity(
    linearVelocity: Vector3,
    angularVelocityDegrees: Vector3,
    pointPosition: Vector3,
    worldCenterOfMass: Vector3,
    out: Vector3,
    angularVelocityRadiansScratch: Vector3,
    offsetFromCenterOfMassScratch: Vector3
  ): Vector3 {
    out.set(0, 0, 0);
    if (
      !isFiniteVector(linearVelocity) ||
      !isFiniteVector(angularVelocityDegrees) ||
      !isFiniteVector(pointPosition) ||
      !isFiniteVector(worldCenterOfMass)
    ) {
      return out;
    }

    Vector3.scale(angularVelocityDegrees, MathUtil.degreeToRadFactor, angularVelocityRadiansScratch);
    Vector3.subtract(pointPosition, worldCenterOfMass, offsetFromCenterOfMassScratch);
    Vector3.cross(angularVelocityRadiansScratch, offsetFromCenterOfMassScratch, out);
    Vector3.add(linearVelocity, out, out);
    sanitizeVector(out);
    return out;
  }

  /**
   * Writes the mass-normalized, vertically damped and capped force for one Pontoon.
   * Returns the caller-owned output and allocates no objects on the hot path.
   */
  static computePointForce(
    input: BuoyancyPointForceInput,
    out: BuoyancyPointForceOutput,
    scratch: BuoyancySolverScratch
  ): BuoyancyPointForceOutput {
    resetOutput(out);
    if (!isFiniteVector(input.gravity)) return out;

    const gravityMagnitude = Math.hypot(input.gravity.x, input.gravity.y, input.gravity.z);
    if (!Number.isFinite(gravityMagnitude) || gravityMagnitude <= MathUtil.zeroTolerance) return out;
    Vector3.scale(input.gravity, -1 / gravityMagnitude, scratch.up);

    const submergedRatio = BuoyancySolver.computeSubmergedRatio(
      input.pontoonCenter,
      input.surfacePosition,
      scratch.up,
      input.radius
    );
    out.submergedRatio = submergedRatio;
    if (submergedRatio === 0) return out;

    const radiusCubedWeight = BuoyancySolver.computeRadiusCubedWeight(input.radius, input.totalRadiusCubed);
    out.radiusCubedWeight = radiusCubedWeight;
    if (radiusCubedWeight === 0) return out;

    if (
      !Number.isFinite(input.mass) ||
      input.mass <= 0 ||
      !Number.isFinite(input.buoyancyCoefficient) ||
      input.buoyancyCoefficient < 0 ||
      !Number.isFinite(input.verticalDamping) ||
      input.verticalDamping < 0 ||
      !Number.isFinite(input.maxForceMultiplier) ||
      input.maxForceMultiplier < 0 ||
      !isFiniteVector(input.waterVelocity) ||
      !isFiniteVector(input.linearVelocity) ||
      !isFiniteVector(input.angularVelocityDegrees) ||
      !isFiniteVector(input.worldCenterOfMass)
    ) {
      return out;
    }

    BuoyancySolver.computePointVelocity(
      input.linearVelocity,
      input.angularVelocityDegrees,
      input.pontoonCenter,
      input.worldCenterOfMass,
      scratch.pointVelocity,
      scratch.angularVelocityRadians,
      scratch.offsetFromCenterOfMass
    );
    Vector3.subtract(scratch.pointVelocity, input.waterVelocity, scratch.relativeVelocity);
    sanitizeVector(scratch.relativeVelocity);
    const verticalSpeed = finiteOrSaturated(Vector3.dot(scratch.relativeVelocity, scratch.up));
    out.verticalSpeed = verticalSpeed;

    const buoyancyMagnitude = finiteOrSaturated(
      input.mass * gravityMagnitude * input.buoyancyCoefficient * radiusCubedWeight * submergedRatio
    );
    const dampingMagnitude = finiteOrSaturated(
      -input.mass * radiusCubedWeight * input.verticalDamping * submergedRatio * verticalSpeed
    );
    const maxPointForce = Math.max(
      0,
      finiteOrSaturated(input.mass * gravityMagnitude * radiusCubedWeight * input.maxForceMultiplier)
    );
    const forceMagnitude = MathUtil.clamp(buoyancyMagnitude + dampingMagnitude, -maxPointForce, maxPointForce);
    Vector3.scale(scratch.up, forceMagnitude, out.force);
    if (!isFiniteVector(out.force)) {
      out.force.set(0, 0, 0);
    } else {
      sanitizeVector(out.force);
    }
    return out;
  }
}
