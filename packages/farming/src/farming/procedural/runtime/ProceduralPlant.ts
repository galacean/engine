import { uploadRestorableModelMesh } from "@galacean/engine-modify/rendering/RestorableResources";
import { destroyOwnedMeshSet } from "@galacean/engine-terrain/geometry/destroyOwnedMesh";
import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  VertexElement,
  VertexElementFormat,
  Color,
  Engine,
  Entity,
  MeshRenderer,
  ModelMesh,
  PBRMaterial,
  PrimitiveMesh,
  Vector2
} from "@galacean/engine";
import { generatePlantGrowthGeometry, type PlantGeometry } from "../core/PlantGrowthGeometry";
import { DEFAULT_PLANT_SHAPE, type PlantGrowthRecipe, type PlantShape } from "../core/PlantGrowthRecipe";

import { PlantGeometryEvaluator } from "../core/PlantGeometryEvaluator";

/** Stable plant hierarchy with either owned dynamic resources or a borrowed mature binding. */
export class ProceduralPlant {
  readonly root: Entity;
  readonly renderer: MeshRenderer;
  private _mesh!: ModelMesh;
  get mesh(): ModelMesh {
    return this._mesh;
  }
  readonly support: Entity;
  private supportMeshes: ModelMesh[] = [];
  private dynamicData!: Float32Array;
  private ownedBuffers: Buffer[] = [];
  private _geometry: PlantGeometry;
  private _shape = DEFAULT_PLANT_SHAPE;
  private _disposed = false;
  private _updateMilliseconds = 0;
  private evaluator: PlantGeometryEvaluator;
  private sharedRelease?: () => void;
  private appearanceRelease?: () => void;
  private bindingHolds = 0;
  private bindingListener?: (held: boolean) => void;
  onBindingChange(listener: (held: boolean) => void): void {
    this.bindingListener = listener;
  }
  private _uploadedBytes = 0;
  get shared(): boolean {
    return Boolean(this.sharedRelease);
  }
  get bindingHeld(): boolean {
    return this.bindingHolds > 0;
  }
  holdBinding(): () => void {
    this.bindingHolds++;
    this.bindingListener?.(true);
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.bindingHolds--;
        if (!this._disposed && !this.bindingHolds) this.bindingListener?.(false);
      }
    };
  }
  ownAppearance(release: () => void): void {
    this.appearanceRelease = release;
  }
  private _updateCount = 0;
  private _hasAnchorOffsets = false;
  get hasAnchorOffsets(): boolean {
    return this._hasAnchorOffsets;
  }

  constructor(
    readonly recipe: PlantGrowthRecipe,
    engine: Engine,
    parent: Entity,
    material: PBRMaterial,
    evaluator: PlantGeometryEvaluator | undefined = undefined,
    borrowed?: { plant: ProceduralPlant; release: () => void },
    initialShape: PlantShape = DEFAULT_PLANT_SHAPE
  ) {
    evaluator ??= borrowed?.plant.evaluator ?? new PlantGeometryEvaluator(recipe);
    if (evaluator.recipe !== recipe) throw new Error("植物几何与配方不一致");
    this._shape = { ...initialShape };
    this.evaluator = evaluator;
    this._geometry = this.evaluator.geometry;
    this.root = parent.createChild(`procedural-${recipe.id}`);
    let allocatedMesh: ModelMesh | undefined;
    try {
      this.renderer = this.root.addComponent(MeshRenderer);
      if (borrowed) {
        this._shape = { ...borrowed.plant.shape };
        this._geometry = borrowed.plant.geometry;
        this._mesh = borrowed.plant.mesh;
        this.support = this.root.createChild("supports");
        this.bindRenderers(borrowed.plant);
        this.sharedRelease = borrowed.release;
        return;
      }
      this._mesh = allocatedMesh = new ModelMesh(engine, `growth-${recipe.id}`);
      const count = this._geometry.positions.length;
      this.dynamicData = new Float32Array(count * 6);
      const staticData = new Float32Array(count * 6);
      this.fillDynamicData();
      for (let i = 0; i < count; i++) {
        const uv = this._geometry.uvs[i],
          offset = i * 6;
        staticData[offset] = uv[0];
        staticData[offset + 1] = uv[1];
        staticData[offset + 2] = staticData[offset + 3] = staticData[offset + 4] = 1;
        staticData[offset + 5] = this._geometry.tintMask[i];
      }
      const dynamic = new Buffer(engine, BufferBindFlag.VertexBuffer, this.dynamicData, BufferUsage.Dynamic, true);
      this.ownedBuffers.push(dynamic);
      const fixed = new Buffer(engine, BufferBindFlag.VertexBuffer, staticData, BufferUsage.Static, true);
      this.ownedBuffers.push(fixed);
      this.mesh.setVertexElements([
        new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
        new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
        new VertexElement("TEXCOORD_0", 0, VertexElementFormat.Vector2, 1),
        new VertexElement("COLOR_0", 8, VertexElementFormat.Vector4, 1)
      ]);
      this.mesh.setVertexBufferBinding(dynamic, 24, 0);
      this.mesh.setVertexBufferBinding(fixed, 24, 1);
      this.mesh.setIndices(
        count > 65535 ? new Uint32Array(this._geometry.indices) : new Uint16Array(this._geometry.indices)
      );
      this.mesh.addSubMesh(0, this._geometry.indices.length);
      this.mesh.bounds.min.set(...this._geometry.bounds.min);
      this.mesh.bounds.max.set(...this._geometry.bounds.max);
      uploadRestorableModelMesh(this.mesh);
      this.renderer.mesh = this.mesh;
      this.renderer.setMaterial(material);
      this.renderer.castShadows = this.renderer.receiveShadows = true;
      this.support = this.root.createChild("supports");
      for (const item of recipe.supports) {
        const entity = this.support.createChild(item.id);
        entity.transform.setPosition(...item.center);
        const mesh = PrimitiveMesh.createCuboid(engine, ...item.size, false);
        this.supportMeshes.push(mesh);
        mesh.setUVs(mesh.getPositions()!.map(() => new Vector2(...item.uv)));
        mesh.setColors(mesh.getPositions()!.map(() => new Color(1, 1, 1, 0)));
        uploadRestorableModelMesh(mesh);
        const renderer = entity.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setMaterial(material);
        renderer.castShadows = renderer.receiveShadows = true;
      }
      this.support.isActive = false;
    } catch (error) {
      this.releaseResources(allocatedMesh);
      throw error;
    }
  }

  /** Borrowed view: arrays are reused and mutated by setGrowth; copy values to retain a snapshot. */
  get geometry(): PlantGeometry {
    return this._geometry;
  }
  get shape(): PlantShape {
    return this._shape;
  }
  get disposed(): boolean {
    return this._disposed;
  }
  get updateMilliseconds(): number {
    return this._updateMilliseconds;
  }

  get updateCount(): number {
    return this._updateCount;
  }

  setGrowth(age: number, shape: PlantShape = this._shape): PlantGeometry {
    if (this._disposed) throw new Error("程序化植株已释放");
    if (!Number.isFinite(age)) throw new Error("生长进度必须是有限数值");
    age = Math.max(0, Math.min(1, age));
    if (
      age === this._geometry.age &&
      shape.leafSpread === this._shape.leafSpread &&
      shape.stemBend === this._shape.stemBend &&
      shape.fruitScale === this._shape.fruitScale
    ) {
      this._updateMilliseconds = 0;
      return this._geometry;
    }
    this.ensureExclusive();
    const start = performance.now();
    const geometry = this.evaluator.update(age, shape);
    this._shape = { ...shape };
    this.uploadGeometry(geometry, start);
    return geometry;
  }

  /** Reproject anchors without replacing entities, topology, material, or any GPU buffer. */
  setAnchorOffsets(offsets: ReadonlyMap<string, readonly [number, number, number]>): boolean {
    if (this._disposed) throw new Error("程序化植株已释放");
    if (this.shared && !offsets.size) return false;
    // Reject invalid edits before allocating private resources or releasing the shared lease.
    if (this.shared) this.evaluator.validateAnchorOffsets(offsets);
    this.ensureExclusive();
    const start = performance.now();
    if (!this.evaluator.setAnchorOffsets(offsets)) return false;
    this._hasAnchorOffsets = offsets.size > 0;
    this.uploadGeometry(this.evaluator.update(this._geometry.age, this._shape), start);
    return true;
  }

  private uploadGeometry(geometry: PlantGeometry, start: number): void {
    this.fillDynamicData();
    this.ownedBuffers[0].setData(this.dynamicData);
    this.mesh.bounds.min.set(...geometry.bounds.min);
    this.mesh.bounds.max.set(...geometry.bounds.max);
    this._geometry = geometry;
    this._updateCount++;
    this._uploadedBytes += this.dynamicData.byteLength;
    this._updateMilliseconds = performance.now() - start;
  }

  get uploadedBytes(): number {
    return this._uploadedBytes;
  }

  private fillDynamicData(): void {
    const { positions, normals } = this._geometry;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i],
        n = normals[i],
        offset = i * 6;
      this.dynamicData[offset] = p[0];
      this.dynamicData[offset + 1] = p[1];
      this.dynamicData[offset + 2] = p[2];
      this.dynamicData[offset + 3] = n[0];
      this.dynamicData[offset + 4] = n[1];
      this.dynamicData[offset + 5] = n[2];
    }
  }

  /** Stable envelope across authoring stages, including plants that shrink at the end. */
  framingBounds() {
    const ages = new Set([0, 1]);
    const curves = [
      ...this.recipe.anchors.map((a) => a.poses),
      ...(this.recipe.meshes ?? []).map((mesh) => mesh.poses),
      ...this.recipe.leaves.flatMap((l) => [l.poses, l.scale ?? []]),
      ...this.recipe.stems.map((s) => s.radii),
      ...this.recipe.volumes.flatMap((v) => [v.poses, v.scale ?? []])
    ];
    for (const curve of curves) for (const key of curve) ages.add(key.age);
    const keys = [...ages].sort((a, b) => a - b);
    for (let i = 1; i < keys.length; i++) ages.add((keys[i - 1] + keys[i]) / 2);
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const age of ages) {
      const bounds = generatePlantGrowthGeometry(this.recipe, age, this._shape).bounds;
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], bounds.min[axis]);
        max[axis] = Math.max(max[axis], bounds.max[axis]);
      }
    }
    return { min: min as [number, number, number], max: max as [number, number, number] };
  }

  /** Switch bindings atomically. This never replaces the gameplay root or renderer. */
  borrow(source: ProceduralPlant, release: () => void): void {
    if (this._disposed || this.bindingHeld || this.hasAnchorOffsets) throw new Error("植物绑定暂不可切换");
    const mesh = this.shared ? undefined : this.mesh;
    const supports = this.supportMeshes;
    const buffers = this.ownedBuffers;
    const previousRelease = this.sharedRelease;
    this.bindRenderers(source);
    this._mesh = source.mesh;
    this._geometry = source.geometry;
    this._shape = { ...source.shape };
    this.evaluator = source.evaluator;
    this.supportMeshes = [];
    this.ownedBuffers = [];
    this.dynamicData = undefined!;
    this.sharedRelease = release;
    this.appearanceRelease?.();
    this.appearanceRelease = undefined;
    destroyOwnedMeshSet([...(mesh ? [mesh] : []), ...supports]);
    for (const buffer of buffers) buffer.destroy(true);
    previousRelease?.();
  }

  private bindRenderers(source: ProceduralPlant): void {
    const bind = (target: MeshRenderer, from: MeshRenderer) => {
      target.mesh = from.mesh;
      target.setMaterials([...from.getMaterials()]);
      target.enableVertexColor = from.enableVertexColor;
      const tint = from.shaderData.getVector4("renderer_OrganTint");
      if (tint) target.shaderData.setVector4("renderer_OrganTint", tint.clone());
    };
    bind(this.renderer, source.renderer);
    const sources = source.support.getComponentsIncludeChildren(MeshRenderer, []);
    const previous = this.support.getComponentsIncludeChildren(MeshRenderer, []);
    for (let i = 0; i < sources.length; i++) {
      let renderer = previous[i];
      if (!renderer) {
        const entity = this.support.createChild(this.recipe.supports[i].id);
        entity.transform.setPosition(...this.recipe.supports[i].center);
        renderer = entity.addComponent(MeshRenderer);
        renderer.castShadows = renderer.receiveShadows = true;
      }
      bind(renderer, sources[i]);
    }
    this.support.isActive = source.support.isActive;
  }

  /** Copy on write, including authoring callers that change terrain anchors. */
  private ensureExclusive(): void {
    if (!this.shared) return;
    if (this.bindingHeld) throw new Error("动画期间不能修改植物几何");
    const material = new PBRMaterial(this.root.engine);
    let temporary: ProceduralPlant | undefined;
    try {
      this.renderer.getMaterial()!.cloneTo(material);
      const evaluator = new PlantGeometryEvaluator(this.recipe);
      evaluator.update(this.geometry.age, this.shape);
      temporary = new ProceduralPlant(this.recipe, this.root.engine, this.root, material, evaluator);
      temporary._shape = { ...this.shape };
      temporary.renderer.enableVertexColor = this.renderer.enableVertexColor;
      const tint = this.renderer.shaderData.getVector4("renderer_OrganTint");
      if (tint) temporary.renderer.shaderData.setVector4("renderer_OrganTint", tint.clone());
      const release = this.sharedRelease!;
      this.bindRenderers(temporary);
      this._mesh = temporary.mesh;
      this._geometry = temporary.geometry;
      this.evaluator = temporary.evaluator;
      this.dynamicData = temporary.dynamicData;
      this.ownedBuffers = temporary.ownedBuffers;
      this.supportMeshes = temporary.supportMeshes;
      this.sharedRelease = undefined;
      this.appearanceRelease = () => material.destroy(true);
      temporary.detachRenderers();
      temporary.root.destroy();
      temporary._disposed = true;
      release();
    } catch (error) {
      temporary?.dispose();
      material.destroy(true);
      throw error;
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.bindingListener = undefined;
    this.releaseResources(this.shared ? undefined : this.mesh);
  }

  private detachRenderers(): void {
    for (const renderer of this.root.getComponentsIncludeChildren(MeshRenderer, [])) {
      renderer.mesh = null!;
      renderer.setMaterials([]);
    }
  }

  private releaseResources(mesh: ModelMesh | undefined): void {
    this.detachRenderers();
    if (!this.root.destroyed && !this.root.pendingDestroy) this.root.destroy();
    destroyOwnedMeshSet([...(mesh ? [mesh] : []), ...this.supportMeshes]);
    for (const buffer of this.ownedBuffers) buffer.destroy(true);
    this.appearanceRelease?.();
    this.appearanceRelease = undefined;
    this.sharedRelease?.();
    this.sharedRelease = undefined;
  }
}
