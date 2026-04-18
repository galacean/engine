import { BoxShape, SphereShape, ConeShape } from "@galacean/engine-core";
import { BoundingBox, Rand, Vector3 } from "@galacean/engine-math";
import { describe, beforeEach, expect, it } from "vitest";

describe("ParticleShapeTransform", function () {
  const position = new Vector3();
  const direction = new Vector3();
  const rand = new Rand(0, 1234);
  const epsilon = 1e-5;

  describe("Position offset", function () {
    it("should offset generated position by shape position", function () {
      const shape = new BoxShape();
      shape.size.set(0, 0, 0);
      shape.position.set(3, 5, 7);

      shape._generatePositionAndDirection(rand, 0, position, direction);

      expect(position.x).to.be.closeTo(3, epsilon);
      expect(position.y).to.be.closeTo(5, epsilon);
      expect(position.z).to.be.closeTo(7, epsilon);
    });

    it("should offset position range by shape position", function () {
      const shape = new BoxShape();
      shape.size.set(2, 2, 2);
      shape.position.set(10, 0, 0);

      const bounds = new BoundingBox();
      shape._getPositionRange(bounds);

      expect(bounds.min.x).to.be.closeTo(9, epsilon);
      expect(bounds.max.x).to.be.closeTo(11, epsilon);
      expect(bounds.min.y).to.be.closeTo(-1, epsilon);
      expect(bounds.max.y).to.be.closeTo(1, epsilon);
    });
  });

  describe("Rotation", function () {
    it("should rotate position range by shape rotation", function () {
      const shape = new BoxShape();
      shape.size.set(2, 0, 0);
      shape.rotation.set(0, 0, 90);

      const bounds = new BoundingBox();
      shape._getPositionRange(bounds);

      // Local range: (-1,0,0) to (1,0,0), rotated 90 around Z -> (0,-1,0) to (0,1,0)
      expect(bounds.min.x).to.be.closeTo(0, epsilon);
      expect(bounds.max.x).to.be.closeTo(0, epsilon);
      expect(bounds.min.y).to.be.closeTo(-1, epsilon);
      expect(bounds.max.y).to.be.closeTo(1, epsilon);
    });

    it("should rotate box position range", function () {
      const shape = new BoxShape();
      shape.size.set(2, 4, 2);
      shape.rotation.set(0, 0, 90);

      const bounds = new BoundingBox();
      shape._getPositionRange(bounds);

      // Original range: (-1,-2,-1) to (1,2,1)
      // After 90 Z rotation: x<->y swapped
      expect(bounds.min.x).to.be.closeTo(-2, epsilon);
      expect(bounds.max.x).to.be.closeTo(2, epsilon);
      expect(bounds.min.y).to.be.closeTo(-1, epsilon);
      expect(bounds.max.y).to.be.closeTo(1, epsilon);
    });

    it("sphere bounds should be conservative after rotation", function () {
      const shape = new SphereShape();
      shape.radius = 2;

      const boundsBefore = new BoundingBox();
      shape._getPositionRange(boundsBefore);
      const minBefore = new Vector3();
      const maxBefore = new Vector3();
      minBefore.copyFrom(boundsBefore.min);
      maxBefore.copyFrom(boundsBefore.max);

      shape.rotation.set(45, 30, 60);
      const boundsAfter = new BoundingBox();
      shape._getPositionRange(boundsAfter);

      // Arvo rotates the AABB (cube), which expands it. Bounds should be >= original.
      expect(boundsAfter.min.x).to.be.lessThanOrEqual(minBefore.x + epsilon);
      expect(boundsAfter.min.y).to.be.lessThanOrEqual(minBefore.y + epsilon);
      expect(boundsAfter.min.z).to.be.lessThanOrEqual(minBefore.z + epsilon);
      expect(boundsAfter.max.x).to.be.greaterThanOrEqual(maxBefore.x - epsilon);
      expect(boundsAfter.max.y).to.be.greaterThanOrEqual(maxBefore.y - epsilon);
      expect(boundsAfter.max.z).to.be.greaterThanOrEqual(maxBefore.z - epsilon);
    });
  });

  describe("Scale", function () {
    it("should scale generated position", function () {
      const shape = new BoxShape();
      shape.size.set(0, 0, 0);
      shape.position.set(1, 0, 0);
      shape.scale.set(3, 1, 1);

      shape._generatePositionAndDirection(rand, 0, position, direction);

      // position (0,0,0) scaled then rotated then + position offset (1,0,0)
      expect(position.x).to.be.closeTo(1, epsilon);
      expect(position.y).to.be.closeTo(0, epsilon);
    });

    it("should scale position range", function () {
      const shape = new BoxShape();
      shape.size.set(2, 2, 2);
      shape.scale.set(3, 1, 1);

      const bounds = new BoundingBox();
      shape._getPositionRange(bounds);

      // Original: (-1,-1,-1) to (1,1,1), scaled X by 3
      expect(bounds.min.x).to.be.closeTo(-3, epsilon);
      expect(bounds.max.x).to.be.closeTo(3, epsilon);
      expect(bounds.min.y).to.be.closeTo(-1, epsilon);
      expect(bounds.max.y).to.be.closeTo(1, epsilon);
    });

    it("negative scale should flip and reorder min/max", function () {
      const shape = new BoxShape();
      shape.size.set(2, 2, 2);
      shape.scale.set(-1, 1, 1);

      const bounds = new BoundingBox();
      shape._getPositionRange(bounds);

      // After negative X scale, reorder ensures min < max
      expect(bounds.min.x).to.be.closeTo(-1, epsilon);
      expect(bounds.max.x).to.be.closeTo(1, epsilon);
    });
  });

  describe("Combined transform", function () {
    it("should apply scale then rotation then position", function () {
      const shape = new BoxShape();
      shape.size.set(0, 0, 0);
      shape.position.set(0, 0, 5);
      shape.rotation.set(0, 90, 0);
      shape.scale.set(2, 1, 1);

      // Generate from zero-size box at origin
      shape._generatePositionAndDirection(rand, 0, position, direction);

      // Local pos (0,0,0) -> scale -> (0,0,0) -> rotate -> (0,0,0) -> + offset (0,0,5)
      expect(position.x).to.be.closeTo(0, epsilon);
      expect(position.y).to.be.closeTo(0, epsilon);
      expect(position.z).to.be.closeTo(5, epsilon);
    });
  });

  describe("Default transform (no-op fast path)", function () {
    it("should produce identical results when no transform set", function () {
      const shape1 = new BoxShape();
      const shape2 = new BoxShape();
      shape1.size.set(2, 3, 4);
      shape2.size.set(2, 3, 4);

      const bounds1 = new BoundingBox();
      const bounds2 = new BoundingBox();

      shape1._getPositionRange(bounds1);
      shape2._getPositionRange(bounds2);

      expect(bounds1.min.x).to.be.closeTo(bounds2.min.x, epsilon);
      expect(bounds1.min.y).to.be.closeTo(bounds2.min.y, epsilon);
      expect(bounds1.min.z).to.be.closeTo(bounds2.min.z, epsilon);
      expect(bounds1.max.x).to.be.closeTo(bounds2.max.x, epsilon);
      expect(bounds1.max.y).to.be.closeTo(bounds2.max.y, epsilon);
      expect(bounds1.max.z).to.be.closeTo(bounds2.max.z, epsilon);
    });
  });

  describe("Direction range", function () {
    it("should rotate direction range by shape rotation", function () {
      const shape = new BoxShape();
      // Default direction range: min=(0,0,-1), max=(0,0,0)
      shape.rotation.set(90, 0, 0);

      const min = new Vector3();
      const max = new Vector3();
      shape._getDirectionRange(min, max);

      // (0,0,-1) rotated 90 around X -> (0,1,0)
      // Rotated AABB: min=(0,0,0), max=(0,1,0)
      expect(min.x).to.be.closeTo(0, epsilon);
      expect(min.y).to.be.closeTo(0, epsilon);
      expect(min.z).to.be.closeTo(0, epsilon);
      expect(max.y).to.be.closeTo(1, epsilon);
    });
  });

  describe("Clone", function () {
    // Simulate CloneManager: deepClone calls copyFrom, then _cloneTo
    function simulateClone(source: BoxShape): BoxShape {
      const clone = new BoxShape();
      // @deepClone step: copyFrom on existing Vector3 (preserves constructor-bound callbacks)
      clone.position.copyFrom(source.position);
      clone.rotation.copyFrom(source.rotation);
      clone.scale.copyFrom(source.scale);
      return clone;
    }

    it("cloned shape should have correct transform values", function () {
      const shape = new BoxShape();
      shape.position.set(1, 2, 3);
      shape.rotation.set(45, 0, 0);
      shape.scale.set(2, 2, 2);

      const clone = simulateClone(shape);

      expect(clone.position.x).to.be.closeTo(1, epsilon);
      expect(clone.position.y).to.be.closeTo(2, epsilon);
      expect(clone.position.z).to.be.closeTo(3, epsilon);
      expect(clone.rotation.x).to.be.closeTo(45, epsilon);
      expect(clone.scale.x).to.be.closeTo(2, epsilon);
    });

    it("cloned shape should rebuild matrix correctly", function () {
      const shape = new BoxShape();
      shape.size.set(2, 0, 0);
      shape.rotation.set(0, 0, 90);

      const clone = simulateClone(shape);
      clone.size.set(2, 0, 0);

      const boundsOrig = new BoundingBox();
      shape._getPositionRange(boundsOrig);

      const boundsClone = new BoundingBox();
      clone._getPositionRange(boundsClone);

      // Both should have: local (-1,0,0)~(1,0,0) rotated 90Z -> (0,-1,0)~(0,1,0)
      expect(boundsClone.min.x).to.be.closeTo(boundsOrig.min.x, epsilon);
      expect(boundsClone.min.y).to.be.closeTo(boundsOrig.min.y, epsilon);
      expect(boundsClone.max.x).to.be.closeTo(boundsOrig.max.x, epsilon);
      expect(boundsClone.max.y).to.be.closeTo(boundsOrig.max.y, epsilon);
    });

    it("modifying clone should not affect original", function () {
      const shape = new BoxShape();
      shape.position.set(1, 2, 3);

      const clone = simulateClone(shape);
      clone.position.set(10, 20, 30);

      expect(shape.position.x).to.be.closeTo(1, epsilon);
      expect(shape.position.y).to.be.closeTo(2, epsilon);
      expect(shape.position.z).to.be.closeTo(3, epsilon);
    });

    it("clone callback should trigger on cloned shape", function () {
      const shape = new BoxShape();
      const clone = simulateClone(shape);

      let notified = false;
      clone._registerOnValueChanged(() => {
        notified = true;
      });

      clone.position.x = 10;
      expect(notified).to.be.true;
    });
  });
});
