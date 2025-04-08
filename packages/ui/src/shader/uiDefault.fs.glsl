#include <common>
uniform sampler2D renderer_UITexture;

varying vec2 v_uv;
varying vec4 v_color;

void main() {
    vec4 baseColor = texture2D_SRGB(renderer_UITexture, v_uv);
    gl_FragColor = outputSRGBCorrection(baseColor * v_color);
}
