import { beforeEach, expect, it, vi } from "vitest";
import { createTestAgentLoop } from "../../ai-chat/tests/AIChatTestRuntime";
import { buildAgentToolDefinitions, parseAgentToolCall } from "@galacean/engine-ai-chat/ai-chat/agent-protocol.ts";
import { composeAgentConfiguration } from "@galacean/engine-ai-chat/ai-chat/agent-extensions.ts";
import { createRetrievalAgentExtension } from "../src/retrieval-agent";
import type { AgentApplicationDefinition, AgentEvent, AgentNativeReadTool } from "@galacean/engine-ai-chat/ai-chat/agent-types.ts";
vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat } from "@galacean/engine-ai-chat/ai-chat/asap-chat.ts";

const definition = (tools: AgentNativeReadTool[]): AgentApplicationDefinition => ({
  scriptApi: { catalog: "API", entries: [], modules: [] }, toolNames: [], nativeReadTools: tools
});
const readTool = (invoke = vi.fn(async () => ({ matches: ["platform"] }))): AgentNativeReadTool => ({
  definition: { type: "function", function: { name: "search_assets", description: "Search with keywords",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false }, strict: true } }, invoke
});
const call = { id: "search-1", type: "function" as const, function: { name: "search_assets", arguments: '{"query":"platform"}' } };
const request = vi.mocked(requestAsapChat);
beforeEach(() => request.mockReset());
const respond = () => request.mockResolvedValueOnce({content: "", finishReason: "tool_calls", toolCalls: [call]})
  .mockResolvedValueOnce({content: "Found a platform.", finishReason: "stop", toolCalls: []});

it("advertises, invokes and traces a native read without opening a project edit", async () => {
  respond(); const tool = readTool(), beginEdit = vi.fn(); const events: AgentEvent[] = [];
  const loop = createTestAgentLoop({ tools: [], definition: { ...definition([tool]), beginEdit } });
  loop.subscribe(event => events.push(event));
  const result = await loop.run("Find a platform", { debugMode: true });
  expect(tool.invoke).toHaveBeenCalledWith({query:"platform"}, {signal: expect.any(AbortSignal)});
  expect(beginEdit).not.toHaveBeenCalled();
  expect(request.mock.calls[0][0].tools.some(t => t.function.name === "search_assets")).toBe(true);
  expect(request.mock.calls[1][0].messages).toContainEqual({role:"tool",toolCallId:"search-1",content:expect.stringContaining("platform")});
  expect(events.filter(e => e.type === "tool_finished")).toMatchObject([{tool:"search_assets",toolCallId:"search-1",result:{ok:true}}]);
  expect(result.finalMessage).toBe("Found a platform.");
});
it("rejects unregistered calls and native builtin/duplicate names", () => {
  expect(() => parseAgentToolCall(call)).toThrow(/未注册/);
  expect(parseAgentToolCall(call,["search_assets"])).toMatchObject({type:"native_read",name:"search_assets"});
  expect(() => buildAgentToolDefinitions(definition([readTool(), readTool()]))).toThrow(/Duplicate/);
  for (const name of ["execute", "read", "pick", "snapshot"]) {
    const tool = readTool(); tool.definition.function.name = name;
    expect(() => buildAgentToolDefinitions(definition([tool]))).toThrow(/Duplicate/);
  }
});
it("composes native read extensions independently of script tools", () => {
  const extension = { tools: [], definition: definition([readTool()]) };
  const result = composeAgentConfiguration({tools:[],definition:definition([])}, [extension]);
  expect(result.tools).toEqual([]);
  expect(result.definition.nativeReadTools).toHaveLength(1);
  expect(() => composeAgentConfiguration(result,[extension])).toThrow(/native read/);
});
it("returns a tool error to the model when a provider rejects", async () => {
  respond(); const tool = readTool(vi.fn(async () => { throw new Error("catalog unavailable"); }));
  const loop = createTestAgentLoop({tools:[],definition:definition([tool])});
  await loop.run("Find a platform", {});
  expect(request.mock.calls[1][0].messages).toContainEqual({role:"tool",toolCallId:"search-1",content:expect.stringContaining("catalog unavailable")});
});
it("cancels an in-flight read and does not request another model turn", async () => {
  respond(); const entered = Promise.withResolvers<void>();
  const tool = readTool();
  tool.invoke = (_input,{signal}) => new Promise((_resolve,reject) => {
    entered.resolve(); signal.addEventListener("abort", () => reject(signal.reason), {once:true});
  });
  const loop = createTestAgentLoop({tools:[],definition:definition([tool])});
  const task = loop.run("Find a platform", {}).catch(error=>error);
  await entered.promise; loop.cancel();
  expect((await task).name).toBe("AgentCancelledError");
  expect(request).toHaveBeenCalledTimes(1);
});
it("native reads consume the task tool budget", async () => {
  request.mockResolvedValueOnce({content:"",finishReason:"tool_calls",toolCalls:[call,{...call,id:"search-2"}]});
  const tool = readTool();
  const loop = createTestAgentLoop({tools:[],definition:definition([tool]),maxToolCallsPerTask:1});
  await expect(loop.run("Find assets", {})).rejects.toThrow(/TASK_TOOL_CALL_LIMIT/);
  expect(tool.invoke).toHaveBeenCalledTimes(1);
});

it("keeps large successful reads available through the ordinary read tool", async () => {
  const payload = { records: Array.from({ length: 3000 }, (_, i) => `asset-${i}-description`) };
  request.mockResolvedValueOnce({ content: "", finishReason: "tool_calls", toolCalls: [call] });
  request.mockImplementationOnce(async input => {
    const message = input.messages.filter(message => message.role === "tool").at(-1)!;
    const result = JSON.parse(message.content as string);
    expect(result.ok).toBe(true);
    expect(result.result.truncated).toBe(true);
    expect(result.outputFile).toMatch(/^\.ai\/outputs\//);
    return { content: "", finishReason: "tool_calls", toolCalls: [{
      id: "read-output", type: "function", function: { name: "read", arguments: JSON.stringify({
        file_path: result.outputFile, offset: 1, limit: 10
      }) }
    }] };
  });
  request.mockResolvedValueOnce({ content: "Read the full description.", finishReason: "stop", toolCalls: [] });
  const tool = readTool(); tool.invoke = () => payload;
  const loop = createTestAgentLoop({ tools: [], definition: definition([tool]) });
  await loop.run("Find a platform", {});
  expect(request.mock.calls[2][0].messages).toContainEqual({ role: "tool", toolCallId: "read-output",
    content: expect.stringContaining("asset-0-description") });
});

it("reads source text in bounded numbered pages and rejects unsupported actions before fetching", async () => {
  const library = { searchAssets: vi.fn(), readAssetDescriptions: vi.fn(),
    readText: vi.fn(async () => "first\r\nsecond\r\nthird\r\n") };
  const tool = createRetrievalAgentExtension(library).definition.nativeReadTools!
    .find(tool => tool.definition.function.name === "source_text")!;
  const signal = new AbortController().signal;
  const path = "/oss/assets/model/tree/README.md";
  expect(await tool.invoke({action:"read",path,limit:2}, {signal})).toMatchObject({
    content:"     1\tfirst\n     2\tsecond",totalLines:3,truncated:true,nextOffset:3
  });
  expect(await tool.invoke({action:"read",path,offset:3,limit:2}, {signal})).toEqual({
    success:true,action:"read",path,content:"     3\tthird",totalLines:3,truncated:false
  });
  expect(library.readText).toHaveBeenLastCalledWith(path,{signal,maxBytes:4*1024*1024});
  await expect(tool.invoke({action:"grep",path}, {signal})).rejects.toThrow();
  await expect(tool.invoke({action:"read",path,limit:1001}, {signal})).rejects.toThrow();
  expect(library.readText).toHaveBeenCalledTimes(2);
});
