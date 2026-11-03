import { buildingAssets } from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import { registerBuildingAssetComponents } from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import { ConstructionSurfaceQuery } from "@galacean/engine-building/tiny-glade/runtime/ConstructionSurfaceQuery";
import { constructionPreview } from "@galacean/engine-building/tiny-glade/runtime/ConstructionPreview";
import { MASONRY_RESIDENCY } from "@galacean/engine-building/tiny-glade/runtime/MasonryLodPolicy";
import { RigidDecorationRenderer } from "@galacean/engine-building/tiny-glade/runtime/RigidDecorationRenderer";
import { MountedDecorationRenderer } from "@galacean/engine-building/tiny-glade/runtime/MountedDecorationRenderer";
import { createMasonryDistanceView } from "@galacean/engine-building/tiny-glade/runtime/MasonryDistanceView";
import { WallDecorationComponent, BuildingSurfaceComponent, RoofWindowComponent } from "@galacean/engine-building/tiny-glade/components/BuildingComponents";
import { generatedDecorationSeed } from "@galacean/engine-building/tiny-glade/runtime/ConstructionDecorationConfig";
import { Component, AssetType, Camera, Color, DirectLight, MeshRenderer, PointLight, Vector3, WebGLEngine, type Scene } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { BuildingSystem, HouseComponent } from "@galacean/engine-building/tiny-glade/components/BuildingComponents";
import { builtinBuildingAssetFiles, BUILTIN_BUILDING_ASSETS } from "@galacean/engine-building/tiny-glade/resources/BuiltinBuildingAssets";
import { buildingDocument, buildingRigidBindings } from "@galacean/engine-building/tiny-glade/components/BuildingDocument";
import { buildingFrameMatrix, buildingGroupInput, groundedBuildingDocument } from "@galacean/engine-building/tiny-glade/components/BuildingGroup";
import { WindowComponent, WallLampComponent } from "@galacean/engine-building/tiny-glade/components/BuildingComponents";
import { compileMasonryLayout } from "@galacean/engine-building/tiny-glade/runtime/ConstructionLayout";
import { prepareConstructionTerrain, type ConstructionTerrainSource } from "@galacean/engine-building/tiny-glade/runtime/ConstructionTerrain";
import { constructionDecorationLights } from "@galacean/engine-building/tiny-glade/runtime/ConstructionDecorationLightPolicy";
import { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeProjectStorage, RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { SeedWorldPicker } from "@galacean/engine-world-planning/world/SeedWorldPicker";

const status=document.querySelector<HTMLElement>("#status")!,canvas=document.querySelector<HTMLCanvasElement>("canvas")!;
const roof={tip:[0,0],profile:0,height:.3,ridge_length:.5,eave:.2,ridge_direction:0,flat_rim:0,color:0};
const body=(id:string)=>({id,type:"HouseComponent",props:{assets:{$ref:BUILTIN_BUILDING_ASSETS},shape:{$type:"RectangularBuildingShape",width:8,depth:6},height:4,roof}});
const source={asset:{version:"2.0"},scene:{rootEntities:["group","independent"],background:{mode:0,color:{r:.12,g:.17,b:.21,a:1}}},entities:[
  {id:"group",name:"连栋",children:["left","right"]},
  {id:"left",name:"左房",position:[-3,0,0],components:["left-c"],children:["left-window"]},
  {id:"right",name:"右房",position:[3,0,0],components:["right-c"],children:["right-window"]},
  {id:"left-window",name:"左窗",position:[-2,1.2,3],components:["left-window-c"]},
  {id:"right-window",name:"右窗",position:[2,1.2,3],components:["right-window-c"]},
  {id:"independent",name:"独立房屋",position:[13,0,-3],components:["independent-c"]}
],components:[body("left-c"),body("right-c"),body("independent-c"),
  ...["left","right"].map(id=>({id:id+"-window-c",type:"WindowComponent",props:{seed:generatedDecorationSeed(17,id+"-window-c"),width:1.2,height:1.5}}))]};
const entranceMode=new URLSearchParams(location.search).has("entrance");
const structureMode=new URLSearchParams(location.search).has("structure");
const residencyMode=new URLSearchParams(location.search).has("residency");
const distanceMode=new URLSearchParams(location.search).has("distance");
const environmentMode=new URLSearchParams(location.search).has("environment");
const grounded=environmentMode||new URLSearchParams(location.search).has("terrain");
if(distanceMode || entranceMode){
  Object.assign(source.entities[5],{children:["door","lamp"]});
  source.entities.push({id:"door",name:"门",position:[-1.8,0,3],components:["door-c"]});
  source.entities.push({id:"lamp",name:"墙灯",position:[1.8,1.5,3],components:["lamp-c"]});
  source.components.push({id:"door-c",type:"DoorComponent",props:{seed:0,width:1.2,height:2}} as any);
  source.components.push({id:"lamp-c",type:"WallLampComponent",props:{seed:0,width:.5,height:.8,lightIntensity:2}} as any);
}
if(residencyMode || structureMode || entranceMode){
  source.entities[1].components!.push("left-wall-c");
  source.components.push({id:"left-wall-c",type:"BuildingSurfaceComponent",props:{role:"wall"}} as any);
}
let terrain:ConstructionTerrainSource={revision:0,grid:{
  samples:Uint16Array.from({length:65*65},(_,i)=>4096+256*(i%65)+64*Math.floor(i/65)),
  resolution:65,origin:[0,0],size:64,decode:{offset:0,scale:64},
  supports:[{positions:new Float32Array([14,15,18,18,15,18,18,15,22,14,15,22]),indices:new Uint32Array([0,1,2,0,2,3])}]
}};
if(grounded){
  Object.assign(source.entities[0],{position:[16,0,20],rotation:[0,30,0]});
  Object.assign(source.entities[5],{position:[29,0,17]});
  source.entities[1].children!.push("lamp");
  source.entities.push({id:"lamp",name:"墙灯",position:[-1,2,3],components:["lamp-c"]});
  source.components.push({id:"lamp-c",type:"WallLampComponent",props:{seed:generatedDecorationSeed(17,"lamp-c"),width:.4,height:.8,lightIntensity:2}} as any);
}
const initial:RuntimeProjectPackage={version:RUNTIME_PROJECT_SAVE_VERSION,project:{scene:"Building.scene",files:[
  {virtualPath:"Building.scene",path:"Building.scene",type:"Scene",dependencies:[BUILTIN_BUILDING_ASSETS]},...builtinBuildingAssetFiles
]},contents:{"Building.scene":JSON.stringify(source)}};
const projectId=environmentMode?"native-building-environment-v2":entranceMode?"native-building-entrance-v3":structureMode?"native-building-structure-v3":residencyMode?"native-building-residency-v2":distanceMode?"native-building-distance-v3":grounded?"native-building-grounding-v3":"native-building-groups-v3";
let engine:WebGLEngine,scene:Scene,project:RuntimeProjectSession,editor:RuntimeEditor,system:BuildingSystem,camera:Camera,picker:SeedWorldPicker;
function dispose(){picker?.dispose();editor?.dispose();project?.dispose();engine?.destroy();}
window.addEventListener("pagehide",dispose,{once:true});
async function load(){
  registerBuildingAssetComponents();const storage=await RuntimeProjectStorage.open();
  try{if(!await storage.load(projectId))await storage.save(projectId,initial);}finally{storage.close();}
  project=await RuntimeProjectSession.open(projectId,initial.project,location.href);
  engine=await WebGLEngine.create({canvas,shaderCompiler:new ShaderCompiler()});engine.canvas.setAutoResolution();
  engine.resourceManager.registerVirtualResources(await project.resources());
  scene=await engine.resourceManager.load<Scene>({type:AssetType.Scene,url:"Building.scene"});engine.sceneManager.activeScene=scene;
  editor=new RuntimeEditor(project,scene);
  camera=scene.createRootEntity("Camera").addComponent(Camera);camera.isOrthographic=true;camera.orthographicSize=10;
  camera.entity.transform.setPosition(...(grounded?[20,24,42]:[3,9,27]) as [number,number,number]);
  camera.entity.transform.lookAt(grounded?new Vector3(20,13,20):new Vector3(3,2,0));
  if(residencyMode || structureMode || entranceMode){camera.isOrthographic=false;camera.fieldOfView=30;camera.farClipPlane=2000;
    camera.entity.transform.setPosition(3,100,entranceMode?4000:700);camera.farClipPlane=entranceMode?10000:2000;camera.entity.transform.lookAt(new Vector3(3,2,0));}
  scene.createRootEntity("Sun").addComponent(DirectLight).entity.transform.setRotation(-40,-25,0);
  scene.ambientLight.diffuseSolidColor=new Color(.5,.5,.5,1);
  system=BuildingSystem.forScene(scene);system.bind({camera,terrain:grounded?terrain:undefined,frame:body=>body.entity.parent??body.entity,
    resolve:id=>editor.projection.component(id),identity(component){
      const record=editor.projection.queryComponents().find(r=>editor.projection.component(r.id)===component);
      if(!record)throw Error("Missing Scene identity");return record.id;
    }});
  project.registerRuntimeActivation({before:async()=>{},after:async()=>{system.invalidate();await system.flush();}});
  picker=new SeedWorldPicker(camera);await system.flush();engine.run();
  status.textContent="已加载两栋相交房屋和独立房屋。";document.querySelector<HTMLButtonElement>("#verify")!.disabled=false;
}
const component=(id:string)=>editor.projection.component(id)!;
const frame=()=>component("left-c").entity.parent!;
async function frames(n=3){for(let i=0;i<n;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}
function pick(x:number,y:number,z:number,id:string){
  engine.update();const screen=new Vector3();
  for(let dx=-.25;dx<=.25;dx+=.125)for(let dy=-.25;dy<=.25;dy+=.125){
    camera.worldToScreenPoint(new Vector3(x+dx,y+dy,z),screen);
    if(picker.pick(screen.x,screen.y,v=>system.visitPickBatches(v))===id)return true;
  }return false;
}
async function edit(run:(draft:RuntimeSceneEdit)=>void){
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.run(({draft,edited})=>{run(new RuntimeSceneEdit(draft,"Building.scene"));edited();},false);
  await tx.prepare(signal);await tx.commit();await tx.activate!(signal);
}
async function restore(){
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  const latest=tx.history().undo[0];if(!latest)throw Error("没有可撤销的修改");
  await tx.moveHistory({direction:"undo",transactionIds:[latest.transactionId]});await tx.prepare(signal);await tx.commit();await tx.activate!(signal);
}
function renderers(root=frame()){return root.getComponentsIncludeChildren(MeshRenderer,[]);}
async function verify(){
  const checks:string[]=[];const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label);status.textContent=`${checks.length}：${label}`;};
  await frames();
  check(system.metrics().groups===2 && system.metrics().buildings===3,"三个主体组成两个编译组");
  check(pick(-5,1.95,3.1,"left-window-c") && pick(5,1.95,3.1,"right-window-c"),"连栋双方窗户独立 GPU 拾取");
  const independent=renderers(component("independent-c").entity);
  const unchanged=()=>independent.every(r=>!r.destroyed)&&renderers(component("independent-c").entity).every((r,i)=>r===independent[i]);
  const beforeParentMove=renderers();frame().transform.setPosition(1,0,1);await system.flush();
  check(renderers().every((r,i)=>r===beforeParentMove[i]),"公共父节点移动不重编几何");
  check(pick(-4,1.95,4.1,"left-window-c")&&pick(6,1.95,4.1,"right-window-c"),"公共父矩阵驱动两边窗户及拾取");
  frame().transform.setPosition(0,0,0);await system.flush();
  // No flush between disable and enable: signature returns to identical input.
  const left=component("left-c") as HouseComponent;
  left.enabled=false;left.enabled=true;await system.flush();await frames();
  check(pick(-6,1,3.1,"left-c"),"同一帧禁用再启用恢复曾隐藏的主体绘制");
  check(pick(-5,1.95,3.1,"left-window-c")&&pick(5,1.95,3.1,"right-window-c"),"重新发布同时保留双方窗户");
  await edit(d=>d.update("right",{position:[8,0,0]}));await frames();
  check(pick(10,1.95,3.1,"right-window-c")&&pick(-5,1.95,3.1,"left-window-c"),"单个房屋移动后窗户位置一致，邻居保持原位");
  check(unchanged(),"局部组更新不替换独立房屋 Renderer");
  await restore();await frames();check(pick(5,1.95,3.1,"right-window-c"),"撤销单体移动恢复连栋及挂点");
  await edit(d=>d.update("left",{isActive:false}));await frames();
  check(!system.resolve("left-c")&&pick(5,1.95,3.1,"right-window-c"),"禁用左房 Entity 保留右房");
  await restore();await frames();check(pick(-6,1,3.1,"left-c"),"撤销禁用恢复左房");
  await edit(d=>d.delete("left"));await frames();
  check(!component("left-c")&&pick(5,1.95,3.1,"right-window-c"),"删除左房后右房仍可独立拾取");
  await restore();await frames();
  check(pick(-6,1,3.1,"left-c")&&pick(-5,1.95,3.1,"left-window-c"),"撤销删除以新组件实例恢复主体和窗户");
  check(unchanged(),"删除和撤销仍不重建独立组");
  await edit(d=>d.update("right",{position:[4,0,0]}));
  await project.flush();dispose();await load();await frames();
  check(system.metrics().groups===2&&pick(6,1.95,3.1,"right-window-c"),"保存后新 Engine 从 Scene 恢复分组、主体和窗户");
  check(project.history.query().undo.length===0,"重新打开项目不恢复上一会话的撤销历史");
  await edit(d=>d.update("right",{position:[3,0,0]}));
  await restore();await frames();check(pick(6,1.95,3.1,"right-window-c"),"新会话撤销新编辑恢复已保存的 Scene");
  const saved=project.projectPackage.contents["Building.scene"];
  check(typeof saved==="string"&&!saved.includes("MasonryDocument")&&!saved.includes("Building runtime"),"保存没有第二份建筑目录和派生运行节点");
  (window as any).groupResult={ok:true,checks,metrics:system.metrics()};status.textContent=`通过 ${checks.length} 项连栋验收`;
}
document.querySelector<HTMLButtonElement>("#verify")!.addEventListener("click",async event=>{
  const button=event.currentTarget as HTMLButtonElement;button.disabled=true;
  try{await (environmentMode?verifyEnvironment():entranceMode?verifyEntrance():structureMode?verifyStructure():residencyMode?verifyResidency():distanceMode?verifyDistance():grounded?verifyGrounding():verify());}catch(error){status.textContent=String(error);(window as any).groupResult={ok:false,error:String(error)};console.error(error);}finally{button.disabled=false;}
});
load().catch(error=>{status.textContent=String(error);(window as any).groupResult={ok:false,error:String(error)};console.error(error);});

// This reference invokes the original compiler with world terrain and placement;
// the system under test executes the Worker and publishes actual GPU renderers.
async function groundReference(){
  const parent=frame(), members=["left-c","right-c"].map(id=>component(id) as HouseComponent);
  const inputs=members.map(body=>{
    const decorations=body.entity.children.flatMap(entity=>[...entity.getComponents(WindowComponent,[]),...entity.getComponents(WallLampComponent,[])]);
    const identity=(value:any)=>editor.projection.queryComponents().find(r=>component(r.id)===value)!.id;
    return {document:buildingDocument(body,decorations,identity),poses:buildingRigidBindings(body,decorations,identity),transform:buildingFrameMatrix(body.entity,parent)};
  });
  const input=groundedBuildingDocument(buildingGroupInput(inputs).document,parent.transform.worldMatrix);
  const height=prepareConstructionTerrain(input,terrain.grid).height;
  return compileMasonryLayout(input,height,buildingAssets(members[0].assets!).compilation);
}
function worldPoint(point:readonly number[]){const result=new Vector3();Vector3.transformCoordinate(new Vector3(point[0],point[1],point[2]),frame().transform.worldMatrix,result);return result;}
function groundPick(point:Vector3,id:string){return pick(point.x,point.y,point.z,id);}
function fixtureLight(){return scene.rootEntities.flatMap(entity=>entity.getComponentsIncludeChildren(PointLight,[])).find(light=>light.enabled&&light.color.r+light.color.g+light.color.b>0);}
async function verifyGrounding(){
  const checks:string[]=[];const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label);status.textContent=`${checks.length}：${label}`;};
  const inspect=async(label:string)=>{
    await system.flush();await frames(20);const original=await groundReference();
    const originalSurface=constructionPreview(original.document,prepareConstructionTerrain(original.document,terrain.grid).height,
      original.construction,{includeStructure:true});
    // Independent world-vertex reference: no use of the new transformed-query
    // implementation or of BuildingSystem's derived query/cache.
    const referenceParts=originalSurface.structuralParts!.map(part=>{
      const positions:number[]=[];
      for(let i=0;i<part.positions.length;i+=3){const world=worldPoint(part.positions.slice(i,i+3));positions.push(world.x,world.y,world.z);}
      return {owner:part.owner,positions,indices:part.indices};
    });
    const reference=new ConstructionSurfaceQuery(referenceParts,[0,0,0],id=>id);
    // Probe a known source triangle rather than assuming a vertical line through
    // the footprint centre hits a closed roof (the native structure has gaps).
    let rayStart:[number,number,number]|undefined,rayEnd:[number,number,number]|undefined;
    probe: for(const part of referenceParts)for(let i=0;i<part.indices.length;i+=3){
      const vertices=part.indices.slice(i,i+3).map(index=>new Vector3(...part.positions.slice(index*3,index*3+3) as [number,number,number]));
      const u=new Vector3(),v=new Vector3(),normal=new Vector3();
      Vector3.subtract(vertices[1],vertices[0],u);Vector3.subtract(vertices[2],vertices[0],v);Vector3.cross(u,v,normal);
      if(normal.length()<1e-8)continue;normal.normalize();
      const center=["x","y","z"].map(axis=>vertices.reduce((sum,point)=>sum+point[axis as "x"|"y"|"z"],0)/3);
      const n=[normal.x,normal.y,normal.z];
      rayStart=center.map((value,axis)=>value+.2*n[axis]) as [number,number,number];
      rayEnd=center.map((value,axis)=>value-.2*n[axis]) as [number,number,number];break probe;
    }
    if(!rayStart||!rayEnd)throw Error("Original structural reference has no nondegenerate triangle");
    const expectedHit=reference.intersectSegment(rayStart,rayEnd),actualHit=system.intersectSegment(rayStart,rayEnd);
    ((window as any).groundingSurfaceEvidence??=[]).push({label,expectedHit,actualHit,rayStart,rayEnd,referenceBounds:reference.bounds,actualBounds:system.bounds});
    check(!!actualHit&&!!expectedHit&&actualHit.subject===expectedHit.subject&&
      actualHit.position.every((value,i)=>Math.abs(value-expectedHit.position[i])<1e-5),label+"：组件碰撞与原编译器结构的世界坐标一致");
    const left=original.construction.owners.find(owner=>owner.building.id==="left-c")!;
    const wall=worldPoint([-6.4,(left.profile.topY+left.profile.maxGround)/2,3.1]);
    check(groundPick(wall,"left-c"),label+"：主体按原地形接地且世界位置没有叠加两次");
    for(const id of ["left-window-c","right-window-c"]){
      const part=original.construction.decorations.flatMap(d=>d.parts).find(part=>part.decorationId===id&&part.id.endsWith("glass"))!;
      if(!part)throw Error("Original window glass missing: "+id);
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<part.positions.length;i++) {const c=i%3;min[c]=Math.min(min[c],part.positions[i]);max[c]=Math.max(max[c],part.positions[i]);}
      const center=worldPoint(min.map((n,i)=>(n+max[i])/2));
      check(groundPick(center,id),label+"：真实 GPU 窗户与原编译坐标一致 "+id);
    }
    const light=fixtureLight(),expected=constructionDecorationLights(original.construction.decorations.flatMap(d=>d.parts)).find(d=>d.decorationId==="lamp-c");
    const expectedWorld=expected?worldPoint(expected.position):undefined;
    const evidence={label,expected:expectedWorld&&[expectedWorld.x,expectedWorld.y,expectedWorld.z],actual:light&&[light.entity.transform.worldPosition.x,light.entity.transform.worldPosition.y,light.entity.transform.worldPosition.z],
      distance:expectedWorld?Vector3.distance(expectedWorld,camera.entity.transform.worldPosition):null,
      initialFarCameraDistance:expectedWorld?Vector3.distance(expectedWorld,new Vector3(20,27,49)):null};
    ((window as any).groundingEvidence??=[]).push(evidence);
    if(!expectedWorld||!light)throw Error("Wall lamp emission missing: "+JSON.stringify(evidence));
    const world=expectedWorld;
    check(Vector3.distance(world,light.entity.transform.worldPosition)<1e-4,label+"：墙灯光源与原生几何同位");
    return {height:left.profile.maxGround,light:light.entity.transform.worldPosition.clone()};
  };
  const first=await inspect("初始旋转组");check(first.height>10,"实际岩石支撑参与采样");
  const body=component("left-c"),windowComponent=component("left-window-c"),root=frame();
  terrain={revision:1,grid:{...terrain.grid,decode:{...terrain.grid.decode,offset:2},supports:terrain.grid.supports!.map(mesh=>({indices:mesh.indices,positions:Float32Array.from(mesh.positions,(n,i)=>n+(i%3===1?2:0))}))}};
  const raisedUpdate=await system.prepareTerrain(terrain);raisedUpdate.commit();raisedUpdate.finalize();
  const raised=await inspect("地形与岩石升高");
  check(Math.abs(raised.light.y-first.light.y-2)<1e-4,"环境更新使实际灯光上移两米");
  check(component("left-c")===body&&component("left-window-c")===windowComponent&&frame()===root,"环境重建保留作者 Entity 和 Component");
  frame().transform.setPosition(18,0,20);await inspect("移动组");
  await edit(d=>d.update("group",{position:[18,0,20],rotation:[0,15,0]}));await inspect("Scene 事务旋转组");
  await project.flush();dispose();await load();await inspect("新 Engine 重载");
  check(frame().transform.position.x===18&&Math.abs(frame().transform.rotation.y-15)<1e-5,"保存保留 Scene 框架位姿");
  check(project.history.query().undo.length===0,"重新打开项目的撤销历史为空");
  await edit(d=>d.update("group",{position:[16,0,20],rotation:[0,30,0]}));
  await restore();await inspect("新会话撤销新编辑");
  check(frame().transform.position.x===18,"撤销恢复已保存的 Source 位置");
  const previous=terrain;const controller=new AbortController();
  const superseded={revision:2,grid:{...terrain.grid,decode:{...terrain.grid.decode,offset:5}}};
  const pending=system.prepareTerrain(superseded,controller.signal);controller.abort();
  let cancelled=false;try{await pending;}catch{cancelled=true;}
  check(cancelled&&system.terrainSource===previous,"取消环境准备保留已发布地形");
  terrain={revision:3,grid:{...previous.grid,decode:{...previous.grid.decode,offset:4}}};
  const latest=await system.prepareTerrain(terrain);latest.commit();latest.finalize();
  const final=await inspect("连续环境更新");
  check(Number.isFinite(final.height),"过期 Worker 不覆盖最新地形发布");
  const retained=renderers();let unavailable=false;
  try{await system.prepareTerrain(undefined!);}catch(error){unavailable=String(error).includes("terrain is unavailable");}
  check(retained.every(renderer=>!renderer.destroyed),"地形不可用时保留上一份已发布几何");
  check(unavailable,"真实地形暂不可用时明确失败，不退回平地");
  (window as any).groupResult={ok:true,checks,metrics:system.metrics(),terrainRevision:terrain.revision};
  status.textContent=`通过 ${checks.length} 项真实地形接地验收`;
}


/** Exercise the shared distance renderer against actual Scene components before
 * integrating asynchronous residency into BuildingSystem. No authored copy. */
async function verifyDistance(){
  const checks:string[]=[];
  const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label);status.textContent=`${checks.length}：${label}`;};
  let views:Awaited<ReturnType<typeof createMasonryDistanceView>>[]=[];
  const identity=(value:any)=>editor.projection.queryComponents().find(record=>component(record.id)===value)!.id;
  const publish=async()=>{
    for(const view of views)view.destroy();views=[];
    await system.flush();system.enabled=false;
    for(const parent of [frame(),component("independent-c").entity]){
      for(const child of parent.children)if(child.name==="Masonry"||child.name==="Building surfaces")child.isActive=false;
      const bodies=parent===frame()?[component("left-c"),component("right-c")]:[component("independent-c")];
      const inputs=bodies.map(value=>{
        const body=value as HouseComponent;
        const decorations=body.entity.children.flatMap(entity=>entity.getComponents(Component,[]).filter((member):member is WallDecorationComponent=>member instanceof WallDecorationComponent));
        const dormers=body.entity.children.flatMap(entity=>entity.getComponents(RoofWindowComponent,[]));
        return {document:buildingDocument(body,decorations,identity,body.entity.getComponents(BuildingSurfaceComponent,[]),dormers),
          poses:buildingRigidBindings(body,decorations,identity,dormers),transform:buildingFrameMatrix(body.entity,parent)};
      });
      const input=buildingGroupInput(inputs);
      const view=await createMasonryDistanceView(engine,parent,{document:input.document,resolvePickId:(owner,id)=>id&&system.resolve(id)?id:owner,
        rigidDecorations:{poses:input.poses,resolve:id=>system.resolve(id)?.entity}},
        {revision:0,grid:{samples:new Uint16Array(4),resolution:2,origin:[-100,-100],size:200,decode:{offset:0,scale:1}}},
        (bodies[0] as HouseComponent).assets!,camera);
      views.push(view);await view.ready;
    }
    await frames(3);
  };
  const picked=(id:string)=>{
    engine.update();
    const object=component(id) as WallDecorationComponent, center=new Vector3();
    Vector3.transformCoordinate(new Vector3(0,object.height/2,.08),object.entity.transform.worldMatrix,center);
    const screen=new Vector3();
    for(let dx=-.2;dx<=.2;dx+=.1)for(let dy=-.2;dy<=.2;dy+=.1){
      camera.worldToScreenPoint(new Vector3(center.x+dx,center.y+dy,center.z),screen);
      if(picker.pick(screen.x,screen.y,v=>views.forEach(view=>view.visitPickBatches(v)))===id)return true;
    }return false;
  };
  const isolateAttachments=()=>{
    // A matrix-only test deliberately does not regenerate wall openings. Hide the
    // stationary facade leaves, while retaining the actual attachment renderers.
    const entities=[...new Set(views.flatMap(view=>view.root.getComponentsIncludeChildren(MeshRenderer,[]))
      .filter(renderer=>!(renderer instanceof MountedDecorationRenderer)&&!(renderer instanceof RigidDecorationRenderer))
      .map(renderer=>renderer.entity))];
    const active=entities.map(entity=>entity.isActive);entities.forEach(entity=>entity.isActive=false);
    return ()=>entities.forEach((entity,i)=>entity.isActive=active[i]);
  };
  try{
    await publish();
    for(const id of ["left-window-c","right-window-c","door-c","lamp-c"])check(picked(id),"远景独立 GPU 拾取："+id);
    const windowEntity=component("left-window-c").entity,position=windowEntity.transform.position.clone();
    const move=(x:number)=>windowEntity.transform.setPosition(x,position.y,position.z);
    move(-1);await frames();check(!picked("left-window-c"),"只移动窗口而不重编墙洞时，旧墙面仍提供真实遮挡");
    const restoreFacade=isolateAttachments();await frames();
    check(picked("left-window-c"),"隔离墙面后，已发布远景批次直接消费窗口 Entity 的第一次移动");
    move(-2.5);await frames();check(picked("left-window-c"),"再次移动仍消费 worldMatrix，无需重编远景");
    windowEntity.transform.setScale(1.3,1.2,1);await frames();check(picked("left-window-c"),"窗口缩放使用同一矩阵绑定及拾取");
    move(position.x);windowEntity.transform.setScale(1,1,1);restoreFacade();
    await edit(d=>d.update("left-window",{position:[-1,position.y,position.z]}));await publish();
    check(picked("left-window-c"),"完整 Scene 编辑发布后新墙洞与移动后的窗口一致");
    await edit(d=>d.update("left-window",{position:[position.x,position.y,position.z]}));await publish();
    for(const type of ["window-gothic","window-arrow-slit","window-cottage"]){
      await edit(d=>d.updateComponent("left-window-c",{type}));await publish();
      check(picked("left-window-c"),"保留原生材质及组件身份："+type);
      const instance=component("left-window-c").entity,p=instance.transform.position.clone();
      const mounted=views.flatMap(view=>view.root.getComponentsIncludeChildren(MountedDecorationRenderer,[]))
        .filter(renderer=>renderer.entity.name.includes("left-window-c"));
      const before=mounted.map(renderer=>renderer.bounds.min.clone());
      const restoreFacade=isolateAttachments();
      instance.transform.setPosition(p.x+1.5,p.y,p.z);await frames();
      check(picked("left-window-c"),"玻璃批次跟随 Entity："+type);
      if(type==="window-gothic")check(mounted.length>0,"Gothic 窗保留原生独立石框绘制");
      if(mounted.length)check(mounted.every((renderer,i)=>Math.abs(renderer.bounds.min.x-before[i].x-1.5)<1e-4),"原生石框使用同一 Entity 矩阵："+type);
      instance.transform.position=p;restoreFacade();
    }
    for(const type of ["door-gothic","door-cottage"]){
      await edit(d=>d.updateComponent("door-c",{type}));await publish();check(picked("door-c"),"远景门组件："+type);
    }
    frame().transform.setPosition(1,0,1);await frames();check(picked("left-window-c")&&picked("right-window-c"),"公共父节点移动后双方远景装饰保持独立身份");
    frame().transform.setPosition(0,0,0);
    const root=views[0].root;views[0].setVisualVisible(false);let hiddenBatches=0;views[0].visitPickBatches(()=>hiddenBatches++);
    check(hiddenBatches===0,"远景隐藏时不参与拾取");views[0].setVisualVisible(true);
    check(root===views[0].root&&picked("left-window-c"),"恢复远景不重建资源且恢复组件拾取");
    (window as any).groupResult={ok:true,checks};status.textContent=`通过 ${checks.length} 项远景组件验收`;
  }catch(error){for(const view of views)view.destroy();throw error;}
  window.addEventListener("pagehide",()=>views.forEach(view=>view.destroy()),{once:true});
}


async function verifyResidency(){
  const checks:string[]=[];
  const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label);status.textContent=`${checks.length}：${label}`;};
  const inspect=()=> (component("left-wall-c") as BuildingSurfaceComponent).inspectPublished();
  const near=()=>{camera.entity.transform.setPosition(3,9,27);camera.entity.transform.lookAt(new Vector3(3,2,0));};
  const far=()=>{camera.entity.transform.setPosition(3,100,700);camera.entity.transform.lookAt(new Vector3(3,2,0));};
  const until=async(test:()=>boolean,label:string)=>{
    const deadline=performance.now()+15000;
    while(!test()){if(performance.now()>deadline)throw Error("Timed out: "+label);await frames();}
  };
  const savedRetain=MASONRY_RESIDENCY.retainMs;
  const snapshots:any[]=[];
  try{
    await system.flush();
    check(system.metrics().groups===2&&system.metrics().detailAttempts===0,"远处初始化只发布两个远景组，没有加载高精度网格");
    const initial=await inspect();
    check(initial.totalUnits>0&&!!initial.sampleRegion,"未加载的建筑仍可通过 Worker 查询真实铺设单元");
    check(system.metrics().detailAttempts===0&&system.metrics().residentBytes===0,"表面查询不分配高精度 GPU 资源");
    const independent=renderers(component("independent-c").entity);
    await edit(d=>d.updateComponent("left-wall-c",{regions:[{region:initial.sampleRegion!,effect:{hidden:true}}]}));
    const edited=await inspect();
    check(edited.hiddenUnits>0&&system.metrics().detailAttempts===0,"远处局部切除直接发布远景，不触发全量高精度加载");
    check(independent.every(renderer=>!renderer.destroyed),"编辑连栋组不重建独立房屋的远景资源");
    snapshots.push({label:"distant-edit",metrics:system.metrics(),surface:edited});
    near();await system.flush();await frames(40);
    check(system.metrics().detailAttempts===2&&system.metrics().detailReady===2,"走近后只加载两个需要的编译组");
    check(pick(-5,1.95,3.1,"left-window-c")&&pick(5,1.95,3.1,"right-window-c"),"高精度加载与渐变结束后，双方窗口仍能独立拾取");
    check(JSON.stringify(await inspect())===JSON.stringify(edited),"近景表面查询与未驻留时的 Worker 查询一致");
    const attempts=system.metrics().detailAttempts;
    await frames(40);check(system.metrics().detailAttempts===attempts,"稳定相机不重复加载");
    MASONRY_RESIDENCY.retainMs=0;far();await system.flush();
    await until(()=>system.metrics().residentBytes===0,"fine eviction");
    check(system.metrics().evictions===2,"离开后按同一驻留策略释放两个高精度组");
    check(JSON.stringify(await inspect())===JSON.stringify(edited),"淘汰高精度网格不会改变表面查询结果");
    snapshots.push({label:"evicted",metrics:system.metrics()});
    near();const loading=system.flush();
    await until(()=>system.metrics().detailAttempts>attempts,"new load started");
    const editing=edit(d=>d.updateComponent("left-c",{height:5}));
    await Promise.all([loading,editing]);await frames(40);
    check((component("left-c") as HouseComponent).height===5&&system.metrics().errors.length===0,"加载期间的后续编辑以最新组件输入发布");
    check((await inspect()).hiddenUnits>0&&pick(-5,1.95,3.1,"left-window-c"),"重新驻留保留局部切除和组件拾取");
    await edit(d=>d.delete("left"));await frames(40);
    check(!system.resolve("left-c")&&pick(5,1.95,3.1,"right-window-c"),"删除一个主体保留同组邻居的可见几何与拾取");
    await restore();await frames(40);
    check(pick(-5,1.95,3.1,"left-window-c")&&pick(5,1.95,3.1,"right-window-c"),"撤销删除恢复双方的新组件实例及远近景");
    const saved=project.projectPackage.contents["Building.scene"];
    check(typeof saved==="string"&&!saved.includes("Building surfaces")&&!saved.includes("MasonryDocument"),"保存只包含 Source 组件，不写派生驻留状态");
    snapshots.push({label:"final",metrics:system.metrics()});
    (window as any).groupResult={ok:true,checks,snapshots};status.textContent=`通过 ${checks.length} 项组件驻留验收`;
  }finally{MASONRY_RESIDENCY.retainMs=savedRetain;}
}


async function verifyStructure(){
  const checks:string[]=[];
  const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label);status.textContent=label;};
  type V=[number,number,number];
  const start:V=[-6,1,4],end:V=[-6,1,2];
  const initial=system.intersectSegment(start,end);
  check(initial?.subject==="left-c","真实墙面碰撞返回 Scene 主体组件身份");
  // The original facade envelope includes wall thickness; do not assume the
  // contact plane equals the rectangle centreline at Z=3.
  const min=initial!.position.map(value=>value-.05) as V, max=initial!.position.map(value=>value+.05) as V;
  check(system.intersectCapsule([-6,1,3.15],[-6,2,3.15],.25)?.subject==="left-c","胶囊查询使用实际墙面");
  check(system.captureSurfaceQuery().intersectBounds(min,max)?.subject==="left-c","范围查询使用真实结构表面");
  check(system.metrics().detailAttempts===0&&system.metrics().residentBytes===0,"远处结构查询无需加载精细 GPU 网格");
  const snapshot=system.captureSurfaceQuery(), prior=renderers();
  frame().transform.setPosition(11,3,-4);frame().transform.setRotation(0,35,0);frame().transform.setScale(2,1.5,.5);
  const transform=(p:V):V=>{const v=new Vector3(...p);Vector3.transformCoordinate(v,frame().transform.worldMatrix,v);return [v.x,v.y,v.z];};
  const moved=system.intersectSegment(transform(start),transform(end));
  check(moved?.subject==="left-c"&&Math.abs(moved.fraction-initial!.fraction)<1e-5,"父节点移动旋转非均匀缩放立即作用于碰撞，无需重编");
  check(!system.intersectSegment(start,end),"父节点移动后旧位置不残留碰撞");
  check(snapshot.intersectBounds(min,max)?.subject==="left-c","已捕获的世界事务快照不被后续节点移动修改");
  await system.flush();
  // Scaling can legitimately admit a new fine LOD. The original distance
  // resources must survive; newly loaded fine renderers are not replacements.
  check(prior.every(renderer=>!renderer.destroyed&&renderers().includes(renderer)),"只改变公共父矩阵仍复用原有几何 Renderer");
  frame().transform.setPosition(0,0,0);frame().transform.setRotation(0,0,0);frame().transform.setScale(1,1,1);
  const left=component("left-c") as HouseComponent;
  left.enabled=false;
  check(!system.intersectSegment(start,end),"禁用主体立即移除其碰撞，不等下一次编译");
  check(system.intersectSegment([6,1,4],[6,1,2])?.subject==="right-c","禁用左房仍保留连栋右房碰撞");
  left.enabled=true;await system.flush();
  check(system.intersectSegment(start,end)?.subject==="left-c","重新启用恢复主体结构");
  await edit(d=>d.update("left",{position:[-20,0,0]}));
  check(!system.intersectSegment(start,end)&&system.intersectSegment([-23,1,4],[-23,1,2])?.subject==="left-c","Scene 编辑局部移动后碰撞与新建筑位置一致");
  await restore();
  const beforeDelete=system.captureSurfaceQuery();await edit(d=>d.delete("left"));
  check(!system.intersectSegment(start,end)&&beforeDelete.intersectBounds(min,max)?.subject==="left-c","删除清理当前碰撞但保留既有事务快照");
  await restore();
  check(system.intersectSegment(start,end)?.subject==="left-c","撤销删除从新组件实例恢复碰撞");
  await project.flush();dispose();await load();
  check(system.intersectSegment(start,end)?.subject==="left-c"&&system.metrics().detailAttempts===0,"新 Engine 从 Scene 恢复结构查询，无需精细驻留");
  const saved=project.projectPackage.contents["Building.scene"];
  check(typeof saved==="string"&&!saved.includes("worldStructure")&&!saved.includes("structuralParts"),"结构查询只作派生缓存，不进入 Source 存档");
  (window as any).groupResult={ok:true,checks,initialContact:initial,metrics:system.metrics()};status.textContent=`通过 ${checks.length} 项组件结构验收`;
}


async function verifyEntrance(){
  const checks:string[]=[];
  const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label);status.textContent=`${checks.length}：${label}`;};
  // The fixture controls time through the real Script update; compilation and
  // real GPU rendering continue, but wall-clock test delays cannot consume it.
  engine.pause(); system.enabled=false;
  const states=()=>(system as any).entrance.states as Map<string,{progress:number}>;
  const progress=(id="left-c")=>states().get(id)?.progress;
  const tick=(seconds:number)=>{system.onUpdate(seconds);engine.update();};
  const shaders=(id:string)=>{
    const result:MeshRenderer[]=[];
    system.visitPickBatches(batch=>{for(let i=0;i<batch.count;i++)if(batch.resolve(i)===id){result.push(batch.renderer as MeshRenderer);break;}});
    return result.filter(renderer=>renderer.shaderData.getVector4("renderer_MasonryEntrance"));
  };
  const oldRetain=MASONRY_RESIDENCY.retainMs;
  try{
    (window as any).entranceEvidence={states:structuredClone([...states()]),metrics:system.metrics()};
    check(progress()===1&&system.metrics().detailAttempts===0,"独立组件默认已完成，远处初始化没有精细网格");
    system.publishEntrance();tick(30);
    check(progress()===0&&progress("right-c")===0,"首次发布等待世界开始屏障，不消耗编译时间");
    system.startEntrance();tick(30);tick(.6);
    check(progress()===.25&&progress("right-c")===.25,"粗模按原有 2.4 秒时长播放");
    check(shaders("left-c").length>0&&shaders("left-c").every(r=>r.shaderData.getVector4("renderer_MasonryEntrance").x===.25),"真实远景材质绑定当前动画进度");
    await edit(d=>d.updateComponent("left-c",{height:(component("left-c") as HouseComponent).height+1}));
    check(progress()===.25&&progress("right-c")===.25,"编辑与组件重投影保留两栋建筑当前进度");
    camera.entity.transform.setPosition(3,9,27);camera.entity.transform.lookAt(new Vector3(3,2,0));
    await system.flush();engine.update();
    check(system.metrics().detailReady===2&&progress()===.25,"走近加载精细网格不会重新播放或推进动画");
    const fine=frame().children.flatMap(child=>child.name==="Masonry"?child.getComponentsIncludeChildren(MeshRenderer,[]):[])
      .filter(r=>r.shaderData.getVector4("renderer_MasonryEntrance"));
    check(fine.length>0&&fine.every(r=>r.shaderData.getVector4("renderer_MasonryEntrance").x===.25),"新驻留的真实精细材质沿用当前进度");
    camera.entity.transform.setPosition(13,6,18);tick(0);
    check(!fixtureLight(),"主体入场尚未完成时墙灯不提前照亮场景");
    camera.entity.transform.setPosition(3,9,27);tick(0);
    tick(.6);check(progress()===.5,"精细网格发布后时钟连续前进");
    const retained=renderers();frame().transform.setPosition(1,0,0);await system.flush();
    check(progress()===.5&&retained.every(r=>!r.destroyed),"整体移动保持网格及动画时钟");
    frame().transform.setPosition(0,0,0);await system.flush();
    tick(3);
    MASONRY_RESIDENCY.retainMs=0;
    camera.entity.transform.setPosition(3,100,4000);camera.entity.transform.lookAt(new Vector3(3,2,0));
    await system.flush();
    for(let i=0;i<120&&system.metrics().residentBytes;i++){tick(.1);await frames(1);}
    check(system.metrics().residentBytes===0&&progress()===1,"精细资源淘汰不丢失时钟");
    camera.entity.transform.setPosition(3,9,27);camera.entity.transform.lookAt(new Vector3(3,2,0));
    await system.flush();check(system.metrics().detailReady===2&&progress()===1,"再次加载不从零开始");
    // Remove and commit before undo: this is a new accepted owner, unlike a
    // same-ID component replacement inside one transaction.
    system.replayEntrance();tick(0);tick(.6);
    await edit(d=>d.delete("left"));
    check(!states().has("left-c")&&progress("right-c")===.25,"删除清理自己的时钟，邻居不受影响");
    await restore();
    check(progress()===0&&progress("right-c")===.25,"撤销删除作为重新出现，已有邻居保留进度");
    tick(.6);check(progress()===0&&progress("right-c")===.5,"新增主体独立忽略首帧，已有主体继续播放");
    tick(.6);check(progress()===.25&&progress("right-c")===.75,"新增主体正常继续播放");
    tick(3);tick(.3);
    check([...states().values()].every(s=>s.progress===1),"全部动画最终完成");
    camera.entity.transform.setPosition(13,6,18);tick(.35);
    check(!!fixtureLight(),"入场完成后墙灯正常照明");
    camera.entity.transform.setPosition(3,9,27);tick(0);
    check(pick(-5,1.95,3.1,"left-window-c")&&pick(5,1.95,3.1,"right-window-c"),"入场完成后两个窗户仍独立 GPU 拾取");
    system.replayEntrance(component("left-c") as HouseComponent);
    check(progress()===0&&progress("right-c")===1,"显式重播只影响指定主体");
    tick(0);tick(3);
    const saved=project.projectPackage.contents["Building.scene"];
    check(typeof saved==="string"&&!saved.includes("entrance")&&!saved.includes("progress"),"动画时钟不进入 Source 保存");
    (window as any).groupResult={ok:true,checks,metrics:system.metrics()};status.textContent=`通过 ${checks.length} 项组件入场验收`;
  }finally{MASONRY_RESIDENCY.retainMs=oldRetain;system.enabled=true;engine.run();}
}


async function verifyEnvironment(){
  const checks:string[]=[];
  const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label);status.textContent=`${checks.length}：${label}`;};
  const allRenderers=()=>scene.rootEntities.flatMap(entity=>entity.getComponentsIncludeChildren(MeshRenderer,[]));
  const serialized=project.projectPackage.contents["Building.scene"];
  const identities=["left-c","right-c","independent-c","left-window-c"].map(component);
  const original=system.terrainSource!,initialBounds=JSON.stringify(system.bounds),originalRenderers=allRenderers();
  const oldSnapshot=system.captureSurfaceQuery();
  const raise=(source:ConstructionTerrainSource,revision:number,amount:number):ConstructionTerrainSource=>({revision,grid:{...source.grid,
    decode:{...source.grid.decode,offset:source.grid.decode.offset+amount},supports:source.grid.supports?.map(mesh=>({indices:mesh.indices,
      positions:Float32Array.from(mesh.positions,(n,i)=>n+(i%3===1?amount:0))}))}});
  const unrelated={revision:100,grid:{...original.grid,samples:original.grid.samples.slice()}};
  unrelated.grid.samples[unrelated.grid.samples.length-1]++;
  const untouched=await system.prepareTerrain(unrelated);
  check(allRenderers().length===originalRenderers.length,"远处地形变化不创建无关建筑网格");
  untouched.commit();untouched.finalize();
  check(originalRenderers.every(r=>!r.destroyed)&&system.terrainSource===unrelated,"无关建筑保留渲染资源但接受最新环境");
  const reset=await system.prepareTerrain(original);reset.commit();reset.finalize();
  const next=raise(original,101,10),candidate=await system.prepareTerrain(next);
  const candidateRenderers=allRenderers().filter(r=>!originalRenderers.includes(r));
  check(candidateRenderers.length>0&&candidateRenderers.every(r=>!r.entity.isActiveInHierarchy),"候选网格已准备且全部隐藏");
  check(system.terrainSource===original&&JSON.stringify(system.bounds)===initialBounds,"准备期间实际环境与碰撞保持旧版本");
  check(originalRenderers.every(r=>!r.destroyed),"准备没有销毁原渲染资源");
  check(candidate.bounds.some((b,i)=>Math.abs(b.min[1]-system.bounds[i].min[1]-10)<1e-4),"隐藏候选提供新环境的实际结构边界");
  let busy=false;try{await system.flush();}catch(error){busy=String(error).includes("publication is pending");}
  check(busy,"环境事务未结束时拒绝交叉普通发布");
  candidate.commit();
  check(system.terrainSource===next&&JSON.stringify(system.bounds)===JSON.stringify(candidate.bounds),"提交同时切换环境与实际碰撞");
  check(originalRenderers.every(r=>!r.destroyed&&!r.entity.isActiveInHierarchy),"提交后旧网格隐藏但保留到最终验收");
  check(candidateRenderers.some(r=>r.entity.isActiveInHierarchy),"提交后候选网格可见");
  check(identities.every((c,i)=>c===component(["left-c","right-c","independent-c","left-window-c"][i])),"环境发布保持原生对象身份");
  candidate.rollback();
  check(system.terrainSource===original&&JSON.stringify(system.bounds)===initialBounds,"回滚恢复旧环境与碰撞");
  check(originalRenderers.every(r=>!r.destroyed)&&originalRenderers.some(r=>r.entity.isActiveInHierarchy),"回滚重新使用旧渲染资源");
  candidate.discard();
  check(candidateRenderers.every(r=>r.destroyed)&&!system.terrainEditPending,"丢弃释放全部候选并结束事务");
  const accepted=await system.prepareTerrain(next);accepted.commit();accepted.finalize();terrain=next;
  check(originalRenderers.every(r=>r.destroyed)&&!system.terrainEditPending,"最终确认后才销毁旧网格");
  await system.flush();await frames();
  check(system.metrics().detailReady===2&&system.metrics().errors.length===0,"提交后的精细Worker使用新环境继续驻留");
  const retainedBounds=JSON.stringify(system.bounds);
  const stale=await system.prepareTerrain(raise(next,102,3));
  const left=component("left-c") as HouseComponent,oldHeight=left.height;left.height=oldHeight+1;
  let rejected=false;try{stale.commit();}catch(error){rejected=String(error).includes("stale");}
  check(rejected&&system.terrainSource===next,"准备后组件编辑使候选失效，不能覆盖新编辑");
  left.height=oldHeight;stale.discard();await system.flush();
  const cancel=new AbortController(),cancelled=await system.prepareTerrain(raise(next,103,4),cancel.signal);
  cancel.abort();
  let aborted=false;try{cancelled.commit();}catch{aborted=true;}
  check(aborted&&!system.terrainEditPending&&system.terrainSource===next,"完成准备后取消会释放候选且禁止提交");
  const beforeFailure=allRenderers();let invalid=false;
  try{await system.prepareTerrain({revision:104,grid:{...next.grid,origin:[200,200]}});}catch{invalid=true;}
  check(invalid&&!system.terrainEditPending&&beforeFailure.every(r=>!r.destroyed),"无法采样的新地形失败，不损坏已发布网格");
  check(JSON.stringify(system.bounds)===retainedBounds&&system.terrainSource===next,"失败及取消不改变已发布结构");
  check(project.projectPackage.contents["Building.scene"]===serialized,"环境事务没有写入第二份建筑作者数据");
  check(oldSnapshot.intersectBounds([0,0,0],[64,40,64])!==null,"旧不可变碰撞快照在原网格销毁后仍可使用");
  const closing=await system.prepareTerrain(raise(next,105,2));dispose();let closed=false;
  try{closing.commit();}catch{closed=true;}
  check(closed,"Engine销毁同时废弃未提交环境候选");
  await load();await frames();
  check(system.metrics().buildings===3&&system.metrics().errors.length===0,"新Engine从Source和已发布环境恢复原生建筑");
  (window as any).groupResult={ok:true,checks,metrics:system.metrics()};status.textContent=`通过 ${checks.length} 项环境原子发布验收`;
}
