/**
 * 代码后处理器
 * 
 * 对大模型生成的代码进行格式化、优化和规范化处理
 */

import { CodeStyle, QualityReport } from '../types';

export interface PostProcessingOptions {
  formatCode: boolean;
  addComments: boolean;
  optimizeImports: boolean;
  applyCodeStyle: boolean;
  validateSyntax: boolean;
}

export interface PostProcessingResult {
  processedCode: string;
  changes: ProcessingChange[];
  issues: ProcessingIssue[];
  metrics: {
    originalLines: number;
    processedLines: number;
    processingTime: number;
  };
}

export interface ProcessingChange {
  type: 'format' | 'import' | 'comment' | 'style' | 'optimization';
  description: string;
  lineNumber?: number;
}

export interface ProcessingIssue {
  type: 'warning' | 'error';
  message: string;
  lineNumber?: number;
  suggestion?: string;
}

export class PostProcessor {
  constructor(private codeStyle: CodeStyle) {}

  /**
   * 对生成的代码进行后处理
   */
  async process(
    generatedCode: string,
    options: PostProcessingOptions = this.getDefaultOptions()
  ): Promise<PostProcessingResult> {
    const startTime = Date.now();
    const originalLines = generatedCode.split('\n').length;
    
    let processedCode = generatedCode;
    const changes: ProcessingChange[] = [];
    const issues: ProcessingIssue[] = [];

    try {
      // 1. 语法验证
      if (options.validateSyntax) {
        const syntaxIssues = await this.validateSyntax(processedCode);
        issues.push(...syntaxIssues);
      }

      // 2. 格式化代码
      if (options.formatCode) {
        const formatResult = await this.formatCode(processedCode);
        processedCode = formatResult.code;
        changes.push(...formatResult.changes);
      }

      // 3. 优化导入语句
      if (options.optimizeImports) {
        const importResult = await this.optimizeImports(processedCode);
        processedCode = importResult.code;
        changes.push(...importResult.changes);
      }

      // 4. 添加注释
      if (options.addComments) {
        const commentResult = await this.addComments(processedCode);
        processedCode = commentResult.code;
        changes.push(...commentResult.changes);
      }

      // 5. 应用代码风格
      if (options.applyCodeStyle) {
        const styleResult = await this.applyCodeStyle(processedCode);
        processedCode = styleResult.code;
        changes.push(...styleResult.changes);
      }

    } catch (error) {
      issues.push({
        type: 'error',
        message: `Post-processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    return {
      processedCode,
      changes,
      issues,
      metrics: {
        originalLines,
        processedLines: processedCode.split('\n').length,
        processingTime: Date.now() - startTime
      }
    };
  }

  /**
   * 验证语法
   */
  private async validateSyntax(code: string): Promise<ProcessingIssue[]> {
    const issues: ProcessingIssue[] = [];
    
    try {
      // TODO: 使用 TypeScript 编译器 API 或其他工具验证语法
      // const result = ts.transpileModule(code, { compilerOptions: {} });
      
    } catch (error) {
      issues.push({
        type: 'error',
        message: `Syntax error: ${error instanceof Error ? error.message : 'Unknown syntax error'}`
      });
    }

    return issues;
  }

  /**
   * 格式化代码
   */
  private async formatCode(code: string): Promise<{
    code: string;
    changes: ProcessingChange[];
  }> {
    // TODO: 使用 Prettier 或类似工具格式化代码
    const changes: ProcessingChange[] = [];
    
    // 基础格式化逻辑
    let formattedCode = code;
    
    // 修复缩进
    const lines = code.split('\n');
    let indentLevel = 0;
    const formattedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.includes('}')) indentLevel--;
      
      const indent = this.codeStyle.indentation === 'spaces' 
        ? ' '.repeat(indentLevel * this.codeStyle.indentSize)
        : '\t'.repeat(indentLevel);
      
      formattedLines.push(indent + line);
      
      if (line.includes('{')) indentLevel++;
    }
    
    formattedCode = formattedLines.join('\n');
    
    if (formattedCode !== code) {
      changes.push({
        type: 'format',
        description: 'Applied code formatting'
      });
    }

    return { code: formattedCode, changes };
  }

  /**
   * 优化导入语句
   */
  private async optimizeImports(code: string): Promise<{
    code: string;
    changes: ProcessingChange[];
  }> {
    const changes: ProcessingChange[] = [];
    
    // TODO: 实现导入优化逻辑
    // - 合并重复导入
    // - 排序导入语句
    // - 移除未使用的导入
    
    return { code, changes };
  }

  /**
   * 添加注释
   */
  private async addComments(code: string): Promise<{
    code: string;
    changes: ProcessingChange[];
  }> {
    const changes: ProcessingChange[] = [];
    
    // TODO: 实现智能注释添加
    // - 为复杂函数添加注释
    // - 为组件添加使用说明
    // - 为重要参数添加说明
    
    return { code, changes };
  }

  /**
   * 应用代码风格
   */
  private async applyCodeStyle(code: string): Promise<{
    code: string;
    changes: ProcessingChange[];
  }> {
    const changes: ProcessingChange[] = [];
    let styledCode = code;
    
    // 应用引号风格
    if (this.codeStyle.quotes === 'single') {
      styledCode = styledCode.replace(/"/g, "'");
      changes.push({
        type: 'style',
        description: 'Applied single quotes'
      });
    }
    
    // 应用分号规则
    if (!this.codeStyle.semicolons) {
      styledCode = styledCode.replace(/;$/gm, '');
      changes.push({
        type: 'style',
        description: 'Removed semicolons'
      });
    }

    return { code: styledCode, changes };
  }

  /**
   * 获取默认处理选项
   */
  private getDefaultOptions(): PostProcessingOptions {
    return {
      formatCode: true,
      addComments: true,
      optimizeImports: true,
      applyCodeStyle: true,
      validateSyntax: true
    };
  }

  /**
   * 更新代码风格配置
   */
  updateCodeStyle(newStyle: Partial<CodeStyle>): void {
    this.codeStyle = { ...this.codeStyle, ...newStyle };
  }
}