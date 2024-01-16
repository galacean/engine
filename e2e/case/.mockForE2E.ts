import { Camera, Engine, RenderTarget, Texture2D } from "@galacean/engine-core";

export const updateForE2E = (engine, deltaTime = 100) => {
  engine._vSyncCount = Infinity;
  engine._time._lastSystemTime = 0;
  let times = 0;
  performance.now = function () {
    times++;
    return times * deltaTime;
  };
  for (let i = 0; i < 10; ++i) {
    engine.update();
  }
};

let screenshotCanvas: HTMLCanvasElement = null;
let flipYCanvas: HTMLCanvasElement = null;

export function initScreenshot(
  category: string,
  caseFileName: string,
  engine: Engine,
  camera: Camera,
  width: number = 1200,
  height: number = 800,
  flipY = true,
  isPNG = false,
  jpgQuality = 1
) {
  const imageName = `${category}_${caseFileName}.jpg`;

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
    1
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

      a.href = url;
      a.download = imageName;
      a.id = "screenshot";
      document.body.appendChild(a);

      a.addEventListener("click", () => {
        if (a.parentElement) {
          a.parentElement.removeChild(a);
        }
      });
    },
    isPNG ? "image/png" : "image/jpeg",
    !isPNG && jpgQuality
  );
}
