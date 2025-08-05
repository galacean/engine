/**
 * Generator 模块入口
 * 
 * 整合提示词构建、MCP调用管理和后处理功能
 */

export { PromptBuilder, PromptTemplate, BuiltPrompt } from './PromptBuilder';
export { MCPCallManager, MCPCallOptions, MCPResponse } from './MCPCallManager';
export { PostProcessor, PostProcessingOptions, PostProcessingResult } from './PostProcessor';

import { PromptBuilder } from './PromptBuilder';
import { MCPCallManager } from './MCPCallManager';
import { PostProcessor } from './PostProcessor';
import { 
  UserIntent, 
  ProjectContext, 
  ComponentNode, 
  CodeTemplate, 
  GenerationConfig,
  CodeStyle 
} from '../types';

/**
 * 代码生成协调器
 * 
 * 协调整个代码生成流程：
 * 用户意图 → 提示词构建 → MCP调用 → 后处理 → 最终代码
 */
export class CodeGeneratorOrchestrator {
  private promptBuilder: PromptBuilder;
  private mcpCallManager: MCPCallManager;
  private postProcessor: PostProcessor;

  constructor(
    codeStyle: CodeStyle,
    mcpOptions?: any
  ) {
    this.promptBuilder = new PromptBuilder();
    this.mcpCallManager = new MCPCallManager(mcpOptions);
    this.postProcessor = new PostProcessor(codeStyle);
  }

  /**
   * 完整的代码生成流程
   */
  async generateCode(
    intent: UserIntent,
    projectContext: ProjectContext,
    relevantComponents: ComponentNode[],
    templates: CodeTemplate[],
    config: GenerationConfig
  ): Promise<{
    success: boolean;
    code?: string;
    error?: string;
    metadata: {
      prompt: any;
      mcpResponse: any;
      postProcessing: any;
    };
  }> {
    try {
      // 1. 构建提示词
      const prompt = this.promptBuilder.buildPrompt(
        intent,
        projectContext,
        relevantComponents,
        templates
      );

      // 2. 调用大模型生成代码
      const mcpResponse = await this.mcpCallManager.generateCode(
        prompt,
        config
      );

      if (!mcpResponse.success || !mcpResponse.generatedCode) {
        return {
          success: false,
          error: mcpResponse.error || 'Failed to generate code',
          metadata: {
            prompt,
            mcpResponse,
            postProcessing: null
          }
        };
      }

      // 3. 后处理生成的代码
      const postProcessingResult = await this.postProcessor.process(
        mcpResponse.generatedCode
      );

      return {
        success: true,
        code: postProcessingResult.processedCode,
        metadata: {
          prompt,
          mcpResponse,
          postProcessing: postProcessingResult
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          prompt: null,
          mcpResponse: null,
          postProcessing: null
        }
      };
    }
  }

  /**
   * 批量生成代码
   */
  async generateBatch(
    requests: Array<{
      intent: UserIntent;
      projectContext: ProjectContext;
      relevantComponents: ComponentNode[];
      templates: CodeTemplate[];
    }>,
    config: GenerationConfig
  ): Promise<Array<{
    success: boolean;
    code?: string;
    error?: string;
    metadata: any;
  }>> {
    const results = [];
    
    for (const request of requests) {
      const result = await this.generateCode(
        request.intent,
        request.projectContext,
        request.relevantComponents,
        request.templates,
        config
      );
      results.push(result);
    }

    return results;
  }

  /**
   * 更新配置
   */
  updateConfig(updates: {
    codeStyle?: Partial<CodeStyle>;
    mcpOptions?: any;
  }): void {
    if (updates.codeStyle) {
      this.postProcessor.updateCodeStyle(updates.codeStyle);
    }
    
    if (updates.mcpOptions) {
      this.mcpCallManager.updateConfig(updates.mcpOptions);
    }
  }
}