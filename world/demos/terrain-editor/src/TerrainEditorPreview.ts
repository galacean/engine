import {
  Camera,
  type Component,
  DirectLight,
  type Entity,
  FogMode,
  type InputManager,
  Quaternion,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls/dist/es/OrbitControl.js";
import { ControlHandlerType } from "@galacean/engine-toolkit-controls/dist/es/enums/ControlHandlerType.js";
import type { IControlInput } from "@galacean/engine-toolkit-controls/dist/es/inputDevice/IControlInput.js";
import {
  createTerrainProjectLayerSources,
  createTerrainProjectClipmapDescriptor
} from "@galacean/engine-terrain/terrain/project/TerrainProjectAdapter";
import type {
  TerrainProjectDocument,
  TerrainProjectWorldIndex,
  TerrainProjectWorldRegion
} from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";
import { TerrainProjectClipmapRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectClipmapRuntime";
import { TerrainProjectDetailRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectDetailRuntime";
import { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import { TerrainProjectPlacedPrefabRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectPlacedPrefabRuntime";
import { TerrainProjectAsset } from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import { TerrainProjectWorldRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectRuntime";
import { TerrainProjectTreeRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectTreeRuntime";
import { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import { loadTerrainScene } from "@galacean/engine-terrain/terrain/loader/TerrainSceneLoader";
import type { TerrainProjectArtifactEntries } from "@galacean/engine-terrain/terrain/project/TerrainProjectArtifactAssembler";
import {
  renderTerrainProjectGeometryThumbnail,
  renderTerrainProjectTextureThumbnail
} from "./TerrainAssetThumbnail.ts";
import {
  createTerrainProjectHttpTransport,
  createTerrainProjectObjectUrlTransport,
  type TerrainProjectObjectUrlTransport
} from "./TerrainProjectFolderIO.ts";
import type { TerrainEditorHeightPatch, TerrainEditorSurfacePreviewUpdate } from "./TerrainEditorWorkspace.ts";
import type { TerrainEditorSceneSettingsState } from "./TerrainEditorSceneSettings.ts";
import { TerrainEditorRegionBoundaryView } from "./TerrainEditorRegionBoundaryView.ts";
import { sampleTerrainDocumentHeight } from "@galacean/engine-world-planning/authoring/terrain/TerrainHeightfield";

const FRAME_DISTANCE_RATIO = 0.32;
const FRAME_POLAR_ANGLE_RADIANS = (35 * Math.PI) / 180;
const ORBIT_POLAR_MARGIN_RADIANS = Math.PI / 180;

/** Canonical authoring state required to update the production terrain preview. */
export interface TerrainEditorPreviewState {
  /** Canonical world index whose descriptors define every Region transform. */
  readonly world: TerrainProjectWorldIndex;
  /** Decoded canonical Region documents containing current editor-owned samples. */
  readonly documents: readonly TerrainProjectDocument[];
}

/** Renderer-owned residency that may be rebuilt after a canonical editor transaction. */
export type TerrainEditorPreviewRefreshTarget = "terrain" | "details" | "trees" | "objects";

/** Stable diagnostics for one loaded editor preview. */
export interface TerrainEditorPreviewDiagnostics {
  /** CSS-independent drawing-buffer width and height. */
  readonly drawingBuffer: readonly [width: number, height: number];
  /** Fixed non-performance preview pixel ratio. */
  readonly pixelRatio: number;
  /** Number of Regions resident in the production terrain renderer. */
  readonly activeRegions: number;
  /** Number of ordinary Project Prefab instances currently rendered across active Regions. */
  readonly objectInstances: number;
}

/** Exact RGBA8 drawing-buffer snapshot produced by one deterministic preview frame. */
export interface TerrainEditorPreviewPixelSnapshot {
  /** Drawing-buffer width in physical pixels. */
  readonly width: number;
  /** Drawing-buffer height in physical pixels. */
  readonly height: number;
  /** Bottom-left-origin RGBA8 pixels returned by WebGL. */
  readonly pixels: Uint8Array;
}

/** Stable loading phases emitted while the standard Project and terrain runtimes become ready. */
export type TerrainEditorPreviewLoadPhase = "project" | "terrain" | "scene";

/** One monotonic editor-preview loading update. */
export interface TerrainEditorPreviewLoadProgress {
  /** Overall preview completion in the inclusive `[0,100]` range. */
  readonly percent: number;
  /** Capability currently contributing to the overall percentage. */
  readonly phase: TerrainEditorPreviewLoadPhase;
  /** Completed Project-loader tasks when reported by the engine AssetPromise. */
  readonly loaded?: number;
  /** Total Project-loader tasks when reported by the engine AssetPromise. */
  readonly total?: number;
}

/** Receives monotonic progress while a preview Project is opened. */
export type TerrainEditorPreviewLoadProgressHandler = (progress: TerrainEditorPreviewLoadProgress) => void;

/** Camera interaction modes available in the editor Scene preview. */
export type TerrainEditorPreviewCameraMode = "orbit" | "roam";

interface TerrainEditorPreviewLoadCandidate {
  readonly revision: number;
  transport: TerrainProjectObjectUrlTransport | null;
  engine: WebGLEngine | null;
  resizeObserver: ResizeObserver | null;
}

class TerrainEditorOrbitInput implements IControlInput {
  private _handler = ControlHandlerType.None;
  private readonly _delta = new Vector3();

  push(handler: ControlHandlerType, deltaX: number, deltaY: number): void {
    if (this._handler !== handler) this._delta.set(0, 0, 0);
    this._handler = handler;
    this._delta.x += deltaX;
    this._delta.y += deltaY;
  }

  reset(): void {
    this._handler = ControlHandlerType.None;
    this._delta.set(0, 0, 0);
  }

  onUpdateHandler(_input: InputManager): ControlHandlerType {
    return this._handler;
  }

  onUpdateDelta(_control: Parameters<IControlInput["onUpdateDelta"]>[0], outDelta: Vector3): void {
    outDelta.copyFrom(this._delta);
    this.reset();
  }
}

/**
 * Owns a stock Project/Scene load and a demo-local bridge from canonical editor samples to Geometry Clipmap residency.
 */
export class TerrainEditorPreview {
  private _engine: WebGLEngine | null = null;
  private _transport: TerrainProjectObjectUrlTransport | null = null;
  private _worldRuntime: TerrainProjectWorldRuntime | null = null;
  private _clipmapRuntime: TerrainProjectClipmapRuntime | null = null;
  private _detailRuntime: TerrainProjectDetailRuntime | null = null;
  private _treeRuntime: TerrainProjectTreeRuntime | null = null;
  private _placedPrefabRuntime: TerrainProjectPlacedPrefabRuntime | null = null;
  private _directLight: DirectLight | null = null;
  private _windRuntime: TerrainWindRuntime | null = null;
  private _regionBoundaryView: TerrainEditorRegionBoundaryView | null = null;
  private _camera: Camera | null = null;
  private _orbitControl: OrbitControl | null = null;
  private _navigationRuntime: TerrainNavigationRuntime | null = null;
  private _cameraMode: TerrainEditorPreviewCameraMode = "orbit";
  private _paintingEnabled = true;
  private readonly _orbitInput = new TerrainEditorOrbitInput();
  private readonly _orbitTarget = new Vector3();
  private readonly _roamPosition = new Vector3();
  private readonly _roamRotation = new Quaternion();
  private _hasRoamPose = false;
  private _resizeObserver: ResizeObserver | null = null;
  private _candidate: TerrainEditorPreviewLoadCandidate | null = null;
  private _revision = 0;
  private _thumbnailRenderQueue: Promise<void> = Promise.resolve();

  /**
   * Creates an empty preview owner for one existing canvas.
   * @param canvas Canvas receiving the standard loaded Scene.
   * @param pixelRatio Drawing-buffer scale applied to the preview canvas.
   * @throws If the pixel ratio is non-finite or outside the supported `(0, 2]` range.
   */
  constructor(
    private readonly _canvas: HTMLCanvasElement,
    private readonly _pixelRatio: number
  ) {
    if (!Number.isFinite(_pixelRatio) || _pixelRatio <= 0 || _pixelRatio > 2) {
      throw new Error("Terrain editor preview pixel ratio must be within (0, 2]");
    }
  }

  /** @returns The loaded Scene camera used for world-space pointer picking, or `null` before readiness. */
  get camera(): Camera | null {
    return this._camera;
  }

  /**
   * Replaces the complete preview from one verified physical Project artifact.
   * @param artifact Root `project.json` and declared `public/` files.
   * @param onProgress Optional callback backed by the engine Project AssetPromise and runtime readiness.
   * @returns Diagnostics after the stock Project and Scene loaders and initial terrain residency finish.
   * @throws If the Project cannot load, its Scene is incomplete, or a newer preview operation supersedes this load.
   */
  async open(
    artifact: TerrainProjectArtifactEntries,
    onProgress?: TerrainEditorPreviewLoadProgressHandler
  ): Promise<TerrainEditorPreviewDiagnostics> {
    const revision = this._beginOpen();
    const transport = createTerrainProjectObjectUrlTransport(artifact);
    return this._openProjectTransport(revision, transport, onProgress);
  }

  /**
   * Opens an HTTP-served standard Project without duplicating its complete asset closure into object URLs.
   * @param projectUrl Absolute or document-relative Project URL.
   * @param onProgress Optional callback backed by the engine Project AssetPromise and runtime readiness.
   * @returns Diagnostics after the stock Project and Scene loaders and initial terrain residency finish.
   * @throws If the Project cannot load, its Scene is incomplete, or a newer preview operation supersedes this load.
   */
  async openUrl(
    projectUrl: string | URL,
    onProgress?: TerrainEditorPreviewLoadProgressHandler
  ): Promise<TerrainEditorPreviewDiagnostics> {
    const sourceUrl = new URL(projectUrl, document.baseURI);
    const revision = this._beginOpen();
    let transport: TerrainProjectObjectUrlTransport;
    try {
      transport = await createTerrainProjectHttpTransport(sourceUrl);
    } catch (error) {
      if (revision !== this._revision) throw createSupersededError();
      throw error;
    }
    return this._openProjectTransport(revision, transport, onProgress);
  }

  private async _openProjectTransport(
    revision: number,
    transport: TerrainProjectObjectUrlTransport,
    onProgress?: TerrainEditorPreviewLoadProgressHandler
  ): Promise<TerrainEditorPreviewDiagnostics> {
    const candidate: TerrainEditorPreviewLoadCandidate = {
      revision,
      transport,
      engine: null,
      resizeObserver: null
    };
    if (revision !== this._revision) {
      transport.revoke();
      throw createSupersededError();
    }
    this._candidate = candidate;
    let reportedPercent = -1;
    const reportProgress = (
      percent: number,
      phase: TerrainEditorPreviewLoadPhase,
      loaded?: number,
      total?: number
    ): void => {
      const nextPercent = Math.max(reportedPercent, Math.min(100, Math.max(0, Math.round(percent))));
      if (nextPercent === reportedPercent && loaded === undefined) return;
      reportedPercent = nextPercent;
      onProgress?.({ percent: nextPercent, phase, loaded, total });
    };
    try {
      reportProgress(0, "project");
      const engine = await WebGLEngine.create({ canvas: this._canvas });
      candidate.engine = engine;
      this._requireActiveCandidate(candidate);
      candidate.resizeObserver = this._createResizeObserver(engine);
      await loadTerrainScene(engine, {
        projectUrl: transport.projectUrl,
        scenePath: "Scene/Editor.scene",
        onProgress: (loaded, total, phase) => {
          const ratio = total > 0 ? loaded / total : 0;
          reportProgress(phase === "project" ? ratio * 90 : 90 + ratio * 6, phase === "project" ? "project" : "scene", loaded, total);
        }
      });
      reportProgress(90, "project");
      this._requireActiveCandidate(candidate);

      const roots = engine.sceneManager.activeScene!.rootEntities;
      const worldRuntime = findComponent(roots, TerrainProjectWorldRuntime);
      const clipmapRuntime = findComponent(roots, TerrainProjectClipmapRuntime);
      const detailRuntime = findComponent(roots, TerrainProjectDetailRuntime);
      const treeRuntime = findComponent(roots, TerrainProjectTreeRuntime);
      const placedPrefabRuntime = findComponent(roots, TerrainProjectPlacedPrefabRuntime);
      const directLight = findComponent(roots, DirectLight);
      const windRuntime = findComponent(roots, TerrainWindRuntime);
      const camera = findComponent(roots, Camera);
      const navigationRuntime = findComponent(roots, TerrainNavigationRuntime);
      if (!worldRuntime || !clipmapRuntime || !camera || !navigationRuntime) {
        throw new Error("Terrain editor preview Scene is missing its world, Clipmap, camera, or navigation component");
      }
      treeRuntime?.setWindRuntime(windRuntime);
      const authoredRoamPosition = camera.entity.transform.worldPosition.clone();
      const authoredRoamRotation = camera.entity.transform.worldRotationQuaternion.clone();

      const orbitControl = camera.entity.getComponent(OrbitControl) ?? camera.entity.addComponent(OrbitControl);
      orbitControl.enableDamping = false;
      orbitControl.enableKeys = false;
      orbitControl.inputDevices = [this._orbitInput];
      orbitControl.zoomSpeed *= 0.25;
      orbitControl.minDistance = 2;
      orbitControl.maxDistance = 5000;
      orbitControl.enabled = true;
      navigationRuntime.floorMock = false;
      navigationRuntime.rotationEnabled = false;
      navigationRuntime.enabled = false;
      navigationRuntime.setInputEnabled(false);
      navigationRuntime.setGroundProvider({
        sampleHeightInterpolated(worldX, worldZ) {
          for (const asset of worldRuntime.getAssets()) {
            const height = sampleTerrainDocumentHeight(asset.document, worldX, worldZ);
            if (height !== null) return height;
          }
          return undefined;
        }
      });
      navigationRuntime.setGroundCollision(false);

      engine.run();
      const clipmap = await clipmapRuntime.waitUntilReady();
      if (!clipmap) throw new Error("Terrain editor preview Scene produced no active Clipmap residency");
      reportProgress(96, "terrain");
      await Promise.all([
        detailRuntime?.waitUntilReady(),
        treeRuntime?.waitUntilReady(),
        placedPrefabRuntime?.waitUntilReady()
      ]);
      reportProgress(99, "terrain");
      await waitForFrames(2);
      this._requireActiveCandidate(candidate);
      const regionBoundaryView = new TerrainEditorRegionBoundaryView(
        engine,
        worldRuntime.entity,
        worldRuntime.getAssets().map((asset) => asset.document)
      );
      reportProgress(100, "scene");
      const diagnostics: TerrainEditorPreviewDiagnostics = {
        drawingBuffer: [engine.canvas.width, engine.canvas.height],
        pixelRatio: this._pixelRatio,
        activeRegions: clipmap.activeRegionCount,
        objectInstances: placedPrefabRuntime?.getDiagnostics().instances ?? 0
      };
      const resizeObserver = candidate.resizeObserver;

      this._candidate = null;
      candidate.engine = null;
      candidate.resizeObserver = null;
      candidate.transport = null;
      this._engine = engine;
      this._resizeObserver = resizeObserver;
      this._transport = transport;
      this._worldRuntime = worldRuntime;
      this._clipmapRuntime = clipmapRuntime;
      this._detailRuntime = detailRuntime;
      this._treeRuntime = treeRuntime;
      this._placedPrefabRuntime = placedPrefabRuntime;
      this._directLight = directLight;
      this._windRuntime = windRuntime;
      this._regionBoundaryView = regionBoundaryView;
      this._camera = camera;
      this._orbitControl = orbitControl;
      this._navigationRuntime = navigationRuntime;
      this._cameraMode = "orbit";
      this._paintingEnabled = true;
      this._roamPosition.copyFrom(authoredRoamPosition);
      this._roamRotation.copyFrom(authoredRoamRotation);
      this._hasRoamPose = true;
      return diagnostics;
    } catch (error) {
      try {
        this._releaseCandidate(candidate);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Terrain editor preview load failed and cleanup was incomplete",
          { cause: error }
        );
      }
      throw error;
    }
  }

  /**
   * Rebuilds only selected renderer residency from the current editor state.
   * @param state Canonical world and Region documents owned by the editor workspace.
   * @param targets Renderer capabilities affected by the committed transaction.
   * @param changedRegionIds Optional exact changed subset; omitted values synchronize every loaded Region.
   * @returns Diagnostics after two rendered frames expose the replacement.
   * @throws If the canonical set exceeds the renderer's capability or a newer preview operation supersedes the refresh.
   */
  async refresh(
    state: TerrainEditorPreviewState,
    targets: readonly TerrainEditorPreviewRefreshTarget[] = ["terrain"],
    changedRegionIds?: readonly string[]
  ): Promise<TerrainEditorPreviewDiagnostics> {
    const revision = this._revision;
    const worldRuntime = this._requireWorldRuntime();
    const clipmapRuntime = this._requireClipmapRuntime();
    const clipmap = clipmapRuntime.clipmap;
    if (!clipmap) throw new Error("Terrain editor preview Clipmap is not ready");
    if (targets.length === 0 || new Set(targets).size !== targets.length) {
      throw new Error("Terrain editor preview refresh targets must be unique and non-empty");
    }

    const loadedAssets = worldRuntime.getAssets();
    const loadedIds = new Set(loadedAssets.map((asset) => asset.document.descriptor.id));
    const documentsById = new Map(state.documents.map((document) => [document.descriptor.id, document] as const));
    if ([...loadedIds].some((regionId) => !documentsById.has(regionId))) {
      throw new Error("Terrain editor preview state does not contain every loaded Region");
    }
    const changedIds = changedRegionIds ? [...changedRegionIds] : [...loadedIds];
    if (new Set(changedIds).size !== changedIds.length || changedIds.some((regionId) => !loadedIds.has(regionId))) {
      throw new Error("Terrain editor preview changed Region ids must be unique and loaded");
    }
    worldRuntime.replaceLoadedRegionDocuments(changedIds.map((regionId) => documentsById.get(regionId)!));
    const documents = [...loadedIds].map((regionId) => documentsById.get(regionId)!);
    const activeRegionIds = loadedAssets.map((asset) => asset.document.descriptor.id);
    const refreshedAssets = worldRuntime.getAssets().filter((asset) => loadedIds.has(asset.document.descriptor.id));
    if (targets.includes("terrain")) {
      const descriptor = createTerrainProjectClipmapDescriptor(state.world, documents);
      const firstMaterial = refreshedAssets[0]?.terrainMaterial;
      if (!firstMaterial) throw new Error("Terrain editor preview has no loaded Terrain Material");
      clipmap.updateResidency(descriptor, firstMaterial, createTerrainProjectLayerSources(refreshedAssets));
    }
    if (targets.includes("details") && this._detailRuntime) {
      this._detailRuntime.setActiveRegions(activeRegionIds);
    }
    if (targets.includes("trees") && this._treeRuntime) {
      this._treeRuntime.setActiveRegions(activeRegionIds);
    }
    if (targets.includes("objects") && this._placedPrefabRuntime) {
      this._placedPrefabRuntime.setActiveRegions(activeRegionIds);
    }
    await waitForFrames(2);
    if (revision !== this._revision) throw createSupersededError();
    return this.getDiagnostics();
  }

  /**
   * Uploads one live Region-local height rectangle without publishing or rebuilding residency.
   * @param patch Compact working-copy R16 samples produced by an active editor stroke.
   * @returns Nothing after the current Clipmap height atlas receives the patch.
   * @throws If the preview is not ready or the Region is not active.
   */
  updateHeightPatch(patch: TerrainEditorHeightPatch): void {
    const clipmap = this._requireClipmapRuntime().clipmap;
    if (!clipmap) throw new Error("Terrain editor preview Clipmap is not ready");
    clipmap.updateHeightRegion(patch);
  }

  /**
   * Applies one unpublished surface-brush update without replacing the canonical world runtime.
   * @param update Alphamap sub-rectangles or one working Region document for an instance runtime.
   * @returns Nothing after only the affected Clipmap atlas or Region instance residency is replaced.
   * @throws If the preview capability is unavailable or the Region is not active.
   */
  updateSurfacePreview(update: TerrainEditorSurfacePreviewUpdate): void {
    if (update.kind === "texture") {
      const clipmap = this._requireClipmapRuntime().clipmap;
      if (!clipmap) throw new Error("Terrain editor preview Clipmap is not ready");
      for (const patch of update.patches) {
        clipmap.updateAlphamapRegion({ regionId: update.regionId, ...patch });
      }
      return;
    }
    const asset = this._createWorkingRegionAsset(update.document as TerrainProjectDocument);
    if (update.kind === "detail") {
      if (!this._detailRuntime) throw new Error("Terrain editor preview Detail runtime is not ready");
      this._detailRuntime.previewRegionAsset(asset);
      return;
    }
    if (update.kind === "tree") {
      if (!this._treeRuntime) throw new Error("Terrain editor preview tree runtime is not ready");
      this._treeRuntime.previewRegionAsset(asset);
      return;
    }
    if (!this._placedPrefabRuntime) throw new Error("Terrain editor preview object runtime is not ready");
    this._placedPrefabRuntime.previewRegionAsset(asset);
  }

  /**
   * Publishes committed texture documents and updates only their current Alphamap atlas rectangles.
   * @param state Current canonical workspace state after commit, undo, or redo.
   * @param updates Compact current-value texture patches grouped by changed Region.
   * @returns Diagnostics after rendered frames expose the synchronized state.
   * @throws If an update is duplicated, missing from the loaded set, or invalid for active residency.
   */
  async synchronizeTexture(
    state: TerrainEditorPreviewState,
    updates: readonly TerrainEditorSurfacePreviewUpdate[]
  ): Promise<TerrainEditorPreviewDiagnostics> {
    const revision = this._revision;
    if (
      updates.length === 0 ||
      updates.some((update) => update.kind !== "texture") ||
      new Set(updates.map((update) => update.regionId)).size !== updates.length
    ) {
      throw new Error("Terrain editor texture synchronization requires unique non-empty texture updates");
    }
    const worldRuntime = this._requireWorldRuntime();
    const loadedIds = new Set(worldRuntime.getAssets().map((asset) => asset.document.descriptor.id));
    const documentsById = new Map(state.documents.map((document) => [document.descriptor.id, document] as const));
    const documents = updates.map((update) => {
      if (!loadedIds.has(update.regionId)) {
        throw new Error(`Terrain editor texture patch Region "${update.regionId}" is not loaded`);
      }
      const document = documentsById.get(update.regionId);
      if (!document) throw new Error(`Terrain editor texture patch Region "${update.regionId}" is missing data`);
      return document;
    });
    worldRuntime.replaceLoadedRegionDocuments(documents);
    for (const update of updates) this.updateSurfacePreview(update);
    await waitForFrames(2);
    if (revision !== this._revision) throw createSupersededError();
    return this.getDiagnostics();
  }

  /**
   * Applies persisted Scene capability toggles immediately without reloading Project resources.
   * @param settings Boolean visibility plus authored values retained by the standard Scene artifact.
   * @returns Nothing after the loaded Scene and its light and wind components are updated.
   * @throws If the preview is not ready or its Scene omits required light or wind components.
   */
  applySceneSettings(settings: TerrainEditorSceneSettingsState): void {
    const engine = this._engine;
    const directLight = this._directLight;
    const windRuntime = this._windRuntime;
    if (!engine || !directLight || !windRuntime) {
      throw new Error("Terrain editor preview Scene settings are not ready");
    }
    const scene = engine.sceneManager.activeScene!;
    directLight.enabled = settings.directLightEnabled;
    scene.ambientLight.diffuseIntensity = settings.environmentEnabled ? settings.authoredDiffuseIntensity : 0;
    scene.ambientLight.specularIntensity = settings.environmentEnabled ? settings.authoredSpecularIntensity : 0;
    scene.fogMode = settings.fogEnabled ? (settings.authoredFogMode as FogMode) : FogMode.None;
    windRuntime.enabled = settings.windEnabled;
  }

  /**
   * Shows or hides terrain-following canonical Region boundaries in the editor preview.
   * @param visible Whether the diagnostic lines should render.
   * @returns Nothing.
   * @throws If the preview has not finished loading.
   */
  setRegionBoundariesVisible(visible: boolean): void {
    const view = this._regionBoundaryView;
    if (!view) throw new Error("Terrain editor Region boundary view is not ready");
    view.setVisible(visible);
  }

  /** @returns Current orbit or ground-roaming interaction mode. */
  get cameraMode(): TerrainEditorPreviewCameraMode {
    return this._cameraMode;
  }

  /** @returns Whether the primary pointer is assigned to terrain painting instead of camera navigation. */
  get paintingEnabled(): boolean {
    return this._paintingEnabled;
  }

  /** @returns Whether terrain-following canonical Region boundaries are visible. */
  get regionBoundariesVisible(): boolean {
    return this._regionBoundaryView?.visible ?? false;
  }

  /**
   * Switches between toolkit Orbit control and ground-constrained toolkit Free control.
   * @param mode Preview interaction mode.
   * @returns Nothing.
   * @throws If the preview controls or terrain navigation runtime are unavailable.
   */
  setCameraMode(mode: TerrainEditorPreviewCameraMode): void {
    const orbit = this._requireOrbitControl();
    const navigation = this._navigationRuntime;
    if (!navigation) throw new Error("Terrain editor preview navigation is not ready");
    const camera = this._camera;
    if (!camera) throw new Error("Terrain editor preview camera is not ready");
    const roaming = mode === "roam";
    if (this._cameraMode === "roam" && !roaming) {
      this._roamPosition.copyFrom(camera.entity.transform.worldPosition);
      this._roamRotation.copyFrom(camera.entity.transform.worldRotationQuaternion);
      this._hasRoamPose = true;
    } else if (this._cameraMode !== "roam" && roaming && this._hasRoamPose) {
      camera.entity.transform.worldPosition = this._roamPosition;
      camera.entity.transform.worldRotationQuaternion = this._roamRotation;
    }
    orbit.enabled = !roaming;
    navigation.enabled = roaming;
    navigation.rotationEnabled = roaming && !this._paintingEnabled;
    navigation.setInputEnabled(roaming);
    navigation.setGroundCollision(roaming);
    if (roaming) navigation.synchronizeView();
    this._cameraMode = mode;
  }

  /**
   * Assigns view gestures to terrain painting or the active camera controller.
   * Movement gestures remain available while painting is enabled.
   * @param enabled Whether primary-pointer strokes edit terrain.
   * @returns Nothing.
   * @throws If the preview navigation controls are unavailable.
   */
  setPaintingEnabled(enabled: boolean): void {
    const navigation = this._navigationRuntime;
    if (!navigation) throw new Error("Terrain editor preview navigation is not ready");
    this._paintingEnabled = enabled;
    navigation.rotationEnabled = this._cameraMode === "roam" && !enabled;
  }

  /**
   * Updates ground-roaming speed for the preview controls.
   * @param metresPerSecond Positive movement speed in world metres per second.
   * @returns Nothing.
   * @throws If the speed is invalid or preview navigation is unavailable.
   */
  setMovementSpeed(metresPerSecond: number): void {
    if (!Number.isFinite(metresPerSecond) || metresPerSecond <= 0) {
      throw new RangeError("Terrain editor movement speed must be finite and positive");
    }
    const navigation = this._navigationRuntime;
    if (!navigation) throw new Error("Terrain editor preview navigation is not ready");
    navigation.movementSpeed = metresPerSecond;
  }

  /**
   * Updates camera clearance above canonical terrain while roaming.
   * @param metres Positive eye height in world metres.
   * @returns Nothing.
   * @throws If the height is invalid or preview navigation is unavailable.
   */
  setEyeHeight(metres: number): void {
    const navigation = this._navigationRuntime;
    if (!navigation) throw new Error("Terrain editor preview navigation is not ready");
    navigation.setEyeHeight(metres);
  }

  /**
   * Captures one loader-resolved prototype with its exact Project Material and Shader references.
   * @param regionId Stable Region owning the local prototype id.
   * @param prototypeId Region-local prototype id present in the loaded Region.
   * @param kind Runtime geometry collection containing the prototype.
   * @param size Square thumbnail size in physical pixels.
   * @returns PNG bytes rendered in the active Project Scene on an isolated camera layer.
   * @throws If the preview is not ready or no loaded Region declares the prototype.
   */
  async renderPrototypeThumbnail(
    regionId: string,
    prototypeId: string,
    kind: "surface" | "object",
    size = 160
  ): Promise<Blob> {
    const revision = this._revision;
    const task = this._thumbnailRenderQueue.then(async () => {
      if (revision !== this._revision) throw createSupersededError();
      const engine = this._engine;
      if (!engine) throw new Error("Terrain editor preview is not ready");
      const asset = this._requireWorldRuntime()
        .getAssets()
        .find((candidate) => candidate.document.descriptor.id === regionId);
      if (!asset) throw new Error(`Terrain editor preview Region ${JSON.stringify(regionId)} is not loaded`);
      const geometry =
        kind === "surface"
          ? asset.prototypeGeometries.get(prototypeId)
          : asset.placedPrefabGeometries.get(prototypeId);
      if (!geometry) {
        throw new Error(
          `Terrain editor preview prototype ${JSON.stringify(prototypeId)} is not loaded in Region ${JSON.stringify(regionId)}`
        );
      }
      return renderTerrainProjectGeometryThumbnail(engine, geometry, size);
    });
    this._thumbnailRenderQueue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  /**
   * Captures one loader-resolved TerrainLayer diffuse Texture, including KTX2 resources.
   * @param regionId Stable Region owning the TerrainLayer binding.
   * @param layerId Region-local TerrainLayer id present in the loaded Region.
   * @param size Square thumbnail size in physical pixels.
   * @returns PNG bytes rendered from the Project-loaded GPU Texture.
   * @throws If the preview is not ready or the Region or TerrainLayer is not loaded.
   */
  async renderLayerTextureThumbnail(regionId: string, layerId: string, size = 160): Promise<Blob> {
    const revision = this._revision;
    const task = this._thumbnailRenderQueue.then(async () => {
      if (revision !== this._revision) throw createSupersededError();
      const engine = this._engine;
      if (!engine) throw new Error("Terrain editor preview is not ready");
      const asset = this._requireWorldRuntime()
        .getAssets()
        .find((candidate) => candidate.document.descriptor.id === regionId);
      if (!asset) throw new Error(`Terrain editor preview Region ${JSON.stringify(regionId)} is not loaded`);
      const texture = asset.layerTextures.get(layerId)?.diffuse;
      if (!texture) {
        throw new Error(
          `Terrain editor preview layer ${JSON.stringify(layerId)} is not loaded in Region ${JSON.stringify(regionId)}`
        );
      }
      return renderTerrainProjectTextureThumbnail(engine, texture, size);
    });
    this._thumbnailRenderQueue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  /**
   * Publishes a silently attached Project asset before its first brush stroke.
   * @param state Current canonical workspace state containing the new Region-local binding.
   * @param regionId Stable Region receiving the binding.
   * @param kind Paint asset capability being attached.
   * @returns Diagnostics after the loaded resource binding is available to live preview updates.
   * @throws If the Region is not loaded or the referenced Project resource is unavailable.
   */
  async synchronizeAssetAttachment(
    state: TerrainEditorPreviewState,
    regionId: string,
    kind: "texture" | "detail" | "tree" | "object"
  ): Promise<TerrainEditorPreviewDiagnostics> {
    if (kind === "texture") return this.refresh(state, ["terrain"], [regionId]);
    const document = state.documents.find((candidate) => candidate.descriptor.id === regionId);
    if (!document) throw new Error(`Terrain editor attachment Region ${JSON.stringify(regionId)} is missing data`);
    this._requireWorldRuntime().replaceLoadedRegionDocument(document);
    return this.getDiagnostics();
  }

  /**
   * Publishes committed height documents into the loaded runtime and updates only their atlas rectangles.
   * @param state Current canonical workspace state after commit, undo, or redo.
   * @param patches Compact current-value rectangles for every Region changed by the command.
   * @param refreshSurfaceInstances Whether changed tree or Detail heights require runtime instance refresh.
   * @returns Diagnostics after rendered frames expose the synchronized state.
   * @throws If a patch is duplicated, missing from the loaded set, or invalid for active residency.
   */
  async synchronizeHeight(
    state: TerrainEditorPreviewState,
    patches: readonly TerrainEditorHeightPatch[],
    refreshSurfaceInstances: boolean
  ): Promise<TerrainEditorPreviewDiagnostics> {
    const revision = this._revision;
    if (patches.length === 0 || new Set(patches.map((patch) => patch.regionId)).size !== patches.length) {
      throw new Error("Terrain editor height synchronization requires unique non-empty Region patches");
    }
    const worldRuntime = this._requireWorldRuntime();
    const clipmap = this._requireClipmapRuntime().clipmap;
    if (!clipmap) throw new Error("Terrain editor preview Clipmap is not ready");
    const loadedIds = new Set(worldRuntime.getAssets().map((asset) => asset.document.descriptor.id));
    const documentsById = new Map(state.documents.map((document) => [document.descriptor.id, document] as const));
    const changedDocuments = patches.map((patch) => {
      if (!loadedIds.has(patch.regionId)) {
        throw new Error(`Terrain editor height patch Region "${patch.regionId}" is not loaded`);
      }
      const document = documentsById.get(patch.regionId);
      if (!document)
        throw new Error(`Terrain editor height patch Region "${patch.regionId}" is missing canonical data`);
      return document;
    });
    worldRuntime.replaceLoadedRegionDocuments(changedDocuments);
    for (const patch of patches) clipmap.updateHeightRegion(patch);
    if (refreshSurfaceInstances) {
      const activeRegionIds = [...loadedIds];
      if (this._detailRuntime) {
        this._detailRuntime.setActiveRegions(activeRegionIds);
      }
      if (this._treeRuntime) {
        this._treeRuntime.setActiveRegions(activeRegionIds);
      }
      if (this._placedPrefabRuntime) {
        this._placedPrefabRuntime.setActiveRegions(activeRegionIds);
      }
    }
    await waitForFrames(2);
    if (revision !== this._revision) throw createSupersededError();
    return this.getDiagnostics();
  }

  /**
   * Replaces every optional preview runtime with one selected Region residency.
   * @param regionId Stable canonical Region selected by the editor rail.
   * @returns Diagnostics after Clipmap, Detail, tree, and placed-Prefab residency settle.
   * @throws If the Region is unknown or exceeds a renderer capability.
   */
  async setActiveRegion(regionId: string): Promise<TerrainEditorPreviewDiagnostics> {
    const revision = this._revision;
    const clipmap = await this._requireClipmapRuntime().loadAndSetActiveRegions([regionId]);
    if (!clipmap) throw new Error("Terrain editor selected Region produced no Clipmap residency");
    await Promise.all([
      this._detailRuntime?.loadAndSetActiveRegions([regionId]),
      this._treeRuntime?.loadAndSetActiveRegions([regionId]),
      this._placedPrefabRuntime?.loadAndSetActiveRegions([regionId])
    ]);
    await waitForFrames(2);
    if (revision !== this._revision) throw createSupersededError();
    return this.getDiagnostics();
  }

  /**
   * Frames one Region around its sampled terrain center from a near-overhead editing perspective.
   * @param region Canonical Region world bounds selected in the editor rail.
   * @param surfaceHeight Sampled terrain height at the Region XZ center.
   * @returns Nothing after the camera transform and Clipmap snap update.
   * @throws If the preview camera is unavailable or the sampled height is not finite.
   */
  frameRegion(region: TerrainProjectWorldRegion, surfaceHeight: number): void {
    const camera = this._camera;
    if (!camera) throw new Error("Terrain editor preview camera is not ready");
    if (!Number.isFinite(surfaceHeight)) throw new Error("Terrain editor Region center height must be finite");
    const [originX, , originZ] = region.worldPosition;
    const [sizeX, , sizeZ] = region.worldSize;
    const orbitControl = this._requireOrbitControl();
    if (this._cameraMode === "roam") {
      const navigation = this._navigationRuntime;
      if (!navigation) throw new Error("Terrain editor preview navigation is not ready");
      const eyeY = surfaceHeight + navigation.eyeHeight;
      camera.entity.transform.setPosition(originX + sizeX * 0.5, eyeY, originZ + sizeZ * 0.5);
      this._orbitTarget.set(originX + sizeX * 0.5, eyeY, originZ + sizeZ * 0.5 + 10);
      camera.entity.transform.lookAt(this._orbitTarget);
      navigation.synchronizeView();
      navigation.snapToGround();
      this._clipmapRuntime?.clipmap?.snap(camera.entity.transform.worldPosition);
      return;
    }
    const polarAngle = Math.max(FRAME_POLAR_ANGLE_RADIANS, orbitControl.minPolarAngle + ORBIT_POLAR_MARGIN_RADIANS);
    if (polarAngle >= orbitControl.maxPolarAngle) {
      throw new Error("Terrain editor preview Orbit control has no valid near-overhead framing angle");
    }
    const sinPolar = Math.sin(polarAngle);
    const cosPolar = Math.cos(polarAngle);
    const halfX = sizeX * 0.5;
    const halfZ = sizeZ * 0.5;
    const distance = Math.min(420, Math.max(80, Math.max(sizeX, sizeZ) * FRAME_DISTANCE_RATIO));

    this._orbitTarget.set(originX + halfX, surfaceHeight, originZ + halfZ);
    camera.entity.transform.setPosition(
      this._orbitTarget.x,
      this._orbitTarget.y + cosPolar * distance,
      this._orbitTarget.z + sinPolar * distance
    );
    camera.entity.transform.lookAt(this._orbitTarget);
    orbitControl.target = this._orbitTarget;
    this._navigationRuntime?.synchronizeView();
    this._clipmapRuntime?.clipmap?.snap(camera.entity.transform.worldPosition);
  }

  /**
   * Rotates the editor camera around its current terrain target.
   * @param deltaX Horizontal pointer movement in CSS pixels.
   * @param deltaY Vertical pointer movement in CSS pixels.
   * @returns Nothing.
   * @throws If the preview camera is not ready.
   */
  orbitBy(deltaX: number, deltaY: number): void {
    this._requireOrbitControl();
    this._orbitInput.push(ControlHandlerType.ROTATE, deltaX, deltaY);
  }

  /**
   * Pans the editor camera and terrain target in the current view plane.
   * @param deltaX Horizontal pointer movement in CSS pixels.
   * @param deltaY Vertical pointer movement in CSS pixels.
   * @param viewportHeight Current preview height in CSS pixels.
   * @returns Nothing.
   * @throws If the preview camera is not ready or the viewport height is invalid.
   */
  panBy(deltaX: number, deltaY: number, viewportHeight: number): void {
    this._requireOrbitControl();
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
      throw new Error("Terrain editor orbit viewport height must be positive");
    }
    this._orbitInput.push(ControlHandlerType.PAN, deltaX, deltaY);
  }

  /**
   * Moves the editor camera toward or away from its current terrain target.
   * @param delta Wheel or pinch-like zoom delta; positive values move away from the target.
   * @returns Nothing.
   * @throws If the preview camera is not ready.
   */
  zoomBy(delta: number): void {
    this._requireOrbitControl();
    this._orbitInput.push(ControlHandlerType.ZOOM, 0, delta);
  }

  /**
   * Captures current preview dimensions and active residency without exposing engine objects.
   * @returns Diagnostics for the configured preview drawing-buffer scale.
   * @throws If the preview has not loaded.
   */
  getDiagnostics(): TerrainEditorPreviewDiagnostics {
    const engine = this._engine;
    const clipmap = this._clipmapRuntime?.clipmap;
    if (!engine || !clipmap) throw new Error("Terrain editor preview is not ready");
    return {
      drawingBuffer: [engine.canvas.width, engine.canvas.height],
      pixelRatio: this._pixelRatio,
      activeRegions: clipmap.activeRegionCount,
      objectInstances: this._placedPrefabRuntime?.getDiagnostics().instances ?? 0
    };
  }

  /**
   * Pauses animation time, renders one frame, and reads the exact preview drawing buffer.
   * @returns A detached RGBA8 snapshot suitable for deterministic visual regression checks.
   * @throws If the preview is not ready or its WebGL context is unavailable.
   */
  captureStablePixels(): TerrainEditorPreviewPixelSnapshot {
    const engine = this._engine;
    if (!engine) throw new Error("Terrain editor preview is not ready");
    engine.time.timeScale = 0;
    engine.pause();
    engine.update();
    const gl = this._canvas.getContext("webgl2") ?? this._canvas.getContext("webgl");
    if (!gl) throw new Error("Terrain editor preview WebGL context is unavailable");
    gl.finish();
    const pixels = new Uint8Array(this._canvas.width * this._canvas.height * 4);
    gl.readPixels(0, 0, this._canvas.width, this._canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { width: this._canvas.width, height: this._canvas.height, pixels };
  }

  /**
   * Releases pending and loaded Scenes, GPU resources, resize observers, and temporary object URLs.
   * @returns Nothing after every owned preview resource has been released.
   * @throws If an engine or browser cleanup operation fails.
   */
  destroy(): void {
    ++this._revision;
    this._destroyOwnedResources();
  }

  private _beginOpen(): number {
    const revision = ++this._revision;
    this._destroyOwnedResources();
    return revision;
  }

  private _createResizeObserver(engine: WebGLEngine): ResizeObserver {
    const resize = (): void =>
      engine.canvas.setResolution(
        Math.max(1, Math.round(this._canvas.clientWidth * this._pixelRatio)),
        Math.max(1, Math.round(this._canvas.clientHeight * this._pixelRatio))
      );
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(this._canvas);
    return observer;
  }

  private _requireActiveCandidate(candidate: TerrainEditorPreviewLoadCandidate): void {
    if (candidate.revision !== this._revision || this._candidate !== candidate) throw createSupersededError();
  }

  private _destroyOwnedResources(): void {
    const cleanupErrors: unknown[] = [];
    const candidate = this._candidate;
    this._candidate = null;
    if (candidate) {
      try {
        this._releaseCandidate(candidate);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      this._destroyCurrent();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) {
      throw new AggregateError(cleanupErrors, "Terrain editor preview cleanup was incomplete");
    }
  }

  private _releaseCandidate(candidate: TerrainEditorPreviewLoadCandidate): void {
    if (this._candidate === candidate) this._candidate = null;
    const engine = candidate.engine;
    const observer = candidate.resizeObserver;
    const transport = candidate.transport;
    candidate.engine = null;
    candidate.resizeObserver = null;
    candidate.transport = null;
    releasePreviewResources(observer, engine, transport);
  }

  private _destroyCurrent(): void {
    const observer = this._resizeObserver;
    const engine = this._engine;
    const transport = this._transport;
    const regionBoundaryView = this._regionBoundaryView;
    this._resizeObserver = null;
    this._camera = null;
    this._orbitControl = null;
    this._navigationRuntime = null;
    this._cameraMode = "orbit";
    this._paintingEnabled = true;
    this._hasRoamPose = false;
    this._orbitInput.reset();
    this._clipmapRuntime = null;
    this._detailRuntime = null;
    this._treeRuntime = null;
    this._placedPrefabRuntime = null;
    this._directLight = null;
    this._windRuntime = null;
    this._regionBoundaryView = null;
    this._worldRuntime = null;
    this._engine = null;
    this._transport = null;
    try {
      regionBoundaryView?.destroy();
    } finally {
      releasePreviewResources(observer, engine, transport);
    }
  }

  private _requireWorldRuntime(): TerrainProjectWorldRuntime {
    if (!this._worldRuntime) throw new Error("Terrain editor preview world is not ready");
    return this._worldRuntime;
  }

  private _createWorkingRegionAsset(document: TerrainProjectDocument): TerrainProjectAsset {
    const source = this._requireWorldRuntime()
      .getAssets()
      .find((asset) => asset.document.descriptor.id === document.descriptor.id);
    if (!source) throw new Error(`Terrain editor preview Region "${document.descriptor.id}" is not loaded`);
    return new TerrainProjectAsset(
      document,
      source.terrainMaterial,
      source.layerTextures,
      source.prototypePrefabs,
      source.prototypeGeometries,
      source.placedPrefabs,
      source.placedPrefabGeometries,
      source.dependencies
    );
  }

  private _requireClipmapRuntime(): TerrainProjectClipmapRuntime {
    if (!this._clipmapRuntime) throw new Error("Terrain editor preview Clipmap is not ready");
    return this._clipmapRuntime;
  }

  private _requireOrbitControl(): OrbitControl {
    if (!this._orbitControl) throw new Error("Terrain editor preview Orbit control is not ready");
    return this._orbitControl;
  }
}

function releasePreviewResources(
  observer: ResizeObserver | null,
  engine: WebGLEngine | null,
  transport: TerrainProjectObjectUrlTransport | null
): void {
  try {
    observer?.disconnect();
  } finally {
    try {
      engine?.pause();
    } finally {
      try {
        engine?.resourceManager.cancelNotLoaded();
      } finally {
        try {
          engine?.destroy();
        } finally {
          transport?.revoke();
        }
      }
    }
  }
}

function createSupersededError(): Error {
  const error = new Error("Terrain editor preview load was superseded");
  error.name = "AbortError";
  return error;
}

type ComponentConstructor<T extends Component> = new (entity: Entity) => T;

function findComponent<T extends Component>(
  roots: readonly Entity[],
  componentType: ComponentConstructor<T>
): T | null {
  for (const root of roots) {
    const components: T[] = [];
    root.getComponentsIncludeChildren(componentType, components);
    if (components.length) return components[0];
  }
  return null;
}

async function waitForFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
