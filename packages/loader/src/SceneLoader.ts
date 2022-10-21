import {
  AssetPromise,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  AssetType,
  Scene,
  BackgroundMode,
  SkyBoxMaterial,
  PrimitiveMesh
} from "@oasis-engine/core";
import { SceneParser } from "./resource-deserialize";

@resourceLoader(AssetType.Scene, ["prefab"], true)
class SceneLoader extends Loader<Scene> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Scene> {
    const { engine } = resourceManager;
    return new AssetPromise((resolve, reject) => {
      return this.request<any>(item.url, { type: "json" }).then((data) => {
        // @ts-ignore
        engine.resourceManager.initVirtualResources(data.files);
        return SceneParser.parse(engine, data).then((scene) => {
          const ambient = data.scene.ambient;
          let ambientLightPromise = Promise.resolve();
          if (ambient.ambientLight) {
            ambientLightPromise = resourceManager
              .getResourceByRef<any>(data.scene.ambient.ambientLight)
              .then((light) => {
                scene.ambientLight = light;
                scene.ambientLight.diffuseIntensity = ambient.diffuseIntensity;
                scene.ambientLight.specularIntensity = ambient.specularIntensity;
              });
          }

          const background = data.scene.background;
          scene.background.mode = background.mode;

          let backgroundPromise = Promise.resolve();

          switch (scene.background.mode) {
            case BackgroundMode.SolidColor:
              scene.background.solidColor.copyFrom(background.color);
              break;
            case BackgroundMode.Sky:
              if (background.sky) {
                backgroundPromise = resourceManager.getResourceByRef<any>(background.sky).then((light) => {
                  const sky = scene.background.sky;
                  const skyMaterial = new SkyBoxMaterial(engine);
                  skyMaterial.textureCubeMap = light.specularTexture;
                  skyMaterial.textureDecodeRGBM = true;
                  sky.material = skyMaterial;
                  sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
                });
              }
              break;
            case BackgroundMode.Texture:
              if (background.texture) {
                backgroundPromise = resourceManager.getResourceByRef<any>(background.texture).then((texture) => {
                  scene.background.texture = texture;
                });
              }
              break;
          }
          Promise.all([ambientLightPromise, backgroundPromise]).then(() => {
            resolve(scene);
          });
        });
      });
      //
    });
  }
}
