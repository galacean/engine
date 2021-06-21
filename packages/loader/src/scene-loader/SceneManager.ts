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
    if (scene[field]) {
      if (prop && prop.type === "asset") {
        scene[field][key] = this.oasis.resourceManager.get(prop.id).resource;
      } else {
        scene[field][key] = prop;
      }
    }
  }
}
