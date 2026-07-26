import { BackgroundMode, Camera, DirectLight, type Entity, type Scene } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";
import {
  isGrasslandsExclusionClean,
  observeGrasslandsExcludedResources,
  type GrasslandsObservationOptics,
  type GrasslandsObservationScene
} from "../../demo/grasslands/GrasslandsRuntimeObservation";
import type { GrasslandsExcludedResourceAcceptanceReadback } from "../../demo/grasslands/GrasslandsShowcaseAcceptance";

interface FakeResource {
  readonly destroyed: boolean;
}

interface FakeRenderTarget extends FakeResource {
  readonly colorTextures: readonly FakeResource[];
  readonly depthTexture: FakeResource | null;
}

type ObservationRoot = GrasslandsObservationScene["rootEntities"][number];

function createCamera(renderTarget: FakeRenderTarget | null = null): Camera {
  return { renderTarget } as unknown as Camera;
}

function createDirectLight(): DirectLight {
  return {} as DirectLight;
}

function createRoot(cameras: readonly Camera[], directLights: readonly DirectLight[]): ObservationRoot {
  return {
    getComponentsIncludeChildren(componentType: unknown, result: unknown[]): void {
      if (componentType === Camera) result.push(...cameras);
      if (componentType === DirectLight) result.push(...directLights);
    }
  } as unknown as Pick<Entity, "getComponentsIncludeChildren">;
}

function createScene(
  rootEntities: readonly ObservationRoot[],
  options: {
    readonly mode?: BackgroundMode;
    readonly skyMaterial?: FakeResource | null;
    readonly skyMesh?: FakeResource | null;
  } = {}
): GrasslandsObservationScene {
  return {
    rootEntities,
    background: {
      mode: options.mode ?? BackgroundMode.SolidColor,
      sky: {
        material: options.skyMaterial ?? null,
        mesh: options.skyMesh ?? null
      }
    } as unknown as Scene["background"]
  };
}

function createOptics(options: {
  readonly planarTexture?: FakeResource;
  readonly probeTexture?: FakeResource;
}): GrasslandsObservationOptics {
  return options as unknown as GrasslandsObservationOptics;
}

function createRenderTarget(
  colorTextures: readonly FakeResource[] = [],
  depthTexture: FakeResource | null = null,
  destroyed = false
): FakeRenderTarget {
  return { destroyed, colorTextures, depthTexture };
}

describe("Grasslands runtime exclusion observation", () => {
  it("deduplicates components observed through repeated roots and accepts the one-camera/one-light baseline", () => {
    const heroCamera = createCamera();
    const directLight = createDirectLight();
    const root = createRoot([heroCamera], [directLight]);
    const observation = observeGrasslandsExcludedResources(createScene([root, root]), heroCamera, createOptics({}));

    expect(observation).toEqual({
      source: "runtime-observed",
      cameraComponentCount: 1,
      directLightComponentCount: 1,
      skyboxCount: 0,
      planarCameraCount: 0,
      reflectionProbeCount: 0,
      renderTargetCount: 0
    });
    expect(isGrasslandsExclusionClean(observation)).toBe(true);
  });

  it("counts extra nested cameras/lights and unique live render targets by object identity", () => {
    const sharedRenderTarget = createRenderTarget();
    const heroCamera = createCamera();
    const extraCameraA = createCamera(sharedRenderTarget);
    const extraCameraB = createCamera(sharedRenderTarget);
    const directLight = createDirectLight();
    const extraLight = createDirectLight();
    const observation = observeGrasslandsExcludedResources(
      createScene([
        createRoot([heroCamera, extraCameraA], [directLight]),
        createRoot([extraCameraA, extraCameraB], [directLight, extraLight])
      ]),
      heroCamera,
      createOptics({})
    );

    expect(observation).toMatchObject({
      cameraComponentCount: 3,
      directLightComponentCount: 2,
      planarCameraCount: 2,
      renderTargetCount: 1
    });
    expect(isGrasslandsExclusionClean(observation)).toBe(false);
  });

  it("does not double-count a planar attachment and counts a standalone planar texture", () => {
    const attachedPlanarTexture = { destroyed: false };
    const heroRenderTarget = createRenderTarget();
    const planarRenderTarget = createRenderTarget([attachedPlanarTexture]);
    const heroCamera = createCamera(heroRenderTarget);
    const planarCamera = createCamera(planarRenderTarget);
    const scene = createScene([createRoot([heroCamera, planarCamera], [createDirectLight()])]);

    expect(
      observeGrasslandsExcludedResources(scene, heroCamera, createOptics({ planarTexture: attachedPlanarTexture }))
    ).toMatchObject({
      planarCameraCount: 1,
      renderTargetCount: 2
    });
    expect(
      observeGrasslandsExcludedResources(scene, heroCamera, createOptics({ planarTexture: { destroyed: false } }))
    ).toMatchObject({
      planarCameraCount: 1,
      renderTargetCount: 3
    });
  });

  it("fails closed for partial sky state and live probe bindings while ignoring destroyed resources", () => {
    const heroCamera = createCamera(createRenderTarget([], null, true));
    const directLight = createDirectLight();
    const root = createRoot([heroCamera], [directLight]);
    const liveResource = { destroyed: false };

    for (const scene of [
      createScene([root], { mode: BackgroundMode.Sky }),
      createScene([root], { skyMaterial: liveResource }),
      createScene([root], { skyMesh: liveResource })
    ]) {
      expect(observeGrasslandsExcludedResources(scene, heroCamera, createOptics({})).skyboxCount).toBe(1);
    }

    expect(
      observeGrasslandsExcludedResources(
        createScene([root]),
        heroCamera,
        createOptics({
          planarTexture: { destroyed: true },
          probeTexture: { destroyed: true }
        })
      )
    ).toMatchObject({
      reflectionProbeCount: 0,
      renderTargetCount: 0
    });
    expect(
      observeGrasslandsExcludedResources(createScene([root]), heroCamera, createOptics({ probeTexture: liveResource }))
        .reflectionProbeCount
    ).toBe(1);
  });

  it("returns a disposed zero snapshot and rejects every non-zero exclusion field", () => {
    const disposed = observeGrasslandsExcludedResources(undefined, undefined, undefined);
    expect(disposed).toEqual({
      source: "runtime-observed",
      cameraComponentCount: 0,
      directLightComponentCount: 0,
      skyboxCount: 0,
      planarCameraCount: 0,
      reflectionProbeCount: 0,
      renderTargetCount: 0
    });

    const clean: GrasslandsExcludedResourceAcceptanceReadback = {
      source: "runtime-observed",
      cameraComponentCount: 1,
      directLightComponentCount: 1,
      skyboxCount: 0,
      planarCameraCount: 0,
      reflectionProbeCount: 0,
      renderTargetCount: 0
    };
    for (const key of [
      "cameraComponentCount",
      "directLightComponentCount",
      "skyboxCount",
      "planarCameraCount",
      "reflectionProbeCount",
      "renderTargetCount"
    ] as const) {
      const invalidValue = key === "cameraComponentCount" || key === "directLightComponentCount" ? 2 : 1;
      expect(isGrasslandsExclusionClean({ ...clean, [key]: invalidValue })).toBe(false);
    }
  });
});
