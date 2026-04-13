import { BackgroundMode, DiffuseMode, Scene } from "@galacean/engine-core";
import {
  SpecularMode,
  type ComponentSchema,
  type InlineEntitySchema,
  type SceneFile,
  type HierarchyFile
} from "../../../scene-format/types";
import { HierarchyParser } from "../parser/HierarchyParser";
import { ParserContext } from "../parser/ParserContext";

/** @Internal */
export class SceneParser extends HierarchyParser<Scene, ParserContext> {
  constructor(
    data: SceneFile,
    context: ParserContext,
    public readonly scene: Scene
  ) {
    super(data, context);
  }

  /**
   * @internal
   */
  _collectDependentAssets(data: SceneFile): void {
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
        context._addDependentAsset(
          customAmbientLight.$ref,
          // @ts-ignore
          resourceManager.getResourceByRef(customAmbientLight)
        );
      }
      if (ambientLight && (!useCustomAmbient || useSH)) {
        // @ts-ignore
        context._addDependentAsset(ambientLight.$ref, resourceManager.getResourceByRef(ambientLight));
      }
    }

    const background = scene.background;
    const backgroundMode = background.mode;
    if (backgroundMode === BackgroundMode.Texture) {
      const texture = background.texture;
      if (texture) {
        // @ts-ignore
        context._addDependentAsset(texture.$ref, resourceManager.getResourceByRef(texture));
      }
    } else if (backgroundMode === BackgroundMode.Sky) {
      const { skyMesh, skyMaterial } = background;
      if (skyMesh && skyMaterial) {
        // @ts-ignore
        context._addDependentAsset(skyMesh.$ref, resourceManager.getResourceByRef(skyMesh));
        // @ts-ignore
        context._addDependentAsset(skyMaterial.$ref, resourceManager.getResourceByRef(skyMaterial));
      }
    }
  }

  protected override _getRootIndices(): number[] {
    return (this.data as SceneFile).scene.entities;
  }

  protected override _handleRootEntity(index: number): void {
    this.scene.addRootEntity(this.context.entityMap.get(index));
  }

  protected override _clearAndResolve() {
    this.context.clear();
    return this.scene;
  }

  private _parseDependentAssets(file: HierarchyFile): void {
    const entities = file.entities;
    const components = file.components;
    const context = this.context;

    for (let i = 0, n = entities.length; i < n; i++) {
      const entity = entities[i];
      if (entity.instance) {
        const asset = entity.instance.asset;
        // @ts-ignore
        context._addDependentAsset(asset.$ref, context.resourceManager.getResourceByRef(asset));

        // Scan overrides for additional asset refs
        const overrides = entity.instance.overrides;
        if (overrides) {
          if (overrides.componentProps) {
            for (const key in overrides.componentProps) {
              const componentMap = overrides.componentProps[key];
              for (const selector in componentMap) {
                this._searchDependentAssets(componentMap[selector]);
              }
            }
          }
          if (overrides.addedComponents) {
            for (let j = 0, m = overrides.addedComponents.length; j < m; j++) {
              const comp = overrides.addedComponents[j].component;
              this._searchComponentDependentAssets(comp);
            }
          }
          if (overrides.addedEntities) {
            for (let j = 0, m = overrides.addedEntities.length; j < m; j++) {
              this._searchInlineEntityDependentAssets(overrides.addedEntities[j].entity);
            }
          }
        }
      } else {
        const componentIndices = entity.components;
        if (!componentIndices) continue;
        for (let j = 0, m = componentIndices.length; j < m; j++) {
          this._searchComponentDependentAssets(components[componentIndices[j]]);
        }
      }
    }
  }

  private _searchComponentDependentAssets(comp: ComponentSchema): void {
    const context = this.context;
    if (comp.script) {
      context._addDependentAsset(
        comp.script.$ref,
        // @ts-ignore
        context.resourceManager.getResourceByRef(comp.script)
      );
    }
    if (comp.props) {
      this._searchDependentAssets(comp.props);
    }
  }

  private _searchInlineEntityDependentAssets(entity: InlineEntitySchema): void {
    if (entity.components) {
      for (let i = 0, n = entity.components.length; i < n; i++) {
        this._searchComponentDependentAssets(entity.components[i]);
      }
    }
    if (entity.children) {
      for (let i = 0, n = entity.children.length; i < n; i++) {
        this._searchInlineEntityDependentAssets(entity.children[i]);
      }
    }
  }

  private _searchDependentAssets(value: any): void {
    if (Array.isArray(value)) {
      for (let i = 0, n = value.length; i < n; i++) {
        this._searchDependentAssets(value[i]);
      }
    } else if (value != null && typeof value === "object") {
      if ("$ref" in value) {
        const context = this.context;
        // @ts-ignore
        context._addDependentAsset(value.$ref, context.resourceManager.getResourceByRef(value));
      } else {
        for (const key in value) {
          this._searchDependentAssets(value[key]);
        }
      }
    }
  }
}
