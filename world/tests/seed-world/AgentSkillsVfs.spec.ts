import { describe, expect, it } from "vitest";
import { createAgentProjectFiles } from "@galacean/engine-ai-chat/ai-chat/agent-project-files";
import { parseAgentSkill } from "@galacean/engine-ai-chat/ai-chat/agent-skills";
import { buildAgentMessages } from "@galacean/engine-ai-chat/ai-chat/agent-protocol";
import { engineRuntimeFiles } from "@galacean/engine-runtime-editor/runtime-editor-agent/engine-runtime-files";
import { seedWorldNativeKnowledge } from "../../demos/seed-world/agent-adapter/SeedWorldAgentDefinition.ts";
import { createSeedWorldKnowledge } from "../../demos/seed-world/agent-adapter/SeedWorldKnowledge.ts";
import { SEED_WORLD_API_NAMES } from "../../demos/seed-world/agent-adapter/contracts/SeedWorldContractRegistry.ts";

import searchCloudSkill from "../../../packages/runtime-editor/src/retrieval-agent/search-cloud.md?raw";

const base = seedWorldNativeKnowledge(createSeedWorldKnowledge([...SEED_WORLD_API_NAMES]));
const catalog = { ...base, documents: [...(base.documents ?? []), { path: "skills/assets/search-cloud/SKILL.md", content: searchCloudSkill }] };
const files = createAgentProjectFiles(catalog, [engineRuntimeFiles()]);
const paths = new Set(files.list());
const markdown = [...paths].filter((path) => path.startsWith("skills/") && path.endsWith(".md"));

describe("Agent skills and declarations", () => {
  it("lists every top-level skill by intent", () => {
    expect(catalog.skills!.map((skill) => skill.name).sort()).toEqual(
      ["animals", "assets", "building", "components", "environment", "history", "scene-nodes", "scripting", "spatial", "terrain", "vegetation", "water", "world-objects"].sort()
    );
    for (const skill of catalog.skills!) {
      expect(skill.description.length).toBeLessThanOrEqual(120);
      expect(paths.has(`skills/${skill.name}/SKILL.md`)).toBe(true);
    }
  });

  it("mounts knowledge only under skills/ and declare/", () => {
    const roots = new Set([...paths].map((path) => path.split("/")[0]));
    expect([...roots].sort()).toEqual(["declare", "skills"]);
    expect([...paths].filter((path) => /^declare\/[^/]+\//.test(path)).every((path) => /^declare\/(editor|engine)\//.test(path))).toBe(true);
  });

  it("gives every sub-skill valid frontmatter", () => {
    for (const path of markdown) if (path.endsWith("/SKILL.md")) expect(() => parseAgentSkill(files.read(path))).not.toThrow();
  });

  it("resolves every skill link", () => {
    const broken: string[] = [];
    for (const path of markdown) {
      for (const match of files.read(path).matchAll(/\]\(<?([^)>\s]+)>?\)/g)) {
        const target = match[1].split("#")[0];
        // Host modules such as @galacean/seed-world-systems mount with the native editor.
        if (target && !/^[a-z]+:/.test(target) && !paths.has(target) && !target.includes("seed-world-systems"))
          broken.push(`${path} -> ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("keeps generated API indexes and placeholders resolved", () => {
    for (const path of markdown) expect(files.read(path)).not.toContain("<!--");
    expect(files.read("skills/vegetation/SKILL.md")).toContain("declare/editor/world/tools/vegetation.create.d.ts");
  });

  it("omits a skill whose APIs are unavailable", () => {
    const names = createSeedWorldKnowledge(["time.get"]).skills.map((skill) => skill.name);
    expect(names).toEqual(["environment"]);
  });

  it("sends skill summaries, not bodies or a separate catalog", () => {
    const messages = buildAgentMessages({
      systemPrompt: "system",
      skills: catalog.skills,
      hostNotes: catalog.hostNotes,
      taskId: "task",
      userInput: "x",
      inputSource: "text",
      worldThumbnail: {}
    });
    const contexts = messages.slice(1).map((message) => JSON.parse(message.content as string));
    expect(contexts.map((context) => context.contextKind)).toEqual(["host_environment", "skills", "agent_task", "conversation_history", "world_state"]);
    const listed = contexts[1].skills;
    expect(listed.find((skill: { name: string }) => skill.name === "assets").path).toBe("skills/assets/SKILL.md");
    expect(JSON.stringify(listed)).not.toContain("## ");
    expect(contexts[0].notes).toContain("tools.spatial.resolve");
  });
});

describe("skill sources", () => {
  const sources = import.meta.glob("../../../packages/*/src/skills/*/SKILL.md", { eager: true, as: "raw" }) as Record<string, string>;
  it("keep each system skill in its package under a directory named after the skill", () => {
    const names = Object.entries(sources).map(([path, source]) => {
      const name = /\/src\/skills\/([^/]+)\/SKILL\.md$/.exec(path)![1];
      expect(parseAgentSkill(source).name).toBe(name);
      return name;
    });
    expect(names).toEqual(expect.arrayContaining(["animals", "building", "environment", "farming", "terrain", "vegetation", "water"]));
  });
});

describe("farming skill", () => {
  it("publishes a valid top-level skill and resolvable method links", async () => {
    const { FARMING_METHOD_DOCS } = await import("@galacean/engine-farming/farming/native/FarmingMethodDocs");
    const { farmingSkill, farmingSkillDocuments } = await import("@galacean/engine-farming/farming/native/FarmingSkill");
    const docs = [...farmingSkillDocuments, ...FARMING_METHOD_DOCS, { path: "skills/farming/SKILL.md", content: farmingSkill }];
    const known = new Set<string>(docs.map((doc) => doc.path));
    expect(parseAgentSkill(farmingSkill).name).toBe("farming");
    for (const doc of docs) {
      expect(doc.path).toMatch(/^(skills|declare)\//);
      for (const match of doc.content.matchAll(/\]\((declare\/editor\/farming\/methods\/[^)]+)\)/g)) expect(known.has(match[1])).toBe(true);
    }
  });
});
