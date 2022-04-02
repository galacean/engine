mat3 getTBN(vec3 normal, vec3 position, vec2 uv){
    #if defined(O3_HAS_NORMAL) && defined(O3_HAS_TANGENT) && ( defined(O3_NORMAL_TEXTURE) || defined(HAS_PARALLAXTEXTURE) )
        mat3 tbn = v_TBN;
    #else
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
	        vec3 binormal = dp2perp * duv1.y + dp1perp * duv2.y;

	        // construct a scale-invariant frame 
	        float invmax = inversesqrt(max(dot(tangent, tangent), dot(binormal, binormal)));
	        mat3 tbn = mat3(tangent * invmax, binormal * invmax, normal);
        #else
            mat3 tbn = mat3(vec3(0.0), vec3(0.0), normal);
        #endif
    #endif
	
    return tbn;
}

vec3 getNormal(){
    vec3 normal = vec3(0, 0, 1);

    #ifdef O3_HAS_NORMAL
         normal = v_normal;
    #elif defined(HAS_DERIVATIVES)
        vec3 pos_dx = dFdx(v_pos);
        vec3 pos_dy = dFdy(v_pos);
        normal = normalize( cross(pos_dx, pos_dy) );
    #endif

    normal *= float( gl_FrontFacing ) * 2.0 - 1.0;
    return normal;
}

vec3 getNormal(sampler2D normalTexture, float normalIntensity)
{
    mat3 tbn = getTBN( 
        #ifdef O3_HAS_NORMAL
            v_normal,
        #else
            vec3(0.0, 0.0, 1.0),
        #endif
        v_pos, v_uv);

    vec3 normal = texture2D(normalTexture, v_uv ).rgb;
    normal = normalize(tbn * ((2.0 * normal - 1.0) * vec3(normalIntensity, normalIntensity, 1.0)));
    normal *= float( gl_FrontFacing ) * 2.0 - 1.0;

    return normal;
}
