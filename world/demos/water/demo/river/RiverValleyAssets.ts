import contactManifest from "../../assets/contact-effects/scene.json";
import {
  AssetType,
  BackgroundMode,
  Color,
  type Engine,
  type GLTFResource,
  PBRMaterial,
  PrimitiveMesh,
  RealtimeIBLBaker,
  RenderFace,
  Scene,
  Script,
  Shader,
  SkyBoxMaterial,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine";
import { RIVER_VALLEY_MANIFEST, createRiverValleyTerrain } from "./RiverValleyScene.ts";
import type { WaterTerrainSnapshot } from "@galacean/engine-water/water/index";
import groundSource from "./RiverValleyGround.shader?raw";
import { destroyWaterOwnedMesh, destroyWaterOwnedMeshSet } from "@galacean/engine-water/water/runtime/resources/index";

const urls = import.meta.glob("../../assets/valley/*", { eager: true, as: "url" }) as Record<string, string>;
const assetUrl = (name: string) => urls[`../../assets/valley/${name}`];
async function bytes(name: string) {
  const spec = RIVER_VALLEY_MANIFEST.files.find((file) => file.path === name);
  if (!spec || !assetUrl(name)) throw new Error(`缺少河谷资源：${name}`);
  const response = await fetch(assetUrl(name));
  if (!response.ok) throw new Error(`河谷资源加载失败：${name} (${response.status})`);
  const data = await response.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (v) =>
    v.toString(16).padStart(2, "0")
  ).join("");
  if (data.byteLength !== spec.bytes || hash !== spec.sha256) throw new Error(`河谷资源校验失败：${name}`);
  return data;
}
/** Owns one reusable imported asset set and a privately prepared sky IBL. Scene instances borrow it. */
export class RiverValleyAssets {
  terrain!: WaterTerrainSnapshot;
  scenery!: GLTFResource;
  groundMaterial!: PBRMaterial;
  groundCutMaterial!: PBRMaterial;
  skyMaterial!: SkyBoxMaterial;
  lightingScene!: Scene;
  skyMesh!: ReturnType<typeof PrimitiveMesh.createCuboid>;
  private readonly textures: Texture2D[] = [];
  private readonly objectUrls: string[] = [];
  private sky?: TextureCube;
  private baker?: RealtimeIBLBaker;
  private driver?: Script;
  private destroyed = false;
  activeInstances = 0;
  readonly contactEffectTextures = new Map<string, Texture2D>();
  private constructor(private readonly engine: Engine) {}
  static async load(engine: Engine): Promise<RiverValleyAssets> {
    const assets = new RiverValleyAssets(engine);
    const textureMap = new Map<string, Texture2D>();
    const textureFiles = [
      ...new Set(
        RIVER_VALLEY_MANIFEST.terrain.layers.flatMap((l) => [l.diffuse, l.normal]).filter((v): v is string => !!v)
      ),
      "terrain-weights.png"
    ];
    const effectUrls = import.meta.glob("../../assets/contact-effects/*.png", { eager: true, as: "url" }) as Record<
      string,
      string
    >;
    const settled = await Promise.allSettled([
      ...contactManifest.files.map(async (file) => {
        const response = await fetch(effectUrls[`../../assets/contact-effects/${file.path}`]);
        if (!response.ok) throw new Error(`水特效素材加载失败：${file.path}`);
        const data = await response.arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (v) =>
          v.toString(16).padStart(2, "0")
        ).join("");
        if (hash !== file.sha256) throw new Error(`水特效素材校验失败：${file.path}`);
        const url = URL.createObjectURL(new Blob([data], { type: "image/png" }));
        assets.objectUrls.push(url);
        const texture = await engine.resourceManager.load<Texture2D>({
          url,
          type: AssetType.Texture,
          params: { isSRGBColorSpace: true }
        });
        texture.isGCIgnored = true;
        texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
        assets.textures.push(texture);
        assets.contactEffectTextures.set(file.path, texture);
      }),
      bytes("terrain.f32").then((data) => {
        assets.terrain = createRiverValleyTerrain(new Float32Array(data));
      }),
      (async () => {
        const url = URL.createObjectURL(new Blob([await bytes("scenery.glb")]));
        assets.objectUrls.push(url);
        assets.scenery = await engine.resourceManager.load<GLTFResource>({ url, type: AssetType.GLTF });
        for (const resource of [
          ...(assets.scenery.meshes?.flat() ?? []),
          ...(assets.scenery.materials ?? []),
          ...(assets.scenery.textures ?? [])
        ])
          resource.isGCIgnored = true;
        for (const material of assets.scenery.materials ?? []) {
          if (material instanceof PBRMaterial) {
            material.metallic = 0;
            if (material.name.includes("Branch") || material.name.includes("Shrub") || material.name.includes("Baby")) {
              material.renderFace = RenderFace.Double;
              material.alphaCutoff = 0.5;
            }
          }
        }
      })(),
      ...textureFiles.map(async (name) => {
        const url = URL.createObjectURL(new Blob([await bytes(name)], { type: "image/png" }));
        assets.objectUrls.push(url);
        const color = RIVER_VALLEY_MANIFEST.terrain.layers.some((l) => l.diffuse === name);
        const texture = await engine.resourceManager.load<Texture2D>({
          url,
          type: AssetType.Texture,
          params: { isSRGBColorSpace: color }
        });
        texture.isGCIgnored = true;
        texture.wrapModeU = texture.wrapModeV =
          name === "terrain-weights.png" ? TextureWrapMode.Clamp : TextureWrapMode.Repeat;
        texture.filterMode = TextureFilterMode.Trilinear;
        assets.textures.push(texture);
        textureMap.set(name, texture);
      }),
      bytes("sky.rgba16f").then((data) => {
        const size = RIVER_VALLEY_MANIFEST.skySize;
        const source = new Uint16Array(data);
        const cube = (assets.sky = new TextureCube(engine, size, TextureFormat.R16G16B16A16, true, false));
        cube.isGCIgnored = true;
        // Reflect the Unity cubemap across Z. X/Z faces flip horizontally; Y faces flip vertically.
        for (let face = 0; face < 6; face++) {
          const srcFace = face === 4 ? 5 : face === 5 ? 4 : face;
          const pixels = new Uint16Array(size * size * 4);
          for (let y = 0; y < size; y++)
            for (let x = 0; x < size; x++) {
              const sx = face === 2 || face === 3 ? x : size - 1 - x;
              const sy = face === 2 || face === 3 ? size - 1 - y : y;
              const index = ((srcFace * size + sy) * size + sx) * 4;
              pixels.set(source.subarray(index, index + 4), (y * size + x) * 4);
            }
          cube.setPixelBuffer(face as TextureCubeFace, pixels);
        }
        cube.generateMipmaps();
      })
    ]);
    try {
      const failed = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
      if (failed) throw failed.reason;
      const ground = (assets.groundMaterial = new PBRMaterial(engine));
      ground.shader = Shader.find("Demo/RiverValleyGround") ?? Shader.create(groundSource);
      ground.isGCIgnored = true;
      ground.roughness = 1;
      const cut = (assets.groundCutMaterial = new PBRMaterial(engine));
      cut.baseColor = new Color(0.22, 0.27, 0.25, 1);
      cut.metallic = 0;
      cut.roughness = 1;
      cut.isGCIgnored = true;
      ground.shaderData.setTexture("material_ValleyWeights", textureMap.get("terrain-weights.png")!);
      RIVER_VALLEY_MANIFEST.terrain.layers.forEach((layer, i) => {
        ground.shaderData.setTexture(`material_ValleyLayer${i}`, textureMap.get(layer.diffuse!)!);
        if (layer.normal) ground.shaderData.setTexture(`material_ValleyNormal${i}`, textureMap.get(layer.normal)!);
      });
      const lighting = (assets.lightingScene = new Scene(engine));
      lighting.name = "River Valley environment preparation";
      engine.sceneManager.addScene(lighting);
      lighting.isActive = false;
      const skyMaterial = (assets.skyMaterial = new SkyBoxMaterial(engine));
      skyMaterial.texture = assets.sky!;
      skyMaterial.isGCIgnored = true;
      assets.skyMesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
      assets.skyMesh.isGCIgnored = true;
      lighting.background.mode = BackgroundMode.Sky;
      lighting.background.sky.material = skyMaterial;
      lighting.background.sky.mesh = assets.skyMesh;
      const baker = (assets.baker = new RealtimeIBLBaker(lighting, { resolution: 128, sampleCount: 64 }));
      class PrepareEnvironment extends Script {
        override onUpdate() {
          baker.update();
        }
      }
      assets.driver = engine.sceneManager.activeScene!
        .createRootEntity("River Valley IBL preparation")
        .addComponent(PrepareEnvironment);
      baker.requestBake();
      await baker.waitForFirstBake();
      assets.driver.enabled = false;
      return assets;
    } catch (error) {
      assets.destroy();
      throw error;
    }
  }
  get metrics() {
    return {
      assetSetHash: RIVER_VALLEY_MANIFEST.contentHash,
      terrainCellCount: RIVER_VALLEY_MANIFEST.terrain.cellIndices.length,
      grassCount: RIVER_VALLEY_MANIFEST.terrain.detailCount,
      ready: !!this.groundMaterial && !this.destroyed,
      activeInstances: this.activeInstances,
      meshCount: this.scenery?.meshes?.flat().length ?? 0,
      textureCount: this.textures.length + (this.scenery?.textures?.length ?? 0) + 1,
      ibl: this.baker?.getSnapshot()
    };
  }
  destroy() {
    if (this.destroyed) return;
    if (this.activeInstances) throw new Error("Destroy River Valley scene instances before their shared assets.");
    this.destroyed = true;
    this.driver?.entity.destroy();
    this.baker?.destroy();
    this.lightingScene?.destroy();
    if (this.scenery) {
      for (const root of this.scenery.sceneRoots ?? []) root.destroy();
      const meshes = new Set(this.scenery.meshes?.flat() ?? []);
      const materials = new Set(this.scenery.materials ?? []);
      const textures = new Set(this.scenery.textures ?? []);
      this.scenery.destroy(true);
      materials.forEach((m) => m.destroy(true));
      destroyWaterOwnedMeshSet(meshes);
      textures.forEach((t) => t.destroy(true));
    }
    this.groundMaterial?.destroy(true);
    this.groundCutMaterial?.destroy(true);
    this.skyMaterial?.destroy(true);
    destroyWaterOwnedMesh(this.skyMesh);
    this.sky?.destroy(true);
    this.textures.forEach((t) => t.destroy(true));
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.contactEffectTextures.clear();
  }
}
