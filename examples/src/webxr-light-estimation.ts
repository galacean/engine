/**
 * @title WebXR Light Estimation (AR)
 * @category XR
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*omVHSr3cHpIAAAAAAAAAAAAADiR2AQ/original
 */
import {
  Camera,
  DirectLight,
  DiffuseMode,
  Entity,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Script,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { WebXRDevice } from "@galacean/engine-xr-webxr";
import { XRLightEstimation, XRSessionMode, XRTrackedInputDevice } from "@galacean/engine-xr";

class LightEstimationApplier extends Script {
  lightEntity: Entity | null = null;
  statusElement: HTMLElement | null = null;

  private _direction = new Vector3();
  private _target = new Vector3();
  private _hadEstimate = false;

  onUpdate(): void {
    const feature = this.engine.xrManager.getFeature(XRLightEstimation);
    if (!feature || !feature.available) {
      if (this.statusElement && this._hadEstimate) {
        this.statusElement.textContent = "Light estimation: waiting...";
        this._hadEstimate = false;
      }
      return;
    }

    const estimate = feature.estimate;
    const ambient = this.scene.ambientLight;
    ambient.diffuseMode = DiffuseMode.SphericalHarmonics;
    ambient.diffuseSphericalHarmonics = estimate.sphericalHarmonics;

    if (this.lightEntity) {
      const light = this.lightEntity.getComponent(DirectLight);
      light.color.copyFrom(estimate.primaryLightIntensity);
      const transform = this.lightEntity.transform;
      this._direction.set(
        -estimate.primaryLightDirection.x,
        -estimate.primaryLightDirection.y,
        -estimate.primaryLightDirection.z
      );
      this._target.copyFrom(transform.worldPosition).add(this._direction);
      transform.lookAt(this._target);
    }

    if (this.statusElement && !this._hadEstimate) {
      this.statusElement.textContent = "Light estimation: active";
      this._hadEstimate = true;
    }
  }
}

main();

async function main(): Promise<void> {
  const engine = await WebGLEngine.create({
    canvas: "canvas",
    xrDevice: new WebXRDevice()
  });
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const root = scene.createRootEntity("Root");
  const xrOrigin = root.createChild("XROrigin");
  engine.xrManager.origin = xrOrigin;

  const cameraEntity = xrOrigin.createChild("Camera");
  const camera = cameraEntity.addComponent(Camera);
  engine.xrManager.cameraManager.attachCamera(XRTrackedInputDevice.Camera, camera);

  const lightEntity = xrOrigin.createChild("MainLight");
  lightEntity.addComponent(DirectLight);

  const targetEntity = xrOrigin.createChild("Target");
  targetEntity.transform.setPosition(0, 0, -1.2);
  const renderer = targetEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createSphere(engine, 0.15, 32);
  const material = new PBRMaterial(engine);
  renderer.setMaterial(material);

  const status = createStatusLabel();
  const enterButton = createEnterButton();

  const xrManager = engine.xrManager;
  const lightEstimationSupported = xrManager.isSupportedFeature(XRLightEstimation);
  if (lightEstimationSupported) {
    xrManager.addFeature(XRLightEstimation);
  } else {
    status.textContent = "Light estimation: not supported";
  }

  enterButton.disabled = true;
  xrManager.sessionManager.isSupportedMode(XRSessionMode.AR).then(
    () => {
      enterButton.disabled = false;
      enterButton.onclick = () => {
        xrManager.enterXR(XRSessionMode.AR).then(
          () => {
            status.textContent = lightEstimationSupported ? "Light estimation: waiting..." : "AR session running";
          },
          (error) => {
            status.textContent = "Enter AR failed";
            console.error(error);
          }
        );
      };
    },
    (error) => {
      status.textContent = "AR not supported";
      console.error(error);
    }
  );

  const applier = root.addComponent(LightEstimationApplier);
  applier.lightEntity = lightEntity;
  applier.statusElement = status;

  engine.run();
}

function createEnterButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "Enter AR";
  button.style.position = "absolute";
  button.style.left = "16px";
  button.style.bottom = "16px";
  button.style.padding = "10px 14px";
  button.style.borderRadius = "8px";
  button.style.border = "1px solid #444";
  button.style.background = "#111";
  button.style.color = "#fff";
  button.style.fontSize = "14px";
  button.style.cursor = "pointer";
  document.body.appendChild(button);
  return button;
}

function createStatusLabel(): HTMLDivElement {
  const label = document.createElement("div");
  label.textContent = "Light estimation: waiting...";
  label.style.position = "absolute";
  label.style.left = "16px";
  label.style.bottom = "56px";
  label.style.padding = "6px 10px";
  label.style.borderRadius = "6px";
  label.style.background = "rgba(0, 0, 0, 0.6)";
  label.style.color = "#fff";
  label.style.fontSize = "12px";
  label.style.fontFamily = "monospace";
  document.body.appendChild(label);
  return label;
}
