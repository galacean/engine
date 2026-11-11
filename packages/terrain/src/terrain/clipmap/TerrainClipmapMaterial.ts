import {
  terrainChangedRectangle,
  terrainRectangleSamples,
  reversibleTerrainSteps,
  type PreparedTerrainUpdate,
  type TerrainRegionUpdate
} from "./TerrainPreparedUpdate";
import { TerrainTextureArrayPool } from "./TerrainTextureArrayPool";
import {
  ContentRestorer,
  Engine,
  Material,
  ScreenSpaceReflection,
  ScreenSpaceReflectionReceiverMode,
  Texture,
  Texture2D,
  Texture2DArray,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine";
import {
  packTerrainHeightAtlas,
  TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS,
  type TerrainHeightAtlasPacking,
  type TerrainHeightAtlasRegion
} from "./TerrainHeightAtlas";
import { packTerrainHolesAtlas } from "./TerrainHolesAtlas";
import { resolveTerrainHeightFrameDecode } from "./TerrainHeightFrame";
import { bakeTerrainNormalAtlas, packTerrainNormalAtlas } from "./TerrainNormalAtlas";
import {
  createTerrainLayerResidencyResources,
  packTerrainLayerResidency,
  TerrainLayerResidencyError,
  TerrainLayerResidencyErrorCode,
  type TerrainLayerResidencyBackend,
  type TerrainLayerResidencyRegionSource,
  type TerrainLayerResidencyResources,
  type TerrainLayerTextureKind
} from "./TerrainLayerResidency";
import { resolveTerrainClipmapHolesSources, type TerrainClipmapRegionSource } from "./TerrainClipmapSource";
import {
  TerrainPuddleHydrologyCompiler,
  type TerrainPuddleHydrologyField,
  type TerrainPuddleHydrologyOptions
} from "./TerrainPuddleHydrology";

/** Renderer-owned material and diagnostics consumed by shared Geometry Clipmap topology. */
export interface TerrainClipmapRenderBinding {
  readonly material: Material;
  /** Optional compile-time simplified Material used from {@link farMaterialFirstLod} onward. */
  readonly farMaterial?: Material;
  /** First Clipmap ring rendered by {@link farMaterial}. */
  readonly farMaterialFirstLod?: number;
  readonly activeRegionCount: number;
  readonly heightAtlasSize: readonly [width: number, height: number];
  readonly holesAtlasSize: readonly [width: number, height: number];
  readonly activeLayerCount: number;
  readonly activeAlphamapCount: number;
  /** Static cross-Region shallow-water drainage field shared with rain-contact VFX. */
  readonly puddleHydrology?: TerrainPuddleHydrologyField;
  /** Stable world XZ origin used by this Clipmap's nested sampling lattice. */
  readonly gridOrigin: readonly [x: number, z: number];
  /** Shared immutable GPU height residency consumed by terrain-aware environment passes. */
  readonly heightSamplingSource?: TerrainHeightGpuSamplingSource;

  /**
   * Enables or disables the bound renderer-only macro variation without rebuilding residency.
   * @param enabled Whether the configured macro variation participates in Terrain shading.
   * @returns Nothing.
   */
  setMacroVariationEnabled?(enabled: boolean): void;

  /**
   * Selects logical Terrain layers that use one-sample randomized UV rotation.
   * @param layerMask Bit `n` enables detiling for resolved logical layer `n`.
   * @returns Nothing.
   */
  setLayerDetilingMask?(layerMask: number): void;

  /** Overrides solid layer diffuse colours in the current residency. Omit colour to restore the source remap. */
  setLayerDiffuseColors?(patches: readonly TerrainLayerDiffuseColorPatch[]): void;

  /**
   * Uploads one lossless local height rectangle into an existing Region residency slot.
   * @param patch Region-local R16 samples and rectangle coordinates.
   * @returns Nothing after both GPU residency and its device-loss backing store are updated.
   * @throws If the binding is destroyed or the patch does not fit the active Region.
   */
  updateHeightRegion(patch: TerrainHeightAtlasPatch): void;

  /**
   * Uploads one transient height-animation frame without rebuilding derived Terrain resources.
   * @param patch Region-local R16 samples and rectangle coordinates.
   * @returns Nothing after GPU height residency and its device-loss backing store are updated.
   * @throws If the binding is destroyed or the patch does not fit the active Region.
   */
  updateHeightRegionFrame?(patch: TerrainHeightAtlasFrame): void;

  /**
   * Uploads multiple height rectangles and recompiles shallow-water drainage once.
   * @param patches Active Region-local R16 rectangles.
   * @returns Nothing after height and drainage residency are synchronized.
   */
  updateHeightRegions?(patches: readonly TerrainHeightAtlasPatch[]): void;

  /**
   * Uploads one local RGBA8 Alphamap rectangle into an existing Region residency slot.
   * @param patch Region-local Alphamap index, pixels, and rectangle coordinates.
   * @returns Nothing after both GPU residency and its device-loss backing store are updated.
   * @throws If the binding is destroyed, has no layer residency, or the patch is invalid.
   */
  updateAlphamapRegion(patch: TerrainAlphamapAtlasPatch): void;

  /** Prepare detached height/normal/alpha/drainage values on the current Region lattice. */
  prepareRegionUpdate?(update: TerrainRegionUpdate): PreparedTerrainUpdate;

  /** Releases the Material clone and every derived residency texture. */
  destroy(): void;
}

export interface TerrainLayerDiffuseColorPatch {
  readonly regionId: string;
  readonly layerId: string;
  readonly color?: readonly [number, number, number, number];
  /** Multiply the authored remap range for a textured layer. */
  readonly tint?: boolean;
}

/** Stable GPU height-atlas view shared without coupling consumers to the Terrain Material clone. */
export interface TerrainHeightGpuSamplingSource {
  readonly texture: Texture2D;
  readonly atlasInvSize: Vector2;
  readonly regionWorldBounds: Float32Array;
  readonly regionAtlasRects: Float32Array;
  readonly regionHeightDecode: Float32Array;
  readonly regionCount: number;
  readonly revision: number;
}

/** Project-backed Clipmap binding with mutable Height and Alphamap atlas residency. */
export interface TerrainClipmapMaterialBinding extends TerrainClipmapRenderBinding {
  readonly puddleHydrology: TerrainPuddleHydrologyField;
  updateHeightRegionFrame(patch: TerrainHeightAtlasFrame): void;
  updateHeightRegions(patches: readonly TerrainHeightAtlasPatch[]): void;
}

/** Low-frequency world-space colour variation applied after Terrain layer blending. */
export interface TerrainMacroVariationOptions {
  /** Repeatable linear noise texture sampled in world XZ space. */
  readonly texture: Texture2D;
  /** Multiplicative colour reached by the first noise octave. */
  readonly colorA: readonly [red: number, green: number, blue: number];
  /** Multiplicative colour reached by the second noise octave. */
  readonly colorB: readonly [red: number, green: number, blue: number];
  /** First noise octave frequency in cycles per metre. */
  readonly scaleA: number;
  /** Second noise octave frequency in cycles per metre. */
  readonly scaleB: number;
  /** Rotation applied to the first octave in radians. */
  readonly angleRadians: number;
  /** UV offset applied to the first octave before rotation. */
  readonly offset: readonly [u: number, v: number];
}

/** Optional compile-time Material split for far Clipmap rings. */
export interface TerrainFarMaterialOptions {
  /** First zero-based Clipmap ring rendered by the simplified Material. */
  readonly firstLod: number;
  /** Compile-time macros shared by the near and far Material variants. */
  readonly sharedMacros?: readonly string[];
  /** Compile-time macro retained only by the near Material for transition logic. */
  readonly nearTransitionMacro?: string;
  /** Compile-time macro selecting the simplified far shader path. */
  readonly farMacro: string;
  /** Reapplies caller-owned Shader data whenever renderer residency creates replacement Materials. */
  readonly configureMaterial?: (material: Material) => void;
}

/** Region-local lossless R16 rectangle uploaded into an existing height atlas. */
export interface TerrainHeightAtlasPatch {
  /** Stable canonical Region id already present in the active residency set. */
  readonly regionId: string;
  /** Zero-based Region-local sample origin `[x,z]`. */
  readonly sampleOrigin: readonly [x: number, z: number];
  /** Positive patch dimensions `[width,height]`. */
  readonly sampleSize: readonly [width: number, height: number];
  /** Compact X-fast row-major R16 samples matching `sampleSize`. */
  readonly samples: Uint16Array;
}

/** Temporary region encoding; omission restores the residency's canonical encoding. */
export interface TerrainHeightAtlasFrame extends TerrainHeightAtlasPatch {
  readonly heightDecode?: Readonly<{ offset: number; scale: number }>;
}

/** Region-local RGBA8 rectangle uploaded into one existing Alphamap atlas slot. */
export interface TerrainAlphamapAtlasPatch {
  /** Stable canonical Region id already present in the active residency set. */
  readonly regionId: string;
  /** Zero-based Alphamap index inside the Region manifest. */
  readonly mapIndex: number;
  /** Zero-based Region-local texel origin `[x,z]`. */
  readonly sampleOrigin: readonly [x: number, z: number];
  /** Positive patch dimensions `[width,height]`. */
  readonly sampleSize: readonly [width: number, height: number];
  /** Compact X-fast row-major RGBA8 pixels matching `sampleSize`. */
  readonly pixels: Uint8Array;
}

/**
 * Clones one standard Project Material and binds derived height residency state.
 * @param engine Engine owning the runtime-only atlas.
 * @param sourceMaterial Standard Project Material resolved for the Region set.
 * @param sources Loaded renderer-neutral height sources.
 * @param layerSources Optional canonical alphamaps with explicitly resolved layer textures.
 * @param retainedGridOrigin Existing runtime lattice origin retained across residency swaps.
 * @param puddleHydrologyOptions Optional shallow-water drainage and coverage tuning.
 * @param macroVariationOptions Optional renderer-only world-space colour variation.
 * @param farMaterialOptions Optional compile-time simplified Material for distant rings.
 * @returns Renderer-owned binding released with the Clipmap root.
 * @throws If WebGL2 or the active residency set exceeds the current renderer capability.
 */
export function createTerrainClipmapMaterialBinding(
  engine: Engine,
  sourceMaterial: Material,
  sources: readonly TerrainClipmapRegionSource[],
  layerSources?: readonly TerrainLayerResidencyRegionSource<Texture2D>[],
  retainedGridOrigin?: readonly [x: number, z: number],
  puddleHydrologyOptions: Readonly<TerrainPuddleHydrologyOptions> = {},
  macroVariationOptions?: Readonly<TerrainMacroVariationOptions>,
  farMaterialOptions?: Readonly<TerrainFarMaterialOptions>
): TerrainClipmapMaterialBinding {
  const nativeCanvas = (engine.canvas as unknown as { _webCanvas: HTMLCanvasElement | OffscreenCanvas })._webCanvas;
  const context = nativeCanvas.getContext("webgl2") as WebGL2RenderingContext | null;
  if (!context) throw new Error("Geometry Clipmap height rendering requires WebGL2");
  validateFarMaterialOptions(farMaterialOptions);
  const vertexSpacing = inferUniformVertexSpacing(sources);
  const maxTextureSize = Number(context.getParameter(context.MAX_TEXTURE_SIZE));
  let heightPacking = packTerrainHeightAtlas(sources, maxTextureSize);
  let normalPixels = packTerrainNormalAtlas(sources, heightPacking);
  let puddleCompiler = new TerrainPuddleHydrologyCompiler(sources, maxTextureSize, puddleHydrologyOptions);
  let puddleHydrology = puddleCompiler.compile();
  const gridOrigin = retainedGridOrigin
    ? ([...retainedGridOrigin] as const)
    : selectTerrainGridOrigin(heightPacking.regions);
  const holesSources = resolveTerrainClipmapHolesSources(sources);
  const holesPacking = holesSources ? packTerrainHolesAtlas(holesSources, maxTextureSize) : undefined;
  const layerPacking = layerSources
    ? packTerrainLayerResidency(
        layerSources,
        maxTextureSize,
        Number(context.getParameter(context.MAX_ARRAY_TEXTURE_LAYERS))
      )
    : undefined;
  if (layerPacking) {
    const activeRegionIds = new Set(heightPacking.regions.map((region) => region.id));
    const inactiveLayerRegion = layerPacking.regions.find((region) => !activeRegionIds.has(region.id));
    if (inactiveLayerRegion) {
      throw new TerrainLayerResidencyError(
        TerrainLayerResidencyErrorCode.InvalidSource,
        `Terrain layer residency Region "${inactiveLayerRegion.id}" is not active in the Geometry Clipmap`
      );
    }
  }

  const worldBounds = new Float32Array(TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS * 4);
  const heightAtlasRects = new Float32Array(TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS * 4);
  const holesAtlasRects = holesPacking ? new Float32Array(TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS * 4) : undefined;
  const holesSolidValues = holesPacking ? new Float32Array(TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS) : undefined;
  const heightDecode = new Float32Array(TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS * 2);
  const heightAtlasInvSize = new Vector2(1 / heightPacking.width, 1 / heightPacking.height);
  const holesById = holesPacking ? new Map(holesPacking.regions.map((region) => [region.id, region])) : undefined;
  heightPacking.regions.forEach((region, index) => {
    worldBounds.set(
      [region.worldPosition[0], region.worldPosition[2], region.worldSize[0], region.worldSize[2]],
      index * 4
    );
    heightAtlasRects.set([region.x, region.y, region.width, region.height], index * 4);
    const holesRegion = holesById?.get(region.id);
    if (holesRegion && holesAtlasRects && holesSolidValues) {
      holesAtlasRects.set([holesRegion.x, holesRegion.y, holesRegion.width, holesRegion.height], index * 4);
      holesSolidValues[index] = holesRegion.solidValue;
    }
    heightDecode.set([region.heightDecodeOffset, region.heightDecodeScale], index * 2);
  });

  let heightAtlas: Texture2D | undefined;
  let normalAtlas: Texture2D | undefined;
  let holesAtlas: Texture2D | undefined;
  let puddleAtlas: Texture2D | undefined;
  let layerResources: TerrainLayerResidencyResources<Texture> | undefined;
  let material: Material | undefined;
  let farMaterial: Material | undefined;
  try {
    heightAtlas = createAtlasTexture(
      engine,
      "Terrain height residency atlas",
      heightPacking.width,
      heightPacking.height,
      TextureFormat.R8G8,
      heightPacking.pixels
    );
    normalAtlas = createAtlasTexture(
      engine,
      "Terrain normal residency atlas",
      heightPacking.width,
      heightPacking.height,
      TextureFormat.R8G8,
      normalPixels,
      TextureFilterMode.Bilinear
    );
    if (holesPacking) {
      holesAtlas = createAtlasTexture(
        engine,
        "Terrain holes residency atlas",
        holesPacking.width,
        holesPacking.height,
        TextureFormat.R8,
        holesPacking.pixels
      );
    }
    puddleAtlas = createAtlasTexture(
      engine,
      "Terrain puddle hydrology atlas",
      puddleHydrology.width,
      puddleHydrology.height,
      TextureFormat.R8G8,
      puddleHydrology.pixels,
      TextureFilterMode.Bilinear
    );
    if (layerPacking) {
      layerResources = createTerrainLayerResidencyResources(
        layerPacking,
        createTerrainLayerResidencyBackend(engine, maxTextureSize)
      );
    }

    material = sourceMaterial.clone();
    material.name = `${sourceMaterial.name} runtime terrain residency`;
    material.shaderData.setTexture("material_TerrainHeightAtlas", heightAtlas);
    material.shaderData.setVector2("material_TerrainHeightAtlasInvSize", heightAtlasInvSize);
    material.shaderData.setTexture("material_TerrainNormalAtlas", normalAtlas);
    if (holesAtlas && holesPacking && holesAtlasRects && holesSolidValues) {
      material.shaderData.setTexture("material_TerrainHolesAtlas", holesAtlas);
      material.shaderData.setVector2(
        "material_TerrainHolesAtlasInvSize",
        new Vector2(1 / holesPacking.width, 1 / holesPacking.height)
      );
      material.shaderData.setFloatArray("material_TerrainRegionHolesRects", holesAtlasRects);
      material.shaderData.setFloatArray("material_TerrainRegionHolesSolid", holesSolidValues);
      material.shaderData.enableMacro("MATERIAL_TERRAIN_HOLES");
    } else {
      material.shaderData.disableMacro("MATERIAL_TERRAIN_HOLES");
    }
    bindTerrainPuddleHydrology(material, puddleAtlas, puddleHydrology, heightPacking.regions);
    material.shaderData.setFloatArray("material_TerrainRegionWorldBounds", worldBounds);
    material.shaderData.setFloatArray("material_TerrainRegionAtlasRects", heightAtlasRects);
    material.shaderData.setFloatArray("material_TerrainRegionHeightDecode", heightDecode);
    material.shaderData.setInt("material_TerrainRegionCount", heightPacking.regions.length);
    setTerrainMaterialMacro(material, "MATERIAL_TERRAIN_SINGLE_REGION", heightPacking.regions.length === 1);
    material.shaderData.setFloat("material_TerrainVertexSpacing", vertexSpacing);
    material.shaderData.setVector2("material_TerrainGridOrigin", new Vector2(gridOrigin[0], gridOrigin[1]));
    if (layerPacking && layerResources) {
      const alphamapRanges = new Float32Array(TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS * 2);
      const rangesByRegionId = new Map(layerPacking.regions.map((region) => [region.id, region]));
      heightPacking.regions.forEach((region, index) => {
        const range = rangesByRegionId.get(region.id);
        if (range) alphamapRanges.set([range.alphamapOffset, range.alphamapCount], index * 2);
      });
      material.shaderData.setTexture("material_TerrainAlphamapAtlas", layerResources.alphamapAtlas);
      material.shaderData.setVector2(
        "material_TerrainAlphamapAtlasInvSize",
        new Vector2(1 / layerPacking.alphamapAtlasWidth, 1 / layerPacking.alphamapAtlasHeight)
      );
      material.shaderData.setTexture("material_TerrainAlphamapMetadata", layerResources.alphamapMetadata);
      const firstRect = layerPacking.alphamapMetadataPixels;
      material.shaderData.setVector4(
        "material_TerrainFirstAlphamapRect",
        new Vector4(firstRect[0], firstRect[1], firstRect[2], firstRect[3])
      );
      material.shaderData.setTexture("material_TerrainLayerMetadata", layerResources.layerMetadata);
      if (layerResources.diffuseTextures) {
        material.shaderData.setTexture("material_TerrainLayerDiffuseTextures", layerResources.diffuseTextures);
      }
      if (layerResources.normalTextures) {
        material.shaderData.setTexture("material_TerrainLayerNormalTextures", layerResources.normalTextures);
      }
      if (layerResources.maskTextures) {
        material.shaderData.setTexture("material_TerrainLayerMaskTextures", layerResources.maskTextures);
      }
      material.shaderData.setFloatArray("material_TerrainRegionAlphamapRanges", alphamapRanges);
      material.shaderData.setInt("material_TerrainAlphamapCount", layerPacking.alphamaps.length);
      material.shaderData.setInt("material_TerrainLayerCount", layerPacking.layers.length);
      const textured = layerPacking.layers.filter((layer) => layer.diffuseTextureIndex >= 0);
      const singleDiffuse = layerPacking.singleDiffuseTexture;
      const simple =
        layerPacking.alphamaps.length === 1 &&
        !layerPacking.textureUsage.normal &&
        !layerPacking.textureUsage.mask &&
        (!layerPacking.textureUsage.diffuse || (singleDiffuse !== undefined && textured.length === 1));
      setTerrainMaterialMacro(
        material,
        "MATERIAL_TERRAIN_UNTEXTURED_SINGLE_MAP",
        simple && singleDiffuse === undefined
      );
      setTerrainMaterialMacro(
        material,
        "MATERIAL_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP",
        simple && singleDiffuse !== undefined
      );
      setTerrainMaterialMacro(material, "MATERIAL_TERRAIN_LAYER_SINGLE_DIFFUSE", singleDiffuse !== undefined);
      material.shaderData.setTexture("material_TerrainLayerSingleDiffuse", singleDiffuse ?? null!);
      if (simple && singleDiffuse !== undefined) {
        const layer = textured[0],
          channels = layerPacking.alphamaps[0].layerIndices.map((index) => (index === layer.index ? 1 : 0));
        material.shaderData.setVector4("material_TerrainSimpleTextureChannels", new Vector4(...channels));
        material.shaderData.setVector4(
          "material_TerrainSimpleTextureTransform",
          new Vector4(
            1 / layer.tileSize[0],
            1 / layer.tileSize[1],
            layer.tileOffset[0] / layer.tileSize[0],
            layer.tileOffset[1] / layer.tileSize[1]
          )
        );
        material.shaderData.setVector4("material_TerrainSimpleTextureMin", new Vector4(...layer.diffuseRemapMin));
        material.shaderData.setVector4("material_TerrainSimpleTextureMax", new Vector4(...layer.diffuseRemapMax));
      }
      if (simple) {
        const indices = layerPacking.alphamaps[0].layerIndices;
        const colors = new Float32Array(16),
          surfaces = new Float32Array(16);
        indices.forEach((index, channel) => {
          const layer = layerPacking!.layers[index];
          if (!layer) return;
          colors.set(layer.diffuseRemapMin, channel * 4);
          surfaces.set([layer.metallic, layer.smoothness, layer.snowResponse, layer.appearanceRole], channel * 4);
        });
        material.shaderData.setFloatArray("material_TerrainSimpleColors", colors);
        material.shaderData.setFloatArray("material_TerrainSimpleSurfaces", surfaces);
        material.shaderData.setVector4("material_TerrainFirstLayerIndices", new Vector4(...indices));
      }
      material.shaderData.enableMacro("MATERIAL_TERRAIN_LAYERS");
      setTerrainMaterialMacro(material, "MATERIAL_TERRAIN_SINGLE_ALPHAMAP", layerPacking.alphamaps.length === 1);
      setTerrainMaterialMacro(material, "MATERIAL_TERRAIN_LAYER_DIFFUSE_TEXTURES", layerPacking.textureUsage.diffuse);
      setTerrainMaterialMacro(material, "MATERIAL_TERRAIN_LAYER_NORMAL_TEXTURES", layerPacking.textureUsage.normal);
      setTerrainMaterialMacro(material, "MATERIAL_TERRAIN_LAYER_MASK_TEXTURES", layerPacking.textureUsage.mask);
    } else {
      material.shaderData.disableMacro("MATERIAL_TERRAIN_UNTEXTURED_SINGLE_MAP");
      material.shaderData.disableMacro("MATERIAL_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP");
      material.shaderData.disableMacro("MATERIAL_TERRAIN_LAYER_SINGLE_DIFFUSE");
      material.shaderData.setTexture("material_TerrainLayerSingleDiffuse", null!);
      material.shaderData.disableMacro("MATERIAL_TERRAIN_LAYERS");
      material.shaderData.disableMacro("MATERIAL_TERRAIN_SINGLE_ALPHAMAP");
      material.shaderData.disableMacro("MATERIAL_TERRAIN_LAYER_DIFFUSE_TEXTURES");
      material.shaderData.disableMacro("MATERIAL_TERRAIN_LAYER_NORMAL_TEXTURES");
      material.shaderData.disableMacro("MATERIAL_TERRAIN_LAYER_MASK_TEXTURES");
    }
    bindTerrainMacroVariation(material, macroVariationOptions);
    material.shaderData.setInt("material_TerrainDetilingLayerMask", 0);
    for (const macro of farMaterialOptions?.sharedMacros ?? []) material.shaderData.enableMacro(macro);
    farMaterialOptions?.configureMaterial?.(material);
    if (!ScreenSpaceReflection.setMaterialReceiver(material, ScreenSpaceReflectionReceiverMode.OpaqueComposite, 1)) {
      throw new Error("Terrain Shader does not expose the required puddle SSR receiver contract");
    }
    if (farMaterialOptions) {
      if (farMaterialOptions.nearTransitionMacro) {
        material.shaderData.enableMacro(farMaterialOptions.nearTransitionMacro);
      }
      farMaterial = material.clone();
      farMaterial.name = `${sourceMaterial.name} runtime terrain far`;
      if (farMaterialOptions.nearTransitionMacro) {
        farMaterial.shaderData.disableMacro(farMaterialOptions.nearTransitionMacro);
      }
      farMaterial.shaderData.enableMacro(farMaterialOptions.farMacro);
      if (!ScreenSpaceReflection.setMaterialReceiver(farMaterial, ScreenSpaceReflectionReceiverMode.Disabled)) {
        throw new Error("Terrain Shader does not expose the required SSR receiver contract");
      }
    }
  } catch (error) {
    farMaterial?.destroy();
    material?.destroy();
    layerResources?.destroy();
    puddleAtlas?.destroy();
    holesAtlas?.destroy();
    normalAtlas?.destroy();
    heightAtlas?.destroy();
    throw error;
  }

  let destroyed = false;
  const ownedMaterial = material!;
  const ownedFarMaterial = farMaterial;
  const ownedHeightAtlas = heightAtlas!;
  let ownedNormalAtlas = normalAtlas!;
  const ownedHolesAtlas = holesAtlas;
  let ownedPuddleAtlas = puddleAtlas!;
  const ownedLayerResources = layerResources;
  let heightRevision = 0;
  let patchEpoch = 0;
  const preparedUpdates = new Set<PreparedTerrainUpdate>();
  const heightSamplingSource: TerrainHeightGpuSamplingSource = {
    texture: ownedHeightAtlas,
    atlasInvSize: heightAtlasInvSize,
    regionWorldBounds: worldBounds,
    regionAtlasRects: heightAtlasRects,
    regionHeightDecode: heightDecode,
    regionCount: heightPacking.regions.length,
    get revision(): number {
      return heightRevision;
    }
  };
  const heightRegionsById = new Map(heightPacking.regions.map((region) => [region.id, region] as const));
  const heightRegionIndices = new Map(heightPacking.regions.map((region, index) => [region.id, index] as const));
  const frameDecode = (patch: TerrainHeightAtlasFrame) => {
    const index = heightRegionIndices.get(patch.regionId)!;
    return resolveTerrainHeightFrameDecode(
      patch,
      heightRegionsById.get(patch.regionId)!,
      heightDecode[index * 2],
      heightDecode[index * 2 + 1]
    );
  };
  const bindFrameDecode = (patch: TerrainHeightAtlasFrame, decode: readonly [number, number]) => {
    heightDecode.set(decode, heightRegionIndices.get(patch.regionId)! * 2);
    ownedMaterial.shaderData.setFloatArray("material_TerrainRegionHeightDecode", heightDecode);
    ownedFarMaterial?.shaderData.setFloatArray("material_TerrainRegionHeightDecode", heightDecode);
  };
  const alphamapsByKey = new Map(
    (layerPacking?.alphamaps ?? []).map(
      (alphamap) => [`${alphamap.regionId}\u0000${alphamap.index}`, alphamap] as const
    )
  );
  return {
    material: ownedMaterial,
    farMaterial: ownedFarMaterial,
    farMaterialFirstLod: farMaterialOptions?.firstLod,
    activeRegionCount: heightPacking.regions.length,
    heightAtlasSize: [heightPacking.width, heightPacking.height],
    holesAtlasSize: holesPacking ? [holesPacking.width, holesPacking.height] : [0, 0],
    activeLayerCount: layerPacking?.layers.length ?? 0,
    activeAlphamapCount: layerPacking?.alphamaps.length ?? 0,
    get puddleHydrology(): TerrainPuddleHydrologyField {
      return puddleHydrology;
    },
    gridOrigin,
    heightSamplingSource,
    setMacroVariationEnabled(enabled): void {
      const value = enabled && macroVariationOptions ? 1 : 0;
      ownedMaterial.shaderData.setInt("material_TerrainMacroVariationEnabled", value);
      ownedFarMaterial?.shaderData.setInt("material_TerrainMacroVariationEnabled", value);
    },
    setLayerDetilingMask(layerMask): void {
      if (!Number.isInteger(layerMask) || layerMask < 0 || layerMask > 0x7fff_ffff) {
        throw new RangeError("Terrain detiling layer mask must be a non-negative 31-bit integer");
      }
      ownedMaterial.shaderData.setInt("material_TerrainDetilingLayerMask", layerMask);
      ownedFarMaterial?.shaderData.setInt("material_TerrainDetilingLayerMask", layerMask);
    },
    setLayerDiffuseColors(patches): void {
      if (destroyed) throw Error("Terrain binding is destroyed");
      if (!layerPacking || !ownedLayerResources) throw Error("Terrain has no layer residency");
      const pixels = layerPacking.layerMetadataPixels,
        next = pixels.slice();
      const identities = new Set<string>();
      for (const patch of patches) {
        const key = JSON.stringify([patch.regionId, patch.layerId]);
        if (identities.has(key)) throw Error("Duplicate Terrain layer colour override");
        identities.add(key);
        const layer = layerPacking.layers.find(
          (layer) => layer.regionId === patch.regionId && layer.id === patch.layerId
        );
        if (!layer) throw Error("Terrain layer colour target is not resident: " + key);
        if (
          patch.color &&
          (patch.color.length !== 4 || !patch.color.every((c) => Number.isFinite(c) && c >= 0 && c <= 1))
        )
          throw RangeError("Terrain diffuse colours must be finite linear RGBA in [0, 1]");
        const offset = layer.index * layerPacking.layerMetadataWidth * 4;
        const color = patch.color;
        if (patch.tint && color) {
          next.set(
            layer.diffuseRemapMin.map((value, i) => value * color[i]),
            offset + 4
          );
          next.set(
            layer.diffuseRemapMax.map((value, i) => value * color[i]),
            offset + 8
          );
        } else {
          next.set(color ?? layer.diffuseRemapMin, offset + 4);
          next.set(color ?? layer.diffuseRemapMax, offset + 8);
        }
      }
      if (next.every((value, i) => value === pixels[i])) return;
      const texture = ownedLayerResources.layerMetadata as Texture2D;
      try {
        texture.setPixelBuffer(next);
      } catch (error) {
        texture.setPixelBuffer(pixels);
        throw error;
      }
      // Keep the same backing array used by device-loss restoration.
      pixels.set(next);
      const indices = layerPacking.alphamaps[0]?.layerIndices;
      if (indices) {
        const colors = new Float32Array(16);
        indices.forEach((index, channel) => {
          if (index >= 0)
            colors.set(
              pixels.subarray(
                index * layerPacking.layerMetadataWidth * 4 + 4,
                index * layerPacking.layerMetadataWidth * 4 + 8
              ),
              channel * 4
            );
        });
        // The simple single-map variants use uniforms instead of metadata fetches.
        for (const material of [ownedMaterial, ownedFarMaterial])
          if (material) {
            material.shaderData.setFloatArray("material_TerrainSimpleColors", colors);
            if (layerPacking.singleDiffuseTexture) {
              const textured = layerPacking.layers.filter((layer) => layer.diffuseTextureIndex >= 0);
              if (textured.length === 1) {
                const offset = textured[0].index * layerPacking.layerMetadataWidth * 4;
                material.shaderData.setVector4(
                  "material_TerrainSimpleTextureMin",
                  new Vector4(pixels[offset + 4], pixels[offset + 5], pixels[offset + 6], pixels[offset + 7])
                );
                material.shaderData.setVector4(
                  "material_TerrainSimpleTextureMax",
                  new Vector4(pixels[offset + 8], pixels[offset + 9], pixels[offset + 10], pixels[offset + 11])
                );
              }
            }
          }
      }
    },
    updateHeightRegion(patch): void {
      this.updateHeightRegions([patch]);
    },
    updateHeightRegionFrame(patch): void {
      if (destroyed) throw new Error("Terrain Clipmap material binding has been destroyed");
      validateHeightPatch(patch, heightRegionsById);
      const decode = frameDecode(patch);
      uploadHeightPatch(patch, heightRegionsById, heightPacking, ownedHeightAtlas);
      bindFrameDecode(patch, decode);
      heightRevision++;
      patchEpoch++;
    },
    updateHeightRegions(patches): void {
      if (destroyed) throw new Error("Terrain Clipmap material binding has been destroyed");
      if (!patches.length) return;
      for (const patch of patches) validateHeightPatch(patch, heightRegionsById);
      const decodes = patches.map(frameDecode);
      for (const [index, patch] of patches.entries()) {
        uploadHeightPatch(patch, heightRegionsById, heightPacking, ownedHeightAtlas);
        bindFrameDecode(patch, decodes[index]);
      }
      bakeTerrainNormalAtlas(heightPacking, normalPixels);
      ownedNormalAtlas.setPixelBuffer(normalPixels);
      const nextHydrology = puddleCompiler.updateHeightRegions(patches);
      const nextPuddleAtlas = createAtlasTexture(
        engine,
        "Terrain puddle hydrology atlas",
        nextHydrology.width,
        nextHydrology.height,
        TextureFormat.R8G8,
        nextHydrology.pixels,
        TextureFilterMode.Bilinear
      );
      bindTerrainPuddleHydrology(ownedMaterial, nextPuddleAtlas, nextHydrology, heightPacking.regions);
      if (ownedFarMaterial) {
        bindTerrainPuddleHydrology(ownedFarMaterial, nextPuddleAtlas, nextHydrology, heightPacking.regions);
      }
      const previousPuddleAtlas = ownedPuddleAtlas;
      ownedPuddleAtlas = nextPuddleAtlas;
      puddleHydrology = nextHydrology;
      previousPuddleAtlas.destroy();
      heightRevision++;
      patchEpoch++;
    },
    updateAlphamapRegion(patch): void {
      if (destroyed) throw new Error("Terrain Clipmap material binding has been destroyed");
      const packing = layerPacking;
      const atlas = ownedLayerResources?.alphamapAtlas as Texture2D | undefined;
      if (!packing || !atlas) throw new Error("Terrain Clipmap has no active Alphamap residency");
      const alphamap = alphamapsByKey.get(`${patch.regionId}\u0000${patch.mapIndex}`);
      if (!alphamap) {
        throw new Error(
          `Terrain Alphamap atlas does not contain Region ${JSON.stringify(patch.regionId)} map ${patch.mapIndex}`
        );
      }
      const [originX, originZ] = patch.sampleOrigin;
      const [width, height] = patch.sampleSize;
      if (
        !Number.isInteger(originX) ||
        !Number.isInteger(originZ) ||
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        originX < 0 ||
        originZ < 0 ||
        width < 1 ||
        height < 1 ||
        originX + width > alphamap.width ||
        originZ + height > alphamap.height
      ) {
        throw new Error(
          `Terrain Alphamap patch is outside Region ${JSON.stringify(patch.regionId)} map ${patch.mapIndex}`
        );
      }
      if (patch.pixels.length !== width * height * 4) {
        throw new Error(
          `Terrain Alphamap patch for Region ${JSON.stringify(patch.regionId)} map ${patch.mapIndex} has an invalid payload size`
        );
      }
      for (let localZ = 0; localZ < height; localZ++) {
        const sourceOffset = localZ * width * 4;
        const atlasOffset = ((alphamap.y + originZ + localZ) * packing.alphamapAtlasWidth + alphamap.x + originX) * 4;
        packing.alphamapAtlasPixels.set(patch.pixels.subarray(sourceOffset, sourceOffset + width * 4), atlasOffset);
      }
      atlas.setPixelBuffer(patch.pixels, 0, alphamap.x + originX, alphamap.y + originZ, width, height);
      patchEpoch++;
    },
    prepareRegionUpdate(update): PreparedTerrainUpdate {
      if (destroyed) throw Error("Terrain binding is destroyed");
      const epoch = patchEpoch,
        oldRevision = heightRevision;
      if (update.sources.length !== heightPacking.regions.length) throw Error("Terrain Region set changed");
      const nextHoles = resolveTerrainClipmapHolesSources(update.sources);
      const nextHolesPacking = nextHoles ? packTerrainHolesAtlas(nextHoles, maxTextureSize) : undefined;
      if (
        Boolean(nextHolesPacking) !== Boolean(holesPacking) ||
        (nextHolesPacking &&
          holesPacking &&
          (JSON.stringify(nextHolesPacking.regions) !== JSON.stringify(holesPacking.regions) ||
            nextHolesPacking.width !== holesPacking.width ||
            nextHolesPacking.height !== holesPacking.height ||
            nextHolesPacking.pixels.length !== holesPacking.pixels.length ||
            nextHolesPacking.pixels.some((v, i) => v !== holesPacking.pixels[i])))
      )
        throw Error("Prepared Terrain updates cannot change holes residency");
      const nextPacking = packTerrainHeightAtlas(update.sources, maxTextureSize);
      if (nextPacking.width !== heightPacking.width || nextPacking.height !== heightPacking.height)
        throw Error("Terrain packing changed");
      const patches: { next: TerrainHeightAtlasFrame; old: TerrainHeightAtlasFrame }[] = [];
      for (const region of heightPacking.regions) {
        const source = update.sources.find((s) => s.id === region.id),
          nextRegion = nextPacking.regions.find((r) => r.id === region.id);
        if (
          !source ||
          !nextRegion ||
          region.width !== nextRegion.width ||
          region.height !== nextRegion.height ||
          region.x !== nextRegion.x ||
          region.y !== nextRegion.y ||
          region.worldPosition.some((n, i) => n !== nextRegion.worldPosition[i]) ||
          region.worldSize.some((n, i) => n !== nextRegion.worldSize[i])
        )
          throw Error("Terrain Region grid changed");
        const index = heightRegionIndices.get(region.id)!;
        const oldSamples = new Uint16Array(region.width * region.height);
        for (let z = 0; z < region.height; z++)
          for (let x = 0; x < region.width; x++) {
            const offset = ((z + region.y) * heightPacking.width + x + region.x) * 2;
            oldSamples[z * region.width + x] = heightPacking.pixels[offset] | (heightPacking.pixels[offset + 1] << 8);
          }
        const oldDecode = { offset: heightDecode[index * 2], scale: heightDecode[index * 2 + 1] };
        const decode = { offset: Math.fround(source.heightDecodeOffset), scale: Math.fround(source.heightDecodeScale) };
        if (
          !Number.isFinite(decode.offset) ||
          !Number.isFinite(decode.scale) ||
          decode.scale <= 0 ||
          !Number.isFinite(Math.fround(decode.offset + decode.scale))
        )
          throw Error("Invalid Terrain decode");
        const changed =
          oldDecode.offset !== decode.offset || oldDecode.scale !== decode.scale
            ? { x: 0, z: 0, width: region.width, height: region.height }
            : terrainChangedRectangle(oldSamples, source.heightSamples, region.width, region.height);
        if (changed) {
          const common = {
            regionId: region.id,
            sampleOrigin: [changed.x, changed.z] as const,
            sampleSize: [changed.width, changed.height] as const
          };
          patches.push({
            next: {
              ...common,
              samples: terrainRectangleSamples(source.heightSamples, region.width, changed),
              heightDecode: decode
            },
            old: {
              ...common,
              samples: terrainRectangleSamples(oldSamples, region.width, changed),
              heightDecode: oldDecode
            }
          });
        }
      }
      const alpha: { next: TerrainAlphamapAtlasPatch; old: TerrainAlphamapAtlasPatch }[] = [];
      const alphaKeys = new Set<string>();
      for (const source of update.alphamaps ?? []) {
        const key = `${source.regionId}\u0000${source.mapIndex}`;
        if (alphaKeys.has(key)) throw Error("Duplicate prepared Terrain Alphamap");
        alphaKeys.add(key);
        const region = alphamapsByKey.get(`${source.regionId}\u0000${source.mapIndex}`);
        if (!region || !layerPacking || source.sampleSize[0] !== region.width || source.sampleSize[1] !== region.height)
          throw Error("Terrain Alphamap grid changed");
        const old = new Uint8Array(region.width * region.height * 4);
        for (let z = 0; z < region.height; z++) {
          const start = ((region.y + z) * layerPacking.alphamapAtlasWidth + region.x) * 4;
          old.set(layerPacking.alphamapAtlasPixels.subarray(start, start + region.width * 4), z * region.width * 4);
        }
        const changed = terrainChangedRectangle(old, source.pixels, region.width, region.height, 4);
        if (changed) {
          const common = {
            regionId: source.regionId,
            mapIndex: source.mapIndex,
            sampleOrigin: [changed.x, changed.z] as const,
            sampleSize: [changed.width, changed.height] as const
          };
          alpha.push({
            next: { ...common, pixels: terrainRectangleSamples(source.pixels, region.width, changed, 4) },
            old: { ...common, pixels: terrainRectangleSamples(old, region.width, changed, 4) }
          });
        }
      }
      const previousNormal = ownedNormalAtlas,
        previousPuddle = ownedPuddleAtlas,
        previousNormals = normalPixels;
      const previousHydrology = puddleHydrology,
        previousCompiler = puddleCompiler,
        previousRegions = heightPacking.regions;
      const nextNormals = packTerrainNormalAtlas(update.sources, nextPacking);
      const nextCompiler = new TerrainPuddleHydrologyCompiler(update.sources, maxTextureSize, puddleHydrologyOptions);
      const nextHydrology = nextCompiler.compile();
      const nextNormal = createAtlasTexture(
        engine,
        "Prepared Terrain normals",
        nextPacking.width,
        nextPacking.height,
        TextureFormat.R8G8,
        nextNormals,
        TextureFilterMode.Bilinear
      );
      let nextPuddle: Texture2D;
      try {
        nextPuddle = createAtlasTexture(
          engine,
          "Prepared Terrain puddles",
          nextHydrology.width,
          nextHydrology.height,
          TextureFormat.R8G8,
          nextHydrology.pixels,
          TextureFilterMode.Bilinear
        );
      } catch (error) {
        nextNormal.destroy();
        throw error;
      }
      const steps: { commit(): void; rollback(): void }[] = [];
      for (const patch of patches)
        steps.push({
          commit: () => {
            uploadHeightPatch(patch.next, heightRegionsById, heightPacking, ownedHeightAtlas);
            bindFrameDecode(patch.next, [patch.next.heightDecode!.offset, patch.next.heightDecode!.scale]);
          },
          rollback: () => {
            uploadHeightPatch(patch.old, heightRegionsById, heightPacking, ownedHeightAtlas);
            bindFrameDecode(patch.old, [patch.old.heightDecode!.offset, patch.old.heightDecode!.scale]);
          }
        });
      for (const patch of alpha)
        steps.push({
          commit: () => this.updateAlphamapRegion(patch.next),
          rollback: () => this.updateAlphamapRegion(patch.old)
        });
      for (const material of [ownedMaterial, ...(ownedFarMaterial ? [ownedFarMaterial] : [])]) {
        steps.push({
          commit: () => material.shaderData.setTexture("material_TerrainNormalAtlas", nextNormal),
          rollback: () => material.shaderData.setTexture("material_TerrainNormalAtlas", previousNormal)
        });
        steps.push({
          commit: () => bindTerrainPuddleHydrology(material, nextPuddle, nextHydrology, heightPacking.regions),
          rollback: () => bindTerrainPuddleHydrology(material, previousPuddle, previousHydrology, heightPacking.regions)
        });
      }
      const transaction = reversibleTerrainSteps(steps);
      let state: "prepared" | "committed" | "finished" = "prepared";
      const restore = () => {
        try {
          transaction.rollback();
        } finally {
          ownedNormalAtlas = previousNormal;
          ownedPuddleAtlas = previousPuddle;
          normalPixels = previousNormals;
          puddleHydrology = previousHydrology;
          puddleCompiler = previousCompiler;
          heightPacking = { ...heightPacking, regions: previousRegions };
          for (const region of previousRegions) heightRegionsById.set(region.id, region);
          heightRevision = oldRevision;
          patchEpoch = epoch;
        }
      };
      const candidate: PreparedTerrainUpdate = {
        commit: () => {
          if (state !== "prepared" || destroyed || patchEpoch !== epoch) throw Error("Stale Terrain prepared update");
          try {
            transaction.commit();
          } catch (error) {
            heightRevision = oldRevision;
            patchEpoch = epoch;
            throw error;
          }
          ownedNormalAtlas = nextNormal;
          ownedPuddleAtlas = nextPuddle;
          normalPixels = nextNormals;
          puddleHydrology = nextHydrology;
          puddleCompiler = nextCompiler;
          heightPacking = { ...heightPacking, regions: nextPacking.regions };
          for (const region of nextPacking.regions) heightRegionsById.set(region.id, region);
          heightRevision++;
          patchEpoch++;
          state = "committed";
        },
        rollback: () => {
          if (state === "committed") {
            try {
              restore();
            } finally {
              state = "prepared";
            }
          }
        },
        finalize: () => {
          if (state !== "committed") throw Error("Terrain update is not committed");
          state = "finished";
          preparedUpdates.delete(candidate);
          previousNormal.destroy();
          previousPuddle.destroy();
        },
        discard: () => {
          if (state === "finished") return;
          try {
            if (state === "committed") restore();
          } finally {
            state = "finished";
            preparedUpdates.delete(candidate);
            nextNormal.destroy();
            nextPuddle.destroy();
          }
        }
      };
      preparedUpdates.add(candidate);
      return candidate;
    },
    destroy(): void {
      if (destroyed) return;
      for (const update of [...preparedUpdates]) update.discard();
      destroyed = true;
      ownedFarMaterial?.destroy();
      ownedMaterial.destroy();
      ownedLayerResources?.destroy();
      ownedPuddleAtlas.destroy();
      ownedHolesAtlas?.destroy();
      ownedNormalAtlas.destroy();
      ownedHeightAtlas.destroy();
    }
  };
}

function bindTerrainMacroVariation(
  material: Material,
  options: Readonly<TerrainMacroVariationOptions> | undefined
): void {
  material.shaderData.setInt("material_TerrainMacroVariationEnabled", options ? 1 : 0);
  if (!options) return;
  material.shaderData.setTexture("material_TerrainMacroVariationTexture", options.texture);
  material.shaderData.setVector3("material_TerrainMacroColorA", new Vector3(...options.colorA));
  material.shaderData.setVector3("material_TerrainMacroColorB", new Vector3(...options.colorB));
  material.shaderData.setFloat("material_TerrainMacroScaleA", options.scaleA);
  material.shaderData.setFloat("material_TerrainMacroScaleB", options.scaleB);
  material.shaderData.setFloat("material_TerrainMacroAngle", options.angleRadians);
  material.shaderData.setVector2("material_TerrainMacroOffset", new Vector2(...options.offset));
}

function validateFarMaterialOptions(options: Readonly<TerrainFarMaterialOptions> | undefined): void {
  if (!options) return;
  if (!Number.isInteger(options.firstLod) || options.firstLod < 1) {
    throw new RangeError("Terrain far Material must begin at a positive integer Clipmap LOD");
  }
  if (
    !options.farMacro.trim() ||
    (options.nearTransitionMacro !== undefined && !options.nearTransitionMacro.trim()) ||
    options.sharedMacros?.some((macro) => !macro.trim())
  ) {
    throw new RangeError("Terrain far Material macros must not be empty");
  }
  const macros = [options.farMacro, options.nearTransitionMacro, ...(options.sharedMacros ?? [])].filter(
    (macro): macro is string => macro !== undefined
  );
  if (new Set(macros).size !== macros.length) {
    throw new RangeError("Terrain near-transition, far, and shared Material macros must be distinct");
  }
}

function bindTerrainPuddleHydrology(
  material: Material,
  atlas: Texture2D,
  hydrology: TerrainPuddleHydrologyField,
  heightRegions: readonly TerrainHeightAtlasRegion[]
): void {
  const rects = new Float32Array(TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS * 4);
  const hydrologyById = new Map(hydrology.regions.map((region) => [region.id, region] as const));
  heightRegions.forEach((region, index) => {
    const hydrologyRegion = hydrologyById.get(region.id);
    if (!hydrologyRegion) {
      throw new Error(`Terrain puddle hydrology is missing active Region "${region.id}"`);
    }
    rects.set([hydrologyRegion.x, hydrologyRegion.y, hydrologyRegion.width, hydrologyRegion.height], index * 4);
  });
  material.shaderData.setTexture("material_TerrainPuddleAtlas", atlas);
  material.shaderData.setVector2(
    "material_TerrainPuddleAtlasInvSize",
    new Vector2(1 / hydrology.width, 1 / hydrology.height)
  );
  material.shaderData.setFloatArray("material_TerrainRegionPuddleRects", rects);
}

function validateHeightPatch(
  patch: TerrainHeightAtlasPatch,
  heightRegionsById: ReadonlyMap<string, TerrainHeightAtlasRegion>
): void {
  const region = heightRegionsById.get(patch.regionId);
  if (!region) throw new Error(`Terrain height atlas does not contain active Region "${patch.regionId}"`);
  const [originX, originZ] = patch.sampleOrigin;
  const [width, height] = patch.sampleSize;
  if (
    !Number.isInteger(originX) ||
    !Number.isInteger(originZ) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    originX < 0 ||
    originZ < 0 ||
    width < 1 ||
    height < 1 ||
    originX + width > region.width ||
    originZ + height > region.height
  ) {
    throw new Error(`Terrain height atlas patch is outside Region "${patch.regionId}"`);
  }
  if (patch.samples.length !== width * height) {
    throw new Error(`Terrain height atlas patch for Region "${patch.regionId}" has an invalid payload size`);
  }
}

function uploadHeightPatch(
  patch: TerrainHeightAtlasPatch,
  heightRegionsById: ReadonlyMap<string, TerrainHeightAtlasRegion>,
  heightPacking: TerrainHeightAtlasPacking,
  heightAtlas: Texture2D
): void {
  const region = heightRegionsById.get(patch.regionId)!;
  const [originX, originZ] = patch.sampleOrigin;
  const [width, height] = patch.sampleSize;
  const upload = new Uint8Array(width * height * 2);
  for (let localZ = 0; localZ < height; localZ++) {
    for (let localX = 0; localX < width; localX++) {
      const sample = patch.samples[localZ * width + localX];
      const uploadOffset = (localZ * width + localX) * 2;
      upload[uploadOffset] = sample & 0xff;
      upload[uploadOffset + 1] = sample >>> 8;
      const atlasOffset = ((region.y + originZ + localZ) * heightPacking.width + region.x + originX + localX) * 2;
      heightPacking.pixels[atlasOffset] = upload[uploadOffset];
      heightPacking.pixels[atlasOffset + 1] = upload[uploadOffset + 1];
    }
  }
  heightAtlas.setPixelBuffer(upload, 0, region.x + originX, region.y + originZ, width, height);
}

function selectTerrainGridOrigin(
  regions: readonly { id: string; worldPosition: readonly [x: number, y: number, z: number] }[]
): readonly [x: number, z: number] {
  const selected = [...regions].sort(
    (left, right) =>
      left.worldPosition[0] - right.worldPosition[0] ||
      left.worldPosition[2] - right.worldPosition[2] ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  )[0];
  if (!selected) throw new Error("Terrain Clipmap grid origin requires one active Region");
  return [selected.worldPosition[0], selected.worldPosition[2]];
}

const terrainTexturePools = new WeakMap<Engine, TerrainTextureArrayPool<Texture2D, Texture>>();
function createTerrainLayerResidencyBackend(
  engine: Engine,
  maxTextureSize: number
): TerrainLayerResidencyBackend<Texture2D, Texture> {
  let pool = terrainTexturePools.get(engine);
  if (!pool) terrainTexturePools.set(engine, (pool = new TerrainTextureArrayPool()));
  const borrows = new Map<Texture, { release(): void }>();
  return {
    createAlphamapAtlas(width, height, pixels, linearFiltering): Texture {
      return createAtlasTexture(
        engine,
        "Terrain alphamap residency atlas",
        width,
        height,
        TextureFormat.R8G8B8A8,
        pixels,
        linearFiltering ? TextureFilterMode.Bilinear : TextureFilterMode.Point
      );
    },
    createMetadataTexture(name, width, height, pixels): Texture {
      return createMetadataTexture(engine, name, width, height, pixels);
    },
    createLayerTextureArray(kind, sources, contentIds): Texture {
      const lease = pool!.acquire(
        kind,
        sources,
        contentIds,
        () => createLayerTextureArray(engine, kind, sources, maxTextureSize),
        (resource) => resource.destroy()
      );
      borrows.set(lease.resource, lease);
      return lease.resource;
    },
    destroy(resource): void {
      const lease = borrows.get(resource);
      if (lease) {
        borrows.delete(resource);
        lease.release();
      } else resource.destroy();
    }
  };
}

class TerrainAtlasContentRestorer extends ContentRestorer<Texture2D> {
  constructor(
    resource: Texture2D,
    private readonly _pixels: ArrayBufferView
  ) {
    super(resource);
  }

  override restoreContent(): void {
    this.resource.setPixelBuffer(this._pixels);
  }
}

class TerrainLayerArrayContentRestorer extends ContentRestorer<Texture2DArray> {
  constructor(
    resource: Texture2DArray,
    private readonly _pixels: Uint8Array
  ) {
    super(resource);
  }

  override restoreContent(): void {
    const resource = this.resource;
    resource.setPixelBuffer(0, this._pixels, 0, 0, 0, resource.width, resource.height, resource.length);
    resource.generateMipmaps();
  }
}

function createAtlasTexture(
  engine: Engine,
  name: string,
  width: number,
  height: number,
  format: TextureFormat,
  pixels: ArrayBufferView,
  filterMode = TextureFilterMode.Point
): Texture2D {
  const texture = new Texture2D(engine, width, height, format, false, false);
  try {
    texture.name = name;
    texture.filterMode = filterMode;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    texture.setPixelBuffer(pixels);
    engine.resourceManager.addContentRestorer(new TerrainAtlasContentRestorer(texture, pixels));
    return texture;
  } catch (error) {
    texture.destroy();
    throw error;
  }
}

function createMetadataTexture(
  engine: Engine,
  name: string,
  width: number,
  height: number,
  pixels: Float32Array
): Texture2D {
  return createAtlasTexture(engine, name, width, height, TextureFormat.R32G32B32A32, pixels);
}

function createLayerTextureArray(
  engine: Engine,
  kind: TerrainLayerTextureKind,
  sources: readonly (Texture2D | undefined)[],
  maxTextureSize: number
): Texture2DArray {
  const firstSource = sources.find((source): source is Texture2D => source !== undefined);
  let width = 1;
  let height = 1;
  let anisoLevel = 1;
  for (const source of sources) {
    if (!source) continue;
    width = Math.max(width, source.width);
    height = Math.max(height, source.height);
    anisoLevel = Math.max(anisoLevel, source.anisoLevel);
  }
  const isSRGBColorSpace = firstSource?.isSRGBColorSpace ?? kind === "diffuse";
  const physicalLayerCount = Math.max(1, sources.length);
  if (width > maxTextureSize || height > maxTextureSize) {
    throw unsupportedLayerTexture(
      `Terrain ${kind} layer texture ${width}x${height} exceeds device texture limit ${maxTextureSize}`
    );
  }
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    if (!source) continue;
    if (source.format !== TextureFormat.R8G8B8A8 || source.isSRGBColorSpace !== isSRGBColorSpace) {
      throw unsupportedLayerTexture(
        `Terrain ${kind} texture array requires RGBA8 textures in one color space; layer ${index} is ${source.width}x${source.height} ${TextureFormat[source.format]}`
      );
    }
  }

  const layerByteLength = width * height * 4;
  const pixels = new Uint8Array(layerByteLength * physicalLayerCount);
  const readbackCache = new Map<Texture2D, Uint8Array>();
  for (let layerIndex = 0; layerIndex < physicalLayerCount; layerIndex++) {
    const target = pixels.subarray(layerIndex * layerByteLength, (layerIndex + 1) * layerByteLength);
    const source = sources[layerIndex];
    if (!source) {
      fillDefaultLayerPixels(target, kind);
      continue;
    }
    let sourcePixels = readbackCache.get(source);
    if (!sourcePixels) {
      sourcePixels = new Uint8Array(source.width * source.height * 4);
      try {
        source.getPixelBuffer(sourcePixels);
      } catch (error) {
        throw new TerrainLayerResidencyError(
          TerrainLayerResidencyErrorCode.UnsupportedLayerTexture,
          `Terrain ${kind} layer ${layerIndex} cannot be copied into renderer residency`,
          { cause: error }
        );
      }
      readbackCache.set(source, sourcePixels);
    }
    if (source.width === width && source.height === height) target.set(sourcePixels);
    else resampleRgba8(sourcePixels, source.width, source.height, target, width, height);
  }

  const texture = new Texture2DArray(
    engine,
    width,
    height,
    physicalLayerCount,
    TextureFormat.R8G8B8A8,
    true,
    isSRGBColorSpace
  );
  try {
    texture.name = `Terrain ${kind} layer residency`;
    texture.filterMode = TextureFilterMode.Trilinear;
    texture.anisoLevel = anisoLevel;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
    texture.setPixelBuffer(0, pixels, 0, 0, 0, width, height, physicalLayerCount);
    texture.generateMipmaps();
    engine.resourceManager.addContentRestorer(new TerrainLayerArrayContentRestorer(texture, pixels));
    return texture;
  } catch (error) {
    texture.destroy();
    throw error;
  }
}

function resampleRgba8(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  target: Uint8Array,
  targetWidth: number,
  targetHeight: number
): void {
  const scaleX = sourceWidth / targetWidth;
  const scaleY = sourceHeight / targetHeight;
  for (let targetY = 0; targetY < targetHeight; targetY++) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((targetY + 0.5) * scaleY));
    for (let targetX = 0; targetX < targetWidth; targetX++) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((targetX + 0.5) * scaleX));
      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
      const targetOffset = (targetY * targetWidth + targetX) * 4;
      target[targetOffset] = source[sourceOffset];
      target[targetOffset + 1] = source[sourceOffset + 1];
      target[targetOffset + 2] = source[sourceOffset + 2];
      target[targetOffset + 3] = source[sourceOffset + 3];
    }
  }
}

function fillDefaultLayerPixels(pixels: Uint8Array, kind: TerrainLayerTextureKind): void {
  const rgba = kind === "normal" ? [128, 128, 255, 255] : kind === "mask" ? [0, 255, 0, 0] : [255, 255, 255, 255];
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(rgba, offset);
}

function unsupportedLayerTexture(message: string): TerrainLayerResidencyError {
  return new TerrainLayerResidencyError(TerrainLayerResidencyErrorCode.UnsupportedLayerTexture, message);
}

function inferUniformVertexSpacing(sources: readonly TerrainClipmapRegionSource[]): number {
  const first = sources[0];
  const spacing = first.worldSize[0] / (first.heightSampleSize[0] - 1);
  for (const source of sources) {
    const x = source.worldSize[0] / (source.heightSampleSize[0] - 1);
    const z = source.worldSize[2] / (source.heightSampleSize[1] - 1);
    if (!nearlyEqual(x, spacing) || !nearlyEqual(z, spacing)) {
      throw new Error(`Geometry Clipmap Region "${source.id}" does not share one isotropic height grid`);
    }
  }
  return spacing;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * 16 * Math.max(1, Math.abs(left), Math.abs(right));
}

function setTerrainMaterialMacro(material: Material, name: string, enabled: boolean): void {
  if (enabled) material.shaderData.enableMacro(name);
  else material.shaderData.disableMacro(name);
}
