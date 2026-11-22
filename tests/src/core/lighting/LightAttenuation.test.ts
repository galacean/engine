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

function srgbToLinear(byte: number): number {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

describe("PointLight and SpotLight physical distance attenuation", () => {
  let engine: WebGLEngine;
  let camera: Camera;
  let targetTexture: Texture2D;
  let renderTarget: RenderTarget;
  let planeRenderer: MeshRenderer;
  let pbrMaterial: PBRMaterial;
  let blinnMaterial: BlinnPhongMaterial;
  let pointLight: PointLight;
  let spotLight: SpotLight;

  const size = 64;

  function readCenterPixel(): [number, number, number, number] {
    engine.update();
    const buffer = new Uint8Array(4);
    targetTexture.getPixelBuffer(size >> 1, size >> 1, 1, 1, 0, buffer);
    return [buffer[0], buffer[1], buffer[2], buffer[3]];
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
    camera.entity.transform.lookAt(new Vector3(0, 0, 0));

    targetTexture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8_UNorm, false, true);
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

    planeRenderer.setMaterial(pbrMaterial);

    pointLight = root.createChild("PointLight").addComponent(PointLight);
    pointLight.enabled = false;

    spotLight = root.createChild("SpotLight").addComponent(SpotLight);
    spotLight.enabled = false;
  });

  afterAll(() => {
    camera.renderTarget = null;
    renderTarget.destroy();
    targetTexture.destroy();
    engine.destroy();
  });

  it("PointLight distance API defaults to 100, supports Infinity, and guards <= 0 / NaN", () => {
    const entity = engine.sceneManager.activeScene!.createRootEntity("GuardCheck");
    const light = entity.addComponent(PointLight);
    expect(light.distance).to.equal(100);

    light.distance = Infinity;
    expect(light.distance).to.equal(Infinity);

    light.distance = 0;
    expect(light.distance).to.be.greaterThan(0);
    expect(light.distance).to.be.lessThan(0.001);

    light.distance = -10;
    expect(light.distance).to.be.greaterThan(0);

    const prev = light.distance;
    light.distance = Number.NaN;
    expect(light.distance).to.equal(prev);

    entity.destroy();
  });

  it("PointLight follows windowed inverse-square falloff on PBR", () => {
    planeRenderer.setMaterial(pbrMaterial);
    spotLight.enabled = false;
    pointLight.enabled = true;
    pointLight.distance = 20;
    pointLight.color.set(4, 4, 4, 1);

    pointLight.entity.transform.setPosition(0, 0, 2);
    const px2 = readCenterPixel()[0];

    pointLight.entity.transform.setPosition(0, 0, 4);
    const px4 = readCenterPixel()[0];

    pointLight.entity.transform.setPosition(0, 0, 8);
    const px8 = readCenterPixel()[0];

    // Expected linear values (albedo 0.5, dielectric F0 ~0.04 => diffuseColor ~0.48, color 4):
    // Ratio of linear irradiance between d=2, d=4, d=8 with R=20:
    // att(2)/att(4) ≈ 4.01, att(4)/att(8) ≈ 4.20
    const l2 = srgbToLinear(px2);
    const l4 = srgbToLinear(px4);
    const l8 = srgbToLinear(px8);

    expect(px2).to.be.greaterThan(px4);
    expect(px4).to.be.greaterThan(px8);
    expect(l2 / l4).to.be.closeTo(4.0, 0.35);
    expect(l4 / l8).to.be.closeTo(4.2, 0.5);
  });

  it("PointLight cuts off cleanly beyond distance and supports distance = Infinity", () => {
    planeRenderer.setMaterial(pbrMaterial);
    spotLight.enabled = false;
    pointLight.enabled = true;
    pointLight.color.set(25, 25, 25, 1);

    // Beyond finite cutoff distance -> strictly zero
    pointLight.distance = 4;
    pointLight.entity.transform.setPosition(0, 0, 5);
    expect(readCenterPixel()[0]).to.equal(0);

    // Same position with distance = Infinity -> lit by pure 1/d^2
    pointLight.distance = Infinity;
    const pxInf = readCenterPixel()[0];
    expect(pxInf).to.be.greaterThan(100);

    // Huge finite distance (> sqrt(FLT_MAX)) must not overflow fp32 or produce NaN
    pointLight.distance = 1e20;
    const pxHuge = readCenterPixel()[0];
    expect(pxHuge).to.be.closeTo(pxInf, 1);
  });

  it("PointLight at d = 0 produces finite output without NaN", () => {
    planeRenderer.setMaterial(pbrMaterial);
    spotLight.enabled = false;
    pointLight.enabled = true;
    pointLight.distance = 10;
    pointLight.color.set(1, 1, 1, 1);
    pointLight.entity.transform.setPosition(0, 0, 0);

    const [r, g, b, a] = readCenterPixel();
    expect(Number.isFinite(r)).to.equal(true);
    expect(Number.isFinite(g)).to.equal(true);
    expect(Number.isFinite(b)).to.equal(true);
    expect(a).to.equal(255);
  });

  it("SpotLight follows inverse-square distance falloff, finite cutoff, and distance = Infinity", () => {
    planeRenderer.setMaterial(pbrMaterial);
    pointLight.enabled = false;
    spotLight.enabled = true;
    spotLight.distance = 20;
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = Math.PI / 12;
    spotLight.color.set(4, 4, 4, 1);

    spotLight.entity.transform.setPosition(0, 0, 2);
    spotLight.entity.transform.lookAt(new Vector3(0, 0, 0));
    const px2 = readCenterPixel()[0];

    spotLight.entity.transform.setPosition(0, 0, 4);
    spotLight.entity.transform.lookAt(new Vector3(0, 0, 0));
    const px4 = readCenterPixel()[0];

    // Aim away from plane -> outside cone -> strictly zero
    spotLight.entity.transform.lookAt(new Vector3(10, 0, 0));
    const pxOutside = readCenterPixel()[0];

    // SpotLight with distance = Infinity beyond previous finite cutoff
    spotLight.distance = 3;
    spotLight.entity.transform.setPosition(0, 0, 5);
    spotLight.entity.transform.lookAt(new Vector3(0, 0, 0));
    const pxCutoff = readCenterPixel()[0];
    spotLight.distance = Infinity;
    spotLight.color.set(25, 25, 25, 1);
    const pxInf = readCenterPixel()[0];

    expect(px2).to.be.greaterThan(px4);
    expect(srgbToLinear(px2) / srgbToLinear(px4)).to.be.closeTo(4.0, 0.35);
    expect(pxOutside).to.equal(0);
    expect(pxCutoff).to.equal(0);
    expect(pxInf).to.be.greaterThan(100);
  });

  it("BlinnPhong PointLight & SpotLight follow inverse-square falloff consistently", () => {
    planeRenderer.setMaterial(blinnMaterial);
    spotLight.enabled = false;
    pointLight.enabled = true;
    pointLight.distance = 20;
    pointLight.color.set(4, 4, 4, 1);

    pointLight.entity.transform.setPosition(0, 0, 2);
    const bp2 = readCenterPixel()[0];

    pointLight.entity.transform.setPosition(0, 0, 4);
    const bp4 = readCenterPixel()[0];

    expect(bp2).to.be.greaterThan(bp4);
    expect(srgbToLinear(bp2) / srgbToLinear(bp4)).to.be.closeTo(4.0, 0.35);

    pointLight.enabled = false;
    spotLight.enabled = true;
    spotLight.distance = 20;
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = Math.PI / 12;
    spotLight.color.set(4, 4, 4, 1);

    spotLight.entity.transform.setPosition(0, 0, 2);
    spotLight.entity.transform.lookAt(new Vector3(0, 0, 0));
    const bs2 = readCenterPixel()[0];

    spotLight.entity.transform.setPosition(0, 0, 4);
    spotLight.entity.transform.lookAt(new Vector3(0, 0, 0));
    const bs4 = readCenterPixel()[0];

    expect(bs2).to.be.greaterThan(bs4);
    expect(srgbToLinear(bs2) / srgbToLinear(bs4)).to.be.closeTo(4.0, 0.35);
  });
});
