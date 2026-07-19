import {
  AssetPromise,
  AssetType,
  BackgroundMode,
  DiffuseMode,
  Loader,
  LoadItem,
  Logger,
  Mesh,
  resourceLoader,
  ResourceManager,
  Scene
} from "@galacean/engine-core";
import { resolveRefItem } from "./schema/refs";
import type { RefItem } from "./schema/CommonSchema";
import { SpecularMode, type SceneFile } from "./schema/SceneSchema";
import { ParserContext, ParserType, SceneParser } from "./resource-deserialize";

function loadRef<T>(refs: RefItem[], index: number, resourceManager: ResourceManager, label: string): Promise<T> {
  const ref = resolveRefItem(refs, index, "SceneLoader", label);
  // @ts-ignore
  return resourceManager.getResourceByRef<T>(ref);
}

/**
 * Apply scene-level data (ambient, background, shadow, fog, AO) to a Scene.
 * @internal
 */
export function applySceneData(
  scene: Scene,
  sceneData: SceneFile["scene"],
  resourceManager: ResourceManager,
  refs: RefItem[]
): Promise<void> {
  const promises: Promise<unknown>[] = [];

  try {
    // parse ambient light
    const ambient = sceneData.ambient;
    if (ambient) {
      const useCustomAmbient = ambient.specularMode === SpecularMode.Custom;
      const useSH = ambient.diffuseMode === DiffuseMode.SphericalHarmonics;

      scene.ambientLight.diffuseIntensity = ambient.diffuseIntensity;
      scene.ambientLight.specularIntensity = ambient.specularIntensity;
      scene.ambientLight.diffuseMode = ambient.diffuseMode;
      const solidColor = ambient.diffuseSolidColor;
      if (solidColor) {
        scene.ambientLight.diffuseSolidColor.set(solidColor[0], solidColor[1], solidColor[2], solidColor[3]);
      }

      if (useCustomAmbient && ambient.customAmbientLight != null) {
        promises.push(
          loadRef<any>(refs, ambient.customAmbientLight, resourceManager, "scene.ambient.customAmbientLight").then(
            (ambientLight) => {
              scene.ambientLight.specularTexture = ambientLight?.specularTexture;
            }
          )
        );
      }

      if (ambient.ambientLight != null && (!useCustomAmbient || useSH)) {
        promises.push(
          loadRef<any>(refs, ambient.ambientLight, resourceManager, "scene.ambient.ambientLight").then(
            (ambientLight) => {
              if (!useCustomAmbient) {
                scene.ambientLight.specularTexture = ambientLight?.specularTexture;
              }

              if (useSH) {
                scene.ambientLight.diffuseSphericalHarmonics = ambientLight?.diffuseSphericalHarmonics;
              }
            }
          )
        );
      }
    }

    // parse background
    const background = sceneData.background;
    scene.background.mode = background.mode;

    switch (scene.background.mode) {
      case BackgroundMode.SolidColor: {
        const color = background.color;
        scene.background.solidColor.set(color[0], color[1], color[2], color[3]);
        break;
      }
      case BackgroundMode.Sky:
        if (background.skyMesh != null && background.skyMaterial != null) {
          promises.push(
            loadRef<Mesh>(refs, background.skyMesh, resourceManager, "scene.background.skyMesh").then((mesh) => {
              scene.background.sky.mesh = mesh;
            }),
            loadRef<any>(refs, background.skyMaterial, resourceManager, "scene.background.skyMaterial").then(
              (material) => {
                scene.background.sky.material = material;
              }
            )
          );
        } else {
          Logger.warn("Sky background mode requires skyMesh and skyMaterial");
        }
        break;
      case BackgroundMode.Texture:
        if (background.texture != null) {
          promises.push(
            loadRef<any>(refs, background.texture, resourceManager, "scene.background.texture").then((texture) => {
              scene.background.texture = texture;
            })
          );
          scene.background.textureFillMode = background.textureFillMode ?? scene.background.textureFillMode;
        }
        break;
    }
  } catch (error) {
    return Promise.reject(error);
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

  // Parse physics only when the engine has a native physics backend. Render-only
  // engines should remain able to load scene files that carry physics settings.
  const physics = sceneData.physics;
  if (physics && (scene.engine as any)._physicsInitialized) {
    const gravity = physics.gravity;
    if (gravity) scene.physics.gravity.set(gravity[0], gravity[1], gravity[2]);
    if (physics.fixedTimeStep != undefined) scene.physics.fixedTimeStep = physics.fixedTimeStep;
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

  return Promise.all(promises).then(() => {});
}

@resourceLoader(AssetType.Scene, ["scene"], false)
class SceneLoader extends Loader<Scene> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Scene> {
    const { engine } = resourceManager;
    return new AssetPromise((resolve, reject, setTaskCompleteProgress) => {
      resourceManager
        // @ts-ignore
        ._request<SceneFile>(item.url, { ...item, type: "json" })
        .then((data: SceneFile) => {
          const scene = new Scene(engine, data.scene.name ?? "");
          const context = new ParserContext(engine, ParserType.Scene, scene);
          const parser = new SceneParser(data, context, scene);
          parser._collectDependentAssets(data);
          context._setTaskCompleteProgress = setTaskCompleteProgress;
          parser.start();
          return parser.promise.then(() => {
            return applySceneData(scene, data.scene, resourceManager, data.refs).then(() => {
              resolve(scene);
            });
          });
        })
        .catch(reject);
    });
  }
}
