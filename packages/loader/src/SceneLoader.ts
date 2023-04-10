import {
  AssetPromise,
  AssetType,
  BackgroundMode,
  Engine,
  Font,
  Loader,
  LoadItem,
  PrimitiveMesh,
  resourceLoader,
  ResourceManager,
  Scene,
  SkyBoxMaterial
} from "@oasis-engine/core";
import { IClassObject, ReflectionParser, SceneParser } from "./resource-deserialize";

@resourceLoader(AssetType.Scene, ["prefab"], true)
class SceneLoader extends Loader<Scene> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Scene> {
    const { engine } = resourceManager;
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, { type: "json" })
        .then((data) => {
          // @ts-ignore
          engine.resourceManager.initVirtualResources(data.files);
          return SceneParser.parse(engine, data).then((scene) => {
            // parse ambient light
            const ambient = data.scene.ambient;
            let ambientLightPromise = Promise.resolve();
            if (ambient.ambientLight) {
              ambientLightPromise = resourceManager
                // @ts-ignore
                .getResourceByRef<any>(data.scene.ambient.ambientLight)
                .then((light) => {
                  scene.ambientLight = light;
                  scene.ambientLight.diffuseIntensity = ambient.diffuseIntensity;
                  scene.ambientLight.specularIntensity = ambient.specularIntensity;
                });
            } else {
              scene.ambientLight.diffuseIntensity = ambient.diffuseIntensity;
              scene.ambientLight.specularIntensity = ambient.specularIntensity;
              scene.ambientLight.diffuseSolidColor.copyFrom(ambient.diffuseSolidColor);
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
                  // @ts-ignore
                  backgroundPromise = resourceManager.getResourceByRef<any>(background.sky).then((light) => {
                    const sky = scene.background.sky;
                    const skyMaterial = new SkyBoxMaterial(engine);
                    skyMaterial.texture = light.specularTexture;
                    skyMaterial.textureDecodeRGBM = true;
                    sky.material = skyMaterial;
                    sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
                  });
                }
                break;
              case BackgroundMode.Texture:
                if (background.texture) {
                  // @ts-ignore
                  backgroundPromise = resourceManager.getResourceByRef<any>(background.texture).then((texture) => {
                    scene.background.texture = texture;
                  });
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

            return Promise.all([ambientLightPromise, backgroundPromise]).then(() => {
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
