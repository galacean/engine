import { BackgroundMode, Camera, DirectLight, type Entity, type Scene } from "@galacean/engine-core";
import type { WaterSurfaceOpticsBindingReadback } from "../../runtime/optics/WaterSurfaceOpticsTypes";
import type { GrasslandsExcludedResourceAcceptanceReadback } from "./GrasslandsShowcaseAcceptance";

export interface GrasslandsObservationScene {
  readonly rootEntities: readonly Pick<Entity, "getComponentsIncludeChildren">[];
  readonly background: Scene["background"];
}

export type GrasslandsObservationOptics = Pick<WaterSurfaceOpticsBindingReadback, "planarTexture" | "probeTexture">;

function isLiveResource<T extends { readonly destroyed: boolean }>(resource: T | null | undefined): resource is T {
  return resource !== null && resource !== undefined && !resource.destroyed;
}

/**
 * Observes the active Scene instead of trusting Demo construction counters.
 * Reflection probes are represented by the active optics binding because Core
 * does not expose a ReflectionProbe component that can be enumerated here.
 */
export function observeGrasslandsExcludedResources(
  scene: GrasslandsObservationScene | undefined,
  heroCamera: Camera | undefined,
  optics: GrasslandsObservationOptics | undefined
): Readonly<GrasslandsExcludedResourceAcceptanceReadback> {
  const cameras = new Set<Camera>();
  const directLights = new Set<DirectLight>();

  if (scene) {
    for (const root of scene.rootEntities) {
      const rootCameras: Camera[] = [];
      const rootDirectLights: DirectLight[] = [];
      root.getComponentsIncludeChildren(Camera, rootCameras);
      root.getComponentsIncludeChildren(DirectLight, rootDirectLights);
      rootCameras.forEach((camera) => cameras.add(camera));
      rootDirectLights.forEach((light) => directLights.add(light));
    }
  }

  const renderTargets = new Set<NonNullable<Camera["renderTarget"]>>();
  let planarCameraCount = 0;
  for (const camera of cameras) {
    const renderTarget = camera.renderTarget;
    if (!isLiveResource(renderTarget)) continue;
    renderTargets.add(renderTarget);
    if (camera !== heroCamera) planarCameraCount++;
  }

  const planarTexture = optics?.planarTexture;
  const livePlanarTexture = isLiveResource(planarTexture) ? planarTexture : undefined;
  const planarTextureHasOwner = livePlanarTexture
    ? Array.from(renderTargets).some(
        (renderTarget) =>
          renderTarget.colorTextures.includes(livePlanarTexture) || renderTarget.depthTexture === livePlanarTexture
      )
    : false;
  const standalonePlanarTextureCount = livePlanarTexture && !planarTextureHasOwner ? 1 : 0;
  const sky = scene?.background.sky;
  const skyboxCount =
    scene &&
    (scene.background.mode === BackgroundMode.Sky || isLiveResource(sky?.material) || isLiveResource(sky?.mesh))
      ? 1
      : 0;

  return Object.freeze({
    source: "runtime-observed",
    cameraComponentCount: cameras.size,
    directLightComponentCount: directLights.size,
    skyboxCount,
    planarCameraCount,
    reflectionProbeCount: isLiveResource(optics?.probeTexture) ? 1 : 0,
    renderTargetCount: renderTargets.size + standalonePlanarTextureCount
  });
}

export function isGrasslandsExclusionClean(observation: GrasslandsExcludedResourceAcceptanceReadback): boolean {
  return (
    observation.cameraComponentCount === 1 &&
    observation.directLightComponentCount === 1 &&
    observation.skyboxCount === 0 &&
    observation.planarCameraCount === 0 &&
    observation.reflectionProbeCount === 0 &&
    observation.renderTargetCount === 0
  );
}
