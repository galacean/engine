import { destroyOwnedMeshSet } from "@galacean/engine-modify/geometry/destroyOwnedMesh";
import { restoreBuffer, uploadRestorableModelMesh } from "@galacean/engine-modify/rendering/RestorableResources";
import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Color,
  Engine,
  Entity,
  IndexFormat,
  MeshRenderer,
  ModelMesh,
  PBRMaterial,
  PrimitiveMesh,
  Vector2,
  Vector4,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";
import { generatePlantGrowthGeometry, type PlantGeometry } from "../core/PlantGrowthGeometry";
import { DEFAULT_PLANT_SHAPE, type PlantGrowthRecipe, type PlantShape } from "../core/PlantGrowthRecipe";
import { PlantGeometryEvaluator } from "../core/PlantGeometryEvaluator";
import {
  acquirePlantStaticGeometry,
  quantizePlantAge,
  retainPlantSpeciesMaterial,
  transitionPlantGrowthMesh,
  type PlantGrowthMeshLease,
  type PlantStaticGeometryLease
} from "./PlantResourcePool";
import { ORGAN_TINT_PROPERTY } from "./PlantOrganMaterials";

const DEFAULT_VERTEX_ELEMENTS: VertexElement[] = [
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
  new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
  new VertexElement("TEXCOORD_0", 0, VertexElementFormat.Vector2, 1),
  new VertexElement("COLOR_0", 8, VertexElementFormat.Vector4, 1)
];

export interface ProceduralPlantPoolOptions {
  readonly definitionKey?: string;
  readonly staticLease?: PlantStaticGeometryLease;
  readonly growthLease?: PlantGrowthMeshLease;
  readonly poolGrowth?: boolean;
}

/** Stable plant hierarchy with owned, Tier A/B pooled, or borrowed mature bindings. */
export class ProceduralPlant {
  readonly root: Entity;
  readonly renderer: MeshRenderer;
  private readonly engine: Engine;
  private readonly definitionKey?: string;
  private readonly poolGrowth: boolean;
  private _mesh!: ModelMesh | BufferMesh;
  get mesh(): ModelMesh | BufferMesh {
    return this._mesh;
  }
  readonly support: Entity;
  private exclusiveMesh?: BufferMesh;
  private supportMeshes: ModelMesh[] = [];
  private dynamicData?: Float32Array;
  private ownedBuffers: Buffer[] = [];
  private staticLease?: PlantStaticGeometryLease;
  private growthLease?: PlantGrowthMeshLease;
  private _geometry: PlantGeometry;
  private _shape = DEFAULT_PLANT_SHAPE;
  private _disposed = false;
  private _updateMilliseconds = 0;
  private evaluator?: PlantGeometryEvaluator;
  private sharedRelease?: () => void;
  private appearanceRelease?: () => void;
  private bindingHolds = 0;
  private bindingListener?: (held: boolean) => void;
  private readonly rendererScratch: MeshRenderer[] = [];
  private readonly sourceRendererScratch: MeshRenderer[] = [];
  private readonly speciesMaterialScratch: {
    material: PBRMaterial | undefined;
    pendingRelease: (() => void) | undefined;
  } = { material: undefined, pendingRelease: undefined };
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
    initialShape: PlantShape = DEFAULT_PLANT_SHAPE,
    pooled?: ProceduralPlantPoolOptions
  ) {
    this.engine = engine;
    this.definitionKey = pooled?.definitionKey;
    this.poolGrowth = Boolean(pooled?.poolGrowth);
    this.root = parent.createChild(`procedural-${recipe.id}`);
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
      if (pooled?.growthLease) {
        const lease = pooled.growthLease;
        this.growthLease = lease;
        this._shape = { ...initialShape };
        this._geometry = lease.geometry;
        this._mesh = lease.mesh;
        this.renderer.mesh = lease.mesh;
        this.renderer.setMaterial(material);
        this.renderer.castShadows = this.renderer.receiveShadows = true;
        this.support = this.root.createChild("supports");
        this.bindSupportMeshes(lease.supportMeshes, material);
        this.support.isActive = false;
        return;
      }
      evaluator ??= new PlantGeometryEvaluator(recipe);
      if (evaluator.recipe !== recipe) throw new Error("植物几何与配方不一致");
      this._shape = { ...initialShape };
      this.evaluator = evaluator;
      this._geometry = evaluator.geometry;
      this.staticLease = pooled?.staticLease;
      const mesh = this.buildExclusiveMesh(this.staticLease);
      this._mesh = this.exclusiveMesh = mesh;
      this.renderer.mesh = mesh;
      this.renderer.setMaterial(material);
      this.renderer.castShadows = this.renderer.receiveShadows = true;
      this.support = this.root.createChild("supports");
      if (this.staticLease) {
        this.bindSupportMeshes(this.staticLease.supportMeshes, material);
      } else {
        for (let i = 0; i < recipe.supports.length; i++) {
          const item = recipe.supports[i];
          const entity = this.support.createChild(item.id);
          entity.transform.setPosition(...item.center);
          const supportMesh = PrimitiveMesh.createCuboid(engine, ...item.size, { keepMeshData: true });
          this.supportMeshes.push(supportMesh);
          const positions = supportMesh.getPositions()!;
          const uvs: Vector2[] = new Array(positions.length);
          const colors: Color[] = new Array(positions.length);
          for (let v = 0; v < positions.length; v++) {
            uvs[v] = new Vector2(item.uv[0], item.uv[1]);
            colors[v] = new Color(1, 1, 1, 0);
          }
          supportMesh.setUVs(uvs);
          supportMesh.setColors(colors);
          uploadRestorableModelMesh(supportMesh);
          const renderer = entity.addComponent(MeshRenderer);
          renderer.mesh = supportMesh;
          renderer.setMaterial(material);
          renderer.castShadows = renderer.receiveShadows = true;
        }
      }
      this.support.isActive = false;
    } catch (error) {
      this.releaseResources();
      throw error;
    }
  }

  private buildExclusiveMesh(staticLease?: PlantStaticGeometryLease): BufferMesh {
    const mesh = new BufferMesh(this.engine, `growth-${this.recipe.id}`);
    mesh.isGCIgnored = true;
    const count = this._geometry.positions.length;
    const dynamicData = (this.dynamicData = new Float32Array(count * 6));
    this.fillDynamicData();
    const dynamicBuffer = new Buffer(this.engine, BufferBindFlag.VertexBuffer, dynamicData, BufferUsage.Dynamic, false);
    dynamicBuffer.isGCIgnored = true;
    restoreBuffer(dynamicBuffer, dynamicData);
    this.ownedBuffers.push(dynamicBuffer);
    if (staticLease) {
      mesh.setVertexElements(staticLease.vertexElements);
      mesh.setVertexBufferBinding(dynamicBuffer, 24, 0);
      mesh.setVertexBufferBinding(staticLease.staticVertexBuffer, 24, 1);
      mesh.setIndexBufferBinding(staticLease.indexBuffer, staticLease.indexFormat);
      mesh.addSubMesh(0, staticLease.indexCount);
    } else {
      const staticData = new Float32Array(count * 6);
      for (let i = 0; i < count; i++) {
        const uv = this._geometry.uvs[i],
          offset = i * 6;
        staticData[offset] = uv[0];
        staticData[offset + 1] = uv[1];
        staticData[offset + 2] = staticData[offset + 3] = staticData[offset + 4] = 1;
        staticData[offset + 5] = this._geometry.tintMask[i];
      }
      const staticBuffer = new Buffer(this.engine, BufferBindFlag.VertexBuffer, staticData, BufferUsage.Static, false);
      staticBuffer.isGCIgnored = true;
      restoreBuffer(staticBuffer, staticData);
      this.ownedBuffers.push(staticBuffer);
      const use32 = count > 65535;
      const indexData = use32 ? new Uint32Array(this._geometry.indices) : new Uint16Array(this._geometry.indices);
      const indexBuffer = new Buffer(this.engine, BufferBindFlag.IndexBuffer, indexData, BufferUsage.Static, false);
      indexBuffer.isGCIgnored = true;
      restoreBuffer(indexBuffer, indexData);
      this.ownedBuffers.push(indexBuffer);
      mesh.setVertexElements(DEFAULT_VERTEX_ELEMENTS);
      mesh.setVertexBufferBinding(dynamicBuffer, 24, 0);
      mesh.setVertexBufferBinding(staticBuffer, 24, 1);
      mesh.setIndexBufferBinding(indexBuffer, use32 ? IndexFormat.UInt32 : IndexFormat.UInt16);
      mesh.addSubMesh(0, this._geometry.indices.length);
    }
    mesh.bounds.min.set(this._geometry.bounds.min[0], this._geometry.bounds.min[1], this._geometry.bounds.min[2]);
    mesh.bounds.max.set(this._geometry.bounds.max[0], this._geometry.bounds.max[1], this._geometry.bounds.max[2]);
    return mesh;
  }

  private bindSupportMeshes(meshes: readonly ModelMesh[], material: PBRMaterial): void {
    const existing = this.support.getComponentsIncludeChildren(MeshRenderer, this.rendererScratch);
    for (let i = 0; i < this.recipe.supports.length; i++) {
      let renderer = existing[i];
      if (!renderer) {
        const item = this.recipe.supports[i];
        const entity = this.support.createChild(item.id);
        entity.transform.setPosition(item.center[0], item.center[1], item.center[2]);
        renderer = entity.addComponent(MeshRenderer);
        renderer.castShadows = renderer.receiveShadows = true;
      }
      renderer.mesh = meshes[i];
      renderer.setMaterial(material);
    }
    existing.length = 0;
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
    if (this.poolGrowth && !this._hasAnchorOffsets && this.definitionKey) {
      const bucket = quantizePlantAge(age);
      if (
        !this.shared &&
        this.growthLease &&
        this.growthLease.bucket === bucket &&
        shape.leafSpread === this._shape.leafSpread &&
        shape.stemBend === this._shape.stemBend &&
        shape.fruitScale === this._shape.fruitScale
      ) {
        this._updateMilliseconds = 0;
        return this._geometry;
      }
      if (this.bindingHeld) throw new Error("动画期间不能修改植物几何");
      const start = performance.now();
      let pendingAppearanceRelease: (() => void) | undefined;
      let nextLease: PlantGrowthMeshLease | undefined;
      let material: PBRMaterial;
      try {
        if (this.appearanceRelease) {
          material = this.renderer.getMaterial() as PBRMaterial;
        } else {
          this.acquireSpeciesMaterialInto(this.speciesMaterialScratch);
          material = this.speciesMaterialScratch.material!;
          pendingAppearanceRelease = this.speciesMaterialScratch.pendingRelease;
          this.speciesMaterialScratch.material = undefined;
          this.speciesMaterialScratch.pendingRelease = undefined;
        }
        nextLease = transitionPlantGrowthMesh(
          this.engine,
          this.growthLease,
          this.definitionKey,
          this.recipe,
          shape,
          age,
          bucket
        );
      } catch (error) {
        this.speciesMaterialScratch.material = undefined;
        this.speciesMaterialScratch.pendingRelease = undefined;
        if (nextLease && nextLease !== this.growthLease) nextLease.release();
        pendingAppearanceRelease?.();
        throw error;
      }
      const prevGrowthLease = this.growthLease;
      const prevSharedRelease = this.sharedRelease;
      this.growthLease = nextLease;
      this.sharedRelease = undefined;
      if (pendingAppearanceRelease) this.appearanceRelease = pendingAppearanceRelease;
      this._mesh = nextLease.mesh;
      this._geometry = nextLease.geometry;
      if (
        this._shape.leafSpread !== shape.leafSpread ||
        this._shape.stemBend !== shape.stemBend ||
        this._shape.fruitScale !== shape.fruitScale
      ) {
        this._shape = { ...shape };
      }
      this.evaluator = undefined;
      if (nextLease !== prevGrowthLease || prevSharedRelease || pendingAppearanceRelease) {
        this.renderer.mesh = nextLease.mesh;
        this.renderer.setMaterial(material);
        this.bindSupportMeshes(nextLease.supportMeshes, material);
      }
      this.releaseExclusiveBuffers();
      if (prevGrowthLease && prevGrowthLease !== nextLease) prevGrowthLease.release();
      prevSharedRelease?.();
      this._updateCount++;
      this._updateMilliseconds = performance.now() - start;
      return this._geometry;
    }
    if (
      !this.shared &&
      !this.growthLease &&
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
    const geometry = this.evaluator!.update(age, shape);
    this._shape = { ...shape };
    this.uploadGeometry(geometry, start);
    return geometry;
  }

  /** Reproject anchors without replacing entities, topology, material, or any GPU buffer. */
  setAnchorOffsets(offsets: ReadonlyMap<string, readonly [number, number, number]>): boolean {
    if (this._disposed) throw new Error("程序化植株已释放");
    if ((this.shared || this.growthLease) && !offsets.size) return false;
    // Reject invalid edits before allocating private resources or releasing the shared lease.
    if (this.shared || this.growthLease) {
      const checkEvaluator = new PlantGeometryEvaluator(this.recipe);
      checkEvaluator.validateAnchorOffsets(offsets);
    }
    this.ensureExclusive();
    const start = performance.now();
    if (!this.evaluator!.setAnchorOffsets(offsets)) return false;
    this._hasAnchorOffsets = offsets.size > 0;
    this.uploadGeometry(this.evaluator!.update(this._geometry.age, this._shape), start);
    return true;
  }

  private uploadGeometry(geometry: PlantGeometry, start: number): void {
    this.fillDynamicData();
    this.ownedBuffers[0].setData(this.dynamicData!);
    this.mesh.bounds.min.set(geometry.bounds.min[0], geometry.bounds.min[1], geometry.bounds.min[2]);
    this.mesh.bounds.max.set(geometry.bounds.max[0], geometry.bounds.max[1], geometry.bounds.max[2]);
    this._geometry = geometry;
    this._updateCount++;
    this._uploadedBytes += this.dynamicData!.byteLength;
    this._updateMilliseconds = performance.now() - start;
  }

  get uploadedBytes(): number {
    return this._uploadedBytes;
  }

  private fillDynamicData(): void {
    const { positions, normals } = this._geometry;
    const dynamicData = this.dynamicData!;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i],
        n = normals[i],
        offset = i * 6;
      dynamicData[offset] = p[0];
      dynamicData[offset + 1] = p[1];
      dynamicData[offset + 2] = p[2];
      dynamicData[offset + 3] = n[0];
      dynamicData[offset + 4] = n[1];
      dynamicData[offset + 5] = n[2];
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
    const prevExclusiveMesh = this.exclusiveMesh;
    const prevSupports = this.supportMeshes;
    const prevBuffers = this.ownedBuffers;
    const prevStaticLease = this.staticLease;
    const prevGrowthLease = this.growthLease;
    const prevRelease = this.sharedRelease;
    const prevAppearanceRelease = this.appearanceRelease;
    this.bindRenderers(source);
    this._mesh = source.mesh;
    this._geometry = source.geometry;
    this._shape = { ...source.shape };
    this.evaluator = undefined;
    this.exclusiveMesh = undefined;
    this.supportMeshes = [];
    this.ownedBuffers = [];
    this.staticLease = undefined;
    this.growthLease = undefined;
    this.dynamicData = undefined;
    this.sharedRelease = release;
    this.appearanceRelease = undefined;
    if (prevExclusiveMesh && !prevExclusiveMesh.destroyed) prevExclusiveMesh.destroy(true);
    destroyOwnedMeshSet(prevSupports);
    for (let i = 0; i < prevBuffers.length; i++) {
      const b = prevBuffers[i];
      if (!b.destroyed) b.destroy(true);
    }
    prevStaticLease?.release();
    prevGrowthLease?.release();
    prevAppearanceRelease?.();
    prevRelease?.();
  }

  private bindRenderers(source: ProceduralPlant): void {
    const bind = (target: MeshRenderer, from: MeshRenderer) => {
      target.mesh = from.mesh;
      const mats = from.getMaterials();
      if (mats.length === 1) target.setMaterial(mats[0]!);
      else target.setMaterials([...mats]);
      target.enableVertexColor = from.enableVertexColor;
      const tint = from.shaderData.getVector4(ORGAN_TINT_PROPERTY);
      if (tint) {
        const existing = target.shaderData.getVector4(ORGAN_TINT_PROPERTY);
        if (existing) existing.set(tint.x, tint.y, tint.z, tint.w);
        else target.shaderData.setVector4(ORGAN_TINT_PROPERTY, tint.clone());
      }
    };
    bind(this.renderer, source.renderer);
    const sources = source.support.getComponentsIncludeChildren(MeshRenderer, this.sourceRendererScratch);
    const previous = this.support.getComponentsIncludeChildren(MeshRenderer, this.rendererScratch);
    for (let i = 0; i < sources.length; i++) {
      let renderer = previous[i];
      if (!renderer) {
        const entity = this.support.createChild(this.recipe.supports[i].id);
        entity.transform.setPosition(
          this.recipe.supports[i].center[0],
          this.recipe.supports[i].center[1],
          this.recipe.supports[i].center[2]
        );
        renderer = entity.addComponent(MeshRenderer);
        renderer.castShadows = renderer.receiveShadows = true;
      }
      bind(renderer, sources[i]);
    }
    sources.length = 0;
    previous.length = 0;
    this.support.isActive = source.support.isActive;
  }

  private acquireSpeciesMaterialInto(out: {
    material: PBRMaterial | undefined;
    pendingRelease: (() => void) | undefined;
  }): void {
    const existingMat = this.renderer.getMaterial() as PBRMaterial;
    if (this.appearanceRelease) {
      out.material = existingMat;
      out.pendingRelease = undefined;
      return;
    }
    const retained = existingMat ? retainPlantSpeciesMaterial(this.engine, existingMat) : undefined;
    if (retained) {
      out.material = existingMat;
      out.pendingRelease = retained;
      return;
    }
    const clone = new PBRMaterial(this.engine);
    existingMat.cloneTo(clone);
    out.material = clone;
    out.pendingRelease = () => {
      if (!clone.destroyed) clone.destroy(true);
    };
  }

  private releaseExclusiveBuffers(): void {
    if (this.exclusiveMesh && !this.exclusiveMesh.destroyed) this.exclusiveMesh.destroy(true);
    this.exclusiveMesh = undefined;
    for (let i = 0; i < this.ownedBuffers.length; i++) {
      const b = this.ownedBuffers[i];
      if (!b.destroyed) b.destroy(true);
    }
    this.ownedBuffers.length = 0;
    destroyOwnedMeshSet(this.supportMeshes);
    this.supportMeshes.length = 0;
    this.dynamicData = undefined;
    this.staticLease?.release();
    this.staticLease = undefined;
  }

  /** Copy on write, including authoring callers that change terrain anchors or unpooled growth. */
  private ensureExclusive(): void {
    if (!this.shared && !this.growthLease) return;
    if (this.bindingHeld) throw new Error("动画期间不能修改植物几何");
    let temporary: ProceduralPlant | undefined;
    this.acquireSpeciesMaterialInto(this.speciesMaterialScratch);
    const material = this.speciesMaterialScratch.material!;
    const retainedRelease = this.speciesMaterialScratch.pendingRelease;
    this.speciesMaterialScratch.material = undefined;
    this.speciesMaterialScratch.pendingRelease = undefined;
    try {
      const evaluator = new PlantGeometryEvaluator(this.recipe);
      evaluator.update(this.geometry.age, this.shape);
      const staticLease = this.definitionKey
        ? acquirePlantStaticGeometry(this.engine, this.definitionKey, this.recipe, evaluator)
        : undefined;
      temporary = new ProceduralPlant(
        this.recipe,
        this.engine,
        this.root,
        material,
        evaluator,
        undefined,
        this.shape,
        staticLease ? { definitionKey: this.definitionKey, staticLease, poolGrowth: false } : undefined
      );
      temporary._shape = { ...this.shape };
      temporary.renderer.enableVertexColor = this.renderer.enableVertexColor;
      const tint = this.renderer.shaderData.getVector4(ORGAN_TINT_PROPERTY);
      if (tint) temporary.renderer.shaderData.setVector4(ORGAN_TINT_PROPERTY, tint.clone());
      const prevSharedRelease = this.sharedRelease;
      const prevGrowthLease = this.growthLease;
      this.bindRenderers(temporary);
      this._mesh = temporary.mesh;
      this.exclusiveMesh = temporary.exclusiveMesh;
      this._geometry = temporary.geometry;
      this.evaluator = temporary.evaluator;
      this.dynamicData = temporary.dynamicData;
      this.ownedBuffers = temporary.ownedBuffers;
      this.staticLease = temporary.staticLease;
      this.supportMeshes = temporary.supportMeshes;
      this.sharedRelease = undefined;
      this.growthLease = undefined;
      if (retainedRelease) this.appearanceRelease = retainedRelease;
      temporary.exclusiveMesh = undefined;
      temporary.ownedBuffers = [];
      temporary.supportMeshes = [];
      temporary.staticLease = undefined;
      temporary.detachRenderers();
      temporary.root.destroy();
      temporary._disposed = true;
      prevGrowthLease?.release();
      prevSharedRelease?.();
    } catch (error) {
      temporary?.dispose();
      retainedRelease?.();
      throw error;
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.bindingListener = undefined;
    this.releaseResources();
  }

  private detachRenderers(): void {
    const renderers = this.root.getComponentsIncludeChildren(MeshRenderer, this.rendererScratch);
    for (let i = 0; i < renderers.length; i++) {
      renderers[i].mesh = null!;
      renderers[i].setMaterials([]);
    }
    renderers.length = 0;
  }

  private releaseResources(): void {
    this.detachRenderers();
    if (!this.root.destroyed && !this.root.pendingDestroy) this.root.destroy();
    this.releaseExclusiveBuffers();
    this.growthLease?.release();
    this.growthLease = undefined;
    this.appearanceRelease?.();
    this.appearanceRelease = undefined;
    this.sharedRelease?.();
    this.sharedRelease = undefined;
  }
}
