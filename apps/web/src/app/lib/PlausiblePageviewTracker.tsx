"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isPlausibleEnabled, trackPageview } from "./analytics";

export default function PlausiblePageviewTracker() {
  const pathname = usePathname();
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isPlausibleEnabled) {
      return;
    }
    const search =
      typeof window !== "undefined" ? window.location.search : "";
    const pathWithQuery = search ? `${pathname}${search}` : pathname;
    if (lastTrackedPathRef.current === pathWithQuery) {
      return;
    }
    lastTrackedPathRef.current = pathWithQuery;
    trackPageview(pathWithQuery);
  }, [pathname]);

  return null;
}
