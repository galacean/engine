import {source,mapPoint,newDefinition,massFromRegion,addNode,addRoute,addPOI,addControl,addView,read,write} from './build-utils.mjs';
const id='C01',data=source(id),p=(x,y,h)=>mapPoint(data,x,y,h);
const def=newDefinition(id,'C01 跨河登高',read('data/prompts.json')[id]);
const r=def.recipe;
for(const region of data.regions.filter(x=>x.kind==='mountain'&&x.area.worldSquareMetres>12000)){
 const height=region.id==='mountain-001'?32:region.centroid.world.z>0?46:72;
 const item=massFromRegion(data,region,height,{id:`c01-${region.id}`,label:region.id==='mountain-001'?'登高山肩与山脊':'围合山群',cellSize:28,profile:region.id==='mountain-001'?[1,1,.8,.65,.45,.28,.12]:[.6,.85,1,.75,.45]});
 def.masses.push(item.mass);def.provenance.massMappings.push(item.provenance);
}
const terrace=data.regions.find(x=>x.kind==='terrace'),deck=massFromRegion(data,terrace,80,{id:'c01-terrace',label:'高处观景台地',cellSize:12,profile:[1,1]});
def.masses.push(deck.mass);def.provenance.massMappings.push(deck.provenance);
const spawn=p(835,1090),near=p(1070,895),far=p(1038,720),shoulder=p(835,495),goal=p(212,345);
// An actual northern edge of the extracted terrace, inside the finite column footprint.
const observationEdge={x:-282.65625,z:-241.31093721066668};
const pullFacadeId='c01-terrace:column:9:7';
r.spawn={...spawn,yaw:0,elevation:0};
addNode(def,'c01-near','近岸跨越入口',near);addNode(def,'c01-far','对岸跨越出口',far);addNode(def,'c01-shoulder','山肩节点',shoulder,35);addNode(def,'c01-top','观景台入口',goal,80);
addRoute(def,'c01-bank','沿岸寻找跨越','spawn','c01-near',[p(745,1000),p(725,950),p(870,925)],'shore-route',6,[0,0,0,0,0]);
addRoute(def,'c01-bridge','跨越河流','c01-near','c01-far',[],'crossing',8,[0,0]);
addRoute(def,'c01-shoulder-path','沿山肩登高','c01-far','c01-shoulder',[p(1025,675),p(950,642),p(961,565),p(920,515)],'ridge-route',6,[0,10,20,26,30,35]);
addRoute(def,'c01-ridge-path','沿山脊抵达','c01-shoulder','c01-top',[p(700,470),p(649,444),p(620,370),p(555,352),p(370,401),p(300,407)],'ridge-route',6,[35,43,48,52,57,66,74,80]);
addNode(def,'c01-view-edge','台地北沿观景位置',observationEdge,80);
addRoute(def,'c01-terrace-stroll','从平台入口走到北沿','c01-top','c01-view-edge',[p(226,326),p(233,309)],'ridge-route',3,[80,80,80,80]);
addPOI(def,'c01-overlook','抵达后发现湖湾',goal,80,'c01-top','c01-ridge-path',12);
r.pois[0].rewardTargetIds=['c01-lake'];
r.pois[0].outline=deck.mass.outline.map(point=>({...point}));
r.pois[0].activityAreas.push({id:'c01-north-edge',label:'北沿观察带',purpose:'眺望后湖',outline:[
 {x:observationEdge.x-1,z:observationEdge.z},{x:observationEdge.x+1,z:observationEdge.z},
 {x:observationEdge.x+1,z:observationEdge.z+2},{x:observationEdge.x-1,z:observationEdge.z+2}
]});
const riverPoints=[[0,530],[190,695],[300,760],[510,762],[730,800],[945,785],[1047,791],[1140,747],[1250,670]].map(v=>p(...v));
r.riverNodes=[{id:'c01-in',...riverPoints[0],level:-.5},{id:'c01-out',...riverPoints.at(-1),level:-.5}];
r.rivers=[{id:'c01-river',label:'限制直达的河流',from:'c01-in',to:'c01-out',controls:riverPoints.slice(1,-1),width:86,widthEnd:82,depth:4,bankWidth:8,fitTerrain:false}];
const lakeRegion=data.regions.filter(x=>x.kind==='water'&&x.centroid.world.z<-220).sort((a,b)=>b.area.worldSquareMetres-a.area.worldSquareMetres)[0];
const lakeShape=massFromRegion(data,lakeRegion,1).mass.outline;
r.lakes=[{id:'c01-lake',label:'高台后方湖湾',center:lakeRegion.centroid.world,radiusX:80,radiusZ:55,yaw:0,level:-.5,depth:3,irregularity:0,outline:lakeShape}];
const lakeTarget={...r.lakes[0].center,y:-.5};
addView(def,'spawn','出生：看见高台',{...spawn,y:1.7},{...goal,y:80});
addView(def,'bridge','跨越：山肩与目标',{...near,y:2.7},{...goal,y:60});
addView(def,'arrival','抵达北沿：看见后谷',{...observationEdge,y:81.7},lakeTarget);
r.views=[{id:'c01-pull',label:'高台实际南向立面Pull',from:'spawn',target:pullFacadeId,mode:'visible',minimum:.25,maximum:1,hard:false},{id:'c01-hidden',from:'spawn',target:'c01-lake',mode:'screened',minimum:0,maximum:.15,hard:false},{id:'c01-reveal',from:'c01-view-edge',target:'c01-lake',mode:'visible',minimum:.5,maximum:1,hard:false}];
addControl(def,'riverWidth','河流宽度',['recipe','rivers',0,'width'],50,120,2,[{path:['recipe','rivers',0,'widthEnd'],scale:1,offset:-4}]);
const massIndex=def.masses.findIndex(m=>m.id==='c01-terrace');
addControl(def,'terraceHeight','观景台高度',['masses',massIndex,'height'],35,110,1,[{path:['recipe','routeNodes',3,'elevation']},{path:['recipe','routeNodes',4,'elevation']},{path:['recipe','pois',0,'elevation']},{path:['recipe','routes',3,'pointElevations',7]},...[0,1,2,3].map(index=>({path:['recipe','routes',4,'pointElevations',index]})),{path:['viewpoints',2,'position','y'],offset:1.7},{path:['viewpoints',0,'target','y']}]);
addControl(def,'shoulderHeight','山肩围合高度',['masses',0,'height'],12,110,1);
def.provenance.annotations=['出生、河中心线、跨越、连续路线与POI连接由AI对原图语义标注；灰/紫/湖轮廓来自自动分割。','80m台地和山群高度是设计假设，未从灰度猜高程。','道路按图中橙线标注；平台入口到北沿观景点的小段通路为后补设计。剖面为规划高度，不声称已完成真实行走。','原生POI快照原先正确记录elevation=80，却把markerBaseY错误设为地形0；现显式海拔同时驱动标记几何与视线采样。该修复不消除真实遮挡。','修正目标高度后，台地中央1.5m标记仍被80m台地自身前缘挡住；看见高台的Pull关系改为真实南向台地柱体立面，而非将中央标记当作整座高台。','从台地中央向下看湖同样被自身台面挡住。观察点移到北沿实际支柱顶面内侧0.25m，以新增平台短路接入入口，保留原Pull≥0.25、出生湖面≤0.15、抵达湖面≥0.5的关系要求。'];
def.provenance.limitations=['原图未严格保持纯色及不透明地面；已保存alpha/色彩统计。','俯视图不能证明先藏后露，使用实际几何射线补充检验。','高台Pull以一段真实前缘立面代表目标线索，不意味着整个台地或中央标记均可见。','观景位置依赖当前12m台地离散：记录其源轮廓及实际支柱；改变cellSize需要重新检查位置支撑和遮挡，不能沿用比例。'];
def.provenance.sightCorrection={
 originalFailures:{pull:0,reveal:0,poiTargetHeightBefore:0.375,poiAuthoredElevation:80},
 pull:{target:pullFacadeId,meaning:'真实80m台地前缘立面；不是空气中的代理靶',sourceMass:'c01-terrace'},
 arrival:{position:observationEdge,height:80,sourceColumn:'c01-terrace:column:7:0',insideNorthEdgeMetres:.25,pixel:{x:233.165625,y:290.7734274864711},connectingRoute:'c01-terrace-stroll'},
 negative:{control:'shoulderHeight',baseline:32,value:150,meaning:'加高原提取山肩轮廓，实际遮挡目标及后湖'}
};
write('data/C01.json',def);write('evidence/C01/annotation.json',def.provenance);write('data/C01-negative.json',{label:'加高山肩遮住高台与后谷',values:{shoulderHeight:150}});
