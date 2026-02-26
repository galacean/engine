#ifndef ATTRIBUTES_PBR_INCLUDED
#define ATTRIBUTES_PBR_INCLUDED


struct Attributes{
  	vec3 POSITION;

	#ifdef RENDERER_HAS_BLENDSHAPE
    	#ifndef RENDERER_BLENDSHAPE_USE_TEXTURE
    		vec3 POSITION_BS0;
    	  	vec3 POSITION_BS1;
    	  	#if defined( RENDERER_BLENDSHAPE_HAS_NORMAL ) && defined( RENDERER_BLENDSHAPE_HAS_TANGENT )
    	    	vec3 NORMAL_BS0;
    	    	vec3 NORMAL_BS1;
    	    	vec3 TANGENT_BS0;
    	    	vec3 TANGENT_BS1;
    	  	#else
    	    	#if defined( RENDERER_BLENDSHAPE_HAS_NORMAL ) || defined( RENDERER_BLENDSHAPE_HAS_TANGENT )
    	    	  vec3 POSITION_BS2;
    	    	  vec3 POSITION_BS3;

    	    	  #ifdef RENDERER_BLENDSHAPE_HAS_NORMAL
    	    	    vec3 NORMAL_BS0;
    	    	    vec3 NORMAL_BS1;
    	    	    vec3 NORMAL_BS2;
    	    	    vec3 NORMAL_BS3;
    	    	  #endif

    	    	  #ifdef RENDERER_BLENDSHAPE_HAS_TANGENT
    	    	    vec3 TANGENT_BS0;
    	    	    vec3 TANGENT_BS1;
    	    	    vec3 TANGENT_BS2;
    	    	    vec3 TANGENT_BS3;
    	    	  #endif

    	    	#else
    	    	  vec3 POSITION_BS2;
    	    	  vec3 POSITION_BS3;
    	    	  vec3 POSITION_BS4;
    	    	  vec3 POSITION_BS5;
    	    	  vec3 POSITION_BS6;
    	    	  vec3 POSITION_BS7;
    	    #endif
    	#endif
    #endif
  #endif


  	#ifdef RENDERER_HAS_UV
  	    vec2 TEXCOORD_0;
  	#endif

  	#ifdef RENDERER_HAS_UV1
  	    vec2 TEXCOORD_1;
  	#endif

  	#ifdef RENDERER_HAS_SKIN
  	    vec4 JOINTS_0;
  	    vec4 WEIGHTS_0;
  	#endif

  	#ifdef RENDERER_ENABLE_VERTEXCOLOR
  	    vec4 COLOR_0;
  	#endif

	#ifdef RENDERER_HAS_NORMAL
	    vec3 NORMAL;
	#endif

    #ifdef RENDERER_HAS_TANGENT
        vec4 TANGENT;
    #endif
};


#endif