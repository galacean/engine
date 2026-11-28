import { expect, it } from "vitest";
import { buildAgentMessages, readSystemInjection } from "../src/ai-chat/agent-protocol";
import { AgentContextTranscript } from "../src/ai-chat/context-compaction";

it("separates task, capability discovery and fresh state using system_injection blocks while preserving submitted spatial references", () => {
  const input = {systemPrompt:"rules",taskId:"task",userInput:"在我面前生成一棵树",inputSource:"text" as const,
    skills:[{name:"vegetation",description:"植被",content:""}],
    taskContext:{viewer_at_submission:{position:[1,2,3]}},worldThumbnail:{viewer:{position:[4,5,6]}},
    observedAt:"2026-11-04T01:00:00Z"};
  const first=buildAgentMessages(input);
  const sections=first.slice(1).map(m=>readSystemInjection(m.content)!);
  expect(sections.map(s=>s.type)).toEqual(["host_environment","skills","task_context","world_state"]);
  expect(sections[1].body).toContain("- vegetation (skills/vegetation/SKILL.md): 植被");
  expect(sections[2].body).not.toContain("skills/vegetation");
  expect(sections[2].body).not.toContain("world_thumbnail");
  expect(sections[2].trailing).toBe("在我面前生成一棵树");
  expect(JSON.parse(sections[2].body)).toMatchObject({taskId:"task",context:input.taskContext});
  expect(JSON.parse(sections[3].body)).toMatchObject({observedAt:input.observedAt,snapshot:input.worldThumbnail});
  const next=buildAgentMessages({...input,worldThumbnail:{viewer:{position:[7,8,9]}}});
  expect(next.slice(0,4)).toEqual(first.slice(0,4));
  expect(next[4]).not.toEqual(first[4]);
});

it("binds a compaction replacement to the actual context boundary, preserving all host snapshots",()=>{
  const transcript=new AgentContextTranscript();
  transcript.push({role:"assistant",content:"checked tree API"},{role:"user",content:"older result"});
  const sent=buildAgentMessages({systemPrompt:"rules",taskId:"task",userInput:"plant",inputSource:"text",
    worldThumbnail:{revision:2},transcript:transcript.active});
  const request=transcript.captureRequest(sent);
  expect(request.prefixLength).toBe(4);
  const patch={version:2,status:"compacted",strategy:"summary",beforeTokens:100,afterTokens:50,durationMs:1,
    replacement:{prefixLength:2,cutIndex:2,summary:"checked"}};
  expect(()=>transcript.applyResponse(request,sent,patch)).toThrow("protected prefix");
  expect(transcript.active).toHaveLength(2);
  const retry=transcript.captureRequest(sent);
  transcript.applyResponse(retry,sent,{...patch,replacement:{...patch.replacement,prefixLength:4}});
  expect(transcript.active).toEqual([{role:"user",content:"checked"}]);
  expect(transcript.canonical).toHaveLength(2);
  expect(readSystemInjection(sent[3].content)?.trailing).toBe("plant");
});
