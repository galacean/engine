export interface IPlatformPrimitive {
  draw(tech: any, subPrimitive: any): void;
  destroy(): void;
}
