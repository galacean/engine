/** Build-time declaration merging for the typed component facade.
 * Each system contributes its own proxy type. The same generic signature is
 * emitted with each registration so a system declaration also works standalone.
 * Merged registrations accept unions without replacing their proxies with any.
 */
export function registeredComponentQuery(component, proxyType) {
  return `
declare global { namespace editor { namespace component {
  interface RegisteredComponentEditors { ${JSON.stringify(component)}: ${proxyType}; }
  /** Query registered component types, including unions. Narrow each result by its type before using system-specific methods. */
  function query<K extends keyof RegisteredComponentEditors>(input: {
    type: K; scene?: string; entityId?: string; id?: string;
  }): Promise<RegisteredComponentEditors[K][]>;
} } }
`;
}

/** The generic Scene overload must preserve registered proxies too: TypeScript
 * may select it before a system overload, depending on declaration merge order.
 * Unknown/unfiltered Scene queries still return the source identity DTO inferred
 * from the real API. The required scene and all selector fields stay unchanged.
 */
export function sceneComponentQuery(method) {
  const selector = /\btype\?: string( \| undefined)?;/g;
  if ([...method.inputText.matchAll(selector)].length !== 1)
    throw new Error("Review component.query declaration: expected optional string type selector");
  // A possible type filter does not prove that the query is filtered. Keep the
  // precise overload first, then accept optional/unfiltered selectors as DTOs.
  const input = method.inputText.replace(selector, "type: K;");
  return `interface RegisteredComponentEditors {}
/** ${method.description.replaceAll("*/", "* /")} */
function query<K extends string>(input: ${input}): Promise<Array<
  K extends keyof RegisteredComponentEditors ? RegisteredComponentEditors[K] : (${method.outputText})[number]
>>;
function query(input: ${method.inputText}): Promise<${method.outputText}>;`;
}
