/* Browser-owned palette selection, sanitized per-theme modifiers and favorites.
 * SMTOThemeCatalog supplies colors; the CSS bridge consumes generated variables.
 * Local storage owns the full library, while a best-effort active-pair cookie
 * allows same-host service ports to render without a running Agent server. */
(() => {
  "use strict";
  const Catalog = window.SMTOThemeCatalog, root = document.documentElement;
  const key = "smto.ui.palette.v1", cookieKey = "smto_ui_palette_v1";
  const system = matchMedia("(prefers-color-scheme: dark)");
  /** Accept only full six-digit hex colors before exposing a saved modifier as a CSS custom
   * property. */
  const color = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  /** Detach the JSON-compatible preference snapshot so editor drafts cannot mutate the applied
   * state object. */
  const copy = value => JSON.parse(JSON.stringify(value));
  /** Retain recognized colors, text weights and a bounded, control-character-free font name.
   * Unknown keys and malformed values disappear during normalization. */
  function modifier(raw) {
    const result = {light: {}, dark: {}};
    for (const mode of ["light", "dark"]) for (const field of Object.keys(Catalog.fields)) {
      if (color(raw?.[mode]?.[field])) result[mode][field] = raw[mode][field].toLowerCase();
    }
    if (typeof raw?.fontFamily === "string" && [...raw.fontFamily].length <= 200
        && !/[\u0000-\u001f\u007f-\u009f]/u.test(raw.fontFamily)) result.fontFamily = raw.fontFamily.trim();
    if (["regular", "bold"].includes(raw?.fontWeight)) result.fontWeight = raw.fontWeight;
    return result;
  }
  /** Rebuild version-one preferences using known catalog IDs, sanitized modifiers, unique favorites
   * and a nonnegative revision timestamp; invalid selections fall back to Default. */
  function normalize(raw) {
    const overrides = {};
    for (const theme of Catalog.themes) if (raw?.overrides?.[theme.id]) overrides[theme.id] = modifier(raw.overrides[theme.id]);
    return {version: 1, selected: Catalog.has(raw?.selected) ? raw.selected : "default", overrides,
      favorites: [...new Set((Array.isArray(raw?.favorites) ? raw.favorites : []).filter(id => Catalog.has(id)))],
      updated: Number.isSafeInteger(raw?.updated) && raw.updated >= 0 ? raw.updated : 0};
  }
  /** Read and normalize this origin's full library preferences; denied storage or invalid JSON
   * yields the default preference shape. */
  function readLocal() {
    try { return normalize(JSON.parse(localStorage.getItem(key))); } catch (_) { return normalize(null); }
  }
  /** Merge the active-pair cookie when its timestamp is at least as recent as local storage. Other
   * theme edits and favorites remain origin-local; malformed or unavailable cookies do not prevent
   * local use. */
  function read() {
    const local = readLocal();
    try {
      const raw = document.cookie.split("; ").find(item => item.startsWith(cookieKey + "="))?.slice(cookieKey.length + 1);
      const active = JSON.parse(decodeURIComponent(raw || "null"));
      if (Catalog.has(active?.id) && Number.isSafeInteger(active.updated) && active.updated >= local.updated) {
        local.selected = active.id; local.updated = active.updated;
        local.overrides[active.id] = modifier(active.o);
      }
    } catch (_) { /* Cookies may be disabled; local storage still works. */ }
    return local;
  }
  let state = read(), signature = "";
  /** Resolve the rendered day/night variant from the root attribute, falling back to the device
   * scheme only when the attribute is absent. */
  const mode = () => root.dataset.theme === "dark" || (!root.dataset.theme && system.matches) ? "dark" : "light";
  /** Report whether a theme carries any font or variant color overrides, for Default activation and
   * the Modified filter. */
  const colorModified = raw => Boolean(Object.keys(raw?.light || {}).length || Object.keys(raw?.dark || {}).length);
  const modified = raw => Boolean(raw?.fontFamily || raw?.fontWeight || colorModified(raw));
  /** Overlay sanitized variant edits on the catalog palette and return a fresh color object without
   * saving it. */
  const resolve = (id, variant, override) => ({...Catalog.get(id)[variant === "dark" ? "dark" : "light"], ...modifier(override)[variant === "dark" ? "dark" : "light"]});
  /** Translate known font aliases and quote arbitrary family names safely for a CSS font stack with
   * system fallbacks; no font download occurs. */
  const fontStack = family => {
    const presets = {system: "system-ui", macos: "-apple-system", "segoe-ui": "Segoe UI", "noto-sans": "Noto Sans", "dejavu-sans": "DejaVu Sans"};
    const name = presets[family] || family;
    return `"${name.replace(/["\\]/g, "\\$&")}", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  };
  /** Write semantic palette variables and derived surface/border strengths on a root or preview
   * element. Border variants also follow custom colors; the CSS bridge chooses where they apply. */
  function paint(element, values) {
    for (const [field, value] of Object.entries(values)) element.style.setProperty(`--palette-${field}`, value);
    element.style.setProperty("--palette-hover", Catalog.mix(values.surface, values.text, .07));
    element.style.setProperty("--palette-strong", Catalog.mix(values.surface, values.text, .12));
    element.style.setProperty("--palette-border-soft", Catalog.mix(values.bg, values.border, .7));
    element.style.setProperty("--palette-border-strong", Catalog.mix(values.border, values.text, .1));
  }
  /** Apply the selected palette and optional font to the document, leaving unmodified Default
   * inactive. A font change emits the shared sizing event and restores the visible turn or bottom
   * position on the next animation frame. */
  function render() {
    const override = state.overrides[state.selected];
    // A weight-only edit must not replace a screen's original Default colors.
    const active = state.selected !== "default" || Boolean(override?.fontFamily || colorModified(override));
    const fontChanged = (root.dataset.paletteFont || "") !== (override?.fontFamily || "")
      || (root.dataset.paletteFontWeight || "") !== (override?.fontWeight || "");
    const viewport = fontChanged ? document.querySelector("#conversation-viewport, #thread") : null;
    const atBottom = viewport && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 16;
    const top = viewport?.getBoundingClientRect().top;
    const anchor = viewport && [...viewport.querySelectorAll(".turn")].find(node => node.getBoundingClientRect().bottom > top);
    const offset = anchor && anchor.getBoundingClientRect().top - top;
    root.dataset.palette = state.selected;
    root.toggleAttribute("data-palette-active", active);
    if (active) paint(root, resolve(state.selected, mode(), override));
    if (override?.fontFamily) {
      root.dataset.paletteFont = override.fontFamily;
      root.style.setProperty("--palette-font", fontStack(override.fontFamily));
    } else {
      delete root.dataset.paletteFont; root.style.removeProperty("--palette-font");
    }
    if (override?.fontWeight) {
      root.dataset.paletteFontWeight = override.fontWeight;
      root.style.setProperty("--palette-font-weight", override.fontWeight === "bold" ? "700" : "400");
    } else {
      delete root.dataset.paletteFontWeight; root.style.removeProperty("--palette-font-weight");
    }
    if (fontChanged) {
      window.dispatchEvent(new CustomEvent("smto:font-scale", {detail: Number(root.dataset.fontScale || 100)}));
      if (viewport) requestAnimationFrame(() => {
        if (atBottom) viewport.scrollTop = viewport.scrollHeight;
        else if (anchor?.isConnected) viewport.scrollTop += anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top - offset;
      });
    }
  }
  /** Re-read cookie/local preferences and repaint only when their normalized JSON changes, then
   * notify editor consumers. */
  function refresh() {
    const next = read(), nextSignature = JSON.stringify(next);
    if (nextSignature === signature) return;
    state = next; signature = nextSignature; render();
    window.dispatchEvent(new Event("smto:palette-change"));
  }
  /** Merge touched theme drafts with the latest preferences, assign a monotonic timestamp, and
   * require local storage success before repainting. The active-pair cookie is best effort; a
   * blocked cookie can prevent propagation to other service ports. */
  function save(id, override, edits = {}) {
    if (!Catalog.has(id)) throw new Error("Choose an available theme.");
    const next = read();
    for (const theme of Catalog.themes) if (Object.hasOwn(edits, theme.id)) next.overrides[theme.id] = modifier(edits[theme.id]);
    next.selected = id; next.overrides[id] = modifier(override);
    next.updated = Math.max(Date.now(), next.updated + 1, state.updated + 1);
    const cookie = encodeURIComponent(JSON.stringify({id, o: next.overrides[id], updated: next.updated}));
    if (cookie.length > 3800) throw new Error("This font name is too long to share across application screens.");
    // A failed write leaves the currently applied theme intact.
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch (_) { throw new Error("Could not save the theme. Allow browser storage or free some space, then try Apply again."); }
    try { document.cookie = `${cookieKey}=${cookie}; Path=/; Max-Age=31536000; SameSite=Lax`; } catch (_) {}
    state = next; signature = JSON.stringify(next); render();
    window.dispatchEvent(new Event("smto:palette-change"));
  }
  /** Toggle one known theme in the origin-local favorites list and persist immediately,
   * independently of Apply/Discard. A storage failure is reported to the editor. */
  function favorite(id) {
    if (!Catalog.has(id)) return;
    const next = read();
    next.favorites = next.favorites.includes(id) ? next.favorites.filter(value => value !== id) : [...next.favorites, id];
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch (_) { throw new Error("Could not save favorites. Check browser storage and try again."); }
    refresh();
  }
  window.SMTOThemeLibrary = Object.freeze({getState: () => copy(read()), modifier, modified, resolve, paint,
    mode, fontStack, save, favorite, refresh});
  signature = JSON.stringify(state); render();
  new MutationObserver(render).observe(root, {attributes: true, attributeFilter: ["data-theme"]});
  system.addEventListener("change", render);
  window.addEventListener("smto:appearance", render);
  window.addEventListener("smto:theme-change", render);
  window.addEventListener("storage", event => { if (event.key === key || event.key === null) refresh(); });
  for (const event of ["focus", "pageshow"]) window.addEventListener(event, refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 1000);
})();
