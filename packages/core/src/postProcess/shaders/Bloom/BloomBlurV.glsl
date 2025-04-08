#include <PostCommon>

varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height

void main(){
    vec2 texelSize = renderer_texelSize.xy;

    // Optimized bilinear 5-tap gaussian on the same-sized source (9-tap equivalent)
    mediump vec4 c0 = texture2DSRGB(renderer_BlitTexture, v_uv - vec2(0.0, texelSize.y * 3.23076923));
    mediump vec4 c1 = texture2DSRGB(renderer_BlitTexture, v_uv - vec2(0.0, texelSize.y * 1.38461538));
    mediump vec4 c2 = texture2DSRGB(renderer_BlitTexture, v_uv);
    mediump vec4 c3 = texture2DSRGB(renderer_BlitTexture, v_uv + vec2(0.0, texelSize.y * 1.38461538));
    mediump vec4 c4 = texture2DSRGB(renderer_BlitTexture, v_uv + vec2(0.0, texelSize.y * 3.23076923));

    gl_FragColor = c0 * 0.07027027 + c1 * 0.31621622
                        + c2 * 0.22702703
                        + c3 * 0.31621622 + c4 * 0.07027027;

    gl_FragColor = outputSRGBCorrection(gl_FragColor);
}