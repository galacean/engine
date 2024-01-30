Shader "Waterfull" {
  EditorProperties { // 颜色
    _ShallowColor( "shallow color", Color ) = ( 0.4858, 1, 0.86, 1.0 );
    _DeepColor( "deep color", Color ) = ( 0, 0.4673, 0, 1 );
    _WaterDeep( "water deep", Range( 3, 8, 0.1 ) ) = 5;
    _FresnelColor( "fresnel color", Color ) = ( 0.788, 0.89, 1, 1 );
    _FresnelIntensity( "fresnel intensity", Float ) = 0;
    _ReflectionAngle( "reflection angle", Float ) = 0.3;
    _ShoreDistance( "shore distance", Float ) = 0.6;
    _Alpha( "alpha", Float ) = 0.6;
    _DayIntensity( "_DayIntensity", Float ) = 0.39;
    // 法线
    _WaterNormalSmall( "water normal small", Texture2D );
    _SmallNormalTiling( "small normal tiling", Float ) = 1.4;
    _SmallNormalSpeed( "small normal speed", Float ) = 0.38;
    _SmallNormalIntensity( "small normal intensity", Float ) = 0.15;
    _WaterNormalLarge( "water normal large", Texture2D );
    _LargeNormalTiling( "large normal tiling", Float ) = 1.22;
    _LargeNormalSpeed( "large normal speed", Float ) = 1.0;
    _LargeNormalIntensity( "large normal intensity", Float ) = 0.08;
    // 反射
    _ReflectCube( "relect cube", TextureCube );
    _ReflectDistort( "relect distort", Float ) = 0.3;
    _ReflectIntensity( "reflect intensity", Float ) = 1.18;
    // 焦散
    _CausticsTex( "caustics texture", Texture2D );
    _CausticsScale( "caustic scanle", Float ) = 10;
    _CausticsSpeed( "caustic speed", Vector2 ) = ( -9, 0 );
    _CausticsIntensity( "caustic intensity", Float ) = 0.8;
    // Foam
    _FoamNoise( "foam noise", Texture2D );
    _XTilling( "x tiling", Float ) = 1.0;
    _YTilling( "y tiling", Float ) = 1.0;
    _FoamNoiseSpeed( "foam noise speed", Vector2 ) = ( 0, -0.3 );
    _FoamOffset( "foam offset", Float ) = 0.42;
    _FoamRange( "foam range", Float ) = 0.5;
    _FoamColor( "foam color", Color ) = ( 1, 1, 1, 1 );
    // 波光
    _SparklesIntensity( "sparkles intensity", Float ) = 5;
    _SparklesAmount( "sparkles amount", Float ) = 0.5;
    // 顶点波浪
    _Direction( "direction", Vector2 ) = ( 1, 1 );
    _WaveSpeed( "wave speed", Float ) = 0.5;
    _WaveDistance( "wave distance", Float ) = 0.288;
    _WaveHeight( "wave height", Float ) = 0.1;
    _SubWaveDirection( "sub wave direction", Vector4 ) = ( 0.1, 0.1, 0.1, 0.1 );
    _WaveNormalStr( "wave normal strength", Float ) = 0.16;
    _WaveFadeStart( "wave fade start", Int ) = 200;
    _WaveFadeEnd( "wave fade end", Int ) = 500;
    _WaveColor( "wave color", Color ) = ( 0, 4, 3.75, 1 );
  }
  SubShader "sub1" {
    Pass "p1" {
      mat4 camera_VPMat;
      mat4 camera_ViewInvMat;
      vec4 scene_ElapsedTime;
      float _WaveSpeed;
      vec2 _Direction;
      vec4 _SubWaveDirection;
      float _WaveDistance;
      float _WaveHeight;
      float _WaveNormalStr;
      float _WaveFadeStart;
      float _WaveFadeEnd;
      mat4 camera_ProjMat;
      mat4 renderer_ModelMat;
      mat4 renderer_NormalMat;
      vec3 camera_Position;
      struct a2v {
        vec3 POSITION;
        vec2 TEXCOORD_0;
        vec3 NORMAL;
        vec4 TANGENT;
      }
      struct v2f {
        mat4 v_ProjectionInvMat;
        vec2 v_uv;
        float v_waveY;
        vec3 v_posOS;
        vec3 v_posWS;
        vec4 v_posCS;
        vec3 v_normalOS;
        vec3 v_defaultNormalWS;
        vec3 v_defaultTangentWS;
        vec3 v_defaultBinormalWS;
      }
      vec3 GerstnerOffset4( vec2 xzVtx, vec4 steepness, vec4 amp, vec4 freq, vec4 speed, vec4 dirAB, vec4 dirCD ) {
        vec3 offsets;
        vec4 AB = steepness.xxyy * dirAB.xyzw * amp.xxyy;
        vec4 CD = steepness.zzww * dirCD.xyzw * amp.zzww;
        vec4 dotABCD = freq.xyzw * vec4( dot( dirAB.xy, xzVtx ), dot( dirAB.zw, xzVtx ), dot( dirCD.xy, xzVtx ), dot( dirCD.zw, xzVtx ) );
        vec4 COS = cos( dotABCD + speed );
        vec4 SIN = sin( dotABCD + speed );
        offsets.x = dot( COS, vec4( AB.xz, CD.xz ) );
        offsets.z = dot( COS, vec4( AB.yw, CD.yw ) );
        offsets.y = dot( SIN, amp ); // Remap to only positive values;
        return offsets;
      }
      vec3 GerstnerNormal4( vec2 xzVtx, vec4 amp, vec4 freq, vec4 speed, vec4 dirAB, vec4 dirCD, float normalStr ) {
        vec3 nrml = vec3( 0, 2.0, 0 );
        vec4 AB = freq.xxyy * amp.xxyy * dirAB.xyzw;
        vec4 CD = freq.zzww * amp.zzww * dirCD.xyzw;
        vec4 dotABCD = freq.xyzw * vec4( dot( dirAB.xy, xzVtx ), dot( dirAB.zw, xzVtx ), dot( dirCD.xy, xzVtx ), dot( dirCD.zw, xzVtx ) );
        vec4 COS = cos( dotABCD + speed );
        nrml.x -= dot( COS, vec4( AB.xz, CD.xz ) );
        nrml.z -= dot( COS, vec4( AB.yw, CD.yw ) );
        nrml.xz *= normalStr;
        nrml = normalize( nrml );
        return nrml;
      }
      void Gerstner( vec3 offs, vec3 nrml, vec2 position, vec4 amplitude, vec4 frequency, vec4 steepness, vec4 speed, vec4 directionAB, vec4 directionCD, float normalStr ) {
        offs += GerstnerOffset4( position, steepness, amplitude, frequency, speed, directionAB, directionCD );
        // #ifdef CALCULATE_NORMALS
        nrml += GerstnerNormal4( position, amplitude, frequency, speed, directionAB, directionCD, normalStr );
        // #endif
      }
      #define WAVE_COUNT 2
      #define MAX_WAVE_COUNT 5
      #define STEEPNESS_SCALE 0.01
      // v1.1.8+
      void GetWaveInfo( vec2 position, vec2 time, vec4 directionABCD, float wavedistance, float height, float normalStr, float fadeStart, float fadeEnd, vec3 positionWSOffset, vec3 normalWS ) {
        vec3 positionOffset = vec3( 0.0, 0.0, 0.0 );
        vec3 normal = vec3( 0.0, 0.0, 0.0 );
        vec4 amp = vec4( 0.3, 0.35, 0.25, 0.25 );
        vec4 freq = vec4( 1.3, 1.35, 1.25, 1.25 ) * ( 1.0 - wavedistance ) * 3.0;
        vec4 speed = vec4( 1.2 * time.x, 1.375 * time.y, 1.1 * time.x, time.y ); // Pre-multiplied with time
        vec4 dir1 = vec4( 0.3, 0.85, 0.85, 0.25 ) * directionABCD;
        vec4 dir2 = vec4( 0.1, 0.9, -0.5, -0.5 ) * directionABCD;
        // vec4 steepness = vec4(12.0, 12.0, 12.0, 12.0) * _WaveSteepness * lerp(1.0, MAX_WAVE_COUNT, 1/WAVE_COUNT);
        vec4 steepness = vec4( 0.0, 0.0, 0.0, 0.0 );
        // Distance based scalar
        float pixelDist = length( camera_Position.xz - position.xy );
        float fadeFactor = clamp( ( fadeEnd - pixelDist ) / ( fadeEnd - fadeStart ), 0.0, 1.0 );
        for ( int i = 0; i <= WAVE_COUNT; i ++ ) {
          float t = 1.0 + ( float( i ) / float( WAVE_COUNT ) );
          freq *= t;
          amp *= fadeFactor;
          Gerstner( positionOffset, normal, position, amp, freq, steepness, speed, dir1, dir2, normalStr );
        }
        normalWS = normalize( normal );
        // Average
        positionOffset.y /= float( WAVE_COUNT );
        positionOffset.xz *= STEEPNESS_SCALE * height;
        positionOffset.y *= height;
        positionWSOffset = positionOffset;
      }
      v2f vert( a2v v ) {
        v2f out;
        out.v_ProjectionInvMat = inverse( camera_ProjMat );
        mat4 WorldToObjectMat = inverse( renderer_ModelMat );
        out.v_uv = v.TEXCOORD_0;
        vec3 defaultPosWS = ( renderer_ModelMat * vec4( v.POSITION, 1.0 ) ).xyz;
        vec3 defaultNormalWS = normalize( mat3( renderer_NormalMat ) * v.NORMAL.xyz );
        vec3 defaultTangentWS = normalize( mat3( renderer_NormalMat ) * v.TANGENT.xyz );
        vec3 defaultBinormalWS = cross( defaultNormalWS, defaultTangentWS ) * v.TANGENT.w;
        // #ifdef _VERTEXWAVE_ON
        vec3 positionWSOffset = vec3( 0.0, 0.0, 0.0 );
        vec3 normalWS = vec3( 0.0, 0.0, 0.0 );
        GetWaveInfo( defaultPosWS.xz, scene_ElapsedTime.x * _WaveSpeed * _Direction, _SubWaveDirection, _WaveDistance, _WaveHeight, _WaveNormalStr, _WaveFadeStart, _WaveFadeEnd, positionWSOffset, normalWS );
        vec3 waveVertexPos = ( WorldToObjectMat * vec4( positionWSOffset + defaultPosWS, 1.0 ) ).xyz;
        float waveY = positionWSOffset.y;
        vec3 waveVertexNormal = normalize( ( WorldToObjectMat * vec4( normalWS, 0.0 ) ).xyz );
        // #else
        // vec3 NormalWS = normalize( mat3( renderer_NormalMat ) * v.NORMAL.xyz );
        // vec3 waveVertexPos = POSITION;
        // float waveY = 0.0;
        // vec3 waveVertexNormal = NORMAL;
        // #endif
        vec3 posWS = ( renderer_ModelMat * vec4( waveVertexPos, 1.0 ) ).xyz;
        vec4 posCS = camera_VPMat * vec4( posWS, 1.0 );
        out.v_waveY = waveY;
        out.v_posOS = waveVertexPos;
        out.v_posWS = posWS;
        out.v_posCS = posCS;
        out.v_normalOS = waveVertexNormal;
        out.v_defaultNormalWS = defaultNormalWS;
        out.v_defaultBinormalWS = defaultBinormalWS;
        out.v_defaultTangentWS = defaultTangentWS;
        gl_Position = posCS;
        return out;
      }
      VertexShader = vert;
      sampler2D camera_DepthTexture;
      vec3 _ShallowColor;
      vec3 _DeepColor;
      float _WaterDeep;
      vec3 _FresnelColor;
      float _FresnelIntensity;
      float _ReflectionAngle;
      float _ShoreDistance;
      float _Alpha;
      float _DayIntensity;
      sampler2D _WaterNormalSmall;
      float _SmallNormalTiling;
      float _SmallNormalSpeed;
      float _SmallNormalIntensity;
      sampler2D _WaterNormalLarge;
      float _LargeNormalTiling;
      float _LargeNormalSpeed;
      float _LargeNormalIntensity;
      samplerCube _ReflectCube;
      float _ReflectDistort;
      float _ReflectIntensity;
      sampler2D _CausticsTex;
      float _CausticsScale;
      vec2 _CausticsSpeed;
      float _CausticsIntensity;
      sampler2D _FoamNoise;
      float _XTilling;
      float _YTilling;
      vec2 _FoamNoiseSpeed;
      float _FoamOffset;
      float _FoamRange;
      vec3 _FoamColor;
      float _SparklesIntensity;
      float _SparklesAmount;
      vec3 _WaveColor;
      vec3 BlendNormal( vec3 n1, vec3 n2 ) {
        return normalize( vec3( n1.xy * n2.z + n2.xy * n1.z, n1.z * n2.z ) );
      }
      void frag( v2f i ) {
        vec3 posWS = i.v_posWS;
        vec3 posOS = i.v_posOS;
        vec4 posCS = i.v_posCS;
        vec3 posCSNDC = posCS.xyz / posCS.w;
        vec3 normalOS = normalize( i.v_normalOS );
        vec3 defaultNormalWS = normalize( i.v_defaultNormalWS );
        vec3 defaultTangentWS = normalize( i.v_defaultTangentWS );
        vec3 defaultBinormalWS = normalize( i.v_defaultBinormalWS );
        vec3 tanToWorld0 = vec3( defaultTangentWS.x, defaultBinormalWS.x, defaultNormalWS.x );
        vec3 tanToWorld1 = vec3( defaultTangentWS.y, defaultBinormalWS.y, defaultNormalWS.y );
        vec3 tanToWorld2 = vec3( defaultTangentWS.z, defaultBinormalWS.z, defaultNormalWS.z );
        vec3 viewDirWS = normalize( camera_Position - posWS );
        float WaterDepth = 0.0;
        vec3 UnderwaterPosWS = vec3( 0.0, 0.0, 0.0 );
        {
          vec2 screenUV = posCSNDC.xy * 0.5 + 0.5;
          vec4 texel = texture2D( camera_DepthTexture, screenUV );
          float depth = texel.r;
          vec3 underwaterPosNDC = vec3( screenUV, depth ) * 2.0 - 1.0;
          vec4 underwaterPosWSFromDepth = camera_ViewInvMat * v_ProjectionInvMat * vec4( underwaterPosNDC, 1.0 );
          UnderwaterPosWS = underwaterPosWSFromDepth.xyz / underwaterPosWSFromDepth.w;
          WaterDepth = posWS.y - UnderwaterPosWS.y;
          WaterDepth *= 1.0;
        }
        vec3 SurfaceNormal = vec3( 0.0, 0.0, 1.0 );
        {
          vec3 SmallNormalData = vec3( 0.0, 0.0, 1.0 );
          {
            vec2 uv = i.v_uv * _SmallNormalTiling;
            float offset = ( _SmallNormalSpeed * scene_ElapsedTime.x * 0.1 );
            vec3 smallNormalData = vec3( 0.0, 0.0, 0.0 );
            vec2 uv1 = ( offset * vec2( 0.1, 0.1 ) ) + uv;
            vec4 pixel = texture2D( _WaterNormalSmall, uv1 );
            smallNormalData = pixel.xyz * 2.0 - 1.0;
            #ifdef _WATERQULIATY_MID
            uv1 = ( offset * vec2( 0.1, 0.1 ) ) + uv;
            vec2 uv2 = ( offset * vec2( -0.1, -0.1 ) ) + uv + 0.4;
            vec4 pixel1 = texture2D( _WaterNormalSmall, uv1 );
            vec4 pixel2 = texture2D( _WaterNormalSmall, uv2 );
            vec3 smallNormalData1 = pixel1.xyz * 2.0 - 1.0;
            vec3 smallNormalData2 = pixel2.xyz * 2.0 - 1.0;
            smallNormalData = BlendNormal( smallNormalData1, smallNormalData2 );
            #endif
            #ifdef _WATERQULIATY_HIGH
            vec2 uv1 = ( offset * vec2( 0.1, 0.1 ) ) + uv;
            vec2 uv2 = ( offset * vec2( -0.1, -0.1 ) ) + uv + 0.4;
            vec2 uv3 = ( offset * vec2( -0.1, 0.1 ) + ( uv + vec2( 0.85, 0.15 ) ) );
            vec2 uv4 = ( offset * vec2( 0.1, -0.1 ) + ( uv + vec2( 0.65, 0.75 ) ) );
            vec4 pixel1 = texture2D( _WaterNormalSmall, uv1 );
            vec4 pixel2 = texture2D( _WaterNormalSmall, uv2 );
            vec4 pixel3 = texture2D( _WaterNormalSmall, uv3 );
            vec4 pixel4 = texture2D( _WaterNormalSmall, uv4 );
            vec3 smallNormalData1 = pixel1.xyz * 2.0 - 1.0;
            vec3 smallNormalData2 = pixel2.xyz * 2.0 - 1.0;
            vec3 smallNormalData3 = pixel3.xyz * 2.0 - 1.0;
            vec3 smallNormalData4 = pixel4.xyz * 2.0 - 1.0;
            smallNormalData = BlendNormal( smallNormalData1, smallNormalData2 );
            smallNormalData = BlendNormal( smallNormalData, smallNormalData3 );
            smallNormalData = BlendNormal( smallNormalData, smallNormalData4 );
            #endif
            SmallNormalData = mix( vec3( 0.0, 0.0, 1.0 ), smallNormalData, _SmallNormalIntensity );
          }
          vec3 LargeNormalData = vec3( 0.0, 0.0, 1.0 );
          {
            vec2 uv = i.v_uv * _LargeNormalTiling;
            float offset = ( _LargeNormalSpeed * scene_ElapsedTime.x * 0.1 );
            vec3 largeNormalData = vec3( 0.0, 0.0, 0.0 );
            vec2 uv1 = ( offset * vec2( 0.1, 0.1 ) ) + uv;
            vec4 pixel1 = texture2D( _WaterNormalLarge, uv1 );
            largeNormalData = pixel1.xyz * 2.0 - 1.0;
            #ifdef _WATERQULIATY_MID
            uv1 = ( offset * vec2( 0.1, 0.1 ) ) + uv;
            vec2 uv2 = ( offset * vec2( -0.1, -0.1 ) ) + uv + 0.4;
            pixel1 = texture2D( _WaterNormalLarge, uv1 );
            vec4 pixel2 = texture2D( _WaterNormalLarge, uv2 );
            vec3 largeNormalData1 = pixel1.xyz * 2.0 - 1.0;
            vec3 largeNormalData2 = pixel2.xyz * 2.0 - 1.0;
            largeNormalData = BlendNormal( largeNormalData1, largeNormalData2 );
            #endif
            #ifdef _WATERQULIATY_HIGH
            uv1 = ( offset * vec2( 0.1, 0.1 ) ) + uv;
            uv2 = ( offset * vec2( -0.1, -0.1 ) ) + uv + 0.4;
            vec2 uv3 = ( offset * vec2( -0.1, 0.1 ) + ( uv + vec2( 0.85, 0.15 ) ) );
            vec2 uv4 = ( offset * vec2( 0.1, -0.1 ) + ( uv + vec2( 0.65, 0.75 ) ) );
            pixel1 = texture2D( _WaterNormalLarge, uv1 );
            vec4 pixel2 = texture2D( _WaterNormalLarge, uv2 );
            vec4 pixel3 = texture2D( _WaterNormalLarge, uv3 );
            vec4 pixel4 = texture2D( _WaterNormalLarge, uv4 );
            vec3 largeNormalData1 = pixel1.xyz * 2.0 - 1.0;
            vec3 largeNormalData2 = pixel2.xyz * 2.0 - 1.0;
            vec3 largeNormalData3 = pixel3.xyz * 2.0 - 1.0;
            vec3 largeNormalData4 = pixel4.xyz * 2.0 - 1.0;
            largeNormalData = BlendNormal( largeNormalData1, largeNormalData2 );
            largeNormalData = BlendNormal( largeNormalData, largeNormalData3 );
            largeNormalData = BlendNormal( largeNormalData, largeNormalData4 );
            #endif
            LargeNormalData = mix( vec3( 0.0, 0.0, 1.0 ), largeNormalData, _LargeNormalIntensity );
          }
          SurfaceNormal = normalize( BlendNormal( SmallNormalData, LargeNormalData ) );
        }
        // Fresnel
        float FresnelFactor = 0.0;
        float ReflectFresnel = 0.0;
        float ColorFresnel = 0.0;
        {
          vec3 SurfaceNormalWS = vec3( dot( tanToWorld0, SurfaceNormal ), dot( tanToWorld1, SurfaceNormal ), dot( tanToWorld2, SurfaceNormal ) );
          float NoV = dot( viewDirWS, SurfaceNormalWS );
          FresnelFactor = 1.0 - max( NoV, 0.0 );
          FresnelFactor = mix( 0.04, 1.0, pow( FresnelFactor, 5.0 ) ); // 限制最小值
          ReflectFresnel = pow( FresnelFactor, _ReflectionAngle );
          ColorFresnel = ( ReflectFresnel * _FresnelIntensity * 5.0 );
          ColorFresnel = clamp( ( ColorFresnel * ColorFresnel ), 0.0, 1.0 );
        }
        // Water Color
        float WaterDeepFresnelRange = 0.0;
        vec3 WaterColor = vec3( 0.0, 0.0, 0.0 );
        {
          vec3 deepFresnelColor = mix( _DeepColor, _FresnelColor, ColorFresnel );
          float waveY = clamp( i.v_waveY, 0.0, 1.0 );
          vec3 deepFresnelWaveColor = mix( deepFresnelColor, _WaveColor, waveY );
          float waterDeepRange = WaterDepth / _WaterDeep;
          WaterDeepFresnelRange = clamp( FresnelFactor + waterDeepRange, 0.0, 1.0 );
          WaterColor = mix( _ShallowColor, deepFresnelWaveColor, WaterDeepFresnelRange );
        }
        // Reflect
        vec3 ReflectColor = vec3( 0.0, 0.0, 0.0 );
        {
          vec3 reflectNormalTS = mix( vec3( 0, 0, 1 ), SurfaceNormal, _ReflectDistort );
          vec3 reflectNormalWS = vec3( dot( tanToWorld0, reflectNormalTS ), dot( tanToWorld1, reflectNormalTS ), dot( tanToWorld2, reflectNormalTS ) );
          vec3 reflectDirWS = reflect( -viewDirWS, reflectNormalWS );
          vec4 cube = textureCube( _ReflectCube, reflectDirWS );
          ReflectColor = cube.rgb * cube.a * 5.0;
          ReflectColor *= _ReflectIntensity * ReflectFresnel;
        }
        // Foam
        vec3 FoamColor = _FoamColor;
        float FoamAlpha = 0.0;
        {
          float foamDepth = clamp( WaterDepth / _FoamRange, 0.0, 1.0 );
          vec2 uv = scene_ElapsedTime.x * _FoamNoiseSpeed + vec2( _XTilling * v_uv.x, foamDepth * _YTilling );
          vec4 pixel = texture2D( _FoamNoise, uv );
          float foamNoise = pixel.r;
          float foamRange = 1.0 - clamp( ( _FoamOffset + foamDepth ), 0.0, 1.0 );
          foamRange = clamp( ( ( foamRange + 1.0 ) * step( foamNoise, foamRange ) ), 0.0, 1.0 );
          FoamColor = foamRange * _FoamColor * 2.0;
          FoamAlpha = foamRange;
        }
        // Caustics
        vec3 CausticsColor = vec3( 0.0, 0.0, 0.0 );
        {
          vec2 uv = UnderwaterPosWS.xz / _CausticsScale;
          vec2 offset = _CausticsSpeed * scene_ElapsedTime.x * 0.01;
          float waterShallowRange = 1.0 - WaterDeepFresnelRange;
          vec4 pixel1 = texture2D( _CausticsTex, uv + offset );
          vec4 pixel2 = texture2D( _CausticsTex, -uv + offset );
          CausticsColor = min( pixel1.rgb, pixel2.rgb );
          CausticsColor *= _CausticsIntensity * waterShallowRange;
        }
        // Splakes
        vec3 SplakesColor = vec3( 0.0, 0.0, 0.0 );
        {
          float Splakes = step( _SparklesAmount, SurfaceNormal.y ) * _SparklesIntensity;
          SplakesColor = Splakes * vec3( 1.0, 1.0, 1.0 );
        }
        vec3 FinalColor = mix( ( WaterColor + ReflectColor + CausticsColor + SplakesColor ) * _DayIntensity, FoamColor, FoamAlpha );
        // Alpha
        float waterOpacity = clamp( ( WaterDepth / _ShoreDistance ), 0.0, 1.0 );
        float otherOpacity = clamp( max( max( FoamAlpha, ReflectFresnel ), CausticsColor.r ), 0.0, 1.0 );
        float FinalAlpha = mix( waterOpacity, 1.0, otherOpacity );
        FinalAlpha = clamp( ( FinalAlpha * _Alpha ), 0.0, 1.0 );
        gl_FragColor = vec4( FinalColor, FinalAlpha );
        // gl_FragColor = vec4( FinalColor, 1.0 );
      }
      FragmentShader = frag;
    }
  }
}