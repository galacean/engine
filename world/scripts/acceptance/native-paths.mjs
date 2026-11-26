import fs from "node:fs";
import path from "node:path";
export function nativePaths(root) {
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
        (f) => fs.existsSync(f) && fs.statSync(f).isFile()
      );
    }
  };
}
