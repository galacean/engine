import { Color, Vector3, Vector4 } from "@galacean/engine-math";
import { Background } from "./Background";
import { ComponentsManager } from "./ComponentsManager";
import { Engine } from "./Engine";
import { Entity } from "./Entity";
import { MaskManager } from "./RenderPipeline/MaskManager";
import { SceneManager } from "./SceneManager";
import { EngineObject, Logger } from "./base";
import { ActiveChangeFlag } from "./enums/ActiveChangeFlag";
import { EntityModifyFlags } from "./enums/EntityModifyFlags";
import { FogMode } from "./enums/FogMode";
import { AmbientOcclusion, DirectLight } from "./lighting";
import { AmbientLight } from "./lighting/AmbientLight";
import { LightManager } from "./lighting/LightManager";
import { PhysicsScene } from "./physics/PhysicsScene";
import { PostProcessManager } from "./postProcess";
import { ShaderProperty } from "./shader";
import { ShaderData } from "./shader/ShaderData";
import { ShaderDataGroup } from "./shader/enums/ShaderDataGroup";
import { ShadowCascadesMode } from "./shadow/enum/ShadowCascadesMode";
import { ShadowResolution } from "./shadow/enum/ShadowResolution";
import { ShadowType } from "./shadow/enum/ShadowType";

/**
 * Scene.
 */
export class Scene extends EngineObject {
  private static _fogColorProperty = ShaderProperty.getByName("scene_FogColor");
  private static _fogParamsProperty = ShaderProperty.getByName("scene_FogParams");
  private static _prefilterdDFGProperty = ShaderProperty.getByName("scene_PrefilteredDFG");

  /** Scene name. */
  name: string;

  /** Physics. */
  readonly physics: PhysicsScene = new PhysicsScene(this);

  /** If cast shadows. */
  castShadows: boolean = true;
  /** The resolution of the shadow maps. */
  shadowResolution: ShadowResolution = ShadowResolution.Medium;
  /** The splits of two cascade distribution. */
  shadowTwoCascadeSplits: number = 1.0 / 3.0;
  /** The splits of four cascade distribution. */
  shadowFourCascadeSplits: Vector3 = new Vector3(1.0 / 15, 3.0 / 15.0, 7.0 / 15.0);
  /** Max Shadow distance. */
  shadowDistance: number = 50;
  /**
   * Last shadow fade distance in percentage, range [0,1].
   * @remarks Value 0 is used for no shadow fade.
   */
  shadowFadeBorder: number = 0.1;

  /** Post process manager. */
  readonly postProcessManager = new PostProcessManager(this);

  /**
   * Ambient Occlusion settings.
   * @remarks
   * Darkens areas where objects are close together to simulate natural light blocking,
   * such as corners, crevices, and contact points between surfaces.
   */
  readonly ambientOcclusion = new AmbientOcclusion(this);

  /** @internal */
  _lightManager: LightManager = new LightManager();
  /** @internal */
  _componentsManager: ComponentsManager = new ComponentsManager();
  /** @internal */
  _maskManager: MaskManager = new MaskManager();
  /** @internal */
  _isActiveInEngine: boolean = false;
  /** @internal */
  _sceneManager: SceneManager | null;
  /** @internal */
  _rootEntities: Entity[] = [];
  /** @internal Destination scene while `SceneManager.mergeScenes` is transferring roots from this scene. */
  _mergingInto: Scene | null = null;

  private _background: Background = new Background(this._engine);
  private _shaderData: ShaderData = new ShaderData(ShaderDataGroup.Scene);
  private _shadowCascades: ShadowCascadesMode = ShadowCascadesMode.NoCascades;
  private _ambientLight: AmbientLight;
  private _fogMode: FogMode = FogMode.None;
  private _fogColor: Color = new Color(0.21404114048223255, 0.21404114048223255, 0.21404114048223255, 1.0);
  private _fogStart: number = 0;
  private _fogEnd: number = 300;
  private _fogDensity: number = 0.01;
  private _fogParams: Vector4 = new Vector4();
  private _isActive: boolean = true;
  private _sun: DirectLight | null | undefined;
  private _enableTransparentShadow = false;

  /**
   * Whether the scene is active.
   */
  get isActive(): boolean {
    return this._isActive;
  }

  set isActive(value: boolean) {
    if (this._isActive !== value) {
      this._isActive = value;
      if (value) {
        this._sceneManager && this._processActive(true);
      } else {
        this._sceneManager && this._processActive(false);
      }
    }
  }

  /**
   * Scene-related shader data.
   */
  get shaderData(): ShaderData {
    return this._shaderData;
  }

  /**
   * The background of the scene.
   */
  get background(): Background {
    return this._background;
  }

  /**
   *  Number of cascades to use for directional light shadows.
   */
  get shadowCascades(): ShadowCascadesMode {
    return this._shadowCascades;
  }

  set shadowCascades(value: ShadowCascadesMode) {
    if (this._shadowCascades !== value) {
      this.shaderData.enableMacro("SCENE_SHADOW_CASCADED_COUNT", value.toString());
      this._shadowCascades = value;
    }
  }

  /**
   * Ambient light.
   */
  get ambientLight(): AmbientLight {
    return this._ambientLight;
  }

  set ambientLight(value: AmbientLight) {
    if (!value) {
      Logger.warn("The scene must have one ambient light");
      return;
    }

    const lastAmbientLight = this._ambientLight;
    if (lastAmbientLight !== value) {
      lastAmbientLight && lastAmbientLight._removeFromScene(this);
      value._addToScene(this);
      this._ambientLight = value;
    }
  }

  /**
   * Fog mode.
   * @remarks
   * If set to `FogMode.None`, the fog will be disabled.
   * If set to `FogMode.Linear`, the fog will be linear and controlled by `fogStart` and `fogEnd`.
   * If set to `FogMode.Exponential`, the fog will be exponential and controlled by `fogDensity`.
   * If set to `FogMode.ExponentialSquared`, the fog will be exponential squared and controlled by `fogDensity`.
   */
  get fogMode(): FogMode {
    return this._fogMode;
  }

  set fogMode(value: FogMode) {
    if (this._fogMode !== value) {
      this.shaderData.enableMacro("SCENE_FOG_MODE", value.toString());
      this._fogMode = value;
    }
  }

  /**
   * Fog color.
   */
  get fogColor(): Color {
    return this._fogColor;
  }

  set fogColor(value: Color) {
    if (this._fogColor !== value) {
      this._fogColor.copyFrom(value);
    }
  }

  /**
   * Fog start.
   */
  get fogStart(): number {
    return this._fogStart;
  }

  set fogStart(value: number) {
    if (this._fogStart !== value) {
      this._computeLinearFogParams(value, this._fogEnd);
      this._fogStart = value;
    }
  }

  /**
   * Fog end.
   */
  get fogEnd(): number {
    return this._fogEnd;
  }

  set fogEnd(value: number) {
    if (this._fogEnd !== value) {
      this._computeLinearFogParams(this._fogStart, value);
      this._fogEnd = value;
    }
  }

  /**
   * Fog density.
   */
  get fogDensity(): number {
    return this._fogDensity;
  }

  set fogDensity(value: number) {
    if (this._fogDensity !== value) {
      this._computeExponentialFogParams(value);
      this._fogDensity = value;
    }
  }

  /**
   * Count of root entities.
   */
  get rootEntitiesCount(): number {
    return this._rootEntities.length;
  }

  /**
   * Root entity collection.
   */
  get rootEntities(): Readonly<Entity[]> {
    return this._rootEntities;
  }

  /**
   * The explicit sun light; null or undefined enables automatic selection.
   */
  get sun(): DirectLight | null | undefined {
    return this._sun;
  }

  set sun(light: DirectLight | null) {
    this._sun = light;
  }

  /**
   * Whether to enable transparent shadow.
   */
  get enableTransparentShadow(): boolean {
    return this._enableTransparentShadow;
  }

  set enableTransparentShadow(value: boolean) {
    if (value !== this._enableTransparentShadow) {
      this._enableTransparentShadow = value;
      if (value) {
        this.shaderData.enableMacro("SCENE_ENABLE_TRANSPARENT_SHADOW");
      } else {
        this.shaderData.disableMacro("SCENE_ENABLE_TRANSPARENT_SHADOW");
      }
    }
  }

  /**
   * Create scene.
   * @param engine - Engine
   * @param name - Name
   */
  constructor(engine: Engine, name?: string) {
    super(engine);
    this.name = name || "";

    const shaderData = this.shaderData;
    shaderData._addReferCount(1);
    this.ambientLight = new AmbientLight(engine);
    engine.sceneManager._allCreatedScenes.push(this);

    shaderData.enableMacro("SCENE_FOG_MODE", this._fogMode.toString());
    shaderData.enableMacro("SCENE_SHADOW_CASCADED_COUNT", this.shadowCascades.toString());
    shaderData.setColor(Scene._fogColorProperty, this._fogColor);
    shaderData.setVector4(Scene._fogParamsProperty, this._fogParams);
    shaderData.setTexture(Scene._prefilterdDFGProperty, engine._basicResources.prefilteredDFGTexture);

    this._computeLinearFogParams(this._fogStart, this._fogEnd);
    this._computeExponentialFogParams(this._fogDensity);
  }

  /**
   * Create root entity.
   * @param name - Entity name
   * @returns Entity
   */
  createRootEntity(name?: string): Entity {
    const entity = new Entity(this._engine, name);
    this.addRootEntity(entity);
    return entity;
  }

  /**
   * Append an entity.
   * @param entity - The root entity to add
   */
  addRootEntity(entity: Entity): void;

  /**
   * Append an entity.
   * @param index - specified index
   * @param entity - The root entity to add
   */
  addRootEntity(index: number, entity: Entity): void;

  addRootEntity(indexOrChild: number | Entity, entity?: Entity): void {
    let index: number | undefined;
    if (typeof indexOrChild === "number") {
      index = indexOrChild;
    } else {
      index = undefined;
      entity = indexOrChild;
    }

    const rootEntity = entity!;
    const oldScene = rootEntity._scene;
    const oldParent = rootEntity.parent;
    const wasRoot = rootEntity._isRoot;

    // Validate index bounds up front before any side effects
    if (index !== undefined && (oldScene !== this || !wasRoot)) {
      const rootCount = this._rootEntities.length;
      if (index < 0 || index > rootCount) {
        throw `The index ${index} is out of child list bounds ${rootCount}`;
      }
    }

    // Deactivate before mutating ownership lists so callbacks observe consistent ownership
    let inActiveChangeFlag = ActiveChangeFlag.None;
    if (rootEntity._isActiveInHierarchy) {
      this._isActiveInEngine || (inActiveChangeFlag |= ActiveChangeFlag.Hierarchy);
    }

    // Cross scene should inActive first and then active
    rootEntity._isActiveInScene && oldScene !== this && (inActiveChangeFlag |= ActiveChangeFlag.Scene);

    let inActiveError: unknown;
    let hasInActiveError = false;
    if (inActiveChangeFlag) {
      try {
        rootEntity._processInActive(inActiveChangeFlag);
      } catch (error) {
        inActiveError = error;
        hasInActiveError = true;
      }
    }

    if (
      !rootEntity.destroyed &&
      rootEntity._scene === oldScene &&
      rootEntity.parent === oldParent &&
      rootEntity._isRoot === wasRoot
    ) {
      if (oldScene !== this || !wasRoot) {
        let detachedParent: Entity | null = null;
        if (wasRoot) {
          oldScene && Entity._removeFromChildren(oldScene._rootEntities, rootEntity);
        } else {
          detachedParent = rootEntity._detachFromParent();
          rootEntity._isRoot = true;
        }
        const targetIndex = index !== undefined ? Math.min(index, this._rootEntities.length) : undefined;
        Entity._addToChildren(this._rootEntities, rootEntity, targetIndex);
        if (oldScene !== this) {
          Entity._traverseSetOwnerScene(rootEntity, this);
        }
        if (detachedParent != null) {
          detachedParent._dispatchModify(EntityModifyFlags.Child, detachedParent);
        }
        if (!wasRoot) {
          rootEntity._setParentChange();
        }
      }
    }

    if (hasInActiveError) {
      throw inActiveError;
    }

    let activeChangeFlag = ActiveChangeFlag.None;
    if (rootEntity._isActive && rootEntity._isRoot && rootEntity._scene === this && !rootEntity.destroyed) {
      if (this._isActiveInEngine) {
        !rootEntity._isActiveInHierarchy && (activeChangeFlag |= ActiveChangeFlag.Hierarchy);
      }
      (!rootEntity._isActiveInScene || oldScene !== this) && (activeChangeFlag |= ActiveChangeFlag.Scene);
    }
    activeChangeFlag && rootEntity._processActive(activeChangeFlag);
  }

  /**
   * Remove an entity.
   * @param entity - The root entity to remove
   */
  removeRootEntity(entity: Entity): void {
    if (entity._isRoot && entity._scene === this) {
      let inActiveChangeFlag = ActiveChangeFlag.None;
      this._isActiveInEngine && entity._isActiveInHierarchy && (inActiveChangeFlag |= ActiveChangeFlag.Hierarchy);
      entity._isActiveInScene && (inActiveChangeFlag |= ActiveChangeFlag.Scene);
      try {
        inActiveChangeFlag && entity._processInActive(inActiveChangeFlag);
      } finally {
        if (entity._isRoot && entity._scene === this) {
          Entity._removeFromChildren(this._rootEntities, entity);
          entity._isRoot = false;
          Entity._traverseSetOwnerScene(entity, null);
        }
      }
    }
  }

  /**
   * Get a root entity by index.
   * @param index - The zero-based root entity index
   * @returns The root entity at the index, or undefined if none exists
   */
  getRootEntity(index: number = 0): Entity | undefined {
    return this._rootEntities[index];
  }

  /**
   * Find entity globally by name.
   * @param name - Entity name
   * @returns Entity
   */
  findEntityByName(name: string): Entity | null {
    const rootEntities = this._rootEntities;
    for (let i = 0, n = rootEntities.length; i < n; i++) {
      const entity = rootEntities[i].findByName(name);
      if (entity) {
        return entity;
      }
    }
    return null;
  }

  /**
   * Find entity globally by name,use ‘/’ symbol as a path separator.
   * @param path - Entity's path
   * @returns Entity
   */
  findEntityByPath(path: string): Entity | null {
    const splits = path.split("/").filter(Boolean);
    if (!splits.length) {
      return null;
    }

    const searchRootName = splits.shift();
    for (let i = 0, n = this.rootEntitiesCount; i < n; i++) {
      let findEntity: Entity | null = this.getRootEntity(i)!;
      if (findEntity.name !== searchRootName) {
        continue;
      }

      if (splits.length) {
        findEntity = Entity._findChildByName(findEntity, 0, splits, 0);
        if (!findEntity) {
          continue;
        }
      }
      return findEntity;
    }
    return null;
  }

  /**
   * @internal
   */
  _processActive(active: boolean): void {
    this._isActiveInEngine = active;
    const rootEntities = this._rootEntities;
    for (let i = rootEntities.length - 1; i >= 0; i--) {
      const entity = rootEntities[i];
      if (entity._isActive) {
        if (active) {
          entity._processActive(ActiveChangeFlag.Hierarchy);
        } else {
          entity._processInActive(ActiveChangeFlag.Hierarchy);
        }
      }
    }
  }

  /**
   * @internal
   */
  _updateRendering(deltaTime: number): void {
    const componentsManager = this._componentsManager;
    componentsManager._particleSystemManager.update(deltaTime);
    componentsManager.callRendererOnUpdate(deltaTime);

    const shaderData = this.shaderData;
    const engine = this._engine;
    const lightManager = this._lightManager;

    engine.time._updateSceneShaderData(shaderData);
    lightManager._updateShaderData(this.shaderData);

    const sunlight = (this._lightManager._sunlight = this._getSunlight());

    if (sunlight) {
      lightManager._updateSunlightIndex(sunlight);
      shaderData.setColor(LightManager._sunlightColorProperty, sunlight.color);
      shaderData.setVector3(LightManager._sunlightDirectionProperty, sunlight.direction);
    } else {
      // @ts-ignore
      shaderData.setVector3(LightManager._sunlightDirectionProperty, Vector3._zero);
    }

    if (this.castShadows && sunlight && sunlight.shadowType !== ShadowType.None) {
      shaderData.enableMacro("SCENE_SHADOW_TYPE", sunlight.shadowType.toString());
    } else {
      shaderData.disableMacro("SCENE_SHADOW_TYPE");
    }
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();

    let firstError: unknown;
    let hasError = false;
    const runStep = (step: () => void): void => {
      try {
        step();
      } catch (error) {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
      }
    };

    // Remove from sceneManager
    const sceneManager = this._engine.sceneManager;
    runStep(() => sceneManager.removeScene(this));

    while (this.rootEntitiesCount > 0) {
      const root = this._rootEntities[0];
      try {
        root.destroy();
      } catch (error) {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
        if (this._rootEntities[0] === root) {
          Entity._removeFromChildren(this._rootEntities, root);
          root._isRoot = false;
          Entity._traverseSetOwnerScene(root, null);
        }
      }
    }
    runStep(() => this.background.destroy());
    runStep(() => this._ambientLight && this._ambientLight._removeFromScene(this));
    runStep(() => this.shaderData._addReferCount(-1));
    runStep(() => this._maskManager.destroy());

    const allCreatedScenes = sceneManager._allCreatedScenes;
    const sceneIndex = allCreatedScenes.indexOf(this);
    if (sceneIndex !== -1) {
      allCreatedScenes.splice(sceneIndex, 1);
    }

    runStep(() => this.physics._destroy());

    if (hasError) {
      throw firstError;
    }
  }

  private _computeLinearFogParams(fogStart: number, fogEnd: number): void {
    const fogRange = fogEnd - fogStart;
    const fogParams = this._fogParams;
    fogParams.x = -1 / fogRange;
    fogParams.y = fogEnd / fogRange;
  }

  private _computeExponentialFogParams(density: number) {
    this._fogParams.z = density / Math.LN2;
    this._fogParams.w = density / Math.sqrt(Math.LN2);
  }

  private _getSunlight(): DirectLight | null {
    let sunlight: DirectLight | null = null;

    if (this._sun) {
      sunlight = this._sun.enabled ? this._sun : null;
    } else {
      sunlight = this._lightManager._getMaxBrightestSunlight();
    }

    return sunlight;
  }
}
