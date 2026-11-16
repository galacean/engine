import { WebGLEngine } from "@galacean/engine";
import {
  BoxColliderShape,
  Collider,
  ColliderShape,
  DynamicCollider,
  Entity,
  Layer,
  PhysicsScene,
  Script,
  SphereColliderShape,
  StaticCollider
} from "@galacean/engine-core";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPhysics } from "../../utils/physics";

class ContactRecorder extends Script {
  enterCount = 0;
  stayCount = 0;
  exitCount = 0;

  override onCollisionEnter(): void {
    this.enterCount++;
  }

  override onCollisionStay(): void {
    this.stayCount++;
  }

  override onCollisionExit(): void {
    this.exitCount++;
  }
}

class TriggerRecorder extends Script {
  readonly enters: ColliderShape[] = [];
  readonly stays: ColliderShape[] = [];
  readonly exits: ColliderShape[] = [];

  override onTriggerEnter(other: ColliderShape): void {
    this.enters.push(other);
  }

  override onTriggerStay(other: ColliderShape): void {
    this.stays.push(other);
  }

  override onTriggerExit(other: ColliderShape): void {
    this.exits.push(other);
  }
}

/**
 * Native-runtime evidence for RFC #3194. These are prototype contracts, not the final component API.
 */
describe("Unity-style physics ownership prototype", () => {
  let engine: WebGLEngine;
  let backend: ReturnType<typeof createPhysics>;
  let physics: PhysicsScene;
  let root: Entity;

  beforeAll(async () => {
    backend = createPhysics();
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: backend });
    physics = engine.sceneManager.activeScene.physics;
  });

  beforeEach(() => {
    root = engine.sceneManager.activeScene.createRootEntity("unity-physics-prototype");
    root.transform.setPosition(0, 1000, 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    physics.setColliderLayerCollision(Layer.Layer4, Layer.Layer0, true);
    physics.setColliderLayerCollision(Layer.Layer4, Layer.Layer3, true);
    physics.setColliderLayerCollision(Layer.Layer6, Layer.Layer0, true);
    root.destroy();
    engine.resourceManager.gc();
  });

  afterAll(() => engine.destroy());

  function update(count = 1): void {
    for (let i = 0; i < count; i++) {
      (physics as any)._update(1 / 60);
    }
  }

  function nativeCollider(collider: Collider): any {
    return (collider as any)._nativeCollider;
  }

  function attachWithLayer(collider: Collider, shape: ColliderShape, layerIndex: number): void {
    const native = nativeCollider(collider);
    native.removeShape((shape as any)._nativeShape);
    expect(native.addShape((shape as any)._nativeShape, layerIndex)).toBe(true);
  }

  function reattachWithLayer(collider: Collider, shape: ColliderShape, layerIndex: number): boolean {
    const pxShape = (shape as any)._nativeShape._pxShape;
    const actor = nativeCollider(collider)._pxActor;
    actor.detachShape(pxShape, true);
    return actor.attachShapeWithLayer(pxShape, layerIndex);
  }

  function overlapping(center: Vector3, layer: Layer): ColliderShape[] {
    return physics.overlapSphereAll(center, 0.1, layer);
  }

  function setShapeGroup(shape: ColliderShape, layerIndex: number): boolean {
    return (shape as any)._nativeShape._pxShape.setGroup(layerIndex);
  }

  describe("shape-level in-place layer updates", () => {
    it("updates only the target shape for queries and the collision matrix", () => {
      const triggers = root.createChild("triggers").addComponent(StaticCollider);
      const firstTrigger = new BoxColliderShape();
      const secondTrigger = new BoxColliderShape();
      firstTrigger.isTrigger = true;
      secondTrigger.isTrigger = true;
      firstTrigger.position.x = -2;
      secondTrigger.position.x = 2;
      triggers.addShape(firstTrigger);
      triggers.addShape(secondTrigger);
      expect(setShapeGroup(secondTrigger, 3)).toBe(true);

      const firstCenter = new Vector3(-2, 1000, 0);
      const secondCenter = new Vector3(2, 1000, 0);
      expect(overlapping(firstCenter, Layer.Layer0)).toEqual([firstTrigger]);
      expect(overlapping(secondCenter, Layer.Layer0)).toEqual([]);
      expect(overlapping(secondCenter, Layer.Layer3)).toEqual([secondTrigger]);

      function addProbe(x: number): TriggerRecorder {
        const entity = root.createChild(`probe-${x}`);
        entity.transform.setPosition(x, 0, 0);
        const collider = entity.addComponent(DynamicCollider);
        collider.isKinematic = true;
        collider.collisionLayer = Layer.Layer4;
        collider.addShape(new SphereColliderShape());
        return entity.addComponent(TriggerRecorder);
      }

      const blocked = addProbe(-2);
      const allowed = addProbe(2);
      physics.setColliderLayerCollision(Layer.Layer4, Layer.Layer0, false);
      physics.setColliderLayerCollision(Layer.Layer4, Layer.Layer3, true);
      update(2);

      expect(blocked.enters).toEqual([]);
      expect(allowed.enters).toEqual([secondTrigger]);
    });

    it("keeps an active trigger pair without repeated Enter and exits when the matrix filters it", () => {
      const trigger = root.createChild("trigger").addComponent(StaticCollider);
      const triggerShape = new BoxColliderShape();
      triggerShape.isTrigger = true;
      trigger.addShape(triggerShape);

      const probe = root.createChild("probe");
      const dynamic = probe.addComponent(DynamicCollider);
      dynamic.isKinematic = true;
      dynamic.addShape(new SphereColliderShape());
      const recorder = probe.addComponent(TriggerRecorder);
      update();
      expect(recorder.enters.length).toBe(1);
      expect(recorder.enters[0]).toBe(triggerShape);

      const stayCount = recorder.stays.length;
      expect(setShapeGroup(triggerShape, 5)).toBe(true);
      update(2);
      expect(recorder.enters.length).toBe(1);
      expect(recorder.exits.length).toBe(0);
      expect(recorder.stays.length).toBe(stayCount + 2);
      expect(overlapping(new Vector3(0, 1000, 0), Layer.Layer0).includes(triggerShape)).toBe(false);
      const layer5Hits = overlapping(new Vector3(0, 1000, 0), Layer.Layer5);
      expect(layer5Hits.length).toBe(1);
      expect(layer5Hits[0]).toBe(triggerShape);

      physics.setColliderLayerCollision(Layer.Layer6, Layer.Layer0, false);
      expect(setShapeGroup(triggerShape, 6)).toBe(true);
      update(2);
      expect(recorder.enters.length).toBe(1);
      expect(recorder.exits.length).toBe(1);
      expect(recorder.exits[0]).toBe(triggerShape);
    });

    it("keeps an active collision pair without repeated Enter and exits when the matrix filters it", () => {
      const ground = root.createChild("ground").addComponent(StaticCollider);
      ground.addShape(new BoxColliderShape());
      const probe = root.createChild("contact-probe");
      probe.transform.setPosition(0, 0.75, 0);
      const dynamic = probe.addComponent(DynamicCollider);
      dynamic.useGravity = false;
      dynamic.addShape(new SphereColliderShape());
      const recorder = probe.addComponent(ContactRecorder);
      update();
      expect(recorder.enterCount).toBe(1);

      const stayCount = recorder.stayCount;
      expect(setShapeGroup(ground.shapes[0], 5)).toBe(true);
      update();
      expect(recorder.enterCount).toBe(1);
      expect(recorder.exitCount).toBe(0);
      expect(recorder.stayCount).toBeGreaterThan(stayCount);

      physics.setColliderLayerCollision(Layer.Layer6, Layer.Layer0, false);
      expect(setShapeGroup(ground.shapes[0], 6)).toBe(true);
      update();
      expect(recorder.enterCount).toBe(1);
      expect(recorder.exitCount).toBe(1);
    });

    it("rejects an out-of-range layer without changing the shape", () => {
      const collider = root.createChild("static").addComponent(StaticCollider);
      const shape = new BoxColliderShape();
      collider.addShape(shape);
      expect(setShapeGroup(shape, 32)).toBe(false);
      expect(overlapping(new Vector3(0, 1000, 0), Layer.Layer0)).toEqual([shape]);
    });
  });

  it("filters each shape independently on one actor, including layer changes", () => {
    const collider = root.createChild("compound").addComponent(StaticCollider);
    const first = new BoxColliderShape();
    const second = new BoxColliderShape();
    first.position.x = -2;
    second.position.x = 2;
    collider.addShape(first);
    collider.addShape(second);
    attachWithLayer(collider, second, 3);

    const firstCenter = new Vector3(-2, 1000, 0);
    const secondCenter = new Vector3(2, 1000, 0);
    expect(overlapping(firstCenter, Layer.Layer0)).toEqual([first]);
    expect(overlapping(firstCenter, Layer.Layer3)).toEqual([]);
    expect(overlapping(secondCenter, Layer.Layer0)).toEqual([]);
    expect(overlapping(secondCenter, Layer.Layer3)).toEqual([second]);

    expect(reattachWithLayer(collider, second, 4)).toBe(true);
    expect(overlapping(secondCenter, Layer.Layer3)).toEqual([]);
    expect(overlapping(secondCenter, Layer.Layer4)).toEqual([second]);
    expect(overlapping(firstCenter, Layer.Layer0)).toEqual([first]);
  });

  it("applies the collision matrix per shape rather than per actor", () => {
    const triggers = root.createChild("triggers").addComponent(StaticCollider);
    const firstTrigger = new BoxColliderShape();
    const secondTrigger = new BoxColliderShape();
    firstTrigger.isTrigger = true;
    secondTrigger.isTrigger = true;
    firstTrigger.position.x = -2;
    secondTrigger.position.x = 2;
    triggers.addShape(firstTrigger);
    triggers.addShape(secondTrigger);
    attachWithLayer(triggers, secondTrigger, 3);

    function addProbe(x: number): TriggerRecorder {
      const entity = root.createChild(`probe-${x}`);
      entity.transform.setPosition(x, 0, 0);
      const collider = entity.addComponent(DynamicCollider);
      collider.isKinematic = true;
      collider.collisionLayer = Layer.Layer4;
      collider.addShape(new SphereColliderShape());
      return entity.addComponent(TriggerRecorder);
    }

    const blocked = addProbe(-2);
    const allowed = addProbe(2);
    physics.setColliderLayerCollision(Layer.Layer4, Layer.Layer0, false);
    physics.setColliderLayerCollision(Layer.Layer4, Layer.Layer3, true);
    update(2);

    expect(blocked.enters).toEqual([]);
    expect(allowed.enters).toEqual([secondTrigger]);
  });

  it("keeps the actor-level setGroup binding actor-only", () => {
    const collider = root.createChild("static").addComponent(StaticCollider);
    const shape = new BoxColliderShape();
    collider.addShape(shape);
    const pxShape = (shape as any)._nativeShape._pxShape;
    expect(() => backend._physX.setGroup(pxShape, 3)).toThrow(/PxActor/);
  });

  it("documents duplicate trigger Enter after reattaching a shape with another layer", () => {
    const trigger = root.createChild("trigger").addComponent(StaticCollider);
    const triggerShape = new BoxColliderShape();
    triggerShape.isTrigger = true;
    trigger.addShape(triggerShape);

    const probe = root.createChild("probe");
    const dynamic = probe.addComponent(DynamicCollider);
    dynamic.isKinematic = true;
    dynamic.addShape(new SphereColliderShape());
    const recorder = probe.addComponent(TriggerRecorder);
    update();
    expect(recorder.enters).toEqual([triggerShape]);

    const stayCount = recorder.stays.length;
    expect(reattachWithLayer(trigger, triggerShape, 5)).toBe(true);
    update();
    expect(recorder.enters).toHaveLength(2);
    expect(recorder.exits).toEqual([]);
    expect(recorder.stays.length).toBeGreaterThan(stayCount);
    expect(overlapping(new Vector3(0, 1000, 0), Layer.Layer5)).toEqual([triggerShape]);
  });

  it("documents duplicate collision Enter after reattaching a shape with another layer", () => {
    const ground = root.createChild("ground").addComponent(StaticCollider);
    ground.addShape(new BoxColliderShape());
    const probe = root.createChild("contact-probe");
    probe.transform.setPosition(0, 0.75, 0);
    const dynamic = probe.addComponent(DynamicCollider);
    dynamic.useGravity = false;
    dynamic.addShape(new SphereColliderShape());
    const recorder = probe.addComponent(ContactRecorder);
    update();
    expect(recorder.enterCount).toBe(1);

    expect(reattachWithLayer(ground, ground.shapes[0], 5)).toBe(true);
    update();
    expect(recorder.enterCount).toBe(2);
    expect(recorder.exitCount).toBe(0);
  });

  it("can restore the source actor when a native shape transfer is rejected", () => {
    const source = root.createChild("source").addComponent(StaticCollider);
    const target = root.createChild("target").addComponent(StaticCollider);
    target.entity.transform.setPosition(100, 0, 0);
    const shape = new BoxColliderShape();
    source.addShape(shape);

    const sourceActor = nativeCollider(source)._pxActor;
    const targetActor = nativeCollider(target)._pxActor;
    const pxShape = (shape as any)._nativeShape._pxShape;
    vi.spyOn(targetActor, "attachShapeWithLayer").mockReturnValueOnce(false);

    sourceActor.detachShape(pxShape, true);
    expect(targetActor.attachShapeWithLayer(pxShape, 4)).toBe(false);
    expect(sourceActor.attachShapeWithLayer(pxShape, 0)).toBe(true);

    expect(shape.collider).toBe(source);
    expect(source.shapes).toEqual([shape]);
    expect(target.shapes).toEqual([]);
    expect(overlapping(new Vector3(0, 1000, 0), Layer.Layer0)).toEqual([shape]);
    expect(overlapping(new Vector3(100, 1000, 0), Layer.Layer0)).toEqual([]);
  });

  it("round-trips hierarchical TRS and detects shear that Matrix.decompose accepts", () => {
    const body = root.createChild("body");
    const child = body.createChild("collider");
    body.transform.setPosition(10, 20, 30);
    body.transform.setRotation(15, 35, -10);
    body.transform.setScale(2, 2, 2);
    child.transform.setPosition(1, 2, 3);
    child.transform.setRotation(-5, 20, 10);
    child.transform.setScale(1.5, 1.5, 1.5);

    const inverseBody = new Matrix();
    const relative = new Matrix();
    expect(Matrix.invert(body.transform.worldMatrix, inverseBody)).not.toBeNull();
    Matrix.multiply(inverseBody, child.transform.worldMatrix, relative);
    const translation = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    expect(relative.decompose(translation, rotation, scale)).toBe(true);
    expect(translation.x).toBeCloseTo(1);
    expect(translation.y).toBeCloseTo(2);
    expect(translation.z).toBeCloseTo(3);
    expect(scale.x).toBeCloseTo(1.5);
    expect(scale.y).toBeCloseTo(1.5);
    expect(scale.z).toBeCloseTo(1.5);

    const recomposed = new Matrix();
    Matrix.affineTransformation(scale, rotation, translation, recomposed);
    recomposed.elements.forEach((value, index) => expect(value).toBeCloseTo(relative.elements[index]));

    child.transform.setScale(2, 1, 3);
    child.transform.setRotation(15, -25, 35);
    const leaf = child.createChild("leaf");
    leaf.transform.setRotation(10, 20, 30);
    expect(Matrix.invert(body.transform.worldMatrix, inverseBody)).not.toBeNull();
    Matrix.multiply(inverseBody, leaf.transform.worldMatrix, relative);
    const elements = relative.elements;
    const xyShear = Math.abs(
      (elements[0] * elements[4] + elements[1] * elements[5] + elements[2] * elements[6]) /
        (Math.hypot(elements[0], elements[1], elements[2]) * Math.hypot(elements[4], elements[5], elements[6]))
    );
    expect(xyShear).toBeGreaterThan(1e-4);
    expect(relative.decompose(translation, rotation, scale)).toBe(true);
    Matrix.affineTransformation(scale, rotation, translation, recomposed);
    const error = Math.max(...recomposed.elements.map((value, index) => Math.abs(value - relative.elements[index])));
    expect(error).toBeGreaterThan(1e-4);
  });

  it("synchronizes cloned colliders to their final non-origin transforms", () => {
    const source = root.createChild("source");
    const collider = source.addComponent(StaticCollider);
    collider.addShape(new BoxColliderShape());
    source.transform.setPosition(4, 2, 3);

    const clone = source.clone();
    root.addChild(clone);
    update();
    expect(new Set(overlapping(new Vector3(4, 1002, 3), Layer.Layer0))).toEqual(
      new Set([collider.shapes[0], clone.getComponent(StaticCollider).shapes[0]])
    );
    expect(overlapping(new Vector3(0, 1000, 0), Layer.Layer0)).toEqual([]);
  });
});
