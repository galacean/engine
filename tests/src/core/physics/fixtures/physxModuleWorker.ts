import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXPhysics, type PhysXRuntimeMode } from "@galacean/engine-physics-physx";

self.onmessage = async ({ data: mode }: MessageEvent<PhysXRuntimeMode>) => {
  try {
    const physics = new PhysXPhysics(mode);
    await physics.initialize();
    const scene = physics.createPhysicsScene();
    const before = scene.getColliderLayerCollision(0, 31);
    scene.setColliderLayerCollision(0, 31, false);
    const after = scene.getColliderLayerCollision(31, 0);

    const position = new Vector3(0, 5, 0);
    const rotation = new Quaternion();
    const body = physics.createDynamicCollider(position, rotation);
    scene.setGravity(new Vector3(0, -9.81, 0));
    scene.addCollider(body);
    scene.update(1 / 60);
    body.getWorldTransform(position, rotation);

    scene.removeCollider(body);
    body.destroy();
    scene.destroy();
    physics.destroy();
    self.postMessage({ before, after, y: position.y });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
