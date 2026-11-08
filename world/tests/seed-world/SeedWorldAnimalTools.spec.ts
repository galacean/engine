import { describe, expect, it, vi } from "vitest";
import {
  createSeedWorldAnimalTools,
  SEED_WORLD_ANIMAL_CONTRACTS
} from "../../demos/seed-world/agent-adapter/tools/animal-tools";
import { createSeedWorldKnowledge } from "../../demos/seed-world/agent-adapter/SeedWorldKnowledge";
import type { SeedWorldAnimalService } from "../../demos/seed-world/agent-adapter/ports/SeedWorldAnimalService";
import { AgentCommandLedger } from "@galacean/engine-ai-chat/ai-chat/agent-command-receipts.ts";

const signal = new AbortController().signal;
const id = "animal:bears-adult:0";
const request = { id, requestId: "animal-request-1", skillId: "idle" };

function harness() {
  const service: SeedWorldAnimalService = {
    catalog: vi.fn(() => ({ summary: {scope:"all-matches" as const,unit:"model-type" as const,total:0,speciesCount:0,appearanceCount:0,returned:0,hasMore:false}, entries: [], matchedCount: 0, offset: 0 })),
    spawn: vi.fn((input) => ({ requestId: input.requestId, status: "rejected" as const, reason: "disabled" })),
    query: vi.fn(() => ({ enabled: false, animals: [], matchedCount: 0, offset: 0 })),
    describe: vi.fn(({ id }) => ({ id, available: false, reason: "disabled", skills: [], targets: [] })),
    command: vi.fn((input) => ({ ...input, status: "rejected", reason: "disabled" })),
    receipt: vi.fn((input) => ({ ...input, status: "not_found", reason: "disabled" }))
  };
  const tools = createSeedWorldAnimalTools(service);
  const tool = (name: string) => tools.find((tool) => tool.name === `world.animals.${name}`)!;
  const call = async (name: string, input: unknown) => {
    const selected = tool(name);
    return selected.parseOutput(await selected.execute(selected.parseInput(input), { signal }));
  };
  return { service, tools, tool, call };
}

describe("Seed World animal Agent boundary", () => {
  it("does not advertise tools or animal knowledge on a host without an animal service", () => {
    expect(createSeedWorldAnimalTools()).toEqual([]);
    const knowledge = createSeedWorldKnowledge(["world.query"]);
    expect(knowledge.entries.some((entry) => entry.name.startsWith("world.animals."))).toBe(false);
    expect(knowledge.documents.some((document) => document.path.includes("/animals/"))).toBe(false);
  });

  it("reports disabled facts without issuing commands or disguising unavailable operations as accepted", async () => {
    const { service, call } = harness();
    expect(await call("query", {})).toEqual({ enabled: false, animals: [], matchedCount: 0, offset: 0, pageSummary:{scope:"returned-page",returnedCount:0,loadedCount:0,renderActiveCount:0} });
    expect(await call("describe", { id })).toMatchObject({ available: false, reason: "disabled" });
    expect(await call("receipt", { id, requestId: request.requestId })).toMatchObject({
      status: "not_found",
      reason: "disabled"
    });
    expect(service.command).not.toHaveBeenCalled();
    expect(await call("command", request)).toMatchObject({ status: "rejected", reason: "disabled" });
    expect(service.command).toHaveBeenCalledExactlyOnceWith(request);
  });

  it("preserves unloaded identities and pagination without asking the host to load or command them", async () => {
    const { service, call } = harness();
    vi.mocked(service.query).mockReturnValue({
      enabled: true,
      animals: [{ id, typeId: "bears-adult", speciesId: "bear", label: "熊", loaded: false, visible: false, position: [10, 2, 20] }],
      offset: 0,
      matchedCount: 2,
      nextOffset: 1
    });
    const input = { typeId: "bears-adult", visible: false, offset: 0, limit: 1 };
    expect(await call("query", input)).toMatchObject({
      enabled: true,
      animals: [{ loaded: false, visible: false }],
      nextOffset: 1
    });
    expect(service.query).toHaveBeenCalledExactlyOnceWith(input);
    expect(service.describe).not.toHaveBeenCalled();
    expect(service.command).not.toHaveBeenCalled();
  });

  it("preserves not-ready, hidden, unknown identity and invalid semantic rejections", async () => {
    const { service, call } = harness();
    for (const reason of ["not_ready", "not_visible", "not_found", "invalid_task_or_target", "request_id_conflict"]) {
      vi.mocked(service.command).mockReturnValue({ ...request, status: "rejected", reason });
      expect(await call("command", request)).toMatchObject({ status: "rejected", reason });
    }
  });

  it("forwards registered semantic targets unchanged and leaves clip data outside the contract", async () => {
    const { service, call, tool } = harness();
    const input = { ...request, skillId: "moveTo", target: { query: "position", params: { x: 12, z: 30 } } };
    vi.mocked(service.command).mockReturnValue({ ...input, status: "accepted" });
    expect(await call("command", input)).toEqual({ ...input, status: "accepted" });
    expect(service.command).toHaveBeenCalledExactlyOnceWith(input);
    for (const unsupported of [{ clip: "walk" }, { weight: 2 }, { speed: 4 }, { tree: {} }])
      expect(() => tool("command").parseInput({ ...input, ...unsupported })).toThrow();
    expect(() => tool("command").parseInput({ ...input, target: { ...input.target, clip: "walk" } })).toThrow();
  });

  it("validates request identity, target values and page bounds before entering the host", () => {
    const { service, tool } = harness();
    for (const requestId of ["", " ", "a\n", "a".repeat(129), "熊".repeat(43)])
      expect(() => tool("command").parseInput({ ...request, requestId })).toThrow();
    expect(() => tool("command").parseInput({ ...request, requestId: "熊".repeat(42) })).not.toThrow();
    expect(() =>
      tool("command").parseInput({ ...request, target: { query: "position", params: { x: Infinity } } })
    ).toThrow();
    expect(() =>
      tool("command").parseInput({ ...request, target: { query: "position", params: { nested: {} } } })
    ).toThrow();
    for (const input of [{ limit: 0 }, { limit: 101 }, { offset: -1 }, { offset: 0.5 }, { unknown: true }])
      expect(() => tool("query").parseInput(input)).toThrow();
    expect(service.command).not.toHaveBeenCalled();
  });

  it("uses the independent command channel and bounded generic command identity", () => {
    const { tools, tool } = harness();
    expect(tools.map((item) => item.effect)).toEqual(["read", "read", "command", "read", "read", "command"]);
    const identity = tool("command").describeCommand!(request)!;
    expect(identity).toEqual({ scopeId: id, commandId: request.requestId });
    expect(new AgentCommandLedger().start("world.animals.command", identity)).toMatchObject(identity);
  });

  it("checks cancellation before every live service call", async () => {
    const { tools, service } = harness();
    const abort = new AbortController();
    abort.abort();
    const inputs = [
      {},
      { id },
      request,
      { id, requestId: request.requestId },
      {},
      { requestId: "spawn-1", typeId: "dog-01" }
    ];
    for (const [index, tool] of tools.entries())
      await expect(tool.execute(tool.parseInput(inputs[index]), { signal: abort.signal })).rejects.toThrow();
    for (const operation of Object.values(service)) expect(operation).not.toHaveBeenCalled();
  });

  it("publishes exactly the executable APIs through generated declarations and system knowledge", () => {
    const names = SEED_WORLD_ANIMAL_CONTRACTS.map((contract) => contract.name);
    const knowledge = createSeedWorldKnowledge(names);
    expect(knowledge.entries.map((entry) => entry.name).sort()).toEqual([...names].sort());
    expect(knowledge.modules.flatMap((module) => module.toolNames).sort()).toEqual([...names].sort());
    const guide = knowledge.skills!.find((skill) => skill.name === "animals")!.content;
    for (const name of names) expect(guide).toContain(`[tools.${name}]`);
    expect(guide).toContain("没有冷却");
    for (const field of ["species.min", "species.max", "activationDistance", "noiseScale", "noiseStrength"]) expect(guide).toContain(field);
    expect(guide).toContain("距离单位是米");
    const command = knowledge.modules.find((module) => module.toolNames.includes("world.animals.command"))!.source;
    expect(command).toContain("requestId: string");
    expect(command).toContain("skillId: string");
    expect(command).not.toContain("clip:");
  });
});

describe("animal content discovery and summon contract", () => {
  it("uses registered identities only and exposes idempotent session spawning through the command channel", async () => {
    const { service, call, tool } = harness();
    expect(await call("catalog", { search: "狗" })).toMatchObject({ entries: [], matchedCount: 0 });
    expect(service.catalog).toHaveBeenCalledExactlyOnceWith({ search: "狗" });
    expect(await call("spawn", { typeId: "dog-01", requestId: "dog-request" })).toMatchObject({
      status: "rejected",
      reason: "disabled"
    });
    expect(tool("spawn").effect).toBe("command");
    for (const extra of [{ url: "https://example.test/dog.glb" }, { weight: 2 }, { clip: "run" }])
      expect(() => tool("spawn").parseInput({ typeId: "dog-01", requestId: "request", ...extra })).toThrow();
    expect(() =>
      tool("spawn").parseInput({ typeId: "dog-01", requestId: "request", position: { x: Infinity, z: 0 } })
    ).toThrow();
  });
});

it('preserves all-match counts when projecting a short catalog page without resource URLs',async()=>{
 const {querySeedAnimalCatalog}=await import('../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalCatalog');
 const {service,call}=harness();vi.mocked(service.catalog).mockImplementation(querySeedAnimalCatalog);
 const value=await call('catalog',{limit:1,view:'summary'}) as any;
 const full=querySeedAnimalCatalog({limit:100});
 expect(value.summary).toMatchObject({scope:'all-matches',unit:'model-type',total:full.matchedCount,returned:1,hasMore:true});
 expect(value.summary.speciesCount).toBeLessThan(value.summary.total);
 expect(value.entries[0].modelUrl).toBeUndefined();
 expect(value.entries[0].appearances.every((x:any)=>x.modelUrl===undefined)).toBe(true);
 const resources=await call('catalog',{limit:1}) as any;
 expect(resources.entries[0].modelUrl).toMatch(/^https:/);
 expect(resources.summary).toEqual(value.summary);
 const empty=await call('catalog',{search:'no-such-species-xx',view:'summary'}) as any;
 expect(empty.summary).toMatchObject({total:0,speciesCount:0,returned:0,hasMore:false});
});
