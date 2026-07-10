import { lazy } from "react";

const MyPage = lazy(() => import("./MyPage").then((mod) => ({ default: mod.MyPage })));

export function MyPageRoute() {
  return <MyPage />;
}
