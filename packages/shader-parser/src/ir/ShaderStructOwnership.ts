import { BaseToken, type BranchSignature } from "../common/BaseToken";
import type { ReferenceResolutionSnapshot } from "../parser/ShaderInfo";
import { ASTNode, TreeNode } from "../parser/AST";
import { FnSymbol, StructSymbol, SymbolInfo } from "../parser/symbolTable";
import type { StructProp } from "../parser/types";
import { proveInheritanceBranchesCover } from "../preprocessor/PreprocessorCondition";
import type { ShaderDeclarationOwnershipInfo } from "./ShaderDeclarationOwnership";

interface MemberReference {
  readonly declarations: readonly ASTNode.StructSpecifier[];
  readonly field: BaseToken;
  readonly branch: BranchSignature;
}

interface DeclarationReferences {
  readonly symbols: readonly SymbolInfo[];
  readonly types: readonly ASTNode.StructSpecifier[];
  readonly members: readonly MemberReference[];
}

/**
 * Checks that a deferred struct can satisfy references retained from another declaration owner.
 *
 * This is an admission proof over parser identities, not a macro-variant selector. Only referenced
 * fields are compared: removing an unused field or discarding its only consumer remains supported.
 * An unreferenced ordinary struct cannot replace an emitted interface declaration.
 * @param ownership - The completed pass's declaration families and static coverage facts.
 * @param entries - All possible stage-entry declarations.
 * @param roles - Interface roles assigned to exact struct declarations by the entry signatures.
 * @param snapshots - Existing call-site projections of macro member-owner identities.
 * @returns Struct owners whose selected fields or interface roles cannot satisfy a surviving consumer.
 * @internal
 */
export function findUnsupportedStructOwnership(
  ownership: ShaderDeclarationOwnershipInfo,
  entries: readonly FnSymbol[],
  roles: ReadonlyMap<ASTNode.StructSpecifier, string>,
  snapshots: readonly ReferenceResolutionSnapshot[]
): readonly SymbolInfo[] {
  const families = new Map<number, SymbolInfo[]>();
  let hasStructFamily = false;
  ownership.declarations.forEach((owner, symbol) => {
    if (symbol instanceof StructSymbol) hasStructFamily = true;
    const family = families.get(owner.group) ?? [];
    family.push(symbol);
    families.set(owner.group, family);
  });
  if (!hasStructFamily) return [];
  const projectedMembers = new Map<ASTNode.VariableIdentifier, MemberReference[]>();
  for (const snapshot of snapshots) {
    let node: TreeNode | undefined = snapshot.replacementMemberOwner;
    if (!node) continue;
    while (node && !(node instanceof ASTNode.PostfixExpression && node.children.length === 3)) node = node.parent;
    const field = node?.children[2];
    if (!(field instanceof BaseToken)) continue;
    const declarations: ASTNode.StructSpecifier[] = [];
    for (const symbol of snapshot.symbols) declarations.push(...(symbol.dataType?.structDeclarations ?? []));
    const members = projectedMembers.get(snapshot.reference) ?? [];
    members.push({ declarations, field, branch: snapshot.callSiteBranch });
    projectedMembers.set(snapshot.reference, members);
  }
  const unsupported = new Set<SymbolInfo>();
  const referenceCache = new Map<SymbolInfo, DeclarationReferences>();
  const references = (symbol: SymbolInfo): DeclarationReferences => {
    let facts = referenceCache.get(symbol);
    if (!facts) {
      facts = collectReferences(symbol, projectedMembers);
      referenceCache.set(symbol, facts);
    }
    return facts;
  };
  for (const family of families.values()) {
    if (!(family[0] instanceof StructSymbol)) continue;
    const structs = new Set(family.map((symbol) => symbol.astNode as ASTNode.StructSpecifier));
    for (const selected of family) {
      const target = selected.astNode as ASTNode.StructSpecifier;
      const targetRole = roles.get(target);
      const visited = new Set<SymbolInfo>();
      const pending: SymbolInfo[] = entries.slice();
      const members: MemberReference[] = [];
      let referenced = false;
      while (pending.length) {
        const consumer = pending.pop()!;
        if (visited.has(consumer) || !consumer.astNode) continue;
        visited.add(consumer);
        const context = selected.branchSignature.concat(consumer.branchSignature);
        if (proveInheritanceBranchesCover([], context) === true) continue;
        const owner = ownership.declarations.get(consumer);
        const alternatives = owner ? families.get(owner.group)! : [consumer];
        const replacements = alternatives.filter((candidate) => candidate.sourceScope > consumer.sourceScope);
        if (
          replacements.length &&
          proveInheritanceBranchesCover(
            replacements.map((candidate) => candidate.branchSignature),
            context
          ) === true
        )
          continue;
        const facts = references(consumer);
        for (const dependency of facts.symbols) {
          const dependencyOwner = ownership.declarations.get(dependency);
          pending.push(...(dependencyOwner ? families.get(dependencyOwner.group)! : [dependency]));
        }
        // Ordinary type references request the whole existing family. Interface types instead
        // request only their flattened fields; an unused replacement must not become a new owner.
        if (facts.types.some((type) => structs.has(type) && !roles.has(type))) referenced = true;
        for (const member of facts.members) {
          if (proveInheritanceBranchesCover([], selected.branchSignature.concat(member.branch)) === true) continue;
          const declarations = member.declarations.filter((type) => structs.has(type));
          if (!declarations.length) continue;
          members.push({ declarations, field: member.field, branch: member.branch });
          if (
            targetRole &&
            declarations.some((type) => roles.get(type) === targetRole) &&
            target.propList.some((prop) => prop.ident.lexeme === member.field.lexeme)
          )
            referenced = true;
        }
      }
      if (!referenced) continue;
      for (const { declarations, field, branch } of members) {
        for (const source of declarations) {
          if (source === target) continue;
          const sourceProps = source.propList.filter((prop) => prop.ident.lexeme === field.lexeme);
          for (const prop of sourceProps) {
            const compatible = target.propList.filter((candidate) => compatibleProperty(prop, candidate));
            if (
              roles.get(source) !== targetRole ||
              proveInheritanceBranchesCover(
                compatible.map((candidate) => candidate.ident.branch),
                selected.branchSignature.concat(branch, prop.ident.branch)
              ) !== true
            )
              unsupported.add(selected);
          }
        }
      }
    }
  }
  return Array.from(unsupported);
}

function collectReferences(
  symbol: SymbolInfo,
  projectedMembers: ReadonlyMap<ASTNode.VariableIdentifier, readonly MemberReference[]>
): DeclarationReferences {
  const symbols = new Set<SymbolInfo>(symbol instanceof FnSymbol ? symbol.calledFunctions : []);
  const types = new Set<ASTNode.StructSpecifier>();
  const members: MemberReference[] = [];
  const pending: TreeNode[] = [symbol.astNode];
  const visited = new Set<TreeNode>();
  while (pending.length) {
    const node = pending.pop()!;
    if (visited.has(node)) continue;
    visited.add(node);
    if (node instanceof ASTNode.TypeSpecifier) {
      for (const type of node.structDeclarations) {
        types.add(type);
        pending.push(type);
      }
    } else if (node instanceof ASTNode.VariableIdentifier) {
      members.push(...(projectedMembers.get(node) ?? []));
      for (const reference of node.resolvedSymbols()) {
        // Locals belong to this function's tree and must not open a separate declaration traversal.
        if (reference instanceof FnSymbol || reference.isGlobalVariable) symbols.add(reference);
      }
    } else if (
      node instanceof ASTNode.PostfixExpression &&
      node.children.length === 3 &&
      node.children[2] instanceof BaseToken
    ) {
      const declarations = expressionStructs(node.children[0] as TreeNode);
      if (declarations.length) members.push({ declarations, field: node.children[2], branch: node._branch });
    }
    for (const child of node.children) if (child instanceof TreeNode) pending.push(child);
  }
  return { symbols: Array.from(symbols), types: Array.from(types), members };
}

function expressionStructs(node: TreeNode): readonly ASTNode.StructSpecifier[] {
  if (node instanceof ASTNode.VariableIdentifier) {
    const result: ASTNode.StructSpecifier[] = [];
    for (const symbol of node.resolvedValueSymbols()) result.push(...(symbol.dataType?.structDeclarations ?? []));
    return result;
  }
  if (node instanceof ASTNode.FunctionCallGeneric) {
    const result: ASTNode.StructSpecifier[] = [];
    for (const symbol of node.fnSymbols ?? (node.fnSymbol ? [node.fnSymbol] : [])) {
      result.push(...(symbol.dataType?.structDeclarations ?? []));
    }
    return result;
  }
  if (
    node instanceof ASTNode.PostfixExpression &&
    node.children.length === 3 &&
    node.children[2] instanceof BaseToken
  ) {
    const result: ASTNode.StructSpecifier[] = [];
    for (const type of expressionStructs(node.children[0] as TreeNode)) {
      for (const prop of type.propList) {
        if (prop.ident.lexeme === node.children[2].lexeme) result.push(...prop.typeInfo.structDeclarations);
      }
    }
    return result;
  }
  const child = node.children[node.children[0] instanceof BaseToken ? 1 : 0];
  return child instanceof TreeNode ? expressionStructs(child) : [];
}

function compatibleProperty(source: StructProp, target: StructProp): boolean {
  if (
    source.ident.lexeme !== target.ident.lexeme ||
    source.typeInfo.type !== target.typeInfo.type ||
    source.isFlat !== target.isFlat ||
    source.mrtIndex !== target.mrtIndex
  )
    return false;
  const left = source.typeInfo.arraySpecifier;
  const right = target.typeInfo.arraySpecifier;
  if (!left || !right) return left === right;
  // Unknown sizes are not an equality proof, even when both snapshots have an undefined size.
  return left === right || (left.size !== undefined && left.size === right.size);
}
