import { Ray, Vector2, Vector3 } from "@galacean/engine";
import { sha256TerrainBytes } from "@galacean/engine-terrain/terrain/project/TerrainProjectCodec";
import {
  TERRAIN_WORLD_INDEX_PATH,
  type TerrainProjectFile,
  type TerrainProjectWorldRegion
} from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";
import "@galacean/engine-world-planning/runtime/script-registry";
import { TerrainAssetThumbnailRenderer, renderOpaqueTerrainTextureThumbnail } from "./src/TerrainAssetThumbnail.ts";
import type { TerrainEditorUploadedFile } from "./src/TerrainEditorAssetImport.ts";
import {
  TerrainEditorPreview,
  type TerrainEditorPreviewCameraMode,
  type TerrainEditorPreviewDiagnostics,
  type TerrainEditorPreviewLoadProgress,
  type TerrainEditorPreviewPixelSnapshot,
  type TerrainEditorPreviewRefreshTarget
} from "./src/TerrainEditorPreview.ts";
import {
  deriveTerrainEditorObjectBrushProfile,
  resolveTerrainEditorAssetId,
  type TerrainEditorAssetCatalogEntry,
  type TerrainEditorAssetKind,
  type TerrainEditorObjectBrushProfile
} from "./src/TerrainEditorAssetCatalog.ts";
import {
  TerrainEditorWorkspace,
  type TerrainEditorCommand,
  type TerrainEditorRegionMetadata
} from "./src/TerrainEditorWorkspace.ts";
import type { TerrainHeightBrushPoint } from "./src/TerrainHeightBrush.ts";
import {
  intersectTerrainWorldHeightfield,
  sampleTerrainDocumentHeight,
  type TerrainHeightfieldIntersection
} from "@galacean/engine-world-planning/authoring/terrain/TerrainHeightfield";
import {
  loadTerrainProjectArtifactFromUrl,
  readTerrainProjectDirectory,
  writeTerrainProjectDirectory,
  type TerrainProjectDirectoryHandle,
  type TerrainProjectDirectoryWriteProgress
} from "./src/TerrainProjectFolderIO.ts";
import type { TerrainProjectArtifactEntries } from "@galacean/engine-terrain/terrain/project/TerrainProjectArtifactAssembler";
import type { TerrainEditorSceneSettings } from "./src/TerrainEditorSceneSettings.ts";

interface TerrainEditorDiagnostics {
  pixelRatio: number;
  drawingBuffer: [number, number];
  regionCount: number;
  selectedRegionId: string | null;
  dirtyRegionIds: string[];
  canUndo: boolean;
  canRedo: boolean;
  hover: TerrainHeightfieldIntersection | null;
  lastCommand: TerrainEditorCommandSummary | null;
  revision: number;
  previewStatus: string;
  loadingPercent: number;
  loadingHistory: number[];
  activeRegions: number;
  objectInstances: number;
  toolMode: TerrainEditorToolMode;
  detailPrototypeCount: number;
  treePrototypeCount: number;
  objectPrototypeCount: number;
  textureLayerCount: number;
  selectedDetailSourceCount: number;
  selectedTreeInstances: {
    count: number;
    minimumScale: number | null;
    maximumScale: number | null;
    rotatedCount: number;
  };
  assetThumbnailCount: number;
  assetThumbnailPending: number;
  cameraPosition: [number, number, number] | null;
  cameraForward: [number, number, number] | null;
  cameraMode: TerrainEditorPreviewCameraMode;
  paintingEnabled: boolean;
  regionBoundariesVisible: boolean;
  heightStroke: TerrainEditorHeightStrokeDiagnostics;
  surfaceStroke: TerrainEditorSurfaceStrokeDiagnostics;
}

interface TerrainEditorHeightStrokeDiagnostics {
  active: boolean;
  liveUpdateCount: number;
  pointerDownToFirstVisibleMs: number | null;
  stampIntervalsMs: number[];
  maximumLiveUpdateTaskMs: number;
  pointerUpToCommitMs: number | null;
}

interface MutableTerrainEditorHeightStrokeMetrics {
  readonly pointerDownAt: number;
  liveUpdateCount: number;
  pointerDownToFirstVisibleMs: number | null;
  readonly stampIntervalsMs: number[];
  maximumLiveUpdateTaskMs: number;
  pointerUpToCommitMs: number | null;
  lastLiveUpdateAt: number | null;
}

interface TerrainEditorSurfaceStrokeDiagnostics {
  active: boolean;
  mode: Exclude<TerrainEditorToolMode, "height"> | null;
  liveUpdateCount: number;
}

interface MutableTerrainEditorSurfaceStrokeMetrics {
  readonly mode: Exclude<TerrainEditorToolMode, "height">;
  liveUpdateCount: number;
}

interface PendingSurfaceStrokeStart {
  readonly pointerId: number;
  readonly tool: Exclude<TerrainEditorToolMode, "height">;
  readonly initialHit: TerrainHeightfieldIntersection;
  latestHit: TerrainHeightfieldIntersection;
  released: boolean;
  canceled: boolean;
}

interface TerrainEditorCommandSummary {
  regionCount: number;
  sampleCount: number;
}

interface TerrainEditorArtifactDigest {
  fileCount: number;
  projectSha256: string;
  worldContentHash: string;
}

interface TerrainEditorSurfacePoint {
  x: number;
  y: number;
  regionId: string;
}

type TerrainEditorToolMode = "height" | "texture" | "detail" | "tree" | "object";
type TerrainEditorInspectorTab = "paint" | "scene" | "region";

interface TerrainEditorWindowApi {
  readonly ready: true;
  getDiagnostics(): TerrainEditorDiagnostics;
  surfaceToCanvas(worldX: number, worldZ: number): TerrainEditorSurfacePoint | null;
  artifactDigest(): Promise<TerrainEditorArtifactDigest>;
  capturePreviewPixels(): TerrainEditorPreviewPixelSnapshot;
  reopenExportedPreview(): Promise<
    TerrainEditorPreviewDiagnostics & {
      digest: TerrainEditorArtifactDigest;
    }
  >;
}

declare global {
  interface Window {
    terrainEditor?: TerrainEditorWindowApi;
    terrainEditorError?: string;
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<TerrainProjectDirectoryHandle>;
  }
}

const DEFAULT_PROJECT_URL = new URL("../../../packages/terrain/src/data/grasslands/project.json", import.meta.url);
const DEFAULT_PROJECT_NAME = "Terrain project";
const MINIMUM_STAMP_SPACING_METRES = 0.25;
const STAMP_SPACING_RADIUS_RATIO = 0.18;
const HEIGHT_BRUSH_MAX_DELTA_METRES = 10;
const DETAIL_MAXIMUM_COUNT_PER_CELL = 32;

const canvas = requireElement("preview-canvas", HTMLCanvasElement);
const previewShell = requireElement("preview-shell", HTMLElement);
const previewOverlay = requireElement("preview-overlay", HTMLDivElement);
const previewProgress = requireElement("preview-progress", HTMLProgressElement);
const previewProgressOutput = requireElement("preview-progress-output", HTMLOutputElement);
const previewInstructions = requireElement("preview-instructions", HTMLParagraphElement);
const previewPaintToggle = requireElement("preview-paint-toggle", HTMLButtonElement);
const brushCursor = requireElement("brush-cursor", SVGSVGElement);
const brushCursorOuter = requireElement("brush-cursor-outer", SVGPathElement);
const brushCursorInner = requireElement("brush-cursor-inner", SVGPathElement);
const projectName = requireElement("project-name", HTMLHeadingElement);
const projectStatus = requireElement("project-status", HTMLSpanElement);
const importProject = requireElement("import-project", HTMLButtonElement);
const exportProject = requireElement("export-project", HTMLButtonElement);
const undoButton = requireElement("undo", HTMLButtonElement);
const redoButton = requireElement("redo", HTMLButtonElement);
const regionList = requireElement("region-list", HTMLOListElement);
const regionDetails = requireElement("region-details", HTMLDListElement);
const dirtySummary = requireElement("dirty-summary", HTMLSpanElement);
const capabilityStatus = requireElement("capability-status", HTMLDivElement);
const liveStatus = requireElement("live-status", HTMLSpanElement);
const brushModeHint = requireElement("brush-mode-hint", HTMLSpanElement);
const inspectorTabButtons = {
  paint: requireElement("inspector-tab-paint", HTMLButtonElement),
  scene: requireElement("inspector-tab-scene", HTMLButtonElement),
  region: requireElement("inspector-tab-region", HTMLButtonElement)
} satisfies Record<TerrainEditorInspectorTab, HTMLButtonElement>;
const inspectorTabPanels = {
  paint: requireElement("inspector-paint-panel", HTMLElement),
  scene: requireElement("inspector-scene-panel", HTMLElement),
  region: requireElement("inspector-region-panel", HTMLElement)
} satisfies Record<TerrainEditorInspectorTab, HTMLElement>;
const sceneDirectLightInput = requireElement("scene-direct-light", HTMLInputElement);
const sceneEnvironmentInput = requireElement("scene-environment", HTMLInputElement);
const sceneFogInput = requireElement("scene-fog", HTMLInputElement);
const sceneWindInput = requireElement("scene-wind", HTMLInputElement);
const sceneRegionBoundariesInput = requireElement("scene-region-boundaries", HTMLInputElement);
const previewCameraModeInput = requireElement("preview-camera-mode", HTMLSelectElement);
const previewMoveSpeedInput = requireElement("preview-move-speed", HTMLInputElement);
const previewMoveSpeedOutput = requireElement("preview-move-speed-output", HTMLOutputElement);
const previewEyeHeightInput = requireElement("preview-eye-height", HTMLInputElement);
const previewEyeHeightOutput = requireElement("preview-eye-height-output", HTMLOutputElement);
const modeButtons = {
  height: requireElement("mode-height", HTMLButtonElement),
  texture: requireElement("mode-texture", HTMLButtonElement),
  detail: requireElement("mode-detail", HTMLButtonElement),
  tree: requireElement("mode-tree", HTMLButtonElement),
  object: requireElement("mode-object", HTMLButtonElement)
} satisfies Record<TerrainEditorToolMode, HTMLButtonElement>;
const toolPanels = {
  height: requireElement("height-controls", HTMLDivElement),
  texture: requireElement("texture-controls", HTMLDivElement),
  detail: requireElement("detail-controls", HTMLDivElement),
  tree: requireElement("tree-controls", HTMLDivElement),
  object: requireElement("object-controls", HTMLDivElement)
} satisfies Record<TerrainEditorToolMode, HTMLDivElement>;
const raiseButton = requireElement("tool-raise", HTMLButtonElement);
const lowerButton = requireElement("tool-lower", HTMLButtonElement);
const radiusInput = requireElement("brush-radius", HTMLInputElement);
const radiusOutput = requireElement("brush-radius-output", HTMLOutputElement);
const heightStrengthInput = requireElement("height-strength", HTMLInputElement);
const heightStrengthOutput = requireElement("height-strength-output", HTMLOutputElement);
const falloffInput = requireElement("brush-falloff", HTMLInputElement);
const textureLayerPalette = requireElement("texture-layer-palette", HTMLDivElement);
const textureAssetUpload = requireElement("texture-asset-upload", HTMLInputElement);
const textureRefreshPreviews = requireElement("texture-refresh-previews", HTMLButtonElement);
const texturePaint = requireElement("texture-paint", HTMLButtonElement);
const textureErase = requireElement("texture-erase", HTMLButtonElement);
const textureStrengthInput = requireElement("texture-strength", HTMLInputElement);
const textureStrengthOutput = requireElement("texture-strength-output", HTMLOutputElement);
const detailPrototypePalette = requireElement("detail-prototype-palette", HTMLDivElement);
const detailAssetUpload = requireElement("detail-asset-upload", HTMLInputElement);
const detailViewList = requireElement("detail-view-list", HTMLButtonElement);
const detailViewGrid = requireElement("detail-view-grid", HTMLButtonElement);
const detailPaint = requireElement("detail-paint", HTMLButtonElement);
const detailErase = requireElement("detail-erase", HTMLButtonElement);
const detailDensityInput = requireElement("detail-density", HTMLInputElement);
const detailDensityOutput = requireElement("detail-density-output", HTMLOutputElement);
const treePrototypePalette = requireElement("tree-prototype-palette", HTMLDivElement);
const treeAssetUpload = requireElement("tree-asset-upload", HTMLInputElement);
const treeRefreshPreviews = requireElement("tree-refresh-previews", HTMLButtonElement);
const treePaint = requireElement("tree-paint", HTMLButtonElement);
const treeErase = requireElement("tree-erase", HTMLButtonElement);
const treeDensityInput = requireElement("tree-density", HTMLInputElement);
const treeDensityOutput = requireElement("tree-density-output", HTMLOutputElement);
const treeMinimumHeightInput = requireElement("tree-min-height", HTMLInputElement);
const treeMaximumHeightInput = requireElement("tree-max-height", HTMLInputElement);
const objectPrototypePalette = requireElement("object-prototype-palette", HTMLDivElement);
const objectAssetUpload = requireElement("object-asset-upload", HTMLInputElement);
const objectRefreshPreviews = requireElement("object-refresh-previews", HTMLButtonElement);
const objectPaint = requireElement("object-paint", HTMLButtonElement);
const objectErase = requireElement("object-erase", HTMLButtonElement);
const objectDensityInput = requireElement("object-density", HTMLInputElement);
const objectDensityOutput = requireElement("object-density-output", HTMLOutputElement);
const objectMinimumScaleInput = requireElement("object-min-scale", HTMLInputElement);
const objectMaximumScaleInput = requireElement("object-max-scale", HTMLInputElement);

const preview = new TerrainEditorPreview(canvas, resolveEditorPixelRatio());
const assetThumbnailRenderer = new TerrainAssetThumbnailRenderer();
const pickRay = new Ray();
const pickScreenPoint = new Vector2();
const projectedPoint = new Vector3();
const brushWorldPoint = new Vector3();
let workspace: TerrainEditorWorkspace | null = null;
let projectDirectory: TerrainProjectDirectoryHandle | null = null;
let projectDirectoryArtifact: TerrainProjectArtifactEntries | null = null;
let selectedRegionId: string | null = null;
let toolMode: TerrainEditorToolMode = "height";
let direction: "raise" | "lower" = "raise";
let textureErasing = false;
let detailErasing = false;
let treeErasing = false;
let objectErasing = false;
let selectedTextureLayerId = "";
let selectedDetailPrototypeId = "";
let selectedTreePrototypeId = "";
let selectedObjectPrototypeId = "";
let activePointerId: number | null = null;
let navigationPointerId: number | null = null;
let navigationMode: "orbit" | "pan" | null = null;
let navigationClientX = 0;
let navigationClientY = 0;
let pendingHeightPoint: TerrainHeightBrushPoint | null = null;
let heightStrokeFrame: number | null = null;
let pendingSurfacePoint: TerrainHeightBrushPoint | null = null;
let surfaceStrokeFrame: number | null = null;
let activeSurfaceToolMode: Exclude<TerrainEditorToolMode, "height"> | null = null;
let pendingSurfaceStrokeStart: PendingSurfaceStrokeStart | null = null;
let activeHeightStrokeMetrics: MutableTerrainEditorHeightStrokeMetrics | null = null;
let lastHeightStrokeMetrics: MutableTerrainEditorHeightStrokeMetrics | null = null;
let activeSurfaceStrokeMetrics: MutableTerrainEditorSurfaceStrokeMetrics | null = null;
let lastSurfaceStrokeMetrics: MutableTerrainEditorSurfaceStrokeMetrics | null = null;
let hover: TerrainHeightfieldIntersection | null = null;
let lastCommand: TerrainEditorCommandSummary | null = null;
let previewStatus = "waiting";
let loadingPercent = 0;
let loadingHistory = [0];
let busy = false;
const detailDensityByPrototype = new Map<string, number>();
const treeHeightRangeByPrototype = new Map<string, { minimum: number; maximum: number }>();
const objectScaleRangeByPrototype = new Map<string, { minimum: number; maximum: number }>();
const objectBrushProfileByPrototype = new Map<string, TerrainEditorObjectBrushProfile>();
const artifactDigestCache = new WeakMap<TerrainProjectArtifactEntries, Promise<TerrainEditorArtifactDigest>>();
const assetThumbnailCache = new Map<string, Promise<CachedAssetThumbnail>>();
const assetThumbnailUrls = new Set<string>();
const pendingAssetThumbnails = new Set<Promise<CachedAssetThumbnail>>();
const lazyAssetThumbnailChoices = new WeakMap<HTMLButtonElement, TerrainEditorPaletteChoice>();
const assetThumbnailObserver = new IntersectionObserver(
  (entries) => {
    for (const observation of entries) {
      if (!observation.isIntersecting) continue;
      const button = observation.target as HTMLButtonElement;
      assetThumbnailObserver.unobserve(button);
      const choice = lazyAssetThumbnailChoices.get(button);
      if (choice) startAssetThumbnail(button, choice);
    }
  },
  { rootMargin: "160px" }
);
let assetThumbnailGeneration = 0;

bindControls();
void openDefaultProject().catch(reportFatalError);

async function openDefaultProject(): Promise<void> {
  setLoadingState("Loading standard Project artifact…");
  try {
    const artifact = await loadTerrainProjectArtifactFromUrl(DEFAULT_PROJECT_URL);
    const [nextWorkspace] = await Promise.all([
      TerrainEditorWorkspace.open(artifact),
      preview.open(artifact, (progress) =>
        updateLoadingProgress({ ...progress, percent: Math.min(progress.percent, 99) })
      )
    ]);
    clearAssetThumbnailCache();
    detailDensityByPrototype.clear();
    treeHeightRangeByPrototype.clear();
    objectScaleRangeByPrototype.clear();
    objectBrushProfileByPrototype.clear();
    workspace = nextWorkspace;
    selectedRegionId = selectDefaultRegionId(nextWorkspace.regionMetadata);
    renderWorkspace();
    previewStatus = "ready";
    setCapabilityState("ready", "Production Geometry Clipmap preview is active.");
    applyPreviewControlState();
    frameSelectedRegion();
    projectName.textContent = DEFAULT_PROJECT_NAME;
    exposeWindowApi();
    setReadyState("Project ready for canonical Terrain editing.");
  } catch (error) {
    preview.destroy();
    throw error;
  }
}

function bindControls(): void {
  for (const tab of Object.keys(inspectorTabButtons) as TerrainEditorInspectorTab[]) {
    inspectorTabButtons[tab].addEventListener("click", () => setInspectorTab(tab));
  }
  for (const mode of Object.keys(modeButtons) as TerrainEditorToolMode[]) {
    modeButtons[mode].addEventListener("click", () => setToolMode(mode));
  }
  raiseButton.addEventListener("click", () => setDirection("raise"));
  lowerButton.addEventListener("click", () => setDirection("lower"));
  textureAssetUpload.addEventListener("change", () => void importPaletteAsset("texture", textureAssetUpload));
  detailAssetUpload.addEventListener("change", () => void importPaletteAsset("detail", detailAssetUpload));
  treeAssetUpload.addEventListener("change", () => void importPaletteAsset("tree", treeAssetUpload));
  objectAssetUpload.addEventListener("change", () => void importPaletteAsset("object", objectAssetUpload));
  textureRefreshPreviews.addEventListener("click", refreshAssetPreviews);
  treeRefreshPreviews.addEventListener("click", refreshAssetPreviews);
  objectRefreshPreviews.addEventListener("click", refreshAssetPreviews);
  detailViewList.addEventListener("click", () => setDetailPaletteView("list"));
  detailViewGrid.addEventListener("click", () => setDetailPaletteView("grid"));
  texturePaint.addEventListener("click", () => setEraseMode("texture", false));
  textureErase.addEventListener("click", () => setEraseMode("texture", true));
  detailPaint.addEventListener("click", () => setEraseMode("detail", false));
  detailErase.addEventListener("click", () => setEraseMode("detail", true));
  treePaint.addEventListener("click", () => setEraseMode("tree", false));
  treeErase.addEventListener("click", () => setEraseMode("tree", true));
  objectPaint.addEventListener("click", () => setEraseMode("object", false));
  objectErase.addEventListener("click", () => setEraseMode("object", true));
  radiusInput.addEventListener("input", updateBrushOutputs);
  heightStrengthInput.addEventListener("input", updateBrushOutputs);
  textureStrengthInput.addEventListener("input", updateBrushOutputs);
  detailDensityInput.addEventListener("input", () => {
    if (selectedDetailPrototypeId) {
      detailDensityByPrototype.set(selectedDetailPrototypeId, numericInputValue(detailDensityInput));
    }
    updateBrushOutputs();
    renderDetailDensityBadges();
  });
  treeDensityInput.addEventListener("input", updateBrushOutputs);
  treeMinimumHeightInput.addEventListener("input", () => updateTreeHeightRange("minimum"));
  treeMaximumHeightInput.addEventListener("input", () => updateTreeHeightRange("maximum"));
  objectDensityInput.addEventListener("input", updateBrushOutputs);
  objectMinimumScaleInput.addEventListener("input", () => updateObjectScaleRange("minimum"));
  objectMaximumScaleInput.addEventListener("input", () => updateObjectScaleRange("maximum"));
  for (const input of [sceneDirectLightInput, sceneEnvironmentInput, sceneFogInput, sceneWindInput]) {
    input.addEventListener("change", applySceneSettingsFromControls);
  }
  sceneRegionBoundariesInput.addEventListener("change", () => {
    if (previewStatus !== "ready") return;
    try {
      preview.setRegionBoundariesVisible(sceneRegionBoundariesInput.checked);
    } catch (error) {
      reportRecoverableError(error, "Region boundary preview failed");
    }
  });
  previewCameraModeInput.addEventListener("change", applyPreviewCameraMode);
  previewPaintToggle.addEventListener("click", togglePreviewPainting);
  previewMoveSpeedInput.addEventListener("input", applyPreviewNavigationSettings);
  previewEyeHeightInput.addEventListener("input", applyPreviewNavigationSettings);
  importProject.addEventListener("click", () => void importProjectDirectory());
  exportProject.addEventListener("click", () => void exportToDirectory());
  undoButton.addEventListener("click", () => void applyHistory("undo"));
  redoButton.addEventListener("click", () => void applyHistory("redo"));
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", cancelPointerStroke);
  canvas.addEventListener("wheel", onPreviewWheel, { passive: false });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerleave", () => {
    if (activePointerId === null && navigationPointerId === null) hideBrushCursor();
  });
  window.addEventListener(
    "beforeunload",
    () => {
      clearAssetThumbnailCache();
      void assetThumbnailRenderer.destroy();
      preview.destroy();
    },
    { once: true }
  );
  setToolMode("height");
  setInspectorTab("paint");
  updateBrushOutputs();
  updateControls();
}

async function importProjectDirectory(): Promise<void> {
  if (busy) return;
  const picker = window.showDirectoryPicker;
  if (!picker) {
    reportRecoverableError(
      new Error("This browser does not support readable and writable directory selection"),
      "Project import failed"
    );
    return;
  }
  const previousWorkspace = workspace;
  const previousPreviewStatus = previewStatus;
  const previousProjectName = projectName.textContent;
  busy = true;
  updateControls();
  setLiveStatus("Select the Project root containing project.json and public/.");
  try {
    const directory = await picker({ mode: "readwrite" });
    setLoadingState("Validating selected Project root…");
    const artifact = await readTerrainProjectDirectory(directory);
    const nextWorkspace = await TerrainEditorWorkspace.open(artifact);
    clearAssetThumbnailCache();
    detailDensityByPrototype.clear();
    treeHeightRangeByPrototype.clear();
    objectScaleRangeByPrototype.clear();
    objectBrushProfileByPrototype.clear();
    workspace = nextWorkspace;
    selectedRegionId = selectDefaultRegionId(nextWorkspace.regionMetadata);
    hover = null;
    lastCommand = null;
    renderWorkspace();
    const previewOpened = await openPreviewArtifact(artifact);
    projectDirectory = directory;
    projectDirectoryArtifact = artifact;
    projectName.textContent = directory.name || DEFAULT_PROJECT_NAME;
    if (previewOpened) setReadyState("Imported Project is ready.");
    else finishUnavailablePreview();
  } catch (error) {
    if (workspace === previousWorkspace) {
      previewStatus = previousPreviewStatus;
      projectName.textContent = previousProjectName;
      if (previousPreviewStatus === "ready") {
        hidePreviewOverlay();
        setCapabilityState("ready", "Production Geometry Clipmap preview is active.");
      }
    }
    if (error instanceof DOMException && error.name === "AbortError") setLiveStatus("Project import cancelled.");
    else reportRecoverableError(error, "Project import failed");
  } finally {
    busy = false;
    updateControls();
  }
}

async function importPaletteAsset(kind: TerrainEditorAssetKind, input: HTMLInputElement): Promise<void> {
  const browserFile = input.files?.[0];
  const currentWorkspace = workspace;
  const regionId = selectedRegionId;
  if (!browserFile || !currentWorkspace || !regionId || busy) {
    input.value = "";
    return;
  }

  setLoadingState(`Preparing ${kind} asset…`);
  try {
    const uploadedFile: TerrainEditorUploadedFile = {
      name: browserFile.name,
      mimeType: browserFile.type,
      bytes: new Uint8Array(await browserFile.arrayBuffer())
    };
    let assetId: string;
    if (kind === "texture") {
      assetId = await currentWorkspace.addTextureLayer(regionId, uploadedFile);
    } else if (kind === "detail") {
      assetId = await currentWorkspace.addDetailPrototype(regionId, uploadedFile);
    } else if (kind === "tree") {
      assetId = await currentWorkspace.addTreePrototype(regionId, uploadedFile);
    } else {
      assetId = await currentWorkspace.addObjectPrototype(regionId, uploadedFile);
    }
    const entry = requireCatalogEntryForLocalId(currentWorkspace, regionId, kind, assetId);
    setSelectedAssetKey(kind, entry.key);
    if (kind === "detail") detailDensityByPrototype.set(entry.key, 1);
    if (workspace !== currentWorkspace || selectedRegionId !== regionId) {
      throw new Error("Terrain Project changed while the asset was being imported");
    }

    clearAssetThumbnailCache();
    lastCommand = null;
    renderWorkspace();
    setLoadingState(`Loading ${kind} asset through the standard Project loader…`);
    const previewOpened = await openPreviewArtifact(await currentWorkspace.exportArtifact());
    if (previewOpened) setReadyState(`${browserFile.name} is ready to paint.`);
    else finishUnavailablePreview();
  } catch (error) {
    if (preview.camera) {
      previewStatus = "ready";
      hidePreviewOverlay();
      setCapabilityState("ready", "Production Geometry Clipmap preview is active.");
    } else {
      previewStatus = "error";
      showPreviewError(error);
    }
    reportRecoverableError(error, `${toolLabel(kind)} asset import failed`);
  } finally {
    input.value = "";
    busy = false;
    updateControls();
  }
}

async function openPreviewArtifact(artifact: TerrainProjectArtifactEntries): Promise<boolean> {
  try {
    await preview.open(artifact, updateLoadingProgress);
    previewStatus = "ready";
    setCapabilityState("ready", "Production Geometry Clipmap preview is active.");
    applyPreviewControlState();
    frameSelectedRegion();
    hidePreviewOverlay();
    return true;
  } catch (error) {
    previewStatus = "error";
    showPreviewError(error);
    return false;
  }
}

function onPointerDown(event: PointerEvent): void {
  if (event.defaultPrevented) {
    hideBrushCursor();
    return;
  }
  if (!preview.paintingEnabled) {
    hideBrushCursor();
    if (preview.cameraMode === "orbit" && (event.button === 0 || event.button === 2)) {
      if (busy || previewStatus !== "ready") return;
      event.preventDefault();
      navigationPointerId = event.pointerId;
      navigationMode = event.button === 2 ? "pan" : "orbit";
      navigationClientX = event.clientX;
      navigationClientY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
    }
    return;
  }
  if (preview.cameraMode === "orbit" && ((event.button === 0 && event.altKey) || event.button === 2)) {
    if (busy || previewStatus !== "ready") return;
    event.preventDefault();
    navigationPointerId = event.pointerId;
    navigationMode = event.button === 2 ? "pan" : "orbit";
    navigationClientX = event.clientX;
    navigationClientY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    hideBrushCursor();
    canvas.focus({ preventScroll: true });
    return;
  }
  if (event.button !== 0 || busy || previewStatus !== "ready" || !workspace) return;
  const hit = pickTerrain(event);
  if (!hit) return;
  event.preventDefault();
  activePointerId = event.pointerId;
  if (toolMode === "height") {
    try {
      activeHeightStrokeMetrics = {
        pointerDownAt: performance.now(),
        liveUpdateCount: 0,
        pointerDownToFirstVisibleMs: null,
        stampIntervalsMs: [],
        maximumLiveUpdateTaskMs: 0,
        pointerUpToCommitMs: null,
        lastLiveUpdateAt: null
      };
      const radiusMetres = numericInputValue(radiusInput);
      const patch = workspace.beginHeightStrokeToRegion(hit.regionId, {
        points: [{ x: hit.x, z: hit.z }],
        spacingMetres: Math.max(MINIMUM_STAMP_SPACING_METRES, radiusMetres * STAMP_SPACING_RADIUS_RATIO),
        radiusMetres,
        strengthMetres: numericInputValue(heightStrengthInput) * HEIGHT_BRUSH_MAX_DELTA_METRES,
        direction,
        falloff: numericInputValue(falloffInput)
      });
      if (patch) submitLiveHeightPatch(patch, activeHeightStrokeMetrics);
      activeHeightStrokeMetrics.maximumLiveUpdateTaskMs = Math.max(
        activeHeightStrokeMetrics.maximumLiveUpdateTaskMs,
        performance.now() - activeHeightStrokeMetrics.pointerDownAt
      );
    } catch (error) {
      try {
        const restore = workspace.cancelHeightStroke();
        if (restore) preview.updateHeightPatch(restore);
      } catch {
        // The begin operation may fail before a session exists.
      }
      activePointerId = null;
      activeHeightStrokeMetrics = null;
      reportRecoverableError(error, "Height stroke failed to start");
      return;
    }
  } else {
    const pending: PendingSurfaceStrokeStart = {
      pointerId: event.pointerId,
      tool: toolMode,
      initialHit: hit,
      latestHit: hit,
      released: false,
      canceled: false
    };
    pendingSurfaceStrokeStart = pending;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    updateControls();
    void prepareSurfacePointerStroke(pending);
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  canvas.focus({ preventScroll: true });
  updateControls();
}

function onPointerMove(event: PointerEvent): void {
  if (event.defaultPrevented) {
    hideBrushCursor();
    return;
  }
  if (event.pointerId === navigationPointerId && navigationMode) {
    const deltaX = event.clientX - navigationClientX;
    const deltaY = event.clientY - navigationClientY;
    navigationClientX = event.clientX;
    navigationClientY = event.clientY;
    if (navigationMode === "orbit") preview.orbitBy(deltaX, deltaY);
    else preview.panBy(deltaX, deltaY, canvas.clientHeight);
    hideBrushCursor();
    return;
  }
  if (!preview.paintingEnabled) {
    hideBrushCursor();
    return;
  }
  if (activePointerId !== null && event.pointerId !== activePointerId) return;
  if (event.altKey) {
    hideBrushCursor();
    return;
  }
  const hit = pickTerrain(event);
  hover = hit;
  if (hit) {
    showBrushCursor(hit);
    if (activePointerId === event.pointerId) {
      if (pendingSurfaceStrokeStart?.pointerId === event.pointerId) {
        pendingSurfaceStrokeStart.latestHit = hit;
      } else if (toolMode === "height") {
        queueLiveHeightPoint({ x: hit.x, z: hit.z });
      } else {
        queueLiveSurfacePoint({ x: hit.x, z: hit.z });
      }
    }
  } else {
    hideBrushCursor();
  }
}

function onPointerUp(event: PointerEvent): void {
  if (event.defaultPrevented) return;
  if (event.pointerId === navigationPointerId) {
    navigationPointerId = null;
    navigationMode = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    return;
  }
  if (event.pointerId !== activePointerId) return;
  if (pendingSurfaceStrokeStart?.pointerId === event.pointerId) {
    const hit = pickTerrain(event);
    if (hit) pendingSurfaceStrokeStart.latestHit = hit;
    pendingSurfaceStrokeStart.released = true;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    return;
  }
  const hit = pickTerrain(event);
  if (hit) {
    if (toolMode === "height") pendingHeightPoint = { x: hit.x, z: hit.z };
    else pendingSurfacePoint = { x: hit.x, z: hit.z };
  }
  if (toolMode === "height") flushLiveHeightPoint();
  else flushLiveSurfacePoint();
  activePointerId = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (toolMode === "height") {
    void commitLiveHeightStroke(performance.now());
  } else {
    void commitLiveSurfaceStroke();
  }
}

function cancelPointerStroke(event: PointerEvent): void {
  if (event.defaultPrevented) return;
  if (event.pointerId === navigationPointerId) {
    navigationPointerId = null;
    navigationMode = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    return;
  }
  if (event.pointerId !== activePointerId) return;
  if (pendingSurfaceStrokeStart?.pointerId === event.pointerId) {
    pendingSurfaceStrokeStart.canceled = true;
    pendingSurfaceStrokeStart = null;
    activePointerId = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    setLiveStatus("Pointer stroke cancelled before publication.");
    updateControls();
    return;
  }
  cancelLiveHeightFrame();
  cancelLiveSurfaceFrame();
  activePointerId = null;
  if (toolMode === "height" && workspace) {
    try {
      const patch = workspace.cancelHeightStroke();
      if (patch) preview.updateHeightPatch(patch);
      if (activeHeightStrokeMetrics) lastHeightStrokeMetrics = activeHeightStrokeMetrics;
    } catch (error) {
      reportRecoverableError(error, "Height stroke cancellation failed");
    }
    activeHeightStrokeMetrics = null;
    pendingHeightPoint = null;
  } else {
    try {
      if (workspace && activeSurfaceToolMode) preview.updateSurfacePreview(workspace.cancelSurfaceStroke());
    } catch (error) {
      reportRecoverableError(error, "Surface stroke cancellation failed");
    }
    pendingSurfacePoint = null;
    activeSurfaceToolMode = null;
    if (activeSurfaceStrokeMetrics) lastSurfaceStrokeMetrics = activeSurfaceStrokeMetrics;
    activeSurfaceStrokeMetrics = null;
  }
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  setLiveStatus("Pointer stroke cancelled before publication.");
  updateControls();
}

function queueLiveHeightPoint(point: TerrainHeightBrushPoint): void {
  pendingHeightPoint = point;
  if (heightStrokeFrame !== null) return;
  heightStrokeFrame = requestAnimationFrame(() => {
    heightStrokeFrame = null;
    flushLiveHeightPoint();
  });
}

function flushLiveHeightPoint(): void {
  cancelLiveHeightFrame();
  const point = pendingHeightPoint;
  const currentWorkspace = workspace;
  const metrics = activeHeightStrokeMetrics;
  pendingHeightPoint = null;
  if (!point || !currentWorkspace || !metrics) return;
  const startedAt = performance.now();
  try {
    const patch = currentWorkspace.appendHeightStrokePoint(point);
    if (patch) submitLiveHeightPatch(patch, metrics);
  } catch (error) {
    reportRecoverableError(error, "Live height update failed");
  } finally {
    metrics.maximumLiveUpdateTaskMs = Math.max(metrics.maximumLiveUpdateTaskMs, performance.now() - startedAt);
  }
}

function cancelLiveHeightFrame(): void {
  if (heightStrokeFrame === null) return;
  cancelAnimationFrame(heightStrokeFrame);
  heightStrokeFrame = null;
}

function submitLiveHeightPatch(
  patch: Parameters<TerrainEditorPreview["updateHeightPatch"]>[0],
  metrics: MutableTerrainEditorHeightStrokeMetrics
): void {
  preview.updateHeightPatch(patch);
  const now = performance.now();
  if (metrics.lastLiveUpdateAt !== null) metrics.stampIntervalsMs.push(now - metrics.lastLiveUpdateAt);
  metrics.lastLiveUpdateAt = now;
  metrics.liveUpdateCount++;
  if (metrics.pointerDownToFirstVisibleMs !== null) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (metrics.pointerDownToFirstVisibleMs === null) {
        metrics.pointerDownToFirstVisibleMs = performance.now() - metrics.pointerDownAt;
      }
    });
  });
}

async function prepareSurfacePointerStroke(pending: PendingSurfaceStrokeStart): Promise<void> {
  const currentWorkspace = workspace;
  if (!currentWorkspace) return;
  try {
    const sourceDocument = currentWorkspace
      .borrowSnapshot()
      .documents.find((document) => document.descriptor.id === pending.initialHit.regionId);
    if (!sourceDocument) {
      throw new Error(`Terrain editor brush Region ${JSON.stringify(pending.initialHit.regionId)} is missing data`);
    }
    if (resolveSelectedAssetIdOrNull(pending.tool, sourceDocument) === null) {
      const entry = findCatalogEntry(currentWorkspace, pending.tool, selectedAssetKey(pending.tool));
      await currentWorkspace.ensureAssetInRegion(pending.initialHit.regionId, entry);
      if (
        pending.canceled ||
        pendingSurfaceStrokeStart !== pending ||
        workspace !== currentWorkspace ||
        activePointerId !== pending.pointerId
      ) {
        return;
      }
      await preview.synchronizeAssetAttachment(
        currentWorkspace.borrowSnapshot(),
        pending.initialHit.regionId,
        pending.tool
      );
      if (
        pending.canceled ||
        pendingSurfaceStrokeStart !== pending ||
        workspace !== currentWorkspace ||
        activePointerId !== pending.pointerId
      ) {
        return;
      }
      renderWorkspace();
    }

    activeSurfaceStrokeMetrics = { mode: pending.tool, liveUpdateCount: 0 };
    const update = beginLiveSurfaceStroke(pending.initialHit, pending.tool);
    activeSurfaceToolMode = pending.tool;
    pendingSurfaceStrokeStart = null;
    if (update) submitLiveSurfaceUpdate(update, activeSurfaceStrokeMetrics);
    if (pending.latestHit.x !== pending.initialHit.x || pending.latestHit.z !== pending.initialHit.z) {
      const appended = currentWorkspace.appendSurfaceStrokePoint({
        x: pending.latestHit.x,
        z: pending.latestHit.z
      });
      if (appended) submitLiveSurfaceUpdate(appended, activeSurfaceStrokeMetrics);
    }
    if (pending.released) {
      activePointerId = null;
      void commitLiveSurfaceStroke();
    }
  } catch (error) {
    try {
      if (activeSurfaceToolMode) preview.updateSurfacePreview(currentWorkspace.cancelSurfaceStroke());
    } catch {
      // The begin operation may fail before a session exists.
    }
    pendingSurfaceStrokeStart = null;
    activePointerId = null;
    activeSurfaceToolMode = null;
    activeSurfaceStrokeMetrics = null;
    if (canvas.hasPointerCapture(pending.pointerId)) canvas.releasePointerCapture(pending.pointerId);
    reportRecoverableError(error, `${toolLabel(pending.tool)} stroke failed to start`);
    updateControls();
  }
}

function beginLiveSurfaceStroke(
  hit: TerrainHeightfieldIntersection,
  activeTool: Exclude<TerrainEditorToolMode, "height">
): ReturnType<TerrainEditorWorkspace["beginSurfaceStrokeToRegion"]> {
  const currentWorkspace = workspace;
  if (!currentWorkspace) return null;
  const targetDocument = currentWorkspace
    .borrowSnapshot()
    .documents.find((document) => document.descriptor.id === hit.regionId);
  if (!targetDocument) throw new Error(`Terrain editor brush Region ${JSON.stringify(hit.regionId)} is missing data`);
  const radiusMetres = numericInputValue(radiusInput);
  const common = {
    points: [{ x: hit.x, z: hit.z }],
    spacingMetres: Math.max(MINIMUM_STAMP_SPACING_METRES, radiusMetres * STAMP_SPACING_RADIUS_RATIO),
    radiusMetres,
    falloff: numericInputValue(falloffInput)
  };
  switch (activeTool) {
    case "texture":
      return currentWorkspace.beginSurfaceStrokeToRegion(hit.regionId, {
        kind: activeTool,
        ...common,
        layerId: resolveSelectedAssetId("texture", targetDocument),
        opacity: numericInputValue(textureStrengthInput),
        targetWeight: 1,
        erase: textureErasing
      });
    case "detail":
      return currentWorkspace.beginSurfaceStrokeToRegion(hit.regionId, {
        kind: activeTool,
        ...common,
        prototypeId: resolveSelectedAssetId("detail", targetDocument),
        opacity: 1,
        targetCount: Math.round(numericInputValue(detailDensityInput) * DETAIL_MAXIMUM_COUNT_PER_CELL),
        distributionNoise: 0,
        erase: detailErasing
      });
    case "tree":
      return currentWorkspace.beginSurfaceStrokeToRegion(hit.regionId, {
        kind: activeTool,
        ...common,
        prototypeId: resolveSelectedAssetId("tree", targetDocument),
        density: numericInputValue(treeDensityInput),
        distributionNoise: 0,
        minimumScale: numericInputValue(treeMinimumHeightInput),
        maximumScale: numericInputValue(treeMaximumHeightInput),
        randomRotation: false,
        erase: treeErasing,
        eraseSelectedOnly: true
      });
    case "object": {
      const objectProfile = selectedObjectBrushProfile(currentWorkspace);
      return currentWorkspace.beginSurfaceStrokeToRegion(hit.regionId, {
        kind: activeTool,
        ...common,
        prototypeId: resolveSelectedAssetId("object", targetDocument),
        density: numericInputValue(objectDensityInput),
        referenceSpacingMetres: objectProfile.referenceSpacingMetres,
        minimumScale: numericInputValue(objectMinimumScaleInput),
        maximumScale: numericInputValue(objectMaximumScaleInput),
        erase: objectErasing
      });
    }
  }
}

function queueLiveSurfacePoint(point: TerrainHeightBrushPoint): void {
  pendingSurfacePoint = point;
  if (surfaceStrokeFrame !== null) return;
  surfaceStrokeFrame = requestAnimationFrame(() => {
    surfaceStrokeFrame = null;
    flushLiveSurfacePoint();
  });
}

function flushLiveSurfacePoint(): void {
  cancelLiveSurfaceFrame();
  const point = pendingSurfacePoint;
  const currentWorkspace = workspace;
  const metrics = activeSurfaceStrokeMetrics;
  pendingSurfacePoint = null;
  if (!point || !currentWorkspace || !activeSurfaceToolMode || !metrics) return;
  try {
    const update = currentWorkspace.appendSurfaceStrokePoint(point);
    if (update) submitLiveSurfaceUpdate(update, metrics);
  } catch (error) {
    reportRecoverableError(error, `Live ${toolLabel(activeSurfaceToolMode)} update failed`);
  }
}

function submitLiveSurfaceUpdate(
  update: Parameters<TerrainEditorPreview["updateSurfacePreview"]>[0],
  metrics: MutableTerrainEditorSurfaceStrokeMetrics
): void {
  preview.updateSurfacePreview(update);
  metrics.liveUpdateCount++;
}

function cancelLiveSurfaceFrame(): void {
  if (surfaceStrokeFrame === null) return;
  cancelAnimationFrame(surfaceStrokeFrame);
  surfaceStrokeFrame = null;
}

async function commitLiveHeightStroke(pointerUpAt: number): Promise<void> {
  const currentWorkspace = workspace;
  const metrics = activeHeightStrokeMetrics;
  if (!currentWorkspace || !metrics || busy) return;
  busy = true;
  updateControls();
  try {
    const command = currentWorkspace.commitHeightStroke();
    if (!command) {
      setLiveStatus("Stroke produced no canonical data change.");
      return;
    }
    lastCommand = summarizeCommand(command);
    renderWorkspace();
    await refreshPreviewForCommand(command);
    metrics.pointerUpToCommitMs = performance.now() - pointerUpAt;
    if (previewStatus === "ready") {
      setLiveStatus(
        `Committed height stroke across ${lastCommand.regionCount} Region${lastCommand.regionCount === 1 ? "" : "s"}; ${lastCommand.sampleCount.toLocaleString()} canonical values changed.`
      );
    }
  } catch (error) {
    reportRecoverableError(error, "Height stroke failed");
    await refreshPreview(["terrain"]);
  } finally {
    lastHeightStrokeMetrics = metrics;
    activeHeightStrokeMetrics = null;
    busy = false;
    updateControls();
  }
}

function onPreviewWheel(event: WheelEvent): void {
  if (busy || previewStatus !== "ready" || preview.cameraMode === "roam") return;
  event.preventDefault();
  preview.zoomBy(event.deltaY);
  hideBrushCursor();
}

async function commitLiveSurfaceStroke(): Promise<void> {
  const currentWorkspace = workspace;
  const activeTool = activeSurfaceToolMode;
  const metrics = activeSurfaceStrokeMetrics;
  activeSurfaceToolMode = null;
  pendingSurfacePoint = null;
  if (!currentWorkspace || !activeTool || busy) return;
  busy = true;
  updateControls();
  try {
    const command = currentWorkspace.commitSurfaceStroke();
    if (!command) {
      setLiveStatus("Stroke produced no canonical data change.");
      return;
    }
    lastCommand = summarizeCommand(command);
    renderWorkspace();
    await refreshPreviewForCommand(command);
    if (previewStatus === "ready") {
      setLiveStatus(
        `Committed ${toolLabel(command.kind)} stroke across ${lastCommand.regionCount} Region${lastCommand.regionCount === 1 ? "" : "s"}; ${lastCommand.sampleCount.toLocaleString()} canonical values changed.`
      );
    }
  } catch (error) {
    reportRecoverableError(error, `${toolLabel(activeTool)} stroke failed`);
    await refreshPreview([
      activeTool === "detail"
        ? "details"
        : activeTool === "tree"
          ? "trees"
          : activeTool === "object"
            ? "objects"
            : "terrain"
    ]);
  } finally {
    if (metrics) lastSurfaceStrokeMetrics = metrics;
    activeSurfaceStrokeMetrics = null;
    busy = false;
    updateControls();
  }
}

async function applyHistory(action: "undo" | "redo"): Promise<void> {
  const currentWorkspace = workspace;
  if (!currentWorkspace || busy) return;
  busy = true;
  updateControls();
  try {
    const command = action === "undo" ? currentWorkspace.undo() : currentWorkspace.redo();
    if (!command) return;
    lastCommand = summarizeCommand(command);
    renderWorkspace();
    await refreshPreviewForCommand(command);
    if (previewStatus === "ready") {
      setLiveStatus(`${action === "undo" ? "Undid" : "Redid"} one atomic ${toolLabel(command.kind)} stroke.`);
    }
  } catch (error) {
    reportRecoverableError(error, `${action === "undo" ? "Undo" : "Redo"} failed`);
  } finally {
    busy = false;
    updateControls();
  }
}

async function refreshPreviewForCommand(command: TerrainEditorCommand): Promise<void> {
  const currentWorkspace = workspace;
  if (!currentWorkspace) return;
  if (command.kind === "height") {
    const refreshSurfaceInstances = command.regions.some(
      (region) =>
        region.treeHeightChanges.length > 0 ||
        region.detailHeightChanges.length > 0 ||
        region.objectHeightChanges.length > 0
    );
    await preview.synchronizeHeight(
      currentWorkspace.borrowSnapshot(),
      currentWorkspace.readHeightCommandPatches(command),
      refreshSurfaceInstances
    );
    previewStatus = "ready";
    setCapabilityState("ready", "Production Geometry Clipmap preview is synchronized.");
    return;
  }
  if (command.kind === "texture") {
    await preview.synchronizeTexture(
      currentWorkspace.borrowSnapshot(),
      currentWorkspace.readTextureCommandPatches(command)
    );
    previewStatus = "ready";
    setCapabilityState("ready", "Production Geometry Clipmap preview is synchronized.");
    return;
  }
  const targets: readonly TerrainEditorPreviewRefreshTarget[] =
    command.kind === "detail" ? ["details"] : command.kind === "tree" ? ["trees"] : ["objects"];
  await refreshPreview(
    targets,
    command.regions.map((region) => region.regionId)
  );
}

async function refreshPreview(
  targets: readonly TerrainEditorPreviewRefreshTarget[] = ["terrain"],
  changedRegionIds?: readonly string[]
): Promise<void> {
  const currentWorkspace = workspace;
  if (!currentWorkspace || !preview.camera || previewStatus === "loading") return;
  try {
    await preview.refresh(currentWorkspace.borrowSnapshot(), targets, changedRegionIds);
    previewStatus = "ready";
    setCapabilityState("ready", "Production Geometry Clipmap preview is synchronized.");
  } catch (error) {
    previewStatus = "capability-error";
    setCapabilityState("error", errorMessage(error));
    setLiveStatus("Canonical edit is preserved; the current renderer cannot preview it.");
  }
}

async function exportToDirectory(): Promise<void> {
  const currentWorkspace = workspace;
  if (!currentWorkspace || busy) return;
  const picker = window.showDirectoryPicker;
  if (!picker) {
    reportRecoverableError(new Error("This browser does not support writable directory selection"), "Export failed");
    return;
  }
  busy = true;
  updateControls();
  let progressVisible = false;
  try {
    const destination = projectDirectory ?? (await picker({ mode: "readwrite" }));
    showExportProgress("Building and validating complete Project closure…");
    progressVisible = true;
    const artifact = await currentWorkspace.exportArtifact();
    await writeTerrainProjectDirectory(
      destination,
      artifact,
      destination === projectDirectory ? (projectDirectoryArtifact ?? undefined) : undefined,
      updateExportProgress
    );
    projectDirectory = destination;
    projectDirectoryArtifact = artifact;
    finishExportProgress();
    setLiveStatus(`Exported ${artifact.size.toLocaleString()} verified files.`);
  } catch (error) {
    if (progressVisible) hidePreviewOverlay();
    if (error instanceof DOMException && error.name === "AbortError") setLiveStatus("Export cancelled.");
    else reportRecoverableError(error, "Export failed");
  } finally {
    busy = false;
    updateControls();
  }
}

function showExportProgress(message: string): void {
  loadingPercent = 0;
  loadingHistory = [0];
  previewOverlay.hidden = false;
  previewOverlay.dataset.state = "loading";
  const strong = previewOverlay.querySelector("strong");
  const detail = previewOverlay.querySelector(".overlay-card span:last-child");
  previewProgress.hidden = false;
  previewProgressOutput.hidden = false;
  if (strong) strong.replaceChildren(document.createTextNode("Exporting Project · "), previewProgressOutput);
  if (detail) detail.textContent = message;
  setLoadingProgress(0);
  setCapabilityState("idle", message);
  setLiveStatus(message);
}

function updateExportProgress(progress: TerrainProjectDirectoryWriteProgress): void {
  setLoadingProgress(progress.percent);
  const phase =
    progress.phase === "validation"
      ? "Artifact validated"
      : progress.phase === "destination"
        ? "Destination verified"
        : progress.phase === "writing"
          ? "Writing files"
          : progress.phase === "verification"
            ? "Verifying export"
            : "Export complete";
  const message = `${phase} · ${progress.percent}% · ${progress.completedFiles}/${progress.fileCount} files`;
  const detail = previewOverlay.querySelector(".overlay-card span:last-child");
  if (detail) detail.textContent = message;
  setCapabilityState("idle", message);
  setLiveStatus(message);
}

function finishExportProgress(): void {
  setLoadingProgress(100);
  hidePreviewOverlay();
  setCapabilityState("ready", "Verified Project export is complete.");
}

function pickTerrain(event: PointerEvent): TerrainHeightfieldIntersection | null {
  const currentWorkspace = workspace;
  const camera = preview.camera;
  if (!currentWorkspace || !camera || previewStatus !== "ready") return null;
  const bounds = canvas.getBoundingClientRect();
  pickScreenPoint.set(
    ((event.clientX - bounds.left) / bounds.width) * canvas.width,
    ((event.clientY - bounds.top) / bounds.height) * canvas.height
  );
  camera.screenPointToRay(pickScreenPoint, pickRay);
  const selectedDocument = selectedRegionDocument();
  if (!selectedDocument) return null;
  return intersectTerrainWorldHeightfield([selectedDocument], {
    origin: pickRay.origin,
    direction: pickRay.direction
  });
}

function showBrushCursor(hit: TerrainHeightfieldIntersection): void {
  const camera = preview.camera;
  const document = selectedRegionDocument();
  if (!camera || !document) return;
  const bounds = canvas.getBoundingClientRect();
  const shellBounds = previewShell.getBoundingClientRect();
  const radius = numericInputValue(radiusInput);
  const createTerrainRing = (ringRadius: number): string | null => {
    const points: string[] = [];
    for (let segment = 0; segment < 64; segment++) {
      const angle = (segment / 64) * Math.PI * 2;
      const worldX = hit.x + Math.cos(angle) * ringRadius;
      const worldZ = hit.z + Math.sin(angle) * ringRadius;
      const worldY = sampleTerrainDocumentHeight(document, worldX, worldZ);
      if (worldY === null) continue;
      brushWorldPoint.set(worldX, worldY + 0.06, worldZ);
      const screen = camera.worldToScreenPoint(brushWorldPoint, projectedPoint);
      if (screen.z <= 0) continue;
      const x = bounds.left - shellBounds.left + (screen.x / canvas.width) * bounds.width;
      const y = bounds.top - shellBounds.top + (screen.y / canvas.height) * bounds.height;
      points.push(`${points.length === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return points.length >= 3 ? `${points.join(" ")} Z` : null;
  };
  const outer = createTerrainRing(radius);
  const inner = createTerrainRing(radius * 0.5);
  if (!outer || !inner) {
    hideBrushCursor();
    return;
  }
  brushCursor.setAttribute("viewBox", `0 0 ${previewShell.clientWidth} ${previewShell.clientHeight}`);
  brushCursorOuter.setAttribute("d", outer);
  brushCursorInner.setAttribute("d", inner);
  brushCursor.dataset.visible = "true";
}

function hideBrushCursor(): void {
  brushCursor.dataset.visible = "false";
}

function setDirection(nextDirection: "raise" | "lower"): void {
  direction = nextDirection;
  raiseButton.classList.toggle("is-active", direction === "raise");
  lowerButton.classList.toggle("is-active", direction === "lower");
  raiseButton.setAttribute("aria-pressed", String(direction === "raise"));
  lowerButton.setAttribute("aria-pressed", String(direction === "lower"));
  updateToolPresentation();
}

function setDetailPaletteView(view: "list" | "grid"): void {
  const list = view === "list";
  detailPrototypePalette.classList.toggle("is-list", list);
  detailPrototypePalette.classList.toggle("is-grid", !list);
  detailViewList.classList.toggle("is-active", list);
  detailViewGrid.classList.toggle("is-active", !list);
  detailViewList.setAttribute("aria-pressed", String(list));
  detailViewGrid.setAttribute("aria-pressed", String(!list));
}

function refreshAssetPreviews(): void {
  clearAssetThumbnailCache();
  renderToolOptions();
  setLiveStatus("Project-bound asset previews refreshed.");
}

function setToolMode(mode: TerrainEditorToolMode): void {
  toolMode = mode;
  for (const candidate of Object.keys(modeButtons) as TerrainEditorToolMode[]) {
    const active = candidate === mode;
    modeButtons[candidate].classList.toggle("is-active", active);
    modeButtons[candidate].setAttribute("aria-selected", String(active));
    toolPanels[candidate].hidden = !active;
  }
  if (mode === "texture") startAssetPaletteThumbnails(textureLayerPalette);
  updateToolPresentation();
  updateControls();
}

function setInspectorTab(tab: TerrainEditorInspectorTab): void {
  for (const candidate of Object.keys(inspectorTabButtons) as TerrainEditorInspectorTab[]) {
    const active = candidate === tab;
    inspectorTabButtons[candidate].classList.toggle("is-active", active);
    inspectorTabButtons[candidate].setAttribute("aria-selected", String(active));
    inspectorTabPanels[candidate].hidden = !active;
  }
}

function setEraseMode(mode: Exclude<TerrainEditorToolMode, "height">, erase: boolean): void {
  if (mode === "texture") textureErasing = erase;
  else if (mode === "detail") detailErasing = erase;
  else if (mode === "tree") treeErasing = erase;
  else objectErasing = erase;
  const [paintButton, eraseButton] =
    mode === "texture"
      ? [texturePaint, textureErase]
      : mode === "detail"
        ? [detailPaint, detailErase]
        : mode === "tree"
          ? [treePaint, treeErase]
          : [objectPaint, objectErase];
  paintButton.classList.toggle("is-active", !erase);
  eraseButton.classList.toggle("is-active", erase);
  paintButton.setAttribute("aria-pressed", String(!erase));
  eraseButton.setAttribute("aria-pressed", String(erase));
  updateToolPresentation();
}

function updateToolPresentation(): void {
  const erasing =
    toolMode === "texture"
      ? textureErasing
      : toolMode === "detail"
        ? detailErasing
        : toolMode === "tree"
          ? treeErasing
          : toolMode === "object"
            ? objectErasing
            : false;
  previewShell.dataset.tool = toolMode === "height" ? direction : erasing ? "erase" : toolMode;
  const action =
    toolMode === "height"
      ? `${direction === "raise" ? "Raise" : "Lower"} height`
      : toolMode === "texture"
        ? `${erasing ? "Erase" : "Paint"} TerrainLayer weights`
        : toolMode === "detail"
          ? `${erasing ? "Erase" : "Paint"} grass and flower density`
          : toolMode === "tree"
            ? `${erasing ? "Erase" : "Place"} height-snapped trees`
            : `${erasing ? "Erase" : "Place"} height-snapped objects`;
  brushModeHint.textContent = action;
  previewShell.dataset.painting = String(preview.paintingEnabled);
  previewPaintToggle.setAttribute("aria-pressed", String(preview.paintingEnabled));
  previewPaintToggle.title = preview.paintingEnabled
    ? "Painting is active; switch the primary pointer to camera navigation"
    : "Camera navigation is active; switch the primary pointer to painting";
  if (preview.paintingEnabled) {
    previewInstructions.textContent =
      preview.cameraMode === "roam"
        ? `${action}. Drag to paint above the movement zone · drag the lower 40% to move · turn Paint off to look around.`
        : `${action}. Drag to paint · Alt+drag to orbit · right-drag to pan · wheel to zoom.`;
  } else {
    previewInstructions.textContent =
      preview.cameraMode === "roam"
        ? "Ground roam · drag the lower 40% to move · drag the upper 60% to look · turn Paint on to edit."
        : "Camera navigation · drag to orbit · right-drag to pan · wheel to zoom · turn Paint on to edit.";
  }
}

function updateBrushOutputs(): void {
  radiusOutput.value = `${numericInputValue(radiusInput).toFixed(0)} m`;
  const heightStrength = numericInputValue(heightStrengthInput);
  heightStrengthOutput.value = `${Math.round(heightStrength * 100)}% · ${(heightStrength * HEIGHT_BRUSH_MAX_DELTA_METRES).toFixed(1)} m/stamp`;
  textureStrengthOutput.value = `${Math.round(numericInputValue(textureStrengthInput) * 100)}%`;
  detailDensityOutput.value = `${Math.round(numericInputValue(detailDensityInput) * 100)}%`;
  treeDensityOutput.value = `${Math.round(numericInputValue(treeDensityInput) * 100)}%`;
  objectDensityOutput.value = `${Math.round(numericInputValue(objectDensityInput) * 100)}%`;
  previewMoveSpeedOutput.value = `${numericInputValue(previewMoveSpeedInput).toFixed(0)} m/s`;
  previewEyeHeightOutput.value = `${numericInputValue(previewEyeHeightInput).toFixed(1).replace(/\.0$/, "")} m`;
  if (hover) showBrushCursor(hover);
}

function renderWorkspace(): void {
  renderRegionList();
  renderRegionDetails();
  renderToolOptions();
  synchronizeSceneSettingsControls();
  updateControls();
}

function synchronizeSceneSettingsControls(): void {
  const settings = workspace?.sceneSettings;
  sceneDirectLightInput.checked = settings?.directLightEnabled ?? false;
  sceneEnvironmentInput.checked = settings?.environmentEnabled ?? false;
  sceneFogInput.checked = settings?.fogEnabled ?? false;
  sceneWindInput.checked = settings?.windEnabled ?? false;
}

function applySceneSettingsFromControls(): void {
  const currentWorkspace = workspace;
  if (!currentWorkspace || busy) return;
  try {
    const requested: TerrainEditorSceneSettings = {
      directLightEnabled: sceneDirectLightInput.checked,
      environmentEnabled: sceneEnvironmentInput.checked,
      fogEnabled: sceneFogInput.checked,
      windEnabled: sceneWindInput.checked
    };
    const settings = currentWorkspace.updateSceneSettings(requested);
    preview.applySceneSettings(settings);
    updateControls();
    setLiveStatus("Scene fog, lighting, and wind settings updated in the Project.");
  } catch (error) {
    synchronizeSceneSettingsControls();
    reportRecoverableError(error, "Scene settings update failed");
  }
}

function applyPreviewCameraMode(): void {
  if (previewStatus !== "ready") return;
  try {
    preview.setCameraMode(previewCameraModeInput.value as TerrainEditorPreviewCameraMode);
    if (preview.cameraMode === "orbit") frameSelectedRegion();
    updateToolPresentation();
    updateControls();
  } catch (error) {
    reportRecoverableError(error, "Preview camera mode failed");
  }
}

function togglePreviewPainting(): void {
  if (previewStatus !== "ready" || busy || activePointerId !== null || navigationPointerId !== null) return;
  try {
    preview.setPaintingEnabled(!preview.paintingEnabled);
    hideBrushCursor();
    updateToolPresentation();
    updateControls();
  } catch (error) {
    reportRecoverableError(error, "Preview painting mode failed");
  }
}

function applyPreviewNavigationSettings(): void {
  updateBrushOutputs();
  if (previewStatus !== "ready") return;
  try {
    preview.setMovementSpeed(numericInputValue(previewMoveSpeedInput));
    preview.setEyeHeight(numericInputValue(previewEyeHeightInput));
  } catch (error) {
    reportRecoverableError(error, "Preview navigation setting failed");
  }
}

function applyPreviewControlState(): void {
  preview.setMovementSpeed(numericInputValue(previewMoveSpeedInput));
  preview.setEyeHeight(numericInputValue(previewEyeHeightInput));
  preview.setCameraMode(previewCameraModeInput.value as TerrainEditorPreviewCameraMode);
  preview.setPaintingEnabled(true);
  preview.setRegionBoundariesVisible(sceneRegionBoundariesInput.checked);
  updateToolPresentation();
}

function renderRegionList(): void {
  const currentWorkspace = workspace;
  regionList.replaceChildren();
  if (!currentWorkspace || currentWorkspace.regionMetadata.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.setAttribute("role", "option");
    empty.setAttribute("aria-disabled", "true");
    empty.textContent = "This Project contains no Terrain Regions.";
    regionList.append(empty);
    return;
  }
  const coordinateLabels = createRegionCoordinateLabels(currentWorkspace.regionMetadata);
  for (const metadata of currentWorkspace.regionMetadata) {
    const option = document.createElement("li");
    option.setAttribute("role", "option");
    option.tabIndex = 0;
    option.dataset.regionId = metadata.id;
    option.dataset.dirty = String(metadata.dirty);
    option.classList.toggle("is-selected", metadata.id === selectedRegionId);
    option.classList.toggle("is-dirty", metadata.dirty);
    option.setAttribute("aria-selected", String(metadata.id === selectedRegionId));
    option.append(regionText("region-id", coordinateLabels.get(metadata.id) ?? "Region"));
    option.append(
      regionText(
        "region-meta",
        `${metadata.sampleSize[0]}×${metadata.sampleSize[1]} · ${formatRegionOrigin(metadata.worldPosition)}`
      )
    );
    option.addEventListener("click", () => selectRegion(metadata.id));
    option.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectRegion(metadata.id);
      }
    });
    regionList.append(option);
  }
}

function createRegionCoordinateLabels(regions: readonly TerrainEditorRegionMetadata[]): ReadonlyMap<string, string> {
  const xCoordinates = resolveRegularRegionAxis(regions, 0);
  const zCoordinates = resolveRegularRegionAxis(regions, 2);
  return new Map(
    regions.map((region) => [
      region.id,
      xCoordinates && zCoordinates
        ? `(${xCoordinates.get(region.worldPosition[0])}, ${zCoordinates.get(region.worldPosition[2])})`
        : `(${Number(region.worldPosition[0].toFixed(1))} m, ${Number(region.worldPosition[2].toFixed(1))} m)`
    ])
  );
}

function resolveRegularRegionAxis(
  regions: readonly TerrainEditorRegionMetadata[],
  axis: 0 | 2
): ReadonlyMap<number, number> | null {
  if (regions.length === 0) return new Map();
  const extent = regions[0].worldSize[axis];
  const tolerance = Math.max(1e-6, Math.abs(extent) * 1e-6);
  if (
    !Number.isFinite(extent) ||
    extent <= 0 ||
    regions.some((region) => Math.abs(region.worldSize[axis] - extent) > tolerance)
  ) {
    return null;
  }
  const origins = [...new Set(regions.map((region) => region.worldPosition[axis]))].sort((left, right) => left - right);
  const first = origins[0];
  const gridIndices = origins.map((origin) => Math.round((origin - first) / extent));
  if (origins.some((origin, index) => Math.abs(first + gridIndices[index] * extent - origin) > tolerance)) return null;
  const midpoint = (origins[0] + origins[origins.length - 1]) * 0.5;
  const anchorIndex = origins.reduce(
    (closest, origin, index) => (Math.abs(origin - midpoint) < Math.abs(origins[closest] - midpoint) ? index : closest),
    0
  );
  const anchorGridIndex = gridIndices[anchorIndex];
  return new Map(origins.map((origin, index) => [origin, gridIndices[index] - anchorGridIndex]));
}

function formatRegionOrigin(origin: readonly [number, number, number]): string {
  return `${Number(origin[0].toFixed(1))}, ${Number(origin[2].toFixed(1))} m`;
}

function selectRegion(regionId: string): void {
  if (!workspace || busy) return;
  selectedRegionId = regionId;
  renderWorkspace();
  void activateSelectedRegion(regionId);
}

async function activateSelectedRegion(regionId: string): Promise<void> {
  try {
    frameSelectedRegion();
    setLiveStatus(`Selected Region ${regionId}; all Project Regions remain resident.`);
  } catch (error) {
    reportRecoverableError(error, "Region preview failed");
  }
}

function frameSelectedRegion(): void {
  const region = selectedWorldRegion();
  const document = selectedRegionDocument();
  if (!region || !document || previewStatus !== "ready") return;
  const centerHeight = sampleTerrainDocumentHeight(
    document,
    region.worldPosition[0] + region.worldSize[0] * 0.5,
    region.worldPosition[2] + region.worldSize[2] * 0.5
  );
  if (centerHeight === null)
    throw new Error(`Selected Region ${JSON.stringify(region.id)} has no center height sample`);
  preview.frameRegion(region, centerHeight);
}

function selectedWorldRegion(): TerrainProjectWorldRegion | null {
  if (!workspace || !selectedRegionId) return null;
  return workspace.borrowSnapshot().world.regions.find((region) => region.id === selectedRegionId) ?? null;
}

function renderRegionDetails(): void {
  const metadata = selectedRegionMetadata();
  const document = selectedRegionDocument();
  regionDetails.replaceChildren(
    detailRow("Project Regions", `${workspace?.regionIds.length ?? 0}`),
    detailRow("Selection", metadata?.id ?? "None"),
    detailRow("Sample size", metadata ? `${metadata.sampleSize[0]} × ${metadata.sampleSize[1]}` : "—"),
    detailRow(
      "Height range",
      document
        ? `${document.manifest.heightmap.minMetres.toFixed(1)} → ${document.manifest.heightmap.maxMetres.toFixed(1)} m`
        : "—"
    ),
    detailRow(
      "World bounds",
      metadata
        ? `${formatVector(metadata.worldPosition)} → ${formatVector(addVectors(metadata.worldPosition, metadata.worldSize))}`
        : "—"
    )
  );
}

function renderToolOptions(): void {
  const document = selectedRegionDocument();
  const currentWorkspace = workspace;
  const catalog = currentWorkspace?.assetCatalog;
  selectedTextureLayerId = renderAssetPalette(
    textureLayerPalette,
    createPaletteChoices(catalog?.textures ?? []),
    selectedTextureLayerId,
    "No TerrainLayer",
    (key) => void selectCatalogAsset("texture", key)
  );
  selectedDetailPrototypeId = renderAssetPalette(
    detailPrototypePalette,
    createPaletteChoices(catalog?.details ?? []),
    selectedDetailPrototypeId,
    "No Detail prototype",
    (key) => void selectCatalogAsset("detail", key)
  );
  if (!detailDensityByPrototype.has(selectedDetailPrototypeId) && selectedDetailPrototypeId) {
    detailDensityByPrototype.set(selectedDetailPrototypeId, 1);
  }
  detailDensityInput.value = String(detailDensityByPrototype.get(selectedDetailPrototypeId) ?? 1);
  renderDetailDensityBadges();
  selectedTreePrototypeId = renderAssetPalette(
    treePrototypePalette,
    createPaletteChoices(catalog?.trees ?? []),
    selectedTreePrototypeId,
    "No tree prototype",
    (key) => void selectCatalogAsset("tree", key)
  );
  synchronizeTreeHeightControls(document);
  selectedObjectPrototypeId = renderAssetPalette(
    objectPrototypePalette,
    createPaletteChoices(catalog?.objects ?? []),
    selectedObjectPrototypeId,
    "No object prototype",
    (key) => void selectCatalogAsset("object", key)
  );
  synchronizeObjectScaleControls();
  updateBrushOutputs();
}

interface TerrainEditorPaletteChoice {
  readonly id: string;
  readonly label: string;
  readonly kind: TerrainEditorAssetKind;
  readonly resourceUrl: string;
  readonly sourceRegionId: string;
  readonly sourceId: string;
}

function createPaletteChoices(
  entries: readonly TerrainEditorAssetCatalogEntry[]
): readonly TerrainEditorPaletteChoice[] {
  return entries.map((entry) => ({
    id: entry.key,
    label: assetDisplayName(entry.name, entry.resourceUrl),
    kind: entry.kind,
    resourceUrl: entry.resourceUrl,
    sourceRegionId: entry.sourceRegionId,
    sourceId: entry.sourceId
  }));
}

function selectCatalogAsset(kind: TerrainEditorAssetKind, key: string): void {
  const currentWorkspace = workspace;
  if (!currentWorkspace || busy) return;
  findCatalogEntry(currentWorkspace, kind, key);
  setSelectedAssetKey(kind, key);
  renderToolOptions();
  updateControls();
}

function synchronizeTreeHeightControls(document: ReturnType<typeof selectedRegionDocument>): void {
  if (!document || !selectedTreePrototypeId) return;
  const key = selectedTreePrototypeId;
  let range = treeHeightRangeByPrototype.get(key);
  if (!range) {
    const localId = resolveSelectedAssetIdOrNull("tree", document);
    const heights = document.manifest.treeInstances
      .filter((instance) => localId !== null && instance.prototypeId === localId)
      .map((instance) => instance.scale[1])
      .filter((height) => Number.isFinite(height) && height > 0);
    range = heights.length
      ? { minimum: Math.min(...heights), maximum: Math.max(...heights) }
      : { minimum: 0.8, maximum: 1.2 };
    treeHeightRangeByPrototype.set(key, range);
  }
  treeMinimumHeightInput.value = formatTreeHeight(range.minimum);
  treeMaximumHeightInput.value = formatTreeHeight(range.maximum);
}

function updateTreeHeightRange(changed: "minimum" | "maximum"): void {
  if (!selectedTreePrototypeId) return;
  let minimum = numericInputValue(treeMinimumHeightInput);
  let maximum = numericInputValue(treeMaximumHeightInput);
  if (minimum > maximum) {
    if (changed === "minimum") {
      maximum = minimum;
      treeMaximumHeightInput.value = formatTreeHeight(maximum);
    } else {
      minimum = maximum;
      treeMinimumHeightInput.value = formatTreeHeight(minimum);
    }
  }
  treeHeightRangeByPrototype.set(selectedTreePrototypeId, {
    minimum,
    maximum
  });
}

function synchronizeObjectScaleControls(): void {
  if (!selectedObjectPrototypeId) return;
  const currentWorkspace = workspace;
  const profile = currentWorkspace ? selectedObjectBrushProfile(currentWorkspace) : null;
  const range = objectScaleRangeByPrototype.get(selectedObjectPrototypeId) ?? {
    minimum: profile?.minimumScale ?? 0.8,
    maximum: profile?.maximumScale ?? 1.2
  };
  objectScaleRangeByPrototype.set(selectedObjectPrototypeId, range);
  objectMinimumScaleInput.value = formatTreeHeight(range.minimum);
  objectMaximumScaleInput.value = formatTreeHeight(range.maximum);
}

function selectedObjectBrushProfile(currentWorkspace: TerrainEditorWorkspace): TerrainEditorObjectBrushProfile {
  const key = selectedObjectPrototypeId;
  const cached = objectBrushProfileByPrototype.get(key);
  if (cached) return cached;
  const entry = findCatalogEntry(currentWorkspace, "object", key);
  const profile = deriveTerrainEditorObjectBrushProfile(currentWorkspace.borrowSnapshot().documents, entry);
  objectBrushProfileByPrototype.set(key, profile);
  return profile;
}

function updateObjectScaleRange(changed: "minimum" | "maximum"): void {
  if (!selectedObjectPrototypeId) return;
  let minimum = numericInputValue(objectMinimumScaleInput);
  let maximum = numericInputValue(objectMaximumScaleInput);
  if (minimum > maximum) {
    if (changed === "minimum") {
      maximum = minimum;
      objectMaximumScaleInput.value = formatTreeHeight(maximum);
    } else {
      minimum = maximum;
      objectMinimumScaleInput.value = formatTreeHeight(minimum);
    }
  }
  objectScaleRangeByPrototype.set(selectedObjectPrototypeId, { minimum, maximum });
}

function formatTreeHeight(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function renderAssetPalette(
  palette: HTMLElement,
  choices: readonly TerrainEditorPaletteChoice[],
  selectedId: string,
  emptyLabel: string,
  onSelect: (id: string) => void
): string {
  palette.replaceChildren();
  if (choices.length === 0) {
    const empty = document.createElement("p");
    empty.className = "asset-palette-empty";
    empty.textContent = emptyLabel;
    palette.append(empty);
    return "";
  }
  const selection = choices.some((choice) => choice.id === selectedId) ? selectedId : choices[0].id;
  for (const choice of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "asset-palette-card";
    button.dataset.assetId = choice.id;
    button.dataset.previewKey = choice.id;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(choice.id === selection));
    button.title = choice.label;
    attachLazyAssetThumbnail(button, choice);
    const label = document.createElement("span");
    label.className = "asset-label";
    label.textContent = choice.label;
    button.append(label);
    button.addEventListener("click", () => onSelect(choice.id));
    palette.append(button);
  }
  return selection;
}

function renderDetailDensityBadges(): void {
  for (const card of detailPrototypePalette.querySelectorAll<HTMLButtonElement>(".asset-palette-card")) {
    card.querySelector(".asset-density")?.remove();
    const density = detailDensityByPrototype.get(card.dataset.assetId ?? "") ?? 1;
    const badge = document.createElement("span");
    badge.className = "asset-density";
    badge.textContent = `${Math.round(density * 100)}%`;
    card.append(badge);
  }
}

interface CachedAssetThumbnail {
  readonly kind: "image" | "model";
  readonly url: string;
}

function attachLazyAssetThumbnail(button: HTMLButtonElement, choice: TerrainEditorPaletteChoice): void {
  const placeholder = document.createElement("span");
  placeholder.className = "asset-palette-placeholder";
  placeholder.textContent = "ASSET";
  button.append(placeholder);
  lazyAssetThumbnailChoices.set(button, choice);
  assetThumbnailObserver.observe(button);
}

function startAssetPaletteThumbnails(palette: HTMLElement): void {
  for (const button of palette.querySelectorAll<HTMLButtonElement>(".asset-palette-card")) {
    const placeholder = button.querySelector<HTMLElement>(".asset-palette-placeholder");
    const choice = lazyAssetThumbnailChoices.get(button);
    if (!placeholder || placeholder.classList.contains("is-loading") || !choice) continue;
    assetThumbnailObserver.unobserve(button);
    startAssetThumbnail(button, choice);
  }
}

function startAssetThumbnail(button: HTMLButtonElement, choice: TerrainEditorPaletteChoice): void {
  if (!button.isConnected || button.dataset.previewKey !== choice.id) return;
  const currentWorkspace = workspace;
  const placeholder = button.querySelector<HTMLElement>(".asset-palette-placeholder");
  if (!currentWorkspace || !placeholder) return;
  const assetPreview = currentWorkspace.getAssetPreview(
    choice.resourceUrl,
    choice.kind === "texture"
      ? undefined
      : {
          regionId: choice.sourceRegionId,
          prototypeId: choice.sourceId,
          kind: choice.kind === "object" ? "object" : "surface"
        }
  );
  if (!assetPreview) return;
  button.dataset.previewKind = assetPreview.kind === "model" ? "model" : "image";
  placeholder.classList.add("is-loading");
  placeholder.textContent = assetPreview.kind === "model" ? "MODEL" : "IMAGE";
  const cacheKey = `${choice.kind}:${choice.id}`;
  void resolveAssetThumbnail(cacheKey, choice.label, assetPreview, choice.kind === "texture")
    .then((thumbnail) => {
      if (!button.isConnected || button.dataset.previewKey !== choice.id) return;
      const image = document.createElement("img");
      image.src = thumbnail.url;
      image.alt = `${choice.label} preview`;
      image.dataset.previewKind = thumbnail.kind;
      image.dataset.previewAlpha = choice.kind === "texture" ? "opaque" : "source";
      placeholder.replaceWith(image);
    })
    .catch((error: unknown) => {
      if (!button.isConnected || button.dataset.previewKey !== choice.id) return;
      placeholder.classList.remove("is-loading");
      placeholder.textContent = "PREVIEW";
      console.warn("[terrain-editor] asset preview failed", error);
    });
}

function resolveAssetThumbnail(
  cacheKey: string,
  label: string,
  assetPreview: NonNullable<ReturnType<TerrainEditorWorkspace["getAssetPreview"]>>,
  ignoreImageAlpha: boolean
): Promise<CachedAssetThumbnail> {
  const cached = assetThumbnailCache.get(cacheKey);
  if (cached) return cached;
  const generation = assetThumbnailGeneration;
  const task = (async (): Promise<CachedAssetThumbnail> => {
    let url: string;
    if (assetPreview.kind === "image") {
      const image = new Blob([assetPreview.bytes], { type: assetPreview.mimeType });
      url = URL.createObjectURL(ignoreImageAlpha ? await renderOpaqueTerrainTextureThumbnail(image) : image);
    } else if (assetPreview.kind === "project-texture") {
      url = URL.createObjectURL(
        await preview.renderLayerTextureThumbnail(assetPreview.regionId, assetPreview.layerId, 160)
      );
    } else {
      const image = assetPreview.prototypeBinding
        ? await preview.renderPrototypeThumbnail(
            assetPreview.prototypeBinding.regionId,
            assetPreview.prototypeBinding.prototypeId,
            assetPreview.prototypeBinding.kind,
            160
          )
        : await renderDetachedModelThumbnail(label, assetPreview);
      url = URL.createObjectURL(image);
    }
    if (generation !== assetThumbnailGeneration) {
      URL.revokeObjectURL(url);
      throw new Error("Asset preview belongs to a closed Project");
    }
    assetThumbnailUrls.add(url);
    return Object.freeze({ kind: assetPreview.kind === "model" ? "model" : "image", url });
  })();
  assetThumbnailCache.set(cacheKey, task);
  pendingAssetThumbnails.add(task);
  void task.then(
    () => pendingAssetThumbnails.delete(task),
    () => pendingAssetThumbnails.delete(task)
  );
  return task;
}

async function renderDetachedModelThumbnail(
  label: string,
  preview: Extract<NonNullable<ReturnType<TerrainEditorWorkspace["getAssetPreview"]>>, { kind: "model" }>
): Promise<Blob> {
  const source = new File([preview.bytes], `${safeAssetFileName(label)}.glb`, {
    type: preview.mimeType
  });
  return (await assetThumbnailRenderer.render(source, 160, { meshKeys: preview.meshKeys })).image;
}

function clearAssetThumbnailCache(): void {
  assetThumbnailGeneration++;
  assetThumbnailCache.clear();
  pendingAssetThumbnails.clear();
  for (const url of assetThumbnailUrls) URL.revokeObjectURL(url);
  assetThumbnailUrls.clear();
}

function selectedRegionDocument() {
  if (!workspace || !selectedRegionId) return null;
  return workspace.borrowSnapshot().documents.find((document) => document.descriptor.id === selectedRegionId) ?? null;
}

function catalogEntries(
  currentWorkspace: TerrainEditorWorkspace,
  kind: TerrainEditorAssetKind
): readonly TerrainEditorAssetCatalogEntry[] {
  const catalog = currentWorkspace.assetCatalog;
  return kind === "texture"
    ? catalog.textures
    : kind === "detail"
      ? catalog.details
      : kind === "tree"
        ? catalog.trees
        : catalog.objects;
}

function findCatalogEntry(
  currentWorkspace: TerrainEditorWorkspace,
  kind: TerrainEditorAssetKind,
  key: string
): TerrainEditorAssetCatalogEntry {
  const entry = catalogEntries(currentWorkspace, kind).find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`Terrain editor selected ${kind} asset is no longer in the Project catalog`);
  return entry;
}

function requireCatalogEntryForLocalId(
  currentWorkspace: TerrainEditorWorkspace,
  regionId: string,
  kind: TerrainEditorAssetKind,
  localId: string
): TerrainEditorAssetCatalogEntry {
  const document = currentWorkspace
    .borrowSnapshot()
    .documents.find((candidate) => candidate.descriptor.id === regionId);
  if (!document) throw new Error(`Terrain editor Region ${JSON.stringify(regionId)} no longer exists`);
  const entry = catalogEntries(currentWorkspace, kind).find(
    (candidate) => resolveTerrainEditorAssetId(document, candidate) === localId
  );
  if (!entry) throw new Error(`Terrain editor imported ${kind} asset is missing from the Project catalog`);
  return entry;
}

function selectedAssetKey(kind: TerrainEditorAssetKind): string {
  return kind === "texture"
    ? selectedTextureLayerId
    : kind === "detail"
      ? selectedDetailPrototypeId
      : kind === "tree"
        ? selectedTreePrototypeId
        : selectedObjectPrototypeId;
}

function setSelectedAssetKey(kind: TerrainEditorAssetKind, key: string): void {
  if (kind === "texture") selectedTextureLayerId = key;
  else if (kind === "detail") selectedDetailPrototypeId = key;
  else if (kind === "tree") selectedTreePrototypeId = key;
  else selectedObjectPrototypeId = key;
}

function resolveSelectedAssetIdOrNull(
  kind: TerrainEditorAssetKind,
  document: ReturnType<typeof selectedRegionDocument> = selectedRegionDocument()
): string | null {
  const currentWorkspace = workspace;
  const key = selectedAssetKey(kind);
  if (!currentWorkspace || !document || !key) return null;
  const entry = catalogEntries(currentWorkspace, kind).find((candidate) => candidate.key === key);
  return entry ? resolveTerrainEditorAssetId(document, entry) : null;
}

function resolveSelectedAssetId(
  kind: TerrainEditorAssetKind,
  document: ReturnType<typeof selectedRegionDocument> = selectedRegionDocument()
): string {
  const localId = resolveSelectedAssetIdOrNull(kind, document);
  if (!localId) throw new Error(`Selected ${toolLabel(kind)} asset is not attached to this Region`);
  return localId;
}

function hasSelectedCatalogAsset(kind: TerrainEditorAssetKind): boolean {
  const currentWorkspace = workspace;
  const key = selectedAssetKey(kind);
  return Boolean(currentWorkspace && key && catalogEntries(currentWorkspace, kind).some((entry) => entry.key === key));
}

function selectedRegionMetadata(): TerrainEditorRegionMetadata | null {
  return workspace?.regionMetadata.find((metadata) => metadata.id === selectedRegionId) ?? null;
}

function selectDefaultRegionId(regions: readonly TerrainEditorRegionMetadata[]): string | null {
  if (regions.length === 0) return null;
  const minimumX = Math.min(...regions.map((region) => region.worldPosition[0]));
  const minimumZ = Math.min(...regions.map((region) => region.worldPosition[2]));
  const maximumX = Math.max(...regions.map((region) => region.worldPosition[0] + region.worldSize[0]));
  const maximumZ = Math.max(...regions.map((region) => region.worldPosition[2] + region.worldSize[2]));
  const projectCenterX = (minimumX + maximumX) * 0.5;
  const projectCenterZ = (minimumZ + maximumZ) * 0.5;
  return [...regions].sort((left, right) => {
    const leftDistance = Math.hypot(
      left.worldPosition[0] + left.worldSize[0] * 0.5 - projectCenterX,
      left.worldPosition[2] + left.worldSize[2] * 0.5 - projectCenterZ
    );
    const rightDistance = Math.hypot(
      right.worldPosition[0] + right.worldSize[0] * 0.5 - projectCenterX,
      right.worldPosition[2] + right.worldSize[2] * 0.5 - projectCenterZ
    );
    return leftDistance - rightDistance || left.id.localeCompare(right.id);
  })[0].id;
}

function resolveEditorPixelRatio(): number {
  const requested = Number(new URLSearchParams(location.search).get("dpr"));
  if (Number.isFinite(requested) && requested > 0) return Math.min(requested, 2);
  return 1;
}

function updateControls(): void {
  const currentWorkspace = workspace;
  const hasWorkspace = currentWorkspace !== null;
  const pointerStrokeActive = activePointerId !== null;
  const unavailable = !hasWorkspace || busy || pointerStrokeActive;
  const paintingUnavailable = unavailable || !preview.paintingEnabled;
  importProject.disabled = busy || pointerStrokeActive;
  previewPaintToggle.disabled =
    previewStatus !== "ready" || busy || pointerStrokeActive || navigationPointerId !== null;
  exportProject.disabled = !hasWorkspace || busy || pointerStrokeActive;
  undoButton.disabled = !currentWorkspace?.canUndo || busy || pointerStrokeActive;
  redoButton.disabled = !currentWorkspace?.canRedo || busy || pointerStrokeActive;
  for (const button of Object.values(modeButtons)) button.disabled = unavailable;
  raiseButton.disabled = paintingUnavailable;
  lowerButton.disabled = paintingUnavailable;
  radiusInput.disabled = paintingUnavailable;
  heightStrengthInput.disabled = paintingUnavailable;
  textureAssetUpload.disabled = unavailable;
  const noTexture = paintingUnavailable || !hasSelectedCatalogAsset("texture");
  setPaletteDisabled(textureLayerPalette, unavailable);
  texturePaint.disabled = noTexture;
  textureErase.disabled = noTexture;
  textureStrengthInput.disabled = noTexture;
  const noDetail = paintingUnavailable || !hasSelectedCatalogAsset("detail");
  setPaletteDisabled(detailPrototypePalette, unavailable);
  detailPaint.disabled = noDetail;
  detailErase.disabled = noDetail;
  detailDensityInput.disabled = noDetail;
  detailAssetUpload.disabled = unavailable;
  const noTree = paintingUnavailable || !hasSelectedCatalogAsset("tree");
  setPaletteDisabled(treePrototypePalette, unavailable);
  treePaint.disabled = noTree;
  treeErase.disabled = noTree;
  treeDensityInput.disabled = noTree;
  treeMinimumHeightInput.disabled = noTree;
  treeMaximumHeightInput.disabled = noTree;
  treeAssetUpload.disabled = unavailable;
  const noObject = paintingUnavailable || !hasSelectedCatalogAsset("object");
  setPaletteDisabled(objectPrototypePalette, unavailable);
  objectPaint.disabled = noObject;
  objectErase.disabled = noObject;
  objectDensityInput.disabled = noObject;
  objectMinimumScaleInput.disabled = noObject;
  objectMaximumScaleInput.disabled = noObject;
  objectAssetUpload.disabled = unavailable;
  textureRefreshPreviews.disabled = unavailable;
  treeRefreshPreviews.disabled = unavailable;
  objectRefreshPreviews.disabled = unavailable;
  detailViewList.disabled = unavailable;
  detailViewGrid.disabled = unavailable;
  const dirtyCount = currentWorkspace?.dirtyRegionIds.length ?? 0;
  const projectChanged = currentWorkspace?.projectChanged ?? false;
  dirtySummary.dataset.state = dirtyCount > 0 || projectChanged ? "dirty" : "clean";
  dirtySummary.textContent = dirtyCount > 0 ? `${dirtyCount} dirty` : projectChanged ? "Project changed" : "Clean";
  for (const input of [sceneDirectLightInput, sceneEnvironmentInput, sceneFogInput, sceneWindInput]) {
    input.disabled = unavailable || !currentWorkspace?.sceneSettings.supported;
  }
  sceneRegionBoundariesInput.disabled = unavailable;
  previewCameraModeInput.disabled = unavailable;
  previewMoveSpeedInput.disabled = unavailable;
  previewEyeHeightInput.disabled = unavailable;
  if (window.terrainEditorError) {
    projectStatus.dataset.state = "error";
    projectStatus.textContent = "Load failed";
  } else {
    projectStatus.dataset.state = dirtyCount > 0 || projectChanged ? "dirty" : hasWorkspace ? "ready" : "idle";
    projectStatus.textContent =
      dirtyCount > 0 || projectChanged ? "Unsaved changes" : hasWorkspace ? "Ready" : "Not loaded";
  }
}

function exposeWindowApi(): void {
  window.terrainEditor = {
    ready: true,
    getDiagnostics: () => getDiagnostics(),
    surfaceToCanvas: (worldX, worldZ) => surfaceToCanvas(worldX, worldZ),
    artifactDigest: () => currentArtifactDigest(),
    capturePreviewPixels: () => preview.captureStablePixels(),
    reopenExportedPreview: () => reopenExportedPreview()
  };
}

function getDiagnostics(): TerrainEditorDiagnostics {
  const currentWorkspace = workspace;
  const snapshot = currentWorkspace?.borrowSnapshot();
  const cameraTransform = preview.camera?.entity.transform;
  const previewDiagnostics = previewStatus === "ready" ? preview.getDiagnostics() : null;
  const selectedDocument = selectedRegionDocument();
  const selectedTreeLocalId = resolveSelectedAssetIdOrNull("tree", selectedDocument);
  const selectedDetailLocalId = resolveSelectedAssetIdOrNull("detail", selectedDocument);
  const selectedTreeInstances =
    selectedDocument?.manifest.treeInstances.filter(
      (instance) => selectedTreeLocalId !== null && instance.prototypeId === selectedTreeLocalId
    ) ?? [];
  const selectedTreeScales = selectedTreeInstances.flatMap((instance) => instance.scale);
  const selectedDetailSourceCount =
    selectedDocument?.manifest.detailPrototypes.find((prototype) => prototype.id === selectedDetailLocalId)
      ?.maximumSourceCount ?? 0;
  return {
    pixelRatio: previewDiagnostics?.pixelRatio ?? 1,
    drawingBuffer: [canvas.width, canvas.height],
    regionCount: currentWorkspace?.regionIds.length ?? 0,
    selectedRegionId,
    dirtyRegionIds: [...(currentWorkspace?.dirtyRegionIds ?? [])],
    canUndo: currentWorkspace?.canUndo ?? false,
    canRedo: currentWorkspace?.canRedo ?? false,
    hover: hover ? { ...hover } : null,
    lastCommand: lastCommand ? { ...lastCommand } : null,
    revision: snapshot?.revision ?? 0,
    previewStatus,
    loadingPercent,
    loadingHistory: [...loadingHistory],
    activeRegions: previewDiagnostics?.activeRegions ?? 0,
    objectInstances: previewDiagnostics?.objectInstances ?? 0,
    toolMode,
    detailPrototypeCount: currentWorkspace?.assetCatalog.details.length ?? 0,
    treePrototypeCount: currentWorkspace?.assetCatalog.trees.length ?? 0,
    objectPrototypeCount: currentWorkspace?.assetCatalog.objects.length ?? 0,
    textureLayerCount: currentWorkspace?.assetCatalog.textures.length ?? 0,
    selectedDetailSourceCount,
    selectedTreeInstances: {
      count: selectedTreeInstances.length,
      minimumScale: selectedTreeScales.length > 0 ? Math.min(...selectedTreeScales) : null,
      maximumScale: selectedTreeScales.length > 0 ? Math.max(...selectedTreeScales) : null,
      rotatedCount: selectedTreeInstances.filter((instance) => Math.abs(instance.rotationYRadians) > 1e-6).length
    },
    assetThumbnailCount: assetThumbnailUrls.size,
    assetThumbnailPending: pendingAssetThumbnails.size,
    cameraPosition: cameraTransform
      ? [cameraTransform.worldPosition.x, cameraTransform.worldPosition.y, cameraTransform.worldPosition.z]
      : null,
    cameraForward: cameraTransform
      ? [cameraTransform.worldForward.x, cameraTransform.worldForward.y, cameraTransform.worldForward.z]
      : null,
    cameraMode: preview.cameraMode,
    paintingEnabled: preview.paintingEnabled,
    regionBoundariesVisible: preview.regionBoundariesVisible,
    heightStroke: snapshotHeightStrokeDiagnostics(),
    surfaceStroke: snapshotSurfaceStrokeDiagnostics()
  };
}

function snapshotHeightStrokeDiagnostics(): TerrainEditorHeightStrokeDiagnostics {
  const metrics = activeHeightStrokeMetrics ?? lastHeightStrokeMetrics;
  return {
    active: activeHeightStrokeMetrics !== null,
    liveUpdateCount: metrics?.liveUpdateCount ?? 0,
    pointerDownToFirstVisibleMs: metrics?.pointerDownToFirstVisibleMs ?? null,
    stampIntervalsMs: [...(metrics?.stampIntervalsMs ?? [])],
    maximumLiveUpdateTaskMs: metrics?.maximumLiveUpdateTaskMs ?? 0,
    pointerUpToCommitMs: metrics?.pointerUpToCommitMs ?? null
  };
}

function snapshotSurfaceStrokeDiagnostics(): TerrainEditorSurfaceStrokeDiagnostics {
  const metrics = activeSurfaceStrokeMetrics ?? lastSurfaceStrokeMetrics;
  return {
    active: activeSurfaceStrokeMetrics !== null && activePointerId !== null,
    mode: metrics?.mode ?? null,
    liveUpdateCount: metrics?.liveUpdateCount ?? 0
  };
}

function surfaceToCanvas(worldX: number, worldZ: number): TerrainEditorSurfacePoint | null {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return null;
  const currentWorkspace = workspace;
  const camera = preview.camera;
  if (!currentWorkspace || !camera || previewStatus !== "ready") return null;
  const documents = currentWorkspace.borrowSnapshot().documents;
  const orderedDocuments = [...documents].sort((left, right) => {
    if (left.descriptor.id === selectedRegionId) return -1;
    if (right.descriptor.id === selectedRegionId) return 1;
    return left.descriptor.id < right.descriptor.id ? -1 : left.descriptor.id > right.descriptor.id ? 1 : 0;
  });
  for (const document of orderedDocuments) {
    const height = sampleTerrainDocumentHeight(document, worldX, worldZ);
    if (height === null) continue;
    const screen = camera.worldToScreenPoint(new Vector3(worldX, height, worldZ), projectedPoint);
    if (screen.z <= 0) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (screen.x / canvas.width) * bounds.width,
      y: (screen.y / canvas.height) * bounds.height,
      regionId: document.descriptor.id
    };
  }
  return null;
}

async function currentArtifactDigest(): Promise<TerrainEditorArtifactDigest> {
  const currentWorkspace = requireWorkspace();
  const revision = currentWorkspace.borrowSnapshot().revision;
  const digest = await digestArtifact(await currentWorkspace.exportArtifact());
  if (workspace !== currentWorkspace || currentWorkspace.borrowSnapshot().revision !== revision) {
    return currentArtifactDigest();
  }
  return digest;
}

async function reopenExportedPreview(): Promise<
  TerrainEditorPreviewDiagnostics & { digest: TerrainEditorArtifactDigest }
> {
  const currentWorkspace = requireWorkspace();
  if (busy) throw new Error("Terrain editor is already processing another operation");
  const revision = currentWorkspace.borrowSnapshot().revision;
  setLoadingState("Reopening exported Project through the standard loader…");
  try {
    const artifact = await currentWorkspace.exportArtifact();
    const digest = await digestArtifact(artifact);
    if (workspace !== currentWorkspace || currentWorkspace.borrowSnapshot().revision !== revision) {
      throw new Error("Terrain Project changed while its export was being reopened");
    }
    const diagnostics = await preview.open(artifact, updateLoadingProgress);
    previewStatus = "ready";
    setCapabilityState("ready", "Exported Project reopened through the standard loader.");
    applyPreviewControlState();
    frameSelectedRegion();
    hidePreviewOverlay();
    setReadyState("Exported Project reopened successfully.");
    return { ...diagnostics, digest };
  } catch (error) {
    previewStatus = "error";
    showPreviewError(error);
    throw error;
  } finally {
    busy = false;
    updateControls();
  }
}

function digestArtifact(artifact: TerrainProjectArtifactEntries): Promise<TerrainEditorArtifactDigest> {
  const cached = artifactDigestCache.get(artifact);
  if (cached) return cached;
  const digest = computeArtifactDigest(artifact);
  artifactDigestCache.set(artifact, digest);
  void digest.catch(() => {
    if (artifactDigestCache.get(artifact) === digest) artifactDigestCache.delete(artifact);
  });
  return digest;
}

async function computeArtifactDigest(artifact: TerrainProjectArtifactEntries): Promise<TerrainEditorArtifactDigest> {
  const projectBytes = requireArtifactEntry(artifact, "project.json");
  const project = JSON.parse(new TextDecoder().decode(projectBytes)) as TerrainProjectFile;
  const worldFile = project.files.find((file) => file.virtualPath === TERRAIN_WORLD_INDEX_PATH);
  if (!worldFile) throw new Error(`Project does not declare ${TERRAIN_WORLD_INDEX_PATH}`);
  const worldBytes = requireArtifactEntry(artifact, worldFile.path);
  const world = JSON.parse(new TextDecoder().decode(worldBytes)) as { contentHash?: unknown };
  if (typeof world.contentHash !== "string") throw new Error("Terrain world export has no contentHash");
  return {
    fileCount: artifact.size,
    projectSha256: await sha256TerrainBytes(projectBytes),
    worldContentHash: world.contentHash
  };
}

function summarizeCommand(command: TerrainEditorCommand): TerrainEditorCommandSummary {
  let sampleCount = 0;
  switch (command.kind) {
    case "height":
      sampleCount = command.regions.reduce((total, region) => total + region.changes.length, 0);
      break;
    case "texture":
      sampleCount = command.regions.reduce(
        (total, region) => total + region.maps.reduce((mapTotal, map) => mapTotal + map.changes.length, 0),
        0
      );
      break;
    case "detail":
      sampleCount = command.regions.reduce((total, region) => total + region.changes.length, 0);
      break;
    case "tree":
      sampleCount = command.regions.reduce(
        (total, region) => total + Math.max(region.before.length, region.after.length),
        0
      );
      break;
    case "object":
      sampleCount = command.regions.reduce(
        (total, region) => total + Math.max(region.before.length, region.after.length),
        0
      );
      break;
  }
  return {
    regionCount: command.regions.length,
    sampleCount
  };
}

function setLoadingState(message: string, percent = 0): void {
  busy = true;
  previewStatus = "loading";
  loadingPercent = 0;
  loadingHistory = [0];
  previewOverlay.hidden = false;
  previewOverlay.dataset.state = "loading";
  const strong = previewOverlay.querySelector("strong");
  const detail = previewOverlay.querySelector(".overlay-card span:last-child");
  previewProgress.hidden = false;
  previewProgressOutput.hidden = false;
  if (strong) strong.replaceChildren(document.createTextNode("Loading preview · "), previewProgressOutput);
  if (detail) detail.textContent = message;
  setLoadingProgress(percent);
  setCapabilityState("idle", message);
  setLiveStatus(message);
  updateControls();
}

function updateLoadingProgress(progress: TerrainEditorPreviewLoadProgress): void {
  setLoadingProgress(progress.percent);
  const phase =
    progress.phase === "project" ? "Project assets" : progress.phase === "terrain" ? "Terrain runtimes" : "Scene";
  const detail = previewOverlay.querySelector(".overlay-card span:last-child");
  const message = `${phase} · ${progress.percent}%`;
  if (detail) detail.textContent = message;
  setCapabilityState("idle", message);
  setLiveStatus(message);
}

function setLoadingProgress(percent: number): void {
  const nextPercent = Math.max(loadingPercent, Math.min(100, Math.max(0, Math.round(percent))));
  if (nextPercent !== loadingPercent || loadingHistory.length === 0) loadingHistory.push(nextPercent);
  loadingPercent = nextPercent;
  previewProgress.value = loadingPercent;
  previewProgress.textContent = `${loadingPercent}%`;
  previewProgressOutput.value = `${loadingPercent}%`;
  previewOverlay.dataset.progress = String(loadingPercent);
}

function setReadyState(message: string): void {
  busy = false;
  setLoadingProgress(100);
  window.terrainEditorError = undefined;
  hidePreviewOverlay();
  updateControls();
  setLiveStatus(message);
}

function finishUnavailablePreview(): void {
  busy = false;
  updateControls();
}

function showPreviewError(error: unknown): void {
  console.error("[terrain-editor] preview failed", error);
  const message = errorMessage(error);
  previewOverlay.hidden = false;
  previewOverlay.dataset.state = "error";
  const strong = previewOverlay.querySelector("strong");
  const detail = previewOverlay.querySelector(".overlay-card span:last-child");
  previewProgress.hidden = false;
  previewProgressOutput.hidden = false;
  if (strong) strong.replaceChildren(document.createTextNode("Load stopped · "), previewProgressOutput);
  if (detail) detail.textContent = message;
  setCapabilityState("error", message);
  setLiveStatus("Canonical Project remains available for editing and export.");
}

function hidePreviewOverlay(): void {
  previewOverlay.hidden = true;
  previewOverlay.dataset.state = "ready";
}

function setCapabilityState(state: "idle" | "ready" | "error", message: string): void {
  capabilityStatus.dataset.state = state;
  const text = capabilityStatus.querySelector("span:last-child");
  if (text) text.textContent = message;
}

function reportFatalError(error: unknown): void {
  const message = errorMessage(error);
  window.terrainEditorError = message;
  busy = false;
  previewStatus = "error";
  projectStatus.dataset.state = "error";
  projectStatus.textContent = "Load failed";
  showPreviewError(error);
  updateControls();
}

function reportRecoverableError(error: unknown, prefix: string): void {
  const message = `${prefix}: ${errorMessage(error)}`;
  setCapabilityState("error", message);
  setLiveStatus(message);
}

function setLiveStatus(message: string): void {
  liveStatus.textContent = message;
}

function requireWorkspace(): TerrainEditorWorkspace {
  if (!workspace) throw new Error("Terrain editor has no open Project workspace");
  return workspace;
}

function numericInputValue(input: HTMLInputElement): number {
  return Number(input.value);
}

function setPaletteDisabled(palette: HTMLElement, disabled: boolean): void {
  for (const button of palette.querySelectorAll<HTMLButtonElement>("button")) button.disabled = disabled;
}

function toolLabel(mode: TerrainEditorToolMode): string {
  return mode === "detail" ? "Detail" : mode[0].toUpperCase() + mode.slice(1);
}

function assetDisplayName(fallback: string, resourceUrl: string): string {
  if (!/^(?:Detail|Vegetation) prototype\b/i.test(fallback) || resourceUrl.length === 0) return fallback;
  const basename =
    resourceUrl
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "") ?? fallback;
  return basename
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function safeAssetFileName(label: string): string {
  const safe = label
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return safe || "asset";
}

function regionText(className: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function detailRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  row.append(term, detail);
  return row;
}

function formatVector(vector: readonly [number, number, number]): string {
  return vector.map((value) => Number(value.toFixed(2))).join(", ");
}

function addVectors(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function requireArtifactEntry(artifact: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array {
  const bytes = artifact.get(path);
  if (!bytes) throw new Error(`Project artifact is missing ${path}`);
  return bytes;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireElement<T extends Element>(id: string, constructor: { new (): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Terrain editor requires #${id}`);
  return element;
}
