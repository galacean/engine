import {TestWorker} from "../../project/tests/TestRegexWorker";
import { afterEach, expect, it, vi } from "vitest";
import { RuntimeProjectSession } from "../src/project/runtime-project-session";
import { RUNTIME_PROJECT_SAVE_VERSION, RuntimeProjectStorage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { VirtualProjectFiles, configuredProjectFiles, mountProjectFiles } from "@galacean/engine-project/project-files/virtual-project-files.ts";
import { AgentNativeFiles } from "@galacean/engine-ai-chat/ai-chat/agent-native-files.ts";
vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", () => ({requestAsapChat: vi.fn()}));
vi.hoisted(() => { Object.assign(globalThis, {window:{}}); });
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

it("commits external file edits independently, detects stale reads and protects assets/mounts", async () => {
  vi.stubGlobal("Worker",TestWorker);
  const {RuntimeNativeEditor} = await import("../src/runtime-editor-agent/runtime-native-editor");
  const pack = {version:RUNTIME_PROJECT_SAVE_VERSION,project:{scene:"Main.scene",files:[{virtualPath:"Main.scene",path:"Main.scene",type:"Scene"}]},
    contents:{"Main.scene":JSON.stringify({asset:{version:"2.0"},scene:{rootEntities:[],background:{mode:0,color:{r:0,g:0,b:0,a:1}}},entities:[],components:[]})},documents:{"README.md":"old old"}};
  vi.spyOn(RuntimeProjectStorage,"open").mockResolvedValue({load:async()=>pack,close(){},save:async()=>{}} as any);
  const session=await RuntimeProjectSession.open("files",pack.project,"https://example.test/");
  vi.spyOn(session,"compileScripts").mockResolvedValue({dependencies:{}} as any);
  const library=mountProjectFiles("library",configuredProjectFiles({files:[{path:"guide.md",content:"library needle"}]}));
  const editor=new RuntimeNativeEditor(session,{rootEntities:[]} as any,undefined,[library]);
  const definition={scriptApi:{catalog:"# Host",entries:[],modules:[]},toolNames:[],beginEdit:(id:string,signal:AbortSignal)=>editor.beginEdit(id,signal)};
  const files=new AgentNativeFiles(()=>new VirtualProjectFiles(editor.projectFiles),()=>definition,new Map(),()=>"unused");
  let ordinal=0;
  const call=(name:Parameters<typeof files.execute>[0],input:Record<string,unknown>)=>files.execute(name,input,`file-${++ordinal}`,new AbortController().signal);
  try {
    expect((await call("write",{file_path:"README.md",content:"new"})).content).toContain("has not been read");
    expect((await call("read",{file_path:"README.md"})).result.ok).toBe(true);
    expect((await call("edit",{file_path:"README.md",old_string:"old",new_string:"new"})).content).toContain("more than once");
    expect(session.projectPackage.documents?.["README.md"]).toBe("old old");
    const edited=await call("edit",{file_path:"README.md",old_string:"old",new_string:"new",replace_all:true});
    expect(edited, edited.content).toMatchObject({result:{ok:true},receipt:{status:"committed"}});
    expect(session.projectPackage.documents?.["README.md"]).toBe("new new");
    // A separate editor transaction invalidates the last file observation.
    const tx=editor.beginEdit("outside",new AbortController().signal);
    await tx.documents!.write("README.md","changed outside"); await tx.prepare(new AbortController().signal); await tx.commit();
    expect((await call("write",{file_path:"README.md",content:"stale"})).content).toContain("changed since read");
    expect((await call("write",{file_path:"Notes/new.md",content:"fresh needle"})).receipt?.status).toBe("committed");
    expect((await call("glob",{path:"Notes",pattern:"*.md"})).content).toBe("Notes/new.md");
    expect((await call("grep",{path:"Notes",pattern:"needle"})).content).toContain("fresh needle");
    expect((await call("read",{file_path:"Notes/new.md"})).content).toContain("fresh needle");
    expect((await call("delete",{file_path:"Notes/new.md"})).receipt?.status).toBe("committed");
    expect(session.projectPackage.documents?.["Notes/new.md"]).toBeUndefined();
    expect(session.projectPackage.documents?.["Notes/new.md.meta"]).toBeUndefined();
    expect((await call("glob",{pattern:"Notes/**"})).content).toBe("No files found");
    expect((await call("delete",{file_path:"Notes/new.md"})).result.ok).toBe(false);
    for(const file_path of ["skills/galacean-editor.md","skills/other.md","editor/README.md",".ai/outputs/x.json","library/guide.md","Main.scene"]) {
      expect((await call("write",{file_path,content:"bad"})).result.ok).toBe(false);
      expect((await call("delete",{file_path})).result.ok).toBe(false);
    }
    expect(editor.tools.some(t=>t.name.startsWith("files."))).toBe(false);
  } finally {editor.dispose();session.dispose();}
});
