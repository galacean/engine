import { registerBuildingAssetComponents } from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import { generatedDecorationSeed } from "@galacean/engine-building/tiny-glade/runtime/ConstructionDecorationConfig";
import { builtinBuildingAssetFiles, BUILTIN_BUILDING_ASSETS } from "@galacean/engine-building/tiny-glade/resources/BuiltinBuildingAssets";
import { AssetType, Camera, Color, DirectLight, MeshRenderer, Vector3, WebGLEngine, type Scene } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { RigidDecorationRenderer } from "@galacean/engine-building/tiny-glade/runtime/RigidDecorationRenderer";
import { BuildingSystem, HouseComponent, WindowComponent } from "@galacean/engine-building/tiny-glade/components/BuildingComponents";
import { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeProjectStorage, RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { SeedWorldPicker } from "@galacean/engine-world-planning/world/SeedWorldPicker";

const status = document.querySelector<HTMLElement>("#status")!;
const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const input = document.querySelector<HTMLInputElement>("#width")!;
const projectId = "native-building-components-v11";
registerBuildingAssetComponents();
const source = {asset:{version:"2.0"},scene:{rootEntities:["house"],background:{mode:0,color:{r:0.12,g:0.17,b:0.21,a:1}}},
  entities:[{id:"house",name:"房子",components:["house-component"],children:["left","right"]},
    {id:"left",name:"左窗",position:[-2,1.2,3],components:["left-window"]},
    {id:"right",name:"右窗",position:[2,1.2,3],components:["right-window"]}],
  components:[{id:"house-component",type:"HouseComponent",props:{assets:{$ref:BUILTIN_BUILDING_ASSETS},shape:{$type:"RectangularBuildingShape",width:8,depth:6},height:4,roof:{tip:[0,0],profile:0,height:.5,ridge_length:.5,eave:.2,ridge_direction:0,flat_rim:0,color:0}}},
    {id:"left-window",type:"WindowComponent",props:{seed:generatedDecorationSeed(17,"left-window"),width:1.2,height:1.5}},
    {id:"right-window",type:"WindowComponent",props:{seed:generatedDecorationSeed(17,"right-window"),width:1.2,height:1.5}}]};
const initial: RuntimeProjectPackage = {version:RUNTIME_PROJECT_SAVE_VERSION,
  project:{scene:"Building.scene",files:[{virtualPath:"Building.scene",path:"Building.scene",type:"Scene",dependencies:[BUILTIN_BUILDING_ASSETS]},...builtinBuildingAssetFiles]},
  contents:{"Building.scene":JSON.stringify(source)}};
let engine: WebGLEngine, project: RuntimeProjectSession, editor: RuntimeEditor, scene: Scene, system: BuildingSystem, camera: Camera, picker: SeedWorldPicker;
let selected: string | undefined, busy = false, ready = false;
function setBusy(value: boolean) {
  busy = value;
  document.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = busy || !ready; });
}
// Acceptance-only isolation: wall backing shares the decoration draw, so hiding
// its renderer would also hide the windows whose GPU matrices we are testing.
let isolateDecorationPreview = false;
function showSelection(id?: string) {
  selected=id;
  const component=id ? editor.projection.component(id) : undefined;
  document.querySelector("#selection")!.textContent=component ? `${component.entity.name} · ${component.constructor.name}` : "尚未选择";
  if(component instanceof WindowComponent) input.value=String(component.width);
}
async function load() {
  const storage=await RuntimeProjectStorage.open();
  try { if(!await storage.load(projectId)) await storage.save(projectId,initial); } finally {storage.close();}
  project=await RuntimeProjectSession.open(projectId,initial.project,location.href);

  engine=await WebGLEngine.create({canvas,shaderCompiler:new ShaderCompiler()});
  engine.canvas.setResolution(canvas.clientWidth,canvas.clientHeight);
  engine.resourceManager.registerVirtualResources(await project.resources());
  scene=await engine.resourceManager.load<Scene>({type:AssetType.Scene,url:"Building.scene"});
  engine.sceneManager.activeScene=scene;
  editor=new RuntimeEditor(project,scene);
  camera=scene.createRootEntity("Camera").addComponent(Camera);
  camera.entity.transform.setPosition(11,8,17);camera.entity.transform.lookAt(new Vector3(0,3.5,0));
  camera.isOrthographic=true;camera.orthographicSize=8;
  const light=scene.createRootEntity("Sun").addComponent(DirectLight);
  light.entity.transform.setRotation(-40,-25,0);
  scene.ambientLight.diffuseSolidColor=new Color(0.5,0.5,0.5,1);
  system=BuildingSystem.forScene(scene);
  system.bind({camera,frame:body=>body.entity,resolve: id => isolateDecorationPreview && id === "house-component" ? undefined : editor.projection.component(id),identity(component){
    const identity=editor.projection.queryComponents().find(item=>editor.projection.component(item.id)===component);
    if(!identity) throw Error("Unpublished building component");return identity.id;
  }});
  project.registerRuntimeActivation({before:async()=>{},after:async()=>{system.invalidate();await system.flush();}});
  picker=new SeedWorldPicker(camera);
  await system.flush();engine.run();
  ready=true;
  status.textContent="已加载。编辑保存至本地项目。";
}
async function editWindow(id: string, width: number) {
  if (!Number.isFinite(width) || width <= 0) throw Error("窗宽必须为正数");
  const signal=new AbortController().signal, tx=editor.beginEdit(crypto.randomUUID(),signal);
  try {
    await tx.run(({draft,edited})=>{new RuntimeSceneEdit(draft,"Building.scene").updateComponent(id,{width});edited();},false);
    await tx.prepare(signal);await tx.commit();const preview=await tx.activate!(signal).then(() => ({runtimeErrors: [] as string[]})).catch(error => ({runtimeErrors: [String(error)]}));if(preview.runtimeErrors.length)throw Error(preview.runtimeErrors.join("\n"));await system.flush();
  } catch(error) {
    tx.discard();
    throw error;
  }
}
async function restoreUndo() {
  const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
  const latest=tx.history().undo[0];if(!latest)throw Error("没有可撤销的修改");
  await tx.moveHistory({direction:"undo",transactionIds:[latest.transactionId]});await tx.prepare(signal);await tx.commit();await tx.activate!(signal);await system.flush();
}
async function reload() {
  const id=selected;
  await project.flush();
  ready=false;
  picker.dispose();editor.dispose();project.dispose();engine.destroy();
  await load();showSelection(id);
}
async function action(run:()=>Promise<void>) {
  if(busy || !ready)return;setBusy(true);status.textContent="处理中…";
  try{await run();status.textContent="完成";}catch(error){status.textContent=String(error);console.error(error);}finally{setBusy(false);}
}
canvas.addEventListener("click",event=>{
  if(busy || !ready)return;const r=canvas.getBoundingClientRect();
  const id=picker.pick((event.clientX-r.left)*canvas.width/r.width,(event.clientY-r.top)*canvas.height/r.height,v=>system.visitPickBatches(v));
  const component=id ? system.resolve(id) : undefined;
  showSelection(component ? id : undefined);
});
document.querySelector("#apply")!.addEventListener("click",()=>void action(async()=>{
  if(!selected || !(editor.projection.component(selected) instanceof WindowComponent))throw Error("请先选择窗户");
  await editWindow(selected,Number(input.value));showSelection(selected);
}));
document.querySelector("#undo")!.addEventListener("click",()=>void action(async()=>{await restoreUndo();showSelection(selected);}));
document.querySelector("#reload")!.addEventListener("click",()=>void action(reload));

async function verify() {
  const checks:string[]=[];
  (window as any).buildingChecks = checks;
  const check=(condition:unknown,label:string)=>{if(!condition)throw Error(label);checks.push(label);};
  const left=editor.projection.component("left-window") as WindowComponent;
  const right=editor.projection.component("right-window") as WindowComponent;
  check(left instanceof WindowComponent && right instanceof WindowComponent,"真实 WindowComponent");
  const before=system.metrics(), old=left.width, other=right.width;
  function pickWindow(id:string,x:number){
    engine.update();
    const screen=new Vector3();camera.worldToScreenPoint(new Vector3(x,1.95,3.05),screen);
    const hit=picker.pick(screen.x,screen.y,v=>system.visitPickBatches(v));
    check(hit===id,`GPU 拾取 ${id}（实际 ${hit}）`);
    check(system.resolve(hit!)===editor.projection.component(id),`拾取返回 Scene 组件 ${id}`);
  }
  pickWindow("left-window",-2);pickWindow("right-window",2);
  await editWindow("left-window",old===1.6?1.4:1.6);
  check(editor.projection.component("left-window")===left,"编辑保持组件身份");
  check(right.width===other,"右窗未受左窗修改影响");
  check(system.metrics().draws===before.draws,"修改未拆分渲染批次");
  pickWindow("left-window",-2);pickWindow("right-window",2);
  await restoreUndo();check(left.width===old,"撤销恢复窗宽");
  await editWindow("left-window",1.4);await reload();
  check((editor.projection.component("left-window") as WindowComponent).width===1.4,"保存后新 Engine 重载窗宽");
  check((editor.projection.component("right-window") as WindowComponent).width===other,"重载保持右窗属性");
  pickWindow("left-window",-2);pickWindow("right-window",2);
  async function mutate(run:(draft:RuntimeSceneEdit)=>void) {
    const signal=new AbortController().signal,tx=editor.beginEdit(crypto.randomUUID(),signal);
    await tx.run(({draft,edited})=>{run(new RuntimeSceneEdit(draft,"Building.scene"));edited();},false);
    await tx.prepare(signal);await tx.commit();await tx.activate!(signal);
  }
  const validScene=project.projectPackage.contents["Building.scene"];
  let rejected=false;
  try { await editWindow("left-window",100); } catch { rejected=true; }
  check(rejected,"无法安装的窗宽明确失败");
  check(project.projectPackage.contents["Building.scene"]!==validScene,"预览失败保留已提交的作者数据");
  const failedSource=JSON.parse(project.projectPackage.contents["Building.scene"] as string);
  check(failedSource.components.find((component:{id:string})=>component.id==="left-window").props.width===100,"失败的窗宽仍可编辑或撤销");
  await restoreUndo();
  check(project.projectPackage.contents["Building.scene"]===validScene,"显式撤销恢复持久化 Scene");
  check((editor.projection.component("left-window") as WindowComponent).width===1.4,"显式撤销恢复真实组件属性");
  pickWindow("left-window",-2);pickWindow("right-window",2);
  const savedLeft=editor.projection.component("left-window");
  await mutate(draft=>draft.updateComponent("left-window",{enabled:false}));
  check(system.metrics().authoredObjects===2,"禁用窗组件退出运行集合");
  check(editor.projection.component("left-window")===savedLeft,"禁用保留 Scene 作者组件");
  check(!system.resolve("left-window"),"禁用窗口不可拾取");
  await restoreUndo();pickWindow("left-window",-2);
  await mutate(draft=>draft.updateComponent("house-component",{enabled:false}));
  check(system.metrics().houses===0,"禁用主体释放运行几何，装饰保持作者数据");
  await restoreUndo();pickWindow("right-window",2);
  await mutate(draft=>draft.delete("left"));
  check(!editor.projection.component("left-window") && !system.resolve("left-window"),"删除窗实体清理组件与拾取映射");
  pickWindow("right-window",2);
  await restoreUndo();pickWindow("left-window",-2);
  const renderers = () => {
    const values: unknown[] = [];
    system.visitPickBatches(batch => values.push(batch.renderer));
    return values;
  };
  const sameRenderers = (previous: unknown[]) => {
    const current = renderers();
    return current.length === previous.length && current.every((value, i) => value === previous[i]);
  };
  const priorWindow = editor.projection.component("left-window")!;
  const priorRenderers = renderers();
  const signal = new AbortController().signal, reset = editor.beginEdit(crypto.randomUUID(), signal);
  await reset.run(({draft, edited}) => {
    registerBuildingAssetComponents();
const source = JSON.parse(draft.read("Building.scene") as string);
    delete source.components.find((component: {id: string}) => component.id === "left-window").props.height;
    draft.update("Building.scene", JSON.stringify(source)); edited();
  }, false);
   await reset.prepare(signal); await reset.commit();await reset.activate!(signal);
  check(priorWindow.destroyed && editor.projection.component("left-window") !== priorWindow, "恢复默认值替换组件实例");
  check(sameRenderers(priorRenderers), "同几何组件替换复用渲染器");
  pickWindow("left-window", -2);
  await restoreUndo(); pickWindow("left-window", -2);

  const house = editor.projection.component("house-component") as HouseComponent;
  const currentWindow = editor.projection.component("left-window") as WindowComponent;
  const stationaryRenderers = renderers();
  house.entity.transform.setPosition(0.2, 0, 0); await system.flush();
  check(sameRenderers(stationaryRenderers), "整体移动不重建几何");
  const height = house.height;
  let moving = true, ticks = 0, frame = 0, timeout: ReturnType<typeof setTimeout> | undefined;
  const move = () => {
    if (!moving) return;
    house.entity.transform.setPosition((++ticks % 20) * 0.01, 0, 0);
    if (ticks === 1) {
      // Supersede a real in-flight build, including a local transform change.
      house.height = height + 0.8;
      currentWindow.entity.transform.setPosition(-1, 1.2, 3);
    }
    frame = requestAnimationFrame(move);
  };
  try {
    house.height = height + 0.4;
    frame = requestAnimationFrame(move);
    await Promise.race([
      system.flush(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(Error("持续移动时几何更新未完成")), 15000); })
    ]);
    check(moving && ticks > 0, "持续移动期间仍能发布最新几何");
    check(!sameRenderers(stationaryRenderers), "实际局部输入变化重建几何");
    moving = false; cancelAnimationFrame(frame);
    house.entity.transform.setPosition(0, 0, 0); await system.flush();
    pickWindow("left-window", -1);
  } finally {
    moving = false; cancelAnimationFrame(frame); clearTimeout(timeout);
    house.height = height;
    house.entity.transform.setPosition(0, 0, 0);
    currentWindow.entity.transform.setPosition(-2, 1.2, 3);
    await system.flush();
  }
  pickWindow("left-window", -2); pickWindow("right-window", 2);
  // Direct runtime transforms: no editor activation or component setter to mask missed notifications.
  const transform = currentWindow.entity.transform;
  const width = currentWindow.width;
  const rigid = () => renderers().filter((value): value is RigidDecorationRenderer => value instanceof RigidDecorationRenderer);
  const pickPoint = (point: Vector3) => {
    engine.update();
    const screen = new Vector3(); camera.worldToScreenPoint(point, screen);
    return picker.pick(screen.x, screen.y, visitor => system.visitPickBatches(visitor));
  };
  const pickPreview = (x: number) => {
    engine.update();
    const hidden: Array<{ renderer: MeshRenderer; layer: MeshRenderer["entity"]["layer"] }> = [];
    try {
      // The old wall still occludes recessed glass until its new hole is published.
      // Hide both wall LODs by layer: camera synchronization owns renderer.enabled.
      // Full-scene picks after flush below still verify the actual wall holes.
      const occluders: MeshRenderer[] = [];
      house.entity.getComponentsIncludeChildren(MeshRenderer, occluders);
      for (const renderer of occluders) if (!(renderer instanceof RigidDecorationRenderer)) {
        hidden.push({ renderer, layer: renderer.entity.layer }); renderer.entity.layer = 0;
      }
      // Exercise the existing per-slot visibility resolver for backing geometry
      // in the merged draw. Window slots still resolve their actual Scene Entity.
      isolateDecorationPreview = true;
      const screen = new Vector3(); camera.worldToScreenPoint(new Vector3(x, 1.95, 3.05), screen);
      const hit = picker.pick(screen.x, screen.y, visitor => system.visitPickBatches(visitor));
      check(hit === "left-window", `旧批次 GPU 顶点即时跟随矩阵（实际 ${hit}）`);
    } finally {
      isolateDecorationPreview = false;
      for (const { renderer, layer } of hidden) renderer.entity.layer = layer;
    }
  };
  const wallAt = (x: number) => {
    const position = camera.entity.transform.position.clone(), rotation = camera.entity.transform.rotationQuaternion.clone();
    const disabled: RigidDecorationRenderer[] = [];
    try {
      // Look from inside through the front wall. Hide only decoration draws, leaving the real wall shader/mesh.
      camera.entity.transform.setPosition(x, 1.95, 2);
      camera.entity.transform.lookAt(new Vector3(x, 1.95, 4));
      engine.update();
      for (const renderer of rigid()) { renderer.enabled = false; disabled.push(renderer); }
      const screen = new Vector3(); camera.worldToScreenPoint(new Vector3(x, 1.95, 3), screen);
      return picker.pick(screen.x, screen.y, visitor => system.visitPickBatches(visitor));
    } finally {
      for (const renderer of disabled) renderer.enabled = true;
      camera.entity.transform.position = position; camera.entity.transform.rotationQuaternion = rotation;
    }
  };
  try {
    check(rigid().length > 0, "合批使用真实矩阵驱动 Renderer");
    for (const x of [-1, 0, -1]) {
      const previous = renderers();
      transform.setPosition(x, 1.2, 3);
      pickPreview(x);
      check(sameRenderers(previous), "重建完成前原批次立即跟随窗口矩阵");
      await system.flush();
      pickWindow("left-window", x);
    }
    check(wallAt(-2) === "house-component", "移动后旧窗洞恢复为墙");
    check(wallAt(-1) === undefined, "移动后新位置生成真实墙洞");
    const unscaled = renderers();
    transform.setScale(1.25, 1.15, 1.5);
    pickWindow("left-window", -1);
    check(sameRenderers(unscaled), "缩放预览不等待几何重建");
    await system.flush();
    check(wallAt(-1.78) === undefined, "横向缩放同步扩大墙洞");
    check(system.metrics().draws === before.draws, "移动缩放保持合批数量");
    const bounds = rigid().find(renderer => renderer.enabled)!.bounds;
    check(bounds.min.x < -1.7 && bounds.max.x > 2, "动态包围盒包含两扇独立窗口");

    // Same effective dimensions, different bind frame: must not reuse a stale inverse bind.
    currentWindow.width = width * 1.25;
    transform.setScale(1, 1.15, 1.5);
    await system.flush();
    check(pickPoint(new Vector3(-1.7, 1.95, 3.08)) === "left-window", "等尺寸参数与缩放互换后绑定正确");
    const movedHouse = renderers();
    house.entity.transform.setRotation(0, 12, 0);
    house.entity.transform.setScale(1.1, 1.2, .9);
    await system.flush();
    const expected = new Vector3();
    Vector3.transformCoordinate(new Vector3(0, .75, .08), transform.worldMatrix, expected);
    check(pickPoint(expected) === "left-window", "房屋旋转非均匀缩放只作用一次");
    check(sameRenderers(movedHouse), "房屋旋转缩放不重建局部几何");
    house.entity.transform.setRotation(0, 0, 0); house.entity.transform.setScale(1, 1, 1);
    transform.setRotation(0, 0, 15);
    let tiltedRejected = false;
    try { await system.flush(); } catch (error) { tiltedRejected = String(error).includes("zero local rotation"); }
    check(tiltedRejected, "倾斜窗口明确拒绝");
    transform.setRotation(0, 0, 0);
    await system.flush();
    transform.setScale(0, 1, 1);
    let singularRejected = false;
    try { await system.flush(); } catch (error) { singularRejected = String(error).includes("positive scale"); }
    check(singularRejected, "零缩放明确拒绝");
  } finally {
    house.entity.transform.setRotation(0, 0, 0); house.entity.transform.setScale(1, 1, 1);
    transform.setPosition(-2, 1.2, 3); transform.setRotation(0, 0, 0); transform.setScale(1, 1, 1);
    currentWindow.width = width;
    await system.flush();
  }
  pickWindow("left-window", -2); pickWindow("right-window", 2);
  (window as any).buildingResult={ok:true,checks,before,after:system.metrics()};
}
document.querySelector("#verify")!.addEventListener("click",()=>void action(async()=>{
  try{await verify();}catch(error){(window as any).buildingResult={ok:false,error:String(error)};throw error;}
}));
setBusy(false);
load().then(()=>setBusy(false)).catch(error=>{status.textContent=String(error);(window as any).buildingResult={ok:false,error:String(error)};console.error(error);});
