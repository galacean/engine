/**
 * Resolve a virtual asset path to its current load URL.
 * Use a static import from '@galacean/editor-assets' (named imports, including
 * import aliases, or namespace imports), then call directly with one string literal.
 * Reexports, dynamic imports of this module and function/namespace value aliases
 * are rejected so every resource reference can be tracked before execution.
 * Relative paths are resolved against the calling Script by the compiler.
 * Resolve at load time; do not retain this URL across project edits.
 */
export function assetUrl(_path: string): string {
  throw new Error("Project assets require a RuntimeProjectSession binding");
}
