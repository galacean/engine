#ifdef OASIS_BLENDSHAPE
	#ifdef OASIS_BLENDSHAPE_TEXTURE	
		float vertexElementOffset = float(gl_VertexID) * u_blendShapeTextureInfo.x;
		for(int i = 0; i < OASIS_BLENDSHAPE_COUNT; i++){
			position.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * u_blendShapeWeights[i];
		}
		
	#else
		position.xyz += POSITION_BS0 * u_blendShapeWeights[0];
		position.xyz += POSITION_BS1 * u_blendShapeWeights[1];
		position.xyz += POSITION_BS2 * u_blendShapeWeights[2];
		position.xyz += POSITION_BS3 * u_blendShapeWeights[3];

		#if defined( OASIS_BLENDSHAPE_NORMAL ) || defined( OASIS_BLENDSHAPE_TANGENT )
			#ifndef OMIT_NORMAL
				#if defined( O3_HAS_NORMAL ) && defined( OASIS_BLENDSHAPE_NORMAL )
					normal.xyz += NORMAL_BS0 * u_blendShapeWeights[0];
					normal.xyz += NORMAL_BS1 * u_blendShapeWeights[1];
					normal.xyz += NORMAL_BS2 * u_blendShapeWeights[2];
					normal.xyz += NORMAL_BS3 * u_blendShapeWeights[3];
				#endif

				#if defined( O3_HAS_TANGENT ) && defined( O3_NORMAL_TEXTURE ) && defined( OASIS_BLENDSHAPE_TANGENT )
					tangent.xyz += TANGENT_BS0 * u_blendShapeWeights[0];
					tangent.xyz += TANGENT_BS1 * u_blendShapeWeights[1];
					tangent.xyz += TANGENT_BS2 * u_blendShapeWeights[2];
					tangent.xyz += TANGENT_BS3 * u_blendShapeWeights[3];
				#endif
			#endif
		#else
			position.xyz += POSITION_BS4 * u_blendShapeWeights[4];
			position.xyz += POSITION_BS5 * u_blendShapeWeights[5];
			position.xyz += POSITION_BS6 * u_blendShapeWeights[6];
			position.xyz += POSITION_BS7 * u_blendShapeWeights[7];
		#endif
	#endif
#endif


