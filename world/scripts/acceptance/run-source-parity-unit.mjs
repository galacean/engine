import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../../..');
const output=path.join(root,'world/.acceptance/source-parity-units');
fs.mkdirSync(output,{recursive:true});
const group=process.env.TEST_GROUP || 'terrain';
for(const file of process.argv.slice(2)) for(const variant of ['baseline','migrated']) {
 const name=variant+'-'+path.basename(file), report=path.join(output,name+'.json');
 const log=fs.openSync(path.join(output,name+'.log'),'w');
 const cwd=variant==='baseline'?path.resolve(root,'../engine-next/world/.materialized/engine/world-gallery'):path.join(root,'world/.acceptance/tests');
 const result=await new Promise(resolve=>{
  const child=spawn(process.execPath,[path.join(root,'node_modules/vitest/vitest.mjs'),'run','--config',path.join(root,'world/scripts/acceptance/unit.config.mjs'),file,'--outputFile',report],{
   cwd,env:{...process.env,TEST_GROUP:group,TEST_VARIANT:variant,ACCEPTANCE_TRACE:path.join(output,name+'.trace')},stdio:['ignore',log,log],detached:true
  });
  const timeout=setTimeout(()=>{try{process.kill(-child.pid,'SIGTERM');}catch{}},Number(process.env.PARITY_TIMEOUT_MS || 120000));
  child.on('exit',(code,signal)=>{clearTimeout(timeout);resolve({code,signal});});
 });
 fs.closeSync(log);
 let summary={file,variant,...result};
 if(fs.existsSync(report)) {const data=JSON.parse(fs.readFileSync(report));summary={...summary,passed:data.numPassedTests,failed:data.numFailedTests,pending:data.numPendingTests};}
 else summary.incomplete=true;
 fs.writeFileSync(path.join(output,name+'.status.json'),JSON.stringify(summary,null,2));
 console.log(JSON.stringify(summary));
}
