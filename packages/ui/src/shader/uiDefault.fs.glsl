#include <common>
uniform sampler2D renderer_UITexture;

varying vec2 v_uv;
varying vec4 v_color;

void main() {
    vec4 baseColor = texture2DSRGB(renderer_UITexture, v_uv);
    vec4 finalColor = baseColor * v_color;
    #ifdef ENGINE_SHOULD_SRGB_CORRECT
        finalColor = outputSRGBCorrection(finalColor);
    #endif
    gl_FragColor = finalColor;
}