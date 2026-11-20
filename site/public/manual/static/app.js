/**
 * @file src/manual/static/app.js
 * @brief Drive standalone manual navigation, filtered search, outlines and themed diagrams.
 * @ingroup ManualReference
 * @details
 * Responsibilities:
 * - Fetch catalog/documents, render kind/tag navigation and metadata, and maintain
 *   document/heading navigation in the URL hash.
 * Boundaries:
 * - The browser does not generate source references or decide which source is current; the
 *   manual API owns the corpus and rendered document bodies.
 * Lifecycle:
 * - init loads the catalog then the hash-selected document; search is debounced; hash/appearance
 *   events update the active view.
 * State:
 * - Document filters and timers are page-local. Shared appearance/session code owns permitted
 *   preferences; this module does not create its own browser persistence store.
 * Security:
 * - Metadata uses textContent; article HTML is trusted only from the manual renderer. Mermaid
 *   runs in strict security mode and restores source text on diagram failure.
 * Collaborators:
 * - manual/app.py supplies catalog/search/document APIs; index.html owns DOM anchors; app.css
 *   and shared Agent UI appearance code supply theme tokens.
 * Public surface:
 * - init, loadDocument, runSearch and renderMermaid compose the page; #doc/#heading links are
 *   the bookmark contract.
 *
 * @see src/manual/app.py
 * @see src/manual/static/index.html
 * @see src/manual/static/app.css
 */
const state = {
  catalog: null,
  documents: [],
  groups: [],
  activeDocId: "manual-home",
  activeKind: "",
  includeHistorical: false,
  activeTags: new Set(),
  query: "",
  searchTimer: null,
  searchVersion: 0,
  documentVersion: 0,
};

const elements = {
  root: document.documentElement,
  navToggle: document.querySelector("#nav-toggle"),
  manualNav: document.querySelector("#manual-nav"),
  search: document.querySelector("#manual-search"),
  kindFilters: document.querySelector("#kind-filters"),
  tagFilters: document.querySelector("#tag-filters"),
  documentNav: document.querySelector("#document-nav"),
  article: document.querySelector("#manual-article"),
  searchResults: document.querySelector("#search-results"),
  docMeta: document.querySelector("#doc-meta"),
  outline: document.querySelector("#outline-nav"),
  related: document.querySelector("#related-list"),
};
const navigation = window.SMTONavigationGroups.mount(elements.documentNav, {
  surface: "manual", menu: {trigger: elements.navToggle, panel: elements.manualNav, breakpoint: 820},
});

/** @brief Normalize optional API/DOM text with an explicit empty-value fallback. */
function compactText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/** @brief Decode the manual document/heading bookmark from the URL hash. */
function hashParams() {
  const raw = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(raw);
}

/** @brief Replace document/heading bookmark state without creating a new history entry. */
function writeHash(docId, headingId = "") {
  const params = new URLSearchParams();
  params.set("doc", docId);
  if (headingId) {
    params.set("heading", headingId);
  }
  history.replaceState(null, "", `#${params.toString()}`);
}

/** @brief Close the responsive navigation after selection or dismissal. */
function closeNav() {
  navigation.closeMenu({restoreFocus: false});
}

/** @brief Fetch manual JSON and reject unsuccessful HTTP responses before updating the view. */
async function apiJson(url) {
  const response = await window.SMTOErrors.fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw await window.SMTOErrors.fromResponse(response);
  }
  return window.SMTOErrors.readJson(response);
}

/** @brief Synchronize the theme control and redraw diagrams after shared appearance changes. */
function refreshTheme() {
  renderMermaid();
}
window.addEventListener("smto:appearance", refreshTheme);
for (const event of ["smto:theme-change", "smto:palette-change", "smto:font-scale", "smto:appearance-saved"]) window.addEventListener(event, refreshTheme);

/** Keep filter controls mounted so selection never discards keyboard focus. */
function renderKindFilters() {
  let select = elements.kindFilters.querySelector("select");
  if (!select) {
    const label = document.createElement("label"); label.textContent = "Document kind";
    select = document.createElement("select"); select.id = "manual-kind";
    label.append(select); elements.kindFilters.append(label);
    select.addEventListener("change", () => {
      state.activeKind = select.value;
      if (state.activeKind === "legacy") { state.includeHistorical = true; document.querySelector("#include-historical").checked = true; }
      renderKindFilters(); renderDocumentNav(); runSearch();
    });
  }
  const groups = [{kind: "", label: state.includeHistorical ? "All kinds" : "All current kinds"}, ...state.groups.filter(group => state.includeHistorical || group.kind !== "legacy").map(group => ({kind: group.kind, label: group.label}))];
  select.replaceChildren(...groups.map(group => new Option(group.label, group.kind)));
  select.value = state.activeKind;
  reflectFilters();
}

/** Tags are independent toggles; selected state and focus survive every search. */
function renderTagFilters() {
  if (!elements.tagFilters.children.length) for (const item of state.catalog?.tags || []) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "tag-button"; button.dataset.tag = item.tag;
    button.textContent = `${item.tag} ${item.count}`;
    button.addEventListener("click", () => {
      if (state.activeTags.has(item.tag)) state.activeTags.delete(item.tag);
      else state.activeTags.add(item.tag);
      renderTagFilters(); renderDocumentNav(); runSearch();
    });
    elements.tagFilters.append(button);
  }
  for (const button of elements.tagFilters.children) {
    const active = state.activeTags.has(button.dataset.tag);
    button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active));
  }
  reflectFilters();
}
function reflectFilters() {
  const count = state.activeTags.size;
  document.querySelector("#filter-count").textContent = count ? ` (${count} selected)` : "";
}

/** Separate historical material while leaving it available to search and navigation. */
function groupedResults(documents, className) {
  const nodes = [];
  for (const [historical, title] of [[false, "Current guidance"], [true, "Historical reference"]]) {
    const matches = documents.filter(doc => (doc.kind === "legacy") === historical);
    if (!matches.length) continue;
    const heading = document.createElement("h3"); heading.className = "result-group-title"; heading.textContent = title;
    nodes.push(heading, ...matches.map(doc => renderDocButton(doc, className)));
  }
  return nodes;
}

/** @brief Require the selected kind and every selected tag for client navigation visibility. */
function docMatchesFilters(doc) {
  if (doc.kind === "legacy" && !state.includeHistorical) return false;
  if (state.activeKind && doc.kind !== state.activeKind) {
    return false;
  }
  for (const tag of state.activeTags) {
    if (!doc.tags.includes(tag)) {
      return false;
    }
  }
  return true;
}

/** @brief Rebuild grouped navigation from server metadata under current filters. */
function renderDocumentNav() {
  const groupFragments = [];
  for (const group of state.groups) {
    const docs = group.documents.filter(docMatchesFilters);
    if (!docs.length) {
      continue;
    }
    const {element: wrapper, items} = window.SMTONavigationGroups.createGroup({id: group.kind, title: group.label});
    for (const doc of docs) {
      items.append(renderDocButton(doc, "doc-link"));
    }
    groupFragments.push(wrapper);
  }
  if (!groupFragments.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No documents match.";
    groupFragments.push(empty);
  }
  elements.documentNav.replaceChildren(...groupFragments);
  navigation.refresh();
  if (state.activeKind || state.activeTags.size) {
    navigation.setSearchMatches(groupFragments.filter(group => group.dataset.navigationGroup).map(group => group.dataset.navigationGroup));
  } else if (!state.query.trim()) navigation.setSearchMatches(null);
}

/** @brief Create a text-only document selector with active state and click-to-load behavior. */
function renderDocButton(doc, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${className}${doc.id === state.activeDocId ? " is-active" : ""}`;
  button.dataset.documentId = doc.id;
  if (doc.id === state.activeDocId) button.setAttribute("aria-current", "page");
  const title = document.createElement("span");
  title.className = className === "doc-link" ? "doc-link-title" : "";
  title.textContent = window.SMTOBranding.text(doc.title);
  const summary = document.createElement("span");
  summary.className = className === "doc-link" ? "doc-link-summary" : "";
  summary.textContent = window.SMTOBranding.text(doc.summary || doc.kind_label || "");
  button.append(title, summary);
  button.addEventListener("click", () => loadDocument(doc.id));
  return button;
}

/** @brief Render source kind, reading time and tags without interpreting metadata as HTML. */
function renderMeta(doc) {
  const title = document.createElement("div");
  title.className = "meta-title";
  title.textContent = window.SMTOBranding.text(doc.title);

  const grid = document.createElement("div");
  grid.className = "meta-grid";
  const items = [
    `${doc.kind_label || doc.kind}`,
    `${doc.reading_time_minutes || 1} min read`,
    doc.generated ? "generated" : "static",
    doc.source_type ? `source: ${doc.source_type}` : "",
  ].filter(Boolean);
  grid.replaceChildren(...items.map((item) => {
    const div = document.createElement("div");
    div.textContent = item;
    return div;
  }));

  const tags = document.createElement("div");
  tags.className = "meta-tags";
  tags.replaceChildren(...(doc.tags || []).map((tag) => {
    const span = document.createElement("span");
    span.className = "meta-tag";
    span.textContent = tag;
    return span;
  }));
  elements.docMeta.replaceChildren(title, grid, tags);
}

/** @brief Expose headings through level three and preserve heading bookmarks on navigation. */
function renderOutline(doc) {
  const headings = (doc.headings || []).filter((heading) => heading.level <= 3);
  if (!headings.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No headings.";
    elements.outline.replaceChildren(empty);
    return;
  }
  elements.outline.replaceChildren(...headings.map((heading) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `outline-link outline-level-${heading.level}`;
    button.textContent = window.SMTOBranding.text(heading.title);
    button.addEventListener("click", () => {
      document.getElementById(heading.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      writeHash(state.activeDocId, heading.id);
    });
    return button;
  }));
}

/** @brief Fetch related metadata for the active document and render an explicit unavailable state. */
async function renderRelated(docId, version = state.documentVersion) {
  try {
    const payload = await apiJson(`/api/manual/related/${encodeURIComponent(docId)}`);
    if (version !== state.documentVersion || docId !== state.activeDocId) return;
    const items = (payload.results || []).filter(doc => state.includeHistorical || doc.kind !== "legacy");
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No related documents.";
      elements.related.replaceChildren(empty);
      return;
    }
    elements.related.replaceChildren(...groupedResults(items, "related-link"));
  } catch {
    if (version !== state.documentVersion || docId !== state.activeDocId) return;
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Related documents unavailable.";
    elements.related.replaceChildren(empty);
  }
}

/** @brief Read the active computed theme token with a diagram-specific fallback. */
function cssVariable(name, fallback) {
  return compactText(getComputedStyle(document.documentElement).getPropertyValue(name), fallback);
}

/** @brief Derive diagram colors from page tokens while retaining strict Mermaid security. */
function mermaidConfig() {
  const bg = cssVariable("--trace-panel", "#f5f5f5");
  const panel = cssVariable("--panel", "#ffffff");
  const text = cssVariable("--text", "#202020");
  const muted = cssVariable("--muted", "#656565");
  const border = cssVariable("--border", "rgba(0, 0, 0, 0.11)");
  return {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      fontFamily: cssVariable("--ui-font", "sans-serif"),
      background: bg,
      mainBkg: panel,
      primaryColor: panel,
      primaryTextColor: text,
      primaryBorderColor: border,
      secondaryColor: bg,
      tertiaryColor: panel,
      lineColor: muted,
      textColor: text,
      clusterBkg: bg,
      clusterBorder: border,
      clusterTextColor: text,
      titleColor: text,
      edgeLabelBackground: panel,
    },
    flowchart: { htmlLabels: true, curve: "basis" },
  };
}

/** @brief Preserve diagram source for theme redraws and restore readable code if rendering fails. */
async function renderMermaid() {
  if (!window.mermaid?.run) {
    return;
  }
  const diagrams = Array.from(document.querySelectorAll(".manual-article .mermaid"));
  if (!diagrams.length) {
    return;
  }
  for (const diagram of diagrams) {
    if (diagram.dataset.source) {
      diagram.textContent = diagram.dataset.source;
      diagram.removeAttribute("data-processed");
    } else {
      diagram.dataset.source = diagram.textContent;
    }
  }
  window.mermaid.initialize(mermaidConfig());
  try {
    await window.mermaid.run({ nodes: diagrams });
  } catch (error) {
    for (const diagram of diagrams) {
      diagram.textContent = diagram.dataset.source || diagram.textContent;
    }
  }
}

/** @brief Fetch server-rendered content, refresh metadata/navigation and restore the requested heading. */
async function loadDocument(docId, headingId = "") {
  const version = ++state.documentVersion;
  const safeDocId = compactText(docId, "manual-home");
  elements.article.innerHTML = '<div class="loading-state">Loading document.</div>';
  try {
    const doc = await apiJson(`/api/manual/document/${encodeURIComponent(safeDocId)}`);
    if (version !== state.documentVersion) return;
    state.activeDocId = doc.id;
    if (doc.kind === "legacy" && !state.includeHistorical) { state.includeHistorical = true; document.querySelector("#include-historical").checked = true; renderKindFilters(); }
    elements.article.innerHTML = doc.html;
    const walker = document.createTreeWalker(elements.article, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement.closest("pre, code, script, style, textarea, .mermaid")) {
        node.textContent = window.SMTOBranding.text(node.textContent);
      }
    }
    renderMeta(doc);
    renderOutline(doc);
    renderDocumentNav();
    navigation.reveal([...elements.documentNav.querySelectorAll("[data-document-id]")].find(button => button.dataset.documentId === doc.id));
    writeHash(doc.id, headingId);
    await renderRelated(doc.id, version);
    if (version !== state.documentVersion) return;
    await renderMermaid();
    if (version !== state.documentVersion) return;
    closeNav();
    const target = headingId ? document.getElementById(headingId) : null;
    if (target) {
      target.scrollIntoView({ block: "start" });
    } else {
      elements.article.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  } catch (error) {
    if (version !== state.documentVersion) return;
    window.SMTOErrors.present(elements.article, error);
  }
}

/** @brief Serialize the selected tag set for the manual search API. */
function tagsQuery() {
  return Array.from(state.activeTags).join(",");
}

/** @brief Query server search under current filters and render results or explicit failure text. */
async function runSearch() {
  const version = ++state.searchVersion;
  const q = compactText(state.query);
  const hasFilters = Boolean(q || state.activeKind || state.activeTags.size);
  if (!hasFilters) {
    navigation.setSearchMatches(null);
    elements.searchResults.hidden = true;
    elements.searchResults.replaceChildren();
    document.querySelector("#search-status").textContent = "";
    return;
  }
  const params = new URLSearchParams();
  if (q) {
    params.set("q", q);
  }
  if (state.activeKind) {
    params.set("kind", state.activeKind);
  }
  if (state.activeTags.size) {
    params.set("tags", tagsQuery());
  }
  params.set("limit", "12");
  params.set("include_historical", String(state.includeHistorical));
  try {
    const payload = await apiJson(`/api/manual/search?${params.toString()}`);
    if (version !== state.searchVersion) return;
    const title = document.createElement("h2");
    title.textContent = q ? `Search: ${q}` : "Filtered documents";
    const results = payload.results || [];
    const matches = new Set(results.map(doc => doc.id));
    navigation.setSearchMatches(state.groups.filter(group => group.documents.some(doc =>
      docMatchesFilters(doc) && (!q || matches.has(doc.id)))).map(group => group.kind));
    const items = results.length
      ? groupedResults(results, "result-link")
      : [Object.assign(document.createElement("div"), { className: "empty-state", textContent: "No matching documents." })];
    elements.searchResults.replaceChildren(title, ...items);
    document.querySelector("#search-status").textContent = `${results.length} matching document${results.length === 1 ? "" : "s"} shown.`;
    elements.searchResults.hidden = false;
  } catch (error) {
    if (version !== state.searchVersion) return;
    const empty = document.createElement("div");
    empty.className = "empty-state";
    window.SMTOErrors.present(empty, error);
    elements.searchResults.replaceChildren(empty);
    elements.searchResults.hidden = false;
  }
}

/** @brief Coalesce rapid input into one search after the 120 ms debounce interval. */
function scheduleSearch() {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(runSearch, 120);
}

/** @brief Load the manual corpus metadata, initialize filters and select the hash-bookmarked document. */
async function init() {
  refreshTheme();
  state.catalog = await apiJson("/api/manual/catalog");
  state.groups = state.catalog.groups || [];
  state.documents = state.catalog.documents || [];
  renderKindFilters();
  renderTagFilters();
  renderDocumentNav();
  const params = hashParams();
  await loadDocument(params.get("doc") || "manual-home", params.get("heading") || "");
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!elements.root.dataset.theme) renderMermaid();
});

document.querySelector("#include-historical").addEventListener("change", event => {
  state.includeHistorical = event.target.checked;
  if (!state.includeHistorical && state.activeKind === "legacy") state.activeKind = "";
  renderKindFilters(); renderDocumentNav(); runSearch(); renderRelated(state.activeDocId);
});

elements.search.addEventListener("input", () => {
  state.query = elements.search.value;
  scheduleSearch();
});
window.addEventListener("hashchange", () => {
  const params = hashParams();
  const docId = params.get("doc") || "manual-home";
  const headingId = params.get("heading") || "";
  if (docId !== state.activeDocId) {
    loadDocument(docId, headingId);
  } else if (headingId) {
    document.getElementById(headingId)?.scrollIntoView({ block: "start" });
  }
});

init().catch((error) => {
  window.SMTOErrors.present(elements.article, error);
});
