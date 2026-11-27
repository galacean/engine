import { describe, expect, it } from "vitest";
import { checkRuntimeScripts } from "../src/runtime-editor/scripts/runtime-script-compiler";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
import dom from "typescript/lib/lib.dom.d.ts?raw";
import declarations from "../src/runtime-editor/generated/engine-runtime-files.json";
import hostDeclarations from "../src/runtime-editor/generated/host-runtime-files.json";

const libraries = {...agentTypecheckLibraries, "/lib.dom.d.ts":dom};

describe("runtime script assets", () => {
  it.each([
    'export {assetUrl} from "@galacean/editor-assets";',
    'export {assetUrl as resourceUrl} from "@galacean/editor-assets";',
    'export * from "@galacean/editor-assets";',
    'export * as assets from "@galacean/editor-assets";',
    'import {assetUrl} from "@galacean/editor-assets"; export {assetUrl};',
    'import {assetUrl as url} from "@galacean/editor-assets"; export {url as resourceUrl};',
    'import * as assets from "@galacean/editor-assets"; export {assets};',
    'import {assetUrl} from "@galacean/editor-assets"; const api = {assetUrl}; export const url = api.assetUrl("./Mesh.mesh");',
    'import * as assets from "@galacean/editor-assets"; const api = {assets}; export const url = api.assets.assetUrl("./Mesh.mesh");',
    'export async function load() { const {assetUrl} = await import("@galacean/editor-assets"); return assetUrl("./Mesh.mesh"); }',
    'export const assets = import(`@galacean/editor-assets`);',
    'export const assets = import("@galacean/" + "editor-assets");'
  ])("rejects untracked access to the asset SDK before compilation: %s", source => {
    for (const analyzeOnly of [false, true]) {
      expect(() => checkRuntimeScripts({"Pkg/bridge.ts": source}, {...declarations, ...hostDeclarations}, libraries, undefined, analyzeOnly))
        .toThrow(/static import|literal module|called directly/);
    }
  });
  it("preserves ordinary reexports and dynamic project imports, and only rewrites the imported asset function", () => {
    const checked = checkRuntimeScripts({
      "Pkg/bridge.ts": 'export {value} from "./value";',
      "Pkg/value.ts": 'export const value = 1;',
      "Pkg/use.ts": `import {assetUrl as url} from "@galacean/editor-assets";
export function load() { return url("./Mesh.mesh"); }
export async function value() { return (await import("./bridge")).value; }
function assetUrl(path: string) { return path; }
export const local = assetUrl("./Unrelated.mesh");`
    }, {...declarations, ...hostDeclarations}, libraries);
    expect(checked.dependencies["Pkg/use.ts"]).toEqual(["Pkg/bridge.ts", "Pkg/Mesh.mesh"]);
    expect(checked.sources["Pkg/use.ts"]).toContain('url("Pkg/Mesh.mesh")');
    expect(checked.sources["Pkg/use.ts"]).toContain('assetUrl("./Unrelated.mesh")');
  });
  it("checks ESM top-level await and import.meta without executing user code", () => {
    const checked = checkRuntimeScripts({ "Rotate.ts": `import { Script } from '@galacean/engine';
await Promise.resolve(); const url = import.meta.url;
export default class Rotate extends Script { onUpdate(dt:number) { this.entity.transform.rotate(0,dt,0); } }`
    }, declarations, libraries);
    expect(checked.sources["Rotate.ts"]).toContain("await Promise.resolve()");
  });
  it("tracks typed project imports", () => {
    const checked = checkRuntimeScripts({ "rate.ts": "export const speed:number = 90;", "Rotate.ts": `
import { Script } from '@galacean/engine'; import {speed} from './rate';
export default class Rotate extends Script { onUpdate(dt:number) {this.entity.transform.rotate(0,speed*dt,0);} }`
    }, declarations, libraries);
    expect(checked.dependencies["Rotate.ts"]).toEqual(["rate.ts"]);
  });
  it("reports type errors with their original file and location", () => {
    expect(() => checkRuntimeScripts({ "bad.ts": `import { Script } from '@galacean/engine';
export default class Bad extends Script { onUpdate() { this.entity.transform.noSuchMethod(); } }` }, declarations, libraries))
      .toThrow(/bad.ts\(2,.*error TS2339/);
  });
  it("resolves relative imports to editable sources and keeps declaration files out of asset dependencies", () => {
    const checked = checkRuntimeScripts({
      "systems/counter/runtime.ts": `import type { CounterSettings } from './settings';
export class Counter { constructor(readonly settings: CounterSettings) {} }`,
      "UseCounter.ts": `import { Counter } from './systems/counter/runtime'; export { Counter };`
    }, {...declarations, ...hostDeclarations,
      "declare/engine/assets/systems/counter/settings.d.ts": "export interface CounterSettings { count: number; }"
    }, libraries);
    expect(checked.dependencies["UseCounter.ts"]).toEqual(["systems/counter/runtime.ts"]);
    expect(checked.dependencies["systems/counter/runtime.ts"]).toEqual([]);
    expect(checked.resolutions["UseCounter.ts"]["./systems/counter/runtime"]).toBe("systems/counter/runtime.ts");
  });
});
