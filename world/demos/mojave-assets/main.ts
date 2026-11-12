import {
  AssetType,
  Camera,
  Color,
  DirectLight,
  GLTFResource,
  MeshRenderer,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls/dist/es/OrbitControl.js";
import catalog from "./assets/catalog.json";
const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
engine.canvas.setAutoResolution();
const scene = engine.sceneManager.activeScene!;
scene.background.solidColor = new Color(0.16, 0.18, 0.19, 1);
scene.ambientLight.diffuseSolidColor = new Color(0.65, 0.65, 0.65, 1);
const root = scene.createRootEntity();
const cameraEntity = root.createChild("Camera");
const camera = cameraEntity.addComponent(Camera);
camera.farClipPlane = 200;
const orbit = cameraEntity.addComponent(OrbitControl);
const sun = root.createChild("Sun");
sun.transform.setRotation(45, 45, 0);
sun.addComponent(DirectLight).color = new Color(1, 0.908, 0.78, 1);
let model: ReturnType<typeof root.createChild> | undefined;
let revision = 0;
const status = document.querySelector("#status")!;
async function select(item: (typeof catalog)[number]) {
  const current = ++revision;
  status.textContent = `加载 ${item.id}…`;
  const resource = await engine.resourceManager.load<GLTFResource>({
    type: AssetType.GLTF,
    url: new URL(`./assets/${item.id}.glb`, import.meta.url).href
  });
  if (current !== revision) return;
  model?.destroy();
  model = resource.instantiateSceneRoot();
  root.addChild(model);
  for (const r of model.getComponentsIncludeChildren(MeshRenderer, [])) r.enabled = r.entity.name === "LOD0";
  const size = Math.max(...item.size);
  orbit.target = new Vector3(0, item.size[1] * 0.45, 0);
  cameraEntity.transform.setPosition(size * 1.2, size * 0.8, size * 1.4);
  cameraEntity.transform.lookAt(orbit.target);
  status.textContent = `${item.id} · ${item.name} · ${item.size.map((v) => v.toFixed(1)).join(" × ")} 米`;
  document.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === item.id)));
}
for (const item of catalog) {
  const b = document.createElement("button");
  b.dataset.id = item.id;
  b.innerHTML = `${item.id} · ${item.id.startsWith("A") ? "岩石组" : "单石"}<small>${item.name} · ${item.triangles.join(" / ")} 面</small>`;
  b.onclick = () => void select(item);
  document.querySelector("#list")!.append(b);
}
window.addEventListener("resize", () => engine.canvas.setAutoResolution());
engine.run();
await select(catalog[0]);
