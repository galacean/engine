/**
 * @title input-pointerRaycast
 * @category input
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*unTBRblIIkUAAAAAAAAAAAAADiR2AQ/original
 */
import {
  BlinnPhongMaterial,
  BoxColliderShape,
  Camera,
  Color,
  DirectLight,
  Entity,
  HitResult,
  Layer,
  MeshRenderer,
  PrimitiveMesh,
  Ray,
  Script,
  StaticCollider,
  UnlitMaterial,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { LitePhysics } from "@galacean/engine-physics-lite";
import { WireframeManager } from "@galacean/engine-toolkit";

// Create engine
WebGLEngine.create({ canvas: "canvas", physics: new LitePhysics() }).then(
  (engine) => {
    engine.canvas.resizeByClientSize();
    engine.canvas._webCanvas.style.touchAction = "none";
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("root");

    // add light
    const lightEntity = rootEntity.createChild("light");
    lightEntity.addComponent(DirectLight);
    lightEntity.transform.setRotation(-45, 0, 0);

    // init main camera
    const mainCameraEntity = rootEntity.createChild("camera");
    const mainCamera = mainCameraEntity.addComponent(Camera);
    mainCameraEntity.transform.setPosition(0, 0, 20);
    mainCameraEntity.transform.lookAt(new Vector3(0, 0, 0));
    mainCamera.cullingMask = Layer.Layer0 | Layer.Layer1;
    mainCamera.fieldOfView = 35;
    mainCamera.nearClipPlane = 1;
    mainCamera.farClipPlane = 30;
    // add wire frame
    rootEntity.addComponent(MeshRenderer);
    rootEntity.addComponent(WireframeManager).addCameraWireframe(mainCamera);

    // init side camera
    const sideCameraEntity = rootEntity.createChild("sideCamera");
    const sideCamera = sideCameraEntity.addComponent(Camera);
    sideCamera.priority = 1;
    sideCamera.viewport.set(0, 0.6, 0.4, 0.4);
    sideCameraEntity.transform.setPosition(-45, 0, 0);
    sideCameraEntity.transform.rotation.set(0, -90, 0);
    sideCamera.cullingMask = Layer.Layer0 | Layer.Layer2;
    sideCameraEntity.addComponent(
      class extends Script {
        onBeginRender(camera: Camera): void {
          scene.background.solidColor.set(0, 0, 0, 1);
        }
        onEndRender(camera: Camera): void {
          scene.background.solidColor.set(0.25, 0.25, 0.25, 1.0);
        }
      }
    );

    for (let i = 0; i < 30; i++) {
      createRandomBox(rootEntity);
    }

    rootEntity.addComponent(
      class extends Script {
        private _entities: Entity[] = [];
        private _tempRay: Ray = new Ray();
        private _tempVec3: Vector3 = new Vector3();
        private _hitResult: HitResult = new HitResult();

        onUpdate(deltaTime: number): void {
          const { pointers } = engine.inputManager;
          const {
            _tempRay: tempRay,
            _entities: entities,
            _hitResult: hitResult,
          } = this;
          for (let i = 0, n = entities.length; i < n; i++) {
            entities[i].isActive = false;
          }
          for (let i = 0, n = pointers.length; i < n; i++) {
            mainCamera.screenPointToRay(pointers[i].position, tempRay);
            if (scene.physics.raycast(tempRay, 100, hitResult)) {
              (
                hitResult.entity.getComponent(BoxScript) as BoxScript
              ).hitFrameCount = engine.time.frameCount;
            }
            this._adjustByRay(this._getOrCreateRayEntity(i), tempRay);
          }
        }

        private _getOrCreateRayEntity(index: number) {
          const { _entities: entities } = this;
          let entity = entities[index];
          if (!entity) {
            entity = entities[index] = this.entity.createChild(`ray${index}`);
            const ray = entity.createChild();
            ray.layer = Layer.Layer2;
            const rayRenderer = ray.addComponent(MeshRenderer);
            rayRenderer.mesh = PrimitiveMesh.createCylinder(
              engine,
              0.05,
              0.05,
              40
            );
            ray.transform.position = new Vector3(0, 0, -20);
            ray.transform.rotation = new Vector3(-90, 0, 0);
            const material = new UnlitMaterial(engine);
            material.baseColor = new Color(0, 1, 0);
            rayRenderer.setMaterial(material);
            const ball = entity.createChild();
            ball.layer = Layer.Layer1;
            const ballRenderer = ball.addComponent(MeshRenderer);
            ballRenderer.mesh = PrimitiveMesh.createSphere(engine, 0.008);
            ballRenderer.setMaterial(material);
          } else {
            entity.isActive = true;
          }
          return entities[index];
        }

        private _adjustByRay(rayEntity: Entity, ray: Ray) {
          const { _tempVec3: tempVec3 } = this;
          const { origin, direction } = ray;
          Vector3.scale(direction, 0.5, tempVec3);
          Vector3.add(origin, tempVec3, rayEntity.transform.position);
          Vector3.add(origin, direction, tempVec3);
          rayEntity.transform.lookAt(tempVec3);
        }
      }
    );

    // Run engine
    engine.run();
  }
);

function createRandomBox(root: Entity) {
  const { engine } = root;
  const boxEntity = root.createChild("box");
  boxEntity.transform.setPosition(
    5 - Math.random() * 10,
    5 - Math.random() * 10,
    8 - Math.random() * 16
  );

  const renderer = boxEntity.addComponent(MeshRenderer);
  const width = Math.random() * 1.5 + 0.5;
  const height = Math.random() * 1.5 + 0.5;
  const depth = Math.random() * 1.5 + 0.5;
  renderer.mesh = PrimitiveMesh.createCuboid(engine, width, height, depth);
  const material = new BlinnPhongMaterial(engine);
  material.baseColor = new Color(1, 1, 1);
  renderer.setMaterial(material);

  const collider = boxEntity.addComponent(StaticCollider);
  const shape = new BoxColliderShape();
  shape.size.set(width, height, depth);
  collider.addShape(shape);

  boxEntity.addComponent(BoxScript);
}

class BoxScript extends Script {
  hitFrameCount: number = 0;
  private _material: BlinnPhongMaterial;

  onStart(): void {
    this._material = (
      this.entity.getComponent(MeshRenderer) as MeshRenderer
    ).getMaterial() as BlinnPhongMaterial;
  }

  onLateUpdate(deltaTime: number): void {
    if (this.engine.time.frameCount === this.hitFrameCount) {
      this._material.baseColor = new Color(1, 0, 0);
    } else {
      this._material.baseColor = new Color(1, 1, 1);
    }
  }
}
