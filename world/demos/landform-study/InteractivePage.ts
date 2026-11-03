import {STUDY_PRESETS,presetConfig,composeStudy,shapeDefaults,type StudyConfig} from '@galacean/engine-world-planning/landforms/InteractiveLandforms';
import {ROCK_ATOMS,type AtomKind} from '@galacean/engine-world-planning/landforms/RockAtoms';
import {renderLandform} from './Projection.ts';
let config=presetConfig('peaks'),resolved=composeStudy(config),pending=0;
let activeMode:'atoms'|'landforms'='landforms';
const tabConfigs={atoms:presetConfig('atom'),landforms:{...config}};
const fields:[keyof StudyConfig,string,number,number,number,string][]=[
 ['width','原子基准宽度',6,80,1,'m'],['depthRatio','长／宽比例',.2,2,.05,''],['height','基准高度',4,100,1,'m'],['topRatio','顶部／底部宽度',.1,1,.05,''],['peakX','峰顶左右偏移',-.45,.45,.05,''],['peakZ','峰顶前后偏移',-.45,.45,.05,''],
 ['seconds','地貌参考通过时间',10,180,5,'s'],['detailSeconds','单岩间隔时间',4,30,1,'s'],['bend','骨架弯曲程度',0,1,.05,''],['spread','横向开阔程度',4,80,1,'m'],['variation','主次高度变化',0,.8,.05,''],['yaw','整体朝向',-180,180,5,'°']
];
const app=document.querySelector('#app')!;
app.innerHTML=`<header><small>参数化岩石与地貌 / 阶段一</small><h1>形状可以变化，结构可以组合</h1><p>米制 OBB 研究台 · 单文件离线使用 · 行走 2 m/s，跑步 8 m/s</p></header><nav role="tablist" aria-label="研究对象"><button role="tab" id="tab-atoms">原子化岩石</button><button role="tab" id="tab-landforms">地貌结构</button></nav><div class="workspace"><aside><label id="preset-label">地貌预设<select id="preset">${Object.entries(STUDY_PRESETS).filter(([key])=>key!=='atom').map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label id="shape-label">形状起点<select id="shape">${(Object.keys(ROCK_ATOMS) as AtomKind[]).filter(k=>k!=='saddle/notch'&&k!=='crown/spire').map(k=>`<option value="${k}">${ROCK_ATOMS[k].label}</option>`).join('')}</select></label><p id="shape-rule" class="hint"></p><div id="variations"></div><p class="hint">预设给出起点；长宽高、峰顶位置和体块分布都可继续调整。只显示当前对象实际使用的参数。</p>${fields.map(([key,label,min,max,step,unit])=>`<label class="parameter">${label}<output id="value-${key}"></output><input id="${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}"><small>${unit}</small></label>`).join('')}<div class="actions"><button id="reset">重置当前预设</button><button id="export">导出配置与 OBB</button><label class="import">导入配置<input id="import" type="file" accept=".json,application/json"></label></div></aside><article><div id="summary"></div><div id="views"></div><output id="selection">点选体块，查看组成原子的实际尺寸。</output><p id="state" role="status"></p><details><summary>这些参数控制什么</summary><p>通过时间 × 步速控制布局长度；单岩间隔时间 × 步速控制分布间距。它们只是尺度推导，不保证实际视觉停留时间。图中蓝线是参考线或留白，不是实体道路或河流。</p><p>部分地貌会根据段落长度调整原子宽度以形成连续结构，实际尺寸请点选查看。原子模式可独立验证全部形状参数；地貌自动选择原子形状，仅显示有效的组合参数。</p><p>这是正交投影的 OBB 白盒；未包含真实岩石、FBM、物理行走、全局模块约束、悬挑或岩门。峰顶偏移限制在可支持区间内，不产生无支撑的悬空体。</p></details><details><summary>速度与底层尺度</summary><label>行走速度（m/s）<input id="walk" type="number" min=".5" max="6" step=".5" value="2"></label><label>跑步速度（m/s）<input id="run" type="number" min="1" max="16" step="1" value="8"></label><p>这里是研究配置，未新增到世界规划器的用户语义面板。改变跑速只更新时间估算。</p></details></article></div><footer>内嵌全部逻辑、样式与图形，无需联网或附带文件。当前收敛为 4 种组合预设与单原子模式。</footer>`;
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
function enabled(key:keyof StudyConfig){
 if(activeMode==='atoms')return ['width','depthRatio','height','yaw',...(config.shape==='mass'?[]:['topRatio','peakX','peakZ'])].includes(key);
 return ['height','seconds','spread','variation','yaw',...(config.preset==='plateau'?[]:['bend','detailSeconds'])].includes(key);
}
function sync(){
 app.setAttribute('data-mode',activeMode);
 el('shape-rule').textContent=activeMode==='atoms'?'名称表示初始轮廓。尺寸、顶部宽度和偏移直接修改几何，不按形状名称拒绝修改。':'由地貌选择峰体、岩壁、山肩或台地；变化保持既定的组合关系。';
 el('shape-label').hidden=activeMode!=='atoms';
 el('tab-atoms').setAttribute('aria-selected',String(activeMode==='atoms'));el('tab-landforms').setAttribute('aria-selected',String(activeMode==='landforms'));
 el('preset-label').hidden=activeMode==='atoms';
 el('variations').innerHTML=(activeMode==='atoms'?['基础','宽厚','加高',config.shape==='buttress/shoulder'||config.shape==='skirt'?'反向':'偏移']:['均衡','开阔','紧凑','起伏']).filter((_,i)=>!(activeMode==='atoms'&&config.shape==='mass'&&i===3)).map((label,i)=>`<button data-variation="${i}">${label}</button>`).join('');

 el<HTMLSelectElement>('preset').value=config.preset;el<HTMLSelectElement>('shape').value=config.shape;
 el<HTMLSelectElement>('shape').disabled=false;
 for(const [key,,,,,unit] of fields){const input=el<HTMLInputElement>(key);input.value=String(config[key]);input.disabled=!enabled(key);input.closest('label')!.hidden=!enabled(key);el(`value-${key}`).textContent=`${Number(Number(config[key]).toFixed(2))}${unit?' '+unit:''}`;input.closest('label')!.classList.toggle('inactive',!enabled(key));}
 el<HTMLInputElement>('walk').value=String(config.walk);el<HTMLInputElement>('run').value=String(config.run);
}
function render(){
 const start=performance.now();
 try{const next=composeStudy(config);resolved=next;
  el('views').innerHTML=renderLandform(next,'top')+renderLandform(next,'oblique');
  const extentX=Math.max(...next.boxes.map(b=>b.center.x+Math.abs(Math.cos(b.yaw))*b.sizeX/2+Math.abs(Math.sin(b.yaw))*b.sizeZ/2))-Math.min(...next.boxes.map(b=>b.center.x-Math.abs(Math.cos(b.yaw))*b.sizeX/2-Math.abs(Math.sin(b.yaw))*b.sizeZ/2));
  el('summary').innerHTML=`<h2>${next.label}</h2><div><b>${next.atoms.length}</b> 原子 · <b>${next.boxes.length}</b> OBB · 占地 <b>${next.footprintAreaM2.toFixed(0)} m²</b> · 顶高 <b>${next.maxHeightM.toFixed(1)} m</b></div><p>X 向跨度 ${extentX.toFixed(1)} m${['atom','peak'].includes(config.preset)?'':` · 尺度预算 ${next.lengthM.toFixed(0)} m · 行走 ${next.walkSeconds.toFixed(0)} s / 跑步 ${next.runSeconds.toFixed(1)} s`}</p>`;
  el('state').textContent=`已更新 · ${Math.round(performance.now()-start)} ms`;el('state').className='ok';
  el('selection').textContent='点选体块，查看组成原子的实际尺寸。';
 }catch(error){el('state').textContent=`未应用，保留上一有效图形：${error instanceof Error?error.message:String(error)}`;el('state').className='error';}
}
function schedule(){sync();if(pending)cancelAnimationFrame(pending);pending=requestAnimationFrame(()=>{pending=0;render();});}
for(const [key] of fields)el<HTMLInputElement>(key).oninput=e=>{(config as unknown as Record<string,unknown>)[key]=Number((e.target as HTMLInputElement).value);schedule();};
el<HTMLSelectElement>('preset').onchange=e=>{config={...presetConfig((e.target as HTMLSelectElement).value as StudyConfig['preset']),walk:config.walk,run:config.run};schedule();};
el<HTMLSelectElement>('shape').onchange=e=>{config.shape=(e.target as HTMLSelectElement).value as AtomKind;config={...config,...shapeDefaults(config.shape)};schedule();};
for(const key of ['walk','run'] as const)el<HTMLInputElement>(key).onchange=e=>{config[key]=Number((e.target as HTMLInputElement).value);schedule();};
el('reset').onclick=()=>{config={...presetConfig(config.preset),...(activeMode==='atoms'?{shape:config.shape,...shapeDefaults(config.shape)}:{})};schedule();};
el('export').onclick=()=>{try{const snapshot=composeStudy(config);const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,units:'metres',config,snapshot},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='landform-study.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{el('state').textContent='当前配置无效，请先修正再导出。';}};
el<HTMLInputElement>('import').onchange=async e=>{const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;try{const data=JSON.parse(await file.text()),candidate=data.config??data;composeStudy(candidate);tabConfigs[activeMode]={...config};config={...candidate};activeMode=config.preset==='atom'?'atoms':'landforms';schedule();}catch{el('state').textContent='配置无效，已保留当前结果。';}finally{el<HTMLInputElement>('import').value='';}};
el('views').onclick=e=>{const target=(e.target as Element).closest('[data-atom]');if(!target)return;const id=target.getAttribute('data-atom'),a=resolved.atoms.find(a=>a.id===id);if(!a)return;el('views').querySelectorAll('[data-atom]').forEach(node=>node.classList.toggle('selected',node.getAttribute('data-atom')===id));el('selection').textContent=`${ROCK_ATOMS[a.kind].label} · 宽 ${a.width.toFixed(1)} × 长 ${a.depth.toFixed(1)} × 高 ${a.height.toFixed(1)} m · 中心 (${a.x.toFixed(1)}, ${a.z.toFixed(1)}) m · 底高 ${a.baseY.toFixed(1)} m`;};
function mode(next:'atoms'|'landforms'){if(next===activeMode)return;tabConfigs[activeMode]={...config};activeMode=next;config={...tabConfigs[next]};schedule();}
 el('tab-atoms').onclick=()=>mode('atoms');el('tab-landforms').onclick=()=>mode('landforms');
 el('variations').onclick=event=>{
  const button=(event.target as Element).closest('[data-variation]');if(!button)return;
  const index=Number(button.getAttribute('data-variation'));
  if(activeMode==='atoms'){
   const base=shapeDefaults(config.shape);
   const values=[base,{...base,width:Math.min(80,base.width*1.3),height:Math.max(4,base.height*(config.shape==='spire'?1:.75)),topRatio:Math.min(1,base.topRatio+.15)},
    {...base,width:Math.max(6,base.width*.8),height:Math.min(100,base.height*1.4),topRatio:Math.max(.1,base.topRatio-.1)},
    {...base,peakX:config.shape==='buttress/shoulder'||config.shape==='skirt'?.45:.4,peakZ:-.25}][index];
   config={...config,...values};config.topRatio=Math.max(.1,Math.min(1,config.topRatio));
  }else{
   const values=[{spread:30,bend:.35,variation:.4,height:40,topRatio:.3},{spread:60,bend:.25,variation:.2,height:26,topRatio:.65},{spread:12,bend:.55,variation:.35,height:48,topRatio:.35},{spread:30,bend:.8,variation:.75,height:64,topRatio:.18}][index];
   config={...config,...values};config.topRatio=Math.max(.1,Math.min(1,config.topRatio));
  }
  schedule();
 };
 sync();render();
