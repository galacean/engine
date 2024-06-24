/**
 * @title PhysX Select
 * @category Physics
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*_vPnS5vMHrcAAAAAAAAAAAAADiR2AQ/original
 */

import {
  AmbientLight,
  AssetType,
  BoxColliderShape,
  Camera,
  CollisionDetectionMode,
  Color,
  DirectLight,
  DynamicCollider,
  Entity,
  Font,
  Layer,
  MeshRenderer,
  PBRMaterial,
  PlaneColliderShape,
  Pointer,
  PrimitiveMesh,
  Quaternion,
  Script,
  ShadowType,
  StaticCollider,
  TextRenderer,
  Texture2D,
  Vector2,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { PhysXPhysics } from "@galacean/engine-physics-physx";

class PanScript extends Script {
  private startPointerPos = new Vector3();
  private tempVec3: Vector3 = new Vector3();
  private zValue: number = 0;

  private collider: DynamicCollider;
  camera: Camera;
  invCanvasWidth: number;
  invCanvasHeight: number;

  onStart() {
    this.collider = this.entity.getComponent(DynamicCollider);
  }

  onPointerDown(pointer: Pointer) {
    // get depth
    this.camera.worldToViewportPoint(
      this.entity.transform.worldPosition,
      this.tempVec3
    );
    this.zValue = this.camera.worldToViewportPoint(
      this.entity.transform.worldPosition,
      this.tempVec3
    ).z;
    const { tempVec3 } = this;
    tempVec3.set(
      pointer.position.x * this.invCanvasWidth,
      pointer.position.y * this.invCanvasHeight,
      this.zValue
    );
    this.camera.viewportToWorldPoint(tempVec3, this.startPointerPos);
    this.collider.linearVelocity = new Vector3();
    this.collider.angularVelocity = new Vector3();
  }

  onPointerDrag(pointer: Pointer) {
    const { tempVec3, startPointerPos } = this;
    const { transform } = this.entity;
    this.tempVec3.set(
      pointer.position.x * this.invCanvasWidth,
      pointer.position.y * this.invCanvasHeight,
      this.zValue
    );
    this.camera.viewportToWorldPoint(tempVec3, tempVec3);
    Vector3.subtract(tempVec3, startPointerPos, startPointerPos);
    transform.worldPosition = transform.worldPosition.add(startPointerPos);
    startPointerPos.copyFrom(tempVec3);
  }
}

function addPlane(
  rootEntity: Entity,
  size: Vector2,
  position: Vector3,
  rotation: Quaternion
): Entity {
  const mtl = new PBRMaterial(rootEntity.engine);
  mtl.baseColor.set(
    0.2179807202597362,
    0.2939682161541871,
    0.31177952549087604,
    1
  );
  mtl.roughness = 0.0;
  mtl.metallic = 0.0;

  const planeEntity = rootEntity.createChild();
  planeEntity.layer = Layer.Layer1;

  const renderer = planeEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(rootEntity.engine, size.x, size.y);
  renderer.setMaterial(mtl);
  planeEntity.transform.position = position;
  planeEntity.transform.rotationQuaternion = rotation;

  const physicsPlane = new PlaneColliderShape();
  physicsPlane.position.set(0, 0, 0);
  const planeCollider = planeEntity.addComponent(StaticCollider);
  planeCollider.addShape(physicsPlane);

  return planeEntity;
}

function addVerticalBox(
  rootEntity: Entity,
  texture: Texture2D,
  x: number,
  y: number,
  z: number,
  camera: Camera,
  invCanvasWidth: number,
  invCanvasHeight: number
): void {
  const entity = rootEntity.createChild("entity");
  entity.transform.setPosition(x, y, z);

  const boxMtl = new PBRMaterial(rootEntity.engine);
  boxMtl.roughness = 0.5;
  boxMtl.metallic = 0.0;
  const boxRenderer = entity.addComponent(MeshRenderer);
  boxMtl.baseTexture = texture;
  boxMtl.baseTexture.anisoLevel = 12;
  boxRenderer.mesh = PrimitiveMesh.createCuboid(
    rootEntity.engine,
    0.5,
    0.33,
    2,
    false
  );
  boxRenderer.setMaterial(boxMtl);

  const physicsBox = new BoxColliderShape();
  physicsBox.size = new Vector3(0.5, 0.33, 2);
  physicsBox.material.staticFriction = 1;
  physicsBox.material.dynamicFriction = 1;
  physicsBox.material.bounciness = 0.0;

  const boxCollider = entity.addComponent(DynamicCollider);
  boxCollider.addShape(physicsBox);
  boxCollider.mass = 1;
  boxCollider.collisionDetectionMode =
    CollisionDetectionMode.ContinuousSpeculative;

  const pan = entity.addComponent(PanScript);
  pan.camera = camera;
  pan.invCanvasWidth = invCanvasWidth;
  pan.invCanvasHeight = invCanvasHeight;
}

function addHorizontalBox(
  rootEntity: Entity,
  texture: Texture2D,
  x: number,
  y: number,
  z: number,
  camera: Camera,
  invCanvasWidth: number,
  invCanvasHeight: number
): void {
  const entity = rootEntity.createChild("entity");
  entity.transform.setPosition(x, y, z);

  const boxMtl = new PBRMaterial(rootEntity.engine);
  boxMtl.roughness = 0.5;
  boxMtl.metallic = 0.0;
  const boxRenderer = entity.addComponent(MeshRenderer);
  boxMtl.baseTexture = texture;
  boxMtl.baseTexture.anisoLevel = 12;
  boxRenderer.mesh = PrimitiveMesh.createCuboid(
    rootEntity.engine,
    2,
    0.33,
    0.5
  );
  boxRenderer.setMaterial(boxMtl);

  const physicsBox = new BoxColliderShape();
  physicsBox.size = new Vector3(2, 0.33, 0.5);
  physicsBox.material.staticFriction = 1;
  physicsBox.material.dynamicFriction = 1;
  physicsBox.material.bounciness = 0.0;

  const boxCollider = entity.addComponent(DynamicCollider);
  boxCollider.addShape(physicsBox);
  boxCollider.mass = 0.5;
  boxCollider.collisionDetectionMode =
    CollisionDetectionMode.ContinuousSpeculative;

  const pan = entity.addComponent(PanScript);
  pan.camera = camera;
  pan.invCanvasWidth = invCanvasWidth;
  pan.invCanvasHeight = invCanvasHeight;
}

function addBox(
  rootEntity: Entity,
  texture1: Texture2D,
  texture2: Texture2D,
  camera: Camera,
  invCanvasWidth: number,
  invCanvasHeight: number
): void {
  for (let i: number = 0; i < 8; i++) {
    addVerticalBox(
      rootEntity,
      texture1,
      -0.65,
      0.165 + i * 0.33 * 2,
      0,
      camera,
      invCanvasWidth,
      invCanvasHeight
    );
    addVerticalBox(
      rootEntity,
      texture1,
      0,
      0.165 + i * 0.33 * 2,
      0,
      camera,
      invCanvasWidth,
      invCanvasHeight
    );
    addVerticalBox(
      rootEntity,
      texture1,
      0.65,
      0.165 + i * 0.33 * 2,
      0,
      camera,
      invCanvasWidth,
      invCanvasHeight
    );

    addHorizontalBox(
      rootEntity,
      texture2,
      0,
      0.165 + 0.33 + i * 0.33 * 2,
      -0.65,
      camera,
      invCanvasWidth,
      invCanvasHeight
    );
    addHorizontalBox(
      rootEntity,
      texture2,
      0,
      0.165 + 0.33 + i * 0.33 * 2,
      0,
      camera,
      invCanvasWidth,
      invCanvasHeight
    );
    addHorizontalBox(
      rootEntity,
      texture2,
      0,
      0.165 + 0.33 + i * 0.33 * 2,
      0.65,
      camera,
      invCanvasWidth,
      invCanvasHeight
    );
  }
}

//--------------------------------------------------------------------------------------------------------------------
WebGLEngine.create({ canvas: "canvas", physics: new PhysXPhysics() }).then(
  (engine) => {
    engine.canvas.resizeByClientSize();
    const invCanvasWidth = 1 / engine.canvas.width;
    const invCanvasHeight = 1 / engine.canvas.height;
    const scene = engine.sceneManager.activeScene;
    scene.shadowDistance = 20;
    const rootEntity = scene.createRootEntity("root");

    scene.ambientLight.diffuseSolidColor.set(0.5, 0.5, 0.5, 1);
    scene.ambientLight.diffuseIntensity = 1.2;

    // init camera
    const cameraEntity = rootEntity.createChild("camera");
    const camera = cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(7, 7, 7);
    cameraEntity.transform.lookAt(new Vector3(0, 2, 0), new Vector3(0, 1, 0));

    const entity = cameraEntity.createChild("text");
    entity.transform.position = new Vector3(0, 3.5, -10);
    const renderer = entity.addComponent(TextRenderer);
    renderer.color = new Color();
    renderer.text = "Use mouse to move the bricks";
    renderer.font = Font.createFromOS(entity.engine, "Arial");
    renderer.fontSize = 40;

    // init point light
    const light = rootEntity.createChild("light");
    light.transform.setPosition(0, 5, 8);
    light.transform.lookAt(new Vector3(0, 2, 0), new Vector3(0, 1, 0));
    const directLight = light.addComponent(DirectLight);
    directLight.shadowType = ShadowType.SoftLow;

    addPlane(rootEntity, new Vector2(30, 30), new Vector3(), new Quaternion());

    Promise.all([
      engine.resourceManager.load<Texture2D>({
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*Wkn5QY0tpbcAAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture2D,
      }),
      engine.resourceManager.load<Texture2D>({
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*W5azT5DjDAEAAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture2D,
      }),
    ]).then((asset: Texture2D[]) => {
      addBox(
        rootEntity,
        asset[0],
        asset[1],
        camera,
        invCanvasWidth,
        invCanvasHeight
      );

      engine.resourceManager
        .load<AmbientLight>({
          type: AssetType.Env,
          url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin",
        })
        .then((ambientLight) => {
          scene.ambientLight = ambientLight;
          engine.run();
        });
    });
  }
);
