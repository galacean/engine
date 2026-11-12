import fs from 'node:fs';
const upstream=JSON.parse(fs.readFileSync(new URL('../atomic-controls/upstream.json',import.meta.url)));

// Only the supporting ground and footprint are baked. All summit/ridge topology
// and atomic meshes are generated from the current seed at runtime.
const source={id:'peaks',name:'Mountain peaks',extent:[-56,56,-41,42],rocks:[],guides:[],labels:[],
 notes:'Seed-grown summits, shared saddles and descending ridges across width and depth.',
 camera:{target:[0,18,0],yaw:.58,pitch:.52,span:117}};
const [x0,x1,z0,z1]=source.extent,nx=40,nz=36,positions=[],indices=[];
for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
 const x=x0+(x1-x0)*i/nx,z=z0+(z1-z0)*j/nz,y=1+7*Math.exp(-((x/31)**2+(z/24)**2));
 positions.push(+x.toFixed(3),+y.toFixed(3),+z.toFixed(3));
}
for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);}
source.terrain={positions,indices};
const data={generator:{repository:upstream.repository,commit:upstream.commit},study:{kind:'procedural-mountain-peaks',date:'2026-11-12',seedWorldCommit:'9c832eb7f87640475237df003473538c693a90d4',collisionAndNavigationRuntimeTested:false},scenes:[source]};
fs.writeFileSync(new URL('./study-data.json',import.meta.url),JSON.stringify(data));
// Retire the old baked-arrangement export in existing checkouts.
fs.rmSync(new URL('./arrangement-recipes.json',import.meta.url),{force:true});
console.log('Mountain source bytes',JSON.stringify(data).length);
