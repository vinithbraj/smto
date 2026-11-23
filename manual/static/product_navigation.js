/**
 * Shared non-Chat product navigation. Shells provide deployment routes through the
 * smto-navigation meta tag; this module owns only presentation, never authorization
 * or service discovery. Standalone distributions package these same asset bytes.
 */
(() => {
  "use strict";
  if (window.SMTOProductNavigation) return;
  const groups = ["Work", "Library", "System", "Preferences", "Help", "Account"];
  const destinations = Object.freeze([
    ["chat", "Chat", "/agent-ui", 0], ["workflows", "Workflows", "/workflows", 0],
    ["schedules", "Schedules", "/schedules", 0], ["notifications", "Notifications", "/notifications", 0],
    ["knowledge", "Knowledge", "/knowledge", 1], ["memories", "Memory Editor", "/memory-editor", 1],
    ["parameters", "Parameter Store", "/parameter-editor", 1], ["prompts", "Prompt Editor", "/prompt-editor", 1],
    ["skill-editor", "Skills", "/skill-editor", 1], ["skills", "Python Skills", "/skills", 1], ["system-health", "System Health", "/system-health", 2],
    ["inference", "Inference", "/inference", 2], ["runtime", "Runtime", "/runtime", 2], ["console", "Console", "/console", 2],
    ["settings", "Settings", "/settings", 3], ["appearance", "Appearance", "/theme", 3],
    ["manual", "Manual", "/manual", 4], ["directory", "Directory", "/directory", 4],
    ["account", "Account", "/account", 5], ["users", "Users", "/user", 5],
  ].map(([id, label, path, group]) => Object.freeze({id, label, path, group})));
  let authentication = null, controller;
  const accountRoute = item => ["account", "users"].includes(item.id);
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; };
  function preferenceKey(surface) {
    const scope = window.SMTO_WORKSPACE?.workspace_prefix || window.SMTO_WORKSPACE?.installation_prefix || context().prefix || location.origin;
    let hash = 2166136261; for (const char of scope) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return surface + "-" + (hash >>> 0).toString(36);
  }
  function context() {
    try { return JSON.parse(document.querySelector('meta[name="smto-navigation"]')?.content || "{}"); }
    catch (_) { return {}; }
  }

  /** Explicit URLs and deployment prefixes are data, never executable navigation. */
  function safeUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value, location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch (_) { return null; }
  }

  function destination(item, config) {
    if (authentication?.mustChangePassword && item.id !== "account") return null;
    if (Object.hasOwn(config.destinations || {}, item.id)) return safeUrl(config.destinations[item.id]);
    if (accountRoute(item)) return authentication ? safeUrl(authentication.endpoint(item.path)) : null;
    if (item.id === "manual" && config.manual && window.SMTOManualLinks)
      return safeUrl(window.SMTOManualLinks.manualUrl("manual-home", config.manual));
    if (item.id === "manual") return null;
    if (!config.paths?.includes(item.path) && !config.controllerUrl) return null;
    const base = config.controllerUrl || location.origin + (window.SMTO_WORKSPACE?.installation_prefix || config.prefix || "");
    return safeUrl(base.replace(/\/$/, "") + item.path);
  }
  /** Collapsed App groups are a tab-session presentation choice shared by every surface. */
  const collapsedKey = "navigation_collapsed_groups", groupKey = index => "app:" + groups[index].toLowerCase();
  const collapsedGroups = () => new Set(window.SMTOUiSession?.get(collapsedKey, []) || []);
  function setExpanded(section, expanded) {
    section.querySelector(".product-navigation-toggle").setAttribute("aria-expanded", String(expanded));
    // inert (not hidden) keeps the panel animatable while removing its links from focus.
    section.querySelector(".product-navigation-panel").inert = !expanded;
    section.classList.toggle("is-collapsed", !expanded);
  }
  function renderDestinations(menu, surface, config = context()) {
    const previous = document.activeElement?.dataset.productDestination || document.activeElement?.dataset.productGroup;
    const collapsed = collapsedGroups();
    menu.replaceChildren();
    for (let index = 0; index < groups.length; index++) {
      const section = node("section", null, "product-navigation-group"), title = node("h2");
      const toggle = node("button", null, "product-navigation-toggle"), items = node("div", null, "product-navigation-items");
      toggle.type = "button"; toggle.dataset.productGroup = groupKey(index);
      items.id = `product-navigation-${groups[index].toLowerCase()}`; toggle.setAttribute("aria-controls", items.id);
      toggle.append(node("span", groups[index]));
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") !== "true", saved = collapsedGroups();
        setExpanded(section, expanded);
        if (expanded) saved.delete(groupKey(index)); else saved.add(groupKey(index));
        window.SMTOUiSession?.set(collapsedKey, [...saved]);
      });
      const panel = node("div", null, "product-navigation-panel"); panel.append(items);
      title.append(toggle); section.append(title, panel);
      for (const item of destinations.filter(item => item.group === index)) {
        if (accountRoute(item) && !authentication) continue;
        if (item.id === "users" && authentication?.role !== "admin") continue;
        if (document.querySelector('script[src$="/auth/client.js"]') && authentication?.role !== "admin"
          && ["inference", "console", "skills", "runtime"].includes(item.id)) continue;
        const href = destination(item, config), link = node(href ? "a" : "span", item.label);
        link.dataset.productDestination = item.id;
        if (href) link.href = href;
        else { link.setAttribute("aria-disabled", "true"); link.append(node("small", authentication?.mustChangePassword ? "Change password first" : "Unavailable")); }
        if (item.id === surface) link.setAttribute("aria-current", "page");
        items.append(link);
      }
      if (index === groups.length - 1 && authentication?.signOut) {
        authentication.signOut.dataset.productDestination = "signout"; items.append(authentication.signOut);
      }
      setExpanded(section, !collapsed.has(groupKey(index)));
      if (items.children.length) menu.append(section);
    }
    if (previous) menu.querySelector(`[data-product-destination="${previous}"], [data-product-group="${previous}"]`)?.focus({preventScroll: true});
  }

  /**
   * Segmented switches: one shared thumb slides to the selected segment instead of
   * each segment repainting. Selection stays owned by the segments (aria-selected,
   * aria-pressed or a checked radio). Every two- and three-way switch in the product is
   * listed here; switches created later are enhanced as they are added to the page.
   */
  const segmentedControls = [
    ".product-sidebar-tabs", ".workspace-mode-toggle", ".notification-filters", ".capability-states",
    ".stream-mode-switch", ".parameter-value-format", ".theme-mode", ".mission-setting-segmented",
    ".capability-segments",
  ].join(", ");
  const isSegment = item => item.matches("button, label") && !item.hidden;
  const isSelected = item => item.getAttribute("aria-selected") === "true" || item.getAttribute("aria-pressed") === "true"
    || Boolean(item.querySelector?.(":scope > input:checked"));
  // Owners that re-render a switch on every change (e.g. permission rule rows) replace the
  // element. Remember each switch's last thumb so its replacement slides on from there.
  const lastThumb = new Map();
  const identity = control => [control.className, control.getAttribute("aria-label") || "",
    control.closest("[data-rule]")?.dataset.rule || control.dataset.settingControl || control.id || ""].join("|");
  // One scheduler for every switch: a frame measures all pending switches first and then
  // writes all thumbs, so a page with hundreds of switches never interleaves layout reads
  // and writes. Shared observers keep the per-switch cost to a WeakMap entry.
  const states = new WeakMap(), pending = new Set();
  let frame = 0;
  const queue = control => {
    if (!control || !states.has(control)) return;
    pending.add(control); if (!frame) frame = requestAnimationFrame(flush);
  };
  const owner = node => node?.closest?.("[data-segmented-motion]");
  const resizes = typeof ResizeObserver === "function"
    ? new ResizeObserver(entries => { for (const entry of entries) queue(owner(entry.target)); }) : null;
  const mutations = typeof MutationObserver === "function" ? new MutationObserver(records => {
    for (const record of records) if (!record.target.classList?.contains("segmented-thumb")) queue(owner(record.target));
  }) : null;
  function measure(control) {
    const state = states.get(control);
    if (!control.isConnected) return null;
    const segments = [...control.children].filter(isSegment);
    for (const item of segments) if (!state.watched.has(item)) { state.watched.add(item); resizes?.observe(item); }
    const selected = segments.find(isSelected);
    if (!selected || !selected.offsetWidth) return {control, state, hidden: true};
    return {control, state, key: identity(control), radius: getComputedStyle(selected).borderRadius, target: {
      width: selected.offsetWidth + "px", height: selected.offsetHeight + "px",
      transform: `translate(${selected.offsetLeft}px, ${selected.offsetTop}px)`}};
  }
  function flush() {
    frame = 0;
    const plans = [...pending].map(measure).filter(Boolean); pending.clear();
    const instant = [];
    for (const plan of plans) {
      const {control, state} = plan, thumb = state.thumb;
      if (thumb.parentNode !== control) control.prepend(thumb);
      if (plan.hidden) { thumb.style.opacity = "0"; state.placed = false; continue; }
      if (state.placed) continue;
      // First placement (or reappearance) jumps, unless this switch replaced one whose thumb
      // sat elsewhere; then it starts there and slides to the new selection.
      const previous = lastThumb.get(plan.key);
      plan.slideFrom = previous && performance.now() - previous.at < 60000 && previous.transform !== plan.target.transform;
      thumb.classList.add("is-instant");
      Object.assign(thumb.style, {opacity: "1", borderRadius: plan.radius},
        plan.slideFrom ? {width: previous.width, height: previous.height, transform: previous.transform} : plan.target);
      instant.push(thumb); state.placed = true;
    }
    if (instant.length) instant[0].getBoundingClientRect(); // One layout commits every jump.
    for (const thumb of instant) thumb.classList.remove("is-instant");
    for (const plan of plans) {
      if (plan.hidden) continue;
      Object.assign(plan.state.thumb.style, {opacity: "1", borderRadius: plan.radius, ...plan.target});
      lastThumb.set(plan.key, {...plan.target, at: performance.now()});
    }
    if (lastThumb.size > 5000) lastThumb.delete(lastThumb.keys().next().value);
  }
  function segmented(control) {
    if (!control || states.has(control)) return;
    const thumb = node("span", null, "segmented-thumb"); thumb.setAttribute("aria-hidden", "true");
    states.set(control, {thumb, placed: false, watched: new WeakSet()});
    control.dataset.segmentedMotion = ""; control.prepend(thumb);
    resizes?.observe(control);
    mutations?.observe(control, {subtree: true, childList: true, attributes: true,
      attributeFilter: ["aria-selected", "aria-pressed", "hidden", "disabled", "class", "checked"]});
    // Radio selection changes a property, not an attribute.
    control.addEventListener("change", () => queue(control));
    control.segmentedMotion = {refresh: () => queue(control)};
    queue(control);
  }
  function enhanceSegmented(root = document) {
    if (root.matches?.(segmentedControls)) segmented(root);
    root.querySelectorAll?.(segmentedControls).forEach(segmented);
  }
  let watching = false;
  function watchSegmented() {
    if (watching || typeof MutationObserver !== "function" || !document.body) return;
    watching = true;
    // Batch additions per frame so streaming transcripts never pay a query per node.
    let pending = new Set(), frame = 0;
    const flush = () => {
      frame = 0; const roots = pending; pending = new Set();
      for (const root of roots) if (root.isConnected) enhanceSegmented(root);
    };
    new MutationObserver(records => {
      for (const record of records) for (const added of record.addedNodes) if (added.nodeType === 1) pending.add(added);
      if (pending.size && !frame) frame = requestAnimationFrame(flush);
    }).observe(document.body, {childList: true, subtree: true});
  }

  /** Switch existing contextual DOM and canonical app destinations in one sidebar. */
  function compose(host, contextual, {surface, label = "Sections", config = context()} = {}) {
    const tabs = node("div", null, "product-sidebar-tabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Sidebar view");
    const app = node("nav", null, "product-navigation-menu"); app.id = "product-navigation-menu"; app.setAttribute("aria-label", "App navigation");
    app.dataset.uiFindIgnore = "";
    const content = node("div", null, "product-sidebar-context"); content.dataset.productContext = "";
    if (contextual) content.append(contextual);
    const controls = new Map();
    const saved = window.SMTOUiSession?.get("product_sidebar_views", {}) || {};
    let current = contextual ? saved[preferenceKey(surface)] || "context" : "app";
    function select(view, focus = false) {
      current = contextual && view === "context" ? "context" : "app";
      app.hidden = current !== "app"; content.hidden = current !== "context";
      for (const [key, control] of controls) { control.setAttribute("aria-selected", String(current === key)); control.tabIndex = current === key ? 0 : -1; }
      window.SMTOUiSession?.set("product_sidebar_views", {...window.SMTOUiSession.get("product_sidebar_views", {}), [preferenceKey(surface)]: current});
      if (focus) controls.get(current)?.focus();
    }
    if (contextual) {
      for (const [key, title, panel] of [["app", "App", app], ["context", label, content]]) {
        const control = node("button", title); control.type = "button"; control.id = `product-sidebar-${key}-tab`;
        panel.id ||= `product-sidebar-${key}`; panel.setAttribute("role", "tabpanel"); panel.setAttribute("aria-labelledby", control.id);
        control.setAttribute("role", "tab"); control.setAttribute("aria-controls", panel.id);
        control.addEventListener("click", () => select(key)); controls.set(key, control); tabs.append(control);
      }
      tabs.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); select(event.key === "Home" ? "app" : event.key === "End" ? "context" : current === "app" ? "context" : "app", true);
      });
      host.append(tabs); segmented(tabs);
    }
    host.append(app, content); renderDestinations(app, surface, config); select(current);
    return {select, render: () => renderDestinations(app, surface, config), app, content};
  }

  function mount(header, options = {}) {
    if (!header || header.productNavigation) return header?.productNavigation;
    const surface = header.dataset.productSurface, config = {...context(), ...options};
    const trigger = header.querySelector("[data-product-menu-trigger]"), search = header.querySelector("[data-product-search]");
    if (!trigger) return;
    trigger.setAttribute("aria-label", "Navigation"); trigger.title = "Navigation";
    trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>';
    const contextual = document.querySelector({settings:"#settings-section-nav", "system-health":"#health-section-nav", appearance:"#theme-navigation", runtime:"#runtime-nav", inference:"#inference-nav", manual:"#manual-nav"}[surface] || "[data-product-context-source]");
    const oldHost = contextual?.parentElement;
    if (oldHost && surface !== "manual") oldHost.hidden = true;
    if (contextual) document.body.dataset.productContextMoved = surface;
    const panel = node("aside", null, "product-sidebar"); panel.id = "product-sidebar"; panel.setAttribute("aria-label", "Navigation");
    const heading = node("div", null, "product-sidebar-heading"), title = node("strong", "Navigation"), closeButton = node("button");
    closeButton.type = "button"; closeButton.setAttribute("aria-label", "Close navigation"); closeButton.title = "Close navigation";
    closeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'; heading.append(title, closeButton); panel.append(heading);
    const view = compose(panel, contextual, {surface, config});
    document.body.append(panel);
    const dialog = node("dialog", null, "product-sidebar-dialog"); dialog.setAttribute("aria-label", "Navigation"); dialog.dataset.uiFindNavigation = ""; document.body.append(dialog);
    const wide = matchMedia("(min-width: 1100px)");
    const saved = window.SMTOUiSession?.get("product_sidebar_visible", {}) || {};
    let visible = wide.matches && (saved[preferenceKey(surface)] ?? true), openedBy = trigger;
    trigger.setAttribute("aria-controls", panel.id);
    function renderLayout() {
      const focused = panel.contains(document.activeElement) ? document.activeElement : null;
      if (wide.matches) {
        if (dialog.open) dialog.close(); document.body.append(panel); panel.hidden = !visible;
      } else {
        dialog.append(panel); panel.hidden = false;
        if (visible && !dialog.open) dialog.showModal(); else if (!visible && dialog.open) dialog.close();
      }
      document.body.classList.toggle("product-sidebar-docked", visible && wide.matches);
      trigger.setAttribute("aria-expanded", String(visible));
      if (focused && visible) focused.focus({preventScroll: true});
      else if (focused) trigger.focus({preventScroll: true});
    }
    function close(restoreFocus = true, onlyTemporary = false) {
      if (onlyTemporary && wide.matches) return;
      visible = false; window.SMTOUiSession?.set("product_sidebar_visible", {...window.SMTOUiSession.get("product_sidebar_visible", {}), [preferenceKey(surface)]: false});
      renderLayout(); if (restoreFocus) (openedBy?.isConnected ? openedBy : trigger).focus({preventScroll: true});
    }
    function open({view: selectedView, focus = true} = {}) {
      openedBy = document.activeElement; visible = true;
      if (selectedView) view.select(selectedView);
      window.SMTOUiSession?.set("product_sidebar_visible", {...window.SMTOUiSession.get("product_sidebar_visible", {}), [preferenceKey(surface)]: true});
      const current = panel.querySelector('a[aria-current="page"]');
      const landing = current?.closest(".product-navigation-group.is-collapsed")?.querySelector(".product-navigation-toggle") || current;
      renderLayout(); if (focus) (panel.querySelector('[role="tab"][aria-selected="true"]') || landing || closeButton).focus({preventScroll: true});
    }
    trigger.addEventListener("click", () => visible ? close() : open()); closeButton.addEventListener("click", () => close());
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    dialog.addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex]')]
        .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[hidden],[inert]'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    });
    dialog.addEventListener("click", event => { if (event.target === dialog) { const b=panel.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) close(); } });
    panel.addEventListener("click", event => { const link = event.target.closest("a"); if (link && new URL(link.href).pathname === location.pathname && link.hash) close(false, true); });
    search?.addEventListener("click", () => { close(false, true); if (options.search) return options.search(); const input=document.querySelector(header.dataset.productSearchTarget || "[data-product-search-field]"); if(input?.getClientRects().length && !input.closest("[hidden]")) input.focus(); else window.SMTOUiFind?.open(); });
    wide.addEventListener("change", () => { visible = wide.matches && (window.SMTOUiSession?.get("product_sidebar_visible", {})[preferenceKey(surface)] ?? true); renderLayout(); }); renderLayout();
    controller = header.productNavigation = {close, open, select: view.select, render: view.render}; return controller;
  }
  window.SMTOProductNavigation = Object.freeze({destinations, groups, mount, compose, preferenceKey, segmented,
    open: options => controller?.open(options), close: options => controller?.close(options?.restoreFocus !== false, true),
    setAuthentication(value) {
      // The session is re-verified every 15 seconds; rebuilding the whole menu for an unchanged
      // identity restyles the page for nothing.
      const same = authentication && value && Object.keys(value).length === Object.keys(authentication).length
        && Object.keys(value).every(key => authentication[key] === value[key]);
      authentication = value;
      if (same) return;
      controller?.render(); window.dispatchEvent(new Event("smto:product-authentication"));
    },
  });
  function init() { mount(document.querySelector("[data-product-surface]")); enhanceSegmented(); watchSegmented(); window.dispatchEvent(new Event("smto:product-navigation-ready")); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once: true}); else init();
})();
