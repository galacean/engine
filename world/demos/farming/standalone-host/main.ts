import { Camera, Color, DirectLight, Vector3, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { plantingCatalog } from "@galacean/engine-farming/farming/content/DefaultPlantingCatalog";
import { createPlantInstance, createPlantRenderState, type PlantRenderState } from "@galacean/engine-farming/farming/presentation/index";

/** Example host: external confirmed state only; no farm, layout, persistence or growth clock. */
const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
engine.canvas.setAutoResolution();
const scene = engine.sceneManager.activeScene!;
scene.ambientLight.diffuseSolidColor = new Color(0.65, 0.65, 0.65, 1);
scene.background.solidColor = new Color(0.93, 0.94, 0.92, 1);
const camera = scene.createRootEntity("camera");
camera.addComponent(Camera);
camera.transform.setPosition(4, 3, 5);
camera.transform.lookAt(new Vector3(0, 1, 0));
const light = scene.createRootEntity("light");
light.addComponent(DirectLight);
light.transform.setRotation(-45, 35, 0);
const anchor = scene.createRootEntity("host-anchor");
const abort = new AbortController();
const dispose = () => {
  abort.abort();
  engine.destroy();
};
window.addEventListener("pagehide", dispose, { once: true });
try {
  const state = createPlantRenderState(plantingCatalog, "tomato", "external-1", 0.5);
  const instance = await createPlantInstance(plantingCatalog, engine, anchor, state, abort.signal);
  const update = (confirmed: PlantRenderState) => {
    instance.update(confirmed);
    const query = instance.query();
    document.getElementById("state")!.textContent = `${query.stageName} · ${(query.state.progress * 100).toFixed(1)}%`;
  };
  Object.assign(window, { plantHost: { update, query: () => instance.query(), dispose } });
  update(state);
  engine.run();
} catch (error) {
  document.getElementById("state")!.textContent = String(error);
  dispose();
}
