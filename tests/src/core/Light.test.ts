import { expect } from "chai";
import {
  Layer,
  DirectLight,
  PointLight,
  SpotLight,
  AmbientLight,
  Entity,
  AssetType,
  SkyBoxMaterial,
  BackgroundMode,
  PrimitiveMesh,
  Scene,
  Engine
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Color, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";

import { lightResource } from "./model/ambientLight";
import { ColorSpace, ShadowType } from "@galacean/engine-core";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("Light test", function () {
  let engine: Engine;
  let scene: Scene;
  let lightEntity: Entity;
  let sunLight: DirectLight;
  let directLight: DirectLight;
  let pointLight: PointLight;
  let spotLight: SpotLight;
  let ambientLightA: AmbientLight;
  let ambientLightB: AmbientLight;

  before(async () => {
    engine = await WebGLEngine.create({ canvas: canvasDOM, colorSpace: ColorSpace.Gamma });
    const rootEntity = engine.sceneManager.activeScene.createRootEntity();
    scene = engine.sceneManager.activeScene;

    lightEntity = rootEntity.createChild("light");
    directLight = lightEntity.addComponent(DirectLight);
    pointLight = lightEntity.addComponent(PointLight);
    spotLight = lightEntity.addComponent(SpotLight);

    engine.run();
  });

  it("light default values", function () {
    expect(directLight.color).to.deep.equal(new Color(1, 1, 1));
    expect(directLight.intensity).to.equal(1);
    expect(directLight.cullingMask).to.equal(Layer.Everything);
    expect(directLight.shadowType).to.equal(ShadowType.None);
    expect(directLight.shadowBias).to.equal(1);
    expect(directLight.shadowNormalBias).to.equal(1);
    expect(directLight.shadowNearPlane).to.equal(0.1);
    expect(directLight.shadowStrength).to.equal(1);
    expect(directLight.reverseDirection).to.deep.equal(new Vector3(0, 0, 1));
  });

  it("update color", function () {
    const expectColor = new Color(0.5, 0.5, 0.5);
    directLight.color = expectColor;
    const currentColor = directLight.color;
    expect(expectColor).to.deep.equal(currentColor);
  });

  it("update viewMatrix", function () {
    const viewMatrix = directLight.viewMatrix.elements;
    const inverseViewMatrix = directLight.inverseViewMatrix.elements;

    expect(viewMatrix[0]).to.deep.equal(inverseViewMatrix[0]);
    expect(viewMatrix[1]).to.deep.equal(inverseViewMatrix[1]);
    expect(viewMatrix[2]).to.deep.equal(inverseViewMatrix[2]);
    expect(viewMatrix[3]).to.deep.equal(inverseViewMatrix[3]);
    expect(viewMatrix[4]).to.deep.equal(inverseViewMatrix[4]);
    expect(viewMatrix[5]).to.deep.equal(inverseViewMatrix[5]);
    expect(viewMatrix[6] + inverseViewMatrix[6]).to.deep.equal(0);
    expect(viewMatrix[7]).to.deep.equal(inverseViewMatrix[7]);
    expect(viewMatrix[8]).to.deep.equal(inverseViewMatrix[8]);
    expect(viewMatrix[9]).to.deep.equal(inverseViewMatrix[9]);
    expect(viewMatrix[10]).to.deep.equal(inverseViewMatrix[10]);
    expect(viewMatrix[11]).to.deep.equal(inverseViewMatrix[11]);
    expect(viewMatrix[12] + inverseViewMatrix[12]).to.deep.equal(0);
    expect(viewMatrix[13] + inverseViewMatrix[13]).to.deep.equal(0);
    expect(viewMatrix[14] + inverseViewMatrix[14]).to.deep.equal(0);
    expect(viewMatrix[15]).to.deep.equal(inverseViewMatrix[15]);
  });

  it("update intensity", function () {
    directLight.intensity = 2;
    expect(directLight.intensity).to.equal(2);
    const expectedColor = new Color(1, 1, 1, 2);
    engine.update();
    const calculatedColor = directLight["_lightColor"];
    expect(calculatedColor).to.deep.equal(expectedColor);
  });

  it("update shadow type", function () {
    directLight.shadowType = ShadowType.Hard;
    expect(directLight.shadowType).to.equal(ShadowType.Hard);
  });

  it("update shadow bias", function () {
    directLight.shadowBias = 0.1;
    expect(directLight.shadowBias).to.equal(0.1);
  });

  it("update shadow normal bias", function () {
    directLight.shadowNormalBias = 0.6;
    expect(directLight.shadowNormalBias).to.equal(0.6);
  });

  it("update shadow strength", function () {
    const expectShadowStrength = 0.8;
    directLight.shadowStrength = expectShadowStrength;
    expect(directLight.shadowStrength).to.equal(expectShadowStrength);
  });

  it("multiple directlight or sunlight", function () {
    sunLight = lightEntity.addComponent(DirectLight);
    expect(sunLight["_lightIndex"]).to.eq(1);
  });

  it("pointLight position values", function () {
    pointLight.distance = 100;
    pointLight.color.set(0.3, 0.3, 1, 1);
    const expectPositon = new Vector3(-10, 10, 10);
    lightEntity.transform.setPosition(expectPositon.x, expectPositon.y, expectPositon.z);
    const lightPosition = pointLight.position;
    expect(lightPosition.x).to.deep.eq(expectPositon.x);
    expect(lightPosition.y).to.deep.eq(expectPositon.y);
    expect(lightPosition.z).to.deep.eq(expectPositon.z);
  });

  it("spotLight direction", function () {
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = Math.PI / 12;
    spotLight.color.set(0.3, 0.3, 1, 1);

    const expectDirection = new Vector3(0, 0, 1);
    const reverseDirection = spotLight.reverseDirection;
    expect(expectDirection).to.deep.eq(reverseDirection);
  });

  it("light component disabled", function () {
    directLight.enabled = false;
    pointLight.enabled = false;
    spotLight.enabled = false;
  });

  it("create ambientLight", function () {
    ambientLightA = scene.ambientLight;
    ambientLightA.diffuseSolidColor.set(1, 0, 0, 1);
    const diffuseIntensity = ambientLightA.diffuseIntensity;
    expect(diffuseIntensity).to.eq(1);

    const expectDiffuseIntensity = 0.5;
    ambientLightA.diffuseIntensity = expectDiffuseIntensity;
    expect(ambientLightA.diffuseIntensity).to.eq(expectDiffuseIntensity);

    const diffuseSphericalHarmonics = new SphericalHarmonics3();
    ambientLightA.diffuseSphericalHarmonics = diffuseSphericalHarmonics;
    const coefficients = ambientLightA.diffuseSphericalHarmonics.coefficients;
    expect(coefficients).to.have.lengthOf(27);
  });

  it("ambientLight diffuseSphericalHarmonics", async () => {
    const sky = scene.background.sky;
    const skyMaterial = new SkyBoxMaterial(engine);
    scene.background.mode = BackgroundMode.Sky;
    sky.material = skyMaterial;
    sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

    ambientLightA = await engine.resourceManager.load<AmbientLight>({
      type: AssetType.Env,
      url: lightResource //'https://gw.alipayobjects.com/os/bmw-prod/6470ea5e-094b-4a77-a05f-4945bf81e318.bin'
    });
    if (ambientLightA) {
      scene.ambientLight = ambientLightA;
      skyMaterial.texture = ambientLightA.specularTexture;
      skyMaterial.textureDecodeRGBM = true;
    }

    const diffuseSphericalHarmonics = ambientLightA.diffuseSphericalHarmonics;
    expect(diffuseSphericalHarmonics).to.be.instanceOf(SphericalHarmonics3);

    const coefficients = diffuseSphericalHarmonics.coefficients;
    expect(coefficients).to.have.lengthOf(27);

    expect(coefficients[0]).to.be.closeTo(0.74, 0.001);
    expect(coefficients[2]).to.be.closeTo(0.589, 0.001);
    expect(coefficients[5]).to.be.closeTo(-0.425, 0.001);
    expect(coefficients[8]).to.be.closeTo(0.17, 0.001);
    expect(coefficients[11]).to.be.closeTo(-0.419, 0.001);
    expect(coefficients[14]).to.be.closeTo(0.407, 0.001);
    expect(coefficients[17]).to.be.closeTo(-0.168, 0.001);
    expect(coefficients[20]).to.be.closeTo(-0.07, 0.001);
    expect(coefficients[23]).to.be.closeTo(-0.189, 0.001);
    expect(coefficients[26]).to.be.closeTo(0.111, 0.001);
  });

  it("ambientLight diffuseMode", function () {
    const currentDiffuseMode = 1;
    const diffuseMode = ambientLightA.diffuseMode;
    expect(diffuseMode).to.eq(currentDiffuseMode);

    const expectDiffuseMode = 0;
    ambientLightA.diffuseMode = expectDiffuseMode;
    expect(ambientLightA.diffuseMode).to.eq(expectDiffuseMode);
  });

  it("ambientLight diffuseSolidColor", function () {
    const expectColor = new Color(0.8, 0.2, 0.5);
    ambientLightA.diffuseSolidColor = expectColor;
    const currentColor = ambientLightA.diffuseSolidColor;
    expect(currentColor).to.deep.eq(expectColor);
  });

  it("ambientLight specularIntensity", function () {
    const expectIntensity = 0.5;
    ambientLightA.specularIntensity = expectIntensity;
    const currentIntensity = ambientLightA.specularIntensity;
    expect(currentIntensity).to.eq(expectIntensity);
  });

  it("ambientLight specularTextureDecodeRGBM", async () => {
    const engine = await WebGLEngine.create({ canvas: canvasDOM, colorSpace: 0 });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = engine.sceneManager.activeScene.createRootEntity();
    const lightEntity = rootEntity.createChild("light");
    const sunLight = lightEntity.addComponent(DirectLight);
    const directLight = lightEntity.addComponent(DirectLight);
    const pointLight = lightEntity.addComponent(PointLight);
    const spotLight = lightEntity.addComponent(SpotLight);
    ambientLightB = scene.ambientLight;

    directLight.shadowType = ShadowType.SoftHigh;

    engine.run();

    const decodeRGBM = ambientLightB.specularTextureDecodeRGBM;
    const expectDecodeRGBM = false;
    expect(decodeRGBM).to.eq(expectDecodeRGBM);

    ambientLightB.specularTextureDecodeRGBM = !expectDecodeRGBM;
    const currentDecodeRGBM = ambientLightB.specularTextureDecodeRGBM;
    expect(currentDecodeRGBM).to.eq(!expectDecodeRGBM);
  });

  after(function () {
    engine.resourceManager.gc();
    engine.destroy();
  });
});
