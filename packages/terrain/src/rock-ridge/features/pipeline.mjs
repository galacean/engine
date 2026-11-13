// Open extension seam: stages own their execution, bypass behavior and cache.
// The orchestrator knows no carving, ridge, material or UI implementation.
// A stage is {id, run(request, result, cache), bypass(request, result, cache)}.
// Both handlers return the result for the next stage without mutating inputs.
export function createFeaturePipeline(source,stages){
 const ids=new Set();
 for(const stage of stages){
  if(!stage.id||ids.has(stage.id)||typeof stage.run!=='function'||typeof stage.bypass!=='function')throw new TypeError('Each feature needs a unique id, run and bypass');
  ids.add(stage.id);
 }
 const pipeline=[...stages];
 return (kernel,request,cache={})=>{
  const started=performance.now();
  let result=source(kernel,request,cache);
  cache.features??={};
  for(const stage of pipeline){
   const stageCache=cache.features[stage.id]??={};
   result=(request.features?.[stage.id]===false?stage.bypass:stage.run)(request,result,stageCache);
  }
  return {...result,timings:{...result.timings,totalMs:performance.now()-started}};
 };
}
