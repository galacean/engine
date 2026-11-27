import * as ts from "typescript";
import type { BuildOptions, BuildResult } from "esbuild-wasm";
import type { CheckedRuntimeScripts, CompiledRuntimeScripts } from "./runtime-script-compiler";
import { RuntimeScriptPreparationError } from "./runtime-script-errors";

/** Only source cycles need bundling together. Imports across groups remain ESM edges,
 * so adding another entry cannot move a shared dependency into a different chunk. */
function moduleGroups(paths: string[], dependencies: Record<string, string[]>): Map<string, number> {
  const indices = new Map<string, number>(),
    low = new Map<string, number>();
  const stack: string[] = [],
    active = new Set<string>(),
    groups = new Map<string, number>();
  const known = new Set(paths);
  let index = 0,
    group = 0;
  const visit = (path: string) => {
    indices.set(path, index);
    low.set(path, index++);
    stack.push(path);
    active.add(path);
    for (const dependency of dependencies[path] ?? []) {
      if (!known.has(dependency)) continue;
      if (!indices.has(dependency)) {
        visit(dependency);
        low.set(path, Math.min(low.get(path)!, low.get(dependency)!));
      } else if (active.has(dependency)) low.set(path, Math.min(low.get(path)!, indices.get(dependency)!));
    }
    if (low.get(path) === indices.get(path)) {
      let member: string;
      do {
        member = stack.pop()!;
        active.delete(member);
        groups.set(member, group);
      } while (member !== path);
      group++;
    }
  };
  for (const path of paths) if (!indices.has(path)) visit(path);
  return groups;
}

/** Build real ESM entry points and shared chunks without evaluating project code. */
export async function buildRuntimeScripts(
  checked: CheckedRuntimeScripts,
  externals: Record<string, string[]>,
  build: (options: BuildOptions) => Promise<BuildResult>
): Promise<CompiledRuntimeScripts> {
  const { sources, dependencies } = checked;
  if (!Object.keys(sources).length) return { dependencies, entries: {}, files: {} };
  try {
    const paths = Object.keys(sources).sort();
    const groups = moduleGroups(paths, dependencies);
    const entryPath = (path: string) => `/runtime-build/${encodeURIComponent(path)}.js`;
    const enginePath = (path: string) => `/runtime-engine/${encodeURIComponent(path)}.js`;
    const result = await build({
      entryPoints: Object.fromEntries(paths.map((path) => [encodeURIComponent(path), "./" + path])),
      outdir: "/runtime-build",
      absWorkingDir: "/",
      splitting: true,
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      sourcemap: "inline",
      logLevel: "silent",
      tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: true } },
      plugins: [
        {
          name: "runtime-project",
          setup(builder) {
            builder.onResolve({ filter: /.*/ }, (args) => {
              if (Object.hasOwn(externals, args.path)) return { path: enginePath(args.path), external: true };
              const path =
                args.kind === "entry-point" ? args.path.slice(2) : checked.resolutions[args.importer]?.[args.path];
              if (!path || !Object.hasOwn(sources, path))
                return { errors: [{ text: `Cannot resolve '${args.path}' from '${args.importer}'` }] };
              if (args.kind !== "entry-point" && groups.get(path) !== groups.get(args.importer))
                return { path: entryPath(path), external: true };
              return { path, namespace: "project" };
            });
            builder.onLoad({ filter: /.*/, namespace: "project" }, (args) => ({
              contents: sources[args.path],
              loader: args.path.endsWith(".ts") ? "ts" : "js"
            }));
          }
        }
      ]
    });
    if (!result.outputFiles?.length) throw new Error("Runtime script build produced no output");
    const files: CompiledRuntimeScripts["files"] = {};
    for (const [name, exports] of Object.entries(externals)) {
      files[enginePath(name)] = {
        imports: [],
        code:
          `const host = globalThis[Symbol.for("galacean.runtime-script-hosts")].get(import.meta.url)[${JSON.stringify(name)}];\n` +
          // Export names may be keywords (for example zod's `catch` and `enum`),
          // but local variable names may not. Keep the two namespaces separate.
          exports
            .filter((key) => /^[A-Za-z_$][\w$]*$/.test(key))
            .map(
              (key, index) => `const value${index} = host[${JSON.stringify(key)}]; export { value${index} as ${key} };`
            )
            .join("\n")
      };
    }
    const normalize = (path: string) => {
      const parts: string[] = [];
      for (const part of path.split("/")) {
        if (part === "..") parts.pop();
        else if (part && part !== ".") parts.push(part);
      }
      return "/" + parts.join("/");
    };
    for (const output of result.outputFiles) {
      const code = output.text;
      const imports: CompiledRuntimeScripts["files"][string]["imports"] = [];
      const ast = ts.createSourceFile(output.path, code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
      const add = (node: ts.Expression) => {
        if (!ts.isStringLiteral(node))
          throw new Error(`Cannot resolve dynamic import at build time in '${output.path}'`);
        imports.push({
          start: node.getStart(ast),
          end: node.end,
          path: normalize(node.text.startsWith("/") ? node.text : output.path + "/../" + node.text)
        });
      };
      const visit = (node: ts.Node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
          add(node.moduleSpecifier);
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0]);
        ts.forEachChild(node, visit);
      };
      visit(ast);
      files[output.path] = { code, imports };
    }
    // Blob URLs must be allocated after their dependencies. esbuild normally
    // lowers source cycles into shared chunks; reject any remaining output cycle.
    const complete = new Set<string>(),
      active = new Set<string>();
    const validate = (path: string) => {
      if (active.has(path)) throw new Error(`Cyclic output chunks cannot be loaded: '${path}'`);
      if (complete.has(path)) return;
      if (!files[path]) throw new Error(`Unresolved output module '${path}'`);
      active.add(path);
      for (const dependency of files[path].imports) validate(dependency.path);
      active.delete(path);
      complete.add(path);
    };
    for (const path of Object.keys(files)) validate(path);
    return {
      dependencies,
      files,
      entries: Object.fromEntries(paths.map((path) => [path, `/runtime-build/${encodeURIComponent(path)}.js`]))
    };
  } catch (error) {
    throw new RuntimeScriptPreparationError("build", error instanceof Error ? error.message : String(error));
  }
}
