import schema from "../runtime-editor/generated/editor-source-schema.d.ts?raw";
import { parseAgentSkill } from "@galacean/engine-ai-chat/ai-chat/agent-skills";
import type { AgentScriptApiCatalog } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { NATIVE_SCENE_API_DECLARATION } from "./runtime-scene-api.generated";
import { nativeToolNames } from "./runtime-native-tools";

const declaration =
  `import "./source";
export {};
declare global {
  namespace editor {
    const asset: AgentTools.NativeAssetApi;
    const history: AgentTools.NativeHistoryApi;
  }
  namespace AgentTools {
    type NativeAssetType = "Scene" | "Prefab" | "Material" | "PrimitiveMesh" | "script" | (string & {});
    interface NativeAsset { path: string; type: string; params?: Record<string, unknown>; }
    interface NativeHistoryEntry {
      transactionId: string;
      paths: string[];
      runtime: "pending" | "applied" | "failed";
      runtimeErrors: string[];
    }
    interface NativeHistoryApi {
      /** A bounded page of current session author-asset history, next actionable entry first. Default direction is undo; limit is 1–100, default 50. Each committed execute has its own ID; no automatic task grouping. Runtime gameplay is not recorded. */
      query(input: {direction?: "undo" | "redo"; limit?: number; cursor?: string}): Promise<{
        items: {transactionId: string; paths: string[]; pathCount: number; pathsTruncated: boolean; runtime: "pending" | "applied" | "failed"; errorCount: number}[];
        total: number; revision: string; nextCursor: string | null;
      }>;
      /** Complete affected paths and activation diagnostics for one transaction. */
      read(input: {transactionId: string}): Promise<NativeHistoryEntry>;
      /** Restore the contiguous next undo entries, in the order returned by query. Whole batch validates and publishes once. Cannot skip newer entries. Must be the only editing operation in execute. Read queries are allowed. Runtime errors do not revert accepted authoring. */
      undo(input: {transactionIds: string[]}): Promise<{transactionIds: string[]; status: "prepared-in-draft"}>;
      /** Reapply the contiguous next redo entries. New author edits clear redo. Same standalone execute and ordering rules as undo. */
      redo(input: {transactionIds: string[]}): Promise<{transactionIds: string[]; status: "prepared-in-draft"}>;
    }
    interface NativeAssetApi {
      /** Import a file or ordinary folder from a host source. With Retrieval enabled, source accepts /oss/ plus a returned assetPaths entry, or its asset directory; the host resolves CDN files on demand. File types come from .meta or known extensions; optional type is for a single file only. GLB must embed buffers/images; textures accept PNG/JPEG. Folders include documents, metadata and empty directories. Serialized relative references are relative to their file; Missing dependencies reject. PATH_ALREADY_EXISTS reports path/existingPath/existingKind; choose another target path and retry. Nothing is overwritten or partially published.  */
      import(input: { source: string; path: string; type?: string }): Promise<{ path: string }>;
      /** Lists project virtual paths and types. */
      list(input: {}): Promise<NativeAsset[]>;
      /** Metadata only; does not download the asset. Empty summary/usage means no authored explanation. */
      info(input: { path: string }): Promise<NativeAsset & {name: string; summary: string; usage: string}>;
      /** Type-specific inspection. Models return static model-local bounds (not world instances); boundsComplete=false means missing bounds or deformation. Unsupported encodings reject explicitly. */
      read(input: { path: string }): Promise<NativeAsset & (
        {kind: "text"; content: string} | {kind: "structured"; data: unknown} |
        {kind: "image"; format: string; width: number; height: number} |
        {kind: "model"; scenes: unknown[]; nodes: unknown[]; meshes: unknown[]; materials: unknown[]; bounds: {min: number[]; max: number[]} | null; boundsComplete: boolean}
      )>;
      /** Path is canonical, e.g. Scripts/Rotate.ts. skills/, declare/, .ai/, remote/ and project.json are read-only. Type must be a registered asset format; extension-specific types and their content are documented by the owning system. Unknown types reject.  */
      create(input: { path: string; type: NativeAssetType; content: string }): Promise<{ path: string }>;
      /** Replaces the entire text asset while retaining identity. */
      update(input: { path: string; content: string }): Promise<{ updated: true }>;
      /** Query incoming authoring references before deletion; returns caller virtual paths, including statically resolved Script imports and assetUrl calls. Supports registered asset formats, including PNG/GLB, independently of content editing. Rejects when a potential caller cannot be inspected; computed runtime lookups are not discoverable. */
      references(input: { path: string }): Promise<{ references: string[] }>;
      /** First call references and inspect its callers; unlink or replace their references before deleting. A live system owner must also be released by completing the component removal before deleting its asset in a separate execute. Supports binary assets such as PNG/GLB. Rechecks current references and rejects with caller paths if still used, even if an earlier query was empty. An empty result does not permit deleting registered Scenes or runtime-owned assets.  Removes the asset and its .meta in the project transaction. */
      delete(input: { path: string }): Promise<{ updated: true }>;
    }

  }
}` +
  "\n" +
  NATIVE_SCENE_API_DECLARATION;

/** The published Engine skill stays in English for package users; only its routing line is localized here. */
const engineKnowledgeSources = import.meta.glob("../../../galacean/skills/engine-knowledge/**/*.md", {
  eager: true,
  as: "raw"
}) as Record<string, string>;
const engineKnowledgeRoot = "../../../galacean/skills/engine-knowledge/";
const engineKnowledgeSkill = parseAgentSkill(
  engineKnowledgeSources[engineKnowledgeRoot + "SKILL.md"].replace(
    /^description: .*$/m,
    "description: 编写 Script 时，需要了解坐标、生命周期、物理与碰撞、网格、资源所有权、渲染、Spine 或 XR 的运行时行为时使用。"
  )
);
const engineKnowledgeDocuments = Object.entries(engineKnowledgeSources)
  .filter(([path]) => path !== engineKnowledgeRoot + "SKILL.md")
  .map(([path, content]) => ({ path: `skills/engine-knowledge/${path.slice(engineKnowledgeRoot.length)}`, content }));

const skillSources = import.meta.glob("../skills/**/*.md", { eager: true, as: "raw" }) as Record<string, string>;
const topLevelSkill = /^\.\.\/skills\/[^/]+\/SKILL\.md$/;
const nativeSkills = Object.entries(skillSources)
  .filter(([path]) => topLevelSkill.test(path))
  .map(([, content]) => parseAgentSkill(content));
const nativeSkillDocuments = Object.entries(skillSources)
  .filter(([path]) => !topLevelSkill.test(path))
  .map(([path, content]) => {
    if (path.endsWith("/SKILL.md")) parseAgentSkill(content);
    return { path: path.slice("../".length), content };
  });

/** Added only when native tools are available; source declarations are copied from the pinned Editor. */
export function withNativeEditingKnowledge(catalog: AgentScriptApiCatalog): AgentScriptApiCatalog {
  const toolNames = nativeToolNames;
  return {
    ...catalog,
    skills: [...(catalog.skills ?? []), ...nativeSkills, engineKnowledgeSkill],
    documents: [...(catalog.documents ?? []), ...nativeSkillDocuments, ...engineKnowledgeDocuments],
    entries: [
      ...catalog.entries,
      ...toolNames.map((name) => ({
        name: `editor.${name}`,
        description:
          name === "history.query"
            ? "Page author transactions by direction; read full details by transaction ID"
            : name === "history.undo"
              ? "Undo an ordered batch of committed asset transactions"
              : name === "history.redo"
                ? "Redo an ordered batch of undone asset transactions"
                : "Native project editing",
        moduleId: "declare/native/api.d.ts"
      }))
    ],
    modules: [
      ...catalog.modules,
      { id: "declare/native/source.d.ts", source: schema, imports: [] },
      { id: "declare/native/api.d.ts", source: declaration, imports: ["declare/native/source.d.ts"], toolNames }
    ]
  };
}
