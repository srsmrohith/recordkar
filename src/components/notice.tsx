"use client";

import { useEffect, useState } from "react";

const MESSAGES = {
  posted: "Posted",
  saved: "Saved",
  deleted: "Deleted",
} as const;

export type NoticeKind = keyof typeof MESSAGES;

export function isNoticeKind(value: unknown): value is NoticeKind {
  return typeof value === "string" && value in MESSAGES;
}

/**
 * Short confirmation after a redirect (e.g. /transactions?notice=posted). The query parameter is
 * removed straight away so a refresh doesn't repeat it, and the message fades after a few seconds.
 */
export function Notice({ kind }: { kind: NoticeKind }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", url);
    const t = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg bg-brand/10 px-3 py-2 text-sm font-medium text-brand">
      <span aria-hidden="true">✓</span>
      {MESSAGES[kind]}
      <button type="button" className="ml-auto text-xs font-normal text-ink-2 hover:text-ink" onClick={() => setVisible(false)}>
        Dismiss
      </button>
    </div>
  );
}
