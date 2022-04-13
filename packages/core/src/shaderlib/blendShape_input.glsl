#ifdef OASIS_BLENDSHAPE
	#ifdef OASIS_BLENDSHAPE_TEXTURE
		uniform mediump sampler2DArray u_blendShapeTexture;
		uniform ivec3 u_blendShapeTextureInfo;
	#else
		attribute vec3 POSITION_BS0;
		attribute vec3 POSITION_BS1;
		attribute vec3 POSITION_BS2;
		attribute vec3 POSITION_BS3;

		#if defined( OASIS_BLENDSHAPE_NORMAL ) || defined( OASIS_BLENDSHAPE_TANGENT )
			#ifdef OASIS_BLENDSHAPE_NORMAL
				attribute vec3 NORMAL_BS0;
				attribute vec3 NORMAL_BS1;
				attribute vec3 NORMAL_BS2;
				attribute vec3 NORMAL_BS3;
			#endif

			#ifdef OASIS_BLENDSHAPE_TANGENT
				attribute vec3 TANGENT_BS0;
				attribute vec3 TANGENT_BS1;
				attribute vec3 TANGENT_BS2;
				attribute vec3 TANGENT_BS3;
			#endif
		#else
			attribute vec3 POSITION_BS4;
			attribute vec3 POSITION_BS5;
			attribute vec3 POSITION_BS6;
			attribute vec3 POSITION_BS7;
		#endif
	#endif

	uniform float u_blendShapeWeights[OASIS_BLENDSHAPE_COUNT];

	#ifdef OASIS_BLENDSHAPE_TEXTURE
		vec3 getBlendShapeVertexElement(int blendShapeIndex, int vertexElementIndex)
		{			
			int y = vertexElementIndex / u_blendShapeTextureInfo.y;
			int x = vertexElementIndex - y * u_blendShapeTextureInfo.y;
			ivec3 uv = ivec3(x, y , blendShapeIndex);
			return texelFetch(u_blendShapeTexture, uv, 0).xyz;
		}
	#endif
#endif
