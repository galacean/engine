import {
  BlendMode,
  Color,
  ConeShape,
  CurveKey,
  Entity,
  GradientAlphaKey,
  GradientColorKey,
  RenderFace,
  ParticleCompositeCurve,
  ParticleCompositeGradient,
  ParticleCurve,
  ParticleGradient,
  ParticleMaterial,
  ParticleRenderer,
  ParticleRenderMode,
  ParticleSimulationSpace,
  ParticleStopMode,
  Texture2D,
  TextureWrapMode,
  TextureFilterMode
} from "@galacean/engine";

/** Owns a fixed set of native particle systems; emitted particles live in world space. */
export class WateringParticles {
  readonly drops: ParticleRenderer;
  readonly splash: ParticleRenderer;
  readonly mist: ParticleRenderer;
  private readonly root: Entity;
  private readonly sprite: Texture2D;
  private readonly materials: ParticleMaterial[] = [];

  constructor(parent: Entity, splashTexture: Texture2D) {
    this.root = parent.createChild("Watering particles");
    this.sprite = new Texture2D(parent.engine, 32, 32);
    this.sprite.wrapModeU = this.sprite.wrapModeV = TextureWrapMode.Clamp;
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const i = (y * 32 + x) * 4;
        const r = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
        pixels[i + 3] = Math.round(255 * Math.max(0, 1 - r) ** 1.3);
      }
    this.sprite.setPixelBuffer(pixels);
    this.sprite.filterMode = TextureFilterMode.Bilinear;
    this.sprite.generateMipmaps();
    this.drops = this.create("Airborne watering drops", this.sprite, new Color(0.72, 0.88, 1, 0.85), 400);
    this.drops.renderMode = ParticleRenderMode.StretchBillboard;
    this.drops.lengthScale = 2.8;
    this.drops.velocityScale = 0.035;
    const drops = this.drops.generator;
    drops.main.startSpeed.constant = 0.8;
    drops.main.startSize = new ParticleCompositeCurve(0.012, 0.021);
    drops.main.gravityModifier.constant = 1;
    const cone = new ConeShape();
    cone.radius = 0.024;
    cone.angle = 8;
    drops.emission.shape = cone;

    this.splash = this.create("Water impact flipbook", splashTexture, new Color(0.76, 0.9, 1, 0.65), 48);
    (this.splash.getMaterial() as ParticleMaterial).blendMode = BlendMode.Additive;
    const splash = this.splash.generator;
    splash.main.startLifetime = new ParticleCompositeCurve(0.22, 0.32);
    splash.main.startSpeed.constant = 0;
    splash.main.startSize = new ParticleCompositeCurve(0.16, 0.24);
    const impactShape = new ConeShape();
    impactShape.enabled = false;
    splash.emission.shape = impactShape;
    splash.textureSheetAnimation.enabled = true;
    // Four splash frames arranged as 2 x 2.
    splash.textureSheetAnimation.tiling.set(2, 2);

    this.mist = this.create("Water impact droplets", this.sprite, new Color(0.8, 0.92, 1, 0.5), 80);
    const mist = this.mist.generator;
    this.mist.entity.transform.setRotation(90, 0, 0);
    mist.main.startSpeed = new ParticleCompositeCurve(0.15, 0.45);
    mist.main.startLifetime = new ParticleCompositeCurve(0.12, 0.22);
    mist.main.startSize = new ParticleCompositeCurve(0.01, 0.028);
    mist.main.gravityModifier.constant = 0.3;
    const spread = new ConeShape();
    spread.radius = 0.04;
    spread.angle = 65;
    mist.emission.shape = spread;
  }

  get alive(): boolean {
    return this.drops.generator.isAlive || this.splash.generator.isAlive || this.mist.generator.isAlive;
  }

  dispose(): void {
    for (const renderer of [this.drops, this.splash, this.mist])
      renderer.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    this.root.destroy();
    for (const material of this.materials) material.destroy();
    this.sprite.destroy();
  }

  private create(name: string, texture: Texture2D, color: Color, maxParticles: number): ParticleRenderer {
    const renderer = this.root.createChild(name).addComponent(ParticleRenderer);
    const material = new ParticleMaterial(this.root.engine);
    material.baseTexture = texture;
    material.baseColor = color;
    material.renderFace = RenderFace.Double;
    this.materials.push(material);
    renderer.setMaterial(material);
    const g = renderer.generator;
    g.main.playOnEnabled = false;
    g.main.simulationSpace = ParticleSimulationSpace.World;
    g.main.maxParticles = maxParticles;
    g.emission.rateOverTime.constant = 0;
    g.colorOverLifetime.enabled = true;
    g.colorOverLifetime.color = new ParticleCompositeGradient(
      new ParticleGradient(
        [new GradientColorKey(0, new Color(1, 1, 1)), new GradientColorKey(1, new Color(1, 1, 1))],
        [new GradientAlphaKey(0, 0.8), new GradientAlphaKey(0.7, 1), new GradientAlphaKey(1, 0)]
      )
    );
    g.sizeOverLifetime.enabled = true;
    g.sizeOverLifetime.size = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, 0.8), new CurveKey(0.5, 1), new CurveKey(1, 0.5))
    );
    g.stop(false, ParticleStopMode.StopEmittingAndClear);
    return renderer;
  }
}
