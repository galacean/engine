import { Camera, Engine, RenderTarget, Texture2D, TextureFormat } from "@galacean/engine-core";

export const updateForE2E = (engine, deltaTime = 100, loopTime = 10) => {
  engine._vSyncCount = Infinity;
  engine._time._lastSystemTime = 0;
  let times = 0;
  performance.now = function () {
    times++;
    return times * deltaTime;
  };
  for (let i = 0; i < loopTime; ++i) {
    engine.update();
  }
  engine._hardwareRenderer._gl.finish();
};

let screenshotCanvas: HTMLCanvasElement = null;
let flipYCanvas: HTMLCanvasElement = null;

export function initScreenshot(
  engine: Engine,
  camera: Camera | Camera[],
  width: number = 1200,
  height: number = 800,
  flipY = false,
  isPNG = false,
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

  const cameras = Array.isArray(camera) ? camera : [camera];
  const callbacks = [];
  const renderColorTexture = new Texture2D(engine, width, height);
  const renderTargetData = new Uint8Array(width * height * 4);
  const renderTarget = new RenderTarget(engine, width, height, renderColorTexture, TextureFormat.Depth24Stencil8, 1);

  cameras.forEach((camera) => {
    const originalTarget = camera.renderTarget;

    // render to off-screen
    camera.renderTarget = renderTarget;
    camera.aspectRatio = width / height;
    camera.render();

    callbacks.push(() => {
      camera.renderTarget = originalTarget;
      camera.resetAspectRatio();
    });
  });

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
      const search = new URLSearchParams(window.location.search);
      const category = search.get("category");
      const caseFileName = search.get("case");
      const imageName = `${category}_${caseFileName}.jpg`;
      a.href = url;
      a.download = imageName;
      a.id = "screenshot";
      document.body.appendChild(a);

      a.addEventListener("click", () => {
        if (a.parentElement) {
          a.parentElement.removeChild(a);
        }
      });

      // window.URL.revokeObjectURL(url);

      // revert
      callbacks.forEach((cb) => cb());
      !isPaused && engine.resume();
    },
    isPNG ? "image/png" : "image/jpeg",
    !isPNG && jpgQuality
  );
}
