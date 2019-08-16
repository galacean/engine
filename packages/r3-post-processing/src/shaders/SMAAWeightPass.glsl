#define SMAA_MAX_SEARCH_STEPS 8
#define SMAA_AREATEX_MAX_DISTANCE 16
#define SMAA_AREATEX_PIXEL_SIZE ( 1.0 / vec2( 160.0, 560.0 ) )
#define SMAA_AREATEX_SUBTEX_SIZE ( 1.0 / 7.0 )
#define SMAASampleLevelZeroOffset( tex, coord, offset ) texture2D( tex, coord + float( offset ) * u_resolution, 0.0 )
precision highp float;
varying vec2 v_uv;

uniform sampler2D s_sourceRT;
uniform vec2 u_resolution;
uniform sampler2D s_Area;
uniform sampler2D s_Search;

void SMAABlendingWeightCalculation( vec2 texcoord, out vec4 Offset[ 3 ]) {

  Offset[ 0 ] = texcoord.xyxy + u_resolution.xyxy * vec4( -0.25, 0.125, 1.25, 0.125 );
  Offset[ 1 ] = texcoord.xyxy + u_resolution.xyxy * vec4( -0.125, 0.25, -0.125, -1.25 );

  Offset[ 2 ] = vec4( Offset[ 0 ].xz, Offset[ 1 ].yw ) + vec4( -2.0, 2.0, -2.0, 2.0 ) * u_resolution.xxyy * float( SMAA_MAX_SEARCH_STEPS );

}

vec2 round( vec2 x ) {
  return sign( x ) * floor( abs( x ) + 0.5 );
}

float SMAASearchLength( sampler2D searchTex, vec2 e, float bias, float scale ) {
  e.r = bias + e.r * scale;
  return 255.0 * texture2D( searchTex, e, 0.0 ).r;
}

float SMAASearchXLeft( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
    vec2 e = vec2( 0.0, 1.0 );
    for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) {
        e = texture2D( edgesTex, texcoord, 0.0 ).rg;
        texcoord -= vec2( 2.0, 0.0 ) * u_resolution;
        if ( ! ( texcoord.x > end && e.g > 0.8281 && e.r == 0.0 ) ) break;
    }
    texcoord.x += 0.25 * u_resolution.x;
    texcoord.x += u_resolution.x;
    texcoord.x += 2.0 * u_resolution.x;
    texcoord.x -= u_resolution.x * SMAASearchLength(searchTex, e, 0.0, 0.5);
    return texcoord.x;
}

float SMAASearchXRight( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
    vec2 e = vec2( 0.0, 1.0 );
    for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) {
        e = texture2D( edgesTex, texcoord, 0.0 ).rg;
        texcoord += vec2( 2.0, 0.0 ) * u_resolution;
        if ( ! ( texcoord.x < end && e.g > 0.8281 && e.r == 0.0 ) ) break;
    }
    texcoord.x -= 0.25 * u_resolution.x;
    texcoord.x -= u_resolution.x;
    texcoord.x -= 2.0 * u_resolution.x;
    texcoord.x += u_resolution.x * SMAASearchLength( searchTex, e, 0.5, 0.5 );
    return texcoord.x;
}

float SMAASearchYUp( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
    vec2 e = vec2( 1.0, 0.0 );
    for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) {
        e = texture2D( edgesTex, texcoord, 0.0 ).rg;
        texcoord += vec2( 0.0, 2.0 ) * u_resolution;
        if ( ! ( texcoord.y > end && e.r > 0.8281 && e.g == 0.0 ) ) break;
    }
    texcoord.y -= 0.25 * u_resolution.y;
    texcoord.y -= u_resolution.y;
    texcoord.y -= 2.0 * u_resolution.y;
    texcoord.y += u_resolution.y * SMAASearchLength( searchTex, e.gr, 0.0, 0.5 );
    return texcoord.y;
}

float SMAASearchYDown( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
    vec2 e = vec2( 1.0, 0.0 );
    for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) {
        e = texture2D( edgesTex, texcoord, 0.0 ).rg;
        texcoord -= vec2( 0.0, 2.0 ) * u_resolution;
        if ( ! ( texcoord.y < end && e.r > 0.8281 && e.g == 0.0 ) ) break;
    }
    texcoord.y += 0.25 * u_resolution.y;
    texcoord.y += u_resolution.y;
    texcoord.y += 2.0 * u_resolution.y;
    texcoord.y -= u_resolution.y * SMAASearchLength( searchTex, e.gr, 0.5, 0.5 );
    return texcoord.y;
}

vec2 SMAAArea( sampler2D areaTex, vec2 dist, float e1, float e2, float offset ) {
    vec2 texcoord = float( SMAA_AREATEX_MAX_DISTANCE ) * round( 4.0 * vec2( e1, e2 ) ) + dist;
    texcoord = SMAA_AREATEX_PIXEL_SIZE * texcoord + ( 0.5 * SMAA_AREATEX_PIXEL_SIZE );
    texcoord.y += SMAA_AREATEX_SUBTEX_SIZE * offset;
    return texture2D( areaTex, texcoord, 0.0 ).rg;
}

vec4 SMAABlendingWeightCalculationPS( vec2 texcoord, vec2 pixcoord, vec4 offset[ 3 ], sampler2D edgesTex, sampler2D areaTex, sampler2D searchTex, ivec4 subsampleIndices ) {
    vec4 weights = vec4( 0.0, 0.0, 0.0, 0.0 );
    vec2 e = texture2D( edgesTex, texcoord ).rg;
    if ( e.g > 0.0 ) {
        vec2 d;
        vec2 coords;
        coords.x = SMAASearchXLeft( edgesTex, searchTex, offset[ 0 ].xy, offset[ 2 ].x );
        coords.y = offset[ 1 ].y;
        d.x = coords.x;
        float e1 = texture2D( edgesTex, coords, 0.0 ).r;
        coords.x = SMAASearchXRight( edgesTex, searchTex, offset[ 0 ].zw, offset[ 2 ].y );
        d.y = coords.x;
        d = d / u_resolution.x - pixcoord.x;
        vec2 sqrt_d = sqrt( abs( d ) );
        coords.y -= 1.0 * u_resolution.y;
        float e2 = SMAASampleLevelZeroOffset( edgesTex, coords, ivec2( 1, 0 ) ).r;
        weights.rg = SMAAArea( areaTex, sqrt_d, e1, e2, float( subsampleIndices.y ) );
    }
    if ( e.r > 0.0 ) {
        vec2 d;
        vec2 coords;
        coords.y = SMAASearchYUp( edgesTex, searchTex, offset[ 1 ].xy, offset[ 2 ].z );
        coords.x = offset[ 0 ].x;
        d.x = coords.y;
        float e1 = texture2D( edgesTex, coords, 0.0 ).g;
        coords.y = SMAASearchYDown( edgesTex, searchTex, offset[ 1 ].zw, offset[ 2 ].w );
        d.y = coords.y;
        d = d / u_resolution.y - pixcoord.y;
        vec2 sqrt_d = sqrt( abs( d ) );
        coords.y -= 1.0 * u_resolution.y;
        float e2 = SMAASampleLevelZeroOffset( edgesTex, coords, ivec2( 0, 1 ) ).g;
        weights.ba = SMAAArea( areaTex, sqrt_d, e1, e2, float( subsampleIndices.x ) );
    }
    return weights;
}

void main() {

  vec4 vOffset[ 3 ];
  SMAABlendingWeightCalculation(v_uv, vOffset);
  vec2 vPixcoord = v_uv / u_resolution;

  gl_FragColor = SMAABlendingWeightCalculationPS( v_uv, vPixcoord, vOffset, s_sourceRT, s_Area, s_Search, ivec4( 0.0 ) );

}