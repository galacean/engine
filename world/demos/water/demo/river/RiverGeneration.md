# 阶段 C：可复现的参数化单河流生成

实现基线：`xingyi/water-development@bd2484bbb`。本批为该基线上的未提交变更，2026-09-12 验收。阶段 A/B 和编辑约束、异常清理已在之前的提交中固定。本批复用 River High、不可变 Base Terrain、carve-only modifier、共同发布和历史，不引入新的渲染或查询路径。

## 使用方式

在 `#showcase-river` 选择“河流编辑与河槽”，打开“参数化生成”。

1. 填写参数或填入直河、缓弯河、较多弯曲河预设。此时草稿和已发布水体均不变化。
2. 点击“生成并替换草稿”。成功后替换控制点和生成来源，保留当前河槽设置。生成点默认锁定水面高程，可以继续手工编辑。
3. 点击“应用河流与河槽”，共同发布河床、水体和查询。取消恢复已发布文档；撤销/重做恢复完整已应用状态。
4. “编辑 JSON 导入 / 导出”保存 V3 当前控制点和生成来源。导入不会重新造河；未知生成器版本仍可编辑、应用保存的点，但禁止按当前算法静默重放。

生成失败显示参数路径或控制点诊断，保留草稿、发布结果以及原有待发布任务。不自动换 seed、缩小幅度、缩窄河流或移动端点。生成参数与河槽参数分别维护；雕刻默认仍由原编辑器开关决定。

```ts
const result = window.riverDemo.editor.generate({
  seed: 1,
  source: [0, 0.6, -24],
  mouth: [0, 0, 24],
  bounds: { min: [-20, -28], max: [20, 28] },
  meanderAmplitude: 4,
  bendCount: 1,
  pointCount: 17,
  width: 4,
  flowSpeed: 1
});
if (result.ok) {
  // Optional manual editing and explicit modifier configuration precede publication.
  await window.riverDemo.editor.apply();
}
```

## 参数、版本与实现边界

参数采用水体局部坐标，Y 为水面高程，距离为米，流速为米/秒。`width` 是全宽。

| 参数 | 规则 | 默认 |
| --- | --- | --- |
| seed | uint32 整数 | 1 |
| source / mouth | 固定三维端点，出口不能高于河源 | `[0,0.6,-24]` / `[0,0,24]` |
| bounds | XZ 矩形，须在输入地形范围内 | `[-20,-28]` 至 `[20,28]` |
| meanderAmplitude | 横向偏移上界；0 为直河，几何过急仍可被拒绝 | 4 |
| bendCount | 1–3 | 1 |
| pointCount | 至少 9 的整数；无产品点数上限，受真实数组/几何能力及端点间距校验约束 | 17 |
| width | 全宽 1–50 m，沿程恒定，生成后可逐点改 | 4 |
| flowSpeed | 0–10 m/s，允许静水 | 1 |

直河预设幅度 0、弯曲次数 1；缓弯河为 4/1；较多弯曲河为 2/2。其余默认值相同。实际河长由输出计算，不与固定端点同时再约束目标长度。

`parametric-river-v1` 固定 Mulberry32 的整数运算和两次随机取样顺序，得到两个相位；横向偏移为：

```text
amplitude × sin(πt)² × [0.7sin(2π·bendCount·t + phaseA)
                       + 0.3sin(2π·(bendCount+1)·t + phaseB)]
```

首尾精确覆盖输入端点，内部水面 Y 按累计水平弧长插值。生成的内部坐标及输出河长统一至 1 微米，消除已复现的 Node/Chromium 超越函数浮点尾数差异；作者端点不量化。点 ID 为 `generated-point-N`。几何或随机序列语义修改需要升级生成器版本；默认配方的原始点 hash `e714e9005ed3e7a2` 有固定回归断言。该 hash 表示作者点的 ID、位置、宽度、流速；不包括编辑器高程锁定状态。

- `authoring/river/RiverGenerationParameters.ts`：严格参数契约和复制校验、来源版本。
- `compiler/river/RiverGenerator.ts`：纯作者数据生成，无 DOM/GPU/SeedWorld 依赖；结果含点、长度、hash 和结构化诊断。
- `runtime/river/RiverEditSession.ts`：构造候选、复用输入/预算/高程检查和真实 High 水面网格诊断，检查水面、河槽及地形采样范围；通过后才替换草稿、取消旧任务。
- `compiler/river/RiverEditDiagnostics.ts`：检查生产网格实际顶点覆盖，没有另写近似河岸判断。手工编辑的自交 Warning 在自动生成候选中作为 Error 拒绝。
- `authoring/river/RiverEditDocument.ts`：V3 保存当前点、modifier、terrain 引用及可选 generation；接受 V1/V2。生成来源不进入物理 Source 或 Look。
- `demo/river/RiverGenerationPanel.ts`：三个预设、显式生成、来源/手工修改/发布状态；复用 `RiverEditSession.generate()`。同一接口经 `window.riverDemo.editor.generate()` 对外暴露。

固定地形在 Session 建立时严格校验并捕获冻结；每次草稿修改保留局部采样、高程、拓扑和几何检查，避免再将基础地形送入全量输入扫描。导入和完整编译保留严格地形校验，没有新增公开的“跳过校验”开关。

### UE 对照

参考本地 UE `16d75d847` 的 `UWaterSplineMetadata` 和 `UPCGWaterSplineData::Initialize` / `WriteMetadataToPoint`：水样条携带沿程宽度、深度、流速，PCG 适配器消费既有样条并插值这些属性。源码位于 `Engine/Plugins/Experimental/Water/.../WaterSplineMetadata.h` 和 `Engine/Plugins/Experimental/PCGInterops/PCGWaterInterop/.../PCGWaterSplineData.cpp`。

Galacean 采用米制、Polyline 和现有沿程作者属性，河床目标深度归独立 modifier。上述正弦参数化算法由 Galacean 实现，不来自 UE 的自然河网算法；也不把 `PCGWaterSplineData` 的“读取样条”描述成“自动从地形生成河流”。当前不支持山谷自动寻路、流域解算、多支流、多 modifier 编辑或水动力模拟。

## 2026-09-12 验收

证据目录：`/Users/xingyi/Documents/Codex/2026-09-12/river-generation/`。`source-manifest.json` 记录受验源码 SHA256 和基线；`build.log`、`tests.log`、`typecheck.log` 记录构建/类型与测试结果。生产预览为 `http://127.0.0.1:4199/#showcase-river`，使用 Codex 内置 Chromium；不启动用户本地浏览器。

| 计划验收 | 实测结果 | 证据 |
| --- | --- | --- |
| 确定性与约束 | 同版本/同参数点和 hash 相同；固定默认 hash；Node 与内置 Chromium 的 100 个 seed 点/长度/hash 逐项对照；准确端点、单调水面、0 流速/幅度；非法 seed、退化端点、逆坡、坡度超限、越界和折叠均拒绝 | `tests/runtime/RiverGeneration.test.ts` |
| 生成正确性 | 三个预设均完成 High 编译；默认 seed 0–99 全部通过 Session 候选校验和包含匹配派生河床的完整编译 | 同上，100 次循环在测试内部执行 |
| 保存与状态 | V3 手工修改后往返，V1/V2 兼容，未知版本恢复/阻止重放，非法导入与失败生成不改状态；成功生成只改草稿 | 单元测试、`browser-checks.json`、`ui-checks.json` |
| 联合发布 | modifier 保留、床高查询匹配可见地形、取消/撤销/重做/删除恢复，旧异步发布被新生成取消；248 个观测帧无混合版本 | 最终生产构建 39/39 浏览器检查 |
| 校验成本 | 重复草稿更新不再逐项读完整基础高度数组；2 点短河流 CPU 对照见下表 | 工作量断言、`performance.cjs` / `.json` |
| 浏览器与回归 | 真实键盘 seed、显式按钮、预设不覆写、WASD/QE 焦点隔离、JSON 对话框、未知版本提示、窗口调整；四个原 River 场景仍有 SSR 接收者绘制 | 8/8 面板检查；四场景 bodyCount=1、SSR draw>0；`ui-checks.json`、`views.json` |
| 资源 | 2 次暖机后 10 次生成/应用，以及 2 次暖机后 10 次场景离开/重入，观测到的 GPU 存活数量稳定；每次只保留一个编辑面板和 overlay | `browser-checks.json` 的 resources；计数从安装监测后开始，不宣称是全部历史资源总量 |

Water 回归包括 River compiler/runtime/material、Host、连接 compiler/binding 和岚湾岛 Source/连接集成测试，共 **33 文件、232 项通过**；类型检查、生产构建通过。联合案例的证据为上述自动化测试，本批未重新执行整套 Lake/Ocean/Island 画面验收；生成代码没有更改共享水面着色或 Overlay SSR。

固定时间 `t=0`，默认生成配方和显式 3 m 目标河槽：

- Base：`mock-editing`，revision `1`，content hash `4e5ddca0b5b89d74`。
- Derived：`mock-editing:river-derived`，最终记录 revision `2`，content hash `0fb26c06fff44aee`。
- 已发布 Water Source hash：`81ef8a1af5d631b7`。可见水深随插值后的实际床高变化，目标床深不是屏幕透明度参数。
- 截图：`top.png`、`low2.png`、`low5.png`、`low15.png`；相机位置、画布尺寸、时间和 WebGL 状态见 `views.json`。低角度未见新生成的折叠面或裂缝，保留现有环境反射暗部。本批不重新宣告 F1—F7 全套光学标定通过。
- 调整窗口到 1100×720 时画布同步，查询与编辑状态保留；之后恢复默认窗口。截图 `resize-1100x720.png`。
- 控制台 warning/error、失败网络请求、HTTP 错误和运行时异常见 `console.json`、`browser-errors.json`，本轮未发现；WebGL 检查均为 0。

### 固定地形校验 CPU 对照

同一 Node v26.0.0 进程加载基线 `bd2484bbb` 与当前 Session；10 m、2 控制点短河流，单次 `patchPoint + snapshot`，3 次暖机、7 次取中位数。其余依赖相同。此表是编辑校验微基准，不是 FPS、GPU 时间或移动端结论。

| 高度网格 | 基线中位数 | 当前中位数 |
| --- | --- | --- |
| 129² | 0.369 ms | 0.172 ms |
| 513² | 1.057 ms | 0.133 ms |
| 1024² | 3.948 ms | 0.117 ms |

测试通过数不包括性能脚本次数，100 seed 编译包含在一个循环测试中，不另算 100 条测试。Vite 仍提示已有的大 chunk 警告；未为该警告扩大拆包范围。
