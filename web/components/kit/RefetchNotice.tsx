"use client";

import { useSyncExternalStore } from "react";
import { ActionButton } from "@/components/kit/ActionButton";
import { getDisclosure, subscribeDisclosure } from "@/lib/disclosure";
import { queryClient } from "@/lib/query-client";
import { invalidateAllOnChainReads } from "@/lib/invalidate";
import {
  getRefetchNotice,
  setBackgroundRefetchFailed,
  subscribeRefetchNotice,
} from "@/lib/refetch-notice";

/** One global notice for background refetch failure — never a per-hook toast. */
export function RefetchNotice() {
  const disclosure = useSyncExternalStore(subscribeDisclosure, getDisclosure, getDisclosure);
  const failed = useSyncExternalStore(subscribeRefetchNotice, getRefetchNotice, () => false);
  if (disclosure !== "advanced" || !failed) return null;

  return (
    <div className="kit-refetch-notice" role="status" data-ui="UI-SHELL-REFETCH-NOTICE">
      <span>BACKGROUND REFRESH FAILED — SHOWING LAST KNOWN</span>
      <ActionButton
        onClick={() => {
          invalidateAllOnChainReads(queryClient);
          setBackgroundRefetchFailed(false);
        }}
      >
        REFRESH
      </ActionButton>
    </div>
  );
}
