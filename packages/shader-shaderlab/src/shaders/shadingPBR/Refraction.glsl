#ifndef REFRACTION_INCLUDED
#define REFRACTION_INCLUDED

#ifdef MATERIAL_ENABLE_SS_REFRACTION 

struct RefractionModel{
    float dist;         // length of the transmission during refraction through the shape
    vec3 position;      // out ray position
    vec3 direction;     // out ray direction
};

//https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@15.0/manual/refraction-models.html
 void RefractionModelSphere(vec3 V, vec3 positionWS, vec3 normalWS, float ior, float thickness, out RefractionModel ray){
    // Refracted ray
    vec3 R1 = refract(V, normalWS, 1.0 / ior);
    // Center of the tangent sphere
    vec3 C = positionWS - normalWS * thickness * 0.5;

    // Second refraction (tangent sphere out)
    float NoR1 = dot(normalWS, R1);
    // Optical depth within the sphere
    float dist = -NoR1 * thickness;
    // Out hit point in the tangent sphere
    vec3 P1 = positionWS + R1 * dist;
    // Out normal
    vec3 N1 = normalize(C - P1);
    // Out refracted ray
    vec3 R2 = refract(R1, N1, ior);

    ray.dist = dist;
    ray.position = P1;
    ray.direction = R2; 
}

void RefractionModelBox(vec3 V, vec3 positionWS, vec3 normalWS, float ior, float thickness, out RefractionModel ray){
    // Refracted ray
    vec3 R = refract(V, normalWS, 1.0 / ior);
    float NoR = dot(normalWS, R);
    // Optical depth within the thin plane
    float dist = thickness / max(-NoR, 0.001);

    ray.dist = dist;
    ray.position = vec3(positionWS + R * dist);
    ray.direction = V;
}
#endif

#endif