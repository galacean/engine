import {
  AssetType,
  Camera,
  DirectLight,
  Engine,
  FogMode,
  Material,
  MeshRenderer,
  type Entity,
  type ProbeVolume,
  Scene,
  ShaderProperty,
  ShadowType,
  Vector2
} from "@galacean/engine";
import type { TerrainClipmap } from "../clipmap/TerrainClipmap";

/** Renderer capability with an independent production and core-diagnostics Shader. */
export type TerrainDebugCapability = "terrain" | "surface" | "vegetation";

/** Core debug outputs shared by all three material capabilities. */
export type TerrainSharedDebugView =
  | "final-lit"
  | "albedo"
  | "geometry-normal"
  | "shading-normal"
  | "direct-light"
  | "environment-light"
  | "shadow-attenuation";

/** Core Terrain-only debug outputs. */
export type TerrainGeometryDebugView =
  | TerrainSharedDebugView
  | "source-height"
  | "rendered-height"
  | "height-error"
  | "region-seam"
  | "layer-weights"
  | "holes"
  | "clipmap-lod"
  | "sampling-mip";

/** Core Surface-only debug outputs. */
export type TerrainSurfaceDebugView = TerrainSharedDebugView | "lod-fade";

/** Core Vegetation-only debug outputs. */
export type TerrainVegetationDebugView =
  | TerrainSurfaceDebugView
  | "alpha"
  | "alpha-cutoff"
  | "wind-weight"
  | "wind-displacement"
  | "dither-threshold"
  | "geometry-parity";

/** Current runtime-debug state detached from renderer and Material objects. */
export interface TerrainRuntimeDebugSnapshot {
  /** Whether core diagnostic Materials currently replace production Materials. */
  enabled: boolean;
  /** Selected Terrain diagnostic output. */
  terrainView: TerrainGeometryDebugView;
  /** Selected ordinary Surface diagnostic output. */
  surfaceView: TerrainSurfaceDebugView;
  /** Selected alpha-cutout Vegetation diagnostic output. */
  vegetationView: TerrainVegetationDebugView;
  /** Whether Clipmap line-topology companions are visible. */
  wireframe: boolean;
  /** Whether the authored post-processing profile is applied by the Scene camera. */
  postProcess: boolean;
  /** Current direct, environment, shadow, and fog switches. */
  lighting: {
    direct: boolean;
    environment: boolean;
    shadows: boolean;
    fog: boolean;
  };
  /** Number of bound renderer material slots by capability. */
  bindings: Record<TerrainDebugCapability, number>;
}

/** Minimal post-processing control required by runtime diagnostics. */
export interface TerrainPostProcessDebugControl {
  /** Whether the authored profile is currently active. */
  readonly profileEnabled: boolean;

  /**
   * Enables or disables the authored profile without rebuilding the camera pipeline.
   * @param enabled Whether the authored profile should be active.
   * @returns Nothing.
   */
  setProfileEnabled(enabled: boolean): void;
}

/** Scene-lighting visibility owner shared by runtime diagnostics and day/night authoring. */
export interface TerrainLightingVisibilityControl {
  /**
   * Returns direct, environment, shadow, and fog visibility.
   * @returns Detached visibility values.
   */
  getVisibility(): TerrainRuntimeDebugSnapshot["lighting"];
  /**
   * Applies partial visibility without replacing evaluated lighting values.
   * @param values Visibility values to replace.
   * @returns Nothing.
   */
  setVisibility(values: Partial<TerrainRuntimeDebugSnapshot["lighting"]>): void;
}

/** Inputs required to bind the demo's concise runtime diagnostics. */
export interface TerrainRuntimeDebugOptions {
  /** Loaded Scene whose MeshRenderers are inspected by explicit Shader capability. */
  scene: Scene;
  /** Optional page-owned roots which limit renderer discovery to the active generated world. */
  roots?: readonly Entity[];
  /** Active Geometry Clipmap used for the line-topology diagnostic. */
  clipmap: TerrainClipmap;
  /** Scene-owned directional light controlled by the four-state lighting check. */
  directLight: DirectLight;
  /** Scene-owned camera whose post-processing stage can be isolated during diagnostics. */
  camera: Camera;
  /** Optional Scene-owned profile controller that can isolate effects without rebuilding the camera pipeline. */
  postProcessRuntime?: TerrainPostProcessDebugControl;
  /** Optional lighting owner that preserves diagnostic visibility across day/night updates. */
  lightingControl?: TerrainLightingVisibilityControl;
  /** Minimum and maximum decoded heights across the active canonical Regions. */
  heightRange: readonly [number, number];
}

interface DebugMaterialTemplates {
  billboard: Material;
  terrain: Material;
  surface: Material;
  vegetation: Material;
}

type DebugMaterialTemplate = keyof DebugMaterialTemplates;

interface ProductionShaderDebugBinding {
  capability: TerrainDebugCapability;
  template: DebugMaterialTemplate;
}

interface RendererMaterialBinding {
  renderer: MeshRenderer;
  index: number;
  capability: TerrainDebugCapability;
  production: Material;
  diagnostic: Material;
}

const DEBUG_VIEW_PROPERTY = ShaderProperty.getByName("material_DebugView");
const DEBUG_HEIGHT_RANGE_PROPERTY = ShaderProperty.getByName("material_DebugHeightRange");

const PRODUCTION_SHADER_DEBUG_BINDING: Readonly<Record<string, ProductionShaderDebugBinding>> = {
  "Terrain/Billboard": { capability: "vegetation", template: "billboard" },
  "Terrain/Terrain": { capability: "terrain", template: "terrain" },
  "Terrain/Surface": { capability: "surface", template: "surface" },
  "Terrain/Vegetation": { capability: "vegetation", template: "vegetation" }
};

const DEBUG_VIEW_VALUE: Readonly<Record<TerrainVegetationDebugView | TerrainGeometryDebugView, number>> = {
  "final-lit": 0,
  albedo: 1,
  "geometry-normal": 2,
  "shading-normal": 3,
  "direct-light": 4,
  "environment-light": 5,
  "shadow-attenuation": 6,
  "lod-fade": 7,
  "source-height": 7,
  "rendered-height": 8,
  alpha: 8,
  "height-error": 9,
  "alpha-cutoff": 9,
  "region-seam": 10,
  "wind-weight": 10,
  "layer-weights": 11,
  "wind-displacement": 11,
  holes: 12,
  "dither-threshold": 12,
  "clipmap-lod": 13,
  "geometry-parity": 13,
  "sampling-mip": 14
};

const DEBUG_MATERIAL_PATHS: Readonly<Record<DebugMaterialTemplate, string>> = {
  billboard: "Material/Debug/Core/Billboard.mat",
  terrain: "Material/Debug/Core/Terrain.mat",
  surface: "Material/Debug/Core/Surface.mat",
  vegetation: "Material/Debug/Core/Vegetation.mat"
};

/**
 * Reversibly binds concise core diagnostics to the loaded demo without adding debug branches to production Shaders.
 */
export class TerrainRuntimeDebug {
  private readonly _scene: Scene;
  private readonly _roots: readonly Entity[] | null;
  private readonly _clipmap: TerrainClipmap;
  private readonly _directLight: DirectLight;
  private readonly _camera: Camera;
  private readonly _postProcessRuntime: TerrainPostProcessDebugControl | null;
  private readonly _lightingControl: TerrainLightingVisibilityControl | null;
  private readonly _initialLightingVisibility: TerrainRuntimeDebugSnapshot["lighting"] | null;
  private readonly _templates: DebugMaterialTemplates;
  private readonly _heightRange: Vector2;
  private readonly _initialLighting: {
    direct: boolean;
    diffuseIntensity: number;
    specularIntensity: number;
    castShadows: boolean;
    shadowType: ShadowType;
    fogMode: FogMode;
    probeVolume: ProbeVolume | undefined;
    postProcess: boolean;
  };
  private readonly _views: {
    terrain: TerrainGeometryDebugView;
    surface: TerrainSurfaceDebugView;
    vegetation: TerrainVegetationDebugView;
  } = {
    terrain: "final-lit",
    surface: "final-lit",
    vegetation: "final-lit"
  };
  private _bindings: RendererMaterialBinding[] = [];
  private _diagnosticMaterials: Material[] = [];
  private _enabled = false;
  private _wireframe = false;
  private _destroyed = false;

  private constructor(options: TerrainRuntimeDebugOptions, templates: DebugMaterialTemplates) {
    this._scene = options.scene;
    this._roots = options.roots ? [...options.roots] : null;
    this._clipmap = options.clipmap;
    this._directLight = options.directLight;
    this._camera = options.camera;
    this._postProcessRuntime = options.postProcessRuntime ?? null;
    this._lightingControl = options.lightingControl ?? null;
    this._initialLightingVisibility = this._lightingControl?.getVisibility() ?? null;
    this._templates = templates;
    this._heightRange = new Vector2(options.heightRange[0], options.heightRange[1]);
    const ambient = options.scene.ambientLight;
    this._initialLighting = {
      direct: options.directLight.enabled,
      diffuseIntensity: ambient.diffuseIntensity,
      specularIntensity: ambient.specularIntensity,
      castShadows: options.scene.castShadows,
      shadowType: options.directLight.shadowType,
      fogMode: options.scene.fogMode,
      probeVolume: options.scene.environmentLighting.probeVolume,
      postProcess: this._postProcessRuntime?.profileEnabled ?? options.camera.enablePostProcess
    };
    this.refreshBindings();
  }

  /**
   * Loads the four declared core diagnostic Materials through the standard Project resource map.
   * @param engine Engine whose Project has already initialized its virtual resources.
   * @param options Scene, renderer, light, and canonical height range to inspect.
   * @returns A ready runtime-debug controller with production rendering left enabled.
   * @throws If a declared diagnostic Material cannot be loaded.
   */
  static async create(engine: Engine, options: TerrainRuntimeDebugOptions): Promise<TerrainRuntimeDebug> {
    const [billboard, terrain, surface, vegetation] = await Promise.all([
      engine.resourceManager.load<Material>({ type: AssetType.Material, url: DEBUG_MATERIAL_PATHS.billboard }),
      engine.resourceManager.load<Material>({ type: AssetType.Material, url: DEBUG_MATERIAL_PATHS.terrain }),
      engine.resourceManager.load<Material>({ type: AssetType.Material, url: DEBUG_MATERIAL_PATHS.surface }),
      engine.resourceManager.load<Material>({ type: AssetType.Material, url: DEBUG_MATERIAL_PATHS.vegetation })
    ]);
    if (!billboard || !terrain || !surface || !vegetation) {
      throw new Error("Core terrain diagnostic Materials failed to load");
    }
    return new TerrainRuntimeDebug(options, { billboard, terrain, surface, vegetation });
  }

  /**
   * Rebuilds explicit renderer-slot bindings from current production Shader names.
   * @returns Number of material slots that support core diagnostics.
   * @throws If called after destruction.
   */
  refreshBindings(): number {
    this._assertAlive();
    const wasEnabled = this._enabled;
    if (wasEnabled) this._restoreProductionMaterials();
    for (const material of this._diagnosticMaterials) material.destroy();
    this._diagnosticMaterials = [];
    this._bindings = [];
    const diagnosticsByProduction = new Map<Material, Material>();

    for (const root of this._roots ?? this._scene.rootEntities) {
      const renderers: MeshRenderer[] = [];
      root.getComponentsIncludeChildren(MeshRenderer, renderers);
      for (const renderer of renderers) {
        renderer.getMaterials().forEach((material, index) => {
          const debugBinding = material ? PRODUCTION_SHADER_DEBUG_BINDING[material.shader.name] : undefined;
          if (!material || !debugBinding) return;
          const { capability, template } = debugBinding;
          let diagnostic = diagnosticsByProduction.get(material);
          if (!diagnostic) {
            diagnostic = material.clone();
            diagnostic.name = `${material.name} (Core diagnostics)`;
            diagnostic.shader = this._templates[template].shader;
            diagnostic.shaderData.setFloat(DEBUG_VIEW_PROPERTY, DEBUG_VIEW_VALUE[this._views[capability]]);
            if (capability === "terrain") {
              diagnostic.shaderData.setVector2(DEBUG_HEIGHT_RANGE_PROPERTY, this._heightRange);
            }
            diagnosticsByProduction.set(material, diagnostic);
            this._diagnosticMaterials.push(diagnostic);
          }
          this._bindings.push({ renderer, index, capability, production: material, diagnostic });
        });
      }
    }
    if (wasEnabled) this._applyDiagnosticMaterials();
    return this._bindings.length;
  }

  /**
   * Enables or disables diagnostic Material replacement while preserving production Material identity.
   * @param enabled Whether diagnostic Materials should be bound.
   * @returns Nothing.
   * @throws If called after destruction.
   */
  setEnabled(enabled: boolean): void {
    this._assertAlive();
    if (enabled === this._enabled) return;
    this._enabled = enabled;
    if (enabled) this._applyDiagnosticMaterials();
    else this._restoreProductionMaterials();
  }

  /**
   * Selects the core Terrain output and updates already-created diagnostic Materials.
   * @param view Terrain diagnostic output.
   * @returns Nothing.
   * @throws If called after destruction.
   */
  setTerrainView(view: TerrainGeometryDebugView): void {
    this._setView("terrain", view);
  }

  /**
   * Selects the core ordinary-Surface output and updates already-created diagnostic Materials.
   * @param view Surface diagnostic output.
   * @returns Nothing.
   * @throws If called after destruction.
   */
  setSurfaceView(view: TerrainSurfaceDebugView): void {
    this._setView("surface", view);
  }

  /**
   * Selects the core alpha-cutout Vegetation output and updates already-created diagnostic Materials.
   * @param view Vegetation diagnostic output.
   * @returns Nothing.
   * @throws If called after destruction.
   */
  setVegetationView(view: TerrainVegetationDebugView): void {
    this._setView("vegetation", view);
  }

  /**
   * Shows or hides Clipmap line topology generated from the production height path.
   * @param enabled Whether the line-topology companions are visible.
   * @returns Nothing.
   * @throws If called after destruction.
   */
  setWireframe(enabled: boolean): void {
    this._assertAlive();
    this._wireframe = enabled;
    this._clipmap.setWireframe(enabled);
  }

  /**
   * Enables or disables the Scene directional light.
   * @param enabled Whether direct radiance is present.
   * @returns Nothing.
   * @throws If called after destruction.
   */
  setDirectLightEnabled(enabled: boolean): void {
    this._assertAlive();
    if (this._lightingControl) this._lightingControl.setVisibility({ direct: enabled });
    else this._directLight.enabled = enabled;
  }

  /**
   * Enables or disables diffuse, specular, and probe environment lighting without changing the sky background.
   * @param enabled Whether the authored environment intensities are applied.
   * @returns Nothing.
   * @throws If called after destruction.
   */
  setEnvironmentEnabled(enabled: boolean): void {
    this._assertAlive();
    if (this._lightingControl) {
      this._lightingControl.setVisibility({ environment: enabled });
      return;
    }
    const ambient = this._scene.ambientLight;
    ambient.diffuseIntensity = enabled ? this._initialLighting.diffuseIntensity : 0;
    ambient.specularIntensity = enabled ? this._initialLighting.specularIntensity : 0;
    this._scene.environmentLighting.probeVolume = enabled ? this._initialLighting.probeVolume : undefined;
  }

  /**
   * Enables or disables authored scene fog so lighting combinations can be inspected without atmospheric color.
   * @param enabled Whether the authored fog mode is applied.
   * @returns Nothing.
   * @throws If called after destruction.
   */
  setFogEnabled(enabled: boolean): void {
    this._assertAlive();
    if (this._lightingControl) this._lightingControl.setVisibility({ fog: enabled });
    else this._scene.fogMode = enabled ? this._initialLighting.fogMode : FogMode.None;
  }

  /**
   * Enables or disables shadow casting and sampling while leaving direct radiance independently controllable.
   * @param enabled Whether the authored shadow mode is applied.
   * @returns Nothing.
   * @throws If called after destruction.
   */
  setShadowsEnabled(enabled: boolean): void {
    this._assertAlive();
    if (this._lightingControl) {
      this._lightingControl.setVisibility({ shadows: enabled });
      return;
    }
    this._scene.castShadows = enabled && this._initialLighting.castShadows;
    this._directLight.shadowType = enabled ? this._initialLighting.shadowType : ShadowType.None;
  }

  /**
   * Enables or disables the authored camera post-processing stage without changing its profile.
   * @param enabled Whether post-processing should be applied.
   * @returns Nothing.
   * @throws If called after destruction.
   */
  setPostProcessEnabled(enabled: boolean): void {
    this._assertAlive();
    if (this._postProcessRuntime) this._postProcessRuntime.setProfileEnabled(enabled);
    else this._camera.enablePostProcess = enabled;
  }

  /**
   * Returns a detached snapshot for UI readouts and deterministic browser checks.
   * @returns Current views, lighting switches, wireframe state, and binding counts.
   */
  getSnapshot(): TerrainRuntimeDebugSnapshot {
    this._assertAlive();
    const ambient = this._scene.ambientLight;
    const bindings: Record<TerrainDebugCapability, number> = { terrain: 0, surface: 0, vegetation: 0 };
    for (const binding of this._bindings) bindings[binding.capability]++;
    const lighting = this._lightingControl?.getVisibility();
    return {
      enabled: this._enabled,
      terrainView: this._views.terrain,
      surfaceView: this._views.surface,
      vegetationView: this._views.vegetation,
      wireframe: this._wireframe,
      postProcess: this._postProcessRuntime?.profileEnabled ?? this._camera.enablePostProcess,
      lighting: lighting ?? {
        direct: this._directLight.enabled,
        environment:
          ambient.diffuseIntensity > 0 ||
          ambient.specularIntensity > 0 ||
          this._scene.environmentLighting.probeVolume !== undefined,
        shadows: this._scene.castShadows && this._directLight.shadowType !== ShadowType.None,
        fog: this._scene.fogMode !== FogMode.None
      },
      bindings
    };
  }

  /** Restores production Materials and authored lighting, then releases cloned diagnostic Materials. */
  destroy(): void {
    if (this._destroyed) return;
    this._restoreProductionMaterials();
    this._clipmap.setWireframe(false);
    if (this._lightingControl && this._initialLightingVisibility) {
      this._lightingControl.setVisibility(this._initialLightingVisibility);
    } else {
      this._directLight.enabled = this._initialLighting.direct;
      this._directLight.shadowType = this._initialLighting.shadowType;
      this._scene.castShadows = this._initialLighting.castShadows;
      this._scene.ambientLight.diffuseIntensity = this._initialLighting.diffuseIntensity;
      this._scene.ambientLight.specularIntensity = this._initialLighting.specularIntensity;
      this._scene.environmentLighting.probeVolume = this._initialLighting.probeVolume;
      this._scene.fogMode = this._initialLighting.fogMode;
    }
    if (this._postProcessRuntime) this._postProcessRuntime.setProfileEnabled(this._initialLighting.postProcess);
    else this._camera.enablePostProcess = this._initialLighting.postProcess;
    for (const material of this._diagnosticMaterials) material.destroy();
    this._diagnosticMaterials = [];
    this._bindings = [];
    this._destroyed = true;
  }

  private _setView(
    capability: TerrainDebugCapability,
    view: TerrainGeometryDebugView | TerrainSurfaceDebugView | TerrainVegetationDebugView
  ): void {
    this._assertAlive();
    this._views[capability] = view as never;
    const value = DEBUG_VIEW_VALUE[view];
    for (const binding of this._bindings) {
      if (binding.capability === capability) binding.diagnostic.shaderData.setFloat(DEBUG_VIEW_PROPERTY, value);
    }
  }

  private _applyDiagnosticMaterials(): void {
    for (const binding of this._bindings) binding.renderer.setMaterial(binding.index, binding.diagnostic);
  }

  private _restoreProductionMaterials(): void {
    for (const binding of this._bindings) {
      if (binding.renderer.destroyed || binding.renderer.pendingDestroy) continue;
      if (binding.renderer.getMaterial(binding.index) === binding.diagnostic) {
        binding.renderer.setMaterial(binding.index, binding.production);
      }
    }
  }

  private _assertAlive(): void {
    if (this._destroyed) throw new Error("Terrain runtime diagnostics have been destroyed");
  }
}
