import {ROCK_ATOMS} from '@galacean/engine-world-planning/landforms/RockAtoms';
import {composeStudy,presetConfig,shapeDefaults,planningAtomCatalog} from '@galacean/engine-world-planning/landforms/InteractiveLandforms';
import './style.css';
import {buildLandform,type LandformKind} from '@galacean/engine-world-planning/landforms/Landforms';
import {renderLandform as renderProjection,type View} from './Projection.ts';
import {DEFAULT_LANDFORM_METRICS as metrics} from '@galacean/engine-world-planning/landforms/LandformMetrics';
const atomLabels:Partial<Record<keyof typeof ROCK_ATOMS,string>>={crown:'峰体',spire:'峰体','crown/spire':'峰体',wall:'岩壁','buttress/shoulder':'山肩','terrace/cap':'台地',skirt:'裙边'};
const renderLandform=(form:ReturnType<typeof buildLandform>,view:View)=>renderProjection(form,view,atomLabels);
const kinds:LandformKind[]=['canyon','cliff','plateau','peaks','pass'];
// Both atlas tabs use the same normalized atomic profiles.
const atlasCatalog=planningAtomCatalog();
const forms=kinds.map(kind=>buildLandform(kind,{},atlasCatalog));
const params=new URLSearchParams(location.search),single=forms.find(f=>f.kind===params.get('kind'));
const selectedView:View=params.get('view')==='top'?'top':'oblique';
const app=document.querySelector('#app')!;
if(single){
 document.body.className='single';
 app.innerHTML=`<h1>${single.label} <span>${single.description}</span></h1>${renderLandform(single,selectedView)}<p>占地 ${Math.round(single.footprintAreaM2)} m² · 顶高 ${single.maxHeightM.toFixed(1)} m · ${single.atoms.length} 个原子 / ${single.boxes.length} 个 OBB</p>`;
}else{
 const atomKinds=['crown','wall','buttress/shoulder','terrace/cap','skirt'] as const;
 const atomForms=atomKinds.map(shape=>{
  const form=composeStudy({...presetConfig('atom'),shape,...shapeDefaults(shape)});
  form.label=atomLabels[shape]??ROCK_ATOMS[shape].label;
  for(const atom of form.atoms){atom.id=`atlas-${shape}`;for(const [i,box] of atom.boxes.entries())box.id=`${atom.id}:${i}`;}
  return form;
 });
 app.innerHTML=`<header><div><small>LANDFORM ATLAS / METRIC WHITEBOX</small><h1>岩石与地貌 · 同一组 OBB，两个视角</h1><p>峰体、岩壁、山肩、台地、裙边组合表达体量与留白。虚线范围来自实际投影并集，没有外套的大包围盒。</p></div><aside>行走 <b>${metrics.walkSpeedMps} m/s</b>　跑步 <b>${metrics.runSpeedMps} m/s</b><br>原子间距基准 <b>${metrics.walkSpeedMps*metrics.atomExposureSeconds} m</b>　参考高度 <b>${metrics.referenceHeightM} m</b></aside></header>
 <nav role="tablist" aria-label="图集分类"><button id="atlas-landforms-tab" role="tab" aria-selected="true" aria-controls="atlas-landforms">地貌结构 · 5 种</button><button id="atlas-atoms-tab" role="tab" aria-selected="false" aria-controls="atlas-atoms">原子化岩石 · 5 种</button></nav>
 <div id="atlas-landforms" role="tabpanel" aria-labelledby="atlas-landforms-tab"><nav><span class="key spire">峰体</span><span class="key wall">岩壁</span><span class="key shoulder">山肩</span><span class="key terrace">台地</span><span class="key skirt">裙边</span><span>紫色虚线：占地并集</span><span>蓝色：尺度参考 / 留白，非实体道路与河流</span></nav>
 ${forms.map((f,i)=>`<section data-form="${f.kind}"><div class="row-head"><h2><em>0${i+1}</em>${f.label}<span>${f.description}</span></h2><p>占地 <b>${Math.round(f.footprintAreaM2)} m²</b> · 顶高 <b>${f.maxHeightM.toFixed(1)} m</b> · ${f.atoms.length} 原子 / ${f.boxes.length} OBB</p></div><div class="views">${renderLandform(f,'top')}${renderLandform(f,'oblique')}</div><div class="row-foot">尺度参考线 ${f.lengthM.toFixed(0)} m · 匀速步行 ${f.walkSeconds.toFixed(0)} s / 跑步 ${f.runSeconds.toFixed(1)} s <span>点选任意体块查看原子尺寸</span></div></section>`).join('')}
 </div><div id="atlas-atoms" role="tabpanel" aria-labelledby="atlas-atoms-tab" hidden><p class="atom-intro">全部原子同时展示；名称表示形状起点，尺寸与峰顶位置可以调整。鞍部／缺口属于组合，不列为单块原子。</p>
 ${atomForms.map((f,i)=>{const a=f.atoms[0];return `<section><div class="row-head"><h2><em>0${i+1}</em>${f.label}</h2><p>宽 ${a.width.toFixed(1)} × 长 ${a.depth.toFixed(1)} × 高 ${a.height.toFixed(1)} m · ${f.boxes.length} OBB</p></div><div class="views">${renderLandform(f,'top')}${renderLandform(f,'oblique')}</div><div class="row-foot">占地 ${f.footprintAreaM2.toFixed(0)} m² · 示例尺寸<span>点选查看原子尺寸</span></div></section>`;}).join('')}</div>
 <footer>时间为尺度参考线长度 / 速度，不代表已实现可行走道路。基础平面白盒；未生成海拔、真实水体或岩石素材。配置仅在底层维护。</footer><output id="selection" hidden></output>`;
 const info=document.querySelector<HTMLOutputElement>('#selection')!;
 for(const mode of ['landforms','atoms'])document.getElementById(`atlas-${mode}-tab`)!.onclick=()=>{
  for(const candidate of ['landforms','atoms']){
   document.getElementById(`atlas-${candidate}`)!.hidden=candidate!==mode;
   document.getElementById(`atlas-${candidate}-tab`)!.setAttribute('aria-selected',String(candidate===mode));
  }
  info.hidden=true;
 };

 app.addEventListener('click',event=>{
  const target=(event.target as Element).closest('[data-atom]');if(!target)return;
  const id=target.getAttribute('data-atom'),atom=[...forms,...atomForms].flatMap(f=>f.atoms).find(a=>a.id===id);if(!atom)return;
  app.querySelectorAll('[data-atom]').forEach(e=>e.classList.toggle('selected',e.getAttribute('data-atom')===id));
  info.hidden=false;info.textContent=`${atomLabels[atom.kind]??ROCK_ATOMS[atom.kind].label} · 宽 ${atom.width.toFixed(1)} / 长 ${atom.depth.toFixed(1)} / 高 ${atom.height.toFixed(1)} m · 朝向 ${(atom.yaw*180/Math.PI).toFixed(0)}° · 底高 ${atom.baseY.toFixed(1)} m`;
 });
}
