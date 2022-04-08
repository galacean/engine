#ifdef OASIS_BLENDSHAPE
	#ifdef OASIS_BLENDSHAPE_TEXTURE
		uniform mediump sampler2DArray u_blendShapeTexture;
		uniform vec3 u_blendShapeTextureInfo;
	#else
		attribute vec3 POSITION_BS0;
		attribute vec3 POSITION_BS1;
		attribute vec3 POSITION_BS2;
		attribute vec3 POSITION_BS3;

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
	#endif
	uniform float u_blendShapeWeights[4];


	#ifdef OASIS_BLENDSHAPE_TEXTURE
		vec3 readFromBlendShapeTexture(int blendShapeIndex, float vertexIndex)
		{			
			float y = floor(vertexIndex / u_blendShapeTextureInfo.y);
			float x = vertexIndex - y * u_blendShapeTextureInfo.y;
			vec3 textureUV = vec3((x + 0.5) / u_blendShapeTextureInfo.y, (y + 0.5) / u_blendShapeTextureInfo.z, blendShapeIndex);
			return texture(u_blendShapeTexture, textureUV).xyz;
		}
	#endif
#endif
