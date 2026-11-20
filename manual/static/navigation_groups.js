/**
 * Share navigation disclosures and optional responsive Sections dialogs across shells.
 * Each root has one controller. Only explicit summary activation changes validated
 * tab-session collapse preferences; search and deep-link reveal adjust presentation
 * temporarily. Narrow menus move the existing panel into a native modal and restore
 * its home/focus on close or resize. Callers own filtering, destination navigation
 * and closing after selection. The controller performs no server write or task action.
 */
(() => {
  "use strict";
  const controllers = new WeakMap();
  const preference = "navigation_collapsed_groups";

  /**
   * Create an initially open native details/summary group with a literal heading and child-items
   * container. The caller supplies a stable group ID and heading level.
   */
  function createGroup({id, title, level = 2}) {
    const element = document.createElement("details");
    element.className = "navigation-group";
    element.dataset.navigationGroup = id;
    element.open = true;
    const summary = document.createElement("summary");
    const heading = document.createElement(`h${level}`);
    heading.textContent = title;
    summary.append(heading);
    const items = document.createElement("div");
    items.className = "navigation-group-items";
    element.append(summary, items);
    return {element, summary, items};
  }

  /**
   * Reuse the root’s existing controller or install delegated disclosure handling and an optional
   * responsive modal. Save only explicit user choices through SMTOUiSession; listeners/dialogs
   * live with the page and callers own destination actions.
   */
  function mount(root, {surface, menu} = {}) {
    if (controllers.has(root)) return controllers.get(root);
    root.dataset.navigationSurface = surface;
    let searchMatches = null;
    /**
     * Read currently mounted disclosure elements so rebuilding a page’s rows does not leave the
     * controller tied to old nodes.
     */
    const groups = () => [...root.querySelectorAll("details[data-navigation-group]")];
    /**
     * Namespace the group ID by surface so Settings, Inference, Manual and Directory choices
     * remain independent within tab-session storage.
     */
    const key = group => `${surface}:${group.dataset.navigationGroup}`;
    /**
     * Read a fresh Set of validated saved group keys. The shared session owner supplies fallback
     * behavior when storage is unavailable.
     */
    const collapsed = () => new Set(window.SMTOUiSession.get(preference, []));
    /**
     * Apply saved collapse choices to current groups, temporarily opening search matches without
     * writing those openings back to session state.
     */
    function refresh() {
      const saved = collapsed();
      for (const group of groups()) {
        group.open = !saved.has(key(group)) || Boolean(searchMatches?.has(group.dataset.navigationGroup));
      }
    }
    /**
     * Before native summary activation toggles details, save the user’s intended next collapsed
     * state. Programmatic open/reveal/search changes do not pass through this click handler.
     */
    root.addEventListener("click", event => {
      const summary = event.target.closest("summary");
      const group = summary?.parentElement;
      if (event.defaultPrevented || !group?.matches("details[data-navigation-group]") || !root.contains(group)) return;
      const saved = collapsed();
      // Native summary activation (including Enter/Space) toggles after this event.
      if (group.open) saved.add(key(group));
      else saved.delete(key(group));
      window.SMTOUiSession.set(preference, [...saved]);
    });

    /**
     * Unhide a contained target and open its nearest navigation group for a deep link or active
     * destination. Preserve the saved explicit collapse preference.
     */
    function reveal(target) {
      if (!target || !root.contains(target)) return;
      const group = target.closest("details[data-navigation-group]");
      if (group) { group.hidden = false; group.open = true; }
      target.hidden = false;
    }

    /**
     * Expose no-op menu actions when a surface uses inline groups only. The optional menu branch
     * below replaces these callbacks with modal ownership.
     */
    let closeMenu = () => {}, openMenu = () => {};
    if (menu && document.querySelector("[data-product-surface]")) {
      menu.trigger.hidden = true;
      closeMenu = options => window.SMTOProductNavigation?.close(options);
      openMenu = () => window.SMTOProductNavigation?.open({view: "context"});
    } else if (menu) {
      const {trigger, panel = root, breakpoint = 980} = menu;
      const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
      const placeholder = document.createComment("navigation panel home");
      panel.before(placeholder);
      panel.classList.add("navigation-menu-panel");
      trigger.classList.add("navigation-menu-trigger");
      trigger.setAttribute("aria-haspopup", "dialog");
      const dialog = document.createElement("dialog");
      dialog.className = "navigation-menu";
      dialog.id = `${surface}-sections-menu`;
      trigger.setAttribute("aria-controls", dialog.id);
      const header = document.createElement("header");
      header.className = "navigation-menu-header";
      const title = document.createElement("h2");
      title.id = `${dialog.id}-title`;
      title.textContent = "Sections";
      dialog.setAttribute("aria-labelledby", title.id);
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Close";
      close.setAttribute("aria-label", "Close sections");
      header.append(title, close);
      const body = document.createElement("div");
      body.className = "navigation-menu-body";
      dialog.append(header, body);
      document.body.append(dialog);
      /**
       * Close an open dialog, move the same panel back beside its placeholder and restore narrow-
       * screen trigger focus when requested. This does not change group preferences or
       * destination selection.
       */
      closeMenu = ({restoreFocus = true} = {}) => {
        if (!dialog.open) return;
        dialog.close();
        placeholder.after(panel);
        panel.hidden = media.matches;
        trigger.setAttribute("aria-expanded", "false");
        document.body.classList.remove("navigation-menu-open");
        if (restoreFocus && media.matches) trigger.focus({preventScroll: true});
      };
      /**
       * On a narrow viewport, move the existing panel into a native modal and focus the visible
       * current item, its collapsed summary or a fallback. Opening the menu preserves explicit
       * collapsed groups.
       */
      openMenu = () => {
        if (!media.matches || dialog.open) return;
        body.append(panel);
        panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        document.body.classList.add("navigation-menu-open");
        dialog.showModal();
        const current = root.querySelector('[aria-current]:not([aria-current="false"]), .is-active');
        // A collapsed active group remains the user's choice when merely opening the menu.
        const candidate = current?.closest("details:not([open])")?.querySelector("summary") || current;
        const focus = candidate?.checkVisibility() ? candidate
          : [...root.querySelectorAll("summary")].find(summary => summary.checkVisibility()) || close;
        focus.focus({preventScroll: true});
        focus.scrollIntoView({block: "nearest"});
      };
      trigger.addEventListener("click", openMenu);
      close.addEventListener("click", () => closeMenu());
      dialog.addEventListener("cancel", event => { event.preventDefault(); closeMenu(); });
      dialog.addEventListener("click", event => {
        if (event.target !== dialog) return;
        const box = dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeMenu();
      });
      /**
       * Reconcile breakpoint changes by moving/closing the modal and restoring visible focus.
       * Desktop exposes the existing panel; narrow mode exposes the trigger and hides the panel
       * unless the dialog is open.
       */
      function layout() {
        const focused = document.activeElement;
        const inPanel = panel.contains(focused);
        const inDialog = dialog.contains(focused);
        if (!media.matches) {
          closeMenu({restoreFocus: false});
          trigger.hidden = true;
          panel.hidden = false;
          if (inPanel) focused.focus({preventScroll: true});
          else if (inDialog || focused === trigger) root.querySelector("summary, a, button")?.focus({preventScroll: true});
        } else {
          trigger.hidden = false;
          if (inPanel && !dialog.open) trigger.focus({preventScroll: true});
          panel.hidden = !dialog.open;
        }
        trigger.setAttribute("aria-expanded", String(dialog.open));
      }
      media.addEventListener("change", layout);
      layout();
    }

    const controller = Object.freeze({
      refresh, reveal, openMenu, closeMenu,
      /**
       * Store transient matching group IDs and refresh visibility without changing session
       * preferences. Null ends search expansion; an empty Set means an active search with no
       * matching groups.
       */
      setSearchMatches(ids) {
        if (ids === null && searchMatches === null) return;
        searchMatches = ids === null ? null : new Set(ids);
        refresh();
      },
    });
    controllers.set(root, controller);
    refresh();
    return controller;
  }
  window.SMTONavigationGroups = Object.freeze({createGroup, mount});
})();
