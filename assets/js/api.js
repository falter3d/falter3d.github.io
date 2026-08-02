(() => {
  const config = window.FALTER_PORTFOLIO_CONFIG || {};
  const trimSlash = (value) => String(value || "").replace(/\/+$/, "");
  const apiBase = trimSlash(config.API_BASE_URL);

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) }
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || `Request failed with status ${response.status}`);
    }
    return response.json();
  }

  async function loadFallback() {
    const url = config.FALLBACK_CONTENT_URL || "assets/data/content.json";
    return fetchJson(url, { cache: "no-store" });
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

    if (apiBase) {
      try {
        const live = await fetchJson(`${apiBase}/api/content`, { cache: "no-store" });
        try { localStorage.setItem("falter3d_portfolio_cached", JSON.stringify(live)); } catch (_) {}
        return live;
      } catch (error) {
        console.warn("Live portfolio content is unavailable. Falling back to the bundled copy.", error);
        try {
          const cached = localStorage.getItem("falter3d_portfolio_cached");
          if (cached) return JSON.parse(cached);
        } catch (_) {}
      }
    }

    return loadFallback();
  }

  window.PortfolioAPI = Object.freeze({ apiBase, fetchJson, loadContent, loadFallback });
})();
