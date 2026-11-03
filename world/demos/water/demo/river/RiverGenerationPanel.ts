import type * as dat from "dat.gui";
import {
  RIVER_GENERATION_MAX_POINT_COUNT,
  type RiverGenerationParameters
} from "@galacean/engine-water/water/index";
import type { RiverEditSession } from "@galacean/engine-water/water/runtime/river/index";

export type RiverGenerationPreset = "straight" | "gentle" | "bends";

export function createRiverGenerationPreset(preset: RiverGenerationPreset = "gentle"): RiverGenerationParameters {
  return {
    seed: 1,
    source: [0, 0.6, -24],
    mouth: [0, 0, 24],
    bounds: { min: [-20, -28], max: [20, 28] },
    meanderAmplitude: preset === "straight" ? 0 : preset === "gentle" ? 4 : 2,
    bendCount: preset === "bends" ? 2 : 1,
    pointCount: 17,
    width: 4,
    flowSpeed: 1
  };
}

/** Parameter inputs are transient. Only the explicit generate action replaces authoring. */
export function createRiverGenerationPanel(
  parent: dat.GUI,
  session: () => RiverEditSession | undefined,
  changed: () => void
) {
  const folder = parent.addFolder("参数化生成");
  const parameters = createRiverGenerationPreset();
  const state = { preset: "gentle" as RiverGenerationPreset };
  const controls: dat.GUIController[] = [];
  const output = document.createElement("output");
  output.dataset.riverGenerationStatus = "true";
  output.style.cssText = "display:block;white-space:pre-wrap;padding:6px;color:#e3edcc;font:12px/1.5 system-ui";
  const row = document.createElement("li");
  row.style.height = "auto";
  row.append(output);
  let message = "",
    sourceKey = "",
    previousSession: RiverEditSession | undefined;
  const load = (p: RiverGenerationParameters) => {
    // Keep objects bound to dat.gui stable when importing another recipe.
    for (const key of ["seed", "meanderAmplitude", "bendCount", "pointCount", "width", "flowSpeed"] as const)
      parameters[key] = p[key];
    parameters.source.splice(0, 3, ...p.source);
    parameters.mouth.splice(0, 3, ...p.mouth);
    parameters.bounds.min.splice(0, 2, ...p.bounds.min);
    parameters.bounds.max.splice(0, 2, ...p.bounds.max);
    controls.forEach((c) => c.updateDisplay());
  };
  folder
    .add(state, "preset", { 直河: "straight", 缓弯河: "gentle", 较多弯曲河: "bends" })
    .name("填入预设")
    .onChange(() => {
      load(createRiverGenerationPreset(state.preset));
      message = "预设已填入；点击生成才会替换控制点。";
      refresh();
    });
  const bind = (target: object, key: string, label: string, min?: number, max?: number, step = 0.01) => {
    const model = target as Record<string, unknown>;
    const c = min === undefined ? folder.add(model, key) : folder.add(model, key, min, max);
    c.name(label)
      .step(step)
      .onFinishChange(() => {
        message = "参数待生成；当前草稿未改变。";
        refresh();
      });
    controls.push(c);
  };
  bind(parameters, "seed", "随机种子", 0, 0xffffffff, 1);
  for (const [key, label] of [
    ["source", "河源"],
    ["mouth", "出口"]
  ] as const)
    for (let axis = 0; axis < 3; axis++)
      bind(parameters[key], String(axis), `${label} ${["X", "水位", "Z"][axis]}（米）`);
  bind(parameters, "meanderAmplitude", "蜿蜒幅度（米）", 0, 20);
  bind(parameters, "bendCount", "弯曲次数", 1, 3, 1);
  const pointCountControl = folder
    .add(parameters, "pointCount")
    .min(9)
    .max(RIVER_GENERATION_MAX_POINT_COUNT)
    .step(1)
    .name("生成控制点数");
  pointCountControl.onFinishChange(() => {
    message = "参数待生成；当前草稿未改变。";
    refresh();
  });
  controls.push(pointCountControl);
  bind(parameters, "width", "生成全宽（米）", 1, 50);
  bind(parameters, "flowSpeed", "生成流速（米/秒）", 0, 10);
  const boundsFolder = folder.addFolder("允许范围（米）");
  for (const [key, name] of [
    ["min", "最小"],
    ["max", "最大"]
  ] as const)
    for (let axis = 0; axis < 2; axis++) {
      const c = boundsFolder
        .add(parameters.bounds[key], axis)
        .name(`${name} ${axis === 0 ? "X" : "Z"}`)
        .step(0.1);
      c.onFinishChange(() => {
        message = "范围待生成；当前草稿未改变。";
        refresh();
      });
      controls.push(c);
    }
  const action = folder
    .add(
      {
        generate: () => {
          const current = session();
          if (!current) return;
          const result = current.generate(parameters);
          changed();
          message = result.ok
            ? `上次生成 ${result.points.length} 点 · 河长 ${result.length.toFixed(2)} m。`
            : `生成失败，保留原草稿：\n${result.diagnostics.map((d) => `${d.path ? `${d.path}：` : ""}${d.message}`).join("\n")}`;
          refresh();
        }
      },
      "generate"
    )
    .name("生成并替换草稿");
  action.domElement.setAttribute("data-river-generate", "true");
  folder.domElement.querySelector("ul")!.append(row);
  folder.open();
  function refresh() {
    const current = session(),
      snapshot = current?.snapshot;
    const source = snapshot?.draft.generation;
    const key = source ? JSON.stringify([source.generatorVersion, source.parameters]) : "";
    if (current !== previousSession || key !== sourceKey) {
      message = "";
      load(source?.parameters ?? createRiverGenerationPreset());
      sourceKey = key;
      previousSession = current;
    }
    const unsupported = snapshot?.generationStatus?.supported === false;
    action.domElement.style.pointerEvents = unsupported ? "none" : "";
    action.domElement.style.opacity = unsupported ? "0.45" : "1";
    action.domElement.setAttribute("aria-disabled", String(unsupported));
    const origin = !source
      ? "当前为手工河流。"
      : `${snapshot?.generationStatus?.modified ? "已手工修改" : "原始生成结果"} · seed ${source.parameters.seed}`;
    const publication = snapshot?.dirty ? "草稿待应用；应用后共同发布河流与河槽。" : "当前草稿与已发布结果一致。";
    output.textContent = `${origin}\n${publication}\n${unsupported ? "未知生成器版本：保留已保存控制点，可继续编辑和应用；此处不能重放。" : "生成将替换当前控制点，保留河槽设置。修改参数不会自动生成。"}${message ? `\n${message}` : ""}`;
  }
  return { refresh };
}
