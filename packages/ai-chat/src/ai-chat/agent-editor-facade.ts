import type { AgentValue } from "./agent-types";

/** Serializable binding supplied by the host, never by generated code. */
export interface AgentEditorComponentBinding {
  readonly type: string;
  /** Returns an array of identities. Component state is read explicitly through methods. */
  readonly queryTool: string;
  readonly identityFields: readonly string[];
  readonly methods: Readonly<Record<string, string>>;
}

type Invoke = (tool: string, input: AgentValue) => Promise<AgentValue>;
const reserved = new Set(["then", "__proto__", "prototype", "constructor"]);

/** The same async facade can use a local dispatcher or Worker RPC. It holds no Engine objects. */
export function createAgentEditorFacade(
  bindings: readonly AgentEditorComponentBinding[],
  invoke: Invoke,
  toolNames: readonly string[] = []
) {
  const types = new Map<string, AgentEditorComponentBinding>();
  for (const binding of bindings) {
    if (!binding.type || types.has(binding.type))
      throw new Error(`Duplicate or empty Editor component type: ${binding.type}`);
    const fields = new Set(binding.identityFields);
    if (!fields.size || fields.size !== binding.identityFields.length)
      throw new Error(`Invalid identity for ${binding.type}`);
    for (const name of [...fields, ...Object.keys(binding.methods)]) {
      if (reserved.has(name)) throw new Error(`Reserved Editor member: ${name}`);
    }
    for (const name of Object.keys(binding.methods)) {
      if (fields.has(name)) throw new Error(`Editor method shadows identity: ${name}`);
    }
    types.set(binding.type, structuredClone(binding));
  }
  const available = new Set(toolNames);
  const namespace = (prefix: string) =>
    Object.freeze(
      Object.fromEntries(
        toolNames
          .filter((name) => name.startsWith(prefix + ".") && /^[A-Za-z]+$/.test(name.slice(prefix.length + 1)))
          .map((name) => [name.slice(prefix.length + 1), (input: AgentValue) => invoke(name, input)])
      )
    );
  return Object.freeze({
    asset: namespace("asset"),
    history: namespace("history"),
    entity: namespace("entity"),
    package: namespace("package"),
    component: Object.freeze(
      Object.assign({}, namespace("component"), {
        async query(query: { type?: string; scene?: string; [key: string]: AgentValue | undefined }) {
          const selected = query.type === undefined ? undefined : types.get(query.type);
          // Scene-scoped queries observe the current authoring draft, including
          // earlier edits. Type-only queries use the host's live component lookup.
          const authored = query.scene !== undefined && available.has("component.query");
          if (!authored && !selected)
            throw new Error(`Unknown Editor component type: ${query.type}; supply scene to query authored components`);
          const input = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined)) as Record<
            string,
            AgentValue
          >;
          const identities = await invoke(authored ? "component.query" : selected!.queryTool, input);
          if (!Array.isArray(identities)) throw new Error("Invalid component query result");
          return identities.map((value) => {
            const identity = record(value, "component identity");
            const binding = authored
              ? typeof identity.type === "string"
                ? types.get(identity.type)
                : undefined
              : selected;
            if (!binding) return Object.freeze(Object.assign(Object.create(null), identity)) as Record<string, unknown>;
            if (Object.keys(identity).length !== binding.identityFields.length)
              throw new Error("Component queries must return identities only");
            const receiver = Object.create(null) as Record<string, unknown>;
            const bound: Record<string, AgentValue> = Object.create(null);
            for (const field of binding.identityFields) {
              if (typeof identity[field] !== "string" || !identity[field])
                throw new Error(`Invalid component identity field: ${field}`);
              bound[field] = identity[field];
              receiver[field] = identity[field];
            }
            Object.freeze(bound);
            for (const [name, tool] of Object.entries(binding.methods)) {
              Object.defineProperty(receiver, name, {
                // Returning a reference from main() serializes its identity, never functions or state.
                enumerable: false,
                value: (input: AgentValue = {}, options?: AgentValue) => {
                  const args = record(input, `${binding.type}.${name} input`);
                  // Domain arguments may also contain id/type/scene. Identity has its own
                  // envelope and is never merged with caller input.
                  return invoke(tool, { identity: bound, input: args, ...(options === undefined ? {} : { options }) });
                }
              });
            }
            return Object.freeze(receiver);
          });
        }
      })
    )
  });
}

function record(value: AgentValue, label: string): Record<string, AgentValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Expected ${label} object`);
  return value as Record<string, AgentValue>;
}
