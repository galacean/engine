/**
 * @title Particle Emit Mesh
 * @category Particle
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*YnS0RIRZQv0AAAAAAAAAAAAADiR2AQ/original
 */
import {
  AssetType,
  BlendMode,
  Camera,
  Color,
  ConeShape,
  CurveKey,
  Engine,
  Entity,
  GLTFResource,
  Logger,
  ParticleCurve,
  ParticleCurveMode,
  ParticleGradientMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleRenderMode,
  ParticleSimulationSpace,
  PrimitiveMesh,
  Texture2D,
  Vector2,
  Vector3,
  WebGLEngine
} from "@galacean/engine";

Logger.enable();
main();

function createFireParticle(engine: Engine, texture: Texture2D, glTFModel: GLTFResource): Entity {
  const particleEntity = new Entity(engine, "Fire");
  particleEntity.transform.scale.set(1.268892, 1.268892, 1.268892);
  particleEntity.transform.rotate(90, 0, 0);
  // particleEntity.transform.position.set(-10, 0, 0);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
  material.blendMode = BlendMode.Additive;
  // material.baseTexture = texture;
   material.baseTexture = glTFModel.textures[0];
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 2;

  // debugger;
  particleRenderer.renderMode = ParticleRenderMode.Mesh;
  particleRenderer.mesh = glTFModel.meshes[0][0];
  // particleRenderer.mesh = PrimitiveMesh.createCuboid(engine, 0.5);
  // debugger;

  const generator = particleRenderer.generator;
  const { main, emission, textureSheetAnimation, sizeOverLifetime, colorOverLifetime } = generator;

  generator.useAutoRandomSeed = false;

  // Main module
  const { startLifetime, startSpeed, startSize, startRotationZ } = main;
  startLifetime.constantMin = 0.2;
  startLifetime.constantMax = 0.8;
  startLifetime.mode = ParticleCurveMode.TwoConstants;

  startSpeed.constantMin = 0.4;
  startSpeed.constantMax = 1.6;
  startSpeed.mode = ParticleCurveMode.TwoConstants;

  startSize.constantMin = 0.0005;
  startSize.constantMax = 0.0008;
  startSize.mode = ParticleCurveMode.TwoConstants;

  startRotationZ.constantMin = 0;
  startRotationZ.constantMax = 360;
  startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.simulationSpace = ParticleSimulationSpace.World;

  // Emission module
  emission.rateOverTime.constant = 35;

  const coneShape = new ConeShape();
  coneShape.angle = .96;
  coneShape.radius = 0.1;
  emission.shape = coneShape;

  // Color over lifetime module
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;

  const gradient = colorOverLifetime.color.gradient;
  const colorKeys = gradient.colorKeys;
  colorKeys[0].color.set(1.0, 0.21223075741405523, 0.00121410793419535, 1.0);
  colorKeys[1].time = 0.998;
  colorKeys[1].color.set(1.0, 0.19806931955994886, 0.0, 1.0);
  gradient.addColorKey(0.157, new Color(1, 1, 1, 1));
  gradient.addColorKey(0.573, new Color(1.0, 1.0, 0.25015828472995344, 1));
  gradient.alphaKeys[1].time = 0.089;

  // Size over lifetime module
  sizeOverLifetime.enabled = true;
  sizeOverLifetime.size.mode = ParticleCurveMode.Curve;

  const curve = sizeOverLifetime.size.curve;
  const keys = curve.keys;
  keys[0].value = 0.153;
  keys[1].value = 0.529;
  curve.addKey(0.074, 0.428 + 0.2);
  curve.addKey(0.718, 0.957 + 0.03);

  // Texture sheet animation module
  // textureSheetAnimation.enabled = true;
  // textureSheetAnimation.tiling = new Vector2(6, 6);
  // const frameOverTime = textureSheetAnimation.frameOverTime;
  // frameOverTime.mode = ParticleCurveMode.TwoCurves;
  // frameOverTime.curveMin = new ParticleCurve(new CurveKey(0, 0.47), new CurveKey(1, 1));

  return particleEntity;
}

async function main() {
  // Create engine and get root entity
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();

  const rootEntity = engine.sceneManager.activeScene.createRootEntity("Root");

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 1, 3); // -10 can test bounds transform
  cameraEntity.addComponent(Camera);

  engine.resourceManager
    .load([
      {
        url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*yu-DSb0surwAAAAAAAAAAAAADil6AQ/original",
        type: AssetType.Texture2D
      },
      {
        url: "https://gw.alipayobjects.com/os/OasisHub/267000040/9994/%25E5%25BD%2592%25E6%25A1%25A3.gltf",
        type: AssetType.GLTF
      }
    ])
    .then((resoueces) => {
      const fireEntity = createFireParticle(engine, <Texture2D>resoueces[0], <GLTFResource>resoueces[1]);
      rootEntity.addChild(fireEntity);
    });

  // Run engine
  engine.run();
}
