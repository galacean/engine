import { loadPlantJSON, loadPlantParameters } from "./ProceduralPlantResources";
import { resolvePlantResourceReference } from "./PlantSpeciesResources";
import {
  layoutPlantExhibitionRows,
  plantExhibitionBaseId,
  plantExhibitionVariants,
  sizeVariantEntry
} from "./PlantExhibitionLayout";
import { type Camera, type Entity, type Material, Matrix, MeshRenderer, Vector3, Vector4 } from "@galacean/engine";
import { AssetStageLabels, ASSET_STAGE_CLEARANCE } from "./AssetStageLabels";
import { PlantDrawCallProfiler } from "./PlantDrawCallProfiler";
import { TERRAIN_FLOWER_WIND_RESPONSE_PROFILE } from "@galacean/engine-terrain/terrain/project/TerrainWindResponseProfiles";
import { VEGETATION_AUTHORING_REFERENCE_SCALE, type AssetAssemblyStandBounds } from "./AssetAssemblyRenderProfile";
import {
  validateProceduralPlantAsset,
  validatePlantGeometryInstances,
  validatePlantInstanceVariation,
  type PlantGeometryInstance,
  type ProceduralPlantAsset,
  type ProceduralPlantLibraryEntry
} from "./ProceduralPlantAsset";
import {
  plantMeshGeometryKey,
  uploadProceduralPlantGeometry,
  type ProceduralPlantMeshes
} from "./ProceduralPlantMeshes";
import {
  configureAssetAssemblyRendererInstance,
  resolveProceduralTreeWindBoundsMargin,
  resolveProceduralTreeWindScaleCompensation
} from "./TreeAssemblyRuntime";
import {
  attachPlantCanopyOpticalDepth,
  buildProceduralPlantGeometry,
  mergePlantGeometryByMaterial,
  type PlantMeshData,
  type PlantPartMesh,
  type PlantPoint
} from "./ProceduralPlantGeometry";

export interface PlantExhibitionStand {
  readonly entry: ProceduralPlantLibraryEntry;
  getBounds(): AssetAssemblyStandBounds;
  translate(x: number, z: number): void;
  setVisible(visible: boolean): void;
  isEnabled?(): boolean;
  getTriangleCount(): number;
  getRenderers(): readonly MeshRenderer[];
}

/** Source-space LOD0 bounds, using the same instance transforms and leaf extents as rendering. */
export function measureProceduralPlantAssetBounds(
  asset: ProceduralPlantAsset,
  entry: ProceduralPlantLibraryEntry
): AssetAssemblyStandBounds {
  validateProceduralPlantAsset(asset);
  validatePlantGeometryInstances(entry, asset);
  validatePlantInstanceVariation(entry);
  const bounds = instantiateSpecimen(compileSpecimen(asset, 0), entry).localBounds;
  return {
    min: bounds.min.map((value) => value / VEGETATION_AUTHORING_REFERENCE_SCALE) as [number, number, number],
    max: bounds.max.map((value) => value / VEGETATION_AUTHORING_REFERENCE_SCALE) as [number, number, number]
  };
}

interface PlantRenderPart extends PlantPartMesh {
  readonly instance?: PlantGeometryInstance;
}

/** Exact appearance slot after prototype aliases; shared materials cannot identify this slot. */
export interface PlantPlacementRenderer {
  readonly renderer: MeshRenderer;
  readonly materialId: string;
  /** Legacy recipe author colours are multipliers; converted appearance slots are absolute. */
  readonly authoredColorScale?: readonly [number, number, number];
}

interface Specimen {
  readonly entry: ProceduralPlantLibraryEntry;
  readonly asset: ProceduralPlantAsset;
  readonly materials: ReadonlyMap<string, Material>;
  readonly colors: ReadonlyMap<string, PlantPoint>;
  geometry: readonly PlantRenderPart[];
  position: PlantPoint;
  labelClearance: number;
  lod: number;
  localBounds: AssetAssemblyStandBounds;
  /** Canonical LOD0 dimensions for population planning, independent of the displayed LOD. */
  placementBounds: AssetAssemblyStandBounds;
  bounds: AssetAssemblyStandBounds;
}

interface InstanceBatch {
  readonly id: string;
  readonly material: Material;
  readonly assetIds: readonly string[];
  readonly triangleCount: number;
  readonly renderers: readonly MeshRenderer[];
}

/** Independent plant renderers share Mesh/Material resources; the Engine instances them after culling. */
export class ProceduralPlantLibraryRuntime {
  private readonly _specimens: Specimen[] = [];
  private _labels?: AssetStageLabels;
  private _owners: { assetId: string; renderer: MeshRenderer; materialId: string }[] = [];
  private _populationOwners: { assetId: string; renderer: MeshRenderer }[] = [];
  private _populationSources = new Map<
    string,
    { root: Entity; meshes: ProceduralPlantMeshes; bindings: PlantPlacementRenderer[] }
  >();
  private _external: readonly PlantExhibitionStand[] = [];
  private _camera!: Camera;
  private _drawCalls?: PlantDrawCallProfiler;
  private _rows: ReturnType<typeof layoutPlantExhibitionRows> = [];
  private _category = "";
  private _shadows = true;
  private _destroyed = false;
  private _changingLod = false;
  private _batches: InstanceBatch[] = [];
  private _batchRoot?: Entity;
  private _meshes?: ProceduralPlantMeshes;
  private _instanceEntities = new Map<string, Entity[]>();

  private constructor(
    private readonly _root: Entity,
    private readonly _normalMapped: boolean
  ) {
    _root.isActive = false;
  }

  static async load(options: {
    owner: Entity;
    camera: Camera;
    indexUrl: string;
    materialForSlot: (name: string, asset: ProceduralPlantAsset, materialId: string) => Material;
    colorForSlot: (asset: ProceduralPlantAsset, materialId: string) => PlantPoint;
    normalMapped?: boolean;
    addSizeVariants?: boolean;
    /** Production consumers borrow a finite palette and authored LOD without exhibition UI. */
    assetIds?: ReadonlySet<string>;
    lod?: number;
    populationOnly?: boolean;
    onProgress?: (loaded: number, total: number) => void;
  }): Promise<ProceduralPlantLibraryRuntime> {
    const runtime = new ProceduralPlantLibraryRuntime(
      options.owner.createChild("Procedural plant library"),
      options.normalMapped ?? false
    );
    try {
      const indexUrl = /^[.\/]/u.test(options.indexUrl)
        ? new URL(options.indexUrl, location.href).href
        : options.indexUrl;
      const library = await loadPlantJSON<{
        assets: ProceduralPlantLibraryEntry[];
        prototypes?: ProceduralPlantLibraryEntry[];
      }>(options.owner.engine, indexUrl);
      const entries = library.assets.filter((entry) => !options.assetIds || options.assetIds.has(entry.id));
      const sources = [...entries, ...(library.prototypes ?? [])];
      runtime._camera = options.camera;
      if (!options.populationOnly) runtime._drawCalls = new PlantDrawCallProfiler(options.camera);
      const parameters = new Map<string, Promise<ProceduralPlantAsset>>();
      const loadAsset = (entry: ProceduralPlantLibraryEntry) => {
        let pending = parameters.get(entry.id);
        if (!pending) {
          pending = (async () => {
            const asset = await loadPlantParameters<ProceduralPlantAsset>(
              options.owner.engine,
              resolvePlantResourceReference(entry.parameterFile!, indexUrl),
              validateProceduralPlantAsset
            );
            if (asset.id !== entry.id || asset.category !== entry.category)
              throw new Error(`${entry.id}: plant library identity mismatch`);
            return asset;
          })();
          parameters.set(entry.id, pending);
        }
        return pending;
      };
      const compiled = new Map<string, ReturnType<typeof compileSpecimen>>();
      const available = entries.filter((entry) => entry.parameterFile);
      if (!available.length) throw new Error("Plant library contains no parameter assets");
      for (const entry of available) {
        const source = entry.prototypeId ? sources.find((item) => item.id === entry.prototypeId) : entry;
        if (!source?.parameterFile || (source.prototypeId && source.prototypeId !== source.id))
          throw new Error(`${entry.id}: invalid plant prototype`);
        if (
          entry.instanceScale &&
          (entry.instanceScale.length !== 3 || !entry.instanceScale.every((v) => Number.isFinite(v) && v > 0))
        )
          throw new Error(`${entry.id}: invalid instance scale`);
        const asset = await loadAsset(source);
        validatePlantGeometryInstances(entry, asset);
        validatePlantInstanceVariation(entry);
        // Materials and independent colours still belong to the instance identity.
        const appearanceAsset = { ...asset, id: entry.id };
        // Component instances may omit optional geometry (for example a flower).
        // Do not require or allocate a material for a component that is absent.
        const activeSlots = Object.entries(asset.materialSlots).filter(
          ([id]) => !entry.geometryInstances || entry.geometryInstances.some((instance) => instance.materialId === id)
        );
        const materials = new Map(
          activeSlots.map(([id, name]) => [
            id,
            options.materialForSlot(name, appearanceAsset, entry.materialAliases?.[id] ?? id)
          ])
        );
        const colors = new Map(
          activeSlots.map(([id]) => [id, options.colorForSlot(appearanceAsset, entry.materialAliases?.[id] ?? id)])
        );
        let base = compiled.get(source.id);
        if (!base) compiled.set(source.id, (base = compileSpecimen(asset, 0)));
        const placement = instantiateSpecimen(base, entry);
        const lod = Math.min(options.lod ?? 0, asset.geometryLods.length - 1);
        const geometry = lod === 0 ? placement : instantiateSpecimen(compileSpecimen(asset, lod), entry);
        runtime._specimens.push({
          entry: { ...entry, parameterFile: source.parameterFile },
          asset,
          materials,
          colors,
          ...geometry,
          position: [0, 0, 0],
          labelClearance: 0,
          lod,
          bounds: geometry.localBounds,
          placementBounds: placement.localBounds
        });
        options.onProgress?.(runtime._specimens.length, available.length);
        // Let loading feedback paint between CPU geometry compilations.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (options.addSizeVariants) {
        const groups = new Map<string, Specimen[]>();
        for (const item of runtime._specimens) {
          const row = plantExhibitionBaseId(item.entry);
          const group = groups.get(row) ?? [];
          group.push(item);
          groups.set(row, group);
        }
        for (const group of groups.values())
          if (group.length === 1) {
            const base = group[0];
            for (const [index, variant] of plantExhibitionVariants(base.entry).entries()) {
              const entry = sizeVariantEntry(base.entry, variant, index + 1);
              const geometry = instantiateSpecimen(compiled.get(base.asset.id)!, entry);
              runtime._specimens.push({
                ...base,
                entry,
                ...geometry,
                bounds: geometry.localBounds,
                placementBounds: geometry.localBounds
              });
            }
          }
      }
      if (options.populationOnly) {
        runtime._replaceBatches(runtime._specimens, "");
        return runtime;
      }
      runtime._labels = new AssetStageLabels(
        runtime._root,
        options.camera,
        runtime._specimens.map(({ entry }) => ({ id: entry.id, text: "", x: 0 }))
      );
      runtime._layout(runtime._specimens);
      runtime._replaceBatches(runtime._specimens, runtime._category);
      runtime._updateLabels();
      return runtime;
    } catch (error) {
      runtime.destroy();
      throw error;
    }
  }

  get entries(): readonly ProceduralPlantLibraryEntry[] {
    return [
      ...this._specimens.map((item) => item.entry),
      ...this._external.filter((item) => item.isEnabled?.() !== false).map((item) => item.entry)
    ];
  }

  /** Borrow measured, generated specimens for a population preview. GPU resources remain library-owned.
   * Consumers must release their renderers before changing the library category/LOD or destroying it.
   * Exhibition-only size copies are excluded; authored variants retain their reusable asset identities.
   */
  getPlacementSources(compactStaticParts = false): readonly {
    entry: ProceduralPlantLibraryEntry;
    bounds: AssetAssemblyStandBounds;
    renderers: readonly MeshRenderer[];
    rendererBindings: readonly PlantPlacementRenderer[];
  }[] {
    return this._specimens
      .filter((item) => !item.entry.sourceAssetId)
      .map((item) => {
        const rendererBindings =
          compactStaticParts &&
          item.geometry.some((part) => part.instance) &&
          item.geometry.every((part) => !part.mesh.leafFrames && !part.mesh.windFrames)
            ? this._populationSource(item)
            : this._owners
                .filter((owner) => owner.assetId === item.entry.id)
                .map(({ renderer, materialId }) => ({ renderer, materialId }));
        return {
          entry: item.entry,
          bounds: translateBounds(item.placementBounds, item.position[0], item.position[2]),
          rendererBindings,
          renderers: rendererBindings.map((binding) => binding.renderer)
        };
      })
      .filter((source) => source.renderers.length > 0);
  }

  setPopulationRenderers(owners: readonly { assetId: string; renderer: MeshRenderer }[]): void {
    this._populationOwners = [...owners];
    this._syncDrawCallTargets();
  }

  /** Compile a whole static clump from its final parameter-generated parts once per material/colour.
   * Ordinary MeshRenderers then share this mesh through the Engine's native GPU Instance batcher.
   * The editable exhibition retains its component representation; dynamic leaf/wind frames retain theirs. */
  private _populationSource(item: Specimen): readonly PlantPlacementRenderer[] {
    const cached = this._populationSources.get(item.entry.id);
    if (cached) {
      cached.root.transform.setPosition(...item.position);
      return cached.bindings;
    }
    const compiled = compileStaticPlantClump(item.geometry, item.colors);
    const root = this._root.createChild(`${item.entry.id} population source`);
    root.isActive = false;
    root.transform.setPosition(...item.position);
    root.transform.setRotation(0, item.entry.instanceVariation?.yawDegrees ?? 0, 0);
    const scale = item.entry.instanceScale ?? [1, 1, 1];
    root.transform.setScale(
      ...(scale.map((v) => v * VEGETATION_AUTHORING_REFERENCE_SCALE) as [number, number, number])
    );
    let meshes: ProceduralPlantMeshes | undefined;
    const bindings: PlantPlacementRenderer[] = [];
    try {
      meshes = uploadProceduralPlantGeometry(root.engine, compiled.geometry, { normalMapped: this._normalMapped });
      for (const part of meshes.parts) {
        const binding = compiled.bindings.get(part.materialId)!;
        const renderer = root.createChild(part.partId).addComponent(MeshRenderer);
        renderer.mesh = part.mesh;
        renderer.setMaterial(item.materials.get(binding.materialId)!);
        configureAssetAssemblyRendererInstance(renderer);
        renderer.shaderData.setVector4("renderer_AssetAssemblyColor", new Vector4(...binding.color, 1));
        renderer.castShadows = this._shadows;
        renderer.receiveShadows = true;
        bindings.push({ renderer, materialId: item.entry.materialAliases?.[binding.materialId] ?? binding.materialId });
      }
      this._populationSources.set(item.entry.id, { root, meshes, bindings });
      return bindings;
    } catch (error) {
      root.destroy();
      meshes?.destroy();
      throw error;
    }
  }

  private _clearPopulationSources(): void {
    for (const source of this._populationSources.values()) {
      source.root.destroy();
      source.meshes.destroy();
    }
    this._populationSources.clear();
  }

  registerStands(stands: readonly PlantExhibitionStand[]): void {
    const ids = [...this._specimens.map((item) => item.entry.id), ...stands.map((item) => item.entry.id)];
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate exhibition stand identity");
    this._external = stands;
    this._labels?.destroy();
    this._labels = new AssetStageLabels(
      this._root,
      this._camera,
      ids.map((id) => ({ id, text: "", x: 0 }))
    );
    this.relayout();
  }

  /** One measured layout owns every vegetation source, including the editable production recipes. */
  relayout(): void {
    this._layout(this._specimens);
    for (const item of this._specimens)
      for (const entity of this._instanceEntities.get(item.entry.id) ?? [])
        entity.transform.setPosition(...item.position);
    this._updateLabels();
    this.setVisible(this._root.isActive);
    this._syncDrawCallTargets();
  }

  setVisible(visible: boolean): void {
    this._root.isActive = visible;
    for (const stand of this._external)
      stand.setVisible(
        visible && stand.isEnabled?.() !== false && (!this._category || stand.entry.category === this._category)
      );
  }

  setCategory(category: string): void {
    if (category && !this.entries.some((entry) => entry.category === category))
      throw new Error(`Unknown plant category: ${category}`);
    if (category === this._category) return;
    this._replaceBatches(this._specimens, category);
    this._category = category;
    for (const entry of this.entries) this._labels?.setLabelVisible(entry.id, !category || entry.category === category);
    this.setVisible(this._root.isActive);
  }

  setShadows(enabled: boolean): void {
    this._shadows = enabled;
    for (const batch of this._batches) for (const renderer of batch.renderers) renderer.castShadows = enabled;
  }

  /** Keeps only the selected LOD on the GPU; the last authored level is retained for shorter LOD chains. */
  async setLod(lod: number): Promise<void> {
    const count = Math.max(...this._specimens.map((item) => item.asset.geometryLods.length));
    if (!Number.isInteger(lod) || lod < 0 || lod >= count) throw new RangeError("Unavailable plant LOD");
    if (this._changingLod) throw new Error("Plant LOD update is already in progress");
    if (this._specimens.every((item) => item.lod === Math.min(lod, item.asset.geometryLods.length - 1))) return;
    this._changingLod = true;
    const previousExternalBounds = this._external.map((stand) => stand.getBounds());
    const previousRows = this._rows;
    try {
      const next = this._specimens.map((item) => ({ ...item }));
      const shared = new Map<ProceduralPlantAsset, ReturnType<typeof compileSpecimen>>();
      for (const item of next) {
        if (this._destroyed) return;
        const nextLod = Math.min(lod, item.asset.geometryLods.length - 1);
        if (item.lod === nextLod) continue;
        let compiled = shared.get(item.asset);
        if (!compiled) shared.set(item.asset, (compiled = compileSpecimen(item.asset, nextLod)));
        Object.assign(item, instantiateSpecimen(compiled, item.entry), { lod: nextLod });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (this._destroyed) return;
      this._layout(next);
      // Publish only a complete generation. On failure the previous LOD and all
      // its GPU resources stay usable; partially built batches are released.
      this._replaceBatches(next, this._category);
      this._specimens.splice(0, this._specimens.length, ...next);
      this._updateLabels();
    } catch (error) {
      this._rows = previousRows;
      this._external.forEach((stand, index) => {
        const current = stand.getBounds(),
          previous = previousExternalBounds[index];
        stand.translate(previous.min[0] - current.min[0], previous.min[2] - current.min[2]);
      });
      throw error;
    } finally {
      this._changingLod = false;
    }
  }

  getBounds(id?: string): AssetAssemblyStandBounds {
    const items = this._specimens.filter((item) =>
      id ? item.entry.id === id : !this._category || item.entry.category === this._category
    );
    const external = this._external.filter(
      (item) =>
        item.isEnabled?.() !== false &&
        (id ? item.entry.id === id : !this._category || item.entry.category === this._category)
    );
    if (!items.length && !external.length) throw new Error(`Plant bounds unavailable: ${id ?? this._category}`);
    return unionBounds([...items.map((item) => item.bounds), ...external.map((item) => item.getBounds())]);
  }

  getRowBounds(id: string): AssetAssemblyStandBounds {
    const row = this._rows.find((row) => row.placements.some((item) => item.id === id));
    if (!row) throw new Error(`Plant row unavailable: ${id}`);
    return unionBounds(row.placements.map((item) => this.getBounds(item.id)));
  }

  getDrawCalls() {
    return this._drawCalls!.getSnapshot();
  }

  onDrawCallsChanged(listener: () => void): () => void {
    return this._drawCalls!.subscribe(listener);
  }

  getDiagnostics() {
    const included = this._specimens.filter((item) => !this._category || item.entry.category === this._category);
    return {
      assetCount: this.entries.length,
      visibleCount: this._root.isActive
        ? this.entries.filter((entry) => !this._category || entry.category === this._category).length
        : 0,
      acceptedCount: this.entries.filter((entry) => entry.geometryAccepted).length,
      editedCount: this._specimens.filter((item) => item.entry.geometryEdited).length,
      category: this._category,
      rows: this._rows.map((row) => ({
        id: row.id,
        baseId: row.baseId,
        instanceIds: row.placements.slice(1).map((p) => p.id)
      })),
      referenceScale: VEGETATION_AUTHORING_REFERENCE_SCALE,
      changingLod: this._changingLod,
      drawCalls: this.getDrawCalls(),
      bounds: this.getBounds(),
      // Compatible Mesh/Material groups before culling. The Engine's ordering,
      // instance-buffer capacity and additional passes determine actual GPU draws.
      batching: {
        mode: "gpu-instancing" as const,
        rendererCount: this._batches.reduce((sum, batch) => sum + batch.renderers.length, 0),
        materialCount: new Set(this._batches.map((batch) => batch.material)).size,
        meshCount: this._meshes?.parts.length ?? 0,
        compatibleGroupCount: this._batches.length,
        instancedGroupCount: this._batches.filter((batch) => batch.renderers.length > 1).length,
        batches: this._batches.map(({ id, material, assetIds, triangleCount, renderers }) => ({
          id,
          materialName: material.name,
          assetIds,
          triangleCount,
          instanceCount: renderers.length
        }))
      },
      specimens: [
        ...this._specimens.map((item) => ({
          id: item.entry.id,
          displayName: item.entry.displayName ?? item.entry.id,
          external: false,
          prototypeId: item.entry.prototypeId,
          instanceScale: item.entry.instanceScale ?? [1, 1, 1],
          instanceVariation: item.entry.instanceVariation,
          category: item.entry.category,
          geometryAccepted: item.entry.geometryAccepted,
          geometryEdited: item.entry.geometryEdited ?? false,
          lod: item.lod,
          lodCount: item.asset.geometryLods.length,
          materialSlots: item.asset.materialSlots,
          rendererCount: included.includes(item) ? item.geometry.length : 0,
          batchIds: this._batches.filter((batch) => batch.assetIds.includes(item.entry.id)).map((batch) => batch.id),
          triangleCount: item.geometry.reduce((sum, part) => sum + part.mesh.triangleCount, 0),
          bounds: item.bounds,
          visible: this._root.isActive && included.includes(item)
        })),
        ...this._external
          .filter((stand) => stand.isEnabled?.() !== false)
          .map((stand) => ({
            id: stand.entry.id,
            displayName: stand.entry.displayName ?? stand.entry.id,
            external: true,
            prototypeId: stand.entry.prototypeId,
            instanceScale: stand.entry.instanceScale ?? [1, 1, 1],
            category: stand.entry.category,
            geometryAccepted: stand.entry.geometryAccepted,
            geometryEdited: false,
            lod: 0,
            lodCount: 1,
            materialSlots: {},
            rendererCount: 0,
            batchIds: [] as string[],
            triangleCount: stand.getTriangleCount(),
            bounds: stand.getBounds(),
            visible: this._root.isActive && (!this._category || stand.entry.category === this._category)
          }))
      ]
    };
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._drawCalls?.destroy();
    this._clearPopulationSources();
    this._populationOwners = [];
    this._labels?.destroy();
    this._root.destroy();
    this._meshes?.destroy();
    this._batches.length = 0;
    this._specimens.length = 0;
  }

  private _replaceBatches(specimens: readonly Specimen[], category: string): void {
    // Keep vertices in specimen space. Sharing is based on complete GPU attributes,
    // never just a material/shape name; different silhouettes remain different meshes.
    const geometry: PlantPartMesh[] = [];
    const shared = new Map<string, number>();
    const instances: { item: Specimen; part: PlantRenderPart; meshIndex: number }[] = [];
    for (const item of specimens) {
      if (category && item.entry.category !== category) continue;
      for (const part of item.geometry) {
        if (!part.mesh.indices.length) continue;
        const key = plantMeshGeometryKey(part.mesh, this._normalMapped);
        let meshIndex = shared.get(key);
        if (meshIndex === undefined) {
          meshIndex = geometry.length;
          shared.set(key, meshIndex);
          geometry.push({
            ...part,
            mesh: {
              ...part.mesh,
              bounds: plantRenderBounds(part.mesh, item.entry, part.instance, isFlowerSpecimen(item.asset))
            }
          });
        } else if (part.mesh.leafFrames || part.mesh.windFrames) {
          const current = geometry[meshIndex];
          const bounds = plantRenderBounds(part.mesh, item.entry, part.instance, isFlowerSpecimen(item.asset));
          geometry[meshIndex] = {
            ...current,
            mesh: {
              ...current.mesh,
              bounds: [
                current.mesh.bounds[0].map((v, axis) => Math.min(v, bounds[0][axis])) as unknown as PlantPoint,
                current.mesh.bounds[1].map((v, axis) => Math.max(v, bounds[1][axis])) as unknown as PlantPoint
              ]
            }
          };
        }
        instances.push({ item, part, meshIndex });
      }
    }
    const entities = new Map<string, Entity[]>();
    const root = this._root.createChild("Plant GPU instances");
    root.isActive = false;
    let meshes: ProceduralPlantMeshes | undefined;
    const groups = new Map<
      string,
      { material: Material; assetIds: Set<string>; triangleCount: number; renderers: MeshRenderer[] }
    >();
    const owners: { assetId: string; renderer: MeshRenderer; materialId: string }[] = [];
    try {
      meshes = uploadProceduralPlantGeometry(root.engine, geometry, { normalMapped: this._normalMapped });
      for (const { item, part, meshIndex } of instances) {
        const material = item.materials.get(part.materialId)!;
        let parent = entities.get(item.entry.id)?.[0];
        if (!parent) {
          parent = root.createChild(item.entry.id);
          entities.set(item.entry.id, [parent]);
          parent.transform.setPosition(...item.position);
          parent.transform.setRotation(0, item.entry.instanceVariation?.yawDegrees ?? 0, 0);
          const scale = item.entry.instanceScale ?? [1, 1, 1];
          parent.transform.setScale(
            scale[0] * VEGETATION_AUTHORING_REFERENCE_SCALE,
            scale[1] * VEGETATION_AUTHORING_REFERENCE_SCALE,
            scale[2] * VEGETATION_AUTHORING_REFERENCE_SCALE
          );
        }
        const entity = parent.createChild(part.partId);
        if (part.instance) entity.transform.localMatrix = new Matrix().copyFromArray(part.instance.transform);
        const renderer = entity.addComponent(MeshRenderer);
        renderer.mesh = meshes.parts[meshIndex].mesh;
        renderer.setMaterial(material);
        configureAssetAssemblyRendererInstance(renderer);
        if (part.mesh.canopyOpticalDepths)
          renderer.shaderData.enableMacro("RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION");
        const variation = item.entry.instanceVariation;
        let color = part.instance?.color ?? item.colors.get(part.materialId)!;
        if (part.mesh.leafFrames) {
          color = variation?.leafColor ?? color;
          renderer.shaderData.enableMacro("RENDERER_PROCEDURAL_TREE_GPU_VARIATION");
          renderer.shaderData.setVector4(
            "renderer_ProceduralTreeVariation",
            new Vector4(1, variation?.leafDensity ?? 1, variation?.leafSize ?? 1, 0)
          );
          renderer.shaderData.setVector4("renderer_ProceduralTreeBranchShape", new Vector4(0, 1, 1, 0));
          renderer.shaderData.setVector4("renderer_ProceduralTreeLeafColor", new Vector4(...color, 1));
        } else if (variation && /^(bark|wood)([_.]\d+)?$/i.test(item.asset.materialSlots[part.materialId])) {
          color = color.map((v, axis) => v * variation.barkTint[axis]) as unknown as PlantPoint;
        }
        renderer.shaderData.setVector4("renderer_AssetAssemblyColor", new Vector4(...color, 1));
        renderer.castShadows = this._shadows;
        renderer.receiveShadows = true;
        owners.push({
          assetId: item.entry.id,
          renderer,
          materialId: item.entry.materialAliases?.[part.materialId] ?? part.materialId
        });
        const id = `mesh-${meshIndex}/material-${material.instanceId}`;
        let group = groups.get(id);
        if (!group) groups.set(id, (group = { material, assetIds: new Set(), triangleCount: 0, renderers: [] }));
        group.assetIds.add(item.entry.id);
        group.triangleCount += part.mesh.triangleCount;
        group.renderers.push(renderer);
      }
    } catch (error) {
      root.destroy();
      meshes?.destroy();
      throw error;
    }
    this._clearPopulationSources();
    this._batchRoot?.destroy();
    this._meshes?.destroy();
    this._batchRoot = root;
    this._instanceEntities = entities;
    this._meshes = meshes;
    this._batches = [...groups].map(([id, group]) => ({ ...group, id, assetIds: [...group.assetIds] }));
    this._owners = owners;
    this._syncDrawCallTargets();
    root.isActive = true;
  }

  private _syncDrawCallTargets(): void {
    this._drawCalls?.setRenderers(
      this.entries.map((entry) => entry.id),
      [...this._owners, ...this._populationOwners],
      this._external
        .filter((stand) => stand.isEnabled?.() !== false)
        .map((stand) => ({ assetId: stand.entry.id, getRenderers: () => stand.getRenderers() })),
      this._rows.map((row) => ({ id: row.id, assetIds: row.placements.map((member) => member.id) }))
    );
  }

  private _layout(specimens: readonly Specimen[]): void {
    const members = [
      ...specimens.map((item) => ({
        entry: item.entry,
        bounds: item.localBounds,
        place: (x: number, z: number, clearance: number) => {
          item.position = [x, 0, z];
          item.labelClearance = clearance;
          item.bounds = translateBounds(item.localBounds, x, z);
        }
      })),
      ...this._external
        .filter((stand) => stand.isEnabled?.() !== false)
        .map((stand) => ({
          entry: stand.entry,
          bounds: stand.getBounds(),
          place: (x: number, z: number, _clearance: number) => stand.translate(x, z)
        }))
    ];
    this._rows = layoutPlantExhibitionRows(
      members.map(({ entry, bounds }) => ({
        id: entry.id,
        rowId: plantExhibitionBaseId(entry),
        order: entry.exhibitionOrder ?? entry.instanceScale?.reduce((sum, v) => sum + Math.abs(Math.log(v)), 0) ?? 0,
        bounds
      })),
      ASSET_STAGE_CLEARANCE
    );
    const byId = new Map(members.map((item) => [item.entry.id, item]));
    for (const row of this._rows)
      for (const placement of row.placements)
        byId.get(placement.id)!.place(placement.x, placement.z, placement.clearance);
  }

  private _updateLabels(): void {
    const bases = new Set(this._rows.map((row) => row.baseId));
    for (const item of this._specimens) {
      const clearance = item.labelClearance;
      this._labels?.setPosition(
        item.entry.id,
        (item.bounds.min[0] + item.bounds.max[0]) / 2,
        item.bounds.max[2] + clearance / 2
      );
      this._labels?.setLabelScale(item.entry.id, clearance / ASSET_STAGE_CLEARANCE);
      this._labels?.setText(
        item.entry.id,
        `${bases.has(item.entry.id) ? "基础" : "实例"} · ${item.entry.displayName ?? item.entry.id} · LOD${item.lod}${item.entry.geometryEdited ? " · 已调整" : item.entry.geometryAccepted ? "" : " · 待修正"}`
      );
    }
    for (const stand of this._external) {
      const bounds = stand.getBounds();
      this._labels?.setPosition(
        stand.entry.id,
        (bounds.min[0] + bounds.max[0]) / 2,
        bounds.max[2] + ASSET_STAGE_CLEARANCE / 2
      );
      this._labels?.setText(
        stand.entry.id,
        `${bases.has(stand.entry.id) ? "基础" : "实例"} · ${stand.entry.displayName ?? stand.entry.id}`
      );
      this._labels?.setLabelVisible(
        stand.entry.id,
        stand.isEnabled?.() !== false && (!this._category || stand.entry.category === this._category)
      );
    }
    for (const entry of this.entries)
      this._labels?.setLabelVisible(entry.id, !this._category || entry.category === this._category);
  }
}

/** Static component assembly, preserving affine shear, inverse-transpose normals, UVs and per-part colours.
 * Mechanical leaf/wind frames require their own transform semantics and must remain component instances. */
export function compileStaticPlantClump(parts: readonly PlantRenderPart[], colors: ReadonlyMap<string, PlantPoint>) {
  const bindings = new Map<string, { materialId: string; color: PlantPoint }>();
  const geometry = parts.map((part) => {
    if (part.mesh.leafFrames || part.mesh.windFrames) throw new Error("Cannot compact dynamic plant frames");
    const color = part.instance?.color ?? colors.get(part.materialId);
    if (!color) throw new Error(`Missing plant colour: ${part.materialId}`);
    const key = JSON.stringify([part.materialId, color]);
    bindings.set(key, { materialId: part.materialId, color });
    const transform = part.instance ? new Matrix().copyFromArray(part.instance.transform) : new Matrix();
    const normalMatrix = transform.clone().invert().transpose();
    const position = new Vector3(),
      normal = new Vector3();
    const positions = part.mesh.positions.map((p) => {
      Vector3.transformCoordinate(position.set(...p), transform, position);
      return [position.x, position.y, position.z] as const;
    });
    const normals = part.mesh.normals.map((n) => {
      Vector3.transformNormal(normal.set(...n), normalMatrix, normal);
      normal.normalize();
      return [normal.x, normal.y, normal.z] as const;
    });
    const indices =
      transform.determinant() < 0
        ? part.mesh.indices.map(
            (_, index) => part.mesh.indices[index - (index % 3) + (index % 3 === 0 ? 0 : 3 - (index % 3))]
          )
        : part.mesh.indices;
    return { materialId: key, partId: part.partId, mesh: { ...part.mesh, positions, normals, indices } };
  });
  return { geometry: mergePlantGeometryByMaterial(geometry), bindings };
}

function translateBounds(bounds: AssetAssemblyStandBounds, x: number, z: number): AssetAssemblyStandBounds {
  return {
    min: [bounds.min[0] + x, bounds.min[1], bounds.min[2] + z],
    max: [bounds.max[0] + x, bounds.max[1], bounds.max[2] + z]
  };
}

// ResourceManager retains one decoded asset across populations/LODs. The quadratic
// reference-crown solve belongs to resource preparation, never to each tree or frame.
const canopyReferences = new WeakMap<ProceduralPlantAsset, { parts: readonly PlantPartMesh[]; windHeight: number }>();

function isFlowerSpecimen(asset: ProceduralPlantAsset): boolean {
  return Object.values(asset.materialSlots).some((name) => /^flowers([_.]\d+)?$/i.test(name));
}

function compileSpecimen(asset: ProceduralPlantAsset, lod: number) {
  const leaves = new Set(
    Object.entries(asset.materialSlots)
      .filter(([, name]) => asset.category === "Trees" && !/^(bark|wood)([_.]\d+)?$/i.test(name))
      .map(([id]) => id)
  );
  // LOD must not change the mechanical stiffness or the tree's phase.
  let reference = canopyReferences.get(asset);
  const flower = isFlowerSpecimen(asset);
  if ((asset.category === "Trees" || flower) && !reference) {
    const windHeight = Math.max(
      ...buildProceduralPlantGeometry(asset.geometryLods[0], 0).map(({ mesh }) => mesh.bounds[1][1])
    );
    const parts = buildProceduralPlantGeometry(
      asset.geometryLods[0],
      0,
      leaves,
      windHeight,
      flower ? "flower" : "tree",
      flower ? TERRAIN_FLOWER_WIND_RESPONSE_PROFILE.maximumBendRadians : 0
    );
    reference = { windHeight, parts: flower ? parts : attachPlantCanopyOpticalDepth(parts, leaves) };
    canopyReferences.set(asset, reference);
  }
  const parts =
    lod === 0 && reference
      ? reference.parts
      : buildProceduralPlantGeometry(
          asset.geometryLods[lod],
          0,
          leaves,
          reference?.windHeight,
          flower ? "flower" : "tree",
          flower ? TERRAIN_FLOWER_WIND_RESPONSE_PROFILE.maximumBendRadians : 0
        );
  const geometry = mergePlantGeometryByMaterial(
    reference && !flower && lod !== 0 ? attachPlantCanopyOpticalDepth(parts, leaves, reference.parts) : parts
  );
  const scale = VEGETATION_AUTHORING_REFERENCE_SCALE;
  const localBounds = unionBounds(
    geometry.map(({ mesh }) => ({
      min: mesh.bounds[0].map((v) => v * scale) as [number, number, number],
      max: mesh.bounds[1].map((v) => v * scale) as [number, number, number]
    }))
  );
  return { geometry, localBounds, lod };
}

function instantiateSpecimen(base: ReturnType<typeof compileSpecimen>, entry: ProceduralPlantLibraryEntry) {
  const geometry: readonly PlantRenderPart[] = entry.geometryInstances
    ? entry.geometryInstances
        .filter((instance) => !instance.lods || instance.lods.includes(base.lod))
        .flatMap((instance, index) =>
          base.geometry
            .filter((part) => part.materialId === instance.materialId)
            .map((part) => ({ ...part, partId: `${part.partId}/${index}`, instance }))
        )
    : base.geometry;
  const localBounds = unionBounds(
    geometry.map(({ mesh, instance }) => {
      const m = instance?.transform;
      const scale = entry.instanceScale ?? [1, 1, 1];
      const angle = ((entry.instanceVariation?.yawDegrees ?? 0) * Math.PI) / 180;
      const [min, max] = leafInstanceBounds(mesh, entry, instance);
      const positions = [min[0], max[0]].flatMap((x) =>
        [min[1], max[1]].flatMap((y) =>
          [min[2], max[2]].map((z) => {
            const p = m
              ? [
                  m[0] * x + m[4] * y + m[8] * z + m[12],
                  m[1] * x + m[5] * y + m[9] * z + m[13],
                  m[2] * x + m[6] * y + m[10] * z + m[14]
                ]
              : [x, y, z];
            const sx = p[0] * scale[0],
              sz = p[2] * scale[2];
            return [
              sx * Math.cos(angle) + sz * Math.sin(angle),
              p[1] * scale[1],
              -sx * Math.sin(angle) + sz * Math.cos(angle)
            ];
          })
        )
      );
      return {
        min: [0, 1, 2].map(
          (axis) => Math.min(...positions.map((p) => p[axis])) * VEGETATION_AUTHORING_REFERENCE_SCALE
        ) as [number, number, number],
        max: [0, 1, 2].map(
          (axis) => Math.max(...positions.map((p) => p[axis])) * VEGETATION_AUTHORING_REFERENCE_SCALE
        ) as [number, number, number]
      };
    })
  );
  return { geometry, localBounds };
}

/** Same leaf-pivot scale as the fixed-leaf shader, including compensation for nonuniform trunks.
 * Include every leaf in culling bounds, even when instance density hides it. */
function leafInstanceBounds(
  mesh: PlantMeshData,
  entry: ProceduralPlantLibraryEntry,
  instance?: PlantGeometryInstance
): readonly [PlantPoint, PlantPoint] {
  if (!mesh.leafFrames) return mesh.bounds;
  const scale = entry.instanceScale ?? [1, 1, 1];
  const m = instance?.transform;
  const finalScale = m
    ? [0, 4, 8].map((offset) => Math.hypot(m[offset] * scale[0], m[offset + 1] * scale[1], m[offset + 2] * scale[2]))
    : scale;
  const factor = finalScale.map((v) => (finalScale[1] / v) * (entry.instanceVariation?.leafSize ?? 1));
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  mesh.positions.forEach((p, index) => {
    const pivot = mesh.leafFrames![index];
    for (let axis = 0; axis < 3; axis++) {
      const v = pivot[axis] + (p[axis] - pivot[axis]) * factor[axis];
      min[axis] = Math.min(min[axis], v, pivot[axis]);
      max[axis] = Math.max(max[axis], v, pivot[axis]);
    }
  });
  return [min, max];
}

/** Renderer bounds include both rotations; exhibition spacing stays based on the rest silhouette. */
function plantRenderBounds(
  mesh: PlantMeshData,
  entry: ProceduralPlantLibraryEntry,
  instance?: PlantGeometryInstance,
  flower = false
): readonly [PlantPoint, PlantPoint] {
  const bounds = leafInstanceBounds(mesh, entry, instance);
  if (!mesh.windFrames) return bounds;
  const scale = entry.instanceScale ?? [1, 1, 1];
  const m = instance?.transform;
  const finalScale = m
    ? ([0, 4, 8].map((offset) =>
        Math.hypot(m[offset] * scale[0], m[offset + 1] * scale[1], m[offset + 2] * scale[2])
      ) as [number, number, number])
    : scale;
  const leafFactor = finalScale.map((v) => (finalScale[1] / v) * (entry.instanceVariation?.leafSize ?? 1));
  let radius = 0;
  if (mesh.leafFrames)
    mesh.positions.forEach((p, index) => {
      radius = Math.max(
        radius,
        Math.hypot(...p.map((v, axis) => (v - mesh.leafFrames![index][axis]) * leafFactor[axis]))
      );
    });
  // Integrating a beam whose tangent turns by at most theta moves each section by at
  // most 2 * arcLength * sin(theta/2); the same bound covers its rigid radial offset.
  const flowerRadius = flower
    ? Math.max(
        ...mesh.positions.map((p, index) => {
          const h = mesh.windFrames![index][1];
          return h + Math.hypot(p[0], p[1] - h, p[2]);
        })
      )
    : 0;
  const margin = flower
    ? 2 * flowerRadius * Math.sin(TERRAIN_FLOWER_WIND_RESPONSE_PROFILE.maximumBendRadians / 2)
    : resolveProceduralTreeWindBoundsMargin(bounds[0], bounds[1], radius);
  const compensation = resolveProceduralTreeWindScaleCompensation([finalScale]);
  return [
    bounds[0].map((v, axis) => v - margin * compensation[axis]) as unknown as PlantPoint,
    bounds[1].map((v, axis) => v + margin * compensation[axis]) as unknown as PlantPoint
  ];
}

function unionBounds(bounds: readonly AssetAssemblyStandBounds[]): AssetAssemblyStandBounds {
  if (!bounds.length) throw new Error("Plant has no generated geometry");
  return {
    min: [0, 1, 2].map((axis) => Math.min(...bounds.map((b) => b.min[axis]))) as [number, number, number],
    max: [0, 1, 2].map((axis) => Math.max(...bounds.map((b) => b.max[axis]))) as [number, number, number]
  };
}
