// M1 acceptance: the online path and the core path, drawn by the same renderer.
// COMPAT(online-parity): this page exists only while both paths coexist; delete it with the
// online path. See packages/building/src/building/MIGRATION.md.
import {
  AssetType,
  Camera,
  Color,
  DirectLight,
  Vector3,
  WebGLEngine,
  type PrefabResource,
  type Scene
} from "@galacean/engine";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import {
  RuntimeProjectStorage,
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
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
import { type BuildingRenderInput } from "@galacean/engine-building/building/runtime/BuildingRenderPackage";
import { designBuildingCore } from "@galacean/engine-building/building/core/index";
import { createBuildingTypeRegistry } from "@galacean/engine-building/building/partTypes/index";
import {
  buildCoreFence,
  buildCoreWall,
  type CoreStripParameters
} from "@galacean/engine-building/building/application/CoreEuropean";
import { compileCoreBuilding } from "@galacean/engine-building/building/render/CoreBuilding";

registerBuildingAssetComponents();
type Ground = (x: number, z: number) => number;
const flat: Ground = () => 0;
/** Rolling ground, standing in for the terrain system's height query. */
const hills: Ground = (x, z) => 0.35 * Math.sin(0.6 * x + 0.3) + 0.2 * Math.cos(0.45 * z);
type Kind = "wall" | "fence";
interface Case {
  readonly id: string;
  readonly title: string;
  readonly kind: Kind;
  readonly params: CoreStripParameters;
  readonly ground: Ground;
  /** Byte parity holds for axis-aligned walls on flat ground; the rest agree to rounding. */
}
const CASES: Case[] = [
  { id: "wall", title: "围墙", kind: "wall", params: { id: "a" }, ground: flat },
  { id: "fence", title: "栅栏", kind: "fence", params: { id: "a" }, ground: flat },
  {
    id: "long",
    title: "长墙 2.2 米高",
    kind: "wall",
    params: { id: "w", seed: 3, length: 11.3, height: 2.2, center: [2, -1] },
    ground: flat
  },
  {
    id: "rot-wall",
    title: "旋转墙",
    kind: "wall",
    params: { id: "r", rotation: 0.7, center: [1, 2] },
    ground: flat
  },
  { id: "hill-wall", title: "起伏地形 · 围墙", kind: "wall", params: { id: "a" }, ground: hills },
  { id: "hill-fence", title: "起伏地形 · 栅栏", kind: "fence", params: { id: "a" }, ground: hills },
  {
    id: "hill-long-fence",
    title: "起伏地形 · 长栅栏",
    kind: "fence",
    params: { id: "g", rotation: -0.4, length: 13 },
    ground: hills
  }
];

const $ = (s: string) => document.querySelector<HTMLElement>(s)!;
const canvas = document.querySelector("canvas")!;
// The built-in asset kit resolves through a project session, as in the building demos.
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
const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
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

const shifted = (p: CoreStripParameters, dz: number): CoreStripParameters => {
  const [x, z] = p.center ?? [0, 0];
  return { ...p, center: [x, z + dz] };
};
// Shifting a strip for the side-by-side view also shifts where it samples the ground,
// so the shifted copy reads the ground as if it stood at the original place.
const groundFor =
  (c: Case, dz: number): Ground =>
  (x, z) =>
    c.ground(x, z - dz);
async function onlineInput(c: Case, p: CoreStripParameters, ground: Ground) {
  const draft = c.kind === "wall" ? European.buildWall(p) : European.buildFence(p);
  return (await implementBuilding(designBuilding(draft, ground, library.compilation))).renderInput;
}
async function coreInput(c: Case, p: CoreStripParameters, ground: Ground) {
  const draft = c.kind === "wall" ? buildCoreWall(p) : buildCoreFence(p);
  const registry = createBuildingTypeRegistry();
  const result = designBuildingCore(draft, registry, { environment: { ground } });
  return (await compileCoreBuilding(result, registry, { environment: { ground }, assets: library.compilation }))
    .renderInput;
}

// ---------- checks ----------
const cellCount = (i: BuildingRenderInput) => i.groups.reduce((n, g) => n + g.cells.length, 0);

async function verify(c: Case) {
  const [online, next] = [await onlineInput(c, c.params, c.ground), await coreInput(c, c.params, c.ground)];
  const [a, b] = [cellCount(online), cellCount(next)];
  return [
    {
      ok: Math.abs(a - b) <= Math.max(2, a * 0.12),
      label: "铺设单元数量相近（相差不超过 12%）",
      detail: `线上 ${a} · 新架构 ${b}`
    },
    { ok: next.groups.length === online.groups.length, label: "绘制组数量相同", detail: `${next.groups.length}` }
  ];
}

// ---------- scene ----------
let current = CASES[0],
  mode: "side" | "flip" = "side",
  showing: "online" | "core" = "online";
let drawn:
  | { online: Awaited<ReturnType<typeof renderBuilding>>; core: Awaited<ReturnType<typeof renderBuilding>> }
  | undefined;
let token = 0;

function frame(c: Case) {
  const [x, z] = c.params.center ?? [0, 0];
  const length = c.params.length ?? 8;
  // Leave room for the panel on the left.
  const target = new Vector3(x - length * 0.12, 0.7, z);
  camera.entity.transform.setPosition(target.x + 9, 9, target.z + 15);
  camera.entity.transform.lookAt(target);
  camera.orthographicSize = Math.max(3.6, length * 0.5);
}
/** Screen labels over each row, refreshed every frame. */
const labels = { online: document.createElement("div"), core: document.createElement("div") };
labels.online.className = labels.core.className = "label";
labels.online.textContent = "线上";
labels.core.textContent = "新架构";
document.body.append(labels.online, labels.core);
const anchors = { online: new Vector3(), core: new Vector3() };
const screen = new Vector3();
function place() {
  for (const k of ["online", "core"] as const) {
    const visible = !!drawn && (mode === "side" || showing === k);
    labels[k].hidden = !visible;
    if (!visible) continue;
    camera.worldToScreenPoint(anchors[k], screen);
    labels[k].style.left = screen.x / devicePixelRatio + "px";
    labels[k].style.top = screen.y / devicePixelRatio + "px";
  }
  requestAnimationFrame(place);
}
requestAnimationFrame(place);
async function show() {
  const my = ++token;
  const c = current;
  const dz = mode === "side" ? 2.6 : 0;
  {
    const [x, z] = c.params.center ?? [0, 0];
    const height = c.params.height ?? 1.5,
      half = (c.params.length ?? 8) / 2,
      [sin, cos] = [Math.sin(c.params.rotation ?? 0), Math.cos(c.params.rotation ?? 0)];
    // Label above the far end of each strip.
    anchors.online.set(x + cos * half, height + 0.35, z - dz + sin * half);
    anchors.core.set(x + cos * half, height + 0.35, z + dz + sin * half);
  }
  const parent = scene.createRootEntity("preview-" + my);
  const signal = new AbortController().signal;
  const [online, next] = [
    await onlineInput(c, shifted(c.params, -dz), groundFor(c, -dz)),
    await coreInput(c, shifted(c.params, dz), groundFor(c, dz))
  ];
  const pair = {
    online: await renderBuilding(online, { parent, camera, assets, signal }),
    core: await renderBuilding(next, { parent, camera, assets, signal })
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
  frame(c);
}
function apply() {
  if (!drawn) return;
  drawn.online.runtime.root.isActive = mode === "side" || showing === "online";
  drawn.core.runtime.root.isActive = mode === "side" || showing === "core";
  const ab = $("#ab");
  ab.hidden = mode !== "flip";
  ab.textContent = showing === "online" ? "当前显示：线上" : "当前显示：新架构";
}
async function select(c: Case) {
  current = c;
  for (const b of document.querySelectorAll<HTMLButtonElement>("#cases button"))
    b.setAttribute("aria-pressed", String(b.dataset.id === c.id));
  $("#checks").innerHTML = `<li><span class="wait">…</span><span>对比中</span></li>`;
  await show();
  const checks = await verify(c);
  if (current !== c) return;
  $("#checks").innerHTML = "";
  for (const k of checks) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="${k.ok ? "ok" : "bad"}">${k.ok ? "✓" : "✕"}</span><span></span><span class="d"></span>`;
    li.children[1].textContent = k.label;
    li.children[2].textContent = k.detail;
    $("#checks").append(li);
  }
  document.body.dataset.ready = c.id;
}

for (const c of CASES) {
  const b = document.createElement("button");
  b.textContent = c.title;
  b.dataset.id = c.id;
  b.onclick = () => void select(c).catch(report);
  $("#cases").append(b);
}
for (const b of document.querySelectorAll<HTMLButtonElement>("#modes button"))
  b.onclick = () => {
    mode = b.dataset.mode as typeof mode;
    for (const x of document.querySelectorAll("#modes button")) x.setAttribute("aria-pressed", String(x === b));
    void show().catch(report);
  };
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || mode !== "flip") return;
  e.preventDefault();
  showing = showing === "online" ? "core" : "online";
  apply();
});
addEventListener("resize", () =>
  engine.canvas.setResolution(canvas.clientWidth * devicePixelRatio, canvas.clientHeight * devicePixelRatio)
);
function report(error: unknown) {
  console.error(error);
  $("#checks").innerHTML = `<li><span class="bad">✕</span><span></span></li>`;
  $("#checks").querySelector("li span:last-child")!.textContent = String((error as Error)?.message ?? error);
}
const initial = CASES.find((c) => c.id === new URL(location.href).searchParams.get("case")) ?? CASES[0];
if (new URL(location.href).searchParams.get("mode") === "flip") {
  mode = "flip";
  for (const x of document.querySelectorAll<HTMLButtonElement>("#modes button"))
    x.setAttribute("aria-pressed", String(x.dataset.mode === "flip"));
}
void select(initial).catch(report);
