#include <uv_share>
#include <normal_share>
#include <common_frag>
#include <mobile_material_frag>
uniform float u_opacity;
uniform vec2 u_uvOffset;
uniform vec2 u_maskUvOffset;

#ifdef R3_MASK_TEXTURE

uniform sampler2D u_mask;

#endif

#ifdef R3_UV_ANIMATE

uniform vec2 u_uvVelocity;

#endif


void main() {

  #include <begin_mobile_frag>

  #ifdef R3_DIFFUSE_TEXTURE

    vec2 uvDelta = v_uv + u_uvOffset;
		float filterX = step(0.0, uvDelta.x) * (1.0 - step(1.0, uvDelta.x));
	  float filterY = step(0.0, uvDelta.y) * (1.0 - step(1.0, uvDelta.y));
		diffuse = texture2D(u_diffuse, uvDelta) * filterX * filterY;

	#endif

  #ifdef R3_UV_ANIMATE

		diffuse = texture2D(u_diffuse, v_uv + u_uvVelocity * u_time);

	#endif

  vec4 fragColor = (emission + ambient + diffuse) * u_opacity;

	#ifdef R3_MASK_TEXTURE

		vec2 maskUvDelta = v_uv + u_maskUvOffset;
		float maskFilterX = step(0.0, maskUvDelta.x) * (1.0 - step(1.0, maskUvDelta.x));
	  float maskFilterY = step(0.0, maskUvDelta.y) * (1.0 - step(1.0, maskUvDelta.y));
		vec4 mask = texture2D(u_mask, maskUvDelta) * maskFilterX * maskFilterY;
		float hasmask = 1.0 - step(0.5, mask.a);
		fragColor *= hasmask;

	#endif

  gl_FragColor = fragColor;
}
