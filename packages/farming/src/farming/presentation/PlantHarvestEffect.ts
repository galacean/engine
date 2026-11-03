import {
  BlendMode,
  Color,
  CurveKey,
  Entity,
  GradientAlphaKey,
  GradientColorKey,
  Material,
  MeshRenderer,
  MeshShape,
  ModelMesh,
  ParticleCompositeCurve,
  ParticleCompositeGradient,
  ParticleCurve,
  ParticleGradient,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  ParticleStopMode,
  Script,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode,
  Vector3
} from "@galacean/engine";
import type { PlantGrowthInstance } from "../procedural/runtime/createProceduralPlant";
import { PLANT_HARVEST_SHADER } from "./PlantHarvestShader";

export const DEFAULT_HARVEST_SECONDS = 2;

/** A detached presentation lifetime: gameplay may reuse the original planting anchor immediately. */
export class PlantHarvestEffect extends Script {
  private instance?: Pick<PlantGrowthInstance, "plant" | "dispose">;
  private materials: Material[] = [];
  private originals: { renderer: MeshRenderer; materials: (Material | null)[] }[] = [];
  private textures: Texture2D[] = [];
  private mesh?: ModelMesh;
  private particles?: ParticleRenderer;
  private particleMaterial?: ParticleMaterial;
  private elapsed = 0;
  private seconds = DEFAULT_HARVEST_SECONDS;
  private complete: () => void = () => {};
  private released = false;
  private stopping = false;
  private preview = false;
  private restorePlant?: () => void;
  private releaseBinding?: () => void;
  private isPresentationVisible: () => boolean = () => true;
  private presentationVisible = true;

  static create(
    instance: Pick<PlantGrowthInstance, "plant" | "dispose">,
    seconds: number,
    complete: () => void,
    preview = false,
    isPresentationVisible: () => boolean = () => true
  ): PlantHarvestEffect {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("收获动画时长必须大于 0");
    const plant = instance.plant;
    const entity = plant.root.scene!.createRootEntity("Plant harvest dissolve");
    const effect = entity.addComponent(PlantHarvestEffect);
    effect.complete = complete;
    effect.seconds = seconds;
    effect.instance = instance;
    effect.releaseBinding = plant.holdBinding?.();
    effect.preview = preview;
    effect.isPresentationVisible = isPresentationVisible;
    if (preview) {
      const parent = plant.root.parent;
      const localMatrix = plant.root.transform.localMatrix.clone();
      const worldMatrix = plant.root.transform.worldMatrix.clone();
      const active = plant.root.isActive;
      effect.restorePlant = () => {
        if (plant.root.destroyed) return;
        if (parent && !parent.destroyed) {
          parent.addChild(plant.root);
          plant.root.transform.localMatrix = localMatrix;
        } else {
          entity.scene!.addRootEntity(plant.root);
          plant.root.transform.worldMatrix = worldMatrix;
        }
        plant.root.isActive = active;
      };
    }
    try {
      const world = plant.root.transform.worldMatrix.clone();
      entity.addChild(plant.root);
      plant.root.transform.worldMatrix = world;
      effect.initialize();
      return effect;
    } catch (error) {
      if (preview) effect.cancelPreview();
      else entity.destroy();
      throw error;
    }
  }

  get progress(): number {
    return Math.min(1, this.elapsed / this.seconds);
  }
  get particlesAlive(): boolean {
    return this.particles?.generator.isAlive ?? false;
  }

  /** Tool time drives reversible visibility; reaching the end waits for the transaction. */
  seekPreview(seconds: number): void {
    if (this.preview && !this.stopping && !this.released) {
      this.elapsed = Math.max(0, Math.min(this.seconds, seconds));
      this.applyVisibility();
    }
  }

  commitPreview(): void {
    if (!this.preview || this.stopping || this.released) return;
    this.preview = false;
    this.restorePlant = undefined;
  }

  cancelPreview(): void {
    if (!this.preview || this.stopping || this.released) return;
    this.stopUpdates();
    // Restore materials before returning the plant to its owner.
    this.restoreMaterials();
    this.restorePlant?.();
    this.restorePlant = undefined;
    this.instance = undefined;
    this.releaseBinding?.();
    this.releaseBinding = undefined;
    this.entity.destroy();
  }

  override onLateUpdate(): void {
    // Match held-basket reveal even when the engine caps simulation time after a slow frame.
    const dt = this.engine.time.actualDeltaTime;
    if (this.stopping || this.released || !this.instance || dt <= 0) return;
    if (!this.preview) this.elapsed += dt;
    this.applyVisibility();
    if (this.progress === 1) {
      this.instance!.plant.root.isActive = false;
      this.particles!.generator.stop(false);
      if (!this.preview && !this.particles!.generator.isAlive) this.dispose();
    }
  }

  private applyVisibility(): void {
    const visible = this.isPresentationVisible();
    if (visible !== this.presentationVisible) {
      this.presentationVisible = visible;
      if (!visible) this.particles?.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
      else if (this.progress < 1) this.particles?.generator.play(false);
    }
    for (const material of this.materials) material.shaderData.setFloat("harvest_Visibility", 1 - this.progress);
    if (this.instance) this.instance.plant.root.isActive = visible && this.progress < 1;
  }

  dispose(): void {
    if (this.stopping || this.released) return;
    this.stopUpdates();
    this.entity.destroy();
  }

  private stopUpdates(): void {
    // Entity destruction is deferred inside an Engine frame; updates stop synchronously.
    this.stopping = true;
    this.enabled = false;
    this.particles?.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
  }

  private restoreMaterials(): void {
    for (const { renderer, materials } of this.originals) {
      if (!renderer.destroyed) renderer.setMaterials(materials);
    }
    this.originals.length = 0;
  }

  override onDestroy(): void {
    if (this.released) return;
    this.released = true;
    this.stopUpdates();
    this.restoreMaterials();
    this.particles?.destroy();
    if (this.mesh) {
      const buffers = this.mesh.vertexBufferBindings
        .map((binding) => binding?.buffer)
        .filter((value): value is NonNullable<typeof value> => value != null);
      this.mesh.destroy();
      for (const buffer of buffers) buffer.destroy();
    }
    this.particleMaterial?.destroy();
    for (const material of this.materials) material.destroy();
    for (const texture of this.textures) texture.destroy();
    this.instance?.dispose();
    this.releaseBinding?.();
    this.releaseBinding = undefined;
    this.complete();
  }

  private initialize(): void {
    const plant = this.instance!.plant;
    // Locally generated maps keep the default harvest effect independent of CDN availability.
    const noise = this.makeTexture(64, false);
    const sprite = this.makeTexture(32, true);
    const shader = Shader.find("Farming/HarvestDissolve") ?? Shader.create(PLANT_HARVEST_SHADER);
    for (const renderer of plant.root.getComponentsIncludeChildren(MeshRenderer, [])) {
      const originals = renderer.getMaterials().slice();
      this.originals.push({ renderer, materials: originals });
      renderer.setMaterials(
        originals.map((source) => {
          if (!source) return null;
          const material = source.clone();
          material.shader = shader;
          material.shaderData.setTexture("harvest_NoiseTexture", noise);
          material.shaderData.setFloat("harvest_Visibility", 1);
          material.shaderData.setFloat("harvest_EdgeWidth", 0.08);
          material.shaderData.setVector3("harvest_EdgeColor", new Vector3(4, 1.6, 0.35));
          this.materials.push(material);
          return material;
        })
      );
    }
    // ProceduralPlant uses custom vertex buffers: sample its authoritative geometry,
    // rather than ModelMesh.getPositions(), which has no CPU position array here.
    const positions: Vector3[] = [];
    const normals: Vector3[] = [];
    const geometry = plant.geometry;
    const count = Math.min(192, geometry.positions.length);
    const world = plant.root.transform.worldMatrix;
    for (let i = 0; i < count; i++) {
      const index = Math.floor(((i + 0.5) * geometry.positions.length) / count);
      const position = new Vector3(...geometry.positions[index]);
      Vector3.transformCoordinate(position, world, position);
      positions.push(position);
      normals.push(new Vector3(0, 1, 0));
    }
    this.mesh = new ModelMesh(this.engine, "Harvest particle surface");
    this.mesh.setPositions(positions);
    this.mesh.setNormals(normals);
    this.mesh.bounds.min.set(Infinity, Infinity, Infinity);
    this.mesh.bounds.max.set(-Infinity, -Infinity, -Infinity);
    for (const position of positions) {
      Vector3.min(this.mesh.bounds.min, position, this.mesh.bounds.min);
      Vector3.max(this.mesh.bounds.max, position, this.mesh.bounds.max);
    }
    this.mesh.uploadData(false);
    this.particleMaterial = new ParticleMaterial(this.engine);
    this.particleMaterial.baseTexture = sprite;
    this.particleMaterial.blendMode = BlendMode.Additive;
    this.particleMaterial.emissiveColor = new Color(5, 2.8, 0.8);
    this.particles = this.entity.addComponent(ParticleRenderer);
    this.particles.setMaterial(this.particleMaterial);
    const generator = this.particles.generator;
    generator.main.playOnEnabled = false;
    generator.main.isLoop = false;
    generator.main.duration = this.seconds;
    generator.main.simulationSpace = ParticleSimulationSpace.World;
    generator.main.maxParticles = 600;
    generator.main.startLifetime = new ParticleCompositeCurve(0.4, 1);
    generator.main.startSpeed = new ParticleCompositeCurve(0.05, 0.3);
    generator.main.startSize = new ParticleCompositeCurve(0.035, 0.12);
    generator.emission.rateOverTime.constant = 350;
    const shape = new MeshShape();
    shape.mesh = this.mesh;
    generator.emission.shape = shape;
    generator.forceOverLifetime.enabled = true;
    generator.forceOverLifetime.space = ParticleSimulationSpace.World;
    generator.forceOverLifetime.forceX = new ParticleCompositeCurve(-0.4, 0.4);
    generator.forceOverLifetime.forceY = new ParticleCompositeCurve(0.2, 1.2);
    generator.forceOverLifetime.forceZ = new ParticleCompositeCurve(-0.4, 0.4);
    generator.sizeOverLifetime.enabled = true;
    generator.sizeOverLifetime.size = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, 1), new CurveKey(0.6, 0.5), new CurveKey(1, 0))
    );
    generator.colorOverLifetime.enabled = true;
    generator.colorOverLifetime.color = new ParticleCompositeGradient(
      new ParticleGradient(
        [new GradientColorKey(0, new Color(1, 0.8, 0.25)), new GradientColorKey(1, new Color(1, 0.3, 0.05))],
        [new GradientAlphaKey(0, 1), new GradientAlphaKey(0.6, 1), new GradientAlphaKey(1, 0)]
      )
    );
    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    generator.play(false);
  }

  private makeTexture(size: number, sprite: boolean): Texture2D {
    const texture = new Texture2D(this.engine, size, size);
    this.textures.push(texture);
    const pixels = new Uint8Array(size * size * 4);
    let seed = 0x12345678;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        const noise = seed >>> 24;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = sprite ? 255 : noise;
        const radius = Math.hypot(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1);
        pixels[index + 3] = sprite ? Math.round(Math.max(0, 1 - radius) ** 2 * 255) : 255;
      }
    texture.setPixelBuffer(pixels);
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
    return texture;
  }
}
