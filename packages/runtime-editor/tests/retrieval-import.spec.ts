import { expect, it } from "vitest";
import { createRetrievalAssetSource } from "../src/retrieval-agent/asset-source";
import { importRuntimeAsset } from "../src/project/runtime-asset-import";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import { nativeAssetFormats } from "../src/project/runtime-native-formats";
import { RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import type { AssetResourceSet } from "@galacean/engine-retrieval/retrieval/index.ts";

const root="/oss/assets/model/tree";
const set: AssetResourceSet = {root, candidate:{descriptionPath:`${root}/describe.json`,assetPaths:["assets/model/tree/tree.glb"],assetType:"model",assetSubType:null,name:"树",descriptionExcerpt:"绿色树木",appearanceExcerpt:null,usageExcerpt:"放入场景"},
  resources:["tree.glb","README.md","describe.json"].map(name=>({path:`${root}/${name}`,url:`https://cdn.test/${name}`}))};
const pack = ():RuntimeProjectPackage=>({version:RUNTIME_PROJECT_SAVE_VERSION,project:{scene:"Main.scene",files:[{virtualPath:"Main.scene",path:"Main.scene",type:"Scene",dependencies:[]}]},
  contents:{"Main.scene":JSON.stringify({asset:{version:"2.0"},entities:[],components:[]})}});
function glb(){
  const text=JSON.stringify({asset:{version:"2.0"}}).padEnd(28," ");
  const bytes=new Uint8Array(20+text.length), header=new DataView(bytes.buffer);
  header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,bytes.length,true);
  header.setUint32(12,text.length,true);header.setUint32(16,0x4e4f534a,true);bytes.set(new TextEncoder().encode(text),20);return bytes;
}
const signal=new AbortController().signal;
it("imports recalled binaries transactionally without putting the library in project VFS or retaining payloads",async()=>{
  const downloads:string[]=[];
  const source=createRetrievalAssetSource({resourceSet:async()=>set},{read:async(url)=>{
    downloads.push(url); return url.endsWith(".glb")?glb():new TextEncoder().encode(url.endsWith(".md")?"Tree guide":"{}");
  }});
  const original=pack(), draft=new RuntimeProjectEdit(original,nativeAssetFormats(()=>({})));
  expect([...source.paths()]).toEqual([]);
  await importRuntimeAsset(draft,[source],{source:`${root}/tree.glb`,path:"Models/Tree.glb"},signal);
  expect(downloads).toEqual(["https://cdn.test/tree.glb"]);
  expect(original.project.files).toHaveLength(1);
  const result=draft.finish();
  expect(result.contents["Models/Tree.glb"]).toBeInstanceOf(Uint8Array);
  expect(result.project.files.find(file=>file.virtualPath==="Models/Tree.glb")).toMatchObject({type:"GLTF",dependencies:[]});
  expect(JSON.parse(result.documents!["Models/Tree.glb.meta"])).toMatchObject({name:"Tree.glb",type:"GLTF",summary:"绿色树木"});
  expect([...source.paths()]).toEqual([]);
  const again=new RuntimeProjectEdit(result,nativeAssetFormats(()=>({})));
  await expect(importRuntimeAsset(again,[source],{source:`${root}/tree.glb`,path:"Models/Tree.glb"},signal)).rejects.toThrow(/already exists/);
  expect(downloads).toHaveLength(1);
});
it("imports folder documentation and leaves no partial project edits on failed or cancelled downloads",async()=>{
  let fail=true;
  const source=createRetrievalAssetSource({resourceSet:async()=>set},{read:async(url,{signal})=>{
    signal?.throwIfAborted();if(fail&&url.endsWith(".glb"))throw new Error("CDN failed");
    return url.endsWith(".glb")?glb():new TextEncoder().encode(url.endsWith(".md")?"Tree guide":"{}");
  }});
  const original=pack(),draft=new RuntimeProjectEdit(original,nativeAssetFormats(()=>({})));
  await expect(importRuntimeAsset(draft,[source],{source:root,path:"Props/Tree"},signal)).rejects.toThrow("CDN failed");
  expect(draft.preview()).toEqual(original);
  const controller=new AbortController();controller.abort();
  await expect(importRuntimeAsset(draft,[source],{source:root,path:"Props/Tree"},controller.signal)).rejects.toThrow();
  fail=false;await importRuntimeAsset(draft,[source],{source:root,path:"Props/Tree"},signal);
  const result=draft.finish();
  expect(result.documents!["Props/Tree/README.md"]).toBe("Tree guide");
  expect(result.contents["Props/Tree/tree.glb"]).toBeInstanceOf(Uint8Array);
});
