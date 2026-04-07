#ifndef TRANSFORM_INCLUDED
#define TRANSFORM_INCLUDED

mat4 camera_ViewMat;
mat4 camera_ProjMat;

vec3 camera_Position;
vec3 camera_Forward;
vec4 camera_ProjectionParams;

mat4 renderer_LocalMat;
mat4 renderer_ModelMat;
mat4 renderer_MVMat;
mat4 renderer_MVPMat;
mat4 renderer_NormalMat;
ivec4 renderer_Layer;

#endif