/**
 * @title glTF Pointer Merge
 * @category input
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*pxZZSpoiVKQAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  BoundingBox,
  BoxColliderShape,
  Camera,
  DirectLight,
  GLTFResource,
  Matrix,
  MeshRenderer,
  Script,
  StaticCollider,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { LitePhysics } from "@galacean/engine-physics-lite";

class GlTFCollider extends Script {
  onStart(): void {
    const { entity } = this;
    const renderers = entity.getComponentsIncludeChildren(MeshRenderer, []);
    const boundingBox = renderers[0].bounds.clone();
    for (let i = renderers.length - 1; i > 0; i--) {
      BoundingBox.merge(boundingBox, renderers[i].bounds, boundingBox);
    }
    const worldPosition = new Vector3();
    const worldSize = new Vector3();
    const worldMatrix = new Matrix();
    // Calculate the position and size of the collider.
    boundingBox.getCenter(worldPosition);
    Vector3.subtract(boundingBox.max, boundingBox.min, worldSize);
    // Add entity and calculate the world matrix of the collider.
    const boxEntity = entity.createChild("box");
    boxEntity.transform.worldMatrix = worldMatrix.translate(worldPosition);
    // Add collider.
    const boxCollider = boxEntity.addComponent(StaticCollider);
    const boxColliderShape = new BoxColliderShape();
    boxColliderShape.size.set(worldSize.x, worldSize.y, worldSize.z);
    boxCollider.addShape(boxColliderShape);
    // Add click script.
    boxEntity.addComponent(Script).onPointerClick = () => {
      window.alert("click glTF!");
    };
  }
}

// Create engine
WebGLEngine.create({ canvas: "canvas", physics: new LitePhysics() }).then(
  (engine) => {
    engine.canvas.resizeByClientSize();

    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity();

    const directLightNode = rootEntity.createChild("dir_light");
    directLightNode.addComponent(DirectLight);
    directLightNode.transform.setRotation(30, 0, 0);

    //Create camera
    const cameraNode = rootEntity.createChild("camera_node");
    cameraNode.transform.setPosition(0, 0, 10);
    cameraNode.addComponent(Camera);
    cameraNode.addComponent(OrbitControl);

    engine.resourceManager
      .load<GLTFResource>(
        "https://gw.alipayobjects.com/os/bmw-prod/48a1e8b3-06b4-4269-807d-79274e58283a.glb"
      )
      .then((glTF) => {
        const glTFRoot = glTF.defaultSceneRoot;
        glTFRoot.transform.setScale(0.005, 0.005, 0.005);
        glTFRoot.addComponent(GlTFCollider);
        rootEntity.addChild(glTFRoot);
        engine.run();
      });
  }
);
