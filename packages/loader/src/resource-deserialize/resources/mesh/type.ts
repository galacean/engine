type uint8 = number;
type uint16 = number;
type uint32 = number;

export interface IMeshData {
  objectId: string;
  name: string;
  vertexElements: Array<{
    semantic: string;
    offset: uint32;
    format: uint8;
    bindingIndex: uint8;
    instanceStepRate: uint8;
  }>;
  subMeshes: Array<{
    start: uint32;
    count: uint32;
    topology: uint8;
  }>;
  vertexBuffer: {
    bufferUsage: uint8;
    buffer: ArrayBuffer;
    stride: uint16;
  };
  hasIndexBuffer: boolean;
  indexBuffer?: {
    bufferUsage: uint8;
    buffer: ArrayBuffer;
    format: uint8;
  };
}
