import {
  Entity,
  BoxColliderShape,
  CapsuleColliderShape,
  ColliderShapeUpAxis,
  PlaneColliderShape,
  SphereColliderShape,
  DynamicCollider,
  PhysicsMaterial
} from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { expect } from "chai";

describe("ColliderShape", () => {
  let dynamicCollider: DynamicCollider;

  before(async () => {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });
    engine.run();

    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity("root");

    const roleEntity = root.createChild("role");
    dynamicCollider = roleEntity.addComponent(DynamicCollider);
  });

  beforeEach(() => {
    dynamicCollider.clearShapes();
  });

  it("BoxColliderShape", () => {
    const boxShape = new BoxColliderShape();
    dynamicCollider.addShape(boxShape);

    // Test that set size works correctly.
    boxShape.size = new Vector3(1, 2, 3);
    expect(boxShape.size).to.deep.include({ x: 1, y: 2, z: 3 });

    // Test that set trigger works correctly.
    boxShape.isTrigger = true;
    expect(boxShape.isTrigger).to.eq(true);

    // Test that set contactOffset works correctly.
    let contactOffset = boxShape.contactOffset;
    boxShape.contactOffset = contactOffset;
    expect(boxShape.contactOffset).to.eq(contactOffset);

    contactOffset = -2.4;
    boxShape.contactOffset = contactOffset;
    expect(boxShape.contactOffset).to.eq(contactOffset);

    contactOffset = 0;
    boxShape.contactOffset = contactOffset;
    expect(boxShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.7;
    boxShape.contactOffset = contactOffset;
    expect(boxShape.contactOffset).to.eq(contactOffset);

    // Test that set material works correctly.
    // const material = new PhysicsMaterial();
    // boxShape.material = material;
    // expect(boxShape.material).to.eq(material);

    // boxShape.material = null;
    // expect(boxShape.material).to.eq(null);

    // Test that set position works correctly.
    boxShape.position = new Vector3(1, 2, -1);
    expect(boxShape.position).to.deep.include({ x: 1, y: 2, z: -1 });

    // Test that set rotation works correctly.
    boxShape.rotation = new Vector3(40, -182, 720);
    expect(boxShape.rotation).to.deep.include({ x: 40, y: -182, z: 720 });
  });

  it("CapsuleColliderShape", () => {
    const capsuleShape = new CapsuleColliderShape();
    dynamicCollider.addShape(capsuleShape);

    // Test that set radius works correctly.
    let radius = capsuleShape.radius;
    expect(capsuleShape.radius).to.eq(radius);

    radius *= 0.5;
    capsuleShape.radius = radius;
    expect(capsuleShape.radius).to.eq(radius);

    radius *= 4;
    capsuleShape.radius = radius;
    expect(capsuleShape.radius).to.eq(radius);

    // Test that set height works correctly.
    let height = capsuleShape.height;
    expect(capsuleShape.height).to.eq(height);

    height *= 0.5;
    capsuleShape.height = height;
    expect(capsuleShape.height).to.eq(height);

    height *= 4;
    capsuleShape.height = height;
    expect(capsuleShape.height).to.eq(height);

    // Test that set upAxis works correctly.
    const upAxis = capsuleShape.upAxis;
    expect(capsuleShape.upAxis).to.eq(upAxis);

    capsuleShape.upAxis = ColliderShapeUpAxis.X;
    expect(capsuleShape.upAxis).to.eq(ColliderShapeUpAxis.X);

    capsuleShape.upAxis = ColliderShapeUpAxis.Y;
    expect(capsuleShape.upAxis).to.eq(ColliderShapeUpAxis.Y);

    capsuleShape.upAxis = ColliderShapeUpAxis.Z;
    expect(capsuleShape.upAxis).to.eq(ColliderShapeUpAxis.Z);

    // Test that set trigger works correctly.
    capsuleShape.isTrigger = true;
    expect(capsuleShape.isTrigger).to.eq(true);

    // Test that set contactOffset works correctly.
    let contactOffset = capsuleShape.contactOffset;
    capsuleShape.contactOffset = contactOffset;
    expect(capsuleShape.contactOffset).to.eq(contactOffset);

    contactOffset = -2.4;
    capsuleShape.contactOffset = contactOffset;
    expect(capsuleShape.contactOffset).to.eq(contactOffset);

    contactOffset = 0;
    capsuleShape.contactOffset = contactOffset;
    expect(capsuleShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.7;
    capsuleShape.contactOffset = contactOffset;
    expect(capsuleShape.contactOffset).to.eq(contactOffset);

    // Test that set material works correctly.
    // const material = new PhysicsMaterial();
    // capsuleShape.material = material;
    // expect(capsuleShape.material).to.eq(material);

    // capsuleShape.material = null;
    // expect(capsuleShape.material).to.eq(null);

    // Test that set position works correctly.
    capsuleShape.position = new Vector3(1, 2, -1);
    expect(capsuleShape.position).to.deep.include({ x: 1, y: 2, z: -1 });

    // Test that set rotation works correctly.
    capsuleShape.rotation = new Vector3(40, -182, 720);
    expect(capsuleShape.rotation).to.deep.include({ x: 40, y: -182, z: 720 });
  });

  it("PlaneColliderShape", () => {
    const planeShape = new PlaneColliderShape();
    dynamicCollider.addShape(planeShape);

    // Test that set trigger works correctly.
    planeShape.isTrigger = true;
    expect(planeShape.isTrigger).to.eq(true);

    // Test that set contactOffset works correctly.
    let contactOffset = planeShape.contactOffset;
    planeShape.contactOffset = contactOffset;
    expect(planeShape.contactOffset).to.eq(contactOffset);

    contactOffset = -2.4;
    planeShape.contactOffset = contactOffset;
    expect(planeShape.contactOffset).to.eq(contactOffset);

    contactOffset = 0;
    planeShape.contactOffset = contactOffset;
    expect(planeShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.7;
    planeShape.contactOffset = contactOffset;
    expect(planeShape.contactOffset).to.eq(contactOffset);

    // Test that set material works correctly.
    // const material = new PhysicsMaterial();
    // planeShape.material = material;
    // expect(planeShape.material).to.eq(material);

    // planeShape.material = null;
    // expect(planeShape.material).to.eq(null);

    // Test that set position works correctly.
    planeShape.position = new Vector3(1, 2, -1);
    expect(planeShape.position).to.deep.include({ x: 1, y: 2, z: -1 });

    // Test that set rotation works correctly.
    planeShape.rotation = new Vector3(40, -182, 720);
    expect(planeShape.rotation).to.deep.include({ x: 40, y: -182, z: 720 });
  });

  it("SphereColliderShape", () => {
    const sphereShape = new SphereColliderShape();
    dynamicCollider.addShape(sphereShape);

    // Test that set radius works correctly.
    let radius = sphereShape.radius;
    expect(sphereShape.radius).to.eq(radius);

    radius *= 0.5;
    sphereShape.radius = radius;
    expect(sphereShape.radius).to.eq(radius);

    radius *= 4;
    sphereShape.radius = radius;
    expect(sphereShape.radius).to.eq(radius);

    // Test that set trigger works correctly.
    sphereShape.isTrigger = true;
    expect(sphereShape.isTrigger).to.eq(true);

    // Test that set contactOffset works correctly.
    let contactOffset = sphereShape.contactOffset;
    sphereShape.contactOffset = contactOffset;
    expect(sphereShape.contactOffset).to.eq(contactOffset);

    contactOffset = -2.4;
    sphereShape.contactOffset = contactOffset;
    expect(sphereShape.contactOffset).to.eq(contactOffset);

    contactOffset = 0;
    sphereShape.contactOffset = contactOffset;
    expect(sphereShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.7;
    sphereShape.contactOffset = contactOffset;
    expect(sphereShape.contactOffset).to.eq(contactOffset);

    // Test that set material works correctly.
    // const material = new PhysicsMaterial();
    // sphereShape.material = material;
    // expect(sphereShape.material).to.eq(material);

    // sphereShape.material = null;
    // expect(sphereShape.material).to.eq(null);

    // Test that set position works correctly.
    sphereShape.position = new Vector3(1, 2, -1);
    expect(sphereShape.position).to.deep.include({ x: 1, y: 2, z: -1 });

    // Test that set rotation works correctly.
    sphereShape.rotation = new Vector3(40, -182, 720);
    expect(sphereShape.rotation).to.deep.include({ x: 40, y: -182, z: 720 });
  });
});
