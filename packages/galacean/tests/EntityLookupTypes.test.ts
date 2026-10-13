import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("requires callers to handle missing entities in the published lookup types", () => {
  const fileName = fileURLToPath(new URL("../../../tests/entity-lookup-types.ts", import.meta.url));
  const source = `
import { Entity } from "@galacean/engine";
declare const entity: Entity;
const named: Entity | null = entity.findByName("missing");
const pathed: Entity | null = entity.findByPath("child/missing");
named?.name;
pathed?.name;
// @ts-expect-error A name lookup may return null.
entity.findByName("missing").name;
// @ts-expect-error A path lookup may return null.
entity.findByPath("child/missing").name;
`;
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    target: ts.ScriptTarget.ES2020
  };
  const host = ts.createCompilerHost(options);
  const originalReadFile = host.readFile;
  const originalFileExists = host.fileExists;
  host.readFile = (path) => (resolve(path) === fileName ? source : originalReadFile(path));
  host.fileExists = (path) => resolve(path) === fileName || originalFileExists(path);
  const program = ts.createProgram([fileName], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  }));

  expect(diagnostics).toEqual([]);
});
