import type { RuntimeAssetSource } from "../project/runtime-asset-import";
import { RuntimeSceneInspection } from "../runtime-inspection/runtime-scene-inspection";
import {
  assertProjectPathWritable,
  ProjectPathReadOnlyError,
  type ProjectFileProvider
} from "@galacean/engine-project/project-files/virtual-project-files";
import type { Scene } from "@galacean/engine";
import type { AgentEditTransaction, AgentTool } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import {
  RuntimeEditor,
  type RuntimeEditorEdit,
  type RuntimeProjectContribution
} from "../runtime-editor/runtime-editor";
import type {
  RuntimeAssetFormat,
  RuntimeProjectUndoParticipant
} from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import type { RuntimeProjectSession } from "../project/runtime-project-session.ts";
import { nativeProjectTools, executeNativeProjectTool } from "./runtime-native-tools";

/** Agent adapter. The editor owns state; this class exposes its operations as Tools. */
export class RuntimeNativeEditor {
  /** Typed editor used by application integrations; Agent tools adapt this same owner. */
  readonly editor: RuntimeEditor;
  readonly scriptEnvironment: RuntimeProjectSession["scriptEnvironment"];
  /** The same mounted sources serve discovery and asset import; callers must not assemble a second list. */
  readonly projectFiles: readonly ProjectFileProvider[];
  readonly tools: AgentTool[];
  readonly inspection: RuntimeSceneInspection;
  constructor(
    private readonly project: RuntimeProjectSession,
    readonly scene: Scene,
    formats: ReadonlyMap<string, RuntimeAssetFormat> = new Map(),
    private readonly sources: readonly RuntimeAssetSource[] = []
  ) {
    this.editor = new RuntimeEditor(project, scene, formats);
    this.inspection = new RuntimeSceneInspection(scene, (object) => this.editor.projection.sourceIdentity(object));
    this.tools = nativeProjectTools(
      () => {
        throw new Error("Native tools require an execute transaction");
      },
      async () => {}
    );
    this.scriptEnvironment = project.scriptEnvironment;
    this.projectFiles = [project.fileProvider(), ...sources];
  }
  get projection() {
    return this.editor.projection;
  }
  runtimeDiagnostics() {
    return this.editor.runtimeDiagnostics();
  }
  beginEdit(
    id: string,
    signal: AbortSignal,
    contribute?: () => readonly RuntimeProjectContribution[]
  ): AgentEditTransaction &
    RuntimeProjectUndoParticipant &
    Pick<RuntimeEditorEdit, "activate" | "withAsset" | "history" | "moveHistory" | "run"> {
    const edit = this.editor.beginEdit(id, signal, contribute);
    // Tool construction is independent of draft materialization; each invocation gets its owned context.
    const tools = this.tools.map((tool) => ({
      ...tool,
      execute: (input: unknown) => {
        if (tool.name === "history.query")
          return this.project.history.page(input as Parameters<RuntimeProjectSession["history"]["page"]>[0]);
        if (tool.name === "history.read")
          return Promise.resolve(this.project.history.read((input as { transactionId: string }).transactionId));
        if (tool.name === "history.undo" || tool.name === "history.redo") {
          const transactionIds = (input as { transactionIds: string[] }).transactionIds;
          return edit
            .moveHistory({ direction: tool.name === "history.undo" ? "undo" : "redo", transactionIds })
            .then(() => ({ transactionIds, status: "prepared-in-draft" }));
        }
        return edit.run(
          (context) => {
            return executeNativeProjectTool(
              tool.name,
              input,
              context.draft,
              context.analyze,
              context.edited,
              context.signal,
              this.sources
            );
          },
          tool.name.startsWith("asset."),
          tool.name === "asset.read" || tool.name === "asset.update" ? [(input as { path: string }).path] : []
        );
      }
    }));
    const assertDocument = (path: string) => {
      assertProjectPathWritable(path);
      if (
        this.sources.some(
          (source) =>
            [...source.paths()].some(
              (candidate) => candidate === path || candidate.startsWith(path + "/") || path.startsWith(candidate + "/")
            ) || [...(source.directories?.() ?? [])].some((dir) => dir === path || path.startsWith(dir + "/"))
        )
      ) {
        throw new ProjectPathReadOnlyError(path);
      }
    };
    const documentOperation = <T>(
      path: string,
      operation: (context: Parameters<Parameters<typeof edit.run>[0]>[0]) => T
    ) => {
      assertDocument(path);
      return edit.run((context) => {
        if (context.draft.list().some((file) => file.virtualPath === path))
          throw new Error(`Registered asset '${path}'; use editor.asset instead`);
        return operation(context);
      }, true);
    };
    const documents: NonNullable<AgentEditTransaction["documents"]> = {
      read: (path) =>
        documentOperation(path, ({ draft }) => {
          if (draft.fileProvider().read(path) === undefined) return undefined;
          return draft.readDocument(path);
        }),
      write: (path, content) =>
        documentOperation(path, ({ draft, edited }) => {
          draft.writeDocument(path, content);
          edited();
        }),
      delete: (path) =>
        documentOperation(path, ({ draft, edited }) => {
          draft.deleteDocument(path);
          edited();
        })
    };
    return { ...edit, tools, documents };
  }
  dispose(): void {
    this.inspection.dispose();
    this.editor.dispose();
  }
}
