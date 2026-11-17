import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import config from "../../../vite.config.mjs";
import { instrumentPreparationDiagnostics } from "./diagnostic-instrumentation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(path.join(root, "world/package.json"));
const { createServer } = require("vite");
const variant = process.env.BENCH_VARIANT;
const out = process.env.BENCH_OUTPUT;
if (!["before", "after"].includes(variant) || !out) throw Error("Set BENCH_VARIANT=before|after and BENCH_OUTPUT");
const shared = process.env.BENCH_SHARED_SNAPSHOT
  ? JSON.parse(fs.readFileSync(process.env.BENCH_SHARED_SNAPSHOT, "utf8"))
  : {};
const baseline = process.env.BENCH_BASE_SNAPSHOT
  ? JSON.parse(fs.readFileSync(process.env.BENCH_BASE_SNAPSHOT, "utf8"))
  : undefined;
const replacements = new Map(
  JSON.parse(
    shared["packages/modify/native-overrides.json"] ??
      fs.readFileSync(path.join(root, "packages/modify/native-overrides.json"), "utf8")
  ).map(({ original, replacement }) => [original, replacement])
);
const paths = [
  "packages/project/src/runtime-editor/project/runtime-project-edit.ts",
  "packages/runtime-editor/src/runtime-editor/runtime-editor.ts",
  "packages/runtime-editor/src/runtime-editor/scene/runtime-scene-projection.ts",
  "packages/runtime-editor/src/runtime-editor/scene/runtime-scene-changes.ts",
  "packages/runtime-editor/src/runtime-editor/scene/runtime-scene-edit.ts",
  "packages/runtime-editor/src/project/runtime-project-history.ts",
  "packages/runtime-editor/src/project/runtime-project-session.ts",
  "packages/world-planning/src/spatial/runtime/NativeWaterHost.ts",
  "packages/runtime-editor/src/runtime-editor/runtime-preparation-context.ts",
  "world/demos/seed-world/SeedWorldDemo.ts",
  "world/demos/seed-world/masonry/BuildingSceneInitialization.ts"
];
const frozen = new Map();
for (const file of paths) {
  if (variant === "before" && baseline && baseline[file] === undefined) continue;
  if (variant === "before" && !baseline) {
    try {
      execFileSync("git", ["cat-file", "-e", `HEAD:${file}`], { cwd: root, stdio: "ignore" });
    } catch {
      // A newly added implementation module has no HEAD counterpart.
      continue;
    }
  }
  const content =
    variant === "before"
      ? (baseline?.[file] ?? execFileSync("git", ["show", `HEAD:${file}`], { cwd: root, encoding: "utf8" }))
      : fs.readFileSync(path.join(root, file), "utf8");
  frozen.set(path.join(root, file), content);
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, variant + "-implementation.json"),
  JSON.stringify(Object.fromEntries([...frozen].map(([file, content]) => [path.relative(root, file), content])))
);
fs.writeFileSync(
  path.join(out, variant + "-source.json"),
  JSON.stringify(
    {
      variant,
      baselineSnapshot: process.env.BENCH_BASE_SNAPSHOT,
      sharedSnapshot: process.env.BENCH_SHARED_SNAPSHOT,
      head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      files: Object.fromEntries(
        [...frozen].map(([file, content]) => [
          path.relative(root, file),
          createHash("sha256").update(content).digest("hex")
        ])
      )
    },
    null,
    2
  )
);
const plugin = {
  name: "incremental-scene-benchmark",
  enforce: "pre",
  load(id) {
    const file = id.split("?")[0];
    const feature = frozen.get(file);
    if (feature !== undefined) return feature;
    // Preserve engineModify's native-path module identities and replacement
    // bytes. Vite still owns worker/url query handling and the normal transforms.
    const relative = path.relative(root, file);
    const code = shared[replacements.get(relative) ?? relative];
    const query = id.split("?")[1];
    if (query === "raw" && code !== undefined) return `export default ${JSON.stringify(code)};`;
    if (query) return;
    return code;
  },
  transform(code, id) {
    const file = id.split("?")[0];
    if (process.env.BENCH_DIAGNOSTICS === "1") code = instrumentPreparationDiagnostics(code, file);
    if (file.endsWith("/SeedWorldDemo.ts")) {
      const anchor = "pickPreparation = new RuntimePickPreparation(engine);";
      if (!code.includes(anchor)) throw Error("Missing Seed World diagnostic anchor");
      return code.replace(
        anchor,
        "globalThis.__sceneBenchHost = {engine, get tools(){return tools}, get ready(){return ready}};" + anchor
      );
    }
    if (file.endsWith("/SeedWorldChatPanel.ts")) {
      const anchor = "const session = new AIChatSession(";
      if (!code.includes(anchor)) throw Error("Missing Seed World configuration anchor");
      return code.replace(anchor, "globalThis.__sceneBenchConfiguration = configuration;" + anchor);
    }
    if (file.endsWith("/runtime-editor.ts")) {
      code = code.replace(
        "preparationViews?.current(draft!)",
        "globalThis.__sceneBenchCall('prepare.context',()=>preparationViews?.current(draft!))"
      );
      code = code.replace(
        "context.affected(registration.dependencies)",
        "globalThis.__sceneBenchCall('prepare.selection.'+registration.name,()=>context.affected(registration.dependencies))"
      );
      const parts = [
        [
          code.includes("await prepare(edit, preparationSignal, context)")
            ? "await prepare(edit, preparationSignal, context)"
            : "await prepare(edit, preparationSignal)",
          "prepare.extension"
        ],
        ["this.project.compileScripts(scripts, operationSignal, false, draft!.preview())", "prepare.compileScripts"],
        ["draft!.refreshDependencies(true)", "prepare.dependencies"],
        ["compileProjectResourcesAsync(preview, () => checkpoint(preparationSignal))", "prepare.compileResources"],
        ["draft!.finish()", "prepare.finish"],
        ["installRuntimeProjectScripts(this.project, signal)", "activate.installScripts"],
        [
          "this.resources.apply(this.scene.engine.resourceManager, await this.project.resources(signal), signal)",
          "activate.resources"
        ]
      ];
      for (const [expression, name] of parts) {
        if (!code.includes(expression)) throw Error("Missing timing anchor: " + name);
        const awaited = expression.startsWith("await ");
        const call = awaited ? expression.slice(6) : expression;
        code = code.replace(
          expression,
          `${awaited ? "await " : ""}globalThis.__sceneBenchCall('${name}', ${call.includes("await ") ? "async " : ""}() => ${call})`
        );
      }
      return (
        code +
        `
      {const register=RuntimeEditor.prototype.registerPreparation;
       const indices=new WeakMap();
       RuntimeEditor.prototype.registerPreparation=function(prepare,scope){
         const index=indices.get(this)||0;indices.set(this,index+1);
         const name=scope?.name||['native-water','planning-water','planning-validation','building-initialization'][index]||String(index);
         const wrapped=(...args)=>globalThis.__sceneBenchCall('prepare.extension.'+name,()=>prepare(...args));
         return register.call(this,wrapped,scope);
       };}
      {const begin=RuntimeEditor.prototype.beginEdit; RuntimeEditor.prototype.beginEdit=function(...args){
        const edit=begin.apply(this,args);
        for(const key of ['prepare','commit','activate']){const fn=edit[key];edit[key]=function(...args){return globalThis.__sceneBenchCall('native.'+key,()=>fn.apply(this,args))}}
        return edit;
      }}
    `
      );
    }
    if (file.endsWith("/runtime-project-session.ts")) {
      for (const key of ["before", "apply", "finish", "after"]) {
        const expression =
          key === "before"
            ? "participant.before(operation)"
            : key === "finish"
              ? "participant.finish?.()"
              : `participant.${key}${key === "apply" ? "?." : ""}(operation)`;
        if (!code.includes(expression)) throw Error("Missing host phase " + key);
        code = code.replace(expression, `globalThis.__sceneBenchCall('host.${key}',()=>${expression})`);
      }
      return (
        code +
        `
        for(const key of ['publish','validateCandidate','withDependencies','resources','historyPatch']){const fn=RuntimeProjectSession.prototype[key];if(fn)RuntimeProjectSession.prototype[key]=function(...args){return globalThis.__sceneBenchCall('project.'+key,()=>fn.apply(this,args))}}
      `
      );
    }
    if (file.endsWith("/runtime-preparation-context.ts")) {
      code = code.replace(
        "new RuntimePreparationScene(content)",
        "globalThis.__sceneBenchCall('prepare.view.parse',()=>new RuntimePreparationScene(content))"
      );
      return code;
    }
    if (file.endsWith("/runtime-edit-work.ts"))
      return (
        code +
        `
      {const factory=runtimeEditWork;runtimeEditWork=function(...args){const checkpoint=factory(...args);return function(...args){const result=checkpoint(...args);return result?globalThis.__sceneBenchCall('scheduler.yield',()=>result):result}}}
    `
      );
    if (file.endsWith("/runtime-scene-projection.ts")) {
      code = code.replaceAll(
        "this.assetChanges.affected(pack)",
        "globalThis.__sceneBenchAssets(this.assetChanges.affected(pack))"
      );
      const anchor = "const changes = prepared?.changes;";
      const incremental = code.includes(anchor);
      if (incremental) {
        if (!code.includes(anchor)) throw Error("Missing incremental path anchor");
        code = code.replace(
          anchor,
          anchor +
            "globalThis.__sceneBenchMode?.(prepared ? 'incremental' : 'full', changes ? {entities:changes.entities.size,components:changes.components.size} : undefined, {hadPlan:!!candidate,baselineMatched:candidate?.baseline===this.records,recovery:this.needsResync});"
        );
      }
      code = code.replace(
        /new RuntimeSceneRecords\(source, runtime(?:, this.records, journal)?\)/g,
        (expression) => `globalThis.__sceneBenchCall('projection.indexes',()=>${expression})`
      );
      code = code.replace(
        /new RuntimeSceneChanges\(this.records, records(?:, journal)?\)/g,
        (expression) => `globalThis.__sceneBenchCall('projection.netChanges',()=>${expression})`
      );
      return (
        code +
        `
        for(const key of ['validate','prepare','apply','bindingsUnchanged']){const fn=RuntimeSceneProjection.prototype[key];if(fn)RuntimeSceneProjection.prototype[key]=function(...args){
          ${!incremental ? "if(key==='apply')globalThis.__sceneBenchMode?.('full');" : ""}
          return globalThis.__sceneBenchCall('projection.'+key,()=>{const result=fn.apply(this,args);if(key==='prepare')globalThis.__sceneBenchPlan?.({journal:!!args[2],baseMatched:args[2]?.before===this.appliedSceneContent,targetMatched:args[2]?.after===args[0].contents[this.path],eligible:this.preparations.has(result),recovery:this.needsResync});if(key==='bindingsUnchanged')globalThis.__sceneBenchGuard?.(result);return result;});
        }}
      `
      );
    }
    return code;
  }
};
const server = await createServer({
  ...config,
  configFile: false,
  worker: {
    ...config.worker,
    plugins: [{ name: "benchmark-worker-source", enforce: "pre", load: plugin.load }, ...config.worker.plugins]
  },
  plugins: [plugin, ...config.plugins],
  cacheDir: path.join(out, "vite-" + variant),
  server: {
    ...config.server,
    open: false,
    port: Number(process.env.BENCH_PORT),
    strictPort: true,
    watch: null,
    hmr: false
  }
});
// Older Vite releases ignore watch:null. Frozen trials must not invalidate
// module URLs when another checkout task edits a watched source file.
await server.watcher.close();
await server.listen();
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
