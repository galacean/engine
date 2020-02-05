const geometryParam =  {
		  	thetaLength: Math.PI / 3
		  }

export function getNodesConfig(textures, duration = 500, scaleX = 10) {
	return [
		{
		  name: 'titleWrapper',
		  scale: [scaleX, 1, scaleX],
		  rotation: [0, -18, 0],
		  position: [0, 3.4, 0],
		  rendererConfig: {
		    diffuse: textures[0],
		    geometryType: 'cylinder',
			  geometryParam: {
			  	thetaLength: Math.PI /7.5
			  }
		  },
		  animationsConfig:{
		    in: [
		      {
		        type: 'slideIn',
		      }
		    ],
		    out: [
		      {
		        type: 'slideOut',
		        param: {
		          delay: 4 * duration
		        }
		      }
		    ]
		  }
		},
		{
		  name: 'title',
		  scale: [scaleX, 1, scaleX],
		  rotation: [0, -18, 0],
		  position: [0, 3.4, 0.1],
		  rendererConfig: {
		    diffuse: textures[5],
		    geometryType: 'cylinder',
			  geometryParam: {
			  	thetaLength: Math.PI /7.5
			  }
		  },
		  animationsConfig:{
		    in: [
		      {
		        type: 'fadeIn',
		        param: {
		          delay: duration
		        }
		      }
		    ],
		    out: [
		      {
		        type: 'fadeOut',
		        param: {
		          delay: 3 * duration
		        }
		      }
		    ]
		  }
		},
		{
		  name: 'bg',
		  position: [0, 0, 0.1],
		  scale: [scaleX, 6, scaleX],
		  rendererConfig: {
		    diffuse: textures[1],
		    geometryType: 'cylinder',
			  geometryParam: {
			  	thetaLength: Math.PI /3
			  }
		  },
		  animationsConfig:{
		    in: [
		      {
		        type: 'slideIn',
		        param: {
		          delay: 2 * duration,
		          uvOffset: [0, 1]
		        }
		      }
		    ],
		    out: [
		      {
		        type: 'fadeOut',
		        param: {
		          delay: 2 * duration,
		          uvOffset: [0, 1]
		        }
		      }
		    ]
		  }
		},
		{
		  name: 'textwrapper',
		  position: [0, 0, 0.2],
		  scale: [scaleX, 4.2, scaleX],
		  rendererConfig: {
		    diffuse: textures[2],
		    geometryType: 'cylinder',
			  geometryParam: {
			  	thetaLength: Math.PI / 3.8
			  }
		  },
		  animationsConfig:{
		    in: [
		      {
		        type: 'slideIn',
		        param: {
		          delay: 3 * duration
		        }
		      }
		    ],
		    out: [
		      {
		        type: 'fadeOut',
		        param: {
		          delay: 1 * duration
		        }
		      }
		    ]
		  }
		},
		{
		  name: 'text',
		  position: [0, 0, 0.3],
		  scale: [scaleX, 4, scaleX],
		  rendererConfig: {
		    diffuse: textures[4],
		    mask: textures[3],
		    geometryType: 'cylinder',
			  geometryParam: {
			  	thetaLength: Math.PI /4
			  }
		  },
		  animationsConfig:{
		    in: [
		      {
		        type: 'maskSlideIn',  
		        param: {
		          delay: 4 * duration,
		          duration: 1000
		        }
		      }
		    ],
		    out: [
		      {
		        type: 'maskSlideOut'
		      }
		    ]
		  }
		}
	];
}
