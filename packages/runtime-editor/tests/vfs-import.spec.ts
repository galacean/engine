import {expect, it, vi} from "vitest";
import { deepStrictEqual } from "node:assert";
import {wateringGlbFixture} from "../../farming/tests/watering-glb-fixture";
import {configuredProjectFiles, mountProjectFiles, VirtualProjectFiles} from "@galacean/engine-project/project-files/virtual-project-files.ts";
import {createAgentProjectFiles} from "@galacean/engine-ai-chat/ai-chat/agent-project-files.ts";
import {createAgentEditorFacade} from "@galacean/engine-ai-chat/ai-chat/agent-editor-facade.ts";
import {RuntimeProjectEdit} from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import {nativeAssetFormats} from "../src/project/runtime-native-formats";
import {runtimeProjectFiles, validateRuntimeProject, type RuntimeProjectPackage} from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import {importRuntimeAsset} from "../src/project/runtime-asset-import";
import {executeNativeProjectTool} from "../src/runtime-editor-agent/runtime-native-tools";

const signal = new AbortController().signal;
const initial = (): RuntimeProjectPackage => ({version: 7, project:{scene:"main.scene", files:[{virtualPath:"main.scene",path:"main.scene",type:"Scene",dependencies:[]}]},
  contents:{"main.scene":JSON.stringify({asset:{version:"2.0"},entities:[],components:[]})}});
const draftOf = (pack=initial()) => new RuntimeProjectEdit(pack, nativeAssetFormats(()=>({})));
const mesh = '{"type":"cuboid","cuboidWidth":7}';
const source = () => mountProjectFiles("remote", configuredProjectFiles({directories:["Empty"], files:[{path:"Cube.mesh",type:"PrimitiveMesh",content:mesh,summary:"方块"}]}));
const call = (draft:RuntimeProjectEdit, path:string, providers=[source()]) => executeNativeProjectTool("asset.import", {source:"remote/Cube.mesh",path}, draft, async()=>{}, ()=>{}, signal, providers);

it("registers empty source directories before downloading contents, with identity metadata", async()=>{
  const load=vi.fn(async()=>mesh);
  const provider=mountProjectFiles("remote",configuredProjectFiles({directories:["Models/Empty"],files:[{path:"Models/Cube.mesh",type:"PrimitiveMesh",load,summary:"方块"}]}));
  const files=new VirtualProjectFiles([provider]);
  expect((await files.listDirectory({path:"remote/Models/Empty"})).entries).toEqual([]);
  expect((await files.listDirectory({path:"remote/Models"})).entries).toContainEqual({path:"remote/Models/Empty",kind:"directory"});
  expect(load).not.toHaveBeenCalled();
  expect(JSON.parse(files.read("remote/Models/Cube.mesh.meta"))).toMatchObject({name:"Cube.mesh",type:"PrimitiveMesh",summary:"方块"});
  await files.prepare(["remote/Models/Cube.mesh"],signal);
  expect(files.read("remote/Models/Cube.mesh")).toBe(mesh);
  expect(load).toHaveBeenCalledTimes(1);
  expect(()=>configuredProjectFiles({directories:["a/b"],files:[{path:"a",content:"file"}]})).toThrow("already exists");
});

it("keeps project README and execute.js separate from host files, including restored README",()=>{
  const pack=initial();pack.documents={"README.md":"project guide","execute.js":"project source"};
  const catalog={catalog:"host guide",entries:[],modules:[{id:"declare/api.d.ts",source:"export {};",imports:[]}]};
  const files=createAgentProjectFiles(catalog,[runtimeProjectFiles(()=>pack)]);
  expect(files.read("README.md")).toBe("project guide");
  expect(files.read("declare/editor/api.d.ts")).toBe("export {};");
  const restored=structuredClone(pack);validateRuntimeProject(restored);
  expect(createAgentProjectFiles(catalog,[runtimeProjectFiles(()=>restored)]).read("README.md")).toBe("project guide");
});

it.each(["asset","document","directory","ancestor","metadata"])("rejects %s conflicts before fetching and returns actionable tool errors",async kind=>{
  const draft=draftOf();
  let target="Occupied.mesh";
  if(kind==="asset")draft.create({virtualPath:target,path:target,type:"PrimitiveMesh"},mesh);
  if(kind==="document" || kind==="ancestor")draft.writeDocument(target,"existing document");
  if(kind==="directory")draft.createBundle([],{},[target]);
  if(kind==="metadata") {draft.create({virtualPath:target,path:target,type:"PrimitiveMesh"},mesh);target+=".meta";}
  if(kind==="ancestor")target+="/Child.mesh";
  const before=draft.preview(),load=vi.fn(async()=>mesh);
  const provider=mountProjectFiles("remote",configuredProjectFiles({files:[{path:"Cube.mesh",type:"PrimitiveMesh",load}]}));
  await expect(call(draft,target,[provider])).rejects.toMatchObject({code:"PATH_ALREADY_EXISTS",executed:false,details:{path:target}});
  expect(load).not.toHaveBeenCalled();expect(draft.preview()).toEqual(before);
  await expect(call(draft,"Free.mesh",[provider])).resolves.toEqual({path:"Free.mesh"});
  expect(JSON.parse(new VirtualProjectFiles([runtimeProjectFiles(()=>draft.preview())]).read("Free.mesh.meta"))).toMatchObject({name:"Free.mesh",type:"PrimitiveMesh"});
});

it("imports a dependency folder with binary assets, documents, empty folders and undo",async()=>{
  const glb=wateringGlbFixture();
  const png=new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=","base64"));
  const provider=mountProjectFiles("remote",configuredProjectFiles({directories:["Kit/Empty"],files:[
    {path:"Kit/README.md",content:"kit instructions"},
    {path:"Kit/Model.glb",type:"GLTF",content:glb},
    {path:"Kit/Tex.png",type:"Texture",content:png},
    {path:"Kit/Mat.mat",type:"Material",content:JSON.stringify({name:"Mat",shader:"unlit",macros:[],shaderData:{tex:{type:"Texture",value:{url:"./Tex.png"}}}})}
  ]}));
  const pack=initial(),before=structuredClone(pack),draft=draftOf(pack);
  await importRuntimeAsset(draft,[provider],{source:"remote/Kit",path:"Props/Renamed"},signal);
  const undo=draft.captureUndo(before),saved=draft.finish();validateRuntimeProject(saved);
  expect(pack).toEqual(before);
  expect(saved.documents!["Props/Renamed.meta"]).toBeUndefined();
  expect(JSON.parse(saved.contents["Props/Renamed/Mat.mat"] as string).shaderData.tex.value.url).toBe("Props/Renamed/Tex.png");
  // Preserve byte-for-byte coverage without generic object traversal of the GLB payload.
  deepStrictEqual(saved.contents["Props/Renamed/Model.glb"], glb);
  const files=new VirtualProjectFiles([runtimeProjectFiles(()=>structuredClone(saved))]);
  expect((await files.listDirectory({path:"Props/Renamed/Empty"})).entries).toEqual([]);
  expect(files.read("Props/Renamed/README.md")).toBe("kit instructions");
  expect(files.kind("Props/Renamed.meta")).toBeUndefined();
  const restored=draftOf(saved);restored.restore(undo);
  const reverted=restored.finish();
  expect(reverted.project).toEqual(before.project);
  expect(reverted.contents).toEqual(before.contents);
  expect(reverted.documents??{}).toEqual(before.documents??{});
});

it("imports empty folders and single GLBs through the same public import operation",async()=>{
  const draft=draftOf();
  await importRuntimeAsset(draft,[source()],{source:"remote/Empty",path:"Empty"},signal);
  const files=new VirtualProjectFiles([runtimeProjectFiles(()=>draft.preview())]);
  expect(await files.listDirectory({path:"Empty"})).toMatchObject({entries:[],total:0});
  const glb=wateringGlbFixture();
  const provider=mountProjectFiles("remote",configuredProjectFiles({files:[{path:"Model.glb",type:"GLTF",content:glb}]}));
  await importRuntimeAsset(draft,[provider],{source:"remote/Model.glb",path:"Props/New.glb"},signal);
  expect(draft.finish().project.files.find(f=>f.virtualPath==="Props/New.glb")?.params?.sourceContentRevision).toMatch(/^[a-f0-9]{64}$/);
});

it("rejects missing dependencies and cancelled or malformed binary imports without partial state",async()=>{
  for (const mode of ["dependency","binary","cancelled"] as const) {
    const draft=draftOf(),before=draft.preview(),controller=new AbortController();
    const provider=mountProjectFiles("remote",configuredProjectFiles({files:[mode==="dependency"
      ? {path:"Kit/Mat.mat",type:"Material",content:JSON.stringify({name:"m",shader:"unlit",macros:[],shaderData:{tex:{type:"Texture",value:{url:"./missing.png"}}}})}
      : {path:"Kit/Bad.glb",type:"GLTF",load:async()=>{if(mode==="cancelled")controller.abort();return new Uint8Array(20);}}]}));
    await expect(importRuntimeAsset(draft,[provider],{source:"remote/Kit",path:"Kit"},controller.signal)).rejects.toThrow();
    expect(draft.preview()).toEqual(before);
  }
});

it("editor.asset forwards through registered tools and reserves host/source paths",async()=>{
  const invoke=vi.fn(async()=>({path:"Model.glb"}));
  const editor=createAgentEditorFacade([],invoke,["asset.import"]);
  await editor.asset.import({source:"remote/Model.glb",path:"Model.glb"});
  expect(invoke).toHaveBeenCalledWith("asset.import",{source:"remote/Model.glb",path:"Model.glb"});
  expect(Object.keys(editor.asset)).toEqual(["import"]);
  for(const path of ["editor/a.mesh","editor.meta","remote/a.mesh","project.json.meta"])
    await expect(call(draftOf(),path)).rejects.toThrow(/Read-only path|Invalid/);
});


it("imports ordinary folders and treats manifest.json as a document",async()=>{
  const draft=draftOf();
  const provider=mountProjectFiles("remote",configuredProjectFiles({directories:["Package/Empty"],files:[
    {path:"Package/manifest.json",content:JSON.stringify({formatVersion:2,id:"example",version:"1.0.0",dependencies:{},assets:[{path:"Cube.mesh",type:"PrimitiveMesh"}],documents:["README.md"]})},
    {path:"Package/Cube.mesh",type:"PrimitiveMesh",content:mesh},
    {path:"Package/README.md",content:"Package instructions"},
    {path:"Package/Empty.meta",content:JSON.stringify({summary:"保留的扩展目录"})}
  ]}));
  await expect(importRuntimeAsset(draft,[provider],{source:"remote/Package",path:"Packages/Renamed",type:"Material"},signal)).rejects.toThrow("omit type");
  await expect(importRuntimeAsset(draft,[provider],{source:"remote/Package",path:"Packages/Renamed"},signal)).resolves.toEqual({path:"Packages/Renamed"});
  const saved=draft.finish();
  expect(saved.documents!["Packages/Renamed/manifest.json"]).toContain("formatVersion");
  expect(saved.project.files.some(file=>file.virtualPath.endsWith("manifest.json"))).toBe(false);
  expect(saved.project.directories).toContain("Packages/Renamed/Empty");
  expect(saved.documents!["Packages/Renamed/Empty.meta"]).toBeUndefined();
  expect(saved.documents!["Packages/Renamed.meta"]).toBeUndefined();
});

it.each([false, true])("infers asset types from configured files without explicit types (folder=%s)", async folder => {
  const provider = mountProjectFiles("remote", configuredProjectFiles({files: [
    {path:"Kit/Cube.mesh", content:mesh, summary:"方块"},
    {path:"Kit/README.md", content:"instructions"},
    {path:"Kit/types.d.ts", content:"export {};"}
  ]}));
  expect(JSON.parse(new VirtualProjectFiles([provider]).read("remote/Kit/Cube.mesh.meta")).type).toBe("PrimitiveMesh");
  const draft = draftOf();
  await importRuntimeAsset(draft, [provider], {source:folder?"remote/Kit":"remote/Kit/Cube.mesh",path:folder?"Imported":"Cube.mesh"}, signal);
  const saved = draft.finish();
  expect(saved.project.files.find(file=>file.virtualPath===(folder?"Imported/Cube.mesh":"Cube.mesh"))?.type).toBe("PrimitiveMesh");
  if (folder) {
    expect(saved.documents!["Imported/types.d.ts"]).toBe("export {};");
    expect(saved.documents!["Imported/README.md.meta"]).toBeUndefined();
  }
});

it("keeps documents without generated metadata and restores their bodies with undo", () => {
  const draft = draftOf();
  draft.writeDocument("Notes/README.md", "before");
  expect(()=>draft.writeDocument("Notes/README.md.meta", '{"summary":"guide"}')).toThrow(/Orphan/);
  expect(()=>draft.writeDocument("Notes.meta", '{"summary":"folder"}')).toThrow(/Orphan/);
  const before = draft.finish(), edit = draftOf(before);
  edit.writeDocument("Notes/README.md", "after");
  const undo = edit.captureUndo(before), saved = edit.finish();
  expect(saved.documents).toEqual({"Notes/README.md":"after"});
  const restored = draftOf(saved); restored.restore(undo);
  expect(restored.finish()).toEqual(before);
});

it("keeps explicit source types and rejects conflicting types and unknown binaries", async () => {
  for (const mode of ["config", "sidecar", "override", "conflict", "binary"] as const) {
    const file = mode === "binary" ? "Unknown.dat" : "Cube.mesh";
    const provider = mountProjectFiles("remote", configuredProjectFiles({files:[
      {path:file,content:mode === "binary" ? new Uint8Array([1,2,3]) : mesh,...(mode === "config" ? {type:"PrimitiveMesh"} : {})},
      ...(mode === "sidecar" || mode === "conflict" ? [{path:`${file}.meta`,content:JSON.stringify({summary:"cube",type:mode === "conflict" ? "Material" : "PrimitiveMesh"})}] : [])
    ]}));
    const draft = draftOf(), before = draft.preview();
    const operation = importRuntimeAsset(draft, [provider], {source:`remote/${file}`,path:file,...(mode === "override" ? {type:"PrimitiveMesh"} : {})}, signal);
    if (mode === "conflict" || mode === "binary") {
      await expect(operation).rejects.toThrow(mode === "conflict" ? "does not match" : "Unsupported binary");
      expect(draft.preview()).toEqual(before);
    } else {
      await operation;
      expect(draft.finish().project.files.find(asset=>asset.virtualPath===file)?.type).toBe("PrimitiveMesh");
    }
  }
});


it("enumerates the source namespace a bounded number of times for a batch import", async()=>{
  const base=mountProjectFiles("remote",configuredProjectFiles({files:Array.from({length:100},(_,i)=>({path:`Kit/${i}.txt`,content:"body"}))}));
  const paths=vi.fn(()=>base.paths()),draft=draftOf();
  await importRuntimeAsset(draft,[{...base,paths}],{source:"remote/Kit",path:"Imported"},signal);
  expect(paths.mock.calls.length).toBeLessThanOrEqual(2);
  expect(draft.finish().documents!["Imported/99.txt"]).toBe("body");
});

it("lets cancellation interrupt a fully cached bulk import without mutating its draft", async()=>{
  const provider=mountProjectFiles("remote",configuredProjectFiles({files:Array.from({length:5000},(_,i)=>({path:`Kit/${i}.txt`,content:"body"}))}));
  const draft=draftOf(),before=draft.preview(),controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),0);
  try {
    await expect(importRuntimeAsset(draft,[provider],{source:"remote/Kit",path:"Imported"},controller.signal)).rejects.toThrow();
    expect(draft.preview()).toEqual(before);
  } finally {clearTimeout(timer);}
});
