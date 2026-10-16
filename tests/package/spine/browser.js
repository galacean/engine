import { WebGLEngine, Camera, Color } from "@galacean/engine";
import "@galacean/engine-spine-core-__FIRST__";

(async () => {
  let engine;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    document.body.appendChild(canvas);
    engine = await WebGLEngine.create({ canvas, graphicDeviceOptions: { preserveDrawingBuffer: true } });
    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor = new Color(0, 0, 0, 1);
    const root = scene.createRootEntity();
    const cameraEntity = root.createChild();
    cameraEntity.transform.setPosition(0, 0, 3);
    const camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    camera.enableHDR = false;

    async function load(version) {
      const resource = await engine.resourceManager.load({ url: `/fixtures/${version}.json`, type: "Spine" });
      const entity = resource.instantiate();
      root.addChild(entity);
      return entity;
    }
    function visible() {
      engine.update();
      const gl = canvas.getContext("webgl2");
      const pixels = new Uint8Array(128 * 128 * 4);
      gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 30) lit++;
      }
      if (gl.getError() !== 0 || lit < 100) throw new Error(`Expected visible geometry, got ${lit}`);
      return lit;
    }

    const first = await load("__FIRST__");
    const firstOnly = visible();
    await import("@galacean/engine-spine-core-__SECOND__");
    const afterRegistration = visible();
    first.isActive = false;
    await load("__SECOND__");
    const secondOnly = visible();
    first.isActive = true;
    const together = visible();
    window.result = { firstOnly, afterRegistration, secondOnly, together };
  } catch (error) {
    window.result = { error: error.stack || String(error) };
  } finally {
    engine?.destroy();
  }
})();
