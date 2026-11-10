// Self-contained so the same implementation runs in Node and a Blob Worker.
// All shape operations are intersections / differences of a source-mesh SDF.
export function createSandstoneProcessor(atomic) {
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth = (a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  function random(seed,stream) {
    let s=(seed^stream)>>>0;
    return ()=>{s=(s+0x6d2b79f5)>>>0;let t=Math.imul(s^(s>>>15),1|s);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
  }
  let preparedKey='',prepared=null;
  function sourceParameters(p) {
    return {seed:p.seed,obbWidth:p.width,obbHeight:p.height,obbDepth:p.depth,bottomScale:1,shoulderScale:.98,shoulderHeight:.72,topScale:.94,topSlope:3.5,topDirection:28,topRoughness:.055,outlineIrregularity:.12,wear:.38,wallCount:12,wallOverlap:.45,wallLength:1.6,wallTilt:8,wallStrength:0,wallProtrusion:0,resolution:40};
  }
  function distanceTriangle(x,y,z,p,ids,t) {
    const a=ids[t]*3,b=ids[t+1]*3,c=ids[t+2]*3;
    const ax=p[a],ay=p[a+1],az=p[a+2],ux=p[b]-ax,uy=p[b+1]-ay,uz=p[b+2]-az,vx=p[c]-ax,vy=p[c+1]-ay,vz=p[c+2]-az;
    const wx=x-ax,wy=y-ay,wz=z-az,d1=ux*wx+uy*wy+uz*wz,d2=vx*wx+vy*wy+vz*wz;
    if(d1<=0&&d2<=0)return wx*wx+wy*wy+wz*wz;
    const bx=x-p[b],by=y-p[b+1],bz=z-p[b+2],d3=ux*bx+uy*by+uz*bz,d4=vx*bx+vy*by+vz*bz;
    if(d3>=0&&d4<=d3)return bx*bx+by*by+bz*bz;
    const vc=d1*d4-d3*d2;
    if(vc<=0&&d1>=0&&d3<=0){const q=d1/(d1-d3),dx=wx-q*ux,dy=wy-q*uy,dz=wz-q*uz;return dx*dx+dy*dy+dz*dz;}
    const cx=x-p[c],cy=y-p[c+1],cz=z-p[c+2],d5=ux*cx+uy*cy+uz*cz,d6=vx*cx+vy*cy+vz*cz;
    if(d6>=0&&d5<=d6)return cx*cx+cy*cy+cz*cz;
    const vb=d5*d2-d1*d6;
    if(vb<=0&&d2>=0&&d6<=0){const q=d2/(d2-d6),dx=wx-q*vx,dy=wy-q*vy,dz=wz-q*vz;return dx*dx+dy*dy+dz*dz;}
    const va=d3*d6-d5*d4;
    if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){const q=(d4-d3)/((d4-d3)+(d5-d6)),dx=bx-q*(vx-ux),dy=by-q*(vy-uy),dz=bz-q*(vz-uz);return dx*dx+dy*dy+dz*dz;}
    const q=1/(va+vb+vc),v=vb*q,w=vc*q,dx=wx-v*ux-w*vx,dy=wy-v*uy-w*vy,dz=wz-v*uz-w*vz;
    return dx*dx+dy*dy+dz*dz;
  }
  function makeDistance(mesh) {
    const p=mesh.positions,ids=mesh.indices,centers=[],boxes=[];
    for(let t=0;t<ids.length;t+=3){const box=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];for(let j=0;j<3;j++)for(let k=0;k<3;k++){const v=p[ids[t+j]*3+k];box[k]=Math.min(box[k],v);box[k+3]=Math.max(box[k+3],v);}boxes.push(box);centers.push([(box[0]+box[3])/2,(box[1]+box[4])/2,(box[2]+box[5])/2]);}
    function build(tris){
      const box=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];for(const t of tris)for(let k=0;k<3;k++){box[k]=Math.min(box[k],boxes[t][k]);box[k+3]=Math.max(box[k+3],boxes[t][k+3]);}
      if(tris.length<=8)return {box,tris};
      const span=[box[3]-box[0],box[4]-box[1],box[5]-box[2]],axis=span.indexOf(Math.max(...span));tris.sort((a,b)=>centers[a][axis]-centers[b][axis]||a-b);const mid=tris.length>>1;
      return {box,left:build(tris.slice(0,mid)),right:build(tris.slice(mid))};
    }
    const root=build(Array.from({length:ids.length/3},(_,i)=>i)),stack=[];
    function boxDistance(box,x,y,z){const dx=Math.max(box[0]-x,0,x-box[3]),dy=Math.max(box[1]-y,0,y-box[4]),dz=Math.max(box[2]-z,0,z-box[5]);return dx*dx+dy*dy+dz*dz;}
    return (x,y,z)=>{let best=Infinity;stack.length=0;stack.push(root);while(stack.length){const node=stack.pop();if(boxDistance(node.box,x,y,z)>best)continue;if(node.tris){for(const t of node.tris)best=Math.min(best,distanceTriangle(x,y,z,p,ids,t*3));}else{const a=boxDistance(node.left.box,x,y,z),b=boxDistance(node.right.box,x,y,z);if(a<b){if(b<best)stack.push(node.right);if(a<best)stack.push(node.left);}else{if(a<best)stack.push(node.left);if(b<best)stack.push(node.right);}}}return Math.sqrt(best);};
  }
  function prepare(p) {
    const source=atomic.buildRock(sourceParameters(p)),step=Math.min(p.width,p.depth)/p.resolution;
    const origin=[-p.width/2-step*1.71,-p.height/2-step*1.71,-p.depth/2-step*1.71];
    const size=[p.width,p.height,p.depth].map((v,i)=>Math.ceil((v+step*3.42)/step)+1),[nx,ny,nz]=size;
    const values=new Float32Array(nx*ny*nz),distance=makeDistance(source),columns=Array.from({length:nx*nz},()=>[]),pos=source.positions,ids=source.indices;
    // Intersect vertical grid columns with the actual upstream mesh, not a box.
    for(let t=0;t<ids.length;t+=3){
      const a=ids[t]*3,b=ids[t+1]*3,c=ids[t+2]*3,ax=pos[a],az=pos[a+2],bx=pos[b],bz=pos[b+2],cx=pos[c],cz=pos[c+2];
      const det=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(det)<1e-12)continue;
      const x0=clamp(Math.ceil((Math.min(ax,bx,cx)-origin[0])/step),0,nx-1),x1=clamp(Math.floor((Math.max(ax,bx,cx)-origin[0])/step),0,nx-1),z0=clamp(Math.ceil((Math.min(az,bz,cz)-origin[2])/step),0,nz-1),z1=clamp(Math.floor((Math.max(az,bz,cz)-origin[2])/step),0,nz-1);
      for(let iz=z0;iz<=z1;iz++)for(let ix=x0;ix<=x1;ix++){const x=origin[0]+ix*step,z=origin[2]+iz*step,u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/det,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/det,w=1-u-v;if(u>=-1e-8&&v>=-1e-8&&w>=-1e-8)columns[iz*nx+ix].push(u*pos[a+1]+v*pos[b+1]+w*pos[c+1]);}
    }
    for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
      const hits=columns[iz*nx+ix].sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>1e-6);let hit=0;
      for(let iy=0;iy<ny;iy++){const x=origin[0]+ix*step,y=origin[1]+iy*step,z=origin[2]+iz*step;while(hit<hits.length&&y>hits[hit])hit++;const d=distance(x,y,z);values[(iz*ny+iy)*nx+ix]=Math.max(d,1e-8)*(hit%2?-1:1);}
    }
    return {source,step,origin,size,values};
  }
  function sample(grid,x,y,z) {
    const [nx,ny,nz]=grid.size,coord=[x,y,z].map((v,k)=>clamp((v-grid.origin[k])/grid.step,0,grid.size[k]-1.000001)),ix=coord.map(Math.floor),f=coord.map((v,k)=>v-ix[k]);let value=0;
    for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)value+=grid.values[((ix[2]+dz)*ny+ix[1]+dy)*nx+ix[0]+dx]*(dx?f[0]:1-f[0])*(dy?f[1]:1-f[1])*(dz?f[2]:1-f[2]);return value;
  }
  function features(p,grid) {
    const source=grid.source;
    const short=Math.min(p.width,p.depth),rf=random(p.seed,0xface),rj=random(p.seed,0x1017),rb=random(p.seed,0xbed),rc=random(p.seed,0xc41f);
    const planes=[];
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4+(rf()-.5)*.14,n=[Math.cos(angle),(rf()-.5)*.065,Math.sin(angle)],length=Math.hypot(...n);for(let k=0;k<3;k++)n[k]/=length;
      let support=-Infinity;for(let v=0;v<source.positions.length;v+=3)support=Math.max(support,n[0]*source.positions[v]+n[1]*source.positions[v+1]+n[2]*source.positions[v+2]);
      planes.push({n,offset:support-short*p.faceCut*(i%2?.06+rf()*.07:.045+rf()*.055)});
    }
    // A small set of broad crown fractures, rather than a flat box cap.
    const crown=[];for(let i=0;i<4;i++){const angle=i*Math.PI/2+rf()*.5,slope=.3+rf()*.5;crown.push({n:[Math.cos(angle)*slope,1,Math.sin(angle)*slope],offset:p.height*(.48+rf()*.035)});}
    const facades=[];for(let i=0;i<4;i++){const axis=i%2,extent=(axis?p.depth:p.width)/2,knots=[{at:-extent*1.1,inset:p.faceRelief*rf()*.3}];let at=-extent*.8;while(at<extent*.9){knots.push({at,inset:p.faceRelief*(.05+rf()*.95)});at+=p.jointSpacing*(.6+rf()*.6);}knots.push({at:extent*1.1,inset:p.faceRelief*rf()*.3});facades.push({axis,side:i<2?1:-1,extent:axis?p.width/2:p.depth/2,knots});}
    const structural={planes,crown,facades};
    const bodyAt=(x,y,z)=>broadBody(sample(grid,x,y,z),x,y,z,p,structural);
    const joints=[];
    for(let family=0;family<2;family++){
      const angle=family*Math.PI/2+(rj()-.5)*.18,n=[Math.cos(angle),Math.sin(angle)],extent=Math.abs(n[0])*p.width/2+Math.abs(n[1])*p.depth/2;
      let offset=-extent+p.jointSpacing*(.35+rj()*.4),j=0;
      while(offset<extent-p.jointSpacing*.25){const dominant=j%3===0;const low=dominant?-p.height/2-1:p.height*(-.5+rj()*.26),high=p.height/2+1;
        joints.push({n,offset,width:p.jointWidth*(.65+rj()*.7),depth:p.jointDepth*(dominant?1.1:.55+rj()*.55),low,high,lean:(rj()-.5)*.05,phase:rj()*6.28});
        offset+=p.jointSpacing*(.65+rj()*.8);j++;
      }
    }
    const beds=[];let y=-p.height/2-p.bedThickness;
    while(y<p.height/2+p.bedThickness){const foot=y< -p.height*.22,thickness=p.bedThickness*(foot?.22+rb()*.4:.65+rb()*.9);beds.push({y,thickness,recession:p.bedRecession*(.1+rb()*.8)*(foot?1.35:.15),seam:p.bedRecession*(.12+rb()*.5)*(foot?1:.45),phase:rb()*6.28});y+=thickness;}
    const chips=[],count=Math.round(5+p.edgeDamage*21);
    for(let i=0;i<count;i++){
      const joint=joints[Math.floor(rc()*joints.length)],bed=beds[1+Math.floor(rc()*(beds.length-2))],side=rc()<.5?-1:1;
      const tangent=[-joint.n[1],joint.n[0]],centerY=clamp(Math.max(bed.y,joint.low+.5),-p.height*.46,p.height*.42),offset=joint.offset+joint.lean*centerY+.12*Math.sin(centerY*.42+joint.phase)+.025*Math.sin(centerY*1.6+joint.phase),baseX=joint.n[0]*offset,baseZ=joint.n[1]*offset;
      if(bodyAt(baseX,centerY,baseZ)>0)continue;
      let lo=0,hi=Math.max(p.width,p.depth);for(let k=0;k<16;k++){const mid=(lo+hi)/2;if(bodyAt(baseX+tangent[0]*mid*side,centerY,baseZ+tangent[1]*mid*side)>0)hi=mid;else lo=mid;}
      const center=[baseX+tangent[0]*lo*side,centerY,baseZ+tangent[1]*lo*side];
      const angle=Math.atan2(tangent[1]*side,tangent[0]*side)+(rc()-.5)*.8,scale=short*(.035+rc()*.07)*p.edgeDamage;
      chips.push({center,c:Math.cos(angle),s:Math.sin(angle),tilt:(rc()-.5)*.9,half:[scale*(1+rc()*1.5),scale*(.4+rc()),scale*(.7+rc())]});
    }
    // A few crown chips; the bulk of the face stays quiet.
    for(let i=0;i<4;i++){const angle=i*Math.PI/2+.6,scale=short*(.025+rc()*.025)*p.edgeDamage,cy=p.height*(.4+rc()*.04);let lo=0,hi=Math.max(p.width,p.depth);for(let k=0;k<16;k++){const t=(lo+hi)/2;if(bodyAt(Math.cos(angle)*t,cy,Math.sin(angle)*t)>0)hi=t;else lo=t;}chips.push({center:[Math.cos(angle)*lo,cy,Math.sin(angle)*lo],c:Math.cos(angle),s:Math.sin(angle),tilt:.4,half:[scale*1.7,scale,scale*1.5]});}
    return {...structural,joints,beds,chips,bedTilt:[(rb()-.5)*.025,(rb()-.5)*.025],bedPhase:rb()*6.28};
  }
  function broadBody(body,x,y,z,p,f) {
    for(const plane of f.planes)body=Math.max(body,plane.n[0]*x+plane.n[1]*y+plane.n[2]*z-plane.offset);
    for(const plane of f.crown)body=Math.max(body,plane.n[0]*x+plane.n[1]*y+plane.n[2]*z-plane.offset);
    for(const face of f.facades){const t=face.axis?z:x;let left=face.knots[0],right=face.knots[1];for(let k=1;k<face.knots.length;k++){if(t<=face.knots[k].at){left=face.knots[k-1];right=face.knots[k];break;}}const blend=clamp((t-left.at)/(right.at-left.at),0,1),inset=left.inset+(right.inset-left.inset)*blend;
      const heightMask=.35+.65*smooth(-p.height*.5,-p.height*.28,y);body=Math.max(body,(face.axis?x:z)*face.side-face.extent+inset*heightMask);
    }
    return body;
  }
  function processField(grid,p,stage,f) {
    const out=new Float32Array(grid.values.length),[nx,ny,nz]=grid.size,{step,origin}=grid;
    for(let iz=0;iz<nz;iz++)for(let iy=0;iy<ny;iy++)for(let ix=0;ix<nx;ix++){
      const id=(iz*ny+iy)*nx+ix,x=origin[0]+ix*step,y=origin[1]+iy*step,z=origin[2]+iz*step;let body=grid.values[id];
      if(stage>=1)body=broadBody(body,x,y,z,p,f);
      if(body>step*2){out[id]=body;continue;}
      if(stage>=3){
        const by=y+x*f.bedTilt[0]+z*f.bedTilt[1]+.045*Math.sin(x*.65+f.bedPhase)*Math.sin(z*.48+.8),blend=.06;
        let layer=f.beds[0],next=f.beds[1];for(let j=1;j<f.beds.length;j++){if(by<f.beds[j].y){layer=f.beds[j-1];next=f.beds[j];break;}}
        const r=layer.recession,previous=f.beds[Math.max(0,f.beds.indexOf(layer)-1)].recession;
        const recession=previous+(r-previous)*smooth(layer.y-blend,layer.y+blend,by),seam=layer.seam*Math.exp(-(((by-layer.y)/(.035+step*.18))**2));
        const local=.15+.85*smooth(-.2,.8,Math.sin(x*.9+z*.55+layer.phase)),capMask=smooth(-p.height/2,-p.height/2+.25,y)*(1-smooth(p.height*.41,p.height*.49,y));
        body+=(recession+seam)*local*capMask;
      }
      let value=body;
      if(stage>=2&&p.jointDepth>0)for(const joint of f.joints){
        const taper=smooth(joint.low,joint.low+.55,y)*(1-smooth(joint.high-.55,joint.high,y));if(taper===0)continue;
        const drift=joint.lean*y+.12*Math.sin(y*.42+joint.phase)+.025*Math.sin(y*1.6+joint.phase),plane=Math.abs(joint.n[0]*x+joint.n[1]*z-joint.offset-drift);
        const depth=joint.depth*taper*(.88+.12*Math.sin(y*.55+joint.phase));
        // A tapered wedge in a surface shell; it never cuts through the core.
        const width=joint.width*(.35+.65*taper)*(.75+.25*Math.sin(y*.9+joint.phase))*clamp(1+body/Math.max(depth,.001),.12,1);
        const cutter=Math.max(plane-width,-body-depth,joint.low-y,y-joint.high);
        value=Math.max(value,-cutter);
      }
      if(stage>=4&&p.edgeDamage>0)for(const chip of f.chips){
        const dx=x-chip.center[0],dy=y-chip.center[1],dz=z-chip.center[2];if(Math.abs(dx)>chip.half[0]+chip.half[2]+chip.half[1]||Math.abs(dz)>chip.half[0]+chip.half[2]+chip.half[1]||Math.abs(dy)>chip.half[1]*2)continue;
        const u=Math.abs(dx*chip.c+dz*chip.s+dy*chip.tilt),v=Math.abs(-dx*chip.s+dz*chip.c),ay=Math.abs(dy),cut=Math.max(u-chip.half[0],ay-chip.half[1],v-chip.half[2],u*.7+ay*.7-(chip.half[0]+chip.half[1])*.55,v*.7+ay*.7-(chip.half[2]+chip.half[1])*.55);value=Math.max(value,-cut);
      }
      // Preserve a continuous central column even at extreme cutter settings.
      // Intersect it with the current body so it cannot restore the cut crown.
      const core=Math.max(Math.abs(x)-Math.min(p.width,p.depth)*.11,Math.abs(z)-Math.min(p.width,p.depth)*.11,body);value=Math.min(value,core);
      // Keep zero crossings away from grid vertices; Float32 export must not
      // collapse several distinct edge crossings onto the same endpoint.
      out[id]=Math.abs(value)<step*1e-3?(value<0?-1:1)*step*1e-3:value;
    }
    return out;
  }
  function meshField(grid,values) {
    const [nx,ny,nz]=grid.size,{origin,step}=grid,positions=[],indices=[],edgeVertices=new Map(),count=values.length;
    const corners=[0,1,nx+1,nx,nx*ny,nx*ny+1,nx*ny+nx+1,nx*ny+nx],tetrahedra=[[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6],[0,5,1,6]];
    const point=id=>{const ix=id%nx,iy=Math.floor(id/nx)%ny,iz=Math.floor(id/(nx*ny));return [origin[0]+ix*step,origin[1]+iy*step,origin[2]+iz*step];};
    function vertex(a,b){if(a>b)[a,b]=[b,a];const key=a*count+b;let v=edgeVertices.get(key);if(v!==undefined)return v;const p=point(a),q=point(b),t=values[a]/(values[a]-values[b]);v=positions.length/3;positions.push(p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,p[2]+(q[2]-p[2])*t);edgeVertices.set(key,v);return v;}
    function triangle(a,b,c,direction){const ai=a*3,bi=b*3,ci=c*3,ux=positions[bi]-positions[ai],uy=positions[bi+1]-positions[ai+1],uz=positions[bi+2]-positions[ai+2],vx=positions[ci]-positions[ai],vy=positions[ci+1]-positions[ai+1],vz=positions[ci+2]-positions[ai+2];const dot=(uy*vz-uz*vy)*direction[0]+(uz*vx-ux*vz)*direction[1]+(ux*vy-uy*vx)*direction[2];if(dot<0)indices.push(a,c,b);else indices.push(a,b,c);}
    for(let iz=0;iz<nz-1;iz++)for(let iy=0;iy<ny-1;iy++)for(let ix=0;ix<nx-1;ix++){
      const base=(iz*ny+iy)*nx+ix,ids=corners.map(d=>base+d);let mask=0;for(let k=0;k<8;k++)if(values[ids[k]]<0)mask|=1<<k;if(mask===0||mask===255)continue;
      for(const tet of tetrahedra){const inside=[],outside=[];for(const k of tet)(values[ids[k]]<0?inside:outside).push(ids[k]);if(!inside.length||!outside.length)continue;const a=point(inside[0]),b=point(outside[0]),direction=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
        if(inside.length===1){const v=outside.map(b=>vertex(inside[0],b));triangle(v[0],v[1],v[2],direction);}else if(inside.length===3){const v=inside.map(a=>vertex(a,outside[0]));triangle(v[0],v[1],v[2],direction);}else{const a=vertex(inside[0],outside[0]),b=vertex(inside[0],outside[1]),c=vertex(inside[1],outside[0]),d=vertex(inside[1],outside[1]);triangle(a,b,c,direction);triangle(b,d,c,direction);}
      }
    }
    return compactLargest({positions:new Float32Array(positions),indices:new Uint32Array(indices)});
  }
  function compactLargest(mesh) {
    const count=mesh.positions.length/3,parent=Int32Array.from({length:count},(_,i)=>i),sizes=new Map();
    function root(v){while(parent[v]!==v){parent[v]=parent[parent[v]];v=parent[v];}return v;}
    for(let i=0;i<mesh.indices.length;i+=3){const a=root(mesh.indices[i]);for(let j=1;j<3;j++)parent[root(mesh.indices[i+j])]=a;}
    for(const v of mesh.indices){const r=root(v);sizes.set(r,(sizes.get(r)||0)+1);}let largest=-1,max=0;for(const [r,n]of sizes)if(n>max){max=n;largest=r;}
    const ids=[];for(let i=0;i<mesh.indices.length;i+=3)if(root(mesh.indices[i])===largest)ids.push(mesh.indices[i],mesh.indices[i+1],mesh.indices[i+2]);
    const remap=new Int32Array(count).fill(-1),pos=[];for(let i=0;i<ids.length;i++){let id=remap[ids[i]];if(id<0){id=pos.length/3;remap[ids[i]]=id;pos.push(...mesh.positions.subarray(ids[i]*3,ids[i]*3+3));}ids[i]=id;}
    return {positions:new Float32Array(pos),indices:new Uint32Array(ids),removedFragments:Math.max(0,sizes.size-1)};
  }
  function normals(mesh) {
    const result=new Float32Array(mesh.positions.length),p=mesh.positions;
    for(let i=0;i<mesh.indices.length;i+=3){const a=mesh.indices[i]*3,b=mesh.indices[i+1]*3,c=mesh.indices[i+2]*3,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2],n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];for(const id of [a,b,c])for(let k=0;k<3;k++)result[id+k]+=n[k];}
    for(let i=0;i<result.length;i+=3){const length=Math.hypot(result[i],result[i+1],result[i+2])||1;for(let k=0;k<3;k++)result[i+k]/=length;}return result;
  }
  function audit(mesh) {
    const edges=new Map(),p=mesh.positions;let volume=0,degenerate=0,minDoubleArea=Infinity;
    for(let i=0;i<mesh.indices.length;i+=3){const a=mesh.indices[i],b=mesh.indices[i+1],c=mesh.indices[i+2],ax=p[a*3],ay=p[a*3+1],az=p[a*3+2],bx=p[b*3],by=p[b*3+1],bz=p[b*3+2],cx=p[c*3],cy=p[c*3+1],cz=p[c*3+2],ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az,nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
      const area2=nx*nx+ny*ny+nz*nz;minDoubleArea=Math.min(minDoubleArea,Math.sqrt(area2));if(!(area2>0))degenerate++;volume+=(ax*nx+ay*ny+az*nz)/6;
      for(const [from,to]of [[a,b],[b,c],[c,a]]){const key=Math.min(from,to)*(p.length/3)+Math.max(from,to),entry=edges.get(key)||[0,0];entry[0]++;entry[1]+=from<to?1:-1;edges.set(key,entry);}
    }
    let badEdges=0;for(const [count,balance]of edges.values())if(count!==2||balance!==0)badEdges++;
    return {closed:badEdges===0&&degenerate===0&&volume>0,badEdges,degenerate,minDoubleArea,volume,triangles:mesh.indices.length/3,vertices:p.length/3};
  }
  function reduce(mesh,p) {
    const optimizer=atomic.optimizer,n=normals(mesh),locks=new Uint8Array(mesh.positions.length/3),positions=mesh.positions;
    for(let axis=0;axis<3;axis++){let lo=0,hi=0;for(let v=1;v<locks.length;v++){if(positions[v*3+axis]<positions[lo*3+axis])lo=v;if(positions[v*3+axis]>positions[hi*3+axis])hi=v;}locks[lo]=locks[hi]=1;}
    // Protect sharp physical creases before asking the attribute-aware reducer.
    // These locks refer to the welded mesh; render normals do not define topology.
    const edges=new Map();
    for(let i=0;i<mesh.indices.length;i+=3){const a=mesh.indices[i],b=mesh.indices[i+1],c=mesh.indices[i+2],u=[positions[b*3]-positions[a*3],positions[b*3+1]-positions[a*3+1],positions[b*3+2]-positions[a*3+2]],v=[positions[c*3]-positions[a*3],positions[c*3+1]-positions[a*3+1],positions[c*3+2]-positions[a*3+2]],normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal);for(let k=0;k<3;k++)normal[k]/=length;
      for(const [a,b]of [[mesh.indices[i],mesh.indices[i+1]],[mesh.indices[i+1],mesh.indices[i+2]],[mesh.indices[i+2],mesh.indices[i]]]){const key=Math.min(a,b)*locks.length+Math.max(a,b),other=edges.get(key);if(other){if(normal.reduce((s,x,k)=>s+x*other[k],0)<.42)locks[a]=locks[b]=1;}else edges.set(key,normal);}
    }
    let error=0,check=null;
    for(let attempt=0;attempt<2;attempt++){
      // No legacy >90-degree repair: intentional concave joints remain intact.
      const result=optimizer.simplifyWithAttributes(mesh.indices,positions,3,n,3,[.4,.4,.4],locks,Math.min(mesh.indices.length,18000*3),.0015,['RegularizeLight']),indices=result[0];error=result[1];
      const candidate=compactLargest({positions,indices});check=audit(candidate);
      if(check.closed)return {...candidate,removedFragments:(mesh.removedFragments||0)+candidate.removedFragments,reduction:{accepted:true,error,protectedVertices:locks.reduce((a,b)=>a+b,0),estimatedErrorMeters:error*optimizer.getScale(positions,3)}};
      // A very small loop can collapse into a non-manifold edge. Lock its source
      // neighborhood for one bounded retry; retain the source on a second failure.
      const counts=new Map(),bad=new Set();for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){const a=indices[i+j],b=indices[i+(j+1)%3],key=Math.min(a,b)*locks.length+Math.max(a,b);const e=counts.get(key)||{a,b,count:0,balance:0};e.count++;e.balance+=a<b?1:-1;counts.set(key,e);}for(const e of counts.values())if(e.count!==2||e.balance!==0){bad.add(e.a);bad.add(e.b);}for(let i=0;i<mesh.indices.length;i+=3)if([0,1,2].some(j=>bad.has(mesh.indices[i+j])))for(let j=0;j<3;j++)locks[mesh.indices[i+j]]=1;
    }
    return {...mesh,reduction:{accepted:false,error,reason:'topology fallback',audit:check}};
  }
  function hash(mesh){let h=2166136261;for(const buffer of [mesh.positions,mesh.indices])for(const byte of new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength)){h^=byte;h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
  function generate(recipe,{reduced=true}={}) {
    const start=performance.now(),p=recipe.parameters,key=JSON.stringify([sourceParameters(p),p.resolution]);
    if(key!==preparedKey){prepared=prepare(p);preparedKey=key;}
    const f=features(p,prepared);let mesh;
    if(recipe.stage===0)mesh={positions:prepared.source.positions.slice(),indices:prepared.source.indices.slice(),removedFragments:0};
    else mesh=meshField(prepared,processField(prepared,p,recipe.stage,f));
    const rawTriangles=mesh.indices.length/3;
    if(reduced&&recipe.stage>0)mesh=reduce(mesh,p);
    mesh.normals=normals(mesh);const check=audit(mesh),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<mesh.positions.length;i++){const axis=i%3;lo[axis]=Math.min(lo[axis],mesh.positions[i]);hi[axis]=Math.max(hi[axis],mesh.positions[i]);}mesh.bounds=[lo,hi];
    if(!check.closed)throw Error('Surface audit failed: '+check.badEdges+' open/inconsistent edges, '+check.degenerate+' collapsed faces');
    mesh.stats={...check,rawTriangles,removedFragments:mesh.removedFragments,step:prepared.step,bounds:mesh.bounds,contactY:lo[1],hash:hash(mesh),milliseconds:performance.now()-start};
    mesh.features=f;
    return mesh;
  }
  return {generate,sourceParameters,audit,hash};
}
