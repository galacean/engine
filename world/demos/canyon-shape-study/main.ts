import referenceUrl from "./reference.png?url";
import './style.css';
import {referenceContours,type Point} from './ReferenceContours.ts';
import {boxRing,type FitBox,measureCoverage} from './PolygonCoverage.ts';
import {fitDefaults} from './FitPolygon.ts';
type Result=typeof referenceContours[number]&{boxes:FitBox[];metrics:ReturnType<typeof measureCoverage>};
const path=(ring:Point[])=>'M'+ring.map(p=>`${p.x},${p.y}`).join('L')+'Z';
const targetPaths=referenceContours.map(r=>`<path d="${path(r.outline)}"/>`).join('');
const svg=(body:string)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="30 15 870 980" role="img">${body}</svg>`;
const outline=(fill:string)=>`<g fill="${fill}" stroke="#9b68c9" stroke-width="2.5">${targetPaths}</g>`;
const labels=`<g fill="#455164" font-size="18" font-family="system-ui"><text x="492" y="784">开阔入口</text><text x="448" y="567">错位窄口</text><text x="556" y="285">转折展开</text></g>`;
document.querySelector('#app')!.innerHTML=`
 <header><div><small>FORM STUDY / 01</small><h1>峡谷轮廓与 OBB 覆盖</h1><p>从参考图描出山体占地，再用矩形近似。目标轮廓固定，算法不改变它。</p></div><div class="actions"><button id="rerun">重新拟合并自测</button><button id="export" disabled>导出结果</button><button id="outline">下载轮廓 SVG</button></div></header>
 <section class="metrics" aria-label="覆盖自测"><div><span>左岸覆盖率</span><strong id="left">计算中</strong><small id="left-detail">目标 &gt; 90%</small></div><div><span>右岸覆盖率</span><strong id="right">计算中</strong><small id="right-detail">目标 &gt; 90%</small></div><div><span>矩形约束</span><strong>12—180 px</strong><small>长宽比 ≤ 4 · 每岸最多 160 块</small></div><div><span>自测状态</span><strong id="verdict">运行中</strong><small id="elapsed">独立计算多边形交并面积</small></div></section>
 <main><article><h2><b>01</b> 参考图 + 描绘轮廓</h2><div class="drawing" id="reference">${svg(`<image href="${referenceUrl}" x="0" y="0" width="1536" height="1024"/>${outline('#9b68c925')}`)}</div><p>紫色线为根据原图描绘的山体占地，含外侧山肩；不是图像自动分割。</p></article>
 <article><h2><b>02</b> 目标轮廓</h2><div class="drawing" id="target">${svg(outline('#c2c7cf')+labels)}</div><p>两岸分别定义；中间留白保留峡谷空间。本实验不描绘实际河道或海拔。</p></article>
 <article><h2><b>03</b> OBB 拟合 / 误差</h2><div class="drawing" id="fit">${svg(outline('#e4ba69'))}</div><p><i class="swatch covered"></i>已覆盖 <i class="swatch missed"></i>未覆盖 <i class="swatch leak"></i>越界</p></article></main>
 <footer><p><strong>覆盖率</strong> = 目标 ∩ 矩形并集 / 目标面积。重叠只计一次。<strong>越界率</strong> = 并集超出目标的面积 / 并集面积。</p><p>通过条件：两岸各自覆盖率 &gt; 90%，越界率 &lt; 0.2%。覆盖证明针对描绘的多边形；参考轮廓是否准确、美观需对照原图判断。坐标为参考图像素，尚未对应真实岩石素材尺寸。</p><output id="status" aria-live="polite">正在自动拟合…</output></footer>`;
let report:unknown;
function download(filename:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.querySelector<HTMLButtonElement>('#outline')!.onclick=()=>download('canyon-target-contours.svg',svg(outline('#c2c7cf')),'image/svg+xml');
document.querySelector<HTMLButtonElement>('#export')!.onclick=()=>download('canyon-obb-coverage.json',JSON.stringify(report,null,2),'application/json');
function run(){
 const button=document.querySelector<HTMLButtonElement>('#rerun')!;button.disabled=true;
 document.querySelector('#status')!.textContent='正在自动拟合，并独立计算交并面积…';document.querySelector('#verdict')!.textContent='运行中';
 const worker=new Worker(new URL('./Fit.worker.ts',import.meta.url),{type:'module'});
 const fail=(message:string)=>{button.disabled=false;worker.terminate();document.querySelector('#verdict')!.textContent='未完成';document.querySelector('#status')!.textContent=message;};
 worker.onerror=e=>fail(e.message);
 worker.onmessage=event=>{
  if(event.data.error){fail(event.data.error);return;}
  report=event.data;const results=event.data.results as Result[];
  const passed=results.every(r=>r.metrics.coverage>.9&&r.metrics.leakage<.002&&r.boxes.length<=fitDefaults.maxBoxes);
  for(const r of results){document.querySelector('#'+r.id)!.textContent=(r.metrics.coverage*100).toFixed(2)+'%';document.querySelector('#'+r.id+'-detail')!.textContent=`${r.boxes.length} 块 · 越界 ${(r.metrics.leakage*100).toFixed(4)}% · IoU ${(r.metrics.iou*100).toFixed(2)}%`;}
  const boxPaths=results.flatMap(r=>r.boxes.map(b=>`<path d="${path(boxRing(b))}"/>`)).join('');
  document.querySelector('#fit')!.innerHTML=svg(`<defs><mask id="outside"><rect x="0" y="0" width="1000" height="1100" fill="white"/><g fill="black">${targetPaths}</g></mask></defs>${outline('#e4ba69')}<g fill="#78aebe" stroke="#28536b" stroke-width=".75">${boxPaths}</g><g fill="#e34e4e" mask="url(#outside)">${boxPaths}</g>${outline('none')}`);
  document.querySelector('#verdict')!.textContent=passed?'通过':'未达标';document.querySelector('#verdict')!.className=passed?'pass':'fail';
  document.querySelector('#elapsed')!.textContent=`本次 ${Math.round(event.data.elapsedMs)} ms`;
  document.querySelector('#status')!.textContent=passed?'自测通过：两岸分别达到覆盖与越界阈值。':'自测未达标：已保留实际输出与误差，不隐藏失败。';
  document.querySelector<HTMLButtonElement>('#export')!.disabled=false;button.disabled=false;worker.terminate();
 };worker.postMessage({});
}
document.querySelector<HTMLButtonElement>('#rerun')!.onclick=run;
run();
