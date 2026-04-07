import { BackgroundMode, DiffuseMode, Scene } from "@galacean/engine-core";
import type { IHierarchyFile } from "../../../scene-format/types";
import { HierarchyParser } from "../parser/HierarchyParser";
import { ParserContext } from "../parser/ParserContext";
import { ReflectionParser } from "../parser/ReflectionParser";
import { SpecularMode, type IScene } from "../schema";

/** @Internal */
export class SceneParser extends HierarchyParser<Scene, ParserContext<IScene, Scene>> {
  constructor(
    data: IScene,
    context: ParserContext<IScene, Scene>,
    public readonly scene: Scene
  ) {
    super(data, context);
  }

  /**
   * @internal
   */
  _collectDependentAssets(data: IScene): void {
    const context = this.context;
    const resourceManager = context.resourceManager;
    this._parseDependentAssets(data);
    const scene = data.scene;
    const ambient = scene.ambient;
    if (ambient) {
      const useCustomAmbient = ambient.specularMode === SpecularMode.Custom;
      const useSH = ambient.diffuseMode === DiffuseMode.SphericalHarmonics;
      const { customAmbientLight, ambientLight } = ambient;
      if (useCustomAmbient && customAmbientLight) {
        // @ts-ignore
        context._addDependentAsset(customAmbientLight.$ref, resourceManager.getResourceByRef({ refId: customAmbientLight.$ref, key: customAmbientLight.key }));
      }
      if (ambientLight && (!useCustomAmbient || useSH)) {
        // @ts-ignore
        context._addDependentAsset(ambientLight.$ref, resourceManager.getResourceByRef({ refId: ambientLight.$ref, key: ambientLight.key }));
      }
    }

    const background = scene.background;
    const backgroundMode = background.mode;
    if (backgroundMode === BackgroundMode.Texture) {
      const texture = background.texture;
      if (texture) {
        // @ts-ignore
        context._addDependentAsset(texture.$ref, resourceManager.getResourceByRef({ refId: texture.$ref, key: texture.key }));
      }
    } else if (backgroundMode === BackgroundMode.Sky) {
      const { skyMesh, skyMaterial } = background;
      if (skyMesh && skyMaterial) {
        // @ts-ignore
        context._addDependentAsset(skyMesh.$ref, resourceManager.getResourceByRef({ refId: skyMesh.$ref, key: skyMesh.key }));
        // @ts-ignore
        context._addDependentAsset(skyMaterial.$ref, resourceManager.getResourceByRef({ refId: skyMaterial.$ref, key: skyMaterial.key }));
      }
    }
  }

  protected override _getRootIndices(): number[] {
    return (this.data as IScene).scene.entities;
  }

  protected override _handleRootEntity(index: number): void {
    this.scene.addRootEntity(this.context.entityMap.get(index));
  }

  protected override _clearAndResolve() {
    this.context.clear();
    return this.scene;
  }

  private _parseDependentAssets(file: IHierarchyFile): void {
    const entities = file.entities;
    const components = file.components;
    const context = this.context;

    for (let i = 0, n = entities.length; i < n; i++) {
      const entity = entities[i];
      if (entity.instance) {
        const $ref = entity.instance.asset.$ref;
        // @ts-ignore
        context._addDependentAsset($ref, context.resourceManager.getResourceByRef({ refId: $ref }));
      } else {
        const componentIndices = entity.components;
        if (!componentIndices) continue;
        for (let j = 0, m = componentIndices.length; j < m; j++) {
          const comp = components[componentIndices[j]];
          if (comp.script) {
            // @ts-ignore
            context._addDependentAsset(comp.script.$ref, context.resourceManager.getResourceByRef({ refId: comp.script.$ref, key: comp.script.key }));
          }
          if (comp.props) {
            this._searchDependentAssets(comp.props);
          }
        }
      }
    }
  }

  private _searchDependentAssets(value: any): void {
    if (Array.isArray(value)) {
      for (let i = 0, n = value.length; i < n; i++) {
        this._searchDependentAssets(value[i]);
      }
    } else if (value != null && typeof value === "object") {
      // @ts-ignore
      if (ReflectionParser._isAssetRef(value)) {
        const context = this.context;
        // @ts-ignore
        context._addDependentAsset(value.$ref, context.resourceManager.getResourceByRef({ refId: value.$ref, key: value.key }));
      } else {
        for (const key in value) {
          this._searchDependentAssets(value[key]);
        }
      }
    }
  }
}
