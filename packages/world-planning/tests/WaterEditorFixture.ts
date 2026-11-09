import { AssetType, Camera, DirectLight, Scene, Vector3, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { registerNativeWater, WaterSystem } from "@galacean/engine-water/water/native/index";
import { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { NativeWaterHost } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterHost";
import { NativeWaterEditor } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";

export async function openWaterEditorFixture(
  id: string,
  manifest: Parameters<typeof RuntimeProjectSession.open>[1],
  baseURL = location.href
) {
  registerNativeWater();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  document.body.append(canvas);
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  const project = await RuntimeProjectSession.open(id, manifest, baseURL);
  await project.initializeDependencies();
  engine.resourceManager.registerVirtualResources(await project.resources());
  const scene = await engine.resourceManager.load<Scene>({ type: AssetType.Scene, url: manifest.scene });
  engine.sceneManager.activeScene = scene;
  const editor = new RuntimeEditor(project, scene);
  const camera = scene.createRootEntity("Camera").addComponent(Camera);
  camera.entity.transform.setPosition(4, 7, 10);
  camera.entity.transform.lookAt(new Vector3(4, 0.5, 4));
  scene.createRootEntity("Sun").addComponent(DirectLight).entity.transform.setRotation(-60, 20, 0);
  const system = scene.createRootEntity("Water owner").addComponent(WaterSystem);
  system.camera = camera;
  const host = new NativeWaterHost(project, editor, system),
    water = new NativeWaterEditor(project, editor);
  return {
    engine,
    canvas,
    project,
    editor,
    system,
    water,
    host,
    async close() {
      await water.close();
      host.dispose();
      await system.dispose();
      editor.dispose();
      project.dispose();
      engine.destroy();
      canvas.remove();
    }
  };
}
