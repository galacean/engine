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
      diffPercentage: 0
    },
    blendShapeQuantization: {
      category: "Animator",
      caseFileName: "animator-blendShape-quantization",
      threshold: 0,
      diffPercentage: 0
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
      diffPercentage: 0
    },
    blendShape: {
      category: "GLTF",
      caseFileName: "gltf-blendshape",
      threshold: 0,
      diffPercentage: 0
    }
  },

  Material: {
    blendMode: {
      category: "Material",
      caseFileName: "material-blendMode",
      threshold: 0,
      diffPercentage: 0
    },
    "blinn-phong": {
      category: "Material",
      caseFileName: "material-blinn-phong",
      threshold: 0,
      diffPercentage: 0.003
    },
    "pbr-clearcoat": {
      category: "Material",
      caseFileName: "material-pbr-clearcoat",
      threshold: 0,
      diffPercentage: 0.00042
    },
    "pbr-specular": {
      category: "Material",
      caseFileName: "material-pbr-specular",
      threshold: 0
    },
    pbr: {
      category: "Material",
      caseFileName: "material-pbr",
      threshold: 0,
      diffPercentage: 0.0009
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
      diffPercentage: 0
    },
    unlit: {
      category: "Material",
      caseFileName: "material-unlit",
      threshold: 0,
      diffPercentage: 0
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
      diffPercentage: 0
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
      diffPercentage: 0
    }
  },
  Shadow: {
    basic: {
      category: "Shadow",
      caseFileName: "shadow-basic",
      threshold: 0,
      diffPercentage: 0
    },
    transparent: {
      category: "Shadow",
      caseFileName: "shadow-transparent",
      threshold: 0,
      diffPercentage: 0
    }
  },
  Primitive: {
    capsule: {
      category: "Primitive",
      caseFileName: "primitive-capsule",
      threshold: 0,
      diffPercentage: 0
    },
    cone: {
      category: "Primitive",
      caseFileName: "primitive-cone",
      threshold: 0,
      diffPercentage: 0.0042
    },
    cuboid: {
      category: "Primitive",
      caseFileName: "primitive-cuboid",
      threshold: 0,
      diffPercentage: 0
    },
    cylinder: {
      category: "Primitive",
      caseFileName: "primitive-cylinder",
      threshold: 0,
      diffPercentage: 0.0022
    },
    plane: {
      category: "Primitive",
      caseFileName: "primitive-plane",
      threshold: 0,
      diffPercentage: 0
    },
    sphere: {
      category: "Primitive",
      caseFileName: "primitive-sphere",
      threshold: 0,
      diffPercentage: 0
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
      diffPercentage: 0.055
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
      diffPercentage: 0
    },
    forceOverLifetime: {
      category: "Particle",
      caseFileName: "particleRenderer-force",
      threshold: 0.005,
      diffPercentage: 0.004
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
      diffPercentage: 0
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
      diffPercentage: 0.004
    },
    HDRBloomNeutral: {
      category: "PostProcess",
      caseFileName: "postProcess-HDR-bloom-neutral",
      threshold: 0,
      diffPercentage: 0
    },
    LDRBloomNeutral: {
      category: "PostProcess",
      caseFileName: "postProcess-LDR-bloom-neutral",
      threshold: 0,
      diffPercentage: 0
    },
    customPass: {
      category: "PostProcess",
      caseFileName: "postProcess-customPass",
      threshold: 0,
      diffPercentage: 0
    }
  },
  SpriteMask: {
    CustomStencil: {
      category: "SpriteMask",
      caseFileName: "spriteMask-customStencil",
      threshold: 0,
      diffPercentage: 0
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
      threshold: 0,
      diffPercentage: 0.00448
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
