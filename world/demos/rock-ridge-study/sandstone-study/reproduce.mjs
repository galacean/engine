import fs from 'node:fs';
import {buildAtomicKernel} from '../atomic-controls/kernel-bundle.mjs';
import {createSandstoneProcessor} from './processor.mjs';
import {sandstoneRecipe,parseSandstoneRecipe} from './recipe.mjs';

const [recipeFile,outputFile]=process.argv.slice(2);
const recipe=recipeFile?parseSandstoneRecipe(fs.readFileSync(recipeFile,'utf8')):sandstoneRecipe();
const atomic=new Function(buildAtomicKernel()+'\nreturn atomicRockKernel();')();await atomic.ready;
const mesh=createSandstoneProcessor(atomic).generate(recipe);
if(outputFile){
  const lines=['# '+recipe.version+'; mesh hash '+mesh.stats.hash,'o procedural_sandstone'];
  for(let i=0;i<mesh.positions.length;i+=3)lines.push('v '+Array.from(mesh.positions.subarray(i,i+3)).join(' '));
  for(let i=0;i<mesh.normals.length;i+=3)lines.push('vn '+Array.from(mesh.normals.subarray(i,i+3)).join(' '));
  for(let i=0;i<mesh.indices.length;i+=3)lines.push('f '+Array.from(mesh.indices.subarray(i,i+3),v=>(v+1)+'//'+(v+1)).join(' '));
  fs.writeFileSync(outputFile,lines.join('\n')+'\n');
  fs.writeFileSync(outputFile+'.recipe.json',JSON.stringify(recipe,null,2)+'\n');
}
console.log(JSON.stringify({recipe,stats:mesh.stats,reduction:mesh.reduction,output:outputFile||null},null,2));
