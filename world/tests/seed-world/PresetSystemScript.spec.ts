import guide from "../../demos/seed-world/agent-adapter/skills/scripting/preset-systems.md?raw";
import { expect, it } from "vitest";
import ts from "typescript";
import declarations from "../../demos/seed-world/systems/runtime-declarations.json";
import engine from "@galacean/engine-runtime-editor/runtime-editor/generated/engine-runtime-files.json";
import sdk from "@galacean/engine-runtime-editor/runtime-editor/generated/host-runtime-files.json";
import { createRuntimeScriptEnvironment } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-environment.ts";
import { checkRuntimeScripts } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-compiler.ts";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
import dom from "typescript/lib/lib.dom.d.ts?raw";
import { AgentProjectFiles } from "@galacean/engine-ai-chat/ai-chat/agent-project-files.ts";
import { engineRuntimeFiles } from "@galacean/engine-runtime-editor/runtime-editor-agent/engine-runtime-files.ts";

const host = createRuntimeScriptEnvironment({}, [{ name: "@galacean/seed-world-systems", exports: {}, declarations }]);
const files = { ...engine, ...sdk, ...host.declarations };
const libraries = { ...agentTypecheckLibraries, "/lib.dom.d.ts": dom };
const source = `import {Script} from '@galacean/engine';
import {FarmingSystem,FarmingAPI,BuildingGroupComponent,BuildingPartComponent} from '@galacean/seed-world-systems';
export default class FarmInteraction extends Script {
  async inspect() {
    const farming = this.entity.getComponent(FarmingSystem);
    if (farming) {
      const result = await new FarmingAPI(farming).execute({operation:'list',input:{}});
      if (result.ok) for (const farm of result.value) console.log(farm.farmId, farm.cropCount);
    }
    const group = this.entity.getComponent(BuildingGroupComponent);
    if (group) console.log(group.definition?.id);
    const part = this.entity.getComponent(BuildingPartComponent);
    if (part) part.rebuild();
  }
}`;

it("typechecks Script imports and rejects invalid native method calls", () => {
  expect(() => checkRuntimeScripts({ "Inspect.ts": source }, files, libraries)).not.toThrow();
  expect(() =>
    checkRuntimeScripts({ "Inspect.ts": source.replace("part.rebuild()", "part.nonexistent()") }, files, libraries)
  ).toThrow(/nonexistent/);
  expect(() =>
    checkRuntimeScripts(
      { "Inspect.ts": source.replace("operation:'list'", "operation:'notAnOperation'") },
      files,
      libraries
    )
  ).toThrow(/notAnOperation/);
});

it("publishes a closed declaration graph through the same read/list mount", async () => {
  const provider = new AgentProjectFiles([engineRuntimeFiles(host)]);
  const readme = provider.read("skills/scripting/references/runtime-modules.md");
  expect(readme).toContain("@galacean/seed-world-systems");
  const virtual = new Map(
    Object.entries(files).map(([path, text]) => ["/project/" + path.slice("declare/engine/".length), text])
  );
  const resolver: ts.ModuleResolutionHost = {
    fileExists: (path) => virtual.has(path),
    readFile: (path) => virtual.get(path),
    directoryExists: () => true
  };
  const missing: string[] = [];
  for (const [path, text] of Object.entries(host.declarations)) {
    const [read] = await provider.readFilesAsync([path]);
    expect(read.content).toBe(text);
    if (!path.endsWith(".d.ts")) continue;
    for (const reference of ts.preProcessFile(text, true, true).importedFiles) {
      const result = ts.resolveModuleName(
        reference.fileName,
        "/project/" + path.slice("declare/engine/".length),
        { moduleResolution: ts.ModuleResolutionKind.Bundler },
        resolver
      );
      if (!result.resolvedModule) missing.push(`${path}: ${reference.fileName}`);
    }
  }
  expect(missing).toEqual([]);
});

it("typechecks the published Script example", () => {
  const examples = [...guide.matchAll(/```ts\n([\s\S]*?)```/g)];
  expect(examples.length).toBeGreaterThan(0);
  for (const example of examples)
    expect(() => checkRuntimeScripts({ "Example.ts": example[1] }, files, libraries)).not.toThrow();
});
