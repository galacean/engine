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
    reuse: {
      category: "Animator",
      caseFileName: "animator-reuse",
      threshold: 0.1
    },
    stateMachineScript: {
      category: "Animator",
      caseFileName: "animator-stateMachineScript",
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
    shaderReplacement: {
      category: "Material",
      caseFileName: "material-shaderReplacement",
      threshold: 0.2
    },
    unlit: {
      category: "Material",
      caseFileName: "material-unlit",
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
    dream: {
      category: "Particle",
      caseFileName: "particleRenderer-dream",
      threshold: 0.3
    }
  }
};
