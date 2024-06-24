/**
 * @title VR shot ball
 * @category XR
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*PwDEQK58LPwAAAAAAAAAAAAADiR2AQ/original
 */

import {
  AmbientLight,
  AssetType,
  BoxColliderShape,
  Camera,
  Collider,
  Color,
  DirectLight,
  DynamicCollider,
  Entity,
  FixedJoint,
  GLTFResource,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Quaternion,
  Script,
  ShadowType,
  SphereColliderShape,
  SpringJoint,
  UnlitMaterial,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import {
  XRController,
  XRInputButton,
  XRInputManager,
  XRSessionMode,
  XRTrackedInputDevice,
  XRTrackingState,
} from "@galacean/engine-xr";
import { WebXRDevice } from "@galacean/engine-xr-webxr";
import { XRInput } from "@galacean/engine-xr/types/input/XRInput";
// Create engine
WebGLEngine.create({
  canvas: "canvas",
  xrDevice: new WebXRDevice(),
  physics: new PhysXPhysics(),
}).then((engine) => {
  const { sceneManager, xrManager } = engine;
  const scene = sceneManager.scenes[0];
  const origin = (xrManager.origin = scene.createRootEntity("origin"));
  engine.canvas.resizeByClientSize(1);

  createChain(origin, new Vector3(5.0, 10.0, -22.0), new Quaternion(), 10, 2.0);
  createSpring(origin, new Vector3(-5.0, 5.0, -21.0), new Quaternion());

  // init direct light
  const light = origin.createChild("light");
  light.transform.setPosition(-10, 10, 10);
  light.transform.lookAt(new Vector3());
  const directLight = light.addComponent(DirectLight);
  directLight.shadowType = ShadowType.SoftLow;

  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin",
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
    });

  const leftCamera = origin.createChild("leftCamera").addComponent(Camera);
  xrManager.cameraManager.attachCamera(
    XRTrackedInputDevice.LeftCamera,
    leftCamera
  );
  const rightCamera = origin.createChild("rightCamera").addComponent(Camera);
  xrManager.cameraManager.attachCamera(
    XRTrackedInputDevice.RightCamera,
    rightCamera
  );

  origin.addComponent(ControllerManager);

  xrManager.sessionManager.isSupportedMode(XRSessionMode.VR).then(
    () => {
      addXRButton("Enter VR").onclick = () => {
        xrManager.enterXR(XRSessionMode.VR);
      };
    },
    (error) => {
      addXRButton("Not Support");
      console.error(error);
    }
  );
  engine.run();
});

function addBox(
  rootEntity: Entity,
  size: Vector3,
  position: Vector3,
  rotation: Quaternion
): Entity {
  const mtl = new PBRMaterial(rootEntity.engine);
  mtl.baseColor.set(Math.random(), Math.random(), Math.random(), 1.0);
  mtl.roughness = 0.5;
  mtl.metallic = 0.0;
  const boxEntity = rootEntity.createChild();
  const renderer = boxEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(
    rootEntity.engine,
    size.x,
    size.y,
    size.z
  );
  renderer.setMaterial(mtl);
  boxEntity.transform.position = position;
  boxEntity.transform.rotationQuaternion = rotation;

  const physicsBox = new BoxColliderShape();
  physicsBox.size = size;
  const boxCollider = boxEntity.addComponent(DynamicCollider);
  boxCollider.addShape(physicsBox);

  return boxEntity;
}

function transform(
  position: Vector3,
  rotation: Quaternion,
  outPosition: Vector3,
  outRotation: Quaternion
) {
  Quaternion.multiply(rotation, outRotation, outRotation);
  Vector3.transformByQuat(outPosition, rotation, outPosition);
  outPosition.add(position);
}

function createChain(
  rootEntity: Entity,
  position: Vector3,
  rotation: Quaternion,
  length: number,
  separation: number
) {
  const offset = new Vector3();
  let prevCollider: Collider | null = null;
  for (let i = 0; i < length; i++) {
    const localPosition = new Vector3(0, (-separation / 2) * (2 * i + 1), 0);
    const localQuaternion = new Quaternion();
    transform(position, rotation, localPosition, localQuaternion);
    const currentEntity = addBox(
      rootEntity,
      new Vector3(2.0, 2.0, 0.5),
      localPosition,
      localQuaternion
    );

    const currentCollider = currentEntity.getComponent(DynamicCollider);
    const fixedJoint = currentEntity.addComponent(FixedJoint);
    if (prevCollider !== null) {
      Vector3.subtract(
        currentEntity.transform.worldPosition,
        prevCollider.entity.transform.worldPosition,
        offset
      );
      fixedJoint.connectedAnchor = offset;
      fixedJoint.connectedCollider = prevCollider;
    } else {
      fixedJoint.connectedAnchor = position;
    }
    prevCollider = currentCollider;
  }
}

function createSpring(
  rootEntity: Entity,
  position: Vector3,
  rotation: Quaternion
) {
  const currentEntity = addBox(
    rootEntity,
    new Vector3(2, 2, 1),
    position,
    rotation
  );
  const springJoint = currentEntity.addComponent(SpringJoint);
  springJoint.connectedAnchor = position;
  springJoint.swingOffset = new Vector3(0, 1, 0);
  springJoint.maxDistance = 2;
  springJoint.stiffness = 10;
  springJoint.damping = 1;
}

function addSphere(
  origin: Entity,
  position: Vector3,
  velocity: Vector3
): Entity {
  const mtl = new PBRMaterial(origin.engine);
  mtl.baseColor.set(Math.random(), Math.random(), Math.random(), 1.0);
  mtl.roughness = 0.5;
  mtl.metallic = 0.0;
  const radius = 0.35;
  const sphereEntity = origin.createChild();
  const renderer = sphereEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createSphere(origin.engine, radius);
  renderer.setMaterial(mtl);
  Vector3.add(position, velocity, sphereEntity.transform.position);

  const physicsSphere = new SphereColliderShape();
  physicsSphere.radius = radius;
  const sphereCollider = sphereEntity.addComponent(DynamicCollider);
  sphereCollider.addShape(physicsSphere);
  sphereCollider.linearVelocity = velocity.scale(50);
  sphereCollider.angularDamping = 0.5;

  sphereEntity.addComponent(
    class extends Script {
      onUpdate(deltaTime: number): void {
        if (sphereEntity.transform.worldPosition.y < -20) {
          this.entity.destroy();
        }
      }
    }
  );

  return sphereEntity;
}

class ControllerManager extends Script {
  private _controllers: Entity[] = [];
  onStart(): void {
    const inputManager = this.engine.xrManager.inputManager;
    inputManager.addTrackedDeviceChangedListener(
      (added: readonly XRInput[], removed: readonly XRInput[]) => {
        for (let i = 0, n = added.length; i < n; i++) {
          const { type } = added[i];
          switch (type) {
            case XRTrackedInputDevice.LeftController:
            case XRTrackedInputDevice.RightController:
              this._createOrAddController(type);
              break;
            default:
              break;
          }
        }
        for (let i = 0, n = removed.length; i < n; i++) {
          const { type } = removed[i];
          switch (type) {
            case XRTrackedInputDevice.LeftController:
            case XRTrackedInputDevice.RightController:
              this._removeController(type);
              break;
            default:
              break;
          }
        }
      }
    );
  }

  private _createOrAddController(type: XRTrackedInputDevice): Entity {
    const { _controllers: controllers, engine } = this;
    let controller = controllers[type];
    if (!controller) {
      controller = controllers[type] = engine.xrManager.origin.createChild(
        "controller" + type
      );
      controller.addComponent(Controller).type = type;
    } else {
      controller.isActive = true;
    }
    return controller;
  }

  private _removeController(type: XRTrackedInputDevice): void {
    const controller = this._controllers[type];
    controller && (controller.isActive = false);
  }
}

class Controller extends Script {
  private _controllerURL: string[] = [
    "",
    "https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/meta-quest-touch-plus/left.glb",
    "https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/meta-quest-touch-plus/right.glb",
  ];
  private _inputManager: XRInputManager;
  private _type: XRTrackedInputDevice;
  private _grip: Entity;
  private _ray: Entity;
  private _dir: Vector3 = new Vector3();

  get type(): XRTrackedInputDevice {
    return this._type;
  }

  set type(val: XRTrackedInputDevice) {
    this._type = val;
  }

  onStart(): void {
    const { engine, entity } = this;
    this._inputManager = engine.xrManager.inputManager;

    const grip = (this._grip = entity.createChild(`grip`));
    engine.resourceManager
      .load<GLTFResource>(this._controllerURL[this._type])
      .then((resource) => {
        grip.addChild(resource.instantiateSceneRoot());
      });

    const ray = (this._ray = entity.createChild(`ray`));
    const sub = ray.createChild();
    const rayRenderer = sub.addComponent(MeshRenderer);
    rayRenderer.mesh = PrimitiveMesh.createCylinder(engine, 0.001, 0.001, 40);
    sub.transform.setRotation(90, 0, 0);
    sub.transform.setPosition(0, 0, -20);
    const material = new UnlitMaterial(engine);
    material.baseColor = new Color(0, 1, 0);
    rayRenderer.setMaterial(material);
  }

  onUpdate(): void {
    const { _inputManager: inputManager, _grip: grip, _ray: ray } = this;
    const input = inputManager.getTrackedDevice(this._type) as XRController;
    if (input.trackingState === XRTrackingState.Tracking) {
      grip.transform.localMatrix = input.gripPose.matrix;
      ray.transform.localMatrix = input.targetRayPose.matrix;
      if (input.isButtonDown(XRInputButton.Select)) {
        const forward = this._dir.copyFrom(ray.transform.worldForward);
        addSphere(
          this.engine.xrManager.origin,
          ray.transform.position,
          forward
        );
      }
      grip.isActive = ray.isActive = true;
    } else {
      grip.isActive = ray.isActive = false;
    }
  }
}

function addXRButton(content: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = content;
  const { style } = button;
  style.position = "absolute";
  style.bottom = "20px";
  style.padding = "12px 6px";
  style.border = "1px solid rgb(255, 255, 255)";
  style.borderRadius = "4px";
  style.background = "rgba(0, 0, 0, 0.1)";
  style.color = "rgb(255, 255, 255)";
  style.font = "13px sans-serif";
  style.textAlign = "center";
  style.opacity = "0.5";
  style.outline = "none";
  style.zIndex = "999";
  style.cursor = "pointer";
  style.left = "calc(50% - 50px)";
  style.width = "100px";
  document.body.appendChild(button);
  return button;
}
