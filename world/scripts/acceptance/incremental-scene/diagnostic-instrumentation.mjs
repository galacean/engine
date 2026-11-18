/** Optional, symmetric timing for preparation ablation experiments. No product changes. */
export function instrumentPreparationDiagnostics(code, file) {
  const replace = (anchor, replacement) => {
    if (!code.includes(anchor)) throw Error(`Missing diagnostic anchor in ${file}: ${anchor}`);
    code = code.replace(anchor, replacement);
  };
  if (file.endsWith("/runtime-prepared-asset.ts")) {
    replace("resources = order.map((path) => {", "resources = globalThis.__sceneBenchCall('asset.compile',()=>order.map((path) => {");
    replace("    });\n    unregister =", "    }));\n    unregister =");
    replace("manager.registerVirtualResources(resources)", "globalThis.__sceneBenchCall('asset.register',()=>manager.registerVirtualResources(resources))");
    replace("await manager.load<T>({ url: resolve(path) })", "await globalThis.__sceneBenchCall('asset.load',()=>manager.load<T>({ url: resolve(path) }))");
    replace("await use({ resource: resource!, content: pack.contents[path] })", "await globalThis.__sceneBenchCall('asset.use',()=>use({ resource: resource!, content: pack.contents[path] }))");
    replace("} finally {", "} finally { globalThis.__sceneBenchCall('asset.cleanup',()=>{");
    replace("for (const url of urls) URL.revokeObjectURL(url);", "for (const url of urls) URL.revokeObjectURL(url); });");
    code += `\n{const original=prepareAssetInputs;prepareAssetInputs=function(...args){return globalThis.__sceneBenchCall('asset.inputs',()=>original(...args))}}`;
  }
  if (file.endsWith("/runtime-editor.ts")) {
    if (process.env.BENCH_EXTRA_DETAIL === "1") {
      for (const [anchor, name] of [
        ["new RuntimePreparationViews(this.project.projectPackage)", "context.baseline"],
        ["new RuntimeProjectInputs(this.project.projectPackage, scope)", "legacy.baseline"],
        ["draft!.matchesInputs(inputs)", "prepare.legacySelection"]
      ]) {
        if (code.includes(anchor)) code = code.replace(anchor, `globalThis.__sceneBenchCall('${name}',()=>${anchor})`);
      }
    }
    code += `\n{const original=RuntimeEditor.prototype.beginEdit;RuntimeEditor.prototype.beginEdit=function(...args){
      const edit=original.apply(this,args),run=edit.run,withAsset=edit.withAsset;
      edit.run=function(callback,...rest){return run.call(this,(...values)=>globalThis.__sceneBenchCall('edit.callback',()=>callback(...values)),...rest)};
      edit.withAsset=function(...values){return globalThis.__sceneBenchCall('asset.total',()=>withAsset.apply(this,values))};
      return edit;
    }}`;
  }
  if (file.endsWith("/runtime-scene-edit.ts")) {
    code += `\nfor(const key of ['parse','instances']){const fn=RuntimeSceneEdit.prototype[key];RuntimeSceneEdit.prototype[key]=function(...args){return globalThis.__sceneBenchCall('scene.'+key,()=>fn.apply(this,args))}}`;
  }
  if (file.endsWith("/WaterMaterial.ts")) {
    code += `\n{const original=prepareWaterMaterial;prepareWaterMaterial=function(...args){return globalThis.__sceneBenchCall('material.validate',()=>original(...args))}}`;
  }
  return code;
}
