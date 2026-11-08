// M2 acceptance: online houses (native masonry) next to core houses (masonryCourses walls).
// COMPAT(online-parity): validation page; see packages/building/src/building/MIGRATION.md.
import {
  AssetType,
  Camera,
  Color,
  DirectLight,
  Vector3,
  WebGLEngine,
  WebGLMode,
  type PrefabResource,
  type Scene
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import {
  RuntimeProjectStorage,
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import {
  registerBuildingAssetComponents,
  buildingAssets
} from "@galacean/engine-building/building/resources/BuildingAssetKit";
import {
  builtinBuildingAssetFiles,
  BUILTIN_BUILDING_ASSETS
} from "@galacean/engine-building/building/resources/BuiltinBuildingAssets";
import { European } from "@galacean/engine-building/building/parts/architecture/European";
import { designBuilding } from "@galacean/engine-building/building/parts/architecture/BuildingDesign";
import { implementBuilding } from "@galacean/engine-building/building/parts/architecture/BuildingImplementation";
import { renderBuilding } from "@galacean/engine-building/building/parts/architecture/BuildingRender";
import { createBuildingRegistry, designBuildingCore } from "@galacean/engine-building/building/core/index";
import { registerHouseTypes } from "@galacean/engine-building/building/partTypes/House";
import { buildCoreHouse, type CoreHouseParameters } from "@galacean/engine-building/building/application/CoreEuropean";
import { coreHouseRenderInput } from "@galacean/engine-building/building/render/CoreHouseRender";

registerBuildingAssetComponents();
type Ground = (x: number, z: number) => number;
const flat: Ground = () => 0;
const hills: Ground = (x, z) => 0.35 * Math.sin(0.6 * x + 0.3) + 0.2 * Math.cos(0.45 * z);
interface Case {
  id: string;
  title: string;
  house: CoreHouseParameters;
  ground: Ground;
}
const CASES: Case[] = [
  { id: "house", title: "默认房屋", house: { id: "a" }, ground: flat },
  { id: "tall", title: "高房屋 9 米", house: { id: "a", height: 9 }, ground: flat },
  { id: "steep", title: "陡屋顶", house: { id: "a", roof: { height: 0.8, eave: 0.4 } }, ground: flat },
  { id: "gable", title: "山墙屋顶", house: { id: "a", roof: { ridge_length: 1 } }, ground: flat },
  {
    id: "rotated",
    title: "旋转房屋 10 × 7",
    house: { id: "a", rectangle: { center: [0, 0], size: [10, 7], rotation: 0.6 } },
    ground: flat
  },
  { id: "flat", title: "平屋顶", house: { id: "a", roof: { height: 0 } }, ground: flat },
  {
    id: "tower",
    title: "圆塔",
    house: { id: "a", height: 10, circle: { center: [0, 0], radius: 2.5, phase: 0 } },
    ground: flat
  },
  {
    id: "hills",
    title: "起伏地形",
    house: { id: "a", rectangle: { center: [0, 0], size: [9, 6], rotation: 0.3 } },
    ground: hills
  }
];

const $ = (s: string) => document.querySelector<HTMLElement>(s)!;
const params = new URL(location.href).searchParams;
const PROJECT = "building-core-preview-v1";
const project: RuntimeProjectPackage = {
  version: RUNTIME_PROJECT_SAVE_VERSION,
  project: {
    scene: "Preview.scene",
    files: [
      { virtualPath: "Preview.scene", path: "Preview.scene", type: "Scene", dependencies: [] },
      ...builtinBuildingAssetFiles
    ]
  },
  contents: {
    "Preview.scene": JSON.stringify({
      asset: { version: "2.0" },
      scene: { rootEntities: [], background: { mode: 0, color: { r: 0.11, g: 0.14, b: 0.16, a: 1 } } },
      entities: [],
      components: []
    })
  }
};
const storage = await RuntimeProjectStorage.open();
try {
  await storage.save(PROJECT, project);
} finally {
  storage.close();
}
const session = await RuntimeProjectSession.open(PROJECT, project.project, location.href);
await session.initializeDependencies();
const canvas = document.querySelector("canvas")!;
const engine = await WebGLEngine.create({
  canvas,
  shaderCompiler: new ShaderCompiler(),
  graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
});
engine.canvas.setResolution(canvas.clientWidth * devicePixelRatio, canvas.clientHeight * devicePixelRatio);
engine.resourceManager.registerVirtualResources(await session.resources());
const scene = await engine.resourceManager.load<Scene>({ url: "Preview.scene", type: AssetType.Scene });
engine.sceneManager.activeScene = scene;
scene.ambientLight.diffuseSolidColor = new Color(0.5, 0.5, 0.5, 1);
scene.createRootEntity("Sun").addComponent(DirectLight).entity.transform.setRotation(-40, -25, 0);
const camera = scene.createRootEntity("Camera").addComponent(Camera);
camera.isOrthographic = true;
const assets = await engine.resourceManager.load<PrefabResource>({
  url: BUILTIN_BUILDING_ASSETS,
  type: AssetType.Prefab
});
const library = buildingAssets(assets);
engine.run();

// The two copies stand side by side along x; each samples the ground as if it stood at the origin.
const SPACING = 13;
const moved = (c: Case, dx: number): CoreHouseParameters => {
  const h = c.house;
  if (h.circle) return { ...h, circle: { ...h.circle, center: [h.circle.center[0] + dx, h.circle.center[1]] } };
  const r = h.rectangle ?? { center: [0, 0] as [number, number], size: [8, 6] as [number, number], rotation: 0 };
  return { ...h, rectangle: { ...r, center: [r.center[0] + dx, r.center[1]] } };
};
const groundFor =
  (c: Case, dx: number): Ground =>
  (x, z) =>
    c.ground(x - dx, z);
async function online(c: Case, dx: number) {
  const { walls: _w, footprint: _f, ...p } = moved(c, dx);
  return (
    await implementBuilding(designBuilding(European.buildHouses(p as never), groundFor(c, dx), library.compilation))
  ).renderInput;
}
async function core(c: Case, dx: number) {
  const registry = registerHouseTypes(createBuildingRegistry());
  const house = moved(c, dx),
    ground = groundFor(c, dx);
  const result = designBuildingCore(buildCoreHouse(house), registry, { environment: { ground } });
  const wall = result.parts.find((p) => p.type === "wall")!;
  return {
    input: await coreHouseRenderInput(result, registry, house, ground, library.compilation),
    layoutBytes: JSON.stringify(wall.layout).length
  };
}

let current = CASES[0],
  mode: "side" | "flip" = "side",
  showing: "online" | "core" = "online",
  token = 0;
let drawn:
  | { online: Awaited<ReturnType<typeof renderBuilding>>; core: Awaited<ReturnType<typeof renderBuilding>> }
  | undefined;
async function show() {
  const my = ++token,
    c = current;
  const dx = mode === "side" ? SPACING / 2 : 0;
  const parent = scene.createRootEntity("preview-" + my);
  const signal = new AbortController().signal;
  const a = await online(c, -dx),
    b = await core(c, dx);
  const pair = {
    online: await renderBuilding(a, { parent, camera, assets, signal }),
    core: await renderBuilding(b.input, { parent, camera, assets, signal })
  };
  if (my !== token) {
    pair.online.destroy();
    pair.core.destroy();
    parent.destroy();
    return;
  }
  drawn?.online.destroy();
  drawn?.core.destroy();
  for (const e of scene.rootEntities) if (e.name.startsWith("preview-") && e !== parent) e.destroy();
  drawn = pair;
  showing = "online";
  apply();
  const height = c.house.height ?? 4;
  camera.entity.transform.setPosition(16, 12 + height, 30);
  camera.entity.transform.lookAt(new Vector3(0, height * 0.55, 0));
  // `zoom` in the URL magnifies the view for close comparison; `yaw` turns the camera (degrees).
  const zoom = Number(params.get("zoom") ?? 1),
    yaw = (Number(params.get("yaw") ?? 0) * Math.PI) / 180;
  const [ox, oz] = [16 * Math.cos(yaw) - 30 * Math.sin(yaw), 16 * Math.sin(yaw) + 30 * Math.cos(yaw)];
  camera.entity.transform.setPosition(ox, 12 + height, oz);
  camera.entity.transform.lookAt(new Vector3(0, height * 0.55, 0));
  camera.orthographicSize = (mode === "side" ? 9 + height * 0.25 : 6 + height * 0.3) / zoom;
  const wallCount = (input: typeof a) =>
    input.groups.filter((g) => g.role === "wall").reduce((n, g) => n + g.cells.length, 0);
  $("#checks").innerHTML = "";
  for (const [label, detail] of [
    ["墙砖数量", `线上 ${wallCount(a)} · 新架构 ${wallCount(b.input)}`],
    ["新架构墙体保留的布局", `${b.layoutBytes} 字节（不保存砖块，按需展开）`],
    ["左右位置", mode === "side" ? "左：线上 · 右：新架构" : "同位交替，按空格切换"]
  ]) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="ok">•</span><span></span><span class="d"></span>`;
    li.children[1].textContent = label;
    li.children[2].textContent = detail;
    $("#checks").append(li);
  }
  document.body.dataset.ready = c.id;
}
function apply() {
  if (!drawn) return;
  drawn.online.runtime.root.isActive = mode === "side" || showing === "online";
  drawn.core.runtime.root.isActive = mode === "side" || showing === "core";
  $("#ab").hidden = mode !== "flip";
  $("#ab").textContent = showing === "online" ? "当前显示：线上" : "当前显示：新架构";
}
function select(c: Case) {
  current = c;
  for (const b of document.querySelectorAll<HTMLButtonElement>("#cases button"))
    b.setAttribute("aria-pressed", String(b.dataset.id === c.id));
  $("#checks").innerHTML = `<li><span class="wait">…</span><span>生成中</span></li>`;
  void show().catch(report);
}
for (const c of CASES) {
  const b = document.createElement("button");
  b.textContent = c.title;
  b.dataset.id = c.id;
  b.onclick = () => select(c);
  $("#cases").append(b);
}
for (const b of document.querySelectorAll<HTMLButtonElement>("#modes button"))
  b.onclick = () => {
    mode = b.dataset.mode as typeof mode;
    for (const x of document.querySelectorAll("#modes button")) x.setAttribute("aria-pressed", String(x === b));
    select(current);
  };
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || mode !== "flip") return;
  e.preventDefault();
  showing = showing === "online" ? "core" : "online";
  apply();
});
function report(error: unknown) {
  console.error(error);
  $("#checks").innerHTML = `<li><span class="bad">✕</span><span></span></li>`;
  $("#checks").querySelector("li span:last-child")!.textContent = String((error as Error)?.message ?? error);
}
if (params.get("mode") === "flip") {
  mode = "flip";
  for (const x of document.querySelectorAll<HTMLButtonElement>("#modes button"))
    x.setAttribute("aria-pressed", String(x.dataset.mode === "flip"));
}
select(CASES.find((c) => c.id === params.get("case")) ?? CASES[0]);
