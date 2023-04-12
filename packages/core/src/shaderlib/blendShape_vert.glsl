#ifdef GALACEAN_BLENDSHAPE
	#ifdef GALACEAN_BLENDSHAPE_TEXTURE	
		int vertexOffset = gl_VertexID * galacean_BlendShapeTextureInfo.x;
		for(int i = 0; i < GALACEAN_BLENDSHAPE_COUNT; i++){
			int vertexElementOffset = vertexOffset;
			float weight = galacean_BlendShapeWeights[i];
			position.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
			
			#ifndef OMIT_NORMAL
				#if defined( GALACEAN_HAS_NORMAL ) && defined( GALACEAN_BLENDSHAPE_NORMAL )
					vertexElementOffset += 1;
					normal += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
				#endif

				#if defined( GALACEAN_HAS_TANGENT ) && defined(GALACEAN_BLENDSHAPE_TANGENT) && ( defined(NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) )
					vertexElementOffset += 1;
					tangent.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
				#endif
			#endif
		}
	#else
		position.xyz += POSITION_BS0 * galacean_BlendShapeWeights[0];
		position.xyz += POSITION_BS1 * galacean_BlendShapeWeights[1];

		#if defined( GALACEAN_BLENDSHAPE_NORMAL ) && defined( GALACEAN_BLENDSHAPE_TANGENT )
			#ifndef OMIT_NORMAL
				#ifdef GALACEAN_HAS_NORMAL
					normal += NORMAL_BS0 * galacean_BlendShapeWeights[0];
					normal += NORMAL_BS1 * galacean_BlendShapeWeights[1];
				#endif
				#if defined( GALACEAN_HAS_TANGENT ) && ( defined(NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) )
					tangent.xyz += TANGENT_BS0 * galacean_BlendShapeWeights[0];
					tangent.xyz += TANGENT_BS1 * galacean_BlendShapeWeights[1];
				#endif				
			#endif
		#else
			#if defined( GALACEAN_BLENDSHAPE_NORMAL ) || defined( GALACEAN_BLENDSHAPE_TANGENT )
				#ifndef OMIT_NORMAL
					position.xyz += POSITION_BS2 * galacean_BlendShapeWeights[2];
					position.xyz += POSITION_BS3 * galacean_BlendShapeWeights[3];

					#if defined( GALACEAN_BLENDSHAPE_NORMAL ) && defined( GALACEAN_HAS_NORMAL )
						normal += NORMAL_BS0 * galacean_BlendShapeWeights[0];
						normal += NORMAL_BS1 * galacean_BlendShapeWeights[1];
						normal += NORMAL_BS2 * galacean_BlendShapeWeights[2];
						normal += NORMAL_BS3 * galacean_BlendShapeWeights[3];
					#endif

					#if defined(GALACEAN_BLENDSHAPE_TANGENT) && defined( GALACEAN_HAS_TANGENT ) && ( defined(NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) )
						tangent.xyz += TANGENT_BS0 * galacean_BlendShapeWeights[0];
						tangent.xyz += TANGENT_BS1 * galacean_BlendShapeWeights[1];
						tangent.xyz += TANGENT_BS2 * galacean_BlendShapeWeights[2];
						tangent.xyz += TANGENT_BS3 * galacean_BlendShapeWeights[3];
					#endif
				#endif
			#else
				position.xyz += POSITION_BS2 * galacean_BlendShapeWeights[2];
				position.xyz += POSITION_BS3 * galacean_BlendShapeWeights[3];
				position.xyz += POSITION_BS4 * galacean_BlendShapeWeights[4];
				position.xyz += POSITION_BS5 * galacean_BlendShapeWeights[5];
				position.xyz += POSITION_BS6 * galacean_BlendShapeWeights[6];
				position.xyz += POSITION_BS7 * galacean_BlendShapeWeights[7];
			#endif
		#endif
	#endif
#endif


