ComputeShader "Effect/ParticleSimulationCompute" {
  WorkgroupSize = (64, 1, 1);
  ComputeKernel = csSimulate;

  int renderer_DispatchStart;
  int renderer_DispatchCount;

  #include "ShaderLibrary/Particle/ParticleFeedbackCore.glsl"

  readonly storage PrevStateBuf {
    float prevState[];
  };

  storage NextStateBuf {
    float nextState[];
  };

  readonly storage InstanceBuf {
    float instData[];
  };

  #ifdef RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES
    readonly storage SpawnStateBuf {
      float spawnData[];
    };
  #endif

  vec3 readVec3Prev(uint offset) {
    return vec3(prevState[offset], prevState[offset + 1u], prevState[offset + 2u]);
  }

  vec4 readVec4Inst(uint offset) {
    return vec4(instData[offset], instData[offset + 1u], instData[offset + 2u], instData[offset + 3u]);
  }

  void writeVec3Next(uint offset, vec3 v) {
    nextState[offset] = v.x;
    nextState[offset + 1u] = v.y;
    nextState[offset + 2u] = v.z;
  }

  void csSimulate() {
    uint localIdx = gl_GlobalInvocationID.x;
    if (int(localIdx) >= renderer_DispatchCount) {
      return;
    }
    uint idx = uint(renderer_DispatchStart) + localIdx;

    #ifdef RENDERER_TRAJECTORY_FEEDBACK
      uint stateBase = idx * 12u;
    #else
      uint stateBase = idx * 6u;
    #endif
    uint instBase = idx * 45u;

    Attributes attr;
    attr.a_FeedbackPosition = readVec3Prev(stateBase);
    attr.a_FeedbackVelocity = readVec3Prev(stateBase + 3u);
    #ifdef RENDERER_TRAJECTORY_FEEDBACK
      attr.a_FeedbackWorldPosition = readVec3Prev(stateBase + 6u);
    #endif
    attr.a_ShapePositionStartLifeTime = readVec4Inst(instBase);
    attr.a_DirectionTime = readVec4Inst(instBase + 4u);
    attr.a_StartSizeSpeed = readVec4Inst(instBase + 12u);
    attr.a_WorldPositionGravity = readVec4Inst(instBase + 20u);
    attr.a_SimulationWorldRotation = readVec4Inst(instBase + 24u);
    #if defined(RENDERER_VOL_IS_RANDOM_TWO) || defined(RENDERER_VOL_ORBITAL_IS_RANDOM_TWO) || defined(RENDERER_VOL_RADIAL_IS_RANDOM_TWO)
      attr.a_VelocityRandomTSA = readVec4Inst(instBase + 28u);
    #endif
    #if defined(RENDERER_FOL_CONSTANT_MODE) || defined(RENDERER_FOL_CURVE_MODE)
      attr.a_ForceRandomColor = readVec4Inst(instBase + 32u);
    #endif
    #ifdef RENDERER_NOISE_MODULE_ENABLED
      attr.a_UVTilingFrameRandom = readVec4Inst(instBase + 36u);
    #endif
    #if defined(RENDERER_INHERIT_VELOCITY_INITIAL_CURVE) || defined(RENDERER_INHERIT_VELOCITY_RANDOM) || defined(RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES)
      attr.a_InheritVelocity = readVec4Inst(instBase + 40u);
    #endif
    #ifdef RENDERER_LVL_MODULE_ENABLED
      attr.a_LimitVelocityRandom = instData[instBase + 44u];
    #endif
    #ifdef RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES
      uint spawnBase = idx * 6u;
      attr.a_ParentSampleWorldPosition = vec3(spawnData[spawnBase], spawnData[spawnBase + 1u], spawnData[spawnBase + 2u]);
      attr.a_ParentTrajectoryVelocity = vec3(spawnData[spawnBase + 3u], spawnData[spawnBase + 4u], spawnData[spawnBase + 5u]);
    #endif

    ParticleFeedbackOutput res = runParticleFeedback(attr, int(idx));
    writeVec3Next(stateBase, res.position);
    writeVec3Next(stateBase + 3u, res.velocity);
    #ifdef RENDERER_TRAJECTORY_FEEDBACK
      writeVec3Next(stateBase + 6u, res.worldPosition);
      writeVec3Next(stateBase + 9u, res.trajectoryVelocity);
    #endif
  }
}
