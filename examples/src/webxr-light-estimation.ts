/**
 * @title WebXR Light Estimation (AR)
 * @category XR
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*omVHSr3cHpIAAAAAAAAAAAAADiR2AQ/original
 */
import {
  Camera,
  Color,
  DirectLight,
  DiffuseMode,
  Entity,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Script,
  TextureCube,
  TextureFormat,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { WebXRDevice } from "@galacean/engine-xr-webxr";
import { XRLightEstimate, XRLightEstimation, XRSessionMode, XRTrackedInputDevice } from "@galacean/engine-xr";

class LightEstimateApplier extends Script {
  lightEntity: Entity | null = null;
  panelElement: HTMLElement | null = null;

  private _direction = new Vector3();
  private _target = new Vector3();
  private _reflectionTexture: TextureCube | null = null;
  private _reflectionCubeMap: unknown | null = null;
  private _reflectionCubeMapSize = 0;
  private _reflectionCubeMapMipmapCount = 0;

  onUpdate(): void {
    const feature = this.engine.xrManager.getFeature(XRLightEstimation);
    if (!feature || !feature.available) {
      this._setPanelContent(false, null, false);
      return;
    }

    const { estimate } = feature;
    const ambient = this.scene.ambientLight;

    ambient.diffuseMode = DiffuseMode.SphericalHarmonics;
    ambient.diffuseSphericalHarmonics = estimate.sphericalHarmonics;
    ambient.diffuseIntensity = 1;
    ambient.specularIntensity = 1;

    const hasReflection = this._applyReflectionCubeMap(estimate);

    if (this.lightEntity) {
      const mainLight = this.lightEntity.getComponent(DirectLight);
      mainLight.color.copyFrom(estimate.primaryLightIntensity);

      this._direction.set(
        -estimate.primaryLightDirection.x,
        -estimate.primaryLightDirection.y,
        -estimate.primaryLightDirection.z
      );
      this._target.copyFrom(this.lightEntity.transform.worldPosition).add(this._direction);
      this.lightEntity.transform.lookAt(this._target);
    }

    this._setPanelContent(true, estimate, hasReflection);
  }

  override onDestroy(): void {
    this._unbindReflectionTexture();
  }

  private _applyReflectionCubeMap(estimate: XRLightEstimate): boolean {
    const reflectionCubeMap = estimate.reflectionCubeMap;
    const ambient = this.scene.ambientLight;

    if (!reflectionCubeMap) {
      this._unbindReflectionTexture();
      return false;
    }

    const size = Math.max(estimate.reflectionCubeMapSize || 1, 1);
    const mipmapCount = Math.max(estimate.reflectionCubeMapMipmapCount || 1, 1);

    if (!this._reflectionTexture) {
      this._reflectionTexture = new TextureCube(this.engine, size, TextureFormat.R8G8B8A8, mipmapCount > 1);
    }

    if (
      this._reflectionCubeMap !== reflectionCubeMap ||
      this._reflectionCubeMapSize !== size ||
      this._reflectionCubeMapMipmapCount !== mipmapCount ||
      !this._reflectionTexture._isExternalTextureBound()
    ) {
      this._reflectionTexture._bindExternalTexture(reflectionCubeMap, {
        size,
        mipmapCount,
        ownedByEngine: false,
        immutable: true
      });
      this._reflectionCubeMap = reflectionCubeMap;
      this._reflectionCubeMapSize = size;
      this._reflectionCubeMapMipmapCount = mipmapCount;
    }

    if (ambient.specularTexture !== this._reflectionTexture) {
      ambient.specularTexture = this._reflectionTexture;
      ambient.specularTextureDecodeRGBM = false;
    }

    return true;
  }

  private _unbindReflectionTexture(): void {
    const ambient = this.scene.ambientLight;

    if (this._reflectionTexture && ambient.specularTexture === this._reflectionTexture) {
      ambient.specularTexture = null;
    }

    if (this._reflectionTexture) {
      this._reflectionTexture._unbindExternalTexture();
      this._reflectionTexture.destroy();
      this._reflectionTexture = null;
    }

    this._reflectionCubeMap = null;
    this._reflectionCubeMapSize = 0;
    this._reflectionCubeMapMipmapCount = 0;
  }

  private _setPanelContent(active: boolean, estimate: XRLightEstimate | null, hasReflection: boolean): void {
    if (!this.panelElement) {
      return;
    }

    if (!active || !estimate) {
      this.panelElement.textContent = [
        "WebXR Light Estimation",
        "state: waiting...",
        "diffuse SH: no",
        "specular cube: no"
      ].join("\n");
      return;
    }

    const direction = estimate.primaryLightDirection;
    const intensity = estimate.primaryLightIntensity;
    this.panelElement.textContent = [
      "WebXR Light Estimation",
      "state: active",
      "diffuse SH: yes",
      `specular cube: ${hasReflection ? "yes" : "no"}`,
      `cube size: ${hasReflection ? estimate.reflectionCubeMapSize : 0}`,
      `mipmap count: ${hasReflection ? estimate.reflectionCubeMapMipmapCount : 0}`,
      `main light dir: ${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)}`,
      `main light rgb: ${intensity.r.toFixed(2)}, ${intensity.g.toFixed(2)}, ${intensity.b.toFixed(2)}`
    ].join("\n");
  }
}

class RotationScript extends Script {
  speed = 20;

  onUpdate(deltaTime: number): void {
    this.entity.transform.rotate(0, this.speed * deltaTime, 0);
  }
}

main();

function main(): void {
  WebGLEngine.create({
    canvas: "canvas",
    xrDevice: new WebXRDevice()
  }).then((engine) => {
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

    createShowcaseSpheres(engine, xrOrigin);

    const infoPanel = createInfoPanel();
    const legendPanel = createLegendPanel();
    const enterButton = createEnterButton();

    const xrManager = engine.xrManager;
    const lightEstimationSupported = xrManager.isSupportedFeature(XRLightEstimation);
    if (lightEstimationSupported) {
      xrManager.addFeature(XRLightEstimation);
      infoPanel.textContent = [
        "WebXR Light Estimation",
        "state: ready",
        "diffuse SH: pending",
        "specular cube: pending"
      ].join("\n");
    } else {
      infoPanel.textContent = [
        "WebXR Light Estimation",
        "state: not supported",
        "diffuse SH: no",
        "specular cube: no"
      ].join("\n");
      legendPanel.textContent += "\nlight-estimation feature not supported on this device/browser.";
    }

    enterButton.disabled = true;
    xrManager.sessionManager.isSupportedMode(XRSessionMode.AR).then(
      () => {
        enterButton.disabled = false;
        enterButton.onclick = () => {
          xrManager.enterXR(XRSessionMode.AR).then(
            () => {
              infoPanel.textContent = [
                "WebXR Light Estimation",
                "state: entering AR...",
                "diffuse SH: pending",
                "specular cube: pending"
              ].join("\n");
            },
            (error) => {
              infoPanel.textContent = [
                "WebXR Light Estimation",
                "state: enter AR failed",
                "diffuse SH: no",
                "specular cube: no"
              ].join("\n");
              console.error(error);
            }
          );
        };
      },
      (error) => {
        infoPanel.textContent = [
          "WebXR Light Estimation",
          "state: AR mode not supported",
          "diffuse SH: no",
          "specular cube: no"
        ].join("\n");
        console.error(error);
      }
    );

    const applier = root.addComponent(LightEstimateApplier);
    applier.lightEntity = lightEntity;
    applier.panelElement = infoPanel;

    engine.run();
  });
}

function createShowcaseSpheres(engine: WebGLEngine, xrOrigin: Entity): void {
  const showcaseRoot = xrOrigin.createChild("Showcase");
  showcaseRoot.transform.setPosition(0, 0, -1.2);

  const sphereMesh = PrimitiveMesh.createSphere(engine, 0.13, 36);

  const roughnessValues = [0.05, 0.35, 0.75];
  const dielectricColors = [
    new Color(0.95, 0.35, 0.3, 1),
    new Color(0.25, 0.65, 0.95, 1),
    new Color(0.35, 0.9, 0.45, 1)
  ];

  for (let i = 0; i < roughnessValues.length; i++) {
    const x = (i - 1) * 0.34;
    const roughness = roughnessValues[i];

    const metalSphere = showcaseRoot.createChild(`MetalSphere-${i}`);
    metalSphere.transform.setPosition(x, 0.22, 0);
    const metalRenderer = metalSphere.addComponent(MeshRenderer);
    metalRenderer.mesh = sphereMesh;
    const metalMaterial = new PBRMaterial(engine);
    metalMaterial.baseColor = new Color(0.95, 0.95, 0.95, 1);
    metalMaterial.metallic = 1;
    metalMaterial.roughness = roughness;
    metalRenderer.setMaterial(metalMaterial);
    metalSphere.addComponent(RotationScript).speed = 10 + i * 6;

    const dielectricSphere = showcaseRoot.createChild(`DielectricSphere-${i}`);
    dielectricSphere.transform.setPosition(x, -0.18, 0);
    const dielectricRenderer = dielectricSphere.addComponent(MeshRenderer);
    dielectricRenderer.mesh = sphereMesh;
    const dielectricMaterial = new PBRMaterial(engine);
    dielectricMaterial.baseColor = dielectricColors[i];
    dielectricMaterial.metallic = 0;
    dielectricMaterial.roughness = roughness;
    dielectricRenderer.setMaterial(dielectricMaterial);
    dielectricSphere.addComponent(RotationScript).speed = 8 + i * 4;
  }

  const mirrorSphere = showcaseRoot.createChild("MirrorSphere");
  mirrorSphere.transform.setPosition(0, 0.52, 0.08);
  const mirrorRenderer = mirrorSphere.addComponent(MeshRenderer);
  mirrorRenderer.mesh = PrimitiveMesh.createSphere(engine, 0.11, 36);
  const mirrorMaterial = new PBRMaterial(engine);
  mirrorMaterial.baseColor = new Color(1, 1, 1, 1);
  mirrorMaterial.metallic = 1;
  mirrorMaterial.roughness = 0.02;
  mirrorRenderer.setMaterial(mirrorMaterial);
  mirrorSphere.addComponent(RotationScript).speed = 24;
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

function createInfoPanel(): HTMLDivElement {
  const label = document.createElement("div");
  label.textContent = [
    "WebXR Light Estimation",
    "state: booting...",
    "diffuse SH: pending",
    "specular cube: pending"
  ].join("\n");
  label.style.position = "absolute";
  label.style.left = "16px";
  label.style.bottom = "56px";
  label.style.padding = "8px 10px";
  label.style.borderRadius = "6px";
  label.style.background = "rgba(0, 0, 0, 0.65)";
  label.style.color = "#fff";
  label.style.fontSize = "12px";
  label.style.fontFamily = "monospace";
  label.style.lineHeight = "1.45";
  label.style.whiteSpace = "pre";
  document.body.appendChild(label);
  return label;
}

function createLegendPanel(): HTMLDivElement {
  const legend = document.createElement("div");
  legend.textContent = [
    "showcase:",
    "top row: metallic=1.0, roughness=0.05 / 0.35 / 0.75",
    "bottom row: metallic=0.0, roughness=0.05 / 0.35 / 0.75",
    "top center: mirror sphere for reflection probe"
  ].join("\n");
  legend.style.position = "absolute";
  legend.style.left = "16px";
  legend.style.top = "16px";
  legend.style.padding = "8px 10px";
  legend.style.borderRadius = "6px";
  legend.style.background = "rgba(0, 0, 0, 0.55)";
  legend.style.color = "#fff";
  legend.style.fontSize = "11px";
  legend.style.fontFamily = "monospace";
  legend.style.lineHeight = "1.45";
  legend.style.whiteSpace = "pre";
  document.body.appendChild(legend);
  return legend;
}
