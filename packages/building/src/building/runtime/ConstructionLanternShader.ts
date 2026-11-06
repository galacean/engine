/** Native lantern material recovered from nani_lantern_emissive.1 and the
 * untextured nani_uber.1 path. generate_lanterns 0x1010f42c8 binds these programs
 * to lantern_wall_inside and lantern_wall respectively (see asset provenance).
 * Values are scene-linear. Exposure and lighting remain owned by the host.
 */
export const constructionLanternColors: readonly (readonly [number, number, number])[] = [
  [1, 0.800000011920929, 0.10000000149011612],
  [0, 0.7359041571617126, 3.679520606994629],
  [0.20513366162776947, 1.0256682634353638, 0.20513366162776947],
  [0.8515304327011108, 0.567686915397644, 2.8384344577789307],
  [1.8232423067092896, 0.5469726920127869, 0.18232423067092896]
];

export const constructionLanternGLSL = `
vec3 masonryLanternColor(float colorId){
  if(colorId<0.5) return vec3(1.0,0.800000011920929,0.10000000149011612);
  if(colorId<1.5) return vec3(0.0,0.7359041571617126,3.679520606994629);
  if(colorId<2.5) return vec3(0.20513366162776947,1.0256682634353638,0.20513366162776947);
  if(colorId<3.5) return vec3(0.8515304327011108,0.567686915397644,2.8384344577789307);
  return vec3(1.8232423067092896,0.5469726920127869,0.18232423067092896);
}
vec3 masonryLanternSurface(vec3 positionWS,vec3 centerWS,vec3 sourceColor,vec3 cameraWS,
 float intensity,float colorId,bool emissive,out vec3 emission,out float roughness){
  roughness=0.800000011920929;
  emission=vec3(0.0);
  if(emissive&&intensity>0.0){
    vec3 eyeToFragment=positionWS-cameraWS;
    vec3 ray=eyeToFragment*inversesqrt(max(dot(eyeToFragment,eyeToFragment),1e-12));
    vec3 filamentOffset=centerWS-(cameraWS+ray*dot(centerWS-cameraWS,ray));
    float radius2=dot(filamentOffset,filamentOffset);
    float filament=3.0*(0.800000011920929*exp2(-50.0*radius2)+2.0*exp2(-200.0*radius2));
    emission=masonryLanternColor(colorId)*(1.399999976158142*intensity)*filament;
  }
  return sourceColor;
}
`;
