import type { PlanningScenePart } from "../../semantic-study/WorldPlanningScene";
import { DirectorMask } from "./DirectorMask";
import type { Observer } from "../guidance/VisibilityQuery";
/** Analytic screen-space fixtures rendered by the same GPU pipeline used by live tests. */
export function calibrateDirectorMask() {
  const mask = new DirectorMask(320, 180);
  const camera: Observer = {
    position: { x: 0, y: 0, z: 0 },
    forward: { x: 0, y: 0, z: 1 },
    verticalFovDegrees: 45,
    aspect: 16 / 9,
    columns: 320,
    rows: 180,
    nearM: 0.1,
    terrainStepM: 2
  };
  const quad = (id: string, x0: number, x1: number, y0: number, y1: number, z: number): PlanningScenePart => ({
    id,
    layer: "building",
    color: [1, 1, 1],
    mesh: { positions: [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], indices: [0, 1, 2, 0, 2, 3] }
  });
  const target = quad("target", -2, 2, -2, 2, 10),
    cases: { name: string; pass: boolean; actual: number | null; expected: string }[] = [];
  try {
    mask.setParts([target]);
    const clear = mask.measure(camera, { target: "pull" });
    cases.push({
      name: "无遮挡",
      pass: clear.pull > 0 && clear.occlusion === 0,
      actual: clear.occlusion,
      expected: "0"
    });
    mask.setParts([target, quad("block", -1, 0, -1, 1, 5)]);
    const half = mask.measure(camera, { target: "pull", block: "push" });
    cases.push({
      name: "半遮挡",
      pass: Math.abs(half.occlusion! - 0.5) < 0.02,
      actual: half.occlusion,
      expected: "0.5 ± 0.02"
    });
    const image = mask.image();
    let red = 0,
      blue = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i] === 255) red++;
      if (image.data[i + 2] === 255) blue++;
    }
    cases.push({
      name: "红蓝掩码与报告一致",
      pass:
        Math.abs(red / image.width / image.height - half.push) < 1e-9 &&
        Math.abs(blue / image.width / image.height - half.pull) < 1e-9,
      actual: half.push,
      expected: "逐像素一致"
    });
    mask.setParts([target, quad("block", -1, 1, -1, 1, 5)]);
    const full = mask.measure(camera, { target: "pull" });
    const autoFull = mask.measureObjects(camera, { target: "green" }, new Set(["target"]), true);
    cases.push({
      name: "自动识别未标记的实际遮挡物",
      pass: autoFull.colors?.block === "red" && autoFull.groups.red > 0 && autoFull.occlusion === 1,
      actual: autoFull.occlusion,
      expected: "遮挡物自动红色，目标仍独立为绿色"
    });
    cases.push({
      name: "未标记对象完全遮挡",
      pass: full.occlusion === 1 && full.pull === 0,
      actual: full.occlusion,
      expected: "1"
    });
    const away = mask.measure({ ...camera, forward: { x: 0, y: 0, z: -1 } }, { target: "pull" });
    cases.push({
      name: "视野外",
      pass: away.occlusion === null && away.projectedPull === 0,
      actual: away.occlusion,
      expected: "null"
    });
    mask.setParts([quad("a", -2, 0, -2, 2, 10), quad("b", 0, 2, -2, 2, 10)]);
    const union = mask.measure(camera, { a: "pull", b: "pull" });
    cases.push({
      name: "复合目标并集",
      pass: Math.abs(union.pull - clear.pull) < 0.005,
      actual: union.pull,
      expected: String(clear.pull)
    });
    mask.setParts([quad("cue", -2, 2, 1, 2, 10)]);
    const green = mask.measure(camera, { cue: "cue" }),
      pixels = mask.image();
    let top = 0,
      bottom = 0;
    for (let y = 0; y < 180; y++)
      for (let x = 0; x < 320; x++)
        if (pixels.data[(y * 320 + x) * 4 + 1] === 255) {
          if (y < 90) top++;
          else bottom++;
        }
    cases.push({
      name: "绿色及相机上下方向",
      pass: green.cue > 0 && top > 0 && bottom === 0,
      actual: bottom,
      expected: "物体在上半屏"
    });
    mask.setParts([target]);
    const depth = new Uint8Array(320 * 180 * 4);
    const encoded = Math.floor((5 / 12000) * 16777215);
    for (let y = 0; y < 180; y++)
      for (let x = 0; x < 320; x++) {
        const i = (y * 320 + x) * 4;
        depth[i + 3] = 255;
        if (x < 160) {
          depth[i] = encoded & 255;
          depth[i + 1] = (encoded >> 8) & 255;
          depth[i + 2] = (encoded >> 16) & 255;
        }
      }
    mask.setTerrainDepth(depth);
    const terrainHalf = mask.measure(camera, { target: "pull" });
    const autoTerrain = mask.measureObjects(camera, { target: "green" }, new Set(["target"]), true);
    const terrainImage = mask.image();
    let terrainRed = 0;
    for (let i = 0; i < terrainImage.data.length; i += 4) if (terrainImage.data[i] === 255) terrainRed++;
    cases.push({
      name: "地势只标红实际挡住目标的区域",
      pass: terrainRed === autoTerrain.blockers?.terrain && terrainRed / autoTerrain.pixels === autoTerrain.groups.red,
      actual: terrainRed,
      expected: "图像红像素=地势遮挡像素，不染红整块地面"
    });
    cases.push({
      name: "真实地形深度通道：半屏遮挡与零背景",
      pass: Math.abs(terrainHalf.occlusion! - 0.5) < 0.02 && (terrainHalf.blockers?.terrain ?? 0) > 0,
      actual: terrainHalf.occlusion,
      expected: "0.5 ± 0.02"
    });
    mask.setParts([target, quad("block", -1, 0, -1, 1, 5)]);
    const selected = new Set(["target"]);
    const redTarget = mask.measureObjects(camera, { target: "red", block: "blue" }, selected);
    const greenTarget = mask.measureObjects(camera, { target: "green", block: "red" }, selected);
    cases.push({
      name: "任意颜色与目标独立",
      pass:
        Math.abs(redTarget.occlusion! - 0.5) < 0.02 &&
        redTarget.occlusion === greenTarget.occlusion &&
        redTarget.visibleTarget === greenTarget.visibleTarget &&
        redTarget.groups.red === greenTarget.groups.green,
      actual: redTarget.occlusion,
      expected: "换色不改变0.5遮挡率"
    });
    return { passed: cases.every((c) => c.pass), cases };
  } finally {
    mask.dispose();
  }
}
