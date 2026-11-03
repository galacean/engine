import type { AgentApplicationDefinition, AgentConfiguration, AgentTool } from "./agent-types";

/** Capabilities contributed by a preset system. The application owns execution and persistence. */
export interface AgentEditorExtension {
  readonly definition: Pick<
    AgentApplicationDefinition,
    "toolNames" | "scriptApi" | "editorComponents" | "projectFiles"
  >;
  readonly tools: readonly AgentTool[];
}

/** Compose the same capability graph for the model, checker and Worker dispatcher. */
export function composeAgentConfiguration(
  base: AgentConfiguration,
  extensions: readonly AgentEditorExtension[]
): AgentConfiguration {
  const definitions = [base.definition, ...extensions.map((extension) => extension.definition)];
  const tools = [base.tools, ...extensions.map((extension) => extension.tools)].flat();
  const toolNames = definitions.flatMap((definition) => definition.toolNames);
  const components = definitions.flatMap((definition) => definition.editorComponents ?? []);
  const documents = definitions.flatMap((definition) => definition.scriptApi.documents ?? []);
  const modules = definitions.flatMap((definition) => definition.scriptApi.modules);
  unique(
    tools.map((tool) => tool.name),
    "tool"
  );
  unique(toolNames, "exposed tool");
  unique(
    components.map((component) => component.type),
    "component type"
  );
  unique(
    documents.map((document) => document.path),
    "knowledge path"
  );
  unique(
    modules.map((module) => module.id),
    "declaration module"
  );
  const registered = new Set(tools.map((tool) => tool.name));
  for (const name of registered) {
    const segments = name.split(".");
    for (let length = 1; length < segments.length; length++) {
      const parent = segments.slice(0, length).join(".");
      if (registered.has(parent)) throw new Error(`Tool namespace conflicts with callable tool: ${parent}`);
    }
  }
  const exposed = new Set(toolNames);
  for (const name of toolNames) {
    if (!registered.has(name)) throw new Error(`Unregistered extension tool: ${name}`);
  }
  for (const component of components) {
    for (const name of [component.queryTool, ...Object.values(component.methods)]) {
      if (!exposed.has(name)) throw new Error(`Component '${component.type}' uses unexposed tool: ${name}`);
    }
  }
  return {
    tools,
    definition: {
      ...base.definition,
      toolNames,
      editorComponents: components,
      projectFiles: definitions.flatMap((definition) => definition.projectFiles ?? []),
      scriptApi: {
        catalog: definitions
          .map((definition) => definition.scriptApi.catalog)
          .filter(Boolean)
          .join("\n\n"),
        documents,
        entries: definitions.flatMap((definition) => definition.scriptApi.entries),
        modules
      }
    }
  };
}

function unique(names: readonly string[], kind: string): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (!name || seen.has(name)) throw new Error(`Duplicate or empty ${kind}: ${name}`);
    seen.add(name);
  }
}
