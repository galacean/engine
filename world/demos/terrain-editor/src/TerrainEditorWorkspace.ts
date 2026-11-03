import {
  indexTerrainProjectArtifact,
  type TerrainProjectArtifactEntries
} from "@galacean/engine-terrain/terrain/project/TerrainProjectArtifactAssembler";
import {
  encodeTerrainCanonicalJson,
  hashTerrainProjectClosure,
  importTerrainProject,
  sha256TerrainBytes,
  validateTerrainProjectWorld
} from "@galacean/engine-terrain/terrain/project/TerrainProjectCodec";
import {
  TERRAIN_WORLD_INDEX_PATH,
  TERRAIN_RASTER_LAYOUT,
  getTerrainProjectHoleSampleSize,
  type TerrainProjectDetailPrototype,
  type TerrainProjectDocument,
  type TerrainProjectFile,
  type TerrainProjectLayer,
  type TerrainProjectPlacedPrefabPrototype,
  type TerrainProjectPlacedPrefabInstance,
  type TerrainProjectSeamSide,
  type TerrainProjectTreeInstance,
  type TerrainProjectTreePrototype,
  type TerrainProjectWorldIndex
} from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";
import {
  applyTerrainHeightBrush,
  createTerrainHeightBrushSession,
  resampleTerrainHeightBrushPath,
  terrainHeightBrushDeltaAt,
  validateTerrainHeightBrushStroke,
  type TerrainHeightBrushPatch,
  type TerrainHeightBrushPoint,
  type TerrainHeightBrushSampleChange,
  type TerrainHeightBrushSession,
  type TerrainHeightBrushSessionSettings,
  type TerrainHeightBrushStroke
} from "./TerrainHeightBrush.ts";
import {
  decodeTerrainHeightSample,
  encodeTerrainHeightMetres,
  sampleTerrainDocumentHeight
} from "@galacean/engine-world-planning/authoring/terrain/TerrainHeightfield";
import {
  applyTerrainDetailBrush,
  applyTerrainTextureBrush,
  applyTerrainTreeBrush,
  createTerrainDetailBrushSession,
  createTerrainObjectBrushSession,
  createTerrainTextureBrushSession,
  createTerrainTreeBrushSession,
  type TerrainAlphamapChanges,
  type TerrainByteChange,
  type TerrainDetailBrushResult,
  type TerrainDetailBrushSession,
  type TerrainDetailBrushStroke,
  type TerrainObjectBrushResult,
  type TerrainObjectBrushSession,
  type TerrainObjectBrushStroke,
  type TerrainSurfaceBrushPoint,
  type TerrainTextureBrushPatch,
  type TerrainTextureBrushSession,
  type TerrainTextureBrushStroke,
  type TerrainTreeBrushResult,
  type TerrainTreeBrushSession,
  type TerrainTreeBrushStroke
} from "./TerrainSurfaceBrush.ts";
import {
  prepareTerrainEditorPrototypeAsset,
  prepareTerrainEditorTextureAsset,
  type TerrainEditorUploadedFile
} from "./TerrainEditorAssetImport.ts";
import {
  readTerrainEditorSceneSettings,
  writeTerrainEditorSceneSettings,
  type TerrainEditorSceneSettings,
  type TerrainEditorSceneSettingsState
} from "./TerrainEditorSceneSettings.ts";
import {
  buildTerrainEditorAssetCatalog,
  resolveTerrainEditorAssetId,
  type TerrainEditorAssetCatalog,
  type TerrainEditorAssetCatalogEntry
} from "./TerrainEditorAssetCatalog.ts";

const SEAM_POSITION_EPSILON_METRES = 1e-7;
const ARTIFACT_CACHE_STATE_LIMIT = 2;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Sparse exact changes for one Region within an atomic height command. */
export interface TerrainHeightRegionCommand {
  /** Stable canonical Region id. */
  readonly regionId: string;
  /** Changed R16 samples in ascending row-major order. */
  readonly changes: readonly TerrainHeightBrushSampleChange[];
  /** Tree instance Y coordinates resampled from the edited heightfield. */
  readonly treeHeightChanges: readonly TerrainSurfaceHeightChange[];
  /** Exact Detail transform Y coordinates resampled from the edited heightfield. */
  readonly detailHeightChanges: readonly TerrainDetailHeightChanges[];
  /** Ordinary placed-Prefab Y coordinates resampled from the edited heightfield. */
  readonly objectHeightChanges: readonly TerrainSurfaceHeightChange[];
}

/** One sparse surface-instance Y-coordinate change caused by a height edit. */
export interface TerrainSurfaceHeightChange {
  /** Stable instance or transform-record index within its canonical array. */
  readonly index: number;
  /** Local Y coordinate before the height edit. */
  readonly before: number;
  /** Local Y coordinate after the height edit. */
  readonly after: number;
}

/** Sparse height-dependent Detail placement changes for one prototype. */
export interface TerrainDetailHeightChanges {
  /** Stable Detail prototype id owning the exact transforms. */
  readonly prototypeId: string;
  /** Changed transform-record Y coordinates in ascending record order. */
  readonly changes: readonly TerrainSurfaceHeightChange[];
}

/** One complete cross-Region stroke stored by undo and redo history. */
export interface TerrainHeightCommand {
  /** Stable command capability. */
  readonly kind: "height";
  /** Changed Regions sorted by stable id; unaffected Regions are absent. */
  readonly regions: readonly TerrainHeightRegionCommand[];
}

/** Sparse Alphamap changes for one Region within an atomic texture stroke. */
export interface TerrainTextureRegionCommand {
  /** Stable canonical Region id. */
  readonly regionId: string;
  /** Changed physical Alphamaps in ascending index order. */
  readonly maps: readonly TerrainAlphamapChanges[];
}

/** One complete cross-Region TerrainLayer stroke. */
export interface TerrainTextureCommand {
  /** Stable command capability. */
  readonly kind: "texture";
  /** Changed Regions sorted by stable id. */
  readonly regions: readonly TerrainTextureRegionCommand[];
}

/** Exact Detail changes for one Region within an atomic density stroke. */
export interface TerrainDetailRegionCommand {
  /** Stable canonical Region id. */
  readonly regionId: string;
  /** Stable Detail prototype id. */
  readonly prototypeId: string;
  /** Changed density bytes in ascending order. */
  readonly changes: readonly TerrainByteChange[];
  /** Prototype metadata before the stroke. */
  readonly beforePrototype: TerrainProjectDetailPrototype;
  /** Prototype metadata after the stroke. */
  readonly afterPrototype: TerrainProjectDetailPrototype;
  /** Exact placements before the stroke, when declared. */
  readonly beforeTransforms?: Float32Array;
  /** Exact placements after the stroke, when declared. */
  readonly afterTransforms?: Float32Array;
}

/** One complete cross-Region Detail density stroke. */
export interface TerrainDetailCommand {
  /** Stable command capability. */
  readonly kind: "detail";
  /** Changed Regions sorted by stable id. */
  readonly regions: readonly TerrainDetailRegionCommand[];
}

/** Exact tree-instance list replacement for one changed Region. */
export interface TerrainTreeRegionCommand {
  /** Stable canonical Region id. */
  readonly regionId: string;
  /** Explicit instances before the stroke. */
  readonly before: readonly TerrainProjectTreeInstance[];
  /** Explicit instances after the stroke. */
  readonly after: readonly TerrainProjectTreeInstance[];
}

/** One complete cross-Region tree placement or erase stroke. */
export interface TerrainTreeCommand {
  /** Stable command capability. */
  readonly kind: "tree";
  /** Changed Regions sorted by stable id. */
  readonly regions: readonly TerrainTreeRegionCommand[];
}

/** Exact ordinary placed-Prefab list replacement for one changed Region. */
export interface TerrainObjectRegionCommand {
  /** Stable canonical Region id. */
  readonly regionId: string;
  /** Explicit ordinary Prefab instances before the stroke. */
  readonly before: readonly TerrainProjectPlacedPrefabInstance[];
  /** Explicit ordinary Prefab instances after the stroke. */
  readonly after: readonly TerrainProjectPlacedPrefabInstance[];
}

/** One complete cross-Region ordinary object placement or erase stroke. */
export interface TerrainObjectCommand {
  /** Stable command capability. */
  readonly kind: "object";
  /** Changed Regions sorted by stable id. */
  readonly regions: readonly TerrainObjectRegionCommand[];
}

/** Atomic command supported by editor undo, redo, and verified publication. */
export type TerrainEditorCommand =
  | TerrainHeightCommand
  | TerrainTextureCommand
  | TerrainDetailCommand
  | TerrainTreeCommand
  | TerrainObjectCommand;

interface TerrainEditorHistoryEntry {
  readonly command: TerrainEditorCommand;
  readonly beforeState: number;
  readonly afterState: number;
}

/** Lightweight immutable metadata for one Region rail entry. */
export interface TerrainEditorRegionMetadata {
  /** Stable canonical Region id. */
  readonly id: string;
  /** Independent world-space Region origin. */
  readonly worldPosition: readonly [x: number, y: number, z: number];
  /** Independent world-space Region extent. */
  readonly worldSize: readonly [x: number, y: number, z: number];
  /** Independent `[width,height]` height sample count. */
  readonly sampleSize: readonly [width: number, height: number];
  /** Whether current R16 samples differ from the imported artifact. */
  readonly dirty: boolean;
}

/** Borrowed canonical state for a synchronous production-preview refresh. */
export interface TerrainEditorBorrowedSnapshot {
  /** Monotonic revision changed by stroke, undo, and redo. */
  readonly revision: number;
  /** Frozen canonical world index owned by the workspace. */
  readonly world: Readonly<TerrainProjectWorldIndex>;
  /** Borrowed documents whose payload views must be treated as read-only. */
  readonly documents: readonly Readonly<TerrainProjectDocument>[];
}

/** Compact Region-local height rectangle used by the live production preview. */
export interface TerrainEditorHeightPatch extends TerrainHeightBrushPatch {
  /** Stable canonical Region id receiving this patch. */
  readonly regionId: string;
}

interface ActiveTerrainEditorHeightStroke {
  readonly regionId: string;
  readonly workspaceRevision: number;
  readonly settings: TerrainHeightBrushSessionSettings;
  readonly session: TerrainHeightBrushSession;
}

/** Renderer-facing update produced by one unpublished non-height brush session. */
export type TerrainEditorSurfacePreviewUpdate =
  | {
      /** Alphamap sub-rectangles uploaded directly into current Clipmap residency. */
      readonly kind: "texture";
      /** Stable Region receiving the patches. */
      readonly regionId: string;
      /** Compact current-value RGBA8 patches. */
      readonly patches: readonly TerrainTextureBrushPatch[];
    }
  | {
      /** Instance runtime receiving one unpublished working Region document. */
      readonly kind: "detail" | "tree" | "object";
      /** Stable Region receiving the instance replacement. */
      readonly regionId: string;
      /** Borrowed unpublished document; consumers must treat every view as read-only. */
      readonly document: Readonly<TerrainProjectDocument>;
    };

/** Discriminated non-height stroke accepted by the live editor session. */
export type TerrainEditorLiveSurfaceStroke =
  | ({ readonly kind: "texture" } & TerrainTextureBrushStroke)
  | ({ readonly kind: "detail" } & TerrainDetailBrushStroke)
  | ({ readonly kind: "tree" } & TerrainTreeBrushStroke)
  | ({ readonly kind: "object" } & TerrainObjectBrushStroke);

interface ActiveTerrainEditorTextureStroke {
  readonly kind: "texture";
  readonly regionId: string;
  readonly workspaceRevision: number;
  readonly session: TerrainTextureBrushSession;
}

interface ActiveTerrainEditorDetailStroke {
  readonly kind: "detail";
  readonly regionId: string;
  readonly workspaceRevision: number;
  readonly baseline: TerrainProjectDocument;
  readonly session: TerrainDetailBrushSession;
  working: TerrainProjectDocument;
}

interface ActiveTerrainEditorTreeStroke {
  readonly kind: "tree";
  readonly regionId: string;
  readonly workspaceRevision: number;
  readonly baseline: TerrainProjectDocument;
  readonly session: TerrainTreeBrushSession;
  working: TerrainProjectDocument;
}

interface ActiveTerrainEditorObjectStroke {
  readonly kind: "object";
  readonly regionId: string;
  readonly workspaceRevision: number;
  readonly baseline: TerrainProjectDocument;
  readonly session: TerrainObjectBrushSession;
  working: TerrainProjectDocument;
}

type ActiveTerrainEditorSurfaceStroke =
  | ActiveTerrainEditorTextureStroke
  | ActiveTerrainEditorDetailStroke
  | ActiveTerrainEditorTreeStroke
  | ActiveTerrainEditorObjectStroke;

/** Detached source used to generate one editor asset selector thumbnail. */
export type TerrainEditorAssetPreview =
  | {
      /** Preview capability selected from the asset's direct project declaration. */
      readonly kind: "image";
      /** Detached encoded image bytes. */
      readonly bytes: Uint8Array;
      /** Browser image MIME type inferred from the declared physical path. */
      readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
    }
  | {
      /** Preview capability backed by a Texture already resolved through the Project Scene pipeline. */
      readonly kind: "project-texture";
      /** Loaded Region owning the exact TerrainLayer binding. */
      readonly regionId: string;
      /** Region-local TerrainLayer id whose diffuse Texture is previewed. */
      readonly layerId: string;
    }
  | {
      /** Preview capability selected from the Prefab's direct mesh reference. */
      readonly kind: "model";
      /** Detached binary glTF bytes. */
      readonly bytes: Uint8Array;
      /** Binary glTF MIME type. */
      readonly mimeType: "model/gltf-binary";
      /** Exact glTF mesh keys selected by the Prefab's first authored renderer level. */
      readonly meshKeys?: readonly string[];
      /** Exact Region and prototype binding used to resolve Project Material and Shader references. */
      readonly prototypeBinding?: TerrainEditorPrototypePreviewBinding;
    };

/** Exact canonical binding required for a material-aware Prefab thumbnail. */
export interface TerrainEditorPrototypePreviewBinding {
  /** Region owning the local prototype id. */
  readonly regionId: string;
  /** Region-local prototype id. */
  readonly prototypeId: string;
  /** Runtime collection containing the prototype geometry. */
  readonly kind: "surface" | "object";
}

/**
 * Owns mutable canonical Terrain authoring state, atomic height history, and verified Project publication.
 */
export class TerrainEditorWorkspace {
  private readonly _originalPhysical: Map<string, Uint8Array>;
  private readonly _project: TerrainProjectFile;
  private readonly _world: TerrainProjectWorldIndex;
  private readonly _baselineDocuments: ReadonlyMap<string, TerrainProjectDocument>;
  private readonly _scenePhysicalPath: string;
  private _sceneSettings: TerrainEditorSceneSettingsState;
  private readonly _dirtyRegionIds = new Set<string>();
  private _documents: TerrainProjectDocument[];
  private readonly _undoStack: TerrainEditorHistoryEntry[] = [];
  private readonly _redoStack: TerrainEditorHistoryEntry[] = [];
  private readonly _artifactCache = new Map<number, Promise<TerrainProjectArtifactEntries>>();
  private _currentState = 0;
  private _nextState = 1;
  private _revision = 0;
  private _projectChanged = false;
  private _activeHeightStroke: ActiveTerrainEditorHeightStroke | null = null;
  private _activeSurfaceStroke: ActiveTerrainEditorSurfaceStroke | null = null;

  private constructor(
    physical: ReadonlyMap<string, Uint8Array>,
    project: TerrainProjectFile,
    world: TerrainProjectWorldIndex,
    documents: readonly TerrainProjectDocument[]
  ) {
    this._originalPhysical = cloneByteEntries(physical);
    this._project = cloneJson(project);
    this._world = deepFreeze(cloneJson(world));
    this._documents = documents.map(ownDocument);
    this._baselineDocuments = new Map(this._documents.map((document) => [document.descriptor.id, document] as const));
    const sceneFile = this._project.files.find((file) => file.virtualPath === this._project.scene);
    if (!sceneFile)
      throw new Error(`Terrain editor Project does not declare Scene ${JSON.stringify(this._project.scene)}`);
    const sceneBytes = this._originalPhysical.get(sceneFile.path);
    if (!sceneBytes) throw new Error(`Terrain editor Project Scene ${JSON.stringify(sceneFile.path)} is missing`);
    this._scenePhysicalPath = sceneFile.path;
    this._sceneSettings = readTerrainEditorSceneSettings(sceneBytes);
  }

  /**
   * Opens a standard physical `project.json + public` artifact through the canonical indexer and importer.
   * @param artifact Root `project.json` plus exact declared physical files.
   * @returns A workspace owning detached canonical documents.
   * @throws If paths, declarations, hashes, Regions, or explicit seams are invalid.
   */
  static async open(artifact: ReadonlyMap<string, Uint8Array>): Promise<TerrainEditorWorkspace> {
    const physical = cloneByteEntries(artifact);
    const virtual = indexTerrainProjectArtifact(physical);
    const imported = await importTerrainProject(virtual);
    return new TerrainEditorWorkspace(physical, imported.project, imported.world, imported.documents);
  }

  /** @returns Stable Region ids sorted independently of world declaration order. */
  get regionIds(): readonly string[] {
    return this._documents.map((document) => document.descriptor.id).sort(compareStableStrings);
  }

  /** @returns Sorted lightweight Region metadata without copying canonical payloads. */
  get regionMetadata(): readonly TerrainEditorRegionMetadata[] {
    return this._documents
      .map(
        (document): TerrainEditorRegionMetadata =>
          Object.freeze({
            id: document.descriptor.id,
            worldPosition: Object.freeze([...document.descriptor.worldPosition]) as readonly [number, number, number],
            worldSize: Object.freeze([...document.descriptor.worldSize]) as readonly [number, number, number],
            sampleSize: Object.freeze([...document.manifest.heightmap.sampleSize]) as readonly [number, number],
            dirty: this._dirtyRegionIds.has(document.descriptor.id)
          })
      )
      .sort((left, right) => compareStableStrings(left.id, right.id));
  }

  /** @returns Stable ids of Regions whose current R16 samples differ from import, sorted by id. */
  get dirtyRegionIds(): readonly string[] {
    return [...this._dirtyRegionIds].sort(compareStableStrings);
  }

  /** @returns Whether Project resources or Scene-wide authoring settings differ from the imported artifact. */
  get projectChanged(): boolean {
    return this._projectChanged;
  }

  /** @returns Detached global fog, lighting, and wind settings read from the standard Scene resource. */
  get sceneSettings(): TerrainEditorSceneSettingsState {
    return { ...this._sceneSettings };
  }

  /**
   * Updates global preview capabilities in the standard Scene resource without changing Terrain Region data.
   * @param settings Complete boolean fog, direct-light, environment-light, and wind state.
   * @returns Detached settings including authored restore values retained by the Scene extension.
   * @throws If a height stroke is active or the Scene resource is malformed.
   */
  updateSceneSettings(settings: TerrainEditorSceneSettings): TerrainEditorSceneSettingsState {
    this._assertNoActiveStroke();
    if (!this._sceneSettings.supported) {
      throw new Error("Terrain editor Project Scene does not expose editable environment settings");
    }
    const source = requireEntry(this._originalPhysical, this._scenePhysicalPath);
    const bytes = writeTerrainEditorSceneSettings(source, settings);
    this._originalPhysical.set(this._scenePhysicalPath, bytes);
    this._sceneSettings = readTerrainEditorSceneSettings(bytes);
    this._projectChanged = true;
    this._artifactCache.clear();
    this._currentState = this._nextState++;
    this._revision++;
    return { ...this._sceneSettings };
  }

  /** @returns A detached canonical world snapshot that cannot mutate workspace state. */
  get world(): TerrainProjectWorldIndex {
    return cloneJson(this._world);
  }

  /** @returns Detached canonical Region snapshots containing the current authoring samples. */
  get documents(): readonly TerrainProjectDocument[] {
    return this._documents.map(cloneDocument);
  }

  /** @returns Stable Project-level paint palettes independent of the selected Region. */
  get assetCatalog(): TerrainEditorAssetCatalog {
    return buildTerrainEditorAssetCatalog(this._documents);
  }

  /**
   * Resolves the directly authored image or model used to represent a layer or prototype.
   * @param resourceUrl Canonical virtual Texture, GLTF, or Prefab path selected by the editor.
   * @param prototypeBinding Optional exact Region-local binding associated with a Prefab.
   * @returns Detached preview source, or `null` when the declared asset has no previewable direct resource.
   */
  getAssetPreview(
    resourceUrl: string,
    prototypeBinding?: TerrainEditorPrototypePreviewBinding
  ): TerrainEditorAssetPreview | null {
    const declarations = new Map(this._project.files.map((file) => [file.virtualPath, file] as const));
    const declaration = declarations.get(resourceUrl);
    if (!declaration) return null;
    const bytes = this._originalPhysical.get(declaration.path);
    if (!bytes) return null;
    if (declaration.type === "Texture" || declaration.type === "KTX2") {
      for (const document of this._documents) {
        const layer = document.manifest.layers.find((candidate) => candidate.diffuse.url === resourceUrl);
        if (layer) {
          return Object.freeze({
            kind: "project-texture",
            regionId: document.descriptor.id,
            layerId: layer.id
          });
        }
      }
      const mimeType = imageMimeType(declaration.path);
      return mimeType ? Object.freeze({ kind: "image", bytes: bytes.slice(), mimeType }) : null;
    }
    if (declaration.type === "GLTF" && declaration.path.toLowerCase().endsWith(".glb")) {
      return Object.freeze({ kind: "model", bytes: bytes.slice(), mimeType: "model/gltf-binary" });
    }
    if (declaration.type !== "Prefab") return null;
    try {
      const prefab = JSON.parse(textDecoder.decode(bytes)) as TerrainEditorPreviewPrefab;
      if (!Array.isArray(prefab.refs)) return null;
      const previewMeshRefs = resolvePrefabPreviewMeshRefs(prefab);
      const usesProjectMaterials = prefab.refs.some(
        (reference) =>
          reference &&
          typeof reference === "object" &&
          typeof reference.url === "string" &&
          declarations.get(reference.url)?.type === "Material"
      );
      for (const reference of previewMeshRefs) {
        if (!reference || typeof reference !== "object") continue;
        const candidateUrl = reference.url;
        if (typeof candidateUrl !== "string") continue;
        const candidate = declarations.get(candidateUrl);
        if (!candidate || candidate.type !== "GLTF" || !candidate.path.toLowerCase().endsWith(".glb")) continue;
        const candidateBytes = this._originalPhysical.get(candidate.path);
        if (candidateBytes) {
          const meshKeys = previewMeshRefs.flatMap((entry) =>
            entry.url === candidateUrl && typeof entry.key === "string" ? [entry.key] : []
          );
          return Object.freeze({
            kind: "model",
            bytes: candidateBytes.slice(),
            mimeType: "model/gltf-binary",
            meshKeys: Object.freeze(meshKeys),
            ...(usesProjectMaterials && prototypeBinding
              ? { prototypeBinding: Object.freeze({ ...prototypeBinding }) }
              : {})
          });
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Attaches one existing Project-level paint asset to a Region that does not yet declare it.
   * @param regionId Stable target Region id.
   * @param entry Exact entry returned by {@link assetCatalog}.
   * @returns Region-local layer or prototype id used by brush data.
   * @throws If the entry is stale, its source binding is missing, or the resulting Region is invalid.
   */
  async ensureAssetInRegion(regionId: string, entry: TerrainEditorAssetCatalogEntry): Promise<string> {
    this._assertNoActiveStroke();
    const documentIndex = this._requireRegionIndex(regionId);
    const target = this._documents[documentIndex];
    const existingId = resolveTerrainEditorAssetId(target, entry);
    if (existingId) return existingId;
    const currentEntry = this.assetCatalog[assetCatalogProperty(entry.kind)].find(
      (candidate) => candidate.key === entry.key && candidate.resourceUrl === entry.resourceUrl
    );
    if (!currentEntry)
      throw new Error(`Terrain editor asset ${JSON.stringify(entry.key)} is not in the Project catalog`);
    const source = this._requireRegion(currentEntry.sourceRegionId);
    const candidates = [...this._documents];

    if (entry.kind === "texture") {
      const sourceLayer = source.manifest.layers.find(
        (layer) => layer.id === currentEntry.sourceId && layer.diffuse.url === currentEntry.resourceUrl
      );
      if (!sourceLayer) throw new Error(`Terrain editor texture source ${JSON.stringify(entry.key)} is stale`);
      const manifest = cloneJson(target.manifest);
      const alphamaps = [...target.alphamaps];
      let generatedAlphamap: { url: string; bytes: Uint8Array } | null = null;
      let targetMap = -1;
      let targetChannel = -1;
      for (let mapIndex = 0; mapIndex < manifest.alphamaps.length && targetMap < 0; mapIndex++) {
        const channel = manifest.alphamaps[mapIndex].layers.findIndex((layerId) => layerId === null);
        if (channel >= 0) {
          targetMap = mapIndex;
          targetChannel = channel;
        }
      }
      if (targetMap < 0) {
        const [width, height] = manifest.alphamaps[0]?.sampleSize ?? getTerrainProjectHoleSampleSize(manifest);
        const bytes = new Uint8Array(width * height * 4);
        const url = `Payloads/${encodeURIComponent(regionId)}/alphamap-${manifest.alphamaps.length
          .toString()
          .padStart(2, "0")}.rgba8`;
        manifest.alphamaps.push({
          data: { url },
          format: "rgba8-unorm",
          layout: manifest.holes?.layout ?? TERRAIN_RASTER_LAYOUT,
          sampleSize: [width, height],
          layers: [null, null, null, null],
          sha256: await sha256TerrainBytes(bytes)
        });
        alphamaps.push(bytes);
        targetMap = manifest.alphamaps.length - 1;
        targetChannel = 0;
        generatedAlphamap = { url, bytes };
      }
      const id = allocateRegionAssetId(
        currentEntry.sourceId,
        currentEntry.resourceUrl,
        new Set(manifest.layers.map((layer) => layer.id))
      );
      manifest.alphamaps[targetMap].layers[targetChannel] = id;
      manifest.layers.push({ ...cloneJson(sourceLayer), id });
      candidates[documentIndex] = { ...target, manifest: deepFreeze(manifest), alphamaps };
      validateTerrainProjectWorld(this._world, candidates);
      if (generatedAlphamap) {
        await this._addProjectResource(generatedAlphamap.url, "Buffer", generatedAlphamap.bytes);
      }
      this._commitAssetMutation(regionId, candidates);
      return id;
    }

    if (entry.kind === "detail") {
      const sourcePrototype = source.manifest.detailPrototypes.find(
        (prototype) =>
          prototype.id === currentEntry.sourceId &&
          (prototype.prefab?.url ?? prototype.texture?.url) === currentEntry.resourceUrl
      );
      if (!sourcePrototype) throw new Error(`Terrain editor Detail source ${JSON.stringify(entry.key)} is stale`);
      const ids = new Set(target.manifest.detailPrototypes.map((prototype) => prototype.id));
      const id = allocateRegionAssetId(currentEntry.sourceId, currentEntry.resourceUrl, ids);
      const prototype: TerrainProjectDetailPrototype = {
        ...cloneJson(sourcePrototype),
        id,
        densitySampleSize: [
      ...(target.manifest.detailPrototypes[0]?.densitySampleSize ?? getTerrainProjectHoleSampleSize(target.manifest))
        ],
        density: { kind: "empty" },
        maximumSourceCount: 0
      };
      delete prototype.exactTransforms;
      candidates[documentIndex] = {
        ...target,
        manifest: deepFreeze({
          ...target.manifest,
          detailPrototypes: [...target.manifest.detailPrototypes, prototype]
        })
      };
      validateTerrainProjectWorld(this._world, candidates);
      this._commitAssetMutation(regionId, candidates);
      return id;
    }

    if (entry.kind === "tree") {
      const sourcePrototype = source.manifest.treePrototypes.find(
        (prototype) => prototype.id === currentEntry.sourceId && prototype.prefab.url === currentEntry.resourceUrl
      );
      if (!sourcePrototype) throw new Error(`Terrain editor tree source ${JSON.stringify(entry.key)} is stale`);
      const id = allocateRegionAssetId(
        currentEntry.sourceId,
        currentEntry.resourceUrl,
        new Set(target.manifest.treePrototypes.map((prototype) => prototype.id))
      );
      const prototype: TerrainProjectTreePrototype = { ...cloneJson(sourcePrototype), id };
      candidates[documentIndex] = {
        ...target,
        manifest: deepFreeze({
          ...target.manifest,
          treePrototypes: [...target.manifest.treePrototypes, prototype]
        })
      };
      validateTerrainProjectWorld(this._world, candidates);
      this._commitAssetMutation(regionId, candidates);
      return id;
    }

    const sourcePrototype = source.manifest.placedPrefabPrototypes?.find(
      (prototype) => prototype.id === currentEntry.sourceId && prototype.prefab.url === currentEntry.resourceUrl
    );
    if (!sourcePrototype) throw new Error(`Terrain editor object source ${JSON.stringify(entry.key)} is stale`);
    const id = allocateRegionAssetId(
      currentEntry.sourceId,
      currentEntry.resourceUrl,
      new Set((target.manifest.placedPrefabPrototypes ?? []).map((prototype) => prototype.id))
    );
    const prototype: TerrainProjectPlacedPrefabPrototype = { ...cloneJson(sourcePrototype), id };
    candidates[documentIndex] = {
      ...target,
      manifest: deepFreeze({
        ...target.manifest,
        placedPrefabPrototypes: [...(target.manifest.placedPrefabPrototypes ?? []), prototype],
        placedPrefabInstances: [...(target.manifest.placedPrefabInstances ?? [])]
      })
    };
    validateTerrainProjectWorld(this._world, candidates);
    this._commitAssetMutation(regionId, candidates);
    return id;
  }

  /**
   * Adds one uploaded image as a portable TerrainLayer on the selected Region.
   * @param regionId Stable Region receiving the new layer.
   * @param file Detached PNG, JPEG, or WebP upload.
   * @returns Stable id of the existing or newly added layer.
   * @throws If the Region, image, resource path, or resulting canonical document is invalid.
   */
  async addTextureLayer(regionId: string, file: TerrainEditorUploadedFile): Promise<string> {
    const documentIndex = this._requireRegionIndex(regionId);
    const source = this._documents[documentIndex];
    const prepared = await prepareTerrainEditorTextureAsset(file);
    if (source.manifest.layers.some((layer) => layer.id === prepared.id)) return prepared.id;

    const manifest = cloneJson(source.manifest);
    const alphamaps = [...source.alphamaps];
    let targetMap = -1;
    let targetChannel = -1;
    for (let mapIndex = 0; mapIndex < manifest.alphamaps.length && targetMap < 0; mapIndex++) {
      const channel = manifest.alphamaps[mapIndex].layers.findIndex((layerId) => layerId === null);
      if (channel >= 0) {
        targetMap = mapIndex;
        targetChannel = channel;
      }
    }
    let generatedAlphamap: { url: string; bytes: Uint8Array } | null = null;
    if (targetMap < 0) {
      const [width, height] = manifest.alphamaps[0]?.sampleSize ?? getTerrainProjectHoleSampleSize(manifest);
      const bytes = new Uint8Array(width * height * 4);
      const url = `Payloads/${encodeURIComponent(regionId)}/alphamap-${manifest.alphamaps.length
        .toString()
        .padStart(2, "0")}.rgba8`;
      manifest.alphamaps.push({
        data: { url },
        format: "rgba8-unorm",
        layout: manifest.holes?.layout ?? TERRAIN_RASTER_LAYOUT,
        sampleSize: [width, height],
        layers: [null, null, null, null],
        sha256: await sha256TerrainBytes(bytes)
      });
      alphamaps.push(bytes);
      targetMap = manifest.alphamaps.length - 1;
      targetChannel = 0;
      generatedAlphamap = { url, bytes };
    }
    manifest.alphamaps[targetMap].layers[targetChannel] = prepared.id;
    const layer: TerrainProjectLayer = {
      id: prepared.id,
      name: prepared.name,
      diffuse: { url: prepared.diffuseUrl },
      normal: { url: prepared.normalUrl },
      tileSize: [15, 15],
      tileOffset: [0, 0],
      normalScale: 1,
      diffuseRemapMin: [0, 0, 0, 0],
      diffuseRemapMax: [1, 1, 1, 1],
      maskRemapMin: [0, 0, 0, 0],
      maskRemapMax: [1, 1, 1, 1],
      metallic: 0,
      smoothness: 0.25,
      specular: [0.2, 0.2, 0.2, 1],
      snowResponse: 0.65
    };
    manifest.layers.push(layer);
    const candidates = [...this._documents];
    candidates[documentIndex] = { ...source, manifest: deepFreeze(manifest), alphamaps };
    validateTerrainProjectWorld(this._world, candidates);

    await this._addProjectResource(prepared.diffuseUrl, "Texture", prepared.diffuseBytes, {
      isSRGBColorSpace: true,
      mipmap: true,
      filterMode: 2,
      wrapModeU: 1,
      wrapModeV: 1,
      anisoLevel: 8
    });
    await this._addProjectResource(prepared.normalUrl, "Texture", prepared.normalBytes, {
      isSRGBColorSpace: false,
      mipmap: true,
      filterMode: 2,
      wrapModeU: 1,
      wrapModeV: 1,
      anisoLevel: 8
    });
    if (generatedAlphamap) {
      await this._addProjectResource(generatedAlphamap.url, "Buffer", generatedAlphamap.bytes);
    }
    this._commitAssetMutation(regionId, candidates);
    return prepared.id;
  }

  /**
   * Adds one uploaded static binary glTF as a paintable Detail prototype on the selected Region.
   * @param regionId Stable Region receiving the new Detail prototype.
   * @param file Detached self-contained `.glb` upload.
   * @returns Stable id of the existing or newly added Detail prototype.
   * @throws If the Region, model, generated Prefab, or resulting canonical document is invalid.
   */
  async addDetailPrototype(regionId: string, file: TerrainEditorUploadedFile): Promise<string> {
    const documentIndex = this._requireRegionIndex(regionId);
    const source = this._documents[documentIndex];
    const prepared = await prepareTerrainEditorPrototypeAsset(file, "detail");
    if (source.manifest.detailPrototypes.some((prototype) => prototype.id === prepared.id)) return prepared.id;

    const densitySampleSize: [number, number] = [
      ...(source.manifest.detailPrototypes[0]?.densitySampleSize ?? getTerrainProjectHoleSampleSize(source.manifest))
    ];
    const prototype: TerrainProjectDetailPrototype = {
      id: prepared.id,
      name: prepared.name,
      prefab: { url: prepared.prefabUrl },
      densitySampleSize,
      density: { kind: "empty" },
      healthyColor: [1, 1, 1, 1],
      dryColor: [0.75, 0.7, 0.55, 1],
      minWidth: 0.8,
      maxWidth: 1.2,
      minHeight: 0.8,
      maxHeight: 1.2,
      maximumSourceCount: 0,
      noiseSeed: stableAssetSeed(prepared.id),
      noiseSpread: 0.3,
      renderMode: "VertexLit",
      useInstancing: true,
      usePrototypeMesh: true
    };
    const candidates = [...this._documents];
    candidates[documentIndex] = {
      ...source,
      manifest: deepFreeze({
        ...source.manifest,
        detailPrototypes: [...source.manifest.detailPrototypes, prototype]
      })
    };
    validateTerrainProjectWorld(this._world, candidates);

    await this._addProjectResource(prepared.modelUrl, "GLTF", prepared.modelBytes, { keepMeshData: true });
    await this._addProjectResource(prepared.prefabUrl, "Prefab", prepared.prefabBytes);
    this._commitAssetMutation(regionId, candidates);
    return prepared.id;
  }

  /**
   * Adds one uploaded static binary glTF as a paintable tree prototype on the selected Region.
   * @param regionId Stable Region receiving the new tree prototype.
   * @param file Detached self-contained `.glb` upload.
   * @returns Stable id of the existing or newly added tree prototype.
   * @throws If the Region, model, generated Prefab, or resulting canonical document is invalid.
   */
  async addTreePrototype(regionId: string, file: TerrainEditorUploadedFile): Promise<string> {
    const documentIndex = this._requireRegionIndex(regionId);
    const source = this._documents[documentIndex];
    const prepared = await prepareTerrainEditorPrototypeAsset(file, "tree");
    if (source.manifest.treePrototypes.some((prototype) => prototype.id === prepared.id)) return prepared.id;
    const candidates = [...this._documents];
    candidates[documentIndex] = {
      ...source,
      manifest: deepFreeze({
        ...source.manifest,
        treePrototypes: [
          ...source.manifest.treePrototypes,
          {
            id: prepared.id,
            name: prepared.name,
            prefab: { url: prepared.prefabUrl },
            bendFactor: 0,
            navMeshLod: 0
          }
        ]
      })
    };
    validateTerrainProjectWorld(this._world, candidates);

    await this._addProjectResource(prepared.modelUrl, "GLTF", prepared.modelBytes, { keepMeshData: true });
    await this._addProjectResource(prepared.prefabUrl, "Prefab", prepared.prefabBytes);
    this._commitAssetMutation(regionId, candidates);
    return prepared.id;
  }

  /**
   * Adds one uploaded static binary glTF as an ordinary paintable placed-Prefab prototype.
   * @param regionId Stable Region receiving the new object prototype.
   * @param file Detached self-contained `.glb` upload.
   * @returns Stable id of the existing or newly added placed-Prefab prototype.
   * @throws If the Region, model, generated Prefab, or resulting canonical document is invalid.
   */
  async addObjectPrototype(regionId: string, file: TerrainEditorUploadedFile): Promise<string> {
    const documentIndex = this._requireRegionIndex(regionId);
    const source = this._documents[documentIndex];
    const prepared = await prepareTerrainEditorPrototypeAsset(file, "object");
    const existing = (source.manifest.placedPrefabPrototypes ?? []).find(
      (prototype) => prototype.prefab.url === prepared.prefabUrl
    );
    if (existing) return existing.id;
    const occupiedIds = new Set((source.manifest.placedPrefabPrototypes ?? []).map((prototype) => prototype.id));
    const id = allocateRegionAssetId(prepared.id, prepared.prefabUrl, occupiedIds);
    const candidates = [...this._documents];
    candidates[documentIndex] = {
      ...source,
      manifest: deepFreeze({
        ...source.manifest,
        placedPrefabPrototypes: [
          ...(source.manifest.placedPrefabPrototypes ?? []),
          { id, name: prepared.name, prefab: { url: prepared.prefabUrl } }
        ],
        placedPrefabInstances: [...(source.manifest.placedPrefabInstances ?? [])]
      })
    };
    validateTerrainProjectWorld(this._world, candidates);

    await this._addProjectResource(prepared.modelUrl, "GLTF", prepared.modelBytes, { keepMeshData: true });
    await this._addProjectResource(prepared.prefabUrl, "Prefab", prepared.prefabBytes);
    this._commitAssetMutation(regionId, candidates);
    return id;
  }

  /**
   * Borrows current canonical views for a synchronous preview refresh without payload copies.
   * @returns Frozen container whose document payload views remain workspace-owned and read-only to consumers.
   */
  borrowSnapshot(): TerrainEditorBorrowedSnapshot {
    return Object.freeze({
      revision: this._revision,
      world: this._world,
      documents: Object.freeze(this._documents.map((document) => Object.freeze({ ...document })))
    });
  }

  /** @returns Whether an atomic stroke is available to undo. */
  get canUndo(): boolean {
    return this._activeHeightStroke === null && this._undoStack.length > 0;
  }

  /** @returns Whether an undone atomic stroke is available to redo. */
  get canRedo(): boolean {
    return this._activeHeightStroke === null && this._redoStack.length > 0;
  }

  /**
   * Starts one live height stroke from a single pointer-down stamp without publishing canonical data.
   * @param regionId Stable Region receiving the interactive stroke.
   * @param stroke Brush configuration whose `points` array contains exactly the pointer-down position.
   * @returns Initial compact preview patch, or `null` when the first stamp is outside the Region.
   * @throws If another stroke is active, the Region is unknown, or the brush input is invalid.
   */
  beginHeightStrokeToRegion(regionId: string, stroke: TerrainHeightBrushStroke): TerrainEditorHeightPatch | null {
    this._assertNoActiveStroke();
    if (stroke.points.length !== 1) throw new Error("Terrain editor live height stroke must begin with one point");
    const document = this._requireRegion(regionId);
    validateTerrainHeightBrushStroke(stroke);
    const { points: _points, ...settings } = stroke;
    const session = createTerrainHeightBrushSession(document, settings);
    this._activeHeightStroke = {
      regionId,
      workspaceRevision: this._revision,
      settings,
      session
    };
    return attachRegionToHeightPatch(regionId, session.appendPoint(stroke.points[0]));
  }

  /**
   * Adds one pointer sample to the active live height stroke.
   * @param point Latest world-space pointer position.
   * @returns Compact preview patch for newly reached fixed-distance stamps, or `null` when no sample changed.
   * @throws If no live height stroke is active or canonical state changed during the session.
   */
  appendHeightStrokePoint(point: TerrainHeightBrushPoint): TerrainEditorHeightPatch | null {
    const active = this._requireActiveHeightStroke();
    this._assertHeightStrokeRevision(active);
    return attachRegionToHeightPatch(active.regionId, active.session.appendPoint(point));
  }

  /**
   * Publishes the active working copy as one atomic canonical command.
   * @returns Exact cross-Region command after seam closure and surface resnapping, or `null` when unchanged.
   * @throws If no stroke is active or the resulting canonical world is invalid.
   */
  commitHeightStroke(): TerrainHeightCommand | null {
    const active = this._requireActiveHeightStroke();
    this._assertHeightStrokeRevision(active);
    this._activeHeightStroke = null;
    const result = active.session.finish();
    if (result.changes.length === 0) return null;

    const sourceDocuments = this._documents;
    const candidateDocuments = sourceDocuments.slice();
    const documentIndex = this._requireRegionIndex(active.regionId);
    candidateDocuments[documentIndex] = {
      ...sourceDocuments[documentIndex],
      heightmap: result.heightmap
    };
    const changedIndices = new Map<string, Set<number>>([
      [active.regionId, new Set(result.changes.map((change) => change.index))]
    ]);
    closeExplicitHeightSeamsFromStamps(
      this._world,
      sourceDocuments,
      candidateDocuments,
      { ...active.settings, points: result.stamps },
      result.stamps,
      changedIndices
    );
    const surfaceChanges = resnapChangedTerrainSurfaces(candidateDocuments, changedIndices);
    validateTerrainProjectWorld(this._world, candidateDocuments);
    const command = createCommand(sourceDocuments, candidateDocuments, changedIndices, surfaceChanges);
    if (!command) return null;
    this._commitCommand(command, candidateDocuments);
    return command;
  }

  /**
   * Cancels the active working copy without changing canonical state or history.
   * @returns Compact baseline patch that restores the live preview, or `null` when unchanged.
   * @throws If no live height stroke is active.
   */
  cancelHeightStroke(): TerrainEditorHeightPatch | null {
    const active = this._requireActiveHeightStroke();
    this._activeHeightStroke = null;
    return attachRegionToHeightPatch(active.regionId, active.session.cancel());
  }

  /**
   * Reads compact current-value patches for one already-applied height command.
   * @param command Height command returned by commit, undo, or redo.
   * @returns Region-local rectangles populated from the current canonical state.
   * @throws If the command references an unknown Region or invalid sample index.
   */
  readHeightCommandPatches(command: TerrainHeightCommand): readonly TerrainEditorHeightPatch[] {
    return command.regions.map((region) => {
      const document = this._requireRegion(region.regionId);
      return attachRegionToHeightPatch(
        region.regionId,
        createHeightPatchFromIndices(
          document.heightmap,
          document.manifest.heightmap.sampleSize,
          region.changes.map((change) => change.index)
        )
      )!;
    });
  }

  /**
   * Starts one unpublished Texture, Detail, or tree stroke from a single pointer-down stamp.
   * @param regionId Stable Region receiving the interactive stroke.
   * @param stroke Discriminated brush configuration containing exactly one initial pointer position.
   * @returns Renderer-facing local update, or `null` when the initial stamp changes no data.
   * @throws If another stroke is active, the Region is unknown, or brush input is invalid.
   */
  beginSurfaceStrokeToRegion(
    regionId: string,
    stroke: TerrainEditorLiveSurfaceStroke
  ): TerrainEditorSurfacePreviewUpdate | null {
    this._assertNoActiveStroke();
    if (stroke.points.length !== 1) throw new Error("Terrain editor live surface stroke must begin with one point");
    const baseline = this._requireRegion(regionId);
    const { points } = stroke;
    if (stroke.kind === "texture") {
      const { kind: _kind, points: _points, ...settings } = stroke;
      const session = createTerrainTextureBrushSession(baseline, settings);
      this._activeSurfaceStroke = { kind: "texture", regionId, workspaceRevision: this._revision, session };
      const patches = session.appendPoint(points[0]);
      return patches.length > 0 ? { kind: "texture", regionId, patches } : null;
    }
    if (stroke.kind === "detail") {
      const { kind: _kind, points: _points, ...settings } = stroke;
      const sourcePrototype = baseline.manifest.detailPrototypes.find(
        (prototype) => prototype.id === settings.prototypeId
      );
      if (!sourcePrototype) throw new Error(`Unknown Terrain Detail prototype "${settings.prototypeId}"`);
      const session = createTerrainDetailBrushSession(
        baseline,
        settings,
        sourcePrototype.density.kind === "empty"
          ? {
              densityDataUrl: createDetailDensityDataUrl(regionId, sourcePrototype.id),
              exactTransformsDataUrl: createDetailTransformsDataUrl(regionId, sourcePrototype.id)
            }
          : undefined
      );
      const active: ActiveTerrainEditorDetailStroke = {
        kind: "detail",
        regionId,
        workspaceRevision: this._revision,
        baseline,
        session,
        working: baseline
      };
      this._activeSurfaceStroke = active;
      const result = session.appendPoint(points[0]);
      if (!result) return null;
      active.working = this._applyDetailResult(baseline, result).document;
      return { kind: "detail", regionId, document: active.working };
    }
    if (stroke.kind === "tree") {
      const { kind: _kind, points: _points, ...settings } = stroke;
      const session = createTerrainTreeBrushSession(baseline, settings);
      const active: ActiveTerrainEditorTreeStroke = {
        kind: "tree",
        regionId,
        workspaceRevision: this._revision,
        baseline,
        session,
        working: baseline
      };
      this._activeSurfaceStroke = active;
      const result = session.appendPoint(points[0]);
      if (!result) return null;
      active.working = applyTreeResult(baseline, result);
      return { kind: "tree", regionId, document: active.working };
    }
    const { kind: _kind, points: _points, ...settings } = stroke;
    const session = createTerrainObjectBrushSession(baseline, settings);
    const active: ActiveTerrainEditorObjectStroke = {
      kind: "object",
      regionId,
      workspaceRevision: this._revision,
      baseline,
      session,
      working: baseline
    };
    this._activeSurfaceStroke = active;
    const result = session.appendPoint(points[0]);
    if (!result) return null;
    active.working = applyObjectResult(baseline, result);
    return { kind: "object", regionId, document: active.working };
  }

  /**
   * Adds one pointer sample to the active unpublished surface stroke.
   * @param point Latest world-space pointer position.
   * @returns Renderer-facing local update, or `null` when no fixed-distance stamp changed data.
   * @throws If no surface stroke is active or canonical state changed during the session.
   */
  appendSurfaceStrokePoint(point: TerrainSurfaceBrushPoint): TerrainEditorSurfacePreviewUpdate | null {
    const active = this._requireActiveSurfaceStroke();
    this._assertSurfaceStrokeRevision(active);
    if (active.kind === "texture") {
      const patches = active.session.appendPoint(point);
      return patches.length > 0 ? { kind: active.kind, regionId: active.regionId, patches } : null;
    }
    if (active.kind === "detail") {
      const result = active.session.appendPoint(point);
      if (!result) return null;
      active.working = this._applyDetailResult(active.working, result).document;
      return { kind: active.kind, regionId: active.regionId, document: active.working };
    }
    if (active.kind === "tree") {
      const result = active.session.appendPoint(point);
      if (!result) return null;
      active.working = applyTreeResult(active.working, result);
      return { kind: active.kind, regionId: active.regionId, document: active.working };
    }
    const result = active.session.appendPoint(point);
    if (!result) return null;
    active.working = applyObjectResult(active.working, result);
    return { kind: active.kind, regionId: active.regionId, document: active.working };
  }

  /**
   * Publishes the active non-height working copy as one atomic canonical command.
   * @returns Exact command after one world validation, or `null` when the stroke changes no canonical value.
   * @throws If no surface stroke is active or the resulting canonical world is invalid.
   */
  commitSurfaceStroke():
    | TerrainTextureCommand
    | TerrainDetailCommand
    | TerrainTreeCommand
    | TerrainObjectCommand
    | null {
    const active = this._requireActiveSurfaceStroke();
    this._assertSurfaceStrokeRevision(active);
    this._activeSurfaceStroke = null;
    const documentIndex = this._requireRegionIndex(active.regionId);
    const candidates = [...this._documents];
    if (active.kind === "texture") {
      const result = active.session.finish();
      if (result.maps.length === 0) return null;
      candidates[documentIndex] = { ...candidates[documentIndex], alphamaps: Object.freeze([...result.alphamaps]) };
      const command: TerrainTextureCommand = {
        kind: "texture",
        regions: [{ regionId: active.regionId, maps: result.maps }]
      };
      validateTerrainProjectWorld(this._world, candidates);
      this._commitCommand(command, candidates);
      return command;
    }
    if (active.kind === "detail") {
      const result = active.session.finish();
      if (result.changes.length === 0) return null;
      const applied = this._applyDetailResult(active.baseline, result);
      candidates[documentIndex] = applied.document;
      const command: TerrainDetailCommand = {
        kind: "detail",
        regions: [
          {
            regionId: active.regionId,
            prototypeId: result.prototypeId,
            changes: result.changes,
            beforePrototype: applied.beforePrototype,
            afterPrototype: applied.afterPrototype,
            beforeTransforms: active.baseline.detailTransforms.get(result.prototypeId)?.values,
            afterTransforms: result.transforms?.values
          }
        ]
      };
      validateTerrainProjectWorld(this._world, candidates);
      this._commitCommand(command, candidates);
      return command;
    }
    if (active.kind === "tree") {
      const result = active.session.finish();
      if (result.added === 0 && result.removed === 0) return null;
      candidates[documentIndex] = applyTreeResult(active.baseline, result);
      const command: TerrainTreeCommand = {
        kind: "tree",
        regions: [
          {
            regionId: active.regionId,
            before: active.baseline.manifest.treeInstances,
            after: result.instances
          }
        ]
      };
      validateTerrainProjectWorld(this._world, candidates);
      this._commitCommand(command, candidates);
      return command;
    }
    const result = active.session.finish();
    if (result.added === 0 && result.removed === 0) return null;
    candidates[documentIndex] = applyObjectResult(active.baseline, result);
    const command: TerrainObjectCommand = {
      kind: "object",
      regions: [
        {
          regionId: active.regionId,
          before: active.baseline.manifest.placedPrefabInstances ?? [],
          after: result.instances
        }
      ]
    };
    validateTerrainProjectWorld(this._world, candidates);
    this._commitCommand(command, candidates);
    return command;
  }

  /**
   * Cancels the active non-height working copy without changing canonical state or history.
   * @returns Renderer-facing baseline restoration for the affected Region.
   * @throws If no surface stroke is active.
   */
  cancelSurfaceStroke(): TerrainEditorSurfacePreviewUpdate {
    const active = this._requireActiveSurfaceStroke();
    this._activeSurfaceStroke = null;
    if (active.kind === "texture") {
      return { kind: active.kind, regionId: active.regionId, patches: active.session.cancel() };
    }
    active.session.cancel();
    return { kind: active.kind, regionId: active.regionId, document: active.baseline };
  }

  /**
   * Reads compact current-value Alphamap rectangles for one already-applied texture command.
   * @param command Texture command returned by commit, undo, or redo.
   * @returns Region-local RGBA8 rectangles populated from current canonical maps.
   * @throws If the command references an unknown Region, map, or texel.
   */
  readTextureCommandPatches(command: TerrainTextureCommand): readonly TerrainEditorSurfacePreviewUpdate[] {
    return command.regions.map((region) => {
      const document = this._requireRegion(region.regionId);
      const patches = region.maps.map((map) =>
        createTexturePatchFromIndices(
          document.alphamaps[map.mapIndex],
          document.manifest.alphamaps[map.mapIndex].sampleSize,
          map.mapIndex,
          map.changes.map((change) => change.index)
        )
      );
      return { kind: "texture", regionId: region.regionId, patches };
    });
  }

  /**
   * Applies one world-space raise/lower stroke and all declared seam closure as one transaction.
   * @param stroke Fixed-distance renderer-independent brush input.
   * @returns Exact sparse command, or `null` when R16 samples do not change.
   * @throws If brush input or the resulting canonical world is invalid.
   */
  applyHeightStroke(stroke: TerrainHeightBrushStroke): TerrainHeightCommand | null {
    return this._applyHeightStroke(stroke);
  }

  /**
   * Applies one world-space raise/lower stroke to one Region.
   * @param regionId Stable Region receiving the brush.
   * @param stroke Fixed-distance renderer-independent brush input.
   * @returns Exact sparse command, or `null` when R16 samples do not change.
   * @throws If the Region does not exist, brush input is invalid, or the canonical world becomes invalid.
   */
  applyHeightStrokeToRegion(regionId: string, stroke: TerrainHeightBrushStroke): TerrainHeightCommand | null {
    return this._applyHeightStroke(stroke, regionId);
  }

  private _applyHeightStroke(stroke: TerrainHeightBrushStroke, regionId?: string): TerrainHeightCommand | null {
    this._assertNoActiveStroke();
    if (regionId !== undefined) this._requireRegion(regionId);
    validateTerrainHeightBrushStroke(stroke);
    const sourceDocuments = this._documents;
    const changedIndices = new Map<string, Set<number>>();
    const candidateDocuments = sourceDocuments.map((document) => {
      if (regionId !== undefined && document.descriptor.id !== regionId) return document;
      const result = applyTerrainHeightBrush(document, stroke);
      if (result.changes.length > 0) {
        changedIndices.set(document.descriptor.id, new Set(result.changes.map((change) => change.index)));
      }
      return { ...document, heightmap: result.heightmap };
    });
    closeExplicitHeightSeams(this._world, sourceDocuments, candidateDocuments, stroke, changedIndices);
    const surfaceChanges = resnapChangedTerrainSurfaces(candidateDocuments, changedIndices);
    validateTerrainProjectWorld(this._world, candidateDocuments);
    const command = createCommand(sourceDocuments, candidateDocuments, changedIndices, surfaceChanges);
    if (!command) return null;
    this._commitCommand(command, candidateDocuments);
    return command;
  }

  /**
   * Applies one canonical TerrainLayer stroke across every Region that declares the selected layer.
   * @param stroke Fixed-distance renderer-independent texture input.
   * @returns Exact atomic command, or `null` when no weights change.
   * @throws If brush input or the resulting canonical world is invalid.
   */
  applyTextureStroke(stroke: TerrainTextureBrushStroke): TerrainTextureCommand | null {
    return this._applyTextureStroke(stroke);
  }

  /**
   * Applies one canonical TerrainLayer stroke to one Region.
   * @param regionId Stable Region receiving the brush.
   * @param stroke Fixed-distance renderer-independent texture input.
   * @returns Exact atomic command, or `null` when no weights change.
   * @throws If the Region does not exist, brush input is invalid, or the canonical world becomes invalid.
   */
  applyTextureStrokeToRegion(regionId: string, stroke: TerrainTextureBrushStroke): TerrainTextureCommand | null {
    return this._applyTextureStroke(stroke, regionId);
  }

  private _applyTextureStroke(stroke: TerrainTextureBrushStroke, regionId?: string): TerrainTextureCommand | null {
    this._assertNoActiveStroke();
    if (regionId !== undefined) this._requireRegion(regionId);
    const regions: TerrainTextureRegionCommand[] = [];
    const candidates = this._documents.map((document) => {
      if (regionId !== undefined && document.descriptor.id !== regionId) return document;
      const result = applyTerrainTextureBrush(document, stroke);
      if (result.maps.length === 0) return document;
      regions.push({ regionId: document.descriptor.id, maps: result.maps });
      return { ...document, alphamaps: Object.freeze([...result.alphamaps]) };
    });
    if (regions.length === 0) return null;
    regions.sort((left, right) => compareStableStrings(left.regionId, right.regionId));
    const command: TerrainTextureCommand = { kind: "texture", regions };
    validateTerrainProjectWorld(this._world, candidates);
    this._commitCommand(command, candidates);
    return command;
  }

  /**
   * Applies one canonical Detail density stroke and keeps optional exact placements synchronized.
   * @param stroke Fixed-distance renderer-independent Detail input.
   * @returns Exact atomic command, or `null` when no density changes.
   * @throws If brush input, prototype data, or the resulting canonical world is invalid.
   */
  applyDetailStroke(stroke: TerrainDetailBrushStroke): TerrainDetailCommand | null {
    return this._applyDetailStroke(stroke);
  }

  /**
   * Applies one canonical Detail density stroke to one Region and keeps exact placements synchronized.
   * @param regionId Stable Region receiving the brush.
   * @param stroke Fixed-distance renderer-independent Detail input.
   * @returns Exact atomic command, or `null` when no density changes.
   * @throws If the Region does not exist, brush input is invalid, or the canonical world becomes invalid.
   */
  applyDetailStrokeToRegion(regionId: string, stroke: TerrainDetailBrushStroke): TerrainDetailCommand | null {
    return this._applyDetailStroke(stroke, regionId);
  }

  private _applyDetailStroke(stroke: TerrainDetailBrushStroke, regionId?: string): TerrainDetailCommand | null {
    this._assertNoActiveStroke();
    if (regionId !== undefined) this._requireRegion(regionId);
    const regions: TerrainDetailRegionCommand[] = [];
    const candidates = this._documents.map((document) => {
      if (regionId !== undefined && document.descriptor.id !== regionId) return document;
      const sourcePrototype = document.manifest.detailPrototypes.find(
        (prototype) => prototype.id === stroke.prototypeId
      );
      if (!sourcePrototype) return document;
      const result = applyTerrainDetailBrush(
        document,
        stroke,
        sourcePrototype.density.kind === "empty"
          ? {
              densityDataUrl: createDetailDensityDataUrl(document.descriptor.id, sourcePrototype.id),
              exactTransformsDataUrl: createDetailTransformsDataUrl(document.descriptor.id, sourcePrototype.id)
            }
          : undefined
      );
      if (result.changes.length === 0) return document;
      const prototypeIndex = document.manifest.detailPrototypes.findIndex(
        (prototype) => prototype.id === stroke.prototypeId
      );
      const beforePrototype = document.manifest.detailPrototypes[prototypeIndex];
      const afterPrototype = result.prototype;
      const detailPrototypes = [...document.manifest.detailPrototypes];
      detailPrototypes[prototypeIndex] = afterPrototype;
      const detailMaps = new Map(document.detailMaps);
      detailMaps.set(stroke.prototypeId, result.density);
      const detailTransforms = new Map(document.detailTransforms);
      if (result.transforms) detailTransforms.set(stroke.prototypeId, result.transforms);
      regions.push({
        regionId: document.descriptor.id,
        prototypeId: stroke.prototypeId,
        changes: result.changes,
        beforePrototype,
        afterPrototype,
        beforeTransforms: document.detailTransforms.get(stroke.prototypeId)?.values,
        afterTransforms: result.transforms?.values
      });
      return {
        ...document,
        manifest: deepFreeze({ ...document.manifest, detailPrototypes }),
        detailMaps,
        detailTransforms
      };
    });
    if (regions.length === 0) return null;
    regions.sort((left, right) => compareStableStrings(left.regionId, right.regionId));
    const command: TerrainDetailCommand = { kind: "detail", regions };
    validateTerrainProjectWorld(this._world, candidates);
    this._commitCommand(command, candidates);
    return command;
  }

  /**
   * Applies one explicit tree placement or erase stroke with canonical height snapping.
   * @param stroke Fixed-distance renderer-independent tree input.
   * @returns Exact atomic command, or `null` when no instances change.
   * @throws If brush input, prototype data, or the resulting canonical world is invalid.
   */
  applyTreeStroke(stroke: TerrainTreeBrushStroke): TerrainTreeCommand | null {
    return this._applyTreeStroke(stroke);
  }

  /**
   * Applies one explicit tree placement or erase stroke to one Region with canonical height snapping.
   * @param regionId Stable Region receiving the brush.
   * @param stroke Fixed-distance renderer-independent tree input.
   * @returns Exact atomic command, or `null` when no instances change.
   * @throws If the Region does not exist, brush input is invalid, or the canonical world becomes invalid.
   */
  applyTreeStrokeToRegion(regionId: string, stroke: TerrainTreeBrushStroke): TerrainTreeCommand | null {
    return this._applyTreeStroke(stroke, regionId);
  }

  private _applyTreeStroke(stroke: TerrainTreeBrushStroke, regionId?: string): TerrainTreeCommand | null {
    this._assertNoActiveStroke();
    if (regionId !== undefined) this._requireRegion(regionId);
    const regions: TerrainTreeRegionCommand[] = [];
    const candidates = this._documents.map((document) => {
      if (regionId !== undefined && document.descriptor.id !== regionId) return document;
      if (!document.manifest.treePrototypes.some((prototype) => prototype.id === stroke.prototypeId)) return document;
      const result = applyTerrainTreeBrush(document, stroke);
      if (result.added === 0 && result.removed === 0) return document;
      regions.push({
        regionId: document.descriptor.id,
        before: document.manifest.treeInstances,
        after: result.instances
      });
      return {
        ...document,
        manifest: deepFreeze({ ...document.manifest, treeInstances: [...result.instances] })
      };
    });
    if (regions.length === 0) return null;
    regions.sort((left, right) => compareStableStrings(left.regionId, right.regionId));
    const command: TerrainTreeCommand = { kind: "tree", regions };
    validateTerrainProjectWorld(this._world, candidates);
    this._commitCommand(command, candidates);
    return command;
  }

  private _requireRegionIndex(regionId: string): number {
    const index = this._documents.findIndex((document) => document.descriptor.id === regionId);
    if (index < 0) {
      throw new Error(`Terrain editor Region ${JSON.stringify(regionId)} does not exist.`);
    }
    return index;
  }

  private _requireRegion(regionId: string): TerrainProjectDocument {
    return this._documents[this._requireRegionIndex(regionId)];
  }

  private _applyDetailResult(
    source: TerrainProjectDocument,
    result: TerrainDetailBrushResult
  ): {
    document: TerrainProjectDocument;
    beforePrototype: TerrainProjectDetailPrototype;
    afterPrototype: TerrainProjectDetailPrototype;
  } {
    const prototypeIndex = source.manifest.detailPrototypes.findIndex(
      (prototype) => prototype.id === result.prototypeId
    );
    if (prototypeIndex < 0) throw new Error(`Unknown Terrain Detail prototype "${result.prototypeId}"`);
    const beforePrototype = source.manifest.detailPrototypes[prototypeIndex];
    const afterPrototype = result.prototype;
    const detailPrototypes = [...source.manifest.detailPrototypes];
    detailPrototypes[prototypeIndex] = afterPrototype;
    const detailMaps = new Map(source.detailMaps);
    detailMaps.set(result.prototypeId, result.density);
    const detailTransforms = new Map(source.detailTransforms);
    if (result.transforms) detailTransforms.set(result.prototypeId, result.transforms);
    return {
      document: {
        ...source,
        manifest: deepFreeze({ ...source.manifest, detailPrototypes }),
        detailMaps,
        detailTransforms
      },
      beforePrototype,
      afterPrototype
    };
  }

  private _requireActiveHeightStroke(): ActiveTerrainEditorHeightStroke {
    const active = this._activeHeightStroke;
    if (!active) throw new Error("Terrain editor has no active height stroke");
    return active;
  }

  private _requireActiveSurfaceStroke(): ActiveTerrainEditorSurfaceStroke {
    const active = this._activeSurfaceStroke;
    if (!active) throw new Error("Terrain editor has no active surface stroke");
    return active;
  }

  private _assertNoActiveStroke(): void {
    if (this._activeHeightStroke || this._activeSurfaceStroke) {
      throw new Error("Terrain editor active stroke must finish before this operation");
    }
  }

  private _assertHeightStrokeRevision(active: ActiveTerrainEditorHeightStroke): void {
    if (active.workspaceRevision !== this._revision) {
      throw new Error("Terrain editor canonical state changed during the active height stroke");
    }
  }

  private _assertSurfaceStrokeRevision(active: ActiveTerrainEditorSurfaceStroke): void {
    if (active.workspaceRevision !== this._revision) {
      throw new Error("Terrain editor canonical state changed during the active surface stroke");
    }
  }

  private async _addProjectResource(
    virtualPath: string,
    type: string,
    bytes: Uint8Array,
    params?: Record<string, unknown>
  ): Promise<void> {
    const existing = this._project.files.find((file) => file.virtualPath === virtualPath);
    if (existing) {
      const existingBytes = this._originalPhysical.get(existing.path);
      if (existing.type !== type || !existingBytes || !sameTypedArray(existingBytes, bytes)) {
        throw new Error(
          `Terrain editor resource ${JSON.stringify(virtualPath)} conflicts with an existing Project file`
        );
      }
      return;
    }
    const identity = (await sha256TerrainBytes(textEncoder.encode(virtualPath))).slice(0, 16);
    const path = `public/${virtualPath}`;
    if (this._originalPhysical.has(path)) {
      throw new Error(`Terrain editor physical path ${JSON.stringify(path)} is already occupied`);
    }
    this._project.files.push({ id: `asset-${identity}`, virtualPath, path, type, ...(params ? { params } : {}) });
    this._originalPhysical.set(path, bytes.slice());
    this._originalPhysical.set("project.json", encodeTerrainCanonicalJson(this._project));
    this._projectChanged = true;
  }

  private _commitAssetMutation(regionId: string, candidates: TerrainProjectDocument[]): void {
    this._documents = candidates;
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._currentState = this._nextState++;
    this._dirtyRegionIds.add(regionId);
    this._artifactCache.clear();
    this._revision++;
  }

  /**
   * Restores every sample captured before the latest stroke atomically.
   * @returns The applied command, or `null` when history is empty.
   */
  undo(): TerrainEditorCommand | null {
    this._assertNoActiveStroke();
    const entry = this._undoStack[this._undoStack.length - 1];
    if (!entry) return null;
    this._documents = applyEditorCommand(this._documents, entry.command, "before");
    this._undoStack.pop();
    this._redoStack.push(entry);
    this._currentState = entry.beforeState;
    this._refreshDirtyRegions(commandRegionIds(entry.command));
    this._revision++;
    return entry.command;
  }

  /**
   * Reapplies every sample captured after the latest undone stroke atomically.
   * @returns The applied command, or `null` when redo history is empty.
   */
  redo(): TerrainEditorCommand | null {
    this._assertNoActiveStroke();
    const entry = this._redoStack[this._redoStack.length - 1];
    if (!entry) return null;
    this._documents = applyEditorCommand(this._documents, entry.command, "after");
    this._redoStack.pop();
    this._undoStack.push(entry);
    this._currentState = entry.afterState;
    this._refreshDirtyRegions(commandRegionIds(entry.command));
    this._revision++;
    return entry.command;
  }

  /**
   * Publishes exact physical Project files after regenerating edited payload, Region, and world identities.
   * @returns Defensive immutable physical artifact accepted by the canonical importer.
   * @throws If publication cannot reproduce a complete valid standard Project closure.
   */
  exportArtifact(): Promise<TerrainProjectArtifactEntries> {
    this._assertNoActiveStroke();
    const state = this._currentState;
    const cached = this._artifactCache.get(state);
    if (cached) {
      this._artifactCache.delete(state);
      this._artifactCache.set(state, cached);
      return cached;
    }

    const publication = this._publishArtifact();
    this._artifactCache.set(state, publication);
    void publication.catch(() => {
      if (this._artifactCache.get(state) === publication) this._artifactCache.delete(state);
    });
    while (this._artifactCache.size > ARTIFACT_CACHE_STATE_LIMIT) {
      const oldest = this._artifactCache.keys().next().value as number;
      this._artifactCache.delete(oldest);
    }
    return publication;
  }

  private async _publishArtifact(): Promise<TerrainProjectArtifactEntries> {
    const dirtyDocuments = this._documents.filter((document) => this._dirtyRegionIds.has(document.descriptor.id));
    if (dirtyDocuments.length === 0 && !this._projectChanged) {
      return new ImmutableArtifactEntries(this._originalPhysical);
    }

    const virtual = createVirtualEntries(this._originalPhysical, this._project);
    const generatedResources = new Map<string, string>();
    const retainedMeshDataUrls = new Set<string>();
    for (const document of dirtyDocuments) {
      const baseline = this._baselineDocuments.get(document.descriptor.id)!;
      const manifest = cloneJson(document.manifest);
      if (!sameTypedArray(document.heightmap, baseline.heightmap)) {
        const heightBytes = encodeHeightmap(document.heightmap);
        virtual.set(document.manifest.heightmap.data.url, heightBytes);
        manifest.heightmap.sha256 = await sha256TerrainBytes(heightBytes);
      }
      for (let mapIndex = 0; mapIndex < document.alphamaps.length; mapIndex++) {
        const baselineMap = baseline.alphamaps[mapIndex];
        if (baselineMap && sameTypedArray(document.alphamaps[mapIndex], baselineMap)) continue;
        const bytes = document.alphamaps[mapIndex];
        virtual.set(document.manifest.alphamaps[mapIndex].data.url, bytes);
        manifest.alphamaps[mapIndex].sha256 = await sha256TerrainBytes(bytes);
      }
      for (let prototypeIndex = 0; prototypeIndex < document.manifest.detailPrototypes.length; prototypeIndex++) {
        const prototype = document.manifest.detailPrototypes[prototypeIndex];
        const baselinePrototype = baseline.manifest.detailPrototypes.find((candidate) => candidate.id === prototype.id);
        const density = document.detailMaps.get(prototype.id);
        const baselineDensity = baseline.detailMaps.get(prototype.id);
        if (prototype.density.kind === "r8-count" && density && !sameOptionalTypedArray(density, baselineDensity)) {
          if (!baselinePrototype || baselinePrototype.density.kind === "empty") {
            generatedResources.set(prototype.density.data.url, "Buffer");
          }
          virtual.set(prototype.density.data.url, density);
          const manifestDensity = manifest.detailPrototypes[prototypeIndex].density;
          if (manifestDensity.kind !== "r8-count") {
            throw new Error(`Edited Detail prototype "${prototype.id}" changed its density encoding`);
          }
          manifestDensity.sha256 = await sha256TerrainBytes(density);
        }
        const transforms = document.detailTransforms.get(prototype.id);
        const baselineTransforms = baseline.detailTransforms.get(prototype.id);
        if (
          prototype.exactTransforms &&
          transforms &&
          !sameOptionalTypedArray(transforms.values, baselineTransforms?.values)
        ) {
          if (!baselinePrototype?.exactTransforms) generatedResources.set(prototype.exactTransforms.data.url, "Buffer");
          const bytes = encodeDetailTransforms(transforms.values);
          virtual.set(prototype.exactTransforms.data.url, bytes);
          manifest.detailPrototypes[prototypeIndex].exactTransforms = {
            ...prototype.exactTransforms,
            count: transforms.count,
            sha256: await sha256TerrainBytes(bytes)
          };
        }
        if (prototype.maximumSourceCount > 0 && prototype.prefab) {
          for (const meshUrl of resolveDetailPrefabMeshUrls(
            requireEntry(virtual, prototype.prefab.url),
            prototype.id
          )) {
            retainedMeshDataUrls.add(meshUrl);
          }
        }
      }
      virtual.set(document.descriptor.manifest.url, encodeTerrainCanonicalJson(manifest));
    }
    const project = cloneJson(this._project);
    let retainedMeshDataChanged = false;
    for (const file of project.files) {
      if (!retainedMeshDataUrls.has(file.virtualPath)) continue;
      if (file.params?.keepMeshData !== true) retainedMeshDataChanged = true;
      file.params = { ...file.params, keepMeshData: true };
    }
    const declaredVirtualPaths = new Set(project.files.map((file) => file.virtualPath));
    for (const [virtualPath, type] of [...generatedResources].sort(([left], [right]) =>
      compareStableStrings(left, right)
    )) {
      if (declaredVirtualPaths.has(virtualPath)) continue;
      const identity = (await sha256TerrainBytes(textEncoder.encode(virtualPath))).slice(0, 16);
      project.files.push({
        id: `asset-${identity}`,
        virtualPath,
        path: `public/${virtualPath}`,
        type
      });
      declaredVirtualPaths.add(virtualPath);
    }
    const projectBytes =
      this._projectChanged || generatedResources.size > 0 || retainedMeshDataChanged
        ? encodeTerrainCanonicalJson(project)
        : requireEntry(this._originalPhysical, "project.json");
    virtual.set("project.json", projectBytes);
    const world = cloneJson(this._world);
    virtual.set(TERRAIN_WORLD_INDEX_PATH, encodeTerrainCanonicalJson(world));
    world.contentHash = await hashTerrainProjectClosure(virtual);
    virtual.set(TERRAIN_WORLD_INDEX_PATH, encodeTerrainCanonicalJson(world));

    const physical = new Map<string, Uint8Array>([["project.json", projectBytes]]);
    for (const file of project.files) physical.set(file.path, requireEntry(virtual, file.virtualPath));
    const indexed = indexTerrainProjectArtifact(physical);
    await importTerrainProject(indexed);
    return new ImmutableArtifactEntries(physical);
  }

  private _commitCommand(command: TerrainEditorCommand, candidates: TerrainProjectDocument[]): void {
    const afterState = this._nextState++;
    this._documents = candidates;
    this._undoStack.push({ command, beforeState: this._currentState, afterState });
    this._redoStack.length = 0;
    this._currentState = afterState;
    this._refreshDirtyRegions(commandRegionIds(command));
    this._revision++;
  }

  private _refreshDirtyRegions(regionIds: readonly string[]): void {
    const documentsById = new Map(this._documents.map((document) => [document.descriptor.id, document]));
    for (const regionId of regionIds) {
      const current = documentsById.get(regionId);
      const baseline = this._baselineDocuments.get(regionId);
      if (!current || !baseline) throw new Error(`Terrain editor command references unknown Region "${regionId}"`);
      if (sameEditableDocument(current, baseline)) this._dirtyRegionIds.delete(regionId);
      else this._dirtyRegionIds.add(regionId);
    }
  }
}

interface TerrainEditorPreviewPrefabRef {
  readonly url?: unknown;
  readonly key?: unknown;
}

interface TerrainEditorPreviewPrefabComponent {
  readonly type?: unknown;
  readonly props?: {
    readonly mesh?: { readonly $ref?: unknown };
    readonly geometry?: unknown;
  };
}

interface TerrainEditorPreviewPrefabEntity {
  readonly children?: unknown;
  readonly components?: unknown;
}

interface TerrainEditorPreviewPrefab {
  readonly refs?: unknown;
  readonly entities?: unknown;
  readonly components?: unknown;
  readonly root?: unknown;
}

function resolvePrefabPreviewMeshRefs(prefab: TerrainEditorPreviewPrefab): readonly TerrainEditorPreviewPrefabRef[] {
  const refs = Array.isArray(prefab.refs) ? (prefab.refs as TerrainEditorPreviewPrefabRef[]) : [];
  const entities = Array.isArray(prefab.entities) ? (prefab.entities as TerrainEditorPreviewPrefabEntity[]) : [];
  const components = Array.isArray(prefab.components)
    ? (prefab.components as TerrainEditorPreviewPrefabComponent[])
    : [];
  if (!Number.isInteger(prefab.root) || (prefab.root as number) < 0 || (prefab.root as number) >= entities.length) {
    return refs.filter(hasPreviewAssetUrl);
  }
  const geometry = components
    .map((component) => component.props?.geometry)
    .find((candidate): candidate is TerrainEditorPreviewGeometry => isPreviewGeometry(candidate));
  const renderers = geometry
    ? geometry.kind === "lod-group"
      ? (geometry.lodGroup.lods[0]?.renderers ?? [])
      : geometry.renderers
    : [];
  const meshRefs: TerrainEditorPreviewPrefabRef[] = [];
  for (const renderer of renderers) {
    const entity = resolvePreviewEntity(entities, prefab.root as number, renderer.entityPath);
    if (!entity || !Array.isArray(entity.components)) continue;
    const rendererComponents = (entity.components as unknown[])
      .filter((index): index is number => Number.isInteger(index) && (index as number) >= 0)
      .map((index) => components[index])
      .filter((component) => component?.type === "MeshRenderer");
    const component = rendererComponents[renderer.componentIndex];
    const refIndex = component?.props?.mesh?.$ref;
    if (!Number.isInteger(refIndex) || (refIndex as number) < 0 || (refIndex as number) >= refs.length) continue;
    const reference = refs[refIndex as number];
    if (isGltfMeshRef(reference)) meshRefs.push(reference);
  }
  return meshRefs.length > 0 ? meshRefs : refs.filter(hasPreviewAssetUrl);
}

interface TerrainEditorPreviewRendererBinding {
  readonly entityPath: readonly number[];
  readonly componentIndex: number;
}

type TerrainEditorPreviewGeometry =
  | { readonly kind: "renderers"; readonly renderers: readonly TerrainEditorPreviewRendererBinding[] }
  | {
      readonly kind: "lod-group";
      readonly lodGroup: {
        readonly lods: readonly { readonly renderers: readonly TerrainEditorPreviewRendererBinding[] }[];
      };
    };

function isPreviewGeometry(value: unknown): value is TerrainEditorPreviewGeometry {
  if (!value || typeof value !== "object") return false;
  const geometry = value as {
    kind?: unknown;
    renderers?: unknown;
    lodGroup?: { lods?: unknown };
  };
  if (geometry.kind === "renderers") return Array.isArray(geometry.renderers);
  return geometry.kind === "lod-group" && Array.isArray(geometry.lodGroup?.lods);
}

function resolvePreviewEntity(
  entities: readonly TerrainEditorPreviewPrefabEntity[],
  rootIndex: number,
  path: readonly number[]
): TerrainEditorPreviewPrefabEntity | null {
  let entityIndex = rootIndex;
  for (const childIndex of path) {
    const children = entities[entityIndex]?.children;
    if (!Array.isArray(children) || !Number.isInteger(childIndex)) return null;
    const nextIndex = children[childIndex];
    if (!Number.isInteger(nextIndex) || (nextIndex as number) < 0 || (nextIndex as number) >= entities.length) {
      return null;
    }
    entityIndex = nextIndex as number;
  }
  return entities[entityIndex] ?? null;
}

function isGltfMeshRef(reference: TerrainEditorPreviewPrefabRef): boolean {
  return (
    typeof reference.url === "string" &&
    typeof reference.key === "string" &&
    /^meshes\[\d+\]\[\d+\]$/.test(reference.key)
  );
}

function hasPreviewAssetUrl(reference: TerrainEditorPreviewPrefabRef): boolean {
  return typeof reference.url === "string";
}

function closeExplicitHeightSeams(
  world: TerrainProjectWorldIndex,
  sources: readonly TerrainProjectDocument[],
  candidates: readonly TerrainProjectDocument[],
  stroke: TerrainHeightBrushStroke,
  changedIndices: Map<string, Set<number>>
): void {
  closeExplicitHeightSeamsFromStamps(
    world,
    sources,
    candidates,
    stroke,
    resampleTerrainHeightBrushPath(stroke.points, stroke.spacingMetres),
    changedIndices
  );
}

function closeExplicitHeightSeamsFromStamps(
  world: TerrainProjectWorldIndex,
  sources: readonly TerrainProjectDocument[],
  candidates: readonly TerrainProjectDocument[],
  stroke: TerrainHeightBrushStroke,
  stamps: readonly TerrainHeightBrushPoint[],
  changedIndices: Map<string, Set<number>>
): void {
  const sourceById = new Map(sources.map((document) => [document.descriptor.id, document]));
  const candidateById = new Map(candidates.map((document) => [document.descriptor.id, document]));
  for (const seam of world.heightSeams) {
    const firstSource = sourceById.get(seam.first.regionId)!;
    const secondSource = sourceById.get(seam.second.regionId)!;
    const firstCandidate = candidateById.get(seam.first.regionId)!;
    const secondCandidate = candidateById.get(seam.second.regionId)!;
    if (
      !edgeRangeChanged(seam.first, firstSource, firstCandidate) &&
      !edgeRangeChanged(seam.second, secondSource, secondCandidate)
    ) {
      continue;
    }

    const [start, end] = seamWorldRange(seam.first, firstSource);
    const commonPositions = intersectPositions(
      edgeSamplePositions(seam.first, firstSource).filter((position) => inClosedRange(position, start, end)),
      edgeSamplePositions(seam.second, secondSource).filter((position) => inClosedRange(position, start, end))
    );
    const knotPositions = commonPositions.length > 0 ? commonPositions : [start, end];
    const knots = knotPositions.map((position) => ({
      position,
      delta: terrainHeightBrushDeltaAt(stroke, stamps, ...seamWorldPoint(seam.first, firstSource, position))
    }));
    if (firstCandidate.heightmap === firstSource.heightmap) firstCandidate.heightmap = firstSource.heightmap.slice();
    if (secondCandidate.heightmap === secondSource.heightmap)
      secondCandidate.heightmap = secondSource.heightmap.slice();
    projectEdgeDelta(seam.first, firstSource, firstCandidate, start, end, knots, changedIndices);
    projectEdgeDelta(seam.second, secondSource, secondCandidate, start, end, knots, changedIndices);
  }
}

function projectEdgeDelta(
  side: TerrainProjectSeamSide,
  source: TerrainProjectDocument,
  candidate: TerrainProjectDocument,
  rangeStart: number,
  rangeEnd: number,
  knots: ReadonlyArray<{ position: number; delta: number }>,
  changedIndices: Map<string, Set<number>>
): void {
  const positions = edgeSamplePositions(side, source);
  const first = supportIndex(positions, rangeStart, "floor");
  const last = supportIndex(positions, rangeEnd, "ceil");
  for (let edgeIndex = first; edgeIndex <= last; edgeIndex++) {
    const rasterIndex = edgeRasterIndex(side, source, edgeIndex);
    const sourceHeight = decodeTerrainHeightSample(source, source.heightmap[rasterIndex]);
    candidate.heightmap[rasterIndex] = encodeTerrainHeightMetres(
      candidate,
      sourceHeight + interpolateProjectedDelta(knots, positions[edgeIndex])
    );
    let indices = changedIndices.get(source.descriptor.id);
    if (!indices) {
      indices = new Set();
      changedIndices.set(source.descriptor.id, indices);
    }
    indices.add(rasterIndex);
  }
}

function edgeRangeChanged(
  side: TerrainProjectSeamSide,
  source: TerrainProjectDocument,
  candidate: TerrainProjectDocument
): boolean {
  const [start, end] = seamWorldRange(side, source);
  const positions = edgeSamplePositions(side, source);
  const first = supportIndex(positions, start, "floor");
  const last = supportIndex(positions, end, "ceil");
  for (let index = first; index <= last; index++) {
    const rasterIndex = edgeRasterIndex(side, source, index);
    if (source.heightmap[rasterIndex] !== candidate.heightmap[rasterIndex]) return true;
  }
  return false;
}

function seamWorldRange(side: TerrainProjectSeamSide, document: TerrainProjectDocument): [number, number] {
  const tangentOrigin = side.edge.endsWith("x")
    ? document.descriptor.worldPosition[2]
    : document.descriptor.worldPosition[0];
  return [tangentOrigin + side.rangeMetres[0], tangentOrigin + side.rangeMetres[1]];
}

function edgeSamplePositions(side: TerrainProjectSeamSide, document: TerrainProjectDocument): number[] {
  const tangentOrigin = side.edge.endsWith("x")
    ? document.descriptor.worldPosition[2]
    : document.descriptor.worldPosition[0];
  const tangentExtent = side.edge.endsWith("x") ? document.descriptor.worldSize[2] : document.descriptor.worldSize[0];
  const count = side.edge.endsWith("x")
    ? document.manifest.heightmap.sampleSize[1]
    : document.manifest.heightmap.sampleSize[0];
  return Array.from({ length: count }, (_, index) => tangentOrigin + (index / (count - 1)) * tangentExtent);
}

function edgeRasterIndex(side: TerrainProjectSeamSide, document: TerrainProjectDocument, edgeIndex: number): number {
  const [width, height] = document.manifest.heightmap.sampleSize;
  switch (side.edge) {
    case "min-x":
      return edgeIndex * width;
    case "max-x":
      return edgeIndex * width + width - 1;
    case "min-z":
      return edgeIndex;
    case "max-z":
      return (height - 1) * width + edgeIndex;
  }
}

function seamWorldPoint(
  side: TerrainProjectSeamSide,
  document: TerrainProjectDocument,
  tangent: number
): [worldX: number, worldZ: number] {
  const x = document.descriptor.worldPosition[0];
  const z = document.descriptor.worldPosition[2];
  switch (side.edge) {
    case "min-x":
      return [x, tangent];
    case "max-x":
      return [x + document.descriptor.worldSize[0], tangent];
    case "min-z":
      return [tangent, z];
    case "max-z":
      return [tangent, z + document.descriptor.worldSize[2]];
  }
}

function supportIndex(positions: readonly number[], value: number, direction: "floor" | "ceil"): number {
  const spacing = positions[1] - positions[0];
  const exact = (value - positions[0]) / spacing;
  const index =
    direction === "floor"
      ? Math.floor(exact + SEAM_POSITION_EPSILON_METRES)
      : Math.ceil(exact - SEAM_POSITION_EPSILON_METRES);
  return Math.min(positions.length - 1, Math.max(0, index));
}

function intersectPositions(first: readonly number[], second: readonly number[]): number[] {
  const result: number[] = [];
  for (const left of first) {
    const right = second.find((candidate) => Math.abs(candidate - left) <= SEAM_POSITION_EPSILON_METRES);
    if (right !== undefined) result.push((left + right) * 0.5);
  }
  return result;
}

function inClosedRange(value: number, start: number, end: number): boolean {
  return value >= start - SEAM_POSITION_EPSILON_METRES && value <= end + SEAM_POSITION_EPSILON_METRES;
}

function interpolateProjectedDelta(
  knots: ReadonlyArray<{ position: number; delta: number }>,
  position: number
): number {
  if (knots.length === 1) return knots[0].delta;
  let rightIndex = knots.findIndex((knot) => knot.position >= position);
  if (rightIndex <= 0) rightIndex = 1;
  if (rightIndex < 0) rightIndex = knots.length - 1;
  const left = knots[rightIndex - 1];
  const right = knots[rightIndex];
  const ratio = (position - left.position) / (right.position - left.position);
  return left.delta + (right.delta - left.delta) * ratio;
}

function createCommand(
  sources: readonly TerrainProjectDocument[],
  candidates: readonly TerrainProjectDocument[],
  changedIndices: ReadonlyMap<string, ReadonlySet<number>>,
  surfaceChanges: ReadonlyMap<string, TerrainHeightSurfaceChanges>
): TerrainHeightCommand | null {
  const sourcesById = new Map(sources.map((document) => [document.descriptor.id, document]));
  const candidatesById = new Map(candidates.map((document) => [document.descriptor.id, document]));
  const regions: TerrainHeightRegionCommand[] = [];
  for (const [regionId, indices] of changedIndices) {
    const source = sourcesById.get(regionId)!;
    const candidate = candidatesById.get(regionId)!;
    const changes: TerrainHeightBrushSampleChange[] = [];
    for (const index of [...indices].sort((left, right) => left - right)) {
      const before = source.heightmap[index];
      const after = candidate.heightmap[index];
      if (before !== after) changes.push(Object.freeze({ index, before, after }));
    }
    if (changes.length > 0) {
      const surface = surfaceChanges.get(regionId) ?? EMPTY_TERRAIN_HEIGHT_SURFACE_CHANGES;
      regions.push(
        Object.freeze({
          regionId,
          changes: Object.freeze(changes),
          treeHeightChanges: surface.treeHeightChanges,
          detailHeightChanges: surface.detailHeightChanges,
          objectHeightChanges: surface.objectHeightChanges
        })
      );
    }
  }
  if (regions.length === 0) return null;
  regions.sort((left, right) => compareStableStrings(left.regionId, right.regionId));
  return Object.freeze({ kind: "height", regions: Object.freeze(regions) });
}

function resnapChangedTerrainSurfaces(
  candidateDocuments: TerrainProjectDocument[],
  changedIndices: ReadonlyMap<string, ReadonlySet<number>>
): Map<string, TerrainHeightSurfaceChanges> {
  const surfaceChanges = new Map<string, TerrainHeightSurfaceChanges>();
  for (let index = 0; index < candidateDocuments.length; index++) {
    const candidate = candidateDocuments[index];
    const indices = changedIndices.get(candidate.descriptor.id);
    if (!indices) continue;
    const snapped = resnapTerrainSurfaceInstances(candidate, indices);
    candidateDocuments[index] = snapped.document;
    surfaceChanges.set(candidate.descriptor.id, snapped.changes);
  }
  return surfaceChanges;
}

function applyEditorCommand(
  documents: readonly TerrainProjectDocument[],
  command: TerrainEditorCommand,
  value: "before" | "after"
): TerrainProjectDocument[] {
  switch (command.kind) {
    case "height":
      return applyHeightCommand(documents, command, value);
    case "texture":
      return applyTextureCommand(documents, command, value);
    case "detail":
      return applyDetailCommand(documents, command, value);
    case "tree":
      return applyTreeCommand(documents, command, value);
    case "object":
      return applyObjectCommand(documents, command, value);
  }
}

function applyHeightCommand(
  documents: readonly TerrainProjectDocument[],
  command: TerrainHeightCommand,
  value: "before" | "after"
): TerrainProjectDocument[] {
  const candidates = documents.slice();
  const candidateById = new Map(candidates.map((document) => [document.descriptor.id, document]));
  for (const region of command.regions) {
    const source = candidateById.get(region.regionId);
    if (!source) throw new Error(`Terrain height command references unknown Region "${region.regionId}"`);
    let document: TerrainProjectDocument = { ...source, heightmap: source.heightmap.slice() };
    for (const change of region.changes) document.heightmap[change.index] = change[value];
    if (region.treeHeightChanges.length > 0) {
      const treeInstances = [...document.manifest.treeInstances];
      for (const change of region.treeHeightChanges) {
        const instance = treeInstances[change.index];
        if (!instance) throw new Error(`Terrain height command references missing tree instance ${change.index}`);
        treeInstances[change.index] = {
          ...instance,
          localPosition: [instance.localPosition[0], change[value], instance.localPosition[2]]
        };
      }
      document = {
        ...document,
        manifest: deepFreeze({ ...document.manifest, treeInstances })
      };
    }
    if (region.detailHeightChanges.length > 0) {
      const detailTransforms = new Map(document.detailTransforms);
      for (const prototype of region.detailHeightChanges) {
        const sourceTransforms = detailTransforms.get(prototype.prototypeId);
        if (!sourceTransforms) {
          throw new Error(`Terrain height command references missing Detail transforms "${prototype.prototypeId}"`);
        }
        const values = sourceTransforms.values.slice();
        for (const change of prototype.changes) {
          const offset = change.index * 6 + 1;
          if (offset >= values.length) {
            throw new Error(`Terrain height command references missing Detail transform ${change.index}`);
          }
          values[offset] = change[value];
        }
        detailTransforms.set(prototype.prototypeId, { count: sourceTransforms.count, values });
      }
      document = { ...document, detailTransforms };
    }
    if (region.objectHeightChanges.length > 0) {
      const placedPrefabInstances = [...(document.manifest.placedPrefabInstances ?? [])];
      for (const change of region.objectHeightChanges) {
        const instance = placedPrefabInstances[change.index];
        if (!instance) throw new Error(`Terrain height command references missing object instance ${change.index}`);
        placedPrefabInstances[change.index] = {
          ...instance,
          localPosition: [instance.localPosition[0], change[value], instance.localPosition[2]]
        };
      }
      document = {
        ...document,
        manifest: deepFreeze({ ...document.manifest, placedPrefabInstances })
      };
    }
    const documentIndex = candidates.findIndex((candidate) => candidate.descriptor.id === region.regionId);
    candidates[documentIndex] = document;
    candidateById.set(region.regionId, document);
  }
  return candidates;
}

interface TerrainHeightSurfaceChanges {
  readonly treeHeightChanges: readonly TerrainSurfaceHeightChange[];
  readonly detailHeightChanges: readonly TerrainDetailHeightChanges[];
  readonly objectHeightChanges: readonly TerrainSurfaceHeightChange[];
}

const EMPTY_TERRAIN_HEIGHT_SURFACE_CHANGES: TerrainHeightSurfaceChanges = Object.freeze({
  treeHeightChanges: Object.freeze([]),
  detailHeightChanges: Object.freeze([]),
  objectHeightChanges: Object.freeze([])
});

function resnapTerrainSurfaceInstances(
  document: TerrainProjectDocument,
  changedIndices: ReadonlySet<number>
): {
  document: TerrainProjectDocument;
  changes: TerrainHeightSurfaceChanges;
} {
  const origin = document.descriptor.worldPosition;
  const affectedBounds = heightSampleChangeBounds(document, changedIndices);
  const treeHeightChanges: TerrainSurfaceHeightChange[] = [];
  const treeInstances = document.manifest.treeInstances.map((instance, index) => {
    const worldX = origin[0] + instance.localPosition[0];
    const worldZ = origin[2] + instance.localPosition[2];
    if (!pointWithinHeightChangeBounds(affectedBounds, worldX, worldZ)) return instance;
    const worldY = sampleTerrainDocumentHeight(document, worldX, worldZ);
    if (worldY === null) return instance;
    const after = Math.fround(worldY - origin[1]);
    const before = instance.localPosition[1];
    if (after === before) return instance;
    treeHeightChanges.push(Object.freeze({ index, before, after }));
    return {
      ...instance,
      localPosition: [instance.localPosition[0], after, instance.localPosition[2]] as [number, number, number]
    };
  });

  const detailTransforms = new Map(document.detailTransforms);
  const detailHeightChanges: TerrainDetailHeightChanges[] = [];
  for (const [prototypeId, source] of document.detailTransforms) {
    let values: Float32Array | null = null;
    const changes: TerrainSurfaceHeightChange[] = [];
    for (let record = 0; record < source.count; record++) {
      const offset = record * 6;
      const worldX = origin[0] + source.values[offset];
      const worldZ = origin[2] + source.values[offset + 2];
      if (!pointWithinHeightChangeBounds(affectedBounds, worldX, worldZ)) continue;
      const worldY = sampleTerrainDocumentHeight(document, worldX, worldZ);
      if (worldY === null) continue;
      const after = Math.fround(worldY - origin[1]);
      const before = source.values[offset + 1];
      if (after === before) continue;
      values ??= source.values.slice();
      values[offset + 1] = after;
      changes.push(Object.freeze({ index: record, before, after }));
    }
    if (!values) continue;
    detailTransforms.set(prototypeId, { count: source.count, values });
    detailHeightChanges.push(Object.freeze({ prototypeId, changes: Object.freeze(changes) }));
  }
  detailHeightChanges.sort((left, right) => compareStableStrings(left.prototypeId, right.prototypeId));

  const objectHeightChanges: TerrainSurfaceHeightChange[] = [];
  const placedPrefabInstances = (document.manifest.placedPrefabInstances ?? []).map((instance, index) => {
    const worldX = origin[0] + instance.localPosition[0];
    const worldZ = origin[2] + instance.localPosition[2];
    if (!pointWithinHeightChangeBounds(affectedBounds, worldX, worldZ)) return instance;
    const worldY = sampleTerrainDocumentHeight(document, worldX, worldZ);
    if (worldY === null) return instance;
    const after = Math.fround(worldY - origin[1]);
    const before = instance.localPosition[1];
    if (after === before) return instance;
    objectHeightChanges.push(Object.freeze({ index, before, after }));
    return {
      ...instance,
      localPosition: [instance.localPosition[0], after, instance.localPosition[2]] as [number, number, number]
    };
  });

  const changedTrees = treeHeightChanges.length > 0;
  const changedDetails = detailHeightChanges.length > 0;
  const changedObjects = objectHeightChanges.length > 0;
  return {
    document:
      changedTrees || changedDetails || changedObjects
        ? {
            ...document,
            ...(changedTrees || changedObjects
              ? {
                  manifest: deepFreeze({
                    ...document.manifest,
                    ...(changedTrees ? { treeInstances } : {}),
                    ...(changedObjects ? { placedPrefabInstances } : {})
                  })
                }
              : {}),
            ...(changedDetails ? { detailTransforms } : {})
          }
        : document,
    changes: Object.freeze({
      treeHeightChanges: Object.freeze(treeHeightChanges),
      detailHeightChanges: Object.freeze(detailHeightChanges),
      objectHeightChanges: Object.freeze(objectHeightChanges)
    })
  };
}

interface TerrainHeightChangeWorldBounds {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

function heightSampleChangeBounds(
  document: TerrainProjectDocument,
  changedIndices: ReadonlySet<number>
): TerrainHeightChangeWorldBounds {
  const [width, height] = document.manifest.heightmap.sampleSize;
  let minSampleX = width - 1;
  let minSampleZ = height - 1;
  let maxSampleX = 0;
  let maxSampleZ = 0;
  for (const index of changedIndices) {
    const sampleX = index % width;
    const sampleZ = Math.floor(index / width);
    minSampleX = Math.min(minSampleX, sampleX);
    minSampleZ = Math.min(minSampleZ, sampleZ);
    maxSampleX = Math.max(maxSampleX, sampleX);
    maxSampleZ = Math.max(maxSampleZ, sampleZ);
  }
  const origin = document.descriptor.worldPosition;
  const extent = document.descriptor.worldSize;
  const minCellX = Math.max(0, minSampleX - 1);
  const minCellZ = Math.max(0, minSampleZ - 1);
  return {
    minX: origin[0] + (minCellX / (width - 1)) * extent[0],
    minZ: origin[2] + (minCellZ / (height - 1)) * extent[2],
    maxX: origin[0] + (maxSampleX / (width - 1)) * extent[0],
    maxZ: origin[2] + (maxSampleZ / (height - 1)) * extent[2]
  };
}

function pointWithinHeightChangeBounds(
  bounds: TerrainHeightChangeWorldBounds,
  worldX: number,
  worldZ: number
): boolean {
  return worldX >= bounds.minX && worldX <= bounds.maxX && worldZ >= bounds.minZ && worldZ <= bounds.maxZ;
}

function attachRegionToHeightPatch(
  regionId: string,
  patch: TerrainHeightBrushPatch | null
): TerrainEditorHeightPatch | null {
  return patch ? { regionId, ...patch } : null;
}

function createHeightPatchFromIndices(
  heightmap: Uint16Array,
  sampleSize: readonly [width: number, height: number],
  indices: readonly number[]
): TerrainHeightBrushPatch {
  const [sampleWidth, sampleHeight] = sampleSize;
  if (indices.length === 0) throw new Error("Terrain height patch requires at least one changed sample");
  let minX = sampleWidth - 1;
  let minZ = sampleHeight - 1;
  let maxX = 0;
  let maxZ = 0;
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= sampleWidth * sampleHeight) {
      throw new Error(`Terrain height patch sample index ${index} is outside ${sampleWidth}x${sampleHeight}`);
    }
    const x = index % sampleWidth;
    const z = Math.floor(index / sampleWidth);
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  }
  const width = maxX - minX + 1;
  const height = maxZ - minZ + 1;
  const samples = new Uint16Array(width * height);
  for (let z = 0; z < height; z++) {
    const sourceStart = (minZ + z) * sampleWidth + minX;
    samples.set(heightmap.subarray(sourceStart, sourceStart + width), z * width);
  }
  return { sampleOrigin: [minX, minZ], sampleSize: [width, height], samples };
}

function createTexturePatchFromIndices(
  alphamap: Uint8Array,
  sampleSize: readonly [width: number, height: number],
  mapIndex: number,
  indices: readonly number[]
): TerrainTextureBrushPatch {
  const [sampleWidth, sampleHeight] = sampleSize;
  if (indices.length === 0) throw new Error("Terrain texture patch requires at least one changed byte");
  if (alphamap.length !== sampleWidth * sampleHeight * 4) {
    throw new Error(`Terrain Alphamap ${mapIndex} payload does not match ${sampleWidth}x${sampleHeight} RGBA8`);
  }
  let minX = sampleWidth - 1;
  let minZ = sampleHeight - 1;
  let maxX = 0;
  let maxZ = 0;
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= alphamap.length) {
      throw new Error(`Terrain Alphamap ${mapIndex} byte index ${index} is outside its payload`);
    }
    const texel = Math.floor(index / 4);
    const x = texel % sampleWidth;
    const z = Math.floor(texel / sampleWidth);
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  }
  const width = maxX - minX + 1;
  const height = maxZ - minZ + 1;
  const pixels = new Uint8Array(width * height * 4);
  for (let z = 0; z < height; z++) {
    const sourceStart = ((minZ + z) * sampleWidth + minX) * 4;
    pixels.set(alphamap.subarray(sourceStart, sourceStart + width * 4), z * width * 4);
  }
  return { mapIndex, sampleOrigin: [minX, minZ], sampleSize: [width, height], pixels };
}

function applyTreeResult(source: TerrainProjectDocument, result: TerrainTreeBrushResult): TerrainProjectDocument {
  return {
    ...source,
    manifest: deepFreeze({ ...source.manifest, treeInstances: [...result.instances] })
  };
}

function applyObjectResult(source: TerrainProjectDocument, result: TerrainObjectBrushResult): TerrainProjectDocument {
  return {
    ...source,
    manifest: deepFreeze({ ...source.manifest, placedPrefabInstances: [...result.instances] })
  };
}

function applyTextureCommand(
  documents: readonly TerrainProjectDocument[],
  command: TerrainTextureCommand,
  value: "before" | "after"
): TerrainProjectDocument[] {
  const candidates = documents.slice();
  for (const region of command.regions) {
    const documentIndex = candidates.findIndex((document) => document.descriptor.id === region.regionId);
    const source = candidates[documentIndex];
    if (!source) throw new Error(`Terrain texture command references unknown Region "${region.regionId}"`);
    const alphamaps = [...source.alphamaps];
    for (const map of region.maps) {
      const edited = alphamaps[map.mapIndex].slice();
      for (const change of map.changes) edited[change.index] = change[value];
      alphamaps[map.mapIndex] = edited;
    }
    candidates[documentIndex] = { ...source, alphamaps: Object.freeze(alphamaps) };
  }
  return candidates;
}

function applyDetailCommand(
  documents: readonly TerrainProjectDocument[],
  command: TerrainDetailCommand,
  value: "before" | "after"
): TerrainProjectDocument[] {
  const candidates = documents.slice();
  for (const region of command.regions) {
    const documentIndex = candidates.findIndex((document) => document.descriptor.id === region.regionId);
    const source = candidates[documentIndex];
    if (!source) throw new Error(`Terrain Detail command references unknown Region "${region.regionId}"`);
    const prototype = value === "before" ? region.beforePrototype : region.afterPrototype;
    const density =
      source.detailMaps.get(region.prototypeId)?.slice() ??
      new Uint8Array(prototype.densitySampleSize[0] * prototype.densitySampleSize[1]);
    for (const change of region.changes) density[change.index] = change[value];
    const detailMaps = new Map(source.detailMaps);
    if (prototype.density.kind === "r8-count") detailMaps.set(region.prototypeId, density);
    else detailMaps.delete(region.prototypeId);
    const detailTransforms = new Map(source.detailTransforms);
    const transformValues = value === "before" ? region.beforeTransforms : region.afterTransforms;
    if (transformValues)
      detailTransforms.set(region.prototypeId, { count: transformValues.length / 6, values: transformValues });
    else detailTransforms.delete(region.prototypeId);
    const detailPrototypes = source.manifest.detailPrototypes.map((candidate) =>
      candidate.id === region.prototypeId ? prototype : candidate
    );
    candidates[documentIndex] = {
      ...source,
      manifest: deepFreeze({ ...source.manifest, detailPrototypes }),
      detailMaps,
      detailTransforms
    };
  }
  return candidates;
}

function applyTreeCommand(
  documents: readonly TerrainProjectDocument[],
  command: TerrainTreeCommand,
  value: "before" | "after"
): TerrainProjectDocument[] {
  const candidates = documents.slice();
  for (const region of command.regions) {
    const documentIndex = candidates.findIndex((document) => document.descriptor.id === region.regionId);
    const source = candidates[documentIndex];
    if (!source) throw new Error(`Terrain tree command references unknown Region "${region.regionId}"`);
    candidates[documentIndex] = {
      ...source,
      manifest: deepFreeze({ ...source.manifest, treeInstances: cloneJson([...region[value]]) })
    };
  }
  return candidates;
}

function applyObjectCommand(
  documents: readonly TerrainProjectDocument[],
  command: TerrainObjectCommand,
  value: "before" | "after"
): TerrainProjectDocument[] {
  const candidates = documents.slice();
  for (const region of command.regions) {
    const documentIndex = candidates.findIndex((document) => document.descriptor.id === region.regionId);
    const source = candidates[documentIndex];
    if (!source) throw new Error(`Terrain object command references unknown Region "${region.regionId}"`);
    candidates[documentIndex] = {
      ...source,
      manifest: deepFreeze({ ...source.manifest, placedPrefabInstances: cloneJson([...region[value]]) })
    };
  }
  return candidates;
}

function commandRegionIds(command: TerrainEditorCommand): readonly string[] {
  return command.regions.map((region) => region.regionId);
}

function cloneDocument(document: TerrainProjectDocument): TerrainProjectDocument {
  return {
    descriptor: cloneJson(document.descriptor),
    manifest: cloneJson(document.manifest),
    heightmap: document.heightmap.slice(),
    holes: document.holes.slice(),
    alphamaps: document.alphamaps.map((alphamap) => alphamap.slice()),
    detailMaps: new Map([...document.detailMaps].map(([id, bytes]) => [id, bytes.slice()] as const)),
    detailTransforms: new Map(
      [...document.detailTransforms].map(
        ([id, transforms]) => [id, { count: transforms.count, values: transforms.values.slice() }] as const
      )
    )
  };
}

function ownDocument(document: TerrainProjectDocument): TerrainProjectDocument {
  return {
    descriptor: deepFreeze(cloneJson(document.descriptor)),
    manifest: deepFreeze(cloneJson(document.manifest)),
    heightmap: document.heightmap,
    holes: document.holes,
    alphamaps: Object.freeze([...document.alphamaps]),
    detailMaps: document.detailMaps,
    detailTransforms: document.detailTransforms
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !ArrayBuffer.isView(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function cloneByteEntries(entries: ReadonlyMap<string, Uint8Array>): Map<string, Uint8Array> {
  return new Map([...entries].map(([path, bytes]) => [path, bytes.slice()] as const));
}

function createVirtualEntries(
  physical: ReadonlyMap<string, Uint8Array>,
  project: TerrainProjectFile
): Map<string, Uint8Array> {
  const virtual = new Map<string, Uint8Array>([["project.json", requireEntry(physical, "project.json")]]);
  for (const file of project.files) virtual.set(file.virtualPath, requireEntry(physical, file.path));
  return virtual;
}

function encodeHeightmap(heightmap: Uint16Array): Uint8Array {
  const bytes = new Uint8Array(heightmap.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < heightmap.length; index++) view.setUint16(index * 2, heightmap[index], true);
  return bytes;
}

function encodeDetailTransforms(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(4 + values.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, values.length / 6, true);
  for (let index = 0; index < values.length; index++) view.setFloat32(4 + index * 4, values[index], true);
  return bytes;
}

function createDetailDensityDataUrl(regionId: string, prototypeId: string): string {
  return `Payloads/${encodeURIComponent(regionId)}/detail-${encodeURIComponent(prototypeId)}.r8`;
}

function createDetailTransformsDataUrl(regionId: string, prototypeId: string): string {
  return `Payloads/${encodeURIComponent(regionId)}/detail-${encodeURIComponent(prototypeId)}.f32le`;
}

function stableAssetSeed(assetId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < assetId.length; index++) {
    hash ^= assetId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function resolveDetailPrefabMeshUrls(sourceBytes: Uint8Array, prototypeId: string): string[] {
  const prefab = JSON.parse(textDecoder.decode(sourceBytes)) as {
    refs?: Array<{ url?: string }>;
    entities?: Array<{ components?: number[]; children?: number[]; instance?: { asset?: number } }>;
    components?: Array<{
      type?: string;
      props?: Record<string, unknown>;
      script?: number;
    }>;
    root?: number;
  };
  if (!Array.isArray(prefab.refs) || !Array.isArray(prefab.entities) || !Array.isArray(prefab.components)) {
    throw new Error(`Terrain Detail prototype "${prototypeId}" Prefab is malformed`);
  }
  const metadata = prefab.components.find((component) => {
    const geometry = component.props?.geometry as { kind?: unknown } | undefined;
    return component.type === "Script" && (geometry?.kind === "renderers" || geometry?.kind === "lod-group");
  });
  const geometry = metadata?.props?.geometry as
    | { kind: "renderers"; renderers?: unknown[] }
    | { kind: "lod-group"; lodGroup?: { lods?: Array<{ renderers?: unknown[] }> } }
    | undefined;
  const sourceRenderers =
    geometry?.kind === "renderers" ? geometry.renderers : geometry?.lodGroup?.lods?.[0]?.renderers;
  if (!metadata?.props || !Array.isArray(sourceRenderers) || sourceRenderers.length === 0) {
    throw new Error(`Terrain Detail prototype "${prototypeId}" Prefab has no canonical renderer metadata`);
  }
  const renderers = sourceRenderers.map((source) => {
    if (!source || typeof source !== "object") {
      throw new Error(`Terrain Detail prototype "${prototypeId}" Prefab renderer metadata is malformed`);
    }
    return source as Record<string, unknown>;
  });
  const meshUrls = renderers.map((renderer) => resolvePrefabRendererMeshUrl(prefab, renderer, prototypeId));
  return [...new Set(meshUrls)];
}

function resolvePrefabRendererMeshUrl(
  prefab: {
    refs?: Array<{ url?: string }>;
    entities?: Array<{ components?: number[]; children?: number[]; instance?: { asset?: number } }>;
    components?: Array<{ type?: string; props?: Record<string, unknown> }>;
    root?: number;
  },
  renderer: Record<string, unknown>,
  prototypeId: string
): string {
  const entityPath = renderer.entityPath;
  const componentIndex = renderer.componentIndex;
  if (
    !Array.isArray(entityPath) ||
    entityPath.some((index) => !Number.isInteger(index) || index < 0) ||
    !Number.isInteger(componentIndex) ||
    (componentIndex as number) < 0
  ) {
    throw new Error(`Terrain Detail prototype "${prototypeId}" Prefab renderer selector is malformed`);
  }
  const rootIndex = Number.isInteger(prefab.root) ? (prefab.root as number) : 0;
  let entity = prefab.entities?.[rootIndex];
  for (const childIndex of entityPath as number[]) {
    const instanceUrl = resolvePrefabInstanceUrl(prefab, entity);
    if (instanceUrl) return instanceUrl;
    entity = prefab.entities?.[entity?.children?.[childIndex] ?? -1];
  }
  const instanceUrl = resolvePrefabInstanceUrl(prefab, entity);
  if (instanceUrl) return instanceUrl;
  const componentId = entity?.components?.[componentIndex as number];
  const component = componentId === undefined ? undefined : prefab.components?.[componentId];
  const meshRef = component?.props?.mesh as { $ref?: unknown } | undefined;
  const refIndex = meshRef?.$ref;
  const meshUrl = typeof refIndex === "number" ? prefab.refs?.[refIndex]?.url : undefined;
  if (component?.type !== "MeshRenderer" || typeof meshUrl !== "string" || meshUrl.length === 0) {
    throw new Error(`Terrain Detail prototype "${prototypeId}" Prefab renderer mesh reference is malformed`);
  }
  return meshUrl;
}

function resolvePrefabInstanceUrl(
  prefab: {
    refs?: Array<{ url?: string }>;
  },
  entity: { instance?: { asset?: number } } | undefined
): string | null {
  const asset = entity?.instance?.asset;
  if (!Number.isInteger(asset) || (asset as number) < 0) return null;
  const url = prefab.refs?.[asset as number]?.url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function sameEditableDocument(left: TerrainProjectDocument, right: TerrainProjectDocument): boolean {
  if (!sameTypedArray(left.heightmap, right.heightmap)) return false;
  if (left.alphamaps.length !== right.alphamaps.length) return false;
  for (let index = 0; index < left.alphamaps.length; index++) {
    if (!sameTypedArray(left.alphamaps[index], right.alphamaps[index])) return false;
  }
  if (left.detailMaps.size !== right.detailMaps.size || left.detailTransforms.size !== right.detailTransforms.size) {
    return false;
  }
  for (const [id, bytes] of left.detailMaps) {
    if (!sameOptionalTypedArray(bytes, right.detailMaps.get(id))) return false;
  }
  for (const [id, transforms] of left.detailTransforms) {
    const candidate = right.detailTransforms.get(id);
    if (!candidate || transforms.count !== candidate.count || !sameTypedArray(transforms.values, candidate.values)) {
      return false;
    }
  }
  return JSON.stringify(left.manifest) === JSON.stringify(right.manifest);
}

function sameOptionalTypedArray(
  left: Uint8Array | Float32Array,
  right: Uint8Array | Float32Array | undefined
): boolean {
  return right !== undefined && sameTypedArray(left, right);
}

function sameTypedArray(
  left: Uint8Array | Uint16Array | Float32Array,
  right: Uint8Array | Uint16Array | Float32Array
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requireEntry(entries: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array {
  const bytes = entries.get(path);
  if (!bytes) throw new Error(`Project entry "${path}" is missing`);
  return bytes;
}

function imageMimeType(path: string): "image/png" | "image/jpeg" | "image/webp" | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

function compareStableStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assetCatalogProperty(
  kind: TerrainEditorAssetCatalogEntry["kind"]
): "textures" | "details" | "trees" | "objects" {
  return kind === "texture" ? "textures" : kind === "detail" ? "details" : kind === "tree" ? "trees" : "objects";
}

function allocateRegionAssetId(baseId: string, resourceUrl: string, occupiedIds: ReadonlySet<string>): string {
  if (!occupiedIds.has(baseId)) return baseId;
  let hash = 2166136261;
  for (let index = 0; index < resourceUrl.length; index++) {
    hash ^= resourceUrl.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(16).padStart(8, "0");
  let candidate = `${baseId}-${suffix}`;
  let collision = 1;
  while (occupiedIds.has(candidate)) candidate = `${baseId}-${suffix}-${collision++}`;
  return candidate;
}

class ImmutableArtifactEntries implements TerrainProjectArtifactEntries {
  private readonly _entries: ReadonlyMap<string, Uint8Array>;

  constructor(entries: ReadonlyMap<string, Uint8Array>) {
    this._entries = new Map(entries);
  }

  get size(): number {
    return this._entries.size;
  }

  get(path: string): Uint8Array | undefined {
    return this._entries.get(path)?.slice();
  }

  has(path: string): boolean {
    return this._entries.has(path);
  }

  entries(): MapIterator<[string, Uint8Array]> {
    return cloneByteEntries(this._entries).entries();
  }

  keys(): MapIterator<string> {
    return this._entries.keys();
  }

  values(): MapIterator<Uint8Array> {
    return cloneByteEntries(this._entries).values();
  }

  forEach(
    callback: (value: Uint8Array, key: string, map: ReadonlyMap<string, Uint8Array>) => void,
    thisArg?: unknown
  ): void {
    for (const [path, bytes] of this._entries) callback.call(thisArg, bytes.slice(), path, this);
  }

  [Symbol.iterator](): MapIterator<[string, Uint8Array]> {
    return this.entries();
  }
}
