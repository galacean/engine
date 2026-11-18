import {expect,it} from "vitest";
import {VirtualProjectFiles} from "@galacean/engine-project/project-files/virtual-project-files.ts";
import {nativeProjectTools} from "../src/runtime-editor-agent/runtime-native-tools";
import {RuntimeProjectEdit} from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import {runtimeProjectFiles,validateRuntimeProject,type RuntimeProjectPackage} from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import {nativeAssetFormats} from "../src/project/runtime-native-formats";
import {compileProjectResource} from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler.ts";
import {importRuntimeHierarchy} from "../src/runtime-editor/scene/runtime-hierarchy-source";
import {checkRuntimeScripts} from "../src/runtime-editor/scripts/runtime-script-compiler";
import {agentTypecheckLibraries} from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
function initial():RuntimeProjectPackage{return {version: 7,project:{scene:"main.scene",files:[{virtualPath:"main.scene",path:"main.scene",type:"Scene"}]},contents:{"main.scene":JSON.stringify({asset:{version:"2.0"},scene:{rootEntities:[],background:{mode:0,color:{r:0,g:0,b:0,a:1}}},entities:[],components:[]})}};}
function tools(draft:RuntimeProjectEdit){const entries=nativeProjectTools(()=>draft,async()=>{});return async(name:string,args:unknown)=>{const tool=entries.find(t=>t.name===name)!;return tool.execute(tool.parseInput(args),{signal:new AbortController().signal});};}
it("uses the exact listed path for editing, references, compilation and undo without an asset ID",async()=>{
 const before=initial(),draft=new RuntimeProjectEdit(before,nativeAssetFormats(()=>({}))),call=tools(draft);
 expect(await call("asset.create",{path:"Shapes/B.mesh",type:"PrimitiveMesh",content:'{"type":"cuboid","cuboidWidth":2}'})).toEqual({path:"Shapes/B.mesh"});
 expect(await call("asset.list",{})).toContainEqual({path:"Shapes/B.mesh",type:"PrimitiveMesh"});
 const files=new VirtualProjectFiles([runtimeProjectFiles(()=>draft.preview())]);
 const path=(await files.listDirectory({path:"Shapes"})).entries.find(e=>e.path.endsWith(".mesh"))!.path;
 expect(await call("asset.read",{path})).toEqual({path,type:"PrimitiveMesh",kind:"structured",data:JSON.parse(files.read(path))});
 await call("asset.update",{path,content:'{"type":"cuboid","cuboidWidth":9}'});
 const entity=await call("entity.create",{scene:"main.scene",name:"cube"}) as {id:string};
 await call("component.add",{scene:"main.scene",entityId:entity.id,type:"MeshRenderer",props:{mesh:{$ref:path}}});
 expect(await call("asset.references",{path})).toEqual({references:["main.scene"]});
 await expect(call("asset.delete",{path})).rejects.toThrow("referenced");
 const undo=draft.captureUndo(before),saved=draft.finish();validateRuntimeProject(saved);
 expect(saved.project.files.every(file=>!Object.hasOwn(file,"id"))).toBe(true);
 expect(JSON.parse(compileProjectResource(saved,"main.scene") as string).refs).toContainEqual({url:path});
 const restored=new RuntimeProjectEdit(JSON.parse(JSON.stringify(saved)),nativeAssetFormats(()=>({})));restored.restore(undo);expect(restored.finish()).toMatchObject(before);
});
it("keeps imported scene references as paths and rejects legacy ID arguments at the public boundary",async()=>{
 const pack=initial();pack.project.files.push({virtualPath:"Shapes/B.mesh",path:"mesh",type:"PrimitiveMesh"});pack.contents["Shapes/B.mesh"]='{"type":"cuboid"}';
 const source=importRuntimeHierarchy({version:"2.0",scene:{rootEntities:[0],background:{mode:0,color:[0,0,0,1]}},entities:[{name:"cube",components:[0]}],components:[{type:"MeshRenderer",props:{mesh:{$ref:0}}}],refs:[{url:"Shapes/B.mesh"}]},"main.scene",pack.project.files,()=>true);
 expect(source.components[0].props.mesh.$ref).toBe("Shapes/B.mesh");
 pack.contents["main.scene"]=JSON.stringify(source);expect(JSON.parse(compileProjectResource(pack,"main.scene") as string).refs).toContainEqual({url:"Shapes/B.mesh"});
 const call=tools(new RuntimeProjectEdit(pack,nativeAssetFormats(()=>({}))));
 await expect(call("asset.update",{id:"Shapes/B.mesh",content:'{"type":"cuboid"}'})).rejects.toThrow();
 expect(JSON.parse(pack.contents["Shapes/B.mesh"] as string)).toEqual({type:"cuboid"});
});
it("resolves relative resource literals by their Script path and tracks namespace calls",()=>{
 const declarations={"declare/engine/node_modules/@galacean/editor-assets/index.d.ts":"export declare function assetUrl(path:string):string;"};
 const source='import * as resources from "@galacean/editor-assets"; export const url=resources.assetUrl("../Models/B.mesh");';
 const checked=checkRuntimeScripts({"Packages/a/src/main.ts":source},declarations,agentTypecheckLibraries);
 expect(checked.dependencies["Packages/a/src/main.ts"]).toEqual(["Packages/a/Models/B.mesh"]);
 expect(checked.sources["Packages/a/src/main.ts"]).toContain('resources.assetUrl("Packages/a/Models/B.mesh")');
 const draft=new RuntimeProjectEdit(initial(),nativeAssetFormats(()=>checked.dependencies));
 draft.create({virtualPath:"Packages/a/Models/B.mesh",path:"mesh",type:"PrimitiveMesh"},'{"type":"cuboid"}');
 draft.create({virtualPath:"Packages/a/src/main.ts",path:"script",type:"script"},source);
 expect(()=>draft.delete("Packages/a/Models/B.mesh")).toThrow("referenced");
 expect(()=>checkRuntimeScripts({"Use.ts":'import {assetUrl} from "@galacean/editor-assets"; const alias=assetUrl; export const url=alias("x");'},declarations,agentTypecheckLibraries)).toThrow("directly");
});
it("rejects reserved paths and namespace aliases, and preserves unrelated URL data", async () => {
  const draft=new RuntimeProjectEdit(initial(),nativeAssetFormats(()=>({}))),call=tools(draft);
  for (const path of ["project.json","skills/fixture/README.md","remote/A.mesh","editor.meta","project.json/asset.mesh","https:asset","A.mesh?x=1"]) {
    await expect(call("asset.create",{path,type:"PrimitiveMesh",content:'{"type":"cuboid"}'})).rejects.toThrow();
  }
  const declarations={"declare/engine/node_modules/@galacean/editor-assets/index.d.ts":"export declare function assetUrl(path:string):string;"};
  for (const code of ['const alias=resources; alias.assetUrl("x")','const {assetUrl}=resources; assetUrl("x")','resources["assetUrl"]("x")']) {
    expect(()=>checkRuntimeScripts({"Use.ts":'import * as resources from "@galacean/editor-assets"; '+code},declarations,agentTypecheckLibraries)).toThrow("directly");
  }
  const {rewriteAssetReferences}=await import("@galacean/engine-project/runtime-editor/project/runtime-asset-references.ts");
  expect(rewriteAssetReferences("Prefab",{refs:[{url:"./mesh"}],components:[{props:{url:"https://example.com",mesh:{$ref:"./mesh"}}}]},path=>"Package/"+path.slice(2)))
    .toEqual({refs:[{url:"Package/mesh"}],components:[{props:{url:"https://example.com",mesh:{$ref:"Package/mesh"}}}]});
});
