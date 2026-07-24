import { lazy } from "react";

const MyPageEditScreen = lazy(() =>
  import("./MyPageEditScreen").then((mod) => ({ default: mod.MyPageEditScreen }))
);

export function MyPageEditRoute() {
  return <MyPageEditScreen />;
}
