import { nativeFileSchemas } from "../src/ai-chat/agent-native-files";
const fileReadInput = nativeFileSchemas.read;
import { describe, expect, it, vi } from "vitest";

import {
  AGENT_PROTOCOL,
  buildAgentMessages,
  buildAgentSystemPrompt,
  buildAgentToolDefinitions,
  parseAgentFinalMessage,
  parseAgentToolCall
} from "../src/ai-chat/agent-protocol";
import type { AgentApplicationDefinition, AgentMessage } from "../src/ai-chat/agent-types";

const definition: AgentApplicationDefinition = {
  scriptApi: {
    hostNotes: "| Asset Type | Asset Domain | APISearch Symbol |\n| Tree | vegetation | TreeAsset |",
    entries: [{ name: "TreeAsset", description: "树木详情", moduleId: "assets/TreeAsset.d.ts" }],
    modules: [{
      id: "assets/TreeAsset.d.ts",
      source: "export interface TreeAsset { type: 'tree'; ref: string; species: string; }",
      imports: [],
      toolNames: ["world.inspect"]
    }]
  },
  toolNames: ["world.inspect"]
};

describe("native Agent Tool Calling protocol", () => {
  it("keeps general reasoning principles independent of specific tools and application APIs", () => {
    expect(AGENT_PROTOCOL).toContain("完整目标、已有证据和必要依赖");
    expect(AGENT_PROTOCOL).toContain("信息充分后就执行");
    expect(AGENT_PROTOCOL).toContain("再决定继续行动或结束");
    expect(AGENT_PROTOCOL).toContain("当前上下文中已有且未变化的声明和查询结果可以直接复用");
    expect(AGENT_PROTOCOL).toContain("无进展的重复操作");
    expect(AGENT_PROTOCOL).toContain("改用能解决疑问的方法");
    for (const name of ["read_tool", "execute", "world.query", "world.inspect", "vegetation.update"]) {
      expect(AGENT_PROTOCOL).not.toContain(name);
    }
  });

  it("keeps context evidence rules and places concrete usage in tool descriptions", () => {
    expect(AGENT_PROTOCOL).toContain("不得覆盖本轮指令");
    expect(AGENT_PROTOCOL).toContain("已有引用能唯一确定用户指代的对象时，复用该引用");
    expect(AGENT_PROTOCOL).toContain("不把历史成功当作当前状态");
    expect(AGENT_PROTOCOL).toContain("摘要中未出现不等于不存在");
    const [execute] = buildAgentToolDefinitions(definition);
    expect(execute.function.description).toContain("read/glob/grep");
    expect(execute.function.description).toContain("skills");
    expect(execute.function.description).not.toContain("async function main()");
    expect(execute.function.description).toContain("tools.* 或 editor.*");
    expect(execute.function.description).toContain("结合原代码、error 和可选 location 修正");
    expect(execute.function.description).toContain("console.log/info/warn/error 和 return 都可以输出结果");
    expect(execute.function.description).toContain("无需同时打印并返回");
  });

  it("publishes execute as the strict provider-native entrypoint", () => {
    const tools = buildAgentToolDefinitions(definition);
    expect(tools.map(tool => tool.function.name)).toEqual(["execute", "read", "write", "edit", "delete", "glob", "grep"]);
    expect(tools[0].function).toMatchObject({strict:true,parameters:{required:["code"],additionalProperties:false}});
    for (const {function: tool} of tools) {
      expect(tool.strict).toBe(true);
      expect(tool.parameters.additionalProperties).toBe(false);
      expect(tool.parameters.required).toEqual(Object.keys(tool.parameters.properties as object));
    }
    expect(fileReadInput.parse({file_path:"skills/fixture/README.md",offset:null,limit:null})).toEqual({
      file_path:"skills/fixture/README.md",offset:null,limit:null
    });
  });
  it("defines file windows in the script API contract", () => {
    expect(fileReadInput.parse({file_path:"skills/fixture/README.md"})).toEqual({file_path:"skills/fixture/README.md"});
    expect(fileReadInput.parse({file_path:"skills/fixture/README.md",offset:30,limit:20})).toMatchObject({offset:30,limit:20});
  });

  it("teaches one next action per invocation and direct final replies", () => {
    const prompt = buildAgentSystemPrompt(definition);

    expect(prompt).toContain("每次模型调用可提交一个或多个 Tool Call，或在任务已完成时直接回复用户");
    expect(prompt).toContain("每个 Tool Call 必须有独立 ID");
    expect(prompt).toContain("对应结果");
    expect(prompt).toContain("已有上下文足以回答且无需执行操作时，直接回复");
    expect(prompt).toContain("操作是否完成以实际 Tool Result 为依据");
    expect(prompt).toContain("已有引用能唯一确定用户指代的对象时，复用该引用");
    expect(prompt).not.toContain(definition.scriptApi.catalog);
    expect(prompt).not.toContain("【应用约束】");
    expect(prompt).not.toContain("species: string");
    expect(prompt).not.toContain('"type":"final"');
    expect(prompt).not.toContain("responseFormat");
  });

  it("replays assistant Tool Calls and matching Tool Results without flattening identity", () => {
    const transcript: AgentMessage[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{
          id: "call-1",
          type: "function",
          function: { name: "read_tool", arguments: '{"file_path":"TreeAsset"}' }
        }]
      },
      {
        role: "tool",
        toolCallId: "call-1",
        content: '{"ok":true,"result":{"declarations":[]}}'
      }
    ];
    const messages = buildAgentMessages({
      systemPrompt: "system",
      taskId: "task-1",
      userInput: "我面前有什么树",
      inputSource: "text",
      worldThumbnail: { viewer: { position: [1, 2, 3] } },
      transcript
    });

    expect(messages.map((message) => message.role)).toEqual(["system", "user", "user", "user", "user", "assistant", "tool", "user"]);
    expect(messages[5]).toEqual(transcript[0]);
    expect(messages[6]).toEqual(transcript[1]);
    expect(JSON.parse(messages[3].content)).toMatchObject({
      contextKind: "agent_task",
      instruction: "我面前有什么树"
    });
  });

  it.each(["../../../demos/terrain/README.md", "/etc/passwd", "building/../README.md", "building\\README.md", "./README.md", "building//README.md"])("rejects noncanonical knowledge path %s", path => {
    expect(() => fileReadInput.parse({file_path:path})).toThrow(/path/);
  });

  it("exposes visual observation only for applications with a capture provider", () => {
    expect(buildAgentToolDefinitions(definition).some(tool => tool.function.name === "snapshot")).toBe(false);
    const visual = { ...definition, captureSnapshot: vi.fn() };
    expect(buildAgentToolDefinitions(visual).some(tool => tool.function.name === "snapshot")).toBe(true);
    expect(parseAgentToolCall({ id: "view", type: "function", function: { name: "snapshot", arguments: "{}" } })).toEqual({ type: "snapshot" });
    expect(() => parseAgentToolCall({ id: "view", type: "function", function: { name: "snapshot", arguments: '{"target":"other"}' } })).toThrow("不接受参数");
  });

  it("parses registered Tool Calls and rejects unknown names", () => {
    expect(parseAgentToolCall({
      id: "call-execute",
      type: "function",
      function: {
        name: "execute",
        arguments: JSON.stringify({ code: " return null; " })
      }
    })).toEqual({ type: "execute", code: " return null; " });
    expect(() => parseAgentToolCall({
      id: "call-other",
      type: "function",
      function: { name: "final", arguments: "{}" }
    })).toThrow("未注册的 Agent Tool");
  });

  it("treats nonempty assistant content as the final answer", () => {
    expect(parseAgentFinalMessage(" 已经完成。 ")).toBe("已经完成。");
    expect(parseAgentFinalMessage("结果".repeat(300))).toBe("结果".repeat(300));
    expect(() => parseAgentFinalMessage("x".repeat(8193))).toThrow("8192");
    expect(() => parseAgentFinalMessage(" ")).toThrow("没有返回 Tool Call 或最终回复");
  });
});


it("preserves exact virtual path identities returned by list", () => {
  const paths = [" Guide.md", "Guide.md", "Notes/trailing "];
  for (const path of paths) {
    expect(fileReadInput.parse({file_path:path})).toEqual({file_path:path});
  }
});
