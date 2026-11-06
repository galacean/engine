import {
  type Camera,
  type DirectLight,
  type Scene,
  Script,
  WeatherPresets,
  BackgroundMode,
  AntiAliasing,
  FogMode,
  Color,
  Vector3
} from "@galacean/engine";
import { VolumetricCloudSkyRuntime } from "@galacean/engine-environment/lighting/VolumetricCloudSkyRuntime";
import { createIntegratedWorldLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/IntegratedWorldPresentation";
import { INTEGRATED_WORLD_DAYLIGHT_REFERENCE_TIME_HOURS } from "@galacean/engine-world-planning/integrations/terrain/lighting/IntegratedWorldLightingPreset";
import { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import { INTEGRATED_WORLD_POST_PROCESS_PROFILE } from "@galacean/engine-terrain/terrain/project/IntegratedWorldPostProcessPreset";
import {
  TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SCALE_SETTINGS,
  TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SHAPE_PROFILE,
  TERRAIN_CLEAR_VOLUMETRIC_CLOUD_LIGHTING_PROFILE
} from "@galacean/engine-environment/terrain/environment/TerrainVolumetricCloudPreset";
import type { RiverValleyAssets } from "./RiverValleyAssets.ts";
import { RIVER_VALLEY_MANIFEST } from "./RiverValleyScene.ts";
import type { WaterSceneRuntimeHost } from "@galacean/engine-water/water/runtime/index";

/** Ocean's shared daylight sky and clouds, with the same sky feeding Water's HDR reflection. */
export async function createRiverDemoEnvironment(
  scene: Scene,
  camera: Camera,
  sun: DirectLight,
  host: WaterSceneRuntimeHost
) {
  const root = scene.createRootEntity("river-environment");
  const post = root.addComponent(TerrainPostProcessRuntime);
  post.initialize({ camera, ...INTEGRATED_WORLD_POST_PROCESS_PROFILE });
  const lighting = createIntegratedWorldLightingRuntime(root, scene, sun, post);
  let clouds: VolumetricCloudSkyRuntime;
  try {
    lighting.setTuning({ playing: false, timeHours: INTEGRATED_WORLD_DAYLIGHT_REFERENCE_TIME_HOURS });
    lighting.applyVisualTuning({ shadowStrength: 0.9 });
    clouds = await VolumetricCloudSkyRuntime.create(scene, camera, {
      quality: "balanced",
      scaleSettings: TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SCALE_SETTINGS,
      shapeProfile: TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SHAPE_PROFILE,
      lightingProfile: TERRAIN_CLEAR_VOLUMETRIC_CLOUD_LIGHTING_PROFILE,
      materialName: "River Volumetric Cloud Sky"
    });
  } catch (error) {
    lighting.destroy();
    root.destroy();
    throw error;
  }
  const weather = WeatherPresets.cloud.scattered;
  clouds.setWeatherValues(weather.cloudCoverage, weather.cloudType, weather.cloudDetail);
  clouds.setEnvironmentModifierValues(weather.cloudDensityMultiplier, 0);
  clouds.applyDayNightState(lighting.system.state);
  clouds.update(0);
  lighting.requestEnvironmentBake();
  class RiverSkyFrame extends Script {
    override onUpdate(deltaTime: number) {
      clouds.applyDayNightState(lighting.system.state);
      clouds.update(deltaTime);
    }
  }
  root.addComponent(RiverSkyFrame);
  const source = { ambientLight: scene.ambientLight, rotationDegrees: 0, exposure: 1, hdr: true };
  let provider = host.createEnvironmentReflectionProvider({ id: "river-demo-sky", source });
  let enabled = true;
  let destroyed = false;
  let valleyPost: TerrainPostProcessRuntime | undefined;
  let currentScenario = "bend";
  const originalAntiAliasing = camera.antiAliasing;
  let oceanVisual:
    | {
        material: typeof scene.background.sky.material;
        mesh: typeof scene.background.sky.mesh;
        ambient: typeof scene.ambientLight;
        rotation: ReturnType<typeof sun.entity.transform.rotationQuaternion.clone>;
        color: Color;
      }
    | undefined;
  function setScenario(scenario: string, valley?: RiverValleyAssets) {
    if (scenario === "valley" && !valley) throw new Error("河谷环境尚未准备完成。");
    if (!oceanVisual)
      oceanVisual = {
        material: scene.background.sky.material,
        mesh: scene.background.sky.mesh,
        ambient: scene.ambientLight,
        rotation: sun.entity.transform.rotationQuaternion.clone(),
        color: sun.color.clone()
      };
    if (scenario === "valley") {
      if (!valleyPost) {
        valleyPost = scene.createRootEntity("river-valley-post").addComponent(TerrainPostProcessRuntime);
        valleyPost.initialize({
          camera,
          postExposure: 0.33,
          temperature: 12,
          tint: 0,
          contrast: -19.7,
          saturation: 8,
          bloomThreshold: 1,
          bloomIntensity: 1,
          bloomScatter: 0.177
        });
      }
      root.isActive = false;
      camera.antiAliasing = AntiAliasing.FXAA;
      scene.background.mode = BackgroundMode.Sky;
      scene.background.sky.material = valley!.skyMaterial;
      scene.background.sky.mesh = valley!.skyMesh;
      scene.ambientLight = valley!.lightingScene.ambientLight;
      sun.color.set(
        ...(RIVER_VALLEY_MANIFEST.sun.color.map((v) => v * RIVER_VALLEY_MANIFEST.sun.intensity) as [
          number,
          number,
          number
        ]),
        1
      );
      const direction = RIVER_VALLEY_MANIFEST.sun.forward;
      sun.entity.transform.setPosition(0, 0, 0);
      sun.entity.transform.lookAt(new Vector3(...direction));
      valleyPost.entity.isActive = true;
      scene.fogMode = FogMode.ExponentialSquared;
      scene.fogDensity = 0.0015;
      scene.fogColor = new Color(0.6650944, 0.941622, 1, 1);
    } else {
      if (valleyPost) valleyPost.entity.isActive = false;
      root.isActive = true;
      camera.antiAliasing = originalAntiAliasing;
      scene.background.sky.material = oceanVisual.material;
      scene.background.sky.mesh = oceanVisual.mesh;
      scene.ambientLight = oceanVisual.ambient;
      sun.entity.transform.rotationQuaternion = oceanVisual.rotation;
      sun.color = oceanVisual.color;
      scene.fogMode = scenario === "calibration" ? FogMode.None : FogMode.Linear;
      scene.fogColor = new Color(0.55, 0.67, 0.68, 1);
      scene.fogStart = 95;
      scene.fogEnd = 200;
    }
    if (currentScenario !== scenario) {
      if (enabled) provider.destroy();
      source.ambientLight = scene.ambientLight;
      if (enabled) provider = host.createEnvironmentReflectionProvider({ id: "river-demo-sky", source });
    }
    currentScenario = scenario;
  }
  return {
    setScenario,
    get inspection() {
      return enabled ? provider.inspection : undefined;
    },
    waitForReady: () => lighting.waitForEnvironmentIBLIdle(),
    setEnabled(value: boolean) {
      if (destroyed || value === enabled) return;
      if (value) provider = host.createEnvironmentReflectionProvider({ id: "river-demo-sky", source });
      else provider.destroy();
      enabled = value;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      camera.antiAliasing = originalAntiAliasing;
      if (enabled) provider.destroy();
      enabled = false;
      valleyPost?.entity.destroy();
      if (oceanVisual) {
        scene.ambientLight = oceanVisual.ambient;
        scene.background.sky.material = oceanVisual.material;
        scene.background.sky.mesh = oceanVisual.mesh;
      }
      clouds.destroy();
      lighting.destroy();
      root.destroy();
    }
  };
}
