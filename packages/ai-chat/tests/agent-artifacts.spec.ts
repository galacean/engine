import {expect, it} from "vitest";
import {AgentArtifacts} from "../src/ai-chat/agent-artifacts";
import {createAgentProjectFiles} from "../src/ai-chat/agent-project-files";

it("evicts least recently read outputs, not listed files; expiry survives VFS wrapping", async()=>{
  const store=new AgentArtifacts(400);
  const a=store.save("a", "a"), b=store.save("b", "b");
  store.provider.read(a);
  const files=createAgentProjectFiles({catalog:"",entries:[],modules:[]},[store.provider]);
  await files.listDirectory({path:".ai/outputs"});
  const c=store.save("c", "c");
  expect(store.provider.read(a)).toBe("a");
  expect(()=>files.read(b)).toThrow(/TEMP_FILE_EXPIRED/);
  await expect(async()=>files.open(b)).rejects.toThrow(/临时文件已过期/);
  expect(()=>files.read(".ai/outputs/999.json")).toThrow(/Unknown/);
  expect(()=>store.save("large", "x".repeat(500))).toThrow(/exceeds/);
  expect([...store.provider.paths()]).toContain(c);
  store.clear();
  expect([...store.provider.paths()]).toEqual([]);
  expect(()=>files.read(c)).toThrow(/expired|过期/);
});

it("pins text while streaming and does not evict anything for an impossible admission", async()=>{
  const store=new AgentArtifacts(200);
  const path=store.save("a", "a");
  const view=await store.provider.open!(path);
  if(view?.kind!=="text")throw new Error("text expected");
  const iterator=view.chunks[Symbol.asyncIterator]();
  await iterator.next();
  expect(()=>store.save("b","b")).toThrow(/in use/);
  expect(store.provider.read(path)).toBe("a");
  await iterator.return?.();
  store.save("b","b");
  expect(()=>store.provider.read(path)).toThrow(/过期/);
});

it("does not retain temporary output bodies in the editable-file observation cache", async()=>{
  const {AgentNativeFiles}=await import("../src/ai-chat/agent-native-files");
  const store=new AgentArtifacts(),observed=new Map<string,string>();
  const path=store.save("one","full output");
  const catalog={catalog:"",entries:[],modules:[]};
  const files=new AgentNativeFiles(()=>createAgentProjectFiles(catalog,[store.provider]),()=>({scriptApi:catalog,toolNames:[]}),observed,text=>store.save("spill",text));
  const result=await files.execute("read",{file_path:path},"read",new AbortController().signal);
  expect(result.result.ok).toBe(true);
  expect(observed.size).toBe(0);
  store.dispose();
  expect(()=>store.save("late","late response")).toThrow(/disposed/);
});
