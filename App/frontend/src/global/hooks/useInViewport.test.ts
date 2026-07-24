import { act, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInViewport } from "./useInViewport";

function TestCard({ onRender }: { onRender: (inView: boolean) => void }) {
  const [ref, inView] = useInViewport<HTMLDivElement>();
  onRender(inView);
  return createElement("div", { ref, "data-testid": "card" });
}

describe("useInViewport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to true when IntersectionObserver is unavailable (jsdom default)", () => {
    const states: boolean[] = [];
    render(createElement(TestCard, { onRender: state => states.push(state) }));
    expect(states.at(-1)).toBe(true);
  });

  it("stays false until the observed element intersects, then flips to true and disconnects", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let capturedCallback: IntersectionObserverCallback | null = null;

    class FakeIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        capturedCallback = callback;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = "";
      thresholds = [];
    }
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

    const states: boolean[] = [];
    render(createElement(TestCard, { onRender: state => states.push(state) }));

    expect(states.at(-1)).toBe(false);
    expect(observe).toHaveBeenCalledTimes(1);

    act(() => {
      capturedCallback!(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(states.at(-1)).toBe(true);
    // observer.disconnect()가 콜백 안에서 명시적으로 한 번, 그리고 inView가 true로 바뀌며
    // effect가 정리(cleanup)될 때 한 번 더 불린다 - 중복 호출 자체는 안전하다.
    expect(disconnect).toHaveBeenCalled();
  });
});
