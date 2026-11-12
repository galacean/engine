import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "@swc/core";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "../..");
const replacements = new Map(
  JSON.parse(fs.readFileSync(path.join(packageRoot, "native-overrides.json"), "utf8")).map(
    ({ original, replacement }) => [path.join(repositoryRoot, original), path.join(repositoryRoot, replacement)]
  )
);
const nativePackages = new Map([
  ["@galacean/engine", "galacean"],
  ...["core", "math", "loader", "rhi-webgl", "ui", "physics-physx", "design", "shader-compiler"].map((name) => [
    `@galacean/engine-${name}`,
    name
  ])
]);
const buildVersion = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"))).version;
const shaderEntry = path.join(packageRoot, ".cache/shaders.ts");

/** Opt-in source substitution. Module identities remain the native paths, so
 * relative imports and instanceof checks use one Engine graph. No native file
 * is written and the ordinary Engine build does not install this plugin. */
export function engineModify() {
  function resolveFile(stem) {
    for (const candidate of [stem, `${stem}.ts`, `${stem}.tsx`, `${stem}.js`, path.join(stem, "index.ts")]) {
      if (replacements.has(candidate) || (fs.existsSync(candidate) && fs.statSync(candidate).isFile()))
        return candidate;
    }
  }
  return {
    name: "galacean-engine-modify",
    enforce: "pre",
    config() {
      return {
        optimizeDeps: {
          exclude: [
            ...nativePackages.keys(),
            "@galacean/engine-shader",
            "@galacean/engine-toolkit-controls",
            "@galacean/engine-toolkit-stats"
          ]
        }
      };
    },
    resolveId(source, importer) {
      if (source === "@galacean/engine-shader") {
        if (!fs.existsSync(shaderEntry)) throw new Error("Run pnpm --dir world prepare:engine before starting World.");
        return shaderEntry;
      }
      if (source === "@galacean/engine-shader/sources") return path.join(packageRoot, ".cache/sources.ts");
      // Use the built compiler and its shared parser package, as in native Engine.
      if (source === "@galacean/engine-shader-compiler")
        return path.join(repositoryRoot, "packages/shader-compiler/dist/module.js");
      if (nativePackages.has(source))
        return path.join(repositoryRoot, "packages", nativePackages.get(source), "src/index.ts");
      if (source.startsWith(".") && importer) {
        const [pathname, query] = source.split("?");
        const resolved = resolveFile(path.resolve(path.dirname(importer.split("?")[0]), pathname));
        if (resolved && (replacements.has(resolved) || resolved.startsWith(path.join(repositoryRoot, "packages")))) {
          return resolved + (query ? `?${query}` : "");
        }
      }
    },
    load(id) {
      const [pathname, query] = id.split("?");
      const replacement = replacements.get(pathname);
      if (!replacement || (query && query !== "raw")) return null;
      this.addWatchFile(replacement);
      const code = fs.readFileSync(replacement, "utf8");
      return query === "raw" ? `export default ${JSON.stringify(code)};` : code;
    },
    transform(code, id) {
      const file = id.split("?")[0];
      // Preserve the native release ABI: existing ES5 toolkit subclasses call
      // Script/Component constructors with .apply(), which native classes reject.
      if (
        !id.includes("?") &&
        file.endsWith(".ts") &&
        [...nativePackages.values()].some((name) =>
          file.startsWith(path.join(repositoryRoot, "packages", name, "src") + path.sep)
        )
      ) {
        // Replace the native template marker before SWC converts it into a quoted
        // string; Vite 4 define replacement would otherwise introduce nested quotes.
        code = code.replace(/`__buildVersion`/g, JSON.stringify(buildVersion));
        const result = transformSync(code, {
          filename: file,
          sourceMaps: true,
          jsc: {
            parser: { syntax: "typescript", decorators: true },
            target: "es5",
            loose: true,
            externalHelpers: true,
            transform: { legacyDecorator: true, useDefineForClassFields: false }
          },
          module: { type: "es6" }
        });
        return { code: result.code, map: result.map };
      }
      if (/\.(shader|glsl)$/.test(id)) return { code: `export default ${JSON.stringify(code)};`, map: null };
      if (/\.shaderc$/.test(id)) return { code: `export default ${code};`, map: null };
    }
  };
}
