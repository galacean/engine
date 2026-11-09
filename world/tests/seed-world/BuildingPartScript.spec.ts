import { createAgentProjectFiles } from "@galacean/engine-ai-chat/ai-chat/agent-project-files.ts";
import { engineRuntimeFiles } from "@galacean/engine-runtime-editor/runtime-editor-agent/engine-runtime-files.ts";
import { expect, it } from "vitest";
import example from "../../demos/building-components/parts-example.txt?raw";
import declarations from "../../demos/seed-world/systems/runtime-declarations.json";
import engine from "@galacean/engine-runtime-editor/runtime-editor/generated/engine-runtime-files.json";
import sdk from "@galacean/engine-runtime-editor/runtime-editor/generated/host-runtime-files.json";
import { createRuntimeScriptEnvironment } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-environment.ts";
import { checkRuntimeScripts } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-compiler.ts";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
import dom from "typescript/lib/lib.dom.d.ts?raw";

it("typechecks the actual procedural assembly Script through the Agent's host module contract", () => {
  const host = createRuntimeScriptEnvironment({}, [
    { name: "@galacean/seed-world-systems", exports: {}, declarations }
  ]);
  const files = { ...engine, ...sdk, ...host.declarations },
    libraries = { ...agentTypecheckLibraries, "/lib.dom.d.ts": dom };
  expect(() => checkRuntimeScripts({ "Shell.ts": example }, files, libraries)).not.toThrow();
  expect(() =>
    checkRuntimeScripts(
      { "Shell.ts": example.replace("segments: [24, 16]", 'segments: ["bad", 16]') },
      files,
      libraries
    )
  ).toThrow();
});

it("typechecks the flat European generator and part manager through actual host declarations", () => {
  const host = createRuntimeScriptEnvironment({}, [
    { name: "@galacean/seed-world-systems", exports: {}, declarations }
  ]);
  const files = { ...engine, ...sdk, ...host.declarations },
    libraries = { ...agentTypecheckLibraries, "/lib.dom.d.ts": dom };
  const source = `import {Script,Camera,PrefabResource} from "@galacean/engine";
import {Building,BuildingManager,BuildingGroupComponent,BuildingPartComponent,buildingPlacementAlgorithms,buildingGeometryAlgorithms,type BuildingGeometryDefinition} from "@galacean/seed-world-systems";
const grid=buildingPlacementAlgorithms.resolve("grid");
const geometry: BuildingGeometryDefinition = { generator: "example.geometry", materials: [] };
buildingPlacementAlgorithms.register("example.grid", (support,params,context)=>grid(support,params,context), {profile:{basis:"grid"}});
export default class Example extends Script {
  camera!:Camera; assets!:PrefabResource;
  async onAwake() {
    const draft=Building.European.buildHouses({id:"house",height:4,roofStyle:{algorithm:{type:"example.grid"}}});
    const manager=BuildingManager.forScene(this.entity.scene);
    manager.camera=this.camera;manager.assets=this.assets;
    const frame=manager.create(this.entity,draft);
    await manager.flushAsync();
    const errors: string[] = manager.errors();
    if(errors.length) throw new Error(errors.join("\\n"));
    const state = manager.snapshot(frame);
    const part: BuildingPartComponent | undefined = manager.get(draft.parts[0].id, frame);
    const owner: BuildingGroupComponent | undefined = part ? manager.groupFor(part) : undefined;
    const groups: number = manager.listGroups().length;
    if (owner) owner.definition = { ...owner.definition!, seed: 1 };
    if(part && state.parts.length && groups) part.rebuild();
  }
}`;
  expect(() => checkRuntimeScripts({ "Example.ts": source }, files, libraries)).not.toThrow();
  expect(() =>
    checkRuntimeScripts(
      {
        "Example.ts": source.replace(
          'generator: "example.geometry"',
          'generator: buildingGeometryAlgorithms.register("example.geometry", () => null as any)'
        )
      },
      files,
      libraries
    )
  ).toThrow();
  expect(() =>
    checkRuntimeScripts({ "Example.ts": source.replace("height:4", 'height:"bad"') }, files, libraries)
  ).toThrow();
  expect(() =>
    checkRuntimeScripts({ "Example.ts": source.replace('basis:"grid"', 'basis:"unknown"') }, files, libraries)
  ).toThrow();
});

it("typechecks the instance-scoped example actually published in building knowledge", () => {
  const example = buildingPartKnowledge
    .find((p) => p.path === "skills/building/references/foundation.md")!
    .content.match(/```ts\n([\s\S]*?)```/)![1];
  const entry = buildingPartKnowledge.find((p) => p.path === "skills/building/SKILL.md")!.content;
  const host = createRuntimeScriptEnvironment({}, [
    { name: "@galacean/seed-world-systems", exports: {}, declarations }
  ]);
  const files = { ...engine, ...sdk, ...host.declarations },
    libraries = { ...agentTypecheckLibraries, "/lib.dom.d.ts": dom };
  expect(() => checkRuntimeScripts({ "Example.ts": example }, files, libraries)).not.toThrow();
  expect(() =>
    checkRuntimeScripts({ "Example.ts": example.replace("snapshot(frame)", "snapshot()") }, files, libraries)
  ).toThrow();
});
import { buildingPartSkill, buildingPartDocuments } from "@galacean/engine-building/building/parts/BuildingKnowledge.ts";
const buildingPartKnowledge = [{ path: "skills/building/SKILL.md", content: buildingPartSkill }, ...buildingPartDocuments];

it("publishes building knowledge links against the merged engine declaration mount", () => {
  const host = createRuntimeScriptEnvironment({}, [
    { name: "@galacean/seed-world-systems", exports: {}, declarations }
  ]);
  const project = createAgentProjectFiles({ hostNotes: "", modules: [], entries: [], documents: buildingPartKnowledge }, [
    engineRuntimeFiles(host)
  ]);
  const paths = new Set(project.list());
  for (const document of buildingPartKnowledge) {
    const published = project.read(document.path);
    for (const link of published.matchAll(/\]\(<?([^)>]+)>?\)/g)) {
      if (/^https?:/.test(link[1]) || link[1].startsWith("declare/editor/world/")) continue;
      expect(paths.has(link[1]), document.path + " → " + link[1]).toBe(true);
    }
  }
});
