(() => {
  "use strict";

  const config = window.FALTER_PORTFOLIO_CONFIG || {};
  const trimSlash = (value) => String(value || "").replace(/\/+$/, "");
  const apiBase = trimSlash(config.API_BASE_URL);
  const buildVersion = String(config.BUILD_VERSION || "20260802-7");
  const REQUEST_TIMEOUT_MS = 6500;

  function contentVersion(content) {
    const value = Number(content?._meta?.contentVersion || content?.contentVersion || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function versionedUrl(url) {
    const separator = String(url).includes("?") ? "&" : "?";
    return `${url}${separator}v=${encodeURIComponent(buildVersion)}`;
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || REQUEST_TIMEOUT_MS));
    let response;
    try {
      response = await fetch(url, {
        ...options,
        signal: options.signal || controller.signal,
        headers: { Accept: "application/json", ...(options.headers || {}) }
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("The request timed out.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || `Request failed with status ${response.status}`);
    }
    return response.json();
  }

  async function loadFallback() {
    const url = config.FALLBACK_CONTENT_URL || "assets/data/content.json";
    return fetchJson(versionedUrl(url), { cache: "no-store", timeoutMs: 4000 });
  }

  async function loadContent() {
    const params = new URLSearchParams(location.search);
    const previewToken = params.get("preview");
    const localPreview = params.get("localPreview");

    if (localPreview === "1") {
      try {
        const stored = localStorage.getItem("falter3d_portfolio_preview");
        if (stored) return JSON.parse(stored);
      } catch (error) {
        console.warn("Local preview could not be loaded", error);
      }
    }

    if (!apiBase && ["localhost", "127.0.0.1"].includes(location.hostname)) {
      try {
        const locallyPublished = localStorage.getItem("falter3d_portfolio_local_published");
        if (locallyPublished) return JSON.parse(locallyPublished);
      } catch (error) {
        console.warn("The locally published copy could not be loaded", error);
      }
    }

    if (apiBase && previewToken) {
      return fetchJson(`${apiBase}/api/preview/${encodeURIComponent(previewToken)}`, { cache: "no-store" });
    }

    let bundled = null;
    try { bundled = await loadFallback(); } catch (error) { console.warn("Bundled portfolio content is unavailable.", error); }

    if (apiBase) {
      try {
        const live = await fetchJson(`${apiBase}/api/content`, { cache: "no-store" });
        const selected = bundled && contentVersion(bundled) > contentVersion(live) ? bundled : live;
        try { localStorage.setItem("falter3d_portfolio_cached", JSON.stringify(selected)); } catch (_) {}
        if (selected === bundled) console.info("Using newer bundled portfolio content while the database catches up.");
        return selected;
      } catch (error) {
        console.warn("Live portfolio content is unavailable. Falling back to a local copy.", error);
        try {
          const cached = localStorage.getItem("falter3d_portfolio_cached");
          if (cached) {
            const parsed = JSON.parse(cached);
            if (!bundled || contentVersion(parsed) >= contentVersion(bundled)) return parsed;
          }
        } catch (_) {}
      }
    }

    if (bundled) return bundled;
    throw new Error("Neither live nor bundled portfolio content could be loaded.");
  }

  window.PortfolioAPI = Object.freeze({ apiBase, fetchJson, loadContent, loadFallback, contentVersion });
})();
