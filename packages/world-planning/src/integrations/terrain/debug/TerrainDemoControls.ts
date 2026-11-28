import { Camera, Vector3, type Entity } from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls/dist/es/OrbitControl.js";
import type { TerrainLodRendererTuning } from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRendererRuntime";
import { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import type { TerrainWaterReflectionMode } from "../project/TerrainWaterRuntime.ts";

/** Named camera positions retained by the terrain demo shell. */
export type TerrainDemoCameraPose = "walk" | "overview" | "vegetation" | "water" | "river";

/** Optional Water-body visibility slots exposed by pages with multiple surface kinds. */
export type TerrainDemoWaterElementGroup = "lake" | "ocean";

/** Stable visibility slot shared by authored and generated Terrain pages. */
export type TerrainDemoElementGroup =
  | "terrain"
  | "details"
  | "trees"
  | "prefabs"
  | "water"
  | TerrainDemoWaterElementGroup;

/** Page-provided semantic label for one shared visibility slot. */
export interface TerrainDemoControlCapability {
  /** Stable semantic category exposed to DOM and diagnostics. */
  readonly category: string;
  /** User-facing bilingual control label. */
  readonly label: string;
}

/** Optional visibility bridge owned by the authored water integration. */
export interface TerrainDemoWaterControl {
  /** Whether water is currently visible. */
  readonly visible: boolean;
  /** Optional independent Water-body slots that replace the aggregate Water row in the inspector. */
  readonly visibilityGroups?: readonly TerrainDemoWaterElementGroup[];
  /** Requested runtime reflection policy. */
  readonly reflectionMode: TerrainWaterReflectionMode;
  /** Reflection modes with real runtime semantics; omitted when both canonical modes are available. */
  readonly supportedReflectionModes?: readonly TerrainWaterReflectionMode[];
  /**
   * Changes water visibility without rebuilding its resources.
   * @param visible Whether water should render.
   * @returns Nothing.
   */
  setVisible(visible: boolean): void;
  /** Returns the current visibility of one advertised Water-body slot. */
  isVisibilityGroupVisible?(group: TerrainDemoWaterElementGroup): boolean;
  /** Changes one advertised Water-body slot without rebuilding its resources. */
  setVisibilityGroupVisible?(group: TerrainDemoWaterElementGroup, visible: boolean): void;
  /**
   * Applies one reflection policy implemented by the Water runtime.
   * @param mode Requested Environment or SSR policy.
   * @returns Nothing.
   * @throws If the requested policy has no runtime implementation.
   */
  setReflectionMode(mode: TerrainWaterReflectionMode): void | Promise<void>;
}

/** Runtime accepting the shared mesh-LOD policy without exposing implementation-specific ownership. */
export interface TerrainDemoLodControl {
  /**
   * Applies one runtime-only LOD policy.
   * @param tuning Mesh-LOD enablement and projected-distance multiplier.
   * @returns Nothing.
   */
  setLodTuning(tuning: TerrainLodRendererTuning): void;
  /**
   * Returns the current runtime-only LOD policy.
   * @returns Mesh-LOD enablement and projected-distance multiplier.
   */
  getLodTuning(): TerrainLodRendererTuning;
}

/** Runtime accepting the shared projected-distance multiplier for non-mesh detail culling. */
export interface TerrainDemoDistanceCullingControl {
  /**
   * Applies the shared positive projected-distance multiplier.
   * @param distanceScale Positive projected-distance multiplier.
   * @returns Nothing.
   */
  setDistanceScale(distanceScale: number): void;
}

/** Availability of controls whose authored runtime may be absent from a page. */
export interface TerrainDemoControlAvailability {
  /** Whether the Terrain visibility owner is present. */
  readonly terrain: boolean;
  /** Whether the Detail visibility owner is present. */
  readonly details: boolean;
  /** Whether the tree or vegetation visibility owner is present. */
  readonly trees: boolean;
  /** Whether the placed-Prefab or page-equivalent visibility owner is present. */
  readonly prefabs: boolean;
  /** Whether the Water visibility owner is present. */
  readonly water: boolean;
  /** Whether the page exposes independent Lake visibility. */
  readonly lake: boolean;
  /** Whether the page exposes independent Ocean visibility. */
  readonly ocean: boolean;
  /** Whether at least one real mesh-LOD owner is present. */
  readonly lod: boolean;
  /** Whether Water implements more than one selectable reflection policy. */
  readonly waterReflection: boolean;
}

/** Runtime values exposed to the concise demo inspector. */
export interface TerrainDemoControlSnapshot {
  /** Active named camera pose. */
  pose: TerrainDemoCameraPose;
  /** Navigation speed in world metres per second. */
  movementSpeed: number;
  /** Whether every free-navigation pose follows the loaded terrain height. */
  groundCollision: boolean;
  /** Camera clearance above the sampled terrain in metres. */
  groundClearance: number;
  /** Whether authored tree and placed-Prefab LOD selection is active. */
  lodEnabled: boolean;
  /** Runtime multiplier applied to authored LOD projected-size thresholds. */
  lodDistanceScale: number;
  /** Whether the terrain geometry is visible. */
  terrain: boolean;
  /** Whether exact Detail placements are visible. */
  details: boolean;
  /** Whether tree instances are visible. */
  trees: boolean;
  /** Whether placed Prefabs are visible. */
  prefabs: boolean;
  /** Whether authored water is visible. */
  water: boolean;
  /** Whether Lake bodies are visible when independently exposed. */
  lake: boolean;
  /** Whether Ocean bodies are visible when independently exposed. */
  ocean: boolean;
  /** Requested Water reflection mode. */
  waterReflectionMode: TerrainWaterReflectionMode;
  /** Runtime-backed controls that may remain interactive on this page. */
  availability: TerrainDemoControlAvailability;
  /** Ordered element rows rendered by the shared inspector. */
  elementGroups: readonly TerrainDemoElementGroup[];
  /** Semantic labels and categories supplied by the current page. */
  capabilities: Readonly<Record<TerrainDemoElementGroup, TerrainDemoControlCapability>>;
}

/** Scene entities whose visibility remains user-controllable after the renderer implementation changes. */
export interface TerrainDemoControlsOptions {
  /** Scene camera receiving named poses. */
  camera: Camera;
  /** Optional world-space translation applied to the shared authored camera poses. */
  cameraWorldOffset?: readonly [x: number, y: number, z: number];
  /** Scene navigation component receiving movement speed and pose resynchronization. */
  navigation: TerrainNavigationRuntime;
  /** Optional page-owned orbit controller shared with non-panel camera modes. */
  orbitControl?: OrbitControl;
  /** Root entity that owns the Clipmap renderer. */
  terrain: Entity;
  /** Root entity that owns exact Detail batches. */
  details?: Entity;
  /** Root entity that owns tree instances. */
  trees?: Entity;
  /** Root entity that owns placed Prefabs. */
  prefabs?: Entity;
  /** Optional authored water visibility bridge. */
  water?: TerrainDemoWaterControl;
  /** Mesh runtimes receiving shared demo LOD controls. */
  lodControls?: readonly TerrainDemoLodControl[];
  /** Non-mesh runtimes receiving the shared demo distance multiplier. */
  distanceCullingControls?: readonly TerrainDemoDistanceCullingControl[];
  /** Optional semantic labels for page-specific implementations such as generated Rocks. */
  capabilities?: Partial<Record<TerrainDemoElementGroup, TerrainDemoControlCapability>>;
}

const DEFAULT_CONTROL_CAPABILITIES: Readonly<Record<TerrainDemoElementGroup, TerrainDemoControlCapability>> =
  Object.freeze({
    terrain: Object.freeze({ category: "terrain", label: "Terrain / 地形" }),
    details: Object.freeze({ category: "details", label: "Details / 花草" }),
    trees: Object.freeze({ category: "vegetation", label: "Trees / 树木" }),
    prefabs: Object.freeze({ category: "prefabs", label: "Prefabs / 场景物件" }),
    water: Object.freeze({ category: "water", label: "Water / 水体" }),
    lake: Object.freeze({ category: "lake", label: "Lake / 湖泊" }),
    ocean: Object.freeze({ category: "ocean", label: "Ocean / 海洋" })
  });

const BASE_ELEMENT_GROUPS = Object.freeze(["terrain", "details", "trees", "prefabs"] as const);

interface CameraPoseDefinition {
  readonly position: readonly [number, number, number];
  readonly target?: readonly [number, number, number];
  readonly rotationQuaternion?: readonly [number, number, number, number];
  readonly fieldOfView: number;
}

const CAMERA_POSES: Readonly<Record<TerrainDemoCameraPose, CameraPoseDefinition>> = {
  walk: {
    position: [1469.47, 26.538, 1765.59],
    rotationQuaternion: [0, 0.09289191663265228, 0, 0.9956761598587036],
    fieldOfView: 50
  },
  overview: {
    position: [1500, 140, 1835],
    target: [1500, 22, 1500],
    fieldOfView: 58
  },
  vegetation: {
    position: [1473, 20.7, 1749.5],
    target: [1473, 21.2, 1752.5],
    fieldOfView: 50
  },
  water: {
    position: [1480, 17.5, 1648],
    target: [1482, 12.2, 1578],
    fieldOfView: 44
  },
  river: {
    position: [1640, 48, 1765],
    target: [1535, 14, 1660],
    fieldOfView: 48
  }
};

/** Keeps demo-level camera and element controls independent from Terrain renderer internals. */
export class TerrainDemoControls {
  private readonly _options: TerrainDemoControlsOptions;
  private readonly _target = new Vector3();
  private readonly _orbitControl: OrbitControl;
  private readonly _ownsOrbitControl: boolean;
  private readonly _waterVisibilityGroups: readonly TerrainDemoWaterElementGroup[];
  private readonly _elementGroups: readonly TerrainDemoElementGroup[];
  private _pose: TerrainDemoCameraPose = "walk";
  private _groundCollision = true;
  private _lodTuning: TerrainLodRendererTuning;

  /**
   * Connects the stable demo shell to loaded Scene entities.
   * @param options Camera, navigation, and independently visible Scene roots.
   */
  constructor(options: TerrainDemoControlsOptions) {
    this._options = options;
    this._waterVisibilityGroups = resolveWaterVisibilityGroups(options.water);
    this._elementGroups = Object.freeze([
      ...BASE_ELEMENT_GROUPS,
      ...(this._waterVisibilityGroups.length > 0 ? this._waterVisibilityGroups : (["water"] as const))
    ]);
    this._lodTuning = { ...(options.lodControls?.[0]?.getLodTuning() ?? { enabled: false, distanceScale: 1 }) };
    options.navigation.setGroundCollision(true);
    options.navigation.setInputEnabled(true);
    const orbit = (this._orbitControl = options.orbitControl ?? options.camera.entity.addComponent(OrbitControl));
    this._ownsOrbitControl = options.orbitControl === undefined;
    orbit.enabled = false;
    orbit.minDistance = 10;
    orbit.maxDistance = 5000;
  }

  /**
   * Applies one named fixed camera position and keeps free navigation continuous afterwards.
   * @param pose Stable pose selected by the inspector.
   * @returns Nothing.
   */
  setPose(pose: TerrainDemoCameraPose): void {
    const definition = CAMERA_POSES[pose];
    const transform = this._options.camera.entity.transform;
    const offset = this._options.cameraWorldOffset ?? [0, 0, 0];
    this._options.navigation.setInputEnabled(false);
    this._orbitControl.enabled = false;
    transform.setPosition(
      definition.position[0] + offset[0],
      definition.position[1] + offset[1],
      definition.position[2] + offset[2]
    );
    if (definition.rotationQuaternion) transform.worldRotationQuaternion.set(...definition.rotationQuaternion);
    else if (definition.target) {
      this._target.set(
        definition.target[0] + offset[0],
        definition.target[1] + offset[1],
        definition.target[2] + offset[2]
      );
      transform.lookAt(this._target);
    }
    this._options.camera.fieldOfView = definition.fieldOfView;
    this._options.navigation.synchronizeView();
    const orbitPose = pose === "overview" || pose === "river";
    this._options.navigation.setGroundCollision(!orbitPose && this._groundCollision);
    if (orbitPose) {
      this._orbitControl.target.copyFrom(this._target);
      this._orbitControl.enabled = true;
    } else {
      this._options.navigation.setInputEnabled(true);
    }
    this._pose = pose;
  }

  /**
   * Updates free-flight movement speed.
   * @param speed Finite positive speed in world metres per second.
   * @returns Nothing.
   * @throws If speed is not finite and positive.
   */
  setMovementSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0)
      throw new RangeError("Terrain navigation speed must be finite and positive");
    this._options.navigation.movementSpeed = speed;
  }

  /**
   * Enables or disables terrain contact while a free-navigation camera pose is active.
   * @param enabled Whether non-overview navigation follows canonical terrain heights.
   * @returns Nothing.
   */
  setGroundCollision(enabled: boolean): void {
    this._groundCollision = enabled;
    this._options.navigation.setGroundCollision(this._pose !== "overview" && this._pose !== "river" && enabled);
  }

  /**
   * Updates the free-navigation camera's clearance above terrain.
   * @param height Positive eye height in metres.
   * @returns Nothing.
   */
  setGroundClearance(height: number): void {
    this._options.navigation.setEyeHeight(height);
  }

  /**
   * Releases panel-owned camera input while retaining a page-owned Orbit controller for another camera mode.
   * @returns Nothing.
   */
  suspendCameraInput(): void {
    this._options.navigation.setInputEnabled(false);
    this._orbitControl.enabled = false;
  }

  /**
   * Releases panel-owned camera components without destroying an injected page-owned Orbit controller.
   * @returns Nothing.
   */
  destroy(): void {
    this.suspendCameraInput();
    if (this._ownsOrbitControl) this._orbitControl.destroy();
  }

  /**
   * Applies one shared runtime-only LOD policy to trees and placed Prefabs.
   * @param enabled Whether authored LOD selection is active.
   * @param distanceScale Positive projected-size multiplier.
   * @returns Nothing.
   * @throws If no LOD runtime is available or `distanceScale` is not finite and positive.
   */
  setLodTuning(enabled: boolean, distanceScale: number): void {
    if (!Number.isFinite(distanceScale) || distanceScale <= 0) {
      throw new RangeError("Terrain demo LOD distance scale must be finite and positive.");
    }
    const tuning = { enabled, distanceScale };
    if (!this._options.lodControls?.length) throw new Error("Terrain demo does not own an LOD control.");
    for (const control of this._options.lodControls) control.setLodTuning(tuning);
    for (const control of this._options.distanceCullingControls ?? []) control.setDistanceScale(distanceScale);
    this._lodTuning = tuning;
  }

  /**
   * Changes one authored scene-element group without altering its loaded resources.
   * @param group Stable element group exposed by the inspector.
   * @param visible Whether the group should participate in the Scene.
   * @returns Nothing.
   * @throws If the current page has no runtime owner for `group`.
   */
  setElementVisible(group: TerrainDemoElementGroup, visible: boolean): void {
    if (group === "water") {
      if (!this._options.water) throw new Error("Terrain demo does not own a Water visibility control.");
      this._options.water.setVisible(visible);
      return;
    }
    if (group === "lake" || group === "ocean") {
      if (!this._waterVisibilityGroups.includes(group)) {
        throw new Error(`Terrain demo does not expose a ${group} visibility control.`);
      }
      this._options.water!.setVisibilityGroupVisible!(group, visible);
      return;
    }
    const entity = this._options[group];
    if (!entity) throw new Error(`Terrain demo does not own a ${group} visibility control.`);
    entity.isActive = visible;
  }

  /**
   * Switches Water between the reflection policies implemented by its current runtime.
   * @param mode Requested Environment or SSR policy.
   * @returns Nothing.
   * @throws If Water is unavailable or the runtime rejects `mode`.
   */
  async setWaterReflectionMode(mode: TerrainWaterReflectionMode): Promise<void> {
    if (!this._options.water) throw new Error("Terrain demo does not own a Water reflection control.");
    await this._options.water.setReflectionMode(mode);
  }

  /**
   * Returns detached values suitable for dat.gui and browser assertions.
   * @returns Current pose, navigation speed, and element visibility.
   */
  getSnapshot(): TerrainDemoControlSnapshot {
    const waterReflectionModes = this._options.water?.supportedReflectionModes;
    const capabilities = Object.fromEntries(
      (Object.keys(DEFAULT_CONTROL_CAPABILITIES) as TerrainDemoElementGroup[]).map((group) => [
        group,
        Object.freeze({ ...(this._options.capabilities?.[group] ?? DEFAULT_CONTROL_CAPABILITIES[group]) })
      ])
    ) as Record<TerrainDemoElementGroup, TerrainDemoControlCapability>;
    return {
      pose: this._pose,
      movementSpeed: this._options.navigation.movementSpeed,
      groundCollision: this._groundCollision,
      groundClearance: this._options.navigation.eyeHeight,
      lodEnabled: this._lodTuning.enabled,
      lodDistanceScale: this._lodTuning.distanceScale,
      terrain: this._options.terrain.isActive,
      details: this._options.details?.isActive ?? false,
      trees: this._options.trees?.isActive ?? false,
      prefabs: this._options.prefabs?.isActive ?? false,
      water: this._options.water?.visible ?? false,
      lake: this._waterVisibilityGroups.includes("lake")
        ? this._options.water!.isVisibilityGroupVisible!("lake")
        : false,
      ocean: this._waterVisibilityGroups.includes("ocean")
        ? this._options.water!.isVisibilityGroupVisible!("ocean")
        : false,
      waterReflectionMode: this._options.water?.reflectionMode ?? "environment",
      availability: {
        terrain: true,
        details: this._options.details !== undefined,
        trees: this._options.trees !== undefined,
        prefabs: this._options.prefabs !== undefined,
        water: this._options.water !== undefined,
        lake: this._waterVisibilityGroups.includes("lake"),
        ocean: this._waterVisibilityGroups.includes("ocean"),
        lod: Boolean(this._options.lodControls?.length),
        waterReflection: this._options.water !== undefined && (waterReflectionModes?.length ?? 2) > 1
      },
      elementGroups: this._elementGroups,
      capabilities: Object.freeze(capabilities)
    };
  }
}

function resolveWaterVisibilityGroups(
  water: TerrainDemoWaterControl | undefined
): readonly TerrainDemoWaterElementGroup[] {
  const advertised = water?.visibilityGroups;
  if (!water || !advertised?.length) return Object.freeze([]);
  if (!water.isVisibilityGroupVisible || !water.setVisibilityGroupVisible) {
    throw new Error("Terrain Water visibility groups require read and write controls.");
  }
  return Object.freeze([...new Set(advertised)]);
}
