import { expect } from "chai";
import { Layer, DirectLight, PointLight, SpotLight, AmbientLight, Camera, Entity, AssetType, SkyBoxMaterial, BackgroundMode, PrimitiveMesh, Scene, Engine } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Color, Vector3 } from "@galacean/engine-math";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;


describe("Light test", function () {
  let engine: Engine;
  let scene: Scene;
  let lightEntity: Entity;
  let directLight: DirectLight;
  let pointLight: PointLight;
  let spotLight: SpotLight;
  let ambientLight: AmbientLight;

  before(async () => {
    engine = await WebGLEngine.create({ canvas: canvasDOM , colorSpace: 1 });
    const rootEntity = engine.sceneManager.activeScene.createRootEntity(); 
    const camera = rootEntity.addComponent(Camera);
    scene = engine.sceneManager.activeScene;
 
    lightEntity = rootEntity.createChild("light");
    directLight = lightEntity.addComponent(DirectLight);
    pointLight = lightEntity.addComponent(PointLight);
    spotLight = lightEntity.addComponent(SpotLight);

    engine.run();
  });

  it("test directLight default values", function () {
    expect(directLight.color).to.deep.equal(new Color(1, 1, 1));
    expect(directLight.intensity).to.equal(1);
    expect(directLight.cullingMask).to.equal(Layer.Everything);
    expect(directLight.shadowType).to.equal(0);
    expect(directLight.shadowBias).to.equal(1);
    expect(directLight.shadowNormalBias).to.equal(1);
    expect(directLight.shadowNearPlane).to.equal(0.1);
    expect(directLight.shadowStrength).to.equal(1);
    expect(directLight.reverseDirection).to.deep.equal(new Vector3(0, 0, 1));
  });

  it("should update color correctly", function () {
    const color = new Color(0.5, 0.5, 0.5);
    directLight.color = color;
    expect(directLight.color).to.deep.equal(color);
  });

  it("should update viewMatrix correctly", function () {
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

  it("should update intensity correctly", function () {
    directLight.intensity = 2;
    expect(directLight.intensity).to.equal(2);
  });

  it("should update shadow type correctly", function () {
    directLight.shadowType = 1;
    expect(directLight.shadowType).to.equal(1);
  });

  it("should update shadow bias correctly", function () {
    directLight.shadowBias = 0.1;
    expect(directLight.shadowBias).to.equal(0.1);
  });

  it("should update shadow normal bias correctly", function () {
    directLight.shadowNormalBias = 0.6;
    expect(directLight.shadowNormalBias).to.equal(0.6);
  });

  it("should update shadow strength correctly", function () {
    directLight.shadowStrength = 0.8;
    expect(directLight.shadowStrength).to.equal(0.8);
  });

  it("test pointLight position values", function () {
    pointLight.distance = 100;
    pointLight.color.set(0.3, 0.3, 1, 1);
    const expectPositon = new Vector3(-10, 10, 10);
    lightEntity.transform.setPosition(expectPositon.x, expectPositon.y, expectPositon.z);
    const lightPosition = pointLight.position;
    expect(lightPosition.x).to.deep.eq(expectPositon.x);
    expect(lightPosition.y).to.deep.eq(expectPositon.y);
    expect(lightPosition.z).to.deep.eq(expectPositon.z);
  });

  it("test spotLight direction", function () {
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = Math.PI / 12;
    spotLight.color.set(0.3, 0.3, 1, 1);

    const expectDirection = new Vector3(0, 0, 1);
    const reverseDirection = spotLight.reverseDirection;
    expect(expectDirection).to.deep.eq(reverseDirection);
  });

  it("test component enabled false", function () {
    directLight.enabled = false;
    pointLight.enabled = false;
    spotLight.enabled = false;
  });

  it("test ambientLight", function () {
    ambientLight = scene.ambientLight;

    ambientLight.diffuseSolidColor.set(1, 0, 0, 1);
    ambientLight.diffuseIntensity = 0.5;

    const sky = scene.background.sky;
    const skyMaterial = new SkyBoxMaterial(engine);
    scene.background.mode = BackgroundMode.Sky;
    sky.material = skyMaterial;
    sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

    engine.resourceManager
    .load<AmbientLight>({
        type: AssetType.Env,
        url: 'https://gw.alipayobjects.com/os/bmw-prod/6470ea5e-094b-4a77-a05f-4945bf81e318.bin',
    })
    .then((ambientLight) => {
        scene.ambientLight = ambientLight;
        skyMaterial.texture = ambientLight.specularTexture;
        skyMaterial.textureDecodeRGBM = true;
    });
  });
});
