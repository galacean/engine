import type { SceneVisualIntentController, SceneVisualIntentState } from "./SceneVisualIntentController.ts";

/** The experiment uses the same single natural-language interaction as the product. */
export function mountSceneVisualIntentPage(
  host: HTMLElement,
  controller: SceneVisualIntentController
): { dispose(): void } {
  host.replaceChildren();
  host.className = "scene-conversation";
  const heading = document.createElement("header");
  heading.className = "scene-heading";
  const title = document.createElement("h1");
  title.textContent = "你想要什么样的世界？";
  const hint = document.createElement("p");
  hint.textContent = "说说你想要的世界，AI 会补全细节并生成场景。";
  heading.append(title, hint);

  const conversation = document.createElement("section");
  conversation.className = "conversation-panel";
  conversation.setAttribute("aria-label", "场景对话");
  const history = document.createElement("div");
  history.className = "conversation-history";
  history.setAttribute("role", "log");
  history.setAttribute("aria-live", "polite");
  const status = document.createElement("p");
  status.className = "conversation-status";
  status.setAttribute("role", "status");
  const form = document.createElement("form");
  form.className = "conversation-composer";
  const input = document.createElement("textarea");
  input.rows = 2;
  input.setAttribute("aria-label", "描述你想生成的场景");
  input.placeholder = "描述你想生成的场景…";
  input.value = "我想生成一片金黄的草地，整体热情明快，天空保持清澈的蓝色。";
  const send = document.createElement("button");
  send.type = "submit";
  send.setAttribute("aria-label", "发送");
  send.textContent = "↑";
  form.append(input, send);
  conversation.append(history, status, form);
  const restart = document.createElement("button");
  restart.className = "generation-restart";
  restart.textContent = "重新描述";
  restart.hidden = true;
  conversation.append(restart);
  const showConversation = document.createElement("button");
  showConversation.className = "generation-restart";
  showConversation.textContent = "查看对话";
  showConversation.hidden = true;
  showConversation.setAttribute("aria-expanded", "false");
  conversation.append(showConversation);
  const startAgain = (): void => location.reload();
  restart.addEventListener("click", startAgain);
  host.append(heading, conversation);
  let busy = false;
  let renderedMessages = "";
  let conversationExpanded = false;
  const updateSend = (): void => { send.disabled = !busy && !input.value.trim(); };

  const render = (state: SceneVisualIntentState): void => {
    busy = state.busy;
    host.dataset.taskStatus = state.busy ? "running" : state.messages.at(-1)?.status ?? "idle";
    status.textContent = state.progress || (state.sceneReady ? "这是首次生成的结果，请看画面是否符合你的描述。" : "");
    status.hidden = !status.textContent || state.sceneReady;
    input.disabled = state.busy;
    form.hidden = state.sceneReady;
    restart.hidden = !state.sceneReady || state.busy;
    showConversation.hidden = !state.sceneReady;
    send.type = state.busy ? "button" : "submit";
    send.textContent = state.busy ? "■" : "↑";
    send.setAttribute("aria-label", state.busy ? "停止" : "发送");
    updateSend();
    const visibleMessages = state.messages.filter(message => message.status !== "pending");
    const fingerprint = JSON.stringify(visibleMessages);
    if (fingerprint !== renderedMessages) {
      renderedMessages = fingerprint;
      history.replaceChildren();
      for (const message of visibleMessages) {
        const bubble = document.createElement("p");
        bubble.className = "conversation-message " + message.role;
        bubble.dataset.status = message.status;
        bubble.textContent = message.text;
        history.append(bubble);
      }
      history.scrollTop = history.scrollHeight;
    }
    history.hidden = !visibleMessages.length || (state.sceneReady && !conversationExpanded);
    heading.hidden = !!state.messages.length;
  };
  const unsubscribe = controller.subscribe(render);
  const toggleConversation = (): void => {
    conversationExpanded = !conversationExpanded;
    showConversation.textContent = conversationExpanded ? "收起对话" : "查看对话";
    showConversation.setAttribute("aria-expanded", String(conversationExpanded));
    render(controller.getState());
  };
  showConversation.addEventListener("click", toggleConversation);
  render(controller.getState());
  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (busy || !input.value.trim()) return;
    const original = input.value;
    input.value = "";
    void controller.submit(original).then(() => {
      if (controller.getState().messages.at(-1)?.status === "failed" && !input.value) input.value = original;
      updateSend();
    });
  };
  const stop = (): void => { if (busy) controller.cancel(); };
  const keydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  };
  form.addEventListener("submit", submit);
  send.addEventListener("click", stop);
  input.addEventListener("keydown", keydown);
  input.addEventListener("input", updateSend);
  return { dispose: () => {
    unsubscribe();
    form.removeEventListener("submit", submit);
    send.removeEventListener("click", stop);
    input.removeEventListener("keydown", keydown);
    input.removeEventListener("input", updateSend);
    restart.removeEventListener("click", startAgain);
    showConversation.removeEventListener("click", toggleConversation);
    host.remove();
  } };
}
