import primitiveMeshKnowledge from "./primitive-mesh.md?raw";
import schema from "../runtime-editor/generated/editor-source-schema.d.ts?raw";
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
      /** Import a file or ordinary folder from a mounted source. File types come from .meta or known extensions; optional type is for a single file only. GLB must embed buffers/images; textures accept PNG/JPEG. Folders include documents, metadata and empty directories. Serialized relative references are relative to their file; Missing dependencies reject. PATH_ALREADY_EXISTS reports path/existingPath/existingKind; choose another target path and retry. Nothing is overwritten or partially published.  */
      import(input: { source: string; path: string; type?: string }): Promise<{ path: string }>;
      /** Lists project virtual paths and types. */
      list(input: {}): Promise<NativeAsset[]>;
      /** Reads text by virtual path. Binary reads reject. */
      read(input: { path: string }): Promise<{ content: string }>;
      /** Path is canonical, e.g. Scripts/Rotate.ts. Type must be a registered asset format; extension-specific types and their content are documented by the owning system. Unknown types reject.  */
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

const knowledge = `# Native editing

Undo and redo are editor.history operations across all author assets, including Scene, Prefab, Material and configured world settings. For a request to undo an earlier edit, query editor.history.query and use transaction IDs; writing guessed old values is a new edit, not undo. One execute is one transaction. Query {direction:"undo"|"redo",limit?,cursor?}; the bounded result is {items,total,revision,nextCursor}. Default direction is undo. Follow nextCursor with the same direction; changed results reject stale cursors. Choose a contiguous prefix of items in its listed order. history.read({transactionId}) returns complete paths and runtime errors. Submit the entire chosen batch once, in an execute containing no other edits. No task grouping or automatic rollback occurs. Query summaries include up to three shortened paths, pathCount, pathsTruncated, runtime and errorCount. History is session-scoped; saved author assets survive reopening, the undo stack does not.


- [Editing APIs](../../declare/native/api.d.ts): editor.asset, editor.entity and editor.component operations in execute.
- [Scene/Prefab source schema](../../declare/native/source.d.ts): reused from Editor v2; path-based asset references, stable entity/component IDs and serialized values.
- [Runtime development](../runtime/README.md): Engine declarations for Script assets and native component properties.


## Project files and identity

Read project.json to find the active Scene and asset table. The read tool exposes project files at their exact virtualPath; binary files return descriptors. The glob tool finds paths; read sibling .meta files for summaries. Use the same virtualPath in glob/read, asset operations and {$ref: path}. Never add or strip an assets/ prefix.

This host provides preset components and ordinary Script assets.

All editing calls in one execute change its draft. Awaiting an edit does not apply it to the Engine. editor.component.read reads the draft's props; typed component methods observe the currently active runtime. To change enabled, transforms or asset bindings and verify the runtime effect, finish the execute, inspect its commit/activation receipt, then query the component again in the next execute. Setting enabled=false and then enabled=true in a single execute only commits the final value; it does not exercise a disable/enable cycle. Preparation first typechecks scripts, then builds ESM modules and validates references and hierarchies before saving. Script check/build failures return their diagnostics to the Agent and leave the saved project unchanged. Activation errors appear in the receipt after memory commit; they do not roll back accepted authoring. Background persistence is independent; a committed receipt does not mean IndexedDB has finished saving.

README, knowledge, .d.ts and .meta files are project documents, not Engine assets. Use the external write/edit tools to create/update their text and read to inspect committed content. Each mutation commits independently using a canonical project virtual path and participates in project save/undo.  Metadata is JSON with summary and usage strings; a folder or file must already exist. Updating an existing declaration changes the APIs available to subsequent Agent executions after commit.

## Components

All native editing uses editor.asset, editor.entity and editor.component; ordinary documents use external file tools. The application tools namespace is separate. editor.entity.list({scene,name?,parentId?,limit?,cursor?}) returns {items,total,revision,nextCursor}, a bounded page of entity summaries including linked Prefab members. name filters by case-sensitive substring and parentId:null selects roots. Follow nextCursor with unchanged filters; changed results reject stale cursors. Use editor.entity.read({scene,id}) for complete properties, children and component IDs. Expanded members are a read view, not a replacement Scene document. editor.component.query({scene, entityId?, id?, type?}) queries the current authoring draft, including earlier edits in this execute. editor.component.read returns authored properties. Querying a registered literal type also provides its typed live methods; editor.component.query({type}) without scene queries the active runtime. New components must be committed and activated before calling live methods. After removal, the same Scene-scoped query no longer returns that component. Names are discovery labels; scene/entityId/id/type identify a component. A typed system proxy resolves that identity again for every live call; never use an Engine instanceId or assume a deleted component still exists. Component properties use the Editor source schema: { $ref: virtualPath } for assets, { $entity: entityId } and { $component: componentId } for hierarchy references. Entity transforms are local coordinates; rotation is in degrees. entity.reparent({scene,id,parentEntityId,preserveWorld?}) moves Scene nodes or instance-local additions and preserves authored world pose by default; null means Scene root and preserveWorld:false keeps local pose. Moving a Scene subtree into an editable Prefab converts it to local additions with the same Source IDs. Moving inherited template nodes, cycles and unrepresentable transforms reject before mutation. entity.revert({scene,id,keys?}) restores inherited Entity properties; omitted keys revert all supported properties.

For a MeshRenderer, mesh references a mesh asset; material references a material asset and is compiled to setMaterial. To edit a Light, use its actual Engine declaration for property names, then component.update with the component ID and changed properties.

Create linked Prefab instances with entity.create({scene,name,prefab:virtualPath}). component.query/read include template members and local additions, even before Apply. Use the queried ID in component.update to write native instance overrides; use component.revert to restore inheritance. entity.create accepts a linked instance or member as parentEntityId and records a local added entity. entity.update records member properties as overrides; entity.delete records removal of inherited members or deletes local additions. component.add accepts editable instance members and local additions; component.remove removes inherited or locally added components. Inherited nested Prefab edits use native Scene-owned nested overrides and leave the shared template unchanged. Local additions may move to another editable instance or to the Scene. A locally added Prefab owns its own overrides and can be edited normally. Reparenting template-owned members is not exposed, matching Editor hierarchy restrictions. Arbitrary Engine Prefab.instantiate clones are not registered editor instances.

## Assets

Use the glob tool to discover existing project assets. If additional material is needed, list the application's mounted library, read candidate .meta usage instructions, then use editor.asset.import({source,path}) to copy a supported file or ordinary folder into the project. Serialized references inside an ordinary folder are resolved relative to each file and remapped to the destination. Import the complete dependency folder; missing dependencies reject. Folder destinations must be vacant, including empty folders; there is no merge or overwrite. Conflict errors include the occupied path; retry with a different destination. Source access is provided by the application; an unavailable library is an error, not proof that no matching material exists.


PrimitiveMesh and Material retain their Engine loader JSON formats. Read [PrimitiveMesh asset format](primitive-mesh.md) for all supported shapes and their exact serialized fields. Engine PrimitiveMesh method signatures describe runtime mesh creation, not this asset JSON. A cuboid mesh is:

    { "type": "cuboid", "cuboidWidth": 1, "cuboidHeight": 1, "cuboidDepth": 1 }

A solid-color Unlit material is (change r/g/b/a to choose the color):

    { "name": "Solid", "shader": "Unlit", "shaderData": { "material_BaseColor": { "type": "Color", "value": { "r": 1, "g": 1, "b": 1, "a": 1 } } }, "macros": [] }

The format is implemented by Engine MaterialLoader and [IMaterialSchema](../../declare/runtime/node_modules/@galacean/engine-loader/types/schema/MaterialSchema.d.ts). material_BaseColor is the property used by BaseMaterial/UnlitMaterial. MaterialLoader creates a generic Material; it does not run the UnlitMaterial constructor or supply its defaults. Include shaderData values you need and the macros array, even when empty. Shader names are case-sensitive; Unlit is registered by Engine, so it needs no shader asset or UnlitShader class. Material textures use shaderData entries with type "Texture" and value { "url": "<asset virtualPath>" }. Scene/Prefab assets use the linked Editor source schema.

For behavior, create a script asset containing a default-exported Script subclass, then add a Script component with script: { $ref: scriptVirtualPath }. Scripts use ESM imports from @galacean/engine or relative paths to other script assets. Top-level await is supported. Dynamic import targets must be string literals resolvable in the project. import.meta.url is the emitted module Blob URL, not a virtual asset path. Script lifecycle methods run in the game; execute runs in a Worker and only accesses its declared tools.

Updating Script code (or an imported module) recreates affected Script components with their saved properties; transient instance fields are reset. Unchanged modules and components keep their identity during unrelated edits. Moving a component, removing serialized properties or editing explicit setter calls also recreates that component to restore loader defaults. Component construction temporarily deactivates its owner Entity; activation resumes after properties and references are bound. After a partial projection failure, the next native edit or undo resynchronizes authored components and resets their transient state.

Before deleting an existing asset, call editor.asset.references with its exact virtual path. After successful deletion, use editor.asset.list to confirm absence; references requires an existing asset and rejects a deleted path. It returns incoming authoring references, including static Script imports and assetUrl calls. Inspect the returned caller paths and unlink or replace their references before calling asset.delete. Both operations support registered asset formats, including PNG/GLB; the ability to edit file contents is unrelated. asset.delete independently rechecks the current draft and rejects with caller paths while references remain. Unknown caller formats or unavailable reference data reject rather than treating the asset as unused. Declare candidate resources in component properties or JSON configuration assets using {$ref: virtualPath}; Scripts select from these references instead of constructing resource paths. Read editor/knowledge/runtime/configured-assets.md for both eager component references and lazy JSON candidates. The Editor maintains direct dependencies in project.json and queries their reverse index; missing dependency information is not an empty list. Even with no incoming references, registered Scenes and runtime-owned assets remain protected; release component ownership before deleting its assets. Successful deletion removes the asset table entry, content and .meta through the normal save/undo transaction.

A subresource reference protects its containing asset. For example, a material texture value {url: "Can.glb", key: "textures[0]"} references Can.glb; query Can.glb to find the material. asset.delete rejects while this external reference remains.
`;

/** Added only when native tools are available; source declarations are copied from the pinned Editor. */
export function withNativeEditingKnowledge(catalog: AgentScriptApiCatalog): AgentScriptApiCatalog {
  const toolNames = nativeToolNames;
  return {
    catalog: catalog.catalog + "- [Native editing](knowledge/native/README.md)\n",
    documents: [
      ...(catalog.documents ?? []),
      { path: "knowledge/native/README.md", content: knowledge },
      { path: "knowledge/native/primitive-mesh.md", content: primitiveMeshKnowledge }
    ],
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
