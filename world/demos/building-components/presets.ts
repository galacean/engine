import { registerBuildingAssetComponents } from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import { AssetType, Camera, Color, DirectLight, Vector3, WebGLEngine, type Scene } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeProjectStorage, RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { BuildingSystem, HouseComponent, RoofWindowComponent, BuildingSurfaceComponent } from "@galacean/engine-building/tiny-glade/components/BuildingComponents";
import { builtinBuildingPresetFiles, builtinBuildingPresets } from "@galacean/engine-building/tiny-glade/resources/BuiltinBuildingPresets";
import { builtinBuildingAssetFiles } from "@galacean/engine-building/tiny-glade/resources/BuiltinBuildingAssets";
import { mountNativeBuildingPanel } from "@galacean/engine-world-planning/masonry/NativeBuildingPanel";
import { SeedWorldPicker } from "@galacean/engine-world-planning/world/SeedWorldPicker";
import { presetScriptBrowserFixture } from "./preset-script-browser-harness.ts";

const status=document.querySelector<HTMLElement>("#status")!,button=document.querySelector<HTMLButtonElement>("#verify")!;
const source={asset:{version:"2.0"},scene:{rootEntities:[],background:{mode:0,color:{r:.12,g:.17,b:.21,a:1}}},entities:[],components:[]};
const initial:RuntimeProjectPackage={version:RUNTIME_PROJECT_SAVE_VERSION,project:{scene:"Presets.scene",files:[
  {virtualPath:"Presets.scene",path:"Presets.scene",type:"Scene",dependencies:[]},...builtinBuildingAssetFiles,...builtinBuildingPresetFiles
]},contents:{"Presets.scene":JSON.stringify(source)}};
const projectId="native-building-presets-v6";
let engine:WebGLEngine,scene:Scene,project:RuntimeProjectSession,editor:RuntimeNativeEditor,system:BuildingSystem,camera:Camera,picker:SeedWorldPicker;
let panel:ReturnType<typeof mountNativeBuildingPanel>,unregister:()=>void,slot=0,blocked=false;
async function load(){
  registerBuildingAssetComponents();
  const storage=await RuntimeProjectStorage.open();try{if(!await storage.load(projectId))await storage.save(projectId,initial);}finally{storage.close();}
  project=await RuntimeProjectSession.open(projectId,initial.project,location.href);
  engine=await WebGLEngine.create({canvas:document.querySelector<HTMLCanvasElement>("canvas")!,shaderCompiler:new ShaderCompiler()});engine.canvas.setAutoResolution();
  engine.resourceManager.registerVirtualResources(await project.resources());
  scene=await engine.resourceManager.load<Scene>({url:"Presets.scene",type:AssetType.Scene});engine.sceneManager.activeScene=scene;
  editor=new RuntimeNativeEditor(project,scene);
  camera=scene.createRootEntity("Camera").addComponent(Camera);camera.entity.transform.setPosition(11,9,24);camera.entity.transform.lookAt(new Vector3(11,2,0));camera.isOrthographic=true;camera.orthographicSize=13;
  scene.createRootEntity("Sun").addComponent(DirectLight).entity.transform.setRotation(-40,-25,0);scene.ambientLight.diffuseSolidColor=new Color(.5,.5,.5,1);
  system=BuildingSystem.forScene(scene);system.bind({camera,frame:body=>body.entity.parent??body.entity,resolve:id=>editor.projection.component(id),identity:component=>{
    const record=editor.projection.queryComponents().find(record=>editor.projection.component(record.id)===component);if(!record)throw Error("Missing native identity");return record.id;
  }});
  unregister=project.registerRuntimeActivation({before:async()=>{},after:async()=>{system.invalidate();await system.flush();}});
  panel=mountNativeBuildingPanel(project,editor,(position,forward)=>{
    if(forward){camera.orthographicSize=4;camera.entity.transform.setPosition(position.x+forward.x*12,position.y+4,position.z+forward.z*12);camera.entity.transform.lookAt(position);}
    else{camera.orthographicSize=13;camera.entity.transform.setPosition(position.x,9,24);camera.entity.transform.lookAt(new Vector3(position.x,2,0));}
  },()=>{},{anchors:()=>[[slot*10-100,0],[slot*10,0]],land:{sampleHeight:x=>x< -50?undefined:0,isWater:()=>blocked}});
  document.querySelector<HTMLDetailsElement>("#native-building-editor")!.open=true;
  picker=new SeedWorldPicker(camera);await system.flush();engine.run();status.textContent="已加载 VFS 预设，尚未创建建筑。";button.disabled=false;
}
function dispose(){panel?.destroy();unregister?.();picker?.dispose();editor?.dispose();project?.dispose();engine?.destroy();}
window.addEventListener("pagehide",dispose,{once:true});
const frames=async(count=30)=>{for(let i=0;i<count;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));};
function sceneSource(){return JSON.parse(project.projectPackage.contents["Presets.scene"] as string) as GalaceanSourceSceneFile;}
const houses=()=>editor.projection.queryComponents({type:"HouseComponent"});
async function create(index:number){
  const select=document.querySelector<HTMLSelectElement>('select[aria-label="建筑预设"]')!;
  select.value=builtinBuildingPresets[index].path;
  const create=[...document.querySelectorAll<HTMLButtonElement>("#native-building-editor button")].find(button=>button.textContent==="在附近陆地创建副本")!;
  const before=sceneSource().scene.rootEntities.length;create.click();
  const start=performance.now();
  while(create.disabled){if(performance.now()-start>60000)throw Error("Creation did not finish");await frames(1);}
  if(sceneSource().scene.rootEntities.length!==before+1)throw Error(document.querySelector("#native-building-editor output")!.textContent??"Preset creation failed");
  await frames();slot++;
}
async function verify(){
  const checks:string[]=[];const check=(value:unknown,label:string)=>{if(!value)throw Error(label);checks.push(label);status.textContent=label;};
  check(houses().length===0,"从空 Scene 开始，预设只存于 VFS");
  for(let i=0;i<3;i++){
    await create(i);
    check(houses().length===(i+1)*2,`${builtinBuildingPresets[i].name} 通过正式面板创建两栋原生房屋`);
    const source=sceneSource(),root=source.entities.find(entity=>entity.id===source.scene.rootEntities[i])!;
    check(root.position?.[0]===i*10,"创建位置归属于组 Entity");
    const entity=root.children![0],record=editor.projection.queryComponents({entityId:entity,type:"HouseComponent"})[0];
    const body=editor.projection.component(record.id) as HouseComponent;
    check(body instanceof HouseComponent && body.seed===1,"预设加载真实组件且保留原始隐式种子");
    const screen=new Vector3();let hit=false;
    for(let dx=-.6;dx<=.6&&!hit;dx+=.2)for(let dy=-.4;dy<=.4&&!hit;dy+=.2){
      camera.worldToScreenPoint(new Vector3(i*10+dx,1.5+dy,2.4),screen);
      hit=picker.pick(screen.x,screen.y,visitor=>system.visitPickBatches(visitor))===record.id;
    }
    check(hit,"原生预设房屋通过真实 GPU 拾取返回组件身份");
    const roof=body.entity.parent!.getComponentsIncludeChildren(RoofWindowComponent,[])[0];
    check(roof?.type==="dormer-gothic",`${builtinBuildingPresets[i].name} 使用统一屋顶窗组件`);
    const roofId=editor.projection.queryComponents().find(record=>editor.projection.component(record.id)===roof)!.id;
    const position=camera.entity.transform.position.clone(),rotation=camera.entity.transform.rotationQuaternion.clone();
    const select=document.querySelector<HTMLSelectElement>('select[aria-label="建筑组件"]')!;
    select.value=roofId;select.dispatchEvent(new Event("change"));
    document.querySelector<HTMLButtonElement>('[data-action="focus"]')!.click();await frames();
    const mount=system.roofWindowView(roof)!.position;mount.y+=roof.height*.5;camera.worldToScreenPoint(mount,screen);
    let roofHit=false;
    for(let dx=-24;dx<=24&&!roofHit;dx+=8)for(let dy=-24;dy<=24&&!roofHit;dy+=8)
      roofHit=picker.pick(screen.x+dx,screen.y+dy,visitor=>system.visitPickBatches(visitor))===roofId;
    check(roofHit,`${builtinBuildingPresets[i].name} 查看对象对准屋顶窗且实际可见像素可拾取`);
    camera.entity.transform.position=position;camera.entity.transform.rotationQuaternion=rotation;camera.orthographicSize=13;

  }
  for(const record of editor.projection.queryComponents({type:"BuildingSurfaceComponent"})){
    const surface=editor.projection.component(record.id) as BuildingSurfaceComponent;
    if(!surface.placementEnabled)check((await surface.inspectPublished()).totalUnits===0,"未配置铺设的原始墙面没有增加砖块单元");
  }
  const originalIds=houses().map(record=>record.id),path=builtinBuildingPresets[0].path;
  const signal=new AbortController().signal,edit=editor.beginEdit(crypto.randomUUID(),signal);
  const result=await edit.tools.find(tool=>tool.name==="asset.read")!.execute({path},{signal}) as {content:string};
  const preset=JSON.parse(result.content) as GalaceanSourcePrefabFile;preset.components.find(component=>component.type==="HouseComponent")!.props!.height=6;
  await edit.tools.find(tool=>tool.name==="asset.update")!.execute({path,content:JSON.stringify(preset)},{signal});
  await edit.prepare(signal);await edit.commit();await edit.activate!(signal);
  check(originalIds.every(id=>(editor.projection.component(id) as HouseComponent).height===3.125),"修改预设不反向改写已创建的独立 Scene 对象");
  await create(0);
  const latest=houses().filter(record=>!originalIds.includes(record.id));
  check(latest.length===2&&(editor.projection.component(latest[0].id) as HouseComponent).height===6,"下一次创建读取修改后的 VFS 预设");
  const beforeMove=JSON.stringify(sceneSource()),lastRoot=sceneSource().scene.rootEntities.at(-1)!;
  const move=document.querySelector<HTMLButtonElement>('[data-action="place"]')!;
  move.click();while(move.disabled)await frames(1);
  check(sceneSource().entities.find(entity=>entity.id===lastRoot)!.position![0]===40,"选择组件后整组移动只写对应组 Entity 的位置");
  check(houses().map(record=>record.id).join()===originalIds.concat(latest.map(record=>record.id)).join(),"陆地放置保持全部建筑及装饰的独立身份");
  const undo=document.querySelector<HTMLButtonElement>('[data-action="undo"]')!;
  undo.click();while(undo.disabled)await frames(1);
  check(JSON.stringify(sceneSource())===beforeMove,"撤销整组放置完整恢复原生 Scene");
  blocked=true;
  const createButton=[...document.querySelectorAll<HTMLButtonElement>("#native-building-editor button")].find(button=>button.textContent==="在附近陆地创建副本")!;
  createButton.click();while(createButton.disabled)await frames(1);
  check(JSON.stringify(sceneSource())===beforeMove && document.querySelector("#native-building-editor output")!.textContent!.includes("有限搜索"),"没有陆地时创建失败且不留下半成品 Entity");
  blocked=false;
  const saved=JSON.stringify(sceneSource()),bounds=JSON.stringify(system.bounds);
  dispose();await load();await frames();
  check(JSON.stringify(sceneSource())===saved&&houses().length===8,"新 Engine 从 Scene 恢复全部预设副本和独立身份");
  check(JSON.stringify(system.bounds)===bounds,"新 Engine 恢复相同结构查询范围");
  const current=await project.fileProvider().read(path);
  check(typeof current==="string"&&JSON.parse(current).components.find((component:any)=>component.type==="HouseComponent").props.height===6,"预设修改随 VFS 一起保存恢复");
  const scriptChecks=await presetScriptBrowserFixture("native-building-script-"+crypto.randomUUID());
  check(Object.values(scriptChecks).every(Boolean),"真实 Script Worker 编译并解析到原生 House/Wall 组件实例，隔离会话拒绝未注册接口");
  (window as any).presetResult={ok:true,checks,metrics:system.metrics()};status.textContent=`通过 ${checks.length} 项检查。`;
}
button.onclick=()=>{button.disabled=true;void verify().catch(error=>{(window as any).presetResult={ok:false,error:String(error)};status.textContent=String(error);console.error(error);});};
load().catch(error=>{(window as any).presetResult={ok:false,error:String(error)};status.textContent=String(error);console.error(error);});
