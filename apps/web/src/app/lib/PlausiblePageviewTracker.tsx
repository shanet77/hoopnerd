"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isPlausibleEnabled, trackPageview } from "./analytics";

export default function PlausiblePageviewTracker() {
  const pathname = usePathname();
  const hasTrackedFirstViewRef = useRef(false);

  useEffect(() => {
    if (!isPlausibleEnabled) {
      return;
    }
    if (!hasTrackedFirstViewRef.current) {
      hasTrackedFirstViewRef.current = true;
      return;
    }
    const search =
      typeof window !== "undefined" ? window.location.search : "";
    const pathWithQuery = search ? `${pathname}${search}` : pathname;
    trackPageview(pathWithQuery);
  }, [pathname]);

  return null;
}
