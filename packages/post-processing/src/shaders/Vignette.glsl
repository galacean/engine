//https://github.com/mattdesl/gl-vignette-background/blob/master/frag.glsl
precision highp float;
varying vec2 v_uv;

uniform sampler2D s_sourceRT;

uniform float u_aspect;
uniform float u_coloredNoise;
uniform vec2 u_smoothing;
uniform float u_noiseAlpha;
uniform vec3 u_color;

highp float random(vec2 co)
{
    highp float a = 12.9898;
    highp float b = 78.233;
    highp float c = 43758.5453;
    highp float dt= dot(co.xy ,vec2(a,b));
    highp float sn= mod(dt,3.14);
    return fract(sin(sn) * c);
}

vec3 blend(vec3 base, vec3 blend) {
    return mix(1.0 - 2.0 * (1.0 - base) * (1.0 - blend), 2.0 * base * blend, step(base, vec3(0.5)));
}


void main() {	

	vec3 source_color = texture2D(s_sourceRT, v_uv).rgb;
	vec2 pos = v_uv;
	pos -= 0.5;

	pos.x *= u_aspect;

	float dist = length(pos);
	dist = smoothstep(u_smoothing.x, u_smoothing.y, 1.0-dist);

	vec4 color = vec4(1.0);
	color.rgb = mix(u_color, source_color, dist);

	if (u_noiseAlpha > 0.0) {
		vec3 noise = (u_coloredNoise > 0.0)? vec3(random(v_uv * 1.5), random(v_uv * 2.5), random(v_uv)) : vec3(random(v_uv));
		color.rgb = mix(color.rgb, blend(color.rgb, noise), u_noiseAlpha);
	}

  gl_FragColor = color;
 
}