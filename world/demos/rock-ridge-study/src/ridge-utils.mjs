// Study generator: seed -> ridge plan -> atomic-rock assembly -> measured crest.
// This is a proposal derived from Seed's hierarchy/curve concepts, not shipped Seed code.
export const RIDGE_VERSION = 'runtime-atomic-mountain-13';
export const DEFAULT_RIDGE_SEED = 480;
const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = x => Math.round(x * 10000) / 10000;
export const point = p => p.map(round);

export function random(seed, stream) {
  let state = 2166136261;
  for (const char of `${seed}:${stream}`) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function transformedVertices(rock, geometry) {
  const c = Math.cos(rock.yaw), s = Math.sin(rock.yaw), vertices = [];
  for (let i = 0; i < geometry.positions.length; i += 3) {
    const x = geometry.positions[i] * rock.scale * (rock.longitudinalScale ?? 1), z = geometry.positions[i + 2] * rock.scale * (rock.lateralScale ?? 1);
    vertices.push([rock.x + c * x - s * z, rock.y + geometry.positions[i + 1] * rock.scale * (rock.verticalScale ?? 1), rock.z + s * x + c * z]);
  }
  return vertices;
}

// A shared positive Y transform preserves footprint, contact, peak ordering and
// all surface measurements. Terrain follows it so a shortened cliff stays joined.
// Always apply to the unscaled scene, making slider changes independent of history.
export function withSceneHeight(source, heightScale = 1) {
  const factor = Number.isFinite(heightScale) ? clamp(heightScale, .25, 2) : 1;
  const scaledPoint = p => [p[0], p[1] * factor, p[2]];
  const scene = {...source,heightScale: factor,
    rocks: source.rocks.map(r => ({...r,y: r.y * factor,verticalScale: (r.verticalScale ?? 1) * factor})),
    terrain: {...source.terrain,positions: source.terrain.positions.map((v, i) => i % 3 === 1 ? v * factor : v)},
    guides: source.guides.map(g => ({...g,points: g.points.map(p => [p[0],(p[1] - (g.liftM ?? 0)) * factor + (g.liftM ?? 0),p[2]])})),
    labels: source.labels.map(l => ({...l,position: l.anchor ? [l.anchor[0],l.anchor[1] * factor + (l.position[1] - l.anchor[1]),l.anchor[2]] : scaledPoint(l.position),...(l.anchor ? {anchor: scaledPoint(l.anchor)} : {})})),
    camera: {...source.camera,target: scaledPoint(source.camera.target)}
  };
  if(source.water !== undefined)scene.water = source.water * factor;
  if(source.ridge){
    const r = source.ridge,plan = {...r.plan};
    if(plan.nodes)plan.nodes = plan.nodes.map(n => ({...n,...(n.height!==undefined?{height:n.height*factor}:{}),...(n.y!==undefined?{y:n.y*factor}:{}),...(n.position?{position:scaledPoint(n.position)}:{})}));
    if(plan.minimumCoastGround !== undefined)plan.minimumCoastGround *= factor;
    if(plan.knots)plan.knots=plan.knots.map(k=>({...k,y:k.y*factor,...(k.position?{position:scaledPoint(k.position)}:{})}));
    if(plan.curves)plan.curves=plan.curves.map(c=>({...c,knots:c.knots.map(k=>({...k,y:k.y*factor,position:scaledPoint(k.position)}))}));
    if(plan.curves)plan.curves=plan.curves.map(c=>c.path?{...c,path:c.path.map(k=>({...k,y:k.y*factor,position:scaledPoint(k.position)}))}:c);
    if(plan.sourceField)plan.sourceField={...plan.sourceField,positions:plan.sourceField.positions.map((v,i)=>i%3===1?v*factor:v),detailOffsets:plan.sourceField.detailOffsets.map(v=>v*factor),ground:plan.sourceField.ground.map(v=>v*factor)};
    if(plan.extraction)plan.extraction={...plan.extraction,minimumProminenceM:plan.extraction.minimumProminenceM*factor,passes:plan.extraction.passes.map(p=>({...p,y:p.y*factor}))};
    scene.ridge = {...r,heightScale: factor,primary: {...r.primary,position: scaledPoint(r.primary.position)},
      saddles: r.saddles.map(s => ({...s,position: scaledPoint(s.position),prominence: s.prominence * factor})),
      stations: (r.stations || []).map(s => ({...s,heightM: s.heightM * factor,base: scaledPoint(s.base),target: scaledPoint(s.target)})),plan};
    if(r.target)scene.ridge.target={...r.target,knots:r.target.knots.map(k=>({...k,y:k.y*factor,position:scaledPoint(k.position)}))};
    if(r.fit)scene.ridge.fit={...r.fit,maxUnderM:r.fit.maxUnderM*factor,maxOverM:r.fit.maxOverM*factor,rmsM:r.fit.rmsM*factor,...(r.fit.byCurve?{byCurve:r.fit.byCurve.map(c=>({...c,maxUnderM:c.maxUnderM*factor,maxOverM:c.maxOverM*factor,rmsM:c.rmsM*factor}))}:{})};
    if(r.policy)scene.ridge.policy={...r.policy,curveToleranceM:r.policy.curveToleranceM*factor,maximumSmallHeightM:r.policy.maximumSmallHeightM*factor};
    if(r.composition)scene.ridge.composition={...r.composition,contactEdges:r.composition.contactEdges.map(e=>({...e,witnesses:e.witnesses.map(w=>({...w,position:scaledPoint(w.position),depthM:w.depthM*factor}))}))};
  }
  if(source.validation){
    scene.validation = {...source.validation,heightScale: factor};
    for(const key of ['maxSampledRiseM','maxSampledDropM','minInteriorSurfaceM'])if(key in scene.validation)scene.validation[key] *= factor;
    if('maxSampledRiseM' in scene.validation)scene.validation.withinOriginalStepBounds = scene.validation.maxSampledRiseM <= .22 && scene.validation.maxSampledDropM <= .22;
  }
  return scene;
}

// XZ acceleration bins; barycentric interpolation on the actual displayed triangles.
export function createSurfaceSampler(scene, geometries, terrainOnly = false) {
  const detailed=Object.values(geometries).filter(g=>g.surface);
  const bins = new Map(), cell = detailed.length===1?Math.min(detailed[0].parameters.obbWidth,detailed[0].parameters.obbDepth)/20:detailed.length?1.1:4;
  function add(vertices, indices) {
    for (let i = 0; i < indices.length; i += 3) {
      const a = vertices[indices[i]], b = vertices[indices[i + 1]], c = vertices[indices[i + 2]];
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(d) < 1e-9) continue;
      const tri = {a, b, c, d};
      for (let x = Math.floor(Math.min(a[0], b[0], c[0]) / cell); x <= Math.floor(Math.max(a[0], b[0], c[0]) / cell); x++) {
        for (let z = Math.floor(Math.min(a[2], b[2], c[2]) / cell); z <= Math.floor(Math.max(a[2], b[2], c[2]) / cell); z++) {
          const key = `${x},${z}`;
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key).push(tri);
        }
      }
    }
  }
  const terrain = scene.terrain;
  add(Array.from({length: terrain.positions.length / 3}, (_, i) => terrain.positions.slice(i * 3, i * 3 + 3)), terrain.indices);
  if (!terrainOnly) for (const rock of scene.rocks) add(transformedVertices(rock, geometries[rock.mesh]), geometries[rock.mesh].indices);
  return (x, z) => {
    let top = -Infinity;
    for (const {a, b, c, d} of bins.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) || []) {
      const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
      const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7) top = Math.max(top, u * a[1] + v * b[1] + (1 - u - v) * c[1]);
    }
    return top;
  };
}

export function footprint(rock, geometry, visit) {
  const c = Math.cos(rock.yaw), s = Math.sin(rock.yaw), p = geometry.parameters;
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    const x = (i / 6 - .5) * p.obbWidth * rock.scale * (rock.longitudinalScale ?? 1), z = (j / 6 - .5) * p.obbDepth * rock.scale * (rock.lateralScale ?? 1);
    visit(rock.x + c * x - s * z, rock.z + s * x + c * z);
  }
}

// All solid intervals along a vertical ray through a prototype. Separate
// intervals preserve concavities and overhangs when checking volume contacts.
export function createColumnSampler(geometry){
  const bins=new Map(),cell=geometry.surface?Math.min(geometry.parameters.obbWidth,geometry.parameters.obbDepth)/20:4,p=geometry.positions,idx=geometry.indices;
  for(let i=0;i<idx.length;i+=3){
    const a=p.slice(idx[i]*3,idx[i]*3+3),b=p.slice(idx[i+1]*3,idx[i+1]*3+3),c=p.slice(idx[i+2]*3,idx[i+2]*3+3);
    const d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-9)continue;
    const tri={a,b,c,d};
    for(let x=Math.floor(Math.min(a[0],b[0],c[0])/cell);x<=Math.floor(Math.max(a[0],b[0],c[0])/cell);x++)for(let z=Math.floor(Math.min(a[2],b[2],c[2])/cell);z<=Math.floor(Math.max(a[2],b[2],c[2])/cell);z++){
      const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(tri);
    }
  }
  return (x,z)=>{
    const hits=[];
    for(const {a,b,c,d} of bins.get(Math.floor(x/cell)+','+Math.floor(z/cell))||[]){
      const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
      if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)hits.push(u*a[1]+v*b[1]+(1-u-v)*c[1]);
    }
    hits.sort((a,b)=>a-b);const unique=hits.filter((v,i)=>!i||v-hits[i-1]>1e-6),intervals=[];
    for(let i=unique.length-1;i>0;i-=2)if(unique[i]-unique[i-1]>1e-6)intervals.push([unique[i-1],unique[i]]);
    return intervals;
  };
}

function rockSummits(scene, geometries, surface) {
  return scene.rocks.map(rock => {
    const vertices = transformedVertices(rock, geometries[rock.mesh]);
    const position = vertices.reduce((a, b) => a[1] > b[1] ? a : b);
    return {rock: rock.id, role: rock.role, position, exposed: Math.abs(surface(position[0], position[2]) - position[1]) < .001};
  }).filter(p => p.exposed);
}

export function traceCrest(scene, geometries, axis, span, seed) {
  const surface = createSurfaceSampler(scene, geometries), summits = rockSummits(scene, geometries, surface);
  const primary = summits.reduce((a, b) => a.position[1] > b.position[1] ? a : b);
  const anchors = summits.filter(p => ['crown', 'secondary'].includes(p.role) || p === primary)
    .map(p => ({...p, ...axis.project(p.position)})).sort((a, b) => a.t - b.t);
  const halfWidth = Math.max(8, ...anchors.map(p => Math.abs(p.offset) + 2));
  const start = Math.min(-span / 2, anchors[0].t - 4), end = Math.max(span / 2, anchors.at(-1).t + 4);
  const stationCount = Math.ceil((end - start) / .65) + 1;
  const ts = Array.from({length: stationCount}, (_, i) => start + (end - start) * i / (stationCount - 1));
  // Exact summit vertices become mandatory stations, not approximate grid maxima.
  for (const anchor of anchors) {
    for (let i = ts.length - 1; i >= 0; i--) if (Math.abs(ts[i] - anchor.t) < .12) ts.splice(i, 1);
    ts.push(anchor.t);
  }
  ts.sort((a, b) => a - b);
  const rows = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i], anchor = anchors.find(a => a.t === t), step = i ? t - ts[i - 1] : .65;
    const offsets = anchor ? [anchor.offset] : Array.from({length: 49}, (_, j) => -halfWidth + 2 * halfWidth * j / 48);
    const row = offsets.map(offset => {
      const [x, z] = axis.section(t, offset), y = surface(x, z);
      let score = -y * step + .015 * offset * offset * step, previous = -1;
      if (i) {
        let best = Infinity;
        rows[i - 1].forEach((p, j) => {const cost = p.score + .35 * (offset - p.offset) ** 2 / Math.max(.12, step); if (cost < best) {best = cost; previous = j;}});
        score += best;
      }
      return {offset, score, previous, position: [x, y, z]};
    });
    rows.push(row);
  }
  const path = [];
  let index = rows.at(-1).reduce((best, p, i, arr) => p.score < arr[best].score ? i : best, 0);
  for (let i = rows.length - 1; i >= 0; i--) {const p = rows[i][index];path.push(p.position);index = p.previous;}
  path.reverse();
  const measured = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / .2));
    for (let j = 0; j < count; j++) {const x = a[0] + (b[0] - a[0]) * j / count, z = a[2] + (b[2] - a[2]) * j / count;measured.push([x, surface(x, z), z]);}
  }
  measured.push(path.at(-1));
  const saddles = [];
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    const between = measured.filter(p => {const t = axis.project(p).t;return t > a.t + .1 && t < b.t - .1;});
    if (between.length) {
      const position = between.reduce((a, b) => a[1] < b[1] ? a : b);
      const prominence = Math.min(a.position[1], b.position[1]) - position[1];
      if (prominence > 1) saddles.push({position: point(position), between: [a.rock, b.rock], prominence: round(prominence)});
    }
  }
  const saddle = saddles.filter(s => s.between.includes(primary.rock)).sort((a, b) => b.prominence - a.prominence)[0];
  scene.guides = scene.guides.filter(g => g.kind !== 'spine');
  scene.guides.unshift({kind: 'spine',source: 'assembled-triangle-surface',liftM: .08, points: measured.map(p => point([p[0], p[1] + .08, p[2]]))});
  scene.labels = [{text: scene.id === 'cliff' ? 'Measured crest' : 'Mesh summit',position: point([primary.position[0], primary.position[1] + 2, primary.position[2]]),anchor: point(primary.position)}];
  if (saddle && scene.id !== 'cliff') scene.labels.push({text: 'Mesh saddle',position: point([saddle.position[0], saddle.position[1] + 2, saddle.position[2]]),anchor: saddle.position});
  scene.ridge = {version: RIDGE_VERSION,seed,primary: {...primary,position: point(primary.position)},saddles,
    crest: {source: 'triangle-top-envelope',stationPitchM: .65,maxSamplePitchM: .2,liftM: .08,points: measured.length},
    selection: 'Continuous height-maximizing cross-section path pinned to exposed summit vertices; saddles are minima along that ridge.'};
}
