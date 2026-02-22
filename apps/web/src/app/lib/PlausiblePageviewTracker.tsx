"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isPlausibleEnabled, trackPageview } from "./analytics";

export default function PlausiblePageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const hasTrackedFirstViewRef = useRef(false);

  useEffect(() => {
    if (!isPlausibleEnabled) {
      return;
    }
    if (!hasTrackedFirstViewRef.current) {
      hasTrackedFirstViewRef.current = true;
      return;
    }
    const pathWithQuery = search ? `${pathname}?${search}` : pathname;
    trackPageview(pathWithQuery);
  }, [pathname, search]);

  return null;
}
