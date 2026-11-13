import { describe, expect, it } from "vitest";
import ts from "typescript";
import { AgentProjectFiles } from "@galacean/engine-ai-chat/ai-chat/agent-project-files.ts";
import { engineRuntimeFiles } from "../src/runtime-editor-agent/engine-runtime-files";
import declarations from "../src/runtime-editor/generated/engine-runtime-files.json";
import declarationIndex from "../src/runtime-editor/generated/engine-runtime-index.json";

describe("engine runtime files", () => {
  it("keeps the declaration index digest aligned with the mounted content", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(declarations));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
    expect(hex).toBe(declarationIndex.digest);
  });
  it("searches cold declarations and uses the same text as reads", async () => {
    const provider = engineRuntimeFiles(), files = new AgentProjectFiles([provider]);
    const path = "declare/engine/node_modules/@galacean/engine-core/types/Script.d.ts";
    expect(await files.search({ path, query: "onUpdate" })).toMatchObject({ complete: true,
      matches: expect.arrayContaining([expect.objectContaining({ path, line: expect.any(Number) })]) });
  });

  it("links knowledge to readable declarations and preserves lifecycle units", async () => {
    const files = new AgentProjectFiles([engineRuntimeFiles()]);
    const readme = files.read("skills/scripting/references/runtime-modules.md");
    for (const match of readme.matchAll(/\]\(\.\.\/\.\.\/(.*?)\)/g)) {
      const [file] = await files.readFilesAsync([match[1]]);
      expect(file.content.length).toBeGreaterThan(0);
    }
    const [script] = await files.readFilesAsync(["declare/engine/node_modules/@galacean/engine-core/types/Script.d.ts"]);
    expect(script.content).toContain("delta time since last frame in seconds");
  });

  it("resolves engine imports and typechecks a Script against the mounted files", () => {
    const virtual = new Map(Object.entries(declarations).map(([path, text]) => ["/project/" + path.slice("declare/engine/".length), text]));
    virtual.set("/project/main.ts", `import { Script, ScreenSpaceReflection } from "@galacean/engine";
const receiverContract: "ColorResponseV3" = ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT;
export default class Rotate extends Script {
  onUpdate(dt: number): void { this.entity.transform.rotate(0, dt * 90, 0); }
}`);
    const options: ts.CompilerOptions = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Node10 };
    const host = ts.createCompilerHost(options);
    const readFile = host.readFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const directoryExists = host.directoryExists?.bind(host);
    host.readFile = path => virtual.get(path) ?? readFile(path);
    host.fileExists = path => virtual.has(path) || fileExists(path);
    host.directoryExists = path => [...virtual.keys()].some(file => file.startsWith(path.replace(/\/$/, "") + "/")) || Boolean(directoryExists?.(path));
    host.getSourceFile = (path, languageVersion) => {
      const content = host.readFile(path);
      return content === undefined ? undefined : ts.createSourceFile(path, content, languageVersion, true);
    };
    const unresolved: string[] = [];
    for (const [file, text] of virtual) {
      if (!file.endsWith(".ts")) continue;
      for (const imported of ts.preProcessFile(text).importedFiles) {
        if (!ts.resolveModuleName(imported.fileName, file, options, host).resolvedModule) unresolved.push(`${file}: ${imported.fileName}`);
      }
    }
    expect(unresolved).toEqual([]);
    const program = ts.createProgram(["/project/main.ts"], options, host);
    expect(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
  });
});


it("publishes declarations for the actual Script host exports", () => {
  const files = new AgentProjectFiles([engineRuntimeFiles()]);
  expect(files.read("declare/engine/node_modules/@galacean/editor-assets/index.d.ts")).toContain("assetUrl");
  expect(files.list().some(path => path.includes("@galacean/editor-system"))).toBe(false);
});
