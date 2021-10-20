import { PrimitiveMesh, SkyBoxMaterial } from "@oasis-engine/core";
import { Oasis } from "./Oasis";
import { pluginHook } from "./plugins/PluginManager";

export class SceneManager {
  constructor(private oasis: Oasis) {}

  init() {
    const { scene } = this.oasis.options.config;
    if (scene) {
      Object.keys(scene).forEach((field) => {
        const fieldConfig = scene[field];
        Object.keys(fieldConfig.props).forEach((key) => {
          const prop = fieldConfig.props[key];
          this.setProp(field, key, prop);
        });
      });
    }
  }

  @pluginHook({ before: "beforeSceneUpdated", after: "sceneUpdated" })
  public update(field: string, key: string, value: any) {
    this.setProp(field, key, value);
    return { field, key, value };
  }

  private setProp(field, key, prop) {
    const scene = this.oasis.engine.sceneManager.activeScene;
    if (field === "background" && key === "skyboxTexture") {
      const sky = scene.background.sky;
      if (prop) {
        sky.mesh = PrimitiveMesh.createCuboid(scene.engine, 2, 2, 2);
        const skyMaterial = new SkyBoxMaterial(scene.engine);
        skyMaterial.textureCubeMap = this.oasis.resourceManager.get(prop.id).resource;
        sky.material = skyMaterial;
      } else {
        sky.mesh = null;
        sky.material = null;
      }
    } else if (scene[field]) {
      if (prop && prop.type === "asset") {
        scene[field][key] = this.oasis.resourceManager.get(prop.id).resource;
      } else {
        scene[field][key] = prop;
      }
    }
  }
}
