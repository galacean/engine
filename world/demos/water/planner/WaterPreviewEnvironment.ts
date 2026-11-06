import {
  Script,
  DirectLight,
  DayNightProceduralSky,
  DayNightSolarPosition,
  RealtimeIBLBaker,
  PostProcess,
  TonemappingEffect,
  TonemappingMode,
  ColorAdjustmentsEffect,
  BloomEffect,
  Vector3,
  FogMode,
  type AmbientLight,
  type Color,
  type Scene,
  type Camera
} from "@galacean/engine";
import {
  PROCEDURAL_SKY_SOLAR_POSITION,
  PROCEDURAL_SKY_REALTIME_IBL_OPTIONS
} from "@galacean/engine-environment/lighting/ProceduralSkyLightingProfile";
import {
  GRASSLANDS_ENVIRONMENT_REFLECTION_ROTATION_DEGREES,
  GRASSLANDS_ENVIRONMENT_REFLECTION_EXPOSURE,
  GRASSLANDS_ENVIRONMENT_REFLECTION_HDR
} from "../demo/grasslands/GrasslandsEnvironmentReflectionConfig.ts";
import { FarmlandsPreviewLighting, farmlandsLinearColor } from "./FarmlandsPreviewLighting.ts";
import { FARMLANDS_LIGHTING } from "./FarmlandsLightingProfile.ts";

export type WaterPreviewLightingMode = "planner" | "farmlands";

/** Scene presentation only: the Planner continues to own Terrain, the bed and Water authoring. */
export class WaterPreviewEnvironment extends Script {
  private sourceScene?: Scene;
  private disposed = false;
  private sky?: DayNightProceduralSky;
  private baker?: RealtimeIBLBaker;
  private camera?: Camera;
  private sun?: DirectLight;
  private previousSun?: DirectLight | null;
  private previousCamera?: { hdr: boolean; postProcess: boolean };
  private previousAmbient?: { diffuse: number; specular: number };
  private originalAmbient?: AmbientLight;
  private previousFog?: { mode: FogMode; density: number; color: Color };
  private farmlands?: FarmlandsPreviewLighting;
  private farmlandsPreparation?: Promise<void>;
  private mode: WaterPreviewLightingMode = "planner";
  private post?: PostProcess;
  private readonly lifetime = new AbortController();

  initialize(camera: Camera): void {
    const scene = (this.sourceScene = this.entity.scene!);
    this.camera = camera;
    this.previousCamera = { hdr: camera.enableHDR, postProcess: camera.enablePostProcess };
    this.previousAmbient = {
      diffuse: scene.ambientLight.diffuseIntensity,
      specular: scene.ambientLight.specularIntensity
    };
    this.previousSun = scene.sun;
    this.originalAmbient = scene.ambientLight;
    this.previousFog = { mode: scene.fogMode, density: scene.fogDensity, color: scene.fogColor.clone() };
    const sun = (this.sun = this.entity.createChild("Preview sun").addComponent(DirectLight));
    // Standalone Lake's reference direct/indirect lighting, without its landscape or editor.
    sun.color.set(1.05, 1.05, 1.05, 1);
    const pitch = (51.9 * Math.PI) / 180,
      yaw = (18.1 * Math.PI) / 180;
    sun.entity.transform.lookAt(
      new Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    );
    scene.sun = sun;
    scene.ambientLight.diffuseIntensity = 0.9;
    scene.ambientLight.specularIntensity = 1;
    this.sky = new DayNightProceduralSky(
      scene,
      new DayNightSolarPosition(PROCEDURAL_SKY_SOLAR_POSITION),
      "Water preview sky"
    );
    this.sky.material.sunDirection.copyFrom(sun.entity.transform.worldForward);
    this.baker = new RealtimeIBLBaker(scene, PROCEDURAL_SKY_REALTIME_IBL_OPTIONS);
    this.baker.requestBake();

    camera.enableHDR = true;
    camera.enablePostProcess = true;
    const post = (this.post = this.entity.createChild("Preview color output").addComponent(PostProcess));
    post.addEffect(TonemappingEffect)!.mode.value = TonemappingMode.ACES;
    const adjustments = post.addEffect(ColorAdjustmentsEffect)!;
    adjustments.postExposure.value = 1;
    adjustments.temperature.value = 10;
    const bloom = post.addEffect(BloomEffect)!;
    bloom.threshold.value = 0.5;
    bloom.intensity.value = 0.35;
    bloom.scatter.value = 0.6;
  }

  /** Water borrows the sky's published HDR cubemap through the existing Planner runtime. */
  get reflectionSource() {
    const owner = this;
    return {
      get ambientLight() {
        return owner.sourceScene!.ambientLight;
      },
      rotationDegrees: () => (this.mode === "farmlands" ? 0 : GRASSLANDS_ENVIRONMENT_REFLECTION_ROTATION_DEGREES),
      exposure: () => (this.mode === "farmlands" ? 1 : GRASSLANDS_ENVIRONMENT_REFLECTION_EXPOSURE),
      hdr: GRASSLANDS_ENVIRONMENT_REFLECTION_HDR
    };
  }

  async setMode(mode: WaterPreviewLightingMode): Promise<void> {
    if (this.disposed) throw new DOMException("Environment disposed", "AbortError");
    if (mode !== "planner" && mode !== "farmlands") throw new Error("Unknown preview lighting mode");
    if (mode === this.mode) return;
    if (mode === "farmlands") {
      this.farmlandsPreparation ??= (async () => {
        const prepared = await FarmlandsPreviewLighting.create(this.engine, this.lifetime.signal);
        if (this.disposed) {
          prepared.dispose();
          throw new DOMException("Environment disposed", "AbortError");
        }
        this.farmlands = prepared;
        try {
          await prepared.ready();
        } catch (error) {
          prepared.dispose();
          this.farmlands = undefined;
          throw error;
        }
      })().catch((error) => {
        this.farmlandsPreparation = undefined;
        throw error;
      });
      await this.farmlandsPreparation;
    }
    this.lifetime.signal.throwIfAborted();
    const scene = this.sourceScene!,
      sun = this.sun!;
    if (mode === "farmlands") {
      scene.background.sky.material = this.farmlands!.material;
      scene.ambientLight = this.farmlands!.ambientLight;
      sun.color = farmlandsLinearColor(FARMLANDS_LIGHTING.sunColor, FARMLANDS_LIGHTING.sunIntensity);
      sun.entity.transform.lookAt(new Vector3(...FARMLANDS_LIGHTING.sunDirection));
      scene.fogMode = FogMode.Exponential;
      scene.fogColor = farmlandsLinearColor(FARMLANDS_LIGHTING.fogColor);
      scene.fogDensity = FARMLANDS_LIGHTING.fogDensity;
    } else {
      scene.background.sky.material = this.sky!.material;
      scene.ambientLight = this.originalAmbient!;
      sun.color.set(1.05, 1.05, 1.05, 1);
      const pitch = (51.9 * Math.PI) / 180,
        yaw = (18.1 * Math.PI) / 180;
      sun.entity.transform.lookAt(
        new Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
      );
      scene.fogMode = this.previousFog!.mode;
      scene.fogDensity = this.previousFog!.density;
      scene.fogColor = this.previousFog!.color;
    }
    this.post!.enabled = mode === "planner";
    this.camera!.enablePostProcess = mode === "planner";
    this.mode = mode;
  }

  async waitForReady(signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    let abort = () => {};
    try {
      return await Promise.race([
        this.baker!.waitForFirstBake(),
        new Promise<never>((_resolve, reject) => {
          abort = () => reject(signal.reason);
          signal.addEventListener("abort", abort, { once: true });
        })
      ]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }

  get snapshot() {
    return {
      mode: this.mode,
      sky: !!this.sky,
      bake: this.baker?.getSnapshot(),
      hdr: this.camera?.enableHDR,
      postProcess: this.camera?.enablePostProcess,
      tonemapping: this.mode === "planner" ? "ACES" : "none",
      postExposure: this.mode === "planner" ? 1 : 0,
      temperature: this.mode === "planner" ? 10 : 0,
      farmlandsBake: this.farmlands?.baker.getSnapshot(),
      cloudCookie: "not-reproduced"
    };
  }

  override onUpdate(): void {
    this.baker?.update();
    this.farmlands?.baker.update();
  }

  override onDestroy(): void {
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort();
    if (this.sourceScene && this.originalAmbient) this.sourceScene.ambientLight = this.originalAmbient;
    if (this.sourceScene && this.sky) this.sourceScene.background.sky.material = this.sky.material;
    this.farmlands?.dispose();
    this.farmlands = undefined;
    // Water's borrowed reflection references must be released before destroying this entity.
    this.baker?.destroy();
    this.baker = undefined;
    this.sky?.destroy();
    this.sky = undefined;
    if (this.previousCamera && this.camera) {
      this.camera.enableHDR = this.previousCamera.hdr;
      this.camera.enablePostProcess = this.previousCamera.postProcess;
    }
    const scene = this.sourceScene;
    if (!scene) return;
    if (this.previousFog) {
      scene.fogMode = this.previousFog.mode;
      scene.fogDensity = this.previousFog.density;
      scene.fogColor = this.previousFog.color;
    }
    if (this.previousAmbient) {
      scene.ambientLight.diffuseIntensity = this.previousAmbient.diffuse;
      scene.ambientLight.specularIntensity = this.previousAmbient.specular;
    }
    if (scene.sun === this.sun) scene.sun = this.previousSun ?? null;
  }
}
