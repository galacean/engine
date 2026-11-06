/** Rewrite only resource-reference fields, preserving unrelated URLs and domain IDs. */
export function rewriteAssetReferences(
  type: string,
  input: any,
  resolve: (path: string) => string,
  resolveUrl = resolve
): any {
  const visit = (value: any): any => {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(visit);
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        key === "$ref" && typeof child === "string" ? resolve(child) : visit(child)
      ])
    );
  };
  const value = visit(input);
  const url = (ref: any) => {
    if (ref && typeof ref.url === "string") ref.url = resolveUrl(ref.url);
  };
  if (type === "Scene" || type === "Prefab") for (const ref of value.refs ?? []) url(ref);
  if (type === "Material") {
    url(value.shaderRef);
    for (const property of Object.values(value.shaderData ?? {}) as any[])
      if (property?.type === "Texture") url(property.value);
  }
  if (type === "AnimatorController") {
    for (const layer of value.layers ?? []) for (const state of layer.stateMachine?.states ?? []) url(state.clip);
  }
  return value;
}
