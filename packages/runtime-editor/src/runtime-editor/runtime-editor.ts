import {
  RuntimePreparationViews,
  type RuntimePreparationContext,
  type RuntimePreparationOptions
} from "./runtime-preparation-context";
export type {
  RuntimePreparationContext,
  RuntimePreparationOptions,
  RuntimePreparationDependencies
} from "./runtime-preparation-context";
import { runtimeEditWork } from "./runtime-edit-work";
import {
  RuntimeProjectInputs,
  type RuntimeProjectInputScope
} from "@galacean/engine-project/runtime-editor/project/runtime-project-inputs";
import type { HistoryMove } from "../project/runtime-project-history.ts";
import { prepareAssetInputs, withPreparedAsset, type RuntimePreparedAsset } from "../project/runtime-prepared-asset.ts";
import { RuntimeResourceProjection } from "../project/runtime-resource-projection.ts";
import { Shader, type EngineObject, type Scene } from "@galacean/engine";
import type { EditTransaction } from "@galacean/engine-project/edit-transaction";
import { installRuntimeProjectScripts } from "./scripts/runtime-engine-scripts";
import { editableAssetTypes, nativeAssetFormats } from "../project/runtime-native-formats.ts";
import { compileProjectResourcesAsync } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler";
import {
  RuntimeProjectEdit,
  type RuntimeAssetFormat,
  type RuntimeSceneChangeSet,
  type RuntimeProjectUndo,
  type RuntimeProjectUndoParticipant
} from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import type { RuntimeProjectSession } from "../project/runtime-project-session.ts";
import type {
  RuntimeProjectManifest,
  RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeSceneProjection, type RuntimeScenePreparation } from "./scene/runtime-scene-projection";

export interface RuntimeActivationHooks {
  /** Authoring is committed; prepare dependent runtime state before Scene projection. */
  beforeProjection?(): void | Promise<void>;
  /** Scene inputs are installed; finish dependent projections before consumers settle. */
  afterProjection?(signal: AbortSignal): void | Promise<void>;
}

export interface RuntimeEditorEdit extends EditTransaction, RuntimeProjectUndoParticipant {
  history(): ReturnType<RuntimeProjectSession["history"]["query"]>;
  moveHistory(move: HistoryMove): Promise<void>;
  activate(signal: AbortSignal, hooks?: RuntimeActivationHooks): Promise<void>;
  withAsset<T extends EngineObject, R>(
    path: string,
    use: (asset: RuntimePreparedAsset<T>) => R | Promise<R>
  ): Promise<R>;
  run<T>(
    operation: (context: {
      draft: RuntimeProjectEdit;
      analyze(): Promise<void>;
      edited(): void;
      signal: AbortSignal;
    }) => T | Promise<T>,
    referencesOnly?: boolean,
    loadPaths?: readonly string[]
  ): Promise<T>;
}

export interface RuntimeProjectContribution {
  file: RuntimeProjectManifest["files"][number];
  content: string;
}

/** Authoring extensions edit the same detached draft before validation/commit.
 * History replay bypasses extensions: saved authoring must be restored exactly. */
export type RuntimeEditPreparation = (
  edit: Pick<RuntimeEditorEdit, "run" | "withAsset">,
  signal: AbortSignal,
  context?: RuntimePreparationContext
) => Promise<void>;

/** The host owns persistence and activation; Worker tools only edit detached project data. */
export class RuntimeEditor {
  readonly projection: RuntimeSceneProjection;
  private readonly preparations = new Map<
    RuntimeEditPreparation,
    RuntimeProjectInputScope | RuntimePreparationOptions | undefined
  >();
  private readonly resources = new RuntimeResourceProjection();
  private readonly lifetime = new AbortController();
  private readonly unregisterTextAssets: () => void;
  private readonly unregisterAssetFormats: () => void;
  private readonly unobserveAssetReads: () => void;

  constructor(
    private readonly project: RuntimeProjectSession,
    private readonly scene: Scene,
    private readonly hostFormats: ReadonlyMap<string, RuntimeAssetFormat> = new Map()
  ) {
    this.projection = new RuntimeSceneProjection(scene, project.projectPackage.project.scene, project.projectPackage);
    this.unregisterAssetFormats = project.registerAssetFormats(hostFormats);
    this.unregisterTextAssets = project.registerTextAssetTypes(
      [...hostFormats].filter(([, format]) => format.contentEncoding === "utf8").map(([type]) => type)
    );
    this.unobserveAssetReads = project.observeAssetReads((file, content) =>
      this.projection.recordAssetRead(file, content)
    );
  }

  /** A scoped preparation reacts to changes in its declared inputs. The host must
   * initialize the existing project before registration; final publication validation still runs.
   * Omit scope for extensions that must run on every authoring transaction. */
  registerPreparation(
    prepare: RuntimeEditPreparation,
    scope?: RuntimeProjectInputScope | RuntimePreparationOptions
  ): () => void {
    this.lifetime.signal.throwIfAborted();
    this.preparations.set(prepare, scope && structuredClone(scope));
    return () => {
      this.preparations.delete(prepare);
    };
  }

  runtimeDiagnostics() {
    return this.project.runtimeDiagnostics();
  }

  private async activateWorkingProject(
    signal: AbortSignal,
    hooks?: RuntimeActivationHooks,
    preparation?: RuntimeScenePreparation
  ): Promise<void> {
    const runtimeErrors: string[] = [];
    const checkpoint = runtimeEditWork();
    try {
      await this.project.activateRuntime(
        async () => {
          runtimeErrors.push(...(await installRuntimeProjectScripts(this.project, signal)));
          await checkpoint(signal);
          await this.resources.apply(this.scene.engine.resourceManager, await this.project.resources(signal), signal);
          await checkpoint(signal);
          await this.projection.apply(this.project.projectPackage, signal, preparation);
          await hooks?.afterProjection?.(signal);
        },
        signal,
        hooks?.beforeProjection
      );
    } catch (error) {
      runtimeErrors.push(error instanceof Error ? error.message : String(error));
    }
    if (runtimeErrors.length) throw new Error(runtimeErrors.join("\n"));
  }

  beginEdit(
    executionId: string,
    signal: AbortSignal,
    contribute?: () => readonly RuntimeProjectContribution[]
  ): RuntimeEditorEdit {
    const lifetime = new AbortController();
    const operationSignal = AbortSignal.any([signal, lifetime.signal, this.lifetime.signal]);
    let phase: "open" | "prepared" | "committing" | "committed" | "discarded" = "open";
    let draft: RuntimeProjectEdit | undefined;
    let preparationViews: RuntimePreparationViews | undefined;
    const preparationInputs = new Map<RuntimeEditPreparation, RuntimeProjectInputs>();
    let changed = false;
    let historyMove: HistoryMove | undefined;
    let userEdits = false;
    let restoring = false;
    let candidate: RuntimeProjectPackage | undefined;
    let scenePreparation: RuntimeScenePreparation | undefined;
    let sceneChanges: Record<string, RuntimeSceneChangeSet> = {};
    let committedUndo: RuntimeProjectUndo = [];
    let baseRevision = this.project.publicationRevision;
    let dependencies: Record<string, string[]> = {};
    let tail = Promise.resolve();
    const assertOpen = () => {
      operationSignal.throwIfAborted();
      if (phase !== "open") throw new Error(`Native edit is ${phase}`);
    };
    const ensureDraft = async (referencesOnly = false, loadPaths: readonly string[] = []) => {
      assertOpen();
      const provider = this.project.fileProvider();
      const draftPaths = draft && new Set(draft.list().map((file) => file.virtualPath));
      // Dependency queries use the complete manifest. Only explicit edits/reads load sources.
      for (const file of this.project.projectPackage.project.files) {
        if (draft && (!draftPaths!.has(file.virtualPath) || draft.hasContent(file.virtualPath))) continue;
        if (
          loadPaths.includes(file.virtualPath) ||
          (!referencesOnly && editableAssetTypes.includes(file.type as (typeof editableAssetTypes)[number]))
        ) {
          await provider.prepare?.(file.virtualPath, operationSignal);
        }
      }
      assertOpen();
      if (draft) {
        if (baseRevision !== this.project.publicationRevision)
          throw new Error("Stale runtime project draft; prepare the edit again");
        draft.provideContents(this.project.projectPackage.contents);
        return;
      }
      baseRevision = this.project.publicationRevision;
      for (const [prepare, scope] of this.preparations)
        if (scope && !("dependencies" in scope))
          preparationInputs.set(prepare, new RuntimeProjectInputs(this.project.projectPackage, scope));
      if (this.preparations.size) preparationViews = new RuntimePreparationViews(this.project.projectPackage);
      draft = new RuntimeProjectEdit(
        this.project.projectPackage,
        new Map([...nativeAssetFormats(() => dependencies), ...this.hostFormats]),
        this.project.dependencyMaintenance
      );
    };
    const sources = () =>
      Object.fromEntries(
        draft!
          .list()
          .filter((file) => file.type === "script")
          .map((file) => [file.virtualPath, draft!.read(file.virtualPath) as string])
      );
    const analyze = async () => {
      const reanalyze = draft!.needsScriptAnalysis();
      if (reanalyze) {
        await ensureDraft();
        dependencies =
          (await this.project.compileScripts(sources(), operationSignal, true, draft!.preview())).dependencies ?? {};
      }
      assertOpen();
      draft!.refreshDependencies(reanalyze);
    };
    const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
      const result = tail.then(operation);
      tail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    };
    const edit: RuntimeEditorEdit = {
      history: () => this.project.history.query(),
      moveHistory: (move) =>
        enqueue(async () => {
          if (changed || historyMove) throw new Error("History navigation must be the only edit in an execute");
          const revision = this.project.publicationRevision;
          const patch = await this.project.historyPatch(move, operationSignal);
          await ensureDraft();
          if (revision !== this.project.publicationRevision) throw new Error("History changed; query history again");
          draft!.restore(patch);
          historyMove = structuredClone(move);
          changed = true;
        }),
      withAsset: <T extends EngineObject, R>(path: string, use: (asset: RuntimePreparedAsset<T>) => R | Promise<R>) =>
        enqueue(async () => {
          await ensureDraft(true, [path]);
          const snapshot = draft!.preview();
          const formats = new Map([...nativeAssetFormats(() => dependencies), ...this.hostFormats]);
          const order = await prepareAssetInputs(
            snapshot,
            path,
            formats,
            async (dependency) => {
              await ensureDraft(true, [dependency]);
              return draft!.read(dependency);
            },
            operationSignal
          );
          const result = await withPreparedAsset(
            this.scene.engine.resourceManager,
            snapshot,
            path,
            order,
            operationSignal,
            use
          );
          assertOpen();
          if (baseRevision !== this.project.publicationRevision)
            throw new Error("Stale runtime project draft; prepare the edit again");
          return result;
        }),
      run: (operation, referencesOnly, loadPaths) => {
        const result = tail.then(async () => {
          if (historyMove)
            throw new Error("History navigation must be the only draft operation; use history.query for status");
          await ensureDraft(referencesOnly, loadPaths);
          return operation({
            draft: draft!,
            analyze,
            edited: () => {
              if (historyMove) throw new Error("Cannot combine history navigation and edits");
              changed = true;
              userEdits = true;
            },
            signal: operationSignal
          });
        });
        tail = result.then(
          () => undefined,
          () => undefined
        );
        return result;
      },
      hasChanges: () => changed,
      hasEdits: () => userEdits,
      captureUndo: () => {
        if (phase !== "committed") throw new Error("Undo is available only after the edit is committed");
        return structuredClone(committedUndo);
      },
      restoreUndo: async (patch) => {
        await ensureDraft();
        draft!.restore(patch);
        restoring ||= patch.length > 0;
        changed ||= patch.length > 0;
      },
      prepare: async (prepareSignal) => {
        await tail;
        assertOpen();
        prepareSignal.throwIfAborted();
        const checkpoint = runtimeEditWork();
        const preparationSignal = AbortSignal.any([operationSignal, prepareSignal]);
        const contributions = contribute?.() ?? [];
        if (contributions.length) {
          if (historyMove) throw new Error("Cannot combine history navigation and host edits");
          await ensureDraft(
            true,
            contributions.map(({ file }) => file.virtualPath)
          );
          for (const { file, content } of contributions) {
            const existing = draft!.list().find((asset) => asset.virtualPath === file.virtualPath);
            if (existing && existing.type !== file.type)
              throw new Error(`Host project file conflicts with asset '${file.virtualPath}'`);
            if (existing) draft!.update(file.virtualPath, content);
            else draft!.create(file, content);
          }
          changed = true;
        }
        if (changed && !historyMove && !restoring) {
          await checkpoint(preparationSignal);
          for (const [prepare, registration] of [...this.preparations]) {
            preparationSignal.throwIfAborted();
            // Recheck after every extension: an earlier preparation may edit these inputs.
            const inputs = preparationInputs.get(prepare);
            if (inputs && draft!.matchesInputs(inputs)) continue;
            const context = preparationViews?.current(draft!);
            if (
              registration &&
              "dependencies" in registration &&
              context &&
              !context.affected(registration.dependencies)
            )
              continue;
            await prepare(edit, preparationSignal, context);
            await checkpoint(preparationSignal);
            assertOpen();
          }
        }
        if (changed) {
          await ensureDraft();
          await checkpoint(preparationSignal);
          const scripts = sources();
          const compiled = await this.project.compileScripts(scripts, operationSignal, false, draft!.preview());
          dependencies = compiled.dependencies ?? {};
          draft!.refreshDependencies(true);
          await checkpoint(preparationSignal);
          assertOpen();
          const preview = draft!.preview();
          await compileProjectResourcesAsync(preview, () => checkpoint(preparationSignal));
          assertOpen();
          for (const file of preview.project.files) {
            if (file.type === "Material") {
              const material = JSON.parse(preview.contents[file.virtualPath] as string);
              if (!Shader.find(material.shader) && !material.shaderRef) {
                throw new Error(
                  `Material '${file.virtualPath}' references unregistered shader '${material.shader}' without a shaderRef`
                );
              }
            }
          }
          sceneChanges = draft!.sceneChangeSets();
          scenePreparation = this.projection.prepare(
            preview,
            draft!.changedAssetPaths(),
            sceneChanges[preview.project.scene]
          );
          await checkpoint(preparationSignal);
          prepareSignal.throwIfAborted();
          candidate = draft!.finish();
          preparationViews = undefined;
          preparationInputs.clear();
        }
        assertOpen();
        prepareSignal.throwIfAborted();
        if (candidate && baseRevision !== this.project.publicationRevision)
          throw new Error("Stale runtime project draft; prepare the edit again");
        phase = "prepared";
      },
      commit: async () => {
        operationSignal.throwIfAborted();
        if (phase !== "prepared") throw new Error(`Native edit is ${phase}`);
        phase = "committing";
        try {
          if (candidate)
            committedUndo = await this.project.publish(candidate, baseRevision, draft?.deletedAssetPaths(), {
              transactionId: executionId,
              move: historyMove,
              sceneChanges
            });
        } catch (error) {
          phase = "prepared";
          throw error;
        }
        phase = "committed";
        return { transactionId: executionId };
      },
      activate: async (activationSignal, hooks) => {
        if (phase !== "committed") throw new Error(`Native edit is ${phase}`);
        const ids = historyMove?.transactionIds ?? [executionId];
        try {
          await this.activateWorkingProject(activationSignal, hooks, scenePreparation);
          this.project.history.activated(ids, []);
        } catch (error) {
          this.project.history.activated(ids, [error instanceof Error ? error.message : String(error)]);
          throw error;
        }
      },
      discard: () => {
        preparationViews = undefined;
        preparationInputs.clear();
        // Cleanup never reverts committed authoring, including failed runtime activation.
        if (["committed", "committing"].includes(phase)) return;
        phase = "discarded";
        lifetime.abort();
        draft?.discard();
      }
    };
    return edit;
  }

  dispose(): void {
    this.lifetime.abort();
    this.preparations.clear();
    this.unobserveAssetReads();
    this.unregisterTextAssets();
    this.unregisterAssetFormats();
  }
}
