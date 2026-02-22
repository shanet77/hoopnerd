"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isPlausibleEnabled, trackPageview } from "./analytics";

export default function PlausiblePageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!isPlausibleEnabled) {
      return;
    }
    const pathWithQuery = search ? `${pathname}?${search}` : pathname;
    trackPageview(pathWithQuery);
  }, [pathname, search]);

  return null;
}
