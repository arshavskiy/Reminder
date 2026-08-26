declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;

let initialized = false;

function loadScript(src: string) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

export function initAnalytics() {
  if (initialized) return;
  initialized = true;

  if (GA_ID) {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag() {
      window.dataLayer?.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, {send_page_view: false});
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`);
  }

  if (META_PIXEL_ID) {
    const fbq = function fbq(...args: unknown[]) {
      fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args);
    } as Window["fbq"] & {
      callMethod?: (...args: unknown[]) => void;
      loaded?: boolean;
      push?: (...args: unknown[]) => void;
      queue: unknown[];
      version?: string;
    };

    window.fbq = window.fbq ?? fbq;
    window._fbq = window.fbq;
    window.fbq.push = window.fbq;
    window.fbq.loaded = true;
    window.fbq.version = "2.0";
    window.fbq.queue = [];
    window.fbq("init", META_PIXEL_ID);
    loadScript("https://connect.facebook.net/en_US/fbevents.js");
  }
}

export function trackPageView(path: string, title = document.title) {
  initAnalytics();
  const url = `${window.location.origin}${path}`;

  if (GA_ID && window.gtag) {
    window.gtag("event", "page_view", {
      page_location: url,
      page_path: path,
      page_title: title,
    });
  }

  if (META_PIXEL_ID && window.fbq) {
    window.fbq("track", "PageView");
  }
}

export function trackConversion(name: "Lead" | "CompleteRegistration" | "Subscribe" | "Login", params: Record<string, unknown> = {}) {
  initAnalytics();

  if (GA_ID && window.gtag) {
    window.gtag("event", name, params);
  }

  if (META_PIXEL_ID && window.fbq) {
    window.fbq("track", name, params);
  }
}

export {};
