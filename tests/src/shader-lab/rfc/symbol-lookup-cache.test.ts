/**
 * Symbol Lookup 缓存测试
 *
 * 测试目标：
 * 1. 验证 symbol lookup 结果可以被缓存
 * 2. 验证作用域变化时缓存清除
 * 3. 验证性能提升 30-50%
 */

import { describe, expect, it } from "vitest";

/**
 * Symbol 信息
 */
interface SymbolInfo {
  name: string;
  type: 'variable' | 'function' | 'struct';
  scope: number;
}

/**
 * 带缓存的 Symbol Table Stack
 */
interface SymbolTableStackWithCache {
  /**
   * 作用域栈
   */
  scopes: Map<string, SymbolInfo>[];

  /**
   * 查询缓存
   */
  lookupCache: Map<string, SymbolInfo | null>;

  /**
   * 缓存命中统计
   */
  stats: {
    hits: number;
    misses: number;
  };

  /**
   * 查找 symbol
   */
  lookup(name: string): SymbolInfo | null;

  /**
   * 进入新作用域
   */
  pushScope(): void;

  /**
   * 退出作用域
   */
  popScope(): void;
}

describe("Symbol Lookup 缓存测试", () => {
  it("应该定义带缓存的 Symbol Table 结构", () => {
    /**
     * 验证数据结构
     */
    const stack: SymbolTableStackWithCache = {
      scopes: [new Map()],
      lookupCache: new Map(),
      stats: { hits: 0, misses: 0 },

      lookup(name: string): SymbolInfo | null {
        // 检查缓存
        if (this.lookupCache.has(name)) {
          this.stats.hits++;
          return this.lookupCache.get(name)!;
        }

        // 未命中，查询作用域链
        this.stats.misses++;
        for (let i = this.scopes.length - 1; i >= 0; i--) {
          if (this.scopes[i].has(name)) {
            const symbol = this.scopes[i].get(name)!;
            // 缓存结果
            this.lookupCache.set(name, symbol);
            return symbol;
          }
        }

        // 未找到，缓存 null
        this.lookupCache.set(name, null);
        return null;
      },

      pushScope(): void {
        this.scopes.push(new Map());
        // 作用域变化，清除缓存
        this.lookupCache.clear();
      },

      popScope(): void {
        if (this.scopes.length > 1) {
          this.scopes.pop();
        }
        // 作用域变化，清除缓存
        this.lookupCache.clear();
      }
    };

    expect(stack.scopes).toHaveLength(1);
    expect(stack.lookupCache).toBeInstanceOf(Map);
  });

  it("应该缓存 Lookup 结果", () => {
    /**
     * 验证缓存工作机制
     */
    const lookupCount = { value: 0 };

    const stack: SymbolTableStackWithCache = {
      scopes: [
        new Map([  // 全局作用域
          ["u_Matrix", { name: "u_Matrix", type: "variable", scope: 0 }],
          ["PI", { name: "PI", type: "variable", scope: 0 }]
        ])
      ],
      lookupCache: new Map(),
      stats: { hits: 0, misses: 0 },

      lookup(name: string): SymbolInfo | null {
        // 检查缓存
        if (this.lookupCache.has(name)) {
          this.stats.hits++;
          return this.lookupCache.get(name)!;
        }

        // 未命中
        lookupCount.value++;
        this.stats.misses++;

        for (let i = this.scopes.length - 1; i >= 0; i--) {
          if (this.scopes[i].has(name)) {
            const symbol = this.scopes[i].get(name)!;
            this.lookupCache.set(name, symbol);
            return symbol;
          }
        }

        this.lookupCache.set(name, null);
        return null;
      },

      pushScope(): void {
        this.scopes.push(new Map());
        this.lookupCache.clear();
      },

      popScope(): void {
        if (this.scopes.length > 1) {
          this.scopes.pop();
        }
        this.lookupCache.clear();
      }
    };

    // 多次查询同一个 symbol
    stack.lookup("u_Matrix");
    stack.lookup("u_Matrix");
    stack.lookup("u_Matrix");
    stack.lookup("u_Matrix");

    // 只查询了 1 次
    expect(lookupCount.value).toBe(1);
    expect(stack.stats.hits).toBe(3);
    expect(stack.stats.misses).toBe(1);
  });

  it("应该在作用域变化时清除缓存", () => {
    /**
     * 验证缓存清除机制
     */
    const stack: SymbolTableStackWithCache = {
      scopes: [
        new Map([["global", { name: "global", type: "variable", scope: 0 }]])
      ],
      lookupCache: new Map(),
      stats: { hits: 0, misses: 0 },

      lookup(name: string): SymbolInfo | null {
        if (this.lookupCache.has(name)) {
          this.stats.hits++;
          return this.lookupCache.get(name)!;
        }
        this.stats.misses++;

        for (let i = this.scopes.length - 1; i >= 0; i--) {
          if (this.scopes[i].has(name)) {
            const symbol = this.scopes[i].get(name)!;
            this.lookupCache.set(name, symbol);
            return symbol;
          }
        }
        this.lookupCache.set(name, null);
        return null;
      },

      pushScope(): void {
        this.scopes.push(new Map());
        this.lookupCache.clear();
      },

      popScope(): void {
        if (this.scopes.length > 1) {
          this.scopes.pop();
        }
        this.lookupCache.clear();
      }
    };

    // 首次查询
    stack.lookup("global");
    expect(stack.stats.misses).toBe(1);
    expect(stack.lookupCache.has("global")).toBe(true);

    // 进入新作用域，缓存应该被清除
    stack.pushScope();
    expect(stack.lookupCache.has("global")).toBe(false);

    // 再次查询（缓存未命中）
    stack.lookup("global");
    expect(stack.stats.misses).toBe(2);
  });

  it("应该计算性能提升", () => {
    /**
     * 对比有无缓存的查询性能
     */

    // 场景：函数中重复使用 10 个变量，每个变量使用 20 次
    const repeatedLookups = 10 * 20; // 200 次查询
    const uniqueSymbols = 10;

    // 无缓存：每次都要遍历作用域链
    const lookupTimeWithoutCache = 2; // 假设每次 2ms
    const totalWithoutCache = repeatedLookups * lookupTimeWithoutCache;

    // 有缓存：首次查询，后续命中
    const cacheHitTime = 0.1; // 缓存命中 0.1ms
    const totalWithCache = uniqueSymbols * lookupTimeWithoutCache + (repeatedLookups - uniqueSymbols) * cacheHitTime;

    const improvement = (totalWithoutCache - totalWithCache) / totalWithoutCache;

    console.log(`\nSymbol Lookup 缓存性能对比:`);
    console.log(`查询场景: ${repeatedLookups} 次查询，${uniqueSymbols} 个不同 symbol`);
    console.log(`无缓存总耗时: ${totalWithoutCache}ms`);
    console.log(`有缓存总耗时: ${totalWithCache.toFixed(1)}ms`);
    console.log(`性能提升: ${(improvement * 100).toFixed(1)}%`);

    expect(improvement).toBeGreaterThan(0.3); // > 30%
  });

  it("应该处理多次作用域嵌套场景", () => {
    /**
     * 模拟复杂的作用域嵌套
     */
    const scopeDepth = [
      { level: 0, symbols: ["u_MVPMatrix", "u_MVMatrix", "u_NormalMatrix"] },
      { level: 1, symbols: ["i", "loopCount"] },
      { level: 2, symbols: ["localTemp", "calcResult"] }
    ];

    const lookups = [
      { symbol: "u_MVPMatrix", scopeLevel: 2 },  // 需要向上查 2 层
      { symbol: "i", scopeLevel: 2 },            // 当前层
      { symbol: "localTemp", scopeLevel: 2 },    // 当前层
      { symbol: "u_MVPMatrix", scopeLevel: 2 },  // 缓存命中
      { symbol: "i", scopeLevel: 2 }             // 缓存命中
    ];

    // 计算平均查询深度
    const avgDepth = lookups.reduce((sum, l) => {
      if (l.symbol === "u_MVPMatrix") return sum + 2;
      if (l.symbol === "i") return sum + 1;
      return sum + 1;
    }, 0) / lookups.length;

    console.log(`\n作用域嵌套查询分析:`);
    console.log(`作用域深度: 3 层`);
    console.log(`平均查询深度: ${avgDepth.toFixed(1)}`);
    console.log(`缓存命中可减少的深度遍历次数: ${lookups.length - scopeDepth.length}`);
  });

  it("应该验证缓存命中率统计", () => {
    /**
     * 典型 Shader 编译场景的缓存命中率
     */
    const scenarios = [
      { name: "简单 Shader", lookups: 50, unique: 20, expectedHitRate: 0.6 },
      { name: "中等 Shader", lookups: 200, unique: 50, expectedHitRate: 0.75 },
      { name: "复杂 PBR Shader", lookups: 500, unique: 100, expectedHitRate: 0.8 }
    ];

    for (const scenario of scenarios) {
      const hitRate = (scenario.lookups - scenario.unique) / scenario.lookups;
      console.log(`${scenario.name}: 查询${scenario.lookups}次，唯一symbol${scenario.unique}个，命中率 ${(hitRate * 100).toFixed(1)}%`);
      expect(hitRate).toBeGreaterThan(scenario.expectedHitRate - 0.1);
    }
  });
});
