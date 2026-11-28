import fs from "node:fs";
import path from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

const minSavingsBytes = 512;
const minSavingsFraction = 0.05;

function encodingWeights(header = "") {
  const weights = new Map();
  for (const item of header.toLowerCase().split(",")) {
    const match = /^\s*([\w*-]+)\s*(?:;\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/.exec(item);
    if (match) weights.set(match[1], Number(match[2] ?? 1));
  }
  return weights;
}

export function meshBrotliPlugin() {
  return {
    name: "world-mesh-brotli",
    enforce: "post",
    generateBundle(_, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset" || !asset.fileName.endsWith(".glb")) continue;
        const source = asset.source;
        if (source.length <= minSavingsBytes) continue;
        const compressed = brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 8 } });
        const saved = source.length - compressed.length;
        if (saved >= minSavingsBytes && saved >= source.length * minSavingsFraction) {
          this.emitFile({ type: "asset", fileName: asset.fileName + ".br", source: compressed });
        }
      }
    },
    configurePreviewServer(server) {
      const dir = path.resolve(server.config.root, server.config.build.outDir);
      const base = server.config.base === "./" ? "/" : server.config.base || "/";
      server.middlewares.use(base, (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const [pathname] = req.url.split("?", 1);
        if (!pathname.endsWith(".glb")) return next();
        let file;
        try {
          file = path.resolve(dir, "." + decodeURI(pathname));
        } catch {
          return next();
        }
        if (!file.startsWith(dir + path.sep)) return next();
        res.appendHeader("Vary", "Accept-Encoding");
        const weights = encodingWeights(req.headers["accept-encoding"]);
        const br = weights.get("br") ?? weights.get("*") ?? 0;
        const explicitIdentity = weights.get("identity");
        const identity = explicitIdentity ?? (weights.get("*") === 0 ? 0 : 1);
        // Keep ranges in original GLB byte offsets whenever identity is acceptable.
        const prefersBrotli = br > 0 && br >= (explicitIdentity ?? 0);
        if (prefersBrotli && (!req.headers.range || identity === 0) && fs.existsSync(file + ".br")) {
          // Vite serves the selected file with its own MIME type, encoding, length and validator.
          req.url = pathname + ".br" + req.url.slice(pathname.length);
        } else if (identity === 0 && fs.existsSync(file)) {
          res.writeHead(406).end();
          return;
        }
        next();
      });
    }
  };
}
