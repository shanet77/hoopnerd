"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isUmamiEnabled, trackPageview } from "./analytics";

export default function UmamiPageviewTracker() {
  const pathname = usePathname();
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isUmamiEnabled) {
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
