import { describe, expect, it } from "vitest";
import { Camera, DirectLight, Matrix, SunLensFlareEffect, Vector3 } from "@galacean/engine";

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

describe("SunLensFlareEffect projection & attenuation", () => {
  it("projects an elevated sun straight ahead to screen center with full intensity", () => {
    const effect = new SunLensFlareEffect();
    effect.enabled = true;
    effect.intensity.value = 0.6;
    // Direction from sun toward ground = (0, -sin30, cos30) -> direction toward sun = (0, 0.5, -0.866)
    const dirToSun = new Vector3(0, 0.5, -Math.sqrt(3) / 2).normalize();
    const camera = createPerspectiveCameraMock({ target: dirToSun });
    const scene = createSceneMock(dirToSun);
    const out = { visible: false, sunU: 0, sunV: 0, effectiveIntensity: 0, aspectRatio: 1 };

    SunLensFlareEffect._resolveScreenState(camera, scene, effect, out);
    expect(out.visible).toBe(true);
    expect(out.sunU).toBeCloseTo(0.5, 4);
    expect(out.sunV).toBeCloseTo(0.5, 4);
    expect(out.effectiveIntensity).toBeCloseTo(0.6, 4);
    expect(out.aspectRatio).toBeCloseTo(16 / 9, 4);
  });

  it("maps an upper-right sun to u > 0.5 and v < 0.5 (matching UberPost flipY UV space)", () => {
    const effect = new SunLensFlareEffect();
    effect.enabled = true;
    // Camera looks down -Z; sun is up (+Y) and to the right (+X)
    const dirToSun = new Vector3(0.25, 0.25, -1).normalize();
    const camera = createPerspectiveCameraMock({ target: new Vector3(0, 0, -1) });
    const scene = createSceneMock(dirToSun);
    const out = { visible: false, sunU: 0, sunV: 0, effectiveIntensity: 0, aspectRatio: 1 };

    SunLensFlareEffect._resolveScreenState(camera, scene, effect, out);
    expect(out.visible).toBe(true);
    expect(out.sunU).toBeGreaterThan(0.55);
    expect(out.sunU).toBeLessThan(1);
    expect(out.sunV).toBeLessThan(0.45);
    expect(out.sunV).toBeGreaterThan(0);
  });

  it("culls when the sun is behind the camera, below the horizon, orthographic, or zero intensity", () => {
    const effect = new SunLensFlareEffect();
    effect.enabled = true;
    const camera = createPerspectiveCameraMock({ target: new Vector3(0, 0, -1) });
    const out = { visible: false, sunU: 0, sunV: 0, effectiveIntensity: 0, aspectRatio: 1 };

    // Behind camera (+Z while looking down -Z)
    SunLensFlareEffect._resolveScreenState(camera, createSceneMock(new Vector3(0, 0.4, 1).normalize()), effect, out);
    expect(out.visible).toBe(false);
    expect(out.effectiveIntensity).toBe(0);

    // Below horizon (dirToSun.y = -0.1)
    SunLensFlareEffect._resolveScreenState(camera, createSceneMock(new Vector3(0, -0.1, -1).normalize()), effect, out);
    expect(out.visible).toBe(false);
    expect(out.effectiveIntensity).toBe(0);

    // Orthographic camera
    const orthoCam = createPerspectiveCameraMock({ target: new Vector3(0, 0.4, -1), isOrthographic: true });
    SunLensFlareEffect._resolveScreenState(orthoCam, createSceneMock(new Vector3(0, 0.4, -1).normalize()), effect, out);
    expect(out.visible).toBe(false);

    // Zero intensity preserves isValid() for shader warmup stability while skipping render evaluation
    effect.intensity.value = 0;
    expect(effect.isValid()).toBe(true);
    SunLensFlareEffect._resolveScreenState(camera, createSceneMock(new Vector3(0, 0.4, -1).normalize()), effect, out);
    expect(out.visible).toBe(false);
  });

  it("prefers sunDirectionOverride over scene.sun when non-zero", () => {
    const effect = new SunLensFlareEffect();
    effect.enabled = true;
    // sunDirectionOverride points FROM sun toward ground (same convention as DirectLight.direction)
    effect.sunDirectionOverride.value.set(0, -0.5, 0.8660254);
    const camera = createPerspectiveCameraMock({ target: new Vector3(0, 0.5, -0.8660254) });
    // Scene sun points the opposite way (behind camera)
    const scene = createSceneMock(new Vector3(0, 0.5, 0.8660254));
    const out = { visible: false, sunU: 0, sunV: 0, effectiveIntensity: 0, aspectRatio: 1 };

    SunLensFlareEffect._resolveScreenState(camera, scene, effect, out);
    expect(out.visible).toBe(true);
    expect(out.sunU).toBeCloseTo(0.5, 4);
    expect(out.sunV).toBeCloseTo(0.5, 4);
  });
});
