#ifndef REFRACTION_INCLUDED
#define REFRACTION_INCLUDED

#ifdef MATERIAL_ENABLE_TRANSMISSION 

struct RefractionModelResult{
    float transmissionLength;         // length of the transmission during refraction through the shape
    vec3 positionExit;      // out ray position
    // vec3 directionExit;     // out ray direction
};

//https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@15.0/manual/refraction-models.html
 void refractionModelSphere(vec3 V, vec3 positionWS, vec3 normalWS, float ior, float thickness, out RefractionModelResult ray){
    // Refracted ray
    vec3 R1 = refract(V, normalWS, 1.0 / ior);
    // Center of the tangent sphere
    vec3 C = positionWS - normalWS * thickness * 0.5;

    // Second refraction (tangent sphere out)
    float dist = dot(-normalWS, R1) * thickness;
    // Out hit point in the tangent sphere
    vec3 P1 = positionWS + R1 * dist;
    // Out normal
    vec3 N1 = safeNormalize(C - P1);
    // Out refracted ray
    // vec3 R2 = refract(R1, N1, ior);

    ray.transmissionLength = dist;
    ray.positionExit = P1;
    // ray.directionExit = R2; 
}

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