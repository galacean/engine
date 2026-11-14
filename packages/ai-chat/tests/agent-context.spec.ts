import { expect, it } from "vitest";
import { buildAgentMessages } from "../src/ai-chat/agent-protocol";
import { AgentContextTranscript } from "../src/ai-chat/context-compaction";

it("separates task, capability discovery, history and fresh state while preserving submitted spatial references", () => {
  const input = {systemPrompt:"rules",taskId:"task",userInput:"在我面前生成一棵树",inputSource:"text" as const,
    skills:[{name:"vegetation",description:"植被",content:""}],
    taskContext:{viewer_at_submission:{position:[1,2,3]}},worldThumbnail:{viewer:{position:[4,5,6]}},
    observedAt:"2026-11-04T01:00:00Z"};
  const first=buildAgentMessages(input);
  const sections=first.slice(1).map(m=>JSON.parse(m.content));
  expect(sections.map(s=>s.contextKind)).toEqual(["host_environment","skills","agent_task","conversation_history","world_state"]);
  expect(JSON.stringify(sections[1].skills)).toContain("skills/vegetation/SKILL.md");
  expect(sections[2]).not.toHaveProperty("skills");
  expect(sections[2]).not.toHaveProperty("world_thumbnail");
  expect(sections[4]).toMatchObject({observedAt:input.observedAt,snapshot:input.worldThumbnail});
  const next=buildAgentMessages({...input,worldThumbnail:{viewer:{position:[7,8,9]}}});
  expect(next.slice(0,5)).toEqual(first.slice(0,5));
  expect(next[5]).not.toEqual(first[5]);
});

it("binds a compaction replacement to the actual context boundary, preserving all host snapshots",()=>{
  const transcript=new AgentContextTranscript();
  transcript.push({role:"assistant",content:"checked tree API"},{role:"user",content:"older result"});
  const sent=buildAgentMessages({systemPrompt:"rules",taskId:"task",userInput:"plant",inputSource:"text",
    worldThumbnail:{revision:2},transcript:transcript.active});
  const request=transcript.captureRequest(sent);
  expect(request.prefixLength).toBe(5);
  const patch={version:2,status:"compacted",strategy:"summary",beforeTokens:100,afterTokens:50,durationMs:1,
    replacement:{prefixLength:2,cutIndex:2,summary:"checked"}};
  expect(()=>transcript.applyResponse(request,sent,patch)).toThrow("protected prefix");
  expect(transcript.active).toHaveLength(2);
  const retry=transcript.captureRequest(sent);
  transcript.applyResponse(retry,sent,{...patch,replacement:{...patch.replacement,prefixLength:5}});
  expect(transcript.active).toEqual([{role:"user",content:"checked"}]);
  expect(transcript.canonical).toHaveLength(2);
  expect(JSON.parse(sent[3].content).instruction).toBe("plant");
});
