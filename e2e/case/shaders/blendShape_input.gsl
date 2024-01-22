#ifdef RENDERER_HAS_BLENDSHAPE
	#ifdef RENDERER_BLENDSHAPE_USE_TEXTURE
		mediump sampler2DArray renderer_BlendShapeTexture;
		ivec3 renderer_BlendShapeTextureInfo;
		float renderer_BlendShapeWeights[RENDERER_BLENDSHAPE_COUNT];
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

	#ifdef RENDERER_BLENDSHAPE_USE_TEXTURE
		vec3 getBlendShapeVertexElement(int blendShapeIndex, int vertexElementIndex)
		{			
			int y = vertexElementIndex / renderer_BlendShapeTextureInfo.y;
			int x = vertexElementIndex - y * renderer_BlendShapeTextureInfo.y;
			ivec3 uv = ivec3(x, y , blendShapeIndex);
			return (texelFetch(renderer_BlendShapeTexture, uv, 0)).xyz;
		}
	#endif
#endif
