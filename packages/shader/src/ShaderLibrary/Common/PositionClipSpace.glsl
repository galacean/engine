#ifndef POSITION_CLIP_SPACE_INCLUDED
#define POSITION_CLIP_SPACE_INCLUDED

#ifdef SCENE_ENABLE_AMBIENT_OCCLUSION
    varying vec4 v_PositionCS;
#endif

void initPositionClipSpace() {
    #ifdef SCENE_ENABLE_AMBIENT_OCCLUSION
        v_PositionCS = gl_Position;
    #endif
}

#endif
