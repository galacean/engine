#ifndef WORLD_POSITION_INCLUDED
#define WORLD_POSITION_INCLUDED

#ifdef MATERIAL_NEED_WORLD_POS
    varying vec3 v_pos;
#endif

void initWorldPosition(mat4 modelMat, vec4 position) {
    #ifdef MATERIAL_NEED_WORLD_POS
        vec4 temp_pos = modelMat * position;
        v_pos = temp_pos.xyz / temp_pos.w;
    #endif
}

#endif
