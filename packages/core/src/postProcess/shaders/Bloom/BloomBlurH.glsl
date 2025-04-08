#include <PostCommon>

varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height

void main(){
	vec2 texelSize = renderer_texelSize.xy * 2.0;

    // 9-tap gaussian blur on the downsampled source
    mediump vec4 c0 = texture2D(renderer_BlitTexture, v_uv - vec2(texelSize.x * 4.0, 0.0));
    mediump vec4 c1 = texture2D(renderer_BlitTexture, v_uv - vec2(texelSize.x * 3.0, 0.0));
    mediump vec4 c2 = texture2D(renderer_BlitTexture, v_uv - vec2(texelSize.x * 2.0, 0.0));
    mediump vec4 c3 = texture2D(renderer_BlitTexture, v_uv - vec2(texelSize.x * 1.0, 0.0));
    mediump vec4 c4 = texture2D(renderer_BlitTexture, v_uv);
    mediump vec4 c5 = texture2D(renderer_BlitTexture, v_uv + vec2(texelSize.x * 1.0, 0.0));
    mediump vec4 c6 = texture2D(renderer_BlitTexture, v_uv + vec2(texelSize.x * 2.0, 0.0));
    mediump vec4 c7 = texture2D(renderer_BlitTexture, v_uv + vec2(texelSize.x * 3.0, 0.0));
    mediump vec4 c8 = texture2D(renderer_BlitTexture, v_uv + vec2(texelSize.x * 4.0, 0.0));

    gl_FragColor = c0 * 0.01621622 + c1 * 0.05405405 + c2 * 0.12162162 + c3 * 0.19459459
                + c4 * 0.22702703
                + c5 * 0.19459459 + c6 * 0.12162162 + c7 * 0.05405405 + c8 * 0.01621622;

    gl_FragColor = outputSRGBCorrection(gl_FragColor);
}