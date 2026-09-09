"use client";

import type { ReactNode } from "react";
import { Capsule, CapsuleLegend } from "@/components/kit/Capsule";
import type { CapsuleSegment } from "@/lib/capsule-segments";
import "@/components/kit/surfaces.css";

export function FlowLayout({
  children,
  segments,
  compact = false,
  back,
}: {
  children: ReactNode;
  segments: readonly CapsuleSegment[];
  compact?: boolean;
  back?: ReactNode;
}) {
  return (
    <div className="kit-flow-layout" data-compact={compact ? "true" : undefined}>
      <div className="kit-flow-main">
        {back}
        {children}
      </div>
      <aside className="kit-preview">
        <Capsule segments={segments} draft compact={compact} />
        <CapsuleLegend segments={segments} />
      </aside>
    </div>
  );
}
