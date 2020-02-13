#ifdef O3_CLIPPLANE_NUM
    for(int i = 0; i < O3_CLIPPLANE_NUM; i++){
        v_clipDistances[i] = dot(vec4(v_pos,1.0), u_clipPlanes[i]);
    }
#endif
