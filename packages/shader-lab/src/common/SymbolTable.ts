import { Logger } from "../Logger";
import { ASTNode } from "../parser/AST";
import { GalaceanDataType, SymbolType, TypeAny } from "../parser/types";

export enum ESymbolType {
  VAR,
  FN,
  STRUCT
}

type SymbolAstNode =
  | ASTNode.Initializer
  | ASTNode.GLRenderStateDeclaration
  | ASTNode.StructSpecifier
  | ASTNode.FunctionDefinition
  | ASTNode.GLVariableDeclaration
  | ASTNode.ParameterDeclarator;

export abstract class SymbolInfo {
  readonly symType: ESymbolType;
  /** variable type */
  readonly symDataType?: SymbolType;
  readonly astNode?: SymbolAstNode | undefined;
  readonly lexeme: string;

  constructor(lexeme: string, type: ESymbolType, astNode?: SymbolAstNode, dataType?: SymbolType) {
    this.lexeme = lexeme;
    this.symType = type;
    this.symDataType = dataType;
    this.astNode = astNode;
  }
}

export class VarSymbol extends SymbolInfo {
  readonly isGlobalVariable: boolean;
  declare astNode:
    | ASTNode.Initializer
    | ASTNode.GLRenderStateDeclaration
    | ASTNode.GLVariableDeclaration
    | ASTNode.ParameterDeclarator;

  constructor(
    lexeme: string,
    dataType: SymbolType,
    isGlobalVariable: boolean,
    initAst:
      | ASTNode.Initializer
      | ASTNode.GLRenderStateDeclaration
      | ASTNode.GLVariableDeclaration
      | ASTNode.ParameterDeclarator
  ) {
    super(lexeme, ESymbolType.VAR, initAst, dataType);
    this.isGlobalVariable = isGlobalVariable;
  }
}

export class FnSymbol extends SymbolInfo {
  declare astNode: ASTNode.FunctionDefinition;

  constructor(lexeme: string, astNode: ASTNode.FunctionDefinition) {
    const type = new SymbolType(astNode.protoType.returnType.type, astNode.protoType.returnType.typeSpecifier.lexeme);
    super(lexeme, ESymbolType.FN, astNode, type);
  }
}

export class StructSymbol extends SymbolInfo {
  declare astNode: ASTNode.StructSpecifier;

  constructor(lexeme: string, astNode: ASTNode.StructSpecifier) {
    super(lexeme, ESymbolType.STRUCT, astNode);
  }
}

type SymbolTypeInfer<T extends ESymbolType> = T extends ESymbolType.FN
  ? FnSymbol
  : T extends ESymbolType.STRUCT
  ? StructSymbol
  : VarSymbol;

export default class SymbolTable {
  parent: SymbolTable | null = null;
  table: Map<string, SymbolInfo[]> = new Map();

  private logger = new Logger("symbol table");

  insert(sm: SymbolInfo) {
    const { lexeme } = sm;

    const entry = this.table.get(lexeme) ?? [];
    if (
      sm.symType === ESymbolType.FN &&
      entry.findIndex((item) => item.symType === ESymbolType.FN && item.symDataType === sm.symDataType) !== -1
    ) {
      this.logger.error("function symbol exist:", lexeme);
      return;
    } else if (entry.findIndex((item) => item.symType === sm.symType) !== -1) {
      this.logger.error("symbol exist:", lexeme);
      return;
    }
    entry.push(sm);
    this.table.set(lexeme, entry);
  }

  lookup<T extends ESymbolType>(
    lexeme: string,
    type: T,
    signature?: T extends ESymbolType.FN ? GalaceanDataType[] : never
  ): SymbolTypeInfer<T> | null {
    const entry = this.table.get(lexeme);
    if (entry?.length) {
      let found: SymbolInfo | undefined;
      if (type !== ESymbolType.FN || signature == undefined) {
        found = entry.find((item) => item.symType === type);
      } else {
        found = entry.find((item) => {
          // struct constructor
          if (item.symType === ESymbolType.STRUCT) return true;

          const itemParams = (<ASTNode.FunctionDefinition>item.astNode)?.protoType.paramSig;
          if (item.symType !== ESymbolType.FN || signature?.length !== itemParams?.length) return false;
          for (let i = 0; i < signature?.length ?? 0; i++) {
            if (signature[i] === TypeAny || itemParams[i] === TypeAny) continue;
            if (signature[i] !== itemParams![i]) return false;
          }
          return true;
        });
      }
      if (found) {
        return found as any;
      }
    }
    if (this.parent) return this.parent.lookup(lexeme, type, signature);
    return null;
  }
}
