import {
  source, read, mapPoint, newDefinition, massFromRegion, simplifyRing, area, deviation,
  addNode, addRoute, addPOI, addControl, addView, write
} from './build-utils.mjs';

/** Build a two-branch C04 study from measured image contours and explicit vertical/topology annotations. */
const data = source('C04');
const definition = newDefinition('C04', '低谷与高脊：分叉、不同抵达、同处汇合', read('data/prompts.json').C04);
const recipe = definition.recipe;
const region = id => data.regions.find(item => item.id === id);
const point = (x, y, height) => mapPoint(data, x, y, height);
const line = pixels => pixels.map(([x, y]) => point(x, y));
const ridgeHeight = 40;
/** Retain the semantic north wall; the extracted gray component also includes a long low-saturation ground-shadow tail. */
function clipNorth(points, maximumZ) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i + points.length - 1) % points.length], current = points[i];
    if ((previous.z <= maximumZ) !== (current.z <= maximumZ)) {
      const t = (maximumZ - previous.z) / (current.z - previous.z);
      result.push({ x: previous.x + (current.x - previous.x) * t, z: maximumZ });
    }
    if (current.z <= maximumZ) result.push({ ...current });
  }
  return result;
}
const northWallCut = point(0, 242).z;
const massSettings = [
  ['mountain-001', 'central-perforated-mass', '分隔低谷与高脊的有孔主山体', 94, 20, [0.65, 0.85, 1, 0.84, 0.64]],
  ['mountain-002', 'north-pass-wall', '北端汇合山口外壁', 58, 24, [0.7, 0.9, 1, 0.86, 0.64]],
  ['mountain-003', 'west-valley-wall', '西低谷连续外壁', 66, 24, [0.8, 1, 0.9, 0.72, 0.62]],
  ['mountain-004', 'south-west-frame', '南侧前景山肩', 35, 24, [0.6, 0.8, 1, 0.8, 0.55]],
  ['mountain-005', 'south-east-frame', '东南前景山肩', 42, 24, [0.65, 0.85, 1, 0.85, 0.6]],
  ['mountain-006', 'terrace-shore-ledge', '紫台地外侧岩肩', 24, 16, [0.7, 1, 0.7]],
  ['terrace-001', 'ridge-terrace-mass', '紫色观景台地实体', ridgeHeight, 8, [1]],
  ['mountain-007', 'lake-island', '东部湖中岩岛', 24, 16, [0.7, 1, 0.7]]
];
for (const [sourceId, id, label, height, cellSize, profile] of massSettings) {
  const originalRegion = region(sourceId);
  const extracted = structuredClone(originalRegion);
  if (sourceId === 'mountain-002') {
    extracted.polygons[0].worldOutline = clipNorth(extracted.polygons[0].worldOutline, northWallCut);
    extracted.polygons[0].holes = extracted.polygons[0].holes.filter(hole => hole.worldOutline.every(p => p.z < northWallCut));
  }
  const converted = massFromRegion(data, extracted, height, { id, label, cellSize, profile });
  // Every transparent hole of a selected mass stays explicit, including the small central pinhole.
  const holeMappings = [];
  const holes = extracted.polygons[0].holes.map(hole => {
    const simplified = simplifyRing(hole.worldOutline, 1.5);
    holeMappings.push({ verticesBefore: hole.worldOutline.length, verticesAfter: simplified.length,
      areaBefore: area(hole.worldOutline), areaAfter: area(simplified),
      maximumVertexDeviation: deviation(hole.worldOutline, simplified), contents: hole.contents });
    return simplified;
  });
  if (holes.length) converted.mass.holes = holes;
  definition.masses.push(converted.mass);
  definition.provenance.massMappings.push({ ...converted.provenance, holeMappings,
    ...(sourceId === 'mountain-002' ? { semanticClip: { imageMaximumY: 242,
      originalArea: area(originalRegion.polygons[0].worldOutline), retainedArea: area(extracted.polygons[0].worldOutline),
      omittedHoles: originalRegion.polygons[0].holes.length - extracted.polygons[0].holes.length,
      reason: 'low-saturation shadow tail joins the true north wall to orange low-valley ground; explicit semantic crop, not automatic recovery' } } : {}) });
}

const spawn = region('spawn-001').centroid.world;
recipe.spawn = { ...spawn, yaw: 0, elevation: 0 };
const fork = point(588, 1080), rejoin = point(578, 142);
const lowStop = point(403, 590), highStop = point(970, 541);
addNode(definition, 'south-fork', '共同南分叉', fork, 0);
addNode(definition, 'valley-stop-entry', '西低谷近水停留入口', lowStop, 0);
addNode(definition, 'ridge-terrace-entry', '东高脊台地入口', highStop, ridgeHeight);
addNode(definition, 'north-rejoin', '共同北山口', rejoin, 0);

// Orange pixels supply horizontal route placement. All route heights below are authored assumptions.
const approachPixels = [[587, 1134], [587, 1105]];
const valleySouthPixels = [[570, 1050], [532, 1026], [494, 1005], [477, 974], [470, 927],
  [447, 884], [430, 846], [433, 801], [421, 768], [392, 731], [386, 700], [396, 655], [405, 615]];
const valleyNorthPixels = [[414, 555], [433, 524], [437, 498], [425, 471], [409, 449],
  [406, 426], [415, 403], [442, 373], [465, 338], [478, 296], [493, 258], [520, 217], [547, 177], [565, 149]];
const ridgeSouthPixels = [[620, 1054], [665, 1030], [717, 1003], [751, 963], [786, 928],
  [824, 902], [846, 858], [870, 809], [887, 758], [897, 711], [893, 670], [887, 638], [892, 613], [914, 586], [934, 561]];
const ridgeNorthPixels = [[938, 516], [929, 498], [900, 482], [881, 466], [872, 437],
  [855, 411], [843, 381], [837, 356], [827, 332], [801, 315], [775, 302], [751, 281],
  [744, 256], [729, 243], [699, 233], [671, 222], [655, 204], [636, 186], [608, 170], [591, 153]];
const interpolate = (pixels, from, to, start, end) => {
  const points = [from, ...line(pixels), to];
  const lengths = points.slice(1).map((p, index) => Math.hypot(p.x - points[index].x, p.z - points[index].z));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let travelled = 0;
  return points.map((_, index) => { if (index) travelled += lengths[index - 1]; return start + (end - start) * travelled / total; });
};
addRoute(definition, 'spawn-approach', '出生点接近共同分叉', 'spawn', 'south-fork', line(approachPixels), 'shore-route', 5,
  Array(approachPixels.length + 2).fill(0));
addRoute(definition, 'valley-south', '低谷支路南段：近水包围', 'south-fork', 'valley-stop-entry', line(valleySouthPixels), 'shore-route', 5,
  Array(valleySouthPixels.length + 2).fill(0));
addRoute(definition, 'valley-north', '低谷支路北段：穿过山口', 'valley-stop-entry', 'north-rejoin', line(valleyNorthPixels), 'shore-route', 5,
  Array(valleyNorthPixels.length + 2).fill(0));
addRoute(definition, 'ridge-south', '高脊支路南段：连续登高到台地', 'south-fork', 'ridge-terrace-entry', line(ridgeSouthPixels), 'ridge-route', 5,
  interpolate(ridgeSouthPixels, fork, highStop, 0, ridgeHeight));
addRoute(definition, 'ridge-north', '高脊支路北段：回落共同山口', 'ridge-terrace-entry', 'north-rejoin', line(ridgeNorthPixels), 'ridge-route', 5,
  interpolate(ridgeNorthPixels, highStop, rejoin, ridgeHeight, 0));
for (const route of recipe.routes) {
  route.sourceFeatureIds = route.id.startsWith('ridge') ? ['central-perforated-mass', 'east-basin'] : ['valley-river'];
  if (route.id.startsWith('ridge')) { route.solidSupport = true; route.ridgeBody = { width: 30, flankDrop: 0.85 }; }
}

// One continuous main river covers the western valley; the northern blue component continues behind the pass crossing.
const riverPixels = [[565, 4], [565, 49], [560, 83], [570, 121], [568, 144], [539, 178], [500, 209],
  [465, 238], [458, 270], [456, 304], [436, 337], [401, 364], [372, 390], [365, 417], [378, 450],
  [402, 482], [407, 513], [389, 540], [364, 564], [359, 592], [368, 625], [354, 660], [347, 696],
  [352, 724], [377, 747], [402, 775], [403, 809], [407, 852], [431, 896], [449, 934], [444, 968],
  [418, 990], [401, 1017], [371, 1052], [337, 1064], [301, 1066], [262, 1057], [226, 1034],
  [199, 1002], [171, 980], [138, 965], [105, 947], [70, 937], [36, 939], [3, 940]];
recipe.riverNodes = [{ id: 'valley-source', ...point(...riverPixels[0]), level: -1 },
  { id: 'valley-outlet', ...point(...riverPixels.at(-1)), level: -4 }];
recipe.rivers = [{ id: 'valley-river', label: '西谷主河', from: 'valley-source', to: 'valley-outlet',
  controls: line(riverPixels.slice(1, -1)), width: 16, widthEnd: 23, depth: 3, bankWidth: 3,
  fitTerrain: false, systemId: 'west-valley-system' }];
const lakeSource = region('water-001').polygons[0].worldOutline;
const lakeOutline = simplifyRing(lakeSource, 2.2);
recipe.lakes = [{ id: 'east-basin', label: '高脊抵达可见的东部盆地湖面', center: region('water-001').centroid.world,
  radiusX: 110, radiusZ: 263, yaw: 0, level: -3, depth: 5, irregularity: 0,
  outline: lakeOutline, systemId: 'east-basin-system' }];

addPOI(definition, 'valley-rest', '低谷近水停留区', lowStop, 0, 'valley-stop-entry', 'valley-south', 9);
recipe.pois[0].purpose = '在山体围合中近看主河；不以高处全景作为回报';
recipe.pois[0].arrivalRouteIds = ['valley-south', 'valley-north'];
recipe.pois[0].sourceFeatureIds = ['valley-river'];
recipe.pois[0].rewardTargetIds = ['valley-river'];
addPOI(definition, 'ridge-overlook', '高脊观湖台地', highStop, ridgeHeight, 'ridge-terrace-entry', 'ridge-south', 16);
const highPlace = recipe.pois[1];
highPlace.outline = definition.masses[6].outline.map(p => ({ ...p }));
highPlace.activityAreas[0].outline = highPlace.outline.map(p => ({ x: highStop.x + (p.x - highStop.x) * 0.55,
  z: highStop.z + (p.z - highStop.z) * 0.55 }));
highPlace.activityAreas[0].label = '可停留的观湖台面';
highPlace.purpose = '完成连续登高后俯看东部湖面，与西侧封闭低谷形成不同抵达';
highPlace.arrivalRouteIds = ['ridge-south', 'ridge-north'];
highPlace.sourceFeatureIds = ['ridge-terrace-mass', 'east-basin'];
highPlace.rewardTargetIds = ['east-basin'];
recipe.views = [
  { id: 'valley-near-water', label: '低谷抵达近看主河', from: 'valley-rest', target: 'valley-river', mode: 'visible', minimum: 0.1, maximum: 1, hard: false },
  { id: 'valley-screened-basin', label: '低谷被主山体遮住东湖', from: 'valley-rest', target: 'east-basin', mode: 'screened', minimum: 0, maximum: 0.15, hard: false },
  { id: 'ridge-basin-reward', label: '高脊抵达观湖收益', from: 'ridge-overlook', target: 'east-basin', mode: 'visible', minimum: 0.5, maximum: 1, hard: false }
];
addView(definition, 'south-fork-view', '南分叉 · 两条路线围绕主山', { ...fork, y: 1.7 }, point(588, 810, 30));
addView(definition, 'valley-view', '低谷抵达 · 近水与围合', { ...lowStop, y: 1.7 }, point(362, 593, -2));
addView(definition, 'ridge-view', '高脊抵达 · 东湖展开', { ...highStop, y: ridgeHeight + 1.7 }, point(1134, 493, -3));
addView(definition, 'north-rejoin-view', '北山口 · 回看两侧支路', { ...rejoin, y: 1.7 }, point(588, 340, 20));

const heightBindings = [{ path: ['recipe', 'routeNodes', 2, 'elevation'] },
  { path: ['recipe', 'pois', 1, 'elevation'] },
  { path: ['viewpoints', 2, 'position', 'y'], offset: 1.7 }];
for (const index of [3, 4]) recipe.routes[index].pointElevations.forEach((height, i) => {
  if (height > 0) heightBindings.push({ path: ['recipe', 'routes', index, 'pointElevations', i], scale: height / ridgeHeight });
});
addControl(definition, 'ridge-height', '高脊台地与整条升降剖面', ['masses', 6, 'height'], 12, 70, 2, heightBindings);
addControl(definition, 'fork-x', '共同分叉横移', ['recipe', 'routeNodes', 0, 'position', 'x'], fork.x - 14, fork.x + 14, 1,
  [{ path: ['viewpoints', 0, 'position', 'x'] }]);
addControl(definition, 'river-width', '主河宽度及下游展开', ['recipe', 'rivers', 0, 'width'], 9, 24, 1,
  [{ path: ['recipe', 'rivers', 0, 'widthEnd'], scale: 23 / 16 }]);

// Materialize the baseline through the same affine bindings used by later edits, avoiding round-trip float drift.
for (const control of definition.controls) {
  const primary = control.bindings[0];
  const current = primary.path.reduce((object, key) => object[key], definition);
  const value = (current - (primary.offset ?? 0)) / (primary.scale ?? 1);
  for (const binding of control.bindings) {
    const owner = binding.path.slice(0, -1).reduce((object, key) => object[key], definition);
    owner[binding.path.at(-1)] = value * (binding.scale ?? 1) + (binding.offset ?? 0);
  }
}

definition.provenance.annotations = [
  'The PNG supplies horizontal colour contours. Heights, profiles, water levels, shared nodes, route centrelines, and observer aims are explicit authored design additions.',
  'Both visible orange branches are split at usable places, but share the exact south-fork and north-rejoin routeNode positions and elevations. Node heights take precedence over cached route profile endpoints.',
  'Every extracted hole retained in a selected semantic mass is explicit as StudyMass.holes; central mountain-001 preserves both transparent holes, including its large interior void. The north wall gray component is explicitly cropped at image y=242 to remove a connected ground-shadow tail and its out-of-scope pinhole; original extracted data remains unchanged.',
  'Orange route placement follows the image. The eastern route gains a continuous authored height profile and a 30m broad supporting shoulder through existing native ridgeBody/solidSupport geometry.',
  'Only the western main river is traced. The separated northern blue patch is joined behind the northern pass through explicitly annotated controls; the image alone does not recover water topology.',
  'The eastern lake footprint comes from water-001. Its visible rock-island colour hole is occupied by the separately extracted mountain-007 rather than interpreted as a dry hole in the lake polygon.',
  'The western low stop is an added place along the orange route, distinct from a graph junction; the eastern place follows the actual purple outline. Its standing point is authored near the east edge at image (970,541), so the platform surface does not block the downward lake view.',
  'Ridge-height updates the platform, route contact profiles, shared high-place node, place elevation and authored observer height together. Fork-X edits one authoritative shared node.'
];
definition.provenance.limitations = [
  'This case demonstrates image-grounded editable planning geometry and measured views; it does not establish character traversal, collision clearance, good aesthetics, or hydraulic simulation.',
  'Column-cell approximation preserves explicit holes by omitting every intersecting cell. Its maximum hole expansion is sqrt(2) times cellSize; no solid columns are inserted to close the gap.',
  'The northern shared pass crosses the continued river region. Both branches share its actual XYZ, but a production crossing asset and full dry landing proof are not supplied.',
  'The image does not prove the ridge branch is longer or higher. Height is authored and route lengths are measured after compilation; do not claim source-image elevation recovery.',
  'Only eight meaningful extracted regions are assigned mass semantics. Small peripheral gray fragments are retained in extracted/regions.json but not silently turned into extra mountains.',
  'View relations use nine actual target samples. Their fractions describe these samples, not perceptual salience or a complete visibility field.'
];
write('data/C04.json', definition);
write('data/C04-negative.json', { label: '把高脊及台地联动降到0，检验高处观湖收益是否消失', values: { 'ridge-height': 0 } });
write('evidence/C04/annotation.json', {
  schema: 'semantic-study-annotation/1', caseId: definition.id,
  source: { image: 'ai-plan.png', sha256: data.source.sha256, extraction: 'extracted/regions.json' },
  coordinateMapping: data.world, massMappings: definition.provenance.massMappings,
  verificationEvidence: { path: 'isolated-check.json', scope: 'native compilation, all three controls, endpoint and hole audit, negative control, exact restoration' },
  lakeMapping: { sourceRegion: 'water-001', verticesBefore: lakeSource.length, verticesAfter: lakeOutline.length,
    areaBefore: area(lakeSource), areaAfter: area(lakeOutline), maximumVertexDeviation: deviation(lakeSource, lakeOutline),
    islandHole: 'Represented by actual lake-island whitebox mass; lake polygon is continuous beneath that above-water support.' },
  routeTopology: { fork: { id: 'south-fork', pixel: [588, 1080], position: { ...fork, y: 0 } },
    rejoin: { id: 'north-rejoin', pixel: [578, 142], position: { ...rejoin, y: 0 } },
    branches: { valley: ['valley-south', 'valley-north'], ridge: ['ridge-south', 'ridge-north'] },
    centrelinePixels: { approach: approachPixels, valleySouth: valleySouthPixels, valleyNorth: valleyNorthPixels,
      ridgeSouth: ridgeSouthPixels, ridgeNorth: ridgeNorthPixels } },
  authoredVerticalDimensions: { baseTerrain: 0, ridgeHeight, riverSourceLevel: -1, riverOutletLevel: -4, lakeLevel: -3,
    observerEyeHeight: 1.7, massHeights: massSettings.map(([sourceId, id, , height, , profile]) => ({ sourceId, id, height, profile })) },
  riverTopology: { manuallyTracedControlPixels: riverPixels, levelDirection: 'north to southwest', systemId: 'west-valley-system' },
  controls: definition.controls, annotations: definition.provenance.annotations, limitations: definition.provenance.limitations,
  negative: { parameter: 'ridge-height', baseline: ridgeHeight, value: 0,
    retainedExpectation: 'ridge-basin-reward visibleFraction >=0.5', measurementStatus: 'source-only compilation measurements are recorded in isolated-check.json; no browser or physical traversal acceptance' }
});
console.log(JSON.stringify({ case: definition.id, masses: definition.masses.length,
  holes: definition.masses.map(mass => ({ id: mass.id, count: mass.holes?.length ?? 0 })),
  routes: recipe.routes.length, views: recipe.views.length }));
