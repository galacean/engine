export function getNodesConfig(textures, duration = 1000, scaleX = 10) {
	return [
		// {
		//   name: 'bg',
		//   scale: [scaleX, 6, scaleX],
		//   rotation: [0, 5, 0],
		//   rendererConfig: {
		//     diffuse: textures[0],
		//     geometryType: 'cylinder'
		//   },
		//   animationsConfig:{
		//     in: [
		//       {
		//         type: 'scaleXIn',
		//       },
		//       {
		//         type: 'translateIn',
		//         param: {
		//           start: [3.8, 0, 0]
		//         }
		//       }
		//     ],
		//     out: [
		//       {
		//         type: 'scaleXOut',
		//         param: {
		//           delay: 3 * duration
		//         }
		//       },
		//       {
		//         type: 'translateOut',
		//         param: {
		//           end: [3.8, 0, 0],
		//           delay: 3 * duration
		//         }
		//       }
		//     ]
		//   }
		// },
		// {
		//   name: 'map',
		//   position: [0, 0, 0.1],
		//   scale: [scaleX, 6, scaleX],
		//   rotation: [0, 5, 0],
		//   rendererConfig: {
		//     diffuse: textures[1],
		//     geometryType: 'cylinder'
		//   },
		//   animationsConfig:{
		//     in: [
		//       {
		//         type: 'fadeIn',
		//         param: {
		//           delay: 1 * duration
		//         }
		//       }
		//     ],
		//     out: [
		//       {
		//         type: 'fadeOut',
		//         param: {
		//           delay: 2 * duration
		//         }
		//       }
		//     ]
		//   }
		// },
		// {
		//   name: 'image',
		//   position: [0, 2, 0],
		//   scale: [scaleX, 2, scaleX],
		//   rotation: [0, -13, 0],
		//   rendererConfig: {
		//     diffuse: textures[2],
		//     geometryType: 'cylinder',
		//     geometryParam: {
		//       thetaLength: Math.PI / 30
		//     }
		//   },
		//   animationsConfig:{
		//     in: [
		//       {
		//         type: 'scaleXIn',
		//         param: {
		//           delay: 1 * duration
		//         }
		//       },
		//       {
		//         type: 'translateIn',
		//         param: {
		//           start: [-1, 2, 0],
		//           delay: 1 * duration
		//         }
		//       }
		//     ],
		//     out: [
		//       {
		//         type: 'scaleXOut',
		//         param: {
		//           delay: 2 * duration
		//         }
		//       },
		//       {
		//         type: 'translateOut',
		//         param: {
		//           end: [-1, 2, 0],
		//           delay: 2 * duration
		//         }
		//       }
		//     ]
		//   }
		// },
		// {
		//   name: 'chart',
		//   position: [0, 0, 0],
		//   scale: [scaleX, 2, scaleX],
		//   rotation: [0, -13, 0],
		//   rendererConfig: {
		//     diffuse: textures[3],
		//     geometryType: 'cylinder',
		//     geometryParam: {
		//       thetaLength: Math.PI / 30
		//     }
		//   },
		//   animationsConfig:{
		//     in: [
		//       {
		//         type: 'scaleYIn',
		//         param: {
		//           delay: 2 * duration
		//         }
		//       },
		//       {
		//         type: 'translateIn',
		//         param: {
		//           start: [0, 1, 0],
		//           delay: 2 * duration
		//         }
		//       }
		//     ],
		//     out: [
		//       {
		//         type: 'scaleYOut',
		//         param: {
		//           delay: 1 * duration
		//         }
		//       },
		//       {
		//         type: 'translateOut',
		//         param: {
		//           end: [0, 1, 0],
		//           delay: 1 * duration
		//         }
		//       }
		//     ]
		//   }
		// },
		{
		  name: 'textBg',
		  scale: [scaleX, 6, scaleX],
		  rendererConfig: {
		    diffuse: textures[4],
		    geometryType: 'cylinder',
		    
		  },
		  animationsConfig:{
		    in: [
		      {
		        type: 'scaleYIn',
		          param: {
		          delay: 3 * duration
		        }
		      },
		      {
		        type: 'translateIn',
		        param: {
		          start: [0, -1, 0],
		          delay: 3 * duration
		        }
		      }
		    ],
		    out: [
		      {
		        type: 'scaleYOut',
		        param: {
		          delay: duration
		        }
		      },
		      {
		        type: 'translateOut',
		        param: {
		          end: [0, -1, 0],
		          delay: duration
		        }
		      }
		    ]
		  }
		},
		{
		  name: 'text',
		  position: [0.02, 0, 0.1],
		  scale: [2.5, 3, 0],
		  // rotation: [0, -13, 0],
		  // abilities:[
	   //  	'ARenderEachRow'
	   //  ],
		  rendererConfig: {
		    diffuse: textures[6],
		    mask: textures[5],
		    uvVelocity: [-1, 0],
		    // geometryType: 'cylinder',
		    geometryParam: {
		    	horizontalSegments:4, 
		    	verticalSegments: 3
		      // thetaLength: Math.PI / 30
		    }
		  },
		  animationsConfig:{
		    in: [
		      {
		        type: 'fadeIn',
	          param: {
		          delay: 4 * duration
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
