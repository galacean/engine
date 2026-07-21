import architectureMarkdown from "./pages/architecture.md?raw";
import buoyancyMarkdown from "./pages/buoyancy.md?raw";
import cameraAndDebugMarkdown from "./pages/camera-and-debug.md?raw";
import limitationsMarkdown from "./pages/limitations.md?raw";
import overviewMarkdown from "./pages/overview.md?raw";
import providersMarkdown from "./pages/providers.md?raw";
import quickStartMarkdown from "./pages/quick-start.md?raw";
import riverPipelineMarkdown from "./pages/river-pipeline.md?raw";
import surfaceQueryMarkdown from "./pages/surface-query.md?raw";
import terrainAndFlowMapMarkdown from "./pages/terrain-and-flow-map.md?raw";
import testingAndTroubleshootingMarkdown from "./pages/testing-and-troubleshooting.md?raw";
import waterWorldMarkdown from "./pages/water-world.md?raw";
import wavesAndQualityMarkdown from "./pages/waves-and-quality.md?raw";
import type { WaterWikiPage } from "./model";

export const WATER_WIKI_DEFAULT_SLUG = "overview";

export const WATER_WIKI_PAGES: readonly WaterWikiPage[] = Object.freeze([
  Object.freeze({
    slug: "overview",
    title: "水系统概览",
    summary: "先理解 P0 水系统解决了什么，以及视觉、查询、玩法和相机如何共享同一套水数据。",
    category: "开始",
    keywords: Object.freeze(["架构", "能力矩阵", "P0", "river", "ocean", "pool", "heightfield"]),
    telemetry: Object.freeze(["4 WATER BODY TYPES", "0-FRAME QUERY", "WEBGL2"]),
    relatedCaseId: "curved-main-river",
    relatedCaseLabel: "查看高差河流",
    markdown: overviewMarkdown
  }),
  Object.freeze({
    slug: "quick-start",
    title: "五分钟快速开始",
    summary: "创建水面查询输出、注册一片水体，并在每个物理步读取可见水面。",
    category: "开始",
    keywords: Object.freeze(["quick start", "sample", "register", "示例", "查询"]),
    telemetry: Object.freeze(["REGISTER", "SAMPLE", "REUSE OUTPUT"]),
    relatedCaseId: "water-buoyancy",
    relatedCaseLabel: "查看浮力与水流",
    markdown: quickStartMarkdown
  }),
  Object.freeze({
    slug: "architecture",
    title: "架构与数据生命周期",
    summary: "从 Authoring、校验和 Compiler 一直跟到 Resource、Runtime、查询和 Demo，理解每层真正拥有的数据。",
    category: "开始",
    keywords: Object.freeze(["architecture", "authoring", "compiler", "resource", "runtime", "生命周期"]),
    telemetry: Object.freeze(["AUTHOR ONCE", "COMPILE ONCE", "QUERY MANY"]),
    relatedCaseId: "curved-main-river",
    relatedCaseLabel: "查看完整 River 链路",
    markdown: architectureMarkdown
  }),
  Object.freeze({
    slug: "surface-query",
    title: "WaterSurfaceProvider",
    summary: "统一读取最终水面位置、法线、速度、深度和失败状态。",
    category: "核心 API",
    keywords: Object.freeze(["WaterSurfaceProvider", "batch", "fallback", "normal", "velocity", "depth"]),
    telemetry: Object.freeze(["FINAL SURFACE", "BATCH READY", "CALLER OWNED"]),
    relatedCaseId: "heightfield-water",
    relatedCaseLabel: "查看高度场查询",
    markdown: surfaceQueryMarkdown
  }),
  Object.freeze({
    slug: "water-world",
    title: "WaterWorld 与水体注册",
    summary: "让场景只面对一个查询入口，并在水体重叠时稳定地选出正确结果。",
    category: "核心 API",
    keywords: Object.freeze(["WaterWorld", "WaterBodyRuntime", "priority", "bounds", "registry", "overlap"]),
    telemetry: Object.freeze(["AABB BROAD PHASE", "DETERMINISTIC", "P95 METRICS"]),
    relatedCaseId: "curved-main-river",
    relatedCaseLabel: "查看 WaterWorld 指标",
    markdown: waterWorldMarkdown
  }),
  Object.freeze({
    slug: "providers",
    title: "四类水体 Provider",
    summary: "了解 River、Ocean、Heightfield 和 Pool 的查询能力与当前边界。",
    category: "运行时",
    keywords: Object.freeze(["river", "ocean", "heightfield", "pool", "gerstner", "flow map"]),
    telemetry: Object.freeze(["RIVER", "OCEAN", "HEIGHTFIELD", "POOL"]),
    relatedCaseId: "multi-tributary-river",
    relatedCaseLabel: "查看双支流汇流",
    markdown: providersMarkdown
  }),
  Object.freeze({
    slug: "river-pipeline",
    title: "River 编译、资源与运行时",
    summary: "理解 River 描述文件如何经过确定性编译、Worker 传输、原子提交，最终成为可渲染也可查询的运行时。",
    category: "运行时",
    keywords: Object.freeze(["RiverNetworkCompiler", "RiverResource", "Worker", "chunk", "atomic", "hash"]),
    telemetry: Object.freeze(["DETERMINISTIC", "TRANSFERABLE", "ATOMIC SWAP"]),
    relatedCaseId: "multi-tributary-river",
    relatedCaseLabel: "查看多支流编译结果",
    markdown: riverPipelineMarkdown
  }),
  Object.freeze({
    slug: "terrain-and-flow-map",
    title: "Terrain 边界与局部 FlowMap",
    summary: "明确 Terrain、水面和河床的所有权，并理解局部 RGBA Atlas 如何同时服务 Shader 与 CPU 查询。",
    category: "运行时",
    keywords: Object.freeze(["Terrain", "FlowMap", "local atlas", "SDF", "corridor", "junction", "obstacle"]),
    telemetry: Object.freeze(["RGBA ATLAS", "CPU GPU PARITY", "NO TERRAIN MUTATION"]),
    relatedCaseId: "multi-tributary-river",
    relatedCaseLabel: "查看汇流区局部流场",
    markdown: terrainAndFlowMapMarkdown
  }),
  Object.freeze({
    slug: "waves-and-quality",
    title: "波浪、时间与质量分档",
    summary: "选择 River、Gerstner 或交互高度场，并让波浪预算、时间源、查询精度和渲染档位保持一致。",
    category: "运行时",
    keywords: Object.freeze(["WaterWaveAsset", "Gerstner", "quality", "Low", "Medium", "High", "time"]),
    telemetry: Object.freeze(["0 / 2 / 6 / 12 WAVES", "SHARED TIME", "FIXED BUDGET"]),
    relatedCaseId: "heightfield-water",
    relatedCaseLabel: "查看高度场宏观波浪",
    markdown: wavesAndQualityMarkdown
  }),
  Object.freeze({
    slug: "buoyancy",
    title: "接入 WaterBuoyancy",
    summary: "把统一水面查询接给 PhysX 刚体，让浮力跟随最终波浪和真实水流。",
    category: "接入",
    keywords: Object.freeze(["WaterBuoyancy", "PhysX", "pontoon", "force", "fixed step", "浮力"]),
    telemetry: Object.freeze(["PHYSX", "PONTOON", "FORCE AT POSITION"]),
    relatedCaseId: "water-buoyancy",
    relatedCaseLabel: "运行浮力示例",
    markdown: buoyancyMarkdown
  }),
  Object.freeze({
    slug: "camera-and-debug",
    title: "相机、调试与可观测性",
    summary: "合并多水体的相机纹理需求，并通过浏览器 API 与 Flow 视图定位问题。",
    category: "运维",
    keywords: Object.freeze(["CameraWaterFeatureBroker", "CopyDepth", "CopyColor", "debug", "waterPcgP0"]),
    telemetry: Object.freeze(["ONE DEPTH COPY", "ONE COLOR COPY", "LIVE PROBE"]),
    relatedCaseId: "curved-main-river",
    relatedCaseLabel: "打开 River 调试面板",
    markdown: cameraAndDebugMarkdown
  }),
  Object.freeze({
    slug: "testing-and-troubleshooting",
    title: "测试、验收与排障",
    summary: "用类型检查、聚焦单测、浏览器 Gate 和六阶段调试视图证明能力，而不是只凭画面判断。",
    category: "运维",
    keywords: Object.freeze(["test", "typecheck", "e2e", "smoke", "troubleshooting", "验收", "排障"]),
    telemetry: Object.freeze(["TYPECHECK", "VITEST", "BROWSER GATE"]),
    relatedCaseId: "water-buoyancy",
    relatedCaseLabel: "运行真实 PhysX 示例",
    markdown: testingAndTroubleshootingMarkdown
  }),
  Object.freeze({
    slug: "limitations",
    title: "性能规则与当前边界",
    summary: "开发前先确认 WebGL2、对象复用、候选水体上限以及尚未进入 P0 的能力。",
    category: "运维",
    keywords: Object.freeze(["performance", "WebGL2", "allocation", "limits", "experimental", "P1"]),
    telemetry: Object.freeze(["P0 INCUBATION", "NO PACKAGE EXPORT", "BOUNDED WORK"]),
    relatedCaseId: "indoor-reflective-pool",
    relatedCaseLabel: "查看交互式泳池",
    markdown: limitationsMarkdown
  })
]);

export function findWaterWikiPage(slug: string): WaterWikiPage | undefined {
  return WATER_WIKI_PAGES.find((page) => page.slug === slug);
}
