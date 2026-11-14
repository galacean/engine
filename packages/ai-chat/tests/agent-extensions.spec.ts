import { createTestAgentLoop } from "./AIChatTestRuntime";
import { describe, expect, it, vi } from "vitest";
import { composeAgentConfiguration, type AgentEditorExtension } from "../src/ai-chat/agent-extensions";
import type { AgentConfiguration } from "../src/ai-chat/agent-types";

function extension(type: string): AgentEditorExtension {
  const query = `${type}.query`, read = `${type}.read`;
  return {
    definition: {
      toolNames: [query, read],
      editorComponents: [{ type, queryTool: query, identityFields: ["id"], methods: { read } }],
      scriptApi: {
        catalog: type,
        documents: [{path: `${type}/README.md`, content: `${type} guide`}],
        entries: [{name: "editor.component.query", description: type, moduleId: `${type}/api.d.ts`}],
        modules: [{id: `${type}/api.d.ts`, source: "export {};", imports: [], toolNames: [query, read]}]
      }
    },
    tools: [query, read].map(name => ({name, effect: "read", parseInput: value => value,
      execute: () => [], parseOutput: value => value}))
  };
}
const base = (): AgentConfiguration => ({definition: {
  toolNames: [], scriptApi: {catalog: "Editor", documents: [], entries: [], modules: []},
  beginEdit: vi.fn(), captureSnapshot: vi.fn()
}, tools: []});

describe("preset editor extension composition", () => {
  it("preserves host transactions while exposing every system's tools, knowledge and declarations", () => {
    const host = base(), first = extension("First"), second = extension("Second");
    const result = composeAgentConfiguration(host, [first, second]);
    expect(result.definition.beginEdit).toBe(host.definition.beginEdit);
    expect(result.definition.captureSnapshot).toBe(host.definition.captureSnapshot);
    expect(result.definition.toolNames).toEqual(result.tools.map(tool => tool.name));
    expect(result.definition.editorComponents?.map(item => item.type)).toEqual(["First", "Second"]);
    expect(result.definition.scriptApi.documents?.map(item => item.path)).toEqual(["First/README.md", "Second/README.md"]);
    expect(result.definition.scriptApi.entries).toHaveLength(2);
    expect(() => createTestAgentLoop(result)).not.toThrow();
    expect(result.definition.scriptApi.modules).toHaveLength(2);
    expect(host.definition.toolNames).toEqual([]);
    expect(first.definition.toolNames).toEqual(["First.query", "First.read"]);
  });
  it.each(["tool", "component", "document", "module"])("rejects ambiguous %s registrations before execution", kind => {
    const first = extension("First"), second = extension("Second");
    if (kind === "tool") second.tools[0].name = first.tools[0].name;
    if (kind === "component") second.definition.editorComponents = first.definition.editorComponents;
    if (kind === "document") second.definition.scriptApi.documents = first.definition.scriptApi.documents;
    if (kind === "module") second.definition.scriptApi.modules = first.definition.scriptApi.modules;
    expect(() => composeAgentConfiguration(base(), [first, second])).toThrow("Duplicate");
  });
  it("rejects unavailable tools and proxy methods outside the exposed capability set", () => {
    const item = extension("First");
    expect(() => composeAgentConfiguration(base(), [{...item, tools: []}])).toThrow("Unregistered");
    item.definition.toolNames = ["First.query"];
    expect(() => composeAgentConfiguration(base(), [item])).toThrow("unexposed");
  });
});


it("rejects a callable tool occupying another extension's namespace", () => {
  const first = extension("First"), second = extension("Second");
  second.tools[0].name = "First.read.child";
  second.definition.toolNames = ["First.read.child", "Second.read"];
  expect(() => composeAgentConfiguration(base(), [first, second])).toThrow("namespace conflicts");
});


it("rejects duplicate symbols within one declaration module while permitting cross-module overloads", () => {
  const item=extension("First");
  item.definition.scriptApi.entries=[...item.definition.scriptApi.entries,...item.definition.scriptApi.entries];
  const configuration=composeAgentConfiguration(base(),[item]);
  expect(()=>createTestAgentLoop(configuration)).toThrow("Duplicate or empty Agent API entry");
});
