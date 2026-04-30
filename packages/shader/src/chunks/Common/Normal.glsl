#ifndef NORMAL_INCLUDED
#define NORMAL_INCLUDED


vec3 getNormalByNormalTexture(mat3 tbn, sampler2D normalTexture, float normalIntensity, vec2 uv, bool isFrontFacing){
    vec3 normal = (texture2D(normalTexture, uv)).rgb;
    normal = normalize(tbn * ((2.0 * normal - 1.0) * vec3(normalIntensity, normalIntensity, 1.0)));
    normal *= float( isFrontFacing ) * 2.0 - 1.0;

    return normal;
}

mat3 getTBNByDerivatives(vec2 uv, vec3 normal, vec3 position, bool isFrontFacing){
    #ifdef HAS_DERIVATIVES
        uv = isFrontFacing? uv: -uv;
        // ref: http://www.thetenthplanet.de/archives/1180
        // get edge vectors of the pixel triangle
	    vec3 dp1 = dFdx(position);
	    vec3 dp2 = dFdy(position);
	    vec2 duv1 = dFdx(uv);
	    vec2 duv2 = dFdy(uv);
	    // solve the linear system
	    vec3 dp2perp = cross(dp2, normal);
	    vec3 dp1perp = cross(normal, dp1);
	    vec3 tangent = dp2perp * duv1.x + dp1perp * duv2.x;
	    vec3 bitangent = dp2perp * duv1.y + dp1perp * duv2.y;
	    // construct a scale-invariant frame 
        float denom = max( dot(tangent, tangent), dot(bitangent, bitangent) );
        float invmax = (denom == 0.0) ? 0.0 : camera_ProjectionParams.x / sqrt( denom );
	    return mat3(tangent * invmax, bitangent * invmax, normal);
    #else
        return mat3(vec3(0.0), vec3(0.0), normal);
    #endif
}


#endif