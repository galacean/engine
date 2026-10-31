#ifndef BLENDSHAPE_INCLUDED
#define BLENDSHAPE_INCLUDED

#ifdef RENDERER_HAS_BLENDSHAPE
	#ifdef RENDERER_BLENDSHAPE_USE_TEXTURE
		mediump sampler2DArray renderer_BlendShapeTexture;
		ivec3 renderer_BlendShapeTextureInfo;
		float renderer_BlendShapeWeights[RENDERER_BLENDSHAPE_COUNT];

		vec3 getBlendShapeVertexElement(int blendShapeIndex, int vertexElementIndex){			
			int y = vertexElementIndex / renderer_BlendShapeTextureInfo.y;
			int x = vertexElementIndex - y * renderer_BlendShapeTextureInfo.y;
			ivec3 uv = ivec3(x, y , blendShapeIndex);
			return (texelFetch(renderer_BlendShapeTexture, uv, 0)).xyz;
		}
	#else
		#if defined( RENDERER_BLENDSHAPE_HAS_NORMAL ) && defined( RENDERER_BLENDSHAPE_HAS_TANGENT )
			float renderer_BlendShapeWeights[2];
		#else
			#if defined( RENDERER_BLENDSHAPE_HAS_NORMAL ) || defined( RENDERER_BLENDSHAPE_HAS_TANGENT )
				float renderer_BlendShapeWeights[4];
			#else
				float renderer_BlendShapeWeights[8];
			#endif
		#endif
	#endif

	void calculateBlendShape(Attributes attributes, inout vec4 position
        #ifdef RENDERER_HAS_NORMAL
            ,inout vec3 normal
			 #ifdef RENDERER_HAS_TANGENT
            	,inout vec4 tangent
        	#endif
        #endif
       
	){
		#ifdef RENDERER_BLENDSHAPE_USE_TEXTURE	
    		int vertexOffset = gl_VertexID * renderer_BlendShapeTextureInfo.x;
    		for(int i = 0; i < RENDERER_BLENDSHAPE_COUNT; i++){
    			int vertexElementOffset = vertexOffset;
    			float weight = renderer_BlendShapeWeights[i];
    			// Warnning: Multiplying by 0 creates weird precision issues, causing rendering anomalies in Ace2 Android13
    			if(weight != 0.0){
    				position.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
    
    				#if defined( RENDERER_HAS_NORMAL ) && defined( RENDERER_BLENDSHAPE_HAS_NORMAL )
    					vertexElementOffset += 1;
    					normal += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
    				#endif
    
    				#if defined( RENDERER_HAS_TANGENT ) && defined(RENDERER_BLENDSHAPE_HAS_TANGENT)
    					vertexElementOffset += 1;
    					tangent.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
    				#endif
    			}
    
    		}
    	#else
    		position.xyz += attributes.POSITION_BS0 * renderer_BlendShapeWeights[0];
    		position.xyz += attributes.POSITION_BS1 * renderer_BlendShapeWeights[1];

    		#if defined( RENDERER_BLENDSHAPE_HAS_NORMAL ) && defined( RENDERER_BLENDSHAPE_HAS_TANGENT )
    			#ifdef RENDERER_HAS_NORMAL
    				normal += attributes.NORMAL_BS0 * renderer_BlendShapeWeights[0];
    				normal += attributes.NORMAL_BS1 * renderer_BlendShapeWeights[1];
    			#endif
                    
    			#ifdef RENDERER_HAS_TANGENT
    				tangent.xyz += attributes.TANGENT_BS0 * renderer_BlendShapeWeights[0];
    				tangent.xyz += attributes.TANGENT_BS1 * renderer_BlendShapeWeights[1];
    			#endif				
    		#else
    			#if defined( RENDERER_BLENDSHAPE_HAS_NORMAL ) || defined( RENDERER_BLENDSHAPE_HAS_TANGENT )
    				position.xyz += attributes.POSITION_BS2 * renderer_BlendShapeWeights[2];
    				position.xyz += attributes.POSITION_BS3 * renderer_BlendShapeWeights[3];

    				#if defined( RENDERER_BLENDSHAPE_HAS_NORMAL ) && defined( RENDERER_HAS_NORMAL )
    					normal += attributes.NORMAL_BS0 * renderer_BlendShapeWeights[0];
    					normal += attributes.NORMAL_BS1 * renderer_BlendShapeWeights[1];
    					normal += attributes.NORMAL_BS2 * renderer_BlendShapeWeights[2];
    					normal += attributes.NORMAL_BS3 * renderer_BlendShapeWeights[3];
    				#endif

    				#if defined(RENDERER_BLENDSHAPE_HAS_TANGENT) && defined( RENDERER_HAS_TANGENT )
    					tangent.xyz += attributes.TANGENT_BS0 * renderer_BlendShapeWeights[0];
    					tangent.xyz += attributes.TANGENT_BS1 * renderer_BlendShapeWeights[1];
    					tangent.xyz += attributes.TANGENT_BS2 * renderer_BlendShapeWeights[2];
    					tangent.xyz += attributes.TANGENT_BS3 * renderer_BlendShapeWeights[3];
    				#endif
    			#else
    				position.xyz += attributes.POSITION_BS2 * renderer_BlendShapeWeights[2];
    				position.xyz += attributes.POSITION_BS3 * renderer_BlendShapeWeights[3];
    				position.xyz += attributes.POSITION_BS4 * renderer_BlendShapeWeights[4];
    				position.xyz += attributes.POSITION_BS5 * renderer_BlendShapeWeights[5];
    				position.xyz += attributes.POSITION_BS6 * renderer_BlendShapeWeights[6];
    				position.xyz += attributes.POSITION_BS7 * renderer_BlendShapeWeights[7];
    			#endif
    		#endif
    	#endif
	}

#endif


#endif