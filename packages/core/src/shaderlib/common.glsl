#define PI 3.14159265359
#define LOG2 1.442695

#define saturate( a ) clamp( a, 0.0, 1.0 )
#define whiteCompliment(a) ( 1.0 - saturate( a ) )

// nosie common
#include <noise_common>
