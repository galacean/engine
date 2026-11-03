import {
  AssetType,
  type Engine,
  type Entity,
  type GLTFResource,
  MeshRenderer,
  PBRMaterial,
  RenderFace,
  Shader,
  type Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine";
import { Color } from "@galacean/engine-math";
import type { GrasslandsVector3 } from "../grasslands/GrasslandsPcgTypes.ts";
import { digestSha256Hex } from "@galacean/engine-water/water/resources/lake/index";
import {
  LAKE_LANDSCAPE_ASSET_HASH,
  LAKE_MODELS,
  LAKE_TEXTURES
} from "../grasslands/landscape/LakeLandscapeAssetCatalog.ts";
import type { LakeLandscapePlacement } from "../grasslands/landscape/LakeLandscapeLayout.ts";
import groundShaderSource from "../grasslands/landscape/LakeGround.shader?raw";

export type LakeTerrainMaterialRegionId = "mud-stones" | "sand" | "grass-mud";
export type LakeRockModelId = (typeof LARGE_ROCK_IDS | typeof SMALL_ROCK_IDS)[number];
type ModelSpec = (typeof LAKE_MODELS)[number];
type ModelId = ModelSpec["id"];
type TextureId = (typeof LAKE_TEXTURES)[number]["id"];
const LARGE_ROCK_IDS = ["shore-boulder", "shore-shelf"] as const;
const SMALL_ROCK_IDS = ["bed-rock", "bed-clump", "bed-pebble"] as const;
const ROOT_PIVOT_MODELS = new Set<ModelId>(["china-pine", "greeting-pine", "maple", "fern"]);
const TERRAIN_REGION_IDS = ["mud-stones", "sand", "grass-mud"] as const;
const ASSET_BYTE_LENGTH = [...LAKE_TEXTURES, ...LAKE_MODELS].reduce((sum, spec) => sum + spec.bytes, 0);
const MODEL_MATERIAL_IDS = {
  MI_RockSpire_Rocks: "rock",
  MI_RockSpire_Shelves: "rock",
  MI_ChinaPineBark: "pine-bark",
  MI_ChinaPineLeaves: "pine-leaves",
  MI_RedMapleBark: "maple-bark",
  MI_RedMapleLeaves: "maple-leaves",
  MI_Ferns: "fern"
} as const;
type MaterialId = "ground" | (typeof MODEL_MATERIAL_IDS)[keyof typeof MODEL_MATERIAL_IDS];

export interface LakeLandscapeAssetMetrics {
  readonly ready: boolean;
  readonly destroyed: boolean;
  readonly assetSetHash: string;
  readonly terrainMaterialRegionCount: 3;
  readonly terrainMaterialRegionIds: readonly LakeTerrainMaterialRegionId[];
  readonly rockModelResourceCount: number;
  readonly largeRockVariantCount: 2;
  readonly smallRockVariantCount: 3;
  readonly sharedRockMeshCount: number;
  readonly proxyRockMeshCount: 0;
  readonly activeRockInstanceCount: number;
  readonly rockInstanceCreateCount: number;
  readonly rockInstanceDestroyCount: number;
  readonly textureCreateCount: number;
  readonly textureDestroyCount: number;
  readonly textures: readonly LakeLandscapeTextureReadback[];
  readonly materialCreateCount: number;
  readonly materialDestroyCount: number;
  readonly gltfResourceCreateCount: number;
  readonly gltfResourceDestroyCount: number;
  readonly meshCreateCount: number;
  readonly meshDestroyCount: number;
  readonly templateEntityCreateCount: number;
  readonly templateEntityDestroyCount: number;
  readonly sourceByteLength: number;
}

export interface LakeLandscapeTextureReadback {
  readonly id: string;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly mipLevels: number;
  readonly colorSpace: "linear" | "srgb";
}

export interface LakeRockInstance {
  readonly entity: Entity;
  readonly modelId: LakeRockModelId;
  readonly rendererCount: number;
  readonly modelEntityCount: number;
  releaseAfterEntityDestroy(): void;
}

export interface LakeLandscapeInstance {
  readonly entity: Entity;
  readonly rendererCount: number;
  readonly entityCount: number;
  releaseAfterEntityDestroy(): void;
}

interface ModelResource {
  readonly resource: GLTFResource;
  readonly objectUrl: string;
  readonly spec: ModelSpec;
}

interface TextureResource {
  readonly texture: Texture2D;
  // KTX2ContentRestorer fetches this URL again after context loss.
  readonly objectUrl: string;
}

async function fetchVerifiedAssetBytes(spec: { url: string; bytes: number; sha256: string }): Promise<ArrayBuffer> {
  const response = await fetch(spec.url);
  if (!response.ok) throw new Error(`Lake landscape asset request failed: ${response.status} ${spec.url}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== spec.bytes || (await digestSha256Hex(bytes)) !== spec.sha256)
    throw new Error(`Lake landscape asset integrity mismatch: ${spec.url}`);
  return bytes;
}

function countEntityTree(root: Entity): number {
  return 1 + root.children.reduce((sum, child) => sum + countEntityTree(child), 0);
}

/** Owns the demo ground, rocks and alpha-tested vegetation. Water borrows camera color/depth through its shared services. */
export class WaterLandscapeAssets {
  private _terrainMaterial!: PBRMaterial;
  private readonly _textures = new Map<TextureId, TextureResource>();
  private readonly _models = new Map<ModelId, ModelResource>();
  private readonly _materials = new Map<MaterialId, PBRMaterial>();
  private _destroyed = false;
  private _activeRockInstanceCount = 0;
  private _rockInstanceCreateCount = 0;
  private _rockInstanceDestroyCount = 0;
  private _activeLandscapeInstanceCount = 0;
  private _meshCreateCount = 0;
  private _rockMeshCount = 0;
  private _sourceMaterialCreateCount = 0;
  private _templateEntityCreateCount = 0;
  private _textureDestroyCount = 0;
  private _materialDestroyCount = 0;
  private _meshDestroyCount = 0;
  private _gltfResourceDestroyCount = 0;
  private _templateEntityDestroyCount = 0;

  private constructor(private readonly _engine: Engine) {}

  get terrainMaterial(): PBRMaterial {
    return this._terrainMaterial;
  }

  static async load(engine: Engine): Promise<WaterLandscapeAssets> {
    const assets = new WaterLandscapeAssets(engine);
    const tasks = [
      ...LAKE_TEXTURES.map(async (spec) => {
        const objectUrl = URL.createObjectURL(new Blob([await fetchVerifiedAssetBytes(spec)], { type: "image/ktx2" }));
        let texture: Texture2D | undefined;
        try {
          texture = await engine.resourceManager.load<Texture2D>({ type: AssetType.KTX2, url: objectUrl });
          if (
            texture.width !== spec.size ||
            texture.height !== spec.size ||
            texture.mipmapCount !== spec.mipLevels ||
            texture.isSRGBColorSpace !== (spec.colorSpace === "srgb")
          )
            throw new Error(`Lake compressed texture metadata mismatch: ${spec.id}`);
          texture.name = `Lake:${spec.id}`;
          texture.isGCIgnored = true;
          texture.filterMode = TextureFilterMode.Trilinear;
          texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
          texture.anisoLevel = 4;
          assets._textures.set(spec.id, { texture, objectUrl });
        } catch (error) {
          texture?.destroy(true);
          URL.revokeObjectURL(objectUrl);
          throw error;
        }
      }),
      ...LAKE_MODELS.map(async (spec) => {
        const objectUrl = URL.createObjectURL(
          new Blob([await fetchVerifiedAssetBytes(spec)], { type: "model/gltf-binary" })
        );
        try {
          const resource = await engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: objectUrl });
          assets._models.set(spec.id, { resource, objectUrl, spec });
          const meshCount = resource.meshes?.flat().length ?? 0;
          assets._meshCreateCount += meshCount;
          if ([...LARGE_ROCK_IDS, ...SMALL_ROCK_IDS].some((id) => id === spec.id)) assets._rockMeshCount += meshCount;
          assets._sourceMaterialCreateCount += resource.materials?.length ?? 0;
          assets._templateEntityCreateCount += (resource.sceneRoots ?? []).reduce(
            (n, root) => n + countEntityTree(root),
            0
          );
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          throw error;
        }
      })
    ];
    const settled = await Promise.allSettled(tasks);
    try {
      const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failure) throw failure.reason;
      assets._createMaterials();
      return assets;
    } catch (error) {
      assets.destroyAfterSceneDetach();
      throw error;
    }
  }

  private _createMaterials(): void {
    const createMaterial = (
      name: MaterialId,
      color: TextureId,
      normal?: TextureId,
      tint: GrasslandsVector3 = [1, 1, 1],
      cutout = false
    ) => {
      const material = new PBRMaterial(this._engine);
      this._materials.set(name, material);
      material.name = `Lake:${name}`;
      material.isGCIgnored = true;
      material.baseTexture = this._textures.get(color)!.texture;
      if (normal) material.normalTexture = this._textures.get(normal)!.texture;
      material.baseColor = new Color(tint[0], tint[1], tint[2], 1);
      material.normalTextureIntensity = 0.45;
      material.metallic = 0;
      material.roughness = 0.86;
      if (cutout) {
        material.alphaCutoff = 0.42;
        material.renderFace = RenderFace.Double;
      }
      return material;
    };
    const ground = createMaterial("ground", "ground-dirt", "ground-normal");
    ground.shader = Shader.find("Demo/LakeGround") ?? Shader.create(groundShaderSource);
    ground.shaderData.setTexture("material_LakeSand", this._textures.get("ground-sand")!.texture);
    ground.shaderData.setTexture("material_LakeGrass", this._textures.get("ground-grass")!.texture);
    // Initialized only after all dependencies load; never publish a partial asset owner.
    this._terrainMaterial = ground;
    createMaterial("rock", "rock-color", "rock-normal", [0.7, 0.73, 0.7]);
    createMaterial("pine-bark", "pine-bark", "bark-normal", [0.8, 0.85, 0.75]);
    createMaterial("pine-leaves", "pine-leaves", undefined, [0.22, 0.38, 0.1], true);
    createMaterial("maple-bark", "maple-bark", "bark-normal");
    createMaterial("maple-leaves", "maple-leaves", undefined, [0.68, 0.13, 0.035], true);
    createMaterial("fern", "foliage", undefined, [0.5, 0.65, 0.35], true);
  }

  private _materialForSlot(name: string): PBRMaterial {
    const materialId = MODEL_MATERIAL_IDS[name as keyof typeof MODEL_MATERIAL_IDS];
    const material = this._materials.get(materialId);
    if (!material) throw new Error(`Unknown Lake model material slot: ${name}`);
    return material;
  }

  private _instantiateModel(
    parent: Entity,
    name: string,
    id: ModelId,
    configure: (root: Entity, modelRoot: Entity, spec: ModelSpec) => void
  ): { root: Entity; rendererCount: number; modelEntityCount: number } {
    if (this._destroyed) throw new Error("Lake landscape assets are destroyed.");
    const model = this._models.get(id)!;
    const root = parent.createChild(name);
    try {
      const modelRoot = model.resource.instantiateSceneRoot();
      root.addChild(modelRoot);
      const renderers: MeshRenderer[] = [];
      modelRoot.getComponentsIncludeChildren(MeshRenderer, renderers);
      for (const renderer of renderers) {
        renderer
          .getMaterials()
          .forEach((material, slot) => renderer.setMaterial(slot, this._materialForSlot(material!.name)));
        renderer.enableVertexColor = false;
        renderer.castShadows = renderer.receiveShadows = true;
      }
      configure(root, modelRoot, model.spec);
      return { root, rendererCount: renderers.length, modelEntityCount: countEntityTree(modelRoot) };
    } catch (error) {
      root.destroy();
      throw error;
    }
  }

  instantiateLargeRock(
    parent: Entity,
    name: string,
    variant: number,
    position: GrasslandsVector3,
    halfExtents: GrasslandsVector3
  ): LakeRockInstance {
    return this._instantiateRock(parent, name, LARGE_ROCK_IDS[variant % LARGE_ROCK_IDS.length], position, halfExtents);
  }

  instantiateSmallRock(
    parent: Entity,
    name: string,
    variant: number,
    position: GrasslandsVector3,
    halfExtents: GrasslandsVector3
  ): LakeRockInstance {
    return this._instantiateRock(parent, name, SMALL_ROCK_IDS[variant % SMALL_ROCK_IDS.length], position, halfExtents);
  }

  private _instantiateRock(
    parent: Entity,
    name: string,
    modelId: LakeRockModelId,
    position: GrasslandsVector3,
    halfExtents: GrasslandsVector3
  ): LakeRockInstance {
    const { root, rendererCount, modelEntityCount } = this._instantiateModel(
      parent,
      name,
      modelId,
      (root, modelRoot, { bounds }) => {
        const scale = halfExtents.map((value, axis) => (2 * value) / (bounds.maximum[axis] - bounds.minimum[axis]));
        root.transform.setPosition(...position);
        modelRoot.transform.setScale(scale[0], scale[1], scale[2]);
        modelRoot.transform.setPosition(
          ...(bounds.minimum.map((value, axis) => -(value + bounds.maximum[axis]) * 0.5 * scale[axis]) as [
            number,
            number,
            number
          ])
        );
      }
    );
    this._activeRockInstanceCount++;
    this._rockInstanceCreateCount++;
    let released = false;
    return {
      entity: root,
      modelId,
      rendererCount,
      modelEntityCount,
      releaseAfterEntityDestroy: () => {
        if (released) return;
        released = true;
        this._activeRockInstanceCount--;
        this._rockInstanceDestroyCount++;
      }
    };
  }

  instantiateLandscape(parent: Entity, placement: LakeLandscapePlacement): LakeLandscapeInstance {
    const { root, rendererCount, modelEntityCount } = this._instantiateModel(
      parent,
      placement.id,
      placement.model,
      (root, modelRoot, { bounds }) => {
        root.transform.setPosition(...placement.position);
        root.transform.setRotation(placement.pitch, placement.yaw, 0);
        modelRoot.transform.setScale(placement.scale, placement.scale, placement.scale);
        // Vegetation is authored around its root, while an asymmetric canopy can
        // shift the bounds center several meters away from that ground contact.
        const useRootPivot = ROOT_PIVOT_MODELS.has(placement.model);
        modelRoot.transform.setPosition(
          useRootPivot ? 0 : -(bounds.minimum[0] + bounds.maximum[0]) * 0.5 * placement.scale,
          -bounds.minimum[1] * placement.scale,
          useRootPivot ? 0 : -(bounds.minimum[2] + bounds.maximum[2]) * 0.5 * placement.scale
        );
      }
    );
    this._activeLandscapeInstanceCount++;
    let released = false;
    return {
      entity: root,
      rendererCount,
      entityCount: 1 + modelEntityCount,
      releaseAfterEntityDestroy: () => {
        if (!released) {
          released = true;
          this._activeLandscapeInstanceCount--;
        }
      }
    };
  }

  get metrics(): Readonly<LakeLandscapeAssetMetrics> {
    return {
      ready: !this._destroyed,
      destroyed: this._destroyed,
      assetSetHash: LAKE_LANDSCAPE_ASSET_HASH,
      terrainMaterialRegionCount: 3,
      terrainMaterialRegionIds: TERRAIN_REGION_IDS,
      rockModelResourceCount: LARGE_ROCK_IDS.length + SMALL_ROCK_IDS.length,
      largeRockVariantCount: LARGE_ROCK_IDS.length,
      smallRockVariantCount: SMALL_ROCK_IDS.length,
      sharedRockMeshCount: this._rockMeshCount,
      proxyRockMeshCount: 0,
      activeRockInstanceCount: this._activeRockInstanceCount,
      rockInstanceCreateCount: this._rockInstanceCreateCount,
      rockInstanceDestroyCount: this._rockInstanceDestroyCount,
      textureCreateCount: this._textures.size,
      textureDestroyCount: this._textureDestroyCount,
      textures: this._destroyed
        ? []
        : Array.from(
            this._textures,
            ([id, { texture }]): LakeLandscapeTextureReadback => ({
              id,
              format: TextureFormat[texture.format],
              width: texture.width,
              height: texture.height,
              mipLevels: texture.mipmapCount,
              colorSpace: texture.isSRGBColorSpace ? "srgb" : "linear"
            })
          ),
      materialCreateCount: this._materials.size + this._sourceMaterialCreateCount,
      materialDestroyCount: this._materialDestroyCount,
      gltfResourceCreateCount: this._models.size,
      gltfResourceDestroyCount: this._gltfResourceDestroyCount,
      meshCreateCount: this._meshCreateCount,
      meshDestroyCount: this._meshDestroyCount,
      templateEntityCreateCount: this._templateEntityCreateCount,
      templateEntityDestroyCount: this._templateEntityDestroyCount,
      sourceByteLength: ASSET_BYTE_LENGTH
    };
  }

  destroyAfterSceneDetach(): void {
    if (this._destroyed) return;
    if (this._activeRockInstanceCount || this._activeLandscapeInstanceCount)
      throw new Error("Destroy Lake scene instances before their shared assets.");
    this._destroyed = true;
    for (const { resource, objectUrl } of this._models.values()) {
      for (const root of new Set(resource.sceneRoots ?? [])) {
        this._templateEntityDestroyCount += countEntityTree(root);
        root.destroy();
      }
      const meshes = new Set(resource.meshes?.flat() ?? []);
      const materials = new Set(resource.materials ?? []);
      resource.destroy(true);
      this._gltfResourceDestroyCount++;
      for (const material of materials) {
        material.destroy(true);
        this._materialDestroyCount++;
      }
      for (const mesh of meshes) {
        mesh.destroy(true);
        this._meshDestroyCount++;
      }
      URL.revokeObjectURL(objectUrl);
    }
    for (const material of this._materials.values()) {
      material.destroy(true);
      this._materialDestroyCount++;
    }
    for (const { texture, objectUrl } of this._textures.values()) {
      texture.destroy(true);
      this._textureDestroyCount++;
      URL.revokeObjectURL(objectUrl);
    }
  }
}
