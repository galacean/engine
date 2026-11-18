import fs from "node:fs";
import path from "node:path";
export function nativePaths(root) {
  const overrides = new Set(
    JSON.parse(fs.readFileSync(path.join(root, "packages/modify/native-overrides.json"))).map((e) =>
      path.join(root, e.original)
    )
  );
  const prefix = path.join(root, "world/.acceptance/packages") + path.sep;
  return {
    name: "acceptance-native-paths",
    enforce: "pre",
    resolveId(specifier, importer) {
      if (!importer || !specifier.startsWith(".")) return;
      const candidate = path.resolve(path.dirname(importer), specifier);
      if (!candidate.startsWith(prefix)) return;
      const canonical = path.join(root, "packages", candidate.slice(prefix.length));
      return [canonical, canonical + ".ts", canonical + ".js", path.join(canonical, "index.ts")].find(
        (f) => overrides.has(f) || (fs.existsSync(f) && fs.statSync(f).isFile())
      );
    }
  };
}
