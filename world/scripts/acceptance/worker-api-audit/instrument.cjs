const { createRequire } = require("node:module");
const req = createRequire(require("node:path").resolve(__dirname, "../../../../package.json"));
const ts = req("typescript");
const definitions = {
  "PlanningNaturalVegetationRuntime.ts": [
    "PlanningNaturalVegetationRuntime.create",
    "PlanningNaturalVegetationRuntime.prepareTrees",
    "PlanningNaturalVegetationRuntime.prepareGrounding",
    "PlanningNaturalVegetationRuntime.preparePresentation",
    "PlanningNaturalVegetationRuntime.dispose"
  ],
  "PlanningNaturalVegetation.ts": ["PlanningNaturalVegetation.constructor", "PlanningNaturalVegetation.compileCell"],
  "PlanningSeedScenePublication.ts": [
    "PlanningSeedScenePublication.prepare",
    "PlanningSeedScenePublication.prepareContent"
  ],
  "PlanningRasterClient.ts": ["PlanningRasterClient.run"],
  "SeedWorldTerrainRuntime.ts": ["SeedWorldTerrainRuntime.create", "SeedWorldTerrainRuntime.dispose"],

  "PlanningFarmingRuntime.ts": ["PlanningFarmingRuntime.refreshWater"],
  "FarmingService.ts": ["FarmingService.refreshItemsGround"],
  "PlanningProjectSource.ts": [
    "validatePlanningProject",
    "planningSourceDocument",
    "planningVegetationReferences",
    "readPlanningProjectSource"
  ],
  "runtime-instance-source.ts": ["RuntimeInstanceSource.constructor", "readSourcePrefab"],
  "runtime-prepared-asset.ts": ["prepareAssetInputs", "withPreparedAsset", "compilePreparedAsset"],
  "WaterMaterial.ts": ["prepareWaterMaterial", "resolveWaterMaterialLook"],
  "SpatialDocument.ts": ["applySpatialCommands"],
  "runtime-project-edit.ts": [
    "RuntimeProjectEdit.constructor",
    "RuntimeProjectEdit.preview",
    "RuntimeProjectEdit.refreshDependencies",
    "RuntimeProjectEdit.finish"
  ],
  "runtime-project-dependencies.ts": [
    "RuntimeDependencyMaintenance.constructor",
    "RuntimeDependencyMaintenance.remember",
    "RuntimeDependencyMaintenance.accept",
    "RuntimeDependencyMaintenance.refresh",
    "invalidateChangedDependencies"
  ],
  "runtime-project.ts": ["cloneRuntimeProjectPackage", "validateRuntimeProject"],
  "runtime-scene-edit.ts": [
    "RuntimeSceneEdit.parse",
    "RuntimeSceneEdit.queryComponents",
    "RuntimeSceneEdit.readEntity",
    "RuntimeSceneEdit.readComponent"
  ],
  "runtime-project-compiler.ts": ["compileProjectResource", "compileProjectResources", "prepareProjectSources"],
  "runtime-scene-projection.ts": ["RuntimeSceneProjection.validate", "RuntimeSceneProjection.apply"],
  "runtime-project-session.ts": [
    "RuntimeProjectSession.resources",
    "RuntimeProjectSession.validateCandidate",
    "RuntimeProjectSession.commitPackage",
    "RuntimeProjectSession.compileScripts"
  ],
  "runtime-editor.ts": ["prepare"],
  "SeedWorldProjectEdit.ts": ["prepare", "commit", "activate"],
  "agent-loop.ts": ["validateScriptApiReferences"]
};
function instrument(body, file) {
  body = body.replace(/\n\/\/# sourceMappingURL=.*$/s, "");
  const ast = ts.createSourceFile(file, body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS),
    edits = [],
    hits = [];
  const visit = (node) => {
    let name;
    if (ts.isFunctionDeclaration(node) && node.name) name = node.name.text;
    else if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node))
      name =
        (node.parent.name?.text || "") +
        "." +
        (ts.isConstructorDeclaration(node) ? "constructor" : node.name.getText(ast));
    else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      if (ts.isPropertyAssignment(node.parent) || ts.isVariableDeclaration(node.parent))
        name = node.parent.name.getText(ast);
    }
    if (name && definitions[file]?.includes(name) && node.body && ts.isBlock(node.body)) {
      let label =
        file === "runtime-editor.ts"
          ? "RuntimeEditor." + name
          : file === "SeedWorldProjectEdit.ts"
            ? "SeedEdit." + name
            : name;
      const async = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
      edits.push([
        node.body.getStart(ast) + 1,
        `const __checksToken=globalThis.__checksStart?.(${JSON.stringify(label)},${async});try{`
      ]);
      edits.push([node.body.end - 1, `}finally{globalThis.__checksEnd?.(__checksToken);}`]);
      hits.push(label);
    }
    if (file === "PlanningProjectSource.ts" && name === "writePlanningProjectSource") {
      edits.push([node.body.getStart(ast) + 1, "globalThis.__sourceWriting=(globalThis.__sourceWriting||0)+1;try{"]);
      edits.push([node.body.end - 1, "}finally{globalThis.__sourceWriting--;}"]);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  for (const [at, text] of edits.sort((a, b) => b[0] - a[0])) body = body.slice(0, at) + text + body.slice(at);
  if (file === "runtime-editor.ts")
    body += `\n{const original=RuntimeEditor.prototype.registerPreparation;RuntimeEditor.prototype.registerPreparation=function(fn,...options){const n=this.__checksPreparationIndex=(this.__checksPreparationIndex||0)+1;return original.call(this,async function(...args){const token=globalThis.__checksStart?.('Preparation.'+n+'.'+(fn.name||'anonymous'),true);try{return await fn.apply(this,args)}finally{globalThis.__checksEnd?.(token)}},...options)}}`;
  if (file === "agent-worker-checker.ts") {
    const anchor = /if \(data.id === id\)\s*finish\(data.error\);/;
    if (!anchor.test(body)) throw Error("checker response anchor");
    body = body.replace(
      anchor,
      `if(data.__checksWorker)globalThis.__checksWorkerResults?.push({...data.__checksWorker,phase:globalThis.__checksPhase});if (data.id === id) finish(data.error);`
    );
    body += `\n{const original=WorkerAgentScriptChecker.prototype.check;WorkerAgentScriptChecker.prototype.check=function(...args){const t=performance.now();const result=original.apply(this,args);const sync=performance.now()-t;const phase=globalThis.__checksPhase;result.then(error=>globalThis.__checksWorkers?.push({phase,start:t,ms:performance.now()-t,sync,error:error?.code,source:args[0],declarations:args[1].length}));return result;}}`;
  }
  if (file === "AgentChecker.worker.ts") {
    body = body.replace(
      "globalThis.postMessage({ id: data.id, error: validateAgentScriptReferences(data.source, data.toolNames) });",
      'const t=performance.now();const error=validateAgentScriptReferences(data.source,data.toolNames);globalThis.postMessage({id:data.id,error,__checksWorker:{id:data.id,mode:"preflight",ms:performance.now()-t}});'
    );
    const anchor = "globalThis.postMessage({ id: data.id, error: checker.check(data.source, data.declarations) });";
    if (!body.includes(anchor)) throw Error("worker anchor");
    body = body.replace(
      anchor,
      `const __start=performance.now();const error=checker.check(data.source,data.declarations);globalThis.postMessage({id:data.id,error,__checksWorker:{id:data.id,ms:performance.now()-__start}});`
    );
  }
  if (file === "runtime-project-edit.ts")
    body += `\n{const original=RuntimeProjectEdit.prototype.update;RuntimeProjectEdit.prototype.update=function(path,content,...args){if(globalThis.__sourceWriting){const before=this.read(path);globalThis.__sourceWrites.push({phase:globalThis.__checksPhase,path,bytes:typeof content==='string'?content.length:content.byteLength,unchanged:before===content});}return original.call(this,path,content,...args)}}`;
  return { body, hits };
}
module.exports = {
  instrument,
  files: [...Object.keys(definitions), "agent-worker-checker.ts", "AgentChecker.worker.ts"]
};
