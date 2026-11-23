/**
 * Search mounted desktop page/dialog text with CSS Highlights and temporary disclosure reveals.
 * Owners can register semantic filters and collapsed-content adapters; this controller owns query
 * versions, scan scheduling, focus, highlight ranges and restoration. It neither fetches unloaded
 * history nor persists queries, and unsupported general Find retains the browser shortcut.
 *
 * Three viewer options persist in localStorage: Contents lists every match as a link, Only matches
 * hides content without a match, and Semantic adds passages related by meaning. Contents is a
 * button; the other two are the shared switches (mission_switch.css, loaded here when a page does
 * not already include it). Semantic scoring
 * sends the mounted passages to the Knowledge documents encoder and ranks them by cosine
 * similarity; nothing else leaves the page.
 */
(() => {
  "use strict";
  if (window.SMTOUiFind) return;
  const supported = Boolean(globalThis.Highlight && globalThis.CSS?.highlights);
  const names = {matches: "smto-find", active: "smto-find-active", filters: "smto-filter", related: "smto-find-related"};
  const optionsKey = "smto.uiFind.options";
  // [name, label, description, kind, icon]: a "switch" uses the shared toggle; "button" stays a pill.
  const optionSpecs = [
    ["contents", "Contents", "List every match with a link to it", "button",
      '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'],
    ["only", "Only matches", "Hide content that does not contain a match", "switch",
      '<path d="M4 5h16l-6.2 7.4V18l-3.6 2v-7.6z"/>'],
    ["semantic", "Semantic", "Also find text with the same meaning, using the Knowledge embedding model", "switch",
      '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>'],
  ];
  // Smallest self-contained pieces of content: hiding keeps them whole and the semantic index
  // embeds each one as a passage.
  const unitSelector = 'li,tr,dt,dd,p,blockquote,pre,figure,h1,h2,h3,h4,h5,h6,summary,label,legend,caption,th,td,article,[role="row"],[role="listitem"],[role="option"],[role="treeitem"],[role="article"],[data-ui-find-unit]';
  // Page chrome and controls stay visible while Only matches hides unrelated content.
  const chromeSelector = 'header,nav,footer,aside,dialog,menu,[role="banner"],[role="navigation"],[role="toolbar"],[role="search"],[role="tablist"],[role="dialog"],[role="alert"],[role="status"],h1,h2,h3,h4,h5,h6,[role="heading"],summary,legend,caption,thead,[class*="actions"],.app-header,.product-topbar,.product-sidebar,.product-page-toolbar,[data-ui-find-ignore],[data-ui-find-keep],script,style,template';
  const contextSelector = 'section,details,article,fieldset,dialog,[role="region"],[role="article"]';
  const headingSelector = ':scope > :is(h1,h2,h3,h4,h5,h6,summary,legend,header,.dialog-heading,[role="heading"])';
  // Mounted DOM text is bounded tighter than an adapter's own, page-sized row list.
  const semanticBatch = 48, scoreRequestPassages = 3000, semanticPassages = 1500, adapterPassages = 5000, tocLimit = 200, relatedLimit = 20, scoreLimit = 8000;
  const filters = new Map(), adapters = new Set(), reveals = new Map(), pendingToggles = new WeakSet();
  const excluded = 'script,style,noscript,template,iframe,object,canvas,svg,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-ui-find-ignore],.sr-only,.app-boot-screen';
  const filterSpecs = [
    ["#chat-search", "#history-list"],
    ["#directory-search", "#directory-page-list, #directory-route-groups"],
    ["#parameter-search", "#parameter-list"], ["#schedule-search", "#schedule-list"],
    ["#notification-search", "#notification-list"],
    ["#prompt-recall-search", "#prompt-recall-results, #prompt-recall-variants"],
    [".inference-body #option-search", "#option-list"],
    [".inference-body #log-search", "#log-tail"],
    [".inference-body #log-worker", "#log-tail"],
    ['.capability-dialog [data-search], .permission-dialog [data-search]', null],
  ];
  let bar, field, counter, scopeLabel, previous, next, scope, opener;
  let opened = false, query = "", matches = [], current = -1, version = 0, timer, frame, scanning = false, dirty = false, wantJump = false, scanFeedback;
  let filterState = "";
  let searchAdapter;
  let optionRow, noteLine, toc, tocSignature = "";
  let related = [], hiddenNodes = new Set(), contentChanged = false, pendingScan = false;
  // Until the reader moves between results, the best semantic match stays selected.
  let navigated = false, semanticJumped = false;
  // Where this script was served from, so the shared switch stylesheet loads beside it.
  const assetBase = new URL(document.currentScript?.src ? "." : "/agent-ui/static/", document.currentScript?.src || location.href).href;
  const optionButtons = {}, scores = new Map(), relatedRanges = new WeakMap(), nodeIds = new WeakMap();
  const semantic = {version: 0, timer: 0, controller: null, running: false, again: false, busy: false,
    complete: false, done: 0, total: 0, error: "", floor: null, encoder: "", passages: []};
  const options = readOptions();
  /**
   * Read the viewer's saved Find options. Storage can be unavailable (private windows, blocked
   * site data); the options then start off and are kept only for this page.
   */
  function readOptions() {
    const value = {contents: false, only: false, semantic: false};
    try {
      const saved = JSON.parse(localStorage.getItem(optionsKey) || "{}");
      for (const key of Object.keys(value)) if (typeof saved?.[key] === "boolean") value[key] = saved[key];
    } catch { /* Defaults apply. */ }
    return value;
  }
  function saveOptions() {
    try { localStorage.setItem(optionsKey, JSON.stringify(options)); } catch { /* Kept for this page. */ }
  }
  const collapse = text => String(text || "").replace(/\s+/g, " ").trim();
  const clip = (text, limit) => text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
  const anchor = range => range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  const targets = () => related.length ? [...matches, ...related.map(item => item.range)] : matches;
  // An adapter that filters its own rows (Settings, System health) keeps that behavior.
  const adapterFilters = () => Boolean(scope && scope === searchAdapter?.root && searchAdapter.filters);
  // Text-level tags that stylesheets often turn into lines (labels, descriptions, badges).
  const inlineTags = /^(A|ABBR|B|BDI|BDO|CITE|CODE|DATA|DFN|EM|I|KBD|MARK|Q|S|SAMP|SMALL|SPAN|STRONG|SUB|SUP|TIME|U|VAR)$/;
  const blockTags = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DETAILS|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LABEL|LEGEND|LI|MAIN|NAV|OL|P|PRE|SECTION|SUMMARY|TABLE|TD|TH|TR|UL)$/;
  /**
   * Readable text of an element whether or not it is displayed: block boundaries (including
   * text-level elements styled as blocks) become " · ", and hidden helpers are skipped. With controls, select options and field values are included
   * (useful for meaning), otherwise only the text a reader sees beside them.
   */
  function plainText(element, {controls = false} = {}) {
    const parts = [];
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) { parts.push(node.data); return; }
      if (node.nodeType !== Node.ELEMENT_NODE || node.matches('script,style,template,svg,[aria-hidden="true"],.sr-only,[data-ui-find-ignore]')) return;
      if (node.matches("select,input,textarea")) {
        if (controls) parts.push("\n", node.matches("select") ? [...node.options].map(option => option.textContent).join(", ") : node.value || node.placeholder || "", "\n");
        return;
      }
      const block = blockTags.test(node.tagName)
        || (inlineTags.test(node.tagName) && !getComputedStyle(node).display.startsWith("inline"));
      if (block) parts.push("\n");
      for (const child of node.childNodes) walk(child);
      if (block) parts.push("\n");
    };
    if (element) walk(element);
    return parts.join("").split(/\n+/).map(collapse).filter(Boolean).join(" · ");
  }
  let lastNodeId = 0;
  function nodeId(node) {
    if (!nodeIds.has(node)) nodeIds.set(node, ++lastNodeId);
    return nodeIds.get(node);
  }
  /**
   * Yield a long DOM text scan to the browser event loop without scheduling a network read.
   */
  const yieldUi = () => new Promise(resolve => setTimeout(resolve, 0));
  const observer = new MutationObserver(records => {
    if (records.some(record => !record.target.parentElement?.closest('[data-ui-find-ignore]')
        && !record.target.closest?.('[data-ui-find-ignore]'))) { contentChanged = true; queueRefresh(); }
  });
  /**
   * Require connected layout geometry and no hidden/inert/aria-hidden ancestor for active controls
   * and filter roots.
   */
  const visible = node => node?.isConnected && !node.closest('[hidden],[inert],[aria-hidden="true"]')
    && Boolean(node.getClientRects().length);
  // Navigation uses the current page's filtered links; it must not reset that page's query.
  const navigationSurface = () => document.querySelector('dialog[data-ui-find-navigation][open]');
  /**
   * Choose the active native modal, then the latest visible modal-style surface, otherwise the
   * page body. Embedded nonmodal panels marked as page content remain inside page search.
   */
  function foreground() {
    // Embedded nonmodal surfaces belong to page search; real modals keep their own scope.
    const dialogs = [...document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')]
      .filter(node => visible(node) && !node.hasAttribute("data-ui-find-navigation")
        && (!node.hasAttribute("data-ui-find-page") || node.matches(":modal")));
    // Native modal dialogs occupy the top layer, above temporary drawers.
    const modal = dialogs.find(node => node.matches("dialog:modal") && node.contains(document.activeElement))
      || dialogs.filter(node => node.matches("dialog:modal")).at(-1);
    return modal || dialogs.at(-1) || document.body;
  }
  /**
   * Name the current search scope from accessible dialog headings or the page title. Conversation
   * scope explicitly says that only loaded content is searched.
   */
  function title(root) {
    if (root === document.body) return document.querySelector("#conversation-viewport") ? "Conversation · Loaded content only"
      : document.querySelector("h1, .surface-name")?.textContent.trim() || "This screen";
    return root.getAttribute("aria-label") || document.getElementById(root.getAttribute("aria-labelledby"))?.textContent.trim()
      || root.querySelector("h1,h2,h3")?.textContent.trim() || "Dialog";
  }
  /**
   * Replace a named CSS Highlight registry entry with the supplied DOM ranges and priority.
   * Unsupported browsers leave this visual layer untouched.
   */
  function paint(name, ranges, priority = 0) {
    if (!supported) return;
    const highlight = new Highlight();
    for (const range of ranges) highlight.add(range);
    highlight.priority = priority;
    CSS.highlights.set(name, highlight);
  }
  /**
   * Remove general/active Find highlights and reset match selection without clearing independent
   * filter highlights.
   */
  function clearFind() {
    if (supported) { CSS.highlights.delete(names.matches); CSS.highlights.delete(names.active); CSS.highlights.delete(names.related); }
    matches = []; related = []; current = -1;
    applyHiding(); renderToc(); note();
  }
  /**
   * Observe only the open Find scope and visible filters with nonempty queries. Track
   * text/children and relevant visibility/disclosure attributes, replacing prior observation roots
   * on each refresh.
   */
  function watch() {
    observer.disconnect();
    const roots = new Set(opened ? [scope] : []);
    for (const [input, rootsFor] of filters) if (visible(input) && input.value.trim())
      for (const root of rootsFor()) if (root?.isConnected) roots.add(root);
    for (const root of roots) if (root?.isConnected) observer.observe(root, {subtree: true, childList: true,
      characterData: true, attributes: true, attributeFilter: ["hidden", "open", "class", "style", "inert", "aria-hidden", "data-task-collapsed"]});
  }
  /**
   * Register a search input and static or computed result roots for passive highlighting. Ignore
   * duplicates and return a disposer that removes registration and refreshes ranges.
   */
  function registerFilter(input, rootsFor) {
    if (!input || filters.has(input)) return;
    filters.set(input, typeof rootsFor === "function" ? rootsFor : () => rootsFor);
    refresh();
    return () => { filters.delete(input); refresh(); };
  }
  /**
   * Register known page/log/policy search fields and remove detached inputs. These registrations
   * highlight already produced filter results; they do not implement the owner’s filtering or
   * fetching.
   */
  function discoverFilters() {
    for (const [selector, roots] of filterSpecs) for (const input of document.querySelectorAll(selector))
      registerFilter(input, () => roots ? [...document.querySelectorAll(roots)] : [input.closest("dialog")]);
    // Both policy editors can be mounted with a caller-selected dialog class.
    for (const input of document.querySelectorAll('dialog input[type="search"][data-search]'))
      registerFilter(input, () => [input.closest("dialog")]);
    for (const input of filters.keys()) if (!input.isConnected) filters.delete(input);
  }
  /**
   * Add one accessible Find button to a page action host or dialog, using the fixed icon and
   * ignoring the button’s own text during scans.
   */
  function trigger(host) {
    if (!host || host.querySelector(':scope > [data-ui-find-trigger]')) return;
    const button = document.createElement("button"); button.type = "button";
    button.className = "ui-find-trigger"; button.dataset.uiFindTrigger = ""; button.dataset.uiFindIgnore = "";
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
    button.title = "Find on this screen (⌘F / Ctrl+F)";
    button.setAttribute("aria-label", "Find on this screen");
    button.addEventListener("click", open);
    if (host.matches('dialog, [role="dialog"]')) host.prepend(button); else host.append(button);
  }
  /**
   * Reconcile the foreground scope, dialog trigger, dynamic filters and search-bar position.
   * Restore temporary reveals when scope changes, reapply the scoped search adapter and refresh
   * observed roots.
   */
  function syncSurface() {
    frame = 0;
    const root = foreground();
    if (root !== document.body) {
      const headerSelector = ':scope > header, :scope > form > header, :scope > form > .dialog-heading, :scope > .prompt-recall-heading, :scope > .product-sidebar > .product-sidebar-heading';
      trigger(root.querySelector(headerSelector) || root);
    }
    discoverFilters();
    const nextFilterState = [...filters.keys()].map(input => `${visible(input)}:${input.value}`).join("\0");
    if (nextFilterState !== filterState) { filterState = nextFilterState; refresh(); }
    if (opened && root !== scope) {
      restoreReveals(); resetSemantic(); clearFind(); scope = root; mountBar(); scopeLabel.textContent = title(scope);
      syncSearch(); syncOptions();
      refresh(true);
    }
    if (opened) {
      // Keep query, adapter results and temporary reveals while the drawer owns keyboard focus.
      // Closing it restores Find without taking focus away from the selected destination.
      bar.hidden = Boolean(navigationSurface());
      if (!bar.hidden) positionBar();
    }
    watch();
  }
  /**
   * Coalesce surface/focus/resize changes into one animation-frame reconciliation.
   */
  function surfaceChanged() { if (!frame) frame = requestAnimationFrame(syncSurface); }
  /**
   * Place page Find below the visible header and any horizontal Settings navigation, preserving
   * access to section controls. Dialog positioning is delegated to its local layout.
   */
  function positionBar() {
    const navigation = document.querySelector(".mission-settings-sidebar");
    const content = document.querySelector(".mission-settings-sections");
    let edge = Math.max(0, ...[...document.querySelectorAll(".app-header, .product-topbar, .product-page-toolbar")]
      .filter(visible).map(node => node.getBoundingClientRect().bottom));
    // Keep horizontal section navigation usable while the shared popup is open.
    if (navigation && content && navigation.getBoundingClientRect().bottom <= content.getBoundingClientRect().top + 1)
      edge = Math.max(edge, navigation.getBoundingClientRect().bottom);
    bar.style.top = scope === document.body ? `${Math.max(8, edge + 8)}px` : "";
  }
  /**
   * Move the single search bar into the current page/dialog scope and update its position,
   * preserving keyboard focus inside a modal boundary.
   */
  function mountBar() {
    if (scope === document.body) scope.append(bar); else scope.prepend(bar);
    positionBar();
  }
  /**
   * Report the selected DOM match or an adapter’s semantic result count when no literal range
   * exists. Disable previous/next controls when there are no DOM ranges.
   */
  function updateCount() {
    const results = opened && scope === searchAdapter?.root ? searchAdapter.getResultCount?.() : 0;
    const total = matches.length + related.length;
    counter.textContent = !query ? "Type to find" : total ? `${current + 1} of ${total}`
      : results ? `${results} matching result${results === 1 ? "" : "s"}` : semantic.busy || semantic.scoring ? "Searching…" : "No matches";
    previous.disabled = next.disabled = !total;
  }
  /**
   * Apply the query only to the adapter owning the current scope; clear its filter when Find
   * closes or enters another scope. Use its placeholder without changing other input owners.
   * Semantic matches are passed along so a filtering adapter keeps those rows visible.
   */
  function syncSearch() {
    if (!searchAdapter) return;
    const active = opened && scope === searchAdapter.root;
    searchAdapter.apply(active ? query : "", {related: active ? related.map(item => item.element) : []});
    if (field) field.placeholder = active ? searchAdapter.placeholder || "Find on this screen…" : "Find on this screen…";
    if (opened && bar) positionBar();
  }
  /**
   * Mirror a details element’s open state into its summary and exact aria-controls companions
   * after temporary reveal/restoration.
   */
  function syncDisclosure(details) {
    const summary = details.querySelector(":scope > summary");
    if (summary?.hasAttribute("aria-expanded")) summary.setAttribute("aria-expanded", String(details.open));
    if (details.id) for (const control of document.querySelectorAll("[aria-controls]"))
      if (control.getAttribute("aria-controls") === details.id && control.hasAttribute("aria-expanded"))
        control.setAttribute("aria-expanded", String(details.open));
  }
  /**
   * Invoke every recorded adapter/disclosure restoration callback and clear the temporary reveal
   * registry.
   */
  function restoreReveals() {
    for (const restore of reveals.values()) restore();
    reveals.clear();
  }
  /**
   * Reveal an adapter-owned collapsed target and closed ancestor disclosures for a selected match.
   * Record restoration callbacks and mark programmatic toggles so lazy-load handlers are
   * suppressed; explicit later user choices can take ownership.
   */
  function reveal(node) {
    for (const adapter of adapters) if (adapter.root.contains(node)) {
      const target = node.closest(adapter.selector);
      if (target) {
        const restore = adapter.reveal(target);
        if (restore) reveals.set(target, restore);
      }
    }
    for (let element = node; element && element !== scope.parentElement; element = element.parentElement) {
      if (element.tagName !== "DETAILS" || element.open || element.querySelector(":scope > summary")?.contains(node)) continue;
      const details = element;
      details.dataset.uiFindReveal = ""; pendingToggles.add(details); details.open = true; syncDisclosure(details);
      reveals.set(details, () => {
        if (!details.hasAttribute("data-ui-find-reveal")) return;
        pendingToggles.add(details); details.open = false;
        details.removeAttribute("data-ui-find-reveal"); syncDisclosure(details);
      });
    }
  }
  /**
   * Wrap the selected match index, highlight it and optionally reveal/center the exact occurrence
   * through nested scroll containers. Background rescans can update selection without scrolling
   * the reader.
   */
  function select(index, scroll = false) {
    const list = targets();
    current = list.length ? (index + list.length) % list.length : -1;
    const range = list[current];
    if (range && scroll) {
      const node = anchor(range);
      reveal(node);
      node.scrollIntoView({block: "center", inline: "nearest", behavior: "instant"});
      // Center the actual occurrence, including within long preformatted output.
      for (let host = node; host && host !== document.body; host = host.parentElement) {
        const css = getComputedStyle(host), box = host.getBoundingClientRect(), rect = range.getBoundingClientRect();
        if (/(auto|scroll)/.test(css.overflowY) && host.scrollHeight > host.clientHeight)
          host.scrollTop += rect.top + rect.height / 2 - box.top - host.clientHeight / 2;
      }
      clearOfBar(range, node);
    }
    paint(names.active, range ? [range] : [], 2); updateCount(); markToc();
  }
  /**
   * Page Find floats over content; with Contents open it can cover the centered match. Move the
   * match just below the panel when it overlaps and still fits on screen.
   */
  function clearOfBar(range, node) {
    if (scope !== document.body || bar.hidden) return;
    const panel = bar.getBoundingClientRect(), rect = range.getBoundingClientRect();
    const overlaps = rect.right > panel.left && rect.left < panel.right && rect.bottom > panel.top && rect.top < panel.bottom;
    const shift = panel.bottom + 12 - rect.top;
    if (!overlaps || panel.bottom + 12 + Math.min(rect.height, 120) > innerHeight) return;
    let host = node.parentElement;
    while (host && host !== document.body && !(/(auto|scroll)/.test(getComputedStyle(host).overflowY) && host.scrollHeight > host.clientHeight)) host = host.parentElement;
    (host && host !== document.body ? host : document.scrollingElement).scrollBy({top: -shift, behavior: "instant"});
  }
  /**
   * Identify an adapter-owned collapsed element eligible for Find’s temporary reveal; filtered or
   * unrelated hidden content still follows the scan exclusions.
   */
  function temporarilyHidden(element) {
    return [...adapters].some(adapter => adapter.root.contains(element) && element.matches(adapter.selector));
  }
  // Yield text blocks with offsets into the original nodes, including inline markup.
  /**
   * Yield eligible text-node groups with original offsets, joining inline markup but separating
   * block boundaries. Exclude editors, scripts, hidden/filtered content and inactive dialogs;
   * general Find may inspect registered collapsed bodies while passive filter highlighting stays
   * within open content.
   */
  function* blocks(root, collapsed) {
    let nodes = [];
    /**
     * Yield the pending contiguous text-node group and reset it at a structural or
     * excluded-content boundary.
     */
    function* flush() { if (nodes.length) { yield nodes; nodes = []; } }
    /**
     * Traverse DOM text under the requested visibility policy, recognizing temporary task reveals
     * and folded activity panels. Flush around block elements so matches cannot cross unrelated
     * blocks.
     */
    function* walk(element) {
      if (element.nodeType === Node.TEXT_NODE) { nodes.push(element); return; }
      if (element.nodeType !== Node.ELEMENT_NODE) return;
      // Only matches hides presentation only; hidden content still counts for every scan.
      const temporary = (collapsed && temporarilyHidden(element)) || element.hasAttribute("data-ui-find-hidden");
      const foldedPanel = collapsed && element.matches('.activity-disclosures > .activity-section-disclosure:not([open]) > :not(summary)');
      if (element.matches(excluded) || element.hidden || element.getAttribute("aria-hidden") === "true"
          || (element.inert && !temporary)
          || (element.matches("dialog") && !element.open)
          || (collapsed && element.matches(".task-disclosure-query, .task-disclosure-timing"))) { yield* flush(); return; }
      const css = getComputedStyle(element);
      if ((css.display === "none" && !temporary && !foldedPanel) || css.visibility === "hidden" || css.visibility === "collapse") { yield* flush(); return; }
      const block = !["inline", "contents"].includes(css.display) || element.tagName === "BR";
      if (block) yield* flush();
      for (const child of element.childNodes) {
        if (!collapsed && element.matches("details:not([open])") && child !== element.querySelector(":scope > summary")) continue;
        yield* walk(child);
      }
      if (block) yield* flush();
    }
    yield* walk(root); yield* flush();
  }
  /**
   * Find case-insensitive Unicode literal matches across inline text nodes within each eligible
   * block, creating DOM Ranges without wrapping content. Escape regex metacharacters, yield after
   * work slices and discard obsolete query versions; stop a changed block’s current scan after
   * yielding.
   */
  async function scan(root, value, collapsed, stamp) {
    const ranges = [], pattern = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
    let started = performance.now(), visited = 0;
    for (const nodes of blocks(root, collapsed)) {
      const pieces = nodes.map(node => node.data), text = pieces.join("");
      pattern.lastIndex = 0;
      let match, offset = 0, cursor = 0;
      while ((match = pattern.exec(text))) {
        const start = match.index, end = start + match[0].length;
        while (cursor < nodes.length - 1 && offset + nodes[cursor].length <= start) offset += nodes[cursor++].length;
        let last = cursor, endOffset = offset;
        while (last < nodes.length - 1 && endOffset + nodes[last].length < end) endOffset += nodes[last++].length;
        const range = new Range(); range.setStart(nodes[cursor], start - offset); range.setEnd(nodes[last], end - endOffset);
        ranges.push(range);
        if (++visited % 100 === 0 && performance.now() - started > 8) {
          await yieldUi(); if (stamp !== version) return []; started = performance.now();
          if (nodes.some((node, i) => node.data !== pieces[i])) break;
        }
      }
      if (performance.now() - started > 8) { await yieldUi(); if (stamp !== version) return []; started = performance.now(); }
    }
    return ranges;
  }
  /**
   * Scan current Find and independent visible filter roots, preserve the active occurrence by
   * node/offset where possible and paint only connected ranges. General Find suppresses
   * overlapping filter highlighting in its scope; version fences reject obsolete scans.
   */
  async function render(stamp, jump) {
    if (!supported) { updateCount(); return; }
    const active = targets()[current], oldIndex = current;
    const found = opened && query ? await scan(scope, query, true, stamp) : [];
    if (stamp !== version) return;
    matches = found.filter(range => range.startContainer.isConnected && scope?.contains(range.startContainer));
    paint(names.matches, matches, 1);
    setRelated(chooseRelated());
    applyHiding();
    const list = targets();
    let same = active ? list.findIndex(range => range.startContainer === active.startContainer && range.startOffset === active.startOffset) : -1;
    const bestFirst = !navigated && !matches.length && related.length > 0;
    if (bestFirst) same = 0;
    current = same >= 0 ? same : Math.min(Math.max(oldIndex, 0), list.length - 1);
    pendingScan = false;
    // Semantic-only results arrive after typing; reveal the best one once, like a literal match.
    const revealBest = bestFirst && !semanticJumped;
    if (revealBest) semanticJumped = true;
    if (opened) select(current, (jump || revealBest) && !navigationSurface());
    renderToc(); note();
    const filtered = [];
    for (const [input, rootsFor] of filters) {
      if (!visible(input) || !input.value.trim()) continue;
      for (const root of rootsFor()) {
        if (!visible(root)) continue;
        const ranges = await scan(root, input.value.trim(), false, stamp);
        if (stamp !== version) return;
        filtered.push(...ranges.filter(range => !(opened && query && scope.contains(range.startContainer))));
      }
    }
    if (stamp === version) paint(names.filters, filtered);
  }
  /**
   * Serialize one asynchronous scan, capture its version/jump intent and replay mutations observed
   * while it runs. Finish busy feedback only after dirty work settles.
   */
  async function runScan() {
    timer = null;
    if (scanning) return;
    const busyFeedback = scanFeedback;
    try {
    scanning = true; dirty = false;
    const stamp = version, jump = wantJump;
    try {
      await render(stamp, jump);
      if (stamp === version) {
        wantJump = false;
        // Re-read passages only when the page or query changed, not after semantic results.
        if (contentChanged) { contentChanged = false; scheduleSemantic(); }
      }
    } finally {
      scanning = false;
      if (dirty) queueRefresh();
    }

    } finally { if (!dirty) { busyFeedback?.finish(); if (scanFeedback === busyFeedback) scanFeedback = null; } }
  }
  // Streaming coalesces into bounded scans instead of postponing Find indefinitely.
  /**
   * Coalesce streaming/mutation invalidations into an 80 ms scan when idle, without repeatedly
   * postponing a pending scan.
   */
  function queueRefresh() {
    dirty = true;
    if (!timer && !scanning) timer = setTimeout(runScan, 80);
  }
  /**
   * Advance query/scope version, replace the scheduled scan and refresh observation roots.
   * Explicit navigation requests use 100 ms feedback scheduling; ordinary refresh uses 80 ms.
   */
  function refresh(jump = false) {
    if (jump) { scanFeedback?.dispose(); scanFeedback = window.SMTOBusy?.begin({host: field, label: "Finding matches…"}); }
    ++version; clearTimeout(timer); wantJump ||= jump; dirty = true; contentChanged = true; pendingScan = true; watch();
    timer = setTimeout(runScan, jump ? 100 : 80);
  }
  /**
   * Find the self-contained piece of content around a node: the nearest list item, row, paragraph
   * or similar element, otherwise the largest ancestor that is still a short block of text. With
   * a limit, an oversized structural unit falls back to that short-block search.
   */
  function unitFor(node, pass, limit = Infinity) {
    if (!node || !scope?.contains(node)) return null;
    const cacheKey = limit === Infinity ? pass.units : pass.passages;
    if (cacheKey.has(node)) return cacheKey.get(node);
    const length = element => {
      if (!pass.lengths.has(element)) pass.lengths.set(element, collapse(element.textContent).length);
      return pass.lengths.get(element);
    };
    let unit = node.closest(unitSelector);
    if (unit && (unit === scope || !scope.contains(unit) || length(unit) > limit)) unit = null;
    if (!unit) {
      unit = node;
      while (unit.parentElement && unit.parentElement !== scope && scope.contains(unit.parentElement)
        && length(unit.parentElement) <= 280) unit = unit.parentElement;
    }
    cacheKey.set(node, unit);
    return unit;
  }
  const newPass = () => ({units: new Map(), passages: new Map(), lengths: new Map()});
  /**
   * Hide every element in scope that holds no match, keeping matched units whole along with page
   * chrome, headings of matched sections and controls such as search fields and action bars.
   * Without matches nothing is hidden. Adapter-filtered screens keep their own filtering.
   */
  function applyHiding() {
    const nextHidden = new Set();
    if (opened && query && options.only && supported && scope && !adapterFilters()) {
      const pass = newPass(), units = new Set(), kept = new Set();
      for (const range of targets()) { const unit = unitFor(anchor(range), pass); if (unit) units.add(unit); }
      for (const unit of units) for (let element = unit; element && element !== scope; element = element.parentElement) kept.add(element);
      // Page filters stay usable; per-item composers inside unmatched content hide with it.
      const keepAlways = element => element.matches(chromeSelector)
        || Boolean(element.querySelector('input[type="search"],[role="search"]'))
        || ["fixed", "sticky"].includes(getComputedStyle(element).position);
      const visit = element => {
        for (const child of element.children) {
          if (kept.has(child)) { if (!units.has(child)) visit(child); }
          else if (!child.hidden && child.textContent.trim() && !keepAlways(child)) nextHidden.add(child);
        }
      };
      if (units.size) visit(scope);
    }
    for (const element of hiddenNodes) if (!nextHidden.has(element)) element.removeAttribute("data-ui-find-hidden");
    for (const element of nextHidden) if (!hiddenNodes.has(element)) element.setAttribute("data-ui-find-hidden", "");
    hiddenNodes = nextHidden;
  }
  /**
   * Collect the passages the semantic index compares: an adapter's own rows when it supplies
   * them, otherwise the text of each content unit eligible for literal Find (including collapsed
   * bodies Find can reveal).
   */
  function collectPassages(root) {
    const own = root === searchAdapter?.root && searchAdapter.passages?.();
    const result = [];
    if (Array.isArray(own)) {
      for (const item of own) {
        const text = clip(collapse(item?.text), 1000);
        if (item?.element?.isConnected && /\p{L}{2,}/u.test(text)) result.push({element: item.element, text});
        if (result.length >= adapterPassages) break;
      }
      return result;
    }
    const pass = newPass(), texts = new Map();
    for (const nodes of blocks(root, true)) {
      const unit = unitFor(nodes[0].parentElement, pass, 1200);
      if (!unit) continue;
      if (!texts.has(unit)) { if (texts.size >= semanticPassages) break; texts.set(unit, []); }
      texts.get(unit).push(nodes.map(node => node.data).join(""));
    }
    for (const [element, parts] of texts) {
      const text = clip(collapse(parts.join(" ")), 1000);
      if (/\p{L}{2,}/u.test(text)) result.push({element, text});
    }
    return result;
  }
  const scoreKey = (text, passage) => `${text}\u0000${passage}`;
  function rememberScore(key, value) {
    scores.delete(key); scores.set(key, value);
    if (scores.size > scoreLimit) scores.delete(scores.keys().next().value);
  }
  /**
   * Pick passages related by meaning from the scores known so far. A passage qualifies when it is
   * within 0.11 of the best score and above the calibrated encoder's absolute floor; an
   * uncalibrated encoder instead requires a clear outlier (three deviations above the median).
   * Passages that already contain a literal match are left to the exact results.
   */
  function chooseRelated() {
    if (!options.semantic || !opened || !query || !supported) return [];
    const scored = [];
    for (const passage of semantic.passages) {
      if (!passage.element.isConnected || !scope.contains(passage.element)) continue;
      const score = scores.get(scoreKey(query, passage.text));
      if (score !== undefined) scored.push({...passage, score});
    }
    if (!scored.length) return [];
    const values = scored.map(item => item.score).sort((a, b) => a - b);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const spread = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    let cut = values.at(-1) - 0.11;
    if (semantic.floor !== null) cut = Math.max(cut, semantic.floor);
    else if (values.length >= 12) cut = Math.max(cut, values[Math.floor(values.length / 2)] + 3 * spread);
    const literal = new Set();
    for (const range of matches) for (let node = range.startContainer; node && node !== scope; node = node.parentNode) literal.add(node);
    return scored.filter(item => item.score >= cut && !literal.has(item.element))
      .sort((a, b) => b.score - a.score).slice(0, relatedLimit)
      .map(item => {
        let range = relatedRanges.get(item.element);
        if (!range) { range = new Range(); relatedRanges.set(item.element, range); }
        range.selectNodeContents(item.element);
        return {...item, range};
      });
  }
  /**
   * Install new related matches, repaint them and let a filtering adapter show those rows. The
   * adapter is told only when the set of elements changes, so its mutations cannot loop.
   */
  function setRelated(nextRelated) {
    const changed = nextRelated.length !== related.length || nextRelated.some((item, index) => item.element !== related[index].element);
    related = nextRelated;
    paint(names.related, related.map(item => item.range), 0);
    if (changed && opened && scope === searchAdapter?.root) syncSearch();
  }
  /**
   * Cancel pending semantic work for the previous query or scope.
   */
  function resetSemantic() {
    semantic.version++; semantic.controller?.abort(); semantic.controller = null;
    clearTimeout(semantic.timer); semantic.timer = 0;
    Object.assign(semantic, {running: false, again: false, busy: false, scoring: false, complete: false, done: 0, total: 0, error: "", passages: []});
  }
  function scheduleSemantic() {
    if (!options.semantic || !opened || !query || !supported) return;
    if (!semantic.timer) semantic.timer = setTimeout(runSemantic, 300);
  }
  /**
   * POST a batch of passages for scoring. Pages with the shared API client use it for sign-in and
   * error presentation; isolated pages fall back to a same-origin request.
   */
  async function requestScores(text, passages, signal, encode) {
    const body = {query: text, passages, encode};
    if (window.SMTOAgentUi?.apiJson) return window.SMTOAgentUi.apiJson("/rag/page-search", {method: "POST", body, signal});
    const response = await fetch("/api/agent/rag/page-search", {method: "POST", credentials: "same-origin",
      headers: {"Content-Type": "application/json"}, body: JSON.stringify(body), signal});
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.detail?.message || (typeof payload?.detail === "string" ? payload.detail : `The server answered ${response.status}.`));
    }
    return response.json();
  }
  /**
   * Check a server answer and remember its scores; null marks a passage the server has not
   * indexed yet. Returns the passages that still need encoding.
   */
  function acceptScores(wanted, texts, result) {
    if (!Array.isArray(result?.scores) || result.scores.length !== texts.length) throw new Error("The server returned an unexpected answer.");
    if (result.encoder !== semantic.encoder) { scores.clear(); semantic.encoder = result.encoder; }
    semantic.floor = typeof result.floor === "number" ? result.floor : null;
    const unindexed = [];
    texts.forEach((text, index) => {
      const value = result.scores[index];
      if (value === null) unindexed.push(text); else rememberScore(scoreKey(wanted, text), Number(value) || 0);
    });
    return unindexed;
  }
  /**
   * Score the screen for this query in two steps: one request scores every passage the server has
   * already indexed (a new query costs a single round trip), then passages it has never seen are
   * sent in small encode batches whose scores apply as each one lands. Indexed vectors outlive
   * the query, so abandoned queries leave nothing to redo.
   */
  async function runSemantic() {
    semantic.timer = 0;
    if (semantic.running) { semantic.again = true; return; }
    if (!options.semantic || !opened || !query || !supported) return;
    const stamp = semantic.version, wanted = query;
    semantic.running = true; semantic.again = false; semantic.error = "";
    try {
      semantic.passages = collectPassages(scope);
      const unique = [...new Set(semantic.passages.map(passage => passage.text))];
      const pending = unique.filter(text => !scores.has(scoreKey(wanted, text)));
      semantic.total = unique.length; semantic.done = unique.length - pending.length;
      const unindexed = [];
      semantic.scoring = pending.length > 0; updateCount();
      for (let offset = 0; offset < pending.length; offset += scoreRequestPassages) {
        const chunk = pending.slice(offset, offset + scoreRequestPassages);
        semantic.controller = new AbortController();
        const result = await requestScores(wanted, chunk, semantic.controller.signal, false);
        if (stamp !== semantic.version) return;
        unindexed.push(...acceptScores(wanted, chunk, result));
      }
      semantic.done = unique.length - unindexed.length; semantic.scoring = false;
      semantic.busy = unindexed.length > 0; note(); queueRefresh();
      for (let offset = 0; offset < unindexed.length; offset += semanticBatch) {
        const batch = unindexed.slice(offset, offset + semanticBatch);
        semantic.controller = new AbortController();
        const result = await requestScores(wanted, batch, semantic.controller.signal, true);
        if (stamp !== semantic.version) return;
        if (acceptScores(wanted, batch, result).length) throw new Error("The server returned an unexpected answer.");
        semantic.done += batch.length; note(); queueRefresh();
      }
      semantic.complete = true;
    } catch (error) {
      if (stamp !== semantic.version || error?.name === "AbortError") return;
      semantic.error = clip(collapse(error?.message) || "The embedding model did not answer.", 220);
    } finally {
      if (stamp === semantic.version) {
        semantic.running = false; semantic.busy = semantic.scoring = false; semantic.controller = null;
        note(); queueRefresh();
        if (semantic.again) scheduleSemantic();
      }
    }
  }
  /**
   * Show semantic progress, results or failure, and say when Only matches has nothing to keep.
   */
  function note() {
    if (!noteLine) return;
    let text = "";
    if (opened && query && supported && options.semantic) {
      if (semantic.error) text = `Semantic search is unavailable. ${semantic.error}`;
      else if (semantic.busy) text = `Indexing this screen for meaning… ${semantic.done} of ${semantic.total} passages`;
      else if (semantic.complete) text = related.length ? `${related.length} related by meaning` : "Nothing else related by meaning";
    }
    if (opened && query && supported && options.only && !adapterFilters() && !targets().length && !semantic.busy && !pendingScan)
      text = text ? `${text} · Nothing hidden without matches` : "Nothing hidden without matches";
    noteLine.textContent = text; noteLine.hidden = !text;
    noteLine.classList.toggle("is-error", Boolean(semantic.error && options.semantic));
  }
  /**
   * Name where a match sits from its three nearest titled sections, disclosures or dialogs
   * ("Planner › Generation › Common parameters"), so identical rows in different places differ.
   */
  function contextFor(element) {
    const names = [];
    for (let node = element; node && node !== document.body && names.length < 3; node = node.parentElement) {
      if (node.matches(contextSelector)) {
        const heading = node.querySelector(headingSelector);
        const text = heading && !heading.contains(element) ? clip(plainText(heading).split(" · ")[0], 36) : "";
        if (text && text !== names[0]) names.unshift(text);
      }
      if (node === scope) break;
    }
    return names.join(" › ");
  }
  /**
   * Show a literal match with a little text on each side, taken from its content unit.
   */
  function snippet(range, unit) {
    const hit = range.toString();
    if (!unit?.contains(range.startContainer)) return ["", hit, ""];
    const before = document.createRange();
    before.setStart(unit, 0); before.setEnd(range.startContainer, range.startOffset);
    const text = unit.textContent, start = before.toString().length, end = start + hit.length;
    const head = text.slice(Math.max(0, start - 48), start).replace(/\s+/g, " ").trimStart();
    const tail = text.slice(end, end + 72).replace(/\s+/g, " ").trimEnd();
    return [`${start > 48 ? "…" : ""}${head}`, hit, `${tail}${end + 72 < text.length ? "…" : ""}`];
  }
  /**
   * Render Contents: one link per exact match (in page order) and per related passage (best
   * first). Rebuilding is skipped while the result set is unchanged so focus and hover survive.
   */
  function renderToc() {
    if (!toc) return;
    const show = opened && supported && options.contents && Boolean(query);
    toc.hidden = !show;
    if (!show) { if (tocSignature) { toc.replaceChildren(); tocSignature = ""; } return; }
    const signature = [query, matches.length, related.length, pendingScan || semantic.busy,
      ...matches.slice(0, tocLimit).map(range => `${nodeId(range.startContainer)}:${range.startOffset}:${range.endOffset}`),
      ...related.map(item => `${nodeId(item.element)}:${item.score}`)].join("|");
    if (signature === tocSignature) { markToc(); return; }
    tocSignature = signature;
    const focused = toc.contains(document.activeElement) ? document.activeElement.dataset.index : null;
    const pass = newPass(), fragment = document.createDocumentFragment();
    const group = (label, count, entries) => {
      const heading = document.createElement("h3"); heading.className = "ui-find-toc-heading";
      const total = document.createElement("span"); total.textContent = count.toLocaleString();
      heading.append(label, " ", total);
      const list = document.createElement("ol"); list.className = "ui-find-toc-list"; list.append(...entries);
      fragment.append(heading, list);
    };
    const entry = (index, unit, parts, score) => {
      const item = document.createElement("li"), button = document.createElement("button");
      button.type = "button"; button.className = "ui-find-toc-entry"; button.dataset.index = String(index);
      const context = contextFor(unit);
      if (context) { const label = document.createElement("span"); label.className = "ui-find-toc-context"; label.textContent = context; button.append(label); }
      const text = document.createElement("span"); text.className = "ui-find-toc-snippet";
      if (Array.isArray(parts)) { const mark = document.createElement("mark"); mark.textContent = parts[1]; text.append(parts[0], mark, parts[2]); }
      else text.textContent = parts;
      button.append(text);
      if (score !== undefined) {
        const badge = document.createElement("span"); badge.className = "ui-find-toc-score";
        badge.textContent = `${Math.round(score * 100)}%`; badge.title = "Similarity in meaning";
        button.append(badge);
      }
      button.addEventListener("click", () => { navigated = true; select(index, true); });
      item.append(button);
      return item;
    };
    if (matches.length) {
      group("Exact matches", matches.length, matches.slice(0, tocLimit).map((range, index) => {
        const unit = unitFor(anchor(range), pass, 1200) || anchor(range);
        return entry(index, unit, snippet(range, unit));
      }));
      if (matches.length > tocLimit) {
        const more = document.createElement("p"); more.className = "ui-find-toc-more";
        more.textContent = `Showing the first ${tocLimit} of ${matches.length.toLocaleString()} matches. Use ↑ and ↓ to reach the rest.`;
        fragment.append(more);
      }
    }
    if (related.length) group("Related by meaning", related.length,
      related.map((item, index) => entry(matches.length + index, item.element, clip(plainText(item.element) || item.text, 160), item.score)));
    if (!matches.length && !related.length) {
      const empty = document.createElement("p"); empty.className = "ui-find-toc-more";
      empty.textContent = pendingScan || semantic.busy ? "Looking for matches…" : "No matches on this screen.";
      fragment.append(empty);
    }
    toc.replaceChildren(fragment);
    markToc();
    if (focused !== null) toc.querySelector(`[data-index="${focused}"]`)?.focus({preventScroll: true});
  }
  /**
   * Mark the selected match in Contents and keep it in view inside the list only.
   */
  function markToc() {
    if (!toc || toc.hidden) return;
    for (const button of toc.querySelectorAll(".ui-find-toc-entry[aria-current]")) button.removeAttribute("aria-current");
    const selected = toc.querySelector(`.ui-find-toc-entry[data-index="${current}"]`);
    if (!selected) return;
    selected.setAttribute("aria-current", "true");
    const box = toc.getBoundingClientRect(), rect = selected.getBoundingClientRect();
    if (rect.top < box.top) toc.scrollTop -= box.top - rect.top + 4;
    else if (rect.bottom > box.bottom) toc.scrollTop += rect.bottom - box.bottom + 4;
  }
  /**
   * Reflect the saved options. A screen that filters its own rows always shows only matches, so
   * that option is shown on and cannot be changed there.
   */
  function syncOptions() {
    if (!optionRow) return;
    optionRow.hidden = !supported;
    for (const [name, control] of Object.entries(optionButtons)) {
      const fixed = name === "only" && adapterFilters();
      const holder = control.closest(".ui-find-switch") || control;
      if (control.matches("input")) control.checked = fixed || options[name];
      else control.setAttribute("aria-pressed", String(fixed || options[name]));
      control.disabled = fixed;
      holder.title = fixed ? "This screen already shows only matching items" : holder.dataset.title;
    }
  }
  function toggleOption(name, value = !options[name]) {
    options[name] = value; saveOptions(); syncOptions();
    if (name === "semantic") { resetSemantic(); setRelated([]); }
    tocSignature = "";
    if (opened && query) refresh(); else { applyHiding(); renderToc(); note(); }
  }
  /**
   * Open or focus the scoped Find bar and capture its focus-return owner. Without CSS Highlights,
   * preserve native browser Find except for a registered semantic-search scope that can still
   * filter results.
   */
  function open(event) {
    if (navigationSurface()) window.SMTOProductNavigation?.close({restoreFocus: false});
    if (!supported && foreground() !== searchAdapter?.root) {
      const button = event?.currentTarget || document.activeElement;
      if (button?.matches("[data-ui-find-trigger]")) {
        button.textContent = "Use ⌘F / Ctrl+F"; button.setAttribute("aria-label", "Use browser Find: Command F or Control F");
      }
      return;
    }
    if (opened) syncSurface();
    if (!opened) {
      opener = visible(event?.currentTarget) ? event.currentTarget : document.activeElement;
      opened = true; scope = foreground();
      mountBar(); bar.hidden = false; scopeLabel.textContent = title(scope); syncSearch(); syncOptions(); updateCount();
      document.dispatchEvent(new Event("ui-find-state")); refresh();
    }
    field.focus({preventScroll: true}); field.select();
  }
  /**
   * Invalidate pending query work, clear text/highlights, restore temporary disclosures and reset
   * the search adapter. Hide the bar and optionally return focus; independent filter highlighting
   * is refreshed afterwards.
   */
  function close({restoreFocus = true} = {}) {
    scanFeedback?.dispose(); scanFeedback = null;
    ++version; clearTimeout(timer); timer = null; wantJump = false; opened = false; query = "";
    if (field) field.value = "";
    restoreReveals(); resetSemantic(); navigated = semanticJumped = false; clearFind();
    syncSearch();
    if (bar) { bar.hidden = true; document.body.append(bar); }
    if (restoreFocus && visible(opener)) opener.focus({preventScroll: true});
    document.dispatchEvent(new Event("ui-find-state")); refresh();
  }
  /**
   * Create the single accessible 256-character Find field and navigation controls, respecting IME
   * composition before scanning. Add the page trigger and discover existing filters; page-level
   * event handlers own subsequent scope changes.
   */
  function init() {
    bar = document.createElement("section"); bar.className = "ui-find-bar"; bar.hidden = true; bar.dataset.uiFindIgnore = "";
    bar.setAttribute("role", "search"); bar.setAttribute("aria-label", "Find on this screen");
    bar.innerHTML = '<span class="ui-find-scope"></span><input type="search" aria-label="Find text on this screen" placeholder="Find on this screen…" maxlength="256" autocomplete="off" spellcheck="false"><span class="ui-find-count" role="status" aria-live="polite" aria-atomic="true"></span><button type="button" data-find="previous" aria-label="Previous match" title="Previous match (Shift+Enter)">↑</button><button type="button" data-find="next" aria-label="Next match" title="Next match (Enter)">↓</button><button type="button" data-find="close" aria-label="Close Find" title="Close Find (Escape)">×</button>';
    field = bar.querySelector("input"); counter = bar.querySelector(".ui-find-count"); scopeLabel = bar.querySelector(".ui-find-scope");
    previous = bar.querySelector('[data-find="previous"]'); next = bar.querySelector('[data-find="next"]');
    previous.onclick = () => { navigated = true; select(current - 1, true); };
    next.onclick = () => { navigated = true; select(current + 1, true); };
    bar.querySelector('[data-find="close"]').onclick = () => close();
    optionRow = document.createElement("div"); optionRow.className = "ui-find-options";
    optionRow.setAttribute("role", "group"); optionRow.setAttribute("aria-label", "Find options");
    for (const [name, label, description, kind, icon] of optionSpecs) {
      const glyph = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icon}</svg>`;
      const text = document.createElement("span"); text.textContent = label;
      if (kind === "switch") {
        // The shared switch control, then the icon and label, all one click target. The row has
        // its own layout: page row rules (Settings' switch grid) must not restyle the Find bar.
        const row = document.createElement("label");
        row.className = "ui-find-switch"; row.dataset.findOption = name; row.dataset.title = description;
        const input = document.createElement("input"); input.type = "checkbox";
        input.className = "mission-switch"; input.setAttribute("role", "switch");
        input.addEventListener("change", () => toggleOption(name, input.checked));
        row.append(input); row.insertAdjacentHTML("beforeend", glyph); row.append(text);
        optionButtons[name] = input; optionRow.append(row);
        continue;
      }
      const button = document.createElement("button"); button.type = "button";
      button.className = "ui-find-option"; button.dataset.findOption = name; button.dataset.title = description;
      button.innerHTML = glyph; button.append(text);
      button.addEventListener("click", () => toggleOption(name));
      optionButtons[name] = button; optionRow.append(button);
    }
    if (!document.querySelector('link[rel="stylesheet"][href*="mission_switch.css"]')) {
      const sheet = document.createElement("link"); sheet.rel = "stylesheet";
      sheet.href = new URL("mission_switch.css?v=20261121-find", assetBase).href;
      document.head.append(sheet);
    }
    noteLine = document.createElement("p"); noteLine.className = "ui-find-note"; noteLine.hidden = true;
    noteLine.setAttribute("role", "status"); noteLine.setAttribute("aria-live", "polite");
    toc = document.createElement("nav"); toc.className = "ui-find-toc"; toc.hidden = true;
    toc.setAttribute("aria-label", "Matches on this screen");
    bar.append(optionRow, noteLine, toc);
    syncOptions();
    field.addEventListener("input", event => {
      if (event.isComposing) return;
      restoreReveals(); resetSemantic(); navigated = semanticJumped = false; query = field.value.trim(); clearFind();
      syncSearch();
      counter.textContent = query ? "Searching…" : "Type to find";
      previous.disabled = next.disabled = true; refresh(true);
    });
    field.addEventListener("compositionend", () => field.dispatchEvent(new Event("input", {bubbles: true})));
    document.body.append(bar);
    if (!document.querySelector('[data-product-surface]'))
      trigger(document.querySelector('#settings-secondary-actions')
        || document.querySelector('.header-actions, .mission-settings-actions, .directory-actions, .product-topbar > nav'));
    discoverFilters();
  }
  /**
   * Page-lifetime capture handlers keep Find inside dialog focus boundaries, suppress only
   * programmatic disclosure toggles, and let manual disclosure clicks replace temporary reveal
   * ownership. pagehide clears query/reveal state without trying to restore focus.
   */
  // Window capture precedes dialog-specific handlers, including capture listeners.
  window.addEventListener("keydown", event => {
    if (event.isComposing || !bar) return;
    if ((supported || foreground() === searchAdapter?.root) && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault(); event.stopImmediatePropagation(); open();
    } else if (opened && !navigationSurface() && event.key === "Escape") {
      event.preventDefault(); event.stopImmediatePropagation(); close();
    } else if (opened && event.target === field && event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); event.stopImmediatePropagation(); navigated = true; select(current + (event.shiftKey ? -1 : 1), true);
    }
  }, true);
  // A Find reveal is presentation-only: do not run disclosure lazy-load handlers.
  window.addEventListener("toggle", event => {
    if (pendingToggles.has(event.target)) {
      pendingToggles.delete(event.target); event.stopImmediatePropagation(); syncDisclosure(event.target); return;
    }
    surfaceChanged();
  }, true);
  document.addEventListener("click", event => {
    const control = event.target.closest("summary, [aria-controls]");
    const details = control?.matches("summary") ? control.parentElement : document.getElementById(control?.getAttribute("aria-controls"));
    if (details?.matches("details[data-ui-find-reveal]")) {
      reveals.delete(details); pendingToggles.delete(details); details.removeAttribute("data-ui-find-reveal");
    }
    surfaceChanged();
  }, true);
  document.addEventListener("input", event => {
    if (event.target === field) return;
    discoverFilters(); if (filters.has(event.target)) refresh();
  });
  document.addEventListener("focusin", surfaceChanged);
  window.addEventListener("resize", surfaceChanged);
  window.addEventListener("pagehide", () => close({restoreFocus: false}));
  window.SMTOUiFind = {open, close, refresh, registerFilter,
    /**
     * Install the page’s single semantic-search adapter and synchronize an already mounted bar.
     * The adapter owns result filtering and count; this controller owns query lifetime and DOM
     * highlighting.
     */
    registerSearch(adapter) { searchAdapter = adapter; if (bar) syncSearch(); },
    /**
     * Register an owner-specific collapsed-content reveal hook and return its unregister function.
     * Each reveal must supply its own restoration callback when temporary state changes.
     */
    registerReveal(adapter) { adapters.add(adapter); return () => adapters.delete(adapter); },
    isOpen: () => opened,
    plainText,
    isRevealed: node => Boolean(node?.closest('[data-ui-find-reveal]')),
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once: true}); else init();
})();
