import {
  AmbientLight,
  BlinnPhongMaterial,
  Camera,
  Color,
  MeshRenderer,
  PBRMaterial,
  PointLight,
  PrimitiveMesh,
  RenderTarget,
  SpotLight,
  Texture2D,
  TextureFormat,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function expectedAttenuation(d: number, cutoff: number): number {
  let att = 1 / Math.max(d * d, 1e-4);
  if (Number.isFinite(cutoff)) {
    const f = Math.min((d * d) / (cutoff * cutoff), 1);
    const s = 1 - f * f;
    att *= s * s;
  }
  return att;
}

describe("PointLight and SpotLight physical distance attenuation", () => {
  // Odd target size so center pixel (4, 4) samples exact NDC (0, 0) -> world (0, 0, 0).
  const size = 9;
  const center = size >> 1;
  const origin = new Vector3(0, 0, 0);

  let engine: WebGLEngine;
  let camera: Camera;
  let targetTexture: Texture2D;
  let renderTarget: RenderTarget;
  let planeRenderer: MeshRenderer;
  let pbrMaterial: PBRMaterial;
  let blinnMaterial: BlinnPhongMaterial;
  let pointLight: PointLight;
  let spotLight: SpotLight;

  function readCenterPixel(): Float32Array {
    engine.update();
    const buffer = new Float32Array(4);
    targetTexture.getPixelBuffer(center, center, 1, 1, 0, buffer);
    return buffer;
  }

  function expectFinitePixel(pixel: Float32Array): void {
    for (let i = 0; i < 4; i++) {
      expect(Number.isFinite(pixel[i])).to.equal(true);
    }
    expect(pixel[3]).to.be.closeTo(1, 1e-4);
  }

  function activatePoint(z: number, distance: number, intensity: number): void {
    spotLight.enabled = false;
    pointLight.enabled = true;
    pointLight.distance = distance;
    pointLight.color.set(intensity, intensity, intensity, 1);
    pointLight.entity.transform.setPosition(0, 0, z);
  }

  function activateSpot(z: number, distance: number, intensity: number, target = origin): void {
    pointLight.enabled = false;
    spotLight.enabled = true;
    spotLight.distance = distance;
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = Math.PI / 12;
    spotLight.color.set(intensity, intensity, intensity, 1);
    spotLight.entity.transform.setPosition(0, 0, z);
    spotLight.entity.transform.lookAt(target);
  }

  beforeAll(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    scene.background.solidColor.set(0, 0, 0, 1);
    scene.ambientLight = new AmbientLight(engine);
    scene.ambientLight.diffuseIntensity = 0;
    scene.ambientLight.specularIntensity = 0;

    const root = scene.createRootEntity("Root");
    camera = root.createChild("Camera").addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    camera.entity.transform.setPosition(0, 0, 10);
    camera.entity.transform.lookAt(origin);

    targetTexture = new Texture2D(engine, size, size, TextureFormat.R32G32B32A32_SFloat, false, false);
    renderTarget = new RenderTarget(engine, size, size, targetTexture);
    camera.renderTarget = renderTarget;

    const plane = root.createChild("Plane");
    plane.transform.setRotation(90, 0, 0);
    planeRenderer = plane.addComponent(MeshRenderer);
    planeRenderer.mesh = PrimitiveMesh.createPlane(engine, 2, 2);

    pbrMaterial = new PBRMaterial(engine);
    pbrMaterial.baseColor = new Color(0.5, 0.5, 0.5, 1);
    pbrMaterial.metallic = 0;
    pbrMaterial.roughness = 1;

    blinnMaterial = new BlinnPhongMaterial(engine);
    blinnMaterial.baseColor = new Color(0.5, 0.5, 0.5, 1);
    blinnMaterial.specularColor = new Color(0, 0, 0, 1);

    pointLight = root.createChild("PointLight").addComponent(PointLight);
    spotLight = root.createChild("SpotLight").addComponent(SpotLight);
  });

  afterAll(() => {
    camera.renderTarget = null;
    renderTarget.destroy();
    targetTexture.destroy();
    engine.destroy();
  });

  it("PointLight and SpotLight distance APIs default to 100, support Infinity, and guard <= 0 / NaN", () => {
    for (const LightType of [PointLight, SpotLight]) {
      const entity = engine.sceneManager.activeScene!.createRootEntity("GuardCheck");
      const light = entity.addComponent(LightType);
      expect(light.distance).to.equal(100);

      light.distance = Infinity;
      expect(light.distance).to.equal(Infinity);

      for (const nonPositive of [0, -10, -Infinity]) {
        light.distance = nonPositive;
        expect(light.distance).to.be.greaterThan(0);
        expect(light.distance).to.be.lessThan(0.001);
      }

      const prev = light.distance;
      light.distance = Number.NaN;
      expect(light.distance).to.equal(prev);

      entity.destroy();
    }
  });

  it("PointLight and SpotLight follow windowed inverse-square falloff on PBR and BlinnPhong", () => {
    const r24 = expectedAttenuation(2, 20) / expectedAttenuation(4, 20);
    const r48 = expectedAttenuation(4, 20) / expectedAttenuation(8, 20);

    for (const material of [pbrMaterial, blinnMaterial]) {
      planeRenderer.setMaterial(material);

      for (const activate of [
        (z: number) => activatePoint(z, 20, 4),
        (z: number) => activateSpot(z, 20, 4)
      ]) {
        activate(2);
        const l2 = readCenterPixel()[0];
        activate(4);
        const l4 = readCenterPixel()[0];
        activate(8);
        const l8 = readCenterPixel()[0];

        expect(l2).to.be.greaterThan(l4);
        expect(l4).to.be.greaterThan(l8);
        expect(l2 / l4).to.be.closeTo(r24, 0.02);
        expect(l4 / l8).to.be.closeTo(r48, 0.02);
      }
    }
  });

  it("PointLight and SpotLight cut off at distance, support Infinity, and handle large finite distances", () => {
    planeRenderer.setMaterial(pbrMaterial);

    activatePoint(5, 4, 25);
    expect(readCenterPixel()[0]).to.equal(0);

    activatePoint(5, Infinity, 25);
    const infVal = readCenterPixel()[0];
    expect(infVal).to.be.greaterThan(0.1);

    for (const hugeDistance of [1e20, 1e40]) {
      activatePoint(5, hugeDistance, 25);
      const pixel = readCenterPixel();
      expectFinitePixel(pixel);
      expect(pixel[0]).to.be.closeTo(infVal, 1e-4);
    }

    // SpotLight: outside cone, beyond finite cutoff, and Infinity
    activateSpot(2, 20, 4, new Vector3(10, 0, 0));
    expect(readCenterPixel()[0]).to.equal(0);

    activateSpot(5, 3, 25);
    expect(readCenterPixel()[0]).to.equal(0);

    activateSpot(5, Infinity, 25);
    expect(readCenterPixel()[0]).to.be.closeTo(infVal, 1e-4);
  });

  it("Exact d = 0 singularity and near-zero clamp produce finite float output on PBR and BlinnPhong", () => {
    for (const material of [pbrMaterial, blinnMaterial]) {
      planeRenderer.setMaterial(material);

      // Exact distanceSq == 0 at sampled center pixel (world origin)
      activatePoint(0, 10, 1);
      expectFinitePixel(readCenterPixel());

      activateSpot(0, 10, 1, new Vector3(0, 0, -1));
      expectFinitePixel(readCenterPixel());

      // Near-zero clamp: both d = 0.001 and d = 0.005 have d^2 < 1e-4, so radiance is clamped identically
      activatePoint(0.001, 10, 1);
      const near1 = readCenterPixel();
      expectFinitePixel(near1);

      activatePoint(0.005, 10, 1);
      const near5 = readCenterPixel();
      expectFinitePixel(near5);

      expect(near1[0]).to.be.greaterThan(100);
      expect(near1[0] / near5[0]).to.be.closeTo(1, 0.02);
    }
  });
});
