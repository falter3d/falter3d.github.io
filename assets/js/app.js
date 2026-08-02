(() => {
  "use strict";

  const state = {
    content: null,
    projectFilter: "all",
    projectSearch: "",
    experienceTab: "current",
    profileClicks: 0,
    profileClickTimer: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const safeUrl = (value = "") => {
    try {
      const url = new URL(value, location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_) { return ""; }
  };
  const slug = (value = "") => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function toast(message) {
    const stack = $("#toast-stack");
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    stack.append(item);
    setTimeout(() => item.remove(), 3000);
  }

  function getCategory(id) {
    return state.content.projectSettings.categories.find((item) => item.id === id) || { id, label: id };
  }

  function getStatus(id) {
    return state.content.projectSettings.statuses.find((item) => item.id === id) || { id, label: id, color: "#9da9bd" };
  }

  function statusBadges(statuses = []) {
    return statuses.map((id) => {
      const status = getStatus(id);
      return `<span class="status-badge" style="color:${escapeHtml(status.color)}">${escapeHtml(status.label)}</span>`;
    }).join("");
  }

  function techTags(items = [], limit = 0) {
    const visible = limit ? items.slice(0, limit) : items;
    return visible.map((item) => `<span class="tech-tag">${escapeHtml(item)}</span>`).join("");
  }

  function projectTags(items = [], limit = 0) {
    const styles = state.content.projectSettings.tagStyles || [];
    const legacyColors = state.content.projectSettings.tagColors || {};
    const visible = limit ? items.slice(0, limit) : items;
    return visible.map((item) => {
      const style = styles.find((entry) => entry.label === item) || {};
      const color = style.color || legacyColors[item] || "#6fc1ff";
      const icon = style.icon ? `<span aria-hidden="true">${escapeHtml(style.icon)}</span>` : "";
      return `<span class="project-tag" style="--tag-color:${escapeHtml(color)}">${icon}${escapeHtml(item)}</span>`;
    }).join("");
  }

  function logoTile(item) {
    if (item.logo) {
      const mode = item.logoMode === "contain" ? " contain" : " cover";
      return `<span class="logo-tile${mode}"><img src="${escapeHtml(item.logo)}" alt="${escapeHtml(item.name)} logo" loading="lazy"></span>`;
    }
    return `<span class="logo-tile" aria-hidden="true">${escapeHtml(item.initials || item.name.slice(0, 2).toUpperCase())}</span>`;
  }

  function sectionHeader(number, kicker, heading, intro) {
    return `
      <div class="section-header reveal">
        <div>
          <p class="section-kicker">${escapeHtml(kicker)} <span class="section-number">${String(number).padStart(2, "0")}</span></p>
          <h2 class="section-title">${escapeHtml(heading)}</h2>
        </div>
        <p class="section-intro">${escapeHtml(intro)}</p>
      </div>`;
  }

  function renderNavigation() {
    const nav = $("#main-nav");
    nav.innerHTML = state.content.navigation
      .filter((item) => state.content.site.sectionVisibility[item.target] !== false)
      .map((item) => `<a href="#${escapeHtml(item.target)}">${escapeHtml(item.label)}</a>`)
      .join("");
  }

  function renderHero() {
    const { hero, site } = state.content;
    document.title = site.title;
    $("meta[name='description']")?.setAttribute("content", site.description);
    $("meta[property='og:title']")?.setAttribute("content", site.title);
    $("meta[property='og:description']")?.setAttribute("content", site.description);
    document.documentElement.style.setProperty("--accent", site.accent || "#6fc1ff");
    document.documentElement.style.setProperty("--accent-2", site.accentSecondary || "#7b72ff");
    $("#hero-eyebrow").textContent = hero.eyebrow;

    const words = hero.headline.trim().split(/\s+/);
    const last = words.pop() || "";
    $("#hero-headline").innerHTML = `${escapeHtml(words.join(" "))} <span class="accent-word">${escapeHtml(last)}</span>`;
    $("#hero-summary").textContent = hero.summary;
    $("#hero-availability").textContent = hero.availability;
    $("#profile-image").src = site.profileImage;

    const actions = [];
    if (hero.primaryAction?.label) {
      const target = String(hero.primaryAction.target || "projects").replace(/^#/, "");
      actions.push(`<a class="button primary" href="#${escapeHtml(target)}">${escapeHtml(hero.primaryAction.label)} <span>↓</span></a>`);
    }
    if (hero.secondaryAction?.label && safeUrl(hero.secondaryAction.url)) {
      actions.push(`<a class="button secondary" href="${escapeHtml(safeUrl(hero.secondaryAction.url))}" target="_blank" rel="noopener">${escapeHtml(hero.secondaryAction.label)} <span>↗</span></a>`);
    }
    $("#hero-actions").innerHTML = actions.join("");
  }

  function renderAbout(sectionNumber) {
    const about = state.content.about;
    return `
      <section class="content-section" id="about">
        <div class="section-shell">
          ${sectionHeader(sectionNumber, "About", about.heading, about.intro)}
          <div class="about-grid">
            <article class="about-main reveal">
              <p>${escapeHtml(about.intro)}</p>
              <span class="about-signal"><i></i> Building across development, content, and communities</span>
            </article>
            <aside class="about-quote reveal" data-delay="80"><blockquote>${escapeHtml(about.quote)}</blockquote></aside>
            <div class="strength-grid">
              ${about.strengths.map((item, index) => `
                <article class="strength-card reveal" data-delay="${(index % 3) * 55}">
                  <span class="strength-index">${String(index + 1).padStart(2, "0")}</span>
                  <h3>${escapeHtml(item.title)}</h3>
                  <p>${escapeHtml(item.description)}</p>
                </article>`).join("")}
            </div>
          </div>
        </div>
      </section>`;
  }

  function projectCard(project) {
    const category = getCategory(project.category);
    const cardLinks = (project.links || []).filter((link) => ["card", "both"].includes(link.placement) && safeUrl(link.url));
    return `
      <article class="project-card reveal${project.featured ? " is-featured" : ""}" data-project-id="${escapeHtml(project.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(project.title)} details">
        <div class="project-cover ${project.imageMode === "logo" ? "logo" : ""}">
          <img src="${escapeHtml(project.image || "assets/images/projects/platform.svg")}" alt="${escapeHtml(project.title)}" loading="lazy">
        </div>
        <div class="project-body">
          <div class="project-topline">
            <span class="project-category">${escapeHtml(category.label)}</span>
            <span class="project-open">＋</span>
          </div>
          <h3>${escapeHtml(project.title)}</h3>
          <p class="project-summary">${escapeHtml(project.summary)}</p>
          ${project.tags?.length ? `<div class="project-tag-row">${projectTags(project.tags, 4)}</div>` : ""}
          <div class="badge-row">${statusBadges(project.statuses)}</div>
          ${cardLinks.length ? `<div class="project-links-inline">${cardLinks.map((link) => `<a class="project-link" href="${escapeHtml(safeUrl(link.url))}" target="_blank" rel="noopener" data-stop-project>${escapeHtml(link.label)} ↗</a>`).join("")}</div>` : ""}
        </div>
      </article>`;
  }

  function previousCard(project) {
    return `
      <article class="previous-card reveal" data-project-id="${escapeHtml(project.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(project.title)} details">
        <span class="mini-arrow">↗</span>
        <div class="mini-icon"><img src="${escapeHtml(project.image || "assets/images/projects/platform.svg")}" alt="" loading="lazy"></div>
        <h4>${escapeHtml(project.title)}</h4>
        <p>${escapeHtml(project.summary)}</p>
      </article>`;
  }

  function projectMatches(project) {
    const categoryMatch = state.projectFilter === "all" || project.category === state.projectFilter;
    const haystack = [project.title, project.summary, ...(project.tags || []), ...(project.tech || [])].join(" ").toLowerCase();
    return categoryMatch && haystack.includes(state.projectSearch.toLowerCase());
  }

  function renderProjectLists() {
    const current = state.content.projects
      .filter((project) => !project.previous && projectMatches(project))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.order - b.order);
    $("#featured-projects").innerHTML = current.length ? current.map(projectCard).join("") : `<div class="projects-empty">No current projects match that filter.</div>`;

    const previous = state.content.projects
      .filter((project) => project.previous && projectMatches(project))
      .sort((a, b) => a.order - b.order);
    const groups = new Map();
    previous.forEach((project) => {
      const label = getCategory(project.category).label;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(project);
    });
    $("#previous-projects").innerHTML = previous.length ? [...groups.entries()].map(([label, items]) => `
      <div class="previous-group">
        <h4 class="previous-group-title">${escapeHtml(label)}</h4>
        <div class="previous-grid">${items.map(previousCard).join("")}</div>
      </div>`).join("") : `<div class="projects-empty">No previous projects match that filter.</div>`;

    attachProjectEvents();
    observeReveals();
  }

  function renderProjects(sectionNumber) {
    const filters = [{ id: "all", label: "All" }, ...state.content.projectSettings.categories];
    return `
      <section class="content-section" id="projects">
        <div class="section-shell">
          ${sectionHeader(sectionNumber, "Projects", "Selected work, not a list of claims.", "Active projects appear first. Older projects remain available below because completed and discontinued work still shows what I have built.")}
          <div class="project-toolbar reveal">
            <div class="filter-group" id="project-filters">
              ${filters.map((item) => `<button class="filter-button ${item.id === "all" ? "active" : ""}" type="button" data-filter="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`).join("")}
            </div>
            <label class="project-search"><input id="project-search" type="search" placeholder="Search projects" aria-label="Search projects"></label>
          </div>
          <div class="featured-grid" id="featured-projects"></div>
          <div class="previous-wrap">
            <div class="subsection-heading reveal"><div><p class="section-kicker">Archive</p><h3>Previous Work</h3></div><p>Still part of the build history.</p></div>
            <div class="previous-groups" id="previous-projects"></div>
          </div>
        </div>
      </section>`;
  }

  function renderExperienceCards() {
    const list = state.content.experience[state.experienceTab] || [];
    $("#experience-grid").innerHTML = list.map((item, index) => {
      const wrapper = safeUrl(item.url) ? "a" : "article";
      const href = safeUrl(item.url) ? ` href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener"` : "";
      return `
        <${wrapper} class="experience-card reveal"${href} data-delay="${(index % 2) * 50}">
          ${logoTile(item)}
          <div>
            <div class="experience-meta"><span>${escapeHtml(item.kind || state.experienceTab)}</span></div>
            <h3>${escapeHtml(item.name)}</h3>
            <div class="experience-role">${escapeHtml(item.role)}</div>
            <p>${escapeHtml(item.description)}</p>
          </div>
        </${wrapper}>`;
    }).join("");
    observeReveals();
  }

  function renderExperience(sectionNumber) {
    const exp = state.content.experience;
    return `
      <section class="content-section" id="experience">
        <div class="section-shell">
          ${sectionHeader(sectionNumber, "Experience", exp.heading, exp.intro)}
          <div class="experience-tabs reveal" role="tablist" aria-label="Experience type">
            <button class="filter-button active" type="button" data-exp-tab="current">Current</button>
            <button class="filter-button" type="button" data-exp-tab="previous">Previous</button>
          </div>
          <div class="experience-grid" id="experience-grid"></div>
        </div>
      </section>`;
  }

  function youtubeEmbedUrl(url) {
    try {
      const parsed = new URL(url);
      let id = "";
      if (parsed.hostname.includes("youtu.be")) id = parsed.pathname.slice(1);
      else if (parsed.pathname.startsWith("/shorts/")) id = parsed.pathname.split("/")[2];
      else id = parsed.searchParams.get("v") || parsed.pathname.split("/embed/")[1] || "";
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : "";
    } catch (_) { return ""; }
  }

  function renderContent(sectionNumber) {
    const content = state.content.contentCreation;
    const videos = (content.videos || []).filter((video) => youtubeEmbedUrl(video.url));
    return `
      <section class="content-section" id="content">
        <div class="section-shell">
          ${sectionHeader(sectionNumber, "Content", content.heading, content.intro)}
          <div class="channel-grid">
            ${content.channels.map((channel, index) => `
              <a class="channel-card reveal" href="${escapeHtml(safeUrl(channel.url))}" target="_blank" rel="noopener" data-delay="${index * 70}">
                <div class="channel-art"><img src="${escapeHtml(channel.image)}" alt="" loading="lazy"></div>
                <div class="channel-card-content">
                  <span class="channel-badge">${escapeHtml(channel.badge)}</span>
                  <h3>${escapeHtml(channel.name)}</h3>
                  <div class="channel-handle">${escapeHtml(channel.handle)}</div>
                  <p>${escapeHtml(channel.description)}</p>
                  ${channel.subscribers ? `<div class="channel-count">${escapeHtml(channel.subscribers)}<small>Subscribers</small></div>` : ""}
                </div>
              </a>`).join("")}
          </div>
          <article class="editorial-card reveal">
            <div><h3>${escapeHtml(content.editorial.title)}</h3><p>${escapeHtml(content.editorial.description)}</p></div>
            <div class="tag-row">${techTags(content.editorial.tags)}</div>
          </article>
          ${videos.length ? `<div class="video-grid">${videos.map((video) => `
            <article class="video-card reveal">
              <div class="video-frame"><iframe src="${escapeHtml(youtubeEmbedUrl(video.url))}" title="${escapeHtml(video.title || "YouTube video")}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>
              <div class="video-card-copy"><h4>${escapeHtml(video.title || "Featured video")}</h4>${video.description ? `<p>${escapeHtml(video.description)}</p>` : ""}</div>
            </article>`).join("")}</div>` : ""}
        </div>
      </section>`;
  }

  function renderWorkedWith(sectionNumber) {
    const section = state.content.workedWith;
    return `
      <section class="content-section" id="workedWith">
        <div class="section-shell">
          ${sectionHeader(sectionNumber, "Collaborations", section.heading, section.intro)}
          <div class="worked-grid">
            ${section.items.map((item, index) => {
              const wrapper = safeUrl(item.url) ? "a" : "article";
              const href = safeUrl(item.url) ? ` href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener"` : "";
              return `<${wrapper} class="worked-card reveal"${href} data-delay="${index * 45}">${logoTile(item)}<h3>${escapeHtml(item.name)}</h3><span class="worked-type">${escapeHtml(item.type)}</span><p>${escapeHtml(item.description)}</p></${wrapper}>`;
            }).join("")}
          </div>
        </div>
      </section>`;
  }

  function renderSkills(sectionNumber) {
    const skills = state.content.skills;
    return `
      <section class="content-section" id="skills">
        <div class="section-shell">
          ${sectionHeader(sectionNumber, "Capabilities", skills.heading, skills.intro)}
          <div class="skills-grid">
            ${skills.groups.map((group, index) => `
              <article class="skill-group reveal" data-delay="${(index % 2) * 45}">
                <h3>${escapeHtml(group.name)}</h3>
                <div class="skill-tags">${group.items.map((item) => `<span class="skill-tag">${escapeHtml(item)}</span>`).join("")}</div>
              </article>`).join("")}
          </div>
        </div>
      </section>`;
  }

  function renderContact(sectionNumber) {
    const contact = state.content.contact;
    return `
      <section class="content-section" id="contact">
        <div class="section-shell">
          <div class="contact-panel reveal">
            <div class="contact-content">
              <p class="section-kicker">Contact <span class="section-number">${String(sectionNumber).padStart(2, "0")}</span></p>
              <h2>${escapeHtml(contact.heading)}</h2>
              <p>${escapeHtml(contact.description)}</p>
              <div class="contact-username"><i></i>${escapeHtml(contact.username)}</div>
              <div class="contact-actions">
                <button class="button primary" id="copy-discord" type="button">${escapeHtml(contact.copyLabel)} <span>⧉</span></button>
                <a class="button secondary" href="${escapeHtml(safeUrl(contact.profileUrl))}" target="_blank" rel="noopener">${escapeHtml(contact.openLabel)} <span>↗</span></a>
              </div>
            </div>
          </div>
        </div>
      </section>`;
  }

  function renderSections() {
    const renderers = { about: renderAbout, projects: renderProjects, experience: renderExperience, content: renderContent, workedWith: renderWorkedWith, skills: renderSkills, contact: renderContact };
    let number = 1;
    $("#dynamic-sections").innerHTML = state.content.site.sectionOrder
      .filter((id) => state.content.site.sectionVisibility[id] !== false && renderers[id])
      .map((id) => renderers[id](number++))
      .join("");

    if ($("#featured-projects")) renderProjectLists();
    if ($("#experience-grid")) renderExperienceCards();
    attachSectionEvents();
  }

  function renderFooter() {
    $("#footer-socials").innerHTML = state.content.socials.map((item) => `<a href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>`).join("");
  }

  function openProject(id) {
    const project = state.content.projects.find((item) => item.id === id);
    if (!project) return;
    const category = getCategory(project.category);
    const modalLinks = (project.links || []).filter((link) => ["modal", "both"].includes(link.placement) && safeUrl(link.url));
    const gallery = project.gallery || [];
    $("#project-modal-content").innerHTML = `
      <div class="modal-hero">
        <div class="modal-hero-copy">
          <span class="modal-kicker">${escapeHtml(category.label)}</span>
          <h2>${escapeHtml(project.title)}</h2>
          <p>${escapeHtml(project.summary)}</p>
          <div class="badge-row" style="margin-top:18px">${statusBadges(project.statuses)}</div>
        </div>
        <div class="modal-image ${project.imageMode === "logo" ? "logo" : ""}"><img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.title)}"></div>
      </div>
      <div class="modal-body">
        <div class="modal-layout">
          <div>
            <section class="modal-section"><h3>Overview</h3><p>${escapeHtml(project.details)}</p></section>
            ${project.features?.length ? `<section class="modal-section"><h3>Selected features</h3><ul class="feature-list">${project.features.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
            ${gallery.length ? `<section class="modal-section"><h3>Gallery</h3><div class="modal-gallery">${gallery.map((item) => `<figure><img src="${escapeHtml(item.url || item)}" alt="${escapeHtml(item.caption || project.title)}" loading="lazy">${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ""}</figure>`).join("")}</div></section>` : ""}
          </div>
          <aside>
            ${project.developedFor ? `<section class="modal-section"><h3>Developed for</h3><div class="developed-for">${project.developedFor.logo ? `<img src="${escapeHtml(project.developedFor.logo)}" alt="${escapeHtml(project.developedFor.name)} logo">` : ""}<div><small>${escapeHtml(project.developedFor.type)}</small><strong>${escapeHtml(project.developedFor.name)}</strong><span>Project relationship</span></div></div></section>` : ""}
            ${project.metrics?.length ? `<section class="modal-section"><h3>Scale</h3><div class="metric-grid">${project.metrics.map((metric) => `<div class="metric"><strong>${escapeHtml(metric.value)}</strong><small>${escapeHtml(metric.label)}</small></div>`).join("")}</div></section>` : ""}
            ${project.tags?.length ? `<section class="modal-section"><h3>Tags</h3><div class="project-tag-row">${projectTags(project.tags)}</div></section>` : ""}
            <section class="modal-section"><h3>Stack</h3><div class="modal-stack">${techTags(project.tech)}</div></section>
            ${modalLinks.length ? `<section class="modal-section"><h3>Links</h3><div class="modal-links">${modalLinks.map((link, index) => `<a class="button ${index === 0 ? "primary" : "secondary"}" href="${escapeHtml(safeUrl(link.url))}" target="_blank" rel="noopener">${escapeHtml(link.label)} <span>↗</span></a>`).join("")}</div></section>` : ""}
          </aside>
        </div>
      </div>`;
    const dialog = $("#project-modal");
    dialog.showModal();
    document.body.classList.add("modal-open");
  }

  function closeProject() {
    const dialog = $("#project-modal");
    if (dialog.open) dialog.close();
    document.body.classList.remove("modal-open");
  }

  function attachProjectEvents() {
    $$('[data-project-id]').forEach((card) => {
      const open = () => openProject(card.dataset.projectId);
      card.addEventListener("click", (event) => {
        if (event.target.closest("[data-stop-project]")) return;
        open();
      });
      card.addEventListener("keydown", (event) => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); open(); }
      });
    });
  }

  function attachSectionEvents() {
    $$("[data-filter]").forEach((button) => button.addEventListener("click", () => {
      state.projectFilter = button.dataset.filter;
      $$("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderProjectLists();
    }));
    $("#project-search")?.addEventListener("input", (event) => {
      state.projectSearch = event.target.value.trim();
      renderProjectLists();
    });
    $$("[data-exp-tab]").forEach((button) => button.addEventListener("click", () => {
      state.experienceTab = button.dataset.expTab;
      $$("[data-exp-tab]").forEach((item) => item.classList.toggle("active", item === button));
      renderExperienceCards();
    }));
    $("#copy-discord")?.addEventListener("click", async () => {
      const username = state.content.contact.username;
      try { await navigator.clipboard.writeText(username); toast(`${username} copied to your clipboard.`); }
      catch (_) { toast(`Discord username: ${username}`); }
    });
  }

  function observeReveals() {
    const items = $$(".reveal:not(.is-observed)");
    if (!items.length) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach((item) => item.classList.add("is-visible", "is-observed"));
      return;
    }
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const delay = Number(entry.target.dataset.delay || 0);
        setTimeout(() => entry.target.classList.add("is-visible"), delay);
        currentObserver.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: "0px 0px -45px" });
    items.forEach((item) => { item.classList.add("is-observed"); observer.observe(item); });
  }

  function setupNavigation() {
    const header = $("#site-header");
    const toggle = $("#nav-toggle");
    const nav = $("#main-nav");
    addEventListener("scroll", () => header.classList.toggle("scrolled", scrollY > 20), { passive: true });
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "Close" : "Menu";
    });
    nav.addEventListener("click", (event) => {
      if (!event.target.closest("a")) return;
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "Menu";
    });

    const sections = state.content.navigation.map((item) => document.getElementById(item.target)).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      $$("#main-nav a").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
    }, { rootMargin: "-25% 0px -60%", threshold: [0, .2, .5] });
    sections.forEach((section) => observer.observe(section));
  }

  function setupCursor() {
    const enabled = state.content.site.showCursor !== false && matchMedia("(pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!enabled) return;
    document.body.classList.add("cursor-enabled");
    const cursor = $("#custom-cursor");
    const glow = $("#mouse-glow");
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener("mousemove", (event) => {
      x = event.clientX; y = event.clientY;
      glow.style.left = `${x}px`; glow.style.top = `${y}px`; glow.style.opacity = state.content.site.showMouseGlow === false ? "0" : "1";
    }, { passive: true });
    const animate = () => {
      cx += (x - cx) * .2; cy += (y - cy) * .2;
      cursor.style.left = `${cx}px`; cursor.style.top = `${cy}px`;
      requestAnimationFrame(animate);
    };
    animate();
    document.addEventListener("mouseover", (event) => cursor.classList.toggle("hovering", Boolean(event.target.closest("a,button,input,[role='button']"))));
    document.addEventListener("mouseleave", () => { cursor.style.opacity = "0"; glow.style.opacity = "0"; });
    document.addEventListener("mouseenter", () => { cursor.style.opacity = "1"; });
  }

  async function loadDiscordPresence() {
    if (state.content.site.showDiscordPresence === false) return;
    const text = $("#presence-text");
    const dot = $("#presence-dot");
    try {
      const response = await fetch(window.FALTER_PORTFOLIO_CONFIG.LANYARD_URL, { cache: "no-store" });
      const payload = await response.json();
      const status = payload?.data?.discord_status || "offline";
      dot.className = `presence-dot ${status}`;
      const labels = { online: "Online on Discord", idle: "Idle on Discord", dnd: "Do not disturb", offline: "Offline on Discord" };
      text.textContent = labels[status] || labels.offline;
    } catch (_) {
      dot.className = "presence-dot offline";
      text.textContent = "Discord status unavailable";
    }
  }

  function openAdmin() {
    const path = state.content.site.adminPath || window.FALTER_PORTFOLIO_CONFIG.ADMIN_PATH || "admin/";
    location.href = new URL(path, location.href).href;
  }

  function setupAdminEntrances() {
    $("#admin-moon").addEventListener("click", openAdmin);
    addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "e") {
        event.preventDefault(); openAdmin();
      }
    });
    $("#profile-admin-trigger").addEventListener("click", () => {
      state.profileClicks += 1;
      clearTimeout(state.profileClickTimer);
      state.profileClickTimer = setTimeout(() => { state.profileClicks = 0; }, 1800);
      if (state.profileClicks >= 5) openAdmin();
    });
  }

  function setupModal() {
    $("#modal-close").addEventListener("click", closeProject);
    $("#project-modal").addEventListener("click", (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) closeProject();
    });
    $("#project-modal").addEventListener("close", () => document.body.classList.remove("modal-open"));
  }

  function hideLoader() {
    const loader = $("#loading-screen");
    const delay = state.content.site.showLoadingScreen === false ? 0 : 380;
    setTimeout(() => loader.classList.add("is-hidden"), delay);
    setTimeout(() => loader.remove(), delay + 700);
  }

  async function init() {
    try {
      state.content = await window.PortfolioAPI.loadContent();
      renderNavigation();
      renderHero();
      renderSections();
      renderFooter();
      setupNavigation();
      setupCursor();
      setupAdminEntrances();
      setupModal();
      observeReveals();
      loadDiscordPresence();
      hideLoader();
    } catch (error) {
      console.error(error);
      $("#loading-screen p").textContent = "The portfolio could not load.";
      setTimeout(() => $("#loading-screen")?.classList.add("is-hidden"), 1800);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
