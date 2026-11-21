import {
  AmbientLight,
  AssetPromise,
  AssetType,
  BackgroundMode,
  DiffuseMode,
  EngineObject,
  Loader,
  LoadItem,
  Logger,
  Material,
  Mesh,
  resourceLoader,
  ResourceManager,
  Scene,
  Texture2D
} from "@galacean/engine-core";
import { resolveRefItem } from "./schema/refs";
import type { RefItem } from "./schema/CommonSchema";
import type { SceneFile } from "./schema/SceneSchema";
import { ParserContext, ParserType, SceneParser } from "./resource-deserialize";

/**
 * Apply scene-level data (ambient, background, shadow, fog, AO) to a Scene.
 * @internal
 */
export async function applySceneData(
  scene: Scene,
  sceneData: SceneFile["scene"],
  resourceManager: ResourceManager,
  refs: RefItem[]
): Promise<void> {
  const ambient = sceneData.ambient;
  if (ambient) {
    const light = scene.ambientLight;
    light.diffuseIntensity = ambient.diffuseIntensity;
    light.specularIntensity = ambient.specularIntensity;
    light.diffuseMode = ambient.diffuseMode;
    const solidColor = ambient.diffuseSolidColor;
    if (solidColor) {
      light.diffuseSolidColor.set(solidColor[0], solidColor[1], solidColor[2], solidColor[3]);
    }
  }

  const background = sceneData.background;
  const targetBackground = scene.background;
  targetBackground.mode = background.mode;
  if (background.mode === BackgroundMode.SolidColor) {
    const color = background.color;
    targetBackground.solidColor.set(color[0], color[1], color[2], color[3]);
  } else if (background.mode === BackgroundMode.Texture && background.texture != null) {
    targetBackground.textureFillMode = background.textureFillMode ?? targetBackground.textureFillMode;
  }

  // parse shadow
  const shadow = sceneData.shadow;
  if (shadow) {
    if (shadow.castShadows != undefined) scene.castShadows = shadow.castShadows;
    if (shadow.shadowResolution != undefined) scene.shadowResolution = shadow.shadowResolution;
    if (shadow.shadowDistance != undefined) scene.shadowDistance = shadow.shadowDistance;
    if (shadow.shadowCascades != undefined) scene.shadowCascades = shadow.shadowCascades;
    if (shadow.enableTransparentShadow != undefined) scene.enableTransparentShadow = shadow.enableTransparentShadow;
    if (shadow.shadowTwoCascadeSplits != undefined) scene.shadowTwoCascadeSplits = shadow.shadowTwoCascadeSplits;
    if (shadow.shadowFourCascadeSplits) {
      const splits = shadow.shadowFourCascadeSplits;
      scene.shadowFourCascadeSplits.set(splits[0], splits[1], splits[2]);
    }
    if (shadow.shadowFadeBorder != undefined) scene.shadowFadeBorder = shadow.shadowFadeBorder;
  }

  // parse fog
  const fog = sceneData.fog;
  if (fog) {
    if (fog.fogMode != undefined) scene.fogMode = fog.fogMode;
    if (fog.fogStart != undefined) scene.fogStart = fog.fogStart;
    if (fog.fogEnd != undefined) scene.fogEnd = fog.fogEnd;
    if (fog.fogDensity != undefined) scene.fogDensity = fog.fogDensity;
    if (fog.fogColor) scene.fogColor.set(fog.fogColor[0], fog.fogColor[1], fog.fogColor[2], fog.fogColor[3]);
  }

  // Post Process
  if (sceneData.postProcess) {
    Logger.warn("Post Process is not supported in scene yet, please add PostProcess component in entity instead.");
  }

  // Ambient Occlusion
  const ambientOcclusion = sceneData.ambientOcclusion;
  if (ambientOcclusion) {
    const sceneAO = scene.ambientOcclusion;
    if (ambientOcclusion.enabledAmbientOcclusion != undefined)
      sceneAO.enabled = ambientOcclusion.enabledAmbientOcclusion;
    if (ambientOcclusion.quality != undefined) sceneAO.quality = ambientOcclusion.quality;
    if (ambientOcclusion.intensity != undefined) sceneAO.intensity = ambientOcclusion.intensity;
    if (ambientOcclusion.radius != undefined) sceneAO.radius = ambientOcclusion.radius;
    if (ambientOcclusion.bias != undefined) sceneAO.bias = ambientOcclusion.bias;
    if (ambientOcclusion.power != undefined) sceneAO.power = ambientOcclusion.power;
    if (ambientOcclusion.bilateralThreshold != undefined)
      sceneAO.bilateralThreshold = ambientOcclusion.bilateralThreshold;
    if (ambientOcclusion.minHorizonAngle != undefined) sceneAO.minHorizonAngle = ambientOcclusion.minHorizonAngle;
  }

  const promises: Promise<unknown>[] = [];
  const applyRef = <T extends EngineObject>(
    index: number,
    label: string,
    apply: (resource: T | null) => void
  ): void => {
    const ref = resolveRefItem(refs, index, "SceneLoader", label);
    promises.push(
      resourceManager.getResourceByRef<T>(ref).then((resource) => {
        if (!scene.destroyed && !scene.pendingDestroy) apply(resource);
      })
    );
  };
  try {
    if (ambient?.ambientLight != null) {
      applyRef<AmbientLight>(ambient.ambientLight, "scene.ambient.ambientLight", (resource) => {
        if (!resource) return;
        const light = scene.ambientLight;
        light.specularTexture = resource.specularTexture;
        if (ambient.diffuseMode === DiffuseMode.SphericalHarmonics) {
          light.diffuseSphericalHarmonics = resource.diffuseSphericalHarmonics;
        }
      });
    }
    if (background.mode === BackgroundMode.Sky) {
      if (background.skyMesh != null && background.skyMaterial != null) {
        const sky = targetBackground.sky;
        applyRef<Mesh>(background.skyMesh, "scene.background.skyMesh", (mesh) => (sky.mesh = mesh));
        applyRef<Material>(
          background.skyMaterial,
          "scene.background.skyMaterial",
          (material) => (sky.material = material)
        );
      } else {
        Logger.warn("Sky background mode requires skyMesh and skyMaterial");
      }
    } else if (background.mode === BackgroundMode.Texture && background.texture != null) {
      applyRef<Texture2D>(
        background.texture,
        "scene.background.texture",
        (texture) => (targetBackground.texture = texture)
      );
    }
  } catch (error) {
    promises.push(Promise.reject(error));
  }
  await Promise.all(promises);
}

@resourceLoader(AssetType.Scene, ["scene"], true)
class SceneLoader extends Loader<Scene> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Scene> {
    const { engine } = resourceManager;
    return new AssetPromise((resolve, reject, setTaskCompleteProgress) => {
      resourceManager
        ._request<SceneFile>(item.url!, { ...item, type: "json" })
        .then((data: SceneFile) => {
          const scene = new Scene(engine, data.scene.name ?? "");
          const context = new ParserContext(engine, ParserType.Scene, scene);
          context._setTaskCompleteProgress = setTaskCompleteProgress;
          return context
            ._load(async () => {
              const parser = new SceneParser(data, context);
              parser._collectDependentAssets();
              await parser.start();
              await applySceneData(scene, data.scene, resourceManager, data.refs);
            })
            .then(resolve);
        })
        .catch(reject);
    });
  }
}
