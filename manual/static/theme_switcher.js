/* Shared browser day/night preference and header controls. The cookie and local
 * storage synchronize tabs and same-host service ports; Agent UI appearance
 * resolves application defaults while standalone pages apply the choice here.
 * Palette selection and wallpaper have separate owners and storage keys. */
(() => {
  "use strict";
  const root = document.documentElement;
  const system = matchMedia("(prefers-color-scheme: dark)");
  const storageKey = "smto.ui.theme.v1", cookieKey = "smto_ui_theme_v1";
  let preference = null;
  /** Accept a small versionless theme-choice object with a supported mode and nonnegative safe
   * timestamp; malformed or oversized storage values are ignored. */
  function parse(raw) {
    try {
      if (!raw || raw.length > 160) return null;
      const value = JSON.parse(raw);
      return value && ["light", "dark", "system", null].includes(value.theme)
        && Number.isSafeInteger(value.updated) && value.updated >= 0 ? value : null;
    } catch (_) { return null; }
  }
  /** Choose the newest valid cookie or local-storage day/night preference, preferring the cookie on
   * a tie so same-host service ports can converge. */
  function read() {
    let cookie = null, local = null;
    try { cookie = parse(decodeURIComponent(document.cookie.split("; ")
      .find(item => item.startsWith(cookieKey + "="))?.slice(cookieKey.length + 1) || "")); } catch (_) {}
    try { local = parse(localStorage.getItem(storageKey)); } catch (_) {}
    // Cookies span ports; localStorage provides immediate same-origin notifications
    // and remains usable when cookies are blocked. This stores only a display choice.
    return cookie && (!local || cookie.updated >= local.updated) ? cookie : local;
  }
  /** Publish a theme-change event and set the root theme directly only on standalone pages; the
   * Agent UI appearance owner resolves its own manual/automatic settings. */
  function apply() {
    if (!window.SMTOAgentUi) {
      if (["light", "dark"].includes(preference?.theme)) root.dataset.theme = preference.theme;
      else delete root.dataset.theme;
    }
    window.dispatchEvent(new Event("smto:theme-change"));
  }
  /** Adopt a newer or same-revision changed stored preference immediately; missing
   * or older values do not overwrite the in-memory choice. */
  function refresh() {
    const next = read();
    if (!next || (preference && next.updated < preference.updated)) return;
    if (next.updated === preference?.updated && next.theme === preference?.theme) return;
    preference = next;
    apply();
  }
  window.SMTOThemePreference = Object.freeze({
    get: () => preference?.theme ?? undefined,
    set(theme) {
      const latest = read();
      preference = {theme: ["light", "dark", "system"].includes(theme) ? theme : null,
        updated: Math.max(Date.now(), (latest?.updated || 0) + 1, (preference?.updated || 0) + 1)};
      const raw = JSON.stringify(preference);
      try { localStorage.setItem(storageKey, raw); } catch (_) {}
      try { document.cookie = `${cookieKey}=${encodeURIComponent(raw)}; Path=/; Max-Age=31536000; SameSite=Lax`; } catch (_) {}
      apply();
    },
  });
  preference = read();
  apply();
  window.addEventListener("storage", event => { if (event.key === storageKey || event.key === null) refresh(); });
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  document.addEventListener("visibilitychange", refresh);
  // Separate Console/Manual ports cannot receive this origin's storage events.
  setInterval(refresh, 1000);
  /** Read the effective root theme, or the system scheme when no explicit root mode is set, for the
   * toggle action and accessible label. */
  const isDark = () => root.dataset.theme === "dark" || (!root.dataset.theme && system.matches);
  /** Bind every shared header day/night button to the browser preference owner, then observe root
   * and device changes to keep button labels current. */
  function mount() {
    const controls = [...document.querySelectorAll("[data-theme-switcher]")];
    if (!controls.length) return;
    /** Update toggle icons, visible labels and accessible descriptions to describe the next
     * day/night action rather than the current mode. */
    function render() {
      const dark = isDark();
      for (const control of controls) {
        control.title = dark ? "Switch to day theme" : "Switch to night theme";
        control.setAttribute("aria-label", control.title);
        control.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${dark
          ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
          : '<path d="M20.5 13.5A8.5 8.5 0 0 1 10.5 3.5a8.5 8.5 0 1 0 10 10Z"/>'}</svg><span>${dark ? "Day" : "Night"}</span>`;
      }
    }
    for (const control of controls) {
      control.type = "button";
      control.addEventListener("click", () => {
        const value = isDark() ? "light" : "dark";
        window.SMTOThemePreference.set(value);
      });
    }
    new MutationObserver(render).observe(root, {attributes: true, attributeFilter: ["data-theme"]});
    system.addEventListener("change", render);
    window.addEventListener("pageshow", render);
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, {once: true});
  else mount();
})();
