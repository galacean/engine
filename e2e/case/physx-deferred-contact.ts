/**
 * @title PhysX Deferred Contact
 * @category Physics
 */
import {
  WebGLEngine,
  DynamicCollider,
  BoxColliderShape,
  Vector3,
  MeshRenderer,
  PrimitiveMesh,
  Camera,
  Script,
  PBRMaterial,
  Entity
} from "@galacean/engine";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({ canvas: "canvas", physics: new PhysXPhysics() }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  // Zero gravity so boxes only move via applied force
  scene.physics.gravity = new Vector3(0, 0, 0);

  // Camera
  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0, 20);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

  function addBox(pos: Vector3, color: Vector3): Entity {
    const entity = rootEntity.createChild("Box");
    entity.transform.setPosition(pos.x, pos.y, pos.z);

    const mtl = new PBRMaterial(engine);
    mtl.baseColor.set(color.x, color.y, color.z, 1.0);
    mtl.metallic = 0.0;
    mtl.roughness = 0.5;
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
    renderer.setMaterial(mtl);

    const shape = new BoxColliderShape();
    shape.size = new Vector3(2, 2, 2);
    shape.material.dynamicFriction = 0;
    shape.material.staticFriction = 0;
    const collider = entity.addComponent(DynamicCollider);
    collider.addShape(shape);

    return entity;
  }

  // Red box on the left, will be launched to the right
  const box1 = addBox(new Vector3(-6, 0, 0), new Vector3(1, 0, 0));
  // Blue box in the center, stationary target
  const box2 = addBox(new Vector3(0, 0, 0), new Vector3(0, 0, 1));

  // The spawn position for the merged box — clearly offset so we can visually verify
  const spawnPos = new Vector3(5, 3, 0);

  // On collision: destroy both, create a new green box at spawnPos.
  // Before the fix, the new box's position would be overwritten by _callColliderOnLateUpdate.
  box1.addComponent(
    class extends Script {
      onCollisionEnter(): void {
        box1.destroy();
        box2.destroy();
        addBox(spawnPos, new Vector3(0, 1, 0));
      }
    }
  );

  // Launch box1 toward box2
  box1.getComponent(DynamicCollider).applyForce(new Vector3(2000, 0, 0));

  // Run enough frames for collision + new box to be visible at correct position
  updateForE2E(engine, 50, 20);
  initScreenshot(engine, camera);
});
