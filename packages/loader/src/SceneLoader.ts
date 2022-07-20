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
import { Vector3 } from "@oasis-engine/math";
import { SceneParser } from "@oasis-engine/resource-process";

@resourceLoader(AssetType.Scene, ["prefab"], true)
class SceneLoader extends Loader<Scene> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Scene> {
    const { engine } = resourceManager;
    return new AssetPromise((resolve, reject) => {
      return this.request<any>(item.url, { type: "json" }).then((data) => {
        engine.resourceManager.initVirtualResources(data.files);
        return SceneParser.parse(engine, data).then((scene) => {
          const entity = scene.findEntityByName("Camera");
          const ambient = data.scene.ambient;
          if (ambient.ambientLight) {
            resourceManager.getResourceByRef<any>(data.scene.ambient.ambientLight).then((light) => {
              scene.ambientLight = light;
            });
          }
          scene.ambientLight.diffuseIntensity = ambient.diffuseIntensity;
          scene.ambientLight.specularIntensity = ambient.specularIntensity;

          const background = data.scene.background;
          scene.background.mode = background.mode;
          switch (scene.background.mode) {
            case BackgroundMode.SolidColor:
              scene.background.solidColor.copyFrom(background.color);
              break;
            case BackgroundMode.Sky:
              if (background.sky) {
                resourceManager.getResourceByRef<any>(background.sky).then((light) => {
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
                resourceManager.getResourceByRef<any>(background.texture).then((texture) => {
                  scene.background.texture = texture;
                });
              }
              break;
          }

          resolve(scene);
        });
      });
      //
    });
  }
}
