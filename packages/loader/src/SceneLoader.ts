import {
  AssetPromise,
  AssetType,
  BackgroundMode,
  Engine,
  Font,
  Loader,
  LoadItem,
  Logger,
  Mesh,
  resourceLoader,
  ResourceManager,
  Scene
} from "@galacean/engine-core";
import { IClassObject, IScene, ReflectionParser, SceneParser } from "./resource-deserialize";

@resourceLoader(AssetType.Scene, ["prefab"], true)
class SceneLoader extends Loader<Scene> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Scene> {
    const { engine } = resourceManager;
    return new AssetPromise((resolve, reject) => {
      this.request<IScene>(item.url, { type: "json" })
        .then((data) => {
          // @ts-ignore
          engine.resourceManager.initVirtualResources(data.files);
          return SceneParser.parse(engine, data).then((scene) => {
            const promises = [];
            // parse ambient light
            const ambient = data.scene.ambient;
            const useCustomAmbient = ambient.specularMode === "Custom";
            if (useCustomAmbient && ambient.customAmbientLight) {
              // @ts-ignore
              // prettier-ignore
              const customAmbientPromise = resourceManager.getResourceByRef<any>(ambient.customAmbientLight).then((ambientLight) => {
                  scene.ambientLight = ambientLight;
                  scene.ambientLight.diffuseIntensity = ambient.diffuseIntensity;
                  scene.ambientLight.specularIntensity = ambient.specularIntensity;
                  scene.ambientLight.diffuseMode = ambient.diffuseMode;
                  scene.ambientLight.diffuseSolidColor.copyFrom(ambient.diffuseSolidColor);
                });
              promises.push(customAmbientPromise);
            } else if (!useCustomAmbient && ambient.ambientLight) {
              // @ts-ignore
              // prettier-ignore
              const ambientLightPromise = resourceManager.getResourceByRef<any>(ambient.ambientLight).then((ambientLight) => {
                  scene.ambientLight = ambientLight;
                  scene.ambientLight.diffuseIntensity = ambient.diffuseIntensity;
                  scene.ambientLight.specularIntensity = ambient.specularIntensity;
                  scene.ambientLight.diffuseMode = ambient.diffuseMode;
                  scene.ambientLight.diffuseSolidColor.copyFrom(ambient.diffuseSolidColor);
                });
              promises.push(ambientLightPromise);
            } else {
              scene.ambientLight.diffuseIntensity = ambient.diffuseIntensity;
              scene.ambientLight.specularIntensity = ambient.specularIntensity;
              scene.ambientLight.diffuseSolidColor.copyFrom(ambient.diffuseSolidColor);
            }

            const background = data.scene.background;
            scene.background.mode = background.mode;

            switch (scene.background.mode) {
              case BackgroundMode.SolidColor:
                scene.background.solidColor.copyFrom(background.color);
                break;
              case BackgroundMode.Sky:
                if (background.skyMesh && background.skyMaterial) {
                  // @ts-ignore
                  const skyMeshPromise = resourceManager.getResourceByRef<Mesh>(background.skyMesh).then((mesh) => {
                    scene.background.sky.mesh = mesh;
                  });
                  // @ts-ignore
                  // prettier-ignore
                  const skyMaterialPromise = resourceManager.getResourceByRef<Material>(background.skyMaterial).then((material) => {
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
                  // prettier-ignore
                  const backgroundPromise = resourceManager.getResourceByRef<any>(background.texture).then((texture) => {
                    scene.background.texture = texture;
                  });
                  promises.push(backgroundPromise);
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
  async (instance: any, item: Omit<IClassObject, "class">, engine: Engine) => {
    const { props } = item;
    if (!props.font) {
      // @ts-ignore
      instance.font = Font.createFromOS(engine, props.fontFamily || "Arial");
    }
    return instance;
  }
);
