precision highp float;

attribute vec2 a_position;
attribute vec2 a_uv;

varying vec2 v_uv;

void main(){
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_uv = a_uv;
}
