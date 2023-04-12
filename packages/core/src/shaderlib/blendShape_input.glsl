#ifdef GALACEAN_BLENDSHAPE
	#ifdef GALACEAN_BLENDSHAPE_TEXTURE
		uniform mediump sampler2DArray galacean_BlendShapeTexture;
		uniform ivec3 galacean_BlendShapeTextureInfo;
		uniform float galacean_BlendShapeWeights[GALACEAN_BLENDSHAPE_COUNT];
	#else
		attribute vec3 POSITION_BS0;
		attribute vec3 POSITION_BS1;
		#if defined( GALACEAN_BLENDSHAPE_NORMAL ) && defined( GALACEAN_BLENDSHAPE_TANGENT )
			attribute vec3 NORMAL_BS0;
			attribute vec3 NORMAL_BS1;
			attribute vec3 TANGENT_BS0;
			attribute vec3 TANGENT_BS1;
			uniform float galacean_BlendShapeWeights[2];
		#else
			#if defined( GALACEAN_BLENDSHAPE_NORMAL ) || defined( GALACEAN_BLENDSHAPE_TANGENT )
				attribute vec3 POSITION_BS2;
				attribute vec3 POSITION_BS3;
				#ifdef GALACEAN_BLENDSHAPE_NORMAL
					attribute vec3 NORMAL_BS0;
					attribute vec3 NORMAL_BS1;
					attribute vec3 NORMAL_BS2;
					attribute vec3 NORMAL_BS3;
				#endif

				#ifdef GALACEAN_BLENDSHAPE_TANGENT
					attribute vec3 TANGENT_BS0;
					attribute vec3 TANGENT_BS1;
					attribute vec3 TANGENT_BS2;
					attribute vec3 TANGENT_BS3;
				#endif

				uniform float galacean_BlendShapeWeights[4];
			#else
				attribute vec3 POSITION_BS2;
				attribute vec3 POSITION_BS3;
				attribute vec3 POSITION_BS4;
				attribute vec3 POSITION_BS5;
				attribute vec3 POSITION_BS6;
				attribute vec3 POSITION_BS7;
				uniform float galacean_BlendShapeWeights[8];
			#endif
		#endif
	#endif

	#ifdef GALACEAN_BLENDSHAPE_TEXTURE
		vec3 getBlendShapeVertexElement(int blendShapeIndex, int vertexElementIndex)
		{			
			int y = vertexElementIndex / galacean_BlendShapeTextureInfo.y;
			int x = vertexElementIndex - y * galacean_BlendShapeTextureInfo.y;
			ivec3 uv = ivec3(x, y , blendShapeIndex);
			return texelFetch(galacean_BlendShapeTexture, uv, 0).xyz;
		}
	#endif
#endif
