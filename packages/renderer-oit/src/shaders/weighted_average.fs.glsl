uniform sampler2D u_Sampler1;
uniform sampler2D u_Sampler2;
uniform vec2 u_resolution;

void main() {
    vec2 screenUv = gl_FragCoord.xy / u_resolution;

    // Bavoil and Myers’ Method
    vec4 accum = texture2D(u_Sampler1, screenUv);
    float count = max(1.0, texture2D(u_Sampler2, screenUv).r * 255.0 ); // * 255 用来兼容非浮点输出
    gl_FragColor = vec4(accum.rgb / max(accum.a, 1e-4), pow(max(0.0, 1.0 - accum.a / count), count));


    // Depth Weights Improve Occlusion
//    vec4 accum = texture2D(u_Sampler1, screenUv);
//    float r = accum.a;
//    accum.a = texture2D(u_Sampler2, screenUv).r;
//    gl_FragColor = vec4(accum.rgb / clamp(accum.a, 1e-4, 5e4), r);
}
