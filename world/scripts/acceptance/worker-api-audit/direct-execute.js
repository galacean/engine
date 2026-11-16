  async auditExecute(source, id) {
    this.#refreshConfiguration();
    const signal = new AbortController().signal;
    const tools = this.#tools;
    const registry = new ToolRegistry(tools);
    const stage = async (name, action) => {
      const start = performance.now();
      try { return await action(); }
      finally { globalThis.__auditStages.push({ name, start, ms: performance.now() - start }); }
    };
    const preflight = await stage('preflight', () => validateScriptApiReferences(source, tools, this.#scriptChecker, signal));
    if (preflight) return preflight;
    const files = await stage('project-files', () => createAgentProjectFiles(this.#definition.scriptApi, this.#definition.projectFiles ?? []));
    const declarations = await stage('declarations', () => projectDeclarationModules(files, this.#definition.scriptApi.modules));
    const bind = (selected, owner) => selected.map(tool => ({
      name: tool.name, effect: tool.effect, describeCommand: tool.describeCommand,
      invoke: (input, signal, call) => stage('tool:' + tool.name, () => this.#executeTool(tool.name, input, signal, owner))
    }));
    return executeAgentEdit(this.#scriptRuntime, this.#scriptChecker, {
      id, source, editorComponents: this.#definition.editorComponents,
      toolBindings: bind(tools, registry), signal,
      maxToolCalls: this.#maxToolCallsPerScript, timeoutMs: this.#scriptTimeoutMs,
      onTrace: trace => { globalThis.__auditTrace = trace; }
    }, declarations, this.#definition.beginEdit ? async signal => {
      const transaction = await stage('begin-edit', () => this.#definition.beginEdit(id, signal));
      try {
        const draft = new ToolRegistry(transaction.tools);
        const names = tools.filter(tool => tool.effect !== 'command' && (tool.effect !== 'read' || draft.get(tool.name))).map(tool => tool.name);
        const wrapped = { ...transaction };
        for (const key of ['prepare', 'commit', 'activate', 'complete', 'discard']) {
          if (transaction[key]) wrapped[key] = (...args) => stage('transaction:' + key, () => transaction[key](...args));
        }
        return { transaction: wrapped, toolBindings: bind(draft.select(names), draft) };
      } catch (error) { await transaction.discard(); throw error; }
    } : undefined);
  }
  auditPublicInventory() {
    this.#refreshConfiguration();
    return buildAgentToolDefinitions(this.#definition);
  }
  async auditPublic(plan, id) {
    globalThis.__auditPublicPlan = [...plan];
    const calls=[];const active=new Map();
    const stop=this.subscribe(event=>{
      if(event.type==='script_started')active.set('execute',{tool:'execute',input:{code:event.code},start:performance.now()});
      if(event.type==='script_finished'){
        const start=active.get('execute');
        calls.push({...start,tool:'execute',result:event.result,durationMilliseconds:start?performance.now()-start.start:0});
      }
      if(event.type==='tool_started')active.set(event.toolCallId??event.tool,{tool:event.tool,input:event.input,start:performance.now()});
      if(event.type==='tool_finished'){
        const start=active.get(event.toolCallId??event.tool);
        calls.push({...start,tool:event.tool,result:event.result,durationMilliseconds:start?performance.now()-start.start:0});
      }
    });
    try {
      const result=await this.run(id,{debugMode:true});
      globalThis.__auditTrace={toolCalls:calls};
      return {ok:calls.every(x=>x.result.ok&&!x.result.receipt?.runtimeErrors?.length)&&result.result.status==='completed',output:result,receipt:{status:result.result.status}};
    } finally {stop();globalThis.__auditPublicPlan=undefined;globalThis.__auditTrace={toolCalls:calls};}
  }
