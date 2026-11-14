import { Scene, type SceneFile } from "@galacean/engine";
import { applySceneData } from "../generated/engine-scene-settings";

/** Resolve settings with the real loader's rules/defaults, without loading any entities or scripts. */
export async function applyRuntimeSceneSettings(
  scene: Scene,
  runtime: SceneFile,
  groups: ReadonlySet<string>,
  signal?: AbortSignal
): Promise<void> {
  if (!groups.size) return;
  const settings = new Scene(scene.engine);
  try {
    await applySceneData(settings, runtime.scene, scene.engine.resourceManager, runtime.refs);
    signal?.throwIfAborted();
    if (groups.has("background")) {
      scene.background.mode = settings.background.mode;
      scene.background.solidColor.copyFrom(settings.background.solidColor);
      scene.background.texture = settings.background.texture;
      scene.background.textureFillMode = settings.background.textureFillMode;
      scene.background.sky.mesh = settings.background.sky.mesh;
      scene.background.sky.material = settings.background.sky.material;
    }
    if (groups.has("ambient")) {
      const target = scene.ambientLight,
        value = settings.ambientLight;
      target.diffuseMode = value.diffuseMode;
      target.diffuseIntensity = value.diffuseIntensity;
      target.specularIntensity = value.specularIntensity;
      target.diffuseSolidColor.copyFrom(value.diffuseSolidColor);
      target.diffuseSphericalHarmonics = value.diffuseSphericalHarmonics;
      target.specularTexture = value.specularTexture;
    }
    if (groups.has("shadow")) {
      copyProperties(scene, settings, [
        "castShadows",
        "enableTransparentShadow",
        "shadowResolution",
        "shadowDistance",
        "shadowCascades",
        "shadowTwoCascadeSplits",
        "shadowFadeBorder"
      ]);
      scene.shadowFourCascadeSplits.copyFrom(settings.shadowFourCascadeSplits);
    }
    if (groups.has("fog")) {
      copyProperties(scene, settings, ["fogMode", "fogStart", "fogEnd", "fogDensity"]);
      scene.fogColor.copyFrom(settings.fogColor);
    }
    if (groups.has("ambientOcclusion")) {
      copyProperties(scene.ambientOcclusion, settings.ambientOcclusion, [
        "enabled",
        "quality",
        "intensity",
        "radius",
        "bias",
        "power",
        "bilateralThreshold",
        "minHorizonAngle"
      ]);
    }
  } finally {
    settings.destroy();
  }
}

function copyProperties<T, K extends keyof T>(target: T, source: T, keys: readonly K[]): void {
  for (const key of keys) target[key] = source[key];
}
