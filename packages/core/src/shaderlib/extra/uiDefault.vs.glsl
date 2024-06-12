uniform mat4 renderer_MVPMat;

attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;
attribute vec4 COLOR_0;

varying vec2 v_uv;
varying vec4 v_color;

void main() {
    gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);

    v_uv = TEXCOORD_0;
    v_color = COLOR_0;
}
