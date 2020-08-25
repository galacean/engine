// Modulo 289 without a division (only multiplications)
vec4 mod289( vec4 x ) {

    return x - floor( x * ( 1.0 / 289.0 ) ) * 289.0;

}

vec3 mod289( vec3 x ) {

    return x - floor( x * ( 1.0 / 289.0 ) ) * 289.0;

}

vec2 mod289( vec2 x ) {

    return x - floor( x * ( 1.0 / 289.0 ) ) * 289.0;

}

float mod289( float x ) {

    return x - floor( x * ( 1.0 / 289.0 ) ) * 289.0;

}

// Modulo 7 without a division
vec4 mod7( vec4 x ) {

    return x - floor( x * ( 1.0 / 7.0 ) ) * 7.0;

}

vec3 mod7( vec3 x ) {

    return x - floor( x * ( 1.0 / 7.0 ) ) * 7.0;

}

// Permutation polynomial: (34x^2 + x) mod 289
vec4 permute( vec4 x ) {

    return mod289( ( 34.0 * x + 1.0 ) * x);

}

vec3 permute( vec3 x ) {

    return mod289( ( 34.0 * x + 1.0 ) * x );

}

float permute( float x ) {

  return mod289( ( ( x * 34.0 ) + 1.0 ) * x );

}

vec4 taylorInvSqrt( vec4 r ) {

    return 1.79284291400159 - 0.85373472095314 * r;

}

float taylorInvSqrt( float r ) {

    return 1.79284291400159 - 0.85373472095314 * r;

}

vec4 fade( vec4 t ) {

    return t * t * t * ( t * ( t * 6.0 - 15.0 ) + 10.0 );

}

vec3 fade( vec3 t ) {

    return t * t * t * ( t * ( t * 6.0 - 15.0 ) + 10.0 );

}

vec2 fade( vec2 t ) {

    return t * t * t * ( t * ( t * 6.0 - 15.0 ) + 10.0 );

}

#define K 0.142857142857 // 1/7
#define Ko 0.428571428571 // 1/2-K/2
#define K2 0.020408163265306 // 1/(7*7)
#define Kd2 0.0714285714285 // K/2
#define Kz 0.166666666667 // 1/6
#define Kzo 0.416666666667 // 1/2-1/6*2
#define jitter 1.0 // smaller jitter gives more regular pattern
#define jitter1 0.8 // smaller jitter gives less errors in F1 F2
