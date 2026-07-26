import {
  AssetType,
  Engine,
  Entity,
  GLTFResource,
  MeshRenderer,
  PBRMaterial,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine";
import { Color, Vector4 } from "@galacean/engine-math";
import type { GrasslandsVector3 } from "./GrasslandsPcgTypes";

export const GRASSLANDS_ENVIRONMENT_ASSET_SET_HASH = "2a1d1e0591c0d2a1125332a4b4c08938d89a782a9ea6c46b11c3fd7d35b31580";

export type GrasslandsTerrainMaterialRegionId = "mud-stones" | "sand" | "grass-mud";
export type GrasslandsRockModelId = "stone-1" | "stone-2" | "small-stone-1" | "small-stone-2" | "small-stone-3";

type GrasslandsEnvironmentTextureId =
  | "mud-stones-albedo-smoothness"
  | "mud-stones-normal"
  | "sand-albedo-smoothness"
  | "sand-normal"
  | "grass-mud-albedo-smoothness"
  | "grass-mud-normal"
  | "stone-1-2-albedo"
  | "stone-1-2-normal"
  | "small-stones-albedo"
  | "small-stones-normal";

interface GrasslandsEnvironmentTextureSpec {
  readonly id: GrasslandsEnvironmentTextureId;
  readonly url: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly colorSpace: "srgb" | "linear";
}

interface GrasslandsRockModelSpec {
  readonly id: GrasslandsRockModelId;
  readonly url: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly bounds: {
    readonly minimum: GrasslandsVector3;
    readonly maximum: GrasslandsVector3;
  };
}

export interface GrasslandsEnvironmentAssetMetrics {
  readonly ready: boolean;
  readonly destroyed: boolean;
  readonly assetSetHash: typeof GRASSLANDS_ENVIRONMENT_ASSET_SET_HASH;
  readonly terrainMaterialRegionCount: 3;
  readonly terrainMaterialRegionIds: readonly GrasslandsTerrainMaterialRegionId[];
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

export interface GrasslandsRockInstance {
  readonly entity: Entity;
  readonly modelId: GrasslandsRockModelId;
  readonly rendererCount: number;
  readonly modelEntityCount: number;
  releaseAfterEntityDestroy(): void;
}

interface GrasslandsLoadedRockModel {
  readonly spec: GrasslandsRockModelSpec;
  readonly resource: GLTFResource;
  readonly objectUrl: string;
  readonly meshCount: number;
  readonly templateEntityCount: number;
}

interface GrasslandsDecodedImage {
  readonly source: TexImageSource;
  readonly width: number;
  readonly height: number;
  release(): void;
}

const TEXTURE_SIZE = 1024;
const TERRAIN_REGION_IDS = Object.freeze([
  "mud-stones",
  "sand",
  "grass-mud"
] as const satisfies readonly GrasslandsTerrainMaterialRegionId[]);

const TEXTURE_SPECS = Object.freeze([
  {
    id: "mud-stones-albedo-smoothness",
    url: new URL("./assets/environment/terrain/mud-stones-albedo-smoothness-1024.png", import.meta.url).href,
    sha256: "ae5663d5cc515ab2f13d8334567b2d57b52584fb5827e23d3514a439af176e2f",
    byteLength: 1_230_190,
    colorSpace: "srgb"
  },
  {
    id: "mud-stones-normal",
    url: new URL("./assets/environment/terrain/mud-stones-normal-1024.png", import.meta.url).href,
    sha256: "a979ed85f250de9b59f9e45506fdddce485973bee34a54a9a96f7483b0bfd88a",
    byteLength: 864_867,
    colorSpace: "linear"
  },
  {
    id: "sand-albedo-smoothness",
    url: new URL("./assets/environment/terrain/sand-albedo-smoothness-1024.png", import.meta.url).href,
    sha256: "9273b3625197d4ee52d31e27adf5c61646d699a20b1da2b4a2db44b649363328",
    byteLength: 2_167_927,
    colorSpace: "srgb"
  },
  {
    id: "sand-normal",
    url: new URL("./assets/environment/terrain/sand-normal-1024.png", import.meta.url).href,
    sha256: "e68e08428fa5d5bc77c4f0be45bcc70ac176870fbff22b0ed8c7055d3dadc8c5",
    byteLength: 1_248_362,
    colorSpace: "linear"
  },
  {
    id: "grass-mud-albedo-smoothness",
    url: new URL("./assets/environment/terrain/grass-mud-albedo-smoothness-1024.png", import.meta.url).href,
    sha256: "567197d833fb99fd0cc21f908d729ca1b855eb950cffffe13ef181aac51e0375",
    byteLength: 1_262_572,
    colorSpace: "srgb"
  },
  {
    id: "grass-mud-normal",
    url: new URL("./assets/environment/terrain/grass-mud-normal-1024.png", import.meta.url).href,
    sha256: "501d4c533ff7eafdadf21842097ada44efe24c0c749c194997f9ef56c17491d4",
    byteLength: 1_007_483,
    colorSpace: "linear"
  },
  {
    id: "stone-1-2-albedo",
    url: new URL("./assets/environment/rocks/stone-1-2-albedo-1024.png", import.meta.url).href,
    sha256: "46d422cabf509ad4536ea9831704881d5653a7eef6704495b8b9c011e4314a5f",
    byteLength: 650_922,
    colorSpace: "srgb"
  },
  {
    id: "stone-1-2-normal",
    url: new URL("./assets/environment/rocks/stone-1-2-normal-1024.png", import.meta.url).href,
    sha256: "ab8d56ea6dae49fffb059aa5f7e239c838f186ad1764d18aa836e56399ccfa82",
    byteLength: 913_731,
    colorSpace: "linear"
  },
  {
    id: "small-stones-albedo",
    url: new URL("./assets/environment/rocks/small-stones-albedo-1024.png", import.meta.url).href,
    sha256: "73098d9d1cc0005d148d6f191216e8fe34d962fa207752e00dc197ba11d990b9",
    byteLength: 604_539,
    colorSpace: "srgb"
  },
  {
    id: "small-stones-normal",
    url: new URL("./assets/environment/rocks/small-stones-normal-1024.png", import.meta.url).href,
    sha256: "09b9fb8dafac135976192b86e7be4e09e570dbbee32ee0dc421dbdcc6804a906",
    byteLength: 1_086_364,
    colorSpace: "linear"
  }
] as const satisfies readonly GrasslandsEnvironmentTextureSpec[]);

const ROCK_MODEL_SPECS = Object.freeze([
  {
    id: "stone-1",
    url: new URL("./assets/environment/models/stone-1.glb", import.meta.url).href,
    sha256: "639b0edae5f8c07cd7669f49096ca4df4848206e5687eaf55f18a64475e21b36",
    byteLength: 11_968,
    vertexCount: 192,
    triangleCount: 252,
    bounds: {
      minimum: [-1.28130853176117, -0.147414058446884, -1.06346702575684],
      maximum: [1.2482236623764, 1.1863214969635, 1.0417959690094]
    }
  },
  {
    id: "stone-2",
    url: new URL("./assets/environment/models/stone-2.glb", import.meta.url).href,
    sha256: "9e856801e37e2ac6b093776a27193be916596a7e2e05c173531c6336695aa9ae",
    byteLength: 12_356,
    vertexCount: 196,
    triangleCount: 284,
    bounds: {
      minimum: [-1.23965513706207, -0.131109550595284, -1.0032331943512],
      maximum: [1.23315167427063, 0.977715611457825, 1.1462664604187]
    }
  },
  {
    id: "small-stone-1",
    url: new URL("./assets/environment/models/small-stone-1.glb", import.meta.url).href,
    sha256: "c95614242fee5fb8e6ca46f181b72a999fd9537944936a66a9186f888e814346",
    byteLength: 6_520,
    vertexCount: 91,
    triangleCount: 150,
    bounds: {
      minimum: [-0.219502449035645, -0.19648551940918, -0.239813566207886],
      maximum: [0.200043201446533, 0.423587411642075, 0.216506436467171]
    }
  },
  {
    id: "small-stone-2",
    url: new URL("./assets/environment/models/small-stone-2.glb", import.meta.url).href,
    sha256: "4f6df26a153f038ca7cddd5465d1fd3e4651fc3151139374e4b26efe0a13d3b3",
    byteLength: 6_608,
    vertexCount: 93,
    triangleCount: 148,
    bounds: {
      minimum: [-0.337080717086792, -0.0822588875889778, -0.264825254678726],
      maximum: [0.359418094158173, 0.287805616855621, 0.245734646916389]
    }
  },
  {
    id: "small-stone-3",
    url: new URL("./assets/environment/models/small-stone-3.glb", import.meta.url).href,
    sha256: "3e4262ec3613b44b54e6c1c0522ecff2a1e7bf34e0601401a10941e486ae857e",
    byteLength: 7_148,
    vertexCount: 102,
    triangleCount: 166,
    bounds: {
      minimum: [-0.286103248596191, -0.168853282928467, -0.284043580293655],
      maximum: [0.26789665222168, 0.305978089570999, 0.278161972761154]
    }
  }
] as const satisfies readonly GrasslandsRockModelSpec[]);

const LARGE_ROCK_IDS = Object.freeze(["stone-1", "stone-2"] as const);
const SMALL_ROCK_IDS = Object.freeze(["small-stone-1", "small-stone-2", "small-stone-3"] as const);

async function fetchVerifiedBytes(url: string, expectedHash: string, expectedByteLength: number): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    cache: "no-cache",
    credentials: "same-origin"
  });
  if (!response.ok) throw new Error(`Grasslands environment asset request failed: ${response.status} ${url}.`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error(
      `Grasslands environment asset byte length mismatch for ${url}: expected ${expectedByteLength}, received ${bytes.byteLength}.`
    );
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const actualHash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  if (actualHash !== expectedHash) {
    throw new Error(
      `Grasslands environment asset SHA-256 mismatch for ${url}: expected ${expectedHash}, received ${actualHash}.`
    );
  }
  return bytes;
}

async function decodePng(bytes: ArrayBuffer, sourceUrl: string): Promise<GrasslandsDecodedImage> {
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Grasslands environment PNG failed to decode: ${sourceUrl}.`));
      image.src = objectUrl;
    });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  let released = false;
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release(): void {
      if (released) return;
      released = true;
      URL.revokeObjectURL(objectUrl);
    }
  };
}

async function loadTexture(engine: Engine, spec: GrasslandsEnvironmentTextureSpec): Promise<Texture2D> {
  const bytes = await fetchVerifiedBytes(spec.url, spec.sha256, spec.byteLength);
  const decoded = await decodePng(bytes, spec.url);
  let texture: Texture2D | undefined;
  try {
    if (decoded.width !== TEXTURE_SIZE || decoded.height !== TEXTURE_SIZE) {
      throw new Error(
        `Grasslands environment texture dimensions mismatch for ${spec.id}: expected ${TEXTURE_SIZE}x${TEXTURE_SIZE}, received ${decoded.width}x${decoded.height}.`
      );
    }
    texture = new Texture2D(
      engine,
      decoded.width,
      decoded.height,
      TextureFormat.R8G8B8A8,
      true,
      spec.colorSpace === "srgb"
    );
    texture.name = `GrasslandsEnvironment:${spec.id}`;
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = TextureWrapMode.Repeat;
    texture.wrapModeV = TextureWrapMode.Repeat;
    texture.anisoLevel = 4;
    texture.isGCIgnored = true;
    texture.setImageSource(decoded.source);
    texture.generateMipmaps();
    return texture;
  } catch (error) {
    texture?.destroy(true);
    throw error;
  } finally {
    decoded.release();
  }
}

async function loadRockModel(engine: Engine, spec: GrasslandsRockModelSpec): Promise<GrasslandsLoadedRockModel> {
  const bytes = await fetchVerifiedBytes(spec.url, spec.sha256, spec.byteLength);
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }));
  let resource: GLTFResource;
  try {
    resource = await engine.resourceManager.load<GLTFResource>({
      type: AssetType.GLTF,
      url: objectUrl
    });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  const meshes = resource.meshes?.flat().filter((mesh) => mesh !== undefined) ?? [];
  const templateRoots = Array.from(new Set(resource.sceneRoots ?? []));
  if (
    meshes.length !== 1 ||
    (resource.materials?.length ?? 0) !== 0 ||
    (resource.textures?.length ?? 0) !== 0 ||
    templateRoots.length !== 1
  ) {
    destroyLoadedRockModels([{ spec, resource, objectUrl, meshCount: meshes.length, templateEntityCount: 0 }]);
    throw new Error(`Grasslands rock model ${spec.id} must be one-mesh geometry-only glTF.`);
  }
  const mesh = meshes[0];
  const minimum = mesh.bounds.min;
  const maximum = mesh.bounds.max;
  const epsilon = 1e-5;
  if (
    [minimum.x, minimum.y, minimum.z].some((value, axis) => Math.abs(value - spec.bounds.minimum[axis]) > epsilon) ||
    [maximum.x, maximum.y, maximum.z].some((value, axis) => Math.abs(value - spec.bounds.maximum[axis]) > epsilon)
  ) {
    destroyLoadedRockModels([{ spec, resource, objectUrl, meshCount: 1, templateEntityCount: 0 }]);
    throw new Error(`Grasslands rock model ${spec.id} bounds do not match the audited conversion receipt.`);
  }
  return {
    spec,
    resource,
    objectUrl,
    meshCount: 1,
    templateEntityCount: templateRoots.reduce((count, root) => count + countEntityTree(root), 0)
  };
}

function countEntityTree(root: Entity): number {
  return 1 + root.children.reduce((count, child) => count + countEntityTree(child), 0);
}

function destroyLoadedRockModels(models: readonly GrasslandsLoadedRockModel[]): {
  readonly resourceCount: number;
  readonly meshCount: number;
  readonly templateEntityCount: number;
} {
  const resources = Array.from(new Set(models.map(({ resource }) => resource)));
  const meshes = Array.from(new Set(resources.flatMap((resource) => resource.meshes?.flat() ?? [])));
  const materials = Array.from(new Set(resources.flatMap((resource) => resource.materials ?? [])));
  const textures = Array.from(new Set(resources.flatMap((resource) => resource.textures ?? [])));
  const templateRoots = Array.from(new Set(resources.flatMap((resource) => resource.sceneRoots ?? [])));
  const objectUrls = Array.from(new Set(models.map(({ objectUrl }) => objectUrl)));
  const templateEntityCount = templateRoots.reduce((count, root) => count + countEntityTree(root), 0);
  for (const root of templateRoots) root.destroy();
  for (const resource of resources) resource.destroy(true);
  for (const material of materials) material.destroy(true);
  for (const mesh of meshes) mesh.destroy(true);
  for (const texture of textures) texture.destroy(true);
  for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);
  return {
    resourceCount: resources.length,
    meshCount: meshes.length,
    templateEntityCount
  };
}

function createPbrMaterial(
  engine: Engine,
  name: string,
  baseTexture: Texture2D,
  normalTexture: Texture2D,
  roughness: number,
  normalIntensity: number,
  tiling: number
): PBRMaterial {
  const material = new PBRMaterial(engine);
  try {
    material.name = name;
    material.baseColor = new Color(1, 1, 1, 1);
    material.baseTexture = baseTexture;
    material.normalTexture = normalTexture;
    material.metallic = 0;
    material.roughness = roughness;
    material.normalTextureIntensity = normalIntensity;
    material.tilingOffset = new Vector4(tiling, tiling, 0, 0);
    material.isGCIgnored = true;
    return material;
  } catch (error) {
    material.destroy(true);
    throw error;
  }
}

export class GrasslandsEnvironmentAssets {
  readonly mudStonesMaterial: PBRMaterial;
  readonly sandMaterial: PBRMaterial;
  readonly grassMudMaterial: PBRMaterial;
  readonly largeRockMaterial: PBRMaterial;
  readonly smallRockMaterial: PBRMaterial;

  private readonly _textures: ReadonlyMap<GrasslandsEnvironmentTextureId, Texture2D>;
  private readonly _models: ReadonlyMap<GrasslandsRockModelId, GrasslandsLoadedRockModel>;
  private readonly _materials: readonly PBRMaterial[];
  private readonly _sourceByteLength: number;
  private readonly _meshCreateCount: number;
  private readonly _templateEntityCreateCount: number;
  private _activeRockInstanceCount = 0;
  private _rockInstanceCreateCount = 0;
  private _rockInstanceDestroyCount = 0;
  private _textureDestroyCount = 0;
  private _materialDestroyCount = 0;
  private _gltfResourceDestroyCount = 0;
  private _meshDestroyCount = 0;
  private _templateEntityDestroyCount = 0;
  private _destroyed = false;

  private constructor(
    private readonly _engine: Engine,
    textures: ReadonlyMap<GrasslandsEnvironmentTextureId, Texture2D>,
    models: ReadonlyMap<GrasslandsRockModelId, GrasslandsLoadedRockModel>
  ) {
    this._textures = textures;
    this._models = models;
    this._sourceByteLength =
      TEXTURE_SPECS.reduce((total, { byteLength }) => total + byteLength, 0) +
      ROCK_MODEL_SPECS.reduce((total, { byteLength }) => total + byteLength, 0);
    this._meshCreateCount = Array.from(models.values(), ({ meshCount }) => meshCount).reduce(
      (total, count) => total + count,
      0
    );
    this._templateEntityCreateCount = Array.from(
      models.values(),
      ({ templateEntityCount }) => templateEntityCount
    ).reduce((total, count) => total + count, 0);
    const requireTexture = (id: GrasslandsEnvironmentTextureId): Texture2D => {
      const texture = textures.get(id);
      if (!texture) throw new Error(`Grasslands environment texture ${id} was not loaded.`);
      return texture;
    };
    const createdMaterials: PBRMaterial[] = [];
    const createOwnedMaterial = (
      name: string,
      baseTextureId: GrasslandsEnvironmentTextureId,
      normalTextureId: GrasslandsEnvironmentTextureId,
      roughness: number,
      normalIntensity: number
    ): PBRMaterial => {
      const material = createPbrMaterial(
        _engine,
        name,
        requireTexture(baseTextureId),
        requireTexture(normalTextureId),
        roughness,
        normalIntensity,
        1
      );
      createdMaterials.push(material);
      return material;
    };
    try {
      this.mudStonesMaterial = createOwnedMaterial(
        "GrasslandsMudStonesMaterial",
        "mud-stones-albedo-smoothness",
        "mud-stones-normal",
        0.82,
        0.7
      );
      this.sandMaterial = createOwnedMaterial(
        "GrasslandsSandMaterial",
        "sand-albedo-smoothness",
        "sand-normal",
        0.72,
        0.55
      );
      this.grassMudMaterial = createOwnedMaterial(
        "GrasslandsGrassMudMaterial",
        "grass-mud-albedo-smoothness",
        "grass-mud-normal",
        0.88,
        0.65
      );
      this.largeRockMaterial = createOwnedMaterial(
        "GrasslandsLargeRockMaterial",
        "stone-1-2-albedo",
        "stone-1-2-normal",
        0.76,
        0.82
      );
      this.smallRockMaterial = createOwnedMaterial(
        "GrasslandsSmallRockMaterial",
        "small-stones-albedo",
        "small-stones-normal",
        0.78,
        0.78
      );
      this._materials = Object.freeze(createdMaterials);
    } catch (error) {
      for (const material of createdMaterials.reverse()) material.destroy(true);
      throw error;
    }
  }

  static async load(engine: Engine): Promise<GrasslandsEnvironmentAssets> {
    const textures = new Map<GrasslandsEnvironmentTextureId, Texture2D>();
    const models = new Map<GrasslandsRockModelId, GrasslandsLoadedRockModel>();
    const operations = [
      ...TEXTURE_SPECS.map(async (spec) => {
        const texture = await loadTexture(engine, spec);
        textures.set(spec.id, texture);
      }),
      ...ROCK_MODEL_SPECS.map(async (spec) => {
        const model = await loadRockModel(engine, spec);
        models.set(spec.id, model);
      })
    ];
    const results = await Promise.allSettled(operations);
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) {
      for (const texture of textures.values()) texture.destroy(true);
      destroyLoadedRockModels(Array.from(models.values()));
      throw failure.reason;
    }
    try {
      return new GrasslandsEnvironmentAssets(engine, textures, models);
    } catch (error) {
      for (const texture of textures.values()) texture.destroy(true);
      destroyLoadedRockModels(Array.from(models.values()));
      throw error;
    }
  }

  get metrics(): Readonly<GrasslandsEnvironmentAssetMetrics> {
    return Object.freeze({
      ready: !this._destroyed,
      destroyed: this._destroyed,
      assetSetHash: GRASSLANDS_ENVIRONMENT_ASSET_SET_HASH,
      terrainMaterialRegionCount: 3,
      terrainMaterialRegionIds: TERRAIN_REGION_IDS,
      rockModelResourceCount: this._destroyed ? 0 : this._models.size,
      largeRockVariantCount: 2,
      smallRockVariantCount: 3,
      sharedRockMeshCount: this._destroyed ? 0 : this._meshCreateCount,
      proxyRockMeshCount: 0,
      activeRockInstanceCount: this._destroyed ? 0 : this._activeRockInstanceCount,
      rockInstanceCreateCount: this._rockInstanceCreateCount,
      rockInstanceDestroyCount: this._rockInstanceDestroyCount,
      textureCreateCount: this._textures.size,
      textureDestroyCount: this._textureDestroyCount,
      materialCreateCount: this._materials.length,
      materialDestroyCount: this._materialDestroyCount,
      gltfResourceCreateCount: this._models.size,
      gltfResourceDestroyCount: this._gltfResourceDestroyCount,
      meshCreateCount: this._meshCreateCount,
      meshDestroyCount: this._meshDestroyCount,
      templateEntityCreateCount: this._templateEntityCreateCount,
      templateEntityDestroyCount: this._templateEntityDestroyCount,
      sourceByteLength: this._sourceByteLength
    });
  }

  instantiateLargeRock(
    parent: Entity,
    name: string,
    variantIndex: number,
    position: GrasslandsVector3,
    halfExtents: GrasslandsVector3
  ): GrasslandsRockInstance {
    return this._instantiateRock(
      parent,
      name,
      LARGE_ROCK_IDS[variantIndex % LARGE_ROCK_IDS.length],
      this.largeRockMaterial,
      position,
      halfExtents
    );
  }

  instantiateSmallRock(
    parent: Entity,
    name: string,
    variantIndex: number,
    position: GrasslandsVector3,
    halfExtents: GrasslandsVector3
  ): GrasslandsRockInstance {
    return this._instantiateRock(
      parent,
      name,
      SMALL_ROCK_IDS[variantIndex % SMALL_ROCK_IDS.length],
      this.smallRockMaterial,
      position,
      halfExtents
    );
  }

  destroyAfterSceneDetach(): void {
    if (this._destroyed) return;
    if (this._activeRockInstanceCount !== 0) {
      throw new Error(
        `Grasslands environment assets still have ${this._activeRockInstanceCount} live rock instances; destroy the SceneController first.`
      );
    }
    this._destroyed = true;
    const destroyedModels = destroyLoadedRockModels(Array.from(this._models.values()));
    this._gltfResourceDestroyCount = destroyedModels.resourceCount;
    this._meshDestroyCount = destroyedModels.meshCount;
    this._templateEntityDestroyCount = destroyedModels.templateEntityCount;
    for (const material of this._materials) material.destroy(true);
    this._materialDestroyCount = this._materials.length;
    for (const texture of this._textures.values()) texture.destroy(true);
    this._textureDestroyCount = this._textures.size;
  }

  private _instantiateRock(
    parent: Entity,
    name: string,
    modelId: GrasslandsRockModelId,
    material: PBRMaterial,
    position: GrasslandsVector3,
    halfExtents: GrasslandsVector3
  ): GrasslandsRockInstance {
    if (this._destroyed) throw new Error("Grasslands environment assets are destroyed.");
    const model = this._models.get(modelId);
    if (!model) throw new Error(`Grasslands rock model ${modelId} is unavailable.`);
    const outer = parent.createChild(name);
    try {
      outer.transform.setPosition(...position);
      const instance = model.resource.instantiateSceneRoot();
      instance.name = `${name}:${modelId}`;
      outer.addChild(instance);
      const minimum = model.spec.bounds.minimum;
      const maximum = model.spec.bounds.maximum;
      const sourceCenter = minimum.map((value, axis) => (value + maximum[axis]) * 0.5) as [number, number, number];
      const sourceHalfExtents = minimum.map((value, axis) => (maximum[axis] - value) * 0.5) as [number, number, number];
      const scale = halfExtents.map((value, axis) => value / sourceHalfExtents[axis]) as [number, number, number];
      instance.transform.setScale(...scale);
      instance.transform.setPosition(
        -sourceCenter[0] * scale[0],
        -sourceCenter[1] * scale[1],
        -sourceCenter[2] * scale[2]
      );
      const renderers: MeshRenderer[] = [];
      instance.getComponentsIncludeChildren(MeshRenderer, renderers);
      if (renderers.length !== 1) {
        throw new Error(`Grasslands rock model ${modelId} must instantiate exactly one MeshRenderer.`);
      }
      for (const renderer of renderers) {
        renderer.setMaterial(material);
        renderer.enableVertexColor = false;
        renderer.castShadows = true;
        renderer.receiveShadows = true;
      }
      const modelEntityCount = countEntityTree(instance);
      this._activeRockInstanceCount++;
      this._rockInstanceCreateCount++;
      let released = false;
      return Object.freeze({
        entity: outer,
        modelId,
        rendererCount: renderers.length,
        modelEntityCount,
        releaseAfterEntityDestroy: (): void => {
          if (released) return;
          released = true;
          this._activeRockInstanceCount--;
          this._rockInstanceDestroyCount++;
        }
      });
    } catch (error) {
      outer.destroy();
      throw error;
    }
  }
}
