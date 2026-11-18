import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentJavaScriptChecker } from "@galacean/engine-ai-chat/ai-chat/agent-script-checker.ts";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
import { FARMING_SYSTEM_EDITOR_DECLARATION } from "@galacean/engine-farming/farming/native/FarmingAPIDeclarations.ts";
import { withNativeEditingKnowledge } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-knowledge.ts";
import { SEED_WORLD_API_DECLARATION_MODULES } from "../../demos/seed-world/agent-adapter/contracts/generated/SeedWorldApiSearchRegistry";

// The removed building systems remain test-only names for the original regression.
// These fixture proxies exercise the public generator, not a retired runtime API.
import { registeredComponentQuery } from "@galacean/engine-project/api-contract/scripts/component-query.mjs";
const MASONRY_EDITOR_DECLARATION = `export {}; interface ManualProxy {
 type: "MasonrySystem"; read(): Promise<{enabled:boolean;wallHeights:number[]}>;
 inspectSurface(input:{bindingId:string}): Promise<{}>;
}` + registeredComponentQuery("MasonrySystem", "ManualProxy");
const PLANNED_MASONRY_EDITOR_DECLARATION = `export {}; interface PlannedProxy {
 type: "PlannedMasonrySystem";
 listComponents<K extends "building" | "surface">(input:{category:K}): Promise<{items:(K extends "building" ? {shape:string} : {id:string})[]}>;
}` + registeredComponentQuery("PlannedMasonrySystem", "PlannedProxy");
const systems = [
  { id: "farming.d.ts", source: FARMING_SYSTEM_EDITOR_DECLARATION },
  { id: "masonry.d.ts", source: MASONRY_EDITOR_DECLARATION },
  { id: "planned.d.ts", source: PLANNED_MASONRY_EDITOR_DECLARATION }
];
const native = withNativeEditingKnowledge({ catalog: "", entries: [], modules: [] }).modules;
// The original failed example, including its explicit union annotation.
const loop = `
/** @type {("MasonrySystem" | "PlannedMasonrySystem" | "FarmingSystem")[]} */
const types = ["MasonrySystem", "PlannedMasonrySystem", "FarmingSystem"];
for (const type of types) { await editor.component.query({type}); }
`;

it("composes actual world and runtime identity outputs with the typed editor inputs", () => {
  const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
  const world = SEED_WORLD_API_DECLARATION_MODULES.map(module => ({...module, id:"declare/world/" + module.id}));
  const declarations = [...native, ...systems, ...world];
  try {
    expect(checker.check(`
      // pick is a native visual tool; its numeric runtime identity is passed into execute.
      const hit = {ref:{entityId:1,componentId:2}};
      const entity = (await tools.runtime.entity.inspect({entityId:hit.ref.entityId})).entity;
      if (!entity) return;
      const result = await tools.runtime.component.query({entityId:entity.entityId});
      for (const component of result.components) {
        await tools.runtime.component.read({componentId:component.componentId,fields:[]});
        if (component.authoring) {
          const sources = await editor.component.query(component.authoring.componentQuery);
          for (const source of sources) await editor.component.read({scene:source.scene,id:source.id});
        }
      }
    `, declarations)).toBeUndefined();
    for (const invalid of [
      'await tools.runtime.entity.inspect({entityId:1,id:1});',
      'await tools.runtime.entity.inspect({componentId:1});',
      'await tools.runtime.entity.inspect({entityId:"author-id"});',
      'await tools.runtime.component.read({componentId:1,id:1,fields:[]});',
      'await tools.runtime.component.read({entityId:1,fields:[]});',
    ]) expect(checker.check(invalid, declarations)?.code, invalid).toBe("SCRIPT_CHECK_FAILED");
  } finally {checker.dispose();}
});

describe.each([
  ["native first", [...native, ...systems]],
  ["native last", [...systems, ...native]],
  ["reversed systems", [...native, ...systems].reverse()],
  ["standalone systems", systems]
] as const)("component query declarations: %s", (_name, declarations) => {
  let checker: AgentJavaScriptChecker;
  beforeAll(() => { checker = new AgentJavaScriptChecker(agentTypecheckLibraries); });
  afterAll(() => checker.dispose());

  it("accepts the original union loop and retains discriminated proxy methods", () => {
    expect(checker.check(loop, declarations)).toBeUndefined();
    for (const scene of ["", 'scene: "Main.scene",']) {
      expect(checker.check(loop + `
        for (const type of types) {
          const results = await editor.component.query({${scene}type});
          for (const system of results) {
            if (system.type === "FarmingSystem") {
              const diagnosis = await system.getDiagnostics();
              /** @type {true} */ const ok = diagnosis.ok;
            } else if (system.type === "MasonrySystem") {
              /** @type {boolean} */ const enabled = (await system.read()).enabled;
            } else {
              const page = await system.listComponents({category: "building"});
              page.items[0].shape;
            }
          }
        }
      `, declarations)).toBeUndefined();
    }
  });

  it("preserves literal result types and method input/output checking", () => {
    for (const scene of ["", 'scene: "Main.scene",']) {
      const queries = `
        const [farm] = await editor.component.query({${scene}type: "FarmingSystem"});
        const [manual] = await editor.component.query({${scene}type: "MasonrySystem"});
        const [planned] = await editor.component.query({${scene}type: "PlannedMasonrySystem"});
      `;
      expect(checker.check(queries + `
        (await farm.getDiagnostics()).value;
        (await manual.read()).wallHeights;
        (await planned.listComponents({category: "building"})).items[0].shape;
      `, declarations)).toBeUndefined();
      for (const invalid of [
        "await farm.getDiagnostics({wrong: true});",
        'await manual.inspectSurface({bindingId: 123});',
        'await planned.listComponents({category: "unknown"});',
        'await manual.getDiagnostics();',
        '(await planned.listComponents({category: "surface"})).items[0].shape;',
        '/** @type {string} */ const wrong = (await manual.read()).enabled;'
      ]) expect(checker.check(queries + invalid, declarations)?.code, invalid).toBe("SCRIPT_CHECK_FAILED");
    }
  });

  it("does not turn unions into any, intersections, or every registered type", () => {
    for (const scene of ["", 'scene: "Main.scene",']) {
      expect(checker.check(loop + `
        for (const type of types) {
          const [system] = await editor.component.query({${scene}type});
          await system.getDiagnostics();
        }
      `, declarations)?.code).toBe("SCRIPT_CHECK_FAILED");
      // A two-type query must not acquire FarmingSystem in its return union.
      expect(checker.check(`
        /** @type {("MasonrySystem" | "PlannedMasonrySystem")[]} */
        const types = ["MasonrySystem", "PlannedMasonrySystem"];
        for (const type of types) {
          for (const system of await editor.component.query({${scene}type})) {
            if (system.type === "MasonrySystem") await system.read();
            else await system.listComponents({category: "building"});
          }
        }
      `, declarations)).toBeUndefined();
      expect(checker.check('await editor.component.query({scene:"Main.scene",type:"FarmingSystem",farmId:"wrong"});', declarations)?.code).toBe("SCRIPT_CHECK_FAILED");
    }
  });

  it("keeps unknown runtime types, widened strings and wrong selectors invalid", () => {
    for (const source of [
      'await editor.component.query({type: "UnknownSystem"});',
      'for (const type of ["MasonrySystem", "FarmingSystem"]) await editor.component.query({type});',
      'await editor.component.query({type: "FarmingSystem", farmId: "wrong-selector"});',
      'await editor.component.query({type: "MasonrySystem", scene: 123});',
      '/** @type {("FarmingSystem" | "UnknownSystem")[]} */ const types=[]; for (const type of types) await editor.component.query({type});'
    ]) expect(checker.check(source, declarations)?.code, source).toBe("SCRIPT_CHECK_FAILED");
  });
});

it("keeps unregistered and unfiltered Scene queries as source identities", () => {
  const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
  try {
    for (const declarations of [[...native, ...systems], [...systems, ...native]]) {
      const source = `
        const all = await editor.component.query({scene: "Main.scene"});
        const meshes = await editor.component.query({scene: "Main.scene", type: "MeshRenderer"});
        for (const ref of [...all, ...meshes]) await editor.component.read({scene:ref.scene, id:ref.id});
      `;
      expect(checker.check(source, declarations)).toBeUndefined();
      expect(checker.check(source + 'await meshes[0].getDiagnostics();', declarations)?.code).toBe("SCRIPT_CHECK_FAILED");
    }
  } finally { checker.dispose(); }
});

it("does not infer a system proxy from an optional Scene type filter", () => {
  const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
  try {
    for (const declarations of [[...native, ...systems], [...systems, ...native]]) {
      for (const initializer of ['{scene:"Main.scene"}', '{scene:"Main.scene",type:undefined}', '{scene:"Main.scene",type:"FarmingSystem"}']) {
        const source = `
          /** @type {{scene:string,type?:"FarmingSystem"}} */ const query = ${initializer};
          const results = await editor.component.query(query);
          for (const ref of results) await editor.component.read({scene:ref.scene,id:ref.id});
        `;
        expect(checker.check(source, declarations)).toBeUndefined();
        expect(checker.check(source + 'await results[0].getDiagnostics();', declarations)?.code).toBe("SCRIPT_CHECK_FAILED");
      }
      expect(checker.check(`
        /** @type {{scene:string,type:"FarmingSystem"}} */
        const query = {scene:"Main.scene",type:"FarmingSystem"};
        const results = await editor.component.query(query);
        await results[0].getDiagnostics();
      `, declarations)).toBeUndefined();
    }
  } finally { checker.dispose(); }
});
