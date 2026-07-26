import {
  AssetType,
  Engine,
  Entity,
  GLTFResource,
  MeshRenderer,
  PBRMaterial
} from "@galacean/engine";

type Vector3Tuple = readonly [number, number, number];

export interface OceanCoastalRockAssetMetrics {
  readonly loaded: boolean;
  readonly instanceCount: number;
  readonly rendererCount: number;
  readonly pbrMaterialCount: number;
  readonly completePbrMaterialCount: number;
  readonly sourceBytes: number;
}

const ROCK_ASSET_URL = new URL(
  "./assets/rock-07/rock_07_1k.gltf",
  import.meta.url
).href;

/**
 * Fixed sum of the checked-in glTF, buffer, and three 1K JPEG dependencies.
 * Keeping this explicit makes the showcase asset budget reviewable.
 */
export const OCEAN_COASTAL_ROCK_SOURCE_BYTES = 2_184_088;

/**
 * Owns the one shared CC0 photogrammetry resource used by all hero rocks.
 * Instances share its mesh and complete glTF PBR texture set.
 */
export class OceanCoastalRockAsset {
  private _instanceCount = 0;
  private _rendererCount = 0;
  private _destroyed = false;

  private constructor(
    private readonly _resource: GLTFResource,
    private readonly _pbrMaterialCount: number,
    private readonly _completePbrMaterialCount: number
  ) {}

  static async load(
    engine: Engine
  ): Promise<OceanCoastalRockAsset> {
    const resource =
      await engine.resourceManager.load<GLTFResource>({
        type: AssetType.GLTF,
        url: ROCK_ASSET_URL
      });
    const textures = resource.textures ?? [];
    const armTexture =
      textures.find((texture) =>
        texture.name.toLowerCase().includes("arm")
      ) ?? textures[2];
    let pbrMaterialCount = 0;
    let completePbrMaterialCount = 0;
    for (const material of resource.materials ?? []) {
      if (!(material instanceof PBRMaterial)) continue;
      pbrMaterialCount++;
      if (armTexture) {
        // Poly Haven's ARM texture stores AO in R and the glTF loader already
        // consumes G/B for roughness/metallic.
        material.occlusionTexture = armTexture;
      }
      material.roughness = Math.max(material.roughness, 0.78);
      material.specularIntensity = 0.62;
      material.normalTextureIntensity = 0.65;
      material.occlusionTextureIntensity = 0.68;
      if (
        material.baseTexture &&
        material.normalTexture &&
        material.roughnessMetallicTexture &&
        material.occlusionTexture
      ) {
        completePbrMaterialCount++;
      }
    }
    if (
      pbrMaterialCount === 0 ||
      completePbrMaterialCount !== pbrMaterialCount
    ) {
      resource.destroy(true);
      throw new Error(
        "Ocean coastal rock asset does not provide a complete PBR material."
      );
    }
    return new OceanCoastalRockAsset(
      resource,
      pbrMaterialCount,
      completePbrMaterialCount
    );
  }

  get metrics(): Readonly<OceanCoastalRockAssetMetrics> {
    return Object.freeze({
      loaded: !this._destroyed,
      instanceCount: this._destroyed
        ? 0
        : this._instanceCount,
      rendererCount: this._destroyed
        ? 0
        : this._rendererCount,
      pbrMaterialCount: this._destroyed
        ? 0
        : this._pbrMaterialCount,
      completePbrMaterialCount: this._destroyed
        ? 0
        : this._completePbrMaterialCount,
      sourceBytes: this._destroyed
        ? 0
        : OCEAN_COASTAL_ROCK_SOURCE_BYTES
    });
  }

  instantiate(
    parent: Entity,
    name: string,
    position: Vector3Tuple,
    scale: Vector3Tuple,
    rotation: Vector3Tuple
  ): Entity {
    if (this._destroyed) {
      throw new Error(
        "Ocean coastal rock asset is already destroyed."
      );
    }
    const instance = this._resource.instantiateSceneRoot();
    instance.name = name;
    parent.addChild(instance);
    instance.transform.setPosition(...position);
    instance.transform.setScale(...scale);
    instance.transform.setRotation(...rotation);
    const renderers: MeshRenderer[] = [];
    instance.getComponentsIncludeChildren(
      MeshRenderer,
      renderers
    );
    for (const renderer of renderers) {
      // Rock 07 ships baked vertex tint values around 0.4. They are useful in
      // its neutral studio preview, but multiply the already-authored albedo
      // into a black silhouette in a back-lit dusk environment.
      renderer.enableVertexColor = false;
      renderer.castShadows = true;
      renderer.receiveShadows = true;
    }
    this._instanceCount++;
    this._rendererCount += renderers.length;
    return instance;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._resource.destroy(true);
  }
}
