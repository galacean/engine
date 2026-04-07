#ifndef TRANSFORM_INCLUDED
#define TRANSFORM_INCLUDED

mat4 renderer_LocalMat;
mat4 renderer_ModelMat;
mat4 camera_ViewMat;
mat4 camera_ProjMat;
mat4 renderer_MVMat;
mat4 renderer_MVPMat;
mat4 renderer_NormalMat;

vec3 camera_Position;
vec3 camera_Forward; 
vec4 camera_ProjectionParams;

#endif