import {ROCK_ATOMS,compileRockAtom,type AtomKind} from '@galacean/engine-world-planning/landforms/RockAtoms';
import {DEFAULT_LANDFORM_METRICS as metrics} from '@galacean/engine-world-planning/landforms/LandformMetrics';
import {renderLandform} from './Projection.ts';
import type {Landform} from '@galacean/engine-world-planning/landforms/Landforms';
import {unionRectangles} from '@galacean/engine-world-planning/semantic-study/ComposedShape';
const kinds:AtomKind[]=['crown/spire','wall','buttress/shoulder','terrace/cap','saddle/notch','skirt'];
const descriptions=[
 '宽底、向上收窄、峰顶偏心；保留主峰的竖向轮廓，不要求保留方块阶梯。',
 '沿局部 X 延伸，Z 为厚度。保留主要崖面与连续体量，顶部可形成自然起伏。',
 '高端位于 −X，沿 +X 逐渐降低并展开；用于连接高体量与地面。',
 '宽基底、退台、宽顶；顶面提供承托空间，实际可行走性另行验证。',
 '两侧抬高，中间保持低口及上方净空；底座可填充，缺口上方不能被封住。',
 '低矮宽底，沿 +X 降低并延伸；用于山脚衔接，不应变成独立的高突起。'
];
const fmt=(v:number)=>Number(v.toFixed(2));
const atoms=kinds.map((kind,i)=>{const d=ROCK_ATOMS[kind],width=metrics.walkSpeedMps*metrics.atomExposureSeconds*d.widthFactor;return compileRockAtom({id:`atom-${i+1}`,kind,x:0,z:0,baseY:0,yaw:0,width,depth:width*d.depthPerWidth,height:metrics.referenceHeightM*d.heightFactor});});
function front(a:typeof atoms[number]){
 const k=Math.min(310/a.width,195/a.height),x=(v:number)=>200+v*k,y=(v:number)=>235-v*k;
 let s='<rect width="400" height="280" fill="#eef0e9"/><text x="15" y="24" fill="#50616a" font-size="12">正视 · 宽 × 高</text>';
 for(const b of [...a.boxes].sort((u,v)=>v.center.z-u.center.z))s+=`<rect data-box="${b.id}" x="${x(b.center.x-b.sizeX/2)}" y="${y((b.elevation??0)+b.sizeY)}" width="${b.sizeX*k}" height="${b.sizeY*k}" fill="#aabac2" stroke="#536874" stroke-width=".8"/>`;
 s+=`<path d="M ${x(-a.width/2)-8} 235 H ${x(a.width/2)+8}" stroke="#7a9381" stroke-width="2"/><text x="200" y="266" text-anchor="middle" font-size="12" fill="#50616a">宽 ${fmt(a.width)} m · 高 ${fmt(a.height)} m</text>`;
 if(a.kind==='saddle/notch')s+=`<rect x="${x(-a.width*.2)}" y="${y(a.height)}" width="${a.width*.4*k}" height="${a.height*.88*k}" fill="#ca888d22" stroke="#b46370" stroke-dasharray="4 3"/><text x="200" y="${y(a.height*.43)}" text-anchor="middle" font-size="11" fill="#9a4656">保留净空</text>`;
 return `<svg viewBox="0 0 400 280" role="img" aria-label="${ROCK_ATOMS[a.kind].label}正视图">${s}</svg>`;
}
const app=document.querySelector('#app')!;
app.innerHTML=`<header><small>独立原子目录 · 岩石实现研究</small><h1>六种岩石原子形状</h1><p>研究真实岩石如何实现规划 OBB 体量。每张卡片只展示一种原子，不包含地貌拼接。</p></header><div class="intro"><p><b>同一份米制尺寸，三种视图。</b>Y 向上、X 为宽、Z 为长／进深；底高 0 米、朝向 0°。白盒表达宏观体量，真实岩石不需要保留方块接缝，也不要求把所有 OBB 满体积填实。</p><p>重点保留形状职责、比例、朝向及显式净空；当前尺寸是可修改的默认值，尚未验证特定岩石素材的适配能力。点选体块可查看尺寸。所有图形和数据均内嵌，无需联网。</p></div>
${atoms.map((a,i)=>{
 const outlines=unionRectangles(a.boxes.map(b=>({id:b.id,x:b.center.x,z:b.center.z,width:b.sizeX,length:b.sizeZ,yaw:0})),1e-5);
 const area=Math.abs(outlines.reduce((sum,r)=>sum+r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p.x*q.z-q.x*p.z;},0)/2,0));
 const f:Landform={kind:'peaks',label:ROCK_ATOMS[a.kind].label,description:'',atoms:[a],boxes:a.boxes,outlines,passages:[],marks:[],lengthM:0,walkSeconds:0,runSeconds:0,footprintAreaM2:area,maxHeightM:a.height,detailPitchM:0};
 return `<section><h2><span>0${i+1}</span>${ROCK_ATOMS[a.kind].label}</h2><p class="purpose">${descriptions[i]}</p><div class="metrics"><b>宽 ${fmt(a.width)} m</b><b>长 ${fmt(a.depth)} m</b><b>高 ${fmt(a.height)} m</b><span>宽 : 长 : 高 = 1 : ${fmt(a.depth/a.width)} : ${fmt(a.height/a.width)}</span><span>占地 ${fmt(area)} m² · ${a.boxes.length} 个 OBB</span></div><div class="views"><div>${renderLandform(f,'top')}</div><div>${front(a)}</div><div>${renderLandform(f,'oblique')}</div></div>${a.kind==='saddle/notch'?`<p class="void">中央净空宽 ${fmt(a.width*.4)} m；底座顶高 ${fmt(a.height*.12)} m。低口不代表已实现的地面通路。</p>`:''}<details><summary>组成 OBB 的米制尺寸与位置</summary><table><thead><tr><th>部件</th><th>中心 X / Z（米）</th><th>底高（米）</th><th>宽 × 长 × 高（米）</th><th>朝向</th></tr></thead><tbody>${a.boxes.map((b,j)=>`<tr data-box="${b.id}"><td>${j+1}</td><td>${fmt(b.center.x)} / ${fmt(b.center.z)}</td><td>${fmt(b.elevation??0)}</td><td>${fmt(b.sizeX)} × ${fmt(b.sizeZ)} × ${fmt(b.sizeY)}</td><td>0°</td></tr>`).join('')}</tbody></table></details></section>`;
}).join('')}<footer>单文件 HTML · 图形与数据全部内嵌 · 与地貌图集共用原子定义，此文件为导出时的快照。</footer><output id="selected" hidden></output>`;
app.addEventListener('click',event=>{
 const hit=(event.target as Element).closest('[data-box]');if(!hit)return;
 const id=hit.getAttribute('data-box'),a=atoms.find(a=>a.boxes.some(b=>b.id===id));if(!a)return;
 const b=a.boxes.find(b=>b.id===id)!;app.querySelectorAll('[data-box]').forEach(e=>e.classList.toggle('selected',e.getAttribute('data-box')===id));
 const out=document.querySelector<HTMLOutputElement>('#selected')!;out.hidden=false;out.textContent=`${ROCK_ATOMS[a.kind].label} · 部件 ${a.boxes.indexOf(b)+1} · 宽 ${fmt(b.sizeX)} / 长 ${fmt(b.sizeZ)} / 高 ${fmt(b.sizeY)} m · 底高 ${fmt(b.elevation??0)} m`;
});
