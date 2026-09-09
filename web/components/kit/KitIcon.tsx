const STROKE_ICONS = {
  arrow: "M4 12h15m-6-6 6 6-6 6",
  back: "M20 12H5m6-6-6 6 6 6",
  wave: "M3 7c3-5 6 5 9 0s6 5 9 0M3 12c3-5 6 5 9 0s6 5 9 0M3 17c3-5 6 5 9 0s6 5 9 0",
  return: "m4 10 8-6 8 6M5 10h14M6 10v8m6-8v8m6-8v8M4 20h16",
} as const;

export type KitIconName = keyof typeof STROKE_ICONS | "stream";

export function KitIcon({ name }: { name: KitIconName }) {
  if (name === "stream") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 5h9a3.5 3.5 0 0 1 0 7h-4a3.5 3.5 0 0 0 0 7h9"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="5" cy="5" r="2.5" fill="currentColor" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        <circle cx="19" cy="19" r="2.5" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={STROKE_ICONS[name]} />
    </svg>
  );
}
