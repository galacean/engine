import {
  AssetType,
  BlendMode,
  Color,
  CurveKey,
  Entity,
  GradientAlphaKey,
  GradientColorKey,
  Material,
  Matrix,
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
  SkinnedMeshRenderer,
  Texture2D,
  Vector3,
  Vector4
} from "@galacean/engine";
import { MOUNT_DISSOLVE_SHADER } from "./MountDissolveShader";

const SAMPLE_COUNT = 192;
const SAMPLE_INTERVAL = 1 / 15;
interface SurfacePoint {
  renderer: MeshRenderer;
  position: Vector3;
  joints?: Vector4;
  weights?: Vector4;
}

/** Owns instance-only dissolve materials and native surface-emitted particles. */
export class MountDissolveEffect extends Script {
  private _materials: Material[] = [];
  private _originals: { renderer: MeshRenderer; materials: (Material | null)[] }[] = [];
  private _samples: SurfacePoint[] = [];
  private _positions: Vector3[] = [];
  private _mesh!: ModelMesh;
  private _particles!: ParticleRenderer;
  private _particleMaterial!: ParticleMaterial;
  private _visibility = 1;
  private _from = 1;
  private _target = 1;
  private _elapsed = 0;
  private _duration = 0;
  private _sampleElapsed = 0;
  private _matrix = new Matrix();
  private _point = new Vector3();
  private _weighted = new Vector3();

  /**
   * Prepares effects only when the owning mount is first requested.
   * @param model Instantiated mount model; shared GLTF materials stay unchanged.
   * @param parent Stable scene owner that outlives model visibility.
   * @param resources Host-selected noise and particle texture assets.
   * @returns Effect ready for reversible playback.
   */
  static async create(
    model: Entity,
    parent: Entity,
    resources: { readonly noiseUrl: string; readonly particleUrl: string }
  ): Promise<MountDissolveEffect> {
    const [noise, sprite] = await Promise.all(
      [resources.noiseUrl, resources.particleUrl].map((url) =>
        model.engine.resourceManager.load<Texture2D>({ url, type: AssetType.Texture })
      )
    );
    if (model.destroyed || parent.destroyed) throw new Error("Mount destroyed during effect loading");
    const entity = parent.createChild("Mount dissolve particles");
    const effect = entity.addComponent(MountDissolveEffect);
    try {
      effect._initialize(model, noise, sprite);
    } catch (error) {
      entity.destroy();
      throw error;
    }
    return effect;
  }

  /** Whether the material transition has reached its requested endpoint. */
  get finished(): boolean {
    return this._duration === 0;
  }

  /** True once both the material transition and all native particles finish. */
  get settled(): boolean {
    return this.finished && !this._particles.generator.isAlive;
  }

  /**
   * Plays from the current visibility, allowing interrupted transitions to reverse continuously.
   * @param visible True for appearance, false for disappearance.
   * @param seconds Positive transition duration in engine seconds.
   */
  play(visible: boolean, seconds: number): void {
    this._from = this._visibility;
    this._target = visible ? 1 : 0;
    this._elapsed = 0;
    this._duration = Math.max(0.001, seconds);
    this._sampleElapsed = 0;
    this._updateSurface();
    const generator = this._particles.generator;
    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    generator.main.duration = this._duration;
    generator.main.startSpeed = new ParticleCompositeCurve(visible ? -0.3 : 0, visible ? -0.05 : 0.1);
    const force = generator.forceOverLifetime;
    force.forceX = new ParticleCompositeCurve(visible ? 0.4 : -2, 0.01);
    force.forceY = new ParticleCompositeCurve(0.01, visible ? -0.15 : 1);
    force.forceZ = new ParticleCompositeCurve(visible ? 0.6 : -6.4, 0.01);
    generator.play(false);
  }

  /** Resets a hidden cached model before a new entrance. */
  hide(): void {
    this._duration = 0;
    this._setVisibility(0);
    this._particles.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
  }

  /** Advances only active presentation; existing particles finish in native simulation. */
  override onLateUpdate(dt: number): void {
    if (this._duration === 0 || dt <= 0) return;
    this._elapsed += dt;
    const t = Math.min(1, this._elapsed / this._duration);
    this._setVisibility(this._from + (this._target - this._from) * t);
    this._sampleElapsed += dt;
    if (this._sampleElapsed >= SAMPLE_INTERVAL) {
      this._sampleElapsed %= SAMPLE_INTERVAL;
      this._updateSurface();
    }
    if (t === 1) {
      this._duration = 0;
      this._particles.generator.stop(false);
    }
  }

  /** Restores materials and releases instance resources, including trailing particles. */
  override onDestroy(): void {
    for (const { renderer, materials } of this._originals) {
      if (!renderer.destroyed) renderer.setMaterials(materials);
    }
    this._particles?.destroy();
    this._mesh?.destroy();
    this._particleMaterial?.destroy();
    for (const material of this._materials) material.destroy();
  }

  private _initialize(model: Entity, noise: Texture2D, sprite: Texture2D): void {
    const renderers: MeshRenderer[] = [];
    model.getComponentsIncludeChildren(MeshRenderer, renderers);
    const shader = Shader.find("Mount/Dissolve") ?? Shader.create(MOUNT_DISSOLVE_SHADER);
    const total = renderers.reduce((sum, renderer) => sum + (renderer.mesh as ModelMesh).vertexCount, 0);
    for (const renderer of renderers) {
      const originals = renderer.getMaterials().slice();
      this._originals.push({ renderer, materials: originals });
      renderer.setMaterials(
        originals.map((source) => {
          if (!source) return null;
          const material = source.clone();
          material.shader = shader;
          material.shaderData.setTexture("mount_NoiseTexture", noise);
          material.shaderData.setFloat("mount_Visibility", 1);
          material.shaderData.setFloat("mount_EdgeWidth", 0.08);
          material.shaderData.setVector3("mount_EdgeColor", new Vector3(4, 1.6, 0.35));
          this._materials.push(material);
          return material;
        })
      );
      const mesh = renderer.mesh as ModelMesh;
      const positions = mesh.getPositions()!;
      const weights = mesh.getBoneWeights(),
        joints = mesh.getBoneIndices();
      const count = Math.max(1, Math.floor((SAMPLE_COUNT * mesh.vertexCount) / total));
      for (let i = 0; i < count; i++) {
        const index = Math.floor(((i + 0.5) * positions.length) / count);
        this._samples.push({
          renderer,
          position: positions[index].clone(),
          weights: weights?.[index].clone(),
          joints: joints?.[index].clone()
        });
        this._positions.push(new Vector3());
      }
    }
    this._mesh = new ModelMesh(this.engine);
    this._mesh.setPositions(this._positions);
    this._mesh.setNormals(this._positions.map(() => new Vector3(0, 1, 0)));
    this._mesh.uploadData(false);
    this._particleMaterial = new ParticleMaterial(this.engine);
    this._particleMaterial.baseTexture = sprite;
    this._particleMaterial.blendMode = BlendMode.Additive;
    this._particleMaterial.emissiveColor = new Color(9.88235, 6.43137, 3.37255);
    this._particles = this.entity.addComponent(ParticleRenderer);
    this._particles.setMaterial(this._particleMaterial);
    const generator = this._particles.generator;
    const main = generator.main;
    main.playOnEnabled = false;
    main.isLoop = false;
    main.simulationSpace = ParticleSimulationSpace.World;
    main.maxParticles = 1600;
    main.startLifetime = new ParticleCompositeCurve(0.6, 1.5);
    main.startSpeed = new ParticleCompositeCurve(0, 0.1);
    main.startSize = new ParticleCompositeCurve(0.035, 0.16);
    generator.emission.rateOverTime.constant = 1000;
    const shape = new MeshShape();
    shape.mesh = this._mesh;
    generator.emission.shape = shape;
    generator.forceOverLifetime.enabled = true;
    generator.forceOverLifetime.space = ParticleSimulationSpace.World;
    // Publish the same module modes used by both directions before shader warmup.
    generator.forceOverLifetime.forceX = new ParticleCompositeCurve(-2, 0.01);
    generator.forceOverLifetime.forceY = new ParticleCompositeCurve(0.01, 1);
    generator.forceOverLifetime.forceZ = new ParticleCompositeCurve(-6.4, 0.01);
    generator.sizeOverLifetime.enabled = true;
    generator.sizeOverLifetime.size = new ParticleCompositeCurve(
      new ParticleCurve(
        new CurveKey(0, 1.1875),
        new CurveKey(0.50025, 0.7625),
        new CurveKey(0.80225, 0.375),
        new CurveKey(1, 0.0875)
      )
    );
    generator.colorOverLifetime.enabled = true;
    generator.colorOverLifetime.color = new ParticleCompositeGradient(
      new ParticleGradient(
        [
          new GradientColorKey(0, new Color(1, 0.94902, 0.30588)),
          new GradientColorKey(0.3, new Color(0.15294, 0.43529, 1)),
          new GradientColorKey(0.81364, new Color(0.19608, 0.85098, 1)),
          new GradientColorKey(1, new Color(1, 0.33333, 0.33333))
        ],
        [new GradientAlphaKey(0, 1), new GradientAlphaKey(0.84091, 1), new GradientAlphaKey(1, 0)]
      )
    );
    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
  }

  private _setVisibility(value: number): void {
    this._visibility = value;
    for (const material of this._materials) material.shaderData.setFloat("mount_Visibility", value);
  }

  private _updateSurface(): void {
    const inverse = this.entity.getInvModelMatrix();
    const bounds = this._mesh.bounds;
    bounds.min.set(Infinity, Infinity, Infinity);
    bounds.max.set(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < this._samples.length; i++) {
      const sample = this._samples[i];
      const skin = sample.renderer instanceof SkinnedMeshRenderer ? sample.renderer.skin : undefined;
      const position = this._positions[i];
      if (skin && sample.weights && sample.joints) {
        position.set(0, 0, 0);
        for (const axis of ["x", "y", "z", "w"] as const) {
          const weight = sample.weights[axis];
          if (weight === 0) continue;
          const joint = sample.joints[axis];
          Matrix.multiply(skin.bones[joint].transform.worldMatrix, skin.inverseBindMatrices[joint], this._matrix);
          Vector3.transformCoordinate(sample.position, this._matrix, this._point);
          Vector3.scale(this._point, weight, this._weighted);
          position.add(this._weighted);
        }
      } else Vector3.transformCoordinate(sample.position, sample.renderer.entity.transform.worldMatrix, position);
      Vector3.transformCoordinate(position, inverse, position);
      Vector3.min(bounds.min, position, bounds.min);
      Vector3.max(bounds.max, position, bounds.max);
    }
    this._mesh.setPositions(this._positions);
    this._mesh.uploadData(false);
  }
}
