/* Tiny tab-local preferences only. Drafts, credentials and run authority live elsewhere. */
(() => {
  "use strict";
  if (window.SMTOUiSession) return;
  const KEY = "smto.agentUi.sessionUi.v1";
  const oneOf = values => value => values.includes(value) ? value : undefined;
  const boolean = value => typeof value === "boolean" ? value : undefined;
  const text = limit => value => typeof value === "string" && value.length <= limit
    && !/[\x00-\x1f\x7f]/.test(value) ? value : undefined;
  const sidebarMap = values => value => value && !Array.isArray(value) && typeof value === "object"
    && Object.keys(value).length <= 32 && Object.entries(value).every(([key, item]) => /^[a-z][a-z0-9_-]{0,31}$/.test(key) && values.includes(item)) ? {...value} : undefined;
  const validators = Object.freeze({
    product_sidebar_views: sidebarMap(["app", "context"]),
    product_sidebar_visible: sidebarMap([true, false]),
    settings_selected_section: value => typeof value === "string" && /^settings-section-[a-z0-9_-]{1,48}$/.test(value) ? value : undefined,
    waveform_expanded: boolean,
    waveform_mode: oneOf(["trace", "tokens"]),
    waveform_palette: oneOf(["teal-blue", "purple-red"]),
    prompt_queue_expanded: boolean,
    composer_expanded: boolean,
    composer_controls_expanded: boolean,
    // Starting value of View → Merge prompt for conversations without their own choice (off).
    merge_prompt_default: boolean,
    agent_responses_expanded: boolean,
    conversation_pane_visible: boolean,
    conversation_pane_docked: boolean,
    header_pinned: boolean,
    conversation_width_pinned: boolean,
    palette_shortcut_enabled: boolean,
    palette_shortcut: text(64),
    palette_open_behavior: oneOf(["current", "new"]),
    conversation_pane_width: value => typeof value === "number" && Number.isFinite(value)
      ? Math.round(Math.max(300, Math.min(560, value))) : undefined,
    theme: oneOf(["light", "dark"]),
    conversation_sort: oneOf(["recent", "oldest", "title", "best_match"]),
    conversation_status: oneOf(["", "completed", "needs_approval", "needs_input", "running", "interrupted", "failed", "cancelled", "multi_turn", "has_response"]),
    conversation_pinned: boolean,
    conversation_task_type: oneOf(["", "normal", "scheduled"]),
    schedule_status: oneOf(["all", "active", "paused", "cancelled", "completed", "failed"]),
    schedule_sort: oneOf(["next", "updated", "name"]),
    notification_status: oneOf(["all", "unread", "read", "dismissed"]),
    settings_open_sections: value => Array.isArray(value) && value.length <= 128
      && value.every(id => typeof id === "string" && /^settings-section-[a-z0-9_-]{1,48}$/.test(id))
      ? [...new Set(value)] : undefined,
    navigation_collapsed_groups: value => Array.isArray(value) && value.length <= 64
      && value.every(id => typeof id === "string" && /^[a-z][a-z0-9_-]{0,23}:[a-z0-9_-]{1,48}$/.test(id))
      && value.join("").length <= 2048 ? [...new Set(value)] : undefined,
    editor_scope: text(160),
  });
  let state = {schema_version: 1};
  function persist() {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); }
    catch (_) { /* Keep the current page's in-memory preferences without repeated notices. */ }
  }
  function restore() {
    let raw;
    try { raw = sessionStorage.getItem(KEY); }
    catch (_) { return; /* Unavailable storage must preserve in-memory choices. */ }
    state = {schema_version: 1};
    try {
      const saved = raw && raw.length <= 16384 ? JSON.parse(raw) : null;
      if (saved?.schema_version === 1 && !Array.isArray(saved)) {
        for (const [key, validate] of Object.entries(validators)) {
          const value = validate(saved[key]);
          if (value !== undefined) state[key] = value;
        }
      }
    } catch (_) { /* Invalid JSON is replaced with an empty preference object. */ }
    if (raw) persist(); // Drop malformed/unknown fields; never echo arbitrary storage.
  }
  restore();
  // Retire browser-wide overrides. New tabs start from current durable defaults.
  for (const key of ["theme", "modelSelection", "behaviorEffort", "conversations.width", "conversations.docked", "settings"]) {
    try { localStorage.removeItem(`smto.agentUi.${key}`); } catch (_) {}
  }
  window.addEventListener("pageshow", event => { if (event.persisted) restore(); });
  window.SMTOUiSession = Object.freeze({
    get: (key, fallback) => Object.hasOwn(validators, key) ? state[key] ?? fallback : fallback,
    set(key, value) {
      if (!Object.hasOwn(validators, key)) return;
      const safe = validators[key](value);
      if (safe === undefined) delete state[key];
      else state[key] = safe;
      persist();
    },
  });
})();
