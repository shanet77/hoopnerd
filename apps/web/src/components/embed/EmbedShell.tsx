"use client";

import Link from "next/link";
import { Basketball } from "../icons/Basketball";

export const FALLBACK_FULL_APP_PATH = "/";

export function EmbedShell({
  title,
  headerRight,
  children,
}: {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-gray-50 dark:bg-gray-900 py-4 px-3"
    >
      <div className="max-w-xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Basketball
              className="h-6 w-6 text-basketball"
              aria-hidden="true"
            />
            <h1 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
              {title}
            </h1>
          </div>
          {headerRight}
        </div>
        {children}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 font-medium">
          Full experience at{" "}
          <Link
            href={FALLBACK_FULL_APP_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            HoopNerd
          </Link>
        </p>
      </div>
    </main>
  );
}
