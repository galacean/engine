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
import { resolveRefItem } from "./scene-format/refs";
import { SpecularMode, type RefItem, type SceneFile } from "./scene-format/types";
import { ParserContext, ParserType, SceneParser } from "./resource-deserialize";

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
  const promises: Promise<any>[] = [];

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
        const ref = resolveRefItem(refs, ambient.customAmbientLight, "SceneLoader", "scene.ambient.customAmbientLight");
        promises.push(
          resourceManager
            // @ts-ignore
            .getResourceByRef<any>({ $ref: ref.url, key: ref.key })
            .then((ambientLight) => {
              scene.ambientLight.specularTexture = ambientLight?.specularTexture;
            })
        );
      }

      if (ambient.ambientLight != null && (!useCustomAmbient || useSH)) {
        const ref = resolveRefItem(refs, ambient.ambientLight, "SceneLoader", "scene.ambient.ambientLight");
        promises.push(
          // @ts-ignore
          resourceManager.getResourceByRef<any>({ $ref: ref.url, key: ref.key }).then((ambientLight) => {
            if (!useCustomAmbient) {
              scene.ambientLight.specularTexture = ambientLight?.specularTexture;
            }

            if (useSH) {
              scene.ambientLight.diffuseSphericalHarmonics = ambientLight?.diffuseSphericalHarmonics;
            }
          })
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
          const meshRef = resolveRefItem(refs, background.skyMesh, "SceneLoader", "scene.background.skyMesh");
          const matRef = resolveRefItem(refs, background.skyMaterial, "SceneLoader", "scene.background.skyMaterial");
          const skyMeshPromise = resourceManager
            // @ts-ignore
            .getResourceByRef<Mesh>({ $ref: meshRef.url, key: meshRef.key })
            .then((mesh) => {
              scene.background.sky.mesh = mesh;
            });
          const skyMaterialPromise = resourceManager
            // @ts-ignore
            .getResourceByRef({ $ref: matRef.url, key: matRef.key })
            .then((material) => {
              scene.background.sky.material = material;
            });
          promises.push(skyMeshPromise, skyMaterialPromise);
        } else {
          Logger.warn("Sky background mode requires skyMesh and skyMaterial");
        }
        break;
      case BackgroundMode.Texture:
        if (background.texture != null) {
          const texRef = resolveRefItem(refs, background.texture, "SceneLoader", "scene.background.texture");
          const backgroundPromise = resourceManager
            // @ts-ignore
            .getResourceByRef<any>({ $ref: texRef.url, key: texRef.key })
            .then((texture) => {
              scene.background.texture = texture;
            });
          promises.push(backgroundPromise);
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

  // Post Process
  const postProcessData = (sceneData as any).postProcess;
  if (postProcessData) {
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

@resourceLoader(AssetType.Scene, ["scene"], true)
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
