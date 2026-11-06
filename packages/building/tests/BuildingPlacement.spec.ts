import { describe, expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { Entity, Vector3 } from "@galacean/engine";
import { BuildingPartComponent } from "../src/building/parts/architecture/BuildingPartComponent";
import { European } from "../src/building/parts/architecture/European";
import {
  buildingPlacementFootprint,
  placeBuildingOnLand
} from "../src/building/components/BuildingPlacement";

// Detached native Entities need no renderer or Scene for transform/shape queries.
function fixture() {
  const root = new Entity(undefined!, "Group");
  root.transform.setPosition(2, 0, 3);
  const house = root.createChild("House");
  house.transform.setPosition(1, 0, 0);
  const body = house.addComponent(BuildingPartComponent);
  body.definition = European.buildTower({ id: "house", circle: { center: [0, 0], radius: 1, phase: 0 } }).parts[0];
  const wall = root.createChild("Wall");
  wall.transform.setPosition(-3, 0, 0);
  const wallBody = wall.addComponent(BuildingPartComponent);
  wallBody.definition = European.buildWall({ id: "wall", length: 2, depth: 0.25 }).parts[0];
  return { root, house, body, wall, wallBody };
}
const land = { sampleHeight: () => 12, isWater: () => false };
describe("native building land placement", () => {
  it("uses every body footprint without mutating native objects", () => {
    const { root } = fixture(),
      before = root.transform.position.clone();
    expect(
      placeBuildingOnLand(
        root,
        [
          [0, 0],
          [20, 0]
        ],
        { ...land, isWater: (x) => x < -2 }
      )
    ).toEqual([20, 0, 0]);
    expect(Vector3.distance(root.transform.position, before)).toBe(0);
    const query = buildingPlacementFootprint(root);
    expect(query.points.some(([x]) => x === -4)).toBe(true);
    expect(query.points.some(([x]) => x === 2)).toBe(true);
  });
  it("uses Engine world transforms and returns local coordinates beneath transformed parents", () => {
    const { root } = fixture(),
      parent = new Entity(undefined!, "Parent");
    parent.transform.setPosition(10, 0, 20);
    parent.transform.setRotation(0, 90, 0);
    parent.addChild(root);
    const query = buildingPlacementFootprint(root);
    expect(query.origin.x).toBeCloseTo(13);
    expect(query.origin.z).toBeCloseTo(18);
    expect(query.points.every(([x]) => Math.abs(x) <= 1.001)).toBe(true);
    const result = new Vector3(...placeBuildingOnLand(root, [[100, 200]], land));
    Vector3.transformCoordinate(result, query.parentMatrix, result);
    expect(result.x).toBeCloseTo(100, 4);
    expect(result.y).toBe(0);
    expect(result.z).toBeCloseTo(200, 4);
  });
  it("honors disabled bodies and inactive ancestors", () => {
    const { root, house, wallBody } = fixture();
    house.isActive = false;
    const points = buildingPlacementFootprint(root).points;
    expect(Math.max(...points.map((p) => p[0]))).toBe(-2);
    wallBody.enabled = false;
    expect(() => buildingPlacementFootprint(root)).toThrow("No active");
    wallBody.enabled = true;
    const parent = new Entity(undefined!);
    parent.addChild(root);
    parent.isActive = false;
    expect(() => buildingPlacementFootprint(root)).toThrow("No active");
  });
  it("reads component and shape defaults rather than duplicating their decoding", () => {
    const root = new Entity(undefined!),
      wall = root.createChild().addComponent(BuildingPartComponent);
    wall.definition = European.buildWall({ id: "wall" }).parts[0];
    expect(Math.max(...buildingPlacementFootprint(root).points.map((p) => p[1]))).toBeCloseTo(0.225);
    wall.definition = European.buildWall({ id: "wall", depth: 6 }).parts[0];
    expect(Math.max(...buildingPlacementFootprint(root).points.map((p) => p[1]))).toBe(3);
  });
  it("rejects failed bounded searches and singular parents without moving the object", () => {
    const { root } = fixture(),
      before = root.transform.position.clone();
    expect(() => placeBuildingOnLand(root, [[0, 0]], { ...land, isWater: () => true })).toThrow("有限搜索");
    expect(() => placeBuildingOnLand(root, [[0, 0]], { ...land, sampleHeight: () => undefined })).toThrow("有限搜索");
    expect(() => placeBuildingOnLand(root, [[NaN, 0]], land)).toThrow("finite");
    const parent = new Entity(undefined!);
    parent.addChild(root);
    parent.transform.setScale(0, 1, 1);
    expect(() => placeBuildingOnLand(root, [[0, 0]], land)).toThrow("singular");
    expect(Vector3.distance(root.transform.position, before)).toBe(0);
  });
  it("recomputes from current component edits", () => {
    const { root, body, wall } = fixture();
    wall.isActive = false;
    const query = { ...land, isWater: (x: number) => x < 0 };
    expect(
      placeBuildingOnLand(
        root,
        [
          [0, 0],
          [20, 0]
        ],
        query
      )[0]
    ).toBe(0);
    body.definition = European.buildTower({ id: "house", circle: { center: [0, 0], radius: 3, phase: 0 } }).parts[0];
    expect(
      placeBuildingOnLand(
        root,
        [
          [0, 0],
          [20, 0]
        ],
        query
      )[0]
    ).toBe(20);
  });
});
