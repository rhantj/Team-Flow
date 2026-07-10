import type { ReactNode } from "react";

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-sm font-bold text-foreground mb-3">{children}</div>;
}
