import {
  AssetPromise,
  AssetType,
  BackgroundMode,
  DiffuseMode,
  Font,
  Loader,
  LoadItem,
  Logger,
  Mesh,
  resourceLoader,
  ResourceManager,
  Scene
} from "@galacean/engine-core";
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
          const context = new ParserContext<IScene>(engine, ParserType.Scene, scene);
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
                scene.ambientLight.diffuseSolidColor.set(solidColor[0], solidColor[1], solidColor[2], solidColor[3]);
              }

              if (useCustomAmbient && ambient.customAmbientLight) {
                promises.push(
                  resourceManager
                    // @ts-ignore
                    .getResourceByRef<any>(ambient.customAmbientLight)
                    .then((ambientLight) => {
                      scene.ambientLight.specularTexture = ambientLight?.specularTexture;
                    })
                );
              }

              if (ambient.ambientLight && (!useCustomAmbient || useSH)) {
                promises.push(
                  // @ts-ignore
                  resourceManager.getResourceByRef<any>(ambient.ambientLight).then((ambientLight) => {
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
                scene.background.solidColor.set(color[0], color[1], color[2], color[3]);
                break;
              }
              case BackgroundMode.Sky:
                if (background.skyMesh && background.skyMaterial) {
                  const skyMeshPromise = resourceManager
                    // @ts-ignore
                    .getResourceByRef<Mesh>(background.skyMesh)
                    .then((mesh) => {
                      scene.background.sky.mesh = mesh;
                    });
                  const skyMaterialPromise = resourceManager
                    // @ts-ignore
                    .getResourceByRef(background.skyMaterial)
                    .then((material) => {
                      scene.background.sky.material = material;
                    });
                  promises.push(skyMeshPromise, skyMaterialPromise);
                } else {
                  Logger.warn("Sky background mode requires skyMesh and skyMaterial");
                }
                break;
              case BackgroundMode.Texture:
                if (background.texture) {
                  const backgroundPromise = resourceManager
                    // @ts-ignore
                    .getResourceByRef<any>(background.texture)
                    .then((texture) => {
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
              if (shadow.shadowFourCascadeSplits) {
                const splits = shadow.shadowFourCascadeSplits;
                scene.shadowFourCascadeSplits.set(splits[0], splits[1], splits[2]);
              }
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
                scene.fogColor.set(fog.fogColor[0], fog.fogColor[1], fog.fogColor[2], fog.fogColor[3]);
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

ReflectionParser.registerCustomParseComponent(
  "TextRenderer",
  async (instance: any, item: { props?: Record<string, unknown> }) => {
    const { props } = item;
    if (!props?.font) {
      // @ts-ignore
      instance.font = Font.createFromOS(instance.engine, (props?.fontFamily as string) || "Arial");
    }
    return instance;
  }
);
