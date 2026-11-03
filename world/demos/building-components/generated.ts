import { buildingAssets } from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import { PrefabResource } from "@galacean/engine";
import { registerBuildingAssetComponents } from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import { AssetType, Camera, Color, DirectLight, MeshRenderer, Vector3, WebGLEngine, type Scene } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { BuildingSystem, MainBuildingComponent, DecorationComponent, HouseComponent, WallDecorationComponent } from "@galacean/engine-building/tiny-glade/components/BuildingComponents";
import { generateBuildingScene } from "@galacean/engine-building/tiny-glade/components/BuildingSceneGeneration";
import { initialBuildingGroups } from "@galacean/engine-world-planning/integrations/building/InitialBuildingRecipe";
import { constructionPreview } from "@galacean/engine-building/tiny-glade/runtime/ConstructionPreview";
import { prepareConstructionTerrain, type ConstructionTerrainSource } from "@galacean/engine-building/tiny-glade/runtime/ConstructionTerrain";
import { builtinBuildingAssetFiles, BUILTIN_BUILDING_ASSETS } from "@galacean/engine-building/tiny-glade/resources/BuiltinBuildingAssets";
import { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeProjectStorage, RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { SeedWorldPicker } from "@galacean/engine-world-planning/world/SeedWorldPicker";
import { buildingGenerationPlan } from "./BuildingGenerationFixture.ts";
const status=document.querySelector<HTMLElement>("#status")!,canvas=document.querySelector<HTMLCanvasElement>("canvas")!;
const empty={asset:{version:"2.0"},scene:{rootEntities:[],background:{mode:0,color:{r:.12,g:.17,b:.21,a:1}}},entities:[],components:[]};
const initial:RuntimeProjectPackage={version:RUNTIME_PROJECT_SAVE_VERSION,project:{scene:"Building.scene",files:[
  {virtualPath:"Building.scene",path:"Building.scene",type:"Scene",dependencies:[BUILTIN_BUILDING_ASSETS]},...builtinBuildingAssetFiles
]},contents:{"Building.scene":JSON.stringify(empty)}};
const terrain:ConstructionTerrainSource={revision:0,grid:{samples:new Uint16Array(4),resolution:2,origin:[0,0],size:160,decode:{offset:0,scale:1}}};
const projectId="native-generated-buildings-v3";
let engine:WebGLEngine,project:RuntimeProjectSession,editor:RuntimeEditor,scene:Scene,system:BuildingSystem,camera:Camera,picker:SeedWorldPicker;
let undo:ReturnType<ReturnType<RuntimeEditor["beginEdit"]>["captureUndo"]>|undefined;
function dispose(){picker?.dispose();editor?.dispose();project?.dispose();engine?.destroy();}
window.addEventListener("pagehide",dispose,{once:true});
async function load(){
  registerBuildingAssetComponents();const storage=await RuntimeProjectStorage.open();let fresh=false;
  try{fresh=!await storage.load(projectId);if(fresh)await storage.save(projectId,initial);}finally{storage.close();}
  project=await RuntimeProjectSession.open(projectId,initial.project,location.href);
  engine=await WebGLEngine.create({canvas,shaderCompiler:new ShaderCompiler()});engine.canvas.setAutoResolution();
  engine.resourceManager.registerVirtualResources(await project.resources());
  if(fresh){
    const assets=await engine.resourceManager.load<PrefabResource>({type:"Prefab",url:BUILTIN_BUILDING_ASSETS});
    const inputs=initialBuildingGroups(buildingGenerationPlan, buildingAssets(assets).compilation).map(({document})=>({document,geometry:constructionPreview(document,
      prepareConstructionTerrain(document,terrain.grid).height,undefined,{assets:buildingAssets(assets).compilation,includeAppearance:true,retainDecorationParts:true})}));
    const fragment=generateBuildingScene(inputs,BUILTIN_BUILDING_ASSETS);
    await project.update(current=>({...current,contents:{...current.contents,"Building.scene":JSON.stringify({
      ...empty,scene:{...empty.scene,rootEntities:fragment.rootEntities},entities:fragment.entities,components:fragment.components
    })}}));
    engine.resourceManager.registerVirtualResources(await project.resources());
  }
  scene=await engine.resourceManager.load<Scene>({type:AssetType.Scene,url:"Building.scene"});engine.sceneManager.activeScene=scene;
  editor=new RuntimeEditor(project,scene);
  camera=scene.createRootEntity("Camera").addComponent(Camera);camera.farClipPlane=2000;
  overview();scene.createRootEntity("Sun").addComponent(DirectLight).entity.transform.setRotation(-40,-25,0);
  scene.ambientLight.diffuseSolidColor=new Color(.5,.5,.5,1);
  system=BuildingSystem.forScene(scene);system.bind({camera,terrain,frame:body=>body.entity.parent!,
    resolve:id=>editor.projection.component(id),identity:component=>{
      const record=editor.projection.queryComponents().find(r=>editor.projection.component(r.id)===component);
      if(!record)throw Error("Missing native Source identity");return record.id;
    }});
  project.registerRuntimeActivation({before:async()=>{},after:async()=>{system.invalidate();await system.flush();}});
  picker=new SeedWorldPicker(camera);await system.flush();engine.run();
  status.textContent=`已加载 ${system.metrics().buildings} 个主体，全部来自原生 Scene 组件。`;
  document.querySelector<HTMLButtonElement>("#verify")!.disabled=false;
}
function overview(){camera.entity.transform.setPosition(62,65,135);camera.entity.transform.lookAt(new Vector3(62,1,40));}
const component=(id:string)=>editor.projection.component(id)!;
async function frames(n=4){for(let i=0;i<n;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}
async function edit(run:(draft:RuntimeSceneEdit)=>void){
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.run(({draft,edited})=>{run(new RuntimeSceneEdit(draft,"Building.scene"));edited();},false);
  await tx.prepare(signal);await tx.commit();undo=tx.captureUndo();await tx.activate!(signal);
}
async function restore(){
  if(!undo)throw Error("Missing undo");const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  await tx.restoreUndo(undo);await tx.prepare(signal);await tx.commit();await tx.activate!(signal);undo=undefined;
}
async function verify(){
  const checks:string[]=[];const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label);status.textContent=`${checks.length}：${label}`;};
  check(system.metrics().buildings===17,"默认配方的17个房屋、围墙和栅栏全部成为原生主体组件");
  const identities=editor.projection.queryComponents(),bodies=identities.filter(r=>component(r.id) instanceof MainBuildingComponent);
  check(bodies.length===17&&bodies.every(r=>(component(r.id) as MainBuildingComponent).assets instanceof PrefabResource),"主体均引用真实VFS建筑资产");
  check(["WindowComponent","DoorComponent","WallLampComponent","RoofWindowComponent"].every(type=>identities.some(r=>r.type===type)),"默认门窗灯和尖拱屋顶窗都有各自原生组件");
  const decorations=identities.filter(r=>component(r.id) instanceof DecorationComponent);
  check(decorations.every(r=>component(r.id).entity.parent?.getComponent(HouseComponent)),"装饰归属真实房屋Entity");
  check(system.metrics().errors.length===0,"实际Worker与渲染没有缺失装饰或网格错误");
  camera.entity.transform.setPosition(20,10,40);camera.entity.transform.lookAt(new Vector3(20,2,20));await system.flush();await frames(45);
  let picked:string|undefined;
  // Search only projected native front-facing window bounds. The picker still
  // decides visibility/occlusion using actual GPU batches.
  for(const r of decorations){
    const c=component(r.id);if(!(c instanceof WallDecorationComponent)||c.kind!=="window")continue;
    const p=c.entity.transform.worldPosition,center=c.entity.parent!.transform.worldPosition,screen=new Vector3();
    const outward=new Vector3(p.x-center.x,0,p.z-center.z);outward.normalize();
    camera.entity.transform.setPosition(p.x+outward.x*12,p.y+3,p.z+outward.z*12);
    camera.entity.transform.lookAt(new Vector3(p.x,p.y+c.height*.5,p.z));
    await system.flush();await frames(40);
    for(const dy of [.2,.5,.8,1.1]){
      camera.worldToScreenPoint(new Vector3(p.x,p.y+c.height*dy,p.z),screen);
      if(picker.pick(screen.x,screen.y,v=>system.visitPickBatches(v))===r.id){picked=r.id;break;}
    }
    if(picked)break;
  }
  check(!!picked,"默认生成窗户可经真实GPU拾取定位自己的组件");
  const house=component("a") as HouseComponent,oldHeight=house.height,neighbour=component("a-b");
  await edit(d=>d.updateComponent("a",{height:oldHeight+.5}));await frames(4);
  check((component("a") as HouseComponent).height===oldHeight+.5&&component("a-b")===neighbour,"修改原生房屋属性保留邻居组件身份");
  await restore();check((component("a") as HouseComponent).height===oldHeight,"撤销恢复房屋配置");
  const deletion=decorations.find(r=>component(r.id) instanceof WallDecorationComponent&&r.entityId!==undefined)!;
  await edit(d=>d.delete(deletion.entityId));
  check(!system.resolve(deletion.id),"删除一个装饰直接删除对应Source Entity");
  const saved=project.projectPackage.contents["Building.scene"];
  check(typeof saved==="string"&&!saved.includes("PlannedMasonry")&&!saved.includes("identity_order")&&!saved.includes("Masonry runtime"),"保存仅有原生对象，无旧建筑目录和派生渲染节点");
  dispose();await load();
  check(!system.resolve(deletion.id)&&system.metrics().buildings===17,"新Engine从Source重载，已删装饰不会被默认配方重新生成");
  await restore();check(!!system.resolve(deletion.id),"新Engine中撤销删除恢复同一装饰身份");
  overview();await system.flush();await frames(30);
  (window as any).generatedBuildingResult={ok:true,checks,metrics:system.metrics(),sourceCounts:{entities:JSON.parse(project.projectPackage.contents["Building.scene"] as string).entities.length,components:editor.projection.queryComponents().length}};
  status.textContent=`通过 ${checks.length} 项默认建筑Scene初始化验收`;
}
document.querySelector("#verify")!.addEventListener("click",async event=>{
  const button=event.currentTarget as HTMLButtonElement;button.disabled=true;
  try{await verify();}catch(error){status.textContent=String(error);(window as any).generatedBuildingResult={ok:false,error:String(error)};console.error(error);}finally{button.disabled=false;}
});
load().catch(error=>{status.textContent=String(error);(window as any).generatedBuildingResult={ok:false,error:String(error)};console.error(error);});
