vec3 getNormal(){
    #ifdef O3_HAS_NORMAL
        vec3 normal = v_normal;
    #elif defined(HAS_DERIVATIVES)
        vec3 pos_dx = dFdx(v_pos);
        vec3 pos_dy = dFdy(v_pos);
        vec3 normal = normalize( cross(pos_dx, pos_dy) );
    #else
        vec3 normal = vec3(0, 0, 1);
    #endif

    normal *= float( gl_FrontFacing ) * 2.0 - 1.0;
    return normal;
}

vec3 getNormal(mat3 tbn, sampler2D normalTexture, float normalIntensity)
{
    vec3 normal = texture2D(normalTexture, v_uv ).rgb;
    normal = normalize(tbn * ((2.0 * normal - 1.0) * vec3(normalIntensity, normalIntensity, 1.0)));
    normal *= float( gl_FrontFacing ) * 2.0 - 1.0;

    return normal;
}

mat3 getTBN(){
    #if defined(O3_HAS_NORMAL) && defined(O3_HAS_TANGENT) && ( defined(O3_NORMAL_TEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) || defined(HAS_PARALLAXTEXTURE) )
        mat3 tbn = v_TBN;
    #else
        vec3 normal = getNormal();
        vec3 position = v_pos;
        vec2 uv = v_uv;

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


#ifdef HAS_PARALLAXTEXTURE
    vec2 parallaxOffset(vec3 viewDir, float height, float heightScale){
		vec2 texCoordOffset = viewDir.xy * height * heightScale;
		return texCoordOffset;
	}
#endif