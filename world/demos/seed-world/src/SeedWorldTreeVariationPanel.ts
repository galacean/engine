import type * as dat from "dat.gui";
import {
  INSTANCED_BIRCH_VARIATION_LIMITS,
  type InstancedBirchVariationControls
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeVariationControls";
import type { SeedWorldPopulationRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldPopulationRuntime";

/** dat.gui host scoped to the dedicated procedural-tree category. */
export interface SeedWorldTreeVariationPanelHost {
  readonly gui: dat.GUI;
  folder(title: string, open?: boolean): dat.GUI;
}

/** Browser API for selecting and editing the loaded recipe-owned renderer effects. */
export interface SeedWorldTreeVariationApi {
  listSpecies(): ReturnType<SeedWorldPopulationRuntime["getProceduralTreeVariationSets"]>;
  selectSpecies(recipeId: string): InstancedBirchVariationControls;
  selectVariation(variationIndex: number): InstancedBirchVariationControls;
  getControls(recipeId?: string, variationIndex?: number): InstancedBirchVariationControls;
  setControls(
    patch: Readonly<Partial<InstancedBirchVariationControls>>,
    recipeId?: string,
    variationIndex?: number
  ): InstancedBirchVariationControls;
  resetVariation(recipeId?: string, variationIndex?: number): InstancedBirchVariationControls;
  resetSpecies(recipeId?: string): readonly InstancedBirchVariationControls[];
}

export interface SeedWorldTreeVariationPanel {
  destroy(): void;
}

declare global {
  interface Window {
    seedWorldTreeVariations?: SeedWorldTreeVariationApi;
  }
}

interface VariationPanelState {
  recipeId: string;
  variationIndex: number;
  horizontalScale: number;
  verticalScale: number;
  yawDegrees: number;
  trunkThicknessScale: number;
  branchLengthScale: number;
  branchCurvatureDegreesPerMeter: number;
  branchDensity: number;
  leafDensity: number;
  leafSizeScale: number;
  leafColor: string;
  barkColor: string;
}

/** Mounts editable recipe effects; a base-only catalog has no variation editor. */
export function mountSeedWorldTreeVariationPanel(
  runtime: SeedWorldPopulationRuntime,
  host: SeedWorldTreeVariationPanelHost
): SeedWorldTreeVariationPanel {
  const species = runtime.getProceduralTreeVariationSets().filter(({ controls }) => controls.length > 0);
  if (!species.length) return { destroy() {} };

  const folder = host.folder("Tree Variations / 树形效果", true);
  const wholeTree = folder.addFolder("Whole Tree / 整体树形");
  const branches = folder.addFolder("Branches / 树枝");
  const leaves = folder.addFolder("Leaves / 树叶");
  wholeTree.open();
  branches.open();
  leaves.open();

  const speciesOptions = Object.fromEntries(species.map(({ label, recipeId }) => [label, recipeId]));
  const variationOptions = (count: number) => Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`Effect ${index + 1} / 效果 ${index + 1}`, index])
  );
  const state = controlsToState(species[0]!.recipeId, 0, species[0]!.controls[0]!);
  const controllers: dat.GUIController[] = [];
  const dissolve = folder.addFolder("AI density dissolve / AI 密度消隐");
  const previewState = {
    progress: 0,
    dissolve: () => { void runtime.playTreeDissolvePreview(state.recipeId, state.variationIndex, false, updatePreviewProgress).catch(console.error); },
    reveal: () => { void runtime.playTreeDissolvePreview(state.recipeId, state.variationIndex, true, updatePreviewProgress).catch(console.error); },
    end: () => { runtime.endTreeDissolvePreview(); updatePreviewProgress(0); }
  };
  dissolve.add(previewState, "dissolve").name("Preview dissolve / 播放溶解");
  dissolve.add(previewState, "reveal").name("Preview reveal / 播放显现");
  const previewProgress = dissolve.add(previewState, "progress", 0, 1, 0.01)
    .name("Preview progress / 预览进度")
    .onChange((progress: number) => runtime.setTreeDissolvePreviewProgress(state.recipeId, state.variationIndex, progress));
  dissolve.add(previewState, "end").name("End preview / 结束预览");
  function updatePreviewProgress(progress: number): void {
    previewState.progress = progress;
    previewProgress.updateDisplay();
  }
  const dissolveState = {
    durationSeconds: runtime.treeDensityDissolveDurationSeconds,
    band: runtime.treeDensityDissolveBand,
    color: srgbBytesToHex(runtime.treeDissolveStyle.colorRgb),
    ...runtime.treeDissolveStyle
  };
  dissolve.add(dissolveState, "band", 0.01, 1, 0.01)
    .name("Density band / 密度过渡宽度")
    .onChange((band: number) => runtime.setTreeDensityDissolveBand(band));
  dissolve.add(dissolveState, "durationSeconds", 0, 30, 0.1)
    .name("AI duration s / AI 过渡秒数")
    .onChange((seconds: number) => runtime.setTreeDensityDissolveDurationSeconds(seconds));
  dissolve.add(dissolveState, "followLeafHue")
    .name("Follow leaf hue / 跟随树叶色系")
    .onChange((followLeafHue: boolean) => runtime.setTreeDissolveStyle({ followLeafHue }));
  dissolve.addColor(dissolveState, "color")
    .name("Edge color / 边缘颜色")
    .onChange((color: string) => runtime.setTreeDissolveStyle({ colorRgb: srgbHexToBytes(color) }));
  dissolve.add(dissolveState, "spectrum", 0, 1, 0.01)
    .name("Spectrum / 彩虹混合")
    .onChange((spectrum: number) => runtime.setTreeDissolveStyle({ spectrum }));
  dissolve.add(dissolveState, "brightness", 0, 5, 0.01)
    .name("Brightness / 边缘亮度")
    .onChange((brightness: number) => runtime.setTreeDissolveStyle({ brightness }));
  dissolve.add(dissolveState, "widthRatio", 0, 0.5, 0.005)
    .name("Edge width / 边缘宽度比例")
    .onChange((widthRatio: number) => runtime.setTreeDissolveStyle({ widthRatio }));
  dissolve.add(dissolveState, "minimumWidth", 0.01, 5, 0.01)
    .name("Min width m / 最小宽度米")
    .onChange((minimumWidth: number) => runtime.setTreeDissolveStyle({ minimumWidth }));
  dissolve.add(dissolveState, "colorFrequency", 0, 2, 0.01)
    .name("Color frequency / 彩虹频率")
    .onChange((colorFrequency: number) => runtime.setTreeDissolveStyle({ colorFrequency }));
  dissolve.add(dissolveState, "lift", 0, 5, 0.01)
    .name("Lift m / 抬升幅度米")
    .onChange((lift: number) => runtime.setTreeDissolveStyle({ lift }));
  dissolve.add(dissolveState, "spectrumBase", 0, 2, 0.01)
    .name("Spectrum base / 彩虹底色强度")
    .onChange((spectrumBase: number) => runtime.setTreeDissolveStyle({ spectrumBase }));
  dissolve.add(dissolveState, "spectrumAmplitude", 0, 2, 0.01)
    .name("Spectrum amplitude / 彩虹振幅")
    .onChange((spectrumAmplitude: number) => runtime.setTreeDissolveStyle({ spectrumAmplitude }));
  for (const [key, label] of [["phaseR", "R"], ["phaseG", "G"], ["phaseB", "B"]] as const) {
    dissolve.add(dissolveState, key, 0, 1, 0.01)
      .name(`Phase ${label} / ${label} 相位`)
      .onChange((value: number) => runtime.setTreeDissolveStyle({ [key]: value }));
  }
  dissolve.open();

  const selectedControls = (): InstancedBirchVariationControls => {
    const variationSet = runtime
      .getProceduralTreeVariationSets()
      .find(({ recipeId }) => recipeId === state.recipeId);
    const controls = variationSet?.controls[state.variationIndex];
    if (!controls) throw new RangeError("Selected Seed World tree variation is unavailable");
    return controls;
  };

  const applyPatch = (
    patch: Readonly<Partial<InstancedBirchVariationControls>>
  ): InstancedBirchVariationControls => {
    if (patch.leafDensity !== undefined || patch.branchDensity !== undefined) runtime.finishTreeDensityDissolve();
    previewState.end();
    const next = runtime.setProceduralTreeVariationControls(state.recipeId, state.variationIndex, patch);
    const controls = next[state.variationIndex]!;
    synchronize(controls);
    return controls;
  };

  const speciesController = folder
    .add(state, "recipeId", speciesOptions)
    .name("Tree species / 树种")
    .onChange((recipeId: string) => selectSpecies(recipeId));
  let variationController = folder
    .add(state, "variationIndex", variationOptions(species[0]!.controls.length))
    .name("Tree effect / 树形效果")
    .onChange((variationIndex: number | string) => selectVariation(Number(variationIndex)));
  controllers.push(
    speciesController,
    variationController,
    wholeTree
      .add(state, "horizontalScale", ...INSTANCED_BIRCH_VARIATION_LIMITS.horizontalScale, 0.01)
      .name("Horizontal scale / 横向比例")
      .onChange((horizontalScale: number) => applyPatch({ horizontalScale })),
    wholeTree
      .add(state, "verticalScale", ...INSTANCED_BIRCH_VARIATION_LIMITS.verticalScale, 0.01)
      .name("Vertical scale / 高度比例")
      .onChange((verticalScale: number) => applyPatch({ verticalScale })),
    wholeTree
      .add(state, "yawDegrees", ...INSTANCED_BIRCH_VARIATION_LIMITS.yawDegrees, 1)
      .name("Yaw / 水平旋转")
      .onChange((yawDegrees: number) => applyPatch({ yawDegrees })),
    wholeTree
      .add(state, "trunkThicknessScale", ...INSTANCED_BIRCH_VARIATION_LIMITS.trunkThicknessScale, 0.01)
      .name("Trunk thickness / 树干粗细")
      .onChange((trunkThicknessScale: number) => applyPatch({ trunkThicknessScale })),
    branches
      .add(state, "branchLengthScale", ...INSTANCED_BIRCH_VARIATION_LIMITS.branchLengthScale, 0.01)
      .name("Branch length / 树枝长度")
      .onChange((branchLengthScale: number) => applyPatch({ branchLengthScale })),
    branches
      .add(
        state,
        "branchCurvatureDegreesPerMeter",
        ...INSTANCED_BIRCH_VARIATION_LIMITS.branchCurvatureDegreesPerMeter,
        0.1
      )
      .name("Branch curvature / 树枝弯曲")
      .onChange((branchCurvatureDegreesPerMeter: number) => applyPatch({ branchCurvatureDegreesPerMeter })),
    branches
      .add(state, "branchDensity", ...INSTANCED_BIRCH_VARIATION_LIMITS.branchDensity, 0.01)
      .name("Branch density / 树枝密度")
      .onChange((branchDensity: number) => applyPatch({ branchDensity })),
    leaves
      .add(state, "leafDensity", ...INSTANCED_BIRCH_VARIATION_LIMITS.leafDensity, 0.01)
      .name("Leaf density / 树叶密度")
      .onChange((leafDensity: number) => applyPatch({ leafDensity })),
    leaves
      .add(state, "leafSizeScale", ...INSTANCED_BIRCH_VARIATION_LIMITS.leafSizeScale, 0.01)
      .name("Leaf size / 树叶大小")
      .onChange((leafSizeScale: number) => applyPatch({ leafSizeScale })),
    leaves
      .addColor(state, "leafColor")
      .name("Leaf color / 树叶颜色")
      .onChange((leafColor: string) => applyPatch({ leafColorRgb: srgbHexToBytes(leafColor) })),
    wholeTree
      .addColor(state, "barkColor")
      .name("Bark color / 树皮颜色")
      .onChange((barkColor: string) => applyPatch({ barkColorRgb: srgbHexToBytes(barkColor) }))
  );

  const actions = {
    resetVariation(): void {
      previewState.end();
      synchronize(runtime.resetProceduralTreeVariationControls(state.recipeId, state.variationIndex)[state.variationIndex]!);
    },
    resetSpecies(): void {
      previewState.end();
      synchronize(runtime.resetProceduralTreeVariationSet(state.recipeId)[state.variationIndex]!);
    }
  };
  folder.add(actions, "resetVariation").name("Reset effect / 恢复当前效果");
  folder.add(actions, "resetSpecies").name("Reset species / 恢复当前树种");

  function selectSpecies(recipeId: string): InstancedBirchVariationControls {
    previewState.end();
    const variationSet = runtime.getProceduralTreeVariationSets().find((candidate) => candidate.recipeId === recipeId);
    if (!variationSet?.controls.length) throw new RangeError(`Seed World tree recipe "${recipeId}" has no editable variations`);
    state.recipeId = recipeId;
    state.variationIndex = Math.min(state.variationIndex, variationSet.controls.length - 1);
    const replacement = variationController.options(variationOptions(variationSet.controls.length))
      .name("Tree effect / 树形效果")
      .onChange((variationIndex: number | string) => selectVariation(Number(variationIndex)));
    controllers[controllers.indexOf(variationController)] = replacement;
    variationController = replacement;
    document.body.dataset.treeVariationEffectCount = String(variationSet.controls.length);
    const controls = variationSet.controls[state.variationIndex]!;
    synchronize(controls);
    return controls;
  }

  function selectVariation(variationIndex: number): InstancedBirchVariationControls {
    previewState.end();
    if (!Number.isInteger(variationIndex) || variationIndex < 0 || !runtime.getProceduralTreeVariationSets().find(({ recipeId }) => recipeId === state.recipeId)?.controls[variationIndex]) {
      throw new RangeError(`Seed World tree variation ${variationIndex + 1} is unavailable`);
    }
    state.variationIndex = variationIndex;
    const controls = selectedControls();
    synchronize(controls);
    return controls;
  }

  function synchronize(controls: InstancedBirchVariationControls): void {
    Object.assign(state, controlsToState(state.recipeId, state.variationIndex, controls));
    for (const controller of controllers) controller.updateDisplay();
  }

  function selectControls(recipeId = state.recipeId, variationIndex?: number): InstancedBirchVariationControls {
    if (recipeId !== state.recipeId) selectSpecies(recipeId);
    if (variationIndex !== undefined && variationIndex !== state.variationIndex) selectVariation(variationIndex);
    return selectedControls();
  }

  const api: SeedWorldTreeVariationApi = Object.freeze({
    listSpecies: () => runtime.getProceduralTreeVariationSets(),
    selectSpecies,
    selectVariation,
    getControls: selectControls,
    setControls: (
      patch: Readonly<Partial<InstancedBirchVariationControls>>,
      recipeId = state.recipeId,
      variationIndex?: number
    ) => {
      selectControls(recipeId, variationIndex);
      return applyPatch(patch);
    },
    resetVariation: (recipeId = state.recipeId, variationIndex?: number) => {
      selectControls(recipeId, variationIndex);
      actions.resetVariation();
      return selectedControls();
    },
    resetSpecies: (recipeId = state.recipeId) => {
      if (recipeId !== state.recipeId) selectSpecies(recipeId);
      actions.resetSpecies();
      return runtime.getProceduralTreeVariationSets().find((candidate) => candidate.recipeId === recipeId)!.controls;
    }
  });
  window.seedWorldTreeVariations = api;
  const unsubscribe = runtime.subscribeTreeVariationChanges(() => synchronize(selectedControls()));
  document.body.dataset.treeVariationPanel = "ready";
  document.body.dataset.treeVariationSpeciesCount = String(species.length);
  document.body.dataset.treeVariationEffectCount = String(species[0]!.controls.length);

  let destroyed = false;
  return Object.freeze({
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      runtime.endTreeDissolvePreview();
      unsubscribe();
      host.gui.removeFolder(folder);
      if (window.seedWorldTreeVariations === api) window.seedWorldTreeVariations = undefined;
      delete document.body.dataset.treeVariationPanel;
      delete document.body.dataset.treeVariationSpeciesCount;
      delete document.body.dataset.treeVariationEffectCount;
    }
  });
}

function controlsToState(
  recipeId: string,
  variationIndex: number,
  controls: InstancedBirchVariationControls
): VariationPanelState {
  return {
    recipeId,
    variationIndex,
    horizontalScale: controls.horizontalScale,
    verticalScale: controls.verticalScale,
    yawDegrees: controls.yawDegrees,
    trunkThicknessScale: controls.trunkThicknessScale ?? 1,
    branchLengthScale: controls.branchLengthScale,
    branchCurvatureDegreesPerMeter: controls.branchCurvatureDegreesPerMeter,
    branchDensity: controls.branchDensity,
    leafDensity: controls.leafDensity,
    leafSizeScale: controls.leafSizeScale,
    leafColor: srgbBytesToHex(controls.leafColorRgb),
    barkColor: srgbBytesToHex(controls.barkColorRgb)
  };
}

function srgbBytesToHex(color: readonly [number, number, number]): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function srgbHexToBytes(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return Object.freeze([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}
