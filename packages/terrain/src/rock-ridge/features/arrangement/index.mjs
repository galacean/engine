import {arrangeRockStructure} from './strategies.mjs';

// A neutral inspection layout is the arrangement bypass: no terrain, ridge
// extraction, target fitting, scaling or geometry changes. Slots stay separated.
export function createRockLibraryScene(source,geometries){
 const entries=Object.entries(geometries),columns=4,rows=Math.ceil(entries.length/columns);
 const cellX=Math.max(...entries.map(([,g])=>g.bounds[1][0]-g.bounds[0][0]))+7;
 const cellZ=Math.max(...entries.map(([,g])=>g.bounds[1][2]-g.bounds[0][2]))+9;
 const high=Math.max(...entries.map(([,g])=>g.bounds[1][1]-g.bounds[0][1]));
 const rocks=entries.map(([mesh,g],i)=>({id:'inspect-'+mesh,mesh,x:(i%columns-(columns-1)/2)*cellX-(g.bounds[0][0]+g.bounds[1][0])/2,y:-g.bounds[0][1],z:(Math.floor(i/columns)-(rows-1)/2)*cellZ-(g.bounds[0][2]+g.bounds[1][2])/2,yaw:0,scale:1}));
 return {id:'atoms',name:'Atomic rock library',extent:[-columns*cellX/2,columns*cellX/2,-rows*cellZ/2,rows*cellZ/2],rocks,
  terrain:{positions:[],indices:[]},guides:[],labels:[],notes:'Seeded atomic meshes shown individually at their original size.',
  camera:{target:[0,high/2,0],yaw:.2,pitch:.35,span:columns*cellX},
  metrics:{rocks:rocks.length,triangles:entries.reduce((sum,[,g])=>sum+g.stats.triangles,0)}};
}

// A new arrangement strategy supplies arrange with this same scene contract.
// It receives meshes, not carving settings or the carving implementation.
export function createArrangementFeature({arrange=arrangeRockStructure,inspect=createRockLibraryScene}={}){
 return {
  id:'arrangement',
  run(request,result,cache){
   const started=performance.now(),key=JSON.stringify({library:result.libraryKey,seed:Number(request.seed)>>>0,method:request.arrangementMethod,mode:request.mode,noise:request.noise,topology:request.topology});
   cache.scenes??=new Map();
   // Worker messages clone the source each time, so compare its content instead
   // of object identity. Changing terrain still invalidates the fitted result.
   const sourceKey=JSON.stringify(request.source),previous=cache.scenes.get(key),arrangementCached=!!previous&&previous.sourceKey===sourceKey;
   const scene=arrangementCached?previous.scene:arrange(request.source,result.geometries,Number(request.seed)>>>0,{method:request.arrangementMethod,mode:request.mode,noise:request.noise,topology:request.topology});
   cache.scenes.delete(key);cache.scenes.set(key,{sourceKey,scene});
   // Keep the current shaped and unshaped arrangements across toggles, bounded
   // so exploration cannot accumulate every generated mountain in memory.
   if(cache.scenes.size>2)cache.scenes.delete(cache.scenes.keys().next().value);
   return {...result,scene,timings:{...result.timings,fitMs:performance.now()-started,arrangementCached,arrangementEnabled:true}};
  },
  bypass(request,result){
   return {...result,scene:inspect(request.source,result.geometries),timings:{...result.timings,fitMs:0,arrangementCached:false,arrangementEnabled:false}};
  }
 };
}
