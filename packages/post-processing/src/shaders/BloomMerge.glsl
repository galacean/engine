precision highp float;

varying vec2 v_uv;

uniform sampler2D s_sourceRT;
uniform sampler2D u_blurSampler;
uniform float u_weight;
uniform vec3 u_tintColor;

void main() {

    gl_FragColor = texture2D( s_sourceRT, v_uv );
    vec3 blurred = texture2D( u_blurSampler, v_uv ).rgb;
    gl_FragColor.rgb = gl_FragColor.rgb + ( blurred.rgb * u_weight * u_tintColor );

}
