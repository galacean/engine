#ifdef OASIS_BLENDSHAPE
	#ifdef OASIS_BLENDSHAPE_TEXTURE	
		float vertexElementOffset = float(gl_VertexID) * u_blendShapeTextureInfo.x;
		for(int i = 0; i < 8; i++){
			position.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * u_blendShapeWeights[i];
		}
		
		#ifndef OMIT_NORMAL
			#if defined( O3_HAS_NORMAL ) && defined( OASIS_BLENDSHAPE_NORMAL )
			    vertexElementOffset += 1.0;
				for(int i = 0; i < 8; i++){
					normal.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * u_blendShapeWeights[i];
				}
			#endif

			#if defined( O3_HAS_TANGENT ) && defined( O3_NORMAL_TEXTURE ) && defined( OASIS_BLENDSHAPE_TANGENT )
			    vertexElementOffset += 1.0;
				for(int i = 0; i< 8; i++){
					tangent.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * u_blendShapeWeights[i];
				}
			#endif
		#endif
	#else
		position.xyz += POSITION_BS0 * u_blendShapeWeights[0];
		position.xyz += POSITION_BS1 * u_blendShapeWeights[1];
		position.xyz += POSITION_BS2 * u_blendShapeWeights[2];
		position.xyz += POSITION_BS3 * u_blendShapeWeights[3];
		
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
	#endif
#endif


