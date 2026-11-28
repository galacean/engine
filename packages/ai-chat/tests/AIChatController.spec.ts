import { createTestAgentLoop } from "./AIChatTestRuntime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ai-chat/asap-chat", () => ({
  requestAsapChat: vi.fn(),
}));

import { AIChat } from "../src/ai-chat/ai-chat";
import { AIChatSession } from "../src/ai-chat/ai-chat-session";
import { requestAsapChat } from "../src/ai-chat/asap-chat";

const mockedRequest = vi.mocked(requestAsapChat);

class FakeElement {
  readonly tag: string;
  readonly dataset: Record<string, string> = {};
  readonly classList = { add: vi.fn() };
  children: FakeElement[] = [];
  className = "";
  textContent = "";
  value = "";
  disabled = false;
  scrollTop = 0;
  scrollHeight = 0;

  constructor(tag: string) {
    this.tag = tag;
  }

  addEventListener(): void {}

  removeEventListener(): void {}

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = children.flatMap((child) => (
      child.tag === "fragment" ? child.children : [child]
    ));
    this.scrollHeight = this.children.length;
  }

  focus = vi.fn();
}

describe("AIChat", () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    vi.stubGlobal("document", {
      createDocumentFragment: () => new FakeElement("fragment"),
      createElement: (tag: string) => new FakeElement(tag),
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces stale progress text with a final failure message", async () => {
    mockedRequest.mockRejectedValue(new Error("HTTP 500"));
    const messages = new FakeElement("messages");
    const error = new FakeElement("error");
    const chat = new AIChat({
      session: new AIChatSession({
        agent: createTestAgentLoop({
          tools: [],
          definition: {
            scriptApi: { hostNotes: "Test API symbols: none", entries: [], modules: [] },
            toolNames: [],
          },
        }),
      }),
      elements: {
        messages: messages as unknown as HTMLElement,
        form: new FakeElement("form") as unknown as HTMLFormElement,
        input: new FakeElement("input") as unknown as HTMLInputElement,
        sendButton: new FakeElement("button") as unknown as HTMLButtonElement,
        error: error as unknown as HTMLElement,
      },
      getRunOptions: () => ({}),
    });

    await chat.send("你好");

    expect(messages.children.at(-1)?.textContent).toBe("任务未完成：处理过程中遇到了问题。\n本次任务没有保存新的修改。\n本次模型请求未返回可执行结果。");
    expect(error.textContent).toBe(messages.children.at(-1)?.textContent);
    expect(mockedRequest).toHaveBeenCalledOnce();
    chat.destroy();
  });
  it("renders preparation and stopped state from Session, and remounts without cancelling work", async () => {
    mockedRequest.mockResolvedValue({ content: "done", toolCalls: [], finishReason: "stop" });
    const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition: {
      toolNames: [], scriptApi: { hostNotes: "none", entries: [], modules: [] }
    } }) });
    const mount = () => {
      const messages = new FakeElement("messages"), sendButton = new FakeElement("button");
      const chat = new AIChat({ session, getRunOptions: () => ({}), elements: {
        messages, sendButton, form: new FakeElement("form"), input: new FakeElement("input"), error: new FakeElement("error")
      } as any });
      return { chat, messages, sendButton };
    };
    const a = mount();
    await a.chat.send("prior task");
    const gate = Promise.withResolvers<any[]>();
    const release = vi.fn();
    const pending = session.run("new photo", {}, "next-step", { prepare: () => gate.promise, release });
    expect(a.chat.busy).toBe(true);
    expect(a.messages.children.at(-1)?.textContent).toContain("准备图片");
    a.chat.destroy();
    expect(session.state).toBe("preparing"); expect(release).not.toHaveBeenCalled();
    const b = mount();
    expect(b.messages.children.at(-1)?.textContent).toContain("准备图片");
    await session.stop();
    expect(b.chat.busy).toBe(false); expect(b.sendButton.textContent).toBe("发送");
    expect(b.messages.children.at(-1)?.textContent).toContain("已停止");
    const continued = session.continue().then(receipt => receipt.completion); gate.resolve([]); await continued; await pending;
    expect(b.messages.children.at(-1)?.textContent).toBe("done");
    b.chat.destroy();
    const c = mount(); expect(c.messages.children.at(-1)?.textContent).toBe("done");
    expect(release).toHaveBeenCalledOnce();
    c.chat.destroy(); session.dispose();
  });

  it.each([
    { command: "send", failure: false }, { command: "send", failure: true },
    { command: "continue", failure: false }, { command: "continue", failure: true }
  ])("never updates or focuses a detached view after $command settles (failure=$failure)", async ({ command, failure }) => {
    const gate = Promise.withResolvers<any>();
    if (command === "continue") {
      mockedRequest.mockImplementationOnce(({ signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }));
    }
    mockedRequest.mockReturnValueOnce(gate.promise);
    const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition: {
      toolNames: [], scriptApi: { hostNotes: "none", entries: [], modules: [] }
    } }) });
    const mount = () => {
      const elements = { messages: new FakeElement("messages"), form: new FakeElement("form"),
        input: new FakeElement("input"), sendButton: new FakeElement("button"), error: new FakeElement("error") };
      return { elements, chat: new AIChat({ session, getRunOptions: () => ({}), elements: elements as any }) };
    };
    const first = mount();
    let sent = first.chat.send("photo");
    await vi.waitFor(() => expect(mockedRequest).toHaveBeenCalledOnce());
    if (command === "continue") {
      await session.stop(); await sent;
      sent = first.chat.continue();
      await vi.waitFor(() => expect(mockedRequest).toHaveBeenCalledTimes(2));
    }
    first.chat.destroy();
    first.elements.input.focus.mockClear();
    const beforeError = first.elements.error.textContent;
    const next = mount();
    if (failure) gate.reject(new Error("HTTP 500"));
    else gate.resolve({ content: "done", toolCalls: [], finishReason: "stop" });
    await expect(sent).resolves.toBeUndefined();
    expect(first.elements.input.focus).not.toHaveBeenCalled();
    expect(first.elements.error.textContent).toBe(beforeError);
    expect(next.elements.error.textContent).toBe(failure ? session.snapshot.current?.outcome?.message : "");
    expect(session.snapshot.current?.outcome?.status).toBe(failure ? "failed" : "completed");
    next.chat.destroy(); session.dispose();
  });

  it("shows command rejection locally without creating a failed Session task", async () => {
    const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition: {
      toolNames: [], scriptApi: { hostNotes: "none", entries: [], modules: [] }
    } }) });
    const elements = { messages: new FakeElement("messages"), form: new FakeElement("form"),
      input: new FakeElement("input"), sendButton: new FakeElement("button"), error: new FakeElement("error") };
    const chat = new AIChat({ session, getRunOptions: () => ({}), elements: elements as any });
    await chat.continue();
    expect(elements.error.textContent).toContain("No stopped task");
    expect(session.snapshot.tasks).toHaveLength(0);
    mockedRequest.mockResolvedValue({ content: "done", toolCalls: [], finishReason: "stop" });
    await chat.send("accepted");
    expect(elements.error.textContent).toBe("");
    expect(session.snapshot.current?.outcome?.status).toBe("completed");
    chat.destroy(); session.dispose();
  });

  it.each([false, true])("remounts file results and errors from Session after task failure=%s", async failed => {
    mockedRequest.mockResolvedValueOnce({ content: "", finishReason: "tool_calls", toolCalls: [
      { id: "read", type: "function", function: { name: "read", arguments: '{"file_path":"skills/fixture/README.md"}' } },
      { id: "missing", type: "function", function: { name: "read", arguments: '{"file_path":"skills/fixture/missing.md"}' } }
    ] });
    if (failed) mockedRequest.mockRejectedValueOnce(new Error("HTTP 500"));
    else mockedRequest.mockResolvedValueOnce({ content: "done", toolCalls: [], finishReason: "stop" });
    const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition: {
      toolNames: [], scriptApi: { hostNotes: "file result retained", entries: [], modules: [], documents: [{ path: "skills/fixture/README.md", content: "file result retained" }] }
    } }) });
    const mount = () => {
      const messages = new FakeElement("messages");
      const chat = new AIChat({ session, getRunOptions: () => ({ debugMode: true }), elements: {
        messages, form: new FakeElement("form"), input: new FakeElement("input"),
        sendButton: new FakeElement("button"), error: new FakeElement("error")
      } as any });
      chat.setDebugVisible(true);
      const text = (node: FakeElement): string => [node.textContent, ...node.children.map(text)].join("\n");
      return { chat, text: () => text(messages) };
    };
    const first = mount();
    await first.chat.send("read files");
    expect(first.text()).toContain("file result retained");
    expect(first.text()).toContain("Unknown project path 'skills/fixture/missing.md'");
    expect(first.text()).toContain("FILE_OPERATION_FAILED");
    const before = first.text();
    first.chat.destroy();
    const remounted = mount();
    expect(remounted.text()).toBe(before);
    remounted.chat.destroy(); session.dispose();
  });

});
