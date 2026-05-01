/**
 * Raw shader sources for editor use — both `.shader` template strings (preserve
 * formatting and Editor properties) and the chunk library (raw `.glsl` strings
 * the editor exposes / clones as user-editable assets). Each entry carries the
 * file path relative to `packages/shader/src/` so the editor can mirror the
 * directory structure when displaying built-in assets.
 *
 * Import from "@galacean/engine-shader/sources".
 */

export { shaderLibrary } from "./ShaderLibrary";
export * from "./Shaders";
