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
    vec3 result = vec3(0.0);

    // center the cone around the normal (handle case of normal close to up)
    vec3 up = abs(N.z) < 0.999 ? vec3(0, 0, 1) : vec3(1, 0, 0);

    mat3 R;
    R[0] = normalize(cross(up, N));
    R[1] = cross(N, R[0]);
    R[2] = N;

    float maxLevel = textureInfo.y;
    float dim0 = textureInfo.x;
    float omegaP = (4. * PI) / (6. * dim0 * dim0);

    float weight = 0.;
    for(uint i = 0u; i < SAMPLE_COUNT; ++i)
    {
        vec2 Xi = hammersley(i, SAMPLE_COUNT);
        vec3 H = hemisphereImportanceSampleDggx(Xi, lodRoughness);

        float NoV = 1.;
        float NoH = H.z;
        float NoH2 = H.z * H.z;
        float NoL = 2. * NoH2 - 1.;
        vec3 L = vec3(2. * NoH * H.x, 2. * NoH * H.y, NoL);
        L = normalize(L);

        if (NoL > 0.) {
            float pdf_inversed = 4. / D_GGX( lodRoughness, NoH);

            float omegaS = SAMPLE_COUNT_FLOAT_INVERSED * pdf_inversed;
            float l = log4(omegaS) - log4(omegaP) + log4(K);
            float mipLevel = clamp(float(l), 0.0, maxLevel);

            weight += NoL;

            vec4 samlerColor = textureCubeLodEXT(environmentMap, R * L, mipLevel);
            vec3 linearColor = samlerColor.rgb;

            #ifdef RGBE
                linearColor = RGBEToLinear(samlerColor).rgb;
            #endif

            result += linearColor * NoL;
        }
    }

    result = result / weight;

    return result;
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
