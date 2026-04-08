import { BackgroundMode, DiffuseMode, Scene } from "@galacean/engine-core";
import { assetRefToEngine, type IHierarchyFile } from "../../../scene-format/types";
import { HierarchyParser } from "../parser/HierarchyParser";
import { ParserContext } from "../parser/ParserContext";
import { ReflectionParser } from "../parser/ReflectionParser";
import { SpecularMode, type IScene } from "../schema";

/** @Internal */
export class SceneParser extends HierarchyParser<Scene, ParserContext<IScene>> {
  constructor(
    data: IScene,
    context: ParserContext<IScene>,
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
        context._addDependentAsset(customAmbientLight.$ref, resourceManager.getResourceByRef(assetRefToEngine(customAmbientLight)));
      }
      if (ambientLight && (!useCustomAmbient || useSH)) {
        // @ts-ignore
        context._addDependentAsset(ambientLight.$ref, resourceManager.getResourceByRef(assetRefToEngine(ambientLight)));
      }
    }

    const background = scene.background;
    const backgroundMode = background.mode;
    if (backgroundMode === BackgroundMode.Texture) {
      const texture = background.texture;
      if (texture) {
        // @ts-ignore
        context._addDependentAsset(texture.$ref, resourceManager.getResourceByRef(assetRefToEngine(texture)));
      }
    } else if (backgroundMode === BackgroundMode.Sky) {
      const { skyMesh, skyMaterial } = background;
      if (skyMesh && skyMaterial) {
        // @ts-ignore
        context._addDependentAsset(skyMesh.$ref, resourceManager.getResourceByRef(assetRefToEngine(skyMesh)));
        // @ts-ignore
        context._addDependentAsset(skyMaterial.$ref, resourceManager.getResourceByRef(assetRefToEngine(skyMaterial)));
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
        const asset = entity.instance.asset;
        // @ts-ignore
        context._addDependentAsset(asset.$ref, context.resourceManager.getResourceByRef(assetRefToEngine(asset)));
      } else {
        const componentIndices = entity.components;
        if (!componentIndices) continue;
        for (let j = 0, m = componentIndices.length; j < m; j++) {
          const comp = components[componentIndices[j]];
          if (comp.script) {
            // @ts-ignore
            context._addDependentAsset(comp.script.$ref, context.resourceManager.getResourceByRef(assetRefToEngine(comp.script)));
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
        context._addDependentAsset(value.$ref, context.resourceManager.getResourceByRef(assetRefToEngine(value)));
      } else {
        for (const key in value) {
          this._searchDependentAssets(value[key]);
        }
      }
    }
  }
}
