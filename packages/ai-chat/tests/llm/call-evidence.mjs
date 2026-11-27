/** Browser/Node shared evidence. Provider call IDs are unique only within one batch.
 * Host identity (taskId, step, call) links admission, execution and observation. */
export const invocationKey = ({taskId, step, call}) =>
  typeof taskId === 'string' && taskId.length > 0 && Number.isInteger(step) && step > 0 && call === 1
    ? JSON.stringify([taskId, step, call]) : undefined;

export function collectCallEvidence(trace) {
  const events = (trace?.agentEvents ?? []).map(row => row.event);
  const batches = [], replies = [], exchanges = [], errors = [];
  const byKey = new Map();
  let pending = new Map(), pairedCalls = true;
  for (const event of events) {
    if (event.type === 'transcript_appended') for (const message of event.messages ?? []) {
      if (message.role === 'assistant') {
        if (pending.size) pairedCalls = false;
        pending = new Map();
        const calls = message.toolCalls ?? [];
        if (calls.length) batches.push(calls);
        for (const call of calls) {
          const record = {call, ordinal: exchanges.length, key: undefined, admissions: [], starts: [], finishes: [], observations: [], replies: [], errors: []};
          exchanges.push(record);
          if (typeof call.id !== 'string' || !call.id || pending.has(call.id)) pairedCalls = false;
          pending.set(call.id, record);
        }
      } else if (message.role === 'tool') {
        replies.push(message);
        const record = pending.get(message.toolCallId);
        if (!record) pairedCalls = false;
        else { record.replies.push(message); record.reply = message; pending.delete(message.toolCallId); }
      }
    }
    if (event.type === 'model_finished' && event.step?.toolCallId) {
      const record = pending.get(event.step.toolCallId);
      const key = invocationKey({taskId: event.taskId, step: event.step.step, call: 1});
      if (!record || !key) { errors.push('Unmatched or invalid admission'); continue; }
      record.admissions.push(event);
      if (record.key || byKey.has(key)) record.errors.push('Duplicate admission identity');
      else { record.key = key; byKey.set(key, record); }
    }
    if (['tool_started', 'tool_finished', 'view_observed'].includes(event.type) && event.toolCallId) {
      // Observations belong to the direct tool; their event schema has no call field.
      // Execution events do have that field: missing identity is not valid evidence.
      const record = byKey.get(invocationKey(event.type === 'view_observed' ? {...event, call: 1} : event));
      if (!record || record.call.id !== event.toolCallId ||
        (event.type !== 'view_observed' && record.call.function.name !== event.tool)) {
        errors.push(`Unmatched ${event.type}`); continue;
      }
      if (event.type === 'tool_started') {
        if (record.finishes.length) record.errors.push('Start after finish');
        record.starts.push(event);
      } else if (event.type === 'tool_finished') {
        if (record.starts.length !== 1) record.errors.push('Finish without one start');
        record.finishes.push(event);
      } else record.observations.push(event);
    }
  }
  pairedCalls &&= pending.size === 0 && exchanges.length > 0;
  for (const record of exchanges) {
    if (!record.key || record.admissions.length !== 1 || record.starts.length !== 1 ||
      record.finishes.length !== 1 || record.replies.length !== 1 ||
      typeof record.finishes[0]?.result?.ok !== 'boolean') record.errors.push('Incomplete or duplicate invocation evidence');
    record.complete = record.errors.length === 0;
  }
  return {events, batches, replies, exchanges, pairedCalls, errors,
    complete: pairedCalls && errors.length === 0 && exchanges.every(record => record.complete)};
}
