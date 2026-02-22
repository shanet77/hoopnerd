type PlausibleValue = string | number | boolean;

type PlausibleOptions = {
  callback?: () => void;
  props?: Record<string, PlausibleValue>;
  u?: string;
};

declare global {
  interface Window {
    plausible?: (eventName: string, options?: PlausibleOptions) => void;
  }
}

const PLAUSIBLE_HOST_FALLBACK = "https://plausible.io";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const plausibleDomain =
  process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim() || "";

export const plausibleApiHost = trimTrailingSlash(
  process.env.NEXT_PUBLIC_PLAUSIBLE_API_HOST?.trim() ||
    PLAUSIBLE_HOST_FALLBACK,
);

export const plausibleScriptSrc = `${plausibleApiHost}/js/script.manual.js`;

export const isPlausibleEnabled = plausibleDomain.length > 0;

const callPlausible = (eventName: string, options?: PlausibleOptions) => {
  if (!isPlausibleEnabled || typeof window === "undefined") {
    return;
  }
  window.plausible?.(eventName, options);
};

export const trackPageview = (path?: string) => {
  if (path) {
    callPlausible("pageview", { u: path });
    return;
  }
  callPlausible("pageview");
};

export const trackEvent = (
  eventName: string,
  props?: Record<string, PlausibleValue>,
) => {
  if (props && Object.keys(props).length > 0) {
    callPlausible(eventName, { props });
    return;
  }
  callPlausible(eventName);
};
