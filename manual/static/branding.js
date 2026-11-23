/**
 * Project server-injected product branding and a saved assistant name into browser display text.
 * Track dynamic text bindings and update titles/metadata without changing stored source text,
 * product identifiers or settings. The page must supply the branding globals and expected
 * name-label markup.
 */
(() => {
  "use strict";
  const brand = window.__BRANDING__;
  const {page} = window.__BRANDING_UI__;
  let {agent_name: agentName} = window.__BRANDING_UI__;
  const bindings = new Map();
  /**
   * Return the saved assistant name when present, otherwise the injected product display name.
   */
  const displayName = () => agentName || brand.display_name;
  /**
   * Substitute standalone legacy product names in display text while leaving
   * hyphenated/underscored identifier tokens intact. This is a presentation transform, not a
   * rewrite of stored source data.
   */
  const text = value => String(value ?? "").replace(/\b(?:smTO|SMTO)\b(?![-_])/g, () => displayName());
  /**
   * Write a plain-text name template or custom projection into a node and retain dynamic bindings
   * for later name changes. Return the supplied node; disconnected bindings are pruned on render.
   */
  function bindText(node, template = "{name}", format) {
    const project = format || (() => template.replaceAll("{name}", displayName));
    if (format || template.includes("{name}")) bindings.set(node, project);
    node.textContent = project();
    return node;
  }
  /**
   * Project injected branding and the current assistant name into the browser title, application
   * metadata and registered display nodes. Settings has a configured default title; connected
   * dynamic bindings update without changing product IDs or persisted settings.
   */
  function render() {
    document.title = agentName ? (page ? `${page} · ${agentName}` : agentName)
      : page === "Settings" ? brand.browser.settings_title
      : page ? `${page} · ${brand.display_name}` : brand.browser.default_title;
    for (const node of document.querySelectorAll('meta[name="application-name"], meta[name="apple-mobile-web-app-title"]')) {
      node.content = agentName || brand.browser.application_name;
    }
    for (const label of document.querySelectorAll("[data-agent-name]")) {
      label.title = displayName();
      label.querySelector("[data-agent-name-custom]").textContent = agentName;
      label.querySelector("[data-agent-name-custom]").hidden = !agentName;
      label.querySelector("[data-agent-name-default]").hidden = Boolean(agentName);
    }
    for (const node of document.querySelectorAll("[data-brand-display-name]")) node.textContent = displayName();
    for (const [node, project] of bindings) {
      if (node.isConnected) node.textContent = project();
      else bindings.delete(node);
    }
  }
  /**
   * Apply an explicitly supplied agent_name setting, trimming a string or clearing a nonstring
   * value, then repaint. Missing settings leave the current name intact; persistence belongs to
   * the settings owner.
   */
  function apply(settings) {
    if (!settings || !Object.hasOwn(settings, "agent_name")) return;
    agentName = typeof settings.agent_name === "string" ? settings.agent_name.trim() : "";
    render();
  }
  window.SMTOBranding = Object.freeze({displayName, text, bindText, apply});
  document.addEventListener("DOMContentLoaded", render);
})();
