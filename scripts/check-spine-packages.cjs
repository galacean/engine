// Run after `npm run build`. Uses actual packed artifacts in a clean directory, outside the workspace.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const { rollup } = require("rollup");
const resolve = require("@rollup/plugin-node-resolve").default;
const commonjs = require("@rollup/plugin-commonjs");
const { chromium } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "galacean-spine-packages-"));
const packs = path.join(temp, "packs");
fs.mkdirSync(packs);
const workspace = new Map();
for (const directory of fs.readdirSync(path.join(root, "packages"))) {
  const location = path.join(root, "packages", directory);
  const file = path.join(location, "package.json");
  if (fs.existsSync(file)) {
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    workspace.set(manifest.name, { location, manifest });
  }
}
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, stdio: "pipe", shell: process.platform === "win32" });
const tarballs = new Map();
function dependenciesFor(names, result = new Set()) {
  for (const name of names) {
    if (result.has(name) || !workspace.has(name)) continue;
    result.add(name);
    const { manifest } = workspace.get(name);
    dependenciesFor(Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }), result);
  }
  return result;
}
function pack(name) {
  if (tarballs.has(name)) return tarballs.get(name);
  const { location, manifest } = workspace.get(name);
  run("pnpm", ["pack", "--pack-destination", packs], location);
  const file = path.join(packs, `${name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`);
  assert(fs.existsSync(file));
  tarballs.set(name, file);
  return file;
}
function install(versions, directory) {
  const names = dependenciesFor(["@galacean/engine-spine", ...versions.map((v) => `@galacean/engine-spine-core-${v}`)]);
  const dependencies = Object.fromEntries([...names].map((name) => [name, `file:${pack(name)}`]));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({ name: "spine-package-consumer", private: true, version: "1.0.0", dependencies })
  );
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], directory);
}
function diagnostics(file) {
  const program = ts.createProgram([file], {
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    types: []
  });
  return ts.getPreEmitDiagnostics(program).map((d) => ({
    file: d.file?.fileName,
    code: d.code,
    start: d.start,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n")
  }));
}
function checkTypes(directory, versions) {
  const baseline = path.join(directory, "engine-baseline.ts");
  fs.writeFileSync(baseline, 'import "@galacean/engine";');
  const known = diagnostics(baseline);
  assert(
    !fs.existsSync(path.join(directory, "node_modules/@galacean/engine-spine/types/runtime/SpineObjects.d.ts")),
    "Obsolete contract declarations must not be published"
  );
  const consumer = path.join(directory, "consumer.ts");
  const typeRoot = path.join(directory, "node_modules/@galacean/engine-spine/types");
  for (const file of [
    "SpineAnimation.d.ts",
    "SpineAnimationState.d.ts",
    "SpineAnimationStateData.d.ts",
    "SpineAnimationStateListener.d.ts",
    "SpineBone.d.ts",
    "SpinePhysics.d.ts",
    "SpinePhysicsConstraint.d.ts",
    "SpineSkeleton.d.ts",
    "SpineSkeletonData.d.ts",
    "SpineSkin.d.ts",
    "SpineTrackEntry.d.ts",
    "loader/SpineResource.d.ts",
    "renderer/SpineAnimationRenderer.d.ts"
  ]) {
    assert(
      !fs.readFileSync(path.join(typeRoot, file), "utf8").includes("engine-design"),
      `User API must not expose backend contracts: ${file}`
    );
  }
  fs.writeFileSync(
    consumer,
    `
import { SpineAnimationRenderer, SpineResource, SpineSkeleton, SpineAnimationState } from '@galacean/engine-spine';
import type { ISpineSkeleton as DesignSkeleton, ISpineRuntime as DesignRuntime } from '@galacean/engine-design';
import type { Texture2D } from '@galacean/engine';
import type { ISpineRenderTarget } from '@galacean/engine-spine';
// @ts-expect-error Backend contracts are imported directly from engine-design.
import type { ISpineRuntime } from '@galacean/engine-spine';
${versions.map((v) => `import { Spine${v.replace(".", "")}Runtime } from '@galacean/engine-spine-core-${v}';\nconst runtime${v.replace(".", "")}: DesignRuntime<Texture2D, ISpineRenderTarget> = new Spine${v.replace(".", "")}Runtime();`).join("\n")}
declare const renderer: SpineAnimationRenderer;
declare const resource: SpineResource;
const skeleton: SpineSkeleton = renderer.skeleton;
const state: SpineAnimationState = renderer.state;
// @ts-expect-error Public objects cannot be passed to the backend as native handles.
const designSkeleton: DesignSkeleton = skeleton;
// @ts-expect-error Backend handles are not part of the public API.
resource.skeletonData._native;
// @ts-expect-error Resources are loaded, not constructed from backend handles.
new SpineResource();
skeleton.setSkinByName('default');
skeleton.setSlotsToSetupPose();
const composite = resource.createSkin('custom');
const skin = resource.skeletonData.findSkin('alt');
if (skin) composite.addSkin(skin);
if (skin) skeleton.setSkin(skin);
const bone = skeleton.findBone('root');
if (bone) bone.rotation += 10;
const entry = state.setAnimation(0, 'idle', true);
entry.listener = { complete(track) { const time: number = track.trackTime; } };
state.addListener({ event(track, event) { const name: string = event.data.name; } });
resource.stateData.setMix('idle', 'walk', 0.2);
if (renderer.physics?.supported) {
  renderer.physics.value.physicsTranslate(1, 2);
  renderer.physics.value.physicsConstraints.forEach(c => c.reset());
}
// @ts-expect-error Physics is a capability, not an unconditional skeleton method.
skeleton.physicsTranslate(1, 2);
// @ts-expect-error Unknown calls must not become any through a missing declaration dependency.
state.methodThatDoesNotExist();
// @ts-expect-error No capability value before narrowing support.
renderer.physics.value.physicsTranslate(1, 2);
// @ts-expect-error Playback names must be strings.
state.setAnimation(0, 123, true);
`
  );
  const key = (d) => JSON.stringify(d);
  const baselineKeys = new Set(known.map(key));
  const added = diagnostics(consumer).filter((d) => !baselineKeys.has(key(d)));
  assert.deepEqual(added, [], "Packed Spine declarations added errors over the engine-only baseline");
  console.log(
    `Types ${versions.join("+") || "shared"}: PASS (strict, skipLibCheck=false; ${known.length} existing engine-only diagnostics)`
  );
}

async function checkSingleBackendBundle(directory, version) {
  const other = version === "3.8" ? "4.2" : "3.8";
  const entry = path.join(directory, "single-backend.js");
  fs.writeFileSync(entry, `import '@galacean/engine-spine-core-${version}';`);
  const bundle = await rollup({
    input: entry,
    plugins: [resolve({ mainFields: ["module", "main"] }), commonjs()],
    onwarn(warning, warn) {
      if (warning.code === "UNRESOLVED_IMPORT") throw new Error(warning.message);
      if (warning.code !== "CIRCULAR_DEPENDENCY") warn(warning);
    }
  });
  const { output } = await bundle.generate({ format: "es" });
  assert(!bundle.cache.modules.some((module) => module.id.includes(`engine-spine-core-${other}`)));
  assert(
    !bundle.cache.modules.some((module) => /node_modules[\\/]@galacean[\\/]engine-design[\\/]/.test(module.id)),
    "Type-only contracts must not introduce engine-design runtime imports"
  );
  assert(
    !output.some((chunk) => chunk.type === "chunk" && chunk.code.includes(`Spine${other.replace(".", "")}Runtime`))
  );
  await bundle.close();
  console.log(`Bundle ${version}: PASS (unused backend absent)`);
}

async function checkBrowser(directory, first, format, baseURL) {
  const second = first === "3.8" ? "4.2" : "3.8";
  const entry = path.join(directory, `entry-${first}-${format}.js`);
  const output = path.join(directory, `bundle-${first}-${format}`);
  fs.writeFileSync(
    entry,
    `
import { WebGLEngine, Camera, Color } from '@galacean/engine';
import { SpineAnimationRenderer, getSpineRuntime } from '@galacean/engine-spine';
import '@galacean/engine-spine-core-${first}';
(async () => {
  let engine;
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    document.body.appendChild(canvas);
    engine = await WebGLEngine.create({canvas, graphicDeviceOptions:{preserveDrawingBuffer:true}});
    const root = engine.sceneManager.activeScene.createRootEntity();
    const cameraEntity = root.createChild(); cameraEntity.transform.setPosition(0,0,3);
    const camera = cameraEntity.addComponent(Camera); camera.isOrthographic=true; camera.orthographicSize=1; camera.enableHDR=false;
    engine.sceneManager.activeScene.background.solidColor=new Color(0,0,0,1);
    const load = v => engine.resourceManager.load({url:'/fixtures/'+v+'.json',type:'Spine'});
    const attach = resource => { const entity=resource.instantiate();root.addChild(entity);return entity.getComponent(SpineAnimationRenderer); };
    function visible() {
      engine.update(); const gl=canvas.getContext('webgl2');const pixels=new Uint8Array(128*128*4);
      gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let lit=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>30)lit++;
      if(gl.getError()!==0||lit<100)throw new Error('Expected visible geometry, got '+lit);
      return lit;
    }
    const a=await load('${first}');const a1=attach(a);const before=visible();
    let registeredEarly = false;
    try { getSpineRuntime('${second}'); registeredEarly = true; } catch {}
    if (registeredEarly) throw new Error('Dynamic backend was evaluated before its import');
    await import('@galacean/engine-spine-core-${second}');
    const afterRegistration=visible();
    const b=await load('${second}');const b1=attach(b);const a2=attach(a);
    const b2=b1.entity.clone().getComponent(SpineAnimationRenderer);root.addChild(b2.entity);
    for(const renderer of [a1,a2,b1,b2])renderer.update(0);
    if(a1.skeleton.data!==a2.skeleton.data||a1.skeleton===a2.skeleton||a1.state===a2.state)throw new Error('Wrong instance ownership');
    if(a1.physics.supported!==('${first}'==='4.2')||b2.physics.supported!==('${second}'==='4.2'))throw new Error('Wrong physics support');
    a1.entity.destroy();engine.resourceManager.gc();const afterDestroy=visible();
    window.result={before,afterRegistration,afterDestroy};
  } catch(error) { window.result={error:error.stack||String(error)}; }
  finally { engine?.destroy(); }
})();`
  );
  const bundle = await rollup({
    input: entry,
    preserveEntrySignatures: false,
    plugins: [resolve({ mainFields: format === "esm" ? ["module", "main"] : ["main"] }), commonjs()],
    onwarn(warning, warn) {
      if (warning.code !== "CIRCULAR_DEPENDENCY") warn(warning);
    }
  });
  const modules = [...bundle.cache.modules].map((m) => m.id.replaceAll("\\", "/"));
  assert(
    !modules.some((id) => id.includes("node_modules/@esotericsoftware/spine-core/")),
    "4.2 runtime JS must remain bundled with its ES5 adapter"
  );
  await bundle.write({ dir: output, format: "es", entryFileNames: "entry.js" });
  await bundle.close();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(baseURL);
    await page.addScriptTag({
      type: "module",
      url: `${baseURL}/${path.relative(temp, output).split(path.sep).join("/")}/entry.js`
    });
    await page.waitForFunction(() => window.result, null, { timeout: 30000 });
    const result = await page.evaluate(() => window.result);
    assert(!result.error, result.error);
    console.log(`Browser ${format} ${first}->${second}: PASS ${JSON.stringify(result)}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  const shared = path.join(temp, "shared");
  install([], shared);
  checkTypes(shared, []);
  for (const version of ["3.8", "4.2"]) {
    const directory = path.join(temp, version);
    install([version], directory);
    checkTypes(directory, [version]);
    await checkSingleBackendBundle(directory, version);
    const lock = JSON.parse(fs.readFileSync(path.join(directory, "package-lock.json"), "utf8"));
    const installed = Object.keys(lock.packages);
    const other = version === "3.8" ? "4.2" : "3.8";
    assert(!installed.some((name) => name.endsWith(`engine-spine-core-${other}`)));
    if (version === "3.8") assert(!installed.some((name) => name.endsWith("@esotericsoftware/spine-core")));
    console.log(`Install ${version}: PASS (unused backend absent)`);
  }
  const both = path.join(temp, "both");
  install(["3.8", "4.2"], both);
  checkTypes(both, ["3.8", "4.2"]);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end("<body></body>");
      return;
    }
    const file = url.pathname.startsWith("/fixtures/")
      ? path.join(root, "tests/src/spine", url.pathname.slice(1))
      : path.join(temp, url.pathname.slice(1));
    if (!fs.existsSync(file)) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript" : file.endsWith(".png") ? "image/png" : "text/plain"
    );
    response.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    for (const first of ["3.8", "4.2"])
      for (const format of ["esm", "cjs"]) {
        await checkBrowser(both, first, format, `http://127.0.0.1:${server.address().port}`);
      }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  fs.rmSync(temp, { recursive: true, force: true });
})().catch((error) => {
  console.error(error);
  console.error(`Failed consumer artifacts retained at ${temp}`);
  process.exitCode = 1;
});
