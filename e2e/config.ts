export const E2E_CONFIG = {
  Animator: {
    additive: {
      category: "Animator",
      caseFileName: "animator-additive",
      threshold: 0.1
    },
    blendShape: {
      category: "Animator",
      caseFileName: "animator-blendShape",
      threshold: 0.1
    },
    blendShapeQuantization: {
      category: "Animator",
      caseFileName: "animator-blendShape-quantization",
      threshold: 0.1
    },
    crossfade: {
      category: "Animator",
      caseFileName: "animator-crossfade",
      threshold: 0.1
    },
    customAnimationClip: {
      category: "Animator",
      caseFileName: "animator-customAnimationClip",
      threshold: 0.1
    },
    customBlendShape: {
      category: "Animator",
      caseFileName: "animator-customBlendShape",
      threshold: 0.1
    },
    multiSubMeshBlendShape: {
      category: "Animator",
      caseFileName: "animator-multiSubMeshBlendShape",
      threshold: 0.1
    },
    event: {
      category: "Animator",
      caseFileName: "animator-event",
      threshold: 0.1
    },
    play: {
      category: "Animator",
      caseFileName: "animator-play",
      threshold: 0.1
    },
    playBackWards: {
      category: "Animator",
      caseFileName: "animator-play-backwards",
      threshold: 0.1
    },
    playBeforeActive: {
      category: "Animator",
      caseFileName: "animator-play-beforeActive",
      threshold: 0.1
    },
    reuse: {
      category: "Animator",
      caseFileName: "animator-reuse",
      threshold: 0.1
    },
    stateMachineScript: {
      category: "Animator",
      caseFileName: "animator-stateMachineScript",
      threshold: 0.1
    },
    stateMachine: {
      category: "Animator",
      caseFileName: "animator-stateMachine",
      threshold: 0.1
    }
  },
  GLTF: {
    meshopt: {
      category: "GLTF",
      caseFileName: "gltf-meshopt",
      threshold: 0.3
    },
    blendShape: {
      category: "GLTF",
      caseFileName: "gltf-blendshape",
      threshold: 0.3
    }
  },

  Material: {
    blendMode: {
      category: "Material",
      caseFileName: "material-blendMode",
      threshold: 0.2
    },
    "blinn-phong": {
      category: "Material",
      caseFileName: "material-blinn-phong",
      threshold: 0.2
    },
    "pbr-clearcoat": {
      category: "Material",
      caseFileName: "material-pbr-clearcoat",
      threshold: 0.2
    },
    pbr: {
      category: "Material",
      caseFileName: "material-pbr",
      threshold: 0.2
    },
    shaderLab: {
      category: "Material",
      caseFileName: "material-shaderLab",
      threshold: 0.2
    },
    shaderLabMRT: {
      category: "Material",
      caseFileName: "shaderLab-mrt",
      threshold: 0.2
    },
    shaderReplacement: {
      category: "Material",
      caseFileName: "material-shaderReplacement",
      threshold: 0.2
    },
    unlit: {
      category: "Material",
      caseFileName: "material-unlit",
      threshold: 0.2
    },
    "shaderLab-renderState": {
      category: "Material",
      caseFileName: "shaderLab-renderState",
      threshold: 0.2
    },
    LUT: {
      category: "Material",
      caseFileName: "material-LUT",
      threshold: 0.2
    }
  },
  Shadow: {
    basic: {
      category: "Shadow",
      caseFileName: "shadow-basic",
      threshold: 0.2
    },
    transparent: {
      category: "Shadow",
      caseFileName: "shadow-transparent",
      threshold: 0.2
    }
  },
  Primitive: {
    capsule: {
      category: "Primitive",
      caseFileName: "primitive-capsule",
      threshold: 0.1
    },
    cone: {
      category: "Primitive",
      caseFileName: "primitive-cone",
      threshold: 0.1
    },
    cuboid: {
      category: "Primitive",
      caseFileName: "primitive-cuboid",
      threshold: 0.1
    },
    cylinder: {
      category: "Primitive",
      caseFileName: "primitive-cylinder",
      threshold: 0.1
    },
    plane: {
      category: "Primitive",
      caseFileName: "primitive-plane",
      threshold: 0.1
    },
    sphere: {
      category: "Primitive",
      caseFileName: "primitive-sphere",
      threshold: 0.1
    },
    torus: {
      category: "Primitive",
      caseFileName: "primitive-torus",
      threshold: 0.1
    }
  },
  Camera: {
    opaqueTexture: {
      category: "Camera",
      caseFileName: "camera-opaque-texture",
      threshold: 0.1
    }
  },
  Physics: {
    "physx-collision": {
      category: "Physics",
      caseFileName: "physx-collision",
      threshold: 0.1
    }
  },
  Particle: {
    particle: {
      category: "Particle",
      caseFileName: "particleRenderer-dream",
      threshold: 0.3
    },
    textureSheetAnimation: {
      category: "Particle",
      caseFileName: "particleRenderer-textureSheetAnimation",
      threshold: 0.3
    }
  },
  PostProcess: {
    HDRBloomACES: {
      category: "PostProcess",
      caseFileName: "postProcess-HDR-bloom-ACES",
      threshold: 0.2
    },
    HDRBloomNeutral: {
      category: "PostProcess",
      caseFileName: "postProcess-HDR-bloom-neutral",
      threshold: 0.2
    },
    LDRBloomNeutral: {
      category: "PostProcess",
      caseFileName: "postProcess-LDR-bloom-neutral",
      threshold: 0.2
    },
    customPass: {
      category: "PostProcess",
      caseFileName: "postProcess-customPass",
      threshold: 0.2
    }
  },
  SpriteMask: {
    CustomStencil: {
      category: "SpriteMask",
      caseFileName: "spriteMask-customStencil",
      threshold: 0.3
    }
  },
  Text: {
    TypedText: {
      category: "Text",
      caseFileName: "text-typed",
      threshold: 0.1
    }
  },
  Other: {
    ProjectLoader: {
      category: "Advance",
      caseFileName: "project-loader",
      threshold: 0.4
    },
    MultiSceneClear: {
      category: "Advance",
      caseFileName: "multi-scene-clear",
      threshold: 0.2
    },
    MultiSceneNoClear: {
      category: "Advance",
      caseFileName: "multi-scene-no-clear",
      threshold: 0.2
    },
    MultiCameraNoClear: {
      category: "Advance",
      caseFileName: "multi-camera-no-clear",
      threshold: 0.2
    }
  }
};
