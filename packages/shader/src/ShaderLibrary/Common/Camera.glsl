#ifndef GALACEAN_CAMERA_INCLUDED
#define GALACEAN_CAMERA_INCLUDED

uniform Camera {
    mat4 camera_ViewMat;
    mat4 camera_ProjMat;
    mat4 camera_VPMat;
    vec3 camera_Position;
    vec3 camera_Forward;
};

#endif
