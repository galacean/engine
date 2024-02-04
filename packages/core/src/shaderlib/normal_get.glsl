uniform float camera_FlipY;

// gl_FrontFacing has random value on Adreno GPUs
// the Adreno bug is only when gl_FrontFacing is inside a function
// https://bugs.chromium.org/p/chromium/issues/detail?id=1154842
vec3 getNormal(bool isFrontFacing){
    #ifdef RENDERER_HAS_NORMAL
        vec3 normal = normalize(v_normal);
    #elif defined(HAS_DERIVATIVES)
        vec3 pos_dx = dFdx(v_pos);
        vec3 pos_dy = dFdy(v_pos);
        vec3 normal = normalize( cross(pos_dx, pos_dy) );
        normal *= camera_FlipY;
    #else
        vec3 normal = vec3(0, 0, 1);
    #endif

    normal *= float( isFrontFacing ) * 2.0 - 1.0;
    return normal;
}

vec3 getNormalByNormalTexture(mat3 tbn, sampler2D normalTexture, float normalIntensity, vec2 uv, bool isFrontFacing){
    vec3 normal = texture2D(normalTexture, uv).rgb;
    normal = normalize(tbn * ((2.0 * normal - 1.0) * vec3(normalIntensity, normalIntensity, 1.0)));
    normal *= float( isFrontFacing ) * 2.0 - 1.0;

    return normal;
}

mat3 getTBN(bool isFrontFacing){
    #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT) && ( defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) || defined(MATERIAL_ENABLE_ANISOTROPY) )
        mat3 tbn = v_TBN;
    #else
        vec3 normal = getNormal(isFrontFacing);
        vec3 position = v_pos;
        vec2 uv = isFrontFacing? v_uv: -v_uv;

        #ifdef HAS_DERIVATIVES
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
            float invmax = (denom == 0.0) ? 0.0 : camera_FlipY / sqrt( denom );
	        mat3 tbn = mat3(tangent * invmax, bitangent * invmax, normal);
        #else
            mat3 tbn = mat3(vec3(0.0), vec3(0.0), normal);
        #endif
    #endif
	
    return tbn;
}