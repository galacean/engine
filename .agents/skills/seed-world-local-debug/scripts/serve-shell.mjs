// Start the Engine dev server with a matching, locally built shell and SDK.
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const [engineRoot, shellRoot] = process.argv.slice(2);
if (!engineRoot || !shellRoot || process.argv.length !== 4) {
  throw new Error("Usage: node serve-shell.mjs ENGINE_ROOT SHELL_ROOT");
}
// flash-app's development configuration serves this exact origin and /app.html.
const origin = "http://localhost:5173";
const mount = "/__seed_world_shell";
const game = "/world/demos/seed-world/";
const world = path.resolve(engineRoot, "world");
const requireWorld = createRequire(path.join(world, "package.json"));
const vitePackage = requireWorld.resolve("vite/package.json");
const viteEntry = requireWorld(vitePackage).exports["."].import;
const { createServer } = await import(pathToFileURL(path.resolve(path.dirname(vitePackage), viteEntry)));
const stage = await mkdtemp(path.join(tmpdir(), "seed-world-shell-"));
const bundle = path.join(stage, mount.slice(1));
try {
  const viteBin = path.resolve(shellRoot, "node_modules/vite/bin/vite.js");
  execFileSync(process.execPath, [viteBin, "build", "--outDir", bundle], {
    cwd: shellRoot, env: { ...process.env, NODE_ENV: "development" }, stdio: "inherit"
  });
  await mkdir(path.join(bundle, "base"), { recursive: true });
  await copyFile(path.resolve(shellRoot, "dist/base/base.js"), path.join(bundle, "base/base.js"));
  const sdk = await readFile(path.join(bundle, "base/base.js"), "utf8");
  const html = await readFile(path.join(bundle, "index.html"), "utf8");
  const entry = html.match(/<script\b[^>]*src="\.\/(assets\/[^"]+\.js)"/)?.[1];
  if (!entry || !sdk.includes("seedWorldStream") || !sdk.includes("seedWorldStop")) {
    throw new Error("Build the shell and its matching SDK before starting the preview");
  }
  const file = path.join(bundle, entry);
  const js = await readFile(file, "utf8");
  const sdkUrl = /https:\/\/[^"'`\s<>]+\/base\/base\.js/g;
  if (!js.includes("lingguang.ai.seedWorldStream") || !js.match(sdkUrl)) {
    throw new Error("Cannot identify the shell action mapping or injected SDK URL");
  }
  await writeFile(file, js.replace(sdkUrl, `${origin}${mount}/base/base.js`));
  const server = await createServer({
    configFile: path.join(world, "vite.config.mjs"),
    publicDir: stage,
    server: { origin, host: "localhost", port: 5173, strictPort: true, open: false },
    plugins: [{
      name: "local-seed-world-shell",
      enforce: "pre",
      load(id) {
        // The SDK includes the hosted save API. This AI preview uses the game's IndexedDB saves.
        if (id === path.join(world, "demos/seed-world/base.js")) {
          return `import { createLocalWorldDb } from "./storage/local-world-db.mjs";
            const entry = document.querySelector('meta[name="flash-app-html-url"]');
            if (entry) entry.content = "${origin}/app.html?aiChat=1&agentTrace=1";
            window.lingguang.db = createLocalWorldDb("seed-world-shell-debug");
            export const pageDatabase = { source: "local", importLegacyPreview: false };`;
        }
      },
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.split("?")[0] === "/app.html") {
            req.url = req.url.replace("/app.html", game + "index.html");
          }
          next();
        });
      },
      transformIndexHtml(html, ctx) {
        if (ctx.path === game + "index.html") {
          // The shell places the game HTML in an iframe with its own document URL.
          return html.replace("<head>", `<head><base href="${origin}${game}">`);
        }
      }
    }]
  });
  await server.listen();
  console.log(`app_shell_url=${origin}${mount}/index.html`);
  await new Promise(resolve => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await server.close();
} finally {
  await rm(stage, { recursive: true, force: true });
}
