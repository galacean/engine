import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ frames: [] as any[], budgets: [] as unknown[], failRead: false, failResolve: false }));
vi.mock("@galacean/engine", () => ({ Vector3: class {} }));
vi.mock("@galacean/engine-world-planning/world/SeedWorldPicker.ts", () => ({
  SeedWorldPicker: class {
    constructor(readonly camera: unknown) {}
    captureIdentity(_visit: unknown, resolve: (batch: unknown) => unknown, image: unknown, budget?: unknown) {
      state.budgets.push(budget);
      const ref = resolve({count: 1, resolve: () => "tree-1"});
      const frame = {width: 1, height: 1, image, identities: {
        identityBits: 14,
        read: () => { if (state.failRead) throw new Error("readback failed"); return new Uint8Array([7, 192, 205, 100]); },
        resolve: (id: number) => { if (state.failResolve) throw new Error("identity lookup failed"); return id === 7 ? ref : undefined; },
        dispose: vi.fn()
      }};
      state.frames.push(frame);
      return frame;
    }
    dispose() {}
  }
}));
import { SeedWorldPicker } from "@galacean/engine-world-planning/world/SeedWorldPicker.ts";
import { prepareViewPointerFixture, captureSnapshotPointer, disposeViewPointerFixture } from "./llm/view-pointer-fixture";

const panels: any[] = [];
afterEach(() => {
  for (const panel of panels.splice(0)) disposeViewPointerFixture(panel);
  vi.unstubAllGlobals(); state.frames.length = 0; state.budgets.length = 0; state.failRead = false; state.failResolve = false;
});
function fixture() {
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 0; });
  const camera = {entity: {transform: {worldPosition: {x: 1, y: 2, z: 3}, worldForward: {x: 0, y: 0, z: -1},
    setWorldPosition() {}, lookAt() {}}}};
  const picker: any = new SeedWorldPicker(camera as any), budget = {};
  const ref = {entityId: 1, componentId: 2, componentType: "Tree", instanceKey: "tree-1"};
  let serial = 0, trace: any, gate: Promise<void> | undefined;
  const views = {async snapshot(_signal: AbortSignal) {
    const frame = picker.captureIdentity(() => {}, () => ref, {}, budget);
    frame.identities.dispose();
    await gate; // Simulate asynchronous encoding, including an exporter that ignores cancellation.
    return {imagePath: `image-${++serial}`, image: {width: 1, height: 1}, metadata: {}};
  }};
  const originalCapture = (SeedWorldPicker.prototype as any).captureIdentity, originalSnapshot = views.snapshot;
  const context = {navigation: {enabled: true}, orbit: {enabled: true}};
  const panel: any = {_options: {camera}, debug: {getLastTrace: () => trace}, application: {
    _engine: {_options: {readContext: () => context}}, viewSnapshots: views,
    requireViewSnapshots: () => views,
    selectWorld: () => ({items: [{ref: {id: "tree-1"}, position: [0, 0, 0]}]}),
    resolvePickedObject: (id: string) => id === "tree-1" ? {ref: {id, kind: "tree"}} : undefined
  }};
  panels.push(panel);
  const setTrace = (path: string, args = JSON.stringify({file_path:path,points:[{x:0,y:0}]})) => {
    const identity={taskId:"task",step:1,call:1,toolCallId:"pick-1",tool:"pick"};
    trace={agentEvents:[
      {event:{type:"transcript_appended",messages:[{role:"assistant",toolCalls:[{id:"pick-1",function:{name:"pick",arguments:args}}]}]}},
      {event:{type:"model_finished",taskId:"task",step:{step:1,toolCallId:"pick-1"}}},
      {event:{type:"tool_started",...identity,input:{}}},
      {event:{type:"tool_finished",...identity,result:{ok:true,value:{}}}},
      {event:{type:"transcript_appended",messages:[{role:"tool",toolCallId:"pick-1",content:"{}"}]}}
    ]};
  };
  const assertReleased = () => {
    expect((SeedWorldPicker.prototype as any).captureIdentity).toBe(originalCapture);
    expect(views.snapshot).toBe(originalSnapshot);
    expect(state.frames.every(frame => frame.identities.dispose.mock.calls.length === 1)).toBe(true);
    disposeViewPointerFixture(panel); // Repeated teardown must not release a resource twice.
    expect(state.frames.every(frame => frame.identities.dispose.mock.calls.length === 1)).toBe(true);
  };
  return {panel, views, ref, budget, setTrace, assertReleased, setGate: (value: Promise<void>) => { gate=value; }};
}
it("samples packed pixels and restores the exact interception and snapshot methods", async () => {
  const f=fixture();await prepareViewPointerFixture(f.panel);
  expect(captureSnapshotPointer(f.panel,"before").samples).toEqual([]);
  const image=await f.views.snapshot(new AbortController().signal);f.setTrace(image.imagePath);
  const result=captureSnapshotPointer(f.panel,"after");
  expect(result.samples).toMatchObject([{invocationKey:'["task",1,1]',callId:"pick-1",expected:[f.ref],objects:[{id:"tree-1",kind:"tree"}]}]);
  expect(result.errors).toEqual([]);f.assertReleased();
  const frames=state.frames.length;await f.views.snapshot(new AbortController().signal);
  expect(state.frames.length).toBe(frames+1);expect(state.budgets.filter(value=>value===f.budget)).toHaveLength(3);
});
for(const args of ['{broken','null','{}','{"file_path":"image-2","points":[null]}']) it(`records malformed arguments and always cleans up: ${args}`,async()=>{
  const f=fixture();await prepareViewPointerFixture(f.panel);
  const image=await f.views.snapshot(new AbortController().signal);f.setTrace(image.imagePath,args);
  expect(captureSnapshotPointer(f.panel,"after").samples[0].error).toBeTruthy();f.assertReleased();
});
it("releases snapshots even when trace lookup throws",async()=>{
  const f=fixture();await prepareViewPointerFixture(f.panel);await f.views.snapshot(new AbortController().signal);
  f.panel.debug.getLastTrace=()=>{throw new Error("trace failed");};
  expect(captureSnapshotPointer(f.panel,"after").errors).toContain("Error: trace failed");f.assertReleased();
});
it("after-phase without a trace still disposes, while before-phase does not",async()=>{
  const f=fixture();await prepareViewPointerFixture(f.panel);
  expect(captureSnapshotPointer(f.panel,"before").errors).toEqual([]);
  expect(captureSnapshotPointer(f.panel,"after").errors).toContain("Error: Task trace missing");f.assertReleased();
});
it("a failing GPU read during preparation releases the returned frozen texture",async()=>{
  const f=fixture();state.failRead=true;
  await expect(prepareViewPointerFixture(f.panel)).rejects.toThrow("snapshot missing");f.assertReleased();
});
it("a failed identity lookup during sampling is retained and resources are released",async()=>{
  const f=fixture();await prepareViewPointerFixture(f.panel);
  const image=await f.views.snapshot(new AbortController().signal);f.setTrace(image.imagePath);state.failResolve=true;
  expect(captureSnapshotPointer(f.panel,"after").samples[0].error).toContain("identity lookup failed");f.assertReleased();
});
it("export rejection releases the independent frame before final teardown",async()=>{
  const f=fixture();await prepareViewPointerFixture(f.panel);
  const gate=Promise.withResolvers<void>();f.setGate(gate.promise);
  const pending=f.views.snapshot(new AbortController().signal);await Promise.resolve();
  gate.reject(new Error("encoding failed"));await expect(pending).rejects.toThrow("encoding failed");
  disposeViewPointerFixture(f.panel);f.assertReleased();
});
it("disposal during delayed export immediately frees independent frames and prevents late publication",async()=>{
  const f=fixture();await prepareViewPointerFixture(f.panel);
  const gate=Promise.withResolvers<void>();f.setGate(gate.promise);
  const pending=f.views.snapshot(new AbortController().signal);await Promise.resolve();
  disposeViewPointerFixture(f.panel);f.assertReleased();
  gate.resolve();await expect(pending).rejects.toThrow();f.assertReleased();
});
it("cancelled caller immediately releases its in-flight frame even before export settles",async()=>{
  const f=fixture();await prepareViewPointerFixture(f.panel);
  const gate=Promise.withResolvers<void>();f.setGate(gate.promise);const controller=new AbortController();
  const pending=f.views.snapshot(controller.signal);await Promise.resolve();controller.abort();
  expect(state.frames.every(frame=>frame.identities.dispose.mock.calls.length===1)).toBe(true);gate.resolve();
  await expect(pending).rejects.toThrow();disposeViewPointerFixture(f.panel);f.assertReleased();
});
it("teardown prevents a queued capture from starting after the active export completes",async()=>{
  const f=fixture();await prepareViewPointerFixture(f.panel);
  const gate=Promise.withResolvers<void>();f.setGate(gate.promise);
  const first=f.views.snapshot(new AbortController().signal);
  const second=f.views.snapshot(new AbortController().signal);
  const settled=Promise.allSettled([first,second]);await Promise.resolve();
  const captures=state.frames.length;
  disposeViewPointerFixture(f.panel);f.assertReleased();gate.resolve();
  expect((await settled).map(result=>result.status)).toEqual(["rejected","rejected"]);
  expect(state.frames).toHaveLength(captures);f.assertReleased();
});
it("preparing again releases the previous fixture without stacking interception wrappers",async()=>{
  const f=fixture();await prepareViewPointerFixture(f.panel);
  await f.views.snapshot(new AbortController().signal);
  await prepareViewPointerFixture(f.panel);
  expect(state.frames.every(frame=>frame.identities.dispose.mock.calls.length===1)).toBe(true);
  const captures=state.frames.length;
  await f.views.snapshot(new AbortController().signal);
  expect(state.frames).toHaveLength(captures+2); // Production and one independent capture.
  disposeViewPointerFixture(f.panel);f.assertReleased();
});
