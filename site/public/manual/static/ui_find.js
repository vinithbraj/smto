/**
 * Search mounted desktop page/dialog text with CSS Highlights and temporary disclosure reveals.
 * Owners can register semantic filters and collapsed-content adapters; this controller owns query
 * versions, scan scheduling, focus, highlight ranges and restoration. It neither fetches unloaded
 * history nor persists queries, and unsupported general Find retains the browser shortcut.
 */
(() => {
  "use strict";
  if (window.SMTOUiFind) return;
  const supported = Boolean(globalThis.Highlight && globalThis.CSS?.highlights);
  const names = {matches: "smto-find", active: "smto-find-active", filters: "smto-filter"};
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
  /**
   * Yield a long DOM text scan to the browser event loop without scheduling a network read.
   */
  const yieldUi = () => new Promise(resolve => setTimeout(resolve, 0));
  const observer = new MutationObserver(records => {
    if (records.some(record => !record.target.parentElement?.closest('[data-ui-find-ignore]')
        && !record.target.closest?.('[data-ui-find-ignore]'))) queueRefresh();
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
    if (supported) { CSS.highlights.delete(names.matches); CSS.highlights.delete(names.active); }
    matches = []; current = -1;
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
      restoreReveals(); scope = root; mountBar(); scopeLabel.textContent = title(scope);
      syncSearch();
      clearFind(); refresh(true);
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
    counter.textContent = !query ? "Type to find" : matches.length ? `${current + 1} of ${matches.length}`
      : results ? `${results} matching result${results === 1 ? "" : "s"}` : "No matches";
    previous.disabled = next.disabled = !matches.length;
  }
  /**
   * Apply the query only to the adapter owning the current scope; clear its filter when Find
   * closes or enters another scope. Use its placeholder without changing other input owners.
   */
  function syncSearch() {
    if (!searchAdapter) return;
    const active = opened && scope === searchAdapter.root;
    searchAdapter.apply(active ? query : "");
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
    current = matches.length ? (index + matches.length) % matches.length : -1;
    const range = matches[current];
    if (range && scroll) {
      reveal(range.startContainer.parentElement);
      const node = range.startContainer.parentElement;
      node.scrollIntoView({block: "center", inline: "nearest", behavior: "instant"});
      // Center the actual occurrence, including within long preformatted output.
      for (let host = node; host && host !== document.body; host = host.parentElement) {
        const css = getComputedStyle(host), box = host.getBoundingClientRect(), rect = range.getBoundingClientRect();
        if (/(auto|scroll)/.test(css.overflowY) && host.scrollHeight > host.clientHeight)
          host.scrollTop += rect.top + rect.height / 2 - box.top - host.clientHeight / 2;
      }
    }
    paint(names.active, range ? [range] : [], 2); updateCount();
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
      const temporary = collapsed && temporarilyHidden(element);
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
    const active = matches[current], oldIndex = current;
    const found = opened && query ? await scan(scope, query, true, stamp) : [];
    if (stamp !== version) return;
    matches = found.filter(range => range.startContainer.isConnected && scope?.contains(range.startContainer));
    paint(names.matches, matches, 1);
    const same = active ? matches.findIndex(range => range.startContainer === active.startContainer && range.startOffset === active.startOffset) : -1;
    current = same >= 0 ? same : Math.min(Math.max(oldIndex, 0), matches.length - 1);
    if (opened) select(current, jump && !navigationSurface());
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
      if (stamp === version) wantJump = false;
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
    ++version; clearTimeout(timer); wantJump ||= jump; dirty = true; watch();
    timer = setTimeout(runScan, jump ? 100 : 80);
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
      mountBar(); bar.hidden = false; scopeLabel.textContent = title(scope); syncSearch(); updateCount();
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
    restoreReveals(); clearFind();
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
    previous.onclick = () => select(current - 1, true); next.onclick = () => select(current + 1, true);
    bar.querySelector('[data-find="close"]').onclick = () => close();
    field.addEventListener("input", event => {
      if (event.isComposing) return;
      restoreReveals(); query = field.value.trim(); clearFind();
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
    } else if (opened && bar.contains(event.target) && event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); event.stopImmediatePropagation(); select(current + (event.shiftKey ? -1 : 1), true);
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
    isRevealed: node => Boolean(node?.closest('[data-ui-find-reveal]')),
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once: true}); else init();
})();
