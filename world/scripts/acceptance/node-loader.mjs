import fs from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && context.parentURL) {
      for (const suffix of [".ts", ".js", "/index.ts"]) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (fs.existsSync(url)) return { url: url.href, shortCircuit: true };
      }
    }
    throw error;
  }
}
export async function load(url, context, next) {
  if (url.endsWith(".ts"))
    return {
      format: "module",
      source: ts.transpileModule(fs.readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, experimentalDecorators: true }
      }).outputText,
      shortCircuit: true
    };
  if (url.endsWith(".json"))
    return {
      format: "module",
      source: "export default " + fs.readFileSync(fileURLToPath(url), "utf8"),
      shortCircuit: true
    };
  return next(url, context);
}
