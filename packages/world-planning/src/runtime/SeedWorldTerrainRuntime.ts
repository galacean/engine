import { bindSurfaceTerrain } from "@galacean/engine-terrain/surface/SurfaceMaterial";
import { compileSeedWorldSurfacePalette, type SeedWorldSurfacePalette } from "./SeedWorldSurfacePalette";
import { loadPlanningFarmDirtTexture } from "../spatial/farming/PlanningFarmDirtTexture.ts";
import {
  reversibleTerrainSteps,
  type PreparedTerrainUpdate
} from "@galacean/engine-terrain/terrain/clipmap/TerrainPreparedUpdate";
import { SEED_WORLD_GRASS_SNOW_RESPONSE } from "@galacean/engine-terrain/world/SeedWorldSurfaceSnow";
import { SeedWorldSurfaceReliefRuntime, type SeedWorldSurfaceReliefTuning } from "./SeedWorldSurfaceReliefRuntime.ts";
import {
  SeedWorldTerrainFrameGate,
  type PreparedTerrainDependents
} from "@galacean/engine-terrain/world/SeedWorldTerrainFrameGate";
import {
  createSeedWorldTerrainHeightTransition,
  resolveSeedWorldTerrainTransitionDurationSeconds
} from "@galacean/engine-terrain/world/SeedWorldTerrainTransition";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import {
  bindSeedWorldGrassColorField,
  bindSeedWorldGrassColorFieldUniforms,
  varySeedWorldGrassPaletteBrightness,
  createSeedWorldSharedSurfaceTexture
} from "@galacean/engine-vegetation/world/SeedWorldGrassColorFieldUniforms";
import {
  bindSeedWorldGrassTerrainMaterial,
  createSeedWorldGrassCoverageSampler
} from "./SeedWorldGrassTerrainSurface.ts";
import {
  AssetType,
  Camera,
  Color,
  type Engine,
  Entity,
  Material,
  type MeshRenderer,
  ShaderProperty,
  Texture2D,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine";
import { playAssetEntranceEffect as playRendererAssetEntranceEffect } from "@galacean/engine-vegetation/asset-assembly/AssetEntranceEffect";
import { ASSET_ASSEMBLY_ENTRANCE_DURATION_MS } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyRenderProfile";
import type { AssetAssemblySourceLibrary } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import type { ProceduralTreeRuntimeAuthoringProfile } from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeAuthoringState";
import type { TerrainAuthoredPuddleCoverage } from "@galacean/engine-terrain/terrain/clipmap/TerrainPuddleHydrology";
import { TerrainClipmap } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmap";
import { seedWorldRenderWeights } from "../world/SeedWorldRenderWeights.ts";
import type {
  TerrainLayerResidencyRegionSource,
  TerrainLayerResolvedSource
} from "@galacean/engine-terrain/terrain/clipmap/TerrainLayerResidency";
import type { TerrainClipmapRegionSource } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmapSource";
import type { TerrainLodRendererTuning } from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRendererRuntime";
import type { SeedWorldPresentationDecorationInstance } from "../world/SeedWorldDecorations.ts";
import {
  SeedWorldExactInstanceCellRuntime,
  type SeedWorldExactInstanceSpatialMode,
  type SeedWorldExactInstanceSpatialSnapshot
} from "../world/SeedWorldExactInstanceCellRuntime.ts";
import {
  SeedWorldExactPrefabRuntimeRegistry,
  type SeedWorldExactPrefabRuntime
} from "../world/SeedWorldExactPrefabRuntimeProfile.ts";
import {
  SEED_WORLD_HEIGHT_RANGE,
  seedWorldOriginX,
  seedWorldOriginZ,
  type SeedWorldFields
} from "./SeedWorldFields.ts";
import { SeedWorldPopulationRuntime } from "./SeedWorldPopulationRuntime.ts";
import type { SeedWorldPopulationPreview } from "./SeedWorldPopulationPlan.ts";
import type { SeedWorldPopulationWorld } from "./SeedWorldPopulationRuntimeCell.ts";
import { synchronizeSeedWorldRockGroundAppearance } from "./SeedWorldRockMaterial.ts";
import type { SeedWorldRuntimeBounds } from "../world/SeedWorldRuntimeBounds.ts";
import type { SeedWorldSurfaceMaterialIntent } from "./SeedWorldSurfaceIntent.ts";
import {
  SeedWorldTerrainOcclusionCuller,
  type SeedWorldTerrainOcclusionDiagnostics
} from "./SeedWorldTerrainOcclusionCuller.ts";
import {
  freezeSeedWorldGrassColorFieldTuning,
  SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_OFFSET,
  SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_SCALE,
  SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS,
  type SeedWorldGrassColorFieldBinding,
  type SeedWorldGrassColorFieldTuning
} from "@galacean/engine-vegetation/world/SeedWorldGrassColorField";
import {
  SEED_WORLD_CLIPMAP_MESH_SIZE,
  type SeedWorldTerrainGenerationSettings
} from "@galacean/engine-terrain/world/SeedWorldTerrainGenerationSettings";

const TILES_PER_SIDE = 3;
const TILE_METRES = 1_024;
const SEED_WORLD_REGION_ID = "seed-world";
const SEED_WORLD_ROAD_LAYER_ID = "layer-02";
const SEED_WORLD_SURFACE_LAYER_IDS = Object.freeze(["layer-00", "layer-04", SEED_WORLD_ROAD_LAYER_ID] as const);
const SEED_WORLD_STYLIZED_LAYER_TILE_SIZE_METRES = 2;
const SEED_WORLD_TERRAIN_MATERIAL_URL = "Material/Terrain/seed-world.mat";
const MATERIAL_TERRAIN_GRASS_SHADING = "MATERIAL_TERRAIN_GRASS_SHADING";
const MATERIAL_GRASS_COLOR_A = ShaderProperty.getByName("material_GrassColorA");
const MATERIAL_GRASS_COLOR_B = ShaderProperty.getByName("material_GrassColorB");
const MATERIAL_GRASS_COLOR_FIELD_TRANSFORM = ShaderProperty.getByName("material_GrassColorFieldTransform");
const MATERIAL_GRASS_COLOR_FIELD_OFFSET = ShaderProperty.getByName("material_GrassColorFieldOffset");
const MATERIAL_GRASS_COLOR_FIELD_PARAMS = ShaderProperty.getByName("material_GrassColorFieldParams");
const MATERIAL_GRASS_COLOR_FIELD_VISTA_BLEND = ShaderProperty.getByName("material_GrassColorFieldVistaBlend");
const MATERIAL_TERRAIN_ROAD_COLOR = ShaderProperty.getByName("material_TerrainRoadColor");
const MATERIAL_TERRAIN_FAR_LOD = ShaderProperty.getByName("material_TerrainFarLod");
const SEED_WORLD_TERRAIN_PREFERRED_FAR_LOD = 2;
/** Default linear road colour used by the Seed surface palette. */
export const SEED_WORLD_ROAD_COLOR_DEFAULT = Object.freeze([
  0.5520114015120001, 0.44520119451622786, 0.2831487404299921
] as const);
const SEED_WORLD_SOLID_MUD_COLOR = Object.freeze([...SEED_WORLD_ROAD_COLOR_DEFAULT, 1] as const);
const SEED_WORLD_SURFACE_LAYER_PROFILES = Object.freeze([
  Object.freeze({
    appearance: "grass" as const,
    color: [1, 1, 1, 1] as const,
    snowResponse: SEED_WORLD_GRASS_SNOW_RESPONSE
  }),
  Object.freeze({ appearance: undefined, color: SEED_WORLD_SOLID_MUD_COLOR, snowResponse: 0.36 }),
  Object.freeze({ appearance: "road" as const, color: SEED_WORLD_SOLID_MUD_COLOR, snowResponse: 0.18 })
]);
/** Authored cross-fade duration shared by Seed World surface Prefab LOD groups. */
export const SEED_WORLD_SURFACE_LOD_CROSS_FADE_DURATION_SECONDS = 0.5;

/** One optional 1024m source Tile selected for a diagnostic central-region comparison. */
export interface SeedWorldTerrainInspectionTile {
  /** Zero-based horizontal Tile coordinate. */
  readonly tileX: number;
  /** Zero-based depth Tile coordinate. */
  readonly tileZ: number;
}

/** Independent bare-ground/road colours and the field shared by Terrain and grass roots. */
export interface SeedWorldSurfaceColorTuning {
  readonly roadColor: readonly [red: number, green: number, blue: number];
  /** Absent preserves the source non-grass layer colours, including on reset. */
  readonly groundColor?: readonly [red: number, green: number, blue: number];
  /** Omitted palette edits preserve the current Terrain shader mode. */
  readonly groundFusion?: boolean;
  readonly grass: SeedWorldGrassColorFieldTuning;
}

/** Optional authoring inputs for ordinary Terrain layers, independent of the height generator. */
export interface SeedWorldTerrainSurfaceOptions {
  /** Optional whole-map texture mixture and POI material influences. */
  readonly palette?: SeedWorldSurfacePalette;
  readonly baseTextureUrl?: string;
  readonly normalTextureUrl?: string;
  readonly tileMetres?: number;
  readonly normalScale?: number;
  readonly roadPattern?: boolean;
  readonly microNormalTextureUrl?: string;
}

export interface SeedWorldSandNormalTuning {
  rippleStrength: number;
  rippleTileMetres: number;
  rippleFadeDistanceMetres: number;
  microStrength: number;
  microTileMetres: number;
  microFadeDistanceMetres: number;
}

interface SeedWorldTerrainSurface {
  readonly palette?: SeedWorldSurfacePalette;
  readonly paletteTextures?: readonly Texture2D[];
  readonly diffuse?: Texture2D;
  readonly normal?: Texture2D;
  readonly tileMetres: number;
  readonly normalScale: number;
  readonly street?: boolean;
}

interface SeedWorldTerrainMaterialState {
  readonly surface?: SeedWorldTerrainSurface;
  readonly roadPattern?: boolean;
  readonly microNormal?: Texture2D;
  sandNormals?: SeedWorldSandNormalTuning;
  readonly grassTexture: Texture2D;
  readonly soilTexture?: Texture2D;
  readonly vistaFromDetail?: boolean;
  grassTuning: SeedWorldGrassColorFieldTuning;
  roadColor: readonly [red: number, green: number, blue: number];
  groundColor?: readonly [red: number, green: number, blue: number];
  readonly farLod: number;
  groundFusion?: boolean;
}

/**
 * Selects the first simplified terrain ring while retaining one complete near ring.
 * The lowest supported mobile Heightmap has only LOD0/1, so its outer ring becomes
 * the far material instead of requesting a non-existent LOD2.
 * @param clipmapLodCount Number of active Clipmap rings.
 * @returns First ring using simplified surface shading.
 * @throws If fewer than two rings are available.
 */
export function resolveSeedWorldTerrainFarLod(clipmapLodCount: number): number {
  if (!Number.isInteger(clipmapLodCount) || clipmapLodCount < 2) {
    throw new RangeError("Seed World far terrain requires at least two Clipmap LODs");
  }
  return Math.min(SEED_WORLD_TERRAIN_PREFERRED_FAR_LOD, clipmapLodCount - 1);
}

/** Runtime-owned generated terrain and discrete decorations for one immutable Root Seed field set. */
export class SeedWorldTerrainRuntime {
  /** Published vegetation and exact prefab identities. */
  private readonly exactPickBatches = new WeakMap<MeshRenderer, SeedWorldArrayPickBatch>();
  private readonly visitExactPickRendererBound = this.visitExactPickRenderer.bind(this);
  private exactPickVisitor?: SeedWorldPickVisitor;
  private exactPickId?: string;

  private visitExactPickRenderer(renderer: MeshRenderer): void {
    let batch = this.exactPickBatches.get(renderer);
    if (!batch) {
      batch = new SeedWorldArrayPickBatch(renderer);
      this.exactPickBatches.set(renderer, batch);
    }
    batch.count = 1;
    batch.id = this.exactPickId;
    this.exactPickVisitor!(batch);
  }

  visitPickBatches(
    visitor: SeedWorldPickVisitor,
    detailIdentity?: (category: "grass" | "flower", x: number, z: number, owner?: string) => string | undefined
  ): void {
    this.population.visitPickBatches(visitor, detailIdentity);
    this.exactPickVisitor = visitor;
    try {
      const instances = this.exactPrefabs.exactInstances;
      for (let i = 0; i < instances.length; i++) {
        const instance = instances[i]!;
        this.exactPickId = instance.id;
        instance.visitRenderers?.(this.visitExactPickRendererBound);
      }
    } finally {
      this.exactPickVisitor = undefined;
      this.exactPickId = undefined;
    }
  }

  /** Visit the visible terrain Clipmap surface. */
  visitTerrainRenderers(visitor: (renderer: MeshRenderer) => void): void {
    this.clipmap.visitRenderers(visitor);
  }

  /** Entity owning this generated world's complete runtime hierarchy. */
  readonly root: Entity;
  /** Root entity that owns only the generated Terrain Clipmap segments. */
  readonly terrain: Entity;
  /** Entity owning all current-Seed rocks, debris, mushrooms, and Lake-shore lotus decorations. */
  readonly decorations: Entity;
  /** Generated single-Region Heightmap Terrain clipmap. */
  readonly clipmap: TerrainClipmap;
  /** Feature-decoration ordinary-stone renderer. */
  readonly stones?: SeedWorldExactPrefabRuntime;
  /** Feature-decoration small-rock renderer. */
  readonly smallRocks?: SeedWorldExactPrefabRuntime;
  /** Sparse accepted mushrooms bound to exact rock edges. */
  readonly mushrooms: SeedWorldExactPrefabRuntime;
  /** Sparse authorized lotus bound only to Artifact Lake shoreline cells. */
  readonly lotus: SeedWorldExactPrefabRuntime;
  /** Shared-Producer vegetation residency and LOD runtime. */
  readonly population: SeedWorldPopulationRuntime;
  /** Category-independent Cell scheduler for exact generated Prefabs, with or without authored LODs. */
  readonly exactInstanceCells: SeedWorldExactInstanceCellRuntime;
  /** Single World-owned Terrain Horizon shared by Population, exact Prefabs, and finite Water. */
  readonly terrainOcclusion: SeedWorldTerrainOcclusionCuller;
  /** Configuration-owned exact generated Prefab runtimes. */
  readonly exactPrefabs: SeedWorldExactPrefabRuntimeRegistry;
  /** Stable centre point used when entering the generated terrain preview. */
  readonly observationAnchor: Readonly<{ x: number; y: number; z: number }>;
  private readonly _grassAppearanceMaterials = new Map<Material, number>();

  /** Borrow the current native field when creating an external surface material. */
  getGrassColorFieldBinding(): SeedWorldGrassColorFieldBinding {
    return {
      texture: this._terrainMaterialState.grassTexture,
      vistaFromDetail: this._terrainMaterialState.vistaFromDetail,
      tuning: this._terrainMaterialState.grassTuning
    };
  }

  /** Registers runtime-owned grass materials against the live World palette and borrowed Terrain resources. */
  registerGrassAppearanceMaterial(material: Material, brightness = 1): () => void {
    this._bindGrassAppearanceMaterial(material, brightness);
    this._grassAppearanceMaterials.set(material, brightness);
    return () => {
      this._grassAppearanceMaterials.delete(material);
    };
  }

  private _bindGrassAppearanceMaterial(material: Material, brightness: number): void {
    bindSeedWorldGrassColorField(material.shaderData, "material", {
      texture: this._terrainMaterialState.grassTexture,
      vistaFromDetail: this._terrainMaterialState.vistaFromDetail,
      tuning:
        brightness === 1
          ? this._terrainMaterialState.grassTuning
          : varySeedWorldGrassPaletteBrightness(this._terrainMaterialState.grassTuning, brightness)
    });
    bindSeedWorldGrassTerrainMaterial(material, this.clipmap.renderMaterials[0]!);
    if (material.shader.name === "Terrain/Surface") bindSurfaceTerrain(material, this.clipmap.renderMaterials[0]!);
  }

  /** Untextured ground uses the built-in road colour; a base texture starts untinted. */
  get defaultGroundColor(): readonly [number, number, number] {
    return this._terrainMaterialState.surface?.diffuse ? [1, 1, 1] : SEED_WORLD_ROAD_COLOR_DEFAULT;
  }

  get grassGroundFusion(): boolean {
    return this._terrainMaterialState.groundFusion ?? true;
  }

  /** @returns Detached road and grass colour controls for the current runtime. */
  getSurfaceColorTuning(): SeedWorldSurfaceColorTuning {
    return Object.freeze({
      roadColor: freezeSeedWorldRoadColor(this._terrainMaterialState.roadColor),
      ...(this._terrainMaterialState.groundColor
        ? { groundColor: freezeSeedWorldRoadColor(this._terrainMaterialState.groundColor) }
        : {}),
      groundFusion: this.grassGroundFusion,
      grass: freezeSeedWorldGrassColorFieldTuning(this._terrainMaterialState.grassTuning)
    });
  }

  /**
   * Applies one complete artist-facing surface palette without rebuilding Terrain data.
   * @param tuning Bare-ground/road colours plus the shared Terrain/grass-root colour field.
   * @returns Nothing.
   */
  setSurfaceColorTuning(tuning: SeedWorldSurfaceColorTuning): void {
    const nextRoadColor = freezeSeedWorldRoadColor(tuning.roadColor);
    const nextGroundColor = tuning.groundColor === undefined ? undefined : freezeSeedWorldRoadColor(tuning.groundColor);
    const nextGrass = freezeSeedWorldGrassColorFieldTuning(tuning.grass);
    const previousFusion = this.grassGroundFusion;
    const groundFusion = tuning.groundFusion ?? previousFusion;
    const layerIds =
      groundFusion && previousFusion ? SEED_WORLD_SURFACE_LAYER_IDS.slice(1) : SEED_WORLD_SURFACE_LAYER_IDS;
    this.clipmap.setLayerDiffuseColors(
      layerIds.map((layerId) => {
        const color = groundFusion
          ? layerId === SEED_WORLD_SURFACE_LAYER_IDS[0]
            ? undefined
            : nextGroundColor
          : layerId === SEED_WORLD_ROAD_LAYER_ID
            ? nextRoadColor
            : (nextGroundColor ?? this.defaultGroundColor);
        const surface = this._terrainMaterialState.surface;
        const tint =
          surface?.diffuse &&
          (surface.street ? layerId !== SEED_WORLD_SURFACE_LAYER_IDS[0] : layerId !== SEED_WORLD_ROAD_LAYER_ID);
        return {
          regionId: SEED_WORLD_REGION_ID,
          layerId,
          color: color ? ([...color, 1] as const) : undefined,
          ...(tint ? { tint: true } : {})
        };
      })
    );
    this._setGrassColorFieldTuning(nextGrass);
    for (const material of this.clipmap.renderMaterials) {
      if (groundFusion !== previousFusion) {
        if (groundFusion) material.shaderData.enableMacro(MATERIAL_TERRAIN_GRASS_SHADING);
        else material.shaderData.disableMacro(MATERIAL_TERRAIN_GRASS_SHADING);
      }
      bindTerrainRoadColor(material, nextRoadColor);
    }
    this._terrainMaterialState.groundFusion = groundFusion;
    synchronizeSeedWorldRockGroundAppearance(this._engine, this.clipmap.renderMaterials[0]!);
    this.population.setGrassRoadColor(nextRoadColor);
    this.population.setGrassTerrainSurface(this.clipmap.renderMaterials[0]!);
    this._terrainMaterialState.roadColor = nextRoadColor;
    this._terrainMaterialState.groundColor = nextGroundColor;
    for (const [material, brightness] of this._grassAppearanceMaterials)
      this._bindGrassAppearanceMaterial(material, brightness);
  }

  /** Returns the live sand normal controls when the surface has a ripple texture. */
  getSandNormalTuning(): SeedWorldSandNormalTuning | undefined {
    const tuning = this._terrainMaterialState.sandNormals;
    return tuning && { ...tuning };
  }

  /** Update only the shader uniforms, keeping the terrain, texture residency and camera in place. */
  setSandNormalTuning(tuning: SeedWorldSandNormalTuning): void {
    const { surface, sandNormals } = this._terrainMaterialState;
    if (!sandNormals || !surface) return;
    const values = [
      tuning.rippleStrength,
      tuning.rippleTileMetres,
      tuning.rippleFadeDistanceMetres,
      tuning.microStrength,
      tuning.microTileMetres,
      tuning.microFadeDistanceMetres
    ];
    if (
      !values.every(Number.isFinite) ||
      tuning.rippleStrength < 0 ||
      tuning.microStrength < 0 ||
      Math.min(
        tuning.rippleTileMetres,
        tuning.rippleFadeDistanceMetres,
        tuning.microTileMetres,
        tuning.microFadeDistanceMetres
      ) <= 0
    )
      throw new RangeError("Invalid sand normal tuning");
    for (const material of this.clipmap.renderMaterials)
      bindSeedTerrainSandNormals(material, tuning, surface.tileMetres);
    this._terrainMaterialState.sandNormals = { ...tuning };
  }

  /** Restores the authored road colour and complete shared grass colour field. */
  resetSurfaceColorTuning(): void {
    this.setSurfaceColorTuning({
      roadColor: SEED_WORLD_ROAD_COLOR_DEFAULT,
      grass: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS
    });
  }

  /** Publishes one validated colour-field value to Terrain and all grass batches. */
  private _setGrassColorFieldTuning(tuning: SeedWorldGrassColorFieldTuning): void {
    for (const material of this.clipmap.renderMaterials) bindTerrainGrassColorFieldTuning(material, tuning);
    this.population.setGrassColorFieldTuning(tuning);
    this._terrainMaterialState.grassTuning = tuning;
  }

  /**
   * Builds the generated Heightmap Terrain and deterministic Seed-owned decoration population.
   * @param engine Engine owning the generated runtime resources.
   * @param parent Stable Seed-world runtime parent.
   * @param camera Camera driving Terrain and cliff LOD.
   * @param sourceLibrary Seed World Asset Assembly source shared by exact decorations and Population.
   * @param treeAuthoringProfiles Fully resolved procedural-tree geometry, foliage, material, and variation state per species.
   * @param plan Root-Seed semantic plan.
   * @param fields Baked authority fields compiled from `plan`.
   * @param decorations Exact feature-decoration array returned by the same Worker result as `surfaceIntent`.
   * @param populationLayout Worker-baked vegetation authoring result returned by the same Worker.
   * @param surfaceIntent Exact surface material buffer returned by the WorldFields Worker.
   * @param terrainSettings Validated Worker and Clipmap dimensions used for this result.
   * @param terrainNormalSamples Worker-baked Heightmap-aligned RG8 normals.
   * @param surfaceLodCrossFadeDurationSeconds Authored Seed World LOD cross-fade duration.
   * @param inspectionTile Optional one-Tile diagnostic scope; normal worlds omit it.
   * @param signal Optional generation cancellation checked before and after asynchronous resource preparation.
   * @param surfaceOptions Optional texture and colour-field inputs for the ordinary terrain layers.
   * @returns Runtime owner for the generated Terrain and cliff population.
   * @throws When any generated child runtime or required Terrain source cannot be created.
   */
  static async create(
    engine: Engine,
    parent: Entity,
    camera: Camera,
    sourceLibrary: AssetAssemblySourceLibrary,
    treeAuthoringProfiles: readonly ProceduralTreeRuntimeAuthoringProfile[],
    plan: SeedWorldPopulationWorld,
    fields: SeedWorldFields,
    decorations: readonly SeedWorldPresentationDecorationInstance[],
    populationLayout: SeedWorldPopulationPreview,
    surfaceIntent: SeedWorldSurfaceMaterialIntent,
    terrainSettings: SeedWorldTerrainGenerationSettings,
    terrainNormalSamples: Uint8Array,
    surfaceLodCrossFadeDurationSeconds: number,
    inspectionTile?: SeedWorldTerrainInspectionTile,
    signal?: AbortSignal,
    surfaceOptions: SeedWorldTerrainSurfaceOptions = {},
    authoredPuddles?: TerrainAuthoredPuddleCoverage
  ): Promise<SeedWorldTerrainRuntime> {
    signal?.throwIfAborted();
    const root = parent.createChild(`Seed World ${plan.rootSeed}`);
    // Candidate construction deliberately yields across several animation
    // frames. Keep the incomplete hierarchy outside update/render traversal
    // until the generation Publisher commits it atomically.
    root.isActive = false;
    let grassColorFieldTexture: Texture2D | undefined;
    let surfaceRelief: SeedWorldSurfaceReliefRuntime | undefined;
    try {
      if (inspectionTile) validateInspectionTile(inspectionTile);
      const sources = buildTerrainSources(fields, terrainSettings, terrainNormalSamples);
      const terrainMaterial = await engine.resourceManager.load<Material>({
        type: AssetType.Material,
        url: SEED_WORLD_TERRAIN_MATERIAL_URL
      });
      grassColorFieldTexture = await createSeedWorldSharedSurfaceTexture(engine);
      signal?.throwIfAborted();
      surfaceRelief = await SeedWorldSurfaceReliefRuntime.create(
        engine,
        fields,
        surfaceIntent,
        grassColorFieldTexture,
        signal
      );
      signal?.throwIfAborted();
      const soilTexture = surfaceIntent.soilCoverage
        ? await loadPlanningFarmDirtTexture(engine, !!surfaceOptions.baseTextureUrl?.trim() || !!surfaceOptions.palette)
        : undefined;
      signal?.throwIfAborted();
      const loadSurfaceTexture = (url: string | undefined, isSRGBColorSpace: boolean) =>
        url?.trim()
          ? engine.resourceManager.load<Texture2D>({
              url,
              type: AssetType.Texture,
              params: { isSRGBColorSpace, mipmap: true }
            })
          : undefined;
      const [diffuse, normal, microNormal, paletteTextures] = await Promise.all([
        loadSurfaceTexture(surfaceOptions.baseTextureUrl, true),
        loadSurfaceTexture(surfaceOptions.normalTextureUrl, false),
        loadSurfaceTexture(surfaceOptions.microNormalTextureUrl, false),
        Promise.all((surfaceOptions.palette?.layers ?? []).map((l) => loadSurfaceTexture(l.textureUrl, true)!))
      ]);
      signal?.throwIfAborted();
      const surface =
        diffuse || normal || paletteTextures.length
          ? {
              diffuse,
              normal,
              palette: surfaceOptions.palette,
              paletteTextures,
              tileMetres: surfaceOptions.tileMetres ?? 8,
              normalScale: surfaceOptions.normalScale ?? 1,
              street: !!authoredPuddles
            }
          : undefined;
      const layers = buildLayerSources(fields, surfaceIntent, soilTexture, surface);
      const farLod = resolveSeedWorldTerrainFarLod(terrainSettings.clipmapLodCount);
      const terrainMaterialState: SeedWorldTerrainMaterialState = {
        grassTexture: grassColorFieldTexture,
        soilTexture,
        surface,
        microNormal,
        sandNormals:
          surfaceOptions.roadPattern && surface?.normal
            ? {
                rippleStrength: surface.normalScale,
                rippleTileMetres: surface.tileMetres,
                rippleFadeDistanceMetres: 115,
                microStrength: 0.55,
                microTileMetres: 2,
                microFadeDistanceMetres: 18
              }
            : undefined,
        roadPattern: surfaceOptions.roadPattern,
        vistaFromDetail: true,
        grassTuning: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS,
        roadColor: SEED_WORLD_ROAD_COLOR_DEFAULT,
        farLod
      };
      const grassColorField: SeedWorldGrassColorFieldBinding = Object.freeze({
        texture: grassColorFieldTexture,
        vistaFromDetail: true,
        tuning: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS
      });
      const terrain = root.createChild("Terrain");
      const clipmap = new TerrainClipmap(
        engine,
        terrain,
        camera,
        {
          vertexSpacing: terrainSettings.heightSampleSpacingMetres,
          minHeight: fields.heightDecode?.offset ?? SEED_WORLD_HEIGHT_RANGE.minimum,
          maxHeight: fields.heightDecode
            ? fields.heightDecode.offset + fields.heightDecode.scale
            : SEED_WORLD_HEIGHT_RANGE.maximum,
          sources
        },
        terrainMaterial,
        SEED_WORLD_CLIPMAP_MESH_SIZE,
        terrainSettings.clipmapLodCount,
        layers,
        authoredPuddles ? { maximumSpacingMetres: 1.25, authoredCoverage: authoredPuddles } : undefined,
        undefined,
        {
          firstLod: farLod,
          nearTransitionMacro: "MATERIAL_TERRAIN_DETAIL_TRANSITION",
          farMacro: "MATERIAL_TERRAIN_FAR",
          configureMaterial: (material) => bindSeedTerrainMaterialState(material, terrainMaterialState)
        }
      );
      const decorationsRoot = root.createChild("Decorations");
      const activeDecorations = inspectionTile ? filterDecorationsToTile(decorations, inspectionTile) : decorations;
      const terrainOcclusion = new SeedWorldTerrainOcclusionCuller(fields);
      let exactPrefabs: SeedWorldExactPrefabRuntimeRegistry | undefined;
      let population: SeedWorldPopulationRuntime | undefined;
      try {
        exactPrefabs = new SeedWorldExactPrefabRuntimeRegistry({
          engine,
          parent: decorationsRoot,
          camera,
          sourceLibrary,
          fields,
          decorations: activeDecorations,
          terrainOcclusion,
          crossFadeDurationSeconds: surfaceLodCrossFadeDurationSeconds
        });
        synchronizeSeedWorldRockGroundAppearance(engine, clipmap.renderMaterials[0]!);
        await yieldSeedWorldTerrainCreationFrame(signal);
        population = new SeedWorldPopulationRuntime(
          engine,
          root.createChild("Population"),
          camera,
          sourceLibrary,
          treeAuthoringProfiles,
          plan,
          fields,
          populationLayout,
          inspectionTile ? inspectionPopulationRange(inspectionTile) : undefined,
          grassColorField,
          SEED_WORLD_ROAD_COLOR_DEFAULT,
          terrainOcclusion
        );
        population.setGrassTerrainSurface(clipmap.renderMaterials[0]!);
        population.setGrassSurfaceCoverageSampler(
          createSeedWorldGrassCoverageSampler(layers[0].alphamaps[0], [
            seedWorldOriginX(fields),
            seedWorldOriginZ(fields),
            fields.sizeMetres,
            fields.sizeMetres
          ])
        );
        await yieldSeedWorldTerrainCreationFrame(signal);
        const exactInstanceCells = new SeedWorldExactInstanceCellRuntime(
          camera,
          exactPrefabs.exactSpatialEntries,
          terrainOcclusion
        );
        signal?.throwIfAborted();
        return new SeedWorldTerrainRuntime(
          engine,
          camera,
          root,
          terrain,
          decorationsRoot,
          clipmap,
          exactPrefabs,
          population,
          exactInstanceCells,
          terrainOcclusion,
          terrainMaterialState,
          surfaceRelief
        );
      } catch (error) {
        population?.destroy();
        exactPrefabs?.destroy();
        clipmap.destroy();
        throw error;
      }
    } catch (error) {
      surfaceRelief?.dispose();
      grassColorFieldTexture?.destroy();
      root.destroy();
      throw error;
    }
  }

  private constructor(
    private readonly _engine: Engine,
    private readonly _camera: Camera,
    root: Entity,
    terrain: Entity,
    decorations: Entity,
    clipmap: TerrainClipmap,
    exactPrefabs: SeedWorldExactPrefabRuntimeRegistry,
    population: SeedWorldPopulationRuntime,
    exactInstanceCells: SeedWorldExactInstanceCellRuntime,
    terrainOcclusion: SeedWorldTerrainOcclusionCuller,
    private readonly _terrainMaterialState: SeedWorldTerrainMaterialState,
    readonly surfaceRelief: SeedWorldSurfaceReliefRuntime
  ) {
    this.root = root;
    this.terrain = terrain;
    this.decorations = decorations;
    this.clipmap = clipmap;
    this.exactPrefabs = exactPrefabs;
    this.stones = exactPrefabs.get("stone");
    this.smallRocks = exactPrefabs.get("small-rock");
    this.mushrooms = exactPrefabs.require("mushroom");
    this.lotus = exactPrefabs.require("lotus");
    this.population = population;
    this.exactInstanceCells = exactInstanceCells;
    this.terrainOcclusion = terrainOcclusion;
    this.observationAnchor = population.observationAnchor;
  }

  /** Additional surface field payload, excluding the unchanged native atlases. */
  get surfaceFieldGpuBytes(): number {
    return this.surfaceRelief.gpuTextureBytes;
  }
  getSurfaceReliefTuning(): Required<SeedWorldSurfaceReliefTuning> {
    return this.surfaceRelief.getTuning();
  }
  setSurfaceReliefTuning(tuning: SeedWorldSurfaceReliefTuning): void {
    this.surfaceRelief.setTuning(tuning);
  }
  private _surfaceFieldsBound = false;

  private _heightTransition?: (deltaTime: number) => void;
  private _disposeHeightTransition?: () => void;
  private _destroyed = false;
  private _terrainOcclusionPopulationRefreshFrames = 0;
  private _assetEntranceController: AbortController | undefined;
  private _decorationsWereActive = false;
  private _lodTuning: TerrainLodRendererTuning = { enabled: true, distanceScale: 1 };

  /**
   * Advances exact-instance camera residency, optional LOD transitions, and population rendering.
   * @param deltaTime Non-negative elapsed seconds since the previous frame.
   * @returns Nothing.
   */
  update(deltaTime: number): void {
    if (this._destroyed) return;
    if (!this._surfaceFieldsBound && this.root.isActiveInHierarchy) {
      this.surfaceRelief.bind(this._camera.shaderData);
      this._surfaceFieldsBound = true;
    }
    this._heightTransition?.(deltaTime);
    const cameraTransform = this._camera.entity.transform;
    this.terrainOcclusion.beginFrame(cameraTransform.worldPosition, cameraTransform.worldForward, deltaTime);
    if (this.terrainOcclusion.horizonPublishedThisFrame) {
      this._terrainOcclusionPopulationRefreshFrames = 2;
    }
    if (this._terrainOcclusionPopulationRefreshFrames > 0) {
      this.population.invalidateTerrainOcclusionVisibility();
      this._terrainOcclusionPopulationRefreshFrames--;
    }
    if (this.decorations.isActiveInHierarchy) {
      if (!this._decorationsWereActive) this.exactInstanceCells.invalidate();
      this.exactInstanceCells.update(this._engine.time.elapsedTime);
      this._decorationsWereActive = true;
    } else {
      this._decorationsWereActive = false;
    }
    this.population.update(deltaTime);
  }

  /**
   * Applies one shared runtime-only LOD policy to exact Prefabs and Population instances.
   * @param tuning Mesh-LOD enablement and projected-distance multiplier.
   * @returns Nothing.
   */
  setLodTuning(tuning: TerrainLodRendererTuning): void {
    this.exactPrefabs.setLodTuning(tuning);
    this.population.setLodTuning(tuning);
    this.exactInstanceCells.invalidate();
    this._lodTuning = { ...tuning };
  }

  /** @returns Detached shared mesh-LOD enablement and projected-distance multiplier. */
  getLodTuning(): TerrainLodRendererTuning {
    return { ...this._lodTuning };
  }

  /**
   * Selects the exact-Prefab LOD scheduling implementation used for performance A/B.
   * @param mode Unchanged per-frame linear baseline or shared Cell broad phase.
   * @returns Nothing.
   */
  setExactInstanceSpatialMode(mode: SeedWorldExactInstanceSpatialMode): void {
    this.exactInstanceCells.setMode(mode);
  }

  /**
   * Rebuilds the exact-Prefab ownership grid with a new horizontal Cell edge length.
   * @param cellSizeMetres Finite positive Cell edge length in metres.
   * @returns Nothing.
   * @throws {RangeError} When the Cell size is not finite and positive.
   */
  setExactInstanceCellSizeMetres(cellSizeMetres: number): void {
    this.exactInstanceCells.setCellSizeMetres(cellSizeMetres);
  }

  /** @returns Latest exact-Prefab spatial scheduling evidence. */
  getExactInstanceSpatialSnapshot(): Readonly<SeedWorldExactInstanceSpatialSnapshot> {
    return this.exactInstanceCells.getSnapshot();
  }

  /** @returns World-level Horizon construction and Population visibility evidence. */
  getTerrainOcclusionDiagnostics(): Readonly<SeedWorldTerrainOcclusionDiagnostics> {
    return this.terrainOcclusion.diagnostics;
  }

  /** Prepare a detached CPU/GPU height view. The owner starts it only after scene commit. */
  prepareHeightTransition(
    previous: SeedWorldFields,
    next: SeedWorldFields,
    seconds: number,
    presentationFields?: { -readonly [K in keyof SeedWorldFields]: SeedWorldFields[K] },
    dependents?: {
      prepare(fields: SeedWorldFields, signal: AbortSignal): Promise<PreparedTerrainDependents>;
      onError(error: unknown): void;
    }
  ) {
    const duration = resolveSeedWorldTerrainTransitionDurationSeconds(seconds);
    if (this._destroyed) throw new Error("Seed World terrain runtime is destroyed");
    if (
      previous.heightResolution !== next.heightResolution ||
      previous.sizeMetres !== next.sizeMetres ||
      seedWorldOriginX(previous) !== seedWorldOriginX(next) ||
      seedWorldOriginZ(previous) !== seedWorldOriginZ(next)
    )
      throw new Error("Terrain transition requires the same world grid");
    const encoding = (fields: SeedWorldFields) => ({
      samples: fields.heightSamples,
      offset: fields.heightDecode?.offset ?? SEED_WORLD_HEIGHT_RANGE.minimum,
      scale: fields.heightDecode?.scale ?? SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum
    });
    let transition = createSeedWorldTerrainHeightTransition(encoding(previous), encoding(next));
    const view = presentationFields ?? { ...next };
    view.heightSamples = duration === 0 ? next.heightSamples : transition.frame(0).slice();
    view.heightDecode = duration === 0 ? next.heightDecode : { offset: transition.offset, scale: transition.scale };
    const patch = {
      regionId: SEED_WORLD_REGION_ID,
      sampleOrigin: [0, 0] as const,
      sampleSize: [next.heightResolution, next.heightResolution] as const
    };
    const bounds = {
      minimumX: seedWorldOriginX(next),
      minimumZ: seedWorldOriginZ(next),
      maximumX: seedWorldOriginX(next) + next.sizeMetres,
      maximumZ: seedWorldOriginZ(next) + next.sizeMetres
    };
    let started = false,
      elapsed = 0,
      acceptedElapsed = 0,
      pauses = 0;
    const publish = (frame: { fields: SeedWorldFields; elapsed: number }) => {
      if (this._destroyed) return;
      if (frame.elapsed >= duration) {
        this.clipmap.updateHeightRegion({ ...patch, samples: next.heightSamples });
        this._heightTransition = undefined;
      } else
        this.clipmap.updateHeightRegionFrame({
          ...patch,
          samples: frame.fields.heightSamples,
          heightDecode: frame.fields.heightDecode
        });
      view.heightSamples = frame.fields.heightSamples;
      view.heightDecode = frame.fields.heightDecode;
      acceptedElapsed = frame.elapsed;
      this.population.applyAuthoringHeightFrame(patch.sampleOrigin, patch.sampleSize, view.heightSamples, bounds);
      this.applyAuthoringHeightPatch(view, bounds);
    };
    const gate =
      dependents &&
      new SeedWorldTerrainFrameGate<{ fields: SeedWorldFields; elapsed: number }>(
        (frame, signal) => dependents.prepare(frame.fields, signal),
        publish,
        dependents.onError
      );
    const update = (deltaTime: number) => {
      if (pauses) return;
      elapsed = Math.min(duration, elapsed + Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0));
      if (elapsed <= acceptedElapsed || gate?.busy) return;
      const fields: SeedWorldFields =
        elapsed >= duration
          ? next
          : {
              ...next,
              heightSamples: transition.frame(elapsed / duration).slice(),
              heightDecode: { offset: transition.offset, scale: transition.scale }
            };
      if (gate) gate.request({ fields, elapsed });
      else publish({ fields, elapsed });
    };
    return {
      fields: view as SeedWorldFields,
      pause: async () => {
        pauses++;
        const releaseGate = await gate?.pause();
        let released = false;
        return () => {
          if (!released) {
            released = true;
            pauses--;
            releaseGate?.();
          }
        };
      },
      dispose: () => gate?.dispose(),
      start: (current = previous) => {
        if (started) return;
        if (this._destroyed) throw new Error("Seed World terrain runtime is destroyed");
        if (this._heightTransition) throw new Error("Terrain runtime already has an active height transition");
        // Derived geometry was prepared against this snapshot. Its owner pauses
        // the previous presentation before sampling it; never silently rebase it.
        if (
          dependents &&
          (current.heightSamples !== previous.heightSamples || current.heightDecode !== previous.heightDecode)
        )
          throw new Error("Terrain dependents require a stable starting frame");
        if (!dependents) {
          transition = createSeedWorldTerrainHeightTransition(encoding(current), encoding(next));
          view.heightSamples = duration === 0 ? next.heightSamples : transition.frame(0).slice();
          view.heightDecode =
            duration === 0 ? next.heightDecode : { offset: transition.offset, scale: transition.scale };
        }
        started = true;
        this._heightTransition = update;
        this._disposeHeightTransition = () => gate?.dispose();
        publish({ fields: view, elapsed: 0 });
      }
    };
  }

  /**
   * Synchronizes every terrain-anchored exact Prefab and rebuilds their shared spatial index after a local edit.
   * XZ, scale, yaw, semantic identity, and non-terrain-anchored assets remain unchanged.
   */
  waterGrassCoverage(fields: SeedWorldFields, intent: SeedWorldSurfaceMaterialIntent) {
    const layers = buildLayerSources(
      fields,
      intent,
      this._terrainMaterialState.soilTexture,
      this._terrainMaterialState.surface
    )[0];
    return createSeedWorldGrassCoverageSampler(layers.alphamaps[0], [
      seedWorldOriginX(fields),
      seedWorldOriginZ(fields),
      fields.sizeMetres,
      fields.sizeMetres
    ]);
  }

  /** Stage native atlas and relief coverage while retaining world, geometry and material owners. */
  prepareWaterTerrain(
    fields: SeedWorldFields,
    intent: SeedWorldSurfaceMaterialIntent,
    settings: SeedWorldTerrainGenerationSettings,
    normals: Uint8Array
  ): PreparedTerrainUpdate {
    if (this._destroyed || this._heightTransition) throw Error("Terrain is not available for a local water edit");
    const source = buildTerrainSources(fields, settings, normals);
    const layers = buildLayerSources(
      fields,
      intent,
      this._terrainMaterialState.soilTexture,
      this._terrainMaterialState.surface
    );
    const terrain = this.clipmap.prepareRegionUpdate({
      sources: source,
      alphamaps: layers.flatMap((region) =>
        region.alphamaps.map((map, mapIndex) => ({
          regionId: region.id,
          mapIndex,
          sampleSize: map.sampleSize,
          pixels: map.weights
        }))
      )
    });
    let relief: PreparedTerrainUpdate;
    try {
      relief = this.surfaceRelief.prepareFields(fields, intent);
    } catch (error) {
      terrain.discard();
      throw error;
    }
    const grass = [...this._grassAppearanceMaterials.keys()].map((material) => {
      const old = material.shaderData.getTexture("material_GrassTerrainNormalAtlas");
      return {
        commit: () =>
          material.shaderData.setTexture(
            "material_GrassTerrainNormalAtlas",
            this.clipmap.renderMaterials[0].shaderData.getTexture("material_TerrainNormalAtlas")
          ),
        rollback: () => material.shaderData.setTexture("material_GrassTerrainNormalAtlas", old)
      };
    });
    const transaction = reversibleTerrainSteps([terrain, relief, ...grass]);
    return {
      commit: () => {
        transaction.commit();
        this.terrainOcclusion.invalidate();
      },
      rollback: () => transaction.rollback(),
      finalize: () => {
        terrain.finalize();
        relief.finalize();
      },
      discard: () => {
        relief.discard();
        terrain.discard();
      }
    };
  }

  applyAuthoringHeightPatch(fields: SeedWorldFields, bounds: SeedWorldRuntimeBounds): void {
    if (this._destroyed) throw new Error("Seed World terrain runtime is destroyed");
    this.exactPrefabs.applyAuthoringHeightPatch(fields, bounds);
    this.exactInstanceCells.rebuildSpatialIndex();
    this.terrainOcclusion.invalidate();
    this.population.invalidateTerrainOcclusionVisibility();
  }

  /**
   * Prepares the dense grass and flower Cell under the initial camera while the loading overlay is active.
   * @returns Nothing.
   * @throws When authored dense-detail buffers cannot be created or uploaded.
   */
  warmupPopulationDetails(): void {
    if (this._destroyed) return;
    this.population.warmupVisibleDetails();
  }

  /**
   * Replays Asset Assembly's bottom-up entrance for generated world materials.
   * Terrain, camera, navigation, and authored transforms are deliberately excluded.
   * @param durationMs Positive playback duration; defaults to two seconds.
   * @param signal Optional caller-owned cancellation.
   * @returns Promise resolved when every current asset Renderer is fully visible.
   */
  playAssetEntranceEffect(durationMs = ASSET_ASSEMBLY_ENTRANCE_DURATION_MS, signal?: AbortSignal): Promise<void> {
    if (this._destroyed) return Promise.reject(new Error("Seed World terrain runtime is destroyed"));
    this._assetEntranceController?.abort(new DOMException("Asset entrance superseded", "AbortError"));
    const controller = new AbortController();
    this._assetEntranceController = controller;
    const abortFromCaller = (): void => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener("abort", abortFromCaller, { once: true });

    return Promise.all([
      playRendererAssetEntranceEffect([this.decorations, this.population.details], {
        durationMs,
        signal: controller.signal
      }),
      this.population.playAssetEntranceEffect(durationMs, controller.signal)
    ])
      .then(() => undefined)
      .finally(() => {
        signal?.removeEventListener("abort", abortFromCaller);
        if (this._assetEntranceController === controller) this._assetEntranceController = undefined;
      });
  }

  /**
   * Releases every generated child runtime, Terrain GPU resource, and the world root exactly once.
   * @returns A promise completed after all owned runtime resources are released.
   */
  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    this._heightTransition = undefined;
    this._disposeHeightTransition?.();
    this._grassAppearanceMaterials.clear();
    this._assetEntranceController?.abort(new DOMException("Seed World terrain runtime destroyed", "AbortError"));
    this._assetEntranceController = undefined;
    this.population.destroy();
    this.exactPrefabs.destroy();
    this.clipmap.destroy();
    this.surfaceRelief.dispose();
    this._terrainMaterialState.grassTexture.destroy();
    this.root.destroy();
  }
}

function yieldSeedWorldTerrainCreationFrame(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = (): void => {
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new DOMException("Seed World Terrain creation was aborted.", "AbortError"));
    };
    const complete = (): void => {
      signal?.removeEventListener("abort", abort);
      try {
        signal?.throwIfAborted();
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => complete());
    else setTimeout(complete, 0);
  });
}

function buildTerrainSources(
  fields: SeedWorldFields,
  settings: SeedWorldTerrainGenerationSettings,
  normalSamples: Uint8Array
): readonly TerrainClipmapRegionSource[] {
  if (
    fields.sizeMetres !== settings.worldSizeMetres ||
    fields.heightResolution !== settings.heightResolution ||
    fields.heightSamples.length !== settings.heightResolution * settings.heightResolution
  ) {
    throw new Error("Seed World Terrain fields do not match the selected Heightmap dimensions");
  }
  if (normalSamples.length !== settings.heightResolution * settings.heightResolution * 2) {
    throw new Error("Seed World Terrain requires one RG8 normal per selected Heightmap sample");
  }
  return Object.freeze([
    Object.freeze({
      id: SEED_WORLD_REGION_ID,
      worldPosition: [seedWorldOriginX(fields), 0, seedWorldOriginZ(fields)] as const,
      worldSize: [fields.sizeMetres, 1, fields.sizeMetres] as const,
      heightSampleSize: [fields.heightResolution, fields.heightResolution] as const,
      heightDecodeOffset: fields.heightDecode?.offset ?? SEED_WORLD_HEIGHT_RANGE.minimum,
      heightDecodeScale:
        fields.heightDecode?.scale ?? SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum,
      heightSamples: fields.heightSamples,
      surfaceHeights: fields.surfaceHeights,
      normalSamples
    })
  ]);
}

function buildLayerSources(
  fields: SeedWorldFields,
  surfaceIntent: SeedWorldSurfaceMaterialIntent,
  soilTexture?: Texture2D,
  surface?: SeedWorldTerrainSurface
): readonly TerrainLayerResidencyRegionSource<Texture2D>[] {
  if (
    surfaceIntent.resolution !== fields.surfaceResolution ||
    surfaceIntent.materialWeights.length !== fields.surfaceResolution * fields.surfaceResolution * 4
  ) {
    throw new RangeError("Generated Terrain SurfaceIntent does not match its published coverage resolution");
  }
  const layers: TerrainLayerResolvedSource<Texture2D>[] = SEED_WORLD_SURFACE_LAYER_IDS.map((layerId, index) => {
    const profile = SEED_WORLD_SURFACE_LAYER_PROFILES[index];
    const textured = surface?.street ? index > 0 : layerId !== SEED_WORLD_ROAD_LAYER_ID;
    const ground = textured ? surface : undefined;
    return {
      id: layerId,
      appearance: profile.appearance,
      tileSize: [SEED_WORLD_STYLIZED_LAYER_TILE_SIZE_METRES, SEED_WORLD_STYLIZED_LAYER_TILE_SIZE_METRES],
      tileOffset: [0, 0],
      normalScale: 0,
      diffuseRemapMin: profile.color,
      diffuseRemapMax: profile.color,
      maskRemapMin: [0, 0, 0, 0],
      maskRemapMax: [1, 1, 1, 1],
      metallic: 0,
      smoothness: 0,
      specular: [0, 0, 0, 0],
      snowResponse: profile.snowResponse,
      ...(ground
        ? {
            tileSize: [ground.tileMetres, ground.tileMetres],
            diffuse: ground.diffuse,
            normal: ground.normal,
            normalScale: ground.normal ? ground.normalScale : 0,
            ...(ground.diffuse ? { diffuseRemapMin: [0, 0, 0, 0], diffuseRemapMax: [1, 1, 1, 1] } : {})
          }
        : {})
    };
  });
  if (surfaceIntent.soilCoverage) {
    if (!soilTexture) throw new Error("Natural soil requires its declared diffuse texture");
    layers.push({
      ...layers[2],
      id: "natural-soil",
      appearance: undefined,
      diffuse: soilTexture,
      tileSize: [4, 4],
      diffuseRemapMin: [0, 0, 0, 0],
      diffuseRemapMax: [1, 1, 1, 1]
    });
  }
  const palette = surface?.palette;
  const mixture = palette
    ? compileSeedWorldSurfacePalette(
        palette,
        surfaceIntent,
        seedWorldRenderWeights(surfaceIntent),
        fields.sizeMetres,
        fields.worldOrigin ?? [-fields.sizeMetres / 2, -fields.sizeMetres / 2]
      )
    : undefined;
  const baseLayerIds = [layers[0].id, layers[1].id, layers[2].id, layers[3]?.id ?? null] as const;
  if (palette)
    for (const [index, layer] of palette.layers.entries())
      layers.push({
        ...layers[0],
        id: layer.id,
        appearance: undefined,
        diffuse: surface!.paletteTextures![index],
        normal: surface!.normal,
        normalScale: surface!.normalScale,
        tileSize: layer.tileSize,
        tileOffset: layer.tileOffset ?? [0, 0],
        diffuseRemapMin: [0, 0, 0, 0],
        diffuseRemapMax: [1, 1, 1, 1]
      });
  return Object.freeze([
    Object.freeze({
      id: SEED_WORLD_REGION_ID,
      layers,
      alphamaps: [
        {
          sampleSize: [fields.surfaceResolution, fields.surfaceResolution] as const,
          layers: baseLayerIds,
          weights: mixture?.base ?? seedWorldRenderWeights(surfaceIntent)
        },
        ...(palette && mixture
          ? [
              {
                sampleSize: [fields.surfaceResolution, fields.surfaceResolution] as const,
                layers: palette.layers.map((l) => l.id) as [string, string, string, string],
                weights: mixture.palette
              }
            ]
          : [])
      ]
    })
  ]);
}

function bindTerrainGrassColorFieldTuning(material: Material, tuning: SeedWorldGrassColorFieldTuning): void {
  bindSeedWorldGrassColorFieldUniforms(material.shaderData, "material", tuning);
  material.shaderData.setColor(MATERIAL_GRASS_COLOR_A, new Color(...tuning.colorA, 1));
  material.shaderData.setColor(MATERIAL_GRASS_COLOR_B, new Color(...tuning.colorB, 1));
  material.shaderData.setVector4(
    MATERIAL_GRASS_COLOR_FIELD_TRANSFORM,
    new Vector4(
      tuning.enabled ? 1 : 0,
      tuning.uvScale,
      tuning.angleRadians,
      SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_SCALE
    )
  );
  material.shaderData.setVector4(
    MATERIAL_GRASS_COLOR_FIELD_OFFSET,
    new Vector4(
      ...tuning.offset,
      SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_OFFSET,
      SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_OFFSET
    )
  );
  material.shaderData.setVector4(
    MATERIAL_GRASS_COLOR_FIELD_PARAMS,
    new Vector4(tuning.softnessMetres, tuning.remapLow, tuning.remapHigh, tuning.saturation)
  );
  material.shaderData.setVector2(
    MATERIAL_GRASS_COLOR_FIELD_VISTA_BLEND,
    new Vector2(tuning.vistaBlendStartMetres, tuning.vistaBlendEndMetres)
  );
}

function bindTerrainGrassColorField(material: Material, field: SeedWorldGrassColorFieldBinding): void {
  bindSeedWorldGrassColorField(material.shaderData, "material", field);
}

function bindTerrainRoadColor(material: Material, color: readonly [number, number, number]): void {
  material.shaderData.setColor(MATERIAL_TERRAIN_ROAD_COLOR, new Color(...color, 1));
}

/** Apply Seed's authored ground appearance to a terrain owned by another world planner.
 * @param material Terrain material instance owned by the caller.
 * @param field Shared grass colour field used by both ground and vegetation.
 */
export function applySeedWorldTerrainAppearance(material: Material, field: SeedWorldGrassColorFieldBinding): void {
  material.shaderData.enableMacro(MATERIAL_TERRAIN_GRASS_SHADING);
  bindSeedTerrainMaterialState(material, {
    grassTexture: field.texture,
    vistaFromDetail: field.vistaFromDetail,
    grassTuning: field.tuning,
    roadColor: SEED_WORLD_ROAD_COLOR_DEFAULT,
    farLod: 2
  });
}

function bindSeedTerrainMaterialState(material: Material, state: SeedWorldTerrainMaterialState): void {
  bindTerrainGrassColorField(material, {
    texture: state.grassTexture,
    vistaFromDetail: state.vistaFromDetail,
    tuning: state.grassTuning
  });
  bindTerrainRoadColor(material, state.roadColor);
  if (state.surface?.palette) material.shaderData.enableMacro("MATERIAL_TERRAIN_LAYER_PALETTE");
  if (state.roadPattern) material.shaderData.enableMacro("MATERIAL_TERRAIN_ROAD_PALETTE");
  if (state.sandNormals && state.surface) {
    material.shaderData.enableMacro("MATERIAL_TERRAIN_SAND_RIPPLE");
    bindSeedTerrainSandNormals(material, state.sandNormals, state.surface.tileMetres);
  }
  if (state.microNormal) {
    material.shaderData.enableMacro("MATERIAL_TERRAIN_MICRO_NORMAL");
    material.shaderData.setTexture("material_TerrainMicroNormal", state.microNormal);
    if (!state.sandNormals)
      material.shaderData.setVector3("material_TerrainSandMicroParams", new Vector3(0.55, 0.5, 18));
  }
  material.shaderData.setFloat(MATERIAL_TERRAIN_FAR_LOD, state.farLod);
}

function bindSeedTerrainSandNormals(
  material: Material,
  tuning: SeedWorldSandNormalTuning,
  authoredTileMetres: number
): void {
  material.shaderData.setVector3(
    "material_TerrainSandRippleParams",
    new Vector3(tuning.rippleStrength, authoredTileMetres / tuning.rippleTileMetres, tuning.rippleFadeDistanceMetres)
  );
  material.shaderData.setVector3(
    "material_TerrainSandMicroParams",
    new Vector3(tuning.microStrength, 1 / tuning.microTileMetres, tuning.microFadeDistanceMetres)
  );
}

function freezeSeedWorldRoadColor(color: readonly [number, number, number]): readonly [number, number, number] {
  if (
    color.length !== 3 ||
    !color.every((component) => Number.isFinite(component) && component >= 0 && component <= 1)
  ) {
    throw new RangeError("Seed World road colour components must be finite and between zero and one");
  }
  return Object.freeze([...color] as [number, number, number]);
}

function validateInspectionTile({ tileX, tileZ }: SeedWorldTerrainInspectionTile): void {
  if (
    !Number.isInteger(tileX) ||
    !Number.isInteger(tileZ) ||
    tileX < 0 ||
    tileZ < 0 ||
    tileX >= TILES_PER_SIDE ||
    tileZ >= TILES_PER_SIDE
  ) {
    throw new RangeError("Seed World Terrain inspection Tile is outside the generated world");
  }
}

function inspectionPopulationRange(tile: SeedWorldTerrainInspectionTile): Readonly<{
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}> {
  const cellsPerTile = TILE_METRES / 64;
  return Object.freeze({
    minimumX: tile.tileX * cellsPerTile,
    maximumX: (tile.tileX + 1) * cellsPerTile - 1,
    minimumZ: tile.tileZ * cellsPerTile,
    maximumZ: (tile.tileZ + 1) * cellsPerTile - 1
  });
}

function filterDecorationsToTile(
  decorations: readonly SeedWorldPresentationDecorationInstance[],
  tile: SeedWorldTerrainInspectionTile
): readonly SeedWorldPresentationDecorationInstance[] {
  return decorations.filter((decoration) => {
    const tileX = Math.min(
      TILES_PER_SIDE - 1,
      Math.max(0, Math.floor(decoration.normalizedPosition.x * TILES_PER_SIDE))
    );
    const tileZ = Math.min(
      TILES_PER_SIDE - 1,
      Math.max(0, Math.floor(decoration.normalizedPosition.y * TILES_PER_SIDE))
    );
    return tile.tileX === tileX && tile.tileZ === tileZ;
  });
}
