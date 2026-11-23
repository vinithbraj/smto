/* Block Safari on macOS with a notice to use a Chromium-based browser or Firefox.
 *
 * Loaded first in <head> on every SMTO page, so no other script runs in an unsupported browser:
 * every later script is disarmed and the parsed page is replaced by the notice. Only desktop Safari is
 * blocked. On iPhone and iPad every browser runs WebKit, and the phone UI and certificate setup rely
 * on it, so iOS stays supported; iPadOS Safari reports a Mac user agent, which touch support tells
 * apart. Styles go through the CSS object model because several pages' Content-Security-Policy
 * forbids inline <style>.
 */
(() => {
  "use strict";
  const agent = navigator.userAgent || "";
  // Chromium exposes client hints; Firefox and other engines never claim "Version/... Safari/".
  const desktopSafari = !navigator.userAgentData
    && /\bMacintosh\b/.test(agent) && /\bAppleWebKit\//.test(agent)
    && /\bVersion\/[\d.]+.*\bSafari\//.test(agent)
    && !/\b(Chrome|Chromium|CriOS|FxiOS|Firefox|Edg|EdgiOS|OPR|Electron)\//.test(agent)
    && !(navigator.maxTouchPoints > 1);
  window.SMTOBrowserSupport = Object.freeze({supported: !desktopSafari});
  if (!desktopSafari) return;

  // Nothing after this script may run. The parser checkpoints microtasks before it prepares each
  // script, so retyping and detaching every script it inserts keeps all of them from executing.
  // (window.stop() would be simpler, but a load stopped before <body> exists never paints.)
  const root = document.documentElement;
  root.style.visibility = "hidden";
  const disarm = script => { script.type = "javascript/blocked"; script.remove(); };
  const blocker = new MutationObserver(records => {
    for (const record of records) for (const added of record.addedNodes) {
      if (added.nodeName === "SCRIPT") disarm(added);
      else if (added.querySelectorAll) added.querySelectorAll("script").forEach(disarm);
    }
  });
  blocker.observe(document, {childList: true, subtree: true});
  const dark = Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const color = dark
    ? {page: "#000000", card: "#1c1c1e", text: "#f5f5f7", muted: "#a1a1a6", edge: "rgba(255, 255, 255, 0.1)",
      accent: "#0a84ff", warn: "#ff9f0a", shadow: "none"}
    : {page: "#f5f5f7", card: "#ffffff", text: "#1d1d1f", muted: "#6e6e73", edge: "rgba(0, 0, 0, 0.06)",
      accent: "#0071e3", warn: "#f56300", shadow: "0 12px 40px rgba(0, 0, 0, 0.08)"};
  const font = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
  const node = (tag, style = {}, text = "") => {
    const element = document.createElement(tag);
    Object.assign(element.style, style);
    if (text) element.textContent = text;
    return element;
  };
  const meta = (attributes) => {
    const element = document.createElement("meta");
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };
  /** A warning glyph drawn as SVG, so the notice needs no external asset. */
  function icon() {
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    for (const [key, value] of Object.entries({viewBox: "0 0 48 48", width: "48", height: "48", "aria-hidden": "true"}))
      svg.setAttribute(key, value);
    for (const [tag, attributes] of [
      ["circle", {cx: 24, cy: 24, r: 21, fill: "none", stroke: color.warn, "stroke-width": 3}],
      ["path", {d: "M24 13v14", fill: "none", stroke: color.warn, "stroke-width": 3.5, "stroke-linecap": "round"}],
      ["circle", {cx: 24, cy: 34.5, r: 2.25, fill: color.warn}],
    ]) {
      const shape = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, String(value));
      svg.append(shape);
    }
    return svg;
  }
  function render() {
    const head = document.createElement("head");
    const title = document.createElement("title"); title.textContent = "Browser not supported";
    head.append(meta({charset: "utf-8"}), meta({name: "viewport", content: "width=device-width, initial-scale=1"}),
      meta({name: "color-scheme", content: "light dark"}), title);
    const body = node("body", {margin: "0", minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", padding: "24px", boxSizing: "border-box", background: color.page,
      color: color.text, fontFamily: font, WebkitFontSmoothing: "antialiased"});
    const card = node("section", {width: "100%", maxWidth: "440px", boxSizing: "border-box", padding: "36px 32px 28px",
      borderRadius: "20px", background: color.card, border: `1px solid ${color.edge}`, boxShadow: color.shadow,
      textAlign: "center"});
    card.setAttribute("role", "alertdialog"); card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "browser-support-title");
    card.setAttribute("aria-describedby", "browser-support-detail");
    const heading = node("h1", {margin: "18px 0 10px", fontSize: "22px", lineHeight: "1.25", fontWeight: "600",
      letterSpacing: "-0.01em"}, "This browser isn\u2019t supported");
    heading.id = "browser-support-title";
    const detail = node("p", {margin: "0 0 24px", fontSize: "15px", lineHeight: "1.5", color: color.muted},
      "Safari can\u2019t run this app. Open this page in a Chromium-based browser, such as Google Chrome, "
      + "Microsoft Edge or Brave, or in Firefox.");
    detail.id = "browser-support-detail";
    const copy = node("button", {appearance: "none", border: "0", borderRadius: "980px", padding: "11px 22px",
      background: color.accent, color: "#ffffff", font: `500 15px/1.2 ${font}`, cursor: "pointer"}, "Copy page link");
    copy.type = "button";
    // A soft accent ring instead of the default heavy outline; inline styles cannot use :focus.
    const ring = focused => {
      copy.style.outline = focused ? `3px solid ${dark ? "rgba(10, 132, 255, 0.45)" : "rgba(0, 113, 227, 0.3)"}` : "none";
      copy.style.outlineOffset = "2px";
    };
    copy.addEventListener("focus", () => ring(true));
    copy.addEventListener("blur", () => ring(false));
    ring(false);
    const hint = node("p", {margin: "14px 0 0", fontSize: "13px", lineHeight: "1.45", color: color.muted,
      overflowWrap: "anywhere"}, "Then paste it into the other browser\u2019s address bar.");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        copy.textContent = "Link copied";
        setTimeout(() => { copy.textContent = "Copy page link"; }, 2000);
      } catch (_) {
        // Without clipboard access, show the address so it can be selected and copied by hand.
        hint.textContent = location.href;
        hint.style.userSelect = "all"; hint.style.webkitUserSelect = "all";
      }
    });
    card.append(icon(), heading, detail, copy, hint);
    body.append(card);
    blocker.disconnect();
    if (!root.lang) root.lang = "en";
    // Replacing the head also drops the page's stylesheets, so only the notice's own styles apply.
    root.replaceChildren(head, body);
    root.style.visibility = "";
    copy.focus({preventScroll: true});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, {once: true});
  else render();
})();
