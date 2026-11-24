import {
  BoundingBox,
  BoxCollider,
  CapsuleCollider,
  CapsuleColliderDirection,
  CharacterController,
  Entity,
  HitResult,
  MeshCollider,
  ModelMesh,
  PlaneCollider,
  Ray,
  SphereCollider,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPhysics } from "../../utils/physics";

describe("Collider.getBounds", () => {
  let engine: WebGLEngine;
  let root: Entity;
  let bounds: BoundingBox;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: createPhysics() });
  });

  beforeEach(() => {
    root = new Entity(engine);
    bounds = new BoundingBox();
  });

  afterEach(() => {
    root.destroy();
    engine.resourceManager.gc();
  });

  afterAll(() => engine.destroy());

  function expectPoint(actual: Vector3, x: number, y: number, z: number): void {
    expect(actual.x).toBeCloseTo(x, 5);
    expect(actual.y).toBeCloseTo(y, 5);
    expect(actual.z).toBeCloseTo(z, 5);
  }

  function createTriangleMesh(): ModelMesh {
    const mesh = new ModelMesh(engine);
    const positions = [new Vector3(1, 0, 0), new Vector3(3, 0, 0), new Vector3(1, 2, 0)];
    mesh.setPositions(positions);
    mesh.setIndices(new Uint16Array([0, 1, 2]));
    BoundingBox.fromPoints(positions, mesh.bounds);
    mesh.uploadData(false);
    return mesh;
  }

  it("encloses the eight corners of a rotated, non-uniformly scaled box with a signed center offset", () => {
    const box = root.addComponent(BoxCollider);
    box.size.set(2, 4, 6);
    box.center.set(1, -2, 3);
    const transform = root.transform;
    transform.setScale(-2, 3, 0.5);
    transform.setRotation(27, 67, 12);
    transform.setPosition(5, 7, 11);

    const points: Vector3[] = [];
    for (const x of [-2, 2]) {
      for (const y of [-6, 6]) {
        for (const z of [-1.5, 1.5]) {
          const point = new Vector3(x - 2, y - 6, z + 1.5);
          Vector3.transformByQuat(point, transform.worldRotationQuaternion, point);
          points.push(point.add(transform.worldPosition));
        }
      }
    }
    const expected = new BoundingBox();
    BoundingBox.fromPoints(points, expected);

    expect(box.getBounds(bounds)).toBe(true);
    expectPoint(bounds.min, expected.min.x, expected.min.y, expected.min.z);
    expectPoint(bounds.max, expected.max.x, expected.max.y, expected.max.z);
  });

  it("bounds a sphere before scene entry and reflects edits after disabling it", () => {
    const sphere = root.addComponent(SphereCollider);
    sphere.radius = 2;
    sphere.center.set(2, 1, 0);
    sphere.contactOffset = 1;
    root.transform.setScale(0.5, -3, 2);
    root.transform.setRotation(0, 0, 90);
    root.transform.setPosition(10, 20, 30);

    expect(sphere.getBounds(bounds)).toBe(true);
    expectPoint(bounds.min, 7, 15, 24);
    expectPoint(bounds.max, 19, 27, 36);

    engine.sceneManager.activeScene.addRootEntity(root);
    sphere.enabled = false;
    sphere.radius = 1;
    root.transform.setPosition(20, 20, 30);
    expect(sphere.getBounds(bounds)).toBe(true);
    expectPoint(bounds.min, 20, 18, 27);
    expectPoint(bounds.max, 26, 24, 33);
  });

  it.each([
    { direction: CapsuleColliderDirection.X, x: 2 + 4 * Math.SQRT1_2, y: 2 + 4 * Math.SQRT1_2, z: 2, radius: 2 },
    { direction: CapsuleColliderDirection.Y, x: 2 + 7 * Math.SQRT1_2, y: 2 + 7 * Math.SQRT1_2, z: 2, radius: 2 },
    { direction: CapsuleColliderDirection.Z, x: 1.5, y: 1.5, z: 12, radius: 1.5 }
  ])("projects a capsule along direction $direction and handles its sphere limit", ({ direction, x, y, z, radius }) => {
    const capsule = root.addComponent(CapsuleCollider);
    capsule.direction = direction;
    capsule.radius = 0.5;
    capsule.height = 6;
    root.transform.setScale(2, 3, 4);
    root.transform.setRotation(0, 0, 45);

    expect(capsule.getBounds(bounds)).toBe(true);
    expectPoint(bounds.min, -x, -y, -z);
    expectPoint(bounds.max, x, y, z);

    capsule.height = 0.5;
    expect(capsule.getBounds(bounds)).toBe(true);
    expectPoint(bounds.min, -radius, -radius, -radius);
    expectPoint(bounds.max, radius, radius, radius);
  });

  it("uses the controller's world up direction and unrotated signed center even when disabled", () => {
    const controller = root.addComponent(CharacterController);
    controller.enabled = false;
    controller.height = 4;
    controller.center.set(0.5, -1, 2);
    controller.upDirection = { x: 1, y: 2, z: 2 };
    root.transform.setScale(-2, 3, 4);
    root.transform.setRotation(0, 0, 90);
    root.transform.setPosition(8, 12, 16);
    engine.sceneManager.activeScene.addRootEntity(root);

    expect(controller.getBounds(bounds)).toBe(true);
    expectPoint(bounds.min, 7 - 10 / 3, 9 - 14 / 3, 24 - 14 / 3);
    expectPoint(bounds.max, 7 + 10 / 3, 9 + 14 / 3, 24 + 14 / 3);

    controller.height = 1;
    expect(controller.getBounds(bounds)).toBe(true);
    expectPoint(bounds.min, 5, 7, 22);
    expectPoint(bounds.max, 9, 11, 26);
  });

  it("bounds the same side of an asymmetric mesh that PhysX hits under negative scale", () => {
    const collider = root.addComponent(MeshCollider);
    const mesh = (collider.mesh = createTriangleMesh());
    collider.center.set(0.5, 1, 2);
    root.transform.setScale(-2, 3, 0.5);
    root.transform.setRotation(0, 0, 90);
    root.transform.setPosition(5, 10, 15);

    expect(collider.getBounds(bounds)).toBe(true);
    expectPoint(bounds.min, -4, 11, 16);
    expectPoint(bounds.max, 2, 15, 16);

    const scene = engine.sceneManager.activeScene;
    scene.addRootEntity(root);
    const hit = new HitResult();
    const ray = new Ray(new Vector3(0.5, 12, 20), new Vector3(0, 0, -1));
    expect(scene.physics.raycast(ray, hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expectPoint(hit.point, 0.5, 12, bounds.max.z);
    ray.origin.y = 6;
    expect(scene.physics.raycast(ray)).toBe(false);

    collider.enabled = false;
    collider.mesh = null;
    mesh.uploadData(true);
    collider.mesh = mesh;
    expect(mesh.accessible).toBe(false);
    expect(collider.getBounds(bounds)).toBe(true);
    expectPoint(bounds.min, -4, 11, 16);
    expectPoint(bounds.max, 2, 15, 16);
  });

  it("preserves the output for missing meshes, invalid scale, and inverted mesh bounds", () => {
    const collider = root.addComponent(MeshCollider);
    bounds.min.set(1, 2, 3);
    bounds.max.set(4, 5, 6);
    const previous = bounds.toJSON();

    expect(collider.getBounds(bounds)).toBe(false);
    expect(bounds.toJSON()).toEqual(previous);

    collider.mesh = createTriangleMesh();
    root.transform.setScale(0, 1, 1);
    expect(collider.getBounds(bounds)).toBe(false);
    expect(bounds.toJSON()).toEqual(previous);

    root.transform.setScale(1, 1, 1);
    collider.mesh.bounds.min.x = 4;
    expect(collider.getBounds(bounds)).toBe(false);
    expect(bounds.toJSON()).toEqual(previous);
  });

  it("preserves the output for a zero box extent and non-finite poses", () => {
    const box = root.addComponent(BoxCollider);
    expect(box.getBounds(bounds)).toBe(true);
    const previous = bounds.toJSON();

    box.size.x = 0;
    expect(box.getBounds(bounds)).toBe(false);
    expect(bounds.toJSON()).toEqual(previous);

    box.size.x = 1;
    root.transform.setPosition(Infinity, 0, 0);
    expect(box.getBounds(bounds)).toBe(false);
    expect(bounds.toJSON()).toEqual(previous);

    root.transform.setPosition(0, 0, 0);
    root.transform.setRotation(NaN, 0, 0);
    expect(box.getBounds(bounds)).toBe(false);
    expect(bounds.toJSON()).toEqual(previous);
  });

  it("skips the infinite plane when reusing and merging finite collider bounds", () => {
    const box = root.addComponent(BoxCollider);
    const plane = root.addComponent(PlaneCollider);
    const sphere = root.createChild().addComponent(SphereCollider);
    sphere.entity.transform.setPosition(3, 0, 0);
    const merged = new BoundingBox();

    expect(box.getBounds(merged)).toBe(true);
    expect(sphere.getBounds(bounds)).toBe(true);
    const previous = bounds.toJSON();
    expect(plane.getBounds(bounds)).toBe(false);
    expect(bounds.toJSON()).toEqual(previous);
    BoundingBox.merge(merged, bounds, merged);
    expectPoint(merged.getCenter(new Vector3()), 1.75, 0, 0);
    expectPoint(merged.getExtent(new Vector3()), 2.25, 1, 1);
  });
});
