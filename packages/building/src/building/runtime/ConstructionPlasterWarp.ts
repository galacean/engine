/** Extracted from the shipped plaster vertex shader; repeated corner hash
 * blocks are factored without changing uint arithmetic or interpolation order.
 * This correlated XZ displacement also appears in the original brick shader.
 * Source SHA-256: f24f9afb14d0ec1e9ea009d82c080550e4630fa7558ca2fa684d54a978011cb0 */
export const constructionPlasterWarpGLSL = `
uint plasterJenkins(uint x) {
 x += x << 10u; x ^= x >> 6u; x += x << 3u; x ^= x >> 11u; return x + (x << 15u);
}
uint plasterTemper(uint x) {
 x ^= x >> 11u; x ^= (x << 7u) & 2636928640u; x ^= (x << 15u) & 4022730752u; return x ^ (x >> 18u);
}
vec2 plasterCorner(ivec3 cell) {
 uvec3 p=uvec3(cell);
 uint h=plasterJenkins(p.z);
 h=plasterTemper(((p.y*1664525u+h)+1013904223u)*1664525u);
 h=plasterTemper(((p.x*1664525u+h)+1013904223u)*1664525u);
 return vec2(uintBitsToFloat((h & 8388607u)|1065353216u)-1.0,
   uintBitsToFloat((plasterJenkins(h) & 8388607u)|1065353216u)-1.0);
}
vec3 masonryPlasterWarp(vec3 position) {
 vec3 q=position*.4, f=fract(q); ivec3 p=ivec3(floor(q));
 vec3 w=f*f*(vec3(3.0)-2.0*f);
 float x=w.x, a=1.0-x, y=w.y, b=1.0-y, z=w.z, c=1.0-z;
 vec2 noise=plasterCorner(p)*a*b*c;
 noise+=plasterCorner(p+ivec3(1,0,0))*x*b*c;
 noise+=plasterCorner(p+ivec3(0,1,0))*a*y*c;
 noise+=plasterCorner(p+ivec3(1,1,0))*x*y*c;
 noise+=plasterCorner(p+ivec3(0,0,1))*a*b*z;
 noise+=plasterCorner(p+ivec3(1,0,1))*x*b*z;
 noise+=plasterCorner(p+ivec3(0,1,1))*a*y*z;
 noise+=plasterCorner(p+ivec3(1,1,1))*x*y*z;
 noise=clamp((noise-.5)*2.5,vec2(-.5),vec2(.5));
 return position+vec3(noise.x,0.0,noise.y)*.06;
}
`;
