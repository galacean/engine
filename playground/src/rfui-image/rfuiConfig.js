import { Easing } from '@alipay/o3-tween';
export function getNodesConfig(textures, duration = 1000, scaleX = 2) {
	return [
		{
		  name: 'circle1',
		  scale: [scaleX, scaleX, 1],
		  rendererConfig: {
		    diffuse: textures[0],
		  },
		  animationsConfig:{
		    in: [
		      {
		        type: 'fadeIn',
		      },
		      {
		        type: 'rotateIn',
		        param: {
		        	easing: Easing.easeOutQuad,
		          start: [0, 0, 180]
		        }
		      }
		    ],
		    out: [
		      {
		        type: 'fadeOut',
		        param: {
		          delay: duration * 0.7
		        }
		      },
		      {
		        type: 'rotateOut',
		        param: {
		          end: [0, 0, 180],
		          delay: duration * 0.7
		        }
		      }
		    ]
		  }
		},
		{
		  name: 'circle2',
		  scale: [scaleX, scaleX, 1],
		  rendererConfig: {
		    diffuse: textures[1],
		  },
		  animationsConfig:{
		    in: [
		      {
		        type: 'fadeIn',
		      },
		      {
		        type: 'rotateIn',
		        param: {
		          start: [0, 0, -180]
		        }
		      }
		    ],
		    out: [
		      {
		        type: 'fadeOut',
		        param: {
		          delay: duration * 0.7
		        }
		      },
		      {
		        type: 'rotateOut',
		        param: {
		          end: [0, 0, -180],
		          delay: duration * 0.7
		        }
		      }
		    ]
		  }
		},
		{
		  name: 'text',
		  position: [0, 0, 0.1],
		  scale: [scaleX, scaleX, 1],
		  // abilities:[
	   //  	'ARenderEachRow'
	   //  ],
		  rendererConfig: {
		    diffuse: textures[2],
		    // geometryParam: {
		    // 	horizontalSegments: 2,
		    // 	verticalSegments:2
		    // }
		  },
		  animationsConfig:{
		    in: [
		      {
		        type: 'fadeIn',
	          param: {
		          delay: duration * 0.7
		        }
		      }
		    ],
		    out: [
		      {
		        type: 'fadeOut'
		      }
		    ]
		  }
		}
	];
}
