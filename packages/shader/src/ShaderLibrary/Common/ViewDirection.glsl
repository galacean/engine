#ifndef VIEW_DIRECTION_INCLUDED
#define VIEW_DIRECTION_INCLUDED

vec3 getViewDirection(vec3 cameraPosition, vec3 cameraForward, vec3 worldPosition) {
    #ifdef CAMERA_ORTHOGRAPHIC
        return -cameraForward;
    #else
        return normalize(cameraPosition - worldPosition);
    #endif
}

#endif
