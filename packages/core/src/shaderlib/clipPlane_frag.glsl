#ifdef O3_CLIPPLANE_NUM
    for(int i = 0; i < O3_CLIPPLANE_NUM; i++){
        if(v_clipDistances[i] < 0.0){
            discard;
        }
    }
#endif
