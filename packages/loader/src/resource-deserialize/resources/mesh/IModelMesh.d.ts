import { MeshTopology } from "@galacean/engine-core";
import type { IColor, IVector2, IVector3, IVector4 } from "../schema/BasicSchema";

export interface IEncodedModelMesh {
  positions: {
    start: number;
    end: number;
  };
  normals?: {
    start: number;
    end: number;
  };
  uvs?: {
    start: number;
    end: number;
  };
  uv1?: {
    start: number;
    end: number;
  };
  uv2?: {
    start: number;
    end: number;
  };
  uv3?: {
    start: number;
    end: number;
  };
  uv4?: {
    start: number;
    end: number;
  };
  uv5?: {
    start: number;
    end: number;
  };
  uv6?: {
    start: number;
    end: number;
  };
  uv7?: {
    start: number;
    end: number;
  };
  colors?: {
    start: number;
    end: number;
  };
  tangents?: {
    start: number;
    end: number;
  };
  boneWeights?: {
    start: number;
    end: number;
  };
  boneIndices?: {
    start: number;
    end: number;
  };
  blendShapes?: {
    name: string;
    frames: {
      weight: number;
      deltaPosition: { start: number; end: number };
      deltaNormals?: {
        start: number;
        end: number;
      };
      deltaTangents?: {
        start: number;
        end: number;
      };
    }[];
  }[];
  indices?: {
    type: number;
    start: number;
    end: number;
  };
  bounds?: {
    min: IVector3[];
    max: IVector3[];
  };
  subMeshes: {
    start: number;
    topology: MeshTopology;
    count: number;
  }[];
}

export interface IModelMesh {
  positions: IVector3[];
  normals?: IVector3[];
  uvs?: IVector2[];
  uv1?: IVector2[];
  uv2?: IVector2[];
  uv3?: IVector2[];
  uv4?: IVector2[];
  uv5?: IVector2[];
  uv6?: IVector2[];
  uv7?: IVector2[];
  colors?: IColor[];
  tangents?: IVector4[];
  boneWeights?: IVector4[];
  boneIndices?: IVector4[];
  blendShapes?: {
    name: string;
    frames: {
      weight: number;
      deltaPositions: IVector3[];
      deltaNormals: IVector3[];
      deltaTangents: IVector4[];
    }[];
  }[];
  indices?: number[];
  subMeshes: {
    start: number;
    topology: MeshTopology;
    count: number;
  }[];
}
