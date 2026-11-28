import {expect,it,vi} from "vitest";
import {RuntimeProjectEdit} from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import {nativeAssetFormats} from "../src/project/runtime-native-formats";
import {executeNativeProjectTool} from "../src/runtime-editor-agent/runtime-native-tools";
import {readAssetGlb} from "@galacean/engine-project/runtime-editor/project/runtime-asset-read.ts";
import {validateRuntimeProject, runtimeProjectFiles, type RuntimeProjectPackage} from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
const initial=():RuntimeProjectPackage=>({version:7,project:{scene:"Main.scene",files:[{virtualPath:"Main.scene",path:"Main.scene",type:"Scene",dependencies:[]}]},contents:{"Main.scene":'{"asset":{"version":"2.0"},"entities":[],"components":[]}'}});
it("info reads only metadata, while read explicitly requires loaded content and returns format data",async()=>{
  const pack=initial();pack.project.files.push({virtualPath:"Image.png",path:"https://example.test/img.png",type:"Texture",dependencies:[]});
  pack.documents={"Image.png.meta":'{"summary":"Test image","usage":"Billboard"}'};
  const draft=new RuntimeProjectEdit(pack,nativeAssetFormats(()=>({})));
  const edit=vi.fn(),analyze=vi.fn();
  const call=(name:string,path:string)=>executeNativeProjectTool(name,{path},draft,analyze,edit,new AbortController().signal);
  expect(await call("asset.info","Image.png")).toEqual({path:"Image.png",name:"Image.png",type:"Texture",summary:"Test image",usage:"Billboard"});
  expect(draft.preview().contents["Image.png"]).toBeUndefined();
  await expect(call("asset.read","Image.png")).rejects.toThrow(/Load asset/);
  draft.provideContents({"Image.png":new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=","base64"))});
  expect(await call("asset.read","Image.png")).toMatchObject({kind:"image",format:"PNG",width:1,height:1});
  expect(await call("asset.read","Main.scene")).toMatchObject({kind:"structured",data:{entities:[]}});
  draft.create({virtualPath:"Script.ts",path:"Script.ts",type:"script"},"export default class Test {}");
  expect(await call("asset.read","Script.ts")).toMatchObject({kind:"text",content:"export default class Test {}"});
  expect(edit).not.toHaveBeenCalled();expect(analyze).not.toHaveBeenCalled();
});
it("computes transformed static model-local bounds and marks missing geometry information",()=>{
  function glb(doc:object){const json=new TextEncoder().encode(JSON.stringify(doc)),size=Math.ceil(json.length/4)*4,bytes=new Uint8Array(size+20);bytes.fill(32,20);bytes.set(json,20);const v=new DataView(bytes.buffer);[0x46546c67,2,bytes.length,size,0x4e4f534a].forEach((n,i)=>v.setUint32(i*4,n,true));return bytes;}
  const doc={scene:0,scenes:[{nodes:[0]}],nodes:[{translation:[10,0,0],children:[1]},{scale:[2,1,1],mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],accessors:[{min:[-1,-2,-3],max:[1,2,3]}]};
  expect(readAssetGlb(glb(doc))).toMatchObject({kind:"model",bounds:{min:[8,-2,-3],max:[12,2,3]},boundsComplete:true});
  expect(readAssetGlb(glb({...doc,accessors:[]}))).toMatchObject({bounds:null,boundsComplete:false});
});
it("rejects all managed namespaces in persisted content and dependencies, and only emits asset sidecars",()=>{
  const pack=initial();pack.documents={"Notes/README.md":"instructions"};pack.project.directories=["Empty"];
  const files=runtimeProjectFiles(()=>pack);
  expect([...files.paths()]).toEqual(["project.json","Main.scene","Notes/README.md","Main.scene.meta"]);
  for(const path of [".ai/outputs/1.json","engine/a.d.ts","skills/a.md","editor/a.md"]){
    expect(()=>validateRuntimeProject({...pack,documents:{[path]:"text"}})).toThrow(/Invalid/);
    expect(()=>validateRuntimeProject({...pack,project:{...pack.project,files:[{...pack.project.files[0],dependencies:[path]}]}})).toThrow(/Invalid/);
  }
});
