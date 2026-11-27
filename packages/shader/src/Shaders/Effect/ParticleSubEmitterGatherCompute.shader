ComputeShader "Effect/ParticleSubEmitterGatherCompute" {
  WorkgroupSize = (64, 1, 1);
  ComputeKernel = csGather;

  int u_firstParent;
  int u_firstChild;
  int u_childrenPerParent;
  int u_count;
  int u_parentFloatStride;
  int u_childFloatStride;

  readonly storage ParentBuf {
    float parentData[];
  };

  storage ChildBuf {
    float childData[];
  };

  void csGather() {
    int gid = int(gl_GlobalInvocationID.x);
    if (gid >= u_count) {
      return;
    }
    int src = (u_firstParent + gid / u_childrenPerParent) * u_parentFloatStride + 6;
    int dst = (u_firstChild + gid) * u_childFloatStride;
    for (int i = 0; i < 6; i++) {
      childData[dst + i] = parentData[src + i];
    }
  }
}
