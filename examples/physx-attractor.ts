/**
 * @title PhysX Attractor
 * @category Physics
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*CERrSaAWYaQAAAAAAAAAAAAADiR2AQ/original
 */

import {
  AmbientLight,
  AssetType,
  Camera,
  Color,
  DirectLight,
  DynamicCollider,
  Entity,
  Font,
  Layer,
  MathUtil,
  MeshRenderer,
  PBRMaterial,
  PlaneColliderShape,
  PrimitiveMesh,
  Quaternion,
  Ray,
  RenderFace,
  Script,
  ShadowType,
  SphereColliderShape,
  StaticCollider,
  TextRenderer,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

import { PhysXPhysics } from "@galacean/engine-physics-physx";

class Attractor extends Script {
  private collider: DynamicCollider;
  private force: Vector3 = new Vector3();

  onAwake() {
    this.collider = this.entity.getComponent(DynamicCollider);
  }

  onPhysicsUpdate() {
    this.force.copyFrom(this.entity.transform.worldPosition);
    this.collider.applyForce(this.force.normalize().scale(-10));
  }
}

class Interactor extends Script {
  ray = new Ray();
  position = new Vector3();
  rotation = new Quaternion();
  camera: Camera;

  onAwake() {
    this.camera = this.entity.getComponent(Camera);
  }

  onUpdate(deltaTime: number) {
    const ray = this.ray;
    const { pointers } = this.engine.inputManager;
    if (pointers && pointers.length > 0) {
      const pointer = pointers[0].position;
      this.camera.screenPointToRay(pointer, ray);
      const position = this.entity.transform.position;
      position.copyFrom(ray.origin);
      position.add(ray.direction.scale(18));
    }
  }
}

// init scene
function init(rootEntity: Entity) {
  addPlane(rootEntity, new Vector3(0, -8, 0), new Quaternion());
  const quat180 = new Quaternion();
  quat180.rotateZ(MathUtil.degreeToRadian(180));
  addPlane(rootEntity, new Vector3(0, 8, 0), quat180);

  const quat90 = new Quaternion();
  quat90.rotateZ(MathUtil.degreeToRadian(90));
  addPlane(rootEntity, new Vector3(10, 0, 0), quat90);

  const quatNega90 = new Quaternion();
  quatNega90.rotateZ(MathUtil.degreeToRadian(-90));
  addPlane(rootEntity, new Vector3(-10, 0, 0), quatNega90);

  const quatFront90 = new Quaternion();
  quatFront90.rotateX(MathUtil.degreeToRadian(-90));
  addPlane(rootEntity, new Vector3(0, 0, 10), quatFront90);

  const quatNegaFront90 = new Quaternion();
  quatNegaFront90.rotateX(MathUtil.degreeToRadian(90));
  addPlane(rootEntity, new Vector3(0, 0, 0), quatNegaFront90);

  const quat = new Quaternion(0, 0, 0.3, 0.7);
  quat.normalize();
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        addSphere(
          rootEntity,
          1,
          new Vector3(-4 + 2 * i, -4 + 2 * j, -4 + 2 * k),
          quat
        );
      }
    }
  }
}

function addPlane(
  rootEntity: Entity,
  position: Vector3,
  rotation: Quaternion
): Entity {
  const mtl = new PBRMaterial(rootEntity.engine);
  mtl.baseColor.set(
    0.03179807202597362,
    0.3939682161541871,
    0.41177952549087604,
    1
  );
  mtl.renderFace = RenderFace.Double;
  const planeEntity = rootEntity.createChild();
  planeEntity.layer = Layer.Layer1;

  const renderer = planeEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(rootEntity.engine, 10, 10);
  // renderer.setMaterial(mtl);
  planeEntity.transform.position = position;
  planeEntity.transform.rotationQuaternion = rotation;

  const physicsPlane = new PlaneColliderShape();
  const planeCollider = planeEntity.addComponent(StaticCollider);
  planeCollider.addShape(physicsPlane);

  return planeEntity;
}

function addSphere(
  rootEntity: Entity,
  radius: number,
  position: Vector3,
  rotation: Quaternion
): Entity {
  const mtl = new PBRMaterial(rootEntity.engine);
  mtl.baseColor.set(1.0, 168 / 255, 196 / 255, 1.0);
  mtl.roughness = 0.8;
  mtl.metallic = 0.4;

  const sphereEntity = rootEntity.createChild();
  const renderer = sphereEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createSphere(rootEntity.engine, radius, 60);
  renderer.setMaterial(mtl);
  sphereEntity.transform.position = position;
  sphereEntity.transform.rotationQuaternion = rotation;

  const physicsSphere = new SphereColliderShape();
  physicsSphere.radius = radius;
  const sphereCollider = sphereEntity.addComponent(DynamicCollider);
  sphereCollider.addShape(physicsSphere);
  sphereCollider.linearDamping = 0.95;
  sphereCollider.angularDamping = 0.2;
  sphereEntity.addComponent(Attractor);
  return sphereEntity;
}

//--------------------------------------------------------------------------------------------------------------------
WebGLEngine.create({ canvas: "canvas", physics: new PhysXPhysics() }).then(
  (engine) => {
    engine.canvas.resizeByClientSize();
    const scene = engine.sceneManager.activeScene;
    scene.shadowDistance = 20;
    const rootEntity = scene.createRootEntity();

    // init camera
    const cameraEntity = rootEntity.createChild("camera");
    const camera = cameraEntity.addComponent(Camera);
    const pos = cameraEntity.transform.position;
    pos.set(0, 0, -15);
    cameraEntity.transform.position = pos;
    cameraEntity.transform.lookAt(new Vector3());

    const entity = cameraEntity.createChild("text");
    entity.transform.position = new Vector3(0, 3.5, -10);
    const renderer = entity.addComponent(TextRenderer);
    renderer.color = new Color();
    renderer.text = "Use mouse to interact with spheres";
    renderer.font = Font.createFromOS(entity.engine, "Arial");
    renderer.fontSize = 40;

    const light = rootEntity.createChild("light");
    light.transform.setPosition(5, 0, -10);
    light.transform.lookAt(new Vector3(0, 0, 0));
    const p = light.addComponent(DirectLight);
    p.shadowType = ShadowType.SoftLow;

    {
      const attractorEntity = rootEntity.createChild();
      attractorEntity.addComponent(Interactor).camera = camera;
      const mtl = new PBRMaterial(engine);
      mtl.baseColor.set(1, 1, 1, 1.0);
      const renderer = attractorEntity.addComponent(MeshRenderer);
      renderer.mesh = PrimitiveMesh.createSphere(engine, 2);
      // renderer.setMaterial(mtl);

      const attractorSphere = new SphereColliderShape();
      attractorSphere.radius = 2;
      const attractorCollider = attractorEntity.addComponent(DynamicCollider);
      attractorCollider.isKinematic = true;
      attractorCollider.addShape(attractorSphere);
    }

    engine.physicsManager.gravity = new Vector3();
    init(rootEntity);

    engine.resourceManager
      .load<AmbientLight>({
        type: AssetType.Env,
        url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin",
      })
      .then((ambientLight) => {
        scene.ambientLight = ambientLight;

        engine.run();
      });
  }
);
