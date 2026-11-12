import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { SEED_WORLD_EDITOR_PATH } from "../SeedWorldProjectFormats.ts";
import { PLANNING_PROJECT_PATH } from "../src/planning/spatial/runtime/PlanningProjectStorage.ts";
import { planningSourceDocument, planningVegetationReferences } from "../src/planning/spatial/runtime/PlanningProjectSource.ts";
import { RuntimeAssetChanges } from "@galacean/engine-runtime-editor/project/runtime-asset-changes";
import type { RuntimeSceneInspection } from "@galacean/engine-runtime-editor/runtime-inspection/runtime-scene-inspection";
import { viewerRelativePosition } from "./ViewerRelation.ts";
import type { SeedWorldPlanningService } from "./SeedWorldPlanningService.ts";
import { planningPickAssets } from "@galacean/engine-world-planning/spatial/runtime/PlanningWorldPicking";
import type { SeedWorldParameterAuthoring, SeedWorldParameterReceipts } from "./tools/parameter-tools.ts";
import type { SeedWorldViewSnapshots } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot";
import type { SeedWorldAnimalService } from "./ports/SeedWorldAnimalService.ts";
import { treeVariationKey } from "@galacean/engine-vegetation/world/SeedWorldTreeShapeControls";
import { SEED_WORLD_FRONT_RELATION_DISTANCE_METRES } from "./SeedWorldSpatialSemantics.ts";
import type {
  SeedWorldAtmosphereUpdateRequest,
  SeedWorldAssetMutationResult,
  SeedWorldAuthoringResource,
  SeedWorldAuthoringResourceOf,
  SeedWorldAuthoringResult,
  SeedWorldBounds,
  SeedWorldEnginePort,
  SeedWorldEnvironmentUpdateInput,
  SeedWorldGenericTerrainFeatureInput,
  SeedWorldKernelResolvedSpatialTarget,
  SeedWorldKernelSpatialAnchor,
  SeedWorldKernelSpatialTarget,
  SeedWorldLiveState,
  SeedWorldMutationControl,
  SeedWorldMountCommandInput,
  SeedWorldMountCommandResult,
  SeedWorldObject,
  SeedWorldObjectKind,
  SeedWorldRemovableObjectKind,
  SeedWorldPointOrderField,
  SeedWorldPlantKind,
  SeedWorldQueryInput,
  SeedWorldQueriedAsset,
  SeedWorldRef,
  SeedWorldAssetDomain,
  SeedWorldResourceMutation,
  SeedWorldWaterMutationControl,
  SeedWorldSelectionItem,
  SeedWorldSelectionSummary,
  SeedWorldSelectionResult,
  SeedWorldSelector,
  SeedWorldSelectorAnchor,
  SeedWorldTerrainFeatureCreateInput,
  SeedWorldTerrainFeatureInput,
  SeedWorldTerrainFeaturePatch,
  SeedWorldTerrainMutationControl,
  SeedWorldTimeUpdateInput,
  SeedWorldVegetationCreateInput,
  SeedWorldVegetationCreateResult,
  SeedWorldVegetationFeaturePatch,
  SeedWorldVegetationKind,
  SeedWorldVegetationUpdateResult,
  SeedWorldVegetationBrushInput,
} from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import { SEED_WORLD_REMOVABLE_OBJECT_KINDS } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import { SeedWorldAssetManager, type SeedWorldAssetCandidate } from "@galacean/engine-world-planning/agent-adapter/SeedWorldAssetManager";
import { resolveSeedWorldHillAtom } from "@galacean/engine-world-planning/world/SeedWorldHillAtom";
import { getSeedWorldAssetPlacementProfile } from "@galacean/engine-world-planning/world/SeedWorldAssetPlacementProfile";
import { resolveSeedWorldTerrainTransitionDurationSeconds } from "@galacean/engine-terrain/world/SeedWorldTerrainTransition";
import { AgentToolExecutionError } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import type { AgentEditTransaction } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import type { SeedWorldEditorSettings } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import { createSeedWorldTools } from "./SeedWorldToolCatalog.ts";
import { createSeedWorldEngineDraft } from "./SeedWorldEngineDraft.ts";

type SelectionRecord = Readonly<{
  worldRevision: number;
  items: readonly Readonly<SeedWorldSelectionItem>[];
}>;

type EditorMemory = {
  semanticSerial: number;
  selectionSerial: number;
  selections: [string, SelectionRecord][];
  tags: [string, string[]][];
  namedSelections: [string, string][];
  lastCreatedRefs: readonly SeedWorldRef[];
  lastSelectedRefs: readonly SeedWorldRef[];
};
/** Only explicit authoring belongs in World/Editor.json. Query handles are session state. */
type AuthoringMemory = {
  semanticSerial: number;
  tags: EditorMemory["tags"];
  namedSelections: [string, { id: string; selection: SelectionRecord }][];
};

type MutationReceipt = Readonly<{
  transactionId?: string;
  action?: "create" | "update" | "delete" | "batch" | "undo";
  resourceType?: string;
  resourceId?: string;
  resource?: SeedWorldAuthoringResource;
  results?: readonly Readonly<{
    action: "create" | "update" | "delete";
    resourceType: string;
    resourceId: string;
    resource?: SeedWorldAuthoringResource;
    realizedPlantCount?: number;
  }>[];
  authoring?: Readonly<{
    activeRevision: number;
    acceptedDraftRevision: number;
    authoringStateHash: string;
  }>;
}>;

type Candidate = SeedWorldAssetCandidate;
const ALL_OBJECT_KINDS = SEED_WORLD_REMOVABLE_OBJECT_KINDS;
const MAX_AUTHORING_RESULT_REFS = 64;
/**
 * Agent values have a 64 KiB hard boundary. Keep query payloads below that
 * boundary so pagination, rather than serialization failure, is the only
 * mechanism that splits a result set. The remaining headroom belongs to the
 * Tool result envelope and future protocol fields.
 */
const MAX_WORLD_QUERY_RESULT_BYTES = 48 * 1024;

/** The only Agent-facing application boundary. Runtime Resource shapes never cross this class. */
import { createPlanningResourcePort, type PlanningResourcePortOptions } from "./SeedWorldPlanningResources.ts";
import { planningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { bridgeGround } from "@galacean/engine-world-planning/spatial/hydrology/RiverCrossings";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
export class SeedWorldAgentApplication {
  /** Host-owned view evidence; shared read-only by editor drafts, never persisted. */
  viewSnapshots?: SeedWorldViewSnapshots;
  requireViewSnapshots(): SeedWorldViewSnapshots {
    if (!this.viewSnapshots) throw new Error("View snapshots are unavailable");
    return this.viewSnapshots;
  }
  runtimeInspection?: RuntimeSceneInspection;
  requireRuntimeInspection(): RuntimeSceneInspection {
    if (!this.runtimeInspection) throw new Error("Runtime inspection is unavailable");
    return this.runtimeInspection;
  }

  private _semanticFeatureSerial = 0;
  private _selectionSerial = 0;
  private _selectionNamespace = crypto.randomUUID();
  private _issueSelectionId = () => `selection-${this._selectionNamespace}-${++this._selectionSerial}`;
  private readonly _selections = new Map<string, SelectionRecord>();
  private readonly _tagsByRef = new Map<string, ReadonlySet<string>>();
  private readonly _namedSelections = new Map<string, string>();
  private _lastCreatedRefs: readonly SeedWorldRef[] = Object.freeze([]);
  private _lastSelectedRefs: readonly SeedWorldRef[] = Object.freeze([]);
  private _lastTransactionId: string | undefined;
  private _taskViewer: (Readonly<SeedWorldLiveState["camera"]> & { readonly capturedAt: string; readonly inputId?: string }) | undefined;
  private _readPublishedViewer = (): Readonly<SeedWorldLiveState["camera"]> => this._requireState().camera;
  private readonly _assets: SeedWorldAssetManager;
  private _editorSettings: SeedWorldEditorSettings = {};
  private _editorRevision = 0;
  private _editorProjectionDirty = false;
  private _planningProjectionDirty = false;


  constructor(private readonly _engine: SeedWorldEnginePort,
    private readonly planning?: SeedWorldPlanningService,
    private readonly _additionalAssets: () => readonly SeedWorldAssetCandidate[] = () => [],
    readonly parameterAuthoring?: SeedWorldParameterAuthoring, private readonly planningResources?: PlanningResourcePortOptions,
    readonly animals?: SeedWorldAnimalService, readonly parameterReceipts: SeedWorldParameterReceipts = {}) {
    this._assets = new SeedWorldAssetManager(_engine, this._additionalAssets);
  }

  /** Serializable authoring targets; live animation and physics do not belong to this document. */
  getEditorDocument() {
    return structuredClone({ format: "seed-world-editor", version: 2, revision: this._editorRevision,
      settings: this._editorSettings, memory: authoringMemory(this._captureEditorMemory()) });
  }

  /** Startup restoration; saved authoring data is already committed in the project. */
  async restoreEditorDocument(document: Omit<ReturnType<SeedWorldAgentApplication["getEditorDocument"]>, "memory"> & { memory: AuthoringMemory }, signal: AbortSignal, options: { restoreCamera?: boolean } = {}): Promise<void> {
    signal.throwIfAborted();
    if (document?.format !== "seed-world-editor" || document.version !== 2
      || !Number.isSafeInteger(document.revision) || document.revision < 0
      || !document.settings
      || !document.memory || !Number.isSafeInteger(document.memory.semanticSerial) || document.memory.semanticSerial < 0
      || ![document.memory.tags, document.memory.namedSelections].every(Array.isArray)) {
      throw new Error("Invalid world editor document");
    }
    const edit = this._engine.beginEdit?.("restore-project", this._editorSettings);
    if (!edit) throw new Error("Engine does not support project restoration");
    let published = false;
    try {
      const memory = restoreAuthoringMemory(document.memory);
      const restored = new SeedWorldAgentApplication(edit.port);
      restored._restoreEditorMemory(memory);
      const validatedMemory = restored._captureEditorMemory();
      const settings = structuredClone(document.settings);
      // The page may own an explicit startup view while restoring the rest of the editor.
      if (options.restoreCamera === false) delete settings.camera;
      await edit.restoreSettings(settings, signal);
      await edit.prepare(signal);
      signal.throwIfAborted();
      edit.seal();
      published = true;
      this._restoreEditorMemory(validatedMemory);
      this._editorSettings = settings;
      this._editorRevision = document.revision;
      await edit.activate(signal);
    } finally {
      if (!published) { edit.discard(); }
    }
  }

  private _preparedAssetEdit?: {
    editor: ReturnType<SeedWorldAgentApplication["getEditorDocument"]>;
    planning: import("@galacean/engine-world-planning/spatial/PlanningDocument").PlanningDocument | undefined;
    edit: ReturnType<SeedWorldAgentApplication["beginEdit"]>;
  };

  stageProjectEdit(edit: ReturnType<SeedWorldAgentApplication["beginEdit"]>): () => void {
    if (this._preparedAssetEdit) throw new Error("A world asset projection is already staged");
    const prepared = {editor: edit.getPreparedDocument(), planning: edit.getPreparedPlanningDocument(), edit};
    this._preparedAssetEdit = prepared;
    return () => {
      if (this._preparedAssetEdit === prepared) this._preparedAssetEdit = undefined;
      edit.discard();
    };
  }

  /** World configuration is an asset consumer, regardless of which UI authored it. */
  connectProject(project: RuntimeProjectSession): () => void {
    const defaults = this._engine.readEditorDefaults?.() ?? {};
    const initialEditor = this.getEditorDocument();
    const initialPlanning = this.planning?.document();
    const comparable = (value: unknown) => JSON.stringify(value, (key, item) => key === "revision" ? undefined
      : item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
    const resourceChanges = new RuntimeAssetChanges(project.projectPackage);
    const unobserve = project.observeAssetReads((file, content) => resourceChanges.recordRead(file, content));
    let assetReferences = planningVegetationReferences(project.projectPackage);
    let pending: {activate(signal: AbortSignal): Promise<void>; discard(): void} | undefined;
    const effective = (settings: SeedWorldEditorSettings): SeedWorldEditorSettings => ({
      ...defaults, ...settings,
      environment: {...defaults.environment, ...settings.environment,
        weatherChannels: {...defaults.environment?.weatherChannels, ...settings.environment?.weatherChannels},
        atmosphere: {...defaults.environment?.atmosphere, ...settings.environment?.atmosphere},
        transitionDuration: 0, waitForIbl: false}
    });
    const unregister = project.registerRuntimeActivation({
      before: async signal => {
        pending?.discard(); pending = undefined;
        const editorContent = project.projectPackage.contents[SEED_WORLD_EDITOR_PATH];
        const planningContent = project.projectPackage.contents[PLANNING_PROJECT_PATH];
        const editor = typeof editorContent === "string" ? JSON.parse(editorContent) : initialEditor;
        const planning = planningSourceDocument(project.projectPackage)
          ?? (typeof planningContent === "string" ? JSON.parse(planningContent) : initialPlanning);
        const references = planningVegetationReferences(project.projectPackage);
        const affected = resourceChanges.affected(project.projectPackage);
        const resourcesChanged = !!references && (JSON.stringify(references) !== JSON.stringify(assetReferences)
          || Object.values(references).some(path => affected.has(path))) && !!this.planning?.invalidateAssets(references);
        const prepared = this._preparedAssetEdit;
        this._preparedAssetEdit = undefined;
        if (prepared && !resourcesChanged) {
          if (comparable(prepared.editor) === comparable(editor)
            && (!prepared.planning || comparable(prepared.planning) === comparable(planning))) {
            pending = {activate: signal => Promise.resolve(prepared.edit.activate!(signal)), discard: () => prepared.edit.discard()};
            prepared.edit.commit();
            this._editorProjectionDirty = true;
            this._planningProjectionDirty ||= Boolean(prepared.planning);
            return;
          }
          prepared.edit.discard();
        }
        if (prepared && resourcesChanged) prepared.edit.discard();
        const editorChanged = this._editorProjectionDirty || comparable(editor) !== comparable(this.getEditorDocument());
        const planningChanged = planning && (resourcesChanged || this._planningProjectionDirty || comparable(planning) !== comparable(this.planning?.document()));
        if (!editorChanged && !planningChanged) return;
        const engineEdit = editorChanged ? this._engine.beginEdit?.("project-assets", effective(this._editorSettings)) : undefined;
        const planningEdit = planningChanged ? this.planning?.beginEdit() : undefined;
        if (resourcesChanged) planningEdit?.invalidateResources();
        let committed = false;
        pending = {
          activate: async activationSignal => {
            const errors: unknown[] = [];
            try { await planningEdit?.activate(activationSignal); this._planningProjectionDirty = false; } catch (error) { this._planningProjectionDirty = true; errors.push(error); }
            try { await engineEdit?.activate(activationSignal); this._editorProjectionDirty = false; } catch (error) { this._editorProjectionDirty = true; errors.push(error); }
            if (errors.length) throw new AggregateError(errors, errors.map(String).join("\n"));
          },
          discard: () => { if (!committed) { engineEdit?.discard(); void planningEdit?.discard(); } }
        };
        if (editorChanged) {
          if (!engineEdit) throw new Error("World asset consumer cannot apply editor settings");
          if (editor.format !== "seed-world-editor" || editor.version !== 2 || !editor.memory || !editor.settings)
            throw new Error("Invalid world editor document");
          await engineEdit.restoreSettings(effective(editor.settings), signal, this._editorProjectionDirty);
          await engineEdit.prepare(signal);
        }
        if (planningEdit) {
          const result = await planningEdit.session.load(planning, signal);
          if (result.status !== "accepted") throw new Error(result.message ?? "Planning asset was rejected");
          await planningEdit.prepare(signal);
        }
        signal.throwIfAborted();
        planningEdit?.commit(); engineEdit?.seal(); committed = true;
        this._planningProjectionDirty ||= Boolean(planningEdit);
        this._editorProjectionDirty ||= Boolean(engineEdit);
        if (editorChanged) {
          const currentMemory = this._captureEditorMemory(), restored = restoreAuthoringMemory(editor.memory);
          this._restoreEditorMemory({...currentMemory, tags: restored.tags, namedSelections: restored.namedSelections,
            selections: [...new Map([...currentMemory.selections, ...restored.selections])]});
          this._editorSettings = structuredClone(editor.settings);
          this._editorRevision = editor.revision;
        }
      },
      apply: async signal => {
        await pending?.activate(signal);
        resourceChanges.accept(project.projectPackage);
        assetReferences = planningVegetationReferences(project.projectPackage);
      },
      finish: () => { pending?.discard(); pending = undefined; },
      after: async () => {}
    });
    return () => { unregister(); unobserve(); pending?.discard(); };
  }

  beginEdit(executionId: string, signal: AbortSignal): AgentEditTransaction & {
    getPreparedDocument(): ReturnType<SeedWorldAgentApplication["getEditorDocument"]>;
    getPreparedPlanningDocument(): import("@galacean/engine-world-planning/spatial/PlanningDocument").PlanningDocument | undefined;
    getPreparedPlanningResult(): import("@galacean/engine-world-planning/semantic-study/WorldPlanningContract").SemanticResult | undefined;
    beforePlanningDocument?: import("@galacean/engine-world-planning/spatial/PlanningDocument").PlanningDocument;
    runPlanning<T>(operation: (session: import("@galacean/engine-world-planning/spatial/PlanningSession").PlanningSession) => Promise<T>): Promise<T>;
  } {
    signal.throwIfAborted();
    const unavailable = (): never => { throw new Error("NOT_SUPPORTED: This Engine port cannot prepare that editor operation"); };
    const engineEdit = this._engine.beginEdit?.(executionId, this._editorSettings) ?? createSeedWorldEngineDraft(this._engine, {
      environment: unavailable, teleport: unavailable, restoreCamera: unavailable, validateMount: unavailable
    }, executionId);
    const planningEdit = this.planning?.beginEdit();
    let navigation: { plan: IslandPlan; sample: ReturnType<typeof bridgeGround> } | undefined;
    if (planningEdit) engineEdit.setNavigationGround?.((x, z) => {
      const plan = planningEdit.session.result!.plan;
      // A draft can publish several snapshots before commit. Reuse only within
      // one snapshot, so subsequent moves observe edited terrain and bridges.
      if (navigation?.plan !== plan) navigation = { plan, sample: bridgeGround(plan, planningHeightmap(plan).sample) };
      return navigation.sample({ x, z });
    });
    const resourcePort = planningEdit ? createPlanningResourcePort(engineEdit.port, planningEdit.session, executionId, this.planningResources) : engineEdit.port;
    const draft = new SeedWorldAgentApplication(resourcePort, planningEdit?.service,
      planningEdit ? () => planningEdit.session.result ? planningPickAssets(planningEdit.session.result.plan) : [] : this._additionalAssets,
      planningEdit ? this.parameterAuthoring?.forSession?.(planningEdit.session) : undefined, this.planningResources, this.animals, this.parameterReceipts);
    const initialMemory = this._captureEditorMemory();
    const initialState = JSON.stringify({ memory: authoringMemory(initialMemory), settings: this._editorSettings });
    draft._restoreEditorMemory(initialMemory);
    draft._issueSelectionId = this._issueSelectionId;
    draft._taskViewer = this._taskViewer;
    draft._readPublishedViewer = this._readPublishedViewer;
    draft.viewSnapshots = this.viewSnapshots;
    draft.runtimeInspection = this.runtimeInspection;
    draft._lastTransactionId = this._lastTransactionId;
    let phase: "open" | "prepared" | "committed" | "discarded" = "open";
    let preparedChanges = false;
    const hasChanges = () => phase === "open"
      ? Boolean(engineEdit.changes.length || planningEdit?.hasEdits()
        || JSON.stringify({ memory: authoringMemory(draft._captureEditorMemory()), settings: engineEdit.settings }) !== initialState)
      : preparedChanges;
    let publication: { memory: EditorMemory; settings: SeedWorldEditorSettings } | undefined;
    const check = () => { if (phase !== "open") throw new Error("Editor draft no longer accepts changes"); };
    // A draft is one ordered editor state. Reads participate in the same queue
    // so they observe all earlier accepted writes, even when JS uses Promise.all.
    let toolTail: Promise<unknown> = Promise.resolve();
    const tools = createSeedWorldTools(draft).map(tool => ({ ...tool, execute: (input: unknown, context: { signal: AbortSignal }) => {
      const result = toolTail.then(() => {
        check(); context.signal.throwIfAborted();
        return tool.execute(input, context);
      });
      toolTail = result.catch(() => undefined);
      return result;
    } }));
    return {
      tools,
      beforePlanningDocument: planningEdit?.before,
      runPlanning: async operation => {
        await toolTail; check(); signal.throwIfAborted();
        if (!planningEdit) throw new Error("Planning editor is not mounted");
        return operation(planningEdit.session);
      },
      hasChanges,
      completeRead: () => {
        check();
        if (hasChanges()) throw new Error("Cannot accept read observations from a modified draft");
        // Adopt observations only. A UI edit may have changed live authoring
        // while this read was running; never restore the draft's older tags or names.
        const previousIds = new Set(initialMemory.selections.map(([id]) => id));
        const observed = draft._captureEditorMemory().selections.filter(([id]) => !previousIds.has(id));
        for (const [id, selection] of observed) this._rememberSelection(id, selection);
        if (observed.length) this._lastSelectedRefs = draft._lastSelectedRefs;
      },
      prepare: async prepareSignal => {
        check(); prepareSignal.throwIfAborted();
        await engineEdit.prepare(prepareSignal);
        check();
        await planningEdit?.prepare(prepareSignal);
        check(); prepareSignal.throwIfAborted();
        // All data copying is done before changing the live presentation.
        const memory = draft._captureEditorMemory();
        const settings = engineEdit.settings;
        preparedChanges = hasChanges();
        publication = { memory, settings };
        phase = "prepared";
      },
      getPreparedPlanningDocument: () => {
        if (phase !== "prepared") throw new Error("Editor transaction was not prepared");
        return planningEdit?.hasEdits() ? planningEdit.document() : undefined;
      },
      getPreparedPlanningResult: () => {
        if (phase !== "prepared") throw new Error("Editor transaction was not prepared");
        return planningEdit?.session.result;
      },
      getPreparedDocument: () => {
        if (phase !== "prepared" || !publication) throw new Error("Editor transaction was not prepared");
        return structuredClone({
          format: "seed-world-editor", version: 2, revision: this._editorRevision + Number(preparedChanges),
          settings: publication.settings, memory: authoringMemory(publication.memory)
        });
      },
      commit: () => {
        if (phase !== "prepared" || !publication) throw new Error("Editor transaction was not prepared");
        const { memory, settings } = publication;
        planningEdit?.commit();
        engineEdit.seal();
        this._restoreEditorMemory(memory);
        this._editorSettings = settings;
        if (preparedChanges) this._lastTransactionId = executionId;
        if (preparedChanges) this._editorRevision++;
        phase = "committed";
        return { transactionId: executionId, revision: this._editorRevision };
      },
      activate: async activationSignal => {
        const errors: unknown[] = [];
        try { await planningEdit?.activate(activationSignal); this._planningProjectionDirty = false; } catch (error) { this._planningProjectionDirty = true; errors.push(error); }
        try { await engineEdit.activate(activationSignal); this._editorProjectionDirty = false; } catch (error) { this._editorProjectionDirty = true; errors.push(error); }
        if (errors.length) throw new AggregateError(errors,
          `Committed world activation failed: ${errors.map(error => error instanceof Error ? error.message : String(error)).join("; ")}`);
      },
      discard: () => {
        if (phase === "committed" || phase === "discarded") return;
        phase = "discarded";
        engineEdit.discard();
        void planningEdit?.discard();
      }
    };
  }

  private _captureEditorMemory(): EditorMemory {
    return structuredClone({ semanticSerial: this._semanticFeatureSerial, selectionSerial: this._selectionSerial,
      selections: [...this._selections], tags: [...this._tagsByRef].map(([key, tags]) => [key, [...tags]] as [string, string[]]),
      namedSelections: [...this._namedSelections], lastCreatedRefs: this._lastCreatedRefs, lastSelectedRefs: this._lastSelectedRefs });
  }

  private _restoreEditorMemory(memory: EditorMemory): void {
    // Undo restores contents, not the identity issuer: an old handle must never
    // silently resolve to a different selection or authored feature later.
    this._semanticFeatureSerial = Math.max(this._semanticFeatureSerial, memory.semanticSerial);
    this._selectionSerial = Math.max(this._selectionSerial, memory.selectionSerial);
    this._selections.clear(); for (const [id, selection] of memory.selections) this._selections.set(id, selection);
    this._tagsByRef.clear(); for (const [id, tags] of memory.tags) this._tagsByRef.set(id, new Set(tags));
    this._namedSelections.clear(); for (const [name, id] of memory.namedSelections) this._namedSelections.set(name, id);
    this._lastCreatedRefs = memory.lastCreatedRefs; this._lastSelectedRefs = memory.lastSelectedRefs;
  }

  /** Visual invalidation reads live state, not the task's frozen deictic viewer. */
  getViewState() {
    const state = this._requireState();
    const authoring = this._engine.readAuthoringSnapshot();
    return { state, authoringStateHash: authoring.authoringStateHash,
      activeRevision: authoring.activeRevision, buildings: this._additionalAssets().filter(asset => asset.ref.kind === "building") };
  }
  querySubjectSegments(segments:readonly import("@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort").SeedWorldSurfaceSegment[]) {
    return this._surfaceMeasurements(this._engine.querySubjectSegments?.(segments),segments.length);
  }
  querySubjectCapsules(capsules:readonly import("@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort").SeedWorldSurfaceCapsule[]) {
    return this._surfaceMeasurements(this._engine.querySubjectCapsules?.(capsules),capsules.length);
  }
  private _surfaceMeasurements<T>(measured:{publicationRevision?:number;hits:(T|null)[]}|undefined,count:number) {
    const revision=this._engine.readAuthoringSnapshot().activeRevision;
    const available=!!measured&&measured.publicationRevision===revision&&measured.hits.length===count;
    return {available,geometryState:!measured||measured.publicationRevision===undefined||measured.hits.length!==count
      ?"unavailable" as const:available?"current" as const:"stale" as const,samples:available?measured!.hits:[]};
  }
  /** Freezes deictic viewer expressions for one Agent task while the player remains free to move. */
  getViewerSnapshot(): Readonly<SeedWorldLiveState["camera"]> & { readonly capturedAt: string } {
    return freezeClone({ ...this._readPublishedViewer(), capturedAt: new Date().toISOString() });
  }

  viewerRelationFor(target: readonly number[]) {
    const viewer = this._viewerCamera();
    return viewerRelativePosition(viewer.position, viewer.forward, target, !!this._taskViewer);
  }

  /** Read the published player pose, even while an execute has an uncommitted camera draft. */
  readViewer() {
    const { mode, position, forward } = this.getViewerSnapshot();
    const [x, y, z] = forward;
    const horizontalLength = Math.hypot(x, z);
    const headingDegrees = horizontalLength > 1e-8 ? (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360 : null;
    const pitchDegrees = Math.hypot(x, y, z) > 1e-8 ? Math.atan2(y, horizontalLength) * 180 / Math.PI : null;
    const nearestHorizontalAxis = headingDegrees === null ? null : Math.abs(x) >= Math.abs(z)
      ? x >= 0 ? "+X" as const : "-X" as const
      : z >= 0 ? "+Z" as const : "-Z" as const;
    return { source: "published" as const, mode, position, forward,
      headingDegrees, pitchDegrees, nearestHorizontalAxis };
  }

  captureTaskViewerSnapshot(camera = this.getViewerSnapshot(), inputId?: string): () => void {
    if (this._taskViewer) throw new Error("Seed World Agent task viewer snapshot is already active");
    const snapshot = Object.freeze({
      capturedAt: camera.capturedAt,
      ...(inputId ? { inputId } : {}),
      mode: camera.mode,
      position: Object.freeze([...camera.position] as [number, number, number]),
      forward: Object.freeze([...camera.forward] as [number, number, number])
    });
    this._taskViewer = snapshot;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this._taskViewer === snapshot) this._taskViewer = undefined;
    };
  }

  getWorldContext(): unknown {
    const state = this._requireState();
    const authoring = this._engine.readAuthoringSnapshot();
    const { rootSeed, sizeMetres } = state.world;
    return Object.freeze({
      world: Object.freeze({
        id: `seed-world-${rootSeed}`,
        rootSeed,
        sizeMetres,
        bounds: Object.freeze({
          minimum: Object.freeze(state.world.origin ? [...state.world.origin] : [-sizeMetres * 0.5, -sizeMetres * 0.5]),
          maximum: Object.freeze(state.world.origin ? state.world.origin.map((value) => value + sizeMetres) : [sizeMetres * 0.5, sizeMetres * 0.5])
        })
      }),
      camera: freezeClone(state.camera),
      lighting: freezeClone(state.lighting),
      environment: freezeClone(state.environment),
      authoring: Object.freeze({
        activeRevision: authoring.activeRevision,
        authoringStateHash: authoring.authoringStateHash,
        featureCount: authoring.resources.length,
        lastTransactionId: this._lastTransactionId,
        lastCreatedRefs: this._lastCreatedRefs,
        lastSelectedRefs: this._lastSelectedRefs
      }),
      capabilityManifest: Object.freeze({
        world: "query, inspect, delete, tag, save selections and undo persistent assets",
        time: "read and update time or season",
        spatial: "navigate the viewer; only this domain may mutate viewer pose",
        celestial: "weather, wind, precipitation, cloud, fog and lightning",
        landscape: "terrain, water-system and vegetation authoring"
      })
    });
  }

  /** Bounded current-state context for every model decision. Never includes recent operations. */
  getWorldThumbnail(): unknown {
    const state = this._requireState();
    // Both observations are projections of their existing owners; neither updates the other.
    const viewer = this.getViewerSnapshot();
    const authoring = this._engine.readAuthoringSnapshot();
    const { rootSeed, sizeMetres } = state.world;
    return Object.freeze({
      world: Object.freeze({
        id: `seed-world-${rootSeed}`,
        rootSeed,
        sizeMetres
      }),
      viewer: Object.freeze({
        atSubmission: this._taskViewer ?? null,
        current: viewer
      }),
      time: Object.freeze({
        hours: state.lighting.timeHours,
        phase: state.lighting.phase,
        playing: state.lighting.playing,
        season: state.environment.season
      }),
      weather: Object.freeze({
        precipitation: state.environment.precipitation,
        rainIntensity: state.environment.rainIntensity,
        snowIntensity: state.environment.snowIntensity,
        cloudCoverage: state.environment.cloudCoverage,
        fogIntensity: state.environment.fogIntensity,
        windSpeed: state.environment.windSpeed,
        windIntensity: state.environment.windIntensity,
        windDirectionDegrees: state.environment.windDirectionDegrees,
        lightningFrequency: state.environment.lightningFrequency,
        lightningIntensity: state.environment.lightningIntensity
      }),
      scene: Object.freeze({
        summitCount: state.plan.summitCount,
        riverReachCount: state.plan.riverReachCount,
        roadCount: state.plan.roadCount,
        poiCount: state.plan.poiCount,
        authoredFeatureCount: authoring.resources.length,
        visibleWaterBodyCount: state.water.visible ? state.water.bodyCount : 0,
        residentVegetation: { scope: "currently-resident-instances",
          description: "当前驻留的植被实例数量；不是整个世界的总数，0 不代表项目中不存在该植被。",
          counts: freezeClone(state.population.residentAcceptedCounts) },
        decorations: freezeClone(state.decorations)
      })
    });
  }

  getTime(): unknown {
    const state = this._requireState();
    return Object.freeze({
      timeHours: state.lighting.timeHours,
      phase: state.lighting.phase,
      playing: state.lighting.playing,
      season: state.environment.season,
      seasonTransitionProgress: state.environment.seasonTransitionProgress,
      ibl: Object.freeze({
        phase: state.lighting.iblPhase,
        progress: state.lighting.iblProgress,
        publishedRevision: state.lighting.iblPublishedRevision,
        bakingEnabled: state.lighting.iblBakingEnabled
      })
    });
  }

  getAtmosphere(): unknown {
    const state = this._requireState();
    return Object.freeze({
      phase: state.lighting.phase,
      environment: freezeClone(state.environment),
      ibl: Object.freeze({
        phase: state.lighting.iblPhase,
        progress: state.lighting.iblProgress,
        publishedRevision: state.lighting.iblPublishedRevision,
        bakingEnabled: state.lighting.iblBakingEnabled
      })
    });
  }

  updateTime(input: Readonly<SeedWorldTimeUpdateInput>, signal: AbortSignal): Promise<unknown> | unknown {
    return this._updateEnvironment(input, signal);
  }

  updateAtmosphere(input: Readonly<SeedWorldAtmosphereUpdateRequest>, signal: AbortSignal): Promise<unknown> | unknown {
    return this._updateEnvironment(input, signal);
  }

  selectWorld(selector: Readonly<SeedWorldQueryInput>): SeedWorldSelectionResult {
    const revision = this._currentRevision();
    const candidates = this._selectCandidates(selector, 0);
    const matchedCount = candidates.length;
    const offset = Math.min(selector.offset ?? 0, matchedCount);
    const limit = selector.limit ?? 16;
    const selectionId = this._issueSelectionId();
    const page = transportBoundedSelectionPage({
      candidates,
      offset,
      limit,
      selectionId,
      matchedCount
    });
    const items = page.items;
    const end = offset + items.length;
    const selectedDetails = Object.freeze(
      candidates.slice(offset, end).map((candidate) => publicAssetDetail(candidate))
    );
    this._rememberSelection(selectionId, { worldRevision: revision, items: selectedDetails });
    this._lastSelectedRefs = Object.freeze(items.map(({ ref }) => ref));
    return Object.freeze({
      selectionId,
      matchedCount,
      offset,
      ...(end < matchedCount ? { nextOffset: end } : {}),
      ...(page.limitedByBytes ? { pageLimitedByBytes: true } : {}),
      items,
      resolvedBounds: mergeBounds(items.map(({ bounds }) => bounds).filter(isDefined))
    });
  }

  /** Host visual observations use this without issuing or remembering a selection. */
  get observationRevision(): number { return this._currentRevision(); }

  resolvePickedObject(objectId: string): Readonly<Pick<SeedWorldSelectionItem, "ref" | "type">> | undefined {
    const candidate = this._selectCandidates({ ids: [objectId] }, 0)[0];
    return candidate && Object.freeze({ ref: candidate.ref, type: candidate.ref.kind as SeedWorldSelectionItem["type"] });
  }

  inspectWorld(ref: Readonly<SeedWorldRef>): Readonly<SeedWorldSelectionItem> {
    const item = this._resolveRefItem(ref);
    if (!item) throw new Error(`WorldRef '${ref.id}' no longer exists`);
    if (item.ref.id !== ref.id || item.type !== ref.kind || item.ref.kind !== ref.kind) {
      throw new Error(`WorldRef '${ref.id}' resolved to an inconsistent asset identity`);
    }
    return this._withRuntimeProperties(item);
  }

  private _withRuntimeProperties(item: Readonly<SeedWorldSelectionItem>): Readonly<SeedWorldSelectionItem> {
    const colorRgb = item.ref.domain === "water" ? this._engine.readWaterColor?.(item.ref) : undefined;
    return freezeClone(colorRgb ? { ...item, properties: { ...item.properties, colorRgb } } : item);
  }

  updateWorldTags(refs: readonly Readonly<SeedWorldRef>[], add: readonly string[], remove: readonly string[]): unknown {
    const results = refs.map((ref) => {
      const item = this._resolveRefItem(ref);
      if (!item) throw new Error(`WorldRef '${ref.id}' no longer exists`);
      const key = stableWorldRefKey(ref);
      const tags = new Set(this._tagsByRef.get(key) ?? []);
      for (const tag of add) tags.add(tag);
      for (const tag of remove) tags.delete(tag);
      const frozen = Object.freeze(new Set([...tags].sort()));
      this._tagsByRef.set(key, frozen);
      return Object.freeze({ ref: item.ref, tags: Object.freeze([...frozen]) });
    });
    return Object.freeze({ worldRevision: this._currentRevision(), results: Object.freeze(results) });
  }

  saveSelection(selectionId: string, name: string): unknown {
    const selection = this._requireSelection(selectionId);
    this._namedSelections.set(name, selectionId);
    const refs = Object.freeze(
      selection.items.flatMap(({ ref }) => {
        const current = this._resolveRefItem(ref);
        return current ? [current.ref] : [];
      })
    );
    return Object.freeze({
      name,
      selectionId,
      worldRevision: this._currentRevision(),
      refs
    });
  }

  getSelection(nameOrId: string): SeedWorldSelectionResult {
    const selectionId = this._namedSelections.get(nameOrId) ?? nameOrId;
    const selection = this._requireSelection(selectionId);
    const items = Object.freeze(
      selection.items.flatMap(({ ref }) => {
        const current = this._resolveRefItem(ref);
        return current ? [publicQueriedAsset(current)] : [];
      })
    );
    return Object.freeze({
      selectionId,
      matchedCount: items.length,
      offset: 0,
      items,
      resolvedBounds: mergeBounds(items.map(({ bounds }) => bounds).filter(isDefined))
    });
  }

  checkSpatial(input: {
    positions: readonly { x: number; z: number }[];
    constraints?: import("./tools/spatial-tools.ts").SpatialConstraints;
  }) {
    if (!input.positions.length || input.positions.length > 32) throw new Error("Check 1 to 32 positions at a time");
    const raw = this._engine.queryWorldPoints({ mode: "sample", positions: input.positions, sampleDistance: 1 }) as {
      samples: {
        insideWorld: boolean;
        height?: number;
        slope?: number;
        moisture?: number;
        water?: boolean;
        waterSurfaceElevationMetres?: number;
        riverDistanceMetres?: number;
        roadDistanceMetres?: number;
      }[];
    };
    if (!Array.isArray(raw.samples) || raw.samples.length !== input.positions.length)
      throw new Error("Terrain samples unavailable; no suitability verdict was produced");
    return { items: raw.samples.map((sample, i) => {
      const position = input.positions[i];
      if (typeof sample?.insideWorld !== "boolean")
        throw new Error("Terrain sample unavailable; no suitability verdict was produced");
      if (!sample.insideWorld) return { position, matches: false, failedConstraints: ["outside_world"], surface: null };
      const surface = {
        elevationMetres: sample.water ? sample.waterSurfaceElevationMetres ?? sample.height! : sample.height!,
        slopeDegrees: sample.slope! * 90,
        moisture: sample.moisture!,
        water: sample.water!,
        riverDistanceMetres: sample.riverDistanceMetres!,
        roadDistanceMetres: sample.roadDistanceMetres!
      };
      if (typeof surface.water !== "boolean" || Object.values(surface).some(v => typeof v !== "boolean" && !Number.isFinite(v)))
        throw new Error("Terrain sample incomplete; no suitability verdict was produced");
      const constraints = input.constraints ?? {};
      const tests: Record<keyof NonNullable<typeof input.constraints>, (value: number | boolean) => boolean> = {
        minimumElevationMetres: v => surface.elevationMetres >= Number(v),
        maximumElevationMetres: v => surface.elevationMetres <= Number(v),
        minimumSlopeDegrees: v => surface.slopeDegrees >= Number(v),
        maximumSlopeDegrees: v => surface.slopeDegrees <= Number(v),
        minimumMoisture: v => surface.moisture >= Number(v),
        maximumMoisture: v => surface.moisture <= Number(v),
        water: v => surface.water === v,
        maximumRiverDistanceMetres: v => surface.riverDistanceMetres <= Number(v),
        maximumRoadDistanceMetres: v => surface.roadDistanceMetres <= Number(v)
      };
      const failedConstraints = (Object.keys(constraints) as (keyof typeof constraints)[])
        .filter(key => constraints[key] !== undefined && !tests[key](constraints[key]!));
      // The engine measures inland water, excluding the ocean. Keep the all-water distance explicitly unknown.
      return { position, matches: failedConstraints.length === 0, failedConstraints,
        surface: { ...surface, riverDistanceScope: "inland-water-excluding-ocean" as const, nearestWaterDistanceMetres: null } };
    }) };
  }

  searchSpatial(
    input: Readonly<{
      constraints?: Readonly<{
        minimumElevationMetres?: number;
        maximumElevationMetres?: number;
        minimumSlopeDegrees?: number;
        maximumSlopeDegrees?: number;
        minimumMoisture?: number;
        maximumMoisture?: number;
        water?: boolean;
        maximumRiverDistanceMetres?: number;
        maximumRoadDistanceMetres?: number;
      }>;
      nearestTo?: Readonly<{ x: number; z: number }>;
      sort: "highest" | "lowest" | "flattest" | "steepest" | "wettest" | "driest" | "nearest";
      limit: number;
      spacingMetres: number;
    }>
  ): unknown {
    const constraints = input.constraints ?? {};
    const nearestTo = input.nearestTo ?? (input.sort === "nearest"
      ? { x: this._viewerCamera().position[0], z: this._viewerCamera().position[2] }
      : undefined);
    const order = spatialSearchOrder(input.sort);
    const raw = this._engine.queryWorldPoints({
      mode: "search",
      where: {
        minimumElevation: constraints.minimumElevationMetres,
        maximumElevation: constraints.maximumElevationMetres,
        minimumSlope: constraints.minimumSlopeDegrees === undefined ? undefined : constraints.minimumSlopeDegrees / 90,
        maximumSlope: constraints.maximumSlopeDegrees === undefined ? undefined : constraints.maximumSlopeDegrees / 90,
        minimumMoisture: constraints.minimumMoisture,
        maximumMoisture: constraints.maximumMoisture,
        maximumRiverDistance: constraints.maximumRiverDistanceMetres,
        maximumRoadDistance: constraints.maximumRoadDistanceMetres,
        water: constraints.water
      },
      nearestTo,
      orderBy: [order],
      limit: input.limit,
      spacingMetres: input.spacingMetres
    }) as Readonly<{
      matchedPointCount?: number;
      inspectedPointCount?: number;
      effectiveSpacingMetres?: number;
      points?: readonly Readonly<{
        position: readonly [number, number, number];
        elevation: number;
        slope: number;
        moisture: number;
        water: boolean;
        riverDistanceMetres: number;
        roadDistanceMetres: number;
      }>[];
    }>;
    const revision = this._currentRevision();
    const items = Object.freeze(
      (raw.points ?? []).map((point) =>
        Object.freeze({
          position: Object.freeze({ x: point.position[0], y: point.position[1], z: point.position[2] }),
          computedAtRevision: revision,
          surface: Object.freeze({
            elevationMetres: point.elevation,
            slopeDegrees: point.slope * 90,
            moisture: point.moisture,
            water: point.water,
            riverDistanceMetres: point.riverDistanceMetres,
            riverDistanceScope: "inland-water-excluding-ocean" as const,
            nearestWaterDistanceMetres: null,
            roadDistanceMetres: point.roadDistanceMetres
          })
        })
      )
    );
    return Object.freeze({
      computedAtRevision: revision,
      coverage: "finite-grid",
      requestedCountSatisfied: items.length >= input.limit,
      status: items.length ? "matched" : "no_match",
      effectiveSpacingMetres: raw.effectiveSpacingMetres,
      matchedCount: raw.matchedPointCount ?? raw.inspectedPointCount ?? items.length,
      items
    });
  }

  resolveSpatialTarget(target: Readonly<SeedWorldKernelSpatialTarget>): Readonly<SeedWorldKernelSpatialTarget> {
    const resolved = this._resolveSpatialTarget(target);
    const position = Object.freeze({ x: resolved.position[0], y: resolved.position[1], z: resolved.position[2] });
    return Object.freeze({
      anchor: Object.freeze({ kind: "position", ...position }),
      frame: "world",
      origin: "surface",
      relation:
        resolved.geometry === "area"
          ? Object.freeze({ kind: "around", radiusMetres: resolved.radiusMetres! })
          : Object.freeze({ kind: "at" }),
      placement: Object.freeze({ snapTo: "none", collision: target.placement?.collision ?? "allow" })
    });
  }

  /**
   * Submits gameplay intent; the mount module resolves current presence and rider state.
   * @param input - One of the three semantic commands.
   * @param signal - Cancellation before dispatch.
   * @returns An accepted behavior receipt, not animation completion.
   */
  commandMount(input: Readonly<SeedWorldMountCommandInput>, signal: AbortSignal): Promise<SeedWorldMountCommandResult> | SeedWorldMountCommandResult {
    signal.throwIfAborted();
    if (!this._engine.commandMount) throw new Error("Mount system is unavailable");
    return this._engine.commandMount(input, signal);
  }

  teleport(input: Readonly<{ target: SeedWorldKernelSpatialTarget; heightOffset: number }>): unknown {
    const resolved = this._resolveSpatialTarget(input.target);
    return this._engine.teleport({
      x: resolved.position[0],
      z: resolved.position[2],
      heightOffset: input.heightOffset
    });
  }

  async applyTerrainPatch(
    input: Readonly<{
      operation: "raise" | "lower";
      target: SeedWorldKernelSpatialTarget;
      radiusMetres?: number;
      amount: Readonly<{ intensity: "subtle" | "moderate" | "strong" } | { heightDeltaMetres: number }>;
      falloff?: "smooth";
    }> &
      SeedWorldMutationControl,
    signal: AbortSignal
  ): Promise<SeedWorldAuthoringResult> {
    const constraints = this._engine.readTerrainPatchConstraints();
    const radiusMetres = input.radiusMetres ?? constraints.minimumRadiusMetres;
    if (radiusMetres + Number.EPSILON < constraints.minimumRadiusMetres) {
      throw new RangeError(
        `terrain.patch radiusMetres=${radiusMetres} cannot preserve its requested centre height on the current ` +
          `${constraints.heightSampleSpacingMetres}-metre Heightmap lattice; use radiusMetres >= ` +
          `${constraints.minimumRadiusMetres}.`
      );
    }
    const placement = this._resolveAreaPlacement(input.target, radiusMetres);
    const magnitude =
      "heightDeltaMetres" in input.amount
        ? input.amount.heightDeltaMetres
        : input.amount.intensity === "subtle"
          ? 1.5
          : input.amount.intensity === "moderate"
            ? 4
            : 10;
    const heightDeltaMetres = input.operation === "raise" ? magnitude : -magnitude;
    const effect = mutationEffect(placement.x, placement.z, placement.radiusMetres, Math.abs(heightDeltaMetres));
    return this._executeMutations(
      [
        {
          action: "create",
          resourceType: "terrain-patch",
          value: { ...placement, heightDeltaMetres }
        }
      ],
      input,
      effect,
      signal,
      { operation: input.operation, heightDeltaMetres, radiusMetres: placement.radiusMetres }
    );
  }

  async createTerrainFeature(
    input: Readonly<SeedWorldTerrainFeatureCreateInput> & SeedWorldMutationControl,
    signal: AbortSignal
  ): Promise<SeedWorldAssetMutationResult> {
    const resolved = this._resolveSpatialTarget(input.target);
    const transitionDurationSeconds = resolveSeedWorldTerrainTransitionDurationSeconds(
      input.transitionDurationSeconds
    );
    const transitionControl = { transitionDurationSeconds };
    const direction = input.direction ?? { kind: "viewer-forward" as const };
    const headingDegrees =
      direction.kind === "heading"
        ? normalizeHeadingDegrees(direction.degrees)
        : headingFromForward(this._viewerCamera().forward);
    if (input.kind === "hill") {
      const hill = resolveSeedWorldHillAtom({
        pedestalLiftMetres: input.pedestalLiftMetres,
        influenceMajorRadiusMetres: input.influenceMajorRadiusMetres,
        peakReliefMetres: input.peakReliefMetres,
        bodyMajorRadiusMetres: input.bodyMajorRadiusMetres
      });
      const value: SeedWorldTerrainFeatureInput = {
        kind: "hill",
        x: resolved.position[0],
        z: resolved.position[2],
        headingDegrees,
        pedestalLiftMetres: hill.pedestalLiftMetres,
        influenceMajorRadiusMetres: hill.influenceMajorRadiusMetres,
        influenceMinorRadiusMetres: hill.influenceMinorRadiusMetres,
        peakReliefMetres: hill.peakReliefMetres,
        bodyMajorRadiusMetres: hill.bodyMajorRadiusMetres,
        bodyMinorRadiusMetres: hill.bodyMinorRadiusMetres
      };
      const result = await this._executeMutations(
        [{ action: "create", resourceType: "terrain-feature", value, ...transitionControl }],
        input,
        mutationEffect(
          value.x,
          value.z,
          value.influenceMajorRadiusMetres,
          value.pedestalLiftMetres + value.peakReliefMetres
        ),
        signal,
        { ...value, transitionDurationSeconds, adjustments: hill.adjustments }
      );
      return singleAssetMutationResult(result, "create");
    }
    const defaults = terrainFeatureDefaults(input.kind);
    const elevationDeltaMetres =
      input.kind === "canyon" || input.kind === "valley" || input.kind === "basin"
        ? -(input.depthMetres ?? defaults.magnitudeMetres)
        : (input.heightMetres ?? defaults.magnitudeMetres);
    const value: SeedWorldTerrainFeatureInput = {
      kind: input.kind,
      x: resolved.position[0],
      z: resolved.position[2],
      headingDegrees,
      lengthMetres: input.lengthMetres ?? defaults.lengthMetres,
      widthMetres: input.widthMetres ?? defaults.widthMetres,
      elevationDeltaMetres,
      sharpness: input.sharpness ?? defaults.sharpness,
      asymmetry: input.asymmetry ?? defaults.asymmetry,
      roughness: input.roughness ?? defaults.roughness,
      erosion: input.erosion ?? defaults.erosion,
      seed:
        input.seed ??
        deriveSemanticFeatureSeed(this._requireState().world.rootSeed, input.kind, ++this._semanticFeatureSerial)
    };
    const radius = Math.hypot(value.lengthMetres, value.widthMetres) * 0.5;
    const result = await this._executeMutations(
      [{ action: "create", resourceType: "terrain-feature", value, ...transitionControl }],
      input,
      mutationEffect(value.x, value.z, radius, Math.abs(value.elevationDeltaMetres)),
      signal,
      { ...value, transitionDurationSeconds }
    );
    return singleAssetMutationResult(result, "create");
  }

  async updateTerrainFeature(
    ref: Readonly<SeedWorldRef>,
    patch: Readonly<SeedWorldTerrainFeaturePatch>,
    control: SeedWorldTerrainMutationControl,
    signal: AbortSignal
  ): Promise<SeedWorldAssetMutationResult> {
    const resource = this._requireFeatureResource(ref, "terrain");
    const transitionDurationSeconds = resolveSeedWorldTerrainTransitionDurationSeconds(
      control.transitionDurationSeconds
    );
    const transitionControl = { transitionDurationSeconds };
    if (resource.properties.kind === "hill") {
      const headingDegrees =
        "headingDegrees" in patch && patch.headingDegrees !== undefined
          ? normalizeHeadingDegrees(patch.headingDegrees)
          : resource.properties.headingDegrees;
      const hill = resolveSeedWorldHillAtom({
        pedestalLiftMetres:
          "pedestalLiftMetres" in patch
            ? (patch.pedestalLiftMetres ?? resource.properties.pedestalLiftMetres)
            : resource.properties.pedestalLiftMetres,
        influenceMajorRadiusMetres:
          "influenceMajorRadiusMetres" in patch
            ? (patch.influenceMajorRadiusMetres ?? resource.properties.influenceMajorRadiusMetres)
            : resource.properties.influenceMajorRadiusMetres,
        peakReliefMetres:
          "peakReliefMetres" in patch
            ? (patch.peakReliefMetres ?? resource.properties.peakReliefMetres)
            : resource.properties.peakReliefMetres,
        bodyMajorRadiusMetres:
          "bodyMajorRadiusMetres" in patch
            ? (patch.bodyMajorRadiusMetres ?? resource.properties.bodyMajorRadiusMetres)
            : resource.properties.bodyMajorRadiusMetres
      });
      const normalizedPatch = {
        headingDegrees,
        pedestalLiftMetres: hill.pedestalLiftMetres,
        influenceMajorRadiusMetres: hill.influenceMajorRadiusMetres,
        influenceMinorRadiusMetres: hill.influenceMinorRadiusMetres,
        peakReliefMetres: hill.peakReliefMetres,
        bodyMajorRadiusMetres: hill.bodyMajorRadiusMetres,
        bodyMinorRadiusMetres: hill.bodyMinorRadiusMetres
      };
      const result = await this._executeMutations(
        [
          {
            action: "update",
            resourceType: "terrain-feature",
            resourceId: resource.resourceId,
            expectedContentHash: resource.contentHash,
            patch: normalizedPatch,
            ...transitionControl
          }
        ],
        control,
        mutationEffect(
          resource.properties.x,
          resource.properties.z,
          hill.influenceMajorRadiusMetres,
          hill.pedestalLiftMetres + hill.peakReliefMetres
        ),
        signal,
        { kind: "hill", ...normalizedPatch, transitionDurationSeconds, adjustments: hill.adjustments }
      );
      return singleAssetMutationResult(result, "update");
    }
    const normalizedPatch =
      patch.headingDegrees === undefined
        ? patch
        : { ...patch, headingDegrees: normalizeHeadingDegrees(patch.headingDegrees) };
    const properties = { ...resource.properties, ...normalizedPatch };
    const result = await this._executeMutations(
      [
        {
          action: "update",
          resourceType: "terrain-feature",
          resourceId: resource.resourceId,
          expectedContentHash: resource.contentHash,
          patch: normalizedPatch,
          ...transitionControl
        }
      ],
      control,
      mutationEffect(
        properties.x,
        properties.z,
        Math.hypot(properties.lengthMetres, properties.widthMetres) * 0.5,
        Math.abs(properties.elevationDeltaMetres)
      ),
      signal,
      { ...normalizedPatch, transitionDurationSeconds }
    );
    return singleAssetMutationResult(result, "update");
  }

  async createVegetation(
    input: SeedWorldVegetationCreateInput,
    signal: AbortSignal
  ): Promise<SeedWorldVegetationCreateResult> {
    const distribution = input.distribution;
    const category = vegetationRenderCategory(input.plant);
    const radiusMetres = "radiusMetres" in distribution ? distribution.radiusMetres : undefined;
    const target =
      distribution.kind === "single" || input.plant === "shrub" || input.plant === "grass" || input.plant === "flower"
        ? Object.freeze({
            ...input.target,
            placement: Object.freeze({ snapTo: "terrain" as const, collision: "allow" as const })
          })
        : input.target;
    const placement = this._resolveAreaPlacement(
      target,
      radiusMetres ?? vegetationDefaultRadius(input.plant, distribution.kind)
    );
    const requestedPlantCount =
      distribution.kind === "single"
        ? 1
        : "count" in distribution
          ? distribution.count
          : undefined;
    const internalDistributionKind =
      distribution.kind === "single"
        ? "single" as const
        : requestedPlantCount === undefined
          ? "area" as const
          : "cluster" as const;
    const value: SeedWorldVegetationBrushInput = {
      category,
      plantKind: input.plant,
      distributionKind: internalDistributionKind,
      ...placement,
      densityScale: 1,
      ...(requestedPlantCount !== undefined ? { requestedPlantCount } : {}),
      seed: input.seed
    };
    const mutationResult = await this._executeMutations(
      [{ action: "create", resourceType: "vegetation-brush", value }],
      input,
      mutationEffect(
        value.x,
        value.z,
        value.radiusMetres,
        0,
        requestedPlantCount ?? 1
      ),
      signal,
      { ...value }
    );
    const result = singleAssetMutationResult(mutationResult, "create");
    const assetKind = vegetationPublicAssetKind(input.plant, distribution.kind);
    if (result.assetRef && result.assetRef.kind !== assetKind) {
      throw new Error(`Vegetation create published '${result.assetRef.kind}', expected '${assetKind}'`);
    }
    const created: SeedWorldVegetationCreateResult["created"] = Object.freeze({
      plant: input.plant,
      assetKind,
      distribution: distribution.kind,
      ...(result.status === "applied" && (input.plant === "tree" || input.plant === "shrub")
        ? {
            realizedPlantCount:
              requestedPlantCount !== undefined
                ? requireRealizedPlantCount(result, requestedPlantCount!)
                : readRealizedPlantCount(result)
          }
          : { realizedPlantCount: null }),
      requestedPlantCount: requestedPlantCount ?? null
    });
    return Object.freeze({
      ...result,
      created
    });
  }

  async updateVegetation(
    ref: Readonly<SeedWorldRef>,
    patch: SeedWorldVegetationFeaturePatch,
    control: SeedWorldMutationControl,
    signal: AbortSignal
  ): Promise<SeedWorldVegetationUpdateResult> {
    if (patch.treeShape !== undefined) {
      if (ref.domain !== "vegetation" || ref.kind !== "tree" || patch.treeShapeScope !== "shared-effect" ||
        Object.keys(patch).some((key) => !["treeShape", "treeShapeScope", "treeEffectIndex"].includes(key))) {
        throw new Error("INVALID_INPUT: treeShape edits require shared-effect scope and cannot include distribution edits");
      }
      const asset = this._assets.get(ref);
      if (!asset) throw new Error(`WorldRef '${ref.id}' does not exist`);
      const recipeId = asset.properties.treeRecipeId;
      const effectIndex = patch.treeEffectIndex ?? asset.properties.treeEffectIndex;
      if (typeof recipeId !== "string" || typeof effectIndex !== "number" || !Number.isInteger(effectIndex) || effectIndex < 1 || effectIndex > 7) {
        throw new Error("Tree shape requires an editable shared effect 1 through 7; the measured source slot 0 is not editable");
      }
      const members = this._engine.queryWorldObjects({ kinds: ["tree"], orderBy: [], limit: 1_000_000 }).objects
        .filter((object) => object.properties.treeRecipeId === recipeId && object.properties.treeEffectIndex === effectIndex);
      if (members.length === 0) throw new Error("Shared tree effect has no current instances");
      if (!this._engine.previewTreeVariationEdit) throw new Error("Runtime does not support shared tree effects");
      const bounds = this._engine.previewTreeVariationEdit(recipeId, effectIndex - 1, patch.treeShape);
      const result = singleAssetMutationResult(await this._executeMutations(
        [{ action: "update", resourceType: "tree-variation", value: { recipeId, variationIndex: effectIndex - 1, controls: patch.treeShape } }],
        control,
        { areaSquareMetres: (bounds.maximum[0] - bounds.minimum[0]) * (bounds.maximum[2] - bounds.minimum[2]), objectCount: members.length, terrainDeltaMetres: 0, bounds },
        signal,
        { scope: "shared-effect", recipeId, effectIndex, treeShape: patch.treeShape, affectedTreeCount: members.length }
      ), "update");
      return Object.freeze({
        ...result, matchedCount: members.length,
        ...(result.status === "applied" ? { resolvedEffect: { ...result.resolvedEffect, treeShape: this._assets.get(result.assetRef)?.properties.treeShape } } : {}),
        updated: Object.freeze({ plant: "tree" as const, assetKind: "tree" as const, realizedPlantCount: result.status === "applied" ? result.updatedCount : null })
      });
    }
    const resource = this._requireFeatureResource(ref, "vegetation");
    const { target, radiusMetres, count, seed } = patch;
    const internalDistribution = resource.properties.distributionKind;
    if (internalDistribution === "single" && (radiusMetres !== undefined || count !== undefined)) {
      throw new Error("INVALID_INPUT: single vegetation assets only support target and seed updates");
    }
    const isDiscreteArea = resource.properties.plantKind === "tree" || resource.properties.plantKind === "shrub";
    if (!isDiscreteArea && count !== undefined) {
      throw new Error("INVALID_INPUT: count is only available for authored forests and shrublands");
    }
    const placement = target
      ? this._resolveAreaPlacement(internalDistribution === "single"
          ? { ...target, placement: { snapTo: "terrain", collision: "allow" } }
          : target, radiusMetres ?? resource.properties.radiusMetres)
      : undefined;
    const resourcePatch: Partial<SeedWorldVegetationBrushInput> = {
      ...(placement ? { x: placement.x, z: placement.z } : {}),
      ...(radiusMetres !== undefined ? { radiusMetres } : {}),
      ...(count !== undefined
        ? { distributionKind: "cluster" as const, requestedPlantCount: count, densityScale: 1 }
        : {}),
      ...(seed !== undefined ? { seed } : {})
    };
    const properties: SeedWorldVegetationBrushInput = { ...resource.properties, ...resourcePatch };
    const mutationResult = await this._executeMutations(
      [
        {
          action: "update",
          resourceType: "vegetation-brush",
          resourceId: resource.resourceId,
          expectedContentHash: resource.contentHash,
          patch: resourcePatch
        }
      ],
      control,
      mutationEffect(properties.x, properties.z, properties.radiusMetres, 0),
      signal,
      resourcePatch
    );
    const result = singleAssetMutationResult(mutationResult, "update");
    const plant = resource.properties.plantKind;
    const publicDistribution = internalDistribution === "single" ? "single" : "area";
    const assetKind = vegetationPublicAssetKind(plant, publicDistribution);
    if (result.assetRef && result.assetRef.kind !== assetKind) {
      throw new Error(`Vegetation update published '${result.assetRef.kind}', expected '${assetKind}'`);
    }
    const updated: SeedWorldVegetationUpdateResult["updated"] = Object.freeze({
      plant,
      assetKind,
      ...(result.status === "applied" && (plant === "tree" || plant === "shrub")
        ? {
            realizedPlantCount:
              count !== undefined
                ? requireRealizedPlantCount(result, count)
                : readRealizedPlantCount(result)
          }
          : { realizedPlantCount: null })
    });
    return Object.freeze({ ...result, updated });
  }

  async deleteWorld(
    input: Readonly<{ refs?: readonly SeedWorldRef[]; selector?: SeedWorldSelector }> & SeedWorldMutationControl,
    signal: AbortSignal
  ): Promise<SeedWorldAuthoringResult> {
    const requestedRefs = input.refs ?? this._selectMutationRefs(input.selector!);
    if (requestedRefs.some(ref => ref.kind === "building"))
      throw new Error("Use the native Entity/Component editor for buildings; landscape deletion does not edit buildings");
    if (requestedRefs.length === 0)
      return unchangedAuthoringResult(this._currentRevision(), "没有匹配到可删除内容");
    const { refs, aggregateRefs } = this._expandAggregateDeletionRefs(requestedRefs);
    const authoredResourceIds = new Set(
      this._engine.readAuthoringSnapshot().resources.map(({ resourceId }) => resourceId)
    );
    const mutations: SeedWorldResourceMutation[] = [];
    const warnings: string[] = [];
    const logicalDeletedRefs: SeedWorldRef[] = [...aggregateRefs];
    const selectedObjectRefs = refs.filter((ref) => isAddressableObjectRef(ref) && !authoredResourceIds.has(ref.id));
    const selectedFeatureIds = new Set(
      refs.filter((ref) => authoredResourceIds.has(ref.id) || !isAddressableObjectRef(ref)).map(({ id }) => id)
    );
    const selectedObjectIds = new Set(selectedObjectRefs.map(({ id }) => id));
    const objectsById = selectedObjectIds.size
      ? new Map(
          this._engine
            .queryWorldObjects({ kinds: ALL_OBJECT_KINDS, orderBy: [], limit: 100_000 })
            .objects.filter(({ objectId }) => selectedObjectIds.has(objectId))
            .map((object) => [object.objectId, object] as const)
        )
      : new Map<string, SeedWorldObject>();
    let affectedBounds: SeedWorldBounds | undefined;
    for (const ref of refs) {
      if (ref.source === "natural" && !isAddressableObjectRef(ref)) {
        warnings.push(`'${ref.id}' 是自然生成的 ${ref.kind} 资产，当前世界运行时没有对应的可逆删除原子能力`);
        continue;
      }
      if (isAddressableObjectRef(ref) && !authoredResourceIds.has(ref.id)) {
        const object = objectsById.get(ref.id);
        if (!object) throw new Error(`World object '${ref.id}' does not exist in revision ${this._currentRevision()}`);
        if (!isRemovableObjectKind(object.objectKind)) {
          throw new Error(`World object kind '${object.objectKind}' has no persistent removal atom`);
        }
        if (object.source.kind === "authoring" && selectedFeatureIds.has(object.source.sourceId)) continue;
        const radiusMetres = Math.max(0.05, Math.hypot(...object.footprintMetres) * 0.5);
        mutations.push({
          action: "create",
          resourceType: "object-removal",
          value: {
            objectId: object.objectId,
            objectKind: object.objectKind,
            x: object.position[0],
            z: object.position[2],
            radiusMetres
          }
        });
        logicalDeletedRefs.push(ref);
        affectedBounds = unionBounds(affectedBounds, this._assets.boundsForObject(object));
        continue;
      }
      const resource = this._requireFeatureResource(ref, ref.domain);
      mutations.push(deleteMutation(resource));
      logicalDeletedRefs.push(ref);
      affectedBounds = unionBounds(affectedBounds, this._assets.boundsForAuthoringResource(resource));
    }
    if (mutations.length === 0) {
      throw new AgentToolExecutionError({
        code: "NOT_EDITABLE",
        message: `匹配到 ${requestedRefs.length} 个资产，但当前运行时没有任何对应的局部删除原子能力`,
        retryable: false,
        executed: false,
        details: Object.freeze({
          skippedRefs: Object.freeze(
            requestedRefs.slice(0, MAX_AUTHORING_RESULT_REFS)
          ),
          refsTruncated: requestedRefs.length > MAX_AUTHORING_RESULT_REFS,
          warnings: Object.freeze(warnings)
        })
      });
    }
    const effect = boundsEffect(affectedBounds, mutations.length);
    const deleteRefSample = requestedRefs.slice(0, MAX_AUTHORING_RESULT_REFS);
    const result = await this._executeMutations(
      mutations,
      input,
      effect,
      signal,
      {
        deleteRefCount: requestedRefs.length,
        deleteRefs: deleteRefSample,
        deleteRefsTruncated: requestedRefs.length > deleteRefSample.length
      },
      { logicalDeletedRefs }
    );
    return Object.freeze({ ...result, matchedCount: requestedRefs.length, skippedCount: warnings.length, warnings });
  }

  private _expandAggregateDeletionRefs(
    requestedRefs: readonly Readonly<SeedWorldRef>[]
  ): Readonly<{ refs: readonly SeedWorldRef[]; aggregateRefs: readonly SeedWorldRef[] }> {
    const refs = new Map<string, SeedWorldRef>();
    const aggregateRefs: SeedWorldRef[] = [];
    let vegetationMembers: readonly Candidate[] | undefined;
    for (const ref of requestedRefs) {
      if (
        ref.source === "natural" &&
        ref.domain === "vegetation" &&
        (ref.kind === "forest" || ref.kind === "shrubland")
      ) {
        aggregateRefs.push(ref);
        vegetationMembers ??= this._assets.list({ domains: ["vegetation"], kinds: ["tree", "shrub"] });
        for (const member of vegetationMembers) {
          if (member.relations?.parent?.id !== ref.id) continue;
          refs.set(stableWorldRefKey(member.ref), member.ref);
        }
        continue;
      }
      refs.set(stableWorldRefKey(ref), ref);
    }
    return Object.freeze({
      refs: Object.freeze([...refs.values()]),
      aggregateRefs: Object.freeze(aggregateRefs)
    });
  }

  private _updateEnvironment(
    input: Readonly<SeedWorldEnvironmentUpdateInput>,
    signal: AbortSignal
  ): Promise<unknown> | unknown {
    this._requireState();
    return this._engine.updateEnvironment(input, signal);
  }

  private _selectCandidates(selector: Readonly<SeedWorldSelector>, depth: number): Candidate[] {
    if (depth > 2) throw new Error("WorldSelector relatedTo 嵌套不能超过两层");
    const candidates = [...this._assets.list(selector)];

    const tagged = candidates.map((candidate) => {
      const tags = this._tagsByRef.get(stableWorldRefKey(candidate.ref));
      return tags ? Object.freeze({ ...candidate, tags: Object.freeze([...tags]) }) : candidate;
    });
    let filtered = tagged.filter((candidate) => matchesSelectorIdentity(candidate, selector));
    filtered = filtered.filter((candidate) =>
      (selector.filters ?? []).every((filter) => matchesFilter(candidate, filter))
    );

    if (selector.spatial) {
      const anchor = this._resolveSelectorAnchor(selector.spatial.anchor);
      filtered = filtered.flatMap((candidate) => {
        const metrics = candidate.position ? spatialMetrics(anchor, candidate.position) : undefined;
        if (!matchesSpatialRelation(selector.spatial!, metrics, anchor.bounds, candidate.bounds)) return [];
        return metrics
          ? [{ ...candidate, distanceMetres: metrics.distance, viewAngleDegrees: metrics.viewAngle }]
          : [candidate];
      });
    } else if (selector.sort === "nearest" || selector.sort === "farthest") {
      const viewer = this._viewerCamera();
      const anchor = Object.freeze({ position: viewer.position, forward: viewer.forward });
      filtered = filtered.map((candidate) => {
        if (!candidate.position) return candidate;
        const metrics = spatialMetrics(anchor, candidate.position);
        return { ...candidate, distanceMetres: metrics.distance, viewAngleDegrees: metrics.viewAngle };
      });
    }

    for (const relation of selector.relatedTo ?? []) {
      const related = this._selectCandidates(relation.selector, depth + 1);
      filtered = filtered.filter((candidate) =>
        related.some((target) =>
          matchesCandidateRelation(candidate, target, relation.relation, relation.maxDistanceMetres)
        )
      );
    }

    filtered.sort((left, right) => compareCandidates(left, right, selector.sort));
    return filtered.map(candidate => candidate.position ? {...candidate,
      viewerRelation: this.viewerRelationFor(candidate.position)} : candidate);
  }

  /** Mutation selectors are always exhaustive; pagination belongs only to world.query. */
  private _selectMutationRefs(selector: Readonly<SeedWorldSelector>): readonly SeedWorldRef[] {
    const candidates = this._selectCandidates(selector, 0);
    const refs = Object.freeze(candidates.map(({ ref }) => ref));
    // Mutation scope and conversational context have different cardinality contracts:
    // execute against every match, but never feed an unbounded Ref list into the next LLM turn.
    this._lastSelectedRefs = Object.freeze(refs.slice(0, MAX_AUTHORING_RESULT_REFS));
    return refs;
  }

  private _resolveRefItem(ref: Readonly<SeedWorldRef>): Readonly<SeedWorldSelectionItem> | undefined {
    const asset = this._assets.get(ref);
    return asset ? publicAssetDetail(asset) : undefined;
  }

  private _resolveSelectorAnchor(anchor: Readonly<SeedWorldSelectorAnchor>): Readonly<{
    position: readonly [number, number, number];
    forward: readonly [number, number, number];
    bounds?: Readonly<SeedWorldBounds>;
  }> {
    if (anchor.kind === "viewer") {
      const viewer = this._viewerCamera();
      return Object.freeze({ position: viewer.position, forward: viewer.forward });
    }
    if (anchor.kind === "position") {
      const resolved = this._engine.resolveSpatialTarget({
        anchor: { kind: "position", x: anchor.x, z: anchor.z },
        relation: { kind: "at" }
      });
      return Object.freeze({ position: resolved.position, forward: Object.freeze([0, 0, -1] as const) });
    }
    const ref = anchor.kind === "selection" ? this._requireSelection(anchor.selectionId).items[0]?.ref : anchor.ref;
    if (!ref) throw new Error("Selection is empty");
    const item = this._resolveRefItem(ref);
    if (!item) throw missingAnchorRefError(ref);
    if (!item.position) throw new Error(`WorldRef '${ref.id}' has no spatial position`);
    return Object.freeze({
      position: item.position,
      forward: featureForward(item),
      ...(item.bounds ? { bounds: item.bounds } : {})
    });
  }

  private _resolveSpatialTarget(target: Readonly<SeedWorldKernelSpatialTarget>): SeedWorldKernelResolvedSpatialTarget {
    const revision = this._currentRevision();
    if (target.expectedWorldRevision !== undefined && target.expectedWorldRevision !== revision) {
      throw new Error(
        `SpatialTarget expected revision ${target.expectedWorldRevision}, current revision is ${revision}`
      );
    }
    const frame = target.relation.kind === "front" ? "anchor-local" : target.frame ?? "anchor-local";
    const origin = target.origin ?? "surface";
    const anchor = this._resolveKernelAnchor(target.anchor, origin);
    const placement = target.placement ?? { snapTo: "terrain" as const };
    const forward = frame === "world" ? ([0, 0, -1] as const) : anchor.forward;
    const horizontal = normalizeHorizontal(forward);
    const right = Object.freeze([-horizontal[1], 0, horizontal[0]] as const);
    let x = anchor.position[0];
    let y = anchor.position[1];
    let z = anchor.position[2];
    let radiusMetres: number | undefined;
    switch (target.relation.kind) {
      case "at":
        break;
      case "front":
        x += horizontal[0] * (target.relation.distanceMetres ?? SEED_WORLD_FRONT_RELATION_DISTANCE_METRES);
        z += horizontal[1] * (target.relation.distanceMetres ?? SEED_WORLD_FRONT_RELATION_DISTANCE_METRES);
        break;
      case "behind":
        x -= horizontal[0] * target.relation.distanceMetres;
        z -= horizontal[1] * target.relation.distanceMetres;
        break;
      case "left":
        x -= right[0] * target.relation.distanceMetres;
        z -= right[2] * target.relation.distanceMetres;
        break;
      case "right":
        x += right[0] * target.relation.distanceMetres;
        z += right[2] * target.relation.distanceMetres;
        break;
      case "near": {
        const viewer = this._viewerCamera().position;
        const dx = viewer[0] - x;
        const dz = viewer[2] - z;
        const length = Math.hypot(dx, dz) || 1;
        x += (dx / length) * target.relation.preferredDistanceMetres;
        z += (dz / length) * target.relation.preferredDistanceMetres;
        break;
      }
      case "around":
        radiusMetres = target.relation.radiusMetres;
        break;
      case "offset":
        x += horizontal[0] * target.relation.forwardMetres + right[0] * target.relation.rightMetres;
        z += horizontal[1] * target.relation.forwardMetres + right[2] * target.relation.rightMetres;
        y += target.relation.upMetres ?? 0;
        break;
    }
    if (placement.snapTo !== "none") {
      const resolved = this._engine.resolveSpatialTarget({
        anchor: { kind: "position", x, z },
        relation: { kind: "at" }
      });
      y = resolved.position[1];
    }
    this._validatePlacement(x, z, placement);
    return Object.freeze({
      geometry: radiusMetres === undefined ? "point" : "area",
      position: Object.freeze([x, y, z] as const),
      radiusMetres,
      worldRevision: revision,
      resolvedFrom: Object.freeze({
        anchor: target.anchor.kind,
        relation: target.relation.kind,
        frame,
        origin,
        snappedTo: placement.snapTo
      })
    });
  }

  private _resolveKernelAnchor(
    anchor: Readonly<SeedWorldKernelSpatialAnchor>,
    origin: NonNullable<SeedWorldKernelSpatialTarget["origin"]>
  ): Readonly<{
    position: readonly [number, number, number];
    forward: readonly [number, number, number];
  }> {
    if (anchor.kind === "viewer") {
      const viewer = this._viewerCamera();
      if (origin === "feet" || origin === "surface") {
        const surface = this._engine.resolveSpatialTarget({
          anchor: { kind: "position", x: viewer.position[0], z: viewer.position[2] },
          relation: { kind: "at" }
        });
        return Object.freeze({ position: surface.position, forward: viewer.forward });
      }
      return Object.freeze({ position: viewer.position, forward: viewer.forward });
    }
    if (anchor.kind === "position") {
      if (anchor.y !== undefined) {
        return Object.freeze({
          position: Object.freeze([anchor.x, anchor.y, anchor.z] as const),
          forward: Object.freeze([0, 0, -1] as const)
        });
      }
      return this._resolveSelectorAnchor(anchor);
    }
    const ref = anchor.kind === "selection" ? this._requireSelection(anchor.selectionId).items[0]?.ref : anchor.ref;
    if (!ref) throw new Error(`Selection '${anchor.kind === "selection" ? anchor.selectionId : ""}' is empty`);
    const item = this._resolveRefItem(ref);
    if (!item) throw missingAnchorRefError(ref);
    if (!item.position) throw new Error(`WorldRef '${ref.id}' 没有可用空间位置`);
    return Object.freeze({
      position: resolveSelectionItemOrigin(item, origin, this._viewerCamera().position),
      forward: featureForward(item)
    });
  }

  private _validatePlacement(
    x: number,
    z: number,
    placement: NonNullable<SeedWorldKernelSpatialTarget["placement"]>
  ): void {
    if (placement.collision === "avoid") {
      const collision = this._engine.queryWorldObjects({
        kinds: ["tree", "shrub", "rock", "small-rock", "mushroom"],
        spatial: {
          anchor: { kind: "position", x, z },
          relation: "near",
          maximumDistanceMetres: 1.5
        },
        orderBy: [{ field: "distance", direction: "asc" }],
        limit: 1
      }).objects[0];
      if (collision) throw new Error("目标位置与现有世界对象冲突");
    }
    if (!placement.requireWater && !placement.avoidWater && placement.maxSlope === undefined) return;
    const sample = this._engine.queryWorldPoints({
      mode: "sample",
      positions: [{ x, z }],
      sampleDistance: 1
    }) as { samples?: readonly Readonly<{ water?: boolean; slope?: number }>[] };
    const point = sample.samples?.[0];
    if (!point) throw new Error("无法检查目标位置的地表条件");
    if (placement.requireWater && !point.water) throw new Error("目标位置不在水域内");
    if (placement.avoidWater && point.water) throw new Error("目标位置位于水域内，但 placement 要求避开水域");
    if (placement.maxSlope !== undefined && (point.slope ?? 0) > placement.maxSlope) {
      throw new Error(`目标坡度 ${(point.slope ?? 0).toFixed(1)} 超过 ${placement.maxSlope}`);
    }
  }

  private _resolveAreaPlacement(
    target: Readonly<SeedWorldKernelSpatialTarget>,
    defaultRadius: number
  ): Readonly<{ x: number; z: number; radiusMetres: number }> {
    const resolved = this._resolveSpatialTarget(target);
    return Object.freeze({
      x: resolved.position[0],
      z: resolved.position[2],
      radiusMetres: resolved.radiusMetres ?? defaultRadius
    });
  }

  private async _executeMutations(
    mutations: readonly Readonly<SeedWorldResourceMutation>[],
    control: SeedWorldWaterMutationControl,
    effect: MutationEffect,
    signal: AbortSignal,
    resolvedEffect: Readonly<Record<string, unknown>>,
    refOverrides?: Readonly<{ logicalDeletedRefs?: readonly SeedWorldRef[] }>
  ): Promise<SeedWorldAuthoringResult> {
    this._requireState();
    this._validateMutationControl(control, effect);
    if (control.executionMode === "preview") {
      if (control.edit) await this._engine.validateWorldResources?.(mutations, signal, control.edit);
      else await this._engine.validateWorldResources?.(mutations, signal);
      return Object.freeze({
        status: "preview" as const,
        transactionId: null,
        worldRevision: this._currentRevision(),
        matchedCount: mutations.length,
        createdCount: 0,
        updatedCount: 0,
        deletedCount: 0,
        skippedCount: 0,
        createdRefs: Object.freeze([]),
        updatedRefs: Object.freeze([]),
        deletedRefs: Object.freeze([]),
        refsTruncated: false,
        affectedBounds: effect.bounds ?? null,
        warnings: Object.freeze([]),
        resolvedEffect: freezeJsonObject(resolvedEffect),
        reason: null
      });
    }
    const raw = (await (mutations.length === 1
      ? control.edit ? this._engine.mutateWorldResource(mutations[0]!, signal, control.edit)
        : this._engine.mutateWorldResource(mutations[0]!, signal)
      : control.edit ? this._engine.mutateWorldResources(mutations, signal, control.edit)
        : this._engine.mutateWorldResources(mutations, signal))) as MutationReceipt;
    const result = this._authoringResultFromReceipt(raw, mutations, {
      matchedCount: mutations.length,
      affectedBounds: effect.bounds,
      resolvedEffect,
      logicalDeletedRefs: refOverrides?.logicalDeletedRefs
    });
    this._lastCreatedRefs = result.createdRefs;
    if (result.status === "applied") this._lastTransactionId = result.transactionId;
    return result;
  }

  private _authoringResultFromReceipt(
    receipt: MutationReceipt,
    mutations: readonly Readonly<SeedWorldResourceMutation>[],
    extra: Readonly<{
      matchedCount?: number;
      affectedBounds?: SeedWorldBounds;
      resolvedEffect?: Readonly<Record<string, unknown>>;
      logicalDeletedRefs?: readonly SeedWorldRef[];
    }>
  ): Extract<SeedWorldAuthoringResult, { status: "applied" }> {
    const transactionId = receipt.transactionId?.trim();
    if (!transactionId) throw new Error("Committed World Authoring receipt is missing transactionId");
    const revision = receipt.authoring?.activeRevision ?? this._currentRevision();
    const entries =
      receipt.results ??
      (receipt.resourceId && receipt.action && receipt.action !== "batch" && receipt.action !== "undo"
        ? [
            {
              action: receipt.action,
              resourceType: receipt.resourceType!,
              resourceId: receipt.resourceId,
              resource: receipt.resource
            }
          ]
        : []);
    const publicEntries = entries.flatMap((entry) => {
      if (entry.resourceType === "tree-variation") {
        const objects = this._engine.queryWorldObjects({ kinds: ["tree"], orderBy: [], limit: 1_000_000 }).objects;
        const resources = this._engine.readAuthoringSnapshot().resources;
        return objects.filter((object) => typeof object.properties.treeRecipeId === "string" &&
          treeVariationKey(object.properties.treeRecipeId, Number(object.properties.treeEffectIndex) - 1) === entry.resourceId)
          .map((object) => {
            const owner = object.source.kind === "authoring" ? resources.find((resource) => resource.resourceId === object.source.sourceId) : undefined;
            const ref = owner?.resourceType === "vegetation-brush" && owner.properties.distributionKind === "single"
              ? this._assets.refForAuthoringResource(owner, revision)!
              : this._assets.refForObject(object);
            return { entry: { ...entry, action: "update" as const }, ref };
          });
      }
      if (entry.resourceType === "object-removal" || entry.resourceType === "terrain-patch") return [];
      const ref = entry.resource
        ? this._assets.refForAuthoringResource(entry.resource, revision)
        : extra.logicalDeletedRefs?.find(({ id }) => id === entry.resourceId);
      return ref ? [{ entry, ref }] : [];
    });
    const restoredObjectRefs = entries
      .filter(({ resourceType, action }) => resourceType === "object-removal" && action === "delete")
      .flatMap(({ resourceId }) => {
        try {
          const ref = this._assets.refForObject(this._engine.getWorldObject(resourceId));
          return [Object.freeze({ ...ref, revision })];
        } catch {
          return [];
        }
      });
    const removedObjectRefs = extra.logicalDeletedRefs?.length
      ? []
      : entries.flatMap(({ resourceType, action, resourceId, resource }) => {
          if (resourceType !== "object-removal" || action !== "create") return [];
          const objectKind = resource?.resourceType === "object-removal" ? resource.properties.objectKind : "object";
          return [
            Object.freeze({
              id: resourceId,
              domain: objectKindDomain(objectKind),
              kind: objectKind,
              source: resourceId.startsWith("population:agent-") ? ("authored" as const) : ("natural" as const),
              revision
            })
          ];
        });
    const allCreatedRefs = [
      ...publicEntries.filter(({ entry }) => entry.action === "create").map(({ ref }) => ref),
      ...restoredObjectRefs
    ];
    const allUpdatedRefs = publicEntries.filter(({ entry }) => entry.action === "update").map(({ ref }) => ref);
    const receiptDeletedRefs = extra.logicalDeletedRefs?.length
      ? []
      : publicEntries.filter(({ entry }) => entry.action === "delete").map(({ ref }) => ref);
    const allDeletedRefs = [
      ...receiptDeletedRefs,
      ...removedObjectRefs,
      ...(extra.logicalDeletedRefs ?? []).map((ref) => Object.freeze({ ...ref, revision }))
    ];
    const refsTruncated = [allCreatedRefs, allUpdatedRefs, allDeletedRefs].some(
      (items) => items.length > MAX_AUTHORING_RESULT_REFS
    );
    const realizedPlantCount = entries.length === 1 ? entries[0]?.realizedPlantCount : undefined;
    const resolvedEffect = extra.resolvedEffect || realizedPlantCount !== undefined
      ? freezeJsonObject({
          ...(extra.resolvedEffect ?? {}),
          ...(realizedPlantCount !== undefined ? { realizedPlantCount } : {})
        })
      : undefined;
    return Object.freeze({
      status: "applied" as const,
      transactionId,
      worldRevision: revision,
      matchedCount: extra.matchedCount ?? mutations.length,
      createdCount: allCreatedRefs.length,
      updatedCount: allUpdatedRefs.length,
      deletedCount: allDeletedRefs.length,
      skippedCount: 0,
      createdRefs: Object.freeze(allCreatedRefs.slice(0, MAX_AUTHORING_RESULT_REFS)),
      updatedRefs: Object.freeze(allUpdatedRefs.slice(0, MAX_AUTHORING_RESULT_REFS)),
      deletedRefs: Object.freeze(allDeletedRefs.slice(0, MAX_AUTHORING_RESULT_REFS)),
      refsTruncated,
      affectedBounds: extra.affectedBounds ?? null,
      warnings: Object.freeze([]),
      resolvedEffect: resolvedEffect ?? null,
      reason: null
    });
  }

  private _validateMutationControl(control: SeedWorldMutationControl, effect: MutationEffect): void {
    const revision = this._currentRevision();
    if (control.expectedWorldRevision !== undefined && control.expectedWorldRevision !== revision) {
      throw new Error(
        `World mutation expected revision ${control.expectedWorldRevision}, current revision is ${revision}`
      );
    }
    const budget = control.impactBudget;
    if (!budget) return;
    if (budget.maxAreaSquareMetres !== undefined && effect.areaSquareMetres > budget.maxAreaSquareMetres) {
      throw new Error(
        `IMPACT_LIMIT_EXCEEDED: affected area ${effect.areaSquareMetres.toFixed(1)} exceeds ${budget.maxAreaSquareMetres}`
      );
    }
    if (budget.maxObjectCount !== undefined && effect.objectCount > budget.maxObjectCount) {
      throw new Error(
        `IMPACT_LIMIT_EXCEEDED: affected object count ${effect.objectCount} exceeds ${budget.maxObjectCount}`
      );
    }
    if (budget.maxTerrainDeltaMetres !== undefined && effect.terrainDeltaMetres > budget.maxTerrainDeltaMetres) {
      throw new Error(
        `IMPACT_LIMIT_EXCEEDED: terrain delta ${effect.terrainDeltaMetres} exceeds ${budget.maxTerrainDeltaMetres}`
      );
    }
  }

  private _requireFeatureResource(
    ref: Readonly<SeedWorldRef>,
    expectedDomain: "terrain"
  ): SeedWorldAuthoringResourceOf<"terrain-feature">;
  private _requireFeatureResource(
    ref: Readonly<SeedWorldRef>,
    expectedDomain: "vegetation"
  ): SeedWorldAuthoringResourceOf<"vegetation-brush">;
  private _requireFeatureResource(
    ref: Readonly<SeedWorldRef>,
    expectedDomain: SeedWorldAssetDomain
  ): Exclude<SeedWorldAuthoringResource, SeedWorldAuthoringResourceOf<"terrain-patch" | "object-removal">>;
  private _requireFeatureResource(
    ref: Readonly<SeedWorldRef>,
    expectedDomain: SeedWorldAssetDomain
  ): Exclude<SeedWorldAuthoringResource, SeedWorldAuthoringResourceOf<"terrain-patch" | "object-removal">> {
    if (ref.domain !== expectedDomain) throw new Error(`WorldRef '${ref.id}' is ${ref.domain}, not ${expectedDomain}`);
    const resource = this._engine.readAuthoringSnapshot().resources.find(({ resourceId }) => resourceId === ref.id);
    if (!resource) throw new Error(`WorldRef '${ref.id}' does not exist`);
    if (resource.resourceType === "terrain-patch" || resource.resourceType === "object-removal") {
      throw new Error(`WorldRef '${ref.id}' is not an editable semantic asset`);
    }
    const actualDomain =
      resource.resourceType === "terrain-feature"
        ? "terrain"
        : "vegetation";
    if (actualDomain !== expectedDomain) {
      throw new Error(`WorldRef '${ref.id}' resolves to ${actualDomain}, not ${expectedDomain}`);
    }
    return resource;
  }

  private _rememberSelection(selectionId: string, selection: SelectionRecord): void {
    this._selections.set(selectionId, selection);
    const saved = new Set(this._namedSelections.values());
    const transient = [...this._selections.keys()].filter(id => !saved.has(id));
    for (const id of transient.slice(0, Math.max(0, transient.length - 64))) this._selections.delete(id);
  }

  private _requireSelection(selectionId: string): SelectionRecord {
    const selection = this._selections.get(selectionId);
    if (!selection) throw new Error(`Selection '${selectionId}' does not exist`);
    return selection;
  }

  private _currentRevision(): number {
    return this._engine.readAuthoringSnapshot().activeRevision;
  }

  private _requireState() {
    const state = this._engine.readWorldState();
    if (!state) throw new Error("Seed World 3D runtime is not ready");
    return state;
  }

  private _viewerCamera(): Readonly<SeedWorldLiveState["camera"]> {
    return this._taskViewer ?? this._requireState().camera;
  }
}

type MutationEffect = Readonly<{
  bounds?: SeedWorldBounds;
  areaSquareMetres: number;
  objectCount: number;
  terrainDeltaMetres: number;
}>;

function mutationEffect(
  x: number,
  z: number,
  radius: number,
  terrainDeltaMetres: number,
  objectCount = 1
): MutationEffect {
  return Object.freeze({
    bounds: Object.freeze({
      minimum: Object.freeze([x - radius, -terrainDeltaMetres, z - radius] as const),
      maximum: Object.freeze([x + radius, terrainDeltaMetres, z + radius] as const)
    }),
    areaSquareMetres: Math.PI * radius * radius,
    objectCount,
    terrainDeltaMetres
  });
}

function requireRealizedPlantCount(result: SeedWorldAuthoringResult, requestedPlantCount: number): number {
  const realizedPlantCount = readRealizedPlantCount(result);
  if (realizedPlantCount !== requestedPlantCount) {
    throw new Error(
      `Vegetation transaction realized ${realizedPlantCount} plants, expected exactly ${requestedPlantCount}`
    );
  }
  return realizedPlantCount;
}

function readRealizedPlantCount(result: SeedWorldAuthoringResult): number {
  const realizedPlantCount = Number(result.resolvedEffect?.realizedPlantCount);
  if (!Number.isInteger(realizedPlantCount) || realizedPlantCount < 0) {
    throw new Error("Vegetation transaction completed without a realizedPlantCount");
  }
  return realizedPlantCount;
}

function boundsEffect(bounds: SeedWorldBounds | undefined, objectCount: number): MutationEffect {
  const width = bounds ? Math.max(0, bounds.maximum[0] - bounds.minimum[0]) : 0;
  const depth = bounds ? Math.max(0, bounds.maximum[2] - bounds.minimum[2]) : 0;
  return Object.freeze({ bounds, areaSquareMetres: width * depth, objectCount, terrainDeltaMetres: 0 });
}

function unchangedAuthoringResult(worldRevision: number, reason: string): SeedWorldAuthoringResult {
  return Object.freeze({
    status: "unchanged" as const,
    transactionId: null,
    worldRevision,
    matchedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    deletedCount: 0,
    skippedCount: 0,
    createdRefs: Object.freeze([]),
    updatedRefs: Object.freeze([]),
    deletedRefs: Object.freeze([]),
    refsTruncated: false,
    affectedBounds: null,
    warnings: Object.freeze([reason]),
    resolvedEffect: null,
    reason
  });
}

function singleAssetMutationResult(
  result: Readonly<SeedWorldAuthoringResult>,
  action: "create" | "update"
): SeedWorldAssetMutationResult {
  if (result.status === "unchanged") {
    throw new Error(`Single-asset ${action} unexpectedly completed without a mutation`);
  }
  if (result.status === "preview") return Object.freeze({ ...result, assetRef: null });
  const assetRef = action === "create" ? result.createdRefs[0] : result.updatedRefs[0];
  if (!assetRef) {
    throw new Error(`Successful single-asset ${action} did not publish a current assetRef`);
  }
  return Object.freeze({
    ...result,
    assetRef
  });
}

function publicSelectionSummary(candidate: Readonly<Candidate>): Readonly<SeedWorldSelectionSummary> {
  return Object.freeze({
    type: candidate.ref.kind as SeedWorldSelectionSummary["type"],
    ref: candidate.ref,
    ...(candidate.viewerRelation ? {viewerRelation:candidate.viewerRelation} : {}),
    ...(candidate.position ? { position: Object.freeze([...candidate.position] as [number, number, number]) } : {}),
    ...(candidate.bounds ? { bounds: freezeClone(candidate.bounds) } : {}),
    ...(candidate.tags ? { tags: Object.freeze([...candidate.tags]) } : {}),
    ...(candidate.relations ? { relations: freezeClone(candidate.relations) } : {})
  });
}

function publicQueriedAsset(candidate: Readonly<Candidate>): Readonly<SeedWorldQueriedAsset> {
  return Object.freeze({
    ...publicSelectionSummary(candidate),
    ...(candidate.distanceMetres !== undefined ? { distanceMetres: candidate.distanceMetres } : {})
  });
}

function transportBoundedSelectionPage(
  input: Readonly<{
    candidates: readonly Candidate[];
    offset: number;
    limit: number;
    selectionId: string;
    matchedCount: number;
  }>
): Readonly<{
  items: readonly Readonly<SeedWorldQueriedAsset>[];
  limitedByBytes: boolean;
}> {
  const items: Readonly<SeedWorldQueriedAsset>[] = [];
  const requestedEnd = Math.min(input.offset + input.limit, input.matchedCount);
  let limitedByBytes = false;
  for (let index = input.offset; index < requestedEnd; index += 1) {
    const next = publicQueriedAsset(input.candidates[index]!);
    const candidateItems = [...items, next];
    const candidateResult = {
      selectionId: input.selectionId,
      matchedCount: input.matchedCount,
      offset: input.offset,
      ...(index + 1 < input.matchedCount ? { nextOffset: index + 1 } : {}),
      items: candidateItems,
      resolvedBounds: mergeBounds(candidateItems.map(({ bounds }) => bounds).filter(isDefined))
    };
    if (jsonByteLength(candidateResult) > MAX_WORLD_QUERY_RESULT_BYTES) {
      if (items.length === 0) {
        throw new Error(
          `WorldAsset '${next.ref.id}' exceeds the ${MAX_WORLD_QUERY_RESULT_BYTES}-byte query page budget`
        );
      }
      limitedByBytes = true;
      break;
    }
    items.push(next);
  }
  return Object.freeze({
    items: Object.freeze(items),
    limitedByBytes
  });
}

function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function publicAssetDetail(candidate: Readonly<Candidate>): Readonly<SeedWorldSelectionItem> {
  const { assetKind: _internalAssetKind, ...publicProperties } = candidate.properties;
  return Object.freeze({
    ...publicSelectionSummary(candidate),
    properties: freezeClone(publicProperties)
  });
}

function matchesSelectorIdentity(candidate: Candidate, selector: Readonly<SeedWorldSelector>): boolean {
  if (selector.ids && !selector.ids.includes(candidate.ref.id)) return false;
  if (selector.domains && !selector.domains.includes(candidate.ref.domain)) return false;
  if (selector.kinds && !selector.kinds.includes(candidate.ref.kind)) return false;
  if (selector.sources && !selector.sources.includes(candidate.ref.source)) return false;
  return true;
}


function isAddressableObjectRef(ref: Readonly<SeedWorldRef>): boolean {
  return ref.domain === "object" || (ref.domain === "vegetation" && (ref.kind === "tree" || ref.kind === "shrub"));
}

function isRemovableObjectKind(kind: SeedWorldObjectKind): kind is SeedWorldRemovableObjectKind {
  return ALL_OBJECT_KINDS.some((candidate) => candidate === kind);
}

function objectKindDomain(kind: string): SeedWorldAssetDomain {
  return kind === "tree" || kind === "shrub" ? "vegetation" : "object";
}

function vegetationPublicAssetKind(
  plant: SeedWorldPlantKind,
  distribution: "single" | "area"
): "tree" | "forest" | "shrub" | "shrubland" | "grassland" | "flower-field" | "aquatic-grass-bed" {
  switch (plant) {
    case "tree":
      return distribution === "single" ? "tree" : "forest";
    case "shrub":
      return distribution === "single" ? "shrub" : "shrubland";
    case "grass":
      return "grassland";
    case "flower":
      return "flower-field";
    case "aquatic-grass":
      return "aquatic-grass-bed";
  }
}

function spatialSearchOrder(
  sort: "highest" | "lowest" | "flattest" | "steepest" | "wettest" | "driest" | "nearest"
): Readonly<{ field: SeedWorldPointOrderField; direction: "asc" | "desc" }> {
  switch (sort) {
    case "highest":
      return { field: "elevation", direction: "desc" };
    case "lowest":
      return { field: "elevation", direction: "asc" };
    case "flattest":
      return { field: "slope", direction: "asc" };
    case "steepest":
      return { field: "slope", direction: "desc" };
    case "wettest":
      return { field: "moisture", direction: "desc" };
    case "driest":
      return { field: "moisture", direction: "asc" };
    case "nearest":
      return { field: "distance", direction: "asc" };
  }
}

function matchesFilter(
  candidate: Candidate,
  filter: Readonly<{ field: string; operator: "eq" | "in" | "gt" | "lt" | "contains"; value: unknown }>
): boolean {
  const actual = readPath(
    {
      ref: candidate.ref,
      position: candidate.position,
      tags: candidate.tags,
      relations: candidate.relations,
      properties: candidate.properties,
      ...candidate.properties
    },
    filter.field
  );
  switch (filter.operator) {
    case "eq":
      return actual === filter.value;
    case "in":
      return Array.isArray(filter.value) && filter.value.includes(actual);
    case "gt":
      return typeof actual === "number" && typeof filter.value === "number" && actual > filter.value;
    case "lt":
      return typeof actual === "number" && typeof filter.value === "number" && actual < filter.value;
    case "contains":
      return Array.isArray(actual)
        ? actual.includes(filter.value)
        : typeof actual === "string" && typeof filter.value === "string" && actual.includes(filter.value);
  }
}

function spatialMetrics(
  anchor: Readonly<{ position: readonly [number, number, number]; forward: readonly [number, number, number] }>,
  position: readonly [number, number, number]
): Readonly<{ distance: number; viewAngle: number; signedForward: number; signedRight: number }> {
  const dx = position[0] - anchor.position[0];
  const dz = position[2] - anchor.position[2];
  const distance = Math.hypot(dx, dz);
  const forward = normalizeHorizontal(anchor.forward);
  const right = [-forward[1], forward[0]] as const;
  const signedForward = dx * forward[0] + dz * forward[1];
  const signedRight = dx * right[0] + dz * right[1];
  const viewAngle = distance <= 1e-6 ? 0 : (Math.acos(clamp(signedForward / distance, -1, 1)) * 180) / Math.PI;
  return Object.freeze({ distance, viewAngle, signedForward, signedRight });
}

function matchesSpatialRelation(
  spatial: NonNullable<SeedWorldSelector["spatial"]>,
  metrics: ReturnType<typeof spatialMetrics> | undefined,
  anchorBounds?: Readonly<SeedWorldBounds>,
  candidateBounds?: Readonly<SeedWorldBounds>
): boolean {
  if (spatial.relation === "inside") {
    if (!anchorBounds || !candidateBounds || !boundsContain(anchorBounds, candidateBounds)) return false;
    if (!metrics) return spatial.minDistanceMetres === undefined && spatial.maxDistanceMetres === undefined;
  } else if (!metrics) {
    return false;
  }
  if (!metrics) return true;
  if (spatial.minDistanceMetres !== undefined && metrics.distance < spatial.minDistanceMetres) return false;
  if (spatial.maxDistanceMetres !== undefined && metrics.distance > spatial.maxDistanceMetres) return false;
  const angle = spatial.maxViewAngleDegrees ?? 45;
  switch (spatial.relation) {
    case "at":
      return metrics.distance <= (spatial.maxDistanceMetres ?? 1);
    case "near":
    case "around":
      return true;
    case "inside":
      return true;
    case "in-front-of":
      return metrics.signedForward >= 0 && metrics.viewAngle <= angle;
    case "behind":
      return metrics.signedForward < 0;
    case "left":
      return metrics.signedRight < 0;
    case "right":
      return metrics.signedRight > 0;
  }
}

function matchesCandidateRelation(
  candidate: Candidate,
  target: Candidate,
  relation: "near" | "inside" | "intersects" | "connected-to",
  maxDistanceMetres = 5
): boolean {
  if (relation === "connected-to") {
    return candidate.relations?.connectedTo?.some(({ id }) => id === target.ref.id) ?? false;
  }
  if (relation === "intersects") {
    return Boolean(candidate.bounds && target.bounds && boundsIntersect(candidate.bounds, target.bounds));
  }
  if (relation === "inside") {
    return Boolean(candidate.bounds && target.bounds && boundsContain(target.bounds, candidate.bounds));
  }
  if (!candidate.position || !target.position) return false;
  return horizontalDistance(candidate.position, target.position) <= maxDistanceMetres;
}

function compareCandidates(left: Candidate, right: Candidate, sort: SeedWorldSelector["sort"]): number {
  switch (sort) {
    case "nearest":
      return (left.distanceMetres ?? Number.POSITIVE_INFINITY) - (right.distanceMetres ?? Number.POSITIVE_INFINITY);
    case "farthest":
      return (right.distanceMetres ?? 0) - (left.distanceMetres ?? 0);
    case "largest":
      return (right.areaSquareMetres ?? 0) - (left.areaSquareMetres ?? 0);
    case "highest":
      return (right.position?.[1] ?? -Infinity) - (left.position?.[1] ?? -Infinity);
    case "lowest":
      return (left.position?.[1] ?? Infinity) - (right.position?.[1] ?? Infinity);
    default:
      return left.ref.id.localeCompare(right.ref.id);
  }
}

function featureForward(item: Readonly<SeedWorldSelectionItem>): readonly [number, number, number] {
  const heading = item.properties.headingDegrees;
  if (typeof heading === "number") {
    const radians = (heading * Math.PI) / 180;
    return Object.freeze([Math.sin(radians), 0, -Math.cos(radians)] as const);
  }
  const yaw = item.properties.yawRadians;
  if (typeof yaw === "number") return Object.freeze([Math.sin(yaw), 0, -Math.cos(yaw)] as const);
  return Object.freeze([0, 0, -1] as const);
}

function resolveSelectionItemOrigin(
  item: Readonly<SeedWorldSelectionItem>,
  origin: NonNullable<SeedWorldKernelSpatialTarget["origin"]>,
  viewerPosition: readonly [number, number, number]
): readonly [number, number, number] {
  if (!item.bounds || origin === "feet" || origin === "surface" || origin === "eyes") return item.position!;
  const { minimum, maximum } = item.bounds;
  if (origin === "bounds-nearest") {
    return Object.freeze([
      clamp(viewerPosition[0], minimum[0], maximum[0]),
      clamp(viewerPosition[1], minimum[1], maximum[1]),
      clamp(viewerPosition[2], minimum[2], maximum[2])
    ] as const);
  }
  return Object.freeze([
    (minimum[0] + maximum[0]) * 0.5,
    (minimum[1] + maximum[1]) * 0.5,
    (minimum[2] + maximum[2]) * 0.5
  ] as const);
}

function deleteMutation(resource: Readonly<SeedWorldAuthoringResource>): SeedWorldResourceMutation {
  const identity = {
    action: "delete" as const,
    resourceId: resource.resourceId,
    expectedContentHash: resource.contentHash
  };
  switch (resource.resourceType) {
    case "terrain-feature":
      return { ...identity, resourceType: "terrain-feature" };
    case "vegetation-brush":
      return { ...identity, resourceType: "vegetation-brush" };
    case "terrain-patch":
    case "object-removal":
      throw new Error(`Authoring resource '${resource.resourceId}' is not a deletable semantic asset`);
  }
}

function mergeBounds(bounds: readonly SeedWorldBounds[]): SeedWorldBounds | undefined {
  return bounds.reduce<SeedWorldBounds | undefined>((result, current) => unionBounds(result, current), undefined);
}

function unionBounds(
  left: SeedWorldBounds | undefined,
  right: SeedWorldBounds | undefined
): SeedWorldBounds | undefined {
  if (!left) return right;
  if (!right) return left;
  return Object.freeze({
    minimum: Object.freeze([
      Math.min(left.minimum[0], right.minimum[0]),
      Math.min(left.minimum[1], right.minimum[1]),
      Math.min(left.minimum[2], right.minimum[2])
    ] as const),
    maximum: Object.freeze([
      Math.max(left.maximum[0], right.maximum[0]),
      Math.max(left.maximum[1], right.maximum[1]),
      Math.max(left.maximum[2], right.maximum[2])
    ] as const)
  });
}

function boundsIntersect(left: SeedWorldBounds, right: SeedWorldBounds): boolean {
  return (
    left.minimum[0] <= right.maximum[0] &&
    left.maximum[0] >= right.minimum[0] &&
    left.minimum[2] <= right.maximum[2] &&
    left.maximum[2] >= right.minimum[2]
  );
}

function boundsContain(container: SeedWorldBounds, candidate: SeedWorldBounds): boolean {
  return (
    candidate.minimum[0] >= container.minimum[0] &&
    candidate.maximum[0] <= container.maximum[0] &&
    candidate.minimum[2] >= container.minimum[2] &&
    candidate.maximum[2] <= container.maximum[2]
  );
}

function stableWorldRefKey(ref: Readonly<SeedWorldRef>): string {
  return `${ref.domain}:${ref.id}`;
}

function missingAnchorRefError(ref: Readonly<SeedWorldRef>): Error {
  return new Error(
    `WorldRef '${ref.id}' no longer exists and cannot be used as a spatial anchor; ` +
      "to verify deletion, query with selector.ids instead of anchoring to the deleted Ref"
  );
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function freezeClone<T>(value: T): Readonly<T> {
  return Object.freeze(structuredClone(value));
}

function freezeJsonObject(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.freeze(JSON.parse(JSON.stringify(value)) as Record<string, unknown>);
}

function headingFromForward(forward: readonly [number, number, number]): number {
  const horizontalLength = Math.hypot(forward[0], forward[2]);
  if (horizontalLength < 1e-6) throw new Error("当前视角没有可用的水平方向，无法确定线性地景朝向");
  return normalizeHeadingDegrees((Math.atan2(forward[0], -forward[2]) * 180) / Math.PI);
}

function normalizeHorizontal(direction: readonly [number, number, number]): readonly [number, number] {
  const length = Math.hypot(direction[0], direction[2]);
  return length <= 1e-6 ? [0, -1] : [direction[0] / length, direction[2] / length];
}

function normalizeHeadingDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function horizontalDistance(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function vegetationRenderCategory(kind: SeedWorldVegetationCreateInput["plant"]): SeedWorldVegetationKind {
  return kind === "aquatic-grass" ? "water-grass" : kind;
}

function vegetationDefaultRadius(
  plant: SeedWorldVegetationCreateInput["plant"],
  distribution: SeedWorldVegetationCreateInput["distribution"]["kind"]
): number {
  if (distribution === "single") {
    switch (plant) {
      case "tree":
      case "shrub": {
        const profile = getSeedWorldAssetPlacementProfile(plant);
        const fieldScale = profile.roleScale.field;
        if (!fieldScale) throw new Error(`Vegetation placement profile '${plant}' has no field scale range`);
        // Resource bounds describe the edited plant; single placement does not search this radius.
        return Math.max(...profile.geometry.footprintMetres) * fieldScale.maximum;
      }
      case "grass":
      case "flower":
      case "aquatic-grass":
        return 0.5;
    }
  }
  switch (plant) {
    case "tree":
      return 55;
    case "shrub":
      return 25;
    case "grass":
      return 35;
    case "flower":
      return 25;
    case "aquatic-grass":
      return 20;
  }
}

function terrainFeatureDefaults(kind: SeedWorldGenericTerrainFeatureInput["kind"]): Readonly<{
  lengthMetres: number;
  widthMetres: number;
  magnitudeMetres: number;
  sharpness: number;
  asymmetry: number;
  roughness: number;
  erosion: number;
}> {
  switch (kind) {
    case "mountain":
      return {
        lengthMetres: 180,
        widthMetres: 160,
        magnitudeMetres: 90,
        sharpness: 0.72,
        asymmetry: 0.42,
        roughness: 0.48,
        erosion: 0.38
      };
    case "ridge":
      return {
        lengthMetres: 220,
        widthMetres: 70,
        magnitudeMetres: 55,
        sharpness: 0.62,
        asymmetry: 0.48,
        roughness: 0.45,
        erosion: 0.35
      };
    case "canyon":
      return {
        lengthMetres: 240,
        widthMetres: 65,
        magnitudeMetres: 42,
        sharpness: 0.78,
        asymmetry: 0.52,
        roughness: 0.42,
        erosion: 0.65
      };
    case "valley":
      return {
        lengthMetres: 260,
        widthMetres: 130,
        magnitudeMetres: 30,
        sharpness: 0.32,
        asymmetry: 0.45,
        roughness: 0.24,
        erosion: 0.5
      };
    case "slope":
      return {
        lengthMetres: 150,
        widthMetres: 120,
        magnitudeMetres: 38,
        sharpness: 0.35,
        asymmetry: 0.15,
        roughness: 0.18,
        erosion: 0.22
      };
    case "plateau":
      return {
        lengthMetres: 150,
        widthMetres: 150,
        magnitudeMetres: 45,
        sharpness: 0.75,
        asymmetry: 0.28,
        roughness: 0.28,
        erosion: 0.32
      };
    case "basin":
      return {
        lengthMetres: 140,
        widthMetres: 160,
        magnitudeMetres: 32,
        sharpness: 0.38,
        asymmetry: 0.4,
        roughness: 0.24,
        erosion: 0.3
      };
  }
}

function deriveSemanticFeatureSeed(rootSeed: number, kind: string, serial: number): number {
  let hash = (rootSeed ^ serial ^ 0x811c9dc5) >>> 0;
  for (let index = 0; index < kind.length; index++) {
    hash ^= kind.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function compactDefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

/** Snapshot named selections independently of the bounded transient query cache. */
function authoringMemory(memory: EditorMemory): AuthoringMemory {
  const selections = new Map(memory.selections);
  return { semanticSerial: memory.semanticSerial, tags: memory.tags,
    namedSelections: memory.namedSelections.map(([name, id]) => {
      const selection = selections.get(id);
      if (!selection) throw new Error(`Saved selection '${name}' has no selection record`);
      return [name, { id, selection }];
    }) };
}

function restoreAuthoringMemory(memory: AuthoringMemory): EditorMemory {
  return { semanticSerial: memory.semanticSerial, selectionSerial: 0, tags: memory.tags,
    namedSelections: memory.namedSelections.map(([name, value]) => [name, value.id]),
    selections: memory.namedSelections.map(([, value]) => [value.id, value.selection]),
    lastCreatedRefs: [], lastSelectedRefs: [] };
}
