import { describe, expect, it } from "vitest";
import {
  Camera,
  DirectLight,
  Matrix,
  ShadowType,
  Vector3,
  VolumetricLightEffect,
  VolumetricLightQuality
} from "@galacean/engine";

function createPerspectiveCameraMock(options: {
  position?: Vector3;
  target?: Vector3;
  fovDegrees?: number;
  aspect?: number;
  isOrthographic?: boolean;
}) {
  const position = options.position ?? new Vector3(0, 0, 0);
  const target = options.target ?? new Vector3(0, 0, -1);
  const fovRad = ((options.fovDegrees ?? 60) * Math.PI) / 180;
  const aspect = options.aspect ?? 16 / 9;
  const viewMatrix = new Matrix();
  Matrix.lookAt(position, target, new Vector3(0, 1, 0), viewMatrix);
  const projectionMatrix = new Matrix();
  Matrix.perspective(fovRad, aspect, 0.1, 1000, projectionMatrix);
  return {
    aspectRatio: aspect,
    isOrthographic: options.isOrthographic ?? false,
    viewMatrix,
    projectionMatrix
  } as unknown as Camera;
}

function createSceneMock(sunReverseDir?: Vector3) {
  return {
    _lightManager: {
      _sunlight: sunReverseDir
        ? ({
            reverseDirection: sunReverseDir
          } as unknown as DirectLight)
        : null
    }
  } as any;
}

describe("VolumetricLightEffect projection, ring clamp, and night gating", () => {
  it("projects an elevated sun straight ahead to screen center with default 0.6 intensity", () => {
    const effect = new VolumetricLightEffect();
    effect.enabled = true;
    const dirToSun = new Vector3(0, 0.5, -Math.sqrt(3) / 2).normalize();
    const camera = createPerspectiveCameraMock({ target: dirToSun });
    const scene = createSceneMock(dirToSun);
    const out = { visible: false, sunU: 0, sunV: 0, effectiveStrength: 0, aspectRatio: 1 };

    VolumetricLightEffect._resolveScreenState(camera, scene, effect, out);
    expect(out.visible).toBe(true);
    expect(out.sunU).toBeCloseTo(0.5, 4);
    expect(out.sunV).toBeCloseTo(0.5, 4);
    expect(out.effectiveStrength).toBeCloseTo(0.6, 4);
    expect(out.aspectRatio).toBeCloseTo(16 / 9, 4);
  });

  it("maps an upper-right sun to u > 0.5 and v < 0.5 matching UberPost UV space", () => {
    const effect = new VolumetricLightEffect();
    effect.enabled = true;
    const dirToSun = new Vector3(0.25, 0.25, -1).normalize();
    const camera = createPerspectiveCameraMock({ target: new Vector3(0, 0, -1) });
    const scene = createSceneMock(dirToSun);
    const out = { visible: false, sunU: 0, sunV: 0, effectiveStrength: 0, aspectRatio: 1 };

    VolumetricLightEffect._resolveScreenState(camera, scene, effect, out);
    expect(out.visible).toBe(true);
    expect(out.sunU).toBeGreaterThan(0.55);
    expect(out.sunU).toBeLessThan(1);
    expect(out.sunV).toBeLessThan(0.45);
    expect(out.sunV).toBeGreaterThan(0);
  });

  it("skips completely at night (solarVisibility = 0), below horizon, orthographic, or zero intensity", () => {
    const effect = new VolumetricLightEffect();
    effect.enabled = true;
    const camera = createPerspectiveCameraMock({ target: new Vector3(0, 0, -1) });
    const daytimeSun = new Vector3(0, 0.5, -0.8660254).normalize();
    const out = { visible: false, sunU: 0, sunV: 0, effectiveStrength: 0, aspectRatio: 1 };

    // Night gate (solarVisibility == 0) must disable both isValid() and _resolveScreenState()
    effect.solarVisibility.value = 0;
    expect(effect.isValid()).toBe(false);
    VolumetricLightEffect._resolveScreenState(camera, createSceneMock(daytimeSun), effect, out);
    expect(out.visible).toBe(false);
    expect(out.effectiveStrength).toBe(0);

    // Restore daylight, test below horizon
    effect.solarVisibility.value = 1;
    VolumetricLightEffect._resolveScreenState(
      camera,
      createSceneMock(new Vector3(0, -0.1, -1).normalize()),
      effect,
      out
    );
    expect(out.visible).toBe(false);

    // Orthographic camera
    const orthoCam = createPerspectiveCameraMock({ target: new Vector3(0, 0.4, -1), isOrthographic: true });
    VolumetricLightEffect._resolveScreenState(orthoCam, createSceneMock(daytimeSun), effect, out);
    expect(out.visible).toBe(false);

    // Zero intensity
    effect.intensity.value = 0;
    expect(effect.isValid()).toBe(false);
    VolumetricLightEffect._resolveScreenState(camera, createSceneMock(daytimeSun), effect, out);
    expect(out.visible).toBe(false);
  });

  it("prefers sunDirectionOverride over scene.sun so nighttime Moon light cannot trigger shafts", () => {
    const effect = new VolumetricLightEffect();
    effect.enabled = true;
    // True sun is below horizon (propagation direction points UP, so dirToSun = -override has y < 0)
    effect.sunDirectionOverride.value.set(0, 0.4, 0.9165);
    const camera = createPerspectiveCameraMock({ target: new Vector3(0, 0.3, -1) });
    // Even if scene.sun was repurposed to point at an elevated Moon above horizon:
    const moonScene = createSceneMock(new Vector3(0, 0.6, -0.8).normalize());
    const out = { visible: false, sunU: 0, sunV: 0, effectiveStrength: 0, aspectRatio: 1 };

    VolumetricLightEffect._resolveScreenState(camera, moonScene, effect, out);
    expect(out.visible).toBe(false);
    expect(out.effectiveStrength).toBe(0);
  });

  it("defaults to Low quality and enables 360-degree 3D raymarch on Medium/High when shadows are active", () => {
    const effect = new VolumetricLightEffect();
    effect.enabled = true;
    expect(effect.quality.value).toBe(VolumetricLightQuality.Low);

    // Camera facing directly AWAY from the sun (forwardDot < 0)
    const dirToSun = new Vector3(0, 0.5, 0.8660254).normalize();
    const camera = createPerspectiveCameraMock({ target: new Vector3(0, 0, -1) });
    const shadowScene = {
      castShadows: true,
      shadowDistance: 120,
      _lightManager: {
        _sunlight: {
          reverseDirection: dirToSun,
          shadowType: ShadowType.SoftLow,
          shadowStrength: 1.0
        } as unknown as DirectLight
      }
    } as any;
    const out = { visible: false, sunU: 0, sunV: 0, effectiveStrength: 0, aspectRatio: 1, useRaymarch: false };

    // Low 2D skips when facing directly away from the sun
    VolumetricLightEffect._resolveScreenState(camera, shadowScene, effect, out);
    expect(out.visible).toBe(false);
    expect(out.useRaymarch).toBe(false);

    // Medium / High 3D raymarch stays active at 360-degree camera angles
    effect.quality.value = VolumetricLightQuality.Medium;
    VolumetricLightEffect._resolveScreenState(camera, shadowScene, effect, out);
    expect(out.visible).toBe(true);
    expect(out.useRaymarch).toBe(true);
    expect(out.effectiveStrength).toBeCloseTo(0.6, 4);

    effect.quality.value = VolumetricLightQuality.High;
    VolumetricLightEffect._resolveScreenState(camera, shadowScene, effect, out);
    expect(out.visible).toBe(true);
    expect(out.useRaymarch).toBe(true);
  });

  it("falls back cleanly from Medium/High to 2D radial when shadows are disabled or shadowDistance <= 0", () => {
    const effect = new VolumetricLightEffect();
    effect.enabled = true;
    effect.quality.value = VolumetricLightQuality.High;
    const dirToSun = new Vector3(0, 0.5, -Math.sqrt(3) / 2).normalize();
    const camera = createPerspectiveCameraMock({ target: dirToSun });
    const out = { visible: false, sunU: 0, sunV: 0, effectiveStrength: 0, aspectRatio: 1, useRaymarch: false };

    // Shadows disabled on scene
    VolumetricLightEffect._resolveScreenState(
      camera,
      {
        castShadows: false,
        shadowDistance: 120,
        _lightManager: {
          _sunlight: { reverseDirection: dirToSun, shadowType: ShadowType.SoftLow, shadowStrength: 1 }
        }
      } as any,
      effect,
      out
    );
    expect(out.visible).toBe(true);
    expect(out.useRaymarch).toBe(false);

    // shadowDistance == 0
    VolumetricLightEffect._resolveScreenState(
      camera,
      {
        castShadows: true,
        shadowDistance: 0,
        _lightManager: {
          _sunlight: { reverseDirection: dirToSun, shadowType: ShadowType.SoftLow, shadowStrength: 1 }
        }
      } as any,
      effect,
      out
    );
    expect(out.visible).toBe(true);
    expect(out.useRaymarch).toBe(false);

    // shadowStrength == 0
    VolumetricLightEffect._resolveScreenState(
      camera,
      {
        castShadows: true,
        shadowDistance: 120,
        _lightManager: {
          _sunlight: { reverseDirection: dirToSun, shadowType: ShadowType.SoftLow, shadowStrength: 0 }
        }
      } as any,
      effect,
      out
    );
    expect(out.visible).toBe(true);
    expect(out.useRaymarch).toBe(false);
  });
});
