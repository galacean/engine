import fs from "node:fs";
import path from "node:path";

/** Keep resource manifests next to their resources. Hashed JSON URLs alone lose
 * dynamically fetched dependencies that Rollup cannot see in the module graph. */
export function projectAssets(root) {
  const emitted = new Map();
  let building = false;
  function emit(context, file) {
    if (emitted.has(file)) return emitted.get(file);
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (relative.startsWith("../") || path.isAbsolute(relative)) throw new Error(`Asset outside repository: ${file}`);
    const reference = context.emitFile({ type: "asset", fileName: relative, source: fs.readFileSync(file) });
    emitted.set(file, reference);
    context.addWatchFile(file);
    if (/\.(json|scene|prefab|mat|tex)$/.test(file)) {
      let data;
      try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return reference; }
      const base = path.dirname(file);
      const visit = value => {
        if (typeof value === "string" && value.length < 1024 && !/^(?:[a-z]+:|\/|#)/i.test(value)) {
          const candidate = path.resolve(base, value.split(/[?#]/)[0]);
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) emit(context, candidate);
        } else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") Object.values(value).forEach(visit);
      };
      visit(data);
      for (const record of [...(Array.isArray(data.files) ? data.files : []), ...(Array.isArray(data.generatedResources) ? data.generatedResources : [])]) {
        if (typeof record.path !== "string" || /^[a-z]+:/i.test(record.path)) continue;
        const candidate = path.resolve(base, record.path);
        if (!fs.existsSync(candidate)) throw new Error(`Missing resource ${record.path} in ${relative}`);
        emit(context, candidate);
      }
    }
    if (/physx\.release(?:\.simd)?\.js$/.test(file)) emit(context, file.replace(/\.js$/, ".wasm"));
    return reference;
  }
  return {
    name: "world-project-resources",
    enforce: "pre",
    configResolved(config) { building = config.command === "build"; },
    buildStart() { emitted.clear(); },
    load(id) {
      if (!building) return null;
      const [file, query] = id.split("?");
      if (!new URLSearchParams(query).has("url") || file.includes("/node_modules/") || !path.isAbsolute(file)) return null;
      if (!fs.existsSync(file)) throw new Error(`Missing URL asset: ${file}`);
      return `export default import.meta.ROLLUP_FILE_URL_${emit(this, file)};`;
    }
  };
}
