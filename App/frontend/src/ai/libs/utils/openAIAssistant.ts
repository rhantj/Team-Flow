export const OPEN_AI_ASSISTANT_EVENT = "workflow-ai:open-ai-assistant";

export interface OpenAIAssistantEventDetail {
  question?: string;
  requestId: number;
}

/** AI 어시스턴트 패널을 열고, question이 있으면 자동으로 질문을 전송하게 한다.
 * requestId는 동일한 문구를 다시 요청해도 AIAssistant의 useEffect가 항상 반응하도록
 * 매 호출마다 새 값을 부여한다 (question 텍스트만으로는 dependency가 안 바뀔 수 있음). */
export function openAIAssistant(question?: string): void {
  const detail: OpenAIAssistantEventDetail = { question, requestId: Date.now() + Math.random() };
  window.dispatchEvent(new CustomEvent<OpenAIAssistantEventDetail>(OPEN_AI_ASSISTANT_EVENT, { detail }));
}
