import type { IShaderUniformBlock, IShaderUniformBlockMember } from "@galacean/engine-design";
import { GSError, GSErrorName } from "../GSError";
import type { ASTNode, TreeNode } from "./AST";

/** Establish a single fixed layout before either stage prunes unused globals. */
export function layoutUniformBlocks(blocks: ASTNode.UniformBlock[], source?: string): GSError | undefined {
  const layouts = new Map<string, IShaderUniformBlock>();
  function invalid(node: TreeNode, message: string): GSError {
    return new GSError(GSErrorName.CompilationError, message, node.location, source, undefined, "InvalidUniformBlock");
  }
  for (const block of blocks) {
    const { name } = block;
    if (name !== "Scene" && name !== "Camera")
      return invalid(block, "Explicit uniform blocks must be named Scene or Camera.");
    const members: IShaderUniformBlockMember[] = [];
    const names = new Set<string>();
    let end = 0;
    for (const member of block.members) {
      const { identifier, typeInfo } = member.declarator;
      const type = typeInfo.typeLexeme;
      const field = identifier.lexeme;
      if (names.has(field)) return invalid(member, `Duplicate uniform block member '${field}'.`);
      names.add(field);
      if (
        member.type.children.length > 1 ||
        member.type.typeSpecifier.arraySpecifier ||
        member.declarator.initializer
      ) {
        return invalid(
          member,
          "Uniform block members require an unqualified type, a name and an optional fixed array length."
        );
      }
      const matrix = /^mat([234])(?:x([234]))?$/.exec(type);
      const vector = /^(?:[ibu]?vec)([234])$/.exec(type);
      if (!matrix && !vector && !/^(?:float|int|uint|bool)$/.test(type)) {
        return invalid(member, `Unsupported uniform block member type '${type}'.`);
      }
      const specifier = typeInfo.arraySpecifier;
      const arrayLength = specifier?.size ?? 0;
      if (specifier && (!Number.isSafeInteger(arrayLength) || arrayLength <= 0)) {
        return invalid(member, "Uniform block arrays require a positive literal element count.");
      }
      const components = vector ? Number(vector[1]) : 1;
      const alignment = arrayLength || matrix || components > 2 ? 16 : components * 4;
      const size = matrix ? Number(matrix[1]) * 16 : components * 4;
      const offset = Math.ceil(end / alignment) * alignment;
      const arrayStride = arrayLength ? Math.ceil(size / 16) * 16 : 0;
      end = offset + (arrayLength ? arrayLength * arrayStride : size);
      if (!Number.isSafeInteger(end) || end > 0x7fffffff)
        return invalid(member, "Uniform block size exceeds the addressable range.");
      members.push({ name: field, type, offset, arrayLength, arrayStride, matrixStride: matrix ? 16 : 0 });
    }
    const layout: IShaderUniformBlock = { name, byteLength: Math.ceil(end / 16) * 16, members };
    const previous = layouts.get(name);
    if (previous) {
      if (
        previous.members.length !== members.length ||
        previous.members.some(
          (field, i) =>
            field.name !== members[i].name ||
            field.type !== members[i].type ||
            field.arrayLength !== members[i].arrayLength
        )
      ) {
        return invalid(block, `Uniform block '${name}' has conflicting layouts in the same pass.`);
      }
    } else {
      layouts.set(name, layout);
    }
    block.layout = previous ?? layout;
  }
}
