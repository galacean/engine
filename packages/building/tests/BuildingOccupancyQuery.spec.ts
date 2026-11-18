import { expect, it } from "vitest";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine";
import { BuildingOccupancyQuery } from "../src/building/runtime/BuildingOccupancyQuery";

const part = (owner = "house") => ({ owner, material: "wall" as const, uvs: [],
  positions: [-2, 0, -0.5, 2, 3, 0.5, 2, 0, -0.5], indices: [0, 1, 2] });

it("keeps only a detached part envelope, reserving gaps inside its occupied volume", () => {
  const source = part(), q = BuildingOccupancyQuery.fromPreview([source]);
  source.positions.fill(100);
  expect(q.intersectBounds([-1, 0, 0], [-0.9, 1, 0.1])).not.toBeNull();
  expect(q.intersectBounds([3, 0, 0], [4, 1, 1])).toBeNull();
  expect(q.intersectBounds([-1, 4, 0], [1, 5, 0.1])).toBeNull();
  expect(q.snapshot()[0]).not.toHaveProperty("positions");
  expect(q.snapshot()[0]).not.toHaveProperty("indices");
  expect(q.withoutOwner("house").bounds).toEqual([]);
  expect(q.bounds).toHaveLength(1);
});

it("preserves rotated footprint corners, translation, scale and frozen captures", () => {
  const q = BuildingOccupancyQuery.fromPreview([part()]);
  const rotation = new Quaternion(), matrix = new Matrix();
  Quaternion.rotationYawPitchRoll(Math.PI / 4, 0, 0, rotation);
  Matrix.affineTransformation(new Vector3(2, 1, 1), rotation, new Vector3(10, 2, 20), matrix);
  const world = q.transformed(matrix);
  expect(world.intersectBounds([9.9, 2, 19.9], [10.1, 3, 20.1])).not.toBeNull();
  expect(world.intersectBounds([12.5, 2, 22.5], [12.6, 3, 22.6])).toBeNull();
  matrix.elements[12] = 100;
  const moved = q.transformed(matrix);
  expect(moved.intersectBounds([9, 2, 19], [11, 3, 21])).toBeNull();
  expect(world.intersectBounds([9.9, 2, 19.9], [10.1, 3, 20.1])).not.toBeNull();
});
