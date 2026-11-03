import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "../..");
const replacements = new Map(JSON.parse(fs.readFileSync(path.join(packageRoot, "native-overrides.json"), "utf8"))
  .map(({ original, replacement }) => [path.join(repositoryRoot, original), path.join(repositoryRoot, replacement)]));
const nativePackages = new Map([
  ["@galacean/engine", "galacean"],
  ...["core", "math", "loader", "rhi-webgl", "ui", "physics-physx", "design", "shader-compiler"]
    .map(name => [`@galacean/engine-${name}`, name])
]);
const shaderEntry = path.join(packageRoot, ".cache/shaders.ts");

/** Opt-in source substitution. Module identities remain the native paths, so
 * relative imports and instanceof checks use one Engine graph. No native file
 * is written and the ordinary Engine build does not install this plugin. */
export function engineModify() {
  function resolveFile(stem) {
    for (const candidate of [stem, `${stem}.ts`, `${stem}.tsx`, `${stem}.js`, path.join(stem, "index.ts")]) {
      if (replacements.has(candidate) || fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
  }
  return {
    name: "galacean-engine-modify",
    enforce: "pre",
    config() {
      return {
        define: { __buildVersion: JSON.stringify(JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"))).version) },
        optimizeDeps: { exclude: [...nativePackages.keys(), "@galacean/engine-shader"] }
      };
    },
    resolveId(source, importer) {
      if (source === "@galacean/engine-shader") {
        if (!fs.existsSync(shaderEntry)) throw new Error("Run pnpm --dir world prepare:engine before starting World.");
        return shaderEntry;
      }
      if (source === "@galacean/engine-shader/sources") return path.join(repositoryRoot, "packages/shader/src/sources.ts");
      if (nativePackages.has(source)) return path.join(repositoryRoot, "packages", nativePackages.get(source), "src/index.ts");
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
      if (!replacement || query && query !== "raw") return null;
      this.addWatchFile(replacement);
      const code = fs.readFileSync(replacement, "utf8");
      return query === "raw" ? `export default ${JSON.stringify(code)};` : code;
    },
    transform(code, id) {
      if (/\.(shader|glsl)$/.test(id)) return { code: `export default ${JSON.stringify(code)};`, map: null };
      if (/\.shaderc$/.test(id)) return { code: `export default ${code};`, map: null };
    }
  };
}
