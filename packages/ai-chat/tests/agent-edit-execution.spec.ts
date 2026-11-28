import { EditPreparationError } from "@galacean/engine-project/edit-transaction.ts";
import { describe, expect, it, vi } from "vitest";
import { executeAgentEdit } from "../src/ai-chat/agent-edit-execution";
import { JavaScriptAgentScriptRuntime } from "../src/ai-chat/agent-script-runtime";
import { AgentJavaScriptChecker } from "../src/ai-chat/agent-script-checker";
import { agentTypecheckLibraries } from "../src/script-checking/typecheck-libraries";
import type { AgentEditTransaction, AgentScriptCall, AgentScriptToolBinding } from "../src/ai-chat/agent-types";

const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
const checkerAdapter = { check: async (source: string, declarations: Parameters<typeof checker.check>[1]) => checker.check(source, declarations) };
const declarations = [{ id: "tools.d.ts", imports: [], source: `declare const tools: {
  create(input: { name: string }): Promise<{ id: number }>;
  list(): Promise<string[]>;
  fail(): Promise<never>;
};` }];

function harness(body: string, overrides: Partial<AgentScriptCall> = {}) {
  const state = { names: [] as string[] };
  let draft: string[] = [];
  let active = false;
  const calls: string[] = [];
  const bindings: AgentScriptToolBinding[] = [
    { name: "create", effect: "edit", invoke: async input => {
      if (!active) throw new Error("Draft closed");
      calls.push("create"); draft.push((input as { name: string }).name);
      return { ok: true, value: { id: draft.length } };
    } },
    { name: "list", effect: "read", invoke: async () => ({ ok: true, value: [...draft] }) },
    { name: "fail", effect: "edit", invoke: async () => ({ ok: false, error: { code: "INVALID_EDIT", message: "Cannot create component" } }) }
  ];
  const transaction: AgentEditTransaction = {
    tools: [], hasChanges: () => JSON.stringify(draft) !== JSON.stringify(state.names), prepare: vi.fn(),
    commit: vi.fn(() => { state.names = [...draft]; active = false; return { transactionId: "tx-1", revision: 1 }; }),
    discard: vi.fn(() => { active = false; draft = []; })
  };
  const open = vi.fn(() => { active = true; draft = [...state.names]; return { transaction, toolBindings: bindings }; });
  const controller = new AbortController();
  const call: AgentScriptCall = { id: "execute-1", source: `\n${body}\n`, toolBindings: bindings,
    signal: controller.signal, maxToolCalls: 10, timeoutMs: 2_000, ...overrides };
  return { state, transaction, bindings, calls, open, controller, call,
    run: () => executeAgentEdit(new JavaScriptAgentScriptRuntime(), checkerAdapter, call, declarations, open) };
}

describe("execute preflight and draft lifecycle", () => {
  it.each([false, true])("checks direct bodies and explicitly called helpers exactly once (helper=%s)", async explicitMain => {
    const body = 'const item = await tools.create({name:"cube"});\nconsole.log(item.id);\nreturn item;';
    const test = harness(body, {source: explicitMain ? `async function main() {\n${body}\n}\nreturn await main();` : body});
    expect(await test.run()).toMatchObject({ok:true,output:{id:1},console:[{level:"log",args:[1]}],receipt:{status:"committed"}});
    expect(test.calls).toEqual(["create"]);
    expect(test.transaction.commit).toHaveBeenCalledOnce();
  });

  it("does not implicitly invoke a declared function named main", async () => {
    const test = harness("", { source: 'async function main() { await tools.create({name:"unexpected"}); }' });
    expect(await test.run()).toMatchObject({ ok: true, returnValuePresent: false, receipt: { status: "completed" } });
    expect(test.calls).toEqual([]);
    expect(test.transaction.commit).not.toHaveBeenCalled();
  });

  it("rejects async-body type errors before any tool call, with original source coordinates", async () => {
    const test = harness('', {source:'console.log("start");\nawait tools.create({name:42});'});
    expect(await test.run()).toMatchObject({ok:false,error:{code:"SCRIPT_CHECK_FAILED",location:{line:2},details:{diagnostics:[{line:2}]}},receipt:{status:"rejected"}});
    expect(test.open).not.toHaveBeenCalled();
    expect(test.calls).toEqual([]);
  });

  it("rolls back async-body edits and preserves logs and the original throw line", async () => {
    const test = harness('', {source:'await tools.create({name:"cube"});\nconsole.log("created draft");\nthrow new Error("broken");'});
    expect(await test.run()).toMatchObject({ok:false,error:{location:{line:3}},console:[{args:["created draft"]}],receipt:{status:"aborted"}});
    expect(test.state.names).toEqual([]);
    expect(test.transaction.commit).not.toHaveBeenCalled();
    expect(test.transaction.discard).toHaveBeenCalledOnce();
  });

  it.each(["return await tools.list();", "return 42;"])("does not publish or activate an unchanged draft: %s", async body => {
    const test = harness(body);
    test.transaction.commit = vi.fn(() => { throw new Error("stale storage revision"); });
    test.transaction.activate = vi.fn();
    expect(await test.run()).toMatchObject({ok:true,receipt:{status:"completed"}});
    expect(test.transaction.prepare).not.toHaveBeenCalled();
    expect(test.transaction.commit).not.toHaveBeenCalled();
    expect(test.transaction.activate).not.toHaveBeenCalled();
    expect(test.transaction.discard).toHaveBeenCalledTimes(body.includes("tools.") ? 1 : 0);
  });

  it("consults the transaction state instead of inferring changes from a tool effect", async () => {
    const test = harness('return await tools.create({name:"already exists"});');
    test.bindings[0].invoke = async () => ({ok:true,value:{id:1}});
    expect(await test.run()).toMatchObject({ok:true,receipt:{status:"completed"}});
    expect(test.transaction.commit).not.toHaveBeenCalled();
  });

  it.each(["check", "build"] as const)("returns asset %s diagnostics and discards without publication", async phase => {
    const test = harness('await tools.create({name:"cube"}); return null;');
    const message = phase === "check" ? "assets/Bad.ts(1,2): error TS2322: Invalid type" : "Could not resolve './missing' in assets/Bad.ts";
    test.transaction.prepare = () => {throw new EditPreparationError(phase === "check" ? "ASSET_SCRIPT_CHECK_FAILED" : "ASSET_SCRIPT_BUILD_FAILED", phase,message);};
    expect(await test.run()).toMatchObject({ok:false,error:{phase,message,code:phase === "check" ? "ASSET_SCRIPT_CHECK_FAILED" : "ASSET_SCRIPT_BUILD_FAILED"},receipt:{status:"aborted"}});
    expect(test.transaction.commit).not.toHaveBeenCalled();
    expect(test.transaction.discard).toHaveBeenCalledOnce();
    expect(test.state.names).toEqual([]);
  });
  it("rejects JS syntax and typed API errors before opening a draft", async () => {
    for (const code of ['return {;', 'await tools.create({name: 42}); return null;', 'await tools.missing(); return null;']) {
      const test = harness(code);
      expect(await test.run()).toMatchObject({ ok: false, error: { code: "SCRIPT_CHECK_FAILED", phase: "check" }, receipt: { status: "rejected" } });
      expect(test.open).not.toHaveBeenCalled();
      expect(test.calls).toEqual([]);
    }
  });

  it("checks ordinary JS promises, arrays and inferred API return types", async () => {
    const test = harness('const a = await tools.create({ name: "cube" }); return { id: a.id, names: (await tools.list()).map(n => n.toUpperCase()) };');
    expect(await test.run()).toMatchObject({ ok: true, output: { id: 1, names: ["CUBE"] }, receipt: { executionId: "execute-1", status: "committed", transactionId: "tx-1" } });
    expect(test.state.names).toEqual(["cube"]);
    expect(test.transaction.commit).toHaveBeenCalledOnce();
  });

  it("rejects a JavaScript module before opening a function-body execution draft", async () => {
    const test = harness('', { source: 'export async function main() { return null; }' });
    expect(await test.run()).toMatchObject({ ok: false, error: { phase: "check" }, receipt: { status: "rejected" } });
    expect(test.open).not.toHaveBeenCalled();
  });

  it("does not publish edits when execution or final output fails", async () => {
    for (const tail of ['throw new Error("broken");', 'return () => 1;']) {
      const test = harness(`await tools.create({ name: "cube" }); ${tail}`);
      expect(await test.run()).toMatchObject({ ok: false, receipt: { status: "aborted" } });
      expect(test.state.names).toEqual([]);
      expect(test.transaction.commit).not.toHaveBeenCalled();
      expect(test.transaction.discard).toHaveBeenCalledOnce();
    }
  });

  it("a caught editing failure still poisons the entire transaction", async () => {
    const test = harness('await tools.create({ name: "cube" }); try { await tools.fail(); } catch {} return { done: true };');
    expect(await test.run()).toMatchObject({ ok: false, error: { code: "INVALID_EDIT" }, receipt: { status: "aborted" } });
    expect(test.state.names).toEqual([]);
    expect(test.transaction.commit).not.toHaveBeenCalled();
  });

  it("settles an accepted call even when generated code omitted await", async () => {
    const test = harness('tools.create({ name: "cube" }); return null;');
    let release!: () => void;
    const entered = Promise.withResolvers<void>();
    const original = test.bindings[0].invoke;
    test.bindings[0].invoke = async (input, signal) => {
      entered.resolve();
      await new Promise<void>(resolve => { release = resolve; });
      return original(input, signal);
    };
    const result = test.run();
    await entered.promise;
    expect(test.transaction.commit).not.toHaveBeenCalled();
    expect(test.state.names).toEqual([]);
    release();
    expect(await result).toMatchObject({ ok: true, receipt: { status: "committed" } });
    expect(test.state.names).toEqual(["cube"]);
  });

  it("cancels preparation and revokes the draft before late completion", async () => {
    const test = harness('await tools.create({ name: "cube" }); return null;');
    const preparing = Promise.withResolvers<void>();
    const prepared = Promise.withResolvers<void>();
    test.transaction.prepare = () => { preparing.resolve(); return prepared.promise; };
    const result = test.run();
    await preparing.promise;
    test.controller.abort();
    expect(await result).toMatchObject({ ok: false, error: { code: "SCRIPT_CANCELLED" }, receipt: { status: "aborted" } });
    prepared.resolve();
    await Promise.resolve();
    expect(test.transaction.commit).not.toHaveBeenCalled();
    expect(test.state.names).toEqual([]);
  });

  it("keeps the committed outcome when cancellation arrives after publication begins", async () => {
    const test = harness('await tools.create({name: "cube"}); return null;', { onTrace: () => { throw new Error("Trace unavailable"); } });
    test.transaction.commit = async () => { test.controller.abort(); return { transactionId: "tx-1" }; };
    expect(await test.run()).toMatchObject({ ok: true, receipt: { status: "committed" } });
    expect(test.transaction.discard).not.toHaveBeenCalled();
  });

  it("does not label an unknown publication failure as safely aborted", async () => {
    const test = harness('await tools.create({name: "cube"}); return null;');
    test.transaction.commit = () => { throw new Error("Publisher failed"); };
    expect(await test.run()).toMatchObject({ ok: false, error: { code: "EDIT_PUBLICATION_FAILED", retryable: false }, receipt: { status: "publication_failed" } });
  });

  it("returns checker infrastructure failures before creating a transaction", async () => {
    const test = harness('return null;');
    const result = await executeAgentEdit(new JavaScriptAgentScriptRuntime(), {
      check: async () => { throw new Error("Checker unavailable"); }
    }, test.call, declarations, test.open);
    expect(result).toMatchObject({ ok: false, error: { code: "SCRIPT_CHECK_UNAVAILABLE" }, receipt: { status: "rejected" } });
    expect(test.open).not.toHaveBeenCalled();
  });

  it("discards a failed omitted-await edit and rejects calls chained after main returns", async () => {
    const failed = harness('tools.fail(); return null;');
    expect(await failed.run()).toMatchObject({ ok: false, error: { code: "INVALID_EDIT" }, receipt: { status: "aborted" } });
    const test = harness('tools.list().then(() => tools.create({name: "late"})).catch(() => {}); return null;');
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    test.bindings[1].invoke = async () => { entered.resolve(); await release.promise; return { ok: true, value: [] }; };
    const running = test.run();
    await entered.promise;
    // Allow main() to resolve and close admission before completing the read.
    await new Promise(resolve => setTimeout(resolve, 0));
    release.resolve();
    expect(await running).toMatchObject({ ok: false, receipt: { status: "aborted" } });
    expect(test.calls).toEqual([]);
    expect(test.transaction.commit).not.toHaveBeenCalled();
  });

  it("revokes late tools that ignored cancellation", async () => {
    const test = harness('await tools.create({name: "late"}); return null;');
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const original = test.bindings[0].invoke;
    test.bindings[0].invoke = async (input, signal) => { entered.resolve(); await release.promise; return original(input, signal); };
    const running = test.run();
    await entered.promise;
    test.controller.abort();
    expect(await running).toMatchObject({ ok: false, receipt: { status: "aborted" } });
    release.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(test.calls).toEqual([]);
    expect(test.state.names).toEqual([]);
  });

  it("cancels a stuck postcommit activation without changing the committed outcome", async () => {
    const test = harness('await tools.create({name: "cube"}); return null;');
    const activated = Promise.withResolvers<AbortSignal>();
    test.transaction.activate = signal => { activated.resolve(signal); return new Promise(() => {}); };
    const running = test.run();
    const signal = await activated.promise;
    test.controller.abort();
    expect(await running).toMatchObject({ ok: true, receipt: { status: "committed", runtimeErrors: ["Committed edit activation cancelled"] } });
    expect(signal.aborted).toBe(true);
    expect(test.state.names).toEqual(["cube"]);
    expect(test.transaction.discard).not.toHaveBeenCalled();
  });
});

describe("declaration cache", () => {
  it("resolves imported declarations and invalidates changed and removed modules", () => {
    const modules = [
      { id: "common/Thing.d.ts", source: "export interface Thing { name: string }" },
      { id: "tools/create.d.ts", source: 'import type { Thing } from "../common/Thing"; declare global { const tools: { create(input: Thing): Promise<Thing> }; }' }
    ];
    const source = ' return await tools.create({name: "cube"}); ';
    expect(checker.check(source, modules)).toBeUndefined();
    modules[0].source = "export interface Thing { name: number }";
    expect(checker.check(source, modules)?.code).toBe("SCRIPT_CHECK_FAILED");
    expect(checker.check(source, [])?.message).toContain("tools");
  });
});

it("treats nested script source as data while rejecting executable import and eval", async () => {
  const content = "export const lazy = () => import('./B'); // eval('data')";
  const test = harness(`await tools.create({name: ${JSON.stringify(content)}}); return null;`);
  expect(await test.run()).toMatchObject({ok: true});
  expect(test.state.names).toEqual([content]);
  for (const body of ["return import /* comment */ ('./B');", "return `${import('./B')}`;", "return eval /* comment */ ('1');"]) {
    const call = harness(body).call;
    expect(await new JavaScriptAgentScriptRuntime().execute(call)).toMatchObject({ok: false, error: {code: "SCRIPT_UNSUPPORTED"}});
  }
});

describe("independent command execution", () => {
  const modules = [{ id: "command.d.ts", imports: [], source: "declare const tools: { command(input: { fail?: boolean }): Promise<{ revision: number }> };" }];
  function commandCall(body: string, invoke: AgentScriptToolBinding["invoke"], timeoutMs = 2000): AgentScriptCall {
    return { id: "commands", source: `${body}`, signal: new AbortController().signal,
      maxToolCalls: 10, timeoutMs, toolBindings: [{ name: "command", effect: "command", describeCommand: (_input, result) => result?.ok ? result.value as {revision:number} : {}, invoke }] };
  }
  it("allows catching a rejected command and making a new independent commit", async () => {
    let revision = 0;
    const call = commandCall('try{await tools.command({fail:true});}catch{} return await tools.command({});', async input =>
      (input as { fail?: boolean }).fail ? {ok:false,error:{code:"CONFLICT",message:"stale"}} : {ok:true,value:{revision:++revision}});
    expect(await executeAgentEdit(new JavaScriptAgentScriptRuntime(), checkerAdapter, call, modules)).toMatchObject({
      ok:true, output:{revision:1}, receipt:{status:"completed",commands:[{status:"settled",ok:false,errorCode:"CONFLICT"},{status:"settled",ok:true,revision:1}]}
    });
    expect(revision).toBe(1);
  });
  it("retains all committed outcomes when later script execution fails", async () => {
    let revision = 0;
    const call = commandCall('await tools.command({}); await tools.command({}); throw new Error("stop");', async () => ({ok:true,value:{revision:++revision}}));
    expect(await executeAgentEdit(new JavaScriptAgentScriptRuntime(), checkerAdapter, call, modules)).toMatchObject({
      ok:false, receipt:{status:"interrupted",commands:[{revision:1,ok:true},{revision:2,ok:true}]}
    });
    expect(revision).toBe(2);
  });
  it("runs an independent command beside an unused draft without publishing that draft", async () => {
    const invoke = vi.fn(async () => ({ok:true as const,value:null}));
    const transaction = {tools:[],hasChanges:()=>false,prepare:vi.fn(),commit:vi.fn(),discard:vi.fn()};
    const open = vi.fn(() => ({transaction,toolBindings:[]}));
    const call = commandCall('await tools.command({}); return null;', invoke);
    expect(await executeAgentEdit(new JavaScriptAgentScriptRuntime(), checkerAdapter, call, modules, open))
      .toMatchObject({ok:true,receipt:{status:"completed",commands:[{ok:true}]}});
    expect(invoke).toHaveBeenCalledOnce();
    expect(transaction.prepare).not.toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.discard).toHaveBeenCalledOnce();
  });
  it("does not publish a world draft for a multiplexed command query", async () => {
    const transaction = {tools:[],hasChanges:()=>false,prepare:vi.fn(),commit:vi.fn(),discard:vi.fn()};
    const call = commandCall('return await tools.command({});', async () => ({ok:true,value:{revision:0}}));
    call.toolBindings[0].describeCommand = () => null;
    const result = await executeAgentEdit(new JavaScriptAgentScriptRuntime(), checkerAdapter, call, modules,
      () => ({transaction,toolBindings:[]}));
    expect(result).toMatchObject({ok:true,receipt:{status:"completed"}});
    expect(result.receipt?.commands).toBeUndefined();
    expect(transaction.prepare).not.toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.discard).toHaveBeenCalledOnce();
  });
  it("keeps an in-flight command outcome unknown on timeout", async () => {
    const call = commandCall('return await tools.command({});', () => new Promise(() => {}), 10);
    expect(await executeAgentEdit(new JavaScriptAgentScriptRuntime(), checkerAdapter, call, modules)).toMatchObject({ok:false,error:{code:"SCRIPT_TIMEOUT"},receipt:{status:"interrupted",commands:[{status:"unknown"}]}});
  });
});

describe("independent command admission and compact facts", () => {
  const unchecked = { check: async () => undefined };
  function run(source: string, bindings: AgentScriptToolBinding[], onTrace?: AgentScriptCall["onTrace"], maxToolCalls = 200) {
    return executeAgentEdit(new JavaScriptAgentScriptRuntime(), unchecked, {
      id: "bounded", source: `${source}`, toolBindings: bindings,
      signal: new AbortController().signal, timeoutMs: 2000, maxToolCalls, onTrace
    }, []);
  }
  it.each([false, true])("blocks caught ambiguous writes and permits multiplexed verification (host throws: %s)", async throws => {
    let writes = 0, reads = 0;
    const binding: AgentScriptToolBinding = {
      name: "command", effect: "command", describeCommand: input =>
        (input as {read?:boolean}).read ? null : {commandId:"attempt",scopeId:"scope"},
      invoke: async input => {
        if ((input as {read?:boolean}).read) { reads++; return {ok:true,value:{writes}}; }
        writes++;
        if (throws) throw new Error("after commit");
        return {ok:false,error:{code:"HOST_FAILURE",message:"after commit",executed:true}};
      }
    };
    const outcome = await run('try{await tools.command({});}catch{} const verified=await tools.command({read:true}); try{await tools.command({});}catch{} return verified;', [binding]);
    expect(outcome).toMatchObject({ok:false,error:{code:"COMMAND_OUTCOME_UNKNOWN",retryable:false},receipt:{status:"interrupted",commands:[{status:"unknown",commandId:"attempt"}]}});
    expect(outcome.receipt?.commands).toHaveLength(1);
    expect({writes,reads}).toEqual({writes:1,reads:1});
  });
  it("admits independent parallel writes while their outcomes are still pending", async () => {
    const release = Promise.withResolvers<void>();
    let writes = 0;
    const pending = run('return await Promise.all([tools.command({}),tools.command({})]);', [{name:"command",effect:"command",invoke:async()=>{
      writes++; if(writes===2) release.resolve(); await release.promise; return {ok:true,value:null};
    }}]);
    expect(await pending).toMatchObject({ok:true,receipt:{commands:[{status:"settled",ok:true},{status:"settled",ok:true}]}});
    expect(writes).toBe(2);
  });
  it("keeps raw query/command data and diagnostic stacks in Trace only", async () => {
    const marker = "RAW_TRACE_ONLY";
    let trace: Parameters<NonNullable<AgentScriptCall["onTrace"]>>[0] | undefined;
    const outcome = await run('const rows=await tools.command({read:true}); try{await tools.command({});}catch{} return {count:rows.length};', [{
      name:"command",effect:"command",describeCommand:input=>(input as {read?:boolean}).read?null:{commandId:"known-rejection"},
      invoke:async input=>(input as {read?:boolean}).read?{ok:true,value:Array.from({length:400},()=>({detail:marker.repeat(8)}))}:
        {ok:false,error:{code:"CONFLICT",message:marker,executed:false,stack:marker,details:{raw:marker}}}
    }], value=>{trace=value;});
    expect(outcome).toMatchObject({ok:true,output:{count:400},receipt:{commands:[{ok:false,errorCode:"CONFLICT",commandId:"known-rejection"}]}});
    expect(JSON.stringify(outcome)).not.toContain(marker);
    expect(JSON.stringify(trace?.toolCalls)).toContain(marker);
  });
  it("reserves receipt capacity before writes and preserves every earlier commit", async () => {
    const {MAX_COMMAND_RECEIPT_BYTES} = await import("../src/ai-chat/agent-command-receipts");
    let writes=0;
    const outcome=await run('for(let i=0;i<200;i++) await tools.command({}); return null;', [{
      name:"command",effect:"command",describeCommand:()=>({commandId:"x".repeat(128),scopeId:"y".repeat(128)}),
      invoke:async()=>({ok:true,value:{revision:++writes}})
    }]);
    expect(outcome).toMatchObject({ok:false,error:{code:"COMMAND_RECEIPT_LIMIT"},receipt:{status:"interrupted"}});
    expect(writes).toBeGreaterThan(1);
    expect(outcome.receipt?.commands).toHaveLength(writes);
    expect(outcome.receipt?.commands?.every(c=>c.status==="settled"&&c.ok)).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(outcome.receipt?.commands)).length).toBeLessThanOrEqual(MAX_COMMAND_RECEIPT_BYTES);
  });
});

it("rejects invalid receipt identity before host invocation without poisoning a subsequent valid command", async () => {
  let writes=0;
  const outcome=await executeAgentEdit(new JavaScriptAgentScriptRuntime(),{check:async()=>undefined},{
    id:"identity",source:'try{await tools.command({invalid:true});}catch{} return await tools.command({});',
    signal:new AbortController().signal,maxToolCalls:5,timeoutMs:2000,toolBindings:[{
      name:"command",effect:"command",describeCommand:input=>({commandId:(input as {invalid?:boolean}).invalid?"x".repeat(129):"valid"}),
      invoke:async()=>({ok:true,value:{revision:++writes}})
    }]
  },[]);
  expect(outcome).toMatchObject({ok:true,receipt:{status:"completed",commands:[{commandId:"valid",ok:true,status:"settled"}]}});
  expect(outcome.receipt?.commands).toHaveLength(1);
  expect(writes).toBe(1);
});


describe("coexisting draft and independent capabilities", () => {
  it("uses live reads outside draft ownership without publishing an unused draft",async()=>{
    const test=harness('return await tools.observe({});');
    const observe:AgentScriptToolBinding={name:"observe",effect:"read",invoke:async()=>({ok:true,value:{count:3}})};
    test.call.toolBindings=[...test.bindings,observe];
    const result=await executeAgentEdit(new JavaScriptAgentScriptRuntime(),checkerAdapter,test.call,
      [{id:"observe.d.ts",imports:[],source:'declare const tools:{observe(input:{}):Promise<{count:number}>};'}],test.open);
    expect(result).toMatchObject({ok:true,output:{count:3},receipt:{status:"completed"}});
    expect(test.transaction.commit).not.toHaveBeenCalled();expect(test.transaction.discard).toHaveBeenCalledOnce();
  });
  it("still binds authoring reads to their draft instead of the live tool with the same name",async()=>{
    const test=harness('await tools.create({name:"new"}); return await tools.list();');
    const live=vi.fn(async()=>({ok:true as const,value:["old"]}));
    test.call.toolBindings=test.call.toolBindings.map(binding=>binding.name==="list"?{...binding,invoke:live}:binding);
    expect(await test.run()).toMatchObject({ok:true,output:["new"],receipt:{status:"committed"}});
    expect(live).not.toHaveBeenCalled();
  });
  function mixed(body: string) {
    const test = harness(body);
    let revision = 0;
    const command: AgentScriptToolBinding = {
      name:"command", effect:"command",
      describeCommand: input => (input as {read?: boolean}).read ? null : {commandId:"plant"},
      invoke:vi.fn(async input => ({ok:true as const,value:{revision:(input as {read?: boolean}).read ? revision : ++revision}}))
    };
    test.call.toolBindings = [...test.bindings,command];
    const modules = [{id: "mixed.d.ts", imports: [], source: `declare const tools: {
      create(input: { name: string }): Promise<{ id: number }>;
      list(): Promise<string[]>;
      fail(): Promise<never>;
      command(input: { read?: boolean }): Promise<{ revision: number }>;
    };`}];
    return {...test,command,revision:()=>revision,
      run:()=>executeAgentEdit(new JavaScriptAgentScriptRuntime(),checkerAdapter,test.call,modules,test.open)};
  }
  it("commits edits with an unused command registered and reads its draft", async () => {
    const test = mixed('await tools.create({name:"cube"}); return await tools.list();');
    const result = await test.run();
    expect(result).toMatchObject({ok:true,output:["cube"],receipt:{status:"committed"}});
    expect(result.receipt?.commands).toBeUndefined();
    expect(test.state.names).toEqual(["cube"]);
    expect(test.command.invoke).not.toHaveBeenCalled();
  });
  it.each([false,true])("supports both write modes in one script (command first: %s)", async commandFirst => {
    const calls = ['await tools.create({name:"cube"});','await tools.command({});'];
    if (commandFirst) calls.reverse();
    const test = mixed(`${calls.join(" ")} return await tools.list();`);
    expect(await test.run()).toMatchObject({ok:true,output:["cube"],receipt:{status:"committed",commands:[{ok:true,commandId:"plant"}]}});
    expect(test.state.names).toEqual(["cube"]);
    expect(test.revision()).toBe(1);
  });
  it("allows multiplexed command queries without creating command receipts", async () => {
    const test = mixed('await tools.command({read:true}); await tools.create({name:"cube"}); return await tools.command({read:true});');
    const result = await test.run();
    expect(result).toMatchObject({ok:true,output:{revision:0},receipt:{status:"committed"}});
    expect(result.receipt?.commands).toBeUndefined();
  });
  it.each(['throw new Error("stop");','try{await tools.fail();}catch{} return null;'])("retains committed commands while discarding failed draft work: %s", async tail => {
    const test = mixed(`await tools.create({name:"cube"}); await tools.command({}); ${tail}`);
    expect(await test.run()).toMatchObject({ok:false,receipt:{status:"interrupted",commands:[{ok:true,commandId:"plant"}]}});
    expect(test.revision()).toBe(1);
    expect(test.state.names).toEqual([]);
    expect(test.transaction.discard).toHaveBeenCalledOnce();
  });
  it("blocks later draft writes after an ambiguous command but still permits verification", async () => {
    const test = mixed('try{await tools.command({});}catch{} await tools.command({read:true}); try{await tools.create({name:"blocked"});}catch{} return null;');
    test.command.invoke = async input => {
      if ((input as {read?:boolean}).read) return {ok:true,value:{revision:1}};
      throw new Error("commit outcome unavailable");
    };
    expect(await test.run()).toMatchObject({ok:false,error:{code:"COMMAND_OUTCOME_UNKNOWN",retryable:false},receipt:{status:"interrupted",commands:[{status:"unknown"}]}});
    expect(test.calls).toEqual([]);
    expect(test.transaction.commit).not.toHaveBeenCalled();
  });
  it("permits a caught nonexecuted command refusal while still committing the world draft", async () => {
    const test = mixed('await tools.create({name:"cube"}); try{await tools.command({});}catch{} return null;');
    test.command.invoke = async () => ({ok:false,error:{code:"VERSION_CONFLICT",message:"stale",executed:false}});
    expect(await test.run()).toMatchObject({ok:true,receipt:{status:"committed",commands:[{ok:false,errorCode:"VERSION_CONFLICT"}]}});
    expect(test.state.names).toEqual(["cube"]);
  });
  it("retains committed command facts when cancellation discards the world draft", async () => {
    const test = mixed('await tools.create({name:"cube"}); await tools.command({}); return null;');
    test.transaction.prepare = () => {test.controller.abort();};
    expect(await test.run()).toMatchObject({ok:false,error:{code:"SCRIPT_CANCELLED"},receipt:{status:"interrupted",commands:[{ok:true}]}});
    expect(test.revision()).toBe(1);
    expect(test.state.names).toEqual([]);
  });
  it("preserves command receipts when draft publication fails", async () => {
    const test = mixed('await tools.create({name:"cube"}); await tools.command({}); return null;');
    test.transaction.commit = () => {throw new Error("storage unavailable");};
    expect(await test.run()).toMatchObject({ok:false,error:{code:"EDIT_PUBLICATION_FAILED"},receipt:{status:"publication_failed",commands:[{ok:true}]}});
    expect(test.revision()).toBe(1);
  });
});

it.each(["success", "cancel-commit", "activation-failure", "prepare-failure"])("ends resource ownership independently of the outcome: %s",async outcome=>{
 const t=harness('await tools.create({name:"cube"});');
 const complete=vi.fn();t.transaction.complete=complete;
 if(outcome==="cancel-commit") {const commit=t.transaction.commit;t.transaction.commit=async()=>{const result=await commit();t.controller.abort();return result;};}
 if(outcome==="activation-failure")t.transaction.activate=()=>{throw Error("preview failed");};
 if(outcome==="prepare-failure")t.transaction.prepare=()=>{throw Error("invalid draft");};
 const result=await t.run();expect(complete).toHaveBeenCalledOnce();
 if(outcome==="prepare-failure"){expect(t.state.names).toEqual([]);expect(result.ok).toBe(false);}
 else{expect(t.state.names).toEqual(["cube"]);expect(result.receipt?.status).toBe("committed");expect(t.transaction.discard).not.toHaveBeenCalled();}
});
it("reports completion failures without erasing an accepted author edit",async()=>{
 const t=harness('await tools.create({name:"cube"});');t.transaction.complete=()=>{throw Error("release failed");};
 const result=await t.run();expect(result).toMatchObject({ok:true,receipt:{status:"committed",runtimeErrors:["Edit resource cleanup failed: release failed"]}});expect(t.state.names).toEqual(["cube"]);
});
