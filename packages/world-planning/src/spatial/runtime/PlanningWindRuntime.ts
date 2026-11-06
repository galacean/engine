import {
  Script,
  Vector3,
  WeatherPresets,
  registerWindGpuFieldShaders,
  type Camera,
  type Engine,
  type Entity
} from "@galacean/engine";
import sceneSource from "@galacean/engine-terrain/data/seed-world/public/Scene/SeedWorld.scene?raw";
import type { TerrainHeightGpuSamplingSource } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmapMaterial";
import {
  TerrainWindGpuExposureProvider,
  registerTerrainWindGpuExposureShader
} from "../../integrations/terrain/environment/TerrainWindGpuExposureProvider.ts";
import { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import { SeedWorldGroundWindTuningRuntime } from "@galacean/engine-vegetation/world/SeedWorldGroundWindTuning";

/** Live published-terrain readers; the wind adapter borrows the Clipmap atlas. */
export interface PlanningWindTerrain {
  /** Current Clipmap GPU height atlas, including its residency revision. */
  heightSource(): TerrainHeightGpuSamplingSource;
  /** Current published terrain generation, for changes retaining the same atlas. */
  revision(): number;
  /** Canonical terrain height at the camera's horizontal position. */
  sampleHeight(x: number, z: number): number;
}

const defaults = readSceneWindDefaults();

/** Binds Seed's existing physical and grass/flower wind runtimes to a planning view. */
export class PlanningWindRuntime {
  private readonly root: Entity;
  private readonly wind: TerrainWindRuntime;
  private readonly anchor: PlanningWindAnchor;
  private exposure?: TerrainWindGpuExposureProvider;
  private disposed = false;

  /**
   * Register shaders and prepare an inactive camera-centred wind owner.
   * @param engine Existing view engine; no second scene or wind solver is created.
   * @param parent View-owned root, whose transform is the world's coordinate frame.
   * @param camera Camera whose visible queues drive the shared GPU wind demand pass.
   * @param seed Current world seed for reproducible gusts.
   */
  constructor(
    private readonly engine: Engine,
    parent: Entity,
    camera: Camera,
    seed: number
  ) {
    registerWindGpuFieldShaders();
    registerTerrainWindGpuExposureShader();
    this.root = parent.createChild("Seed planning wind");
    this.root.isActive = false;
    this.root.transform.setRotation(...defaults.rotation);
    try {
      this.wind = this.root.addComponent(TerrainWindRuntime);
      this.wind.initialize({ speedMps: defaults.speedMps, seed });
      this.wind.applyWeatherForcing(WeatherPresets.wind.breeze);
      this.wind.setRenderingActive(false);
      this.wind.setGpuRenderCamera(camera);
      this.wind.attachSceneBridge(camera.entity.transform.worldPosition);
      this.anchor = this.root.addComponent(PlanningWindAnchor);
      this.anchor.camera = camera;
      this.anchor.wind = this.wind;
      this.anchor.groundWind = new SeedWorldGroundWindTuningRuntime(parent.scene!);
      this.anchor.groundWind.setTuning({ enabled: false });
    } catch (error) {
      this.root.destroy();
      throw error;
    }
  }

  /** Bind only after the published Terrain exists. Replacing the binding releases old exposure textures. */
  bindTerrain(terrain: PlanningWindTerrain): void {
    if (this.disposed) return;
    if (this.anchor.terrain === terrain) return;
    const exposure = new TerrainWindGpuExposureProvider(
      this.engine,
      () => terrain.heightSource(),
      () => terrain.revision()
    );
    this.wind.setGpuExposureProvider(exposure);
    const previous = this.exposure;
    this.exposure = exposure;
    this.anchor.terrain = terrain;
    this.anchor.synchronizeCenter();
    previous?.destroy();
  }

  /** Suspend simulation and GPU deformation together outside the production view. */
  setActive(active: boolean): void {
    if (this.disposed) return;
    this.wind.setRenderingActive(active);
    this.anchor.groundWind.setTuning({ enabled: active });
    if (active) this.anchor.synchronizeCenter();
    this.root.isActive = active;
  }

  /** Detached diagnostics from the reused physical wind owner. */
  getDiagnostics() {
    return this.wind.getSnapshot();
  }

  /** Release camera registrations and exposure resources without destroying the borrowed terrain atlas. */
  dispose(): void {
    if (this.disposed) return;
    this.setActive(false);
    this.disposed = true;
    this.wind.setGpuExposureProvider(null);
    this.wind.setGpuRenderCamera(null);
    this.root.destroy();
    this.exposure?.destroy();
    this.exposure = undefined;
  }
}

/** Only follows the camera and advances the existing grass clock; TerrainWindRuntime owns physical simulation. */
class PlanningWindAnchor extends Script {
  camera!: Camera;
  wind!: TerrainWindRuntime;
  groundWind!: SeedWorldGroundWindTuningRuntime;
  terrain?: PlanningWindTerrain;
  private readonly center = new Vector3();

  override onLateUpdate(deltaTime: number): void {
    this.synchronizeCenter();
    this.groundWind.update(deltaTime);
  }

  synchronizeCenter(): void {
    const position = this.camera.entity.transform.worldPosition;
    this.center.set(position.x, this.terrain?.sampleHeight(position.x, position.z) ?? position.y, position.z);
    this.wind.setLocalFieldCenter(this.center);
  }
}

function readSceneWindDefaults(): { rotation: [number, number, number]; speedMps: number } {
  const source = JSON.parse(sceneSource) as {
    refs: { url: string }[];
    entities: { rotation?: [number, number, number]; components: number[] }[];
    components: { type: string; script?: number; calls?: { method: string; args: { speedMps: number }[] }[] }[];
  };
  const script = source.refs.findIndex((ref) => ref.url === "/Script/TerrainWindRuntime.ts");
  const component = source.components.findIndex((value) => value.type === "Script" && value.script === script);
  const entity = source.entities.find((value) => value.components.includes(component));
  const speedMps = source.components[component]?.calls?.find((call) => call.method === "initialize")?.args[0]?.speedMps;
  if (!entity?.rotation || !Number.isFinite(speedMps) || speedMps! < 0) {
    throw new Error("Seed Scene must author a valid wind rotation and initialization speed");
  }
  return { rotation: entity.rotation, speedMps: speedMps! };
}
