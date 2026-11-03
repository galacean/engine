import { AssetType, Camera, Vector3, WebGLEngine, type Scene } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeProjectStorage, RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { BuildingSystem, MainBuildingComponent } from "@galacean/engine-building/tiny-glade/components/BuildingComponents";
import { registerBuildingAssetComponents } from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import { builtinBuildingAssetFiles, BUILTIN_BUILDING_ASSETS } from "@galacean/engine-building/tiny-glade/resources/BuiltinBuildingAssets";
import { mountNativeBuildingPanel } from "@galacean/engine-world-planning/masonry/NativeBuildingPanel";

const template={asset:{version:"2.0"},root:"group",entities:[
  {id:"group",name:"Building group",children:["house"]},
  {id:"house",name:"House",components:["body"],children:["window"]},
  {id:"window",name:"Template window",position:[0,1,3],components:["opening"]}
],components:[{id:"body",type:"HouseComponent",props:{assets:{$ref:BUILTIN_BUILDING_ASSETS}}},
  {id:"opening",type:"WindowComponent",props:{width:1.2,height:1.5}}]};
const initial:RuntimeProjectPackage={version:RUNTIME_PROJECT_SAVE_VERSION,project:{scene:"Main.scene",files:[
  {virtualPath:"Main.scene",path:"Main.scene",type:"Scene",dependencies:["Outer.prefab","Building.prefab"]},
  {virtualPath:"Building.prefab",path:"Building.prefab",type:"Prefab",dependencies:[BUILTIN_BUILDING_ASSETS]},
  {virtualPath:"Outer.prefab",path:"Outer.prefab",type:"Prefab",dependencies:["Building.prefab"]},...builtinBuildingAssetFiles
]},contents:{"Building.prefab":JSON.stringify(template),"Outer.prefab":JSON.stringify({asset:{version:"2.0"},root:"outer",entities:[
  {id:"outer",name:"Outer",children:["nested"]},{id:"nested",instance:{asset:{$ref:"Building.prefab"}}}
],components:[]}),"Main.scene":JSON.stringify({asset:{version:"2.0"},scene:{rootEntities:["parent"],background:{mode:0,color:{r:.2,g:.25,b:.3,a:1}}},entities:[
  {id:"parent",position:[10,0,20],rotation:[0,90,0],children:["a","b"]},
  {id:"a",instance:{asset:{$ref:"Outer.prefab"}}},
  {id:"b",position:[20,0,0],instance:{asset:{$ref:"Building.prefab"}}}
],components:[]})}};

async function run() {
  const checks:{name:string;ok:boolean}[]=[];
  (window as any).nativeAccessResults=checks;
  const check=(name:string,condition:unknown)=>{checks.push({name,ok:!!condition});if(!condition)throw Error(name);};
  const id="building-native-access-"+crypto.randomUUID(),signal=new AbortController().signal;
  registerBuildingAssetComponents();
  const storage=await RuntimeProjectStorage.open();await storage.save(id,initial);storage.close();
  let selected="",groupId="",expected:[number,number,number]=[0,0,0];
  for(let pass=0;pass<2;pass++) {
    const engine=await WebGLEngine.create({canvas:document.querySelector<HTMLCanvasElement>("canvas")!,shaderCompiler:new ShaderCompiler()});
    const project=await RuntimeProjectSession.open(id,initial.project,location.href);
    let editor:RuntimeNativeEditor|undefined,panel:ReturnType<typeof mountNativeBuildingPanel>|undefined,unregister:(()=>void)|undefined;
    try {
      engine.resourceManager.registerVirtualResources(await project.resources());
      const scene=await engine.resourceManager.load<Scene>({type:AssetType.Scene,url:"Main.scene"});engine.sceneManager.activeScene=scene;
      editor=new RuntimeNativeEditor(project,scene);
      const camera=scene.createRootEntity("Camera").addComponent(Camera);camera.entity.transform.setPosition(20,12,45);camera.entity.transform.lookAt(new Vector3(10,0,20));
      const system=BuildingSystem.forScene(scene);
      system.bind({camera,frame:body=>body.entity.parent??body.entity,identity:component=>editor!.projection.identityOf(component)!.id,resolve:id=>editor!.projection.component(id)});
      unregister=project.registerRuntimeActivation({before:()=>system.beginInputUpdate(),finish:()=>system.endInputUpdate(),after:()=>system.flush()});
      await system.flush();
      panel=mountNativeBuildingPanel(project,editor,()=>{},()=>{},{anchors:()=>[[50,60]],land:{sampleHeight:()=>0,isWater:()=>false}});
      const select=document.querySelector<HTMLSelectElement>('[data-field="component"]')!,text=document.querySelector<HTMLTextAreaElement>('#native-building-editor textarea')!;
      const choose=(id:string)=>{select.value=id;select.dispatchEvent(new Event("change"));return JSON.parse(text.value);};
      const click=async(action:string)=>{
        const button=document.querySelector<HTMLButtonElement>(`#native-building-editor [data-action="${action}"]`)!;button.click();
        const start=performance.now();while(button.disabled){if(performance.now()-start>60000)throw Error("Panel action timeout");await new Promise(resolve=>setTimeout(resolve,20));}
        const message=document.querySelector("#native-building-editor output")!.textContent??"";
        if(!message.startsWith("已提交到 Scene"))throw Error(message);
      };
      if(pass===1) {
        const value=choose(selected);
        check("fresh Engine: nested window authoring survives save",value.entity.name==="Edited window"&&value.props.width===1.3);
        const position=editor.projection.entity(groupId)!.transform.worldPosition;
        check("fresh Engine: moved group survives save",Math.abs(position.x-50)<1e-4&&Math.abs(position.z-60)<1e-4);
        check("fresh Engine: native authored local position survives save",JSON.stringify(editor.projection.readEntity(groupId).position)===JSON.stringify(expected));
        continue;
      }
      const belongsToA=(record:{entityId:string})=>{
        let entity=editor!.projection.entity(record.entityId);
        while(entity){if(entity===editor!.projection.entity("a"))return true;entity=entity.parent ?? undefined;}
        return false;
      };
      const windowRecord=editor.projection.queryComponents({type:"WindowComponent"}).find(belongsToA)!;
      selected=windowRecord.id;
      check("nested Prefab window can be inspected",choose(selected).entity.name==="Template window");
      const liveWindow=editor.projection.component(selected)!;
      check("linked component reverse identity",editor.projection.sourceIdentity(liveWindow)?.componentId===selected);
      check("linked Entity reverse identity",editor.projection.sourceIdentity(liveWindow.entity)?.entityId===windowRecord.entityId);
      const view=editor.projection.readEntity(windowRecord.entityId);view.name="do not mutate source";
      check("authored read is detached",editor.projection.readEntity(windowRecord.entityId).name==="Template window");
      const value=choose(selected);value.entity.name="Edited window";value.props.width=1.3;text.value=JSON.stringify(value);await click("apply");
      check("panel creates nested component override",editor.projection.readComponent(windowRecord).props!.width===1.3);
      check("panel creates nested Entity override",choose(selected).entity.name==="Edited window");
      const house=editor.projection.component(editor.projection.queryComponents({type:"HouseComponent"}).find(belongsToA)!.id) as MainBuildingComponent;
      const group=system.groupEntity(house);groupId=editor.projection.sourceIdentity(group)!.entityId;
      const other=editor.projection.entity("b")!.transform.worldPosition.clone();
      await click("place");
      const moved=editor.projection.entity(groupId)!;
      check("group move uses world anchor under rotated parent",Math.abs(moved.transform.worldPosition.x-50)<1e-4&&Math.abs(moved.transform.worldPosition.z-60)<1e-4);
      expected=editor.projection.readEntity(groupId).position!;
      check("group move creates native instance override",expected!==undefined);
      check("other instance remains unchanged",Vector3.distance(other,editor.projection.entity("b")!.transform.worldPosition)<1e-5);
      check("Prefab template remains unchanged",project.projectPackage.contents["Building.prefab"]===initial.contents["Building.prefab"]&&project.projectPackage.contents["Outer.prefab"]===initial.contents["Outer.prefab"]);
      await click("undo");
      check("undo restores moved group",Math.abs(editor.projection.entity(groupId)!.transform.worldPosition.x-10)<1e-4);
      choose(selected);await click("place");
      check("window stays selectable after group replacement",choose(selected).entity.name==="Edited window");
      const stale=editor.projection.entity("b")!;
      const tx=editor.beginEdit("template-change",signal),tool=tx.tools.find(tool=>tool.name==="asset.update")!;
      const next=structuredClone(template);next.entities[1].name="Updated house";
      await tool.execute(tool.parseInput({path:"Building.prefab",content:JSON.stringify(next)}),{signal});await tx.prepare(signal);await tx.commit();await tx.activate(signal);
      check("template change replaces live instance",editor.projection.entity("b")!==stale);
      check("retired instance has no current identity",editor.projection.sourceIdentity(stale)===undefined);
      check("replacement Entity retains reverse identity",editor.projection.sourceIdentity(editor.projection.entity("b")!)?.entityId==="b");
      check("nested overrides survive template change",choose(selected).entity.name==="Edited window");
      await project.flush();
    } finally {panel?.destroy();unregister?.();editor?.dispose();project.dispose();engine.destroy();}
  }
  return checks;
}
document.querySelector<HTMLButtonElement>("#run")!.onclick=async()=>{
  try {await run();}catch(error){(window as any).nativeAccessError=error instanceof Error?error.stack:String(error);}
  finally {(window as any).nativeAccessDone=true;document.querySelector("#result")!.textContent=JSON.stringify({checks:(window as any).nativeAccessResults,error:(window as any).nativeAccessError},null,2);}
};
