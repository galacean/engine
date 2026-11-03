export { isAnimalCommand as isHorseCommand } from "../animal/AnimalCommands";

/** Tool guidance for an adapter; registering this text alone does not connect an LLM. */
export const HORSE_AGENT_PROMPT = `坐骑只有三个 AI 指令，通过 horse.command 提交 action 与 requestId，重试复用 requestId。
“马来”对应 come：未在场时同时播放显现、粒子特效和 Falling 动画，并在一秒内下落，落地后奔向玩家；抵达后自动上马。
“下马”对应 dismount：停稳后下马，恢复行为树随机活动：三个 idle、闲逛、寻找草地吃草。
“马消失”或“我不要马了”对应 dismiss：先下马，再播放退场动画并移出场景。
上马由靠近满足条件的坐骑自动触发。下马后离开再进入范围才能自动上马。
只有已抵达且 sampleGround 确认为草地时才能吃草；草地消失则停止吃草。
accepted 仅表示指令已接收；completed 或完成事件表示动作完成。`;
