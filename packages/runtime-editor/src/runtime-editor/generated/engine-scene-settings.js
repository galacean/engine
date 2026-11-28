// Generated from Engine SceneLoader.ts (SHA256 4e4b45763cb6b983a4718a1d2acac484c58c6c3b6cf62c7a6a73c9b522d77c7d).
// Rebuild from packages/modify/.cache/engine/packages/loader/src/SceneLoader.ts. Do not edit.

// <stdin>
import {
  BackgroundMode,
  DiffuseMode,
  Logger,
  ScreenSpaceReflectionSettings
} from "@galacean/engine";

// packages/modify/.cache/engine/packages/loader/src/schema/refs.ts
function resolveRefItem(refs, index, owner, label) {
  if (!Number.isInteger(index) || index < 0 || index >= refs.length) {
    throw new Error(`${owner}: invalid ref index ${index} for ${label}`);
  }
  return refs[index];
}

// <stdin>
function loadRef(refs, index, resourceManager, label) {
  const ref = resolveRefItem(refs, index, "SceneLoader", label);
  return resourceManager.getResourceByRef(ref);
}
function applySceneScreenSpaceReflection(scene, sceneData) {
  if (sceneData.screenSpaceReflection) {
    scene.screenSpaceReflection.apply(sceneData.screenSpaceReflection);
  } else {
    new ScreenSpaceReflectionSettings().cloneTo(scene.screenSpaceReflection);
  }
}
function applySceneData(scene, sceneData, resourceManager, refs) {
  const promises = [];
  try {
    applySceneScreenSpaceReflection(scene, sceneData);
    const ambient = sceneData.ambient;
    if (ambient) {
      const useSH = ambient.diffuseMode === DiffuseMode.SphericalHarmonics;
      scene.ambientLight.diffuseIntensity = ambient.diffuseIntensity;
      scene.ambientLight.specularIntensity = ambient.specularIntensity;
      scene.ambientLight.diffuseMode = ambient.diffuseMode;
      const solidColor = ambient.diffuseSolidColor;
      if (solidColor) {
        scene.ambientLight.diffuseSolidColor.set(solidColor[0], solidColor[1], solidColor[2], solidColor[3]);
      }
      if (ambient.ambientLight != null) {
        promises.push(
          loadRef(refs, ambient.ambientLight, resourceManager, "scene.ambient.ambientLight").then(
            (ambientLight) => {
              scene.ambientLight.specularTexture = ambientLight?.specularTexture;
              if (useSH) {
                scene.ambientLight.diffuseSphericalHarmonics = ambientLight?.diffuseSphericalHarmonics;
              }
            }
          )
        );
      }
    }
    const background = sceneData.background;
    scene.background.mode = background.mode;
    switch (scene.background.mode) {
      case BackgroundMode.SolidColor: {
        const color = background.color;
        scene.background.solidColor.set(color[0], color[1], color[2], color[3]);
        break;
      }
      case BackgroundMode.Sky:
        if (background.skyMesh != null && background.skyMaterial != null) {
          promises.push(
            loadRef(refs, background.skyMesh, resourceManager, "scene.background.skyMesh").then((mesh) => {
              scene.background.sky.mesh = mesh;
            }),
            loadRef(refs, background.skyMaterial, resourceManager, "scene.background.skyMaterial").then(
              (material) => {
                scene.background.sky.material = material;
              }
            )
          );
        } else {
          Logger.warn("Sky background mode requires skyMesh and skyMaterial");
        }
        break;
      case BackgroundMode.Texture:
        if (background.texture != null) {
          promises.push(
            loadRef(refs, background.texture, resourceManager, "scene.background.texture").then((texture) => {
              scene.background.texture = texture;
            })
          );
          scene.background.textureFillMode = background.textureFillMode ?? scene.background.textureFillMode;
        }
        break;
    }
  } catch (error) {
    return Promise.reject(error);
  }
  const shadow = sceneData.shadow;
  if (shadow) {
    if (shadow.castShadows != void 0)
      scene.castShadows = shadow.castShadows;
    if (shadow.shadowResolution != void 0)
      scene.shadowResolution = shadow.shadowResolution;
    if (shadow.shadowDistance != void 0)
      scene.shadowDistance = shadow.shadowDistance;
    if (shadow.shadowCascades != void 0)
      scene.shadowCascades = shadow.shadowCascades;
    if (shadow.enableTransparentShadow != void 0)
      scene.enableTransparentShadow = shadow.enableTransparentShadow;
    if (shadow.shadowTwoCascadeSplits != void 0)
      scene.shadowTwoCascadeSplits = shadow.shadowTwoCascadeSplits;
    if (shadow.shadowFourCascadeSplits) {
      const splits = shadow.shadowFourCascadeSplits;
      scene.shadowFourCascadeSplits.set(splits[0], splits[1], splits[2]);
    }
    if (shadow.shadowFadeBorder != void 0)
      scene.shadowFadeBorder = shadow.shadowFadeBorder;
  }
  const fog = sceneData.fog;
  if (fog) {
    if (fog.fogMode != void 0)
      scene.fogMode = fog.fogMode;
    if (fog.fogStart != void 0)
      scene.fogStart = fog.fogStart;
    if (fog.fogEnd != void 0)
      scene.fogEnd = fog.fogEnd;
    if (fog.fogDensity != void 0)
      scene.fogDensity = fog.fogDensity;
    if (fog.fogColor)
      scene.fogColor.set(fog.fogColor[0], fog.fogColor[1], fog.fogColor[2], fog.fogColor[3]);
  }
  if (sceneData.postProcess) {
    Logger.warn("Post Process is not supported in scene yet, please add PostProcess component in entity instead.");
  }
  const ambientOcclusion = sceneData.ambientOcclusion;
  if (ambientOcclusion) {
    const sceneAO = scene.ambientOcclusion;
    if (ambientOcclusion.enabledAmbientOcclusion != void 0)
      sceneAO.enabled = ambientOcclusion.enabledAmbientOcclusion;
    if (ambientOcclusion.quality != void 0)
      sceneAO.quality = ambientOcclusion.quality;
    if (ambientOcclusion.intensity != void 0)
      sceneAO.intensity = ambientOcclusion.intensity;
    if (ambientOcclusion.radius != void 0)
      sceneAO.radius = ambientOcclusion.radius;
    if (ambientOcclusion.bias != void 0)
      sceneAO.bias = ambientOcclusion.bias;
    if (ambientOcclusion.power != void 0)
      sceneAO.power = ambientOcclusion.power;
    if (ambientOcclusion.bilateralThreshold != void 0)
      sceneAO.bilateralThreshold = ambientOcclusion.bilateralThreshold;
    if (ambientOcclusion.minHorizonAngle != void 0)
      sceneAO.minHorizonAngle = ambientOcclusion.minHorizonAngle;
  }
  return Promise.all(promises).then(() => {
  });
}
export {
  applySceneData
};
