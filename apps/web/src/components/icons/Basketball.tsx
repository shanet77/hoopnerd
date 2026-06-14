import React from "react";

export function Basketball({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      role="img"
      aria-label="Basketball"
    >
      <circle cx="12" cy="12" r="9.5" fill="currentColor" />
      <path
        d="M2.5 12h19M12 2.5v19M4.8 4.8c3.9 3.9 3.9 10.5 0 14.4M19.2 4.8c-3.9 3.9-3.9 10.5 0 14.4"
        stroke="#ffffff"
        strokeOpacity="0.6"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
