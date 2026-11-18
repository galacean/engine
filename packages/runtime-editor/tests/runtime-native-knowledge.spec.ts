import { expect, it, vi } from "vitest";
import { createAgentProjectFiles } from "@galacean/engine-ai-chat/ai-chat/agent-project-files.ts";
import { posix } from "node:path";
import { withNativeEditingKnowledge } from "../src/runtime-editor-agent/runtime-native-knowledge";
import { agentSkillFiles } from "@galacean/engine-ai-chat/ai-chat/agent-skills.ts";
import { assertAssetPath } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { engineRuntimeFiles } from "../src/runtime-editor-agent/engine-runtime-files";
import { AgentJavaScriptChecker } from "@galacean/engine-ai-chat/ai-chat/agent-script-checker.ts";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
import { FARMING_SYSTEM_EDITOR_DECLARATION } from "@galacean/engine-farming/farming/native/FarmingAPIDeclarations.ts";
import { composeAgentConfiguration } from "@galacean/engine-ai-chat/ai-chat/agent-extensions.ts";
import { createRetrievalAgentExtension } from "../src/retrieval-agent";

it("resolves native knowledge links and declaration imports in the unified project", () => {
  const catalog = withNativeEditingKnowledge({ hostNotes: "# Native", entries: [], modules: [{ id: "declare/tools.d.ts", source: "declare const tools: Readonly<Record<never, never>>;", imports: [] }] });
  const paths = new Set(createAgentProjectFiles(catalog, [engineRuntimeFiles({externals:{"@galacean/editor-assets":{},zod:{}},declarations:{}})]).list());
  for (const document of catalog.documents!.filter(doc => doc.path.endsWith(".md"))) {
    for (const match of document.content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      expect(paths.has(target) || paths.has(posix.normalize(posix.join(posix.dirname(document.path), target))), `${document.path} -> ${target}`).toBe(true);
    }
  }
  for (const module of catalog.modules) for (const dependency of module.imports) expect(paths.has("declare/editor/" + dependency.replace(/^declare\//, "")), dependency).toBe(true);
});

it("checks native edit calls and rejects a wrong argument before execution", () => {
  const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
  const catalog = withNativeEditingKnowledge({ hostNotes: "# Native", entries: [], modules: [{ id: "declare/tools.d.ts", source: "declare const tools: Readonly<Record<never, never>>;", imports: [] }] });
  try {
    expect(checker.check(`
      await editor.asset.import({ source: 'remote/Kit', path: 'Props/Kit' });
      const incoming = await editor.asset.references({ path: 'Props/Kit/Leaf.png' });
      if (incoming.references.length === 0) await editor.asset.delete({ path: 'Props/Kit/Leaf.png' });
      const mesh = await editor.asset.create({ path: 'Cube.mesh', type: 'PrimitiveMesh', content: '{}' });
      const entity = await editor.entity.create({ scene: 'scene', name: 'Cube', position: [1, 2, 3] });
      await editor.entity.create({scene: 'scene', name: 'Linked', prefab: 'Unit.prefab'});
      await editor.entity.reparent({scene:'scene', id:entity.id, parentEntityId:null, preserveWorld:true});
      await editor.entity.revert({scene:'scene', id:entity.id, keys:['position']});
      const refs = await editor.component.query({scene: "scene", type: "MeshRenderer"});
      if (refs.length) await editor.component.read({scene: refs[0].scene, id: refs[0].id});
      if (refs.length) await editor.component.revert({scene: refs[0].scene, id: refs[0].id, keys: ['enabled']});
      await editor.component.add({ scene: 'scene', entityId: entity.id, type: 'MeshRenderer', props: { mesh: { $ref: mesh.path } } });
      console.log("editor ready");
      return null;
    `, catalog.modules)).toBeUndefined();
    expect(checker.check(`
      await editor.entity.create({ scene: 'scene', name: 'Cube', position: 'wrong' });
    `, catalog.modules)?.code).toBe("SCRIPT_CHECK_FAILED");
    expect(checker.check(`
      await files.write({ path: 'README.md', content: 123 });
    `, catalog.modules)?.code).toBe("SCRIPT_CHECK_FAILED");
  } finally { checker.dispose(); }
});

it("keeps registered component methods typed alongside generic Scene queries", () => {
  const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
  const modules = withNativeEditingKnowledge({catalog:"", entries:[], modules:[]}).modules;
  const farming = {id:"declare/farming.d.ts", source:FARMING_SYSTEM_EDITOR_DECLARATION, imports:[]};
  try {
    for (const declarations of [[...modules, farming], [farming, ...modules]]) {
      expect(checker.check(`
        const [farm] = await editor.component.query({scene:"Main.scene",type:"FarmingSystem"});
        if (farm) await farm.list();
        const all = await editor.component.query({scene:"Main.scene"});
        for (const ref of all) await editor.component.read({scene:ref.scene,id:ref.id});
        return all;
      `, declarations)).toBeUndefined();
      expect(checker.check('const [farm]=await editor.component.query({type:"FarmingSystem"});await farm.list({wrong:true});', declarations)?.code).toBe("SCRIPT_CHECK_FAILED");
    }
  } finally {checker.dispose();}
});


it("does not advertise package creation or system authoring in the preset-only editor", () => {
  const catalog = withNativeEditingKnowledge({catalog:"",entries:[],modules:[]});
  expect(catalog.entries.some(entry=>entry.name.startsWith("editor.package."))).toBe(false);
  expect(catalog.documents!.some(doc=>doc.path.startsWith("knowledge/systems/"))).toBe(false);
  expect(catalog.modules.find(module=>module.id==="declare/native/api.d.ts")!.source).not.toContain("NativePackageApi");
  expect(JSON.stringify([...catalog.documents!, ...catalog.skills!])).not.toContain("package.create");
});


it("publishes the editor skill with matching metadata, readable links and protected paths", () => {
  const catalog = withNativeEditingKnowledge({hostNotes: "# Editor\n", entries: [], modules: []});
  const files = createAgentProjectFiles(catalog, [engineRuntimeFiles()]);
  const paths = new Set(files.list());
  for (const skill of catalog.skills!) {
    expect(skill.content).toContain(`name: ${skill.name}\n`);
    expect(skill.content).toContain(`description: ${skill.description}\n`);
  }
  for (const [path, content] of agentSkillFiles(catalog.skills!)) {
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const link = match[1].split("#")[0];
      const target = paths.has(link) ? link : posix.normalize(posix.join(posix.dirname(path), link));
      expect(paths.has(target), `${path} -> ${target}`).toBe(true);
      expect(files.read(path)).toContain(target);
    }
  }
  for (const path of ["skills", "skills.meta", "skills/a/SKILL.md", "skills/a.mesh"]) {
    expect(() => assertAssetPath(path)).toThrow();
  }
});

it.each([true, false])("publishes the cloud asset route only when retrieval is mounted (%s)", (mounted) => {
  const link = "skills/assets/search-cloud/SKILL.md";
  const scriptApi = withNativeEditingKnowledge({ hostNotes: "# Editor", entries: [], modules: [] });
  const retrieval = createRetrievalAgentExtension({ searchAssets: vi.fn(), readAssetDescriptions: vi.fn(), readText: vi.fn() });
  const { definition } = composeAgentConfiguration({ tools: [], definition: { toolNames: [], scriptApi } }, mounted ? [retrieval] : []);
  const files = createAgentProjectFiles(definition.scriptApi, [engineRuntimeFiles()]);
  expect(definition.nativeReadTools!.some(tool => tool.definition.function.name === "search_assets")).toBe(mounted);
  expect(definition.scriptApi.hostNotes!.includes(link)).toBe(mounted);
  expect(files.kind(link) === "file").toBe(mounted);
  // Only the host note may route to the document, so the generic guide stays valid without retrieval.
  for (const [path, content] of agentSkillFiles(scriptApi.skills!)) expect(content, path).not.toContain(link);
});
