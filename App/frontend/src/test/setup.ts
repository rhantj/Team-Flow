import '@testing-library/jest-dom/vitest';

// jsdom은 scrollIntoView를 구현하지 않아 호출 시 TypeError가 발생한다.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
