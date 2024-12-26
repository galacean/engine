#ifndef REFRACTION_INCLUDED
#define REFRACTION_INCLUDED

#ifdef MATERIAL_ENABLE_TRANSMISSION 

struct RefractionModelResult{
    float transmissionLength;         // length of the transmission during refraction through the shape
    vec3 positionExit;      // out ray position
    // vec3 directionExit;     // out ray direction
};

void refractionModelBox(vec3 V, vec3 positionWS, vec3 normalWS, float ior, float thickness, out RefractionModelResult ray){
    // Refracted ray
    vec3 R = refract(V, normalWS, 1.0 / ior);
    // Optical depth within the thin plane
    float dist = thickness / max(dot(-normalWS, R), 1e-5f);

    ray.transmissionLength = dist;
    ray.positionExit = vec3(positionWS + R * dist);
    // ray.directionExit = V;
}
#endif

#endif