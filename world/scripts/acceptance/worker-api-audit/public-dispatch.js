if(globalThis.__auditPublicPlan){
  const job=globalThis.__auditPublicPlan.shift();
  if(!job)return {decision:{type:'final',message:'Audit finished'},assistantMessage:{role:'assistant',content:'Audit finished'},attempts:[]};
  const refs=input.images.references();
  const replace=value=>typeof value==='string'?value.replaceAll('__SNAPSHOT__',refs.at(-1)?.imagePath??'MISSING_SNAPSHOT'):Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,replace(v)])):value;
  const call={id:'audit-public:'+input.step,type:'function',function:{name:job.name,arguments:JSON.stringify(replace(job.input))}};
  const decision=parseAgentToolCall(call,(this.#definition.nativeReadTools??[]).map(x=>x.definition.function.name));
  return {decision,toolCallId:call.id,assistantMessage:{role:'assistant',content:'',toolCalls:[call]},attempts:[]};
}
