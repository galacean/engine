/**
 * @title glTF Pointer
 * @category input
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*_bc8Tp6t_7UAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  BoxColliderShape,
  Camera,
  DirectLight,
  GLTFResource,
  MeshRenderer,
  Script,
  StaticCollider,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { LitePhysics } from "@galacean/engine-physics-lite";

class GlTFCollider extends Script {
  private _tempVec30: Vector3 = new Vector3();
  private _tempVec31: Vector3 = new Vector3();

  onStart(): void {
    const renderers = this.entity.getComponentsIncludeChildren(
      MeshRenderer,
      []
    );
    for (let i = renderers.length - 1; i >= 0; i--) {
      this._addBoundingBox(renderers[i]);
    }
  }

  private _addBoundingBox(renderer: MeshRenderer): void {
    const { _tempVec30: localSize, _tempVec31: localPosition } = this;
    // Calculate the position and size of the collider.
    const boundingBox = renderer.mesh.bounds;
    const entity = renderer.entity;
    boundingBox.getCenter(localPosition);
    Vector3.subtract(boundingBox.max, boundingBox.min, localSize);
    // Add collider.
    const boxCollider = entity.addComponent(StaticCollider);
    const boxColliderShape = new BoxColliderShape();
    boxColliderShape.position.set(
      localPosition.x,
      localPosition.y,
      localPosition.z
    );
    boxColliderShape.size.set(localSize.x, localSize.y, localSize.z);
    boxCollider.addShape(boxColliderShape);
    // Add click script.
    entity.addComponent(Script).onPointerClick = () => {
      window.alert("Click:" + entity.name);
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
        const entity = rootEntity.createChild("glTF");
        entity.addChild(glTFRoot);
        glTFRoot.transform.setScale(0.005, 0.005, 0.005);
        glTFRoot.addComponent(GlTFCollider);
        engine.run();
      });
  }
);
