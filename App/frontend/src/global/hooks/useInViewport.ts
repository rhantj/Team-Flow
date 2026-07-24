import { useEffect, useRef, useState } from "react";

/** 요소가 뷰포트(스크롤 컨테이너 포함)에 처음 한 번이라도 들어온 적이 있는지 감지한다.
 * 한 번 true가 되면 다시 false로 되돌리지 않는다 — 스크롤을 벗어났다가 돌아왔을 때
 * 이미 받아온 결과(예: AI 추천 답변)를 다시 요청하지 않기 위함이다.
 * IntersectionObserver가 없는 환경(구형 브라우저/테스트 jsdom)에서는 안전하게 항상 true로
 * 취급해, 관찰이 불가능하다는 이유로 콘텐츠가 영영 로드되지 않는 것을 막는다. */
export function useInViewport<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (inView) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      // 카드가 화면에 완전히 들어오기 전, 스크롤 중 미리 로드되도록 아래쪽에 여유를 둔다.
      { rootMargin: "200px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView]);

  return [ref, inView];
}
