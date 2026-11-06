import {it,expect,vi,afterEach} from "vitest";
import { RuntimeProjectSession } from "../src/project/runtime-project-session";
import { RuntimeProjectStorage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { RuntimeScriptWorker } from "../src/runtime-editor/scripts/runtime-script-worker";
import { RuntimeProjectScripts } from "../src/runtime-editor/scripts/runtime-project-scripts";
import { checkRuntimeScripts } from "../src/runtime-editor/scripts/runtime-script-compiler";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
vi.hoisted(()=>{(globalThis as any).window??={};});
afterEach(()=>{vi.restoreAllMocks();});
function base():any {return {version:7,project:{scene:"main.scene",files:[{virtualPath:"main.scene",path:"main.scene",type:"Scene",dependencies:[]}]},contents:{"main.scene":'{"asset":{"version":"2.0"},"scene":{"rootEntities":[],"background":{"mode":0,"color":{"r":0,"g":0,"b":0,"a":1}}},"entities":[],"components":[]}'}};}
async function open(pack:any) {
 vi.spyOn(RuntimeProjectStorage,"open").mockResolvedValue({load:async()=>pack,save:async()=>{},close(){}} as any);
 return RuntimeProjectSession.open("review",pack.project,"https://example.test/");
}
it("rechecks unchanged Script source after editing a project declaration and preserves the accepted cache on failure", async () => {
 const pack = base();
 pack.documents = {"settings.d.ts": "export interface Settings { count: number; }"};
 const sources = {"Use.ts": 'import type {Settings} from "./settings"; export const value: Settings = {count: 1};'};
 const compile = vi.spyOn(RuntimeScriptWorker.prototype, "compile").mockImplementation(async (source, _s, _e, analyze, _x, declarations) => ({
  ...checkRuntimeScripts(source, declarations ?? {}, agentTypecheckLibraries, undefined, analyze), entries: {}, files: {}
 }));
 const scripts = new RuntimeProjectScripts();
 try {
  const accepted = await scripts.compile(sources, undefined, false, scripts.environment(pack));
  const changed = {...pack, documents: {"settings.d.ts": "export interface Settings { count: string; }"}};
  await expect(scripts.compile(sources, undefined, false, scripts.environment(changed))).rejects.toThrow("TS2322");
  expect(await scripts.compile(sources, undefined, false, scripts.environment(pack))).toBe(accepted);
  expect(compile).toHaveBeenCalledTimes(2);
 } finally { scripts.dispose(); }
});

it("analyzes a direct cold Script write and loads other Script sources only when analysis needs them", async () => {
 const pack=base();
 pack.project.files.push(
  {virtualPath:"Use.ts",path:"Use.ts",type:"script",dependencies:[]},
  {virtualPath:"Other.ts",path:"Other.ts",type:"script",dependencies:[]},
  {virtualPath:"image.png",path:"image.png",type:"Texture",dependencies:[]}
 );
 const fetcher=vi.spyOn(globalThis,"fetch").mockImplementation(async input=>{
  expect(String(input)).toBe("Other.ts");
  return new Response("export const other=1;");
 });
 const compile=vi.spyOn(RuntimeScriptWorker.prototype,"compile").mockImplementation(async(sources,_s,_e,analyze,_x,decl)=>({
  ...checkRuntimeScripts(sources,decl ?? {},agentTypecheckLibraries,undefined,analyze),entries:{},files:{}
 }));
 const session=await open(pack);
 try{
  await session.publishAsset(pack.project.files[1], 'import {assetUrl} from "@galacean/editor-assets"; export const image=assetUrl("image.png");');
  expect(session.projectPackage.project.files[1].dependencies).toEqual(["image.png"]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(compile).toHaveBeenCalledTimes(1);
  // An ordinary config write must not trigger another Script analysis or download.
  await session.publishAsset({virtualPath:"config.json",path:"config.json",type:"JSON"}, '{"image":{"$ref":"image.png"}}');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(compile).toHaveBeenCalledTimes(1);
 }finally{session.dispose();}
});
