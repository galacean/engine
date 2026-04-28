/**
 * Pure transformer: take a file's id + source and emit JS module source.
 *
 * Behavior:
 * - `.gsp`            → exports the embedded JSON literal as the default export.
 * - `.shader`/`.glsl` → exports the raw source as a string literal.
 *
 * No filesystem access, no compilation, no compression — kept pure so it can
 * be reused outside the Rollup plugin (tests, other bundlers).
 */
export interface TransformResult {
  code: string;
  map: { mappings: string };
}

export function transform(code: string, id: string): TransformResult {
  if (id.endsWith(".gsp")) {
    return { code: `export default ${code};`, map: { mappings: "" } };
  }
  return { code: `export default ${JSON.stringify(code)};`, map: { mappings: "" } };
}
