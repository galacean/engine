import { Color, Vector3, Vector4 } from "@galacean/engine-math";
import { Background } from "./Background";
import { ComponentsManager } from "./ComponentsManager";
import { Engine } from "./Engine";
import { Entity } from "./Entity";
import { MaskManager } from "./RenderPipeline/MaskManager";
import { SceneManager } from "./SceneManager";
import { EngineObject, Logger } from "./base";
import { ActiveChangeFlag } from "./enums/ActiveChangeFlag";
import { FogMode } from "./enums/FogMode";
import { DirectLight } from "./lighting";
import { AmbientLight } from "./lighting/AmbientLight";
import { LightManager } from "./lighting/LightManager";
import { PhysicsScene } from "./physics/PhysicsScene";
import { PostProcessManager } from "./postProcess";
import { ShaderProperty } from "./shader";
import { ShaderData } from "./shader/ShaderData";
import { ShaderMacroCollection } from "./shader/ShaderMacroCollection";
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

  /* @internal */
  _lightManager: LightManager = new LightManager();
  /* @internal */
  _componentsManager: ComponentsManager = new ComponentsManager();
  /** @internal */
  _maskManager: MaskManager = new MaskManager();
  /** @internal */
  _isActiveInEngine: boolean = false;
  /** @internal */
  _sceneManager: SceneManager;
  /** @internal */
  _globalShaderMacro: ShaderMacroCollection = new ShaderMacroCollection();
  /** @internal */
  _rootEntities: Entity[] = [];

  private _background: Background = new Background(this._engine);
  private _shaderData: ShaderData = new ShaderData(ShaderDataGroup.Scene);
  private _shadowCascades: ShadowCascadesMode = ShadowCascadesMode.NoCascades;
  private _ambientLight: AmbientLight;
  private _fogMode: FogMode = FogMode.None;
  private _fogColor: Color = new Color(0.5, 0.5, 0.5, 1.0);
  private _fogStart: number = 0;
  private _fogEnd: number = 300;
  private _fogDensity: number = 0.01;
  private _fogParams: Vector4 = new Vector4();
  private _isActive: boolean = true;
  private _sun: DirectLight | null;
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
   * Sun light source.
   * @remarks If set this to null, scene will use the brightest directional light.
   */
  get sun(): DirectLight | null {
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
    let index: number;
    if (typeof indexOrChild === "number") {
      index = indexOrChild;
    } else {
      index = undefined;
      entity = indexOrChild;
    }

    const isRoot = entity._isRoot;
    // Let entity become root
    if (!isRoot) {
      entity._isRoot = true;
      entity._removeFromParent();
      entity._setParentChange();
    }

    // Add or remove from scene's rootEntities
    const oldScene = entity._scene;
    if (oldScene !== this) {
      if (oldScene && isRoot) {
        Entity._removeFormChildren(oldScene._rootEntities, entity);
      }
      Entity._addToChildren(this._rootEntities, entity, index);
    } else if (!isRoot) {
      Entity._addToChildren(this._rootEntities, entity, index);
    }

    // Process entity active/inActive
    let inActiveChangeFlag = ActiveChangeFlag.None;
    if (entity._isActiveInHierarchy) {
      this._isActiveInEngine || (inActiveChangeFlag |= ActiveChangeFlag.Hierarchy);
    }

    // Cross scene should inActive first and then active
    entity._isActiveInScene && oldScene !== this && (inActiveChangeFlag |= ActiveChangeFlag.Scene);

    inActiveChangeFlag && entity._processInActive(inActiveChangeFlag);

    if (oldScene !== this) {
      Entity._traverseSetOwnerScene(entity, this);
    }

    let activeChangeFlag = ActiveChangeFlag.None;
    if (entity._isActive) {
      if (this._isActiveInEngine) {
        !entity._isActiveInHierarchy && (activeChangeFlag |= ActiveChangeFlag.Hierarchy);
      }
      (!entity._isActiveInScene || oldScene !== this) && (activeChangeFlag |= ActiveChangeFlag.Scene);
    }
    activeChangeFlag && entity._processActive(activeChangeFlag);
  }

  /**
   * Remove an entity.
   * @param entity - The root entity to remove
   */
  removeRootEntity(entity: Entity): void {
    if (entity._isRoot && entity._scene == this) {
      Entity._removeFormChildren(this._rootEntities, entity);
      entity._isRoot = false;
      let inActiveChangeFlag = ActiveChangeFlag.None;
      this._isActiveInEngine && entity._isActiveInHierarchy && (inActiveChangeFlag |= ActiveChangeFlag.Hierarchy);
      entity._isActiveInScene && (inActiveChangeFlag |= ActiveChangeFlag.Scene);
      inActiveChangeFlag && entity._processInActive(inActiveChangeFlag);
      Entity._traverseSetOwnerScene(entity, null);
    }
  }

  /**
   * Get root entity from index.
   * @param index - Index
   * @returns Entity
   */
  getRootEntity(index: number = 0): Entity | null {
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
      let findEntity = this.getRootEntity(i);
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
  _updateShaderData(): void {
    const shaderData = this.shaderData;
    const engine = this._engine;
    const lightManager = this._lightManager;

    engine.time._updateSceneShaderData(shaderData);
    lightManager._updateShaderData(this.shaderData);

    const sunlight = (this._lightManager._sunlight = this._getSunlight());

    if (sunlight) {
      lightManager._updateSunlightIndex(sunlight);
      shaderData.setColor(LightManager._sunlightColorProperty, sunlight._lightColor);
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

    // union scene and camera macro.
    ShaderMacroCollection.unionCollection(
      this.engine._macroCollection,
      shaderData._macroCollection,
      this._globalShaderMacro
    );
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();

    // Remove from sceneManager
    const sceneManager = this._engine.sceneManager;
    sceneManager.removeScene(this);

    while (this.rootEntitiesCount > 0) {
      this._rootEntities[0].destroy();
    }
    this.background.destroy();
    this._ambientLight && this._ambientLight._removeFromScene(this);
    this.shaderData._addReferCount(-1);
    this._componentsManager.handlingInvalidScripts();
    this._maskManager.destroy();

    const allCreatedScenes = sceneManager._allCreatedScenes;
    allCreatedScenes.splice(allCreatedScenes.indexOf(this), 1);
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
    let sunlight = null;

    if (this._sun) {
      sunlight = this._sun.enabled ? this._sun : null;
    } else {
      sunlight = this._lightManager._getMaxBrightestSunlight();
    }

    return sunlight;
  }
}
