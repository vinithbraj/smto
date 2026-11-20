/* One delegated, text-only tooltip for existing title hints, including controls
 * created after boot. Native titles are restored on exit; no transcript scan,
 * per-control listener or network request is needed. */
(() => {
  "use strict";
  let popup, owner, described, temporaryLabel, showTimer, closeTimer, dismissed = false;
  let touchInput = false;
  const titles = new Map();
  const titleObserver = new MutationObserver(records => {
    titleObserver.disconnect();
    for (const node of new Set(records.map(record => record.target))) {
      const next = node.getAttribute("title");
      titles.get(node).text = next;
      if (next !== null) node.setAttribute("title", "");
    }
    observeTitles();
    if (!titles.get(owner)?.text) close();
    else if (popup && !popup.hidden) render();
  });
  const removedObserver = new MutationObserver(() => { if (!owner?.isConnected) close(); });
  const resizeObserver = new ResizeObserver(() => { if (popup && !popup.hidden) position(); });

  function observeTitles() {
    for (const node of titles.keys()) titleObserver.observe(node, {attributes: true, attributeFilter: ["title"]});
  }
  function titleOwner(target) {
    if (!(target instanceof Element) || target.closest('[role="tooltip"], [data-native-tooltip]')) return null;
    for (let node = target; node; node = node.parentElement) {
      // Empty titles intentionally stop a parent's inherited native hint.
      if (node.hasAttribute("title")) return (titles.get(node)?.text ?? node.getAttribute("title"))?.trim() ? node : null;
    }
    return null;
  }
  function unlink() {
    if (!described) return;
    const ids = (described.getAttribute("aria-describedby") || "").split(/\s+/).filter(id => id && id !== popup?.id);
    if (ids.length) described.setAttribute("aria-describedby", ids.join(" "));
    else described.removeAttribute("aria-describedby");
    if (temporaryLabel && described.getAttribute("aria-label") === temporaryLabel) described.removeAttribute("aria-label");
    described = null; temporaryLabel = null;
  }
  function hide() {
    clearTimeout(showTimer); clearTimeout(closeTimer);
    unlink(); resizeObserver.disconnect();
    if (popup) {
      if (popup.hasAttribute("popover") && popup.matches(":popover-open")) popup.hidePopover();
      popup.hidden = true;
    }
  }
  function close() {
    hide();
    for (const record of titleObserver.takeRecords()) titles.get(record.target).text = record.target.getAttribute("title");
    titleObserver.disconnect(); removedObserver.disconnect();
    for (const [node, record] of titles) {
      // Never replace a newer title written by the application's own controller.
      if (node.getAttribute("title") === "" && record.text !== null) node.setAttribute("title", record.text);
    }
    titles.clear(); owner = null; dismissed = false;
  }
  function position() {
    if (!owner?.isConnected || !owner.getClientRects().length) { close(); return; }
    const editing = owner.matches("textarea, input:not([type=checkbox]):not([type=radio]), [contenteditable=true]");
    // An editor hint must not sit on its own Send, Queue or Cancel buttons.
    // Keep it outside the whole inbox, including the dock's task label.
    const composer = owner.closest(".immersive-composer-inbox, .composer-dock, #compose");
    const anchor = composer || (editing ? owner.closest("form") || owner : owner);
    const box = anchor.getBoundingClientRect(), tip = popup.getBoundingClientRect(), margin = 12, gap = 8;
    const left = Math.max(margin, Math.min(box.left + (box.width - tip.width) / 2, innerWidth - tip.width - margin));
    const below = box.bottom + gap;
    if ((editing || composer) && below + tip.height > innerHeight - margin && box.top - tip.height - gap < margin) {
      hide(); dismissed = true; return;
    }
    const top = below + tip.height <= innerHeight - margin ? below : box.top - tip.height - gap;
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(margin, Math.min(top, innerHeight - tip.height - margin))}px`;
  }
  function render() {
    popup.textContent = titles.get(owner)?.text || "";
    if (temporaryLabel && described?.getAttribute("aria-label") === temporaryLabel) {
      temporaryLabel = popup.textContent; described.setAttribute("aria-label", temporaryLabel);
    }
    position();
  }
  function show(focusTarget) {
    if (dismissed || !owner?.isConnected) return;
    // Timestamp/timing controls already own richer hints. Suppress the native
    // title without placing a second tooltip over their accessible popup.
    for (let node = owner; node; node = node.parentElement) {
      const ids = (node.getAttribute("aria-describedby") || "").split(/\s+/);
      if (ids.some(id => id && id !== popup?.id && document.getElementById(id)?.matches('[role="tooltip"]')
          && document.getElementById(id).getClientRects().length)) {
        hide(); dismissed = true; return;
      }
    }
    if (!popup) {
      popup = document.createElement("div"); popup.id = "smto-tooltip";
      popup.className = "smto-tooltip"; popup.setAttribute("role", "tooltip"); popup.hidden = true;
      if (typeof popup.showPopover === "function") popup.setAttribute("popover", "manual");
    }
    // A modal makes nodes outside its DOM subtree inert, even in the top layer.
    const host = owner.closest("dialog[open]") || document.body;
    if (popup.parentElement !== host) host.append(popup);
    unlink(); described = focusTarget?.isConnected ? focusTarget : owner;
    const ids = new Set((described.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    ids.add(popup.id); described.setAttribute("aria-describedby", [...ids].join(" "));
    // Preserve the name of icon-only controls that relied solely on their title.
    if (!described.hasAttribute("aria-label") && !described.hasAttribute("aria-labelledby")
        && !described.textContent.trim() && !described.labels?.length && described.matches("button, a, input, [role=button]")) {
      temporaryLabel = titles.get(owner).text; described.setAttribute("aria-label", temporaryLabel);
    }
    popup.hidden = false;
    if (popup.hasAttribute("popover") && !popup.matches(":popover-open")) popup.showPopover();
    render();
    // Positioning closes the hint when its control disappeared meanwhile (for example a
    // parked editor frame); there is then nothing left to observe.
    if (!owner) return;
    resizeObserver.observe(owner); resizeObserver.observe(popup);
  }
  function enter(target, keyboard = false) {
    const next = titleOwner(target);
    if (!next) {
      if (keyboard) close();
      else if (owner) { clearTimeout(closeTimer); closeTimer = setTimeout(close, 120); }
      return;
    }
    if (next === owner) {
      clearTimeout(closeTimer);
      if (keyboard && !dismissed) { clearTimeout(showTimer); show(target); }
      return;
    }
    close(); if (!next) return;
    owner = next;
    for (let node = owner; node; node = node.parentElement) if (node.hasAttribute("title")) {
      titles.set(node, {text: node.getAttribute("title")}); node.setAttribute("title", "");
    }
    observeTitles(); removedObserver.observe(document.documentElement, {subtree: true, childList: true});
    if (keyboard) show(target); else showTimer = setTimeout(() => show(), 350);
  }
  document.addEventListener("pointerover", event => {
    if (event.pointerType === "touch") return;
    touchInput = false;
    if (popup?.contains(event.target)) { clearTimeout(closeTimer); return; }
    enter(event.target);
  });
  document.addEventListener("pointerout", event => {
    if (event.pointerType === "touch" || !owner) return;
    const next = event.relatedTarget;
    if (next instanceof Node && (owner.contains(next) || popup?.contains(next))) return;
    if (owner.contains(document.activeElement) && document.activeElement.matches(":focus-visible")) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(close, 120);
  });
  document.addEventListener("focusin", event => {
    if (!touchInput && event.target.matches(":focus-visible")) enter(event.target, true);
  });
  document.addEventListener("focusout", event => {
    if (owner?.contains(event.target)) close();
  });
  document.addEventListener("input", event => { if (owner?.contains(event.target)) close(); });
  document.addEventListener("keydown", event => {
    touchInput = false;
    if (event.key === "Escape" && owner) { hide(); dismissed = true; }
  });
  document.addEventListener("pointerdown", event => {
    touchInput = event.pointerType === "touch";
    if (!popup?.contains(event.target)) close();
  }, true);
  document.addEventListener("scroll", event => { if (!popup?.contains(event.target)) close(); }, true);
  window.addEventListener("resize", close);
  window.visualViewport?.addEventListener("resize", close);
  window.visualViewport?.addEventListener("scroll", close);
  window.addEventListener("smto:inbox-dock", close);
  window.addEventListener("blur", close);
  document.addEventListener("visibilitychange", () => { if (document.hidden) close(); });
})();
