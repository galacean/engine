import hammersley from "./hammersley";
import importanceSampling from "./importanceSampling";

export default `
varying vec2 v_uv;

uniform samplerCube environmentMap;
uniform vec2 textureInfo;
uniform float face;
uniform float lodRoughness;

#define PI 3.14159265359
#define RECIPROCAL_PI 0.31830988618

const uint SAMPLE_COUNT = 4096u;
const float SAMPLE_COUNT_FLOAT = float(SAMPLE_COUNT);
const float SAMPLE_COUNT_FLOAT_INVERSED = 1. / SAMPLE_COUNT_FLOAT;

const float K = 4.;

float log4(float x) {
    return log2(x) / 2.;
}

float pow2( const in float x ) {
    return x * x;
}

vec4 RGBEToLinear(vec4 value) {
    return vec4( step(0.0, value.a) * value.rgb * exp2( value.a * 255.0 - 128.0 ), 1.0 );
}

vec4 LinearToRGBE( in vec4 value ) {
	float maxComponent = max( max( value.r, value.g ), value.b );
	float fExp = clamp( ceil( log2( maxComponent ) ), -128.0, 127.0 );
	return vec4( value.rgb / exp2( fExp ), ( fExp + 128.0 ) / 255.0 );
}

// Microfacet Models for Refraction through Rough Surfaces - equation (33)
// http://graphicrants.blogspot.com/2013/08/specular-brdf-reference.html
// alpha is "roughness squared" in Disney’s reparameterization
float D_GGX( const in float alpha, const in float dotNH ) {

	float a2 = pow2( alpha );

	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0; // avoid alpha = 0 with dotNH = 1

	return RECIPROCAL_PI * a2 / pow2( denom );

}

${hammersley}
${importanceSampling}

vec3 specular(vec3 N) {
    vec3 R = N;
    vec3 V = R;

    float totalWeight = 0.0;   
    vec3 prefilteredColor = vec3(0.0);     

    for(uint i = 0u; i < SAMPLE_COUNT; ++i)
    {
        vec2 Xi = hammersley(i, SAMPLE_COUNT);
        vec3 H  = importanceSampleGGX(Xi, N, lodRoughness);
        vec3 L  = normalize(2.0 * dot(V, H) * H - V);

        float NdotL = max(dot(N, L), 0.0);
        if(NdotL > 0.0)
        {
            vec3 linearColor = texture(environmentMap, L).rgb * NdotL;
            
            #ifdef RGBE
                linearColor = RGBEToLinear(samlerColor).rgb;
            #endif

            prefilteredColor += linearColor;
            totalWeight      += NdotL;
        }
    }
    prefilteredColor = prefilteredColor / totalWeight;
    return prefilteredColor;
}

void main() 
{
    float cx = v_uv.x * 2. - 1.;
    float cy = v_uv.y * 2. - 1.;

    vec3 dir = vec3(0.);
    if (face == 0.) { // PX
        dir = vec3( 1.,  cy, -cx);
    }
    else if (face == 1.) { // NX
        dir = vec3(-1.,  cy,  cx);
    }
    else if (face == 2.) { // PY
        dir = vec3( cx,  1., -cy);
    }
    else if (face == 3.) { // NY
        dir = vec3( cx, -1.,  cy);
    }
    else if (face == 4.) { // PZ
        dir = vec3( cx,  cy,  1.);
    }
    else if (face == 5.) { // NZ
        dir = vec3(-cx,  cy, -1.);
    }
    dir = normalize(dir);

    if (lodRoughness == 0.) {
        gl_FragColor = textureCube(environmentMap, dir);
    } else {
        vec3 integratedBRDF = specular(dir);
        gl_FragColor = vec4(integratedBRDF, 1.);

        #ifdef RGBE
            gl_FragColor = LinearToRGBE(gl_FragColor);
        #endif
    }
}
`;
