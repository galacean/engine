import type * as dat from "dat.gui";
import type {
  SeedWorldRockAssemblyRuntime,
  SeedWorldRockGrassTransitionStyle,
  SeedWorldRockMaterialDiagnostics,
  SeedWorldRockToonRgb,
  SeedWorldRockToonStyle
} from "@galacean/engine-world-planning/runtime/SeedWorldRockAssemblyRuntime";

/** dat.gui host that owns the Rock-category art group. */
export interface SeedWorldRockMaterialPanelHost {
  readonly gui: dat.GUI;
  folder(title: string, open?: boolean): dat.GUI;
}

/** Browser-facing art controls for the generated Clif cartoon material. */
export interface SeedWorldRockMaterialApi {
  /** Returns evidence for the only generated-Clif material path. */
  getDiagnostics(): SeedWorldRockMaterialDiagnostics;
  /** Applies one live cartoon style patch. */
  setToonStyle(style: Partial<SeedWorldRockToonStyle>): SeedWorldRockToonStyle;
  /** Returns a detached snapshot of the live cartoon style. */
  getToonStyle(): SeedWorldRockToonStyle;
  /** Restores the checked-in cartoon style. */
  resetToonStyle(): SeedWorldRockToonStyle;
  /** Applies one live mountain top-grass patch. */
  setGrassTransitionStyle(style: Partial<SeedWorldRockGrassTransitionStyle>): SeedWorldRockGrassTransitionStyle;
  /** Returns a detached snapshot of the mountain top-grass style. */
  getGrassTransitionStyle(): SeedWorldRockGrassTransitionStyle;
  /** Restores the checked-in mountain top-grass style. */
  resetGrassTransitionStyle(): SeedWorldRockGrassTransitionStyle;
}

/** Mounted generated-Clif art controls below the canonical Rock category. */
export interface SeedWorldRockMaterialPanel {
  /** Removes the dat.gui folder and browser API without changing rock ownership. */
  destroy(): void;
}

declare global {
  interface Window {
    seedWorldRockMaterials?: SeedWorldRockMaterialApi;
  }
}

interface RockPanelState {
  shadowColor: string;
  baseColor: string;
  highlightColor: string;
  shadowStep: number;
  highlightStep: number;
  bandFeatherEnabled: boolean;
  feather: number;
  topGrassToonBandsEnabled: boolean;
  topGrassToonBandStrength: number;
  topSlope: number;
  topSoftness: number;
  transitionIrregularity: number;
  edgeInsetScale: number;
  grassLightScale: number;
}

/**
 * Mounts the art-directed cartoon and top-grass controls below Rock Art.
 * @param runtime Generated-Clif runtime owning the only cartoon material.
 * @param host Shared Terrain inspector host scoped to the Rock category.
 * @returns Panel lifetime handle.
 */
export function mountSeedWorldRockMaterialPanel(
  runtime: SeedWorldRockAssemblyRuntime,
  host: SeedWorldRockMaterialPanelHost
): SeedWorldRockMaterialPanel {
  const folder = host.folder("Rock Art / 岩石美术", true);
  const palette = folder.addFolder("Wall Palette / 岩壁色阶");
  const lighting = folder.addFolder("Light Bands / 光照分级");
  const grass = folder.addFolder("Top Grass / 岩顶草");
  palette.open();
  lighting.open();
  grass.open();

  const state = styleToPanelState(runtime.getToonStyle(), runtime.getGrassTransitionStyle());
  const controllers: dat.GUIController[] = [];
  const applyColors = (): void => {
    synchronizeToon(
      runtime.setToonStyle({
        shadowColor: srgbHexToLinearRgb(state.shadowColor),
        baseColor: srgbHexToLinearRgb(state.baseColor),
        highlightColor: srgbHexToLinearRgb(state.highlightColor)
      })
    );
  };
  controllers.push(
    palette.addColor(state, "shadowColor").name("Shadow / 阴影色").onChange(applyColors),
    palette.addColor(state, "baseColor").name("Base / 基色").onChange(applyColors),
    palette.addColor(state, "highlightColor").name("Highlight / 高光色").onChange(applyColors),
    lighting
      .add(state, "shadowStep", 0, 0.98, 0.01)
      .name("Shadow split / 阴影分界")
      .onChange((shadowStep: number) => synchronizeToon(runtime.setToonStyle({ shadowStep }))),
    lighting
      .add(state, "highlightStep", 0.01, 1, 0.01)
      .name("Highlight split / 高光分界")
      .onChange((highlightStep: number) => synchronizeToon(runtime.setToonStyle({ highlightStep }))),
    lighting
      .add(state, "bandFeatherEnabled")
      .name("Soft bands / 色阶软化")
      .onChange((bandFeatherEnabled: boolean) =>
        synchronizeToon(runtime.setToonStyle({ bandFeatherEnabled }))
      ),
    lighting
      .add(state, "feather", 0.005, 0.25, 0.005)
      .name("Feather width / 软化宽度")
      .onChange((feather: number) => synchronizeToon(runtime.setToonStyle({ feather }))),
    grass
      .add(state, "topGrassToonBandsEnabled")
      .name("Toon bands / 顶部色块")
      .onChange((toonBandsEnabled: boolean) =>
        synchronizeGrass(runtime.setGrassTransitionStyle({ toonBandsEnabled }))
      ),
    grass
      .add(state, "topGrassToonBandStrength", 0, 1, 0.01)
      .name("Band strength / 色块强度")
      .onChange((toonBandStrength: number) =>
        synchronizeGrass(runtime.setGrassTransitionStyle({ toonBandStrength }))
      ),
    grass
      .add(state, "topSlope", -0.2, 0.95, 0.01)
      .name("Top slope / 顶部坡度")
      .onChange((topSlope: number) => synchronizeGrass(runtime.setGrassTransitionStyle({ topSlope }))),
    grass
      .add(state, "topSoftness", 0.005, 0.5, 0.005)
      .name("Softness / 草岩柔和")
      .onChange((topSoftness: number) => synchronizeGrass(runtime.setGrassTransitionStyle({ topSoftness }))),
    grass
      .add(state, "transitionIrregularity", 0, 0.75, 0.01)
      .name("Breakup / 边缘变化")
      .onChange((irregularity: number) => synchronizeGrass(runtime.setGrassTransitionStyle({ irregularity }))),
    grass
      .add(state, "edgeInsetScale", 0, 2, 0.05)
      .name("Grass inset / 草区内缩")
      .onChange((edgeInsetScale: number) =>
        synchronizeGrass(runtime.setGrassTransitionStyle({ edgeInsetScale }))
      ),
    grass
      .add(state, "grassLightScale", 0, 3, 0.01)
      .name("Grass light / 岩面草受光")
      .onChange((lightScale: number) => synchronizeGrass(runtime.setGrassTransitionStyle({ lightScale })))
  );

  const actions: Readonly<{ reset(): void }> = {
    reset: () => {
      synchronizeToon(runtime.resetToonStyle());
      synchronizeGrass(runtime.resetGrassTransitionStyle());
    }
  };
  folder.add(actions, "reset").name("Reset style / 恢复默认");

  function synchronizeToon(style: SeedWorldRockToonStyle): SeedWorldRockToonStyle {
    Object.assign(state, styleToPanelState(style, runtime.getGrassTransitionStyle()));
    for (const controller of controllers) controller.updateDisplay();
    return style;
  }

  function synchronizeGrass(style: SeedWorldRockGrassTransitionStyle): SeedWorldRockGrassTransitionStyle {
    state.topGrassToonBandsEnabled = style.toonBandsEnabled;
    state.topGrassToonBandStrength = style.toonBandStrength;
    state.topSlope = style.topSlope;
    state.topSoftness = style.topSoftness;
    state.transitionIrregularity = style.irregularity;
    state.edgeInsetScale = style.edgeInsetScale;
    state.grassLightScale = style.lightScale;
    for (const controller of controllers) controller.updateDisplay();
    return style;
  }

  const api: SeedWorldRockMaterialApi = Object.freeze({
    getDiagnostics: () => runtime.getMaterialDiagnostics(),
    setToonStyle: (style: Partial<SeedWorldRockToonStyle>) => synchronizeToon(runtime.setToonStyle(style)),
    getToonStyle: () => runtime.getToonStyle(),
    resetToonStyle: () => synchronizeToon(runtime.resetToonStyle()),
    setGrassTransitionStyle: (style: Partial<SeedWorldRockGrassTransitionStyle>) =>
      synchronizeGrass(runtime.setGrassTransitionStyle(style)),
    getGrassTransitionStyle: () => runtime.getGrassTransitionStyle(),
    resetGrassTransitionStyle: () => synchronizeGrass(runtime.resetGrassTransitionStyle())
  });
  window.seedWorldRockMaterials = api;
  const diagnostics = runtime.getMaterialDiagnostics();
  document.body.dataset.rockMaterialPanel = "ready";
  document.body.dataset.rockMaterialShader = diagnostics.shader;
  document.body.dataset.rockRendererCount = String(diagnostics.rendererCount);
  document.body.dataset.rockTexturesLoaded = String(diagnostics.rockTexturesLoaded);

  let destroyed = false;
  return Object.freeze({
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      host.gui.removeFolder(folder);
      if (window.seedWorldRockMaterials === api) window.seedWorldRockMaterials = undefined;
      delete document.body.dataset.rockMaterialPanel;
      delete document.body.dataset.rockMaterialShader;
      delete document.body.dataset.rockRendererCount;
      delete document.body.dataset.rockTexturesLoaded;
    }
  });
}

function styleToPanelState(style: SeedWorldRockToonStyle, grass: SeedWorldRockGrassTransitionStyle): RockPanelState {
  return {
    shadowColor: linearRgbToSrgbHex(style.shadowColor),
    baseColor: linearRgbToSrgbHex(style.baseColor),
    highlightColor: linearRgbToSrgbHex(style.highlightColor),
    shadowStep: style.shadowStep,
    highlightStep: style.highlightStep,
    bandFeatherEnabled: style.bandFeatherEnabled,
    feather: style.feather,
    topGrassToonBandsEnabled: grass.toonBandsEnabled,
    topGrassToonBandStrength: grass.toonBandStrength,
    topSlope: grass.topSlope,
    topSoftness: grass.topSoftness,
    transitionIrregularity: grass.irregularity,
    edgeInsetScale: grass.edgeInsetScale,
    grassLightScale: grass.lightScale
  };
}

function linearRgbToSrgbHex(color: SeedWorldRockToonRgb): string {
  return `#${color.map((component) => linearToSrgbByte(component).toString(16).padStart(2, "0")).join("")}`;
}

function srgbHexToLinearRgb(hex: string): SeedWorldRockToonRgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return Object.freeze([
    srgbByteToLinear((value >> 16) & 0xff),
    srgbByteToLinear((value >> 8) & 0xff),
    srgbByteToLinear(value & 0xff)
  ]);
}

function linearToSrgbByte(component: number): number {
  const linear = Math.min(1, Math.max(0, component));
  const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

function srgbByteToLinear(byte: number): number {
  const srgb = byte / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}
