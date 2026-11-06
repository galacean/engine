import { source, read, mapPoint, newDefinition, massFromRegion, addNode, addRoute, addPOI, addControl, addView, write } from './build-utils.mjs';

const data = source('C02');
const def = newDefinition('C02', '弯峡谷与支谷：初见、暂隐、再见', read('data/prompts.json').C02);
const point = (x, y, height) => mapPoint(data, x, y, height);
def.recipe.roughness = 4;
const selected = [
  ['mountain-001', 'west-cliff', '西侧连续峡壁', 60, 24],
  ['mountain-002', 'screening-shoulder', '支谷口与南侧山肩', 11, 24],
  ['mountain-003', 'north-cliff', '北侧连续峡壁', 40, 24],
  ['terrace-001', 'destination-terrace', '支谷目标台地', 70, 10]
];
for (const [sourceId, id, label, height, cellSize] of selected) {
  const region = data.regions.find(region => region.id === sourceId);
  const converted = massFromRegion(data, region, height, { id, label, cellSize, profile: [1] });
  def.masses.push(converted.mass); def.provenance.massMappings.push(converted.provenance);
}

const spawn = point(469, 1480); Object.assign(def.recipe.spawn, spawn, { yaw: 0 });
const first = point(500, 950), hidden = point(440, 810), junction = point(432, 630), reveal = point(680, 710), entry = point(830, 645);
// The first glimpse has an authored gentle rise; ownership groups never supply hidden terrain height.
const firstRise = { id: 'first-glimpse-rise', label: '初见位置缓坡', center: first,
  radiusX: 50, radiusZ: 70, yaw: 0, height: 6, plateau: 0.15, roughness: 0 };
def.recipe.elevations.push(firstRise);
const riseHeight = p => {
  const d = Math.hypot((p.x - first.x) / firstRise.radiusX, (p.z - first.z) / firstRise.radiusZ);
  const t = Math.max(0, Math.min(1, (1 - d) / (1 - firstRise.plateau)));
  return firstRise.height * t * t * t * (t * (t * 6 - 15) + 10);
};
addNode(def, 'first-glimpse', '主峡谷初见位置', first, firstRise.height);
addNode(def, 'behind-shoulder', '贴近山肩的暂隐位置', hidden);
addNode(def, 'branch-junction', '支谷分岔', junction);
addNode(def, 'branch-reveal', '进入支谷重新看见', reveal);
addNode(def, 'terrace-entry', '台地下观景区入口', entry);

const routes = [
  ['main-approach', '主峡谷接近', 'spawn', 'first-glimpse', [[469, 1400], [478, 1330], [457, 1250], [425, 1190], [415, 1110], [446, 1030]], 0, 0],
  ['main-hide', '绕近山肩', 'first-glimpse', 'behind-shoulder', [[489, 905], [468, 870], [442, 835]], 0, 0],
  ['main-junction', '沿岸到达支谷口', 'behind-shoulder', 'branch-junction', [[436, 754], [428, 700], [430, 654]], 0, 0],
  ['branch-climb', '支谷转折', 'branch-junction', 'branch-reveal', [[470, 607], [510, 592], [560, 614], [610, 635], [640, 690]], 0, 0],
  ['terrace-arrival', '台地下观景区到达', 'branch-reveal', 'terrace-entry', [[730, 718], [765, 704], [800, 681], [820, 662]], 0, 0]
];
for (const [id, label, from, to, pixels, startY, endY] of routes) {
  const heights = Array.from({ length: pixels.length + 2 }, (_, i) => startY + (endY - startY) * i / (pixels.length + 1));
  addRoute(def, id, label, from, to, pixels.map(p => point(...p)), 'shore-route', 5, heights);
}
for (const route of def.recipe.routes.filter(route => ['main-approach', 'main-hide'].includes(route.id))) {
  const position = id => id === 'spawn' ? def.recipe.spawn : def.recipe.routeNodes.find(node => node.id === id).position;
  route.pointElevations = [position(route.from), ...route.controls, position(route.to)].map(riseHeight);
}
addPOI(def, 'branch-place', '台地下观景区', entry, 0, 'terrace-entry', 'terrace-arrival', 8);
addNode(def, 'north-continuation', '主峡谷继续向北', point(490, 30));
const northPath = [[462,550],[530,459],[574,367],[558,291],[523,215],[480,126]];
addRoute(def,'main-continuation','主峡谷向北延续','branch-junction','north-continuation',northPath.map(p=>point(...p)),'shore-route',5,new Array(northPath.length+2).fill(0));
def.recipe.views = [
  { id: 'first-view', from: 'first-glimpse', target: 'branch-place', mode: 'visible', minimum: 0.5, maximum: 1, hard: false },
  { id: 'brief-hide', from: 'behind-shoulder', target: 'branch-place', mode: 'screened', minimum: 0, maximum: 0.25, hard: false },
  { id: 'branch-return', from: 'branch-reveal', target: 'branch-place', mode: 'visible', minimum: 0.5, maximum: 1, hard: false }
];
for (const relation of def.recipe.views) relation.target = 'destination-terrace:column:0:3';

const riverPixels = [[420, 10], [405, 100], [455, 205], [500, 295], [523, 365], [483, 450], [424, 560], [380, 640], [423, 760],
  [435, 840], [465, 940], [410, 1030], [370, 1130], [430, 1270], [439, 1330], [405, 1420], [416, 1520]];
def.recipe.riverNodes = [{ id: 'canyon-source', ...point(...riverPixels[0]), level: -0.1 },
  { id: 'canyon-outlet', ...point(...riverPixels.at(-1)), level: -2 }];
def.recipe.rivers = [{ id: 'canyon-river', label: '峡谷主河', from: 'canyon-source', to: 'canyon-outlet', controls: riverPixels.slice(1, -1).map(p => point(...p)),
  width: 18, widthEnd: 22, widthSamples: [{ t: 0, width: 18 }, { t: 0.45, width: 9 }, { t: 0.52, width: 2 }, { t: 0.7, width: 14 }, { t: 1, width: 22 }], depth: 2, bankWidth: 4 }];

addControl(def, 'shoulder-height', '遮挡山肩高度', ['masses', 1, 'height'], 0, 45, 1);
addControl(def, 'terrace-height', '目标台地高度', ['masses', 3, 'height'], 25, 100, 1);
addControl(def, 'branch-width', '支谷通路宽度', ['recipe', 'routes', 3, 'width'], 3, 12, 1,
  [{ path: ['recipe', 'routes', 4, 'width'] }]);
const aim = point(812, 617, 35);
addView(def, 'overview', '弯峡谷整体', point(512, 1400, 650), point(512, 700, 15));
addView(def, 'glimpse', '初见', { ...first, y: firstRise.height + def.recipe.player.eyeHeight }, aim);
addView(def, 'hide', '暂隐', { ...hidden, y: 1.7 }, aim);
addView(def, 'reveal', '再见', { ...reveal, y: 1.7 }, aim);

def.provenance.annotations.push(
  { kind: 'authored-centrelines', source: 'road-001 / water-001 / water-002', routePixels: routes.map(route => ({ id: route[0], pixels: route[4] })), riverPixels,
    note: '橙/蓝色区域给出走向；中心线、流向、连接节点由人工语义标注。蓝色图像提取在狭窄处断成两块，显式连接该段，不伪装为自动恢复。' },
  { kind: 'authored-heights', heights: selected.map(entry => ({ source: entry[0], height: entry[3] })),
    note: '顶视图未提供高度；峡壁/山肩/台地高度是待验证的参数假设，颜色深浅未用作海拔。' },
  { kind: 'authored-terrain', elevation: firstRise,
    note: '初见位置显式抬高6米，并让接近/暂隐路线沿同一缓坡升降；地势不再从轮廓归属组隐式推导。' },
  { kind: 'visibility-intent', observers: ['first-glimpse', 'behind-shoulder', 'branch-reveal'], target: 'destination-terrace:column:0:3',
    note: '视觉目标是台地面向来路的真实前缘柱面，场所入口仍独立组织；不是要求从谷底看穿台地看见顶面的小标记。比例由compileStudy和StudyAudit对真实盒体重算，失败必须保留。' }
);
def.provenance.limitations.push('仅规划几何；不声明真实行走、坡度、通路全程净空或用户审美通过。',
  '仅提取面积超过1000 m²的主山体；小灰色碎片大多沿河路边缘，未赋予地貌语义，未自动生为散柱。',
  '多边形简化的最大顶点偏差逐项记录；柱格边缘误差由cellSize控制。');
write('data/C02.json', def);
write('data/C02-negative.json', { label: '将遮挡山肩降至0，检验暂隐是否失效', values: { 'shoulder-height': 0 } });
write('evidence/C02/annotation.json', { schema: 'semantic-study-annotation/1', source: data.source, ...def.provenance,
  negative: { parameter: 'shoulder-height', baseline: 11, value: 0, retainedExpectation: 'brief-hide visibleFraction <=0.25', measurementStatus: 'see independently generated measurements.json' } });
console.log(JSON.stringify({ case: def.id, masses: def.masses.length, routes: def.recipe.routes.length, views: def.recipe.views.length }));
