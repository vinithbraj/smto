/**
 * @file src/agent_runtime/api/static/agent_ui/error_presenter.js
 * @brief Render desktop error cards and dependency-repair notification guidance.
 * @details
 * Responsibilities: Project server error identities into full/compact/toast cards;
 * dependency repair copy also appears in desktop notifications and repair toasts.
 * Boundaries: Presentation does not retry operations or grant permission. Mobile
 * owns a separate presenter with different notification and help-link behavior.
 * Lifecycle: Loaded as a desktop global before app.js; mount replaces only the
 * host-owned error slot. Asynchronous lookups update only connected hosts.
 * State: A 128-entry lookup cache stores promises; failed lookups are evicted.
 * Security: Text nodes prevent markup execution; bounded heuristic masking reduces
 * credential-like display fragments but is not a complete secret detector. Canonical
 * server redaction and execution arguments remain outside this presentation module.
 * Collaborators: ErrorDefinitions supplies public catalog copy, Branding adapts
 * display text, and ManualLinks supplies deployment-aware help URLs when loaded.
 * Public surface: SMTOErrors exposes rendering, response parsing and fetch
 * wrappers. AbortError propagates; network failures do not trigger automatic retry.
 * Compatibility: Preserve the global name, canonical IDs and legacy-string fallback.
 * @see src/error_catalog/http_boundary.py
 * @see src/agent_runtime/api/static/agent_ui/index.html
 * @see src/agent_runtime/api/static/agent_ui/mobile/errors.js
 */
(() => {
  "use strict";
  const cache = new Map();
  const presentations = new WeakMap();
  const definitions = new Map();
  for (const definition of window.SMTOErrorDefinitions || []) {
    for (const ref of [definition.error_id, definition.error_guid, definition.slug, ...(definition.aliases?.error_kinds || [])]) definitions.set(ref, definition);
  }
  /** Bound display text and mask credential-like fragments; never use this projection as execution input. */
  const safe = (value, limit = 4000) => String(value ?? "").slice(0, limit)
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, "[redacted private key]")
    .replace(/(authorization\s*:?\s*(?:bearer|basic)\s+)[^\s,;]+/gi, "$1[redacted]")
    .replace(/(\bbearer\s+)[^\s,;]+|(\bbasic\s+)[a-z0-9+/]{12,}={0,2}/gi, (_match, bearer, basic) => `${bearer || basic}[redacted]`)
    .replace(/(["']?(?:authorization|proxy-authorization|cookie|set-cookie)["']?\s*:\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n]+)/gi, "$1[redacted]")
    .replace(/((?:[\w-]*(?:password|passwd|passphrase|token|secret|credential|api[_-]?key|cookie)[\w-]*)["']?\s*[=:]\s*)(?:"(?:\\.|[^"\r\n])*"|'(?:\\.|[^'\r\n])*'|[^\s,;&}]+)/gi, "$1[redacted]")
    .replace(/(--(?:password|token|secret|api-key)\s+)(?:"[^"]*"|'[^']*'|\S+)/gi, "$1[redacted]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, "$1[redacted]@");
  /** Create an unattached text-only node; callers own insertion, focus and removal. */
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = safe(text);
    if (className) node.className = className;
    return node;
  };

  /** Resolve only exact server-owned identities, keeping catalog copy out of browser code. */
  async function lookup(ref) {
    if (definitions.has(ref)) return definitions.get(ref);
    if (!cache.has(ref)) {
      if (cache.size >= 128) cache.delete(cache.keys().next().value);
      cache.set(ref, (window.SMTOAuth?.fetch || window.fetch)(`/api/agent/errors/${encodeURIComponent(ref)}`).then(async response => {
        if (!response.ok) throw new Error("SMTO-SYS-0001");
        return response.json();
      }).catch(error => { cache.delete(ref); throw error; }));
    }
    return cache.get(ref);
  }

  /** Build a synchronous field error from the generated canonical UI subset. */
  function error(ref, facts = {}) {
    const definition = definitions.get(ref);
    const failure = new Error(definition ? `${definition.error_id} · ${displayCopy(definition.short_description)}` : "SMTO-SYS-0001");
    failure.error_ref = ref;
    if (definition) {
      const runtimeFacts = {};
      for (const name of ["field", "minimum", "maximum", "exclusiveMinimum", "expected"]) {
        if (["string", "number", "boolean"].includes(typeof facts[name])) runtimeFacts[name] = safe(facts[name], 200);
      }
      failure.error_detail = {...definition, runtime_facts: runtimeFacts, technical_detail: "",
        occurrence_id: globalThis.crypto?.randomUUID?.() || "", stage: "browser_validation"};
    }
    return failure;
  }

  /** Carry the server's canonical envelope through clients that already parsed JSON. */
  function fromPayload(payload, status) {
    const legacyRef = payload?.error_kind || payload?.category || payload?.detail?.error_kind || (typeof payload?.error === "string" ? payload.error : null);
    const statusRef = "http_status:" + status;
    const failure = error(definitions.has(legacyRef) ? legacyRef : definitions.has(statusRef) ? statusRef : "SMTO-SYS-0001");
    const detail = payload?.error_detail || (payload?.error_id ? payload : null);
    if (detail) {
      failure.error_detail = {...detail, occurrence_id: detail.occurrence_id || failure.error_detail?.occurrence_id || globalThis.crypto?.randomUUID?.() || ""};
      failure.message = `${detail.error_id} · ${safe(displayCopy(observation(detail)))} ${safe(displayCopy(userAction(detail)))}`;
    } else if (failure.error_detail) {
      const legacyText = typeof payload === "string" ? payload : payload?.error || payload?.detail || payload?.message;
      failure.error_detail = {...failure.error_detail, technical_detail: typeof legacyText === "string" ? safe(legacyText) : ""};
      if (typeof legacyText === "string") failure.message = `${safe(legacyText)} ${safe(displayCopy(userAction(failure.error_detail)))}`;
    }
    // Keep specific server explanations and field requirements visible alongside catalog guidance.
    // Never copy validation input, context, request bodies or arbitrary response objects.
    const reported = payload?.detail;
    const issues = Array.isArray(reported) ? reported.slice(0, 20).map(item => ({
      field: Array.isArray(item?.loc) ? item.loc.filter(part => ["string", "number"].includes(typeof part))
        .slice(0, 12).map(part => safe(part, 120)).join(".") : "",
      message: typeof item?.msg === "string" ? safe(item.msg, 400) : "This field is invalid.",
    })) : [];
    const serverMessage = typeof payload === "string" ? payload : typeof reported === "string" ? reported
      : typeof reported?.message === "string" ? reported.message
      : typeof payload?.message === "string" ? payload.message
      : typeof payload?.error === "string" ? payload.error : "";
    if (failure.error_detail) failure.error_detail = {...failure.error_detail,
      stage: detail?.stage || "http_response",
      response_status: Number.isInteger(status) ? status : undefined,
      response_issues: issues, response_message: safe(serverMessage
        || (!detail && !issues.length ? "The server returned an error without a detailed explanation." : "")),
    };
    else if (serverMessage) failure.message = safe(serverMessage);
    failure.status = status;
    // Update checks retain source observations alongside the canonical failure message.
    if (payload?.update_evidence) failure.update_evidence = payload.update_evidence;
    return failure;
  }

  /**
   * Replace a caller-supplied error host and optionally resolve a missing catalog definition. Late
   * lookups check connectedness only, not a request identity; the caller still owns host lifetime
   * and focus.
   */
  function present(host, value, options = {profile: "compact"}) {
    const detail = value?.error_detail || value;
    const revision = {};
    function show(detail) {
      const card = render(detail, options);
      if (host.getAttribute("role") === "alert") card.removeAttribute("role");
      host.replaceChildren(card);
    }
    if (host) { presentations.set(host, revision); show(detail); }
    if (!value?.error_detail && value?.error_ref) {
      lookup(value.error_ref).then(definition => {
        if (host?.isConnected && presentations.get(host) === revision) show(definition);
      }).catch(() => {});
    }
  }

  /** Apply the loaded branding projection, preserving supplied copy when branding is absent. */
  const displayCopy = value => window.SMTOBranding?.text(value) ?? value;

  /** Prefer server-projected facts; historical likely_cause prose is not evidence. */
  const observation = detail => detail.presentation?.observation || detail.short_description;
  /** Keep reconciliation ahead of all advisory repair steps. */
  const nextStep = detail => detail.resolution?.retry?.guidance === "unsafe_without_reconciliation"
    ? detail.resolution.primary || detail.presentation?.next_step || detail.how_to_fix?.summary
    : detail.presentation?.next_step || detail.resolution?.primary || detail.how_to_fix?.summary || detail.fix_hint;


  /** Retain fixed reconciliation guidance for old payloads without structured user steps. */
  const legacyGuidance = {
    summary: "Check whether your action already happened, then keep the error reference for help.",
    steps: [{instruction: "Check the task’s saved results or the item you were changing before trying again.",
      why: "This older error message does not establish whether the action already happened."},
      {instruction: "Share the error reference with the person managing the app. If you manage it yourself, use Technical details to investigate.",
      why: "The reference helps locate the failure without copying your task content."}],
    success_check: "The earlier action’s result is known and the underlying problem has been addressed.",
    if_still_failing: "Keep the original task and error reference. Ask the person managing the app to check it before repeating work.",
  };
  /**
   * Prefer occurrence-projected guidance, then structured payload/catalog guidance, and finally
   * the retained legacy reconciliation steps. Static guidance supplies no missing occurrence
   * facts.
   */
  const userGuidance = detail => detail.presentation?.user_guidance || detail.how_to_fix?.user_guidance
    || definitions.get(detail.error_id)?.how_to_fix?.user_guidance || legacyGuidance;
  /**
   * Choose the occurrence’s plain-language projection, catalog explanation or observed description
   * for the primary card text.
   */
  const plainLanguage = detail => detail.presentation?.plain_language || detail.explain_like_5 || observation(detail);
  /**
   * Recognize the server’s unsafe-without-reconciliation retry classification without inferring an
   * operation outcome from generic failure text.
   */
  const uncertain = detail => detail.resolution?.retry?.guidance === "unsafe_without_reconciliation";
  /**
   * Keep the reconciliation caution first for unknown-effect errors; otherwise choose the
   * structured guidance summary or next-step fallback.
   */
  const userAction = detail => uncertain(detail)
    ? "Check whether the earlier action already happened before trying again."
    : userGuidance(detail)?.summary || nextStep(detail);

  /** An allowlist keeps task content, exceptions and runtime facts off the clipboard. */
  function supportText(detail) {
    const lines = [`${safe(detail.error_id, 40)} · ${safe(displayCopy(detail.title), 180)}`];
    if (/^[a-z0-9-]{1,160}$/.test(detail.slug || "")) lines.push(`Error: ${detail.slug}`);
    if (/^[a-z0-9_.:-]{1,120}$/i.test(detail.occurrence_id || "")) lines.push(`Error reference: ${safe(detail.occurrence_id, 120)}`);
    if (/^[a-z0-9_.:-]{1,120}$/i.test(detail.stage || "")) lines.push(`Stage: ${safe(detail.stage, 120)}`);
    if (Number.isInteger(detail.response_status)) lines.push(`HTTP status: ${detail.response_status}`);
    for (const [key, value] of Object.entries(detail.transport || {})) {
      if (['endpoint', 'method', 'category', 'occurred_at', 'request_id', 'task_id', 'client_submission_id', 'server_id', 'correlation_id'].includes(key)) lines.push(`${key}: ${safe(value, 500)}`);
    }
    return lines.join("\n");
  }

  /** Clipboard failure exposes selectable text; it never creates another error card. */
  function copyControl(parent, detail) {
    const button = element("button", "Copy error details", "of-error-copy"); button.type = "button";
    const feedback = element("span", "", "of-error-copy-status"); feedback.setAttribute("role", "status");
    let fallback;
    button.onclick = async () => {
        const busyFeedback = window.SMTOBusy?.action("Copying error details…", button);
        try {
      const text = supportText(detail);
      try {
        await navigator.clipboard.writeText(text);
        feedback.textContent = "Error details copied.";
        fallback?.remove(); fallback = null;
      } catch (_) {
        feedback.textContent = "Automatic copying is unavailable. Select and copy the text below.";
        if (!fallback) {
          fallback = element("textarea", null, "of-error-copy-text");
          fallback.readOnly = true; fallback.rows = 4;
          fallback.setAttribute("aria-label", "Error details to copy"); parent.append(fallback);
        }
        fallback.value = text; fallback.focus(); fallback.select();
      }

        } finally { busyFeedback?.finish(); }
      };
    parent.append(button, feedback);
  }

  /**
   * Render supplied instructions and their reasons as text, followed by success criteria and
   * escalation guidance. The presenter explains actions; it does not execute or authorize them.
   */
  function guidanceSteps(parent, guidance) {
    const list = element("ol", null, "of-error-steps");
    for (const step of guidance.steps || []) {
      const item = element("li");
      item.append(element("p", displayCopy(step.instruction)));
      item.append(element("p", displayCopy(step.why), "of-error-why"));
      list.append(item);
    }
    parent.append(list);
    parent.append(element("strong", "What success looks like"));
    parent.append(element("p", displayCopy(guidance.success_check)));
    parent.append(element("strong", "If it still fails"));
    parent.append(element("p", displayCopy(guidance.if_still_failing)));
  }

  /**
   * Produce bounded canonical error notification text, placing the next action first so truncation
   * retains reconciliation guidance. Suppress informational or noncanonical payloads; this
   * formatter itself delivers no notification.
   */
  function notificationText(value) {
    const detail = value?.error_detail || value;
    if (!detail || detail.severity === "info" || detail.resolution?.status === "informational") return "";
    if (!/^SMTO-[A-Z0-9]{2,5}-\d{4}$/.test(detail.error_id || "")) return "";
    // Put the next action first, so truncation cannot remove the reconciliation caution.
    const action = safe(displayCopy(userAction(detail)), 260);
    return safe(`${detail.error_id} · ${action} ${safe(displayCopy(plainLanguage(detail)), 260)}`, 600);
  }

  /** Construct one safe card; all links navigate existing product flows. */
  function render(value, {profile = "full", help = true} = {}) {
    const detail = value?.error_detail || value;
    const canonical = detail && typeof detail === "object" && /^SMTO-[A-Z0-9]{2,5}-\d{4}$/.test(detail.error_id);
    const root = element("section", null, `of-error-card of-error-${profile}`);
    root.setAttribute("role", "alert");
    const id = canonical ? detail.error_id : "SMTO-SYS-0001";
    root.append(element("strong", canonical ? displayCopy(detail.title) : "Request failed", "of-error-title"));
    root.append(element("p", `${id}${canonical && profile === "full" ? ` · ${detail.slug}` : ""}`, "of-error-identity"));
    const explanation = canonical ? displayCopy(plainLanguage(detail)) : typeof detail === "string" ? detail : detail?.message_markdown || detail?.message || detail?.detail || detail?.technical_detail || "";
    root.append(element("p", explanation));
    if (detail?.response_message && detail.response_message !== explanation) {
      root.append(element("strong", "What the server reported", "of-error-heading"));
      root.append(element("p", detail.response_message, "of-error-reported"));
    }
    if (detail?.response_issues?.length) {
      root.append(element("strong", "Fields to correct", "of-error-heading"));
      const fields = element("ul", null, "of-error-fields");
      for (const issue of detail.response_issues) {
        const item = element("li");
        // Mask the location and explanation separately: a field named "tokens" is not a credential.
        if (issue.field) item.append(element("strong", issue.field.replace(/^body\.?/, "").replaceAll("_", " ") + ": "));
        item.append(element("span", issue.message)); fields.append(item);
      }
      root.append(fields);
    }
    if (canonical) {
      if (detail.affected_feature) root.append(element("p", "Affected: " + detail.affected_feature, "of-error-impact"));
      window.SMTORecovery?.mount(root, detail);
      const guidance = userGuidance(detail);
      if (uncertain(detail)) root.append(element("p", userAction(detail), "of-error-caution"));
      if (guidance) {
        root.append(element("strong", "How to fix", "of-error-heading"));
        if (profile === "full") guidanceSteps(root, guidance);
        else {
          root.append(element("p", displayCopy(userAction(detail)), "of-error-fix"));
          const steps = element("details"); steps.append(element("summary", "Show steps"));
          guidanceSteps(steps, guidance); root.append(steps);
        }
      } else {
        const fix = nextStep(detail);
        if (fix) root.append(element("p", displayCopy(fix), "of-error-fix"));
      }
      const links = element("nav", null, "of-error-actions");
      links.setAttribute("aria-label", "Error help");
      for (const action of profile === "toast" ? [] : detail.settings_actions || []) {
        const url = new URL("/settings", location.origin);
        url.searchParams.set("section", action.section_id);
        for (const [field, query] of [["setting_key", "setting"], ["parameter_key", "parameter"], ["component_action", "action"]]) {
          if (action[field]) url.searchParams.set(query, action[field]);
        }
        const link = element("a", action.label); link.href = url.pathname + url.search;
        links.append(link);
        if (action.applies_to === "new_task") links.append(element("span", "Applies to a new task; resumed tasks keep their saved value."));
      }
      const explain = element("a", "Explain this error");
      explain.href = window.SMTOManualLinks?.manualUrl(detail.manual_doc_id) || `/manual#doc=${encodeURIComponent(detail.manual_doc_id)}`;
      explain.target = "_blank"; explain.rel = "noopener"; if (help) links.append(explain);
      copyControl(links, detail); root.append(links);
      const disclosure = element("details"); disclosure.append(element("summary", "Technical details"));
      if (Number.isInteger(detail.response_status)) disclosure.append(element("p", `HTTP status: ${detail.response_status}`));
      if (detail.stage) disclosure.append(element("p", `Stage: ${detail.stage}`));
      disclosure.append(element("p", displayCopy(observation(detail))));
      disclosure.append(element("p", displayCopy(nextStep(detail))));
      for (const step of detail.how_to_fix?.steps || []) disclosure.append(element("p", displayCopy(step.instruction)));
      if (detail.resolution?.retry?.condition) disclosure.append(element("p", displayCopy(detail.resolution.retry.condition)));
      if (detail.technical_detail) disclosure.append(element("pre", detail.technical_detail));
      if (detail.transport) disclosure.append(element("pre", JSON.stringify(detail.transport, null, 2)));
      disclosure.append(element("pre", JSON.stringify(detail.runtime_facts || {}, null, 2)));
      if (detail.occurrence_id) disclosure.append(element("p", `Occurrence: ${detail.occurrence_id}`));
      root.append(disclosure);
    } else {
      root.append(element("strong", "How to fix", "of-error-heading"));
      guidanceSteps(root, legacyGuidance);
      copyControl(root, {error_id: id, title: "Request failed"});
      const disclosure = element("details"); disclosure.append(element("summary", "Technical details"));
      disclosure.append(element("pre", explanation)); root.append(disclosure);
    }
    return root;
  }

  /** Update one host-owned slot without replacing answers, receipts or action controls. */
  function mount(host, detail, options) {
    if (!host) return;
    let slot = [...host.children].find(child => child.classList.contains("of-error-slot"));
    if (!detail || detail.severity === "info" || detail.resolution?.status === "informational") { slot?.remove(); return; }
    if (!slot) { slot = element("div", null, "of-error-slot"); host.append(slot); }
    slot.replaceChildren(render(detail, options));
  }

  /** Preserve canonical API payloads on client errors for the shared presenter. */
  async function fromResponse(response) {
    let payload;
    try { payload = await response.json(); } catch { payload = await lookup("ui_response_invalid").catch(() => null); }
    return withTransport(fromPayload(payload, response.status), response);
  }

  const writes = new WeakSet();
  const transports = new WeakMap();
  function withTransport(failure, response) {
    const transport = transports.get(response);
    if (transport && failure.error_detail) failure.error_detail = {...failure.error_detail, transport};
    return failure;
  }
  function transportContext(input, options) {
    let endpoint = '';
    try { endpoint = new URL(typeof input === 'string' ? input : input.url, location.href).pathname; } catch (_) {}
    const facts = {endpoint: safe(endpoint, 500), method: String(options?.method || input?.method || 'GET').toUpperCase(), occurred_at: new Date().toISOString()};
    let data;
    try { if (typeof options?.body === 'string') data = JSON.parse(options.body); } catch (_) {}
    for (const key of ['request_id', 'task_id', 'client_submission_id']) {
      const value = data?.[key] || options?.smtoContext?.[key];
      if (typeof value === 'string' && /^[a-z0-9_.:-]{1,160}$/i.test(value)) facts[key] = value;
    }
    const request = endpoint.match(/\/(?:stream|trace)\/(req-[a-z0-9_-]+)/i);
    if (request) facts.request_id = request[1];
    return facts;
  }
  /** A lost write response cannot establish whether the server performed the operation. */
  function unknownOutcome(failure) {
    const detail = failure.error_detail;
    if (detail) failure.error_detail = {...detail,
      runtime_facts: {...detail.runtime_facts, effect_unknown: true},
      resolution: {...detail.resolution, retry: {...detail.resolution?.retry, guidance: "unsafe_without_reconciliation"}},
      recovery_actions: [{id: "system_health"}],
    };
    return failure;
  }
  /** Preserve abort semantics and identify a failed browser transport without retrying it. */
  async function fetchResponse(input, options) {
    const transport = transportContext(input, options);
    const write = !["GET", "HEAD", "OPTIONS"].includes(String(options?.method || input?.method || "GET").toUpperCase());
    try {
      const response = await (window.SMTOAuth?.fetch || window.fetch)(input, options);
      for (const [name, key] of [['x-request-id', 'request_id'], ['x-correlation-id', 'correlation_id'], ['x-server-id', 'server_id']]) {
        const value = response.headers?.get?.(name);
        if (value && /^[a-z0-9_.:-]{1,160}$/i.test(value)) transport[key] = value;
      }
      transports.set(response, transport);
      if (write) writes.add(response);
      return response;
    } catch (failure) {
      if (failure?.name === "AbortError") throw failure;
      const result = error("ui_network_failed");
      result.error_detail = {...result.error_detail, stage: "browser_transport",
        technical_detail: safe(`${transport.method} ${transport.endpoint}: ${failure?.name || "Error"}`, 1000),
        transport: {...transport, category: safe(failure?.name || "Error", 80)}};
      throw write ? unknownOutcome(result) : result;
    }
  }

  /** Identify a malformed API payload without reflecting the response body. */
  async function readJson(response) {
    try { return await response.json(); }
    catch (failure) {
      if (failure?.name === "AbortError") throw failure;
      const result = error("ui_response_invalid");
      withTransport(result, response);
      result.status = response.status;
      if (result.error_detail) result.error_detail = {...result.error_detail, response_status: response.status};
      throw writes.has(response) && (response.status < 400 || response.status >= 500) ? unknownOutcome(result) : result;
    }
  }
  async function request(path, options = {}) {
    const response = await fetchResponse(path, options);
    const data = await readJson(response);
    if (!response.ok) throw withTransport(fromPayload(data, response.status), response);
    return data;
  }
  window.SMTOErrors = {render, mount, lookup, fromResponse, fromPayload, error, present, notificationText,
    fetch: fetchResponse, readJson, request};
})();
