import {afterEach, expect, it, vi} from "vitest";
vi.hoisted(() => Object.assign(globalThis, {window: {}}));
vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", () => ({requestAsapChat: vi.fn()}));
import {requestAsapChat} from "@galacean/engine-ai-chat/ai-chat/asap-chat.ts";
import {createTestAgentLoop} from "../../ai-chat/tests/AIChatTestRuntime";
import type {AgentEvent} from "@galacean/engine-ai-chat/ai-chat/agent-types.ts";
import {RuntimeProjectSession} from "../src/project/runtime-project-session";
import {RuntimeProjectStorage, RUNTIME_PROJECT_SAVE_VERSION} from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import {RuntimeNativeEditor} from "../src/runtime-editor-agent/runtime-native-editor";
import {VirtualProjectFiles} from "@galacean/engine-project/project-files/virtual-project-files.ts";
import {AgentNativeFiles} from "@galacean/engine-ai-chat/ai-chat/agent-native-files.ts";
import {executeAgentEdit} from "@galacean/engine-ai-chat/ai-chat/agent-edit-execution.ts";
import {JavaScriptAgentScriptRuntime} from "@galacean/engine-ai-chat/ai-chat/agent-script-runtime.ts";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

/** Real document transaction and activation queue; only storage/compiler/rendering are isolated. */
async function fixture() {
  const pack = {version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {scene: "Main.scene", files: [{virtualPath: "Main.scene", path: "Main.scene", type: "Scene"}]},
    contents: {"Main.scene": JSON.stringify({asset: {version: "2.0"},
      scene: {rootEntities: [], background: {mode: 0, color: {r: 0, g: 0, b: 0, a: 1}}}, entities: [], components: []})}, documents: {}};
  vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({load: async () => pack, save: async () => {}, close() {}} as any);
  const project = await RuntimeProjectSession.open("activation", pack.project, "https://example.test/");
  vi.spyOn(project, "compileScripts").mockResolvedValue({dependencies: {}} as any);
  vi.spyOn(project, "scriptClasses").mockResolvedValue(new Map());
  const editor = new RuntimeNativeEditor(project, {rootEntities: [], engine: {resourceManager: {registerVirtualResources() {}}}} as any);
  vi.spyOn(editor.projection, "apply").mockResolvedValue(undefined);
  const gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>();
  const unregister = project.registerRuntimeActivation({before: async () => {}, after: async () => {
    entered.resolve(); await gate.promise;
  }});
  const definition = {scriptApi: {catalog: "API", entries: [], modules: []}, toolNames: [],
    beginEdit: (id: string, signal: AbortSignal) => editor.beginEdit(id, signal)};
  const start = (entry: "file" | "execute", signal: AbortSignal) => {
    if (entry === "file") return new AgentNativeFiles(() => new VirtualProjectFiles(editor.projectFiles),
      () => definition, new Map(), () => "", 1000).execute("write", {file_path: "note.md", content: "saved"}, "file", signal);
    const bindings = [{name: "save", effect: "edit" as const, invoke: async () => ({ok: true as const, value: null})}];
    return executeAgentEdit(new JavaScriptAgentScriptRuntime(), {check: async () => undefined},
      {id: "execute", source: "await tools.save();", signal, toolBindings: bindings, maxToolCalls: 1, timeoutMs: 1000}, [], s => {
        const transaction = editor.beginEdit("execute", s);
        return {transaction, toolBindings: [{...bindings[0], invoke: async () => {
          await transaction.documents!.write("note.md", "saved"); return {ok: true as const, value: null};
        }}]};
      });
  };
  return {project, gate, entered, start, definition, close() {unregister(); editor.dispose(); project.dispose();}};
}

it.each(["file", "execute"] as const)("%s returns a committed receipt before a stuck activation settles on cancel or timeout", async entry => {
  for (const mode of ["cancel", "timeout"] as const) {
    vi.useFakeTimers();
    const f = await fixture(), controller = new AbortController();
    let settled = false;
    const task = f.start(entry, controller.signal).then(result => {settled = true; return result;});
    try {
      await f.entered.promise;
      if (mode === "cancel") controller.abort();
      await vi.advanceTimersByTimeAsync(mode === "timeout" ? 1001 : 0);
      expect(settled).toBe(true);
      expect((await task).receipt).toMatchObject({status: "committed", runtimeErrors: [
        expect.stringContaining(mode === "cancel" ? "cancelled" : "timeoutMs=1000")
      ]});
      expect(f.project.projectPackage.documents?.["note.md"]).toBe("saved");
      expect(f.project.publicationRevision).toBe(1);
    } finally {
      f.gate.resolve(); await task; await vi.advanceTimersByTimeAsync(0); f.close();
      vi.restoreAllMocks(); vi.useRealTimers();
    }
  }
});

it("keeps cancelled activation serialized, skips later phases, and lets the next activation run without replaying the commit", async () => {
  const f = await fixture(), controller = new AbortController();
  const laterParticipant = vi.fn(async () => {});
  const unregister = f.project.registerRuntimeActivation({before: async () => {}, after: laterParticipant});
  const first = f.start("file", controller.signal);
  try {
    await f.entered.promise; controller.abort();
    expect((await first).receipt?.status).toBe("committed");
    const update = vi.fn(async () => {});
    const next = f.project.activateRuntime(update, new AbortController().signal);
    await Promise.resolve();
    expect(update).not.toHaveBeenCalled();
    f.gate.resolve(); await next;
    expect(update).toHaveBeenCalledOnce();
    expect(laterParticipant).toHaveBeenCalledOnce();
    expect(f.project.publicationRevision).toBe(1);
  } finally {f.gate.resolve(); await first; unregister(); f.close();}
});

it("completes normal activation without inventing runtime errors", async () => {
  const f = await fixture();
  f.gate.resolve();
  try {
    expect((await f.start("file", new AbortController().signal)).receipt).toEqual({executionId: "file", status: "committed", transactionId: "file"});
  } finally {f.close();}
});

it("cancels an activation still queued before it can start any host callback", async () => {
  const f = await fixture(), blocker = Promise.withResolvers<void>();
  f.gate.resolve();
  const first = f.project.activateRuntime(() => blocker.promise, new AbortController().signal);
  const controller = new AbortController(), update = vi.fn(async () => {});
  const next = f.project.activateRuntime(update, controller.signal).catch(error => error);
  controller.abort(); blocker.resolve();
  try {await first; expect(await next).toBeInstanceOf(Error); expect(update).not.toHaveBeenCalled();}
  finally {f.close();}
});

it("stops a multi-call task after a committed file edit and pairs the remaining call as not started", async () => {
  const f = await fixture();
  const request = vi.mocked(requestAsapChat); request.mockReset();
  request.mockResolvedValueOnce({content: "", finishReason: "tool_calls", toolCalls: ["first", "second"].map(id => ({
    id, type: "function" as const, function: {name: "write", arguments: JSON.stringify({file_path: `${id}.md`, content: "saved"})}
  }))});
  const events: AgentEvent[] = [];
  const loop = createTestAgentLoop({tools: [], definition: f.definition});
  loop.subscribe(event => events.push(event));
  const task = loop.run("write two notes", {debugMode: true}).catch(error => error);
  try {
    await f.entered.promise; loop.cancel();
    expect(await task).toBeInstanceOf(Error);
    expect(loop.running).toBe(false);
    const messages = events.flatMap(event => event.type === "transcript_appended" ? event.messages : []);
    const replies = messages.filter(message => message.role === "tool");
    expect(replies.map(reply => reply.toolCallId)).toEqual(["first", "second"]);
    expect(replies[0].content).toContain('"status":"committed"');
    expect(replies[0].content).toContain("activation cancelled");
    expect(replies[1].content).toContain("NOT_STARTED");
    const failed = events.find(event => event.type === "task_failed")!;
    expect(failed.type === "task_failed" && failed.failure.executionSummary?.committed).toHaveLength(1);
    expect(f.project.projectPackage.documents?.["first.md"]).toBe("saved");
    expect(f.project.projectPackage.documents?.["second.md"]).toBeUndefined();
    expect(f.project.publicationRevision).toBe(1);
    expect(request).toHaveBeenCalledOnce();
  } finally {f.gate.resolve(); await task; await Promise.resolve(); f.close();}
});
