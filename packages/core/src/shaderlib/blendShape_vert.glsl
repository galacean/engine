#ifdef OASIS_BLENDSHAPE
	#ifdef OASIS_BLENDSHAPE_TEXTURE	

	#else
		position += positionBS;
		
		#ifdef OASIS_BLENDSHAPE_NORMAL
			normal += normalBS;
		#endif

		#ifdef OASIS_BLENDSHAPE_TANGENT
			tangent.xyz += tangentBS;
		#endif
	#endif
#endif