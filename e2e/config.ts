export const E2E_CONFIG = {
  Animator: {
    additive: {
      category: "Animator",
      caseFileName: "animator-additive",
      threshold: 0,
      diffPercentage: 0
    },
    blendShape: {
      category: "Animator",
      caseFileName: "animator-blendShape",
      threshold: 0,
      diffPercentage: 0.01
    },
    blendShapeQuantization: {
      category: "Animator",
      caseFileName: "animator-blendShape-quantization",
      threshold: 0,
      diffPercentage: 0.05
    },
    crossfade: {
      category: "Animator",
      caseFileName: "animator-crossfade",
      threshold: 0,
      diffPercentage: 0
    },
    customAnimationClip: {
      category: "Animator",
      caseFileName: "animator-customAnimationClip",
      threshold: 0,
      diffPercentage: 0
    },
    customBlendShape: {
      category: "Animator",
      caseFileName: "animator-customBlendShape",
      threshold: 0,
      diffPercentage: 0
    },
    multiSubMeshBlendShape: {
      category: "Animator",
      caseFileName: "animator-multiSubMeshBlendShape",
      threshold: 0,
      diffPercentage: 0
    },
    event: {
      category: "Animator",
      caseFileName: "animator-event",
      threshold: 0,
      diffPercentage: 0.00146
    },
    play: {
      category: "Animator",
      caseFileName: "animator-play",
      threshold: 0,
      diffPercentage: 0
    },
    playBackWards: {
      category: "Animator",
      caseFileName: "animator-play-backwards",
      threshold: 0,
      diffPercentage: 0
    },
    playBeforeActive: {
      category: "Animator",
      caseFileName: "animator-play-beforeActive",
      threshold: 0,
      diffPercentage: 0
    },
    reuse: {
      category: "Animator",
      caseFileName: "animator-reuse",
      threshold: 0,
      diffPercentage: 0
    },
    stateMachineScript: {
      category: "Animator",
      caseFileName: "animator-stateMachineScript",
      threshold: 0,
      diffPercentage: 0
    },
    stateMachine: {
      category: "Animator",
      caseFileName: "animator-stateMachine",
      threshold: 0,
      diffPercentage: 0
    }
  },
  GLTF: {
    meshopt: {
      category: "GLTF",
      caseFileName: "gltf-meshopt",
      threshold: 0,
      diffPercentage: 0.055
    },
    blendShape: {
      category: "GLTF",
      caseFileName: "gltf-blendshape",
      threshold: 0,
      diffPercentage: 0.05
    }
  },

  Material: {
    blendMode: {
      category: "Material",
      caseFileName: "material-blendMode",
      threshold: 0,
      diffPercentage: 0.02
    },
    "blinn-phong": {
      category: "Material",
      caseFileName: "material-blinn-phong",
      threshold: 0,
      diffPercentage: 0.36
    },
    "pbr-clearcoat": {
      category: "Material",
      caseFileName: "material-pbr-clearcoat",
      threshold: 0,
      diffPercentage: 0.12
    },
    "pbr-specular": {
      category: "Material",
      caseFileName: "material-pbr-specular",
      threshold: 0,
      diffPercentage: 0.055
    },
    pbr: {
      category: "Material",
      caseFileName: "material-pbr",
      threshold: 0,
      diffPercentage: 0.004
    },
    shaderLab: {
      category: "Material",
      caseFileName: "material-shaderLab",
      threshold: 0,
      diffPercentage: 0
    },
    shaderLabMRT: {
      category: "Material",
      caseFileName: "shaderLab-mrt",
      threshold: 0,
      diffPercentage: 0
    },
    shaderReplacement: {
      category: "Material",
      caseFileName: "material-shaderReplacement",
      threshold: 0,
      diffPercentage: 0.049
    },
    unlit: {
      category: "Material",
      caseFileName: "material-unlit",
      threshold: 0,
      diffPercentage: 0.033
    },
    "shaderLab-renderState": {
      category: "Material",
      caseFileName: "shaderLab-renderState",
      threshold: 0,
      diffPercentage: 0
    },
    LUT: {
      category: "Material",
      caseFileName: "material-LUT",
      threshold: 0,
      diffPercentage: 0
    }
  },
  Texture: {
    sRGB: {
      category: "Texture",
      caseFileName: "texture-sRGB-KTX2",
      threshold: 0,
      diffPercentage: 0.072
    },
    R8G8: {
      category: "Texture",
      caseFileName: "texture-R8G8",
      threshold: 0,
      diffPercentage: 0
    },
    KTX2HDR: {
      category: "Texture",
      caseFileName: "texture-hdr-ktx2",
      threshold: 0,
      diffPercentage: 0.015
    }
  },
  Shadow: {
    basic: {
      category: "Shadow",
      caseFileName: "shadow-basic",
      threshold: 0,
      diffPercentage: 0.008
    },
    transparent: {
      category: "Shadow",
      caseFileName: "shadow-transparent",
      threshold: 0,
      diffPercentage: 0.044
    }
  },
  Primitive: {
    capsule: {
      category: "Primitive",
      caseFileName: "primitive-capsule",
      threshold: 0,
      diffPercentage: 0.0016
    },
    cone: {
      category: "Primitive",
      caseFileName: "primitive-cone",
      threshold: 0,
      diffPercentage: 0.0054
    },
    cuboid: {
      category: "Primitive",
      caseFileName: "primitive-cuboid",
      threshold: 0,
      diffPercentage: 0.0016
    },
    cylinder: {
      category: "Primitive",
      caseFileName: "primitive-cylinder",
      threshold: 0,
      diffPercentage: 0.0036
    },
    plane: {
      category: "Primitive",
      caseFileName: "primitive-plane",
      threshold: 0,
      diffPercentage: 0.0016
    },
    sphere: {
      category: "Primitive",
      caseFileName: "primitive-sphere",
      threshold: 0,
      diffPercentage: 0.0058
    },
    torus: {
      category: "Primitive",
      caseFileName: "primitive-torus",
      threshold: 0,
      diffPercentage: 0
    }
  },
  Camera: {
    opaqueTexture: {
      category: "Camera",
      caseFileName: "camera-opaque-texture",
      threshold: 0,
      diffPercentage: 0
    },
    fxaa: {
      category: "Camera",
      caseFileName: "camera-fxaa",
      threshold: 0,
      diffPercentage: 0.161
    },
    ssao: {
      category: "Camera",
      caseFileName: "camera-ssao",
      threshold: 0,
      diffPercentage: 0.12
    }
  },
  Physics: {
    "physx-collision": {
      category: "Physics",
      caseFileName: "physx-collision",
      threshold: 0,
      diffPercentage: 0
    },
    "LitePhysics Collision Group": {
      category: "Physics",
      caseFileName: "litePhysics-collision-group",
      threshold: 0,
      diffPercentage: 0
    },
    "PhysXPhysics Collision Group": {
      category: "Physics",
      caseFileName: "physx-collision-group",
      threshold: 0,
      diffPercentage: 0
    },
    "PhysXPhysics Custom Url": {
      category: "Physics",
      caseFileName: "physx-customUrl",
      threshold: 0,
      diffPercentage: 0
    }
  },
  Particle: {
    particleDream: {
      category: "Particle",
      caseFileName: "particleRenderer-dream",
      threshold: 0.005,
      diffPercentage: 0.015
    },
    particleFire: {
      category: "Particle",
      caseFileName: "particleRenderer-fire",
      threshold: 0,
      diffPercentage: 0.064
    },
    forceOverLifetime: {
      category: "Particle",
      caseFileName: "particleRenderer-force",
      threshold: 0.005,
      diffPercentage: 0.0054
    },
    textureSheetAnimation: {
      category: "Particle",
      caseFileName: "particleRenderer-textureSheetAnimation",
      threshold: 0,
      diffPercentage: 0
    },
    particleShapeMesh: {
      category: "Particle",
      caseFileName: "particleRenderer-shape-mesh",
      threshold: 0,
      diffPercentage: 0.0073
    },
    particleEmissive: {
      category: "Particle",
      caseFileName: "particleRenderer-emissive",
      threshold: 0,
      diffPercentage: 0
    }
  },
  PostProcess: {
    HDRBloomACES: {
      category: "PostProcess",
      caseFileName: "postProcess-HDR-bloom-ACES",
      threshold: 0,
      diffPercentage: 0.148
    },
    HDRBloomNeutral: {
      category: "PostProcess",
      caseFileName: "postProcess-HDR-bloom-neutral",
      threshold: 0,
      diffPercentage: 0.066
    },
    LDRBloomNeutral: {
      category: "PostProcess",
      caseFileName: "postProcess-LDR-bloom-neutral",
      threshold: 0,
      diffPercentage: 0.097
    },
    customPass: {
      category: "PostProcess",
      caseFileName: "postProcess-customPass",
      threshold: 0,
      diffPercentage: 0.025
    }
  },
  SpriteMask: {
    CustomStencil: {
      category: "SpriteMask",
      caseFileName: "spriteMask-customStencil",
      threshold: 0,
      diffPercentage: 0.0024
    }
  },
  Text: {
    TypedText: {
      category: "Text",
      caseFileName: "text-typed",
      threshold: 0,
      diffPercentage: 0
    }
  },
  Other: {
    ProjectLoader: {
      category: "Advance",
      caseFileName: "project-loader",
      threshold: 0.01,
      diffPercentage: 0.0016
    },
    MultiSceneClear: {
      category: "Advance",
      caseFileName: "multi-scene-clear",
      threshold: 0,
      diffPercentage: 0
    },
    MultiSceneNoClear: {
      category: "Advance",
      caseFileName: "multi-scene-no-clear",
      threshold: 0,
      diffPercentage: 0
    },
    MultiCameraNoClear: {
      category: "Advance",
      caseFileName: "multi-camera-no-clear",
      threshold: 0,
      diffPercentage: 0
    },

    CanvasTransparency: {
      category: "Advance",
      caseFileName: "canvas-transparency",
      threshold: 0,
      diffPercentage: 0.044
    }
  }
};
