/**
 * @title PhysX Compound Rigidbody
 * @category Physics
 */
import {
  BoxCollider,
  Camera,
  CapsuleCollider,
  DirectLight,
  Engine,
  Entity,
  MeshRenderer,
  PBRMaterial,
  PlaneCollider,
  PrimitiveMesh,
  Rigidbody,
  RigidbodyConstraints,
  SphereCollider,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { PhysXPhysics, PhysXRuntimeMode } from "@galacean/engine-physics-physx";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

declare global {
  interface Window {
    compoundRigidbodyResult: {
      cartX: number;
      cartY: number;
      attachedWheels: number;
      queryableWheels: number;
      freeBoxRotation: number;
      frozenBoxRotation: number;
      frozenBoxX: number;
    };
  }
}

function createMaterial(engine: Engine, r: number, g: number, b: number): PBRMaterial {
  const mtl = new PBRMaterial(engine);
  mtl.baseColor.set(r, g, b, 1.0);
  mtl.metallic = 0.1;
  mtl.roughness = 0.5;
  return mtl;
}

function addVisualBox(entity: Entity, size: Vector3, r: number, g: number, b: number): void {
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(entity.engine, size.x, size.y, size.z);
  renderer.setMaterial(createMaterial(entity.engine, r, g, b));
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
  camEnt.transform.setPosition(0, 8, 18);
  camEnt.transform.lookAt(new Vector3(0, 1.2, 0));

  const lightEnt = root.createChild("dir-light");
  lightEnt.transform.setRotation(-45, 30, 0);
  lightEnt.addComponent(DirectLight);

  // Ground PlaneCollider + visual floor
  const ground = root.createChild("ground");
  ground.addComponent(PlaneCollider);
  const floorVis = root.createChild("floor-visual");
  floorVis.transform.setPosition(0, -0.05, 0);
  addVisualBox(floorVis, new Vector3(28, 0.1, 12), 0.25, 0.28, 0.32);

  // Left ramp for compound cart
  const leftRamp = root.createChild("left-ramp");
  leftRamp.transform.setPosition(-5, 1.3, 0);
  leftRamp.transform.setRotation(0, 0, -20);
  const rampSize = new Vector3(8, 0.25, 3.2);
  addVisualBox(leftRamp, rampSize, 0.72, 0.25, 0.22);
  const leftRampCol = leftRamp.addComponent(BoxCollider);
  leftRampCol.size = rampSize;
  leftRampCol.getInstanceMaterial().dynamicFriction = 0.05;
  leftRampCol.getInstanceMaterial().staticFriction = 0.05;

  // Compound Cart: Rigidbody on parent, child Colliders only (Box + Sphere + Capsule)
  const cart = root.createChild("compound-cart");
  cart.transform.setPosition(-7.2, 3.1, 0);
  const cartRb = cart.addComponent(Rigidbody);
  cartRb.mass = 4;

  const chassis = cart.createChild("chassis");
  chassis.transform.setPosition(0, 0.25, 0);
  addVisualBox(chassis, new Vector3(1.4, 0.45, 1.0), 0.2, 0.55, 0.95);
  const chassisCol = chassis.addComponent(BoxCollider);
  chassisCol.size = new Vector3(1.4, 0.45, 1.0);

  const addWheel = (name: string, x: number): SphereCollider => {
    const w = cart.createChild(name);
    w.transform.setPosition(x, -0.15, 0);
    const mr = w.addComponent(MeshRenderer);
    mr.mesh = PrimitiveMesh.createSphere(engine, 0.35);
    mr.setMaterial(createMaterial(engine, 0.95, 0.8, 0.15));
    const sc = w.addComponent(SphereCollider);
    sc.radius = 0.35;
    sc.getInstanceMaterial().dynamicFriction = 0.05;
    sc.getInstanceMaterial().staticFriction = 0.05;
    return sc;
  };
  const wheels = [addWheel("front-wheel", 0.55), addWheel("rear-wheel", -0.55)];

  const bumper = cart.createChild("bumper");
  bumper.transform.setPosition(0.85, 0.15, 0);
  bumper.transform.setRotation(90, 0, 0);
  const bumperMr = bumper.addComponent(MeshRenderer);
  bumperMr.mesh = PrimitiveMesh.createCapsule(engine, 0.16, 0.6);
  bumperMr.setMaterial(createMaterial(engine, 0.95, 0.45, 0.1));
  const bumperCol = bumper.addComponent(CapsuleCollider);
  bumperCol.radius = 0.16;
  bumperCol.height = 0.6;

  // Static Capsule obstacle near center
  const blocker = root.createChild("capsule-blocker");
  blocker.transform.setPosition(1.8, 0.45, 0);
  blocker.transform.setRotation(90, 0, 0);
  const blockerMr = blocker.addComponent(MeshRenderer);
  blockerMr.mesh = PrimitiveMesh.createCapsule(engine, 0.4, 1.8);
  blockerMr.setMaterial(createMaterial(engine, 0.8, 0.3, 0.7));
  const blockerCol = blocker.addComponent(CapsuleCollider);
  blockerCol.radius = 0.4;
  blockerCol.height = 1.8;

  // Right ramp comparing free rotation vs FreezeRotation
  const rightRamp = root.createChild("right-ramp");
  rightRamp.transform.setPosition(6.5, 1.4, -1.0);
  rightRamp.transform.setRotation(0, 0, -24);
  const rSize = new Vector3(7, 0.25, 4.4);
  addVisualBox(rightRamp, rSize, 0.45, 0.45, 0.5);
  const rightRampCol = rightRamp.addComponent(BoxCollider);
  rightRampCol.size = rSize;
  rightRampCol.getInstanceMaterial().dynamicFriction = 0.05;
  rightRampCol.getInstanceMaterial().staticFriction = 0.05;

  const makeSlider = (name: string, z: number, r: number, g: number, b: number, freezeRot: boolean): Entity => {
    const ent = root.createChild(name);
    ent.transform.setPosition(4.2, 3.2, z);
    addVisualBox(ent, new Vector3(0.8, 0.8, 0.8), r, g, b);
    const col = ent.addComponent(BoxCollider);
    col.size = new Vector3(0.8, 0.8, 0.8);
    col.getInstanceMaterial().dynamicFriction = 0.05;
    col.getInstanceMaterial().staticFriction = 0.05;
    const rb = ent.addComponent(Rigidbody);
    if (freezeRot) {
      rb.constraints =
        RigidbodyConstraints.FreezeRotationX |
        RigidbodyConstraints.FreezeRotationY |
        RigidbodyConstraints.FreezeRotationZ;
    }
    return ent;
  };

  const freeBox = makeSlider("free-box", -2.0, 0.95, 0.85, 0.2, false);
  const frozenBox = makeSlider("frozen-rot-box", 0.0, 0.15, 0.85, 0.85, true);

  updateForE2E(engine, 50, 45);

  window.compoundRigidbodyResult = {
    cartX: cart.transform.worldPosition.x,
    cartY: cart.transform.worldPosition.y,
    attachedWheels: wheels.filter((wheel) => wheel.attachedRigidbody === cartRb).length,
    queryableWheels: wheels.filter((wheel) =>
      scene.physics.overlapSphereAll(wheel.entity.transform.worldPosition, 0.05).includes(wheel)
    ).length,
    freeBoxRotation: freeBox.transform.rotation.length(),
    frozenBoxRotation: frozenBox.transform.rotation.length(),
    frozenBoxX: frozenBox.transform.worldPosition.x
  };

  initScreenshot(engine, camera);
});
