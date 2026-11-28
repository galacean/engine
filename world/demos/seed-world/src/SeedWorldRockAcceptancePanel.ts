import { sampleSeedWorldHeight, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type { SeedWorldGeologyCanyon, SeedWorldGeologyHill, SeedWorldGeologyLayout } from "@galacean/engine-world-planning/runtime/SeedWorldGeologyLayout";
import {
  createSeedWorldRockAcceptanceRequestRock,
  previewSeedWorldRockAcceptance,
  seedWorldRockAcceptanceOverrideFromSolvedRock,
  SEED_WORLD_ROCK_ACCEPTANCE_DEFAULT_OVERRIDE,
  type SeedWorldRockAcceptanceOverride,
  type SeedWorldRockAcceptancePreview,
  type SeedWorldRockAcceptanceRequest
} from "./SeedWorldRockAcceptance.ts";
import { SEED_WORLD_CLIFF_1_ASSET_PROFILE } from "./SeedWorldCliffAssetCatalog.ts";
import { compileSeedWorldRockAudit, type SeedWorldRockAuditSnapshot } from "./SeedWorldRockAudit.ts";
import type { SeedWorldRockCompilation } from "./SeedWorldRockCompiler.ts";
import type { SeedWorldRockCoverageTarget } from "@galacean/engine-world-planning/runtime/SeedWorldRockTerrainAnalysis";
import type { SeedWorldRockAssemblyDecision, SeedWorldSolvedRockObb } from "@galacean/engine-world-planning/runtime/SeedWorldRockAssemblySolver";

type AcceptanceView = "plan" | "section" | "world";

/** Inputs required by the rock-only acceptance workbench. */
export interface SeedWorldRockAcceptancePanelOptions {
  /** Existing compact sidebar host. */
  readonly host: HTMLElement;
  /** Read-only terrain layout semantics. */
  readonly layout: SeedWorldGeologyLayout;
  /** Final post-Hydrology Heightmap. */
  readonly fields: SeedWorldFields;
  /** Rock-owned coverage analysis and OBB solve. */
  readonly compilation: SeedWorldRockCompilation;
  /** Current URL used only to identify the acceptance world's persisted data. */
  readonly url: URL;
  /** Applies every saved compiler-side preview and reports the currently selected OBB. */
  readonly onPreview: (
    previews: readonly SeedWorldRockAcceptancePreview[],
    selectedPreview: SeedWorldRockAcceptancePreview | undefined,
    deletedRockIds: ReadonlySet<string>,
    requests: readonly SeedWorldRockAcceptanceRequest[],
    addedPreviews: readonly SeedWorldRockAcceptancePreview[]
  ) => void;
  /** Frames the selected structure in the existing 3D camera. */
  readonly onWorldView: (
    view: Exclude<AcceptanceView, "plan">,
    target: SeedWorldRockCoverageTarget,
    canyon: SeedWorldGeologyCanyon | undefined
  ) => void;
}

/** Handle for removing acceptance listeners and restoring all rock instances. */
export interface SeedWorldRockAcceptancePanel {
  /** Selects a compiled rock from a 3D raycast and returns its visible P-number label. */
  selectRock(rockId: string): string | undefined;
  /** Whether the next terrain click should create a missing-rock request. */
  isRequestPlacementActive(): boolean;
  /** Records one final-Heightmap point while request placement is active. */
  addRockRequest(position: readonly [x: number, y: number, z: number]): string | undefined;
  /** Removes the panel and clears target isolation. */
  destroy(): void;
}

interface AcceptanceFeature {
  readonly id: string;
  readonly label: string;
  readonly canyon?: SeedWorldGeologyCanyon;
  readonly targets: readonly SeedWorldRockCoverageTarget[];
}

interface TargetContext {
  readonly target: SeedWorldRockCoverageTarget;
  readonly decision: SeedWorldRockAssemblyDecision;
  readonly rock?: SeedWorldSolvedRockObb;
  readonly label: string;
  readonly hillIds: readonly string[];
  readonly requestId?: string;
}

/**
 * Mounts a compact rock-layout acceptance workbench for the current world.
 * @param options Read-only terrain inputs plus rock-runtime callbacks.
 * @returns Lifecycle handle for the mounted panel.
 */
export function mountSeedWorldRockAcceptancePanel(
  options: SeedWorldRockAcceptancePanelOptions
): SeedWorldRockAcceptancePanel {
  const features = compileFeatures(options.layout, options.compilation);
  let feature = features[0];
  if (!feature) throw new Error("Rock acceptance requires at least one analyzed terrain convexity");
  let target = resolveTargetContext(feature, options.compilation);
  const storageKey = acceptanceStorageKey(options.url, options.layout.geologySeed);
  const generatedRockStorageKey = acceptanceGeneratedRockStorageKey(storageKey);
  const storedOverridesByTargetId = readStoredOverrides(storageKey);
  const overridesByTargetId = new Map<string, SeedWorldRockAcceptanceOverride>(storedOverridesByTargetId);
  const deletedRockIds = new Set(readStoredStringSet(`${storageKey}:deleted`));
  let requests: readonly SeedWorldRockAcceptanceRequest[] = readStoredRequests(generatedRockStorageKey);
  let requestPlacementActive = false;
  let selectedRequestId: string | undefined;
  let override = overrideForTarget(
    overridesByTargetId,
    contextOverrideKey(target),
    target.target,
    options.fields,
    target.rock
  );
  let view: AcceptanceView = "section";
  let preview: SeedWorldRockAcceptancePreview | undefined;
  const audit = compileSeedWorldRockAudit(options.layout, options.compilation);
  const auditWindow = window as typeof window & {
    seedWorldRockAudit?: Readonly<{ snapshot(): SeedWorldRockAuditSnapshot }>;
  };
  const auditApi = Object.freeze({ snapshot: (): SeedWorldRockAuditSnapshot => audit });
  auditWindow.seedWorldRockAudit = auditApi;
  const geologySeed = String(options.layout.geologySeed);

  options.host.hidden = false;
  options.host.innerHTML = panelMarkup(features, feature, target, override, audit, geologySeed);
  const featureSelect = requiredElement<HTMLSelectElement>(options.host, "rock-acceptance-feature");
  const targetSelect = requiredElement<HTMLSelectElement>(options.host, "rock-acceptance-target");
  const canvas = requiredElement<HTMLCanvasElement>(options.host, "rock-acceptance-canvas");
  const diagnostics = requiredElement<HTMLElement>(options.host, "rock-acceptance-diagnostics");
  const members = requiredElement<HTMLElement>(options.host, "rock-acceptance-members");
  const status = requiredElement<HTMLOutputElement>(options.host, "rock-acceptance-status");
  const viewButtons = [...options.host.querySelectorAll<HTMLButtonElement>("[data-rock-acceptance-view]")];
  const rangeInputs = [...options.host.querySelectorAll<HTMLInputElement>("[data-rock-acceptance-field]")];
  const resetButton = requiredElement<HTMLButtonElement>(options.host, "rock-acceptance-reset");
  const deleteButton = requiredElement<HTMLButtonElement>(options.host, "rock-acceptance-delete");
  const requestButton = requiredElement<HTMLButtonElement>(options.host, "rock-acceptance-request");
  const requestList = requiredElement<HTMLElement>(options.host, "rock-acceptance-requests");
  const copyButton = requiredElement<HTMLButtonElement>(options.host, "rock-acceptance-copy");
  const auditCopyButton = requiredElement<HTMLButtonElement>(options.host, "rock-audit-copy");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Rock acceptance canvas requires a 2D context");

  const update = (): void => {
    const nextPreview = target.rock
      ? previewWithAbsoluteTransform(options, target.target, target.rock, override)
      : undefined;
    preview = nextPreview;
    const adjustedPreviews = compileAdjustedPreviews(options, overridesByTargetId, deletedRockIds);
    const addedPreviews = compileRequestPreviews(options, requests, overridesByTargetId);
    const selectedPreview = target.rock && deletedRockIds.has(target.rock.id) ? undefined : preview;
    options.onPreview(adjustedPreviews, selectedPreview, deletedRockIds, requests, addedPreviews);
    writeTargetOptions(targetSelect, feature, options.compilation, target.target.id, requests, selectedRequestId);
    members.textContent = `Seed ${geologySeed} 原始岩石：${featureRockLabels(feature, options.compilation, deletedRockIds).join(" · ") || "暂无可行 OBB"} · 人工新增 ${requests.length}`;
    synchronizeControls(rangeInputs, override, Boolean(target.rock));
    drawAcceptanceCanvas(
      context,
      canvas,
      view,
      options.layout,
      options.fields,
      feature,
      target,
      selectedPreview,
      Boolean(target.rock && deletedRockIds.has(target.rock.id))
    );
    diagnostics.innerHTML = diagnosticMarkup(target, preview, override, options.fields);
    status.value = target.rock
      ? `${target.label}${deletedRockIds.has(target.rock.id) ? " · 已标记删除" : " · 原始蓝 / 调整黄"}`
      : `${target.label} · 编译异常`;
    deleteButton.disabled = !target.rock || Boolean(target.requestId);
    deleteButton.textContent = target.requestId
      ? "新增岩石请从 A 列表移除"
      : target.rock && deletedRockIds.has(target.rock.id)
        ? "撤销删除当前岩石"
        : "删除当前岩石";
    requestButton.dataset.active = String(requestPlacementActive);
    requestButton.textContent = requestPlacementActive ? "点击地表生成岩石 · ON" : "生成并调整岩石";
    writeRequestList(requestList, requests, selectedRequestId);
    copyButton.textContent = `复制全部调整数据（${activeOverrideCount(overridesByTargetId, requests)}）`;
  };

  const selectRequest = (requestId: string): boolean => {
    const request = requests.find((candidate) => candidate.id === requestId);
    if (!request) return false;
    const nearestTarget =
      options.compilation.terrain.targets.find((candidate) => candidate.id === request.nearestTargetId) ??
      [...options.compilation.terrain.targets].sort(
        (left, right) =>
          squaredPlanDistance(left.crest, request.position) - squaredPlanDistance(right.crest, request.position)
      )[0];
    if (!nearestTarget) return false;
    const nextFeature = features.find((candidate) => candidate.targets.some((entry) => entry.id === nearestTarget.id));
    if (!nextFeature) return false;
    feature = nextFeature;
    target = resolveRequestTargetContext(request, nearestTarget, options.compilation);
    selectedRequestId = request.id;
    override = overrideForTarget(
      overridesByTargetId,
      contextOverrideKey(target),
      target.target,
      options.fields,
      target.rock
    );
    featureSelect.value = feature.id;
    update();
    return true;
  };

  const resizeObserver = new ResizeObserver(update);
  resizeObserver.observe(canvas);
  featureSelect.addEventListener("change", () => {
    selectedRequestId = undefined;
    feature = features.find((candidate) => candidate.id === featureSelect.value) ?? features[0]!;
    target = resolveTargetContext(feature, options.compilation);
    override = overrideForTarget(
      overridesByTargetId,
      contextOverrideKey(target),
      target.target,
      options.fields,
      target.rock
    );
    update();
  });
  targetSelect.addEventListener("change", () => {
    if (targetSelect.value.startsWith("request:")) {
      selectRequest(targetSelect.value.slice("request:".length));
      return;
    }
    selectedRequestId = undefined;
    target = resolveTargetContext(feature, options.compilation, targetSelect.value);
    override = overrideForTarget(
      overridesByTargetId,
      contextOverrideKey(target),
      target.target,
      options.fields,
      target.rock
    );
    update();
  });
  for (const input of rangeInputs) {
    input.addEventListener("input", () => {
      const field = input.dataset.rockAcceptanceField as keyof SeedWorldRockAcceptanceOverride;
      override = Object.freeze({ ...override, [field]: Number(input.value) });
      setStoredOverride(overridesByTargetId, contextOverrideKey(target), override);
      setStoredOverride(storedOverridesByTargetId, contextOverrideKey(target), override);
      persistStoredOverrides(storageKey, storedOverridesByTargetId);
      update();
    });
  }
  for (const button of viewButtons) {
    button.addEventListener("click", () => {
      view = button.dataset.rockAcceptanceView as AcceptanceView;
      for (const candidate of viewButtons) candidate.dataset.active = String(candidate === button);
      if (view === "world") options.onWorldView("world", target.target, feature.canyon);
      else if (view === "section") options.onWorldView("section", target.target, feature.canyon);
      update();
    });
  }
  resetButton.addEventListener("click", () => {
    override = target.rock
      ? seedWorldRockAcceptanceOverrideFromSolvedRock(target.target, options.fields, target.rock)
      : { ...SEED_WORLD_ROCK_ACCEPTANCE_DEFAULT_OVERRIDE };
    const overrideKey = contextOverrideKey(target);
    storedOverridesByTargetId.delete(overrideKey);
    overridesByTargetId.delete(overrideKey);
    persistStoredOverrides(storageKey, storedOverridesByTargetId);
    update();
  });
  deleteButton.addEventListener("click", () => {
    if (!target.rock) return;
    if (deletedRockIds.has(target.rock.id)) deletedRockIds.delete(target.rock.id);
    else deletedRockIds.add(target.rock.id);
    persistStringSet(`${storageKey}:deleted`, deletedRockIds);
    update();
  });
  requestButton.addEventListener("click", () => {
    requestPlacementActive = !requestPlacementActive;
    update();
  });
  requestList.addEventListener("click", (event) => {
    const selectButton = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-rock-request-select]");
    if (selectButton) {
      selectRequest(selectButton.dataset.rockRequestSelect!);
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-rock-request-remove]");
    if (!button) return;
    const removingSelected = selectedRequestId === button.dataset.rockRequestRemove;
    requests = Object.freeze(requests.filter((request) => request.id !== button.dataset.rockRequestRemove));
    const overrideKey = requestOverrideKey(button.dataset.rockRequestRemove!);
    overridesByTargetId.delete(overrideKey);
    storedOverridesByTargetId.delete(overrideKey);
    persistStoredOverrides(storageKey, storedOverridesByTargetId);
    persistRequests(generatedRockStorageKey, requests);
    if (removingSelected) {
      selectedRequestId = undefined;
      target = resolveTargetContext(feature, options.compilation);
      override = overrideForTarget(
        overridesByTargetId,
        contextOverrideKey(target),
        target.target,
        options.fields,
        target.rock
      );
    }
    update();
  });
  copyButton.addEventListener("click", () => {
    const payload = compileAcceptanceExport(
      options,
      features,
      overridesByTargetId,
      deletedRockIds,
      requests,
      feature.id,
      target.target.id
    );
    void writeClipboardText(payload)
      .then(() => {
        copyButton.textContent = `已复制 · 删除 ${deletedRockIds.size} · 补点 ${requests.length}`;
        window.setTimeout(
          () => (copyButton.textContent = `复制全部调整数据（${activeOverrideCount(overridesByTargetId, requests)}）`),
          1_500
        );
      })
      .catch(() => {
        copyButton.textContent = "复制失败";
      });
  });
  auditCopyButton.addEventListener("click", () => {
    void writeClipboardText(JSON.stringify(audit, null, 2)).then(() => {
      auditCopyButton.textContent = "已复制量化快照";
      window.setTimeout(() => (auditCopyButton.textContent = "复制量化快照"), 1_500);
    });
  });
  update();

  return Object.freeze({
    selectRock: (rockId: string): string | undefined => {
      const requestId = requestIdFromRockId(rockId);
      if (requestId && selectRequest(requestId)) return requestId;
      const rockIndex = options.compilation.assemblies.rocks.findIndex((candidate) => candidate.id === rockId);
      if (rockIndex < 0) return undefined;
      const targetId = targetIdFromRockId(rockId);
      const nextFeature = features.find((candidate) => candidate.targets.some((entry) => entry.id === targetId));
      if (!nextFeature) return undefined;
      selectedRequestId = undefined;
      feature = nextFeature;
      target = resolveTargetContext(feature, options.compilation, targetId);
      override = overrideForTarget(
        overridesByTargetId,
        contextOverrideKey(target),
        target.target,
        options.fields,
        target.rock
      );
      featureSelect.value = feature.id;
      update();
      return `P${String(rockIndex + 1).padStart(2, "0")}`;
    },
    isRequestPlacementActive: (): boolean => requestPlacementActive,
    addRockRequest: (position: readonly [number, number, number]): string | undefined => {
      if (!requestPlacementActive) return undefined;
      const nearestTarget = [...options.compilation.terrain.targets].sort(
        (left, right) => squaredPlanDistance(left.crest, position) - squaredPlanDistance(right.crest, position)
      )[0];
      const id = nextRequestId(requests);
      requests = Object.freeze([
        ...requests,
        Object.freeze<SeedWorldRockAcceptanceRequest>({
          id,
          position: Object.freeze([...position] as [number, number, number]),
          nearestTargetId: nearestTarget?.id,
          canyonId: nearestTarget?.frame.canyonId,
          sourceHillIds: Object.freeze([...(nearestTarget?.sourceHillIds ?? [])])
        })
      ]);
      persistRequests(generatedRockStorageKey, requests);
      selectRequest(id);
      return id;
    },
    destroy: (): void => {
      resizeObserver.disconnect();
      if (auditWindow.seedWorldRockAudit === auditApi) delete auditWindow.seedWorldRockAudit;
      options.onPreview([], undefined, new Set(), [], []);
      options.host.replaceChildren();
      options.host.hidden = true;
    }
  });
}

function compileAdjustedPreviews(
  options: SeedWorldRockAcceptancePanelOptions,
  overridesByTargetId: ReadonlyMap<string, SeedWorldRockAcceptanceOverride>,
  deletedRockIds: ReadonlySet<string>
): readonly SeedWorldRockAcceptancePreview[] {
  const targets = new Map(options.compilation.terrain.targets.map((target) => [target.id, target] as const));
  return Object.freeze(
    options.compilation.assemblies.decisions.flatMap((decision) => {
      const override = overridesByTargetId.get(decision.targetId);
      const target = targets.get(decision.targetId);
      if (!override || !target) return [];
      return decision.rocks
        .filter((rock) => !deletedRockIds.has(rock.id))
        .map((rock) => previewWithAbsoluteTransform(options, target, rock, override));
    })
  );
}

function previewWithAbsoluteTransform(
  options: SeedWorldRockAcceptancePanelOptions,
  target: SeedWorldRockCoverageTarget,
  rock: SeedWorldSolvedRockObb,
  override: SeedWorldRockAcceptanceOverride
): SeedWorldRockAcceptancePreview {
  return previewSeedWorldRockAcceptance(target, rock, options.fields, override);
}

function compileRequestPreviews(
  options: SeedWorldRockAcceptancePanelOptions,
  requests: readonly SeedWorldRockAcceptanceRequest[],
  overridesByTargetId: ReadonlyMap<string, SeedWorldRockAcceptanceOverride>
): readonly SeedWorldRockAcceptancePreview[] {
  return Object.freeze(
    requests.flatMap((request) => {
      const target = options.compilation.terrain.targets.find((candidate) => candidate.id === request.nearestTargetId);
      if (!target) return [];
      const context = resolveRequestTargetContext(request, target, options.compilation);
      if (!context.rock) return [];
      return [
        previewWithAbsoluteTransform(
          options,
          target,
          context.rock,
          overrideForTarget(
            overridesByTargetId,
            contextOverrideKey(context),
            context.target,
            options.fields,
            context.rock
          )
        )
      ];
    })
  );
}

function compileFeatures(layout: SeedWorldGeologyLayout, compilation: SeedWorldRockCompilation): AcceptanceFeature[] {
  const features: AcceptanceFeature[] = layout.canyons
    .map((canyon) => {
      const targets = compilation.terrain.targets.filter((target) => target.frame.canyonId === canyon.id);
      return Object.freeze({
        id: `canyon:${canyon.id}`,
        label: `${canyon.kind === "trunk" ? "主峡谷" : "支谷"} · ${canyon.id} · ${bankSummary(targets)}`,
        canyon,
        targets: Object.freeze(targets)
      });
    })
    .filter((feature) => feature.targets.length > 0);
  const canyonTargetIds = new Set(features.flatMap((feature) => feature.targets.map((target) => target.id)));
  const slopes = compilation.terrain.targets.filter((target) => !canyonTargetIds.has(target.id));
  if (slopes.length > 0) {
    features.push(
      Object.freeze({
        id: "terrain-slopes",
        label: `普通山坡 · ${slopes.length} 个凸起`,
        targets: Object.freeze(slopes)
      })
    );
  }
  return features;
}

function resolveTargetContext(
  feature: AcceptanceFeature,
  compilation: SeedWorldRockCompilation,
  requestedId?: string,
  requireResolvedRock = false
): TargetContext {
  const resolvedTargetIds = new Set(
    compilation.assemblies.decisions
      .filter((decision) => decision.rocks.length > 0)
      .map((decision) => decision.targetId)
  );
  const requestedTarget = feature.targets.find((candidate) => candidate.id === requestedId);
  const target =
    (requestedTarget && (!requireResolvedRock || resolvedTargetIds.has(requestedTarget.id))
      ? requestedTarget
      : undefined) ??
    feature.targets.find((candidate) => resolvedTargetIds.has(candidate.id)) ??
    feature.targets[0]!;
  const decision = compilation.assemblies.decisions.find((candidate) => candidate.targetId === target.id)!;
  const rock = decision.rocks[0];
  const rockIndex = rock ? compilation.assemblies.rocks.findIndex((candidate) => candidate.id === rock.id) : -1;
  const side = target.frame.bankSide === "left" ? "左岸" : target.frame.bankSide === "right" ? "右岸" : "山坡";
  const label = `${rockIndex >= 0 ? `P${String(rockIndex + 1).padStart(2, "0")}` : "NO OBB"} · ${side} · ${target.id}`;
  return Object.freeze({ target, decision, rock, label, hillIds: target.sourceHillIds });
}

function resolveRequestTargetContext(
  request: SeedWorldRockAcceptanceRequest,
  target: SeedWorldRockCoverageTarget,
  compilation: SeedWorldRockCompilation
): TargetContext {
  const decision = compilation.assemblies.decisions.find((candidate) => candidate.targetId === target.id)!;
  const targetTemplate = decision.rocks[0];
  const template = targetTemplate ?? nearestCompiledRock(compilation, request.position);
  const rock = template ? createSeedWorldRockAcceptanceRequestRock(request, template) : undefined;
  const side = target.frame.bankSide === "left" ? "左岸" : target.frame.bankSide === "right" ? "右岸" : "山坡";
  return Object.freeze({
    target,
    decision,
    rock,
    label: `${request.id} · 新增 · ${side} · ${target.id}`,
    hillIds: target.sourceHillIds,
    requestId: request.id
  });
}

function nearestCompiledRock(
  compilation: SeedWorldRockCompilation,
  position: readonly [number, number, number]
): SeedWorldSolvedRockObb | undefined {
  return [...compilation.assemblies.rocks].sort(
    (left, right) => squaredPlanDistance(left.obbCenter, position) - squaredPlanDistance(right.obbCenter, position)
  )[0];
}

function contextOverrideKey(context: TargetContext): string {
  return context.requestId ? requestOverrideKey(context.requestId) : context.target.id;
}

function requestOverrideKey(requestId: string): string {
  return `generated-rock:${requestId}`;
}

function activeOverrideCount(
  overridesByTargetId: ReadonlyMap<string, SeedWorldRockAcceptanceOverride>,
  requests: readonly SeedWorldRockAcceptanceRequest[]
): number {
  const requestIds = new Set(requests.map((request) => requestOverrideKey(request.id)));
  let count = 0;
  for (const id of overridesByTargetId.keys()) {
    if (id.startsWith("request:")) continue;
    if (id.startsWith("generated-rock:") && !requestIds.has(id)) continue;
    count += 1;
  }
  return count;
}

function featureRockLabels(
  feature: AcceptanceFeature,
  compilation: SeedWorldRockCompilation,
  deletedRockIds: ReadonlySet<string>
): string[] {
  const targetIds = new Set(feature.targets.map((target) => target.id));
  return compilation.assemblies.rocks.flatMap((rock, index) =>
    targetIds.has(targetIdFromRockId(rock.id))
      ? [`P${String(index + 1).padStart(2, "0")}${deletedRockIds.has(rock.id) ? "×" : ""}`]
      : []
  );
}

function targetIdFromRockId(rockId: string): string {
  const separator = rockId.lastIndexOf(":rock-");
  return separator < 0 ? rockId : rockId.slice(0, separator);
}

function panelMarkup(
  features: readonly AcceptanceFeature[],
  feature: AcceptanceFeature,
  target: TargetContext,
  override: SeedWorldRockAcceptanceOverride,
  audit: SeedWorldRockAuditSnapshot,
  geologySeed: string
): string {
  return `<header class="rock-acceptance-header">
    <span>WORLD ROCK FIT · G=${escapeHtml(geologySeed)}</span><b>参数布局</b>
  </header>
  ${auditMarkup(audit)}
  <p class="rock-acceptance-contract"><i>区域选择只做归属标记</i>，不会隐藏、移动或重新解算其他岩石。</p>
  <label class="rock-acceptance-select"><span>验收区域</span><select id="rock-acceptance-feature">${features
    .map(
      (candidate) =>
        `<option value="${escapeHtml(candidate.id)}"${candidate === feature ? " selected" : ""}>${escapeHtml(candidate.label)}</option>`
    )
    .join("")}</select></label>
  <p id="rock-acceptance-members" class="rock-acceptance-members"></p>
  <label class="rock-acceptance-select"><span>当前岩石</span><select id="rock-acceptance-target"></select></label>
  <div class="rock-acceptance-view-tabs" role="group" aria-label="验收视角">
    <button type="button" data-rock-acceptance-view="plan" data-active="false">俯瞰方向</button>
    <button type="button" data-rock-acceptance-view="section" data-active="true">量化剖面</button>
    <button type="button" data-rock-acceptance-view="world" data-active="false">3D 聚焦</button>
  </div>
  <canvas id="rock-acceptance-canvas" class="rock-acceptance-canvas" aria-label="岩石布局定量预览"></canvas>
  <output id="rock-acceptance-status" class="rock-acceptance-status">${escapeHtml(target.label)}</output>
  <div class="rock-acceptance-controls">${rangeMarkup("alongShoulderMetres", "沿山肩", -1200, 1200, 1, override.alongShoulderMetres, "m")}${rangeMarkup("downhillMetres", "朝坡脚", -1200, 1200, 1, override.downhillMetres, "m")}${rangeMarkup("pitchDegrees", "旋转 X（绝对）", 0, 360, 1, override.pitchDegrees, "°")}${rangeMarkup("yawDegrees", "旋转 Y（绝对）", 0, 360, 1, override.yawDegrees, "°")}${rangeMarkup("rollDegrees", "旋转 Z（绝对）", 0, 360, 1, override.rollDegrees, "°")}${rangeMarkup("uniformScaleMultiplier", "等比缩放 XYZ", 0.05, 24, 0.005, override.uniformScaleMultiplier, "×")}${rangeMarkup("burialMetres", "埋深（绝对）", -400, 800, 1, override.burialMetres, "m")}</div>
  <dl id="rock-acceptance-diagnostics" class="rock-acceptance-diagnostics"></dl>
  <div class="rock-acceptance-annotation-actions"><button id="rock-acceptance-delete" type="button">删除当前岩石</button><button id="rock-acceptance-request" type="button" data-active="false">生成并调整岩石</button></div>
  <div id="rock-acceptance-requests" class="rock-acceptance-requests"></div>
  <div class="rock-acceptance-actions"><button id="rock-acceptance-reset" type="button">恢复当前岩石</button><button id="rock-acceptance-copy" type="button">复制全部调整数据（0）</button></div>`;
}

function auditMarkup(audit: SeedWorldRockAuditSnapshot): string {
  const metrics = audit.metrics;
  const failures =
    audit.violations.length === 0
      ? `<li>硬约束全部通过</li>`
      : audit.violations
          .slice(0, 5)
          .map((violation) => `<li><b>${escapeHtml(violation.code)}</b>${escapeHtml(violation.message)}</li>`)
          .join("");
  return `<section class="rock-audit" data-status="${audit.status.toLowerCase()}">
    <header><span>FIRST PRINCIPLES AUDIT · ${escapeHtml(audit.signature)}</span><b>${audit.status}</b></header>
    <div class="rock-audit-grid">
      <span>源丘<strong>${metrics.sourceHillCount}</strong></span>
      <span>物理凸包<strong>${metrics.physicalConvexityCount}</strong></span>
      <span>岩石目标<strong>${metrics.committedTargetCount}</strong></span>
      <span>Clif_1<strong>${metrics.rockCount}</strong></span>
      <span>峰顶遗漏<strong>${metrics.uncoveredTargetCount}</strong></span>
      <span>峡谷失配<strong>${metrics.unpairedCanyonTargetCount}</strong></span>
      <span>最低接地<strong>${(metrics.minimumContactRatio * 100).toFixed(0)}%</strong></span>
      <span>最低露出<strong>${(metrics.minimumGlobalVisibilityRatio * 100).toFixed(0)}%</strong></span>
    </div>
    <ol>${failures}</ol>
    <button id="rock-audit-copy" type="button">复制量化快照</button>
  </section>`;
}

function writeTargetOptions(
  select: HTMLSelectElement,
  feature: AcceptanceFeature,
  compilation: SeedWorldRockCompilation,
  selectedId: string,
  requests: readonly SeedWorldRockAcceptanceRequest[],
  selectedRequestId: string | undefined
): void {
  const targetOptions = feature.targets
    .map((target) => {
      const context = resolveTargetContext(feature, compilation, target.id);
      return `<option value="${escapeHtml(target.id)}"${!selectedRequestId && target.id === selectedId ? " selected" : ""}>${escapeHtml(context.label)}</option>`;
    })
    .join("");
  const featureTargetIds = new Set(feature.targets.map((target) => target.id));
  const requestOptions = requests
    .filter((request) => request.nearestTargetId && featureTargetIds.has(request.nearestTargetId))
    .map(
      (request) =>
        `<option value="request:${escapeHtml(request.id)}"${request.id === selectedRequestId ? " selected" : ""}>${escapeHtml(request.id)} · 新增岩石</option>`
    )
    .join("");
  select.innerHTML = targetOptions + requestOptions;
}

function rangeMarkup(
  field: keyof SeedWorldRockAcceptanceOverride,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  unit: string
): string {
  return `<label><span>${label}<output data-rock-acceptance-output="${field}">${formatValue(field, value)}${unit}</output></span><input type="range" data-rock-acceptance-field="${field}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
}

function synchronizeControls(
  inputs: readonly HTMLInputElement[],
  override: SeedWorldRockAcceptanceOverride,
  enabled: boolean
): void {
  for (const input of inputs) {
    const field = input.dataset.rockAcceptanceField as keyof SeedWorldRockAcceptanceOverride;
    input.value = String(override[field]);
    input.disabled = !enabled;
    const output = input.parentElement?.querySelector<HTMLOutputElement>(`[data-rock-acceptance-output="${field}"]`);
    if (output)
      output.value = `${formatValue(field, override[field])}${field === "uniformScaleMultiplier" ? "×" : field.includes("Degrees") ? "°" : "m"}`;
  }
}

function diagnosticMarkup(
  target: TargetContext,
  preview: SeedWorldRockAcceptancePreview | undefined,
  override: SeedWorldRockAcceptanceOverride,
  fields: SeedWorldFields
): string {
  const rock = preview?.rock ?? target.rock;
  const finalUphillAxis = rock ? rotateVectorByQuaternion(authoredUphillAxis(), rock.rotationQuaternion) : undefined;
  const finalPitchDegrees = finalUphillAxis
    ? radiansToDegrees(Math.atan2(finalUphillAxis[1], Math.hypot(finalUphillAxis[0], finalUphillAxis[2])))
    : undefined;
  const meanSlopeDegrees = radiansToDegrees(
    Math.atan2(target.target.prominenceMetres, Math.max(1, target.target.shoulderSpanMetres))
  );
  const supportEvidence = rock ? measureSupportEvidence(fields, rock) : undefined;
  const centerlineCoverage = rock ? measureCenterlineCoverage(target.target, fields, rock) : undefined;
  return [
    [
      "岸侧",
      target.target.frame.bankSide ? `${target.target.frame.bankSide === "left" ? "左岸" : "右岸"}` : "普通山坡"
    ],
    [
      "岩石尖端朝向",
      `${radiansToDegrees(target.target.frame.uphillBearingRadians).toFixed(1)}° · ${target.target.frame.source}`
    ],
    ["源山丘", target.hillIds.join(" + ")],
    [
      "坡度 / 峰差",
      `${target.target.frame.maximumSlopeDegrees.toFixed(1)}° / ${target.target.prominenceMetres.toFixed(1)}m`
    ],
    ["平均坡 / 最大坡", `${meanSlopeDegrees.toFixed(1)}° / ${target.target.frame.maximumSlopeDegrees.toFixed(1)}°`],
    [
      "算法倾角 / 实际尖端",
      `${target.rock?.skywardTiltDegrees.toFixed(1) ?? "—"}° / ${finalPitchDegrees?.toFixed(1) ?? "—"}°`
    ],
    [
      "OBB 中心旋转 XYZ",
      `${override.pitchDegrees.toFixed(0)}° / ${override.yawDegrees.toFixed(0)}° / ${override.rollDegrees.toFixed(0)}°`
    ],
    ["OBB 中心位置 XYZ", rock ? rock.obbCenter.map((value) => value.toFixed(1)).join(" / ") : "—"],
    ["自动插入深度", rock ? `${rock.insertionDepthMetres.toFixed(1)}m` : "—"],
    ["绝对埋深", `${preview?.appliedBurialMetres.toFixed(1) ?? override.burialMetres.toFixed(1)}m`],
    ["真实支撑点", supportEvidence ? `${supportEvidence.contactCount}/${supportEvidence.totalCount} 接地` : "—"],
    ["中心剖面覆盖", centerlineCoverage === undefined ? "—" : `${(centerlineCoverage * 100).toFixed(0)}%`],
    ["尖端覆盖", preview ? (preview.containsCrest ? "PASS" : "FAIL") : target.decision.crestCovered ? "PASS" : "FAIL"],
    ["高出峰顶", preview ? `${preview.crestRiseMetres.toFixed(1)}m` : `${target.decision.crestRiseMetres.toFixed(1)}m`],
    [
      "等比 Scale",
      rock ? `${rock.uniformScale.toFixed(2)} / ${rock.obbSizeMetres.map((value) => value.toFixed(0)).join("×")}m` : "—"
    ]
  ]
    .map(([term, value]) => `<div><dt>${term}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");
}

function drawAcceptanceCanvas(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  view: AcceptanceView,
  layout: SeedWorldGeologyLayout,
  fields: SeedWorldFields,
  feature: AcceptanceFeature,
  target: TargetContext,
  preview: SeedWorldRockAcceptancePreview | undefined,
  deleted: boolean
): void {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(240, canvas.clientWidth);
  canvas.dataset.view = view;
  const height = view === "section" ? 260 : 178;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#07100e";
  context.fillRect(0, 0, width, height);
  if (view === "section") drawSection(context, width, height, fields, target, preview, deleted);
  else drawPlan(context, width, height, layout, feature, target, preview, deleted);
}

function drawPlan(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  layout: SeedWorldGeologyLayout,
  feature: AcceptanceFeature,
  selected: TargetContext,
  preview: SeedWorldRockAcceptancePreview | undefined,
  deleted: boolean
): void {
  const hills = layout.hills.filter((hill) => feature.targets.some((target) => target.sourceHillIds.includes(hill.id)));
  const points = [
    ...hills.flatMap((hill) => [
      [hill.center.x - hill.bodyRadiusMetres.major, hill.center.z - hill.bodyRadiusMetres.major] as const,
      [hill.center.x + hill.bodyRadiusMetres.major, hill.center.z + hill.bodyRadiusMetres.major] as const
    ]),
    ...(feature.canyon?.points.map((point) => [point.x, point.z] as const) ?? []),
    ...feature.targets.flatMap((target) => [
      [target.crest[0], target.crest[2]] as const,
      [target.shoulderFoot[0], target.shoulderFoot[2]] as const
    ])
  ];
  const bounds = fitBounds(points, width, height, 18);
  context.save();
  context.translate(bounds.offsetX, bounds.offsetY);
  context.scale(bounds.scale, bounds.scale);
  if (feature.canyon) drawCanyon(context, feature.canyon);
  for (const hill of hills) drawHill(context, hill, feature, selected);
  for (const target of feature.targets) drawShoulderArrow(context, target, target.id === selected.target.id);
  if (selected.rock && !deleted)
    drawPlanObb(context, selected.rock, "rgb(75 194 255 / 18%)", "#4bc2ff", 2 / bounds.scale);
  if (preview) drawPlanObb(context, preview.rock, "rgb(255 211 84 / 20%)", "#ffd354", 2 / bounds.scale);
  context.restore();
  context.fillStyle = "#7d958d";
  context.font = "9px ui-monospace, monospace";
  context.fillText("青线=峡谷 · 黄箭头=岩石目标山肩/尖端方向 · 蓝=算法 OBB · 黄框=调整 OBB", 10, height - 8);
}

function drawSection(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  fields: SeedWorldFields,
  selected: TargetContext,
  preview: SeedWorldRockAcceptancePreview | undefined,
  deleted: boolean
): void {
  const target = selected.target;
  const direction = bearingVector(target.frame.downhillBearingRadians);
  const minimumDistance = -target.shoulderSpanMetres * 0.35;
  const maximumDistance = target.shoulderSpanMetres * 1.15;
  const samples = Array.from({ length: 81 }, (_, index) => {
    const distance = mix(minimumDistance, maximumDistance, index / 80);
    const x = target.crest[0] + direction[0] * distance;
    const z = target.crest[2] + direction[1] * distance;
    return Object.freeze({ distance, height: sampleHeight(fields, x, z) });
  });
  const rocks = deleted ? [] : ([selected.rock, preview?.rock].filter(Boolean) as SeedWorldSolvedRockObb[]);
  const projected = rocks.map((rock) => projectRockToSection(rock, target, fields));
  const projectedPoints = projected.flatMap((entry) => [
    ...entry.polygon,
    ...entry.supports.map((support) => [support.distance, support.height] as const),
    entry.center,
    entry.tip
  ]);
  const minimumHeight =
    Math.min(...samples.map((sample) => sample.height), ...projectedPoints.map((point) => point[1])) - 8;
  const maximumHeight =
    Math.max(...samples.map((sample) => sample.height), ...projectedPoints.map((point) => point[1])) + 8;
  const padding = Object.freeze({ left: 34, right: 14, top: 30, bottom: 30 });
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const metresPerPixel = Math.max(
    (maximumDistance - minimumDistance) / plotWidth,
    (maximumHeight - minimumHeight) / plotHeight
  );
  const visibleDistanceSpan = plotWidth * metresPerPixel;
  const visibleHeightSpan = plotHeight * metresPerPixel;
  const distanceMidpoint = (minimumDistance + maximumDistance) * 0.5;
  const heightMidpoint = (minimumHeight + maximumHeight) * 0.5;
  const visibleMinimumDistance = distanceMidpoint - visibleDistanceSpan * 0.5;
  const visibleMaximumDistance = distanceMidpoint + visibleDistanceSpan * 0.5;
  const visibleMinimumHeight = heightMidpoint - visibleHeightSpan * 0.5;
  const visibleMaximumHeight = heightMidpoint + visibleHeightSpan * 0.5;
  const toX = (distance: number): number => padding.left + (distance - visibleMinimumDistance) / metresPerPixel;
  const toY = (value: number): number => padding.top + (visibleMaximumHeight - value) / metresPerPixel;
  context.strokeStyle = "rgb(126 164 149 / 16%)";
  context.fillStyle = "#789487";
  context.font = "8px ui-monospace, monospace";
  context.textAlign = "right";
  for (let ordinal = 0; ordinal <= 3; ordinal++) {
    const value = mix(visibleMinimumHeight, visibleMaximumHeight, ordinal / 3);
    const y = toY(value);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(`${value.toFixed(0)}m`, padding.left - 5, y + 3);
  }
  context.textAlign = "center";
  for (const distance of [visibleMinimumDistance, 0, target.shoulderSpanMetres, visibleMaximumDistance]) {
    const x = toX(distance);
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, height - padding.bottom);
    context.stroke();
    context.fillText(`${distance.toFixed(0)}m`, x, height - 9);
  }
  context.beginPath();
  samples.forEach((sample, index) =>
    index === 0
      ? context.moveTo(toX(sample.distance), toY(sample.height))
      : context.lineTo(toX(sample.distance), toY(sample.height))
  );
  context.lineTo(toX(maximumDistance), height - padding.bottom);
  context.lineTo(toX(minimumDistance), height - padding.bottom);
  context.closePath();
  context.fillStyle = "rgb(57 121 89 / 56%)";
  context.fill();
  context.beginPath();
  samples.forEach((sample, index) =>
    index === 0
      ? context.moveTo(toX(sample.distance), toY(sample.height))
      : context.lineTo(toX(sample.distance), toY(sample.height))
  );
  context.strokeStyle = "#e9fff4";
  context.lineWidth = 2;
  context.stroke();
  context.save();
  context.setLineDash([5, 4]);
  context.beginPath();
  context.moveTo(toX(0), toY(target.crest[1]));
  context.lineTo(toX(target.shoulderSpanMetres), toY(target.shoulderFoot[1]));
  context.strokeStyle = "rgb(255 255 255 / 48%)";
  context.lineWidth = 1;
  context.stroke();
  context.restore();
  const coverageRock = preview?.rock ?? selected.rock;
  if (coverageRock && !deleted) {
    for (const sample of centerlineCoverageSamples(target, fields, coverageRock)) {
      context.beginPath();
      context.arc(toX(sample.distance), toY(sample.height), 3, 0, Math.PI * 2);
      context.fillStyle = sample.covered ? "#52ddad" : "#ff735f";
      context.fill();
    }
  }
  projected.forEach((entry, index) => {
    context.beginPath();
    entry.polygon.forEach((point, pointIndex) =>
      pointIndex === 0 ? context.moveTo(toX(point[0]), toY(point[1])) : context.lineTo(toX(point[0]), toY(point[1]))
    );
    context.closePath();
    context.fillStyle = index === 0 ? "rgb(75 194 255 / 22%)" : "rgb(255 211 84 / 22%)";
    context.strokeStyle = index === 0 ? "#4bc2ff" : "#ffd354";
    context.lineWidth = 2;
    context.fill();
    context.stroke();
    for (const support of entry.supports) {
      context.beginPath();
      context.arc(toX(support.distance), toY(support.height), index === 0 ? 2.4 : 3, 0, Math.PI * 2);
      context.fillStyle = support.contact ? "#52ddad" : "#ff735f";
      context.fill();
    }
    context.beginPath();
    context.moveTo(toX(entry.center[0]), toY(entry.center[1]));
    context.lineTo(toX(entry.tip[0]), toY(entry.tip[1]));
    context.strokeStyle = index === 0 ? "#4bc2ff" : "#ffd354";
    context.lineWidth = 2.5;
    context.stroke();
    drawArrowHead(
      context,
      toX(entry.center[0]),
      toY(entry.center[1]),
      toX(entry.tip[0]),
      toY(entry.tip[1]),
      context.strokeStyle
    );
    context.fillStyle = context.strokeStyle;
    context.font = "700 8px ui-monospace, monospace";
    context.textAlign = "left";
    context.fillText("尖端", toX(entry.tip[0]) + 5, toY(entry.tip[1]) - 3);
  });
  const visible = projected.at(-1);
  context.fillStyle = "#a8c3b6";
  context.font = "9px ui-monospace, monospace";
  context.textAlign = "left";
  context.fillText(
    visible
      ? `OBB主轴截面 1:1m · 坡 ${meanSlopeDegrees(target).toFixed(1)}°/${target.frame.maximumSlopeDegrees.toFixed(1)}° · 尖端 ${visible.tiltDegrees.toFixed(1)}° · 支撑 ${visible.supports.filter((point) => point.contact).length}/${visible.supports.length}`
      : "左=峰后 · 右=朝坡脚 / 峡谷",
    10,
    13
  );
  context.fillStyle = "#789487";
  context.font = "8px ui-monospace, monospace";
  context.fillText("绿=接地/覆盖 · 红=悬空/漏丘 · 蓝=算法 · 黄=调整", 10, 25);
}

function drawCanyon(context: CanvasRenderingContext2D, canyon: SeedWorldGeologyCanyon): void {
  context.beginPath();
  canyon.points.forEach((point, index) =>
    index === 0 ? context.moveTo(point.x, point.z) : context.lineTo(point.x, point.z)
  );
  context.strokeStyle = "rgb(81 226 255 / 82%)";
  context.lineWidth = Math.max(4, canyon.widthMetres * 0.12);
  context.stroke();
  context.strokeStyle = "#07100e";
  context.lineWidth = Math.max(2, canyon.widthMetres * 0.05);
  context.stroke();
}

function drawHill(
  context: CanvasRenderingContext2D,
  hill: SeedWorldGeologyHill,
  feature: AcceptanceFeature,
  selected: TargetContext
): void {
  context.save();
  context.translate(hill.center.x, hill.center.z);
  context.rotate(hill.rotationRadians);
  context.beginPath();
  context.ellipse(0, 0, hill.bodyRadiusMetres.major, hill.bodyRadiusMetres.minor, 0, 0, Math.PI * 2);
  context.fillStyle = selected.hillIds.includes(hill.id) ? "rgb(237 255 246 / 15%)" : "rgb(237 255 246 / 7%)";
  context.strokeStyle = "rgb(229 255 241 / 68%)";
  context.lineWidth = 2;
  context.fill();
  context.stroke();
  context.restore();
  const bank = hill.canyonBank?.side;
  if (feature.canyon && bank) {
    context.fillStyle = bank === "left" ? "#ffb95c" : "#77d9ff";
    context.font = "700 10px ui-monospace, monospace";
    context.fillText(bank === "left" ? "L" : "R", hill.center.x, hill.center.z);
  }
}

function drawShoulderArrow(
  context: CanvasRenderingContext2D,
  target: SeedWorldRockCoverageTarget,
  selected: boolean
): void {
  const [startX, , startZ] = target.shoulderFoot;
  const [endX, , endZ] = target.crest;
  context.beginPath();
  context.moveTo(startX, startZ);
  context.lineTo(endX, endZ);
  context.strokeStyle = selected ? "#ffd354" : "rgb(255 211 84 / 58%)";
  context.lineWidth = selected ? 4 : 2.5;
  context.stroke();
  const angle = Math.atan2(endZ - startZ, endX - startX);
  const length = selected ? 13 : 9;
  context.beginPath();
  context.moveTo(endX, endZ);
  context.lineTo(endX - Math.cos(angle - 0.55) * length, endZ - Math.sin(angle - 0.55) * length);
  context.moveTo(endX, endZ);
  context.lineTo(endX - Math.cos(angle + 0.55) * length, endZ - Math.sin(angle + 0.55) * length);
  context.stroke();
}

function drawPlanObb(
  context: CanvasRenderingContext2D,
  rock: SeedWorldSolvedRockObb,
  fill: string,
  stroke: string,
  lineWidth: number
): void {
  const polygon = projectedPlanObb(rock);
  context.beginPath();
  polygon.forEach((point, index) =>
    index === 0 ? context.moveTo(point[0], point[1]) : context.lineTo(point[0], point[1])
  );
  context.closePath();
  context.fillStyle = fill;
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.fill();
  context.stroke();
}

function projectedPlanObb(rock: SeedWorldSolvedRockObb): readonly (readonly [number, number])[] {
  const tangent = rotateVectorByQuaternion(authoredCanonicalAxis([1, 0, 0]), rock.rotationQuaternion);
  const vertical = rotateVectorByQuaternion(authoredCanonicalAxis([0, 1, 0]), rock.rotationQuaternion);
  const uphill = rotateVectorByQuaternion(authoredUphillAxis(), rock.rotationQuaternion);
  const tangentLength = Math.max(1e-9, Math.hypot(tangent[0], tangent[2]));
  const uphillLength = Math.max(1e-9, Math.hypot(uphill[0], uphill[2]));
  const planTangent = Object.freeze([tangent[0] / tangentLength, tangent[2] / tangentLength] as const);
  const planUphill = Object.freeze([uphill[0] / uphillLength, uphill[2] / uphillLength] as const);
  const halfTangent = rock.obbSizeMetres[0] * 0.5;
  const halfUphill =
    uphillLength * rock.obbSizeMetres[2] * 0.5 + Math.hypot(vertical[0], vertical[2]) * rock.obbSizeMetres[1] * 0.5;
  return Object.freeze(
    (
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ] as const
    ).map(([tangentSign, uphillSign]) =>
      Object.freeze([
        rock.obbCenter[0] + planTangent[0] * halfTangent * tangentSign + planUphill[0] * halfUphill * uphillSign,
        rock.obbCenter[2] + planTangent[1] * halfTangent * tangentSign + planUphill[1] * halfUphill * uphillSign
      ] as const)
    )
  );
}

interface ProjectedSectionRock {
  readonly polygon: readonly (readonly [distance: number, height: number])[];
  readonly supports: readonly Readonly<{
    distance: number;
    height: number;
    contact: boolean;
  }>[];
  readonly center: readonly [distance: number, height: number];
  readonly tip: readonly [distance: number, height: number];
  readonly tiltDegrees: number;
}

function projectRockToSection(
  rock: SeedWorldSolvedRockObb,
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields
): ProjectedSectionRock {
  const direction = bearingVector(target.frame.downhillBearingRadians);
  const center = projectSectionPoint(target, direction, rock.obbCenter);
  const worldUphillAxis = rotateVectorByQuaternion(authoredUphillAxis(), rock.rotationQuaternion);
  const projectedUphill = Object.freeze([
    worldUphillAxis[0] * direction[0] + worldUphillAxis[2] * direction[1],
    worldUphillAxis[1]
  ] as const);
  const projectedUphillLength = Math.max(1e-9, Math.hypot(projectedUphill[0], projectedUphill[1]));
  const uphillAxis = Object.freeze([
    projectedUphill[0] / projectedUphillLength,
    projectedUphill[1] / projectedUphillLength
  ] as const);
  let verticalAxis: readonly [number, number] = Object.freeze([-uphillAxis[1], uphillAxis[0]] as const);
  if (verticalAxis[1] < 0) verticalAxis = Object.freeze([-verticalAxis[0], -verticalAxis[1]] as const);
  const halfUphill = rock.obbSizeMetres[2] * 0.5;
  const halfVertical = rock.obbSizeMetres[1] * 0.5;
  const points = Object.freeze(
    (
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ] as const
    ).map(([uphillSign, verticalSign]) =>
      Object.freeze([
        center[0] + uphillAxis[0] * halfUphill * uphillSign + verticalAxis[0] * halfVertical * verticalSign,
        center[1] + uphillAxis[1] * halfUphill * uphillSign + verticalAxis[1] * halfVertical * verticalSign
      ] as const)
    )
  );
  const toleranceMetres = Math.max(1.5, rock.obbSizeMetres[1] * 0.025);
  const supports = SEED_WORLD_CLIFF_1_ASSET_PROFILE.authoredSupportOffsetsMetres.map((support) => {
    const offset = rotateVectorByQuaternion(
      support.map((component) => component * rock.uniformScale) as [number, number, number],
      rock.rotationQuaternion
    );
    const world = Object.freeze([
      rock.obbCenter[0] + offset[0],
      rock.obbCenter[1] + offset[1],
      rock.obbCenter[2] + offset[2]
    ] as const);
    const terrainHeight = sampleHeight(fields, world[0], world[2]);
    const projected = projectSectionPoint(target, direction, world);
    return Object.freeze({
      distance: projected[0],
      height: projected[1],
      contact: world[1] <= terrainHeight + toleranceMetres
    });
  });
  const tipOffset = worldUphillAxis.map((component) => component * rock.obbSizeMetres[2] * 0.5) as [
    number,
    number,
    number
  ];
  const tip = projectSectionPoint(target, direction, [
    rock.obbCenter[0] + tipOffset[0],
    rock.obbCenter[1] + tipOffset[1],
    rock.obbCenter[2] + tipOffset[2]
  ]);
  return Object.freeze({
    polygon: points,
    supports: Object.freeze(supports),
    center,
    tip,
    tiltDegrees: radiansToDegrees(Math.atan2(worldUphillAxis[1], Math.hypot(worldUphillAxis[0], worldUphillAxis[2])))
  });
}

function projectSectionPoint(
  target: SeedWorldRockCoverageTarget,
  direction: readonly [x: number, z: number],
  point: readonly [x: number, y: number, z: number]
): readonly [distance: number, height: number] {
  return Object.freeze([
    (point[0] - target.crest[0]) * direction[0] + (point[2] - target.crest[2]) * direction[1],
    point[1]
  ] as const);
}

function centerlineCoverageSamples(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  rock: SeedWorldSolvedRockObb
): readonly Readonly<{ distance: number; height: number; covered: boolean }>[] {
  const direction = bearingVector(target.frame.downhillBearingRadians);
  return Object.freeze(
    [0.04, 0.24, 0.44, 0.64, 0.82].map((ratio) => {
      const distance = target.shoulderSpanMetres * ratio;
      const worldX = target.crest[0] + direction[0] * distance;
      const worldZ = target.crest[2] + direction[1] * distance;
      const height = sampleHeight(fields, worldX, worldZ);
      return Object.freeze({
        distance,
        height,
        covered: pointInsideRockObb([worldX, height, worldZ], rock)
      });
    })
  );
}

function measureCenterlineCoverage(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  rock: SeedWorldSolvedRockObb
): number {
  const samples = centerlineCoverageSamples(target, fields, rock);
  return samples.filter((sample) => sample.covered).length / samples.length;
}

function measureSupportEvidence(
  fields: SeedWorldFields,
  rock: SeedWorldSolvedRockObb
): Readonly<{ contactCount: number; totalCount: number }> {
  const toleranceMetres = Math.max(1.5, rock.obbSizeMetres[1] * 0.025);
  const contactCount = SEED_WORLD_CLIFF_1_ASSET_PROFILE.authoredSupportOffsetsMetres.filter((support) => {
    const offset = rotateVectorByQuaternion(
      support.map((component) => component * rock.uniformScale) as [number, number, number],
      rock.rotationQuaternion
    );
    const worldX = rock.obbCenter[0] + offset[0];
    const worldY = rock.obbCenter[1] + offset[1];
    const worldZ = rock.obbCenter[2] + offset[2];
    return worldY <= sampleHeight(fields, worldX, worldZ) + toleranceMetres;
  }).length;
  return Object.freeze({
    contactCount,
    totalCount: SEED_WORLD_CLIFF_1_ASSET_PROFILE.authoredSupportOffsetsMetres.length
  });
}

function pointInsideRockObb(point: readonly [x: number, y: number, z: number], rock: SeedWorldSolvedRockObb): boolean {
  const local = rotateVectorByQuaternionConjugate(
    [point[0] - rock.obbCenter[0], point[1] - rock.obbCenter[1], point[2] - rock.obbCenter[2]],
    rock.obbRotationQuaternion
  );
  return rock.obbSizeMetres.every((size, index) => Math.abs(local[index]!) <= size * 0.5 + 1e-6);
}

function authoredUphillAxis(): readonly [x: number, y: number, z: number] {
  return authoredCanonicalAxis([0, 0, 1]);
}

function authoredCanonicalAxis(
  canonicalAxis: readonly [x: number, y: number, z: number]
): readonly [x: number, y: number, z: number] {
  return rotateVectorByQuaternionConjugate(canonicalAxis, SEED_WORLD_CLIFF_1_ASSET_PROFILE.assetToCanonicalQuaternion);
}

function meanSlopeDegrees(target: SeedWorldRockCoverageTarget): number {
  return radiansToDegrees(Math.atan2(target.prominenceMetres, Math.max(1, target.shoulderSpanMetres)));
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string | CanvasGradient | CanvasPattern
): void {
  const angle = Math.atan2(endY - startY, endX - startX);
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX - Math.cos(angle - 0.5) * 8, endY - Math.sin(angle - 0.5) * 8);
  context.moveTo(endX, endY);
  context.lineTo(endX - Math.cos(angle + 0.5) * 8, endY - Math.sin(angle + 0.5) * 8);
  context.strokeStyle = color;
  context.lineWidth = 2.5;
  context.stroke();
}

function fitBounds(
  points: readonly (readonly [number, number])[],
  width: number,
  height: number,
  padding: number
): Readonly<{ scale: number; offsetX: number; offsetY: number }> {
  const minX = Math.min(...points.map((point) => point[0]));
  const maxX = Math.max(...points.map((point) => point[0]));
  const minY = Math.min(...points.map((point) => point[1]));
  const maxY = Math.max(...points.map((point) => point[1]));
  const scale = Math.min(
    (width - padding * 2) / Math.max(1, maxX - minX),
    (height - padding * 2) / Math.max(1, maxY - minY)
  );
  return Object.freeze({
    scale,
    offsetX: (width - (minX + maxX) * scale) * 0.5,
    offsetY: (height - (minY + maxY) * scale) * 0.5
  });
}

function acceptanceStorageKey(url: URL, fallbackGeologySeed: number): string {
  const geologySeed = url.searchParams.get("g") ?? String(fallbackGeologySeed);
  const hydrologySeed = url.searchParams.get("h") ?? "0";
  const mode = url.searchParams.get("rockLab") === "1" ? "acceptance" : "debug";
  const version = mode === "debug" ? "v18" : "v9";
  return `seed-world-rock-${mode}:${version}:g=${geologySeed}:h=${hydrologySeed}`;
}

function acceptanceGeneratedRockStorageKey(storageKey: string): string {
  return `${storageKey}:generated-rocks:v2`;
}

function overrideForTarget(
  overridesByTargetId: ReadonlyMap<string, SeedWorldRockAcceptanceOverride>,
  targetId: string,
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  rock?: SeedWorldSolvedRockObb
): SeedWorldRockAcceptanceOverride {
  return (
    overridesByTargetId.get(targetId) ??
    (rock
      ? seedWorldRockAcceptanceOverrideFromSolvedRock(target, fields, rock)
      : { ...SEED_WORLD_ROCK_ACCEPTANCE_DEFAULT_OVERRIDE })
  );
}

function setStoredOverride(
  overridesByTargetId: Map<string, SeedWorldRockAcceptanceOverride>,
  targetId: string,
  override: SeedWorldRockAcceptanceOverride
): void {
  overridesByTargetId.set(targetId, Object.freeze({ ...override }));
}

function readStoredOverrides(storageKey: string): Map<string, SeedWorldRockAcceptanceOverride> {
  const overrides = new Map<string, SeedWorldRockAcceptanceOverride>();
  const raw = localStorage.getItem(storageKey);
  if (!raw) return overrides;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [targetId, value] of Object.entries(parsed)) {
      const override = parseStoredOverride(value);
      if (override) overrides.set(targetId, override);
    }
  } catch {
    localStorage.removeItem(storageKey);
  }
  return overrides;
}

function parseStoredOverride(value: unknown): SeedWorldRockAcceptanceOverride | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<Record<keyof SeedWorldRockAcceptanceOverride, unknown>>;
  const override = {
    alongShoulderMetres: candidate.alongShoulderMetres,
    downhillMetres: candidate.downhillMetres,
    yawDegrees:
      typeof candidate.yawDegrees === "number" ? normalizeDegrees(candidate.yawDegrees) : candidate.yawDegrees,
    pitchDegrees:
      typeof candidate.pitchDegrees === "number" ? normalizeDegrees(candidate.pitchDegrees) : candidate.pitchDegrees,
    rollDegrees: typeof candidate.rollDegrees === "number" ? normalizeDegrees(candidate.rollDegrees) : 0,
    uniformScaleMultiplier: candidate.uniformScaleMultiplier,
    burialMetres: candidate.burialMetres
  };
  if (!Object.values(override).every((entry) => typeof entry === "number" && Number.isFinite(entry))) return undefined;
  if ((override.uniformScaleMultiplier as number) <= 0) return undefined;
  return Object.freeze(override as SeedWorldRockAcceptanceOverride);
}

function persistStoredOverrides(
  storageKey: string,
  overridesByTargetId: ReadonlyMap<string, SeedWorldRockAcceptanceOverride>
): void {
  if (overridesByTargetId.size === 0) {
    localStorage.removeItem(storageKey);
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(overridesByTargetId)));
}

function readStoredStringSet(storageKey: string): Set<string> {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) throw new TypeError();
    return new Set(parsed);
  } catch {
    localStorage.removeItem(storageKey);
    return new Set();
  }
}

function persistStringSet(storageKey: string, values: ReadonlySet<string>): void {
  if (values.size === 0) localStorage.removeItem(storageKey);
  else localStorage.setItem(storageKey, JSON.stringify([...values].sort()));
}

function readStoredRequests(storageKey: string): readonly SeedWorldRockAcceptanceRequest[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return Object.freeze([]);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new TypeError();
    const requests = parsed.map(parseStoredRequest);
    if (requests.some((request) => request === undefined)) throw new TypeError();
    return Object.freeze(requests as SeedWorldRockAcceptanceRequest[]);
  } catch {
    localStorage.removeItem(storageKey);
    return Object.freeze([]);
  }
}

function parseStoredRequest(value: unknown): SeedWorldRockAcceptanceRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<SeedWorldRockAcceptanceRequest>;
  if (
    typeof candidate.id !== "string" ||
    !Array.isArray(candidate.position) ||
    candidate.position.length !== 3 ||
    !candidate.position.every((entry) => typeof entry === "number" && Number.isFinite(entry)) ||
    !Array.isArray(candidate.sourceHillIds) ||
    !candidate.sourceHillIds.every((entry) => typeof entry === "string")
  ) {
    return undefined;
  }
  return Object.freeze({
    id: candidate.id,
    position: Object.freeze([...candidate.position] as [number, number, number]),
    nearestTargetId: typeof candidate.nearestTargetId === "string" ? candidate.nearestTargetId : undefined,
    canyonId: typeof candidate.canyonId === "string" ? candidate.canyonId : undefined,
    sourceHillIds: Object.freeze([...candidate.sourceHillIds])
  });
}

function persistRequests(storageKey: string, requests: readonly SeedWorldRockAcceptanceRequest[]): void {
  if (requests.length === 0) localStorage.removeItem(storageKey);
  else localStorage.setItem(storageKey, JSON.stringify(requests));
}

function writeRequestList(
  host: HTMLElement,
  requests: readonly SeedWorldRockAcceptanceRequest[],
  selectedRequestId: string | undefined
): void {
  host.hidden = requests.length === 0;
  host.innerHTML = requests
    .map(
      (request) =>
        `<span data-active="${String(request.id === selectedRequestId)}"><button type="button" data-rock-request-select="${escapeHtml(request.id)}"><b>${escapeHtml(request.id)}</b><small>${request.position[0].toFixed(0)}, ${request.position[2].toFixed(0)}</small></button><button type="button" data-rock-request-remove="${escapeHtml(request.id)}" aria-label="删除 ${escapeHtml(request.id)}">×</button></span>`
    )
    .join("");
}

function requestIdFromRockId(rockId: string): string | undefined {
  const match = /^acceptance-add:(A\d+):rock-\d+$/.exec(rockId);
  return match?.[1];
}

function nextRequestId(requests: readonly SeedWorldRockAcceptanceRequest[]): string {
  const maximum = requests.reduce((value, request) => Math.max(value, Number(request.id.slice(1)) || 0), 0);
  return `A${String(maximum + 1).padStart(2, "0")}`;
}

function squaredPlanDistance(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): number {
  return (left[0] - right[0]) ** 2 + (left[2] - right[2]) ** 2;
}

function compileAcceptanceExport(
  options: SeedWorldRockAcceptancePanelOptions,
  features: readonly AcceptanceFeature[],
  overridesByTargetId: ReadonlyMap<string, SeedWorldRockAcceptanceOverride>,
  deletedRockIds: ReadonlySet<string>,
  requests: readonly SeedWorldRockAcceptanceRequest[],
  selectedFeatureId: string,
  selectedTargetId: string
): string {
  const featureByTargetId = new Map(
    features.flatMap((feature) => feature.targets.map((target) => [target.id, feature] as const))
  );
  const targetById = new Map(options.compilation.terrain.targets.map((target) => [target.id, target] as const));
  const adjustments = options.compilation.assemblies.rocks.map((rock, index) => {
    const targetId = targetIdFromRockId(rock.id);
    const target = targetById.get(targetId);
    const feature = featureByTargetId.get(targetId);
    const storedOverride = overridesByTargetId.get(targetId);
    const override =
      storedOverride ??
      (target
        ? seedWorldRockAcceptanceOverrideFromSolvedRock(target, options.fields, rock)
        : { ...SEED_WORLD_ROCK_ACCEPTANCE_DEFAULT_OVERRIDE });
    const resolved = target ? previewWithAbsoluteTransform(options, target, rock, override).rock : rock;
    return {
      label: `P${String(index + 1).padStart(2, "0")}`,
      rockId: rock.id,
      targetId,
      featureId: feature?.id ?? null,
      canyonId: target?.frame.canyonId ?? null,
      bankSide: target?.frame.bankSide ?? null,
      sourceHillIds: target?.sourceHillIds ?? [],
      terrainTarget: target ? terrainTargetEvidence(target) : null,
      deleted: deletedRockIds.has(rock.id),
      adjusted: Boolean(storedOverride),
      override,
      baseline: {
        assetId: rock.assetId,
        position: rock.position,
        obbCenter: rock.obbCenter,
        rotationQuaternion: rock.rotationQuaternion,
        uniformScale: rock.uniformScale,
        obbSizeMetres: rock.obbSizeMetres
      },
      resolved
    };
  });
  const addRequests = requests.map((request) => {
    const target = targetById.get(request.nearestTargetId ?? "");
    const context = target ? resolveRequestTargetContext(request, target, options.compilation) : undefined;
    const override = target
      ? overrideForTarget(overridesByTargetId, requestOverrideKey(request.id), target, options.fields, context?.rock)
      : { ...SEED_WORLD_ROCK_ACCEPTANCE_DEFAULT_OVERRIDE };
    const preview = context?.rock
      ? previewWithAbsoluteTransform(options, context.target, context.rock, override)
      : undefined;
    return {
      ...request,
      override,
      rock: preview?.rock ?? context?.rock ?? null
    };
  });
  const targetOverrides = [...overridesByTargetId.entries()]
    .filter(([id]) => !id.startsWith("request:") && !id.startsWith("generated-rock:"))
    .map(([targetId, override]) => ({ targetId, override }));
  return JSON.stringify(
    {
      schema: "seed-world-rock-acceptance-adjustments/v7",
      world: {
        geologySeed: Number(options.url.searchParams.get("g") ?? 1729),
        hydrologySeed: Number(options.url.searchParams.get("h") ?? 0),
        layoutWorldId: options.layout.worldId,
        worldSizeMetres: options.layout.worldSizeMetres,
        heightResolution: options.fields.heightResolution
      },
      contract: {
        coordinateSystem: "world-x-up-y-world-z-metres",
        uniformScaleOnly: true,
        rotation: "absolute-asset-euler-x-then-y-then-z",
        burial: "absolute-metres-below-zero-depth-root-contact",
        baselineGuard: "layoutWorldId"
      },
      selected: { featureId: selectedFeatureId, targetId: selectedTargetId },
      adjustedTargetCount: targetOverrides.length,
      deletedRockCount: deletedRockIds.size,
      addedRequestCount: requests.length,
      rockCount: adjustments.length,
      rocks: adjustments,
      addRequests,
      operations: {
        deleteRockIds: [...deletedRockIds].sort(),
        targetOverrides,
        additions: addRequests
      }
    },
    null,
    2
  );
}

function terrainTargetEvidence(target: SeedWorldRockCoverageTarget): object {
  return {
    crest: target.crest,
    shoulderFoot: target.shoulderFoot,
    prominenceMetres: target.prominenceMetres,
    shoulderSpanMetres: target.shoulderSpanMetres,
    tangentSpanMetres: target.tangentSpanMetres,
    regionalInfluenceSpanMetres: target.regionalInfluenceSpanMetres,
    frame: target.frame
  };
}

async function writeClipboardText(value: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Browser clipboard API is unavailable");
}

function bankSummary(targets: readonly SeedWorldRockCoverageTarget[]): string {
  const left = targets.filter((target) => target.frame.bankSide === "left").length;
  const right = targets.filter((target) => target.frame.bankSide === "right").length;
  return `L${left}/R${right}`;
}

function sampleHeight(fields: SeedWorldFields, x: number, z: number): number {
  return sampleSeedWorldHeight(fields, x, z) ?? 0;
}

function convexHull(points: readonly (readonly [number, number])[]): readonly (readonly [number, number])[] {
  const sorted = [...points].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  if (sorted.length <= 2) return sorted;
  const cross = (
    origin: readonly [number, number],
    left: readonly [number, number],
    right: readonly [number, number]
  ): number => (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0]);
  const lower: Array<readonly [number, number]> = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Array<readonly [number, number]> = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return Object.freeze([...lower, ...upper]);
}

function rotateVectorByQuaternion(
  vector: readonly [number, number, number],
  quaternion: readonly [number, number, number, number]
): readonly [number, number, number] {
  const [axisX, axisY, axisZ, scalar] = quaternion;
  const crossX = axisY * vector[2] - axisZ * vector[1];
  const crossY = axisZ * vector[0] - axisX * vector[2];
  const crossZ = axisX * vector[1] - axisY * vector[0];
  const secondCrossX = axisY * crossZ - axisZ * crossY;
  const secondCrossY = axisZ * crossX - axisX * crossZ;
  const secondCrossZ = axisX * crossY - axisY * crossX;
  return Object.freeze([
    vector[0] + 2 * (scalar * crossX + secondCrossX),
    vector[1] + 2 * (scalar * crossY + secondCrossY),
    vector[2] + 2 * (scalar * crossZ + secondCrossZ)
  ] as const);
}

function rotateVectorByQuaternionConjugate(
  vector: readonly [number, number, number],
  quaternion: readonly [number, number, number, number]
): readonly [number, number, number] {
  return rotateVectorByQuaternion(vector, [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]]);
}

function bearingVector(bearing: number): readonly [x: number, z: number] {
  return Object.freeze([Math.sin(bearing), Math.cos(bearing)] as const);
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function formatValue(field: keyof SeedWorldRockAcceptanceOverride, value: number): string {
  return field === "uniformScaleMultiplier" ? value.toFixed(2) : value.toFixed(0);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!
  );
}

function requiredElement<T extends Element>(host: ParentNode, id: string): T {
  const element = host.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`Missing rock acceptance element #${id}`);
  return element;
}
