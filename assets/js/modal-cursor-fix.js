(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);

  function buildModalShell(dialog) {
    let shell = dialog.querySelector(".project-modal-shell");
    if (shell) return shell;

    const closeButton = byId("modal-close");
    const content = byId("project-modal-content");
    if (!closeButton || !content) return null;

    shell = document.createElement("div");
    shell.className = "project-modal-shell";

    const scroll = document.createElement("div");
    scroll.className = "project-modal-scroll";
    scroll.id = "project-modal-scroll";

    const scrollbar = document.createElement("div");
    scrollbar.className = "modal-scrollbar";
    scrollbar.id = "modal-scrollbar";
    scrollbar.setAttribute("aria-hidden", "true");

    const thumb = document.createElement("div");
    thumb.className = "modal-scrollbar-thumb";
    thumb.id = "modal-scrollbar-thumb";
    scrollbar.append(thumb);

    dialog.append(shell);
    shell.append(closeButton);
    scroll.append(content);
    shell.append(scroll, scrollbar);
    return shell;
  }

  function buildCursorLayer(dialog) {
    const cursor = byId("custom-cursor");
    if (!cursor) return { show: () => {} };

    let layer = byId("cursor-top-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "cursor-top-layer";
      layer.className = "cursor-top-layer";
      layer.setAttribute("popover", "manual");
      layer.setAttribute("aria-hidden", "true");
      document.body.append(layer);
    }
    layer.append(cursor);

    const show = () => {
      if (typeof layer.showPopover === "function") {
        try {
          if (!layer.matches(":popover-open")) layer.showPopover();
          return;
        } catch (_) {}
      }

      if (dialog.open && cursor.parentElement !== dialog) dialog.append(cursor);
      if (!dialog.open && cursor.parentElement !== layer) layer.append(cursor);
    };

    return { show };
  }

  function setupScrollbar(dialog) {
    const scroll = byId("project-modal-scroll");
    const bar = byId("modal-scrollbar");
    const thumb = byId("modal-scrollbar-thumb");
    const content = byId("project-modal-content");
    if (!scroll || !bar || !thumb || !content) return () => {};

    let draggingPointerId = null;

    const update = () => {
      const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      if (!dialog.open || maxScroll <= 1) {
        bar.classList.add("is-hidden");
        thumb.style.height = "0px";
        thumb.style.transform = "translateY(0)";
        return;
      }

      bar.classList.remove("is-hidden");
      const barHeight = bar.clientHeight;
      const thumbHeight = Math.max(48, Math.round(barHeight * (scroll.clientHeight / scroll.scrollHeight)));
      const maxThumbTop = Math.max(0, barHeight - thumbHeight);
      const thumbTop = (scroll.scrollTop / maxScroll) * maxThumbTop;
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translateY(${thumbTop}px)`;
    };

    const swallow = (event) => {
      event.stopPropagation();
    };

    // Do not let scrollbar clicks bubble into the dialog's backdrop handler.
    ["click", "dblclick", "auxclick", "contextmenu"].forEach((type) => {
      bar.addEventListener(type, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    ["pointerup", "pointercancel"].forEach((type) => bar.addEventListener(type, swallow));

    scroll.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    bar.addEventListener("pointerdown", (event) => {
      if (event.target === thumb) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      scroll.scrollTop = ratio * Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      update();
    });

    thumb.addEventListener("pointerdown", (event) => {
      if (draggingPointerId !== null) return;
      event.preventDefault();
      event.stopPropagation();

      draggingPointerId = event.pointerId;
      const startY = event.clientY;
      const startScroll = scroll.scrollTop;
      const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      const maxThumbTravel = Math.max(1, bar.clientHeight - thumb.offsetHeight);

      thumb.classList.add("is-dragging");
      document.body.classList.add("modal-scrollbar-dragging");
      try { thumb.setPointerCapture(event.pointerId); } catch (_) {}

      const move = (moveEvent) => {
        if (moveEvent.pointerId !== draggingPointerId) return;
        moveEvent.preventDefault();
        const delta = moveEvent.clientY - startY;
        scroll.scrollTop = startScroll + (delta / maxThumbTravel) * maxScroll;
        update();
      };

      const end = (endEvent) => {
        if (endEvent.pointerId !== draggingPointerId) return;
        endEvent.preventDefault();
        endEvent.stopPropagation();
        try {
          if (thumb.hasPointerCapture(endEvent.pointerId)) thumb.releasePointerCapture(endEvent.pointerId);
        } catch (_) {}
        draggingPointerId = null;
        thumb.classList.remove("is-dragging");
        document.body.classList.remove("modal-scrollbar-dragging");
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", end, true);
        window.removeEventListener("pointercancel", end, true);
      };

      // Capture-phase window listeners keep drag tracking and the site's custom
      // pointer animation alive even while the thumb owns pointer capture.
      window.addEventListener("pointermove", move, { capture: true, passive: false });
      window.addEventListener("pointerup", end, { capture: true, passive: false });
      window.addEventListener("pointercancel", end, { capture: true, passive: false });
    });

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(update);
      observer.observe(scroll);
      observer.observe(content);
    }

    return update;
  }

  function setup() {
    const dialog = byId("project-modal");
    if (!dialog || !buildModalShell(dialog)) return;

    const cursorLayer = buildCursorLayer(dialog);
    const updateScrollbar = setupScrollbar(dialog);
    const scroll = byId("project-modal-scroll");

    cursorLayer.show();

    const observer = new MutationObserver(() => {
      if (!dialog.open) return;
      if (scroll) scroll.scrollTop = 0;
      requestAnimationFrame(() => {
        cursorLayer.show();
        updateScrollbar();
      });
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });

    dialog.addEventListener("close", () => {
      document.body.classList.remove("modal-scrollbar-dragging");
      cursorLayer.show();
      updateScrollbar();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }
})();
