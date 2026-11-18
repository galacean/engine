import { AssetType, Camera, DirectLight, Loader, Scene, Vector3, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { registerNativeWater, WaterSystem } from "@galacean/engine-water/water/native/index";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import { NativeWaterHost } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterHost";
import { mountNativeWaterPanel } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterPanel";

registerNativeWater();
const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
const response = await fetch(BUILTIN_WATER_PROJECT_URL);
if (!response.ok) throw new Error(`Water project: HTTP ${response.status}`);
const initial = await response.json(),
  project = await RuntimeProjectSession.open("native-water-editor-v1", initial, BUILTIN_WATER_PROJECT_URL);
await project.prepareEditableHierarchies((name) => Boolean(Loader.getClass(name)));
await project.initializeDependencies();
engine.resourceManager.registerVirtualResources(await project.resources());
const scene = await engine.resourceManager.load<Scene>({
  type: AssetType.Scene,
  url: project.projectPackage.project.scene
});
engine.sceneManager.activeScene = scene;
const native = new RuntimeNativeEditor(project, scene),
  editor = native.editor;
const camera = scene.createRootEntity("Editor camera").addComponent(Camera);
camera.entity.transform.setPosition(10, 10, 13);
camera.entity.transform.lookAt(new Vector3(4, 0, 4));
camera.nearClipPlane = 0.1;
camera.farClipPlane = 100;
scene.createRootEntity("Sun").addComponent(DirectLight).entity.transform.setRotation(-60, 20, 0);
const system = scene.createRootEntity("Water runtime owner").addComponent(WaterSystem);
system.camera = camera;
const host = new NativeWaterHost(project, editor, system);
const signal = new AbortController().signal;
const initialEdit = native.beginEdit(crypto.randomUUID(), signal);
try {
  await initialEdit.prepare(signal);
  await initialEdit.commit();
  await initialEdit.activate(signal);
} finally {
  await initialEdit.complete?.();
}
let closeTask: Promise<void> | undefined;
const close = () =>
  (closeTask ??= (async () => {
    await panel.stop();
    await host.flush().catch(() => {});
    await project.flush();
    panel.destroy();
    host.dispose();
    await system.dispose();
    editor.dispose();
    project.dispose();
    engine.destroy();
    removeEventListener("resize", resize);
    document.body.dataset.ready = "false";
    const message = document.createElement("p");
    message.textContent = "工程已保存并关闭。刷新页面可重新打开。";
    message.style.cssText = "position:fixed;inset:40%;color:white;font:16px system-ui";
    document.body.append(message);
  })().catch((error) => {
    closeTask = undefined;
    panel.resume(error);
    throw error;
  }));
const panel = mountNativeWaterPanel(project, native, { close });
const resize = () => engine.canvas.setResolution(innerWidth, innerHeight);
resize();
addEventListener("resize", resize);
engine.run();
document.body.dataset.ready = "true";
// Exposes the same facade for local tools and browser acceptance, with no second author model.
Object.assign(window, { nativeWaterEditor: { native, host, system, engine, project, editor } });
addEventListener(
  "pagehide",
  () => {
    void close().catch(console.error);
  },
  { once: true }
);
Object.assign(window, { closeNativeWaterEditor: close });
