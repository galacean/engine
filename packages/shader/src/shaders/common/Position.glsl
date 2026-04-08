#ifndef POSITION_INCLUDED
#define POSITION_INCLUDED

vec4 initPosition(vec3 vertexPosition) {
    return vec4(vertexPosition, 1.0);
}

void calculateClipPosition(mat4 mvpMat, vec4 position) {
    gl_Position = mvpMat * position;
}

#endif
