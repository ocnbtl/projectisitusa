(() => {
  if (window.parent === window || location.origin !== "https://isitusa.com") return;
  if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return;
  const eventNames = new Set([
    "page_view", "county_selected", "catalog_search", "evidence_opened", "source_opened",
    "signup_request_accepted", "sighting_submitted", "volunteer_submitted", "journey_error",
  ]);
  const fieldValues = {
    surface: ["map", "directory", "species", "research", "support", "join", "report", "volunteer"],
    search_kind: ["county_or_zip", "species"],
    outcome: ["found", "empty", "failed"],
    journey: ["email_updates", "sighting", "checkout", "volunteer"],
  };
  const pages = new Set([
    "/", "/species", "/species/profile", "/research", "/about", "/support", "/join",
    "/report", "/volunteer", "/approach", "/data-sources", "/credits", "/observations",
    "/brand", "/privacy", "/terms",
  ]);
  const validReferrer = /^(https:\/\/(?:google\.(?:com|ca|co\.uk|com\.au)|bing\.com|duckduckgo\.com|search\.yahoo\.com|search\.brave\.com|chatgpt\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|facebook\.com|instagram\.com|tiktok\.com|x\.com|reddit\.com)\/|https:\/\/isitusa\.com(?:\/[a-z-]+){0,2}\/?)$/;
  let id = "";
  let defaultAllowed = false;
  let configured = false;
  let referrer = "";
  function gtag() {
    window.dataLayer.push(arguments);
  }
  function enabled(allowDefault) {
    try {
      if (navigator.webdriver || navigator.doNotTrack === "1" || navigator.globalPrivacyControl ||
          localStorage.getItem("isitusa.analytics-exclude.v1") === "yes") return false;
      const saved = localStorage.getItem("isitusa.google-analytics-choice.v1");
      if (saved === "yes" || saved === "no") return saved === "yes";
      const legacyAllOff = localStorage.getItem("isitusa.analytics-choice.site-only.v1") !== "yes" &&
        localStorage.getItem("isitusa.analytics-choice.v1") === "no";
      return allowDefault && !legacyAllOff;
    } catch {
      return false;
    }
  }
  window.addEventListener("message", ({ source, origin, data }) => {
    if (source !== window.parent || origin !== location.origin) return;
    if (data?.type === "isitusa-ga4-start" && !id && /^G-[A-Z0-9]{6,16}$/.test(data.measurementId)) {
      if (!enabled(data.defaultAllowed === true)) return;
      id = data.measurementId;
      defaultAllowed = data.defaultAllowed === true;
      return;
    }
    const event = data?.event;
    if (!id || !enabled(defaultAllowed) || data?.type !== "isitusa-ga4-event" ||
        !eventNames.has(event?.name) || !pages.has(event.page)) return;
    if (!configured && event.name !== "page_view") return;
    const parameters = {
      send_to: id,
      page_location: origin + event.page,
      page_title: typeof event.title === "string" && /^[A-Za-z ]{2,40}$/.test(event.title) ? event.title : "ISITUSA",
    };
    const candidate = event.fields?.page_referrer;
    if (event.name === "page_view") {
      referrer = typeof candidate === "string" && validReferrer.test(candidate) ? candidate : "";
    }
    parameters.page_referrer = referrer;
    for (const [key, values] of Object.entries(fieldValues)) {
      const value = event.fields?.[key];
      if (values.includes(value)) parameters[key] = value;
    }
    if (!configured) {
      window.dataLayer = [];
      gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      gtag("consent", "update", { analytics_storage: "granted" });
      gtag("set", {
        send_page_view: false,
        page_location: parameters.page_location,
        page_title: parameters.page_title,
        page_referrer: referrer,
      });
      gtag("js", new Date());
      gtag("config", id, {
        send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
        cookie_prefix: "isitusa_ga4", cookie_domain: "none", cookie_expires: 5184000, cookie_update: false,
        page_location: parameters.page_location, page_title: parameters.page_title, page_referrer: referrer,
      });
      const tag = document.createElement("script");
      tag.async = true;
      tag.referrerPolicy = "no-referrer";
      tag.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
      document.head.append(tag);
      configured = true;
    }
    if (event.name === "page_view") {
      gtag("set", { page_location: parameters.page_location, page_title: parameters.page_title, page_referrer: referrer });
    }
    gtag("event", event.name, parameters);
  });
})();
