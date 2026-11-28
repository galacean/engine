import { expect, it } from "vitest";
import { createSeedPlanningInputs } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { createSeedWorldParameterTools } from "../../demos/seed-world/agent-adapter/tools/parameter-tools";
import { createSeedWorldKnowledge } from "../../demos/seed-world/agent-adapter/SeedWorldKnowledge";
import type { AgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-types";

it("lets the public Agent discover and author one large element with ordinary member ranges", async () => {
  const document = createSeedPlanningInputs(17);
  for (const type of ["terrain", "rivers", "lakes"])
    Object.assign(document.entities.world.components[type].values, { countMin: 0, countMax: 0 });
  document.entities.world.components.world.values.offshoreCoverage = 0;
  document.entities.world.components.layout.values = {
    pattern: "connected", branchShape: "radial", roadMode: "none", openRadiusM: 0,
    elementProfile: "habitable", memberMin: 0, memberMax: 4,
    widthMinM: 8, widthMaxM: 8, depthMinM: 8, depthMaxM: 8, heightMinM: 5, heightMaxM: 5
  };
  const session = new PlanningSession(exportPlanningRecipe(document), undefined, document);
  await session.initialize();
  const tools = createSeedWorldParameterTools({ parameterAuthoring: {
    describe: () => session.describe(), query: filter => session.query(filter),
    inspect: id => ({ ...session.inspect(id), versionToken: String(session.document.revision) }),
    apply: async (commands, token) => {
      const receipt = await session.dispatchParameters(commands, Number(token));
      return { ...receipt, versionToken: String(receipt.revision) };
    }
  } });
  const call = async (name: string, input: AgentValue) => {
    const tool = tools.find(tool => tool.name === `spatial.config.${name}`)!;
    return tool.parseOutput(await tool.execute(tool.parseInput(input), { signal: new AbortController().signal })) as any;
  };
  const schema = await call("get", { component: "layout", fields: ["pattern", "memberMin", "memberMax", "memberCount"] });
  const fields = schema.components[0].fields;
  expect(fields.find((field: any) => field.key === "pattern").options).not.toContain("single");
  expect(fields.find((field: any) => field.key === "memberCount").readonly).toBe(true);
  const query = await call("get", { kind: "poi", component: "layout", limit: 100 });
  expect(query.entities.some((entity: any) => entity.id === "poi-4-4")).toBe(true);
  const inspected = await call("get", { entityId: "poi-4-4", component: "layout" });
  const receipt = await call("update", {
    entityId: "poi-4-4",
    component: "layout",
    versionToken: inspected.versionToken,
    values: {
      memberMin: 1, memberMax: 1, widthMinM: 60, widthMaxM: 60,
      depthMinM: 40, depthMaxM: 40, heightMinM: 90, heightMaxM: 90,
      headingDegrees: 25, orientationVariation: 0, radialVariationM: 0
    }
  });
  expect(receipt.status, receipt.message).toBe("accepted");
  const result = await call("get", { entityId: "poi-4-4", component: "layout", fields: ["memberMin", "memberMax", "memberCount"] });
  expect(result.components[0].values).toMatchObject({ memberMin: 1, memberMax: 1, memberCount: 1 });
  const group = session.result!.plan.spatialLayout!.groups.find(group => group.id === "poi-4-4")!;
  expect(group.volumes[0].boxes[0]).toMatchObject({ width: 60, depth: 40, height: 90 });
  expect(group.ports.some(port => session.result!.plan.routes.some(route => route.points.some(point =>
    Math.hypot(point.x - port.position.x, point.z - port.position.z) < 1e-4)))).toBe(true);
  const knowledge = createSeedWorldKnowledge(tools.map(tool => tool.name), session.describe().map(c => c.type));
  const guide = knowledge.documents.find(document => document.path === "skills/spatial/references/components.md")!.content;
  expect(guide).toContain("layout.memberMin/memberMax");
  expect(guide).not.toContain("layout.pattern to single");

  // Multi-component *.config.reset and *.config.update require component (and non-empty payload for update) at schema level; single-component animals allows omitting component.
  const spatialReset = tools.find(tool => tool.name === "spatial.config.reset")!;
  const spatialUpdate = tools.find(tool => tool.name === "spatial.config.update")!;
  const animalsReset = tools.find(tool => tool.name === "animals.config.reset")!;
  const animalsUpdate = tools.find(tool => tool.name === "animals.config.update")!;
  expect(() => spatialReset.parseInput({ fields: ["seed"] })).toThrow();
  expect(() => spatialReset.parseInput({ component: "world", fields: ["offshoreCoverage"] })).not.toThrow();
  expect(() => animalsReset.parseInput({ fields: ["enabled"] })).not.toThrow();
  expect(() => spatialUpdate.parseInput({})).toThrow();
  expect(() => spatialUpdate.parseInput({ component: "world", values: {} })).toThrow();
  expect(() => spatialUpdate.parseInput({ values: { offshoreCoverage: 0.2 } })).toThrow();
  expect(() => spatialUpdate.parseInput({ operations: [{ op: "set", values: { offshoreCoverage: 0.2 } }] })).toThrow();
  expect(() => spatialUpdate.parseInput({ component: "world", values: { offshoreCoverage: 0.2 } })).not.toThrow();
  expect(() => animalsUpdate.parseInput({ values: { enabled: true } })).not.toThrow();

  // *.config.get({ authoredOnly: true }) filters out entities that have no non-empty authored overrides in that system.
  const envGet = tools.find(tool => tool.name === "environment.config.get")!;
  const envAuthored = envGet.parseOutput(
    await envGet.execute(envGet.parseInput({ authoredOnly: true }), { signal: new AbortController().signal })
  ) as any;
  expect(envAuthored.entities.find((entity: any) => entity.id === "world")).toBeUndefined();
}, 60000);
