/**
 * @title Material Heat Distortion
 * @category Material
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*PIkJQaUO-a4AAAAAAAAAAAAADiR2AQ/original
 */

import {
  AmbientLight,
  Animator,
  AssetType,
  BackgroundMode,
  BaseMaterial,
  BlendMode,
  Burst,
  Camera,
  Color,
  ConeShape,
  CurveKey,
  DirectLight,
  Downsampling,
  Engine,
  Entity,
  GLTFResource,
  Logger,
  MeshRenderer,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleCurveMode,
  ParticleGradientMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleScaleMode,
  ParticleSimulationSpace,
  PrimitiveMesh,
  Shader,
  SkyBoxMaterial,
  SphereShape,
  Texture2D,
  Vector2,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

async function main() {
  Logger.enable();
  const engine = await WebGLEngine.create({
    canvas: "canvas",
  });
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;

  // Create sky
  const background = scene.background;
  background.mode = BackgroundMode.Sky;

  const sky = background.sky;
  const skyMaterial = new SkyBoxMaterial(engine);
  sky.material = skyMaterial;
  sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  const rootEntity = scene.createRootEntity();

  // Create camera entity
  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 1, 4.0);
  cameraEntity.transform.lookAt(new Vector3(0, 1, 0));
  // Enable opaque texture and configure downsampling
  camera.opaqueTextureEnabled = true;
  camera.opaqueTextureDownsampling = Downsampling.TwoX;

  // Create light entity
  const lightEntity = rootEntity.createChild("light");
  lightEntity.transform.setPosition(0, 0.7, 0.5);
  lightEntity.transform.lookAt(new Vector3(0, 0, 0));
  lightEntity.addComponent(DirectLight);

  // Add ambient light
  const ambientLight = await engine.resourceManager.load<AmbientLight>({
    url: "https://gw.alipayobjects.com/os/bmw-prod/f369110c-0e33-47eb-8296-756e9c80f254.bin",
    type: AssetType.Env,
  });
  scene.ambientLight = ambientLight;
  skyMaterial.texture = ambientLight.specularTexture;
  skyMaterial.textureDecodeRGBM = true;

  // Add glTF model
  const glTFResource = await engine.resourceManager.load<GLTFResource>(
    "https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb"
  );
  const model = glTFResource.instantiateSceneRoot();
  model.transform.setPosition(0, 0.3, 0);
  model.transform.scale = new Vector3(0.012, 0.012, 0.012);
  model.getComponent(Animator)!.play("walk", 0);
  rootEntity.addChild(model);

  // Add heat distortion
  addHeatDistortion(engine, rootEntity);
  addFire(engine, rootEntity);

  engine.run();
}

main();

async function addHeatDistortion(engine: Engine, root: Entity): Promise<void> {
  const heatDistortionVS = `
    #include <common>
    #include <common_vert>
    #include <blendShape_input>
    #include <uv_share>

    varying vec4 v_clipPosition;

    void main() {
        #include <begin_position_vert>
        #include <blendShape_vert>
        #include <skinning_vert>
        #include <uv_vert>
        #include <position_vert>

        v_clipPosition = gl_Position;
    }`;

  const heatDistortionFS = `
    #include <common>
    #include <uv_share>

    uniform vec4 scene_ElapsedTime;

    uniform sampler2D camera_OpaqueTexture;

    uniform float material_DistortSpeed;
    uniform float material_DistortValue;
    uniform float material_FadeRadius;
    uniform sampler2D material_NoiseTexture;
    
    varying vec4 v_clipPosition;

    void main() {
        vec2 noiseUV = v_uv + vec2(scene_ElapsedTime.x / 30.0, scene_ElapsedTime.x)* vec2(material_DistortSpeed);
        vec4 distortUV = texture2D(material_NoiseTexture, noiseUV);

        float fade = pow(1.0 - length(v_uv - 0.5), material_FadeRadius);
        
        vec2 viewportUV = (v_clipPosition.xy / v_clipPosition.w) * 0.5 + 0.5;
        vec2 opaqueTextureUV = mix(viewportUV, vec2(distortUV.x), material_DistortValue * fade);

        gl_FragColor = texture2D(camera_OpaqueTexture, opaqueTextureUV);
    }`;

  Shader.create("HeatDistortion", heatDistortionVS, heatDistortionFS);

  // Load noise texture
  const noiseTexture = await engine.resourceManager.load<Texture2D>({
    url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*H_HOQZUHdKQAAAAAAAAAAAAADil6AQ/original",
    type: AssetType.Texture2D,
  });

  const entity = root.createChild("NoisePlane");
  entity.transform.setPosition(0, 1.5, 1);
  entity.transform.rotate(new Vector3(90, 0, 0));
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 2, 2);
  renderer.priority = -1;

  // Create material
  const material = new BaseMaterial(engine, Shader.find("HeatDistortion"));
  material.isTransparent = true;

  const shaderData = material.shaderData;
  shaderData.setFloat("material_DistortSpeed", 0.8);
  shaderData.setFloat("material_DistortValue", 0.05);
  shaderData.setFloat("material_FadeRadius", 4);
  shaderData.setTexture("material_NoiseTexture", noiseTexture);

  renderer.setMaterial(material);
}

function addFire(engine: Engine, rootEntity: Entity) {
  engine.resourceManager
    .load([
      {
        url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*yu-DSb0surwAAAAAAAAAAAAADil6AQ/original",
        type: AssetType.Texture2D,
      },
      {
        url: " https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*JlayRa2WltYAAAAAAAAAAAAADil6AQ/original",
        type: AssetType.Texture2D,
      },
      {
        url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*cFafRr6WaWUAAAAAAAAAAAAADil6AQ/original",
        type: AssetType.Texture2D,
      },
      {
        url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*TASTTpESkIIAAAAAAAAAAAAADil6AQ/original",
        type: AssetType.Texture2D,
      },
    ])
    .then((textures) => {
      const fireEntity = createFireParticle(engine, <Texture2D>textures[0]);
      createFireGlowParticle(fireEntity, <Texture2D>textures[1]);
      createFireSmokeParticle(fireEntity, <Texture2D>textures[2]);
      createFireEmbersParticle(fireEntity, <Texture2D>textures[3]);

      rootEntity.addChild(fireEntity);
    });
}

function createFireParticle(engine: Engine, texture: Texture2D): Entity {
  const particleEntity = new Entity(engine, "Fire");
  particleEntity.transform.setPosition(0, -0.1, 0.5);
  particleEntity.transform.scale.set(1.268892, 1.268892, 1.268892);
  particleEntity.transform.rotate(90, 0, 0);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 2;

  const generator = particleRenderer.generator;
  const {
    main,
    emission,
    textureSheetAnimation,
    sizeOverLifetime,
    colorOverLifetime,
  } = generator;

  // Main module
  const { startLifetime, startSpeed, startSize, startRotationZ } = main;
  startLifetime.constantMin = 0.2;
  startLifetime.constantMax = 0.8;
  startLifetime.mode = ParticleCurveMode.TwoConstants;

  startSpeed.constantMin = 0.4;
  startSpeed.constantMax = 1.6;
  startSpeed.mode = ParticleCurveMode.TwoConstants;

  startSize.constantMin = 0.6;
  startSize.constantMax = 0.9;
  startSize.mode = ParticleCurveMode.TwoConstants;

  startRotationZ.constantMin = 0;
  startRotationZ.constantMax = 360;
  startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.simulationSpace = ParticleSimulationSpace.World;

  // Emission module
  emission.rateOverTime.constant = 35;

  const coneShape = new ConeShape();
  coneShape.angle = 0.96;
  coneShape.radius = 0.01;
  emission.shape = coneShape;

  // Color over lifetime module
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;

  const gradient = colorOverLifetime.color.gradient;
  const colorKeys = gradient.colorKeys;
  colorKeys[0].color.set(255 / 255, 127 / 255, 4 / 255, 1.0);
  colorKeys[1].time = 0.998;
  colorKeys[1].color.set(255 / 255, 123 / 255, 0 / 255, 1.0);
  gradient.addColorKey(0.157, new Color(1, 1, 1, 1));
  gradient.addColorKey(0.573, new Color(255 / 255, 255 / 255, 137 / 255, 1));
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
  textureSheetAnimation.enabled = true;
  textureSheetAnimation.tiling = new Vector2(6, 6);
  const frameOverTime = textureSheetAnimation.frameOverTime;
  frameOverTime.mode = ParticleCurveMode.TwoCurves;
  frameOverTime.curveMin = new ParticleCurve(
    new CurveKey(0, 0.47),
    new CurveKey(1, 1)
  );

  return particleEntity;
}

function createFireGlowParticle(fireEntity: Entity, texture: Texture2D): void {
  const particleEntity = fireEntity.createChild("FireGlow");

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(fireEntity.engine);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 1;

  const generator = particleRenderer.generator;
  const { main, emission, sizeOverLifetime, colorOverLifetime } = generator;

  // Main module
  const { startLifetime, startSpeed, startRotationZ } = main;
  startLifetime.constantMin = 0.2;
  startLifetime.constantMax = 0.6;
  startLifetime.mode = ParticleCurveMode.TwoConstants;

  startSpeed.constantMin = 0.0;
  startSpeed.constantMax = 1.4;
  startSpeed.mode = ParticleCurveMode.TwoConstants;

  main.startSize.constant = 1.2;

  startRotationZ.constantMin = 0;
  startRotationZ.constantMax = 360;
  startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.startColor.constant = new Color(
    255 / 255,
    100 / 255,
    0 / 255,
    168 / 255
  );

  main.simulationSpace = ParticleSimulationSpace.World;

  main.scalingMode = ParticleScaleMode.Hierarchy;

  // Emission module
  emission.rateOverTime.constant = 20;

  const coneShape = new ConeShape();
  coneShape.angle = 15;
  coneShape.radius = 0.01;
  emission.shape = coneShape;

  // Color over lifetime module
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;

  const gradient = colorOverLifetime.color.gradient;
  const colorKeys = gradient.colorKeys;
  colorKeys[1].time = 0.998;
  colorKeys[1].color.set(255 / 255, 50 / 255, 0 / 255, 1.0);

  gradient.alphaKeys[0].alpha = 0;
  gradient.alphaKeys[1].alpha = 0;

  gradient.addAlphaKey(0.057, 247 / 255);

  // Size over lifetime module
  sizeOverLifetime.enabled = true;
  sizeOverLifetime.size.mode = ParticleCurveMode.Curve;

  const curve = sizeOverLifetime.size.curve;
  const keys = curve.keys;
  keys[0].value = 0.153;
  keys[1].value = 1.0;
  curve.addKey(0.057, 0.37);
  curve.addKey(0.728, 0.958);
}

function createFireSmokeParticle(fireEntity: Entity, texture: Texture2D): void {
  const particleEntity = fireEntity.createChild("FireSmoke");

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(fireEntity.engine);
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 0;

  const generator = particleRenderer.generator;
  const {
    main,
    emission,
    sizeOverLifetime,
    colorOverLifetime,
    textureSheetAnimation,
  } = generator;

  // Main module
  const { startLifetime, startRotationZ } = main;
  startLifetime.constantMin = 1;
  startLifetime.constantMax = 1.2;
  startLifetime.mode = ParticleCurveMode.TwoConstants;

  main.startSpeed.constant = 1.5;

  main.startSize.constant = 1.2;

  startRotationZ.constantMin = 0;
  startRotationZ.constantMax = 360;
  startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.startColor.constant = new Color(
    255 / 255,
    255 / 255,
    255 / 255,
    84 / 255
  );

  main.gravityModifier.constant = -0.05;

  main.simulationSpace = ParticleSimulationSpace.World;

  main.scalingMode = ParticleScaleMode.Hierarchy;

  // Emission module
  emission.rateOverTime.constant = 25;

  const coneShape = new ConeShape();
  coneShape.angle = 10;
  coneShape.radius = 0.1;
  emission.shape = coneShape;

  // Color over lifetime module
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;

  const gradient = colorOverLifetime.color.gradient;
  const colorKeys = gradient.colorKeys;
  colorKeys[0].time = 0;
  colorKeys[0].color.set(255 / 255, 98 / 255, 0 / 255, 1.0);
  colorKeys[1].time = 0.679;
  colorKeys[1].color.set(0, 0, 0, 1.0);
  gradient.addColorKey(0.515, new Color(255 / 255, 98 / 255, 0 / 255, 1.0));

  const alphaKeys = gradient.alphaKeys;
  alphaKeys[0].alpha = 0;
  alphaKeys[1].alpha = 0;
  gradient.addAlphaKey(0.121, 1);
  gradient.addAlphaKey(0.329, 200 / 255);

  // Size over lifetime module
  sizeOverLifetime.enabled = true;
  sizeOverLifetime.size.mode = ParticleCurveMode.Curve;

  const curve = sizeOverLifetime.size.curve;
  const keys = curve.keys;
  keys[0].value = 0.28;
  keys[1].value = 1.0;
  curve.addKey(0.607, 0.909);

  // Texture sheet animation module
  textureSheetAnimation.enabled = true;
  textureSheetAnimation.tiling = new Vector2(8, 8);
  const frameOverTime = textureSheetAnimation.frameOverTime;
  frameOverTime.curveMax.keys[1].value = 0.382;
}

function createFireEmbersParticle(
  fireEntity: Entity,
  texture: Texture2D
): void {
  const particleEntity = fireEntity.createChild("FireEmbers");

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(fireEntity.engine);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 3;

  const generator = particleRenderer.generator;
  const {
    main,
    emission,
    sizeOverLifetime,
    colorOverLifetime,
    velocityOverLifetime,
    rotationOverLifetime,
  } = generator;

  // Main module
  const { startLifetime, startSize, startRotationZ } = main;
  main.duration = 3;

  startLifetime.constantMin = 1;
  startLifetime.constantMax = 1.5;
  startLifetime.mode = ParticleCurveMode.TwoConstants;

  main.startSpeed.constant = 0.4;

  startSize.constantMin = 0.05;
  startSize.constantMax = 0.2;
  startSize.mode = ParticleCurveMode.TwoConstants;

  startRotationZ.constantMin = 0;
  startRotationZ.constantMax = 360;
  startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.gravityModifier.constant = -0.15;

  main.simulationSpace = ParticleSimulationSpace.World;

  main.scalingMode = ParticleScaleMode.Hierarchy;

  // Emission module
  emission.rateOverTime.constant = 65;
  emission.addBurst(new Burst(0, new ParticleCompositeCurve(15)));

  const sphereShape = new SphereShape();
  sphereShape.radius = 0.01;
  emission.shape = sphereShape;

  // Velocity over lifetime module
  velocityOverLifetime.enabled = true;
  velocityOverLifetime.velocityX.constantMin = -0.1;
  velocityOverLifetime.velocityX.constantMax = 0.1;
  velocityOverLifetime.velocityX.mode = ParticleCurveMode.TwoConstants;

  velocityOverLifetime.velocityY.constantMin = -0.1;
  velocityOverLifetime.velocityY.constantMax = 0.1;
  velocityOverLifetime.velocityY.mode = ParticleCurveMode.TwoConstants;

  velocityOverLifetime.velocityZ.constantMin = -0.1;
  velocityOverLifetime.velocityZ.constantMax = 0.1;
  velocityOverLifetime.velocityZ.mode = ParticleCurveMode.TwoConstants;

  // Color over lifetime module
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.TwoGradients;

  const gradientMax = colorOverLifetime.color.gradientMax;
  const maxColorKeys = gradientMax.colorKeys;
  maxColorKeys[0].time = 0.315;
  maxColorKeys[1].time = 0.998;
  maxColorKeys[1].color.set(255 / 255, 92 / 255, 0, 1.0);
  gradientMax.addColorKey(0.71, new Color(255 / 255, 203 / 255, 0 / 255, 1.0));

  const gradientMin = colorOverLifetime.color.gradientMin;
  gradientMin.addColorKey(0.0, new Color(1.0, 1.0, 1.0, 1.0));
  gradientMin.addColorKey(0.486, new Color(255 / 255, 203 / 255, 0 / 255, 1.0));
  gradientMin.addColorKey(1.0, new Color(255 / 255, 94 / 255, 0 / 255, 1.0));

  gradientMin.addAlphaKey(0.0, 1);
  gradientMin.addAlphaKey(0.229, 1);
  gradientMin.addAlphaKey(0.621, 0);
  gradientMin.addAlphaKey(0.659, 1);

  // Size over lifetime module
  sizeOverLifetime.enabled = true;
  const curve = sizeOverLifetime.size.curve;
  sizeOverLifetime.size.mode = ParticleCurveMode.Curve;
  curve.keys[0].value = 1;
  curve.keys[1].value = 0;

  // Rotation over lifetime module
  rotationOverLifetime.enabled = true;
  rotationOverLifetime.rotationZ.mode = ParticleCurveMode.TwoConstants;
  rotationOverLifetime.rotationZ.constantMin = 90;
  rotationOverLifetime.rotationZ.constantMax = 360;

  // Renderer
  particleRenderer.pivot = new Vector3(0.2, 0.2, 0);
}
