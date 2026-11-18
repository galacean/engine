import {
  Camera,
  Entity,
  Layer,
  ProbeBrickCellCount,
  ProbeBrickProbeCountPerDimension,
  ProbeVolume,
  ProbeVolumeBaker,
  ProbeVolumeRegion,
  type ProbeVolumeBakeOptions,
  type ProbeVolumeBakeProgress,
  type Scene
} from "@galacean/engine";
import { TerrainLightingRuntime, type TerrainBakeLightingTuning } from "./TerrainLightingRuntime.ts";
import {
  createTerrainProbeVolumeLayout,
  type TerrainProbeVolumeLayoutSnapshot,
  type TerrainProbeVolumeScenario
} from "./TerrainProbeVolumeLayout.ts";
import type { TerrainProbeVolumeRegionSourceProvider } from "./TerrainProbeVolumeRegionSource.ts";

export {
  TERRAIN_PROBE_VOLUME_SCENARIOS,
  createTerrainProbeVolumeLayout,
  type TerrainProbeVolumeLayoutSnapshot,
  type TerrainProbeVolumeRegionSource,
  type TerrainProbeVolumeScenario,
  type TerrainProbeVolumeTopology
} from "./TerrainProbeVolumeLayout.ts";
export {
  createTerrainProbeVolumeRegionSourceProvider,
  createTerrainProjectProbeVolumeRegionSourceProvider,
  type TerrainProbeVolumeRegionSourceProvider
} from "./TerrainProbeVolumeRegionSource.ts";

/** Current progress of one in-memory probe-volume bake. */
export interface TerrainProbeVolumeBakeSnapshot {
  /** Current lifecycle state. */
  readonly status: "idle" | "baking" | "completed" | "failed";
  /** Scenario being authored or most recently authored. */
  readonly scenario: TerrainProbeVolumeScenario;
  /** Local hour captured by the scenario. */
  readonly timeHours: number;
  /** Number of probes completed by the baker. */
  readonly completedProbes: number;
  /** Total number of probes reported by the baker. */
  readonly totalProbes: number;
  /** Current light-bounce index. */
  readonly bounce: number;
  /** Configured light-bounce count. */
  readonly bounceCount: number;
  /** Human-readable status or failure message. */
  readonly message: string;
}

/** Scene-owned authoring bridge from canonical Region bounds to the engine probe baker. */
export class TerrainProbeVolumeAuthoring {
  /** Complete-world layout derived from every currently loaded canonical Region. */
  readonly layout: TerrainProbeVolumeLayoutSnapshot;

  private readonly _scene: Scene;
  private readonly _camera: Camera;
  private readonly _region: ProbeVolumeRegion;
  private readonly _lighting: TerrainLightingRuntime;
  private readonly _previousProbeVolume: ProbeVolume | undefined;
  private _volume: ProbeVolume | null = null;
  private _bakePromise: Promise<void> | null = null;
  private _snapshot: TerrainProbeVolumeBakeSnapshot;

  /**
   * Creates one adaptive authoring Region from all loaded canonical Regions.
   * @param parent Parent entity for the engine ProbeVolumeRegion component.
   * @param scene Scene captured by the baker.
   * @param camera Camera used as the streaming anchor and capture reference.
   * @param regionSource Immutable authored or generated Region bounds.
   * @param lighting Shared lighting source captured by each scenario.
   * @throws If no canonical Region is loaded.
   */
  constructor(
    parent: Entity,
    scene: Scene,
    camera: Camera,
    regionSource: TerrainProbeVolumeRegionSourceProvider,
    lighting: TerrainLightingRuntime
  ) {
    this.layout = createTerrainProbeVolumeLayout(regionSource.regions, {
      brickCellCount: ProbeBrickCellCount,
      probeCountPerDimension: ProbeBrickProbeCountPerDimension
    });
    this._scene = scene;
    this._camera = camera;
    this._lighting = lighting;
    this._previousProbeVolume = scene.environmentLighting.probeVolume;

    const regionEntity = parent.createChild("terrain-probe-volume-region");
    regionEntity.transform.position.set(...this.layout.bounds.center);
    const region = (this._region = regionEntity.addComponent(ProbeVolumeRegion));
    region.size.set(...this.layout.bounds.size);
    region.minBrickSize = this.layout.region.minBrickSize;
    this._snapshot = {
      status: "idle",
      scenario: "Noon",
      timeHours: 12,
      completedProbes: 0,
      totalProbes: 0,
      bounce: 0,
      bounceCount: this.layout.bakeOptions.bounceCount ?? 1,
      message: "No in-memory probe volume has been baked."
    };
  }

  /**
   * Returns current bake progress without exposing engine resources.
   * @returns Detached progress snapshot.
   */
  getBakeSnapshot(): TerrainProbeVolumeBakeSnapshot {
    return { ...this._snapshot };
  }

  /**
   * Bakes and publishes one named lighting scenario.
   * @param scenario Scenario name from {@link TERRAIN_PROBE_VOLUME_SCENARIOS}.
   * @param source Complete lighting source captured by the baker.
   * @returns The active bake task, or the existing task while a bake is running.
   */
  bake(scenario: TerrainProbeVolumeScenario, source: TerrainBakeLightingTuning): Promise<void> {
    if (this._bakePromise) return this._bakePromise;
    if (!this.layout.scenarios.includes(scenario)) {
      return this._fail(scenario, source.timeHours, `Unknown probe scenario: ${scenario}`);
    }
    if (this._volume?.lightingScenarioNames.includes(scenario)) {
      return this._fail(scenario, source.timeHours, `Probe scenario already baked: ${scenario}`);
    }
    this._snapshot = {
      status: "baking",
      scenario,
      timeHours: source.timeHours,
      completedProbes: 0,
      totalProbes: 0,
      bounce: 1,
      bounceCount: this.layout.bakeOptions.bounceCount ?? 1,
      message: this._volume ? "Reusing the existing brick layout." : "Generating the adaptive brick layout."
    };
    this._bakePromise = this._runBake(scenario, source);
    return this._bakePromise;
  }

  /**
   * Releases the in-memory bake and restores the Scene's previous probe volume.
   * @returns Nothing.
   */
  dispose(): void {
    if (this._volume) {
      this._lighting.setProbeVolume(this._previousProbeVolume);
      this._volume.dispose();
      this._volume = null;
    }
  }

  private async _runBake(scenario: TerrainProbeVolumeScenario, source: TerrainBakeLightingTuning): Promise<void> {
    const previousClock = this._lighting.getSnapshot();
    const previousLighting = this._lighting.getBakeLightingTuning();
    const previousVisibility = this._lighting.getVisibility();
    try {
      this._lighting.setTuning({ playing: false });
      this._lighting.setVisibility({ direct: true, environment: true, shadows: true, fog: true });
      this._lighting.applyBakeLightingTuning(source);
      const options: ProbeVolumeBakeOptions = {
        ...this.layout.bakeOptions,
        lightingScenario: scenario,
        camera: this._camera,
        cullingMask: (this._camera.cullingMask & ~Layer.Layer30) as Layer,
        nearClipPlane: 0.05,
        farClipPlane: 100,
        onProgress: (progress) => this._onProgress(scenario, progress)
      };
      if (this._volume) {
        await ProbeVolumeBaker.bakeLightingScenario(this._scene, this._volume, scenario, options);
      } else {
        this._volume = await ProbeVolumeBaker.bakeRegion(this._scene, this._region, options);
        this._volume.streamingRadius = this.layout.streaming.streamingRadius;
        this._volume.maxActiveCells = this.layout.streaming.maxActiveCells;
      }
      this._volume.lightingScenario = scenario;
      this._scene.environmentLighting.probeVolumeAnchor = this._camera.entity.transform;
      this._lighting.setProbeVolume(this._volume);
      this._snapshot = {
        ...this._snapshot,
        status: "completed",
        message: `${scenario} is active in the in-memory probe volume.`
      };
    } catch (error) {
      this._snapshot = {
        ...this._snapshot,
        status: "failed",
        message: error instanceof Error ? error.message : String(error)
      };
      console.error("[terrain] probe volume bake failed", error);
    } finally {
      this._lighting.applyBakeLightingTuning(previousLighting);
      this._lighting.setTuning({
        playing: previousClock.playing,
        timeScale: previousClock.timeScale,
        timeHours: previousClock.timeHours
      });
      this._lighting.setVisibility(previousVisibility);
      this._bakePromise = null;
    }
  }

  private _onProgress(scenario: TerrainProbeVolumeScenario, progress: ProbeVolumeBakeProgress): void {
    this._snapshot = {
      ...this._snapshot,
      ...progress,
      message: `Capturing ${scenario} indirect lighting.`
    };
  }

  private _fail(scenario: TerrainProbeVolumeScenario, timeHours: number, message: string): Promise<void> {
    this._snapshot = { ...this._snapshot, status: "failed", scenario, timeHours, message };
    return Promise.resolve();
  }
}
