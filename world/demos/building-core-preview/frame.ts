// Per-frame cost of the online building renderer on the seed-world initial village:
// engine update time, per-brick LOD selection on the CPU, and LOD list uploads.
// Measurement page only; it renders through the online path.
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
import { renderBuilding } from "@galacean/engine-building/building/parts/architecture/BuildingRender";
import { designBuilding } from "@galacean/engine-building/building/parts/architecture/BuildingDesign";
import { implementBuilding } from "@galacean/engine-building/building/parts/architecture/BuildingImplementation";
import { initialBuildingDrafts } from "@galacean/engine-world-planning/masonry/BuildingInitialDraft.ts";
import { buildingGenerationPlan } from "../building-components/BuildingGenerationFixture";

registerBuildingAssetComponents();
const out = document.querySelector("#out")!;
const lines: string[] = [];
const log = (s: string) => {
  lines.push(s);
  out.textContent = lines.join("\n");
};
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
engine.canvas.setResolution(canvas.clientWidth, canvas.clientHeight);
engine.resourceManager.registerVirtualResources(await session.resources());
const scene = await engine.resourceManager.load<Scene>({ url: "Preview.scene", type: AssetType.Scene });
engine.sceneManager.activeScene = scene;
scene.ambientLight.diffuseSolidColor = new Color(0.5, 0.5, 0.5, 1);
scene.createRootEntity("Sun").addComponent(DirectLight).entity.transform.setRotation(-40, -25, 0);
const camera = scene.createRootEntity("Camera").addComponent(Camera);
camera.farClipPlane = 1000;
const assets = await engine.resourceManager.load<PrefabResource>({
  url: BUILTIN_BUILDING_ASSETS,
  type: AssetType.Prefab
});
const library = buildingAssets(assets);

// The seed-world initial village through the online path.
const drafts = initialBuildingDrafts(buildingGenerationPlan, library.compilation);
type Runtime = {
  metrics: {
    lodSelectionMs: number;
    lodUploadBytes: number;
    uploadBytes: number;
    residentBytes: number;
    triangles: number;
    fullTriangles: number;
    mediumTriangles: number;
  };
  draws: Map<string, { unitLod?: { selector: { selection: Uint32Array } } }>;
};
const runtimes: Runtime[] = [];
let units = 0;
for (const g of drafts) {
  const result = await implementBuilding(designBuilding(g.draft, () => 0, library.compilation));
  const drawn = await renderBuilding(result.renderInput, {
    parent: scene.createRootEntity("building"),
    camera,
    assets,
    signal: new AbortController().signal
  });
  drawn.runtime.root.isActive = true;
  const runtime = drawn.runtime as unknown as Runtime;
  runtimes.push(runtime);
  for (const d of runtime.draws.values()) units += d.unitLod?.selector.selection.length ?? 0;
}
log(`村子：${drafts.length} 份草稿；参与逐单元 LOD 的单元 ${units} 个`);
log(
  `常驻：上传 ${(runtimes.reduce((n, r) => n + r.metrics.uploadBytes, 0) / 1048576).toFixed(1)} MB；GPU 常驻 ${(runtimes.reduce((n, r) => n + r.metrics.residentBytes, 0) / 1048576).toFixed(1)} MB`
);

const center = new Vector3(60, 0, 50);
function place(angle: number, radius: number) {
  camera.entity.transform.setPosition(center.x + Math.cos(angle) * radius, 25, center.z + Math.sin(angle) * radius);
  camera.entity.transform.lookAt(center);
}
interface Sample {
  update: number;
  lod: number;
  upload: number;
  /** Triangles drawn this frame, and the totals if every unit were drawn at full or low detail. */
  drawn: number;
  full: number;
  low: number;
  /** GPU time of the frame from the timer query, when the device supports it. */
  gpu?: WebGLQuery;
}
const gl = (engine as unknown as { _hardwareRenderer: { gl: WebGL2RenderingContext } })._hardwareRenderer.gl;
const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2") as {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
} | null;
const sum = (f: (r: Runtime) => number) => runtimes.reduce((n, r) => n + f(r), 0);
function measure(frames: number, move: (i: number) => void): Sample[] {
  const samples: Sample[] = [];
  for (let i = 0; i < frames; i++) {
    move(i);
    const before = runtimes.reduce((n, r) => n + r.metrics.lodUploadBytes, 0);
    const query = timer ? gl.createQuery()! : undefined;
    if (query) gl.beginQuery(timer!.TIME_ELAPSED_EXT, query);
    const t = performance.now();
    engine.update();
    const update = performance.now() - t;
    if (query) gl.endQuery(timer!.TIME_ELAPSED_EXT);
    samples.push({
      update,
      lod: sum((r) => r.metrics.lodSelectionMs),
      upload: sum((r) => r.metrics.lodUploadBytes) - before,
      drawn: sum((r) => r.metrics.triangles),
      full: sum((r) => r.metrics.fullTriangles),
      low: sum((r) => r.metrics.mediumTriangles),
      gpu: query
    });
  }
  return samples;
}
const stat = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { mean: xs.reduce((a, b) => a + b, 0) / xs.length, p95: s[Math.floor(s.length * 0.95)], max: s.at(-1)! };
};
/** Waits for the timer queries and returns GPU milliseconds, or undefined when unsupported. */
async function gpuTimes(samples: Sample[]): Promise<number[] | undefined> {
  if (!timer) return;
  // Results arrive a few frames later. Wait a bounded number of frames, then keep what arrived.
  const last = samples.at(-1)!.gpu!;
  for (let tries = 0; tries < 30 && !gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE); tries++)
    await new Promise((r) => requestAnimationFrame(r));
  if (gl.getParameter(timer.GPU_DISJOINT_EXT)) return [];
  const times: number[] = [];
  for (const s of samples) {
    if (gl.getQueryParameter(s.gpu!, gl.QUERY_RESULT_AVAILABLE))
      times.push(gl.getQueryParameter(s.gpu!, gl.QUERY_RESULT) / 1e6);
    gl.deleteQuery(s.gpu!);
  }
  return times;
}
const millions = (n: number) => (n / 1e6).toFixed(2) + " M";
async function report(title: string, samples: Sample[]) {
  const u = stat(samples.map((s) => s.update)),
    l = stat(samples.map((s) => s.lod)),
    b = stat(samples.map((s) => s.upload)),
    d = stat(samples.map((s) => s.drawn)),
    f = stat(samples.map((s) => s.full)),
    w = stat(samples.map((s) => s.low));
  const gpu = await gpuTimes(samples);
  const g = gpu?.length ? stat(gpu) : undefined;
  log(
    `${title}：GPU 时间 ` +
      (g
        ? `平均 ${g.mean.toFixed(2)} ms，p95 ${g.p95.toFixed(2)} ms（${gpu!.length} 帧有效）`
        : "设备不支持计时扩展，未测") +
      `\n  实际绘制三角形：平均 ${millions(d.mean)}，最大 ${millions(d.max)}` +
      `\n  如果 LOD 搬到 GPU 且不能压缩列表：每帧处理约 ${millions(f.mean + w.mean)} 个三角形的顶点（全精度 ${millions(f.mean)} + 低精度 ${millions(w.mean)}），是实际绘制的 ${((f.mean + w.mean) / d.mean).toFixed(1)} 倍`
  );
  log(
    `${title}（${samples.length} 帧）\n` +
      `  引擎每帧 update：平均 ${u.mean.toFixed(2)} ms，p95 ${u.p95.toFixed(2)} ms\n` +
      `  其中 LOD 选择（CPU）：平均 ${l.mean.toFixed(2)} ms，p95 ${l.p95.toFixed(2)} ms，最大 ${l.max.toFixed(2)} ms\n` +
      `  LOD 列表上传：平均 ${(b.mean / 1024).toFixed(1)} KB/帧，最大 ${(b.max / 1024).toFixed(1)} KB/帧`
  );
}
place(0, 90);
measure(20, () => {}); // warm up shaders and caches
await report(
  "相机静止",
  measure(60, () => {})
);
await report(
  "相机绕村子转动（每帧 0.6°，半径 90 米）",
  measure(120, (i) => place(i * 0.0105, 90))
);
await report(
  "相机推近（半径 90 → 30 米）",
  measure(120, (i) => place(0.8, 90 - i * 0.5))
);
document.body.dataset.done = "1";
engine.run();
