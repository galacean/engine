import { beforeEach, expect, it, vi } from "vitest";
import { createTestAgentLoop } from "./AIChatTestRuntime";
import { createAgentProjectFiles } from "../src/ai-chat/agent-project-files";
import { composeAgentConfiguration } from "../src/ai-chat/agent-extensions";
import { agentSkillFiles } from "../src/ai-chat/agent-skills";
import type { AgentSkill } from "../src/ai-chat/agent-types";
vi.mock("../src/ai-chat/asap-chat", () => ({requestAsapChat: vi.fn()}));
import { requestAsapChat } from "../src/ai-chat/asap-chat";

const skill: AgentSkill = {name:"example-editor", description:"Place existing assets", content:"---\nname: example-editor\ndescription: Place existing assets\n---\nRead [usage](../skills/fixture/knowledge/assets.md)."};
const catalog = {catalog:"Editor",entries:[],modules:[],skills:[skill], documents:[{path:"skills/fixture/knowledge/assets.md",content:"Use the returned project path."}]};
const request=vi.mocked(requestAsapChat);
beforeEach(()=>request.mockReset());

it("sends only discovery metadata, then reads the skill and its reference through real file tools", async()=>{
  request.mockImplementationOnce(async input=>{
    const task=JSON.parse(input.messages.find(m=>m.content.includes('"contextKind":"skills"'))!.content as string);
    expect(task.skills).toEqual([{name:skill.name,description:skill.description,path:"skills/example-editor/SKILL.md"}]);
    expect(JSON.stringify(input.messages)).not.toContain(skill.content);
    expect(input.messages[0].content).not.toContain(skill.description);
    return {content:"",finishReason:"tool_calls",toolCalls:[{id:"skill",type:"function",function:{name:"read",arguments:JSON.stringify({file_path:task.skills[0].path})}}]};
  });
  request.mockImplementationOnce(async input=>{
    expect(input.messages).toContainEqual({role:"tool",toolCallId:"skill",content:expect.stringContaining("skills/fixture/knowledge/assets.md")});
    return {content:"",finishReason:"tool_calls",toolCalls:[{id:"reference",type:"function",function:{name:"read",arguments:'{"file_path":"skills/fixture/knowledge/assets.md"}'}}]};
  });
  request.mockResolvedValueOnce({content:"Ready",finishReason:"stop",toolCalls:[]});
  const beginEdit=vi.fn();
  const loop=createTestAgentLoop({tools:[],definition:{scriptApi:catalog,toolNames:[],beginEdit}});
  expect((await loop.run("Place a tree",{})).finalMessage).toBe("Ready");
  expect(request.mock.calls[2][0].messages).toContainEqual({role:"tool",toolCallId:"reference",content:expect.stringContaining("Use the returned project path.")});
  expect(beginEdit).not.toHaveBeenCalled();
});

it("mounts skills at the root and rejects collisions and escaping references",()=>{
  const files=createAgentProjectFiles(catalog);
  expect(files.list()).toContain("skills/example-editor/SKILL.md");
  expect(files.list()).not.toContain("skills/fixture/skills/example-editor.md");
  expect(()=>agentSkillFiles([skill,skill])).toThrow(/Duplicate/);
  expect(()=>agentSkillFiles([{...skill, name:"../outside"}])).toThrow();
  expect(()=>agentSkillFiles([{...skill, description:"different"}])).toThrow();
  const base={tools:[],definition:{toolNames:[],scriptApi:catalog}};
  expect(()=>composeAgentConfiguration(base,[base])).toThrow(/skill/);
  const empty={tools:[],definition:{toolNames:[],scriptApi:{catalog:"App",entries:[],modules:[]}}};
  expect(composeAgentConfiguration(empty,[base]).definition.scriptApi.skills).toEqual([skill]);
  expect(()=>createAgentProjectFiles(catalog,[{paths:()=>["skills/example-editor/SKILL.md"],read:()=>"shadow"}])).toThrow(/Path already exists/);
});
