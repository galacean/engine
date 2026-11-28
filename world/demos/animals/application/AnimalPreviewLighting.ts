import { FogMode, ShadowType, type Camera, type DirectLight, type Entity, type Scene } from "@galacean/engine";
import { createIntegratedWorldLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/IntegratedWorldPresentation";
import { INTEGRATED_WORLD_DAYLIGHT_REFERENCE_TIME_HOURS } from "@galacean/engine-world-planning/integrations/terrain/lighting/IntegratedWorldLightingPreset";
import {
  SEED_WORLD_DEFAULT_FOG_VALUES,
  SEED_WORLD_DEFAULT_SHADOW_STRENGTH
} from "@galacean/engine-environment/terrain/lighting/SeedWorldLightingPreset";
import { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import { INTEGRATED_WORLD_POST_PROCESS_PROFILE as PROFILE } from "@galacean/engine-terrain/terrain/project/IntegratedWorldPostProcessPreset";

/** Demo-only inspector for the actual Seed lighting and post-processing owners. */
export class AnimalPreviewLighting {
  private readonly post: TerrainPostProcessRuntime;
  private readonly lighting: ReturnType<typeof createIntegratedWorldLightingRuntime>;
  private epoch = 0;
  private disposed = false;
  private iblStatus = "准备中";

  /** Install Seed's shared render stack before engine.run; the animal simulation remains independent. */
  constructor(
    owner: Entity,
    scene: Scene,
    sun: DirectLight,
    private readonly camera: Camera,
    private readonly panel: HTMLElement
  ) {
    camera.enableHDR = true;
    sun.shadowType = ShadowType.SoftLow;
    scene.castShadows = true;
    scene.ambientLight.diffuseIntensity = scene.ambientLight.specularIntensity = 1;
    this.post = owner.addComponent(TerrainPostProcessRuntime);
    this.post.initialize({ camera, ...PROFILE });
    this.lighting = createIntegratedWorldLightingRuntime(owner, scene, sun, this.post);
    this.lighting.applyVisualTuning({
      fogMode: FogMode.ExponentialSquared,
      ...SEED_WORLD_DEFAULT_FOG_VALUES,
      shadowStrength: SEED_WORLD_DEFAULT_SHADOW_STRENGTH
    });
    panel.innerHTML = `<details><summary>Seed 光照与后处理</summary>
      <p class="note">同源太阳/月光、程序天空、实时 IBL、HDR、ACES 与 Bloom。保持原素材材质，没有额外添加条纹发光。</p>
      <div data-controls></div><button type="button" data-reset>恢复 Seed 默认</button>
      <p class="note" data-light-status role="status"></p>
    </details>`;
    const controls = panel.querySelector<HTMLElement>("[data-controls]")!;
    const toggle = (id: string, label: string, set: (enabled: boolean) => void) => {
      const row = document.createElement("label");
      row.className = "display-option";
      row.innerHTML = `<span>${label}</span><input id="render-${id}" type="checkbox" role="switch" checked>`;
      const input = row.querySelector("input")!;
      input.addEventListener("change", () => {
        set(input.checked);
        this.refresh();
      });
      controls.append(row);
    };
    const number = (
      id: string,
      label: string,
      min: number,
      max: number,
      step: number,
      set: (value: number) => void
    ) => {
      const row = document.createElement("div");
      row.className = "tempo";
      row.innerHTML = `<label for="render-${id}">${label}</label><input id="render-${id}" type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
      const input = row.querySelector("input")!;
      input.addEventListener(id === "time" ? "change" : "input", () => {
        set(input.valueAsNumber);
        this.refresh();
      });
      controls.append(row);
    };
    number("time", "时刻（小时）", 0, 24, 0.25, (timeHours) => {
      this.lighting.setTuning({ playing: false, timeHours });
      this.settleIBL();
    });
    toggle("direct", "太阳与月光", (direct) => this.lighting.setVisibility({ direct }));
    toggle("environment", "天空环境光 IBL", (environment) => this.lighting.setVisibility({ environment }));
    toggle("fog", "Seed 大气雾", (fog) => this.lighting.setVisibility({ fog }));
    toggle("post", "启用后处理", (value) => this.post.setProfileEnabled(value));
    toggle("aces", "ACES 色调映射", (value) => this.post.setTonemappingEnabled(value));
    toggle("grading", "Seed 调色", (value) => this.post.setColorAdjustmentsEnabled(value));
    number("exposure", "曝光补偿（EV）", -4, 4, 0.1, (value) => this.post.setPostExposure(value));
    number("temperature", "色温", -100, 100, 1, (value) => this.post.setTemperature(value));
    number("contrast", "对比度", -100, 100, 1, (value) => this.post.setContrast(value));
    number("saturation", "饱和度", -100, 100, 1, (value) => this.post.setSaturation(value));
    toggle("bloom", "Bloom", (value) => this.post.setBloomEnabled(value));
    number("threshold", "Bloom 阈值", 0, 3, 0.05, (value) => this.post.setBloomThreshold(value));
    number("intensity", "Bloom 强度", 0, 3, 0.05, (value) => this.post.setBloomIntensity(value));
    number("scatter", "Bloom 扩散", 0, 1, 0.05, (value) => this.post.setBloomScatter(value));
    panel.querySelector("[data-reset]")!.addEventListener("click", () => this.reset());
    this.reset();
  }

  /** Keep the existing animal shadow switch and Seed's scene visibility in sync. */
  setShadows(shadows: boolean): void {
    this.lighting.setVisibility({ shadows });
  }

  /** Report evaluated engine values, including whether the requested sky lighting has finished baking. */
  inspect() {
    return {
      source: "Seed shared runtime",
      hdr: this.camera.enableHDR,
      iblStatus: this.iblStatus,
      lighting: this.lighting.getSnapshot(),
      post: this.post.getDebugSnapshot()
    };
  }

  /** Refresh readouts from runtime state without evaluating animal behavior. */
  refresh(): void {
    if (this.disposed) return;
    const state = this.inspect(),
      p = state.post,
      l = state.lighting;
    const numbers: Record<string, number> = {
      time: l.timeHours,
      exposure: p.colorAdjustments.postExposure,
      temperature: p.colorAdjustments.temperature,
      contrast: p.colorAdjustments.contrast,
      saturation: p.colorAdjustments.saturation,
      threshold: p.bloom.threshold,
      intensity: p.bloom.intensity,
      scatter: p.bloom.scatter
    };
    for (const [id, value] of Object.entries(numbers)) {
      const input = this.panel.querySelector<HTMLInputElement>(`#render-${id}`)!;
      if (document.activeElement !== input) input.value = String(value);
      input.nextElementSibling!.textContent = value.toFixed(2);
    }
    const switches: Record<string, boolean> = {
      direct: l.direct,
      environment: l.environment,
      fog: l.fog,
      post: p.enabled,
      aces: p.tonemapping,
      grading: p.colorAdjustments.enabled,
      bloom: p.bloom.enabled
    };
    for (const [id, checked] of Object.entries(switches))
      this.panel.querySelector<HTMLInputElement>(`#render-${id}`)!.checked = checked;
    this.panel.querySelector("[data-light-status]")!.textContent =
      `HDR ${state.hdr ? "开启" : "关闭"} · IBL ${this.iblStatus} · 太阳强度 ${l.sunIntensity.toFixed(2)} · 环境 ${l.ambientIntensity.toFixed(2)}`;
  }

  /** Release the lighting baker before the scene and engine are destroyed. */
  dispose(): void {
    this.disposed = true;
    this.epoch++;
    this.lighting.destroy();
  }

  private reset(): void {
    this.lighting.setTuning({ playing: false, timeHours: INTEGRATED_WORLD_DAYLIGHT_REFERENCE_TIME_HOURS });
    this.lighting.setVisibility({ direct: true, environment: true, fog: true });
    this.post.setProfileEnabled(true);
    this.post.setTonemappingEnabled(true);
    this.post.setColorAdjustmentsEnabled(true);
    this.post.setBloomEnabled(true);
    this.post.setPostExposure(PROFILE.postExposure);
    this.post.setTemperature(PROFILE.temperature);
    this.post.setContrast(PROFILE.contrast);
    this.post.setSaturation(PROFILE.saturation);
    this.post.setBloomThreshold(PROFILE.bloomThreshold);
    this.post.setBloomIntensity(PROFILE.bloomIntensity);
    this.post.setBloomScatter(PROFILE.bloomScatter);
    this.settleIBL();
    this.refresh();
  }

  private settleIBL(): void {
    const epoch = ++this.epoch;
    this.iblStatus = "更新中";
    void this.lighting
      .waitForEnvironmentIBLIdle()
      .then(() => {
        if (!this.disposed && epoch === this.epoch) {
          this.iblStatus = "就绪";
          this.refresh();
        }
      })
      .catch((error) => {
        if (!this.disposed && epoch === this.epoch) {
          this.iblStatus = `失败：${String(error)}`;
          this.refresh();
        }
      });
  }
}
