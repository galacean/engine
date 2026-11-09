import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@galacean/engine-ai-chat/ai-chat/index.ts";
import { SessionData } from "@galacean/engine-ai-chat/ai-chat/session-data.ts";
import { projectSeedWorldTask } from "../../demos/seed-world/assistant/SeedWorldTaskPresentation";

const model = (rawContent: string, error: string | null = null): AgentEvent => ({
  type: "model_finished", taskId: "task", step: { step: 1,
    decision: { type: "execute", code: "return await world.query()" },
    attempts: [{ attempt: 1, rawContent: "rejected response", error: "invalid" }, { attempt: 2, rawContent, error }]
  }
});
function setup() {
  const data = new SessionData();
  data.begin({ id: "input", text: "用户原始需求", inputSource: "text" }, {}, 0);
  data.accept({ type: "task_started", taskId: "task", input: "用户原始需求", inputSource: "text" });
  return { data, view: () => projectSeedWorldTask(data.snapshot("executing", false, false, [])) };
}
describe("Seed World task projection", () => {
  it("projects VFS search progress from Session data", () => {
    const { data, view } = setup();
    const event = model("");
    if (event.type !== "model_finished") throw new Error("Expected model event");
    event.step.decision = { type: "search_tool", path: "", query: "Camera", mode: "literal", limit: 10 };
    data.accept(event);
    expect(view().text).toBe("搜索相关文件内容");
    expect(view().details).toContain("搜索相关文件内容");
  });
  it("reconstructs accepted commentary and tool progress from session data without event replay in the view", () => {
    const { data, view } = setup();
    data.accept(model("我先查询当前时间，再检查天气。"));
    data.accept({ type: "tool_started", taskId: "task", step: 1, tool: "time.get", input: {} });
    expect(view().text).toBe("我先查询当前时间，再检查天气。");
    expect(view().details).toContain("正在查询时间设置");
    data.accept({ type: "script_finished", taskId: "task", step: 1, result: { ok: true, output: null } });
    data.accept({ type: "model_started", taskId: "task", step: 2 });
    expect(view().text).toBe("正在分析请求");
    expect(view().details).not.toMatch(/rejected response|本步执行已完成/);
    const snapshot = data.snapshot("executing", false, false, []);
    expect(projectSeedWorldTask(snapshot)).toEqual(projectSeedWorldTask(snapshot));
  });
  it("does not retain invalid responses, reasoning or executable protocol in display data", () => {
    const { data, view } = setup();
    data.accept(model("invalid visible", "parse failed"));
    data.accept(model('<think>private reasoning</think>现在检查场景。\n```js\nsecret();\n```'));
    expect(view().text).toBe("现在检查场景。");
    data.accept(model('{"type":"execute","code":"secret()"}'));
    expect(JSON.stringify(data.snapshot("executing", false, false, []))).not.toMatch(/invalid visible|private reasoning|secret/);
  });
  it("shows receipt failures and preparation/stop independently of task events", () => {
    const { data, view } = setup();
    data.accept({ type: "script_finished", taskId: "task", step: 1, result: { ok: true, output: null,
      receipt: { executionId: "one", status: "committed" } } });
    expect(view().text).toBe("本步修改已提交");
    data.accept({ type: "script_finished", taskId: "task", step: 1, result: { ok: true, output: null,
      receipt: { executionId: "two", status: "completed", runtimeErrors: ["bad runtime"] } } });
    expect(view().text).toContain("运行问题");
    expect(projectSeedWorldTask(data.snapshot("preparing", false, false, [])).text).toContain("准备图片");
    data.settleStopped();
    expect(projectSeedWorldTask(data.snapshot("stopped", true, false, [])).text).toContain("已停止");
  });
});


it("projects model requests and recovery from Session facts without retaining the screenshot phase", () => {
  const { data, view } = setup();
  data.accept({ type: "model_finished", taskId: "task", step: { step: 1, decision: { type: "snapshot" }, attempts: [] } });
  expect(view().text).toBe("查看当前画面");
  data.accept({ type: "model_started", taskId: "task", step: 2 });
  expect(view().text).toBe("正在分析请求");
  expect(view().details).not.toContain("正在分析请求");
  data.accept({ type: "model_recovery", taskId: "task", step: 2, attempt: 1, recovery: {
    sequence: 1, phase: "retry_wait", layer: "transport", attempt: 2, maxAttempts: 3,
    elapsedMs: 100, remainingMs: 1000, delayMs: 100, category: "rate_limit"
  } });
  expect(view().text).toContain("服务繁忙");
  data.accept({ type: "model_started", taskId: "task", step: 2 });
  expect(view().text).toBe("正在分析请求");
});
