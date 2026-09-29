import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const skillRoot = resolve(packageRoot, "skills/engine-knowledge");

function files(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return files(root, path);
    }
    return [relative(root, path).split(sep).join("/")];
  });
}

const examples = files(skillRoot)
  .filter((path) => path.endsWith(".md"))
  .flatMap((path) => {
    const content = readFileSync(resolve(skillRoot, path), "utf8");
    return [...content.matchAll(/```ts\r?\n([\s\S]*?)\r?\n```/g)].map((match) => match[1]);
  });

if (examples.length === 0) {
  throw new Error("engine-knowledge must retain at least one TypeScript runtime recipe");
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "engine-knowledge-recipes-"));
try {
  const recipeFiles = examples.map((example, index) => {
    const path = resolve(temporaryRoot, `recipe-${index + 1}.ts`);
    writeFileSync(path, example);
    return path;
  });
  const program = ts.createProgram(recipeFiles, {
    allowSyntheticDefaultImports: true,
    baseUrl: packageRoot,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    noEmit: true,
    paths: { "@galacean/engine": ["types/index.d.ts"] },
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ESNext
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => packageRoot,
        getNewLine: () => "\n"
      })
    );
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
