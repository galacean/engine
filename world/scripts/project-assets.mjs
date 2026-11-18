import fs from "node:fs";
import path from "node:path";

/** Keep resource manifests next to their resources. Hashed JSON URLs alone lose
 * dynamically fetched dependencies that Rollup cannot see in the module graph. */
export function projectAssets(root) {
  const emitted = new Map();
  let building = false;
  let workerBuild = false;
  function emit(context, file) {
    if (emitted.has(file)) return emitted.get(file);
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (relative.startsWith("../") || path.isAbsolute(relative)) throw new Error(`Asset outside repository: ${file}`);
    const reference = context.emitFile({ type: "asset", fileName: relative, source: fs.readFileSync(file) });
    emitted.set(file, reference);
    context.addWatchFile(file);
    if (/\.(json|scene|prefab|mat|tex)$/.test(file)) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        return reference;
      }
      const base = path.dirname(file);
      const visit = (value) => {
        if (typeof value === "string" && value.length < 1024 && !/^(?:[a-z]+:|\/|#)/i.test(value)) {
          const candidate = path.resolve(base, value.split(/[?#]/)[0]);
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) emit(context, candidate);
        } else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") Object.values(value).forEach(visit);
      };
      visit(data);
      // This catalog is a virtual Project projection consumed with
      // resourcesRegistered=true; its physical resources belong to project.json.
      const virtualCatalog =
        relative ===
        "packages/vegetation/src/asset-assembly/generated/procedural-trees/plant-project-production-catalog.json";
      for (const record of [
        ...(Array.isArray(data.files) ? data.files : []),
        ...(!virtualCatalog && Array.isArray(data.generatedResources) ? data.generatedResources : [])
      ]) {
        if (typeof record.path !== "string" || /^[a-z]+:/i.test(record.path)) continue;
        const candidate = path.resolve(base, record.path);
        if (!fs.existsSync(candidate)) throw new Error(`Missing resource ${record.path} in ${relative}`);
        emit(context, candidate);
      }
    }
    if (/physx\.release(?:\.simd)?\.js$/.test(file)) emit(context, file.replace(/\.js$/, ".wasm"));
    return reference;
  }
  // Brotli files are decoded by the asset loader. HTTP decoding would consume
  // the compressed stream before the loader receives it.
  function serveApplicationBrotli(server) {
    server.middlewares.use((request, response, next) => {
      if (!request.url?.split("?", 1)[0].endsWith(".br")) return next();
      delete request.headers["if-none-match"];
      delete request.headers["if-modified-since"];
      const setHeader = response.setHeader.bind(response);
      response.setHeader = (name, value) => {
        const normalizedName = name.toLowerCase();
        if (normalizedName === "content-encoding") return response;
        if (normalizedName === "content-type") return setHeader(name, "application/octet-stream");
        return setHeader(name, value);
      };
      next();
    });
  }
  return {
    name: "world-project-resources",
    enforce: "pre",
    configureServer: serveApplicationBrotli,
    configurePreviewServer: serveApplicationBrotli,
    configResolved(config) {
      building = config.command === "build";
      workerBuild = config.isWorker === true;
    },
    resolveFileUrl({ referenceId, relativePath }) {
      if (workerBuild && [...emitted.values()].includes(referenceId)) {
        // Rollup's IIFE default uses document.currentScript, unavailable in a Worker.
        return `new URL(${JSON.stringify(relativePath)}, self.location.href).href`;
      }
    },
    buildStart() {
      emitted.clear();
    },
    transform(code, id) {
      if (!building || !/\.[cm]?[jt]sx?$/.test(id.split("?")[0]) || id.includes("/node_modules/")) return null;
      // Vite otherwise hashes static new URL(JSON) assets directly, bypassing
      // load(?url) and losing the manifest's dynamically fetched companions.
      const transformed = code.replace(
        /new URL\(\s*(["'])([^"']+\.json)\1\s*,\s*import\.meta\.url\s*\)/g,
        (expression, _quote, relative) => {
          const file = path.resolve(path.dirname(id.split("?")[0]), relative);
          if (!fs.existsSync(file)) return expression;
          return `new URL(import.meta.ROLLUP_FILE_URL_${emit(this, file)}, import.meta.url)`;
        }
      );
      return transformed === code ? null : { code: transformed, map: null };
    },
    load(id) {
      if (!building) return null;
      const [file, query] = id.split("?");
      if (!new URLSearchParams(query).has("url") || file.includes("/node_modules/") || !path.isAbsolute(file))
        return null;
      if (!fs.existsSync(file)) throw new Error(`Missing URL asset: ${file}`);
      return `export default import.meta.ROLLUP_FILE_URL_${emit(this, file)};`;
    }
  };
}
