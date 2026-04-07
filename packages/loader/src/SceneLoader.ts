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
import type { AssetRef } from "./scene-format/types";
import { IScene, ParserContext, ParserType, ReflectionParser, SceneParser, SpecularMode } from "./resource-deserialize";

@resourceLoader(AssetType.Scene, ["scene"], true)
class SceneLoader extends Loader<Scene> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Scene> {
    const { engine } = resourceManager;
    return new AssetPromise((resolve, reject, setTaskCompleteProgress) => {
      resourceManager
        // @ts-ignore
        ._request<IScene>(item.url, { ...item, type: "json" })
        .then((data: IScene) => {
          const scene = new Scene(engine, data.name ?? "");
          const context = new ParserContext<IScene, Scene>(engine, ParserType.Scene, scene);
          const parser = new SceneParser(data, context, scene);
          parser._collectDependentAssets(data);
          context._setTaskCompleteProgress = setTaskCompleteProgress;
          parser.start();
          return parser.promise.then(() => {
            const promises: Promise<any>[] = [];
            // parse ambient light
            const ambient = data.scene.ambient;
            if (ambient) {
              const useCustomAmbient = ambient.specularMode === SpecularMode.Custom;
              const useSH = ambient.diffuseMode === DiffuseMode.SphericalHarmonics;

              scene.ambientLight.diffuseIntensity = ambient.diffuseIntensity;
              scene.ambientLight.specularIntensity = ambient.specularIntensity;
              scene.ambientLight.diffuseMode = ambient.diffuseMode;
              const solidColor = ambient.diffuseSolidColor;
              if (solidColor) {
                if (Array.isArray(solidColor)) {
                  scene.ambientLight.diffuseSolidColor.set(solidColor[0], solidColor[1], solidColor[2], solidColor[3]);
                } else {
                  scene.ambientLight.diffuseSolidColor.copyFrom(solidColor);
                }
              }
              scene.ambientLight.specularTextureDecodeRGBM = true;

              if (useCustomAmbient && ambient.customAmbientLight) {
                promises.push(
                  // @ts-ignore
                  resourceManager.getResourceByRef<any>(assetRefToEngine(ambient.customAmbientLight)).then((ambientLight) => {
                    scene.ambientLight.specularTexture = ambientLight?.specularTexture;
                  })
                );
              }

              if (ambient.ambientLight && (!useCustomAmbient || useSH)) {
                promises.push(
                  // @ts-ignore
                  resourceManager.getResourceByRef<any>(assetRefToEngine(ambient.ambientLight)).then((ambientLight) => {
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
            const background = data.scene.background;
            scene.background.mode = background.mode;

            switch (scene.background.mode) {
              case BackgroundMode.SolidColor: {
                const color = background.color;
                if (Array.isArray(color)) {
                  scene.background.solidColor.set(color[0], color[1], color[2], color[3]);
                } else {
                  scene.background.solidColor.copyFrom(color);
                }
                break;
              }
              case BackgroundMode.Sky:
                if (background.skyMesh && background.skyMaterial) {
                  // @ts-ignore
                  const skyMeshPromise = resourceManager.getResourceByRef<Mesh>(assetRefToEngine(background.skyMesh)).then((mesh) => {
                    scene.background.sky.mesh = mesh;
                  });
                  // @ts-ignore
                  const skyMaterialPromise = resourceManager.getResourceByRef(assetRefToEngine(background.skyMaterial)).then((material) => {
                    scene.background.sky.material = material;
                  });
                  promises.push(skyMeshPromise, skyMaterialPromise);
                } else {
                  Logger.warn("Sky background mode requires skyMesh and skyMaterial");
                }
                break;
              case BackgroundMode.Texture:
                if (background.texture) {
                  // @ts-ignore
                  const backgroundPromise = resourceManager.getResourceByRef<any>(assetRefToEngine(background.texture)).then((texture) => {
                    scene.background.texture = texture;
                  });
                  promises.push(backgroundPromise);
                  scene.background.textureFillMode = background.textureFillMode ?? scene.background.textureFillMode;
                }
                break;
            }

            // parse shadow
            const shadow = data.scene.shadow;
            if (shadow) {
              if (shadow.castShadows != undefined) scene.castShadows = shadow.castShadows;
              if (shadow.shadowResolution != undefined) scene.shadowResolution = shadow.shadowResolution;
              if (shadow.shadowDistance != undefined) scene.shadowDistance = shadow.shadowDistance;
              if (shadow.shadowCascades != undefined) scene.shadowCascades = shadow.shadowCascades;
              if (shadow.enableTransparentShadow != undefined) {
                scene.enableTransparentShadow = shadow.enableTransparentShadow;
              }
              scene.shadowTwoCascadeSplits = shadow.shadowTwoCascadeSplits ?? scene.shadowTwoCascadeSplits;
              shadow.shadowFourCascadeSplits && scene.shadowFourCascadeSplits.copyFrom(shadow.shadowFourCascadeSplits);
              scene.shadowFadeBorder = shadow.shadowFadeBorder ?? scene.shadowFadeBorder;
            }

            // parse fog
            const fog = data.scene.fog;
            if (fog) {
              if (fog.fogMode != undefined) scene.fogMode = fog.fogMode;
              if (fog.fogStart != undefined) scene.fogStart = fog.fogStart;
              if (fog.fogEnd != undefined) scene.fogEnd = fog.fogEnd;
              if (fog.fogDensity != undefined) scene.fogDensity = fog.fogDensity;
              if (fog.fogColor != undefined) {
                if (Array.isArray(fog.fogColor)) {
                  scene.fogColor.set(fog.fogColor[0], fog.fogColor[1], fog.fogColor[2], fog.fogColor[3]);
                } else {
                  scene.fogColor.copyFrom(fog.fogColor);
                }
              }
            }

            // Post Process
            const postProcessData = (data.scene as any).postProcess;
            if (postProcessData) {
              Logger.warn(
                "Post Process is not supported in scene yet, please add PostProcess component in entity instead."
              );
            }

            // Ambient Occlusion
            const ambientOcclusion = data.scene.ambientOcclusion;
            if (ambientOcclusion) {
              const sceneAmbientOcclusion = scene.ambientOcclusion;
              sceneAmbientOcclusion.enabled = ambientOcclusion.enabledAmbientOcclusion;
              sceneAmbientOcclusion.intensity = ambientOcclusion.intensity;
              sceneAmbientOcclusion.radius = ambientOcclusion.radius;
              sceneAmbientOcclusion.bias = ambientOcclusion.bias;
              sceneAmbientOcclusion.power = ambientOcclusion.power;
              sceneAmbientOcclusion.quality = ambientOcclusion.quality;
              sceneAmbientOcclusion.bilateralThreshold = ambientOcclusion.bilateralThreshold;
              sceneAmbientOcclusion.minHorizonAngle = ambientOcclusion.minHorizonAngle;
            }

            return Promise.all(promises).then(() => {
              resolve(scene);
            });
          });
        })
        .catch(reject);
    });
  }
}

/** Convert v2 AssetRef { $ref } → engine format { refId } for getResourceByRef. */
function assetRefToEngine(ref: AssetRef): { refId: string; key?: string } {
  return ref.key ? { refId: ref.$ref, key: ref.key } : { refId: ref.$ref };
}

ReflectionParser.registerCustomParseComponent("TextRenderer", async (instance: any, item: { props?: Record<string, unknown> }) => {
  const { props } = item;
  if (!props?.font) {
    // @ts-ignore
    instance.font = Font.createFromOS(instance.engine, (props?.fontFamily as string) || "Arial");
  }
  return instance;
});
