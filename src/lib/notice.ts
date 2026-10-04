// Shared by server pages (to read ?notice=…) and the client <Notice> component. Must not live in a
// "use client" module: server components can't call functions exported from one.
export const NOTICE_MESSAGES = {
  posted: "Posted",
  saved: "Saved",
  deleted: "Deleted",
} as const;

export type NoticeKind = keyof typeof NOTICE_MESSAGES;

export function isNoticeKind(value: unknown): value is NoticeKind {
  return typeof value === "string" && Object.hasOwn(NOTICE_MESSAGES, value);
}
