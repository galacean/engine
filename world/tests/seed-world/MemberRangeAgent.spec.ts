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
    const tool = tools.find(tool => tool.name === `world.parameters.${name}`)!;
    return tool.parseOutput(await tool.execute(tool.parseInput(input), { signal: new AbortController().signal })) as any;
  };
  const schema = await call("describe", { component: "layout", fields: ["pattern", "memberMin", "memberMax", "memberCount"] });
  const fields = schema.components[0].fields;
  expect(fields.find((field: any) => field.key === "pattern").options).not.toContain("single");
  expect(fields.find((field: any) => field.key === "memberCount").readonly).toBe(true);
  const query = await call("query", { kind: "poi", component: "layout", limit: 100 });
  expect(query.entities.some((entity: any) => entity.id === "poi-4-4")).toBe(true);
  const inspected = await call("inspect", { id: "poi-4-4", component: "layout" });
  const receipt = await call("apply", { versionToken: inspected.versionToken, commands: [{
    op: "set", entity: "poi-4-4", component: "layout", values: {
      memberMin: 1, memberMax: 1, widthMinM: 60, widthMaxM: 60,
      depthMinM: 40, depthMaxM: 40, heightMinM: 90, heightMaxM: 90,
      headingDegrees: 25, orientationVariation: 0, radialVariationM: 0
    }
  }] });
  expect(receipt.status, receipt.message).toBe("accepted");
  const result = await call("inspect", { id: "poi-4-4", component: "layout", fields: ["memberMin", "memberMax", "memberCount"] });
  expect(result.components[0].values).toMatchObject({ memberMin: 1, memberMax: 1, memberCount: 1 });
  const group = session.result!.plan.spatialLayout!.groups.find(group => group.id === "poi-4-4")!;
  expect(group.volumes[0].boxes[0]).toMatchObject({ width: 60, depth: 40, height: 90 });
  expect(group.ports.some(port => session.result!.plan.routes.some(route => route.points.some(point =>
    Math.hypot(point.x - port.position.x, point.z - port.position.z) < 1e-4)))).toBe(true);
  const knowledge = createSeedWorldKnowledge(tools.map(tool => tool.name), session.describe().map(c => c.type));
  const guide = knowledge.documents.find(document => document.path === "knowledge/world/spatial/README.md")!.content;
  expect(guide).toContain("layout.memberMin/memberMax");
  expect(guide).not.toContain("layout.pattern to single");
}, 60000);
