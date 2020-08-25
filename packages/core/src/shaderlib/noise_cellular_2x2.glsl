
// Cellular noise ("Worley noise") in 2D in GLSL.
// Copyright (c) Stefan Gustavson 2011-04-19. All rights reserved.
// This code is released under the conditions of the MIT license.
// See LICENSE file for details.
// https://github.com/stegu/webgl-noise

// Cellular noise, returning F1 and F2 in a vec2.
// Speeded up by using 2x2 search window instead of 3x3,
// at the expense of some strong pattern artifacts.
// F2 is often wrong and has sharp discontinuities.
// If you need a smooth F2, use the slower 3x3 version.
// F1 is sometimes wrong, too, but OK for most purposes.
vec2 cellular2x2( vec2 P ) {

	vec2 Pi = mod289( floor( P ) );
 	vec2 Pf = fract( P );
	vec4 Pfx = Pf.x + vec4( -0.5, -1.5, -0.5, -1.5 );
	vec4 Pfy = Pf.y + vec4( -0.5, -0.5, -1.5, -1.5 );
	vec4 p = permute( Pi.x + vec4( 0.0, 1.0, 0.0, 1.0 ) );
	p = permute( p + Pi.y + vec4( 0.0, 0.0, 1.0, 1.0 ) );
	vec4 ox = mod7( p ) * K + Kd2;
	vec4 oy = mod7( floor( p * K ) ) * K + Kd2;
	vec4 dx = Pfx + jitter1 * ox;
	vec4 dy = Pfy + jitter1 * oy;
	vec4 d = dx * dx + dy * dy; // d11, d12, d21 and d22, squared

	// Do it right and find both F1 and F2
	d.xy = ( d.x < d.y ) ? d.xy : d.yx; // Swap if smaller
	d.xz = ( d.x < d.z ) ? d.xz : d.zx;
	d.xw = ( d.x < d.w ) ? d.xw : d.wx;
	d.y = min( d.y, d.z );
	d.y = min( d.y, d.w );
	return sqrt( d.xy );

}
