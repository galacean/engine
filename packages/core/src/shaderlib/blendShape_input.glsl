#ifdef OASIS_BLENDSHAPE
	#ifndef OASIS_BLENDSHAPE_TEXTURE
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
#endif
