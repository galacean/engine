/**
 * @title Trail Renderer Basic
 * @category Trail
 */
import {
  AssetType,
  BlendMode,
  BloomEffect,
  Camera,
  Color,
  CurveKey,
  GradientAlphaKey,
  GradientColorKey,
  Logger,
  ParticleCurve,
  ParticleGradient,
  PostProcess,
  Script,
  Texture2D,
  TonemappingEffect,
  TonemappingMode,
  TrailMaterial,
  TrailRenderer,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

/**
 * Trail configuration interface.
 */
interface TrailConfig {
  color1: Color;
  color2: Color;
  color3: Color;
  emissive: Color;
  width: number;
  time: number;
  speed: number;
  radius: number;
  freqX: number;
  freqY: number;
  freqZ: number;
  phaseOffset: number;
  verticalAmp: number;
}

/**
 * Neon aurora trail configurations.
 */
const trailConfigs: TrailConfig[] = [
  // Neon Cyan-Magenta trail (main)
  {
    color1: new Color(0, 1, 1, 1),
    color2: new Color(1, 0, 1, 1),
    color3: new Color(0.5, 0, 1, 1),
    emissive: new Color(0.8, 1.2, 2.0, 1),
    width: 0.7,
    time: 3.0,
    speed: 1.5,
    radius: 5,
    freqX: 1,
    freqY: 1.618,
    freqZ: 0.618,
    phaseOffset: 0,
    verticalAmp: 3
  },
  // Solar Flare - warm orange/gold
  {
    color1: new Color(1, 0.8, 0, 1),
    color2: new Color(1, 0.4, 0, 1),
    color3: new Color(1, 0.2, 0.3, 1),
    emissive: new Color(1.8, 1.0, 0.4, 1),
    width: 0.55,
    time: 2.5,
    speed: 2.0,
    radius: 4,
    freqX: 1.414,
    freqY: 0.707,
    freqZ: 1.236,
    phaseOffset: Math.PI / 4,
    verticalAmp: 2.5
  },
  // Electric Blue
  {
    color1: new Color(0.3, 0.6, 1, 1),
    color2: new Color(0, 0.8, 1, 1),
    color3: new Color(0.5, 0.3, 1, 1),
    emissive: new Color(0.6, 1.2, 2.0, 1),
    width: 0.45,
    time: 2.0,
    speed: 2.8,
    radius: 3.5,
    freqX: 0.866,
    freqY: 1.5,
    freqZ: 1.732,
    phaseOffset: Math.PI / 2,
    verticalAmp: 2
  },
  // Mystic Purple-Pink
  {
    color1: new Color(1, 0.3, 0.6, 1),
    color2: new Color(0.8, 0, 1, 1),
    color3: new Color(0.5, 0.3, 1, 1),
    emissive: new Color(1.5, 0.6, 1.5, 1),
    width: 0.6,
    time: 2.8,
    speed: 1.4,
    radius: 5.5,
    freqX: 0.618,
    freqY: 1.272,
    freqZ: 0.809,
    phaseOffset: (Math.PI * 3) / 4,
    verticalAmp: 2.8
  },
  // Emerald Aurora - green
  {
    color1: new Color(0.2, 1, 0.5, 1),
    color2: new Color(0, 1, 0.8, 1),
    color3: new Color(0.3, 0.8, 1, 1),
    emissive: new Color(0.6, 1.8, 1.0, 1),
    width: 0.5,
    time: 2.3,
    speed: 1.8,
    radius: 4.5,
    freqX: 1.272,
    freqY: 0.5,
    freqZ: 1.414,
    phaseOffset: Math.PI,
    verticalAmp: 2.2
  },
  // White Core - bright center
  {
    color1: new Color(1, 1, 1, 1),
    color2: new Color(0.9, 0.9, 1, 1),
    color3: new Color(0.7, 0.8, 1, 1),
    emissive: new Color(2.0, 2.0, 2.5, 1),
    width: 0.35,
    time: 1.5,
    speed: 3.2,
    radius: 2.5,
    freqX: 2,
    freqY: 1,
    freqZ: 1.5,
    phaseOffset: Math.PI / 6,
    verticalAmp: 1.5
  },
  // Deep Space Purple - outer spiral
  {
    color1: new Color(0.6, 0, 1, 1),
    color2: new Color(0.3, 0, 1, 1),
    color3: new Color(0.2, 0.2, 0.8, 1),
    emissive: new Color(1.0, 0.4, 1.8, 1),
    width: 0.65,
    time: 3.5,
    speed: 1.2,
    radius: 6,
    freqX: 0.5,
    freqY: 0.809,
    freqZ: 0.618,
    phaseOffset: (Math.PI * 5) / 4,
    verticalAmp: 3.5
  }
];

// Create engine
WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  Logger.enable();
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(0, 0, 0, 1);

  // Create camera
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.position = new Vector3(0, 5, 15);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;

  // // Enable post-processing with Bloom effect
  // camera.enablePostProcess = true;
  // camera.enableHDR = true;

  // const postProcessEntity = rootEntity.createChild("PostProcess");
  // const postProcess = postProcessEntity.addComponent(PostProcess);

  // // Add Bloom effect for glowing trails
  // const bloomEffect = postProcess.addEffect(BloomEffect);
  // bloomEffect.threshold.value = 0.35;
  // bloomEffect.intensity.value = 2.2;
  // bloomEffect.scatter.value = 0.75;

  // // Add Tonemapping for better HDR rendering
  // const tonemappingEffect = postProcess.addEffect(TonemappingEffect);
  // tonemappingEffect.mode.value = TonemappingMode.ACES;

  // Store all trail materials for texture assignment
  const trailMaterials: TrailMaterial[] = [];

  // Create multiple artistic trails
  trailConfigs.forEach((config, index) => {
    const trailEntity = rootEntity.createChild(`trail_${index}`);

    const trail = trailEntity.addComponent(TrailRenderer);
    const material = new TrailMaterial(engine);
    material.blendMode = BlendMode.Additive;
    material.emissiveColor.copyFrom(config.emissive);
    trail.setMaterial(material);
    trail.time = config.time;
    trail.width = config.width;
    trail.minVertexDistance = 0.15;
    trailMaterials.push(material);

    // Tapered width curve
    trail.widthCurve = new ParticleCurve(new CurveKey(0, 1), new CurveKey(0.8, 0.3), new CurveKey(1, 0));

    // Color gradient
    const gradient = new ParticleGradient(
      [
        new GradientColorKey(0, config.color1),
        new GradientColorKey(0.5, config.color2),
        new GradientColorKey(1, config.color3)
      ],
      [new GradientAlphaKey(0, 1), new GradientAlphaKey(0.6, 0.7), new GradientAlphaKey(1, 0)]
    );
    trail.colorGradient = gradient;

    // Add movement
    const moveScript = trailEntity.addComponent(TrailMoveScript);
    moveScript.config = config;
  });

  // Load trail texture and apply to all trails
  engine.resourceManager
    .load<Texture2D>({
      url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*-DEWQZ0ncrEAAAAASTAAAAgAeil6AQ/original",
      type: AssetType.Texture2D
    })
    .then((texture) => {
      // Set texture on all trail materials
      trailMaterials.forEach((material) => {
        material.baseTexture = texture;
      });

      // engine.run();

      // Run for e2e testing
      updateForE2E(engine, 50, 20);
      initScreenshot(engine, camera);
    });
});

/**
 * Movement script with spiral and pulse effects.
 */
class TrailMoveScript extends Script {
  config: TrailConfig;
  private _time = 0;

  onUpdate(deltaTime: number): void {
    this._time += deltaTime;
    const { speed, radius, freqX, freqY, freqZ, phaseOffset, verticalAmp } = this.config;
    const t = this._time * speed + phaseOffset;

    // Spiral pulsing effect
    const pulseRadius = radius * (1 + Math.sin(t * 0.3) * 0.15);

    // 3D Lissajous curve with spiral modulation
    const x = Math.sin(t * freqX) * pulseRadius;
    const y = Math.sin(t * freqY) * verticalAmp + Math.sin(t * 0.5) * 0.5;
    const z = Math.cos(t * freqZ) * pulseRadius;

    this.entity.transform.position.set(x, y, z);
  }
}
