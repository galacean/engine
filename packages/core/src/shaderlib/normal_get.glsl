vec3 getNormal()
{
  #ifdef O3_NORMAL_TEXTURE
    #ifndef O3_HAS_TANGENT
        #ifdef HAS_DERIVATIVES
            vec3 pos_dx = dFdx(v_pos);
            vec3 pos_dy = dFdy(v_pos);
            vec3 tex_dx = dFdx(vec3(v_uv, 0.0));
            vec3 tex_dy = dFdy(vec3(v_uv, 0.0));
            vec3 t = (tex_dy.t * pos_dx - tex_dx.t * pos_dy) / (tex_dx.s * tex_dy.t - tex_dy.s * tex_dx.t);
            #ifdef O3_HAS_NORMAL
                vec3 ng = normalize(v_normal);
            #else
                vec3 ng = normalize( cross(pos_dx, pos_dy) );
            #endif
            t = normalize(t - ng * dot(ng, t));
            vec3 b = normalize(cross(ng, t));
            mat3 tbn = mat3(t, b, ng);
        #else
            #ifdef O3_HAS_NORMAL
                vec3 ng = normalize(v_normal);
            #else
                vec3 ng = vec3(0.0, 0.0, 1.0);
            #endif
            mat3 tbn = mat3(vec3(0.0), vec3(0.0), ng);
        #endif
    #else
        mat3 tbn = v_TBN;
    #endif
        vec3 n = texture2D(u_normalTexture, v_uv ).rgb;
        n = normalize(tbn * ((2.0 * n - 1.0) * vec3(u_normalIntensity, u_normalIntensity, 1.0)));
  #else
    #ifdef O3_HAS_NORMAL
        vec3 n = normalize(v_normal);
    #elif defined(HAS_DERIVATIVES)
        vec3 pos_dx = dFdx(v_pos);
        vec3 pos_dy = dFdy(v_pos);
        vec3 n = normalize( cross(pos_dx, pos_dy) );
    #else
        vec3 n= vec3(0.0,0.0,1.0);
    #endif
  #endif

  n *= float( gl_FrontFacing ) * 2.0 - 1.0;

  return n;
}
