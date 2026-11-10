export const SANDSTONE_VERSION = 'sandstone-structural-v1';
export const UPSTREAM_COMMIT = 'b2887feee34df433303d1c3197a679e4c219367d';
export const SANDSTONE_CONTROLS = [
  {key:'seed',label:'Seed',min:1,max:99999,step:1,unit:''},
  {key:'width',label:'Width',min:3,max:12,step:.1,unit:' m'},
  {key:'height',label:'Height',min:4,max:16,step:.1,unit:' m'},
  {key:'depth',label:'Depth',min:3,max:8,step:.1,unit:' m'},
  {key:'faceCut',label:'Broad face cuts',min:0,max:1,step:.01,unit:''},
  {key:'faceRelief',label:'Buttress setbacks',min:0,max:1.1,step:.01,unit:' m'},
  {key:'jointSpacing',label:'Joint spacing',min:.6,max:3,step:.05,unit:' m'},
  {key:'jointWidth',label:'Joint mouth width',min:.05,max:.5,step:.01,unit:' m'},
  {key:'jointDepth',label:'Joint depth',min:0,max:.7,step:.01,unit:' m'},
  {key:'bedThickness',label:'Bed thickness',min:.35,max:2,step:.05,unit:' m'},
  {key:'bedRecession',label:'Bed recession',min:0,max:.3,step:.01,unit:' m'},
  {key:'edgeDamage',label:'Edge damage',min:0,max:1,step:.01,unit:''},
  {key:'resolution',label:'Samples across short axis',min:32,max:64,step:8,unit:''}
];
export const SANDSTONE_DEFAULTS = {seed:1,width:7.2,height:10,depth:5.8,faceCut:.65,faceRelief:.75,jointSpacing:1.75,jointWidth:.25,jointDepth:.55,bedThickness:.85,bedRecession:.12,edgeDamage:.52,resolution:48};

export function sandstoneRecipe(values = {}, stage = 4) {
  const parameters = {};
  for (const def of SANDSTONE_CONTROLS) {
    const n = values[def.key] ?? SANDSTONE_DEFAULTS[def.key];
    if (!Number.isFinite(n) || n < def.min || n > def.max) throw Error('Invalid '+def.key+'; expected '+def.min+'–'+def.max);
    parameters[def.key] = def.step >= 1 ? Math.round(n) : Number(n.toFixed(4));
  }
  if (!Number.isInteger(stage) || stage < 0 || stage > 4) throw Error('Stage must be 0–4');
  return {version:SANDSTONE_VERSION,upstream:UPSTREAM_COMMIT,stage,parameters};
}

export function parseSandstoneRecipe(text) {
  const recipe = typeof text === 'string' ? JSON.parse(text) : text;
  if (recipe?.version !== SANDSTONE_VERSION || recipe?.upstream !== UPSTREAM_COMMIT) throw Error('Recipe version or upstream generator does not match this build');
  if (!recipe.parameters || Object.keys(SANDSTONE_DEFAULTS).some(key=>!(key in recipe.parameters))) throw Error('Recipe is missing parameters');
  return sandstoneRecipe(recipe.parameters, recipe.stage);
}
