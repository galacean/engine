/**
 * @title AR image tracking
 * @category XR
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*-LBVTK0rt7kAAAAAAAAAAAAADiR2AQ/original
 */

import {
  Camera,
  Color,
  Entity,
  MeshRenderer,
  PrimitiveMesh,
  Script,
  UnlitMaterial,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import {
  XRImageTracking,
  XRReferenceImage,
  XRSessionMode,
  XRTrackedImage,
  XRTrackedInputDevice,
} from "@galacean/engine-xr";
import { WebXRDevice } from "@galacean/engine-xr-webxr";

WebGLEngine.create({
  canvas: "canvas",
  xrDevice: new WebXRDevice(),
}).then((engine) => {
  // 设置屏幕分辨率
  engine.canvas.resizeByClientSize(1);
  const { sceneManager, xrManager } = engine;
  const scene = sceneManager.scenes[0];
  const origin = (xrManager.origin = scene.createRootEntity("origin"));
  const camera = origin.createChild("Camera").addComponent(Camera);
  xrManager.cameraManager.attachCamera(XRTrackedInputDevice.Camera, camera);
  const image = new Image();
  image.onload = () => {
    const refImage = new XRReferenceImage("test", image, 0.08);
    xrManager.addFeature(XRImageTracking, [refImage]);
    const prefab = new Entity(engine);
    prefab.addComponent(Axis);
    origin.addComponent(XRTrackedImageManager).prefab = prefab;
    xrManager.sessionManager.isSupportedMode(XRSessionMode.AR).then(
      () => {
        const content = xrManager.isSupportedFeature(XRImageTracking)
          ? "Enter AR"
          : "Not Support Image Tracking";
        addXRButton(content).onclick = () => {
          xrManager.enterXR(XRSessionMode.AR);
        };
      },
      (error) => {
        addXRButton("Not Support");
        console.error(error);
      }
    );
  };

  image.src =
    "https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*br03RK1-XTMAAAAAAAAAAAAADleLAQ/original";
  engine.run();
});

class XRTrackedImageManager extends Script {
  private _prefab: Entity;
  private _trackIdToIndex: number[] = [];
  private _trackedComponents: Array<TrackedComponent> = [];

  get prefab(): Entity {
    return this._prefab;
  }

  set prefab(value: Entity) {
    this._prefab = value;
  }

  getTrackedComponentByTrackId(trackId: number): TrackedComponent | null {
    const index = this._trackIdToIndex[trackId];
    return index !== undefined ? this._trackedComponents[index] : null;
  }

  override onAwake(): void {
    const imageTracking = this._engine.xrManager.getFeature(XRImageTracking);
    this._onChanged = this._onChanged.bind(this);
    imageTracking?.addChangedListener(this._onChanged);
  }

  private _onChanged(
    added: readonly XRTrackedImage[],
    updated: readonly XRTrackedImage[],
    removed: readonly XRTrackedImage[]
  ) {
    if (added.length > 0) {
      for (let i = 0, n = added.length; i < n; i++) {
        this._createOrUpdateTrackedComponents(added[i]);
      }
    }
    if (updated.length > 0) {
      for (let i = 0, n = updated.length; i < n; i++) {
        this._createOrUpdateTrackedComponents(updated[i]);
      }
    }
    if (removed.length > 0) {
      const {
        _trackIdToIndex: trackIdToIndex,
        _trackedComponents: trackedComponents,
      } = this;
      for (let i = 0, n = removed.length; i < n; i++) {
        const { id } = removed[i];
        const index = trackIdToIndex[id];
        if (index !== undefined) {
          const trackedComponent = trackedComponents[index];
          trackedComponents.splice(index, 1);
          delete trackIdToIndex[id];
          if (trackedComponent.destroyedOnRemoval) {
            trackedComponent.entity.destroy();
          } else {
            trackedComponent.entity.parent = null;
          }
        }
      }
    }
  }

  private _createOrUpdateTrackedComponents(
    sessionRelativeData: XRTrackedImage
  ): TrackedComponent {
    let trackedComponent = this.getTrackedComponentByTrackId(
      sessionRelativeData.id
    );
    if (!trackedComponent) {
      const {
        _trackIdToIndex: trackIdToIndex,
        _trackedComponents: trackedComponents,
      } = this;
      trackedComponent = this._createTrackedComponents(sessionRelativeData);
      trackIdToIndex[sessionRelativeData.id] = trackedComponents.length;
      trackedComponents.push(trackedComponent);
    }
    trackedComponent.data = sessionRelativeData;
    const { transform } = trackedComponent.entity;
    const { pose } = sessionRelativeData;
    transform.position = pose.position;
    transform.rotationQuaternion = pose.rotation;
    return trackedComponent;
  }

  private _createTrackedComponents(
    sessionRelativeData: XRTrackedImage
  ): TrackedComponent {
    const { origin } = this._engine.xrManager;
    const { _prefab: prefab } = this;
    let entity: Entity;
    if (prefab) {
      entity = prefab.clone();
      entity.name = `TrackedImage${sessionRelativeData.id}`;
      origin.addChild(entity);
    } else {
      entity = origin.createChild(`TrackedImage${sessionRelativeData.id}`);
    }
    const trackedComponent = entity.addComponent(TrackedComponent);
    return trackedComponent;
  }
}

export class TrackedComponent extends Script {
  private _data: XRTrackedImage;
  private _destroyedOnRemoval = true;

  get destroyedOnRemoval(): boolean {
    return this._destroyedOnRemoval;
  }

  set destroyedOnRemoval(value: boolean) {
    this._destroyedOnRemoval = value;
  }

  get data(): XRTrackedImage {
    return this._data;
  }

  set data(value: XRTrackedImage) {
    this._data = value;
  }
}

class Axis extends Script {
  private _length = 0.1;
  private _arrows: Record<string, Entity> = {};
  private _sides: Record<string, Entity> = {};

  get length(): number {
    return this._length;
  }

  set length(value: number) {
    if (this._length !== value) {
      this._length = value;
      this._reset(value);
    }
  }

  onStart(): void {
    this._initSide("x", new Vector3(0, 0, -90), new Color(1, 0, 0, 1));
    this._initSide("y", new Vector3(0, 0, 0), new Color(0, 1, 0, 1));
    this._initSide("z", new Vector3(90, 0, 0), new Color(0, 0, 1, 1));
    this._initArrow("x", new Vector3(0, 0, -90), new Color(1, 0, 0, 1));
    this._initArrow("y", new Vector3(0, 0, 0), new Color(0, 1, 0, 1));
    this._initArrow("z", new Vector3(90, 0, 0), new Color(0, 0, 1, 1));
    this._reset(this._length);
  }

  private _reset(length: number): void {
    const { _arrows: arrows, _sides: sides } = this;
    arrows.x.transform.setPosition(length, 0, 0);
    arrows.y.transform.setPosition(0, length, 0);
    arrows.z.transform.setPosition(0, 0, length);

    sides.x.transform.setScale(1, length, 1);
    sides.y.transform.setScale(1, length, 1);
    sides.z.transform.setScale(1, length, 1);
  }

  private _initArrow(type: string, rot: Vector3, col: Color): void {
    const { engine, entity } = this;
    const arrow = (this._arrows[type] = entity.createChild("arrow" + type));
    const arrowRenderer = arrow.addComponent(MeshRenderer);
    arrowRenderer.mesh = PrimitiveMesh.createCone(engine, 0.004, 0.012);
    const material = new UnlitMaterial(engine);
    material.baseColor = col;
    arrowRenderer.setMaterial(material);
    arrow.transform.rotation = rot;
  }

  private _initSide(type: string, rot: Vector3, col: Color): void {
    const { engine, entity } = this;
    const side = (this._sides[type] = entity.createChild("side" + type));
    const rendererEntity = side.createChild("rendererEntity");
    rendererEntity.transform.position.set(0, 0.5, 0);
    const renderer = rendererEntity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCylinder(engine, 0.002, 0.002, 1);
    const material = new UnlitMaterial(engine);
    material.baseColor = col;
    renderer.setMaterial(material);
    side.transform.rotation = rot;
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
