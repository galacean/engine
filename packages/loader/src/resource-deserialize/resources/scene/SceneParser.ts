import { BackgroundMode, DiffuseMode, Scene } from "@galacean/engine-core";
import { HierarchyParser } from "../parser/HierarchyParser";
import { ParserContext } from "../parser/ParserContext";
import { ReflectionParser } from "../parser/ReflectionParser";
import { IHierarchyFile, IRefEntity, IStrippedEntity, SpecularMode, type IScene } from "../schema";

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
        context._addDependentAsset(customAmbientLight.refId, resourceManager.getResourceByRef(customAmbientLight));
      }
      if (ambientLight && (!useCustomAmbient || useSH)) {
        // @ts-ignore
        context._addDependentAsset(ambientLight.refId, resourceManager.getResourceByRef(ambientLight));
      }
    }

    const background = scene.background;
    const backgroundMode = background.mode;
    if (backgroundMode === BackgroundMode.Texture) {
      const texture = background.texture;
      // @ts-ignore
      texture && context._addDependentAsset(texture.refId, resourceManager.getResourceByRef(texture));
    } else if (backgroundMode === BackgroundMode.Sky) {
      const { skyMesh, skyMaterial } = background;
      if (skyMesh && skyMaterial) {
        // @ts-ignore
        context._addDependentAsset(skyMesh.refId, resourceManager.getResourceByRef(skyMesh));
        // @ts-ignore
        context._addDependentAsset(skyMaterial.refId, resourceManager.getResourceByRef(skyMaterial));
      }
    }
  }

  protected override _handleRootEntity(id: string): void {
    const { entityMap } = this.context;
    this.scene.addRootEntity(entityMap.get(id));
  }

  protected override _clearAndResolve() {
    this.context.clear();
    return this.scene;
  }

  private _parseDependentAssets(file: IHierarchyFile): void {
    const entities = file.entities;
    for (let i = 0, n = entities.length; i < n; i++) {
      const entity = entities[i];
      if (!!(<IRefEntity>entity).assetRefId) {
        const context = this.context;
        const { assetRefId: refId, key } = <IRefEntity>entity;
        // @ts-ignore
        context._addDependentAsset(refId, context.resourceManager.getResourceByRef({ refId, key }));
      } else if ((<IStrippedEntity>entity).strippedId) {
        continue;
      } else {
        const components = entity.components;
        for (let j = 0, m = components.length; j < m; j++) {
          const component = components[j];
          this._searchDependentAssets(component.methods);
          this._searchDependentAssets(component.props);
        }
      }
    }
  }

  private _searchDependentAssets(value: any): void {
    if (Array.isArray(value)) {
      for (let i = 0, n = value.length; i < n; i++) {
        this._searchDependentAssets(value[i]);
      }
    } else if (!!value && typeof value === "object") {
      // @ts-ignore
      if (ReflectionParser._isAssetRef(value)) {
        const context = this.context;
        // @ts-ignore
        context._addDependentAsset(value.refId, context.resourceManager.getResourceByRef(value));
      } else {
        for (let key in value) {
          this._searchDependentAssets(value[key]);
        }
      }
    }
  }
}
