export interface IPlatformShaderProgram {
  readonly id: number;
  readonly attributeLocation: Record<string, GLint>;
}
