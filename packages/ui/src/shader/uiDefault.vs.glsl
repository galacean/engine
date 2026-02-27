uniform mat4 renderer_MVPMat;
uniform mat4 renderer_ModelMat;

attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;
attribute vec4 COLOR_0;

varying vec2 v_uv;
varying vec4 v_color;
varying vec2 v_worldPosition;

void main() {
    vec4 worldPosition = renderer_ModelMat * vec4(POSITION, 1.0);
    gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);

    v_uv = TEXCOORD_0;
    v_color = COLOR_0;
    v_worldPosition = worldPosition.xy;
}
