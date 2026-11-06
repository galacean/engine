import {
  source, read, mapPoint, newDefinition, massFromRegion, simplifyRing, area, deviation,
  addNode, addRoute, addPOI, addControl, addView, write
} from './build-utils.mjs';

/** Build the C03 reference from extracted footprints and explicit, reviewable topology annotations. */
const data = source('C03');
const definition = newDefinition('C03', '多支流湖湾', read('data/prompts.json').C03);
const recipe = definition.recipe;
const region = id => data.regions.find(item => item.id === id);
const point = (x, y, height) => mapPoint(data, x, y, height);
const line = points => points.map(([x, y]) => point(x, y));
const sourcePoint = region('spawn-001').centroid.world;
recipe.spawn = { ...sourcePoint, yaw: -0.12, elevation: 0 };

// Gray describes a footprint, never a measured elevation. Heights below are authored assumptions.
const massSettings = [
  ['mountain-001', '东南近岸山群', 74, [0.65, 0.85, 1, 0.9, 0.72]],
  ['mountain-002', '东北支流外侧山群', 104, [0.75, 1, 0.9, 0.8, 0.72]],
  ['mountain-003', '西南前景山群', 68, [0.7, 0.95, 1, 0.8, 0.55]],
  ['mountain-004', '西北支流外侧山群', 90, [0.7, 0.82, 1, 0.95, 0.7]],
  ['mountain-005', '双支流间分水岭', 112, [0.65, 0.9, 1, 0.92, 0.65]],
  ['mountain-006', '西岸中景山群', 84, [0.75, 1, 0.88, 0.72, 0.58]]
];
for (const [id, label, height, profile] of massSettings) {
  const converted = massFromRegion(data, region(id), height, { label, cellSize: 24, profile });
  definition.masses.push(converted.mass);
  definition.provenance.massMappings.push(converted.provenance);
}

/** Clip the extracted downstream water polygon to the lake side of an explicitly annotated mouth. */
function clipSouth(points, minimumZ) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i + points.length - 1) % points.length], current = points[i];
    if ((previous.z >= minimumZ) !== (current.z >= minimumZ)) {
      const t = (minimumZ - previous.z) / (current.z - previous.z);
      result.push({ x: previous.x + (current.x - previous.x) * t, z: minimumZ });
    }
    if (current.z >= minimumZ) result.push({ ...current });
  }
  return result;
}
const mouthCutPixel = 520;
const lakeRaw = clipSouth(region('water-001').polygons[0].worldOutline, point(0, mouthCutPixel).z);
const lakeOutline = simplifyRing(lakeRaw, 2.4);
const lakeCenter = point(646, 762);
recipe.lakes.push({
  id: 'lake-main', label: '汇流接收湖', center: lakeCenter,
  radiusX: 202, radiusZ: 177, yaw: 0, level: -3, depth: 6,
  irregularity: 0, outline: lakeOutline, systemId: 'c03-drainage'
});

// The bridge occludes the blue mask but does not disconnect the physical water network.
const riverNodePixels = [
  ['river-west-source', 212, 8, -0.3],
  ['river-east-source', 1010, 8, -0.3],
  ['river-confluence', 626, 350, -1],
  ['river-lake-mouth', 662, 554, -3]
];
recipe.riverNodes = riverNodePixels.map(([id, x, y, level]) => ({ id, ...point(x, y), level }));
const westPixels = [
  [217, 32], [238, 59], [270, 82], [292, 119], [312, 144], [333, 160],
  [354, 188], [388, 211], [405, 236], [431, 261], [472, 269], [502, 280],
  [525, 304], [550, 320], [570, 338], [598, 346]
];
const eastPixels = [
  [1000, 33], [980, 50], [945, 68], [922, 92], [912, 118], [895, 145],
  [864, 164], [843, 180], [827, 204], [820, 229], [802, 249], [776, 262],
  [741, 268], [710, 281], [686, 298], [658, 321], [642, 338]
];
const mainPixels = [[638, 378], [639, 404], [645, 429], [647, 452], [647, 481], [651, 508], [658, 532]];
function river(id, label, from, to, pixels, width, widthEnd) {
  recipe.rivers.push({
    id, label, from, to, controls: line(pixels), width, widthEnd,
    depth: 3.5, bankWidth: 5, fitTerrain: false, systemId: 'c03-drainage',
    ...(id === 'river-main' ? { lakeId: 'lake-main' } : {})
  });
}
river('river-west', '西支流', 'river-west-source', 'river-confluence', westPixels, 8, 19);
river('river-east', '东支流', 'river-east-source', 'river-confluence', eastPixels, 8, 20);
river('river-main', '汇口至湖泊干流', 'river-confluence', 'river-lake-mouth', mainPixels, 24, 29);

// Route nodes are connections, while the purple footprint is a separate usable lakeside place.
const entryPixel = [950, 625];
addNode(definition, 'shore-place-entry', '湖岸场所通路入口', point(...entryPixel));
addNode(definition, 'bridge-east', '东岸桥头', point(682, 452));
addNode(definition, 'bridge-west', '西岸桥头', point(612, 452));
addNode(definition, 'west-bank-anchor', '西岸接岸停留点', point(568, 455));
const shorePixels = [
  [707, 1111], [711, 1082], [713, 1067], [701, 1048], [704, 1032],
  [727, 1016], [741, 994], [747, 962], [760, 946], [788, 937], [823, 926],
  [851, 907], [866, 879], [875, 843], [880, 809], [890, 787], [910, 767],
  [918, 742], [915, 721], [909, 696], [913, 674], [932, 657], [946, 646]
];
const bridgeApproachPixels = [
  [951, 612], [932, 590], [918, 575], [910, 557], [891, 552], [870, 552],
  [849, 545], [827, 537], [815, 526], [803, 510], [784, 501], [760, 495],
  [739, 494], [719, 486], [698, 469]
];
addRoute(definition, 'route-south-shore', '南出生点至湖岸场所', 'spawn', 'shore-place-entry', line(shorePixels), 'shore-route', 5);
addRoute(definition, 'route-shore-bridge', '湖岸场所至东岸桥头', 'shore-place-entry', 'bridge-east', line(bridgeApproachPixels), 'shore-route', 5);
addRoute(definition, 'route-bridge', '干流唯一跨越', 'bridge-east', 'bridge-west', [], 'crossing', 6);
addRoute(definition, 'route-west-landing', '西桥头接岸短路', 'bridge-west', 'west-bank-anchor', line([[596, 453], [582, 455]]), 'branch-road', 5);
for (const route of recipe.routes) route.sourceFeatureIds = route.kind === 'crossing' ? ['river-main'] : ['lake-main'];

const placeRegion = region('terrace-001');
const placeCenter = placeRegion.centroid.world;
addPOI(definition, 'place-east-lake', '东岸观湖场所', placeCenter, 0, 'shore-place-entry', 'route-south-shore', 20);
const place = recipe.pois[0];
place.outline = simplifyRing(placeRegion.polygons[0].worldOutline, 1.2);
place.entrances[0].position = point(...entryPixel);
place.activityAreas[0].outline = place.outline.map(p => ({
  x: placeCenter.x + (p.x - placeCenter.x) * 0.72,
  z: placeCenter.z + (p.z - placeCenter.z) * 0.72
}));
place.activityAreas[0].label = '近岸停留与观湖空地';
place.sourceFeatureIds = ['lake-main', 'river-main'];
place.rewardTargetIds = ['lake-main', 'river-west', 'river-east'];
place.arrivalRouteIds = ['route-south-shore', 'route-shore-bridge'];

addControl(definition, 'river-width', '干流与支流宽度', ['recipe', 'rivers', 2, 'width'], 16, 34, 1, [
  { path: ['recipe', 'rivers', 2, 'widthEnd'], scale: 29 / 24 },
  { path: ['recipe', 'rivers', 0, 'width'], scale: 8 / 24 },
  { path: ['recipe', 'rivers', 0, 'widthEnd'], scale: 19 / 24 },
  { path: ['recipe', 'rivers', 1, 'width'], scale: 8 / 24 },
  { path: ['recipe', 'rivers', 1, 'widthEnd'], scale: 20 / 24 }
]);
addControl(definition, 'lake-level', '湖水位与入湖水位', ['recipe', 'lakes', 0, 'level'], -6, -1, 0.5, [
  { path: ['recipe', 'riverNodes', 3, 'level'] }
]);
addControl(definition, 'confluence-x', '共享汇口横向位置', ['recipe', 'riverNodes', 2, 'x'], -18, 18, 1);

// Explicit observer heights are added assumptions. They are not extracted from the plan's colors.
addView(definition, 'spawn', '南侧出生点 · 湖湾与入湖干流', { ...sourcePoint, y: 1.7 }, point(636, 414, 1));
addView(definition, 'lakeshore', '东岸场所 · 湖面与入湖方向', point(923, 633, 1.7), point(606, 422, -1));
addView(definition, 'bridgehead', '东岸桥头 · 共享汇口', point(687, 453, 1.7), point(626, 323, 0));
recipe.views.push(
  { id: 'shore-lake', from: 'place-east-lake', target: 'lake-main', minimum: 0, maximum: 1, hard: false },
  { id: 'shore-west-tributary', from: 'place-east-lake', target: 'river-west', minimum: 0, maximum: 1, hard: false },
  { id: 'shore-east-tributary', from: 'place-east-lake', target: 'river-east', minimum: 0, maximum: 1, hard: false },
  { id: 'bridge-west-tributary', from: 'bridge-east', target: 'river-west', minimum: 0.1, maximum: 1, hard: false },
  { id: 'bridge-east-tributary', from: 'bridge-east', target: 'river-east', minimum: 0.1, maximum: 1, hard: false }
);

definition.provenance.annotations = [
  'Mountain and lake footprints follow extracted polygons; all vertical dimensions, profiles and observation heights are authored.',
  'water-002 is semantically split into two tributaries and a common stem. Orange bridge pixels hide, rather than terminate, that stem.',
  'water-001 is clipped at image y=520 for the lake; its narrower northern neck belongs to the main river. The river terminates inside the lake at image (662,554).',
  'River centerlines and road centerlines are manually traced from the viewed image; region masks provide area contours only.',
  'The image ends its orange route at the western bridgehead. A 31.6 m bank connector is explicitly authored to a dry western anchor.',
  'mountain-007 is excluded: its 86.5 square metre sliver lies on the road edge and does not read as a separate mountain in the viewed image.',
  'Shared river nodes are authoritative. fitTerrain=false preserves the annotated levels, so a deliberately wrong lake inlet remains detectable.',
  'The low lakeshore eye sees the lake but not the upstream tributaries in the baseline ray sample. Partial views of both tributaries are instead inspected from the bridgehead; this limitation is retained rather than reported as a shore-view success.',
  'The lake level control also changes the river inlet level. Confluence X moves one node shared by all three reaches without changing references.'
];
definition.provenance.limitations = [
  'Image colors do not establish height, hydraulic flow, physical traversability, or visual quality.',
  'The source image uses an exaggerated-width bridge icon. Its authored crossing extends to explicit dry-bank nodes.',
  'Mountains are a finite-resolution column approximation. Boundary occupancy can expand by at most one cell diagonal.',
  'The lake bottom and river bed are terrain cuts. This case does not implement hydraulic simulation or validate real character movement.',
  'Observer views collectively inspect lake, tributaries and bridge. They do not claim the whole winding network is visible from every eye position.'
];
const annotation = {
  caseId: definition.id,
  source: { image: 'ai-plan.png', sha256: data.source.sha256, extraction: 'extracted/regions.json' },
  coordinateMapping: data.world,
  massMappings: definition.provenance.massMappings,
  lakeMapping: {
    sourceRegion: 'water-001', semanticCut: { axis: 'image-y', minimum: mouthCutPixel },
    originalWaterComponents: ['water-001', 'water-002'],
    fullMaskIsLake: false, originalClippedVertexCount: lakeRaw.length, vertexCount: lakeOutline.length,
    maximumVertexDeviation: deviation(lakeRaw, lakeOutline), areaBefore: area(lakeRaw), areaAfter: area(lakeOutline)
  },
  riverTopology: {
    systemId: 'c03-drainage', nodesPixels: riverNodePixels,
    reaches: recipe.rivers.map(river => ({ id: river.id, from: river.from, to: river.to })),
    manuallyTracedControlPixels: { west: westPixels, east: eastPixels, main: mainPixels }
  },
  routeTopology: {
    order: ['spawn', 'shore-place-entry', 'bridge-east', 'bridge-west', 'west-bank-anchor'],
    addedWesternConnectorPixels: [[612, 452], [596, 453], [582, 455], [568, 455]],
    manuallyTracedControlPixels: { shore: shorePixels, bridgeApproach: bridgeApproachPixels },
    groundElevation: 0, bridgeElevation: 'Derived by the native compiler from bank terrain and water clearance; approach endpoints reconciled to the deck.'
  },
  placeMapping: { sourceRegion: 'terrace-001', outline: 'extracted polygon', entryPixel, activityAreaScale: 0.72 },
  authoredVerticalDimensions: {
    terrain: 0, mountainHeights: massSettings.map(([id, , height, profile]) => ({ id, height, profile })),
    riverSourceLevel: -0.3, confluenceLevel: -1, lakeLevel: -3, riverDepth: 3.5, lakeDepth: 6,
    observerEyeHeight: 1.7
  },
  controls: definition.controls,
  annotations: definition.provenance.annotations,
  limitations: definition.provenance.limitations,
  negativeControl: {
    hypothesis: 'Changing only the lake inlet node leaves a valid reference graph but breaks the river/lake surface-level contract.',
    path: ['recipe', 'riverNodes', 3, 'level'], baseline: -3, negative: 4,
    expectedFailure: 'river-lake mouth level difference = 7 m; main stem also rises downstream'
  }
};
write('data/C03.json', definition);
write('evidence/C03/annotation.json', annotation);
write('data/C03-negative.json', {
  label: '仅抬高入湖节点，制造真实河湖水位断差',
  patches: [{ path: ['recipe', 'riverNodes', 3, 'level'], value: 4 }]
});
