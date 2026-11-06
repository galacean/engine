import { SEED_WORLD_GRASS_SNOW_RESPONSE } from "@galacean/engine-terrain/world/SeedWorldSurfaceSnow";
import { Color, type Engine, type Entity, Material, Renderer, type Shader } from "@galacean/engine";
import type {
  AssetAssemblySourceLibrary,
  AtomicAssemblySource
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import type { SeedWorldRockAssemblyCompilation, SeedWorldSolvedRockObb } from "./SeedWorldRockAssemblySolver.ts";
import { raycastSeedWorldRockObbs, type SeedWorldRockSelectionRay } from "./SeedWorldRockRaycast.ts";
import {
  getSeedWorldRockDebugView,
  registerSeedWorldRockToonShader,
  SEED_WORLD_ROCK_TOON_SHADER_NAME
} from "@galacean/engine-terrain/world/SeedWorldRockToonShader";

const SURFACE_GRASS_COVERAGE_MACRO = "RENDERER_SURFACE_GRASS_COVERAGE";
const TOON_BAND_FEATHER_MACRO = "MATERIAL_TOON_BAND_FEATHER";
const ROCK_TOP_GRASS_TOON_BANDS_MACRO = "MATERIAL_ROCK_TOP_GRASS_TOON_BANDS";
const ROCK_DEBUG_VIEW_MACRO = "MATERIAL_ROCK_DEBUG_VIEW";

/** Linear RGB value written directly to the texture-free cartoon-rock shader. */
export type SeedWorldRockToonRgb = readonly [red: number, green: number, blue: number];

/** Art-directed wall palette and light-band controls for the default rock material. */
export interface SeedWorldRockToonStyle {
  readonly shadowColor: SeedWorldRockToonRgb;
  readonly baseColor: SeedWorldRockToonRgb;
  readonly highlightColor: SeedWorldRockToonRgb;
  readonly shadowStep: number;
  readonly highlightStep: number;
  readonly bandFeatherEnabled: boolean;
  readonly feather: number;
}

/** Artist-facing top-surface controls used only by grass-enabled surfaces. */
export interface SeedWorldRockGrassTransitionStyle {
  /** Quantizes the already-lit top grass with the shared rock light bands. */
  readonly toonBandsEnabled: boolean;
  /** Blends from unchanged grass lighting at zero to full toon-band contrast at one. */
  readonly toonBandStrength: number;
  readonly topSlope: number;
  readonly topSoftness: number;
  readonly irregularity: number;
  /** Multiplier applied to the authored grass clump's wind-swept edge clearance. */
  readonly edgeInsetScale: number;
  /** Neutral-by-default post-light multiplier for deliberate art matching only. */
  readonly lightScale: number;
}

/** Detached evidence for the generated Clif renderers' only material path. */
export interface SeedWorldRockMaterialDiagnostics {
  readonly rendererCount: number;
  readonly shader: typeof SEED_WORLD_ROCK_TOON_SHADER_NAME;
  readonly rockTexturesLoaded: false;
}

export const SEED_WORLD_DEFAULT_ROCK_TOON_STYLE: SeedWorldRockToonStyle = Object.freeze({
  shadowColor: Object.freeze([0.46207699965440707, 0.46207699965440707, 0.46207699965440707] as const),
  baseColor: Object.freeze([0.4793201831008268, 0.6172065624196511, 0.5394794890121072] as const),
  highlightColor: Object.freeze([0.7835377915261935, 0.6795424696330938, 0.5394794890121072] as const),
  shadowStep: 0.31,
  highlightStep: 0.43,
  bandFeatherEnabled: true,
  feather: 0.25
});

/** Default coverage shared by the mountain colour pass and its real grass sampler. */
export const SEED_WORLD_DEFAULT_ROCK_GRASS_TRANSITION_STYLE: SeedWorldRockGrassTransitionStyle = Object.freeze({
  toonBandsEnabled: true,
  toonBandStrength: 1,
  topSlope: 0.52,
  topSoftness: 0.18,
  irregularity: 0.24,
  edgeInsetScale: 1,
  lightScale: 1
});

interface SeedWorldRockToonMaterialLibrary {
  readonly material: Material;
  readonly styleState: { current: SeedWorldRockToonStyle };
  readonly grassTransitionState: { current: SeedWorldRockGrassTransitionStyle };
}

const toonMaterialLibraries = new WeakMap<Engine, SeedWorldRockToonMaterialLibrary>();

/** Live rock-instance controls used by the runtime and the debug art panel. */
export interface SeedWorldRockAssemblyRuntime {
  /** Root containing all generated Clif owners. */
  readonly root: Entity;
  /** Shows only rocks belonging to the requested terrain coverage targets. */
  setVisibleTargetIds(targetIds: ReadonlySet<string> | undefined): void;
  /** Hides rocks explicitly rejected in the acceptance workbench. */
  setDeletedRockIds(rockIds: ReadonlySet<string>): void;
  /** Applies all saved compiler-side preview transforms without regenerating terrain. */
  setPreviewRocks(rocks: readonly SeedWorldSolvedRockObb[]): void;
  /** Instantiates or removes acceptance-only A-number Clif previews. */
  setAcceptanceAddedRocks(rocks: readonly SeedWorldSolvedRockObb[]): void;
  /** Returns the closest visible rock OBB intersected by a world-space ray. */
  raycast(ray: SeedWorldRockSelectionRay): SeedWorldSolvedRockObb | undefined;
  /** Applies validated wall-palette and light-band controls to the only rock material. */
  setToonStyle(style: Partial<SeedWorldRockToonStyle>): SeedWorldRockToonStyle;
  /** Returns a detached snapshot of the current cartoon style. */
  getToonStyle(): SeedWorldRockToonStyle;
  /** Restores the checked-in cartoon style. */
  resetToonStyle(): SeedWorldRockToonStyle;
  /** Applies artist-facing mountain top-grass coverage controls. */
  setGrassTransitionStyle(style: Partial<SeedWorldRockGrassTransitionStyle>): SeedWorldRockGrassTransitionStyle;
  /** Returns a detached snapshot of the mountain top-grass style. */
  getGrassTransitionStyle(): SeedWorldRockGrassTransitionStyle;
  /** Restores the checked-in mountain top-grass style. */
  resetGrassTransitionStyle(): SeedWorldRockGrassTransitionStyle;
  /** Returns evidence that generated Clif renderers use the texture-free Shader. */
  getMaterialDiagnostics(): SeedWorldRockMaterialDiagnostics;
}

/**
 * Instantiates final Heightmap-fitted Clif OBB compositions with the default texture-free cartoon material.
 * @param engine Engine owning the shared cartoon material.
 * @param parent Generated terrain root that owns the instance lifetime.
 * @param compilation Final asset-neutral rock assembly solve.
 * @param sourceLibrary Preloaded Seed asset catalog shared with lake and feature-rock runtimes.
 * @returns Live instance and art-style controls plus the owning root.
 * @throws When a solve requests a non-Clif-1 family or the shared source catalog lacks Clif-1 LOD0.
 */
export function instantiateSeedWorldRockAssemblies(
  engine: Engine,
  parent: Entity,
  compilation: SeedWorldRockAssemblyCompilation,
  sourceLibrary: AssetAssemblySourceLibrary,
  onSurfaceGrassRocksChanged?: (
    rocks: readonly SeedWorldSolvedRockObb[],
    style: SeedWorldRockGrassTransitionStyle
  ) => void
): SeedWorldRockAssemblyRuntime {
  const unsupportedRock = compilation.rocks.find((rock) => rock.prototypeFamily !== "rock-clif-1");
  if (unsupportedRock) throw new Error(`Only rock-clif-1 is supported, received ${unsupportedRock.prototypeFamily}`);
  const root = parent.createChild("First Principle Clif Assemblies");
  const owners = new Map<string, Entity>();
  const originalRocks = new Map(compilation.rocks.map((rock) => [rock.id, rock] as const));
  const source = resolveCliffSource(sourceLibrary);
  const materialLibrary = resolveToonMaterialLibrary(engine);
  const createOwner = (rock: SeedWorldSolvedRockObb): Entity => {
    const owner = root.createChild(rock.id);
    owners.set(rock.id, owner);
    owner.transform.setPosition(...rock.position);
    owner.transform.setRotationQuaternion(...rock.rotationQuaternion);
    owner.transform.setScale(rock.uniformScale, rock.uniformScale, rock.uniformScale);
    const instance = source.lods[0]!.prefab.instantiate();
    if (!instance) throw new Error(`Clif runtime source ${source.id} could not instantiate LOD0`);
    owner.addChild(instance);
    bindSeedWorldRockToonMaterial(engine, instance, true);
    return owner;
  };
  try {
    for (const rock of compilation.rocks) createOwner(rock);
    return makeRuntime(
      root,
      owners,
      originalRocks,
      createOwner,
      Object.freeze([materialLibrary.material]),
      materialLibrary.styleState,
      materialLibrary.grassTransitionState,
      onSurfaceGrassRocksChanged
    );
  } catch (error) {
    root.destroy();
    throw error;
  }
}

function makeRuntime(
  root: Entity,
  owners: Map<string, Entity>,
  originalRocks: ReadonlyMap<string, SeedWorldSolvedRockObb>,
  createOwner: (rock: SeedWorldSolvedRockObb) => Entity,
  materials: readonly Material[],
  styleState: { current: SeedWorldRockToonStyle },
  grassTransitionState: { current: SeedWorldRockGrassTransitionStyle },
  onSurfaceGrassRocksChanged?: (
    rocks: readonly SeedWorldSolvedRockObb[],
    style: SeedWorldRockGrassTransitionStyle
  ) => void
): SeedWorldRockAssemblyRuntime {
  let previewRockIds = new Set<string>();
  let acceptanceAddedRockIds = new Set<string>();
  let visibleTargetIds: ReadonlySet<string> | undefined;
  let deletedRockIds: ReadonlySet<string> = new Set();
  let toonStyle = cloneToonStyle(styleState.current);
  let grassTransitionStyle = cloneGrassTransitionStyle(grassTransitionState.current);
  let surfaceGrassRevision = 0;
  const currentRocks = new Map(originalRocks);
  const toonMaterials = [...new Set(materials)];
  const synchronizeVisibility = (): void => {
    for (const [rockId, owner] of owners) {
      const targetId = targetIdFromRockId(rockId);
      owner.isActive =
        !deletedRockIds.has(rockId) && (visibleTargetIds === undefined || visibleTargetIds.has(targetId));
    }
    synchronizeSurfaceGrass();
  };
  const synchronizeSurfaceGrass = (): void => {
    if (!onSurfaceGrassRocksChanged) return;
    const revision = ++surfaceGrassRevision;
    queueMicrotask(() => {
      if (revision !== surfaceGrassRevision) return;
      onSurfaceGrassRocksChanged(
        [...currentRocks.values()].filter((rock) => owners.get(rock.id)?.isActive !== false),
        cloneGrassTransitionStyle(grassTransitionStyle)
      );
    });
  };
  const applyTransform = (rock: SeedWorldSolvedRockObb): void => {
    const owner = owners.get(rock.id);
    if (!owner) return;
    owner.transform.setPosition(...rock.position);
    owner.transform.setRotationQuaternion(...rock.rotationQuaternion);
    owner.transform.setScale(rock.uniformScale, rock.uniformScale, rock.uniformScale);
    currentRocks.set(rock.id, rock);
    synchronizeSurfaceGrass();
  };
  const countRenderers = (): number => {
    let rendererCount = 0;
    for (const owner of owners.values()) {
      const renderers: Renderer[] = [];
      owner.getComponentsIncludeChildren(Renderer, renderers);
      rendererCount += renderers.length;
    }
    return rendererCount;
  };
  const runtime: SeedWorldRockAssemblyRuntime = Object.freeze({
    root,
    setVisibleTargetIds: (targetIds: ReadonlySet<string> | undefined): void => {
      visibleTargetIds = targetIds;
      synchronizeVisibility();
    },
    setDeletedRockIds: (rockIds: ReadonlySet<string>): void => {
      deletedRockIds = new Set(rockIds);
      synchronizeVisibility();
    },
    setPreviewRocks: (rocks: readonly SeedWorldSolvedRockObb[]): void => {
      const nextPreviewRockIds = new Set(rocks.map((rock) => rock.id));
      for (const previewRockId of previewRockIds) {
        if (nextPreviewRockIds.has(previewRockId)) continue;
        const original = originalRocks.get(previewRockId);
        if (original) applyTransform(original);
      }
      for (const rock of rocks) applyTransform(rock);
      previewRockIds = nextPreviewRockIds;
    },
    setAcceptanceAddedRocks: (rocks: readonly SeedWorldSolvedRockObb[]): void => {
      const nextIds = new Set(rocks.map((rock) => rock.id));
      for (const rockId of acceptanceAddedRockIds) {
        if (nextIds.has(rockId)) continue;
        owners.get(rockId)?.destroy();
        owners.delete(rockId);
        currentRocks.delete(rockId);
      }
      for (const rock of rocks) {
        if (!owners.has(rock.id)) createOwner(rock);
        applyTransform(rock);
      }
      acceptanceAddedRockIds = nextIds;
      synchronizeVisibility();
    },
    raycast: (ray: SeedWorldRockSelectionRay): SeedWorldSolvedRockObb | undefined =>
      raycastSeedWorldRockObbs(
        [...currentRocks.values()].filter((rock) => owners.get(rock.id)?.isActive !== false),
        ray
      ),
    setToonStyle: (patch: Partial<SeedWorldRockToonStyle>): SeedWorldRockToonStyle => {
      toonStyle = styleState.current = normalizeToonStyle(patch, toonStyle);
      for (const material of toonMaterials) applyToonStyleToMaterial(material, toonStyle);
      return cloneToonStyle(toonStyle);
    },
    getToonStyle: (): SeedWorldRockToonStyle => cloneToonStyle(toonStyle),
    resetToonStyle: (): SeedWorldRockToonStyle => {
      toonStyle = styleState.current = cloneToonStyle(SEED_WORLD_DEFAULT_ROCK_TOON_STYLE);
      for (const material of toonMaterials) applyToonStyleToMaterial(material, toonStyle);
      return cloneToonStyle(toonStyle);
    },
    setGrassTransitionStyle: (patch: Partial<SeedWorldRockGrassTransitionStyle>): SeedWorldRockGrassTransitionStyle => {
      grassTransitionStyle = grassTransitionState.current = normalizeGrassTransitionStyle(patch, grassTransitionStyle);
      for (const material of toonMaterials) applyGrassTransitionStyleToMaterial(material, grassTransitionStyle);
      synchronizeSurfaceGrass();
      return cloneGrassTransitionStyle(grassTransitionStyle);
    },
    getGrassTransitionStyle: (): SeedWorldRockGrassTransitionStyle => cloneGrassTransitionStyle(grassTransitionStyle),
    resetGrassTransitionStyle: (): SeedWorldRockGrassTransitionStyle => {
      grassTransitionStyle = grassTransitionState.current = cloneGrassTransitionStyle(
        SEED_WORLD_DEFAULT_ROCK_GRASS_TRANSITION_STYLE
      );
      for (const material of toonMaterials) applyGrassTransitionStyleToMaterial(material, grassTransitionStyle);
      synchronizeSurfaceGrass();
      return cloneGrassTransitionStyle(grassTransitionStyle);
    },
    getMaterialDiagnostics: (): SeedWorldRockMaterialDiagnostics =>
      Object.freeze({
        rendererCount: countRenderers(),
        shader: SEED_WORLD_ROCK_TOON_SHADER_NAME,
        rockTexturesLoaded: false
      })
  });
  synchronizeSurfaceGrass();
  return runtime;
}

function targetIdFromRockId(rockId: string): string {
  const separator = rockId.lastIndexOf(":rock-");
  return separator < 0 ? rockId : rockId.slice(0, separator);
}

function resolveCliffSource(sourceLibrary: AssetAssemblySourceLibrary): AtomicAssemblySource {
  const source = sourceLibrary.largeRockSurfaceFamilies.grass.variants.find((candidate) =>
    candidate.id.includes("/rock-clif-1/")
  );
  if (!source?.lods[0]) throw new Error('Seed World source catalog is missing "rock-clif-1" LOD0');
  return source;
}

/**
 * Assigns the shared texture-free toon material to one rock hierarchy.
 * @param engine Engine-scoped material owner.
 * @param root Instantiated rock, stone, or debris hierarchy.
 * @param enablesSurfaceGrass Whether this Renderer may sample terrain data and show mountain grass.
 * @returns Number of renderers rebound to the toon material.
 */
export function bindSeedWorldRockToonMaterial(engine: Engine, root: Entity, enablesSurfaceGrass = false): number {
  const material = resolveToonMaterialLibrary(engine).material;
  const renderers: Renderer[] = [];
  root.getComponentsIncludeChildren(Renderer, renderers);
  if (renderers.length === 0) throw new Error(`Seed World rock "${root.name}" has no renderer`);
  for (const renderer of renderers) {
    renderer.setMaterial(material);
    renderer.castShadows = true;
    renderer.receiveShadows = true;
    if (enablesSurfaceGrass) {
      renderer.shaderData.enableMacro(SURFACE_GRASS_COVERAGE_MACRO);
    } else {
      renderer.shaderData.disableMacro(SURFACE_GRASS_COVERAGE_MACRO);
    }
  }
  return renderers.length;
}

/**
 * Reuses Terrain-owned grass colour-field and climate state without issuing a rock texture request.
 * @param engine Engine-scoped material owner.
 * @param terrainMaterial Current generated Terrain material.
 */
export function synchronizeSeedWorldRockGroundAppearance(engine: Engine, terrainMaterial: Material): void {
  const library = toonMaterialLibraries.get(engine);
  if (!library) return;
  const target = library.material.shaderData;
  const source = terrainMaterial.shaderData;
  target.setTexture("material_GrassColorFieldTexture", source.getTexture("material_GrassColorFieldTexture"));
  if (source.getMacros().some((macro) => macro.name === "MATERIAL_GRASS_SHARED_VISTA"))
    target.enableMacro("MATERIAL_GRASS_SHARED_VISTA");
  else target.disableMacro("MATERIAL_GRASS_SHARED_VISTA");
  target.setVector2("material_GrassColorFieldVistaBlend", source.getVector2("material_GrassColorFieldVistaBlend"));
  for (const property of [
    "material_GrassVistaParams",
    "material_GrassColorFieldTransform",
    "material_GrassColorFieldOffset",
    "material_GrassColorFieldParams"
  ]) {
    target.setVector4(property, source.getVector4(property));
  }
  for (const property of ["material_GrassColorA", "material_GrassColorB"]) {
    target.setColor(property, source.getColor(property));
  }
  target.setFloat("material_SurfaceGrassSnowResponse", SEED_WORLD_GRASS_SNOW_RESPONSE);
}

function resolveToonMaterialLibrary(engine: Engine): SeedWorldRockToonMaterialLibrary {
  const existing = toonMaterialLibraries.get(engine);
  if (existing) return existing;
  const shader = registerSeedWorldRockToonShader();
  const library = Object.freeze({
    material: createToonRockMaterial(engine, shader, "rock-clif-1"),
    styleState: { current: cloneToonStyle(SEED_WORLD_DEFAULT_ROCK_TOON_STYLE) },
    grassTransitionState: {
      current: cloneGrassTransitionStyle(SEED_WORLD_DEFAULT_ROCK_GRASS_TRANSITION_STYLE)
    }
  });
  toonMaterialLibraries.set(engine, library);
  return library;
}

function createToonRockMaterial(engine: Engine, shader: Shader, prototypeFamily: string): Material {
  const material = new Material(engine, shader);
  material.name = `${prototypeFamily} texture-free cartoon`;
  applyToonStyleToMaterial(material, SEED_WORLD_DEFAULT_ROCK_TOON_STYLE);
  applyGrassTransitionStyleToMaterial(material, SEED_WORLD_DEFAULT_ROCK_GRASS_TRANSITION_STYLE);
  const debugView = getSeedWorldRockDebugView();
  if (debugView > 0) material.shaderData.enableMacro(ROCK_DEBUG_VIEW_MACRO, String(debugView));
  return material;
}

function applyToonStyleToMaterial(material: Material, style: SeedWorldRockToonStyle): void {
  material.shaderData.setColor("material_ShadowColor", new Color(...style.shadowColor, 1));
  material.shaderData.setColor("material_BaseColor", new Color(...style.baseColor, 1));
  material.shaderData.setColor("material_HighlightColor", new Color(...style.highlightColor, 1));
  material.shaderData.setFloat("material_ShadowStep", style.shadowStep);
  material.shaderData.setFloat("material_HighlightStep", style.highlightStep);
  if (style.bandFeatherEnabled) {
    material.shaderData.enableMacro(TOON_BAND_FEATHER_MACRO);
    material.shaderData.setFloat("material_Feather", style.feather);
  } else {
    material.shaderData.disableMacro(TOON_BAND_FEATHER_MACRO);
  }
}

function applyGrassTransitionStyleToMaterial(material: Material, style: SeedWorldRockGrassTransitionStyle): void {
  if (style.toonBandsEnabled) {
    material.shaderData.enableMacro(ROCK_TOP_GRASS_TOON_BANDS_MACRO);
    material.shaderData.setFloat("material_SurfaceGrassToonBandStrength", style.toonBandStrength);
  } else {
    material.shaderData.disableMacro(ROCK_TOP_GRASS_TOON_BANDS_MACRO);
  }
  material.shaderData.setFloat("material_SurfaceGrassTopSlope", style.topSlope);
  material.shaderData.setFloat("material_SurfaceGrassTopSoftness", style.topSoftness);
  material.shaderData.setFloat("material_SurfaceGrassIrregularity", style.irregularity);
  material.shaderData.setFloat("material_SurfaceGrassLightScale", style.lightScale);
}

function normalizeToonStyle(
  patch: Partial<SeedWorldRockToonStyle>,
  fallback: SeedWorldRockToonStyle
): SeedWorldRockToonStyle {
  const shadowStep = finiteClamped(patch.shadowStep, fallback.shadowStep, 0, 0.98);
  return Object.freeze({
    shadowColor: normalizeToonRgb(patch.shadowColor, fallback.shadowColor),
    baseColor: normalizeToonRgb(patch.baseColor, fallback.baseColor),
    highlightColor: normalizeToonRgb(patch.highlightColor, fallback.highlightColor),
    shadowStep,
    highlightStep: finiteClamped(patch.highlightStep, fallback.highlightStep, shadowStep + 0.01, 1),
    bandFeatherEnabled:
      typeof patch.bandFeatherEnabled === "boolean" ? patch.bandFeatherEnabled : fallback.bandFeatherEnabled,
    feather: finiteClamped(patch.feather, fallback.feather, 0.005, 0.25)
  });
}

function cloneToonStyle(style: SeedWorldRockToonStyle): SeedWorldRockToonStyle {
  return normalizeToonStyle(style, style);
}

function normalizeGrassTransitionStyle(
  patch: Partial<SeedWorldRockGrassTransitionStyle>,
  fallback: SeedWorldRockGrassTransitionStyle
): SeedWorldRockGrassTransitionStyle {
  return Object.freeze({
    toonBandsEnabled: typeof patch.toonBandsEnabled === "boolean" ? patch.toonBandsEnabled : fallback.toonBandsEnabled,
    toonBandStrength: finiteClamped(patch.toonBandStrength, fallback.toonBandStrength, 0, 1),
    topSlope: finiteClamped(patch.topSlope, fallback.topSlope, -0.2, 0.95),
    topSoftness: finiteClamped(patch.topSoftness, fallback.topSoftness, 0.005, 0.5),
    irregularity: finiteClamped(patch.irregularity, fallback.irregularity, 0, 0.75),
    edgeInsetScale: finiteClamped(patch.edgeInsetScale, fallback.edgeInsetScale, 0, 2),
    lightScale: finiteClamped(patch.lightScale, fallback.lightScale, 0, 3)
  });
}

function cloneGrassTransitionStyle(style: SeedWorldRockGrassTransitionStyle): SeedWorldRockGrassTransitionStyle {
  return normalizeGrassTransitionStyle(style, style);
}

function normalizeToonRgb(
  value: SeedWorldRockToonRgb | undefined,
  fallback: SeedWorldRockToonRgb
): SeedWorldRockToonRgb {
  const candidate = value?.length === 3 ? value : fallback;
  return Object.freeze([
    finiteClamped(candidate[0], fallback[0], 0, 1),
    finiteClamped(candidate[1], fallback[1], 0, 1),
    finiteClamped(candidate[2], fallback[2], 0, 1)
  ]);
}

function finiteClamped(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  const finite = value !== undefined && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, finite));
}
