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

export const plausibleScriptSrc =
  process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC?.trim() || "";

export const isPlausibleEnabled = plausibleScriptSrc.length > 0;

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
