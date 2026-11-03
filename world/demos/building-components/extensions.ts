import { ConstructionCpuClient } from "@galacean/engine-building/tiny-glade/runtime/ConstructionWorkerClient";
import { buildingDocument } from "@galacean/engine-building/tiny-glade/components/BuildingDocument";
import { ConstructionSurfaceQuery } from "@galacean/engine-building/tiny-glade/runtime/ConstructionSurfaceQuery";
import { editNativeMesh } from "./NativeAssetAcceptance.ts";
import { parseTexturePixelsData } from "@galacean/engine-loader";
import { buildingAssets } from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import { registerBuildingAssetComponents } from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import { constructionDecorationRecipe } from "@galacean/engine-building/tiny-glade/runtime/ConstructionDecorationRecipe";
import { decorationMesh } from "@galacean/engine-building/tiny-glade/runtime/ConstructionDecorationMeshes";
import type { SeedWorldPickBatch, SeedWorldPickSource } from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import { generatedDecorationSeed } from "@galacean/engine-building/tiny-glade/runtime/ConstructionDecorationConfig";
import { MountedDecorationRenderer } from "@galacean/engine-building/tiny-glade/runtime/MountedDecorationRenderer";
import { builtinBuildingAssetFiles, BUILTIN_BUILDING_ASSETS } from "@galacean/engine-building/tiny-glade/resources/BuiltinBuildingAssets";
import { AssetType, Camera, Color, DirectLight, PointLight, MeshRenderer, Texture2D, Texture2DArray, Vector3, WebGLEngine, type Scene } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { BuildingSystem, MainBuildingComponent, DecorationComponent, HouseComponent, BuildingSurfaceComponent, WallComponent, FenceComponent, WindowComponent, DoorComponent, OpeningComponent, WallLampComponent, RoofDecorationComponent, RoofWindowComponent, RoofHatchComponent, RoofLampComponent } from "@galacean/engine-building/tiny-glade/components/BuildingComponents";
import { buildingWallPosition, type BuildingShape } from "@galacean/engine-building/tiny-glade/components/BuildingShape";
import { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeProjectStorage, RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { SeedWorldPicker } from "@galacean/engine-world-planning/world/SeedWorldPicker";

const status = document.querySelector<HTMLElement>("#status")!;
const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
registerBuildingAssetComponents();
const source = { asset: {version:"2.0"}, scene: {rootEntities:["house", "wall", "fence"],background:{mode:0,color:{r:.12,g:.17,b:.21,a:1}}},
  entities:[
    {id:"house",name:"房屋",components:["house-c"],children:["window","door","lamp"]},
    {id:"window",name:"窗户",position:[-2.5,1.2,3],components:["window-c"]},
    {id:"door",name:"门",position:[0,0,3],components:["door-c"]},
    {id:"lamp",name:"墙灯",position:[2.5,2.2,3],components:["lamp-c"]},
    {id:"wall",name:"围墙",position:[-7,0,2],components:["wall-c"]},
    {id:"fence",name:"栅栏",position:[7,0,2],components:["fence-c"]}
  ], components:[
    {id:"house-c",type:"HouseComponent",props:{assets:{$ref:BUILTIN_BUILDING_ASSETS},shape:{$type:"RectangularBuildingShape",width:8,depth:6},height:4,roof:{tip:[0,0],profile:0,height:.3,ridge_length:.5,eave:.2,ridge_direction:0,flat_rim:0,color:0}}},
    {id:"window-c",type:"WindowComponent",props:{seed:generatedDecorationSeed(17,"window-c"),width:1.2,height:1.5}},
    {id:"door-c",type:"DoorComponent",props:{seed:generatedDecorationSeed(17,"door-c"),width:1.2,height:2}},
    {id:"lamp-c",type:"WallLampComponent",props:{seed:generatedDecorationSeed(17,"lamp-c"),width:.4,height:.8,lightIntensity:2,lightColor:1}},
    {id:"wall-c",type:"WallComponent",props:{assets:{$ref:BUILTIN_BUILDING_ASSETS},shape:{$type:"RectangularBuildingShape",width:4,depth:.3},height:1.5}},
    {id:"fence-c",type:"FenceComponent",props:{assets:{$ref:BUILTIN_BUILDING_ASSETS},shape:{$type:"RectangularBuildingShape",width:4,depth:.15},height:1.2}}
  ] };
const acceptanceCase = new URLSearchParams(location.search).get("case");
const projectId = "native-building-extensions-v24"+(acceptanceCase??"")+(new URLSearchParams(location.search).get("run")??"");
const initial: RuntimeProjectPackage = {version:RUNTIME_PROJECT_SAVE_VERSION,
  project:{scene:"Building.scene",files:[{virtualPath:"Building.scene",path:"Building.scene",type:"Scene",dependencies:[BUILTIN_BUILDING_ASSETS]},...builtinBuildingAssetFiles]},
  contents:{"Building.scene":JSON.stringify(source)}};
let engine:WebGLEngine, project:RuntimeProjectSession, editor:RuntimeEditor, scene:Scene, system:BuildingSystem, camera:Camera, picker:SeedWorldPicker;
let busy = false;
let undo: ReturnType<ReturnType<RuntimeEditor["beginEdit"]>["captureUndo"]> | undefined;
async function load() {
  const storage=await RuntimeProjectStorage.open();
  try {if(!await storage.load(projectId))await storage.save(projectId,initial);}finally{storage.close();}
  project=await RuntimeProjectSession.open(projectId,initial.project,location.href);

  engine=await WebGLEngine.create({canvas,shaderCompiler:new ShaderCompiler()});
  engine.canvas.setAutoResolution();
  engine.resourceManager.registerVirtualResources(await project.resources());
  scene=await engine.resourceManager.load<Scene>({type:AssetType.Scene,url:"Building.scene"});
  engine.sceneManager.activeScene=scene; editor=new RuntimeEditor(project,scene);
  camera=scene.createRootEntity("Camera").addComponent(Camera);
  camera.entity.transform.setPosition(0,7,22);camera.entity.transform.lookAt(new Vector3(0,2,0));
  camera.isOrthographic=true;camera.orthographicSize=7;
  const sun=scene.createRootEntity("Sun").addComponent(DirectLight);
  sun.entity.transform.setRotation(-40,-25,0);
  scene.ambientLight.diffuseSolidColor=new Color(.5,.5,.5,1);
  system=BuildingSystem.forScene(scene);
  system.bind({camera,frame:body=>body.entity,resolve:id=>editor.projection.component(id),identity(component){
    const identity=editor.projection.queryComponents().find(i=>editor.projection.component(i.id)===component);
    if(!identity)throw Error("Missing Scene identity");return identity.id;
  }});
  project.registerRuntimeActivation({before:async()=>{},after:async()=>{system.invalidate();await system.flush();}});
  picker=new SeedWorldPicker(camera);await system.flush();engine.run();
  status.textContent="已加载真实主体与装饰组件。";
  document.querySelector<HTMLButtonElement>("#verify")!.disabled=false;
  document.querySelector<HTMLButtonElement>("#reload")!.disabled=false;
  document.querySelector<HTMLButtonElement>("#round")!.disabled=false;
  document.querySelector<HTMLButtonElement>("#surface")!.disabled=false;
  document.querySelector<HTMLButtonElement>("#finish")!.disabled=false;
  document.querySelector<HTMLButtonElement>("#spire")!.disabled=false;
  document.querySelector<HTMLButtonElement>("#dormer")!.disabled=false;
  document.querySelector<HTMLButtonElement>("#opening")!.disabled=false;
}
function dispose(){picker?.dispose();editor?.dispose();project?.dispose();engine?.destroy();}
window.addEventListener("pagehide",dispose,{once:true});
async function reload(){await project.flush();dispose();await load();}
async function mutate(run:(scene:RuntimeSceneEdit)=>void, allowRuntimeErrors=false){
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.run(({draft,edited})=>{run(new RuntimeSceneEdit(draft,"Building.scene"));edited();},false);
  await tx.prepare(signal);await tx.commit();undo=tx.captureUndo();const preview=await tx.activate!(signal).then(() => ({runtimeErrors: [] as string[]})).catch(error => ({runtimeErrors: [String(error)]}));
  if(!allowRuntimeErrors && preview.runtimeErrors.length)throw Error(preview.runtimeErrors.join("\n"));
  return preview;
}
async function restore(){
  if(!undo)throw Error("Missing undo");
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.restoreUndo(undo);await tx.prepare(signal);await tx.commit();await tx.activate!(signal);undo=undefined;
}
const roundShape: BuildingShape = {type:"circle",radius:3};
async function makeRoundHouse(){
  await mutate(d=>{
    d.updateComponent("house-c",{shape:{$type:"CircularBuildingShape",radius:3}});
    d.update("window",{position:buildingWallPosition(roundShape,.65,1.2)});
    d.update("door",{position:buildingWallPosition(roundShape,.75,0)});
    d.update("lamp",{position:buildingWallPosition(roundShape,.85,2.2)});
  });
}
function roundPick(u:number,bottom:number,height:number,id:string){
  const [x,y,z]=buildingWallPosition(roundShape,u,bottom);
  return picksNear(new Vector3(x*1.03,y+height/2,z*1.03),id,.4);
}
const roofPlacement = {rule:{type:"parallel_rows"},unit_id:"wooden_plank",footprint:{width:.5,height:.4375,depth:.1},seed:0};
async function woodRoof() {
  let id=editor.projection.queryComponents({type:"BuildingSurfaceComponent"}).find(record=>{
    const surface=component(record.id) as BuildingSurfaceComponent;
    return surface.entity===component("house-c").entity && surface.role==="roof";
  })?.id;
  await mutate(d=>{
    if(id)d.updateComponent(id,{placement:roofPlacement});
    else id=d.addComponent("house",{type:"BuildingSurfaceComponent",props:{role:"roof",placement:roofPlacement}}).id;
  });
  return id!;
}
async function verifySurfaces(check:(ok:unknown,label:string)=>void) {
  const id=await woodRoof(), creationUndo=undo;
  const surface=component(id) as BuildingSurfaceComponent;
  check(surface instanceof BuildingSurfaceComponent && surface.entity===component("house-c").entity,"表面是建筑 Entity 上的真实 Component");
  check(system.resolve(id)===surface && surface.placement.seed===0,"表面使用 Scene 身份并保留显式种子 0");
  const placed=await surface.inspectPublished();
  check(placed.totalUnits>0 && placed.hiddenUnits===0 && !!placed.sampleRegion,"表面查询读取实际发布的铺设单元");
  const copy=surface.placement;copy.footprint.width=99;
  check(surface.placement.footprint.width===.5,"表面配置 getter 返回副本");
  await mutate(d=>d.updateComponent(id,{regions:[{region:placed.sampleRegion!,effect:{hidden:true}}]}));
  check((await (component(id) as BuildingSurfaceComponent).inspectPublished()).hiddenUnits>0,"局部切除通过组件进入原有铺设发布链路");
  await reload();await frames();
  const restored=component(id) as BuildingSurfaceComponent;
  check(restored.placement.unit_id==="wooden_plank" && (await restored.inspectPublished()).hiddenUnits>0,"新 Engine 从 Scene 恢复表面材料和局部切除");
  const regionCopy=restored.regions;regionCopy[0].region.polygon[0][0]=999;
  check(restored.regions[0].region.polygon[0][0]!==999,"局部编辑 getter 不泄漏可写引用");
  await mutate(d=>d.updateComponent(id,{enabled:false}));
  check(!system.resolve(id) && component(id) instanceof BuildingSurfaceComponent,"禁用表面退出运行集合而保留 Source");
  let rejected=false;try{await (component(id) as BuildingSurfaceComponent).inspectPublished();}catch{rejected=true;}
  check(rejected,"禁用表面不冒充已发布的活动配置");
  check(!!system.resolve("house-c") && picksNear(new Vector3(0,1,3.1),"door-c"),"禁用铺设修改保留建筑主体与门");
  await restore();
  check((await (component(id) as BuildingSurfaceComponent).inspectPublished()).hiddenUnits>0,"撤销禁用恢复表面配置");
  await mutate(d=>d.removeComponent(id));
  check(!component(id) && !!system.resolve("house-c"),"删除表面只移除铺设修改，不删除建筑");
  await restore();check(!!system.resolve(id),"撤销删除恢复真实表面组件");
  undo=creationUndo;await restore();
  check(!component(id) && system.metrics().authoredObjects===6,"撤销创建恢复原始组件集合");
  let wallId="";
  await mutate(d=>{wallId=d.addComponent("house",{type:"BuildingSurfaceComponent",props:{role:"wall",placementEnabled:false}}).id;});
  const wallUndo=undo;
  check((await (component(wallId) as BuildingSurfaceComponent).inspectPublished()).totalUnits===0,"显式关闭墙面铺设保留组件并报告零铺设单元");
  check(picksNear(new Vector3(0,1,3.1),"door-c"),"不铺墙面砖时基础墙体和门仍保持几何与拾取");
  await reload();await frames();
  check(!(component(wallId) as BuildingSurfaceComponent).placementEnabled && (await (component(wallId) as BuildingSurfaceComponent).inspectPublished()).totalUnits===0,"新 Engine 恢复显式关闭的墙面铺设");
  await mutate(d=>d.updateComponent(wallId,{placementEnabled:true}));
  check((await (component(wallId) as BuildingSurfaceComponent).inspectPublished()).totalUnits>0,"重新启用墙面铺设恢复真实材质单元");
  await restore();
  check((await (component(wallId) as BuildingSurfaceComponent).inspectPublished()).totalUnits===0,"撤销启用恢复无墙面铺设状态");
  undo=wallUndo;await restore();
}
async function changeFinish() {
  const window=component("window-c") as WindowComponent;
  await mutate(d=>d.updateComponent("window-c",{type:"window-gothic",woodColor:7,frameMaterial:window.frameMaterial==="wall"?"wood":"wall",lightIntensity:0}));
}
function mountedRenderer(suffix:string) {
  return scene.rootEntities.flatMap(e=>e.getComponentsIncludeChildren(MountedDecorationRenderer,[]))
    .find(r=>r.enabled && r.entity.name.endsWith("/window-c/"+suffix));
}
const frameRenderer=()=>mountedRenderer("frame");
async function nativeContent(path:string) {
  await project.fileProvider().prepare!(path);
  return project.projectPackage.contents[path];
}
async function kitSource() { return JSON.parse(await nativeContent(BUILTIN_BUILDING_ASSETS) as string); }
async function importEditedMeshes(edits:{prefab:string;attribute:string;mutate:(value:number,axis:number)=>number}[]) {
  const changes=await Promise.all(edits.map(async edit=>{
    const source=JSON.parse(await nativeContent(edit.prefab) as string);
    const renderer=source.components.find((c:any)=>c.type==="MeshRenderer");
    const mesh=renderer.props.mesh.$ref;
    const bytes=editNativeMesh(await nativeContent(mesh) as Uint8Array,edit.attribute,edit.mutate);
    const path="Building/Units/Meshes/edit-"+crypto.randomUUID()+".mesh";
    renderer.props.mesh={$ref:path};return {prefab:edit.prefab,source,path,bytes};
  }));
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.run(({draft,edited})=>{
    draft.createBundle(changes.map(({path,bytes})=>({file:{virtualPath:path,path,type:"Mesh"},content:bytes,metadata:{summary:"Native mesh edit acceptance"}})),{},[]);
    for(const change of changes)draft.update(change.prefab,JSON.stringify(change.source));edited();
  },false,changes.map(change=>change.prefab));
  await tx.prepare(signal);await tx.commit();undo=tx.captureUndo();await tx.activate!(signal);await frames();
}
function prefabRootName(assets: import("@galacean/engine").PrefabResource) {
  const entity=assets.instantiate();try{return entity.name;}finally{entity.destroy();}
}
async function verifyStoneGeometryAsset(check:(ok:unknown,label:string)=>void) {
  const previousUndo=undo, before=frameRenderer()!.bounds.clone(), hatBefore=mountedRenderer("hat")!.bounds.clone();
  const previous=(component("house-c") as HouseComponent).assets!;
  const rank=(component("window-c") as WindowComponent).rank;
  const samples=Array.from({length:121},(_,i)=>[
    before.min.x+(before.max.x-before.min.x)*(i%11)/10,
    before.min.y+(before.max.y-before.min.y)*Math.floor(i/11)/10
  ]);
  const query=()=>samples.map(([x,y])=>system.intersectSegment([x,y,before.max.z+3],[x,y,before.min.z-1])?.position[2]??null);
  const originalQuery=query();
  await importEditedMeshes([`stone-frame/window_gothic_${rank}x1`,`window_gothic_${rank}x1_hat`,`window_gothic_${rank}x1_hat_full`].map(name=>({
    prefab:"Building/Units/Prefabs/"+name.replaceAll("/","--")+".prefab",
    attribute:buildingAssets(previous).units[name].attributeLocations[0],mutate:(value:number,axis:number)=>axis===2?value+1:value
  })));
  const changed=frameRenderer()!.bounds.clone(),hatChanged=mountedRenderer("hat")!.bounds.clone();
  (window as any).stoneGeometryMeasurements={frame:{before:[before.min.z,before.max.z],after:[changed.min.z,changed.max.z]},hat:{before:[hatBefore.min.z,hatBefore.max.z],after:[hatChanged.min.z,hatChanged.max.z]}};
  check(changed.max.z>before.max.z+.3 && hatChanged.max.z>hatBefore.max.z+.3,"VFS 石框与石帽顶点修改同步更新实际 Renderer 包围盒");
  check(picksNear(changed.getCenter(new Vector3()),"window-c",.9,frameRenderer()),"新位置的石框 GPU 几何仍独立拾取到窗组件");
  const changedQuery=query();
  check(changedQuery.some((value,i)=>value!==null && (originalQuery[i]===null || value>originalQuery[i]!+.3)),"结构相交查询与新 VFS 石框顶点一起更新");
  check((component("house-c") as HouseComponent).assets!==previous,"网格修改替换资源快照");
  await reload();await frames();
  check(Math.abs(frameRenderer()!.bounds.max.z-changed.max.z)<1e-5 && JSON.stringify(query())===JSON.stringify(changedQuery),"新 Engine 恢复同一石框包围盒与结构查询");
  await restore();await frames();
  check(Math.abs(frameRenderer()!.bounds.max.z-before.max.z)<1e-5 && JSON.stringify(query())===JSON.stringify(originalQuery),"撤销 VFS 网格修改同时恢复渲染范围与结构查询");
  undo=previousUndo;
}
async function verifyFinishes(check:(ok:unknown,label:string)=>void) {
  await mutate(d=>{
    d.updateComponent("window-c",{type:"window-gothic",woodColor:7,frameMaterial:"wall",lightIntensity:0});
    d.updateComponent("door-c",{woodColor:0});
  });
  const initialUndo=undo;
  await settledPresentation();
  let window=component("window-c") as WindowComponent;
  check(window.woodColor===7 && window.lightIntensity===0 && window.frameMaterial==="wall","窗户颜色、墙体框和显式熄灯经 Scene 发布");
  check((component("door-c") as DoorComponent).woodColor===0,"门保留独立木色 0");
  let frame=frameRenderer();check(!!frame,"墙体窗框保留原生材质和独立挂点 Renderer");
  check(picksNear(new Vector3(-2.5,1.95,3.1),"window-c"),"墙体窗框和玻璃仍可拾取到窗组件");
  const before=frame!.bounds.getCenter(new Vector3()), extent=frame!.bounds.getExtent(new Vector3());
  check(picksNear(before,"window-c",.8,frame),"单独墙体框 GPU 拾取也返回窗身份而非房屋");
  const hat=mountedRenderer("hat");check(!!hat,"尖拱窗石帽也保留独立装饰绑定");
  const hatBefore=hat!.bounds.getCenter(new Vector3());
  check(picksNear(hatBefore,"window-c",.8,hat),"单独石帽 GPU 拾取返回窗身份");
  const draws=system.metrics().draws;
  // No flush/frame tick: both picking and bounds must consume the current author matrix.
  window.entity.transform.setPosition(-2,1.2,3);
  const after=frame!.bounds.getCenter(new Vector3());
  check(Math.abs(after.x-before.x-.5)<1e-4,"墙体窗框在没有 Engine tick 时消费窗 Entity 世界矩阵");
  check(frame===frameRenderer() && system.metrics().draws===draws,"移动墙体窗框不重建或拆分 draw");
  check(Math.abs(hat!.bounds.getCenter(new Vector3()).x-hatBefore.x-.5)<1e-4,"窗移动时石帽与窗框消费同一节点位姿");
  check(pickVisibleSingleRenderer(frame!,"window-c"),"未等待重建时墙体窗框 GPU 几何已跟随窗节点");
  const host=component("house-c").entity.transform, hostPosition=host.position.clone();
  host.setPosition(hostPosition.x+1,hostPosition.y,hostPosition.z);
  check(Math.abs(frame!.bounds.getCenter(new Vector3()).x-after.x-1)<1e-4,"整栋移动只对窗框应用一次父级变换");
  host.position=hostPosition;
  window.entity.transform.setScale(1.15,1.1,1);
  const scaled=frame!.bounds.getExtent(new Vector3());
  check(Math.abs(scaled.x/extent.x-1.15)<1e-4 && Math.abs(scaled.y/extent.y-1.1)<1e-4,"墙体窗框包围盒按窗 Entity 实际比例缩放");
  await system.flush();await frames();
  check(picksNear(new Vector3(-2,2,3.1),"window-c"),"移动缩放后墙洞、墙体框和玻璃共同发布");
  await reload();await frames();
  window=component("window-c") as WindowComponent;
  check(window.frameMaterial==="wall" && window.woodColor===7 && window.lightIntensity===0 && !!frameRenderer(),"新 Engine 从 Scene 恢复装饰外观及墙体窗框");
  // Direct preview transforms were not author transactions and must not enter the saved Scene.
  check(window.entity.transform.position.x===-2.5 && window.entity.transform.scale.x===1,"保存不夹带运行时预览变换");
  await makeRoundHouse(); const roundUndo=undo;
  await settledPresentation();
  frame=frameRenderer();check(!!frame && roundPick(.65,1.2,1.5,"window-c"),"圆墙尖拱窗的真实几何可拾取到窗组件");
  check(pickVisibleSingleRenderer(frame!,"window-c"),"圆墙独立墙体窗框保留窗组件身份");
  await mutate(d=>d.update("window",{position:buildingWallPosition(roundShape,.62,1.2),scale:[1.2,1.1,1.2]}));
  await frames();
  check(!!frameRenderer() && roundPick(.62,1.2,1.65,"window-c"),"圆墙移动缩放尖拱窗后窗框与玻璃共同发布");
  const roundHat=mountedRenderer("hat");
  check(!!roundHat && picksNear(roundHat.bounds.getCenter(new Vector3()),"window-c",.8,roundHat),"圆墙缩放后的独立石帽拾取保持窗身份");
  await restore();undo=roundUndo;await restore();
  check((component("house-c") as HouseComponent).shape.type==="rectangle" && !!frameRenderer(),"撤销圆墙和挂点编辑恢复矩形墙体窗框");
  await mutate(d=>d.updateComponent("window-c",{woodColor:null,frameMaterial:null,lightIntensity:null,lightColor:null}));
  check(!frameRenderer() && (component("window-c") as WindowComponent).woodColor===null,"清空覆盖恢复原生木框与宿主继承");
  await restore();check(!!frameRenderer(),"撤销清空恢复墙体窗框");
  await mutate(d=>d.updateComponent("window-c",{enabled:false}));
  check(!frameRenderer() && !system.resolve("window-c"),"禁用窗组件同时移除墙体框与玻璃");
  await restore();check(!!frameRenderer(),"撤销禁用恢复整扇窗");
  await verifyStoneGeometryAsset(check);
  undo=initialUndo;await restore();
  check(!frameRenderer() && (component("window-c") as WindowComponent).frameMaterial===null,"撤销外观编辑恢复原始组件状态");
}
function spireTop() {
  const house=component("house-c").entity;
  // Both distance and detail contain a native decoration batch with this name.
  // The distance batch contains wall attachments; the spire is a separate surface.
  // Inspect the actual fine batch owned directly by this Source body.
  const renderer=house.getComponentsIncludeChildren(MeshRenderer,[])
    .find(r=>r.enabled && r.entity.name==="decorations/house-c" && r.entity.parent?.parent===house);
  if(!renderer)throw Error("Missing resident decoration geometry");
  return renderer.bounds.max.y;
}
/** Read actual resident cut storage, including the first cut of each draw.
 * Placeholder buffers for uncut surfaces have no sampling extent. */
function residentCutRecords() {
  const textures = new Set(scene.rootEntities.flatMap(e => e.getComponentsIncludeChildren(MeshRenderer, []))
    .map(renderer => renderer.getMaterial()?.shaderData.getTexture("decorationWindowCuts"))
    .filter((texture): texture is Texture2D => texture instanceof Texture2D));
  return [...textures].flatMap(texture => {
    if (texture.width * texture.height < 3) return [];
    const words = new Uint32Array(texture.width * texture.height * 4);
    texture.getPixelBuffer(words);
    const floats = new Float32Array(words.buffer);
    if (!(floats[8] > floats[6] && floats[9] > floats[7])) return [];
    return [{layer:words[3] >>> 8,bounds:[...floats.slice(6,10)],scale:[floats[10] || 1,floats[11] || 1]}];
  }).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
async function verifyWindowCutAsset(check:(ok:unknown,label:string)=>void) {
  const previousUndo=undo;
  await mutate(d=>d.updateComponent("house-c",{wallMaterial:1}));
  const materialUndo=undo;
  await frames();
  const previousAssets=(component("house-c") as HouseComponent).assets!;
  const before=residentCutRecords();
  check(before.length>0,"木墙真实驻留 GPU 包含窗洞记录");
  const original=JSON.stringify(buildingAssets(previousAssets).compilation.windowCuts);
  const source=await kitSource(),library=source.components.find((c:any)=>c.type==="BuildingAssetKitComponent").props;
  for(const layer of library.windowCuts.layers) {
    layer.layer=(layer.layer+1)%library.windowCuts.layers.length;
    layer.bounds.min=[layer.bounds.min[0]*1.25,layer.bounds.min[1]];
    layer.bounds.max=[layer.bounds.max[0]*1.25,layer.bounds.max[1]];
  }
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.run(({draft,edited})=>{draft.update(BUILTIN_BUILDING_ASSETS,JSON.stringify(source));edited();},false,[BUILTIN_BUILDING_ASSETS]);
  await tx.prepare(signal);await tx.commit();undo=tx.captureUndo();await tx.activate!(signal);await frames();
  const replacement=(component("house-c") as HouseComponent).assets!;
  check(replacement!==previousAssets,"窗洞资产替换发布新的组件资源快照");
  check(JSON.stringify(buildingAssets(previousAssets).compilation.windowCuts)===original,"替换不改写旧资产快照");
  const after=residentCutRecords();
  check(after.length>0 && JSON.stringify(after)!==JSON.stringify(before),"VFS 窗洞编辑经 Worker 改变实际 GPU 记录");
  check(after.every(record=>{
    const layer=library.windowCuts.layers.find((layer:any)=>layer.layer===record.layer);
    return layer && [...layer.bounds.min,...layer.bounds.max].every((value,i)=>
      Math.abs(record.bounds[i]-Math.fround(Math.fround(value)*record.scale[i%2]))<1e-6);
  }),"GPU 采样范围及图层编号与修改后的 VFS 元数据一致");
  await reload();await frames();
  check(JSON.stringify(residentCutRecords())===JSON.stringify(after),"新 Engine 从保存的 VFS 恢复同一窗洞 GPU 数据");
  await restore();await frames();
  check(JSON.stringify(residentCutRecords())===JSON.stringify(before),"撤销资产修改恢复原始窗洞 GPU 数据");
  undo=materialUndo;await restore();undo=previousUndo;
}
async function raiseSpire() {
  const source=await kitSource(),kit=source.components.find((c:any)=>c.type==="BuildingAssetKitComponent").props;
  const bytes=editNativeMesh(await nativeContent(kit.roofSpireMesh.$ref) as Uint8Array,"POSITION",(v,axis)=>axis===1?v*1.5:v);
  const path="Building/Units/Meshes/spire-"+crypto.randomUUID()+".mesh";kit.roofSpireMesh={$ref:path};
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.run(({draft,edited})=>{
    draft.createBundle([{file:{virtualPath:path,path,type:"Mesh"},content:bytes,metadata:{summary:"Native spire mesh edit"}}],{},[]);
    draft.update(BUILTIN_BUILDING_ASSETS,JSON.stringify(source));edited();
  },false,[BUILTIN_BUILDING_ASSETS]);
  await tx.prepare(signal);await tx.commit();undo=tx.captureUndo();await tx.activate!(signal);
}

async function verifyAssemblyPrefab(check:(ok:unknown,label:string)=>void) {
  const path="Building/Units/Prefabs/wall-lantern.prefab", previousUndo=undo;
  const original=JSON.parse(await nativeContent(path) as string);
  const asset=()=>buildingAssets((component("house-c") as HouseComponent).assets!);
  const before=asset(), source=structuredClone(original);
  source.entities[0].children=["mount"];
  source.entities.push({id:"mount",name:"mount",position:[.2,.1,0],rotation:[0,0,15],scale:[1.1,.9,1],children:["body","light","bracket"]});
  source.entities.push({id:"bracket",name:"bracket",position:[-.3,0,0],components:["bracket-unit","bracket-renderer"]});
  for(const id of ["body-unit","body-renderer"]){const value=structuredClone(source.components.find((c:any)=>c.id===id));value.id=id.replace("body","bracket");source.components.push(value);}
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.run(({draft,edited})=>{draft.update(path,JSON.stringify(source));edited();},false,[path]);
  await tx.prepare(signal);await tx.commit();undo=tx.captureUndo();await tx.activate!(signal);await settledPresentation();
  const selected=asset().compilation.decorations.assemblies!["wall-lantern/1"].selected;
  check(selected.length===3 && selected[2][1]==="mount/bracket","添加 Prefab 子节点直接成为第三个灯具零件");
  check(selected[1][3]![0]!==0 && selected[1][3]![1]!==0,"子节点累计变换驱动发光中心");
  check(asset()!==before && before.compilation.decorations.assemblies!["wall-lantern/1"].selected.length===2,"组合编辑替换快照且不污染旧资源");
  check(picksNear(new Vector3(2.5,2.6,3.3),"lamp-c",.9),"组合 Prefab 经 Worker 生成后仍拾取为同一盏灯");
  // Compare the authored assembly and decoded geometry, not async resource-map
  // insertion order (or ArrayBuffers, which JSON.stringify would erase).
  const snapshot=()=>{
    const geometry=asset().compilation.decorations,assembly=geometry.assemblies!["wall-lantern/1"];
    return JSON.stringify({assembly,parts:assembly.selected.map(([name])=>decorationMesh(geometry,name))});
  };
  const expected=snapshot();
  await reload();await settledPresentation();
  check(snapshot()===expected,"新 Engine 从保存 VFS 恢复组合、节点变换和几何");
  await restore();await settledPresentation();
  check(asset().compilation.decorations.assemblies!["wall-lantern/1"].selected.length===2,"撤销恢复两个原始零件");
  const invalid=structuredClone(original);invalid.entities.find((e:any)=>e.id==="light").scale=[1,0,1];
  const bad=editor.beginEdit(crypto.randomUUID(),signal), revision=project.publicationRevision;
  await bad.run(({draft,edited})=>{draft.update(path,JSON.stringify(invalid));edited();},false,[path]);
  await bad.prepare(signal);await bad.commit();undo=bad.captureUndo();const badPreview=await bad.activate!(signal).then(() => ({runtimeErrors: [] as string[]})).catch(error => ({runtimeErrors: [String(error)]}));
  check(badPreview.runtimeErrors.length>0 && project.publicationRevision>revision,"退化子节点允许保存，并报告建筑预览错误");
  await restore();await settledPresentation();
  undo=previousUndo;
}
async function verifyWindowAssemblyPrefab(check:(ok:unknown,label:string)=>void) {
  const previousUndo=undo;
  await mutate(d=>d.updateComponent("window-c",{type:"window-gothic",rank:1,frameMaterial:"wall"}));
  const windowUndo=undo, path="Building/Units/Prefabs/window-gothic-1.prefab";
  const original=JSON.parse(await nativeContent(path) as string), source=structuredClone(original);
  source.entities[0].children=["mount"];
  source.entities.push({id:"mount",name:"mount",position:[.03,.02,0],children:["frame","glass","accent"]});
  source.entities.find((e:any)=>e.id==="frame").name="stone-or-wood";
  source.entities.find((e:any)=>e.id==="glass").name="pane";
  source.entities.push({id:"accent",name:"accent",position:[0,.1,.02],scale:[.3,.3,.3],components:["accent-unit","accent-renderer"]});
  for(const id of ["frame-unit","frame-renderer"]){
    const c=structuredClone(source.components.find((c:any)=>c.id===id));c.id=id.replace("frame","accent");
    if(c.type==="BuildingUnitComponent"){c.props.attachment="body";delete c.props.stoneFrame;}
    source.components.push(c);
  }
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.run(({draft,edited})=>{draft.update(path,JSON.stringify(source));edited();},false,[path]);
  await tx.prepare(signal);await tx.commit();undo=tx.captureUndo();await tx.activate!(signal);await settledPresentation();
  const assembly=()=>buildingAssets((component("house-c") as HouseComponent).assets!).compilation.decorations.assemblies!["window-gothic/1"];
  check(assembly().selected.length===3,"窗户 Prefab 新增零件由实际层级决定");
  check(assembly().selected[0][1]==="mount/stone-or-wood" && assembly().selected[0][4]?.role==="frame","窗框改名和嵌套不改变石框能力");
  check(!!assembly().selected[0][4]?.stoneTemplate,"石框替代资源来自 Prefab 引用");
  check(system.metrics().errors.length===0 && picksNear(new Vector3(-2.5,2,3.15),"window-c",.9),"修改后的组合经 Worker 编译后仍按窗户拾取");
  const expected=JSON.stringify(assembly());
  await reload();await settledPresentation();
  check(JSON.stringify(assembly())===expected && system.metrics().errors.length===0,"新 Engine 恢复窗组合、石框引用与节点位姿");
  await restore();await settledPresentation();
  check(assembly().selected.length===2 && assembly().selected[0][1]==="frame","撤销恢复原始窗组合");
  const bad=structuredClone(original);bad.components.find((c:any)=>c.id==="frame-unit").props.stoneFrame={$ref:"Building/Units/Prefabs/brick.prefab"};
  const invalid=editor.beginEdit(crypto.randomUUID(),signal), revision=project.publicationRevision;
  await invalid.run(({draft,edited})=>{draft.update(path,JSON.stringify(bad));edited();},false,[path]);
  await invalid.prepare(signal);await invalid.commit();undo=invalid.captureUndo();const invalidPreview=await invalid.activate!(signal).then(() => ({runtimeErrors: [] as string[]})).catch(error => ({runtimeErrors: [String(error)]}));
  check(invalidPreview.runtimeErrors.length>0 && project.publicationRevision>revision,"错误石框保存成功，建筑预览单独报错");
  await restore();await settledPresentation();
  undo=windowUndo;await restore();await settledPresentation();undo=previousUndo;
}
async function verifyDecorationMaterial(check:(ok:unknown,label:string)=>void) {
  const previousUndo=undo;
  const unitPath="Building/Units/Prefabs/wall-lantern.prefab";
  const unit=JSON.parse(await nativeContent(unitPath) as string);
  const renderer=unit.components.find((c:any)=>c.type==="MeshRenderer");
  const materialCall=renderer.calls.find((c:any)=>c.method==="setMaterial");
  const material=JSON.parse(await nativeContent(materialCall.args[0].$ref) as string);
  const shader=JSON.parse(await nativeContent(material.shaderRef.url) as string);
  const fragment=shader.subShaders[0].passes[0].fragmentShaderInstructions[0];
  fragment[1]=fragment[1].replace(/}\s*$/,"residentColor.rgb=vec3(0.0,1.0,0.0); }\n");
  const prefix="Building/Units/lantern-"+crypto.randomUUID(),materialPath=prefix+".mat",shaderPath=prefix+".shaderc";
  material.shaderRef={url:shaderPath};materialCall.args[0]={$ref:materialPath};
  const greenPixels=()=>{
    engine.update();
    const gl=canvas.getContext("webgl2")!,pixels=new Uint8Array(canvas.width*canvas.height*4);
    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]>pixels[i]+80 && pixels[i+1]>pixels[i+2]+80)count++;
    return count;
  };
  await settledPresentation();const before=greenPixels();
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.run(({draft,edited})=>{
    draft.createBundle([{file:{virtualPath:shaderPath,path:shaderPath,type:"Shader"},content:JSON.stringify(shader),metadata:{summary:"Native lamp shader edit"}},
      {file:{virtualPath:materialPath,path:materialPath,type:"Material"},content:JSON.stringify(material),metadata:{summary:"Native lamp material edit"}}],{},[]);
    draft.update(unitPath,JSON.stringify(unit));edited();
  },false,[unitPath]);
  await tx.prepare(signal);await tx.commit();undo=tx.captureUndo();await tx.activate!(signal);await settledPresentation();
  const assets=buildingAssets((component("house-c") as HouseComponent).assets!);
  check(assets.decorations["wall-lantern/1/body"].material!==assets.decorationMaterial && Object.entries(assets.decorations).every(([name,unit])=>name==="wall-lantern/1/body"||unit.material===assets.decorationMaterial),"单个灯具 Prefab 材质替换不改动其他装饰材质");
  check(greenPixels()>before+10,"原生灯具 Material/Shader 修改改变实际 GPU 像素");
  check(picksNear(new Vector3(2.5,2.6,3.3),"lamp-c",.9),"按材质拆分合批后灯具仍独立拾取");
  await reload();await settledPresentation();
  check(greenPixels()>before+10,"新 Engine 恢复原生灯具材质的实际像素");
  await restore();await settledPresentation();
  check(greenPixels()<=before+10,"撤销材质替换恢复灯具原始像素");
  undo=previousUndo;
}
async function verifyMeshAsset(check:(ok:unknown,label:string)=>void) {
  const previousUndo=undo, previous=(component("house-c") as HouseComponent).assets!;
  // Lamps remain merged with ordinary decorations. Observe the real resident
  // batch bounds, and use its per-object pick slot to identify the lamp.
  const lamp=()=>component("house-c").entity.getComponentsIncludeChildren(MeshRenderer,[])
    .find(r=>r.enabled && r.entity.isActiveInHierarchy && r.entity.name==="decorations/house-c" && r.entity.parent?.parent===component("house-c").entity)!;
  const before=lamp().bounds.clone(), originalBounds=JSON.stringify(buildingAssets(previous).compilation.decorations.meshes["wall-lantern/1/body"].bounds);
  await importEditedMeshes([{prefab:"Building/Units/Prefabs/wall-lantern.prefab",attribute:"Vertex_Position",mutate:(value,axis)=>axis===2?value+1:value}]);
  const after=lamp().bounds.clone();
  (window as any).decorationMeshMeasurements={before:[before.min.z,before.max.z],after:[after.min.z,after.max.z]};
  check(after.max.z>before.max.z+.3,"VFS 灯具顶点经 Worker 改变实际渲染网格");
  check(picksNear(new Vector3(2.5,2.75,after.max.z),"lamp-c",.9,lamp()),"新位置灯具 GPU 拾取仍解析到灯组件");
  check((component("house-c") as HouseComponent).assets!==previous && JSON.stringify(buildingAssets(previous).compilation.decorations.meshes["wall-lantern/1/body"].bounds)===originalBounds,"装饰网格编辑保留旧资源快照");
  await reload();await frames();
  check(Math.abs(lamp().bounds.max.z-after.max.z)<1e-5,"新 Engine 从保存 VFS 恢复灯具顶点");
  await restore();await frames();
  check(Math.abs(lamp().bounds.max.z-before.max.z)<1e-5,"撤销 VFS 网格修改恢复灯具原形状");
  undo=previousUndo;
}

async function verifyCollisionAsset(check:(ok:unknown,label:string)=>void) {
  const previousUndo=undo, previous=(component("house-c") as HouseComponent).assets!;
  const source=await kitSource(),library=source.components.find((c:any)=>c.type==="BuildingAssetKitComponent").props;
  const original=JSON.stringify(buildingAssets(previous).compilation.decorationCollisions);
  const samples=Array.from({length:57},(_,i)=>-1.4+i*.05);
  const query=()=>samples.map(x=>system.intersectSegment([x,1,3.6],[x,1,2.4])?.fraction??null);
  const before=query();
  const collision=library.decorationCollisions.balcony_door_rank1_collision;
  collision.min[0]*=2;collision.max[0]*=2;
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.run(({draft,edited})=>{draft.update(BUILTIN_BUILDING_ASSETS,JSON.stringify(source));edited();},false,[BUILTIN_BUILDING_ASSETS]);
  await tx.prepare(signal);await tx.commit();undo=tx.captureUndo();await tx.activate!(signal);await frames();
  const after=query(), newOpening=samples.filter((_,i)=>before[i]!==null && after[i]===null);
  (window as any).collisionGeometryMeasurements={before,after,newOpening};
  check(newOpening.length>=4,"VFS 门安装碰撞宽度经 Worker 扩大真实发布墙洞");
  check(picksNear(new Vector3(0,1,3.1),"door-c"),"碰撞资产编辑后门仍使用独立组件身份拾取");
  check((component("house-c") as HouseComponent).assets!==previous && JSON.stringify(buildingAssets(previous).compilation.decorationCollisions)===original,"碰撞资产替换保留旧快照不变");
  await reload();await frames();
  check(JSON.stringify(query())===JSON.stringify(after),"新 Engine 从保存的 VFS 恢复同一门洞结构");
  await restore();await frames();
  check(JSON.stringify(query())===JSON.stringify(before),"撤销碰撞资产修改恢复原墙洞结构");
  undo=previousUndo;
}

async function verifySpireAsset(check:(ok:unknown,label:string)=>void) {
  const previousUndo=undo, before=spireTop();
  const previousAssets=(component("house-c") as HouseComponent).assets!;
  await raiseSpire();
  const changed=spireTop();
  check(changed>before+.3,"VFS 饰尖顶点修改进入 Worker 并改变实际驻留网格高度");
  check((component("house-c") as HouseComponent).assets!==previousAssets,"饰尖编辑使用新的不可变资产快照");
  await reload();await frames();
  check(Math.abs(spireTop()-changed)<1e-5,"新 Engine 从 VFS 恢复修改后的饰尖几何");
  await restore();await frames();
  check(Math.abs(spireTop()-before)<1e-5,"撤销 VFS 编辑恢复原始饰尖几何");
  undo=previousUndo;
}

async function addRoofWindow() {
  let id="", entity="";
  const recipe=constructionDecorationRecipe(buildingAssets((component("house-c") as HouseComponent).assets!).compilation.decorations,"dormer-gothic",1)!;
  await mutate(d=>{
    entity=d.create({name:"屋顶尖拱窗",parentEntityId:"house"}).id;
    id=d.addComponent(entity,{type:"RoofWindowComponent",props:{type:"dormer-gothic",uv:[.02,.5],rank:1,
      width:recipe.installationSize[0],height:recipe.installationSize[1],woodColor:0,lightIntensity:0}}).id;
  });
  return {id,entity};
}
function hasRoofDraw(id:string) {
  let found=false;system.visitPickBatches(batch=>{for(let slot=0;slot<batch.count;slot++)if(batch.resolve(slot)===id)found=true;});return found;
}
function focusRoofWindow(id:string):boolean {
  const window=system.resolve(id);
  if(!(window instanceof RoofWindowComponent))return false;
  const view=system.roofWindowView(window);if(!view)return false;
  const {position:mount,forward}=view,eye=mount.clone();
  eye.x+=forward.x*18;eye.y+=5;eye.z+=forward.z*18;
  camera.entity.transform.position=eye;camera.entity.transform.lookAt(mount);
  engine.update();
  return true;
}
function pickRoofPart(id:string, roof:boolean) {
  const cameraPosition=camera.entity.transform.position.clone();
  const cameraRotation=camera.entity.transform.rotationQuaternion.clone();
  if(!focusRoofWindow(id))return false;
  // Keep all scene batches so the host continues to occlude hidden geometry.
  try {return pickVisibleAttachment(id,roof?"small-roof":"body");}
  finally {
    camera.entity.transform.position=cameraPosition;
    camera.entity.transform.rotationQuaternion=cameraRotation;
    engine.update();
  }
}
async function verifyRoofWindows(check:(ok:unknown,label:string)=>void) {
  const {id,entity}=await addRoofWindow(), creationUndo=undo;
  await frames();
  let dormer=component(id) as RoofWindowComponent;
  check(dormer instanceof RoofWindowComponent && dormer instanceof DecorationComponent,"屋顶窗是独立 Entity 上的真实装饰 Component");
  check(dormer.entity.parent===component("house-c").entity,"屋顶窗直接归属房屋 Entity");
  check(pickRoofPart(id,false),"屋顶窗框和玻璃 GPU 拾取返回屋顶窗组件");
  check(pickRoofPart(id,true),"屋顶窗的小屋顶 GPU 拾取也返回同一组件");
  const width=dormer.width,height=dormer.height;
  const copy=dormer.uv;copy[0]=1;
  check(Math.abs(dormer.uv[0]-.02)<1e-6,"屋顶挂点读取副本不能绕过组件修改");
  await mutate(d=>d.updateComponent(id,{uv:[.02,.55],rank:2,width:width*.9,height:height*.9,woodColor:4,lightIntensity:2}));
  await frames();
  check(pickRoofPart(id,false)&&pickRoofPart(id,true),"修改屋顶挂点和规格后窗体及小屋顶身份一致");
  await reload();await frames();
  dormer=component(id) as RoofWindowComponent;
  check(dormer.type==="dormer-gothic" && dormer.rank===2 && dormer.width===width*.9 && dormer.height===height*.9 && dormer.woodColor===4 && dormer.lightIntensity===2 && Math.abs(dormer.uv[1]-.55)<1e-6,"新 Engine 从 Scene 恢复屋顶窗全部参数");
  check(pickRoofPart(id,false)&&pickRoofPart(id,true),"保存重载保持屋顶窗全部几何的独立拾取");
  await restore();await frames();
  dormer=component(id) as RoofWindowComponent;
  check(dormer.rank===1&&dormer.width===width&&dormer.height===height&&dormer.woodColor===0&&dormer.lightIntensity===0,"撤销恢复尺寸、显式颜色零与发光零");
  await mutate(d=>d.updateComponent(id,{enabled:false}));
  check(!system.resolve(id)&&!hasRoofDraw(id),"禁用屋顶窗同时移除窗体、小屋顶和运行身份");
  await restore();await frames();
  check(pickRoofPart(id,false)&&pickRoofPart(id,true),"撤销禁用恢复完整屋顶窗");
  const slopedRoof=(component("house-c") as HouseComponent).roof;
  const sourceBefore=project.projectPackage.contents["Building.scene"], revisionBefore=project.publicationRevision;
  const failedPreview=await mutate(d=>{
    d.updateComponent("house-c",{roof:{...slopedRoof,height:0}});
    d.update("lamp",{position:[2.5,2,3]});
  },true);
  check(failedPreview.runtimeErrors.some(error=>error.includes("could not be placed")),"平屋顶保留启用窗户时明确报告预览安装错误");
  check(project.projectPackage.contents["Building.scene"]!==sourceBefore && project.publicationRevision>revisionBefore,
    "预览失败仍保存作者修改并推进项目版本");
  check(component(id).enabled && component("lamp-c").entity.transform.position.x===2.5,
    "不回滚同一事务内的窗户及灯的位置修改");
  await restore();await frames();
  check(pickRoofPart(id,false)&&pickRoofPart(id,true),"显式撤销后原窗体和小屋顶恢复拾取");
  // A pitched-roof window cannot remain active on a flat host. Disable it
  // explicitly in the same edit, preserving the authored object for undo.
  await mutate(d=>{
    d.updateComponent(id,{enabled:false});
    d.updateComponent("house-c",{roof:{...slopedRoof,height:0}});
    d.update("lamp",{position:[2.5,2,3]});
  });
  check(component(id) instanceof RoofWindowComponent && !component(id).enabled && !system.resolve(id)&&!hasRoofDraw(id),
    "禁用屋顶窗后可改为平屋顶，并保留原窗户组件");
  await restore();await frames();
  check(pickRoofPart(id,false)&&pickRoofPart(id,true),"撤销恢复坡屋顶、启用状态和完整屋顶窗");
  await makeRoundHouse();await frames();
  check(pickRoofPart(id,false)&&pickRoofPart(id,true),"圆房上的屋顶窗与小屋顶均可独立拾取");
  await restore();await frames();
  check(pickRoofPart(id,false)&&pickRoofPart(id,true),"撤销圆房恢复矩形屋顶的附件挂点");
  const before=component("house-c").entity.transform.position.clone();
  component("house-c").entity.transform.setPosition(before.x+1,before.y,before.z);
  await system.flush();await frames();
  check(pickRoofPart(id,false)&&pickRoofPart(id,true),"整栋移动后屋顶窗和小屋顶共同跟随且可拾取");
  component("house-c").entity.transform.position=before;
  await system.flush();
  await mutate(d=>d.delete(entity));
  check(!system.resolve(id)&&!hasRoofDraw(id),"删除屋顶窗 Entity 清理装饰身份和全部渲染部件");
  await restore();await frames();
  check(pickRoofPart(id,false)&&pickRoofPart(id,true),"撤销删除从 Scene 恢复完整屋顶窗");
  undo=creationUndo;await restore();
  check(!system.resolve(id),"撤销创建恢复原始建筑组件集合");
}

/** Read the real ID framebuffer, then validate a visible pixel via public pick().
 * Keep full-scene depth so a hidden attachment cannot pass this check. */
function pickVisibleAttachment(id:string, part:"any"|"body"|"small-roof"="any") {
  const batches:SeedWorldPickBatch[]=[];
  system.visitPickBatches(batch=>{
    if(!(batch.renderer.entity.layer & camera.cullingMask) || batch.count<=0)return;
    batches.push(batch);
  });
  const ids=new Map<number,string>();let base=1;
  for(const batch of batches){
    const roof=batch.renderer.entity.name.startsWith("generic-");
    const matchesPart=part==="any"||(part==="small-roof"?roof:!roof);
    for(let slot=0;slot<batch.count;slot++)if(matchesPart&&batch.resolve(slot)===id)ids.set(base+slot,id);
    base+=batch.count;
  }
  if(!ids.size)return false;
  const visit:SeedWorldPickSource=visitor=>batches.forEach(visitor);
  if(picker.pick(0,0,visit)!==undefined)throw Error("Expected empty pick corner");
  const {width,height}=engine.canvas,pixels=new Uint8Array(width*height*4);
  (picker as unknown as {texture:Texture2D}).texture.getPixelBuffer(0,0,width,height,pixels);
  for(let i=0;i<pixels.length;i+=4){
    const value=pixels[i]+pixels[i+1]*256+pixels[i+2]*65536;
    if(ids.has(value))return picker.pick((i/4)%width+.5,Math.floor(i/4/width)+.5,visit)===id;
  }
  return false;
}
async function verifyAdditionalRoofDecorations(check:(ok:unknown,label:string)=>void) {
  const originalPosition=camera.entity.transform.position.clone(),originalRotation=camera.entity.transform.rotationQuaternion.clone();
  camera.entity.transform.setPosition(-10,13,18);camera.entity.transform.lookAt(new Vector3(0,4,0));
  const originalSize=camera.orthographicSize;camera.orthographicSize=8;
  try {
    for(const type of ["hatch-cottage","hatch-gothic","roof-lantern","dormer-cottage","dormer-gothic"]){
      const pitched=type.startsWith("dormer-"),lamp=type==="roof-lantern";
      const componentType=pitched?"RoofWindowComponent":lamp?"RoofLampComponent":"RoofHatchComponent";
      const recipe=constructionDecorationRecipe(buildingAssets((component("house-c") as HouseComponent).assets!).compilation.decorations,type,1)!;
      let id="",entity="";
      await mutate(d=>{
        d.updateComponent("house-c",{height:6,shape:{$type:"RectangularBuildingShape",width:10,depth:8},
          roof:{tip:[0,0],profile:.7,height:pitched?.9:0,ridge_length:.35,eave:.3,ridge_direction:0,flat_rim:0,color:2}});
        // Keep existing wall attachments on the resized host and isolate roof light evidence.
        d.update("window",{position:[-2.5,1.2,4]});d.update("door",{position:[0,0,4]});d.update("lamp",{position:[2.5,2.2,4]});
        d.updateComponent("lamp-c",{enabled:false});
        entity=d.create({name:type,parentEntityId:"house"}).id;
        id=d.addComponent(entity,{type:componentType,props:{type,uv:pitched?[.02,.5]:[.5,.5],elevation:0,
          width:recipe.installationSize[0],height:recipe.installationSize[1],...(lamp?{lightIntensity:2}: {})}}).id;
      });
      const creationUndo=undo;await settledPresentation();
      const attachment=component(id) as RoofDecorationComponent;
      check(attachment instanceof RoofDecorationComponent && attachment instanceof DecorationComponent,`${type}: 原生屋顶装饰生命周期`);
      check(pitched?attachment instanceof RoofWindowComponent:lamp?attachment instanceof RoofLampComponent:attachment instanceof RoofHatchComponent,`${type}: Scene 加载具体组件类型`);
      check(attachment.entity.parent===component("house-c").entity,`${type}: 装饰 Entity 直接归属房屋`);
      const uv=attachment.uv;uv[0]=.99;check(attachment.uv[0]!==.99,`${type}: 挂点读取不泄漏可写状态`);
      const visible=()=>pickVisibleAttachment(id);
      // Roof charts span both slopes; inspect from the opposite side if the host occludes this mount.
      if(!visible()){camera.entity.transform.setPosition(-10,13,-18);camera.entity.transform.lookAt(new Vector3(0,4,0));await frames(2);}
      check(visible(),`${type}: 实际可见几何 GPU 拾取返回装饰组件`);
      if(pitched)check(pickVisibleAttachment(id,"small-roof"),`${type}: 小屋顶瓦片 GPU 拾取返回同一组件`);
      if(lamp)check(!!light(),`${type}: 派生 PointLight 实际启用`);
      let rejected=false;try{attachment.uv=[2,.5];}catch{rejected=true;}
      check(rejected,`${type}: 非法挂点被组件拒绝`);
      const nextUV=pitched?[.02,.55]:[.6,.5];
      await mutate(d=>d.updateComponent(id,{uv:nextUV,elevation:lamp?.15:0}));await settledPresentation();
      check((component(id) as RoofDecorationComponent).uv[1]===nextUV[1]&&visible(),`${type}: 修改挂点后发布新几何及拾取`);
      await reload();await settledPresentation();
      camera.entity.transform.setPosition(-10,13,-18);camera.entity.transform.lookAt(new Vector3(0,4,0));camera.orthographicSize=8;await frames(2);
      check(component(id) instanceof RoofDecorationComponent && (component(id) as RoofDecorationComponent).uv[0]===nextUV[0],`${type}: 新 Engine 从 Scene 恢复挂点`);
      check(hasRoofDraw(id),`${type}: 重载重新发布装饰渲染身份`);
      if(!visible()){camera.entity.transform.setPosition(-10,13,18);camera.entity.transform.lookAt(new Vector3(0,4,0));await frames(2);}
      check(visible(),`${type}: 新 Engine 重载后的实际 GPU 拾取`);
      await restore();await settledPresentation();
      check((component(id) as RoofDecorationComponent).uv[0]===(pitched?.02:.5),`${type}: 撤销恢复原挂点`);
      await mutate(d=>d.updateComponent(id,{width:recipe.installationSize[0]*1.1,height:recipe.installationSize[1]*1.1}));await settledPresentation();
      check((component(id) as RoofDecorationComponent).width===recipe.installationSize[0]*1.1&&visible(),`${type}: 尺寸编辑发布可拾取的新几何`);
      await restore();await settledPresentation();
      await mutate(d=>d.updateComponent(id,{enabled:false}));
      check(!system.resolve(id)&&!hasRoofDraw(id),`${type}: 禁用退出运行集合并移除绘制`);
      if(lamp)check(!light(),`${type}: 禁用回收实际照明`);
      await restore();await settledPresentation();check(!!system.resolve(id)&&hasRoofDraw(id),`${type}: 撤销禁用恢复`);
      await mutate(d=>d.delete(entity));check(!component(id)&&!hasRoofDraw(id),`${type}: 删除清理组件及派生渲染`);
      await restore();await settledPresentation();check(!!component(id)&&hasRoofDraw(id),`${type}: 撤销删除重建`);
      undo=creationUndo;await restore();await settledPresentation();
      camera.entity.transform.setPosition(-10,13,18);camera.entity.transform.lookAt(new Vector3(0,4,0));camera.orthographicSize=8;
    }
  } finally {camera.entity.transform.position=originalPosition;camera.entity.transform.rotationQuaternion=originalRotation;camera.orthographicSize=originalSize;}
}

async function verifyOpenings(check:(ok:unknown,label:string)=>void) {
  for(const material of [0,1]) {
    let id="",backId="",entity="",wallSurfaceId="";
    await mutate(d=>{
      d.updateComponent("house-c",{height:6,wallMaterial:material});
      wallSurfaceId=d.addComponent("house",{type:"BuildingSurfaceComponent",props:{role:"wall",placement:{rule:{type:"auto"},unit_id:material?"wooden_plank":"brick",footprint:{width:.5,height:.4375,depth:.1},seed:0}}}).id;
      for(const old of ["window-c","door-c","lamp-c"])d.updateComponent(old,{enabled:false});
      entity=d.create({name:material?"木拱洞口":"石拱洞口",parentEntityId:"house",position:[0,0,3]}).id;
      id=d.addComponent(entity,{type:"OpeningComponent",props:{width:2.8,height:2.8,seed:0}}).id;
      const back=d.create({name:"背面独立拱洞",parentEntityId:"house",position:[0,0,-3]}).id;
      backId=d.addComponent(back,{type:"OpeningComponent",props:{width:2.8,height:2.8,seed:17}}).id;
    });
    const creationUndo=undo;await settledPresentation();
    const name=material?"木拱":"石拱";
    const hole=(x=0)=>!system.intersectSegment([x,1,4],[x,1,2]);
    check(component(id) instanceof OpeningComponent && component(id) instanceof DecorationComponent,`${name}: 拱洞是独立装饰组件`);
    check(component(id).entity.parent===component("house-c").entity,`${name}: Entity 归属房屋`);
    check(hole(),`${name}: 实际墙面结构在洞口可穿过`);
    check(pickVisibleAttachment(id),`${name}: 可见拱框 GPU 拾取返回拱洞组件`);
    camera.entity.transform.setPosition(0,7,-22);camera.entity.transform.lookAt(new Vector3(0,2,0));await frames(2);
    check(pickVisibleAttachment(backId),`${name}: 同屋第二个拱洞独立拾取`);
    camera.entity.transform.setPosition(0,7,22);camera.entity.transform.lookAt(new Vector3(0,2,0));await frames(2);
    for(const x of [.4,.8]){
      await mutate(d=>d.update(entity,{position:[x,0,3]}));await settledPresentation();
      check(hole(x)&&pickVisibleAttachment(id),`${name}: 连续移动 ${x} 后墙洞及拾取更新`);
    }
    await mutate(d=>d.updateComponent(id,{width:3,height:3,seed:9}));await settledPresentation();
    check(hole(.8)&&(component(id) as OpeningComponent).width===3&&pickVisibleAttachment(id),`${name}: 尺寸及种子经组件发布`);
    await reload();await settledPresentation();
    check((component(id) as OpeningComponent).seed===9 && component(id).entity.transform.position.x===.8,`${name}: 新 Engine 从 Scene 恢复参数和位姿`);
    check(hole(.8)&&pickVisibleAttachment(id),`${name}: 重载保留真实墙洞及 GPU 拾取`);
    await restore();await settledPresentation();check((component(id) as OpeningComponent).width===2.8,`${name}: 撤销尺寸修改`);
    await mutate(d=>d.updateComponent(wallSurfaceId,{placementEnabled:false}));await settledPresentation();
    check(hole(.8)&&pickVisibleAttachment(id),`${name}: 无墙面铺设绑定时拱框仍可见可拾取`);
    await restore();await settledPresentation();
    if(material===0){
      await mutate(d=>d.updateComponent(wallSurfaceId,{regions:[{region:{space:"surface_uv",polygon:[[-1,-10],[100,-10],[100,10],[-1,10]]},effect:{hidden:true}}]}));await settledPresentation();
      check(!!system.resolve(id)&&hole(.8)&&!pickVisibleAttachment(id),`${name}: 隐藏拱框铺设不删除组件或填回开口`);
      await restore();await settledPresentation();check(pickVisibleAttachment(id),`${name}: 撤销铺设隐藏恢复拱框`);
    }
    const opening=component(id) as OpeningComponent;
    opening.entity.transform.setPosition(.8,.4,3);let rejected=false;
    try{await system.flush();}catch{rejected=true;}
    check(rejected,`${name}: 拒绝悬空洞口，不伪造支持的形状`);
    opening.entity.transform.setPosition(.8,0,3);await system.flush();await settledPresentation();
    check(hole(.8)&&pickVisibleAttachment(id),`${name}: 修正非法位姿后重新发布`);
    await mutate(d=>d.updateComponent(id,{enabled:false}));await settledPresentation();
    check(!system.resolve(id)&&!hasRoofDraw(id)&&!hole(.8),`${name}: 禁用移除拱框并补回墙洞`);
    check(!!system.resolve(backId)&&hasRoofDraw(backId),`${name}: 禁用保留其他拱洞`);
    await restore();await settledPresentation();check(hole(.8)&&pickVisibleAttachment(id),`${name}: 撤销禁用恢复开口`);
    await mutate(d=>d.delete(entity));await settledPresentation();
    check(!component(id)&&!hole(.8)&&!!system.resolve(backId),`${name}: 删除仅移除目标并补回墙体`);
    await restore();await settledPresentation();check(hole(.8)&&pickVisibleAttachment(id),`${name}: 撤销删除恢复原身份`);
    undo=creationUndo;await restore();await settledPresentation();
  }
}

async function frames(count=30){for(let i=0;i<count;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}
/** A newly published detail renderer may still have zero LOD coverage. Establish
 * a visible baseline before testing that renderer, never between a preview
 * transform change and its immediate matrix/picking assertions. */
async function settledPresentation(){
  const deadline=performance.now()+10000;
  do {
    await frames(1);
    const metrics=system.metrics();
    if(metrics.pendingDetails===0 && metrics.transitioning===0)return;
  } while(performance.now()<deadline);
  throw Error("Building presentation did not settle within 10 seconds");
}
function component(id:string){return editor.projection.component(id)!;}
function fenceWidth(){const shape=(component("fence-c") as FenceComponent).shape;return shape.type==="rectangle"?shape.width:NaN;}
function light(){return scene.rootEntities.flatMap(e=>e.getComponentsIncludeChildren(PointLight,[])).find(l=>l.entity.isActiveInHierarchy&&l.color.r+l.color.g+l.color.b>0);}
function sdfTextures(){
  return new Set(scene.rootEntities.flatMap(e=>e.getComponentsIncludeChildren(MeshRenderer,[]))
    .map(r=>r.getMaterial()?.shaderData.getTexture("material_data_brick_sdf"))
    .filter((texture):texture is Texture2DArray=>texture instanceof Texture2DArray));
}
function sdfFirstByte(texture:Texture2DArray){
  const pixel=new Uint8Array(4);texture.getPixelBuffer(0,0,0,1,1,pixel);return pixel[0];
}
/** Matrix-following acceptance must not depend on a sparse world-space grid
 * accidentally hitting the current LOD dither pattern. Preserve the complete
 * scene depth, locate a visible ID pixel, then verify it through public pick().
 * No Engine tick, time advance, opacity override or geometry rebuild occurs. */
function pickVisibleSingleRenderer(renderer:MeshRenderer,id:string):boolean {
  const batches:SeedWorldPickBatch[]=[];
  system.visitPickBatches(batch=>{if(batch.renderer===renderer)batches.push(batch);});
  const observation={renderer:renderer.entity.name,fade:renderer.shaderData.getFloat("renderer_MasonryLodFade"),transitioning:system.metrics().transitioning,batches:batches.length,visiblePixels:0,hit:undefined as string|undefined};
  ((window as any).visibleRendererPicks??=[]).push(observation);
  if(batches.length!==1 || batches[0].count!==1 || batches[0].resolve(0)!==id)return false;
  const visit:SeedWorldPickSource=visitor=>visitor(batches[0]);
  // This fixture keeps its upper-left corner empty. A miss leaves the genuine
  // ID pass available for readback rather than the subsequent hit-depth pass.
  if(picker.pick(0,0,visit)!==undefined)throw Error("Expected an empty fixture corner");
  const {min,max}=renderer.bounds,screen=new Vector3(),{width,height}=engine.canvas;
  let minX=width,minY=height,maxX=-1,maxY=-1;
  for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z]){
    camera.worldToScreenPoint(new Vector3(x,y,z),screen);
    minX=Math.min(minX,screen.x);minY=Math.min(minY,screen.y);maxX=Math.max(maxX,screen.x);maxY=Math.max(maxY,screen.y);
  }
  const x=Math.max(0,Math.floor(minX)),y=Math.max(0,Math.floor(minY));
  const w=Math.min(width,Math.ceil(maxX)+1)-x,h=Math.min(height,Math.ceil(maxY)+1)-y;
  if(w<=0||h<=0)return false;
  const pixels=new Uint8Array(w*h*4);
  const texture=(picker as unknown as {texture:Texture2D}).texture;
  texture.getPixelBuffer(x,y,w,h,pixels);
  for(let i=0;i<pixels.length;i+=4)if(pixels[i]===1&&pixels[i+1]===0&&pixels[i+2]===0)observation.visiblePixels++;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i]===1&&pixels[i+1]===0&&pixels[i+2]===0){
    const px=x+(i/4)%w,py=y+Math.floor(i/4/w);
    const hit=picker.pick(px+.5,py+.5,visit);
    observation.hit=hit;
    return hit===id;
  }
  return false;
}
function picksNear(point:Vector3, id:string, radius=.3, only?:MeshRenderer){
  engine.update(); const screen=new Vector3();
  // Raster sampling of the real small mesh, including its hollow lantern frame.
  for(let x=-radius;x<=radius;x+=.075)for(let y=-radius;y<=radius;y+=.075){
    camera.worldToScreenPoint(new Vector3(point.x+x,point.y+y,point.z),screen);
    if(picker.pick(screen.x,screen.y,v=>system.visitPickBatches(batch=>{if(!only||batch.renderer===only)v(batch);}))===id)return true;
  }
  return false;
}
canvas.addEventListener("click",event=>{
  if(busy||!picker)return;const r=canvas.getBoundingClientRect();
  const id=picker.pick((event.clientX-r.left)*canvas.width/r.width,(event.clientY-r.top)*canvas.height/r.height,v=>system.visitPickBatches(v));
  const value=id?system.resolve(id):undefined;
  document.querySelector("#selection")!.textContent=value?`${value.entity.name} · ${value.constructor.name}`:"尚未选择";
});
async function verifyCpuBoundary(check:(ok:unknown,label:string)=>void) {
  const body = component("house-c") as HouseComponent;
  const attachments = [component("window-c"),component("door-c"),component("lamp-c")];
  const identity = (value:any) => editor.projection.queryComponents().find(i=>editor.projection.component(i.id)===value)!.id;
  const document = buildingDocument(body, attachments as any, identity, body.entity.getComponents(BuildingSurfaceComponent,[]));
  const terrain = {samples:new Uint16Array(4),resolution:2,origin:[-100,-100] as [number,number],size:200,decode:{offset:0,scale:1}};
  const assets = buildingAssets(body.assets!).compilation, client = new ConstructionCpuClient();
  const signal = new AbortController().signal;
  let ticking = true, ticks = 0;
  const tick = () => {ticks++; if(ticking)requestAnimationFrame(tick);};requestAnimationFrame(tick);
  try {
    const a = await client.prepare(document,terrain,assets,signal);
    check(a.preview.parts.length>0 && !!a.structure?.length,"Worker 返回粗模和结构查询数据");
    const query = ConstructionSurfaceQuery.fromSnapshot(a.structure!);
    check(query.bounds.length>0,"主线程直接接管 Worker 结构查询快照");
    const b = await client.prepare(document,terrain,assets,signal);
    a.cpu.dispose();
    const detail = await b.cpu.compile(signal);
    check(detail.plans.length>0 && detail.groups.length>0,"释放一个编译快照不影响另一个快照的精细排列");
    check(detail.construction.decorations.flatMap(d=>d.parts).some(p=>p.decorationId==="window-c"),"跨阶段复用保留窗口身份和几何");
    const repeated = await b.cpu.compile(signal);
    check(JSON.stringify(detail.plans)===JSON.stringify(repeated.plans),"复用同一曲线计算上下文的排列结果保持确定性");
    b.cpu.dispose();
    let rejected = false;try{await b.cpu.compile(signal);}catch{rejected=true;}
    check(rejected,"释放后的编译快照不能再次使用");
    const abort = new AbortController(), cancelled = client.prepare(document,terrain,assets,abort.signal);
    abort.abort();rejected=false;try{await cancelled;}catch{rejected=true;}
    check(rejected,"取消编译立即拒绝且不会发布迟到结果");
    const c = await client.prepare(document,terrain,assets,signal);await c.cpu.compile(signal);c.cpu.dispose();
    check(true,"取消后可以重新编译并释放原生资产快照");
    check(ticks>0,"Worker 编译期间浏览器帧回调继续执行");
  } finally {ticking=false;client.dispose();}
}
async function verify(){
  const checks:string[]=[];(window as any).extensionChecks=checks;
  const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label);status.textContent=label;};
  const nativePool=Object.values((engine.resourceManager as any)._referResourcePool) as {refCount:number}[];
  const nativeRefs=nativePool.map(resource=>resource.refCount);
  const kitPrefab=(component("house-c") as HouseComponent).assets!;
  for(let i=0;i<3;i++){const clone=kitPrefab.instantiate();clone.destroy();}
  check(nativePool.every((resource,i)=>resource.refCount===nativeRefs[i] && resource.refCount>=0),"原生资产集合重复克隆和销毁不改变资源引用计数");
  if(acceptanceCase==="cpu") {
    await verifyCpuBoundary(check);
    (window as any).extensionResult={ok:true,scope:"cpu",checks,metrics:system.metrics()};
    status.textContent=`通过 ${checks.length} 项 CPU 边界检查。`;return;
  }
  if(acceptanceCase==="opening") {
    await verifyOpenings(check);
    (window as any).extensionResult={ok:true,scope:"opening",checks,metrics:system.metrics()};
    status.textContent=`通过 ${checks.length} 项拱洞检查。`;return;
  }
  if(acceptanceCase==="roof") {
    await verifyAdditionalRoofDecorations(check);
    (window as any).extensionResult={ok:true,scope:"roof",checks,metrics:system.metrics()};
    status.textContent=`通过 ${checks.length} 项屋顶附件检查。`;return;
  }
  if(acceptanceCase==="assets") {
    await mutate(d=>d.updateComponent("window-c",{type:"window-gothic",frameMaterial:"wall"}));
    await frames();
    await verifyStoneGeometryAsset(check);await restore();await frames();
    await verifyMeshAsset(check);await verifyDecorationMaterial(check);
    (window as any).extensionResult={ok:true,scope:"assets",checks,metrics:system.metrics()};
    return;
  }
  if(acceptanceCase==="assembly") {
    await verifyAssemblyPrefab(check);await verifyWindowAssemblyPrefab(check);await verifyMeshAsset(check);await verifyDecorationMaterial(check);
    (window as any).extensionResult={ok:true,scope:"assembly",checks,metrics:system.metrics()};
    status.textContent=`通过 ${checks.length} 项组合 Prefab 检查。`;return;
  }
  check(component("wall-c") instanceof WallComponent && component("wall-c") instanceof MainBuildingComponent,"围墙为真实主体 Component");
  check(component("fence-c") instanceof FenceComponent,"栅栏为真实 Component");
  check(component("door-c") instanceof DoorComponent && component("door-c") instanceof DecorationComponent,"门继承装饰 Component");
  check(component("lamp-c") instanceof WallLampComponent,"墙灯为真实 Component");
  for(const [id,p] of [["wall-c",[-7,.7,2.2]],["fence-c",[7,.9,2.1]],["door-c",[0,1,3.1]],["lamp-c",[2.5,2.6,3.15]]] as const){
    check(picksNear(new Vector3(...p),id),`GPU 独立拾取 ${id}`);
    check(system.resolve(id)===component(id),`拾取身份解析到当前 Scene ${id}`);
  }
  await frames();check(!!light(),"墙灯产生实际 PointLight");
  const lamp=component("lamp-c") as WallLampComponent;
  const oldLight=light()!.entity.transform.worldPosition.clone();
  const draws=system.metrics().draws;
  lamp.entity.transform.setPosition(2,2.2,3);
  await frames(2);
  check(Math.abs(light()!.entity.transform.worldPosition.x-(oldLight.x-.5))<.01,"灯光即时跟随灯 Entity 移动");
  await system.flush();await frames();
  check(picksNear(new Vector3(2,2.6,3.15),"lamp-c"),"灯具几何与光源移动到同一位置");
  check(system.metrics().draws===draws,"移动灯不拆分合批");
  lamp.entity.transform.setPosition(2.5,2.2,3);await system.flush();await frames();
  const localLight=light()!.entity.transform.worldPosition.clone();
  const house=component("house-c") as HouseComponent;
  house.entity.transform.setPosition(1,0,0);await frames(2);
  check(Math.abs(light()!.entity.transform.worldPosition.x-localLight.x-1)<.01,"整栋移动时灯光只变换一次");
  house.entity.transform.setPosition(0,0,0);await system.flush();
  const initialSeed=(component("window-c") as WindowComponent).seed;
  await mutate(d=>d.updateComponent("window-c",{seed:0}));
  check((component("window-c") as WindowComponent).seed===0,"装饰显式种子零经 Scene 编辑发布");
  await reload();
  check((component("window-c") as WindowComponent).seed===0,"新 Engine 保留装饰种子零");
  await restore();
  check((component("window-c") as WindowComponent).seed===initialSeed,"撤销恢复装饰外观种子");
  await mutate(d=>{d.updateComponent("wall-c",{height:2});d.updateComponent("fence-c",{shape:{$type:"RectangularBuildingShape",width:5,depth:.15}});d.updateComponent("door-c",{width:1.4});d.updateComponent("lamp-c",{lightIntensity:3,lightColor:2});});
  check((component("wall-c") as WallComponent).height===2,"围墙高度经 Source 编辑发布");
  check(fenceWidth()===5,"栅栏宽度经 Source 编辑发布");
  check((component("door-c") as DoorComponent).width===1.4,"门宽编辑发布");
  check((component("lamp-c") as WallLampComponent).lightIntensity===3,"灯光参数编辑发布");
  await reload();await frames();
  check((component("wall-c") as WallComponent).height===2 && fenceWidth()===5,"新 Engine 重载围墙栅栏属性");
  check((component("door-c") as DoorComponent).width===1.4 && (component("lamp-c") as WallLampComponent).lightColor===2,"新 Engine 重载门灯属性");
  check(!!light(),"新 Engine 恢复灯光");
  await restore();
  for(const id of ["wall-c","fence-c","door-c","lamp-c"]){
    const prior=component(id);
    await mutate(d=>d.updateComponent(id,{enabled:false}));
    check(component(id)===prior && !system.resolve(id),`禁用 ${id} 退出运行集合且保留 Source`);
    if(id==="lamp-c"){await frames(2);check(!light(),"禁用墙灯立即移除照明");}
    await restore();check(!!system.resolve(id),`撤销禁用恢复 ${id}`);
  }
  await mutate(d=>d.delete("lamp"));await frames(2);
  check(!component("lamp-c")&&!light(),"删除灯 Entity 同时清理灯具与光源");
  await restore();await frames();check(!!light(),"撤销删除恢复照明");
  const configurationHouse=component("house-c") as HouseComponent;
  const roof=configurationHouse.roof;roof.tip[0]=999;roof.height=.9;
  check(configurationHouse.roof.tip[0]===0 && configurationHouse.roof.height!==.9,"屋顶读取副本不能绕过组件写入");
  await mutate(d=>d.updateComponent("house-c",{height:6,seed:41,wallColor:2,woodColor:3,
    roof:{tip:[0,0],profile:.75,height:.22,ridge_length:1,eave:.3,ridge_direction:1,flat_rim:0,color:2},
    foundation:{height:.6,mode:"pillars"},plaster:{enabled:true,wear:.3,color:2,tint:[.8,.7,.6]},floors:{enabled:true,interval:2}}));
  const configured=component("house-c") as HouseComponent;
  check(configured.roof.profile===.75 && configured.roof.ridge_direction===1,"完整屋顶配置经 Scene 发布");
  check(configured.foundation?.mode==="pillars" && configured.floors?.interval===2,"地基和楼层配置接入现有几何管线");
  check(configured.plaster?.enabled && configured.wallColor===2 && configured.woodColor===3,"墙面与灰泥参数经 Scene 发布");
  await reload();
  const restored=component("house-c") as HouseComponent;
  check(restored.roof.profile===.75 && restored.foundation?.mode==="pillars" && restored.floors?.interval===2 && restored.plaster?.enabled,"新 Engine 重载完整房屋配置");
  await restore();await frames();
  const previousAssets=(component("house-c") as HouseComponent).assets!;
  const source=await kitSource(),originalName=source.entities[0].name;
  source.entities[0].name="edited-through-project";
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.run(({draft,edited})=>{draft.update(BUILTIN_BUILDING_ASSETS,JSON.stringify(source));edited();},false,[BUILTIN_BUILDING_ASSETS]);
  await tx.prepare(signal);await tx.commit();undo=tx.captureUndo();await tx.activate!(signal);
  const replacementAssets=(component("house-c") as HouseComponent).assets!;
  check(replacementAssets!==previousAssets && prefabRootName(replacementAssets)==="edited-through-project","VFS Prefab 修改替换实际组件资源实例");
  check(["wall-c","fence-c"].every(id=>(component(id) as MainBuildingComponent).assets===replacementAssets),"共享 Prefab 修改传到全部引用主体");
  check(picksNear(new Vector3(0,1,3.1),"door-c"),"资产替换后真实 GPU 几何与拾取可用");
  await reload();
  check(prefabRootName((component("house-c") as HouseComponent).assets!)==="edited-through-project","新 Engine 从 VFS 恢复修改后的 Prefab");
  await restore();
  check(prefabRootName((component("house-c") as HouseComponent).assets!)===originalName,"撤销 VFS 修改恢复原 Prefab");
  const texturePath="Building/Units/Textures/brick-sdf-distance.tex";
  const sdfBytes=Uint8Array.from(await nativeContent(texturePath) as Uint8Array);
  const payload=parseTexturePixelsData(sdfBytes.buffer).payloads[0];
  const originalByte=payload[0],originalSdf=[...sdfTextures()];
  check(originalSdf.length===1 && sdfFirstByte(originalSdf[0])===originalByte,"共享 SDF GPU 纹理由原生 Texture 上传");
  payload[0]^=1;
  const path="Building/Units/Textures/sdf-"+crypto.randomUUID()+".tex";
  const materialPaths=project.projectPackage.project.files.filter(f=>f.type==="Material" && f.virtualPath.startsWith("Building/Units/Materials/sdf-")).map(f=>f.virtualPath);
  const materials=await Promise.all(materialPaths.map(async path=>({path,source:JSON.parse(await nativeContent(path) as string)})));
  for(const material of materials)material.source.shaderData.material_data_brick_sdf.value={url:path};
  const sdfSignal=new AbortController().signal,sdfTx=editor.beginEdit(crypto.randomUUID(),sdfSignal);
  await sdfTx.run(({draft,edited})=>{
    draft.createBundle([{file:{virtualPath:path,path,type:"Texture"},content:sdfBytes,metadata:{summary:"Native SDF texture edit"}}],{},[]);
    for(const material of materials)draft.update(material.path,JSON.stringify(material.source));edited();
  },false,materialPaths);
  await sdfTx.prepare(sdfSignal);await sdfTx.commit();undo=sdfTx.captureUndo();await sdfTx.activate!(sdfSignal);
  const changedSdf=[...sdfTextures()];
  (window as any).sdfAssetObservation={originalByte,originalIds:originalSdf.map(t=>t.instanceId),changed:changedSdf.map(t=>({id:t.instanceId,byte:sdfFirstByte(t)}))};
  check(changedSdf.length===1 && changedSdf[0]!==originalSdf[0] && sdfFirstByte(changedSdf[0])===(originalByte^1),"原生 Material 纹理引用替换更新实际共享 GPU 纹理");
  // Native resources are cached until GC. Collect the retired kit → unit →
  // material → texture dependency chain, without forcing any live resource.
  for(let pass=0;pass<4 && !originalSdf[0].destroyed;pass++)engine.resourceManager.gc();
  check(originalSdf[0].destroyed,"资产替换后原生 GC 回收旧 SDF GPU 纹理");
  await reload();
  check(sdfTextures().size===1 && [...sdfTextures()].every(texture=>sdfFirstByte(texture)===(originalByte^1)),"新 Engine 从已保存 VFS 恢复原生 SDF 纹理");
  await restore();
  check(sdfTextures().size===1 && [...sdfTextures()].every(texture=>sdfFirstByte(texture)===originalByte),"撤销 SDF 编辑恢复原始 GPU 数据");
  await makeRoundHouse();await frames();
  const roundHouse=component("house-c") as HouseComponent;
  const shapeCopy=roundHouse.shape;
  if(shapeCopy.type==="circle")shapeCopy.radius=99;
  check(roundHouse.shape.type==="circle" && roundHouse.shape.radius===3,"圆房形状由组件持有，读取副本不可绕过编辑");
  for(const [id,u,bottom,height] of [["window-c",.65,1.2,1.5],["door-c",.75,0,2],["lamp-c",.85,2.2,.8]] as const)
    check(roundPick(u,bottom,height,id),`圆墙原生几何和 GPU 独立拾取 ${id}`);
  check(!!light(),"圆墙灯恢复实际照明");
  await verifySpireAsset(check);
  const roundWindow=component("window-c") as DecorationComponent;
  roundWindow.entity.transform.setPosition(...buildingWallPosition(roundShape,.62,1.2));
  await system.flush();await frames();
  check(roundPick(.62,1.2,1.5,"window-c"),"窗 Entity 沿圆墙移动后重建真实墙洞");
  roundWindow.entity.transform.setScale(1.2,1.1,1.2);
  await system.flush();await frames();
  check(roundPick(.62,1.2,1.65,"window-c"),"圆墙窗正缩放后几何与拾取一致");
  await reload();await frames();
  check((component("house-c") as HouseComponent).shape.type==="circle" && roundPick(.65,1.2,1.5,"window-c"),"新 Engine 恢复 Source 圆房及门窗挂点");
  await restore();await frames();
  check((component("house-c") as HouseComponent).shape.type==="rectangle" && picksNear(new Vector3(0,1,3.1),"door-c"),"撤销圆房事务同时恢复矩形主体和装饰位置");
  await verifyWindowCutAsset(check);
  await verifyFinishes(check);
  await verifyCollisionAsset(check);
  await verifyAssemblyPrefab(check);await verifyWindowAssemblyPrefab(check);await verifyMeshAsset(check);await verifyDecorationMaterial(check);
  await verifySurfaces(check);
  await verifyRoofWindows(check);
  await verifyAdditionalRoofDecorations(check);
  await verifyOpenings(check);
  const saved=project.projectPackage.contents["Building.scene"];
  check(typeof saved==="string"&&!saved.includes("MasonryDocument")&&!saved.includes("MasonryLocalLights"),"保存仅含作者 Scene，无派生建筑目录或灯光池");
  (window as any).extensionResult={ok:true,scope:"full",checks,metrics:system.metrics()};
  status.textContent=`通过 ${checks.length} 项检查。`;
}
async function action(run:()=>Promise<void>){if(busy)return;busy=true;try{await run();}catch(error){status.textContent=String(error);(window as any).extensionResult={ok:false,error:String(error)};console.error(error);}finally{busy=false;}}
document.querySelector("#verify")!.addEventListener("click",()=>void action(verify));
document.querySelector("#round")!.addEventListener("click",()=>void action(makeRoundHouse));
document.querySelector("#reload")!.addEventListener("click",()=>void action(reload));
load().catch(error=>{status.textContent=String(error);(window as any).extensionResult={ok:false,error:String(error)};console.error(error);});

document.querySelector("#surface")!.addEventListener("click",()=>action(async()=>{await woodRoof();await frames();status.textContent="屋顶已通过 BuildingSurfaceComponent 改为木板铺设。";}));

document.querySelector("#finish")!.addEventListener("click",()=>action(async()=>{await changeFinish();await frames();status.textContent="窗框材质与发光由窗组件编辑。";}));

document.querySelector("#spire")!.addEventListener("click",()=>action(async()=>{if((component("house-c") as HouseComponent).shape.type!=="circle")await makeRoundHouse();await raiseSpire();await frames();status.textContent="屋顶饰尖已通过 VFS 网格资产拉高。";}));

document.querySelector("#dormer")!.addEventListener("click",()=>action(async()=>{const {id}=await addRoofWindow();focusRoofWindow(id);await frames();status.textContent="屋顶尖拱窗已创建，可拾取窗体和小屋顶。";}));

// Visible manual entry, using exactly the same Scene transaction as acceptance.
document.querySelector("#opening")!.addEventListener("click",()=>action(async()=>{
  await mutate(d=>{
    d.updateComponent("house-c",{height:6});
    for(const id of ["window-c","door-c","lamp-c"])d.updateComponent(id,{enabled:false});
    const entity=d.create({name:"拱形洞口",parentEntityId:"house",position:[0,0,3]}).id;
    d.addComponent(entity,{type:"OpeningComponent",props:{width:2.8,height:2.8,seed:0}});
  });
  await settledPresentation();status.textContent="拱形洞口已通过 Scene 组件创建，可拾取拱框。";
}));
