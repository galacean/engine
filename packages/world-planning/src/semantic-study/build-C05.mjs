import fs from 'node:fs';
import path from 'node:path';
import {directory,read,write,source,massFromRegion,addNode,addRoute,addPOI,addControl,addView,simplifyRing} from './build-utils.mjs';
const def=structuredClone(read('data/C01.json')),data=source('C05'),r=def.recipe;
def.id='C05';def.title='C05 锁区续接与回望';def.prompt=fs.readFileSync(path.join(directory,'data/prompt-C05.txt'),'utf8').trim();
def.controls=[];def.viewpoints=[];def.provenance={sourceCase:'C01',lockedInputArrays:['masses','routes','routeNodes','rivers','riverNodes','lakes','pois'],massMappings:[],annotations:[],limitations:[]};
r.size=2048;
const p=(x,y,h)=>({x:+((x-627)*900/1254).toFixed(3),z:+(-940+y*1.45).toFixed(3),...(h===undefined?{}:{y:h})});
/** Clip only the generated northern proposal; the redrawn old region is discarded. */
function clipNorth(points,maxY){const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],ia=a[1]<=maxY,ib=b[1]<=maxY;if(ia)out.push(a);if(ia!==ib){const t=(maxY-a[1])/(b[1]-a[1]);out.push([a[0]+(b[0]-a[0])*t,maxY]);}}return out;}
for(const key of ['mountain-003','mountain-006','mountain-008','mountain-009']){
 const region=data.regions.find(v=>v.id===key),ring=clipNorth(region.polygons[0].pixelOutline,265).map(v=>p(...v));
 const item=massFromRegion(data,region,key==='mountain-009'?65:42,{id:'c05-'+key,label:'扩展谷地山群',cellSize:32});
 item.mass.outline=simplifyRing(ring);item.provenance.transform='new northern pixels only: x=(px-627)*900/1254; z=-940+py*1.45; clipped py<=265';
 def.masses.push(item.mass);def.provenance.massMappings.push(item.provenance);
}
const terrace=data.regions.find(v=>v.id==='terrace-002'),site=p(891,98),shape=massFromRegion(data,terrace,20,{id:'c05-place-mass',label:'新谷地停留台地',cellSize:16,profile:[1,1]});
shape.mass.outline=simplifyRing(terrace.polygons[0].pixelOutline.map(v=>p(...v)));def.masses.push(shape.mass);def.provenance.massMappings.push(shape.provenance);
const oldTop=r.routeNodes.find(n=>n.id==='c01-top'),oldShoulder=r.routeNodes.find(n=>n.id==='c01-shoulder');
addNode(def,'c05-pass','区域接口山口',{x:50,z:-492},30);addNode(def,'c05-place-entry','新场所入口',site,20);
addRoute(def,'c05-outbound','旧高台经山口进入新谷','c01-top','c05-pass',[{x:oldTop.position.x+100,z:-290},{x:25,z:-380}],'ridge-route',6,[oldTop.elevation,65,42,30]);
addRoute(def,'c05-new-valley','进入新谷地','c05-pass','c05-place-entry',[p(535,310),p(610,234),p(760,198),p(851,130)],'valley-route',6,[30,24,15,15,18,20]);
addRoute(def,'c05-return','沿东肩回接旧山肩','c05-place-entry','c01-shoulder',[p(870,200),p(980,320),{x:410,z:-350},{x:330,z:-210}],'ridge-route',6,[20,24,30,40,45,oldShoulder.elevation]);
addPOI(def,'c05-place','新谷地停留与回望',site,20,'c05-place-entry','c05-new-valley',16);
const lake=r.lakes.find(v=>v.id==='c01-lake'),newStart=p(588,36),riverIndex=r.rivers.length;
r.riverNodes.push({id:'c05-head',...newStart,level:1},{id:'c05-mouth',...lake.center,level:lake.level});
r.rivers.push({id:'c05-river',label:'新谷溪流续接旧湖',from:'c05-head',to:'c05-mouth',controls:[p(680,109),p(633,174),p(582,229),p(447,198),p(299,245),{x:lake.center.x,z:-455}],width:22,widthEnd:30,depth:3,bankWidth:6,fitTerrain:false,lakeId:lake.id});
addView(def,'seam','山口：发现新谷',{x:50,y:31.7,z:-492},{...site,y:20});
addView(def,'arrival','抵达：回望原区域',{...site,y:21.7},{...oldTop.position,y:oldTop.elevation});
addControl(def,'newRiverWidth','扩展溪流宽度',['recipe','rivers',riverIndex,'width'],12,45,1,[{path:['recipe','rivers',riverIndex,'widthEnd'],offset:8}]);
addControl(def,'newMountainHeight','新谷围合高度',['masses',def.masses.length-5,'height'],15,80,1);
def.provenance.annotations=['保留完整C01语义输入；只采用生成图北部的轮廓，丢弃模型重画的旧区域。','新轮廓经明确坐标映射置于旧区以北；通路从已有节点接出并回接，溪流末点引用已有湖面。','高度、接口控制点及回程连接由AI补充，不能从图片唯一恢复。'];
def.provenance.limitations=['AI扩图没有保持旧区域或增大画布，此项输入保真失败。','原生单张heightmap最大513采样；范围1024→2048后间距2→4m，地形与部分依赖地形的制品可能改变，需独立比较，不能据输入未变宣称全场景无损扩展。','当前是语义接口续接，不证明跨区增量加载与任意3D扩图。'];
write('data/C05.json',def);write('evidence/C05/annotation.json',def.provenance);
write('data/C05-negative.json',{label:'抬高入旧湖末点，破坏接口水位',patches:[{path:['recipe','riverNodes',r.riverNodes.length-1,'level'],value:6}]});
const prompts=read('data/prompts.json');prompts.C05=def.prompt;write('data/prompts.json',prompts);
