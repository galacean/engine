import { NativeBuildingHost } from "@galacean/engine-world-planning/masonry/NativeBuildingHost";
import { registerBuildingAssetComponents } from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import {WebGLEngine,AssetType,Camera,Vector3,type Scene} from '@galacean/engine';
import {ShaderCompiler} from '@galacean/engine-shader-compiler';
import {BuildingSystem} from '@galacean/engine-building/tiny-glade/components/BuildingComponents';
import {builtinBuildingAssetFiles,BUILTIN_BUILDING_ASSETS} from '@galacean/engine-building/tiny-glade/resources/BuiltinBuildingAssets';
import {RuntimeNativeEditor} from '@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor';
import {nativeToolSchemas} from '@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-tools';
import {RuntimeProjectSession} from '@galacean/engine-runtime-editor/project/runtime-project-session';
import {RuntimeProjectStorage,RUNTIME_PROJECT_SAVE_VERSION} from '@galacean/engine-project/runtime-editor/project/runtime-project';
const output=document.querySelector('#result')!;
const source: GalaceanSourceSceneFile={asset:{version:'2.0'},scene:{rootEntities:['group'],background:{mode:0,color:{r:.1,g:.1,b:.1,a:1}}},entities:[
 {id:'group',name:'Group',children:['house']},
 {id:'house',name:'House',components:['house-component'],children:['window']},
 {id:'window',name:'Window',position:[0,1,3],components:['window-component']}],components:[
 {id:'house-component',type:'HouseComponent',props:{assets:{$ref:BUILTIN_BUILDING_ASSETS},shape:{$type:'RectangularBuildingShape',width:8,depth:6}}},
 {id:'window-component',type:'WindowComponent',props:{width:1.2,height:1.5}}]};
const terrain={revision:0,grid:{samples:new Uint16Array(4),resolution:2,origin:[-30,-30] as [number,number],size:60,decode:{offset:0,scale:1}}};
const initial={version:RUNTIME_PROJECT_SAVE_VERSION,project:{scene:'Building.scene',files:[{virtualPath:'Building.scene',path:'Building.scene',type:'Scene',dependencies:[BUILTIN_BUILDING_ASSETS]},...builtinBuildingAssetFiles]},contents:{'Building.scene':JSON.stringify(source)}};
async function open(id:string, useHost=false){
 const engine=await WebGLEngine.create({canvas:document.querySelector('canvas')!,shaderCompiler:new ShaderCompiler()});
 const project=await RuntimeProjectSession.open(id,initial.project,location.href);
 engine.resourceManager.registerVirtualResources(await project.resources());
 const scene=await engine.resourceManager.load<Scene>({type:AssetType.Scene,url:'Building.scene'});
 engine.sceneManager.activeScene=scene;
 const editor=new RuntimeNativeEditor(project,scene),system=BuildingSystem.forScene(scene);
 const camera=scene.createRootEntity('Camera').addComponent(Camera);
 camera.entity.transform.setPosition(12,8,17);camera.entity.transform.lookAt(new Vector3(0,3,0));
 let host: NativeBuildingHost | undefined;
 if(useHost){
  host=new NativeBuildingHost(project,editor.editor,scene,camera);
  const world=await host.prepare({terrain,signal:new AbortController().signal});
  world.assertCurrent();world.commitPublication();world.activate();
  world.startEntrance();
  // A failed consumer must not prevent reveal; successful worlds can prepare again.
  if(!project.runtimeDiagnostics().length){
   const next=await host.prepare({terrain,signal:new AbortController().signal});
   next.assertCurrent();next.commitPublication();next.activate();next.startEntrance();
   if(system.terrainEditPending)throw Error('Repeated publication left a pending terrain candidate');
  }
 }else{
  system.bind({camera,terrain,frame:body=>body.entity.parent??body.entity,identity:component=>editor.projection.queryComponents().find(x=>editor.projection.component(x.id)===component)!.id,resolve:id=>editor.projection.component(id)});
  project.registerRuntimeActivation({before:async()=>{},after:async()=>{system.invalidate();await system.flush();}});
 }
 return {engine,project,editor,system,close(){host?.dispose();editor.dispose();project.dispose();engine.destroy();}};
}
async function run(){
 registerBuildingAssetComponents();
 const results:any[]=[];(window as any).crResults=results;
 const cases=[
  {name:'valid-name',tool:'entity.update',args:{id:'house',patch:{name:'Renamed'}}},
  {name:'invalid-window-rotation',tool:'entity.update',args:{id:'window',patch:{rotation:[0,30,0]}}},
  {name:'oversize-window',tool:'component.update',args:{id:'window-component',props:{width:100}}},
  {name:'remove-house-component',tool:'component.remove',args:{id:'house-component'}},
  {name:'elevate-group',tool:'entity.update',args:{id:'group',patch:{position:[0,1,0]}}},
  {name:'valid-window-size',tool:'component.update',args:{id:'window-component',props:{width:1.4}}},
  {name:'remove-surface-host',tool:'component.remove',args:{id:'house-component'}},
  {name:'elevate-bare-group',tool:'entity.update',args:{id:'group',patch:{position:[0,1,0]}}},
  {name:'disable-window-and-remove-body',tool:'component.remove',args:{id:'house-component'}},
  {name:'delete-house-entity',tool:'entity.delete',args:{id:'house'}},
  ...['brick','roof','plaster'].map(unit=>({name:'remove-kit-'+unit,tool:'asset.update',args:{path:BUILTIN_BUILDING_ASSETS},unit})),
  ...['roof_colors','timberframe'].map(unit=>({name:'remove-texture-'+unit,tool:'asset.update',args:{path:BUILTIN_BUILDING_ASSETS},unit})),
  ...['wrong-unit-stride','scaled-unit-root','disabled-unit-root','disabled-unit-renderer','disabled-unit-component'].map(name=>({name,tool:'asset.update',args:{path:'Building/Units/Prefabs/brick.prefab'}}))
 ];
 for(const c of cases){
  const id='validation-'+crypto.randomUUID();
  const start=structuredClone(initial);
  if(c.name==='remove-surface-host'||c.name==='elevate-bare-group'){
   const bare=structuredClone(source);bare.entities=bare.entities.filter(e=>e.id!=='window');
   bare.components=bare.components.filter(c=>c.id!=='window-component');bare.entities.find(e=>e.id==='house')!.children=[];
   if(c.name==='remove-surface-host'){
    bare.components.push({id:'surface-component',type:'BuildingSurfaceComponent',props:{}});
    bare.entities.find(e=>e.id==='house')!.components!.push('surface-component');
   }
   start.contents['Building.scene']=JSON.stringify(bare);
  }
  const storage=await RuntimeProjectStorage.open();await storage.save(id,start);storage.close();
  let live=await open(id);await live.system.flush();
  const assetPath=c.tool==='asset.update'?(c.args as {path:string}).path:undefined;
  if(assetPath)await live.project.fileProvider().prepare!(assetPath);
  const assetBefore=assetPath?live.project.projectPackage.contents[assetPath]:undefined;
  const result:any={test:c.name,before:true};results.push(result);output.textContent=JSON.stringify(results,null,2);
  const signal=new AbortController().signal,tx=live.editor.beginEdit(crypto.randomUUID(),signal);
  const sourceBefore=live.project.projectPackage.contents['Building.scene'],revisionBefore=live.project.publicationRevision;
  const windowBefore=live.editor.projection.component('window-component');
  let undo:any;
  try{
   if(c.name==='disable-window-and-remove-body'){
    await tx.tools!.find(t=>t.name==='component.update')!.execute({scene:'Building.scene',id:'window-component',props:{enabled:false}},{signal} as any);
   }
   let input:any={scene:'Building.scene',...c.args};
   if(assetPath){
    const edited=JSON.parse(assetBefore as string);
    if(c.name==='wrong-unit-stride')edited.components.find((c:any)=>c.type==='BuildingUnitComponent').props.instanceStride=48;
    else if(c.name==='scaled-unit-root')edited.entities.find((e:any)=>e.id===edited.root).scale=[2,2,2];
    else if(c.name==='disabled-unit-root')edited.entities.find((e:any)=>e.id===edited.root).isActive=false;
    else if(c.name==='disabled-unit-renderer')edited.components.find((c:any)=>c.type==='MeshRenderer').props.enabled=false;
    else if(c.name==='disabled-unit-component')edited.components.find((c:any)=>c.type==='BuildingUnitComponent').props.enabled=false;
    else if('unit' in c && typeof c.unit==='string')delete edited.components[0].props[c.name.startsWith('remove-texture-')?'textures':'units'][c.unit];
    else throw Error('Unknown asset fixture: '+c.name);
    input={path:assetPath,content:JSON.stringify(edited)};
   }
   const args=(nativeToolSchemas as any)[c.tool].parse(input);
   result.toolResult=await tx.tools!.find(t=>t.name===c.tool)!.execute(args,{signal} as any);
   await tx.prepare(signal);result.prepared=true;
   await tx.commit();result.committed=true;
   undo=tx.captureUndo();
   try { await tx.activate(signal); result.runtimeErrors=[]; result.activated=true; }
   catch(error) { result.runtimeErrors=[String(error)]; result.activated=false; }
   await live.project.flush();
  }catch(error){result.error=String(error);tx.discard();}
  const check=(ok:unknown,label:string)=>{if(!ok)throw Error(c.name+': '+label);};
  check(result.prepared&&result.committed&&!result.error,'valid author data is saved independently of runtime errors');
  const failed=['invalid-window-rotation','oversize-window','remove-house-component','elevate-group','remove-surface-host','elevate-bare-group','remove-kit-brick','remove-kit-roof','wrong-unit-stride','scaled-unit-root','disabled-unit-root','disabled-unit-renderer','disabled-unit-component','remove-texture-roof_colors','remove-texture-timberframe'].includes(c.name);
  check(failed?result.runtimeErrors.length:result.activated,'runtime outcome is reported separately');
  check(live.project.persistenceStatus.state==='saved','checkpoint saved current author state');
  const stored=await RuntimeProjectStorage.open();const saved=await stored.load(id);stored.close();
  check(saved!.contents['Building.scene']===live.project.projectPackage.contents['Building.scene'],'stored author data matches working author data');
  if(assetPath)check(saved!.contents[assetPath]===live.project.projectPackage.contents[assetPath],'stored asset matches the edit, even on runtime failure');
  live.close();
  // Native Scene loads independently of building readiness, even from a failed preview.
  live=await open(id,true);result.freshSceneLoaded=true;
  check(failed?live.project.runtimeDiagnostics().length:!live.project.runtimeDiagnostics().length,"startup reports consumer diagnostics without blocking editor");
  result.editorReopened=true;
  try{await live.system.flush();result.freshEngineReady=true;}catch(error){result.freshEngineError=String(error);}
  check(failed?result.freshEngineError:result.freshEngineReady,'fresh runtime preserves the saved outcome');
  const recovery=live.editor.beginEdit(crypto.randomUUID(),signal);
  await recovery.restoreUndo(undo);await recovery.prepare(signal);
  await recovery.commit();await recovery.activate(signal);await live.project.flush();
  check(!live.project.runtimeDiagnostics().length,"repair clears runtime diagnostics");
  result.undoRecovered=true;
  live.close();output.textContent=JSON.stringify(results,null,2);
 }
 (window as any).crDone=true;
}
document.querySelector('#run')!.addEventListener('click',()=>void run().catch(error=>{(window as any).crError=String(error);output.textContent+=String(error);}));
