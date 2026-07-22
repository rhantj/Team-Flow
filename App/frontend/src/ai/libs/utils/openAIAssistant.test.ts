import { describe, expect, it, vi } from "vitest";
import { OPEN_AI_ASSISTANT_EVENT, openAIAssistant } from "./openAIAssistant";

describe("openAIAssistant", () => {
  it("dispatches a CustomEvent carrying the question", () => {
    const handler = vi.fn();
    window.addEventListener(OPEN_AI_ASSISTANT_EVENT, handler);

    openAIAssistant("블로커 해결 방법 추천해줘");

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent<{ question?: string; requestId: number }>;
    expect(event.detail.question).toBe("블로커 해결 방법 추천해줘");
    expect(typeof event.detail.requestId).toBe("number");

    window.removeEventListener(OPEN_AI_ASSISTANT_EVENT, handler);
  });

  it("dispatches with an undefined question when called without an argument", () => {
    const handler = vi.fn();
    window.addEventListener(OPEN_AI_ASSISTANT_EVENT, handler);

    openAIAssistant();

    const event = handler.mock.calls[0][0] as CustomEvent<{ question?: string; requestId: number }>;
    expect(event.detail.question).toBeUndefined();

    window.removeEventListener(OPEN_AI_ASSISTANT_EVENT, handler);
  });

  it("uses a different requestId on each call", () => {
    const handler = vi.fn();
    window.addEventListener(OPEN_AI_ASSISTANT_EVENT, handler);

    openAIAssistant("질문 A");
    openAIAssistant("질문 A");

    const first = (handler.mock.calls[0][0] as CustomEvent<{ requestId: number }>).detail.requestId;
    const second = (handler.mock.calls[1][0] as CustomEvent<{ requestId: number }>).detail.requestId;
    expect(second).not.toBe(first);

    window.removeEventListener(OPEN_AI_ASSISTANT_EVENT, handler);
  });
});
