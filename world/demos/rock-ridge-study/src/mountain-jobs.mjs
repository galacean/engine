// One job in flight, one latest pending request. Old results never replace a
// newer seed/slider choice and rapid edits do not build an unbounded queue.
export function createMountainJobs(run,accept,fail){
 let serial=0,busy=false,pending;
 function pump(){
  if(busy||!pending)return;
  const job=pending;pending=null;busy=true;
  Promise.resolve().then(()=>run(job)).then(result=>{if(job.id===serial)accept(result,job);}).catch(error=>{if(job.id===serial)fail(error,job);})
   .finally(()=>{busy=false;pump();});
 }
 return {schedule(request){pending={...request,id:++serial};pump();return serial;},invalidate(){serial++;pending=null;}};
}
