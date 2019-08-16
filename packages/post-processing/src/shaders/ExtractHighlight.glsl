precision highp float;

varying vec2 v_uv;

uniform sampler2D s_sourceRT;

uniform float u_exposure;
uniform float u_threshold;

const vec3 LuminanceEncodeApprox = vec3(0.2126, 0.7152, 0.0722);

float getLuminance(vec3 color) {
    return clamp(dot(color, LuminanceEncodeApprox), 0., 1.);
}

void main() {

    gl_FragColor = texture2D( s_sourceRT, v_uv );
    float luma = getLuminance( gl_FragColor.rgb * u_exposure );
    gl_FragColor.rgb = step( u_threshold, luma ) * gl_FragColor.rgb;

}
