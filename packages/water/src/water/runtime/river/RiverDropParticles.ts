import {
  BlendMode,
  BoxShape,
  CurveKey,
  GradientAlphaKey,
  GradientColorKey,
  ParticleCompositeCurve,
  ParticleCompositeGradient,
  ParticleCurve,
  ParticleCurveMode,
  ParticleGradient,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  type Engine,
  type Entity,
  type Texture2D
} from "@galacean/engine-core";
import { Color, Vector2 } from "@galacean/engine-math";
import type { RiverDrop } from "../../authoring/river/RiverDrop";
import type { RiverDropLook } from "../../authoring/river/RiverDropLook";
import type { WaterRuntimeResourceLease } from "../resources/WaterRuntimeResourceRegistry";

type Effect = "mist" | "splash" | "droplets";

/** Native emitters inherit the River staging root: only a published, visible instance emits. */
export class RiverDropParticles {
  private readonly root: Entity;
  private readonly renderers: ParticleRenderer[] = [];
  private readonly materials = new Map<Effect, ParticleMaterial>();
  private disposed = false;
  readonly drawCount: number;

  constructor(
    engine: Engine,
    parent: Entity,
    drops: readonly RiverDrop[],
    look: Readonly<RiverDropLook>,
    leases: readonly WaterRuntimeResourceLease[]
  ) {
    this.root = parent.createChild("River drop particles");
    this.drawCount = drops.length * 3;
    try {
      for (const effect of ["mist", "splash", "droplets"] as const) {
        const ref = look.textures[effect === "mist" ? "mist" : "splash"];
        const lease = leases.find(
          (l) => l.active && l.descriptor.id === ref.assetId && l.descriptor.contentHash === ref.contentHash
        );
        const texture = (lease?.resource as { texture?: Texture2D } | undefined)?.texture;
        if (!texture)
          throw new Error(`MISSING_DEPENDENCY: River particle texture '${ref.assetId}' has no active lease.`);
        const material = new ParticleMaterial(engine);
        this.materials.set(effect, material);
        material.baseTexture = texture;
        material.blendMode = BlendMode.Normal;
        material.baseColor = new Color(0.88, 0.95, 1, 1);
        for (const drop of drops) this.createEmitter(drop, effect, material);
      }
      this.setLook(look);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  private createEmitter(drop: RiverDrop, effect: Effect, material: ParticleMaterial): void {
    const mist = effect === "mist",
      falling = effect === "droplets";
    const height = drop.upper[1] - drop.lower[1];
    // Scale source Scene_Demo effects to the receiving channel instead of a fixed prefab size.
    const scale = Math.max(0.04, Math.min(2.5, drop.width * 0.45, Math.sqrt(height) * 0.7));
    const entity = this.root.createChild(`${drop.id}:${effect}`);
    const origin = falling ? drop.upper : drop.lower;
    entity.transform.setPosition(origin[0], origin[1] + (falling ? 0 : scale * 0.12), origin[2]);
    // Local X spans the width; local +Z follows the published downstream direction.
    entity.transform.setRotation(0, (Math.atan2(drop.across[1], -drop.across[0]) * 180) / Math.PI, 0);
    const renderer = entity.addComponent(ParticleRenderer);
    this.renderers.push(renderer);
    renderer.setMaterial(material);
    renderer.castShadows = renderer.receiveShadows = false;
    const g = renderer.generator,
      main = g.main;
    g.useAutoRandomSeed = false;
    let seed = 2166136261;
    for (const c of `${drop.id}:${effect}`) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
    g.randomSeed = seed;
    main.isLoop = true;
    main.simulationSpace = ParticleSimulationSpace.Local;
    main.startSpeed = new ParticleCompositeCurve(0);
    const fallTime = Math.sqrt((2 * height) / 9.81);
    const lifetime = falling ? fallTime : mist ? 2.8 : Math.sqrt(scale) * 0.85;
    main.startLifetime = new ParticleCompositeCurve(lifetime * 0.75, lifetime);
    main.startSize = new ParticleCompositeCurve(
      scale * (mist ? 0.7 : falling ? 0.035 : 0.055),
      scale * (mist ? 1.3 : falling ? 0.07 : 0.14)
    );
    main.startRotationZ = new ParticleCompositeCurve(0, 360);
    main.gravityModifier = new ParticleCompositeCurve(mist ? 0 : falling ? 1 : 0.2);
    const rate = Math.min(mist ? 35 : 120, Math.max(1, drop.width * (mist ? 5 : falling ? 6 : 20)));
    main.maxParticles = Math.ceil(rate * lifetime) + 4;
    const box = new BoxShape();
    box.size.set(drop.width * 0.85, 0.01, scale * (mist ? 0.35 : 0.08));
    g.emission.shape = box;
    g.emission.rateOverTime.constant = rate;
    const velocity = g.velocityOverLifetime;
    velocity.enabled = true;
    velocity.space = ParticleSimulationSpace.Local;
    velocity.velocityX = new ParticleCompositeCurve(-scale * 0.18, scale * 0.18);
    velocity.velocityY = new ParticleCompositeCurve(
      mist ? scale * 0.18 : falling ? 0 : Math.sqrt(scale) * 0.8,
      mist ? scale * 0.32 : falling ? 0 : Math.sqrt(scale) * 1.1
    );
    velocity.velocityZ = new ParticleCompositeCurve(scale * 0.08, scale * (mist ? 0.28 : 0.45));
    g.sizeOverLifetime.enabled = true;
    g.sizeOverLifetime.size = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, mist ? 0.65 : 1), new CurveKey(1, mist ? 1.8 : 0.35))
    );
    g.colorOverLifetime.enabled = true;
    g.colorOverLifetime.color = new ParticleCompositeGradient(
      new ParticleGradient(
        [new GradientColorKey(0, new Color(1, 1, 1)), new GradientColorKey(1, new Color(1, 1, 1))],
        [new GradientAlphaKey(0, 0), new GradientAlphaKey(mist ? 0.2 : 0.08, 1), new GradientAlphaKey(1, 0)]
      )
    );
    const atlas = g.textureSheetAnimation;
    atlas.enabled = true;
    atlas.tiling = new Vector2(2, 2);
    // Random static mist frame; splashes play the source four-frame sequence once.
    if (mist) {
      atlas.frameOverTime.curveMin = new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 0));
      atlas.frameOverTime.curveMax = new ParticleCurve(new CurveKey(0, 0.999), new CurveKey(1, 0.999));
      atlas.frameOverTime.mode = ParticleCurveMode.TwoCurves;
    }
  }

  setLook(look: Readonly<RiverDropLook>): void {
    for (const renderer of this.renderers) renderer.generator.main.simulationSpeed = look.speed;
    for (const [effect, material] of this.materials)
      material.baseColor.a = effect === "mist" ? look.mistOpacity : look.sprayOpacity;
  }

  setSurfacePriority(priority: number): void {
    for (const renderer of this.renderers) renderer.priority = priority + 2;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.destroy(); // ParticleRenderer destroys generators, buffers and pending emission.
    for (const material of this.materials.values()) {
      material.baseTexture = null!; // Textures belong to the shared resource lease.
      material.destroy();
    }
    this.materials.clear();
    this.renderers.length = 0;
  }
}
