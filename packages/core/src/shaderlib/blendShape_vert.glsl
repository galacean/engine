#ifdef RENDERER_HAS_BLENDSHAPE
	#ifdef RENDERER_BLENDSHAPE_USE_TEXTURE	
		int vertexOffset = gl_VertexID * renderer_BlendShapeTextureInfo.x;
		for(int i = 0; i < RENDERER_BLENDSHAPE_COUNT; i++){
			int vertexElementOffset = vertexOffset;
			float weight = renderer_BlendShapeWeights[i];
			position.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
			
			#ifndef MATERIAL_OMIT_NORMAL
				#if defined( RENDERER_HAS_NORMAL ) && defined( RENDERER_BLENDSHAPE_HAS_NORMAL )
					vertexElementOffset += 1;
					normal += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
				#endif

				#if defined( RENDERER_HAS_TANGENT ) && defined(RENDERER_BLENDSHAPE_HAS_TANGENT) && ( defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) )
					vertexElementOffset += 1;
					tangent.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
				#endif
			#endif
		}
	#else
		position.xyz += POSITION_BS0 * renderer_BlendShapeWeights[0];
		position.xyz += POSITION_BS1 * renderer_BlendShapeWeights[1];

		#if defined( RENDERER_BLENDSHAPE_HAS_NORMAL ) && defined( RENDERER_BLENDSHAPE_HAS_TANGENT )
			#ifndef MATERIAL_OMIT_NORMAL
				#ifdef RENDERER_HAS_NORMAL
					normal += NORMAL_BS0 * renderer_BlendShapeWeights[0];
					normal += NORMAL_BS1 * renderer_BlendShapeWeights[1];
				#endif
				#if defined( RENDERER_HAS_TANGENT ) && ( defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) )
					tangent.xyz += TANGENT_BS0 * renderer_BlendShapeWeights[0];
					tangent.xyz += TANGENT_BS1 * renderer_BlendShapeWeights[1];
				#endif				
			#endif
		#else
			#if defined( RENDERER_BLENDSHAPE_HAS_NORMAL ) || defined( RENDERER_BLENDSHAPE_HAS_TANGENT )
				#ifndef MATERIAL_OMIT_NORMAL
					position.xyz += POSITION_BS2 * renderer_BlendShapeWeights[2];
					position.xyz += POSITION_BS3 * renderer_BlendShapeWeights[3];

					#if defined( RENDERER_BLENDSHAPE_HAS_NORMAL ) && defined( RENDERER_HAS_NORMAL )
						normal += NORMAL_BS0 * renderer_BlendShapeWeights[0];
						normal += NORMAL_BS1 * renderer_BlendShapeWeights[1];
						normal += NORMAL_BS2 * renderer_BlendShapeWeights[2];
						normal += NORMAL_BS3 * renderer_BlendShapeWeights[3];
					#endif

					#if defined(RENDERER_BLENDSHAPE_HAS_TANGENT) && defined( RENDERER_HAS_TANGENT ) && ( defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) )
						tangent.xyz += TANGENT_BS0 * renderer_BlendShapeWeights[0];
						tangent.xyz += TANGENT_BS1 * renderer_BlendShapeWeights[1];
						tangent.xyz += TANGENT_BS2 * renderer_BlendShapeWeights[2];
						tangent.xyz += TANGENT_BS3 * renderer_BlendShapeWeights[3];
					#endif
				#endif
			#else
				position.xyz += POSITION_BS2 * renderer_BlendShapeWeights[2];
				position.xyz += POSITION_BS3 * renderer_BlendShapeWeights[3];
				position.xyz += POSITION_BS4 * renderer_BlendShapeWeights[4];
				position.xyz += POSITION_BS5 * renderer_BlendShapeWeights[5];
				position.xyz += POSITION_BS6 * renderer_BlendShapeWeights[6];
				position.xyz += POSITION_BS7 * renderer_BlendShapeWeights[7];
			#endif
		#endif
	#endif
#endif


