/**
 * @title PhysX Character Controller
 * @category Physics
 */
import {
  BoxCollider,
  Camera,
  CharacterController,
  CharacterControllerGeometry,
  ControllerCollisionFlag,
  ControllerNonWalkableMode,
  DirectLight,
  MeshRenderer,
  PBRMaterial,
  PlaneCollider,
  PrimitiveMesh,
  Script,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { PhysXPhysics, PhysXRuntimeMode } from "@galacean/engine-physics-physx";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

declare global {
  interface Window {
    characterControllerResult: {
      stairX: number;
      stairY: number;
      blockedX: number;
      hitBarrier: boolean;
      walkableSlopeY: number;
      steepSlopeX: number;
      steepSlopeY: number;
    };
  }
}

const physics = new PhysXPhysics(PhysXRuntimeMode.Auto, {
  wasmSIMDModeUrl: "../physx.release.simd.js",
  wasmModeUrl: "../physx.release.js"
});

WebGLEngine.create({ canvas: "canvas", physics }).then((engine) => {
  const scene = engine.sceneManager.activeScene;
  const root = scene.createRootEntity("root");
  scene.ambientLight.diffuseSolidColor.set(0.4, 0.42, 0.48, 1.0);

  const camEnt = root.createChild("camera");
  const camera = camEnt.addComponent(Camera);
  camEnt.transform.setPosition(-6.5, 11, 17);
  camEnt.transform.lookAt(new Vector3(-0.2, 1.2, 1.5));

  const lightEnt = root.createChild("dir-light");
  lightEnt.transform.setRotation(-45, 30, 0);
  lightEnt.addComponent(DirectLight);

  const makeMtl = (r: number, g: number, b: number) => {
    const m = new PBRMaterial(engine);
    m.baseColor.set(r, g, b, 1.0);
    m.roughness = 0.5;
    m.metallic = 0.08;
    return m;
  };

  const makeStaticBox = (name: string, pos: Vector3, size: Vector3, rotZ: number, r: number, g: number, b: number) => {
    const ent = root.createChild(name);
    ent.transform.position = pos;
    ent.transform.setRotation(0, 0, rotZ);
    const mr = ent.addComponent(MeshRenderer);
    mr.mesh = PrimitiveMesh.createCuboid(engine, size.x, size.y, size.z);
    mr.setMaterial(makeMtl(r, g, b));
    const col = ent.addComponent(BoxCollider);
    col.size = size;
    return ent;
  };

  // Floor
  const floor = root.createChild("floor");
  floor.addComponent(PlaneCollider);
  const floorVis = root.createChild("floor-vis");
  floorVis.transform.setPosition(0, -0.05, 1.5);
  const fvMr = floorVis.addComponent(MeshRenderer);
  fvMr.mesh = PrimitiveMesh.createCuboid(engine, 28, 0.1, 16);
  fvMr.setMaterial(makeMtl(0.24, 0.27, 0.32));

  // Track 1 (z = -3): Stairs + Box CharacterController (stepOffset = 0.55)
  makeStaticBox("stair-1", new Vector3(-2.0, 0.175, -3), new Vector3(1.5, 0.35, 1.8), 0, 0.45, 0.5, 0.55);
  makeStaticBox("stair-2", new Vector3(-0.5, 0.35, -3), new Vector3(1.5, 0.7, 1.8), 0, 0.45, 0.5, 0.55);
  makeStaticBox("stair-3", new Vector3(2.25, 0.525, -3), new Vector3(4.0, 1.05, 1.8), 0, 0.45, 0.5, 0.55);

  const stairRole = root.createChild("cc-stairs");
  stairRole.transform.setPosition(-5.0, 0.65, -3);
  const srMr = stairRole.addComponent(MeshRenderer);
  srMr.mesh = PrimitiveMesh.createCuboid(engine, 0.7, 1.2, 0.7);
  srMr.setMaterial(makeMtl(0.2, 0.85, 0.35));
  const stairCC = stairRole.addComponent(CharacterController);
  stairCC.geometry = CharacterControllerGeometry.Box;
  stairCC.size = new Vector3(0.7, 1.2, 0.7);
  stairCC.stepOffset = 0.55;

  // Track 2 (z = 0): High barrier blocked by low stepOffset = 0.08
  makeStaticBox("barrier", new Vector3(-1.0, 0.25, 0), new Vector3(1.2, 0.5, 1.8), 0, 0.88, 0.22, 0.22);

  const blockedRole = root.createChild("cc-blocked");
  blockedRole.transform.setPosition(-5.0, 0.75, 0);
  const brMr = blockedRole.addComponent(MeshRenderer);
  brMr.mesh = PrimitiveMesh.createCapsule(engine, 0.35, 0.7);
  brMr.setMaterial(makeMtl(0.95, 0.55, 0.15));
  const blockedCC = blockedRole.addComponent(CharacterController);
  blockedCC.geometry = CharacterControllerGeometry.Capsule;
  blockedCC.radius = 0.35;
  blockedCC.height = 0.7;
  blockedCC.stepOffset = 0.08;

  // Track 3 (z = 3): Walkable 35 deg ramp (slopeLimit = 45)
  makeStaticBox("ramp-35", new Vector3(0.2, 1.9, 3), new Vector3(7.0, 0.3, 1.8), 35, 0.25, 0.45, 0.78);

  const climbRole = root.createChild("cc-slope-ok");
  climbRole.transform.setPosition(-4.8, 0.75, 3);
  const crMr = climbRole.addComponent(MeshRenderer);
  crMr.mesh = PrimitiveMesh.createCapsule(engine, 0.35, 0.7);
  crMr.setMaterial(makeMtl(0.2, 0.75, 0.98));
  const climbCC = climbRole.addComponent(CharacterController);
  climbCC.geometry = CharacterControllerGeometry.Capsule;
  climbCC.radius = 0.35;
  climbCC.height = 0.7;
  climbCC.slopeLimit = 45;
  climbCC.stepOffset = 0.35;

  // Track 4 (z = 6): Unwalkable 60 deg steep ramp (slopeLimit = 45, ForceSliding)
  makeStaticBox("ramp-60", new Vector3(0.5, 2.3, 6), new Vector3(6.0, 0.3, 1.8), 60, 0.65, 0.25, 0.75);

  const steepRole = root.createChild("cc-slope-steep");
  steepRole.transform.setPosition(-4.8, 0.75, 6);
  const trMr = steepRole.addComponent(MeshRenderer);
  trMr.mesh = PrimitiveMesh.createCapsule(engine, 0.35, 0.7);
  trMr.setMaterial(makeMtl(0.85, 0.3, 0.92));
  const steepCC = steepRole.addComponent(CharacterController);
  steepCC.geometry = CharacterControllerGeometry.Capsule;
  steepCC.radius = 0.35;
  steepCC.height = 0.7;
  steepCC.slopeLimit = 45;
  steepCC.stepOffset = 0.1;
  steepCC.nonWalkableMode = ControllerNonWalkableMode.PreventClimbingAndForceSliding;

  const displacement = new Vector3(0.045, -0.15, 0);
  let hitBarrier = false;
  root.addComponent(
    class extends Script {
      override onPhysicsUpdate(): void {
        stairCC.move(displacement, 0.0001, 1 / 60);
        const flags = blockedCC.move(displacement, 0.0001, 1 / 60);
        hitBarrier ||= (flags & ControllerCollisionFlag.Sides) !== 0;
        climbCC.move(displacement, 0.0001, 1 / 60);
        steepCC.move(displacement, 0.0001, 1 / 60);
      }
    }
  );

  updateForE2E(engine, 50, 45);

  window.characterControllerResult = {
    stairX: stairRole.transform.worldPosition.x,
    stairY: stairRole.transform.worldPosition.y,
    blockedX: blockedRole.transform.worldPosition.x,
    hitBarrier,
    walkableSlopeY: climbRole.transform.worldPosition.y,
    steepSlopeX: steepRole.transform.worldPosition.x,
    steepSlopeY: steepRole.transform.worldPosition.y
  };

  initScreenshot(engine, camera);
});
