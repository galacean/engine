export const CONTROL_VERSION='atomic-controls-1';
export const CONTROL_DEFAULTS={seed:4659,obbWidth:4.2,obbHeight:4.2,obbDepth:4.2,bottomScale:1,shoulderScale:.95,shoulderHeight:.68,topScale:.8,topSlope:0,topDirection:0,topRoughness:.15,outlineIrregularity:0,wear:.35,wallCount:12,wallOverlap:.45,wallLength:1.6,wallTilt:8,wallStrength:.65,wallProtrusion:.35,wallStagger:.55,resolution:32,targetTriangles:1000,reductionError:.008,normalStrength:.35,roughness:1,colorHue:35,grassCoverage:0};
const control=(key,label,group,min,max,step,help,unit='')=>({key,label,group,min,max,step,help,unit});
export const CONTROL_DEFINITIONS=[
 control('obbWidth','Width','Envelope',.5,30,.1,'Local X extent of the containing box.',' m'),
 control('obbHeight','Height','Envelope',.5,40,.1,'Local Y extent; the geometry solver accounts for this aspect ratio.',' m'),
 control('obbDepth','Depth','Envelope',.5,30,.1,'Local Z extent of the containing box.',' m'),
 control('bottomScale','Bottom section','Body profile',0,1,.01,'Zero creates a single bottom apex.','×'),
 control('shoulderScale','Shoulder width','Body profile',.08,1,.01,'Width of the middle section relative to the footprint.','×'),
 control('shoulderHeight','Shoulder height','Body profile',.15,.9,.01,'Position of the shoulder between the base and the roof.','×'),
 control('topScale','Top section','Body profile',.08,1,.01,'Narrows the crown; the upstream minimum retains a small cap.','×'),
 control('topSlope','Roof slope','Roof',0,75,1,'Requested inclination; the effective angle can be limited by the box.','°'),
 control('topDirection','Roof direction','Roof',0,360,1,'Rotates the roof slope. A 20° slope is used when isolating this control.','°'),
 control('topRoughness','Roof relief','Roof',0,1,.01,'Height variation across the cap, constrained by the available height.'),
 control('seed','Seed','Footprint and variation',1,10000,1,'Reproduces the outline and face arrangement for the chosen seed.'),
 control('outlineIrregularity','Outline irregularity','Footprint and variation',0,1,.01,'Changes the cut and waviness of the base perimeter.'),
 control('wear','Outline wear','Footprint and variation',0,1,.01,'Changes the footprint waves, small chips and notches.'),
 control('wallCount','Face count','Face organization',4,28,1,'Number of authored face regions; overlap can hide some regions.'),
 control('wallOverlap','Face width','Face organization',0,1,.01,'Widens the regions and changes how their outlines overlap.'),
 control('wallLength','Face length','Face organization',.5,3,.05,'Length of the regions on the unwrapped rock surface.','×'),
 control('wallTilt','Face inclination','Face organization',-35,35,1,'Rotates the regions around the side surface.','°'),
 control('wallStrength','Carving depth','Face relief',0,1,.01,'Inward carving strength; narrow cuts are limited by the solver.'),
 control('wallProtrusion','Outward relief','Face relief',0,1,.01,'Raises regions into the remaining space inside the box.'),
 control('wallStagger','Face stagger','Face relief',0,1,.01,'Currently unused upstream: moving this slider leaves the mesh identical.'),
 control('resolution','Source resolution','Mesh',24,96,8,'Changes source sampling. Source mesh and wireframe show the effect.'),
 control('targetTriangles','Triangle target','Mesh',200,5000,100,'Simplification ceiling; quality constraints may retain more triangles.',' tris'),
 control('reductionError','Reduction error','Mesh',.001,.01,.001,'Error-only simplification when isolated; lower values preserve more detail.'),
 control('normalStrength','Normal detail','Appearance',0,2,.05,'Stone-grain bump strength in this material preview; geometry stays fixed.'),
 control('roughness','Roughness','Appearance',.05,1,.01,'Controls the size and strength of stone highlights; geometry stays fixed.'),
 control('colorHue','Stone hue','Appearance',0,360,1,'Stone color in this material preview; geometry stays fixed.','°'),
 control('grassCoverage','Grass coverage','Appearance',0,1,.01,'Preview coverage on upward-facing cap triangles; geometry stays fixed.')
];
export function resolvedControls(values,key,combine=false){
 const v={...CONTROL_DEFAULTS},chosen=CONTROL_DEFINITIONS.find(d=>d.key===key)||CONTROL_DEFINITIONS.find(d=>d.key==='topScale');
 const active={...CONTROL_DEFAULTS};
 for(const d of CONTROL_DEFINITIONS){const x=Number(values?.[d.key]??CONTROL_DEFAULTS[d.key]);v[d.key]=Number.isFinite(x)?Math.max(d.min,Math.min(d.max,x)):CONTROL_DEFAULTS[d.key];if(combine||chosen.key===d.key)active[d.key]=v[d.key];}
 for(const key of ['seed','wallCount','resolution','targetTriangles'])active[key]=Math.round(active[key]);
 if(!combine&&chosen.key==='topDirection')active.topSlope=20;
 if(!combine&&chosen.key==='reductionError')active.targetTriangles=0;
 const parameters={...active};for(const d of CONTROL_DEFINITIONS.filter(d=>d.group==='Appearance'||['targetTriangles','reductionError'].includes(d.key)))delete parameters[d.key];
 return {values:v,parameters,appearance:Object.fromEntries(CONTROL_DEFINITIONS.filter(d=>d.group==='Appearance').map(d=>[d.key,active[d.key]])),reduction:{error:active.reductionError,targetTriangles:active.targetTriangles}};
}
