// Feature flags are independent of material and view. Preserve extension flags
// so registered stages can use the same enable/bypass contract.
export function normalizeRockFeatures(input,legacyOriginal=false){
 const flags=Object.fromEntries(Object.entries(input??{}).filter(([,value])=>typeof value==='boolean'));
 return {...flags,arrangement:flags.arrangement!==false,shaping:input==null?!legacyOriginal:flags.shaping!==false};
}
