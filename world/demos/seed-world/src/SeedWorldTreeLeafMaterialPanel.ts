import type * as dat from "dat.gui";
import type { TreeLeafLightingTuning } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyPresetFactory";
import type { SeedWorldPopulationRuntime, SeedWorldProceduralTreeLeafMaterial } from "@galacean/engine-world-planning/runtime/SeedWorldPopulationRuntime";

/** dat.gui host scoped to the dedicated procedural-tree category. */
export interface SeedWorldTreeLeafMaterialPanelHost {
  readonly gui: dat.GUI;
  folder(title: string, open?: boolean): dat.GUI;
}

/** Browser API mirroring every editable procedural-tree leaf material parameter. */
export interface SeedWorldTreeLeafMaterialApi {
  listMaterials(): readonly SeedWorldProceduralTreeLeafMaterial[];
  selectMaterial(recipeId: string): TreeLeafLightingTuning;
  getTuning(recipeId?: string): TreeLeafLightingTuning;
  setTuning(patch: Readonly<Partial<TreeLeafLightingTuning>>, recipeId?: string): TreeLeafLightingTuning;
  resetTuning(recipeId?: string): TreeLeafLightingTuning;
  applySelectedToAll(): readonly SeedWorldProceduralTreeLeafMaterial[];
  resetAll(): readonly SeedWorldProceduralTreeLeafMaterial[];
}

/** Lifetime handle for the Seed World procedural-tree leaf material panel. */
export interface SeedWorldTreeLeafMaterialPanel {
  destroy(): void;
}

declare global {
  interface Window {
    seedWorldTreeLeafMaterials?: SeedWorldTreeLeafMaterialApi;
  }
}

interface LeafPanelState {
  materialId: string;
  baseColor: string;
  secondColor: string;
  translucencyColor: string;
  secondColorLevel: number;
  secondColorGradient: number;
  albedoBrightness: number;
  albedoDesaturation: number;
  albedoTextureBlend: number;
  baseAoInfluence: number;
  glancingAngleCut: number;
  flipBackfaceNormals: boolean;
  translucencyIntensity: number;
  translucencyAoInfluence: number;
  normalDistortion: number;
  scatteringExponent: number;
  directStrength: number;
  ambientStrength: number;
  shadowStrength: number;
}

/** Mounts one complete live editor for every loaded procedural-tree leaf material. */
export function mountSeedWorldTreeLeafMaterialPanel(
  runtime: SeedWorldPopulationRuntime,
  host: SeedWorldTreeLeafMaterialPanelHost
): SeedWorldTreeLeafMaterialPanel {
  const materials = runtime.getProceduralTreeLeafMaterials();
  if (materials.length === 0) throw new Error("Seed World procedural-tree leaf panel requires at least one material");

  const folder = host.folder("Leaf Material / 叶片材质", true);
  const colors = folder.addFolder("Colors & Layers / 颜色与层次");
  const surface = folder.addFolder("Surface / 表面");
  const coverage = folder.addFolder("Coverage & Normals / 覆盖与法线");
  const transmission = folder.addFolder("Transmitted Light / 透射光");
  colors.open();
  surface.open();
  coverage.open();
  transmission.open();

  const materialOptions = Object.fromEntries(materials.map(({ label, recipeId }) => [label, recipeId]));
  const state = materialToPanelState(materials[0]!);
  const controllers: dat.GUIController[] = [];

  const applyPatch = (patch: Readonly<Partial<TreeLeafLightingTuning>>): TreeLeafLightingTuning => {
    const tuning = runtime.setProceduralTreeLeafLightingTuning(state.materialId, patch);
    synchronize(tuning);
    return tuning;
  };
  const applyColors = (): void => {
    applyPatch({
      baseColorRgb: srgbHexToBytes(state.baseColor),
      secondColorRgb: srgbHexToBytes(state.secondColor),
      translucencyColorRgb: srgbHexToBytes(state.translucencyColor)
    });
  };

  controllers.push(
    folder
      .add(state, "materialId", materialOptions)
      .name("Tree species / 树种材质")
      .onChange((recipeId: string) => selectMaterial(recipeId)),
    colors.addColor(state, "baseColor").name("Base color / 基础色").onChange(applyColors),
    colors.addColor(state, "secondColor").name("Second color / 第二色").onChange(applyColors),
    colors.addColor(state, "translucencyColor").name("Transmission tint / 透射色").onChange(applyColors),
    colors
      .add(state, "secondColorLevel", -50, 50, 0.05)
      .name("Second level / 第二色高度")
      .onChange((secondColorLevel: number) => applyPatch({ secondColorLevel })),
    colors
      .add(state, "secondColorGradient", -20, 20, 0.05)
      .name("Second gradient / 第二色渐变")
      .onChange((secondColorGradient: number) => applyPatch({ secondColorGradient })),
    surface
      .add(state, "albedoBrightness", 0, 5, 0.01)
      .name("Brightness / 明度")
      .onChange((albedoBrightness: number) => applyPatch({ albedoBrightness })),
    surface
      .add(state, "albedoDesaturation", 0, 1, 0.01)
      .name("Desaturation / 去饱和")
      .onChange((albedoDesaturation: number) => applyPatch({ albedoDesaturation })),
    surface
      .add(state, "albedoTextureBlend", 0, 1, 0.01)
      .name("Texture overlay / 纹理叠加")
      .onChange((albedoTextureBlend: number) => applyPatch({ albedoTextureBlend })),
    surface
      .add(state, "baseAoInfluence", 0, 1, 0.01)
      .name("Canopy occlusion / 树冠遮蔽")
      .onChange((baseAoInfluence: number) => applyPatch({ baseAoInfluence })),
    coverage
      .add(state, "glancingAngleCut", 0, 1, 0.01)
      .name("Glancing cut / 掠射裁剪")
      .onChange((glancingAngleCut: number) => applyPatch({ glancingAngleCut })),
    coverage
      .add(state, "flipBackfaceNormals")
      .name("Flip back normals / 背面翻转")
      .onChange((flipBackfaceNormals: boolean) => applyPatch({ flipBackfaceNormals })),
    transmission
      .add(state, "translucencyIntensity", 0, 50, 0.05)
      .name("Intensity / 强度")
      .onChange((translucencyIntensity: number) => applyPatch({ translucencyIntensity })),
    transmission
      .add(state, "translucencyAoInfluence", 0, 1, 0.01)
      .name("AO influence / 遮蔽影响")
      .onChange((translucencyAoInfluence: number) => applyPatch({ translucencyAoInfluence })),
    transmission
      .add(state, "normalDistortion", 0, 1, 0.01)
      .name("Normal distortion / 法线扰动")
      .onChange((normalDistortion: number) => applyPatch({ normalDistortion })),
    transmission
      .add(state, "scatteringExponent", 1, 50, 0.1)
      .name("Scattering / 散射对比")
      .onChange((scatteringExponent: number) => applyPatch({ scatteringExponent })),
    transmission
      .add(state, "directStrength", 0, 1, 0.01)
      .name("Direct / 直接光")
      .onChange((directStrength: number) => applyPatch({ directStrength })),
    transmission
      .add(state, "ambientStrength", 0, 1, 0.01)
      .name("Ambient / 环境光")
      .onChange((ambientStrength: number) => applyPatch({ ambientStrength })),
    transmission
      .add(state, "shadowStrength", 0, 1, 0.01)
      .name("Shadow / 阴影响应")
      .onChange((shadowStrength: number) => applyPatch({ shadowStrength }))
  );

  const actions = {
    applyToAll(): void {
      const selected = runtime
        .getProceduralTreeLeafMaterials()
        .find(({ recipeId }) => recipeId === state.materialId)?.tuning;
      if (!selected) throw new RangeError(`Seed World tree recipe "${state.materialId}" is not loaded`);
      for (const material of runtime.getProceduralTreeLeafMaterials()) {
        runtime.setProceduralTreeLeafLightingTuning(material.recipeId, selected);
      }
      synchronize(selected);
    },
    resetSelected(): void {
      synchronize(runtime.resetProceduralTreeLeafLightingTuning(state.materialId));
    },
    resetAll(): void {
      for (const material of runtime.getProceduralTreeLeafMaterials()) {
        runtime.resetProceduralTreeLeafLightingTuning(material.recipeId);
      }
      selectMaterial(state.materialId);
    }
  };
  folder.add(actions, "applyToAll").name("Apply selected to all / 应用全部树叶");
  folder.add(actions, "resetSelected").name("Reset selected / 恢复当前树种");
  folder.add(actions, "resetAll").name("Reset all / 恢复全部树种");

  function selectMaterial(recipeId: string): TreeLeafLightingTuning {
    const material = runtime.getProceduralTreeLeafMaterials().find((candidate) => candidate.recipeId === recipeId);
    if (!material) throw new RangeError(`Seed World tree recipe "${recipeId}" is not loaded`);
    state.materialId = recipeId;
    synchronize(material.tuning);
    return material.tuning;
  }

  function synchronize(tuning: TreeLeafLightingTuning): void {
    Object.assign(state, tuningToPanelState(state.materialId, tuning));
    for (const controller of controllers) controller.updateDisplay();
  }

  const api: SeedWorldTreeLeafMaterialApi = Object.freeze({
    listMaterials: () => runtime.getProceduralTreeLeafMaterials(),
    selectMaterial,
    getTuning: (recipeId = state.materialId) => selectMaterial(recipeId),
    setTuning: (patch: Readonly<Partial<TreeLeafLightingTuning>>, recipeId = state.materialId) => {
      if (recipeId !== state.materialId) selectMaterial(recipeId);
      return applyPatch(patch);
    },
    resetTuning: (recipeId = state.materialId) => {
      if (recipeId !== state.materialId) selectMaterial(recipeId);
      const tuning = runtime.resetProceduralTreeLeafLightingTuning(recipeId);
      synchronize(tuning);
      return tuning;
    },
    applySelectedToAll: () => {
      actions.applyToAll();
      return runtime.getProceduralTreeLeafMaterials();
    },
    resetAll: () => {
      actions.resetAll();
      return runtime.getProceduralTreeLeafMaterials();
    }
  });
  window.seedWorldTreeLeafMaterials = api;
  document.body.dataset.treeLeafMaterialPanel = "ready";
  document.body.dataset.treeLeafMaterialCount = String(materials.length);

  let destroyed = false;
  return Object.freeze({
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      host.gui.removeFolder(folder);
      if (window.seedWorldTreeLeafMaterials === api) window.seedWorldTreeLeafMaterials = undefined;
      delete document.body.dataset.treeLeafMaterialPanel;
      delete document.body.dataset.treeLeafMaterialCount;
    }
  });
}

function materialToPanelState(material: SeedWorldProceduralTreeLeafMaterial): LeafPanelState {
  return tuningToPanelState(material.recipeId, material.tuning);
}

function tuningToPanelState(materialId: string, tuning: TreeLeafLightingTuning): LeafPanelState {
  return {
    materialId,
    baseColor: srgbBytesToHex(tuning.baseColorRgb),
    secondColor: srgbBytesToHex(tuning.secondColorRgb),
    translucencyColor: srgbBytesToHex(tuning.translucencyColorRgb),
    secondColorLevel: tuning.secondColorLevel,
    secondColorGradient: tuning.secondColorGradient,
    albedoBrightness: tuning.albedoBrightness,
    albedoDesaturation: tuning.albedoDesaturation,
    albedoTextureBlend: tuning.albedoTextureBlend,
    baseAoInfluence: tuning.baseAoInfluence,
    glancingAngleCut: tuning.glancingAngleCut,
    flipBackfaceNormals: tuning.flipBackfaceNormals,
    translucencyIntensity: tuning.translucencyIntensity,
    translucencyAoInfluence: tuning.translucencyAoInfluence,
    normalDistortion: tuning.normalDistortion,
    scatteringExponent: tuning.scatteringExponent,
    directStrength: tuning.directStrength,
    ambientStrength: tuning.ambientStrength,
    shadowStrength: tuning.shadowStrength
  };
}

function srgbBytesToHex(color: readonly [number, number, number]): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function srgbHexToBytes(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return Object.freeze([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}
