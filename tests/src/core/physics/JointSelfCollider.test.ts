import {
  BoxColliderShape,
  CharacterController,
  Collider,
  DynamicCollider,
  Engine,
  Entity,
  FixedJoint,
  HingeJoint,
  SpringJoint,
  StaticCollider
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Vector3 } from "@galacean/engine-math";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { afterEach, describe, expect, it } from "vitest";

type JointConstructor = typeof FixedJoint | typeof HingeJoint | typeof SpringJoint;
type ColliderOrder = "bare" | "dynamic-first" | "static-first" | "controller-first";

const jointConstructors: JointConstructor[] = [FixedJoint, HingeJoint, SpringJoint];
const physXPhysics = new PhysXPhysics();

describe("Joint self collider binding", function () {
  const engines: Engine[] = [];

  afterEach(function () {
    let engine: Engine;
    while ((engine = engines.pop())) {
      engine.destroy();
    }
  });

  async function createEngine(): Promise<Engine> {
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      physics: physXPhysics
    });
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, -9.81, 0);
    engines.push(engine);
    return engine;
  }

  function addBoxShape(collider: Collider, offsetY = 0): void {
    const shape = new BoxColliderShape();
    shape.size = new Vector3(1, 1, 1);
    if (offsetY !== 0) {
      shape.position = new Vector3(0, offsetY, 0);
    }
    collider.addShape(shape);
  }

  function setupEntity(
    root: Entity,
    order: ColliderOrder,
    JointType: JointConstructor,
    index: number
  ): { entity: Entity; joint: FixedJoint | HingeJoint | SpringJoint; dynamicCollider: DynamicCollider } {
    const entity = root.createChild(`${order}-${JointType.name}`);
    entity.transform.setPosition(index * 3, 5, 0);

    if (order === "static-first") {
      addBoxShape(entity.addComponent(StaticCollider), 10);
    } else if (order === "controller-first") {
      addBoxShape(entity.addComponent(CharacterController), 10);
    } else if (order === "dynamic-first") {
      addBoxShape(entity.addComponent(DynamicCollider));
      addBoxShape(entity.addComponent(StaticCollider), 10);
    }

    // Adding the joint must not pick a static collider or character controller that was added earlier.
    const joint = entity.addComponent(JointType);
    const dynamicCollider = entity.getComponent(DynamicCollider);
    expect(dynamicCollider).not.toBeNull();
    addBoxShape(dynamicCollider!);

    return { entity, joint, dynamicCollider: dynamicCollider! };
  }

  function expectNativeJointBoundToDynamic(
    joint: FixedJoint | HingeJoint | SpringJoint,
    dynamicCollider: DynamicCollider
  ): void {
    // @ts-ignore
    const nativeJoint = joint._nativeJoint;
    // Avoid deep object diffs here: serializing native PhysX wrappers invokes wasm getters.
    // @ts-ignore
    expect(joint._colliderInfo.collider === dynamicCollider).toBe(true);
    expect(nativeJoint).not.toBeNull();
    // @ts-ignore
    expect(nativeJoint._collider === dynamicCollider._nativeCollider).toBe(true);
    // @ts-ignore
    expect(nativeJoint._pxJoint).toBeTruthy();
  }

  function simulate(engine: Engine, stepCount: number): void {
    for (let i = 0; i < stepCount; i++) {
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1 / 60);
    }
  }

  for (const order of ["bare", "dynamic-first", "static-first", "controller-first"] as ColliderOrder[]) {
    for (const JointType of jointConstructors) {
      it(`${order} -> ${JointType.name}`, async function () {
        const engine = await createEngine();
        const root = engine.sceneManager.activeScene.createRootEntity("root");
        const { entity, joint, dynamicCollider } = setupEntity(root, order, JointType, 0);

        expectNativeJointBoundToDynamic(joint, dynamicCollider);
        expect(() => simulate(engine, 10)).not.toThrow();

        if (JointType === FixedJoint) {
          expect(entity.transform.position.y).toBeGreaterThan(4.9);
        }
      });
    }
  }

  it("keeps a static collider as connectedCollider", async function () {
    const engine = await createEngine();
    const root = engine.sceneManager.activeScene.createRootEntity("root");

    const selfEntity = root.createChild("self");
    selfEntity.transform.setPosition(0, 5, 0);
    const selfCollider = selfEntity.addComponent(DynamicCollider);
    addBoxShape(selfCollider);

    const peerEntity = root.createChild("peer");
    const peerCollider = peerEntity.addComponent(StaticCollider);
    addBoxShape(peerCollider);

    const joint = selfEntity.addComponent(FixedJoint);
    expect(() => (joint.connectedCollider = peerCollider)).not.toThrow();
    expect(joint.connectedCollider === peerCollider).toBe(true);
    expectNativeJointBoundToDynamic(joint, selfCollider);
    expect(() => simulate(engine, 10)).not.toThrow();
  });
});
