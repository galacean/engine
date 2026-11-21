import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("requires engine ownership for physics materials and shape instancing", () => {
  const fixture = fileURLToPath(new URL("./fixtures/PhysicsMaterialApi.ts", import.meta.url));
  const program = ts.createProgram([fixture], {
    noEmit: true,
    strict: true,
    skipLibCheck: false,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    types: []
  });
  const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    const line =
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
        : 0;
    return `${line}: ${message}`;
  });
  expect(diagnostics).toEqual([]);
});
