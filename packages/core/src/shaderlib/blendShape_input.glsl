#ifdef RENDERER_HAS_BLENDSHAPE
	#ifdef RENDERER_BLENDSHAPE_USE_TEXTURE
		uniform mediump sampler2DArray renderer_BlendShapeTexture;
		uniform ivec3 renderer_BlendShapeTextureInfo;
		uniform float renderer_BlendShapeWeights[RENDERER_BLENDSHAPE_COUNT];
	#else
		attribute vec3 POSITION_BS0;
		attribute vec3 POSITION_BS1;
		#if defined( RENDERER_BLENDSHAPE_HAS_NORMAL ) && defined( RENDERER_BLENDSHAPE_HAS_TANGENT )
			attribute vec3 NORMAL_BS0;
			attribute vec3 NORMAL_BS1;
			attribute vec3 TANGENT_BS0;
			attribute vec3 TANGENT_BS1;
			uniform float renderer_BlendShapeWeights[2];
		#else
			#if defined( RENDERER_BLENDSHAPE_HAS_NORMAL ) || defined( RENDERER_BLENDSHAPE_HAS_TANGENT )
				attribute vec3 POSITION_BS2;
				attribute vec3 POSITION_BS3;
				#ifdef RENDERER_BLENDSHAPE_HAS_NORMAL
					attribute vec3 NORMAL_BS0;
					attribute vec3 NORMAL_BS1;
					attribute vec3 NORMAL_BS2;
					attribute vec3 NORMAL_BS3;
				#endif

				#ifdef RENDERER_BLENDSHAPE_HAS_TANGENT
					attribute vec3 TANGENT_BS0;
					attribute vec3 TANGENT_BS1;
					attribute vec3 TANGENT_BS2;
					attribute vec3 TANGENT_BS3;
				#endif

				uniform float renderer_BlendShapeWeights[4];
			#else
				attribute vec3 POSITION_BS2;
				attribute vec3 POSITION_BS3;
				attribute vec3 POSITION_BS4;
				attribute vec3 POSITION_BS5;
				attribute vec3 POSITION_BS6;
				attribute vec3 POSITION_BS7;
				uniform float renderer_BlendShapeWeights[8];
			#endif
		#endif
	#endif

	#ifdef RENDERER_BLENDSHAPE_USE_TEXTURE
		vec3 getBlendShapeVertexElement(int blendShapeIndex, int vertexElementIndex)
		{			
			int y = vertexElementIndex / renderer_BlendShapeTextureInfo.y;
			int x = vertexElementIndex - y * renderer_BlendShapeTextureInfo.y;
			ivec3 uv = ivec3(x, y , blendShapeIndex);
			return texelFetch(renderer_BlendShapeTexture, uv, 0).xyz;
		}
	#endif
#endif
