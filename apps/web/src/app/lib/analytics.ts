type UmamiValue = string | number | boolean;

type UmamiEventData = Record<string, UmamiValue>;

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, eventData?: UmamiEventData) => void;
    };
  }
}

export const umamiWebsiteId =
  process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim() || "";

export const isUmamiEnabled = umamiWebsiteId.length > 0;

const callUmami = (eventName: string, eventData?: UmamiEventData) => {
  if (!isUmamiEnabled || typeof window === "undefined") {
    return;
  }

  if (typeof window.umami?.track !== "function") {
    console.warn("[umami] window.umami.track is not available", {
      eventName,
      eventData,
    });
    return;
  }

  window.umami.track(eventName, eventData);
};

export const trackPageview = (path?: string) => {
  if (path) {
    callUmami("pageview", { url: path });
    return;
  }
  callUmami("pageview");
};

export const trackEvent = (
  eventName: string,
  props?: Record<string, UmamiValue>,
) => {
  if (props && Object.keys(props).length > 0) {
    callUmami(eventName, props);
    return;
  }
  callUmami(eventName);
};
