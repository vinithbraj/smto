/**
 * Provide shared browser appearance, branding, Settings preference transport, Manual links and
 * error-toast helpers for controller pages. Resolve local theme overrides over shared settings,
 * coordinate local theme timing and use the canonical error presenter for API failures. Page
 * controllers own their drafts and lifecycle; these shared listeners and presentation services
 * last for the document lifetime.
 */
(() => {
  "use strict";

  const apiBase = "/api/agent";
  const themeModeNames = Object.freeze(["manual", "auto_day_night", "system"]);
  const defaultSettings = Object.freeze({ ui_theme: "light", ui_theme_mode: "manual" });
  const session = window.SMTOUiSession;
  let appearanceSettings = {}, autoThemeTimer = null;
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  systemTheme.addEventListener("change", () => {
    if (appearanceSettings.ui_theme_mode === "system" || themeOverride() === "system") applyAgentAppearance();
  });

  /**
   * Read the browser theme preference from the shared theme owner, falling back to the older
   * UI-session key when that owner is absent.
   */
  const themeOverride = () => (window.SMTOThemePreference ? window.SMTOThemePreference.get() : session.get("theme"))
    ?? (document.documentElement.hasAttribute("data-mobile-appearance") ? "system" : undefined);
  /**
   * Resolve the displayed light/dark variant: an explicit browser choice, including System, takes
   * precedence over shared theme settings.
   */
  function canonicalAgentAppearance(settings = {}, override = themeOverride()) {
    if (override === "system") return systemTheme.matches ? "dark" : "light";
    return ["light", "dark"].includes(override) ? override : effectiveThemeName(settings);
  }

  /**
   * Apply branding, resolved theme, font/contrast and animation/display flags to this document.
   * Replace the one automatic day/night timer when no browser override exists, then announce
   * smto:appearance. These presentation changes do not persist server preferences.
   */
  function applyAgentAppearance(settings = appearanceSettings) {
    appearanceSettings = settings;
    window.SMTOBranding?.apply(settings);
    const root = document.documentElement;
    root.dataset.theme = canonicalAgentAppearance(settings);
    root.dataset.themePreference = normalizeThemeName(settings.ui_theme);
    root.dataset.themeMode = normalizeThemeMode(settings.ui_theme_mode);
    window.SMTOAppearance?.apply(settings);
    root.dataset.waveletEnabled = String(settings.ui_wavelet_enabled === true);
    root.dataset.waveletTimelineEnabled = String(settings.ui_wavelet_timeline_enabled !== false);
    root.dataset.footerEnabled = String(settings.ui_footer_enabled === true);
    root.dataset.thinkingAnimation = settings.ui_thinking_animation || "rubiks-cube-monochrome";
    window.SMTOThinkingAnimations?.setPreference(settings.ui_thinking_animation);
    root.dataset.activityUpdateAnimation = settings.ui_activity_update_animation || "roll";
    window.SMTOActivityUpdates?.setPreference(settings.ui_activity_update_animation);
    root.dataset.numberAnimation = settings.ui_number_animation || "roll";
    window.SMTONumberOdometer?.setPreference(settings.ui_number_animation);
    clearTimeout(autoThemeTimer);
    if (root.dataset.themeMode === "auto_day_night" && !themeOverride()) {
      autoThemeTimer = setTimeout(() => applyAgentAppearance(), autoThemeNextChangeDelayMs());
    }
    window.dispatchEvent(new Event("smto:appearance"));
  }

  /**
   * Bind a node to the shared branding text projection, or set its plain text once when branding
   * is unavailable.
   */
  function bindBrandCopy(node, value) {
    const source = String(value ?? "");
    if (window.SMTOBranding) {
      return window.SMTOBranding.bindText(node, source, () => window.SMTOBranding.text(source));
    }
    node.textContent = source;
    return node;
  }

  /**
   * Subscribe auxiliary pages to shared appearance changes after DOM readiness. A request version
   * rejects older preference responses; failed reads keep the displayed state. Main chat and
   * Settings own their separate synchronization.
   */
  document.addEventListener("DOMContentLoaded", () => {
    const page = window.__BRANDING_UI__?.page;
    if (!["Scheduler", "Notifications", "Directory", "Parameter Store", "Memory Editor", "Console", "Themes", "Appearance", "Knowledge", "Prompt Editor", "User Skills", "Runtime"].includes(page)) return;
    let version = 0;
    window.SMTOUiUpdates?.subscribe(["settings.changed"], async () => {
      const request = ++version;
      try {
        const response = await (window.SMTOAuth?.fetch || window.fetch)("/api/agent/settings/preferences", {cache: "no-store"});
        if (!response.ok) return;
        const payload = await response.json();
        if (request === version) applyAgentAppearance(payload.settings);
      } catch (_) { /* Keep the last displayed identity while offline. */ }
    });
  });

  /**
   * Delegate a local theme choice to the shared preference owner; the compatibility path stores
   * the session value and reapplies appearance immediately.
   */
  function setThemeOverride(theme) {
    if (window.SMTOThemePreference) window.SMTOThemePreference.set(theme);
    else { session.set("theme", theme); applyAgentAppearance(); }
  }

  window.addEventListener("smto:theme-change", () => applyAgentAppearance());

  window.addEventListener("smto:appearance-saved", event => applyAgentAppearance(event.detail));

  window.addEventListener("pageshow", () => applyAgentAppearance());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) applyAgentAppearance(); });

  /**
   * Recognize non-null nonarray objects for payload handling; this is a shallow shape check, not
   * validation of prototypes or serializability.
   */
  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  /**
   * Normalize whitespace in labels/messages and return the supplied fallback for empty text.
   */
  function compactText(value, fallback = "") {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text || fallback;
  }

  /**
   * Show the secure-connection indicator only for an enabled, connected, non-outbound HTTPS
   * Gateway with pinned identity and recorded verification. This inspects projected fields; it
   * performs no certificate check or liveness probe.
   */
  function gatewayConnectionSecured(record) {
    return record?.enabled === true && record.status === "connected"
      && record.transport !== "outbound" && record.scheme === "https"
      && record.tls_trust_state === "pinned"
      && Boolean(record.tls_identity_spki_sha256 && record.tls_last_verified_at);
  }

  /**
   * Create an accessible lock SVG for a Gateway whose caller has already verified the display
   * predicate. The icon itself makes no trust decision.
   */
  function gatewayLockIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({class: "gateway-secure-lock", viewBox: "0 0 24 24",
      width: "14", height: "14", fill: "none", stroke: "currentColor", "stroke-width": "1.5",
      "stroke-linecap": "round", "stroke-linejoin": "round", role: "img",
      "aria-label": "Secure Gateway connection"})) svg.setAttribute(key, value);
    const title = document.createElementNS(svg.namespaceURI, "title");
    title.textContent = "Secure connection · Gateway identity verified";
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5Z");
    svg.append(title, path);
    return svg;
  }

  /**
   * Keep dark as dark and map every other legacy/missing theme name to the light variant.
   */
  function normalizeThemeName(value) {
    return value === "dark" ? "dark" : "light";
  }

  /**
   * Accept manual, automatic day/night or system mode case-insensitively, otherwise use a valid
   * supplied fallback or the manual default.
   */
  function normalizeThemeMode(value, fallback = defaultSettings.ui_theme_mode) {
    const candidate = compactText(value).toLowerCase();
    if (themeModeNames.includes(candidate)) {
      return candidate;
    }
    const safeFallback = compactText(fallback, defaultSettings.ui_theme_mode).toLowerCase();
    return themeModeNames.includes(safeFallback) ? safeFallback : defaultSettings.ui_theme_mode;
  }

  /**
   * Use the browser’s local hour: day is 06:00 inclusive to 18:00 exclusive. Invalid dates use
   * noon as a deterministic light-theme fallback.
   */
  function isAutoThemeDay(date = new Date()) {
    const hour = date instanceof Date && !Number.isNaN(date.getTime()) ? date.getHours() : 12;
    return hour >= 6 && hour < 18;
  }

  /**
   * Resolve the shared theme policy without a local browser override: system color scheme, local
   * day/night time or the normalized manual variant.
   */
  function effectiveThemeName(settings = {}, date = new Date()) {
    const safe = { ui_theme: normalizeThemeName(settings.ui_theme), ui_theme_mode: normalizeThemeMode(settings.ui_theme_mode) };
    if (safe.ui_theme_mode === "system") return systemTheme.matches ? "dark" : "light";
    if (safe.ui_theme_mode === "auto_day_night") {
      return isAutoThemeDay(date) ? "light" : "dark";
    }
    return normalizeThemeName(safe.ui_theme);
  }

  /**
   * Calculate the next local 06:00 or 18:00 transition with calendar setters, including the next
   * day when needed. Return at least one second and replace an invalid input date with the current
   * clock.
   */
  function autoThemeNextChangeDelayMs(date = new Date()) {
    const now = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const next = new Date(now.getTime());
    const hour = now.getHours();
    if (hour < 6) {
      next.setHours(6, 0, 0, 0);
    } else if (hour < 18) {
      next.setHours(18, 0, 0, 0);
    } else {
      next.setDate(next.getDate() + 1);
      next.setHours(6, 0, 0, 0);
    }
    return Math.max(1000, next.getTime() - now.getTime());
  }

  /**
   * Read the shared server Settings preferences through the common JSON transport; callers own
   * application and synchronization.
   */
  function fetchSettingsBackendPreferences() {
    return apiJson("/settings/preferences");
  }

  /**
   * PUT the supplied Settings preference patch through the common JSON transport. Return the
   * acknowledged payload without applying it locally.
   */
  function writeSettingsBackendPreferences({ settings }) {
    return apiJson("/settings/preferences", { method: "PUT", body: { settings } });
  }

  /**
   * Construct an Agent API path on the current origin and append nonempty query parameters as
   * strings. Return path/query only; callers pass API-relative paths, not arbitrary remote URLs.
   */
  function apiUrl(path, params = null) {
    const cleanPath = String(path || "").startsWith("/") ? String(path || "") : `/${path || ""}`;
    const url = new URL(`${apiBase}${cleanPath}`, window.location.origin);
    if (isPlainObject(params)) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return `${url.pathname}${url.search}`;
  }

  /**
   * Delegate document and port selection to the shared deployment-aware Manual link resolver; this
   * wrapper does not fetch the document.
   */
  function manualUrl(docId = "manual-home", port = "8013") {
    return window.SMTOManualLinks.manualUrl(docId, port);
  }

  /**
   * Fill hrefs on existing data-manual-link descendants from their document/port metadata, using
   * the document when no queryable root is supplied.
   */
  function hydrateManualLinks(root = document) {
    const scope = root && typeof root.querySelectorAll === "function" ? root : document;
    for (const link of scope.querySelectorAll("[data-manual-link]")) {
      const docId = link.dataset.manualDoc || "manual-home";
      const port = link.dataset.manualPort || "8013";
      link.href = manualUrl(docId, port);
    }
  }

  /**
   * Parse an HTTP body into legacy error text, preferring canonical ID/short description and
   * validation details, with raw text or status fallback. This retained helper is not used by the
   * current apiFetch path and does not perform display masking.
   */
  async function errorMessageFromResponse(response) {
    let text = "";
    try {
      text = await response.text();
    } catch (_error) {
      return `HTTP ${response.status}`;
    }
    if (!text) {
      return `HTTP ${response.status}`;
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error_detail?.error_id) return `${parsed.error_detail.error_id} · ${parsed.error_detail.short_description}`;
      const detail = parsed && parsed.detail;
      if (Array.isArray(detail)) {
        return detail
          .map((item) => compactText(item?.msg || item?.message || item))
          .filter(Boolean)
          .join("; ") || text;
      }
      if (isPlainObject(detail)) {
        return compactText(detail.message || detail.error || JSON.stringify(detail), text);
      }
      return compactText(detail || parsed.message || parsed.error, text);
    } catch (_error) {
      return text;
    }
  }

  /**
   * Build no-store Agent API requests, serialize object bodies as JSON and use the shared
   * error-aware fetch wrapper. On a rejected EULA response announce the legal flow, then throw the
   * canonical response error; successful responses remain unconsumed for the caller.
   */
  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const init = { ...options, headers, cache: options.cache || "no-store" };
    delete init.params;
    if (init.body !== undefined && isPlainObject(init.body)) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(init.body);
    }
    const response = await window.SMTOErrors.fetch(apiUrl(path, options.params), init);
    if (!response.ok) {
      if (response.status === 403) {
        const rejection = await response.clone().json().catch(() => ({}));
        if (rejection.detail?.error_kind === "eula_acceptance_required") {
          window.dispatchEvent(new Event("smto:eula-required"));
        }
      }
      throw await window.SMTOErrors.fromResponse(response);
    }
    return response;
  }

  /**
   * Read a successful API response as validated JSON, treating 204 as an empty object. Transport,
   * HTTP and malformed-payload errors retain the shared error owner’s semantics.
   */
  async function apiJson(path, options = {}) {
    const response = await apiFetch(path, options);
    if (response.status === 204) {
      return {};
    }
    return window.SMTOErrors.readJson(response);
  }

  /**
   * Install the toast presentation stylesheet once per document, including keyboard focus and
   * reduced-motion treatment. The embedded CSS is executable presentation data and remains
   * unchanged by documentation edits.
   */
  function ensureUiErrorToastStyles() {
    if (!document?.head || document.getElementById("smto-ui-error-toast-styles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "smto-ui-error-toast-styles";
    style.textContent = `
      .ui-error-toast-region {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 220;
        display: grid;
        gap: 10px;
        width: min(420px, calc(100vw - 36px));
        max-height: calc(100dvh - 36px);
        overflow-y: auto;
        pointer-events: auto;
      }
      .ui-error-toast {
        position: relative;
        pointer-events: auto;
        border: 1px solid var(--border-strong, var(--line));
        border-radius: 12px;
        background: var(--bg);
        box-shadow: var(--shadow);
        color: var(--text);
        padding: 15px 44px 15px 17px;
        font: calc(12px * var(--ui-font-scale, 1))/1.55 var(--ui-font);
        animation: ui-error-toast-in 180ms ease-out;
      }
      .ui-error-toast strong {
        display: block;
        margin-bottom: 3px;
        color: var(--text);
        font-size: calc(13px * var(--ui-font-scale, 1));
        font-weight: 600;
      }
      .ui-error-toast span {
        display: block;
      }
      .ui-toast-close {
        position: absolute;
        top: 4px;
        right: 4px;
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        min-width: 32px;
        min-height: 32px;
        margin: 0;
        padding: 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--text-secondary, var(--muted));
        cursor: pointer;
      }
      .ui-toast-close:hover { background: var(--surface-hover, var(--surface)); color: var(--text); }
      .ui-toast-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .ui-toast-close svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
      @keyframes ui-error-toast-in {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .ui-error-toast { animation: none; }
      }
    `;
    document.head.append(style);
  }

  /**
   * Create an accessible close button with fixed SVG markup and the caller’s dismissal callback;
   * ensure shared styles exist.
   */
  function toastCloseButton(onClose) {
    ensureUiErrorToastStyles();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ui-toast-close";
    button.title = "Close notification";
    button.setAttribute("aria-label", "Close notification");
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    button.addEventListener("click", onClose);
    return button;
  }

  /**
   * Lazily create or reuse the document’s assertive notification region; return null if the body
   * does not yet exist.
   */
  function ensureUiErrorToastRegion() {
    if (!document?.body) {
      return null;
    }
    let region = document.getElementById("ui-error-toast-region");
    if (region) {
      return region;
    }
    ensureUiErrorToastStyles();
    region = document.createElement("div");
    region.id = "ui-error-toast-region";
    region.className = "ui-error-toast-region";
    region.setAttribute("aria-live", "assertive");
    region.setAttribute("aria-atomic", "false");
    document.body.append(region);
    return region;
  }

  /**
   * Resolve a selector or focusable object supplied by a caller for error feedback. Invalid
   * selector syntax can throw; arbitrary strings are not treated as element IDs.
   */
  function resolveUiErrorField(field) {
    if (!field) {
      return null;
    }
    if (typeof field === "string") {
      return document.querySelector(field);
    }
    return typeof field.focus === "function" ? field : null;
  }

  /**
   * Mark and focus the specified field, then clear aria-invalid on its next input and change
   * events. This feedback does not change the field value or browser validity constraints.
   */
  function markUiErrorField(field) {
    const target = resolveUiErrorField(field);
    if (!target) {
      return;
    }
    target.setAttribute("aria-invalid", "true");
    /**
     * Clear the temporary accessibility invalid marker after an edit; each registered event
     * listener removes itself after firing.
     */
    const clearInvalid = () => target.removeAttribute("aria-invalid");
    target.addEventListener("input", clearInvalid, { once: true });
    target.addEventListener("change", clearInvalid, { once: true });
    target.focus({ preventScroll: false });
  }

  /**
   * Create a text-based error toast, optionally delegate canonical detail to the shared presenter
   * and focus/mark an associated field. Errors remain until dismissed unless a caller explicitly
   * supplies a positive timeout. Return the node, or null before body creation. Plain
   * message/fix text is not credential-masked here.
   */
  function notifyUiError(input = {}, options = {}) {
    const source = typeof input === "string" ? { message: input } : (input instanceof Error || isPlainObject(input) ? input : {});
    const title = compactText(source.title, "Action failed");
    const message = compactText(source.message || source.detail || source.error, "The action could not be completed.");
    const fix = compactText(source.fix);
    const region = ensureUiErrorToastRegion();
    markUiErrorField(source.field);
    if (!region) {
      return null;
    }
    const toast = document.createElement("div");
    toast.className = "ui-error-toast";
    toast.dataset.level = "error";
    toast.setAttribute("role", "alert");
    const content = document.createElement("div");
    const titleNode = document.createElement("strong");
    titleNode.textContent = title;
    const messageNode = document.createElement("span");
    messageNode.textContent = fix ? `${message} Fix: ${fix}` : message;
    content.append(titleNode, messageNode);
    if (source.error_detail || source.error_ref || source.error?.error_detail) {
      window.SMTOErrors?.present(content, source.error || source, {profile: "toast"});
    }
    let timer = null;
    /**
     * Cancel this toast’s pending timeout and remove only its own node, allowing the same callback
     * for manual and automatic dismissal.
     */
    const dismiss = () => { clearTimeout(timer); toast.remove(); };
    toast.append(content, toastCloseButton(dismiss));
    region.prepend(toast);
    const timeout = Number(options.persistMs ?? source.persistMs ?? 0);
    if (timeout > 0) {
      timer = window.setTimeout(dismiss, timeout);
    }
    return toast;
  }

  /** One queued, text-only confirmation pattern. Native dialogs own focus containment;
   * cancellation resolves without mutation, including Escape. The safe action gets focus.
   * Browser beforeunload prompts remain browser-owned. */
  let confirmationQueue = Promise.resolve();
  function confirmAction({title = "Confirm action", message, accept = "Continue", cancel = "Cancel", destructive = false, input = null, choices = null} = {}) {
    const show = () => new Promise(resolve => {
      const opener = document.activeElement;
      const dialog = document.createElement("dialog"); dialog.className = "appearance-dialog ui-confirm-dialog";
      const heading = document.createElement("h2"), description = document.createElement("p");
      heading.id = "ui-confirm-title"; heading.textContent = title;
      description.id = "ui-confirm-description"; description.textContent = message || "";
      dialog.setAttribute("aria-labelledby", heading.id); dialog.setAttribute("aria-describedby", description.id);
      const form = document.createElement("form"); form.method = "dialog";
      form.append(heading, description);
      let field = null;
      if (input) {
        const label = document.createElement("label"); label.textContent = input.label || "Name";
        field = document.createElement("input"); field.type = "text"; field.value = input.value || "";
        field.required = true; field.maxLength = input.maxLength || 240;
        label.append(field); form.append(label);
      }
      const actions = document.createElement("div"); actions.className = "ui-confirm-actions";
      const keep = document.createElement("button"), proceed = document.createElement("button");
      keep.type = "button"; keep.textContent = cancel; keep.autofocus = true;
      proceed.type = "submit"; proceed.textContent = accept; proceed.className = "ui-confirm-accept";
      proceed.dataset.destructive = String(destructive);
      let value = input ? null : false;
      keep.addEventListener("click", () => dialog.close());
      form.addEventListener("submit", event => {
        event.preventDefault();
        if (field && !field.value.trim()) { field.setCustomValidity("Enter a name."); field.reportValidity(); return; }
        value = field ? field.value.trim() : true; dialog.close();
      });
      field?.addEventListener("input", () => field.setCustomValidity(""));
      dialog.addEventListener("close", () => {
        dialog.remove(); if (opener?.isConnected) opener.focus({preventScroll: true}); resolve(value);
      }, {once: true});
      actions.append(keep);
      if (choices) {
        for (const choice of choices) {
          const control = document.createElement("button"); control.type = "button";
          control.textContent = choice.label; control.className = "ui-confirm-accept"; control.dataset.destructive = String(!!choice.destructive);
          control.addEventListener("click", () => { value = choice.value; dialog.close(); });
          actions.append(control);
        }
      } else actions.append(proceed);
      form.append(actions); dialog.append(form); document.body.append(dialog); dialog.showModal();
    });
    const pending = confirmationQueue.then(show); confirmationQueue = pending.catch(() => {}); return pending;
  }

  window.SMTOAgentUi = Object.freeze({
    confirm: confirmAction,
    bindBrandCopy,
    canonicalAgentAppearance,
    applyAgentAppearance,
    setThemeOverride,
    apiJson,
    compactText,
    gatewayConnectionSecured,
    gatewayLockIcon,
    hydrateManualLinks,
    manualUrl,
    fetchSettingsBackendPreferences,
    normalizeThemeMode,
    notifyUiError,
    toastCloseButton,
    autoThemeNextChangeDelayMs,
    effectiveThemeName,
    writeSettingsBackendPreferences,
  });

  // Values and writes stay with their original controllers. Only leave decisions
  // are shared. No draft, password or request data enters preference storage.
  const editors = new Set();
  let leavePending = null, leaveOwners = null, approvedNavigation = false;
  async function leaveEditor(owner) {
    while (true) {
      if (owner.state().busy) {
        if (!owner.whenIdle) return false;
        try { await owner.whenIdle(); } catch (_) { /* inspect retained state below */ }
      }
      const state = owner.state();
      if (state.busy) return false;
      if (!state.dirty && !state.error) return true;
      if (owner.mode !== "autosave") {
        const discard = await confirmAction({title: "Discard unsaved changes?", message: "Your changes have not been saved.", cancel: "Keep editing", accept: "Discard changes", destructive: true});
        if (discard) owner.discard?.();
        else owner.focusProblem?.();
        return !!discard;
      }
      let failure;
      try {
        await owner.flush();
        const after = owner.state();
        if (!after.dirty && !after.busy && !after.error) return true;
        failure = after.invalid ? "Correct the highlighted fields before saving." : "Some changes could not be saved.";
      } catch (error) { failure = error.message || "Some changes could not be saved."; }
      const choice = await confirmAction({title: "Changes are not saved", message: failure, cancel: "Keep editing", choices: [
        {label: "Retry save", value: "retry"}, {label: "Leave without saving", value: "leave", destructive: true},
      ]});
      if (choice === "retry") continue;
      if (choice === "leave") { owner.discard?.(); return true; }
      owner.focusProblem?.(); return false;
    }
  }
  function requestLeave(owners = [...editors]) {
    if (leavePending) { owners.forEach(owner => leaveOwners.add(owner)); return leavePending; }
    leaveOwners = new Set(owners);
    leavePending = (async () => {
      for (const owner of leaveOwners) if (!(await leaveEditor(owner))) return false;
      return true;
    })().finally(() => { leavePending = null; leaveOwners = null; });
    return leavePending;
  }
  window.SMTOEditLifecycle = Object.freeze({
    register(owner) {
      editors.add(owner);
      return {requestLeave: () => requestLeave([owner]), dispose: () => editors.delete(owner)};
    },
    requestLeave: () => requestLeave(),
  });
  function passwordCompletion() {
    try {
      if (sessionStorage.getItem("smto.account.passwordChanged") !== "1") return;
      sessionStorage.removeItem("smto.account.passwordChanged");
      const notice = document.createElement("p"); notice.role = "status"; notice.className = "account-completion";
      notice.textContent = "Password changed. Your other sessions have been signed out.";
      (document.querySelector("main") || document.body).prepend(notice);
    } catch (_) { /* Storage may be disabled. */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", passwordCompletion, {once: true});
  else passwordCompletion();
  const needsGuard = () => [...editors].some(owner => { const state = owner.state(); return state.dirty || state.busy || state.error; });
  window.addEventListener("pageshow", () => { approvedNavigation = false; });
  window.addEventListener("beforeunload", event => {
    if (!approvedNavigation && needsGuard()) { event.preventDefault(); event.returnValue = ""; }
  });
  document.addEventListener("click", event => {
    const link = event.target.closest?.("a[href]");
    if (!link || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.download || (link.target && link.target !== "_self") || !needsGuard()) return;
    const target = new URL(link.href, location.href);
    if (!["http:", "https:"].includes(target.protocol) || (target.origin === location.origin && target.pathname === location.pathname && target.search === location.search && target.hash)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void requestLeave().then(allowed => { if (allowed) { approvedNavigation = true; location.assign(target.href); } });
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => hydrateManualLinks(), { once: true });
  } else {
    hydrateManualLinks();
  }
})();
