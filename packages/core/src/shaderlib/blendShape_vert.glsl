#ifdef OASIS_BLENDSHAPE
	#ifdef OASIS_BLENDSHAPE_TEXTURE	
		int vertexOffset = gl_VertexID * u_blendShapeTextureInfo.x;
		for(int i = 0; i < OASIS_BLENDSHAPE_COUNT; i++){
			int vertexElementOffset = vertexOffset;
			float weight = u_blendShapeWeights[i];
			position.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
			
			#ifndef OMIT_NORMAL
				#if defined( O3_HAS_NORMAL ) && defined( OASIS_BLENDSHAPE_NORMAL )
					vertexElementOffset += 1;
					normal += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
				#endif

				#if defined( O3_HAS_TANGENT ) && defined(OASIS_BLENDSHAPE_TANGENT) && ( defined(NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) )
					vertexElementOffset += 1;
					tangent.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
				#endif
			#endif
		}
	#else
		position.xyz += POSITION_BS0 * u_blendShapeWeights[0];
		position.xyz += POSITION_BS1 * u_blendShapeWeights[1];

		#if defined( OASIS_BLENDSHAPE_NORMAL ) && defined( OASIS_BLENDSHAPE_TANGENT )
			#ifndef OMIT_NORMAL
				#ifdef O3_HAS_NORMAL
					normal += NORMAL_BS0 * u_blendShapeWeights[0];
					normal += NORMAL_BS1 * u_blendShapeWeights[1];
				#endif
				#if defined( O3_HAS_TANGENT ) && ( defined(NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) )
					tangent.xyz += TANGENT_BS0 * u_blendShapeWeights[0];
					tangent.xyz += TANGENT_BS1 * u_blendShapeWeights[1];
				#endif				
			#endif
		#else
			#if defined( OASIS_BLENDSHAPE_NORMAL ) || defined( OASIS_BLENDSHAPE_TANGENT )
				#ifndef OMIT_NORMAL
					position.xyz += POSITION_BS2 * u_blendShapeWeights[2];
					position.xyz += POSITION_BS3 * u_blendShapeWeights[3];

					#if defined( OASIS_BLENDSHAPE_NORMAL ) && defined( O3_HAS_NORMAL )
						normal += NORMAL_BS0 * u_blendShapeWeights[0];
						normal += NORMAL_BS1 * u_blendShapeWeights[1];
						normal += NORMAL_BS2 * u_blendShapeWeights[2];
						normal += NORMAL_BS3 * u_blendShapeWeights[3];
					#endif

					#if defined(OASIS_BLENDSHAPE_TANGENT) && defined( O3_HAS_TANGENT ) && ( defined(NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) )
						tangent.xyz += TANGENT_BS0 * u_blendShapeWeights[0];
						tangent.xyz += TANGENT_BS1 * u_blendShapeWeights[1];
						tangent.xyz += TANGENT_BS2 * u_blendShapeWeights[2];
						tangent.xyz += TANGENT_BS3 * u_blendShapeWeights[3];
					#endif
				#endif
			#else
				position.xyz += POSITION_BS2 * u_blendShapeWeights[2];
				position.xyz += POSITION_BS3 * u_blendShapeWeights[3];
				position.xyz += POSITION_BS4 * u_blendShapeWeights[4];
				position.xyz += POSITION_BS5 * u_blendShapeWeights[5];
				position.xyz += POSITION_BS6 * u_blendShapeWeights[6];
				position.xyz += POSITION_BS7 * u_blendShapeWeights[7];
			#endif
		#endif
	#endif
#endif


