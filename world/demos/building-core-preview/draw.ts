// GPU prototype, step 2: the bricks the renderer draws come from GPU-generated records.
// A: records packed on the CPU and uploaded (the current path).
// B: the record texture cleared to zero; the wall must disappear.
// C: records generated on the GPU and copied into the texture inside the GPU; must match A.
import {
  AssetType,
  Camera,
  Color,
  DirectLight,
  Vector3,
  WebGLEngine,
  WebGLMode,
  type PrefabResource,
  type Scene,
  type Texture2D
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
import { designBuildingCore, laidUnit, layingContext } from "@galacean/engine-building/building/core/index";
import { createBuildingTypeRegistry } from "@galacean/engine-building/building/partTypes/index";
import { buildCoreWall } from "@galacean/engine-building/building/application/CoreEuropean";
import { compileCoreBuilding } from "@galacean/engine-building/building/render/CoreBuilding";
import { packConstructionUnits } from "@galacean/engine-building/building/runtime/ConstructionUnitRender";
import type { SupportCell } from "@galacean/engine-building/building/runtime/PlacementSupport";
import { gridKernelInput, GridUnitKernel } from "@galacean/engine-building/building/render/GridUnitKernel";

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
camera.isOrthographic = true;
camera.orthographicSize = 4.2;
camera.entity.transform.setPosition(6, 5, 14);
camera.entity.transform.lookAt(new Vector3(0, 1.1, 0));
const assets = await engine.resourceManager.load<PrefabResource>({
  url: BUILTIN_BUILDING_ASSETS,
  type: AssetType.Prefab
});
const library = buildingAssets(assets);

// Design: the CPU keeps only the layout.
const registry = createBuildingTypeRegistry();
const result = designBuildingCore(buildCoreWall({ id: "w", length: 16, height: 2.5 }), registry);
const part = result.parts[0];
const { renderInput: input } = await compileCoreBuilding(result, registry, { assets: library.compilation });
// One cell per layout slot, so that the renderer's record index is the slot. Empty slots
// become zero-size cells; bricks use the core seed, which the GPU kernel reproduces.
{
  const algorithm = registry.algorithms.get(part.algorithm.type)!;
  const context = layingContext(part, part.unit!, part.layout!.params, registry, {});
  const cells: SupportCell[] = [];
  for (let i = 0; i < part.layout!.count; i++) {
    const spec = algorithm.unitAt(context, part.layout!.data, i);
    const id = `w/slot-${i}`;
    if (!spec) {
      cells.push({
        id,
        logical_id: id,
        anchor_uv: [0, 0],
        center: [0, 0, 0],
        tangent: [1, 0, 0],
        bitangent: [0, 1, 0],
        normal: [0, 0, 1],
        size: [0, 0, 0]
      } as SupportCell);
      continue;
    }
    const u = laidUnit(context, spec);
    cells.push({
      id,
      logical_id: id,
      anchor_uv: [u.frame.origin[0], u.frame.origin[2]],
      center: [...u.frame.origin],
      tangent: [...u.frame.x],
      bitangent: [...u.frame.y],
      normal: [...u.frame.z],
      size: [...u.size!],
      brick_seed: u.seed & 0x7fffffff
    } as SupportCell);
  }
  const group = input.groups[0];
  group.cells = cells;
  input.plans.find((plan) => plan.binding_id === group.binding_id)!.cells = cells;
  group.units = await packConstructionUnits({ cells, slot: 0, role: group.role });
}
const drawn = await renderBuilding(input, {
  parent: scene.createRootEntity("wall"),
  camera,
  assets,
  signal: new AbortController().signal
});
drawn.runtime.root.isActive = true;

// The brick draw and its record texture.
const runtime = drawn.runtime as unknown as {
  draws: Map<string, { renderer: { getMaterial(): { shaderData: { getTexture(n: string): Texture2D } } } }>;
};
const brickId = [...runtime.draws.keys()].find((id) => /brick/.test(id))!;
const records = runtime.draws.get(brickId)!.renderer.getMaterial().shaderData.getTexture("storage_0_1");
const gl = (engine as unknown as { _hardwareRenderer: { gl: WebGL2RenderingContext } })._hardwareRenderer.gl;
const glTexture = (records as unknown as { _platformTexture: { _glTexture: WebGLTexture } })._platformTexture
  ._glTexture;
log(`砖块绘制：${brickId}；记录纹理 ${records.width}×${records.height}；槽位 ${part.layout!.count}`);

/** Writes into the record texture without touching the engine's binding cache. */
function writeRecords(fill: (rows: number, rest: number) => void) {
  const previous = gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  const texels = part.layout!.count * 4,
    rows = Math.floor(texels / records.width),
    rest = texels % records.width;
  fill(rows, rest);
  gl.bindTexture(gl.TEXTURE_2D, previous);
}
function frame(): Uint8Array {
  for (let i = 0; i < 3; i++) engine.update();
  const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
  gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}
const differing = (a: Uint8Array, b: Uint8Array) => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
  return n;
};

const a = frame();
const a2 = frame();
writeRecords((rows, rest) => {
  const zeros = new Uint32Array(records.width * 4 * Math.max(rows, 1));
  if (rows) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, records.width, rows, gl.RGBA_INTEGER, gl.UNSIGNED_INT, zeros);
  if (rest) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, rows, rest, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, zeros);
});
const b = frame();
const kernel = new GridUnitKernel(engine, gridKernelInput(part, 0));
const t = performance.now();
const binding = kernel.run();
const glBuffer = (binding.buffer as unknown as { _platformBuffer: { _glBuffer: WebGLBuffer } })._platformBuffer
  ._glBuffer;
writeRecords((rows, rest) => {
  const previous = gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING);
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, glBuffer);
  if (rows) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, records.width, rows, gl.RGBA_INTEGER, gl.UNSIGNED_INT, 0);
  if (rest)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, rows, rest, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, rows * records.width * 16);
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, previous);
});
const submit = performance.now() - t;
const c = frame();
const total = a.length / 4;
{
  // Diagnosis only: compare the CPU-packed records with the GPU records, slot by slot.
  const cpu = (drawn.runtime as unknown as { storageData: Map<Texture2D, Uint32Array> }).storageData.get(records)!;
  const gpu = kernel.read();
  const cpuBytes = new Uint8Array(cpu.buffer);
  let filledDiff = 0,
    emptyDiff = 0;
  for (let i = 0; i < part.layout!.count; i++) {
    const g = gpu.subarray(i * 64, i * 64 + 64),
      k = cpuBytes.subarray(i * 64, i * 64 + 64);
    const same = g.every((v, j) => v === k[j]);
    if (!same) g.every((v) => v === 0) ? emptyDiff++ : filledDiff++;
  }
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -1,
    y1 = -1;
  const w = gl.drawingBufferWidth;
  for (let i = 0; i < a.length; i += 4)
    if (a[i] !== c[i] || a[i + 1] !== c[i + 1] || a[i + 2] !== c[i + 2]) {
      const p = i / 4,
        x = p % w,
        y = Math.floor(p / w);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  log(`诊断：有效槽位记录不同 ${filledDiff}；空槽位记录不同 ${emptyDiff}；不同像素范围 x ${x0}–${x1}，y ${y0}–${y1}`);
}
log(`对照 A → A（不做任何修改，再画一次）：${differing(a, a2)} / ${total} 个像素不同`);
log(`A → B（清空记录）：${differing(a, b)} / ${total} 个像素变化（墙应当消失）`);
log(`A → C（GPU 生成并在显存内拷贝）：${differing(a, c)} / ${total} 个像素不同（应当与对照相当）`);
log(`GPU 生成并拷贝的提交耗时：${submit.toFixed(2)} ms；记录没有经过 CPU`);
document.body.dataset.done = "1";
engine.run();
