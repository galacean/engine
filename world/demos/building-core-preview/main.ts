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
import {
  buildBuildingRenderPackage,
  type BuildingRenderInput
} from "@galacean/engine-building/building/runtime/BuildingRenderPackage";
import { buildingGlobals } from "@galacean/engine-building/building/runtime/BuildingGlobals";
import { packConstructionUnits } from "@galacean/engine-building/building/runtime/ConstructionUnitRender";
import { designBuildingCore } from "@galacean/engine-building/building/core/index";
import { createStripRegistry } from "@galacean/engine-building/building/partTypes/Strip";
import {
  buildCoreFence,
  buildCoreWall,
  type CoreStripParameters
} from "@galacean/engine-building/building/application/CoreEuropean";
import { coreRenderInput } from "@galacean/engine-building/building/render/CoreRenderInput";

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
  readonly exact: boolean;
}
const CASES: Case[] = [
  { id: "wall", title: "围墙", kind: "wall", params: { id: "a" }, ground: flat, exact: true },
  { id: "fence", title: "栅栏", kind: "fence", params: { id: "a" }, ground: flat, exact: false },
  {
    id: "long",
    title: "长墙 2.2 米高",
    kind: "wall",
    params: { id: "w", seed: 3, length: 11.3, height: 2.2, center: [2, -1] },
    ground: flat,
    exact: true
  },
  {
    id: "rot-wall",
    title: "旋转墙",
    kind: "wall",
    params: { id: "r", rotation: 0.7, center: [1, 2] },
    ground: flat,
    exact: false
  },
  { id: "hill-wall", title: "起伏地形 · 围墙", kind: "wall", params: { id: "a" }, ground: hills, exact: false },
  { id: "hill-fence", title: "起伏地形 · 栅栏", kind: "fence", params: { id: "a" }, ground: hills, exact: false },
  {
    id: "hill-long-fence",
    title: "起伏地形 · 长栅栏",
    kind: "fence",
    params: { id: "g", rotation: -0.4, length: 13 },
    ground: hills,
    exact: false
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
  const building = c.kind === "wall" ? buildCoreWall(p) : buildCoreFence(p);
  const registry = createStripRegistry();
  const result = designBuildingCore(building.draft, registry, { environment: { ground } });
  return coreRenderInput(result, building.render, registry, ground, library.compilation);
}

// ---------- checks (same definitions as CoreParity.spec.ts) ----------
function zeroSignOnly(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if ((a[i] ^ b[i]) !== 0x80 || (a[i] & 0x7f) !== 0 || i < 1 || a[i - 1] !== 0 || b[i - 1] !== 0) return false;
  }
  return true;
}
async function canonical(input: BuildingRenderInput): Promise<BuildingRenderInput> {
  const zeros = (v: unknown): unknown =>
    v instanceof Uint8Array
      ? v
      : Array.isArray(v)
        ? v.map(zeros)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, zeros(x)]))
          : Object.is(v, -0)
            ? 0
            : v;
  const out = zeros(input) as BuildingRenderInput;
  for (const g of out.groups as any[])
    g.units = await packConstructionUnits({ cells: g.cells, slot: 0, role: g.role, source: {} });
  return out;
}
function maxDelta(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b);
  if (a instanceof Uint8Array || b instanceof Uint8Array) return 0;
  if (Array.isArray(a) !== Array.isArray(b) || typeof a !== typeof b) return Infinity;
  if (a && typeof a === "object") {
    let max = 0;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b as object)]))
      max = Math.max(max, maxDelta((a as any)[k], (b as any)[k]));
    return max;
  }
  return a === b ? 0 : Infinity;
}
async function packageHashes(input: BuildingRenderInput) {
  const built = buildBuildingRenderPackage(input, library, buildingGlobals(input.paletteSlots, library.frame), true);
  const out: Record<string, string> = {};
  for (const file of built.dynamicFiles) {
    const digest = await crypto.subtle.digest("SHA-256", await built.asset(file));
    out[file] = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return out;
}
const cellCount = (i: BuildingRenderInput) => i.groups.reduce((n, g) => n + g.cells.length, 0);

async function verify(c: Case) {
  const [online, next] = [await onlineInput(c, c.params, c.ground), await coreInput(c, c.params, c.ground)];
  const checks: { ok: boolean; label: string; detail: string }[] = [];
  checks.push({
    ok: cellCount(online) === cellCount(next),
    label: "铺设单元数量相同",
    detail: `线上 ${cellCount(online)} · 新架构 ${cellCount(next)}`
  });
  const [a, b] = [await canonical(next), await canonical(online)];
  const delta = maxDelta(a, b);
  checks.push({
    ok: delta < 1e-12,
    label: "所有数值与线上一致（误差 < 1e-12）",
    detail: `最大差值 ${delta.toExponential(2)}`
  });
  if (c.exact) {
    const signOnly = next.groups.every((g, i) =>
      (Object.keys(online.groups[i].units) as (keyof typeof g.units)[]).every((m) =>
        zeroSignOnly(g.units[m], online.groups[i].units[m])
      )
    );
    checks.push({ ok: signOnly, label: "打包缓冲区的差异只有零的符号位", detail: "线上写 -s，s = 0 时得到 -0" });
    const [ha, hb] = [await packageHashes(a), await packageHashes(b)];
    const files = Object.keys(hb);
    const same = files.length > 0 && files.every((f) => ha[f] === hb[f]) && Object.keys(ha).length === files.length;
    checks.push({
      ok: same,
      label: "渲染包逐字节相同（零统一为 +0 后）",
      detail: `${files.length} 个文件 · ${hb[files[0]]?.slice(0, 12) ?? ""}…`
    });
  } else
    checks.push({
      ok: true,
      label: "此用例不要求逐字节相同",
      detail: "栅栏横栏、旋转、起伏地形的计算顺序与线上不同，末位舍入不同"
    });
  return checks;
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
