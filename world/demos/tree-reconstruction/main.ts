export {};

interface VisualPartMetric {
  similarity: number;
  error: number;
}

interface VisualReport {
  passesTenPercent: boolean;
  visualMaximumError: number;
  visualMeanError: number;
  ruleMaximumError: number;
  alignment: { bestYawDegrees: number };
  visualViews: Record<string, Record<string, VisualPartMetric>>;
}

interface RuleLevel {
  count: number;
  rootHeightRatioQuantiles: number[];
  pathLengthRatioQuantiles: number[];
  upAngleDegreesQuantiles: number[];
}

interface SourceAnalysisReport {
  height: number;
  branchCounts: [number, number, number];
  inferredRules: {
    trunk: { count: number; height: number; baseRadius: number; tipRadius: number; centerlineSamples: number };
    primaryBranches: RuleLevel;
    secondaryBranches: RuleLevel;
    leaves: {
      cards: number;
      cardWidthQuantiles: number[];
      cardHeightQuantiles: number[];
      centerHeightRatioQuantiles: number[];
      nearestStemDistanceRatioQuantiles: number[];
      branchProgressQuantiles: number[];
      terminalLeafRatio: number;
      leafBearingStemRatio: number;
      leavesPerStemQuantiles: number[];
    };
  };
}

interface RuntimeLodReport {
  level: number;
  branchCounts: [number, number, number];
  leafCards: number;
  trunkTriangles: number;
  leafTriangles: number;
  triangles: number;
  radialSegments: [number, number, number];
  curveSegments: [number, number, number];
}

interface AnalysisReport {
  proceduralAlgorithm: string;
  runtimeGeometryInput: string;
  runtimeBlueprintAllowed: boolean;
  inverseFit: {
    method: string;
    evaluatedCandidates: number;
    objective: number;
    parameterCount: number;
    stages: { stage: "trunk" | "branches" | "leaves"; objective: number; evaluatedCandidates: number }[];
  };
  reconstruction: { lods: RuntimeLodReport[] };
}

interface RecipeReport {
  schema: "galacean/procedural-tree-recipe-v4";
  profile: string;
  size: number;
  distributionTuning: Record<string, number>;
  leafCountTuning: { lod0Count: number; lod1Count: number; lod2Count: number; lod3Count: number };
  foliageTuning: { widthScale: number; heightScale: number; additiveHalfExtent: number };
}

interface FeatureGapReport {
  parameterOnlyReconstruction: boolean;
  measuredGeometryUsedAtRuntime: boolean;
  passesTenPercent: boolean;
  missingCapabilities: {
    id: string;
    label: string;
    evidence: Record<string, unknown>;
    requiredCapability: string;
  }[];
}

interface TreeCase {
  assetId: string;
  label: string;
  createdAt: string | null;
  baseUrl: string;
  acceptance: {
    triangleLimit: number;
    maximumTriangles: number;
    visualMaximumError: number;
    ruleMaximumError: number;
    maximumError: number;
    passesTenPercent: boolean;
    directMeshValidationPasses: boolean;
    passes: boolean;
    comparisonOrder?: ("trunk" | "branches" | "leaves")[];
    comparisonStages?: {
      stage: "trunk" | "branches" | "leaves";
      dependsOn: "trunk" | "branches" | null;
      status: "passed" | "failed" | "blocked";
      eligible: boolean;
      ruleMaximumError: number;
      visualMaximumError: number;
      maximumError: number;
      parametersLocked: boolean;
    }[];
    lodAcceptance?: {
      stage: "lod0-lod3";
      dependsOn: "leaves";
      status: "passed" | "failed" | "blocked";
      eligible: boolean;
      complete: boolean;
      strictlyDescending: boolean;
      withinTriangleBudget: boolean;
    };
  };
  reports: { sourceAnalysis: string; recipe: string; visual: string; analysis: string; featureGaps: string };
  files: { label: string; url: string }[];
}

interface ReconstructionStatus {
  available: boolean;
  blenderVersion: string | null;
  maxFileBytes: number;
  triangleLimit: number;
  acceptedExtensions: string[];
  cases: TreeCase[];
}

const endpoint = "/api/asset-assembly/tree-reconstruction";
const form = requireElement("reconstructionForm") as HTMLFormElement;
const fileInput = requireElement("unityTreeFile") as HTMLInputElement;
const labelInput = requireElement("treeLabel") as HTMLInputElement;
const assetIdInput = requireElement("treeAssetId") as HTMLInputElement;
const profileInput = requireElement("treeProfile") as HTMLSelectElement;
const submitButton = requireElement("startReconstruction") as HTMLButtonElement;
const caseSelect = requireElement("caseSelect") as HTMLSelectElement;
const progress = requireElement("reconstructionProgress");

let serviceAvailable = false;
let maximumUploadBytes = 512 * 1024 * 1024;
let assetIdWasEdited = false;
let submitting = false;
let currentCase: TreeCase;
let visual: VisualReport;
let sourceAnalysis: SourceAnalysisReport;
let recipe: RecipeReport;
let featureGaps: FeatureGapReport;
let analysis: AnalysisReport;
let assetRoot = "";
let activeView = "front";
let activePart = "geometry";

const sourceImage = requireImage("sourceImage");
const reconstructionImage = requireImage("reconstructionImage");
const wipeSource = requireImage("wipeSource");
const wipeReconstruction = requireImage("wipeReconstruction");
const overlayImage = requireImage("overlayImage");
const wipeAfter = requireElement("wipeAfter");
const wipeDivider = requireElement("wipeDivider");
const wipeRange = requireElement("wipeRange") as HTMLInputElement;
const wipeValue = requireElement("wipeValue");
const activeViewMetric = requireElement("activeViewMetric");

bindTabs("viewTabs", (value) => {
  activeView = value;
  updateImages();
});
bindTabs("partTabs", (value) => {
  activePart = value;
  updateImages();
});
wipeRange.addEventListener("input", updateWipe);
caseSelect.addEventListener("change", () => void selectCase(caseSelect.value));
assetIdInput.addEventListener("input", () => {
  assetIdWasEdited = assetIdInput.value.length > 0;
  updateSubmitState();
});
labelInput.addEventListener("input", updateSubmitState);
fileInput.addEventListener("change", handleFileSelection);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitReconstruction();
});

void initialize().catch((error: unknown) => {
  showProgress(error instanceof Error ? error.message : String(error), true);
  requireElement("statusBadge").textContent = "服务不可用";
});

async function initialize(): Promise<void> {
  const status = await fetchJson<ReconstructionStatus>(endpoint);
  serviceAvailable = status.available;
  maximumUploadBytes = status.maxFileBytes;
  requireElement("fileHint").textContent = serviceAvailable
    ? `${status.blenderVersion} · 支持 ${status.acceptedExtensions.join(" / ")} · 最大 ${formatBytes(maximumUploadBytes)}`
    : "未连接到本机 Blender；上传还原功能暂不可用。";
  populateCases(status.cases);
  const requestedAssetId = new URLSearchParams(window.location.search).get("asset");
  const initialCase =
    status.cases.find((candidate) => candidate.assetId === requestedAssetId) ??
    status.cases.find((candidate) => candidate.assetId === "measured-white-birch") ??
    status.cases[0];
  if (!initialCase) throw new Error("还没有可展示的树木案例，请先上传一个 Unity FBX");
  await loadCase(initialCase);
  updateSubmitState();
}

function populateCases(cases: TreeCase[]): void {
  caseSelect.replaceChildren(
    ...cases.map((treeCase) => {
      const option = document.createElement("option");
      option.value = treeCase.assetId;
      option.textContent = `${treeCase.acceptance.passes ? "✓" : "!"} ${treeCase.label}`;
      return option;
    })
  );
}

async function selectCase(assetId: string): Promise<void> {
  const treeCase = await fetchJson<TreeCase>(`${endpoint}?${new URLSearchParams({ assetId })}`);
  await loadCase(treeCase);
}

async function loadCase(treeCase: TreeCase): Promise<void> {
  currentCase = treeCase;
  assetRoot = treeCase.baseUrl;
  [visual, sourceAnalysis, recipe, analysis, featureGaps] = await Promise.all([
    fetchJson<VisualReport>(treeCase.reports.visual),
    fetchJson<SourceAnalysisReport>(treeCase.reports.sourceAnalysis),
    fetchJson<RecipeReport>(treeCase.reports.recipe),
    fetchJson<AnalysisReport>(treeCase.reports.analysis),
    fetchJson<FeatureGapReport>(treeCase.reports.featureGaps)
  ]);
  caseSelect.value = treeCase.assetId;
  requireElement("activeCaseTitle").textContent = treeCase.label;
  requireElement("activeCaseSource").textContent = `Asset ID · ${treeCase.assetId}`;
  requireElement("sourceCaption").textContent = `${treeCase.label} · 参考几何 LOD0`;
  requireElement("reconstructionCaption").textContent = `${treeCase.label} · 程序化还原 LOD0`;
  renderDownloads();
  renderSummary();
  renderStageGates();
  renderRules();
  renderRecipe();
  renderRuntimeMeshes();
  renderFeatureGaps();
  const hasTrunkComparison = Boolean(visual.visualViews.front?.trunk);
  (requireElement("trunkPartTab") as HTMLButtonElement).hidden = !hasTrunkComparison;
  if (!hasTrunkComparison && activePart === "trunk") selectPartTab("geometry");
  updateImages();
  updateWipe();
}

function handleFileSelection(): void {
  const file = fileInput.files?.[0];
  if (!file) {
    requireElement("fileName").textContent = "选择 Unity 树木 FBX";
    updateSubmitState();
    return;
  }
  requireElement("fileName").textContent = file.name;
  const plainName = file.name.replace(/\.fbx$/iu, "");
  if (!labelInput.value) labelInput.value = plainName.replace(/[_-]+/gu, " ");
  if (!assetIdWasEdited) assetIdInput.value = slugify(plainName) || `tree-${Date.now().toString(36)}`;
  updateSubmitState();
}

function updateSubmitState(): void {
  const file = fileInput.files?.[0];
  submitButton.disabled =
    submitting ||
    !serviceAvailable ||
    !file ||
    !file.name.toLowerCase().endsWith(".fbx") ||
    file.size <= 0 ||
    file.size > maximumUploadBytes ||
    !labelInput.value.trim() ||
    !/^[a-z0-9](?:[a-z0-9-]{0,62})$/u.test(assetIdInput.value.trim());
}

async function submitReconstruction(): Promise<void> {
  const file = fileInput.files?.[0];
  if (!file || submitButton.disabled) return;
  submitting = true;
  updateSubmitState();
  showProgress("正在读取 Unity FBX、反推有限程序化参数、运行原生成器并执行三视图验收。请保持页面开启…", false, true);
  const query = new URLSearchParams({
    assetId: assetIdInput.value.trim(),
    label: labelInput.value.trim(),
    profile: profileInput.value,
    fileName: file.name
  });
  try {
    const response = await fetch(`${endpoint}?${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file
    });
    const payload = (await response.json()) as TreeCase | { error?: string };
    if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : `HTTP ${response.status}`);
    const treeCase = payload as TreeCase;
    if (!Array.from(caseSelect.options).some((option) => option.value === treeCase.assetId)) {
      const option = document.createElement("option");
      option.value = treeCase.assetId;
      option.textContent = `${treeCase.acceptance.passes ? "✓" : "!"} ${treeCase.label}`;
      caseSelect.append(option);
    }
    await loadCase(treeCase);
    showProgress(
      treeCase.acceptance.passes
        ? `还原完成：最大验收误差 ${percent(treeCase.acceptance.maximumError)}，直接网格与 LOD0 总面数验收通过。`
        : `还原完成，但未通过门槛：最大验收误差 ${percent(treeCase.acceptance.maximumError)}。请查看下方差异图。`,
      !treeCase.acceptance.passes
    );
  } catch (error) {
    showProgress(error instanceof Error ? error.message : String(error), true);
  } finally {
    submitting = false;
    updateSubmitState();
  }
}

function imageUrl(role: "source" | "reconstruction", view: string, part: string): string {
  return `${assetRoot}/geometry-${role}-${view}-${part}.png`;
}

function overlayUrl(view: string, part: string): string {
  return `${assetRoot}/geometry-overlay-${view}-${part}.png`;
}

function updateImages(): void {
  if (!visual) return;
  const source = imageUrl("source", activeView, activePart);
  const reconstruction = imageUrl("reconstruction", activeView, activePart);
  sourceImage.src = source;
  reconstructionImage.src = reconstruction;
  wipeSource.src = source;
  wipeReconstruction.src = reconstruction;
  overlayImage.src = overlayUrl(activeView, activePart);
  const reportPart = activePart === "geometry" ? "all" : activePart;
  const metric = visual.visualViews[activeView]?.[reportPart];
  if (!metric) return;
  activeViewMetric.textContent = `${viewLabel(activeView)} · ${partLabel(activePart)}误差 ${percent(metric.error)} · 重合度 ${percent(metric.similarity)}`;
}

function selectPartTab(part: string): void {
  activePart = part;
  const tabs = requireElement("partTabs").querySelectorAll<HTMLButtonElement>("button");
  tabs.forEach((button) => button.classList.toggle("active", button.dataset.value === part));
}

function updateWipe(): void {
  const value = Number(wipeRange.value);
  wipeAfter.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  wipeDivider.style.left = `${value}%`;
  wipeValue.textContent = `${value}% 原始 / ${100 - value}% 还原`;
}

function renderSummary(): void {
  const lod0 = analysis.reconstruction.lods[0];
  const branchCounts = sourceAnalysis.branchCounts;
  const stemCount = branchCounts.reduce((left, right) => left + right, 0);
  const cards = [
    ["最大验收误差", percent(currentCase.acceptance.maximumError), `视觉 ${percent(visual.visualMaximumError)} · 规则 ${percent(visual.ruleMaximumError)}`],
    ["LOD0 总面数", lod0.triangles.toLocaleString("zh-CN"), `木质 ${lod0.trunkTriangles.toLocaleString("zh-CN")} + 叶卡 ${lod0.leafTriangles.toLocaleString("zh-CN")} · 目标约 3,000 · 硬上限 ${currentCase.acceptance.triangleLimit.toLocaleString("zh-CN")}`],
    ["分层茎段", stemCount.toLocaleString("zh-CN"), `${branchCounts[0]} 主干 / ${branchCounts[1]} 主枝 / ${branchCounts[2]} 枝桠`],
    ["叶卡", lod0.leafCards.toLocaleString("zh-CN"), `Unity 原始 ${sourceAnalysis.inferredRules.leaves.cards.toLocaleString("zh-CN")} 张`],
    ["树高", `${sourceAnalysis.height.toFixed(3)} m`, "有限参数配方的 size"]
  ];
  requireElement("summaryCards").innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${note}</small>
        </article>`
    )
    .join("");
  const badge = requireElement("statusBadge");
  badge.textContent = currentCase.acceptance.passes ? "通过 ≤10% 验收" : "验收未通过";
  badge.classList.toggle("failed", !currentCase.acceptance.passes);
}

function renderStageGates(): void {
  const stages = currentCase.acceptance.comparisonStages;
  const lod = currentCase.acceptance.lodAcceptance;
  const container = requireElement("stageGateList");
  if (!stages || !lod) {
    container.innerHTML = '<div class="stage-gate" data-status="blocked"><strong>历史报告</strong><small>需要重新运行以生成分阶段门禁。</small></div>';
    return;
  }
  const entries = [
    ...stages.map((stage) => ({
      label: stageLabel(stage.stage),
      status: stage.status,
      detail:
        stage.status === "blocked"
          ? `等待 ${stage.dependsOn ? stageLabel(stage.dependsOn) : "前置阶段"}`
          : `最大误差 ${percent(stage.maximumError)} · 参数${stage.parametersLocked ? "已冻结" : "未冻结"}`
    })),
    {
      label: "LOD0–LOD3",
      status: lod.status,
      detail:
        lod.status === "blocked"
          ? "等待树叶验收通过"
          : `${lod.complete && lod.strictlyDescending ? "四级递减完整" : "层级不完整"} · ${lod.withinTriangleBudget ? "面数合规" : "面数超限"}`
    }
  ];
  container.innerHTML = entries
    .map(
      (entry, index) => `
        <article class="stage-gate" data-status="${entry.status}">
          <span>${index + 1} · ${stageStatusLabel(entry.status)}</span>
          <strong>${entry.label}</strong>
          <small>${entry.detail}</small>
        </article>`
    )
    .join("");
}

function renderRules(): void {
  const { trunk, primaryBranches, secondaryBranches, leaves } = sourceAnalysis.inferredRules;
  const rows = [
    ["主干", `${trunk.height.toFixed(3)} m`, `底径 ${trunk.baseRadius.toFixed(3)} m · 顶径 ${trunk.tipRadius.toFixed(3)} m · ${trunk.centerlineSamples} 个中心线采样`],
    ["主枝", `${primaryBranches.count} 根`, `根高 P10/P50/P90 ${quantileTriplet(primaryBranches.rootHeightRatioQuantiles, true)} · 仰角 ${quantileTriplet(primaryBranches.upAngleDegreesQuantiles)}°`],
    ["枝桠", `${secondaryBranches.count} 根`, `根高 P10/P50/P90 ${quantileTriplet(secondaryBranches.rootHeightRatioQuantiles, true)} · 仰角 ${quantileTriplet(secondaryBranches.upAngleDegreesQuantiles)}°`],
    ["叶卡尺寸", `${leaves.cardWidthQuantiles[2].toFixed(3)} × ${leaves.cardHeightQuantiles[2].toFixed(3)} m`, `P10–P90 宽 ${leaves.cardWidthQuantiles[0].toFixed(3)}–${leaves.cardWidthQuantiles[4].toFixed(3)} m`],
    ["沿枝布局", `${percent(leaves.terminalLeafRatio)} 位于枝条末段`, `进度 P10/P50/P90 ${quantileTriplet(leaves.branchProgressQuantiles, true)}`],
    ["离枝距离", `${(leaves.nearestStemDistanceRatioQuantiles[2] * sourceAnalysis.height).toFixed(3)} m 中位数`, `占树高 ${percent(leaves.nearestStemDistanceRatioQuantiles[2])}`],
    ["承叶覆盖", percent(leaves.leafBearingStemRatio), `每茎叶卡 P10/P50/P90 ${quantileTriplet(leaves.leavesPerStemQuantiles)}`]
  ];
  requireElement("ruleTable").innerHTML = rows
    .map(
      ([label, value, note]) => `
        <div class="rule-row">
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${note}</small>
        </div>`
    )
    .join("");
}

function renderRecipe(): void {
  const tuning = recipe.distributionTuning;
  const rows = [
    ["Seed", String(tuning.geometrySeed), `搜索 ${analysis.inverseFit.evaluatedCandidates} 个离散候选`],
    ...analysis.inverseFit.stages.map((stage) => [
      stageLabel(stage.stage),
      percent(stage.objective),
      `${stage.evaluatedCandidates} 次候选评估`
    ]),
    ["茎段数量", `${tuning.trunkCount} / ${tuning.branchCount} / ${tuning.twigCount}`, "主干 / 主枝 / 枝桠"],
    ["主枝", `${numberValue(tuning.branchLengthPercentOfParent)}% · ${numberValue(tuning.branchDownAngleDegrees)}°`, "父枝长度占比 · 分枝角"],
    ["枝桠", `${numberValue(tuning.twigLengthPercentOfParent)}% · ${numberValue(tuning.twigDownAngleDegrees)}°`, "父枝长度占比 · 分枝角"],
    [
      "叶片",
      `${recipe.leafCountTuning.lod0Count} / ${recipe.leafCountTuning.lod1Count} / ${recipe.leafCountTuning.lod2Count} / ${recipe.leafCountTuning.lod3Count}`,
      "LOD0 / LOD1 / LOD2 / LOD3 叶卡"
    ],
    ["叶卡尺度", `${recipe.foliageTuning.widthScale.toFixed(3)} × ${recipe.foliageTuning.heightScale.toFixed(3)}`, `附加半径 ${recipe.foliageTuning.additiveHalfExtent.toFixed(3)} m`]
  ];
  requireElement("recipeTable").innerHTML = rows
    .map(
      ([label, value, note]) => `
        <div class="rule-row">
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${note}</small>
        </div>`
    )
    .join("");
}

function renderFeatureGaps(): void {
  const container = requireElement("featureGapList");
  if (featureGaps.missingCapabilities.length === 0) {
    container.innerHTML = '<p class="gap-empty">现有参数空间已经通过本案例的 ≤10% 验收。</p>';
    return;
  }
  container.innerHTML = featureGaps.missingCapabilities
    .map(
      (gap) => `
        <article class="gap-item">
          <strong>${gap.label}</strong>
          <p>${gap.requiredCapability}</p>
          <code>${formatEvidence(gap.evidence)}</code>
        </article>`
    )
    .join("");
}

function renderRuntimeMeshes(): void {
  requireElement("meshTable").innerHTML = analysis.reconstruction.lods
    .map(
      (lod) => `
        <div class="mesh-row">
          <div class="mesh-title"><strong>LOD${lod.level}</strong><span>${lod.triangles.toLocaleString("zh-CN")} tris</span></div>
          <div class="mesh-stats">
            <span>枝干 ${lod.trunkTriangles.toLocaleString("zh-CN")} 面</span>
            <span>叶卡 ${lod.leafCards.toLocaleString("zh-CN")} 张 / ${lod.leafTriangles.toLocaleString("zh-CN")} 面</span>
            <span>分枝 ${lod.branchCounts.join(" / ")}</span>
          </div>
          <code>curve ${lod.curveSegments.join("/")} · radial ${lod.radialSegments.join("/")}</code>
        </div>`
    )
    .join("");
}

function renderDownloads(): void {
  requireElement("caseDownloads").replaceChildren(
    ...currentCase.files.map((file) => {
      const link = document.createElement("a");
      link.href = file.url;
      link.download = "";
      link.textContent = file.label;
      return link;
    })
  );
}

function bindTabs(id: string, callback: (value: string) => void): void {
  const container = requireElement(id);
  container.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.addEventListener("click", () => {
      container.querySelectorAll("button").forEach((candidate) => candidate.classList.remove("active"));
      button.classList.add("active");
      callback(button.dataset.value!);
    });
  });
}

function showProgress(message: string, error: boolean, working = false): void {
  progress.hidden = false;
  progress.dataset.error = String(error);
  progress.dataset.working = String(working);
  progress.textContent = message;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const error = payload as { error?: string };
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }
  return payload as T;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 63);
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少页面元素 #${id}`);
  return element;
}

function requireImage(id: string): HTMLImageElement {
  return requireElement(id) as HTMLImageElement;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(value < 0.001 ? 4 : 2)}%`;
}

function quantileTriplet(values: number[], asPercent = false): string {
  const selected = [values[0] ?? 0, values[2] ?? 0, values[4] ?? 0];
  return selected.map((value) => (asPercent ? percent(value) : value.toFixed(1))).join(" / ");
}

function viewLabel(view: string): string {
  return ({ front: "正面", side: "侧面", diagonal: "斜视" } as Record<string, string>)[view] ?? view;
}

function partLabel(part: string): string {
  return ({ geometry: "整体", trunk: "主干", branches: "枝干", leaves: "叶卡" } as Record<string, string>)[part] ?? part;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function numberValue(value: number): string {
  return Number(value).toFixed(2).replace(/\.00$/u, "");
}

function stageLabel(stage: "trunk" | "branches" | "leaves"): string {
  return ({ trunk: "主干拟合", branches: "枝层拟合", leaves: "叶层拟合" } as const)[stage];
}

function stageStatusLabel(status: "passed" | "failed" | "blocked"): string {
  return ({ passed: "通过", failed: "失败", blocked: "阻塞" } as const)[status];
}

function formatEvidence(evidence: Record<string, unknown>): string {
  return Object.entries(evidence)
    .map(([key, value]) => `${key}=${typeof value === "number" ? percent(value) : String(value)}`)
    .join(" · ");
}
