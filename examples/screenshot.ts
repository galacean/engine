/**
 * @title Screenshot
 * @category Camera
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*0OXcQYHlwzQAAAAAAAAAAAAADiR2AQ/original
 */

import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import {
  AmbientLight,
  Animator,
  AssetType,
  Camera,
  GLTFResource,
  RenderTarget,
  Texture2D,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

const gui = new dat.GUI();

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor.set(0, 0, 0, 0);
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1, 5);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 1, 0);

  // add gltf model
  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb"
    )
    .then((asset) => {
      const { defaultSceneRoot } = asset;
      rootEntity.addChild(defaultSceneRoot);
      const animator = defaultSceneRoot.getComponent(Animator);
      animator.play("run");
    });

  // add ambient light
  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin",
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
    });
  engine.run();

  /** ---------------------------- Capture ---------------------------- */
  let screenshotCanvas: HTMLCanvasElement = null;
  let flipYCanvas: HTMLCanvasElement = null;
  function screenshot(
    camera: Camera,
    width: number,
    height: number,
    flipY = false,
    isPNG = true,
    jpgQuality = 1
  ) {
    if (!screenshotCanvas) {
      screenshotCanvas = document.createElement("canvas");
    }
    let canvas = screenshotCanvas;

    screenshotCanvas.width = width;
    screenshotCanvas.height = height;

    const context = screenshotCanvas.getContext("2d");
    const isPaused = engine.isPaused;
    engine.pause();

    const originalTarget = camera.renderTarget;
    const renderColorTexture = new Texture2D(engine, width, height);
    const renderTargetData = new Uint8Array(width * height * 4);
    const renderTarget = new RenderTarget(
      engine,
      width,
      height,
      renderColorTexture,
      undefined,
      8
    );

    // render to off-screen
    camera.renderTarget = renderTarget;
    camera.aspectRatio = width / height;
    camera.render();

    renderColorTexture.getPixelBuffer(0, 0, width, height, 0, renderTargetData);

    const imageData = context.createImageData(width, height);
    imageData.data.set(renderTargetData);
    context.putImageData(imageData, 0, 0);

    // flip Y
    if (flipY) {
      if (!flipYCanvas) {
        flipYCanvas = document.createElement("canvas");
      }
      canvas = flipYCanvas;

      flipYCanvas.width = width;
      flipYCanvas.height = height;

      const ctx2 = flipYCanvas.getContext("2d");

      ctx2.translate(0, height);
      ctx2.scale(1, -1);
      ctx2.drawImage(screenshotCanvas, 0, 0);
    }

    // download
    canvas.toBlob(
      (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");

        document.body.appendChild(a);
        a.style.display = "none";
        a.href = url;
        a.download = "screenshot";

        a.addEventListener("click", () => {
          if (a.parentElement) {
            a.parentElement.removeChild(a);
          }
        });

        a.click();

        window.URL.revokeObjectURL(url);

        // revert
        camera.renderTarget = originalTarget;
        camera.resetAspectRatio();
        !isPaused && engine.resume();
      },
      isPNG ? "image/png" : "image/jpeg",
      !isPNG && jpgQuality
    );
  }

  function openDebug() {
    const config = {
      width: 1024,
      height: 1024,
      flipY: false,
      isPNG: true,
      jpgQuality: 1,
      screenshot: () => {
        const { width, height, flipY, isPNG, jpgQuality } = config;
        screenshot(camera, width, height, flipY, isPNG, jpgQuality);
      },
    };

    const configFolder = gui.addFolder("config");
    configFolder.add(config, "width", 1, 2048, 1);
    configFolder.add(config, "height", 1, 2048, 1);
    configFolder.add(config, "flipY");
    configFolder.add(config, "isPNG");
    configFolder.add(config, "jpgQuality", 0, 1, 0.01);
    gui.add(config, "screenshot");
  }

  openDebug();
});
