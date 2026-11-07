import {describe,expect,it} from "vitest";
import {AgentCommandLedger,MAX_COMMAND_RECEIPT_BYTES} from "../src/ai-chat/agent-command-receipts";

describe("command receipt capacity before host work",()=>{
  it("accounts for all pending writes and late facts with maximally escaped strings",()=>{
    const ledger=new AgentCommandLedger();
    const records=[];
    for(let i=0;i<200;i++){
      const record=ledger.start('"'.repeat(128),{});
      if(!record)break;
      records.push(record);
    }
    expect(records.length).toBeGreaterThan(1);
    for(const record of records)ledger.settle(record,{ok:false,error:{code:'"'.repeat(64),message:"refused",executed:false}},{commandId:'"'.repeat(128),scopeId:'"'.repeat(128),revision:Number.MAX_SAFE_INTEGER,replayed:true});
    expect(new TextEncoder().encode(JSON.stringify(ledger.commands)).length).toBeLessThanOrEqual(MAX_COMMAND_RECEIPT_BYTES);
    expect(ledger.commands).toHaveLength(records.length);
    expect(ledger.blocked).toBe(false);
  });
  it("rejects invalid identity before admission and ignores unlisted domain payloads",()=>{
    const ledger=new AgentCommandLedger();
    expect(()=>ledger.start("tool",{commandId:"x".repeat(129)})).toThrow();
    expect(ledger.commands).toEqual([]);
    const record=ledger.start("tool",{commandId:"id",raw:"DOMAIN_ONLY"} as any)!;
    ledger.settle(record,{ok:true,value:{raw:"DOMAIN_ONLY"}},{commandId:"id",revision:1,raw:"DOMAIN_ONLY"} as any);
    expect(JSON.stringify(ledger.commands)).not.toContain("DOMAIN_ONLY");
    expect(ledger.commands).toEqual([{call:1,tool:"tool",commandId:"id",revision:1,status:"settled",ok:true}]);
  });
});
