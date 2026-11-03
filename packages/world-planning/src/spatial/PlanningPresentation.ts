import {
  SEED_WORLD_DEFAULT_SHADOW_STRENGTH,
  SEED_WORLD_DEFAULT_FOG_VALUES
} from "@galacean/engine-environment/terrain/lighting/SeedWorldLightingPreset";
import { ShadowType, FogMode, type Entity, type Camera, type DirectLight, type Scene } from "@galacean/engine";
import { createIntegratedWorldLightingRuntime } from "../integrations/terrain/lighting/IntegratedWorldPresentation.ts";
import { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import { INTEGRATED_WORLD_POST_PROCESS_PROFILE } from "@galacean/engine-terrain/terrain/project/IntegratedWorldPostProcessPreset";
import { PlanningLightingProfileRuntime } from "./runtime/PlanningLightingProfileRuntime";
/** A serializable component projection, independent of the geometry snapshot. */
export type PresentationComponents = { type: string; values: Record<string, unknown> }[];
/** Own the same sky, solar clock, realtime IBL, shadows, fog and post-process stack as Seed. */
export class PlanningPresentation {
  private lighting: ReturnType<typeof createIntegratedWorldLightingRuntime>;
  private post: TerrainPostProcessRuntime;
  private signature = "";
  private epoch = 0;
  private profile: PlanningLightingProfileRuntime;
  constructor(
    owner: Entity,
    scene: Scene,
    sun: DirectLight,
    camera: Camera,
    private canvas: HTMLCanvasElement
  ) {
    scene.castShadows = true;
    sun.shadowType = ShadowType.SoftLow;
    scene.ambientLight.diffuseIntensity = 1;
    scene.ambientLight.specularIntensity = 1;
    this.post = owner.addComponent(TerrainPostProcessRuntime);
    this.post.initialize({ camera, ...INTEGRATED_WORLD_POST_PROCESS_PROFILE });
    this.lighting = createIntegratedWorldLightingRuntime(owner, scene, sun, this.post);
    this.profile = new PlanningLightingProfileRuntime(owner.engine, this.lighting);
    this.lighting.applyVisualTuning({
      fogMode: FogMode.ExponentialSquared,
      ...SEED_WORLD_DEFAULT_FOG_VALUES,
      shadowStrength: SEED_WORLD_DEFAULT_SHADOW_STRENGTH
    });
    canvas.dataset.lighting = "seed-realtime-ibl";
  }
  /** Resolve the authored lighting asset before applying post effects through the active diagnostic view. */
  apply(components: PresentationComponents, updatePost: (update: () => void) => void = (update) => update()): void {
    const signature = JSON.stringify(components);
    if (signature === this.signature) return;
    this.signature = signature;
    const light = components.find((c) => c.type === "lighting")?.values;
    const post = components.find((c) => c.type === "postProcess")?.values;
    const epoch = ++this.epoch;
    this.canvas.dataset.iblStatus = "updating";
    delete this.canvas.dataset.iblError;
    void (async () => {
      if (light && !(await this.profile.apply(light))) return;
      if (epoch !== this.epoch) return;
      // Profile application also updates exposure/bloom; authored post values win afterwards.
      if (post)
        updatePost(() => {
          this.post.setProfileEnabled(Boolean(post.enabled));
          this.post.setTonemappingEnabled(Boolean(post.tonemapping));
          this.post.setPostExposure(Number(post.postExposure));
          this.post.setTemperature(Number(post.temperature));
          this.post.setContrast(Number(post.contrast));
          this.post.setSaturation(Number(post.saturation));
          this.post.setBloomEnabled(Boolean(post.bloom));
          this.post.setBloomThreshold(Number(post.bloomThreshold));
          this.post.setBloomIntensity(Number(post.bloomIntensity));
          this.post.setBloomScatter(Number(post.bloomScatter));
        });
      this.canvas.dataset.presentation = signature;
      this.recordRuntimeState();
      await this.lighting.waitForEnvironmentIBLIdle();
    })()
      .then(() => {
        if (epoch === this.epoch) {
          this.canvas.dataset.iblStatus = "ready";
          this.recordRuntimeState();
        }
      })
      .catch((error) => {
        if (epoch === this.epoch) {
          this.signature = "";
          this.canvas.dataset.iblStatus = "failed";
          this.canvas.dataset.iblError = String(error);
        }
      });
  }
  private recordRuntimeState(): void {
    const evaluated = this.lighting.getSnapshot();
    this.canvas.dataset.presentationRuntime = JSON.stringify({
      timeHours: evaluated.timeHours,
      playing: evaluated.playing,
      sunIntensity: evaluated.sunIntensity,
      ambientIntensity: evaluated.ambientIntensity,
      iblIntensity: evaluated.iblIntensity,
      exposureEV: evaluated.exposureCompensation,
      bloomIntensity: evaluated.bloomIntensity,
      skyExposure: evaluated.skyExposure,
      postProcess: this.post.getDebugSnapshot()
    });
  }
  dispose(): void {
    this.epoch++;
    this.profile.dispose();
    this.lighting.destroy();
  }
}
