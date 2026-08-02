(() => {
  "use strict";

  window.__FALTER_EDITOR_STARTED = true;
  window.__FALTER_EDITOR_READY = false;

  const config = window.FALTER_PORTFOLIO_CONFIG || {};
  const apiBase = String(config.API_BASE_URL || "").replace(/\/+$/, "");
  const buildVersion = String(config.BUILD_VERSION || "20260802-5");
  const contentVersion = (content) => Number(content?._meta?.contentVersion || content?.contentVersion || 0) || 0;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const slug = (value = "") => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const splitComma = (value = "") => String(value).split(/,|\n/).map((item) => item.trim()).filter(Boolean);
  const splitLines = (value = "") => String(value).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const getSession = () => sessionStorage.getItem("falter3d_admin_session") || "";

  const state = {
    content: null,
    baseline: null,
    dirty: false,
    currentView: "dashboard",
    localMode: new URLSearchParams(location.search).get("local") === "1",
    user: null,
    editor: null,
    pendingConfirm: null,
    uploadTarget: null,
    projectSearch: ""
  };

  function toast(message, error = false) {
    const item = document.createElement("div");
    item.className = `toast${error ? " error" : ""}`;
    item.textContent = message;
    $("#toast-stack").append(item);
    setTimeout(() => item.remove(), 3200);
  }

  function setDirty(value = true) {
    state.dirty = value;
    const wrapper = $(".draft-state");
    wrapper?.classList.toggle("changed", value);
    $("#draft-label").textContent = value ? "Unsaved changes" : "Draft is saved";
  }

  function setByPath(object, path, value) {
    const parts = path.split(".");
    let current = object;
    parts.slice(0, -1).forEach((part) => {
      if (!(part in current)) current[part] = {};
      current = current[part];
    });
    current[parts.at(-1)] = value;
  }

  function getByPath(object, path) {
    return path.split(".").reduce((current, part) => current?.[part], object);
  }

  async function api(path, options = {}) {
    if (!apiBase) throw new Error("The backend is not configured.");
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    const session = getSession();
    if (session) headers.Authorization = `Bearer ${session}`;
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers,
        signal: options.signal || controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("The portfolio backend did not respond within 12 seconds. Refresh the page or check the Worker.");
      }
      throw new Error(`The portfolio backend could not be reached: ${error?.message || error}`);
    } finally {
      clearTimeout(timeout);
    }
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = { message: text }; }
    if (!response.ok) throw new Error(body?.error || body?.message || `Request failed with status ${response.status}`);
    return body;
  }

  function processAuthFragment() {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const session = fragment.get("session");
    if (!session) return;
    sessionStorage.setItem("falter3d_admin_session", session);
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }

  function showAuth({ title, description, actions = [], note = "" }) {
    window.__FALTER_EDITOR_READY = true;
    $("#auth-title").textContent = title;
    $("#auth-description").textContent = description;
    $("#auth-note").textContent = note;
    $("#auth-actions").innerHTML = actions.map((action) => {
      if (action.href) return `<a class="button ${action.kind || "primary"}" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`;
      return `<button class="button ${action.kind || "primary"}" type="button" data-auth-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`;
    }).join("");
    $("#auth-screen").hidden = false;
    $("#admin-app").hidden = true;
  }

  async function loadBundledContent() {
    const response = await fetch(`../assets/data/content.json?v=${encodeURIComponent(buildVersion)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("The bundled portfolio content could not be loaded.");
    return response.json();
  }

  async function startLocalMode() {
    state.localMode = true;
    const stored = localStorage.getItem("falter3d_portfolio_draft");
    state.content = stored ? JSON.parse(stored) : await loadBundledContent();
    state.baseline = clone(state.content);
    state.user = { username: "falter3d", id: config.DISCORD_USER_ID, role: "owner", local: true };
    showApp();
    toast("Local editor mode is active. Nothing is sent to a server.");
  }

  async function authenticate() {
    processAuthFragment();
    if (state.localMode) return startLocalMode();

    if (!apiBase) {
      showAuth({
        title: "The live editor is not connected yet.",
        description: "The portfolio itself is ready. The secure editor needs the included Cloudflare backend to be deployed before Discord login and live publishing can work.",
        actions: [
          { id: "local", label: "Open local editor", kind: "primary" },
          { href: "../", label: "Return to portfolio", kind: "subtle" }
        ],
        note: "Local mode is for editing and previewing this downloaded copy. Run backend/SETUP-WINDOWS.bat later to connect live publishing."
      });
      return;
    }

    if (!getSession()) {
      showAuth({
        title: "Sign in as falter3d.",
        description: "Discord verifies your permanent user ID before the editor loads. Discovering this page does not grant anyone access.",
        actions: [{ href: `${apiBase}/api/auth/login?returnTo=${encodeURIComponent(location.href)}`, label: "Sign in with Discord", kind: "primary" }],
        note: `Owner account: ${config.DISCORD_USER_ID}`
      });
      return;
    }

    try {
      state.user = await api("/api/auth/me");
      const [draft, bundled] = await Promise.all([
        api("/api/admin/draft"),
        loadBundledContent().catch(() => null)
      ]);
      const savedContent = draft.content || null;
      const bundledIsNewer = Boolean(bundled && contentVersion(bundled) > contentVersion(savedContent));
      state.content = bundledIsNewer ? bundled : (savedContent || bundled);
      if (!state.content) throw new Error("No editable portfolio content could be loaded.");
      state.baseline = clone(savedContent || state.content);
      showApp();
      if (bundledIsNewer) {
        setDirty(true);
        toast("A newer site update was loaded from GitHub. Review it, then Publish.");
      }
    } catch (error) {
      sessionStorage.removeItem("falter3d_admin_session");
      showAuth({
        title: "Your editor session expired.",
        description: error.message,
        actions: [{ href: `${apiBase}/api/auth/login?returnTo=${encodeURIComponent(location.href)}`, label: "Sign in again", kind: "primary" }]
      });
    }
  }

  function can(permission) {
    return Boolean(state.user && (state.user.local || state.user.owner || state.user.role === "owner" || state.user.permissions?.includes("*") || state.user.permissions?.includes(permission)));
  }

  function showApp() {
    window.__FALTER_EDITOR_READY = true;
    $("#auth-screen").hidden = true;
    $("#admin-app").hidden = false;
    $("#save-draft").hidden = !can("save_draft");
    $("#preview-draft").hidden = !can("preview");
    $("#publish-draft").hidden = !can("publish");
    const guardedViews = { revisions: "view_revisions", scheduled: "schedule", admins: "manage_admins" };
    Object.entries(guardedViews).forEach(([view, permission]) => {
      const button = $(`[data-view="${view}"]`);
      if (button) button.hidden = !can(permission);
    });
    setDirty(false);
    renderView("dashboard");
  }

  function titlesFor(view) {
    return {
      dashboard: ["Overview", "Dashboard"],
      site: ["Identity", "Site & Hero"],
      projects: ["Portfolio", "Projects"],
      experience: ["Roles", "Experience"],
      content: ["Creator", "YouTube"],
      worked: ["Relationships", "Worked With"],
      skills: ["Capabilities", "Skills"],
      socials: ["Links", "Socials"],
      settings: ["Configuration", "Settings"],
      revisions: ["History", "Revisions"],
      scheduled: ["Automation", "Scheduled Publishing"],
      admins: ["Access", "Administrators"]
    }[view] || ["Editor", view];
  }

  async function renderView(view) {
    const guardedViews = { revisions: "view_revisions", scheduled: "schedule", admins: "manage_admins" };
    if (guardedViews[view] && !can(guardedViews[view])) {
      toast("You do not have permission to open that section.", true);
      view = "dashboard";
    }
    state.currentView = view;
    $$("#sidebar-nav button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    const [kicker, title] = titlesFor(view);
    $("#view-kicker").textContent = kicker;
    $("#view-title").textContent = title;
    const root = $("#admin-content");
    root.innerHTML = `<div class="empty-state">Loading ${escapeHtml(title)}…</div>`;

    const renderers = {
      dashboard: renderDashboard,
      site: renderSite,
      projects: renderProjects,
      experience: renderExperience,
      content: renderContent,
      worked: renderWorked,
      skills: renderSkills,
      socials: renderSocials,
      settings: renderSettings,
      revisions: renderRevisions,
      scheduled: renderScheduled,
      admins: renderAdmins
    };
    await renderers[view]();
    bindCurrentView();
  }

  function viewIntro(title, description, actions = "") {
    return `<div class="view-intro"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>${actions ? `<div class="view-actions">${actions}</div>` : ""}</div>`;
  }

  function renderDashboard() {
    const projects = state.content.projects || [];
    const featured = projects.filter((item) => item.featured && !item.previous).length;
    const previous = projects.filter((item) => item.previous).length;
    const currentRoles = state.content.experience.current.length;
    const videos = state.content.contentCreation.videos.length;
    $("#admin-content").innerHTML = `
      ${viewIntro("Everything in one place", "Edit the portfolio, keep drafts private, preview the exact result, and publish when it is ready.")}
      <div class="grid four">
        <article class="stat-card"><span>Total projects</span><strong>${projects.length}</strong><small>${featured} featured</small></article>
        <article class="stat-card"><span>Previous work</span><strong>${previous}</strong><small>Still public</small></article>
        <article class="stat-card"><span>Current roles</span><strong>${currentRoles}</strong><small>Experience & affiliations</small></article>
        <article class="stat-card"><span>Featured videos</span><strong>${videos}</strong><small>Editable at any time</small></article>
      </div>
      <div class="grid two" style="margin-top:14px">
        <section class="panel">
          <header class="panel-header"><div><h3>Quick actions</h3><p>Jump directly into common changes.</p></div></header>
          <div class="panel-body quick-list">
            <div class="quick-item"><div><strong>Add a project</strong><small>Create active or previous work.</small></div><button data-quick="add-project">Open</button></div>
            <div class="quick-item"><div><strong>Update subscriber count</strong><small>Currently ${escapeHtml(state.content.contentCreation.subscriberDisplay)}.</small></div><button data-quick="content">Open</button></div>
            <div class="quick-item"><div><strong>Change current roles</strong><small>Update affiliations without dates.</small></div><button data-quick="experience">Open</button></div>
            <div class="quick-item"><div><strong>Preview the draft</strong><small>See the public layout before publishing.</small></div><button data-quick="preview">Open</button></div>
            <div class="quick-item"><div><strong>Reload bundled site data</strong><small>Replace this draft with the latest content.json from GitHub.</small></div><button data-quick="reload-bundled">Reload</button></div>
          </div>
        </section>
        <section class="panel">
          <header class="panel-header"><div><h3>Editor status</h3><p>${state.localMode ? "Local preview mode" : "Connected backend"}</p></div></header>
          <div class="panel-body quick-list">
            <div class="quick-item"><div><strong>Signed in as</strong><small>${escapeHtml(state.user?.username || "falter3d")} · ${escapeHtml(state.user?.role || "owner")}</small></div></div>
            <div class="quick-item"><div><strong>Revision limit</strong><small>${Number(state.content.admin?.revisionLimit || state.content.site.revisionLimit || 25)} published versions</small></div></div>
            <div class="quick-item"><div><strong>Public source</strong><small>Secrets remain in Cloudflare, not GitHub.</small></div></div>
            <div class="quick-item"><div><strong>Last draft state</strong><small>${state.dirty ? "Unsaved changes" : "Saved or freshly loaded"}</small></div></div>
          </div>
        </section>
      </div>`;
  }

  function textField(label, path, value, { type = "text", help = "", wide = false, rows = 0 } = {}) {
    const classes = `field${wide ? " wide" : ""}`;
    const input = rows
      ? `<textarea data-bind="${escapeHtml(path)}" rows="${rows}">${escapeHtml(value ?? "")}</textarea>`
      : `<input type="${escapeHtml(type)}" data-bind="${escapeHtml(path)}" value="${escapeHtml(value ?? "")}">`;
    return `<div class="${classes}"><label>${escapeHtml(label)}</label>${input}${help ? `<small>${escapeHtml(help)}</small>` : ""}</div>`;
  }

  function switchField(label, path, checked, help = "") {
    return `<div class="switch-row"><div><strong>${escapeHtml(label)}</strong>${help ? `<small>${escapeHtml(help)}</small>` : ""}</div><label class="switch"><input type="checkbox" data-bind="${escapeHtml(path)}" ${checked ? "checked" : ""}><span></span></label></div>`;
  }

  function renderSite() {
    const c = state.content;
    $("#admin-content").innerHTML = `
      ${viewIntro("Site identity and public text", "Most visible writing is editable here. Project, role, and creator content have their own sections.")}
      <div class="grid two">
        <section class="panel"><header class="panel-header"><div><h3>Browser & sharing</h3><p>Tab title and Discord link preview.</p></div></header><div class="panel-body form-grid">
          ${textField("Browser title", "site.title", c.site.title, { wide: true })}
          ${textField("Sharing description", "site.description", c.site.description, { rows: 4, wide: true })}
          ${textField("Accent color", "site.accent", c.site.accent, { type: "color" })}
          ${textField("Secondary accent", "site.accentSecondary", c.site.accentSecondary, { type: "color" })}
        </div></section>
        <section class="panel"><header class="panel-header"><div><h3>Visual behavior</h3><p>Single-theme portfolio controls.</p></div></header><div class="panel-body grid">
          ${switchField("Loading screen", "site.showLoadingScreen", c.site.showLoadingScreen)}
          ${switchField("Custom cursor", "site.showCursor", c.site.showCursor, "Automatically disabled on touch devices.")}
          ${switchField("Mouse-following glow", "site.showMouseGlow", c.site.showMouseGlow)}
          ${switchField("Discord presence", "site.showDiscordPresence", c.site.showDiscordPresence)}
        </div></section>
      </div>
      <section class="panel" style="margin-top:14px"><header class="panel-header"><div><h3>Hero</h3><p>The first screen visitors see.</p></div></header><div class="panel-body form-grid">
        ${textField("Eyebrow", "hero.eyebrow", c.hero.eyebrow)}
        ${textField("Headline", "hero.headline", c.hero.headline)}
        ${textField("Summary", "hero.summary", c.hero.summary, { rows: 5, wide: true })}
        ${textField("Primary button", "hero.primaryAction.label", c.hero.primaryAction.label)}
        ${textField("Primary target", "hero.primaryAction.target", c.hero.primaryAction.target, { help: "Section ID, such as projects." })}
        ${textField("Secondary button", "hero.secondaryAction.label", c.hero.secondaryAction.label)}
        ${textField("Secondary URL", "hero.secondaryAction.url", c.hero.secondaryAction.url, { type: "url" })}
        ${textField("Availability line", "hero.availability", c.hero.availability, { wide: true })}
      </div></section>
      <section class="panel" style="margin-top:14px"><header class="panel-header"><div><h3>About</h3><p>Direct without turning into a threat.</p></div></header><div class="panel-body form-grid">
        ${textField("Heading", "about.heading", c.about.heading, { wide: true })}
        ${textField("Introduction", "about.intro", c.about.intro, { rows: 5, wide: true })}
        ${textField("Short quote", "about.quote", c.about.quote, { rows: 3, wide: true })}
      </div></section>
      <section class="panel" style="margin-top:14px"><header class="panel-header"><div><h3>Contact section</h3><p>Discord remains the main contact method.</p></div></header><div class="panel-body form-grid">
        ${textField("Heading", "contact.heading", c.contact.heading, { wide: true })}
        ${textField("Description", "contact.description", c.contact.description, { rows: 4, wide: true })}
        ${textField("Discord username", "contact.username", c.contact.username)}
        ${textField("Discord profile URL", "contact.profileUrl", c.contact.profileUrl, { type: "url" })}
        ${textField("Copy button label", "contact.copyLabel", c.contact.copyLabel)}
        ${textField("Profile button label", "contact.openLabel", c.contact.openLabel)}
      </div></section>`;
  }

  function projectListItem(project, index) {
    const status = project.previous ? "Previous Work" : project.featured ? "Featured" : "Active";
    return `<div class="collection-item" draggable="true" data-collection="projects" data-index="${index}">
      <span class="drag-handle">⋮⋮</span>
      <div class="item-main"><strong>${escapeHtml(project.title)}</strong><span>${escapeHtml(project.summary)}</span><div class="item-badges"><i class="mini-badge">${escapeHtml(status)}</i><i class="mini-badge">${escapeHtml(project.category)}</i>${(project.statuses || []).slice(0, 2).map((item) => `<i class="mini-badge">${escapeHtml(item)}</i>`).join("")}</div></div>
      <div class="item-actions"><button data-project-toggle="${index}">${project.previous ? "Make active" : "Move to previous"}</button><button data-edit-project="${index}">Edit</button></div>
    </div>`;
  }

  function renderProjects() {
    const projects = state.content.projects
      .map((project, index) => ({ project, index }))
      .filter(({ project }) => [project.title, project.summary, project.category].join(" ").toLowerCase().includes(state.projectSearch.toLowerCase()));
    $("#admin-content").innerHTML = `
      ${viewIntro("Projects", "Add, reorder, feature, archive, tag, and fully describe every project.", `<button class="button primary" data-add-project>Add project</button>`)}
      <section class="panel">
        <div class="panel-body">
          <div class="collection-toolbar"><input class="search-input" id="admin-project-search" type="search" placeholder="Search projects" value="${escapeHtml(state.projectSearch)}"><span>${projects.length} shown</span></div>
          <div class="collection-list" id="project-admin-list">${projects.length ? projects.map(({ project, index }) => projectListItem(project, index)).join("") : `<div class="empty-state">No projects match your search.</div>`}</div>
        </div>
      </section>`;
  }

  function collectionRow(item, index, kind, subtitle = "") {
    return `<div class="collection-item" draggable="true" data-collection="${escapeHtml(kind)}" data-index="${index}"><span class="drag-handle">⋮⋮</span><div class="item-main"><strong>${escapeHtml(item.name || item.title || `Item ${index + 1}`)}</strong><span>${escapeHtml(subtitle || item.description || "")}</span></div><div class="item-actions"><button data-edit-kind="${escapeHtml(kind)}" data-edit-index="${index}">Edit</button></div></div>`;
  }

  function renderExperience() {
    const exp = state.content.experience;
    $("#admin-content").innerHTML = `
      ${viewIntro("Current and previous roles", "No dates are required. Logos, descriptions, links, and labels remain editable.")}
      <div class="grid two">
        <section class="panel"><header class="panel-header"><div><h3>Current</h3><p>${exp.current.length} entries</p></div><button class="button subtle" data-add-kind="experience-current">Add</button></header><div class="panel-body collection-list">${exp.current.map((item, index) => collectionRow(item, index, "experience-current", `${item.role} · ${item.kind}`)).join("") || `<div class="empty-state">No current roles.</div>`}</div></section>
        <section class="panel"><header class="panel-header"><div><h3>Previous</h3><p>${exp.previous.length} entries</p></div><button class="button subtle" data-add-kind="experience-previous">Add</button></header><div class="panel-body collection-list">${exp.previous.map((item, index) => collectionRow(item, index, "experience-previous", `${item.role} · ${item.kind}`)).join("") || `<div class="empty-state">No previous roles.</div>`}</div></section>
      </div>`;
  }

  function renderContent() {
    const content = state.content.contentCreation;
    $("#admin-content").innerHTML = `
      ${viewIntro("YouTube and editing", "Manage both channels, the displayed subscriber milestone, editing text, and embedded videos.")}
      <section class="panel"><header class="panel-header"><div><h3>Section text</h3><p>Public creator introduction.</p></div></header><div class="panel-body form-grid">
        ${textField("Heading", "contentCreation.heading", content.heading)}
        ${textField("Subscriber display", "contentCreation.subscriberDisplay", content.subscriberDisplay)}
        ${textField("Introduction", "contentCreation.intro", content.intro, { rows: 4, wide: true })}
        ${textField("Editing title", "contentCreation.editorial.title", content.editorial.title)}
        ${textField("Editing tags", "contentCreation.editorial.tags", content.editorial.tags.join(", "), { help: "Separate tags with commas." })}
        ${textField("Editing description", "contentCreation.editorial.description", content.editorial.description, { rows: 4, wide: true })}
      </div></section>
      <div class="grid two" style="margin-top:14px">
        <section class="panel"><header class="panel-header"><div><h3>Channels</h3><p>${content.channels.length} channels</p></div><button class="button subtle" data-add-kind="channel">Add</button></header><div class="panel-body collection-list">${content.channels.map((item, index) => collectionRow(item, index, "channel", `${item.handle} · ${item.badge}`)).join("")}</div></section>
        <section class="panel"><header class="panel-header"><div><h3>Featured videos</h3><p>Paste any YouTube video URL.</p></div><button class="button subtle" data-add-kind="video">Add</button></header><div class="panel-body collection-list">${content.videos.map((item, index) => collectionRow(item, index, "video", item.url)).join("") || `<div class="empty-state">No videos are embedded yet.</div>`}</div></section>
      </div>`;
  }

  function renderWorked() {
    const section = state.content.workedWith;
    $("#admin-content").innerHTML = `
      ${viewIntro("Built For & Worked With", "Manage direct client, creator, studio, and network relationships.", `<button class="button primary" data-add-kind="worked">Add entry</button>`)}
      <section class="panel"><header class="panel-header"><div><h3>Section text</h3><p>Heading and introduction.</p></div></header><div class="panel-body form-grid">${textField("Heading", "workedWith.heading", section.heading)}${textField("Introduction", "workedWith.intro", section.intro, { rows: 3 })}</div></section>
      <section class="panel" style="margin-top:14px"><div class="panel-body collection-list">${section.items.map((item, index) => collectionRow(item, index, "worked", item.type)).join("")}</div></section>`;
  }

  function renderSkills() {
    const section = state.content.skills;
    $("#admin-content").innerHTML = `
      ${viewIntro("Skills and tools", "Use groups instead of arbitrary percentage bars.", `<button class="button primary" data-add-kind="skill">Add group</button>`)}
      <section class="panel"><header class="panel-header"><div><h3>Section text</h3></div></header><div class="panel-body form-grid">${textField("Heading", "skills.heading", section.heading)}${textField("Introduction", "skills.intro", section.intro, { rows: 3 })}</div></section>
      <section class="panel" style="margin-top:14px"><div class="panel-body collection-list">${section.groups.map((item, index) => collectionRow(item, index, "skill", `${item.items.length} skills`)).join("")}</div></section>`;
  }

  function renderSocials() {
    $("#admin-content").innerHTML = `
      ${viewIntro("Public links", "Control the links shown in the footer and direct visitors to the correct accounts.", `<button class="button primary" data-add-kind="social">Add link</button>`)}
      <section class="panel"><div class="panel-body collection-list">${state.content.socials.map((item, index) => collectionRow(item, index, "social", `${item.label} · ${item.url}`)).join("")}</div></section>`;
  }

  function renderSettings() {
    const site = state.content.site;
    const settings = state.content.projectSettings;
    $("#admin-content").innerHTML = `
      ${viewIntro("Advanced configuration", "Reorder sections, create categories and statuses, change retention, and control which sections are public.")}
      <div class="grid two">
        <section class="panel"><header class="panel-header"><div><h3>Section order</h3><p>Drag to reorder the public page.</p></div></header><div class="panel-body collection-list" id="section-order-list">${site.sectionOrder.map((id, index) => `<div class="section-order-item" draggable="true" data-collection="section-order" data-index="${index}"><span class="drag-handle">⋮⋮</span><strong>${escapeHtml(id)}</strong><label class="switch"><input type="checkbox" data-section-visibility="${escapeHtml(id)}" ${site.sectionVisibility[id] !== false ? "checked" : ""}><span></span></label></div>`).join("")}</div></section>
        <section class="panel"><header class="panel-header"><div><h3>Editor settings</h3><p>Applied by the live backend.</p></div></header><div class="panel-body grid">
          <div class="field"><label>Revision limit</label><input type="number" min="1" max="500" data-bind="admin.revisionLimit" value="${Number(state.content.admin?.revisionLimit || 25)}"><small>Default: 25. This remains configurable.</small></div>
          ${switchField("Allow additional administrators", "admin.allowAdditionalAdmins", state.content.admin.allowAdditionalAdmins)}
          ${switchField("Scheduled publishing", "admin.scheduledPublishing", state.content.admin.scheduledPublishing)}
        </div></section>
      </div>
      <div class="grid two" style="margin-top:14px">
        <section class="panel"><header class="panel-header"><div><h3>Project categories</h3><p>Categories are completely configurable.</p></div><button class="button subtle" data-add-kind="category">Add</button></header><div class="panel-body collection-list">${settings.categories.map((item, index) => collectionRow(item, index, "category", item.id)).join("")}</div></section>
        <section class="panel"><header class="panel-header"><div><h3>Project statuses</h3><p>Label and color are editable.</p></div><button class="button subtle" data-add-kind="status">Add</button></header><div class="panel-body collection-list">${settings.statuses.map((item, index) => collectionRow(item, index, "status", `${item.id} · ${item.color}`)).join("")}</div></section>
      </div>
      <section class="panel" style="margin-top:14px"><header class="panel-header"><div><h3>Project tag styles</h3><p>Customize tag labels, colors, and optional symbols or emoji.</p></div><button class="button subtle" data-add-kind="tag-style">Add</button></header><div class="panel-body collection-list">${(settings.tagStyles || []).map((item, index) => collectionRow({ name: item.label, ...item }, index, "tag-style", `${item.icon || "No icon"} · ${item.color}`)).join("") || `<div class="empty-state">No custom tag styles.</div>`}</div></section>
      <section class="panel" style="margin-top:14px"><header class="panel-header"><div><h3>Navigation labels</h3><p>Change link text and targets.</p></div><button class="button subtle" data-add-kind="navigation">Add</button></header><div class="panel-body collection-list">${state.content.navigation.map((item, index) => collectionRow({ name: item.label, ...item }, index, "navigation", `#${item.target}`)).join("")}</div></section>`;
  }

  async function renderRevisions() {
    if (state.localMode || !apiBase) {
      $("#admin-content").innerHTML = `${viewIntro("Published revisions", "The live backend keeps restore points when you publish.")}<div class="backend-required"><strong>Live backend required</strong>Local mode stores drafts and a local published copy, but server-side revision history begins after Cloudflare is connected.</div>`;
      return;
    }
    try {
      const result = await api("/api/admin/revisions");
      $("#admin-content").innerHTML = `${viewIntro("Published revisions", "Preview or restore one of the retained versions.")}<section class="panel"><div class="panel-body collection-list">${result.revisions?.length ? result.revisions.map((item) => `<div class="revision-item"><div><strong>Revision #${item.id}</strong><span>${escapeHtml(new Date(item.createdAt).toLocaleString())} · ${escapeHtml(item.createdByName || item.createdBy || "Unknown")}</span></div><div class="item-actions"><button data-preview-revision="${item.id}">Preview</button><button data-restore-revision="${item.id}">Restore to draft</button></div></div>`).join("") : `<div class="empty-state">No published revisions yet.</div>`}</div></section>`;
    } catch (error) {
      $("#admin-content").innerHTML = `<div class="backend-required"><strong>Could not load revisions</strong>${escapeHtml(error.message)}</div>`;
    }
  }

  async function renderScheduled() {
    if (state.localMode || !apiBase) {
      $("#admin-content").innerHTML = `${viewIntro("Scheduled publishing", "Prepare a snapshot of the current draft and publish it later.")}<div class="backend-required"><strong>Live backend required</strong>Scheduled actions run through the Cloudflare Worker cron trigger.</div>`;
      return;
    }
    try {
      const result = await api("/api/admin/schedules");
      $("#admin-content").innerHTML = `
        ${viewIntro("Scheduled publishing", "Schedule the current draft to publish or a project to move into Previous Work.")}
        <section class="panel"><header class="panel-header"><div><h3>Create schedule</h3><p>Times use your current browser time zone.</p></div></header><div class="panel-body form-grid">
          <div class="field"><label>Action</label><select id="schedule-action"><option value="publish">Publish current draft</option><option value="move-project">Move a project to Previous Work</option></select></div>
          <div class="field"><label>Date and time</label><input type="datetime-local" id="schedule-time"></div>
          <div class="field wide" id="schedule-project-field" hidden><label>Project</label><select id="schedule-project">${state.content.projects.filter((item) => !item.previous).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join("")}</select></div>
          <div class="wide"><button class="button primary" id="create-schedule" type="button">Create schedule</button></div>
        </div></section>
        <section class="panel" style="margin-top:14px"><header class="panel-header"><div><h3>Upcoming</h3><p>${result.schedules?.length || 0} scheduled actions</p></div></header><div class="panel-body collection-list">${result.schedules?.length ? result.schedules.map((item) => `<div class="schedule-item"><div><strong>${escapeHtml(item.actionType)}</strong><span>${escapeHtml(new Date(item.runAt).toLocaleString())} · ${escapeHtml(item.status)}</span></div><div class="item-actions"><button data-delete-schedule="${item.id}">Cancel</button></div></div>`).join("") : `<div class="empty-state">Nothing is scheduled.</div>`}</div></section>`;
    } catch (error) {
      $("#admin-content").innerHTML = `<div class="backend-required"><strong>Could not load scheduled actions</strong>${escapeHtml(error.message)}</div>`;
    }
  }

  async function renderAdmins() {
    if (state.localMode || !apiBase) {
      $("#admin-content").innerHTML = `${viewIntro("Administrators", "You remain the owner and can add other Discord accounts with selected permissions.")}<div class="backend-required"><strong>Live backend required</strong>Administrator access is stored securely in D1 after the backend is connected.</div>`;
      return;
    }
    try {
      const result = await api("/api/admin/admins");
      $("#admin-content").innerHTML = `
        ${viewIntro("Administrators", "Add Discord user IDs and choose their content, publishing, media, history, scheduling, and access permissions.", `<button class="button primary" id="add-admin">Add administrator</button>`)}
        <section class="panel"><div class="panel-body collection-list">${result.admins.map((item) => `<div class="admin-item"><div><strong>${escapeHtml(item.displayName || item.discordId)} ${item.discordId === state.content.admin.ownerDiscordId ? "· Owner" : ""}</strong><span>${escapeHtml(item.discordId)} · ${escapeHtml(item.role)}</span><div class="permissions">${(item.permissions || []).map((permission) => `<i>${escapeHtml(permission)}</i>`).join("")}</div></div>${item.discordId !== state.content.admin.ownerDiscordId ? `<div class="item-actions"><button data-remove-admin="${escapeHtml(item.discordId)}">Remove</button></div>` : ""}</div>`).join("")}</div></section>`;
    } catch (error) {
      $("#admin-content").innerHTML = `<div class="backend-required"><strong>Could not load administrators</strong>${escapeHtml(error.message)}</div>`;
    }
  }

  function bindCurrentView() {
    $$('[data-bind]').forEach((input) => {
      const listener = () => {
        let value = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
        if (input.dataset.bind === "contentCreation.editorial.tags") value = splitComma(value);
        setByPath(state.content, input.dataset.bind, value);
        setDirty();
      };
      input.addEventListener(input.type === "checkbox" ? "change" : "input", listener);
    });

    $$('[data-section-visibility]').forEach((input) => input.addEventListener("change", () => {
      state.content.site.sectionVisibility[input.dataset.sectionVisibility] = input.checked;
      setDirty();
    }));

    $$('[data-quick]').forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.quick;
      if (action === "add-project") { renderView("projects").then(() => openProjectEditor(-1)); return; }
      if (action === "preview") { previewDraft(); return; }
      if (action === "reload-bundled") {
        confirmAction("Reload bundled site data?", "This replaces the current editor draft with the latest content.json from GitHub. Nothing goes public until you press Publish.", async () => {
          try {
            state.content = await loadBundledContent();
            state.baseline = clone(state.content);
            setDirty(true);
            await renderView("dashboard");
            toast("Bundled site data loaded. Review it, then Save Draft or Publish.");
          } catch (error) { toast(error.message, true); }
        });
        return;
      }
      renderView(action);
    }));

    $("[data-add-project]")?.addEventListener("click", () => openProjectEditor(-1));
    $("#admin-project-search")?.addEventListener("input", (event) => { state.projectSearch = event.target.value; renderProjects(); bindCurrentView(); });
    $$('[data-edit-project]').forEach((button) => button.addEventListener("click", () => openProjectEditor(Number(button.dataset.editProject))));
    $$('[data-project-toggle]').forEach((button) => button.addEventListener("click", () => toggleProjectPrevious(Number(button.dataset.projectToggle))));

    $$('[data-add-kind]').forEach((button) => button.addEventListener("click", () => openGenericEditor(button.dataset.addKind, -1)));
    $$('[data-edit-kind]').forEach((button) => button.addEventListener("click", () => openGenericEditor(button.dataset.editKind, Number(button.dataset.editIndex))));

    setupDragAndDrop();

    $$('[data-preview-revision]').forEach((button) => button.addEventListener("click", () => previewRevision(Number(button.dataset.previewRevision))));
    $$('[data-restore-revision]').forEach((button) => button.addEventListener("click", () => restoreRevision(Number(button.dataset.restoreRevision))));
    $$('[data-delete-schedule]').forEach((button) => button.addEventListener("click", () => deleteSchedule(Number(button.dataset.deleteSchedule))));
    $$('[data-remove-admin]').forEach((button) => button.addEventListener("click", () => removeAdmin(button.dataset.removeAdmin)));
    $("#add-admin")?.addEventListener("click", openAdminEditor);
    $("#schedule-action")?.addEventListener("change", (event) => $("#schedule-project-field").hidden = event.target.value !== "move-project");
    $("#create-schedule")?.addEventListener("click", createSchedule);
  }

  function setupDragAndDrop() {
    let source = null;
    $$('[draggable="true"][data-collection]').forEach((item) => {
      item.addEventListener("dragstart", () => { source = { collection: item.dataset.collection, index: Number(item.dataset.index) }; item.classList.add("dragging"); });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
      item.addEventListener("dragover", (event) => event.preventDefault());
      item.addEventListener("drop", (event) => {
        event.preventDefault();
        const target = { collection: item.dataset.collection, index: Number(item.dataset.index) };
        if (!source || source.collection !== target.collection || source.index === target.index) return;
        reorderCollection(source.collection, source.index, target.index);
      });
    });
  }

  function resolveCollection(kind) {
    const map = {
      projects: state.content.projects,
      "experience-current": state.content.experience.current,
      "experience-previous": state.content.experience.previous,
      channel: state.content.contentCreation.channels,
      video: state.content.contentCreation.videos,
      worked: state.content.workedWith.items,
      skill: state.content.skills.groups,
      social: state.content.socials,
      category: state.content.projectSettings.categories,
      status: state.content.projectSettings.statuses,
      "tag-style": state.content.projectSettings.tagStyles || (state.content.projectSettings.tagStyles = []),
      navigation: state.content.navigation,
      "section-order": state.content.site.sectionOrder
    };
    return map[kind];
  }

  function reorderCollection(kind, from, to) {
    const collection = resolveCollection(kind);
    if (!collection) return;
    const [item] = collection.splice(from, 1);
    collection.splice(to, 0, item);
    if (kind === "projects") collection.forEach((project, index) => project.order = index + 1);
    setDirty();
    renderView(state.currentView);
  }

  function toggleProjectPrevious(index) {
    const project = state.content.projects[index];
    project.previous = !project.previous;
    if (project.previous) {
      project.featured = false;
      if (!project.statuses.includes("previous")) project.statuses.push("previous");
    } else {
      project.statuses = project.statuses.filter((item) => item !== "previous");
    }
    setDirty();
    renderProjects(); bindCurrentView();
  }

  function fieldHtml(label, name, value = "", options = {}) {
    const type = options.type || "text";
    const wide = options.wide ? " wide" : "";
    if (type === "textarea") return `<div class="field${wide}"><label>${escapeHtml(label)}</label><textarea name="${escapeHtml(name)}" rows="${options.rows || 4}">${escapeHtml(value)}</textarea>${options.help ? `<small>${escapeHtml(options.help)}</small>` : ""}</div>`;
    if (type === "select") return `<div class="field${wide}"><label>${escapeHtml(label)}</label><select name="${escapeHtml(name)}">${options.options.map((item) => `<option value="${escapeHtml(item.value)}" ${String(item.value) === String(value) ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select></div>`;
    if (type === "checkbox") return `<div class="switch-row${wide}"><div><strong>${escapeHtml(label)}</strong>${options.help ? `<small>${escapeHtml(options.help)}</small>` : ""}</div><label class="switch"><input type="checkbox" name="${escapeHtml(name)}" ${value ? "checked" : ""}><span></span></label></div>`;
    if (type === "image") return `<div class="field${wide}"><label>${escapeHtml(label)}</label><div class="image-field"><input type="text" name="${escapeHtml(name)}" value="${escapeHtml(value)}"><button class="button subtle" type="button" data-upload-field="${escapeHtml(name)}">Upload</button></div>${value ? `<img class="image-preview" data-preview-for="${escapeHtml(name)}" src="${escapeHtml(value)}" alt="">` : `<img class="image-preview" data-preview-for="${escapeHtml(name)}" alt="" hidden>`}</div>`;
    return `<div class="field${wide}"><label>${escapeHtml(label)}</label><input type="${escapeHtml(type)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${options.min !== undefined ? `min="${options.min}"` : ""}>${options.help ? `<small>${escapeHtml(options.help)}</small>` : ""}</div>`;
  }

  function nestedRows(kind, rows = []) {
    const definitions = {
      links: { className: "four", fields: [["label","Label"],["url","URL"],["placement","Placement","select",["modal","card","both","hidden"]]] },
      metrics: { className: "", fields: [["label","Label"],["value","Value"]] },
      gallery: { className: "gallery", fields: [["url","Image URL"],["caption","Caption"]] }
    };
    const def = definitions[kind];
    return `<div class="nested-list" data-nested="${kind}">${rows.map((row, index) => `<div class="nested-row ${def.className}" data-nested-row="${index}">${def.fields.map(([key, placeholder, type, values]) => type === "select" ? `<select data-key="${key}">${values.map((value) => `<option value="${value}" ${row[key] === value ? "selected" : ""}>${value}</option>`).join("")}</select>` : `<input type="text" data-key="${key}" placeholder="${placeholder}" value="${escapeHtml(row[key] || "")}">`).join("")}${kind === "gallery" ? `<button class="nested-upload" type="button" data-upload-gallery title="Upload image">↑</button>` : ""}<button type="button" data-remove-nested title="Remove">×</button></div>`).join("")}</div><button class="button subtle add-nested" type="button" data-add-nested="${kind}">Add ${kind === "gallery" ? "image" : kind.slice(0, -1)}</button>`;
  }

  function readNested(kind) {
    return $$(`[data-nested="${kind}"] [data-nested-row]`).map((row) => {
      const object = {};
      $$('[data-key]', row).forEach((input) => object[input.dataset.key] = input.value.trim());
      return object;
    }).filter((row) => Object.values(row).some(Boolean));
  }

  function openProjectEditor(index) {
    const existing = index >= 0 ? state.content.projects[index] : null;
    const project = clone(existing || {
      id: "", title: "", category: state.content.projectSettings.categories[0]?.id || "platforms", featured: false, previous: false,
      order: state.content.projects.length + 1, summary: "", details: "", statuses: ["in-development","private"], tags: [], tech: [], features: [],
      image: "assets/images/projects/platform.svg", imageMode: "cover", links: [], developedFor: { name: "", type: "", logo: "" }, metrics: [], gallery: []
    });
    state.editor = { type: "project", index, object: project };
    $("#dialog-kicker").textContent = existing ? "Project" : "New project";
    $("#dialog-title").textContent = existing ? `Edit ${project.title}` : "Add project";
    $("#dialog-delete").hidden = index < 0;
    $("#dialog-delete").textContent = project.previous ? "Delete permanently" : "Move to Previous Work";
    $("#dialog-body").innerHTML = `
      <section class="form-section"><h3>Core details</h3><div class="form-grid">
        ${fieldHtml("Title", "title", project.title)}
        ${fieldHtml("Project ID", "id", project.id, { help: "Generated from the title when left empty." })}
        ${fieldHtml("Category", "category", project.category, { type: "select", options: state.content.projectSettings.categories.map((item) => ({ value: item.id, label: item.label })) })}
        ${fieldHtml("Order", "order", project.order, { type: "number", min: 1 })}
        ${fieldHtml("Summary", "summary", project.summary, { type: "textarea", rows: 4, wide: true })}
        ${fieldHtml("Full description", "details", project.details, { type: "textarea", rows: 6, wide: true })}
        ${fieldHtml("Featured project", "featured", project.featured, { type: "checkbox" })}
        ${fieldHtml("Previous Work", "previous", project.previous, { type: "checkbox" })}
      </div></section>
      <section class="form-section"><h3>Status and stack</h3><div class="checkbox-grid">${state.content.projectSettings.statuses.map((status) => `<label class="checkbox-card"><input type="checkbox" name="status:${escapeHtml(status.id)}" ${project.statuses.includes(status.id) ? "checked" : ""}>${escapeHtml(status.label)}</label>`).join("")}</div><div class="form-grid" style="margin-top:14px">${fieldHtml("Tags", "tags", project.tags.join(", "), { help: "Separate with commas." })}${fieldHtml("Technology stack", "tech", project.tech.join(", "), { help: "Separate with commas." })}${fieldHtml("Features", "features", project.features.join("\n"), { type: "textarea", rows: 7, wide: true, help: "One feature per line." })}</div></section>
      <section class="form-section"><h3>Visuals</h3><div class="form-grid">${fieldHtml("Cover image", "image", project.image, { type: "image", wide: true })}${fieldHtml("Image mode", "imageMode", project.imageMode, { type: "select", options: [{value:"cover",label:"Cover"},{value:"logo",label:"Contained logo"}] })}</div><h3 style="margin-top:20px">Gallery</h3>${nestedRows("gallery", project.gallery)}</section>
      <section class="form-section"><h3>Project relationship</h3><div class="form-grid">${fieldHtml("Developed for", "developedForName", project.developedFor?.name || "")}${fieldHtml("Relationship type", "developedForType", project.developedFor?.type || "")}${fieldHtml("Relationship logo", "developedForLogo", project.developedFor?.logo || "", { type: "image", wide: true })}</div></section>
      <section class="form-section"><h3>Links</h3>${nestedRows("links", project.links)}</section>
      <section class="form-section"><h3>Scale indicators</h3>${nestedRows("metrics", project.metrics)}</section>`;
    wireEditorDialog();
    $("#editor-dialog").showModal();
  }

  const genericDefinitions = {
    "experience-current": { title: "Current role", collection: () => state.content.experience.current, fields: [
      ["Organization","name"],["Role","role"],["Description","description","textarea"],["Type","kind"],["Initials","initials"],["Logo","logo","image"],["Logo fit","logoMode","select",[{value:"cover",label:"Cover / avatar"},{value:"contain",label:"Contained logo"}]],["Link","url","url"]
    ]},
    "experience-previous": { title: "Previous role", collection: () => state.content.experience.previous, fields: [
      ["Organization","name"],["Role","role"],["Description","description","textarea"],["Type","kind"],["Initials","initials"],["Logo","logo","image"],["Logo fit","logoMode","select",[{value:"cover",label:"Cover / avatar"},{value:"contain",label:"Contained logo"}]],["Link","url","url"]
    ]},
    channel: { title: "YouTube channel", collection: () => state.content.contentCreation.channels, fields: [
      ["Channel name","name"],["Handle","handle"],["Description","description","textarea"],["URL","url","url"],["Badge","badge"],["Subscriber display","subscribers"],["Image","image","image"]
    ]},
    video: { title: "Featured video", collection: () => state.content.contentCreation.videos, fields: [["Title","title"],["YouTube URL","url","url"],["Description","description","textarea"]]},
    worked: { title: "Worked With entry", collection: () => state.content.workedWith.items, fields: [["Name","name"],["Type","type"],["Description","description","textarea"],["Initials","initials"],["Logo","logo","image"],["Logo fit","logoMode","select",[{value:"cover",label:"Cover / avatar"},{value:"contain",label:"Contained logo"}]],["Link","url","url"]]},
    skill: { title: "Skill group", collection: () => state.content.skills.groups, fields: [["Group name","name"],["Skills","items","items"]]},
    social: { title: "Social link", collection: () => state.content.socials, fields: [["Platform","name"],["Displayed label","label"],["URL","url","url"]]},
    category: { title: "Project category", collection: () => state.content.projectSettings.categories, fields: [["ID","id"],["Label","label"]]},
    status: { title: "Project status", collection: () => state.content.projectSettings.statuses, fields: [["ID","id"],["Label","label"],["Color","color","color"]]},
    "tag-style": { title: "Project tag style", collection: () => state.content.projectSettings.tagStyles || (state.content.projectSettings.tagStyles = []), fields: [["Tag label","label"],["Color","color","color"],["Icon or emoji","icon"]]},
    navigation: { title: "Navigation link", collection: () => state.content.navigation, fields: [["Label","label"],["Target section","target"]]}
  };

  function defaultForKind(kind) {
    return {
      "experience-current": { name:"", role:"", description:"", logo:"", logoMode:"cover", initials:"", url:"", kind:"Creator" },
      "experience-previous": { name:"", role:"", description:"", logo:"", logoMode:"cover", initials:"", url:"", kind:"Previous" },
      channel: { name:"", handle:"", description:"", url:"", badge:"Channel", subscribers:"", image:"assets/images/profile.webp" },
      video: { title:"", url:"", description:"" },
      worked: { name:"", type:"", description:"", logo:"", logoMode:"cover", initials:"", url:"" },
      skill: { name:"", items:[] },
      social: { name:"", label:"", url:"" },
      category: { id:"", label:"" },
      status: { id:"", label:"", color:"#6fc1ff" },
      "tag-style": { label:"", color:"#6fc1ff", icon:"" },
      navigation: { label:"", target:"" }
    }[kind];
  }

  function openGenericEditor(kind, index) {
    const def = genericDefinitions[kind];
    if (!def) return;
    const collection = def.collection();
    const object = clone(index >= 0 ? collection[index] : defaultForKind(kind));
    state.editor = { type: "generic", kind, index, object };
    $("#dialog-kicker").textContent = index >= 0 ? "Edit entry" : "New entry";
    $("#dialog-title").textContent = def.title;
    $("#dialog-delete").hidden = index < 0;
    $("#dialog-delete").textContent = "Delete entry";
    $("#dialog-body").innerHTML = `<section class="form-section"><div class="form-grid">${def.fields.map(([label, name, type, options]) => {
      const value = object[name];
      if (type === "textarea") return fieldHtml(label, name, value, { type: "textarea", rows: 5, wide: true });
      if (type === "image") return fieldHtml(label, name, value, { type: "image", wide: true });
      if (type === "items") return fieldHtml(label, name, (value || []).join("\n"), { type: "textarea", rows: 8, wide: true, help: "One item per line or separated with commas." });
      if (type === "select") return fieldHtml(label, name, value || options?.[0]?.value || "", { type: "select", options: options || [] });
      return fieldHtml(label, name, value, { type: type || "text", wide: ["url"].includes(type) });
    }).join("")}</div></section>`;
    wireEditorDialog();
    $("#editor-dialog").showModal();
  }

  function wireEditorDialog() {
    $$('[data-add-nested]', $("#dialog-body")).forEach((button) => button.addEventListener("click", () => addNestedRow(button.dataset.addNested)));
    $$('[data-remove-nested]', $("#dialog-body")).forEach((button) => button.addEventListener("click", () => button.closest("[data-nested-row]").remove()));
    $$('[data-upload-field]', $("#dialog-body")).forEach((button) => button.addEventListener("click", () => {
      const field = button.dataset.uploadField;
      state.uploadTarget = { input: $(`[name="${field}"]`, $("#dialog-body")), previewField: field };
      $("#image-upload-input").click();
    }));
    $$('[data-upload-gallery]', $("#dialog-body")).forEach((button) => button.addEventListener("click", () => {
      state.uploadTarget = { input: $('[data-key="url"]', button.closest('[data-nested-row]')), previewField: "" };
      $("#image-upload-input").click();
    }));
    $$('input[name="image"], input[name="logo"]', $("#dialog-body")).forEach((input) => input.addEventListener("input", () => updateImagePreview(input.name, input.value)));
  }

  function addNestedRow(kind) {
    const container = $(`[data-nested="${kind}"]`);
    const index = container.children.length;
    const blank = kind === "links" ? {label:"",url:"",placement:"modal"} : kind === "metrics" ? {label:"",value:""} : {url:"",caption:""};
    const wrapper = document.createElement("div");
    const def = {
      links: `<div class="nested-row four" data-nested-row="${index}"><input data-key="label" placeholder="Label"><input data-key="url" placeholder="URL"><select data-key="placement"><option>modal</option><option>card</option><option>both</option><option>hidden</option></select><button type="button" data-remove-nested>×</button></div>`,
      metrics: `<div class="nested-row" data-nested-row="${index}"><input data-key="label" placeholder="Label"><input data-key="value" placeholder="Value"><button type="button" data-remove-nested>×</button></div>`,
      gallery: `<div class="nested-row gallery" data-nested-row="${index}"><input data-key="url" placeholder="Image URL"><input data-key="caption" placeholder="Caption"><button class="nested-upload" type="button" data-upload-gallery title="Upload image">↑</button><button type="button" data-remove-nested title="Remove">×</button></div>`
    }[kind];
    wrapper.innerHTML = def;
    const row = wrapper.firstElementChild;
    container.append(row);
    $("[data-remove-nested]", row).addEventListener("click", () => row.remove());
    const uploadButton = $("[data-upload-gallery]", row);
    if (uploadButton) uploadButton.addEventListener("click", () => {
      state.uploadTarget = { input: $('[data-key="url"]', row), previewField: "" };
      $("#image-upload-input").click();
    });
  }

  function updateImagePreview(field, value) {
    const preview = $(`[data-preview-for="${field}"]`, $("#dialog-body"));
    if (!preview) return;
    preview.src = value;
    preview.hidden = !value;
  }

  async function uploadImage(file) {
    if (!file) return;
    const target = state.uploadTarget;
    const input = target?.input;
    if (!input) return;
    try {
      let url;
      if (state.localMode || !apiBase) {
        url = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      } else {
        const form = new FormData();
        form.append("file", file);
        const result = await api("/api/admin/uploads", { method: "POST", body: form });
        url = result.url;
      }
      input.value = url;
      if (target.previewField) updateImagePreview(target.previewField, url);
      toast(state.localMode || !apiBase ? "Image added to this local draft." : "Image committed to GitHub. It may take a moment to appear everywhere.");
    } catch (error) { toast(error.message, true); }
    finally { $("#image-upload-input").value = ""; state.uploadTarget = null; }
  }

  function saveEditor(event) {
    event.preventDefault();
    if (!state.editor) return;
    const form = new FormData($("#editor-form"));
    if (state.editor.type === "project") {
      const project = state.editor.object;
      project.title = String(form.get("title") || "").trim();
      project.id = String(form.get("id") || "").trim() || slug(project.title);
      project.category = String(form.get("category") || "");
      project.order = Number(form.get("order") || state.content.projects.length + 1);
      project.summary = String(form.get("summary") || "").trim();
      project.details = String(form.get("details") || "").trim();
      project.featured = form.get("featured") === "on";
      project.previous = form.get("previous") === "on";
      if (project.previous) project.featured = false;
      project.statuses = state.content.projectSettings.statuses.filter((status) => form.get(`status:${status.id}`) === "on").map((status) => status.id);
      if (project.previous && !project.statuses.includes("previous")) project.statuses.push("previous");
      project.tags = splitComma(form.get("tags"));
      project.tech = splitComma(form.get("tech"));
      project.features = splitLines(form.get("features"));
      project.image = String(form.get("image") || "").trim();
      project.imageMode = String(form.get("imageMode") || "cover");
      project.developedFor = { name: String(form.get("developedForName") || "").trim(), type: String(form.get("developedForType") || "").trim(), logo: String(form.get("developedForLogo") || "").trim() };
      project.links = readNested("links");
      project.metrics = readNested("metrics");
      project.gallery = readNested("gallery");
      if (!project.title) return toast("A project title is required.", true);
      if (state.editor.index >= 0) state.content.projects[state.editor.index] = project;
      else state.content.projects.push(project);
    } else {
      const { kind, index, object } = state.editor;
      const def = genericDefinitions[kind];
      def.fields.forEach(([, name, type]) => {
        const raw = String(form.get(name) || "").trim();
        object[name] = type === "items" ? splitComma(raw) : raw;
      });
      if ((object.name !== undefined && !object.name) || (object.label !== undefined && !object.label && kind !== "social")) return toast("The main name or label is required.", true);
      if (["category","status"].includes(kind) && !object.id) object.id = slug(object.label);
      const collection = def.collection();
      if (index >= 0) collection[index] = object;
      else collection.push(object);
    }
    setDirty();
    $("#editor-dialog").close();
    renderView(state.currentView);
  }

  function requestDeleteEditor() {
    const editor = state.editor;
    if (!editor || editor.index < 0) return;
    if (editor.type === "project") {
      const project = state.content.projects[editor.index];
      if (!project.previous) {
        project.previous = true;
        project.featured = false;
        if (!project.statuses.includes("previous")) project.statuses.push("previous");
        setDirty();
        $("#editor-dialog").close();
        renderView("projects");
        toast(`${project.title} moved to Previous Work.`);
        return;
      }
      confirmAction("Delete project permanently?", `${project.title} will be removed from the editor and public site.`, () => {
        state.content.projects.splice(editor.index, 1); setDirty(); $("#editor-dialog").close(); renderView("projects");
      });
      return;
    }
    const def = genericDefinitions[editor.kind];
    confirmAction("Delete this entry?", "This removes it from the draft. You can cancel before publishing by reloading the saved draft.", () => {
      def.collection().splice(editor.index, 1); setDirty(); $("#editor-dialog").close(); renderView(state.currentView);
    });
  }

  function confirmAction(title, message, callback) {
    state.pendingConfirm = callback;
    $("#confirm-title").textContent = title;
    $("#confirm-message").textContent = message;
    $("#confirm-dialog").showModal();
  }

  function stampContentVersion() {
    state.content._meta = {
      ...(state.content._meta || {}),
      contentVersion: Date.now(),
      build: buildVersion,
      updatedAt: new Date().toISOString()
    };
  }

  async function saveDraft() {
    try {
      stampContentVersion();
      if (state.localMode || !apiBase) localStorage.setItem("falter3d_portfolio_draft", JSON.stringify(state.content));
      else await api("/api/admin/draft", { method: "PUT", body: { content: state.content } });
      state.baseline = clone(state.content);
      setDirty(false);
      toast("Draft saved.");
    } catch (error) { toast(error.message, true); }
  }

  async function previewDraft() {
    try {
      let url;
      if (state.localMode || !apiBase) {
        localStorage.setItem("falter3d_portfolio_preview", JSON.stringify(state.content));
        url = new URL("../?localPreview=1", location.href).href;
      } else {
        const result = await api("/api/admin/preview", { method: "POST", body: { content: state.content } });
        url = new URL(`../?preview=${encodeURIComponent(result.token)}`, location.href).href;
      }
      open(url, "_blank", "noopener");
    } catch (error) { toast(error.message, true); }
  }

  async function publishDraft() {
    try {
      stampContentVersion();
      if (state.localMode || !apiBase) {
        localStorage.setItem("falter3d_portfolio_local_published", JSON.stringify(state.content));
        localStorage.setItem("falter3d_portfolio_draft", JSON.stringify(state.content));
        toast("Published to this browser's local preview copy.");
      } else {
        await api("/api/admin/publish", { method: "POST", body: { content: state.content, note: "Published from the site editor" } });
        toast("Portfolio published.");
      }
      state.baseline = clone(state.content);
      setDirty(false);
    } catch (error) { toast(error.message, true); }
  }

  async function previewRevision(id) {
    try {
      const result = await api(`/api/admin/revisions/${id}/preview`, { method: "POST" });
      open(new URL(`../?preview=${encodeURIComponent(result.token)}`, location.href).href, "_blank", "noopener");
    } catch (error) { toast(error.message, true); }
  }

  async function restoreRevision(id) {
    confirmAction("Restore this revision to the draft?", "The public site will not change until you publish it again.", async () => {
      try {
        const result = await api(`/api/admin/revisions/${id}/restore`, { method: "POST" });
        state.content = result.content;
        setDirty(true);
        renderView("dashboard");
        toast("Revision restored to the current draft.");
      } catch (error) { toast(error.message, true); }
    });
  }

  async function createSchedule() {
    const actionType = $("#schedule-action").value;
    const time = $("#schedule-time").value;
    if (!time) return toast("Choose a date and time.", true);
    const payload = actionType === "publish" ? { content: state.content } : { projectId: $("#schedule-project").value };
    try {
      await api("/api/admin/schedules", { method: "POST", body: { actionType, runAt: new Date(time).toISOString(), payload } });
      toast("Scheduled action created.");
      renderView("scheduled");
    } catch (error) { toast(error.message, true); }
  }

  function deleteSchedule(id) {
    confirmAction("Cancel this scheduled action?", "It will not run after cancellation.", async () => {
      try { await api(`/api/admin/schedules/${id}`, { method: "DELETE" }); toast("Scheduled action canceled."); renderView("scheduled"); }
      catch (error) { toast(error.message, true); }
    });
  }

  function openAdminEditor() {
    state.editor = { type: "admin" };
    $("#dialog-kicker").textContent = "Access";
    $("#dialog-title").textContent = "Add administrator";
    $("#dialog-delete").hidden = true;
    const permissions = ["edit_content","save_draft","preview","publish","schedule","manage_media","view_revisions","restore_revisions","manage_admins"];
    $("#dialog-body").innerHTML = `<section class="form-section"><div class="form-grid">${fieldHtml("Discord user ID", "discordId", "", { wide: true })}${fieldHtml("Display name", "displayName", "", { wide: true })}</div><h3 style="margin-top:18px">Permissions</h3><div class="checkbox-grid">${permissions.map((permission) => `<label class="checkbox-card"><input type="checkbox" name="permission:${permission}" ${permission === "edit_content" ? "checked" : ""}>${escapeHtml(permission.replaceAll("_", " "))}</label>`).join("")}</div></section>`;
    $("#editor-dialog").showModal();
  }

  async function saveAdminEditor(event) {
    event.preventDefault();
    const form = new FormData($("#editor-form"));
    const discordId = String(form.get("discordId") || "").trim();
    if (!/^\d{15,22}$/.test(discordId)) return toast("Enter a valid Discord user ID.", true);
    const permissions = $$('input[name^="permission:"]:checked', $("#dialog-body")).map((input) => input.name.split(":")[1]);
    try {
      await api("/api/admin/admins", { method: "POST", body: { discordId, displayName: String(form.get("displayName") || "").trim(), role: "admin", permissions } });
      $("#editor-dialog").close(); toast("Administrator added."); renderView("admins");
    } catch (error) { toast(error.message, true); }
  }

  function removeAdmin(discordId) {
    confirmAction("Remove this administrator?", "Their active sessions will be revoked.", async () => {
      try { await api(`/api/admin/admins/${encodeURIComponent(discordId)}`, { method: "DELETE" }); toast("Administrator removed."); renderView("admins"); }
      catch (error) { toast(error.message, true); }
    });
  }

  async function logout() {
    try { if (apiBase && getSession()) await api("/api/auth/logout", { method: "POST" }); } catch (_) {}
    sessionStorage.removeItem("falter3d_admin_session");
    location.href = "../";
  }

  function attachGlobalEvents() {
    $("#sidebar-nav").addEventListener("click", (event) => {
      const button = event.target.closest("[data-view]");
      if (!button) return;
      renderView(button.dataset.view);
      $("#sidebar").classList.remove("open");
    });
    $("#save-draft").addEventListener("click", saveDraft);
    $("#preview-draft").addEventListener("click", previewDraft);
    $("#publish-draft").addEventListener("click", publishDraft);
    $("#logout-button").addEventListener("click", logout);
    $("#mobile-sidebar-button").addEventListener("click", () => $("#sidebar").classList.add("open"));
    $("#sidebar-close").addEventListener("click", () => $("#sidebar").classList.remove("open"));
    $("#editor-form").addEventListener("submit", (event) => state.editor?.type === "admin" ? saveAdminEditor(event) : saveEditor(event));
    $("#dialog-delete").addEventListener("click", requestDeleteEditor);
    $("#confirm-accept").addEventListener("click", () => { const callback = state.pendingConfirm; state.pendingConfirm = null; if (callback) setTimeout(callback, 0); });
    $("#image-upload-input").addEventListener("change", (event) => uploadImage(event.target.files[0]));
    $("#auth-actions").addEventListener("click", (event) => {
      if (event.target.closest('[data-auth-action="local"]')) location.href = `${location.pathname}?local=1`;
    });
    addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function initializeEditor() {
    try {
      attachGlobalEvents();
      authenticate().catch((error) => showAuth({
        title: "The editor could not load.",
        description: error.message,
        actions: [
          { href: location.pathname, label: "Try again", kind: "primary" },
          { href: "../", label: "Return to portfolio", kind: "subtle" }
        ]
      }));
    } catch (error) {
      console.error("Editor startup failed", error);
      showAuth({
        title: "The editor could not start.",
        description: error?.message || String(error),
        actions: [
          { href: location.pathname, label: "Try again", kind: "primary" },
          { href: "../", label: "Return to portfolio", kind: "subtle" }
        ]
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeEditor, { once: true });
  } else {
    initializeEditor();
  }
})();
