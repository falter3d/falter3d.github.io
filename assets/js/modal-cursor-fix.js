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
          if (layer.matches(":popover-open")) layer.hidePopover();
          layer.showPopover();
          return;
        } catch (_) {}
      }

      // Older-browser fallback. Modern Chromium/Opera uses the popover path above.
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

    scroll.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    bar.addEventListener("pointerdown", (event) => {
      if (event.target === thumb) return;
      event.preventDefault();
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      scroll.scrollTop = ratio * Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      update();
    });

    thumb.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const startY = event.clientY;
      const startScroll = scroll.scrollTop;
      const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      const maxThumbTravel = Math.max(1, bar.clientHeight - thumb.offsetHeight);

      thumb.classList.add("is-dragging");
      thumb.setPointerCapture(event.pointerId);

      const move = (moveEvent) => {
        const delta = moveEvent.clientY - startY;
        scroll.scrollTop = startScroll + (delta / maxThumbTravel) * maxScroll;
      };

      const end = () => {
        thumb.classList.remove("is-dragging");
        thumb.removeEventListener("pointermove", move);
        thumb.removeEventListener("pointerup", end);
        thumb.removeEventListener("pointercancel", end);
      };

      thumb.addEventListener("pointermove", move);
      thumb.addEventListener("pointerup", end);
      thumb.addEventListener("pointercancel", end);
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
