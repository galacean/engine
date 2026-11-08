// Prototype check: the GPU lays a wall's bricks from its layout, and the records match
// the CPU reference expansion. Also reports time and memory.
import { WebGLEngine, WebGLMode } from "@galacean/engine";
import { designBuildingCore } from "@galacean/engine-building/building/core/index";
import { createStripRegistry } from "@galacean/engine-building/building/partTypes/Strip";
import { buildCoreWall } from "@galacean/engine-building/building/application/CoreEuropean";
import {
  cpuBrickRecords,
  gridKernelInput,
  GridUnitKernel
} from "@galacean/engine-building/building/render/GridUnitKernel";

const out = document.querySelector("#out")!;
const lines: string[] = [];
const log = (s: string) => {
  lines.push(s);
  out.textContent = lines.join("\n");
};
const engine = await WebGLEngine.create({
  canvas: document.querySelector("canvas")!,
  graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
});

function halfToFloat(bits: number) {
  const s = bits & 0x8000 ? -1 : 1,
    e = (bits >>> 10) & 31,
    f = bits & 1023;
  return s * (e === 0 ? f * 2 ** -24 : e === 31 ? (f ? NaN : Infinity) : (1024 + f) * 2 ** (e - 25));
}
/** Compares two record buffers field by field. */
function compare(gpu: Uint8Array, cpu: Uint8Array) {
  const g = new DataView(gpu.buffer, gpu.byteOffset, gpu.byteLength),
    c = new DataView(cpu.buffer, cpu.byteOffset, cpu.byteLength);
  let identical = 0,
    filled = 0,
    emptyMismatch = 0,
    seedMismatch = 0,
    centerDelta = 0,
    halfDelta = 0;
  const records = cpu.byteLength / 64;
  for (let i = 0; i < records; i++) {
    const o = i * 64;
    let same = true;
    for (let k = 0; k < 64; k++) if (gpu[o + k] !== cpu[o + k]) same = false;
    if (same) identical++;
    const cpuEmpty = cpu.subarray(o, o + 64).every((b) => b === 0),
      gpuEmpty = gpu.subarray(o, o + 64).every((b) => b === 0);
    if (cpuEmpty !== gpuEmpty) emptyMismatch++;
    if (cpuEmpty) continue;
    filled++;
    if (g.getUint32(o + 52, true) !== c.getUint32(o + 52, true)) seedMismatch++;
    for (let k = 0; k < 3; k++)
      centerDelta = Math.max(
        centerDelta,
        Math.abs(g.getFloat32(o + 20 + k * 4, true) - c.getFloat32(o + 20 + k * 4, true))
      );
    for (const k of [0, 2, 4, 6, 8, 10, 12, 14, 16, 40, 42, 44])
      halfDelta = Math.max(
        halfDelta,
        Math.abs(halfToFloat(g.getUint16(o + k, true)) - halfToFloat(c.getUint16(o + k, true)))
      );
  }
  return { records, filled, identical, emptyMismatch, seedMismatch, centerDelta, halfDelta };
}

const cases: [string, number, number][] = [
  ["8 米围墙", 8, 1.5],
  ["100 米 × 3 米", 100, 3],
  ["1000 米 × 4 米", 1000, 4]
];
log("每个用例：设计（只做布局）→ CPU 参考展开并写记录 → GPU 生成记录并读回比较。\n");
for (const [title, length, height] of cases) {
  const registry = createStripRegistry();
  const building = buildCoreWall({ id: "w", length, height });
  let t = performance.now();
  const result = designBuildingCore(building.draft, registry, { validate: false });
  const tDesign = performance.now() - t;
  const part = result.parts[0];
  t = performance.now();
  const cpu = cpuBrickRecords(part, registry, 0);
  const tCpu = performance.now() - t;
  const input = gridKernelInput(part, 0);
  const kernel = new GridUnitKernel(engine, input);
  t = performance.now();
  kernel.run();
  const first = kernel.read();
  const tFirst = performance.now() - t;
  t = performance.now();
  kernel.run();
  const gpu = kernel.read();
  const tSecond = performance.now() - t;
  kernel.destroy();
  const r = compare(gpu, cpu);
  const same = first.every((b, i) => b === gpu[i]);
  log(
    [
      `■ ${title}`,
      `  槽位 ${r.records}，有效单元 ${r.filled}`,
      `  对比：完全相同的记录 ${r.identical}/${r.records}；空槽位判断不一致 ${r.emptyMismatch}；种子不一致 ${r.seedMismatch}`,
      `        中心点最大差 ${r.centerDelta.toExponential(2)} 米；半精度字段最大差 ${r.halfDelta.toExponential(2)}`,
      `  两次 GPU 运行结果一致：${same ? "是" : "否"}`,
      `  耗时：设计（只做布局）${tDesign.toFixed(1)} ms；CPU 展开并写记录 ${tCpu.toFixed(1)} ms；GPU 生成并读回 首次 ${tFirst.toFixed(1)} ms / 第二次 ${tSecond.toFixed(1)} ms`,
      `  内存：CPU 保留的布局 ${JSON.stringify(part.layout).length} 字节；GPU 输入 ${JSON.stringify(input).length} 字节；记录 ${((r.records * 64) / 1024).toFixed(1)} KB 只在 GPU 上`,
      ""
    ].join("\n")
  );
}
document.body.dataset.done = "1";
