#ifdef OASIS_BLENDSHAPE
	#ifndef OASIS_BLENDSHAPE_TEXTURE
		attribute vec3 positionBS;

		#ifdef OASIS_BLENDSHAPE_NORMAL
		    attribute vec3 normalBS;
		#endif

		#ifdef OASIS_BLENDSHAPE_TANGENT
		    attribute vec3 tangentBS;
		#endif
	#endif
#endif
