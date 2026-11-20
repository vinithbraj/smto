/* Shared typography/contrast presentation and serialized preference edits. No desktop dependencies. */
(() => {
  "use strict";
  const FONT = "ui_font_scale_percent", FAMILY = "ui_font_family", CONTRAST = "ui_high_contrast";
  const SCALING = "ui_font_scaling";
  const systemFont = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const fontOptions = [
    {value: "system", label: "System default", stack: systemFont},
    {value: "macos", label: "macOS (San Francisco)", stack: `-apple-system, BlinkMacSystemFont, "Helvetica Neue", ${systemFont}`},
    {value: "segoe-ui", label: "Windows (Segoe UI)", stack: `"Segoe UI", ${systemFont}`},
    {value: "ubuntu", label: "Ubuntu", stack: `Ubuntu, ${systemFont}`},
    {value: "cantarell", label: "Cantarell", stack: `Cantarell, ${systemFont}`},
    {value: "noto-sans", label: "Noto Sans", stack: `"Noto Sans", ${systemFont}`},
    {value: "dejavu-sans", label: "DejaVu Sans", stack: `"DejaVu Sans", ${systemFont}`},
    {value: "roboto", label: "Roboto", stack: `Roboto, ${systemFont}`},
    {value: "arial", label: "Arial", stack: `Arial, "Liberation Sans", ${systemFont}`},
    {value: "helvetica", label: "Helvetica", stack: `"Helvetica Neue", Helvetica, Arial, ${systemFont}`},
    {value: "verdana", label: "Verdana", stack: `Verdana, ${systemFont}`},
    {value: "georgia", label: "Georgia", stack: 'Georgia, "Times New Roman", "Liberation Serif", serif'},
  ];
  const fontStacks = new Map(fontOptions.map(option => [option.value, option.stack]));
  let localFonts = [];
  let fontDetection;
  /** Validate the same bounded family names accepted by the preference API. */
  const familyName = value => typeof value === "string" && [...value].length <= 200
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value) ? value.trim() : "";
  /** Retain preset IDs and installed family names, defaulting invalid stored values. */
  const normalizeFamily = value => familyName(value) || "system";
  /** Quote an installed name as one CSS family; preserve legacy presets and their fallbacks. */
  const fontStack = value => fontStacks.get(value)
    || `"${value.replace(/["\\]/g, "\\$&")}", ${systemFont}`;
  /** Validate, deduplicate and sort client results without sending the inventory to the server. */
  function uniqueFamilies(names) {
    const families = new Map();
    for (const name of names) {
      const family = familyName(name);
      if (family && !families.has(family.toLowerCase())) families.set(family.toLowerCase(), family);
    }
    return [...families.values()].sort((a, b) => a.localeCompare(b));
  }
  /** Detect usable client families when the browser cannot enumerate its installed fonts.
   * The static catalogue supplies candidates, not an inventory of the server's fonts.
   * Compare each candidate against several fallback metrics: fonts.check alone also
   * succeeds for missing system fonts. Browser-hidden and unknown families stay absent.
   */
  function detectBrowserFonts() {
    if (!fontDetection) fontDetection = (async () => {
      const response = await (window.SMTOAuth?.fetch || window.fetch)(new URL("font_families.json?v=20261010-browser-fonts", assetBase));
      if (!response.ok) throw new Error("Font catalogue unavailable");
      const candidates = uniqueFamilies(await response.json());
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Font detection unavailable");
      const samples = ["mmmmmmmmmmWWWiii0123456789", "漢字かな한글 العربية हिन्दी Ελληνικά Ж"];
      const fallbacks = ["monospace", "sans-serif", "serif"];
      const widths = font => {
        context.font = `48px ${font}`;
        return samples.map(sample => context.measureText(sample).width);
      };
      const baseline = fallbacks.map(widths), found = [];
      for (let i = 0; i < candidates.length; i++) {
        const family = candidates[i], quoted = `"${family.replace(/["\\]/g, "\\$&")}"`;
        if (fallbacks.some((fallback, index) => widths(`${quoted}, ${fallback}`)
          .some((width, sample) => Math.abs(width - baseline[index][sample]) > .01))) found.push(family);
        if (i % 20 === 19) await new Promise(resolve => setTimeout(resolve, 0));
      }
      return found;
    })().catch(error => { fontDetection = null; throw error; });
    return fontDetection;
  }
  const assetBase = new URL(document.currentScript?.dataset.smtoAssetBase || ".", document.currentScript?.src || new URL("/agent-ui/static/appearance.js", location.href).href).href;
  const root = document.documentElement;
  let localStorageKey = null;
  let saved = {[FONT]: 100, [FAMILY]: "system", [CONTRAST]: false, [SCALING]: false}, pending = {}, versions = {};
  let serial = 0, saving = false, timer, error = false, restoreFrame, saveFeedback;
  const listeners = new Set();
  const normalize = settings => ({
    [FONT]: Number.isFinite(settings?.[FONT]) && settings[FONT] >= 80
      && settings[FONT] <= 200 && (localStorageKey || settings[FONT] % 10 === 0) ? settings[FONT] : 100,
    [FAMILY]: normalizeFamily(settings?.[FAMILY]),
    [CONTRAST]: settings?.[CONTRAST] === true,
    [SCALING]: settings?.[SCALING] === true,
  });
  /** The scale actually applied: native size unless text scaling is turned on. */
  const effectiveScale = value => value[SCALING] ? value[FONT] : 100;
  const current = () => ({...saved, ...pending});
  function notify() { for (const listener of listeners) listener(); }

  function render() {
    const value = current(), previous = root.dataset.fontScale, scale = effectiveScale(value);
    const changed = previous !== String(scale) || root.dataset.fontFamily !== value[FAMILY];
    const viewport = changed ? document.querySelector("#conversation-viewport, #thread") : null;
    const content = viewport?.querySelector("#conversation, #messages");
    const atBottom = viewport && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 16;
    // Use the same visible turn as the history scroll owner, including nested/virtual pages.
    const turns = content?.querySelectorAll(".turn");
    const candidates = turns?.length ? Array.from(turns) : Array.from(content?.children || []);
    const view = viewport?.getBoundingClientRect();
    const anchor = candidates.find(el => {
      const box = el.getBoundingClientRect(); return box.top >= view.top && box.top < view.bottom;
    }) || candidates.find(el => el.getBoundingClientRect().bottom > view.top);
    const offset = anchor && anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    root.dataset.fontScale = String(scale);
    root.dataset.fontScaling = String(value[SCALING]);
    root.dataset.fontFamily = value[FAMILY];
    root.dataset.fontEnlarged = String(scale > 100);
    root.dataset.contrast = value[CONTRAST] ? "high" : "normal";
    root.style.setProperty("--ui-font-scale", String(scale / 100));
    root.style.setProperty("--ui-font", root.dataset.mobileAppearance ? systemFont : fontStack(value[FAMILY]));
    if (changed) {
      // Font family also changes wrapping, composer height and navigator measurements.
      window.dispatchEvent(new CustomEvent("smto:font-scale", {detail: scale}));
      cancelAnimationFrame(restoreFrame);
      restoreFrame = requestAnimationFrame(() => {
        if (!viewport?.isConnected) return;
        if (atBottom) viewport.scrollTop = viewport.scrollHeight;
        else if (anchor?.isConnected) viewport.scrollTop +=
          anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top - offset;
      });
    }
    notify();
  }
  function apply(settings) {
    saved = normalize(settings);
    render();
  }

  async function save() {
    if (saving) return;
    const busyFeedback = saveFeedback?.current ? saveFeedback : (saveFeedback = window.SMTOBusy?.action("Saving appearance…"));
    try {
    clearTimeout(timer);
    if (saving || !Object.keys(pending).length) return;
    const batch = {...pending}, sentVersions = {...versions};
    saving = true; error = false; notify();
    try {
      let payload;
      if (localStorageKey) {
        const settings = normalize({...saved, ...batch});
        localStorage.setItem(localStorageKey, JSON.stringify(settings));
        payload = {settings};
      } else {
        const response = await (window.SMTOAuth?.fetch || window.fetch)("/api/agent/settings/preferences", {
          method: "PUT", cache: "no-store", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({settings: batch}),
        });
        payload = await response.json();
        if (!response.ok) throw window.SMTOErrors.fromPayload(payload, response.status);
      }
      saved = normalize(payload.settings);
      for (const key of Object.keys(batch)) {
        if (versions[key] === sentVersions[key]) delete pending[key];
      }
      window.dispatchEvent(new CustomEvent("smto:appearance-saved", {detail: payload.settings}));
    } catch (failure) {
      error = failure; // Retain the preview and latest edits until an explicit retry or another edit.
    } finally {
      saving = false; render();
      if (!error && Object.keys(pending).length) await save();
    }

    } finally { busyFeedback?.finish(); if (saveFeedback === busyFeedback) saveFeedback = null; }
  }
  function set(key, value) {
    if (![FONT, FAMILY, CONTRAST, SCALING].includes(key)) return;
    pending[key] = normalize({...current(), [key]: value})[key];
    versions[key] = ++serial;
    error = false; render();
    if (!saveFeedback?.current) saveFeedback = window.SMTOBusy?.action("Saving appearance…");
    clearTimeout(timer);
    if (localStorageKey) void save(); else timer = setTimeout(save, 350);
  }
  function element(tag, text, className = "") {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    el.className = className;
    return el;
  }
  function button(text, label, action) {
    const el = element("button", text);
    el.type = "button";
    if (label) el.setAttribute("aria-label", label);
    el.addEventListener("click", action);
    return el;
  }
  function createStepper({value = 100, onChange} = {}) {
    const group = element("div", "", "appearance-stepper");
    group.setAttribute("role", "group"); group.setAttribute("aria-label", "Font size");
    let percent = value;
    const output = element("output");
    output.setAttribute("aria-live", "polite"); output.setAttribute("aria-atomic", "true");
    const decrease = button("A−", "Decrease font size", () => onChange(percent - 10));
    const increase = button("A+", "Increase font size", () => onChange(percent + 10));
    const reset = button("Reset to 100%", null, () => onChange(100));
    function update(next) {
      percent = normalize({[FONT]: next})[FONT];
      if (output.value !== `${percent}%`) output.value = `${percent}%`;
      decrease.disabled = percent <= 80; increase.disabled = percent >= 200;
      reset.disabled = percent === 100;
    }
    group.append(decrease, output, increase, reset);
    group.update = update;
    update(value);
    return group;
  }
  /** Build the shared font control; enumeration stays local and only a selection calls onChange. */
  function createFontPicker({value = "system", onChange} = {}) {
    const picker = element("div", "", "appearance-font-picker");
    const fontSelect = element("select");
    fontSelect.name = FAMILY; fontSelect.setAttribute("aria-label", "Font");
    let selected, listedFonts, enumerated = false, detectionFinished = false, loadMessage = "";
    /** Retain saved families even when this browser cannot enumerate or render them. */
    function update(next) {
      next = normalizeFamily(next);
      if (selected !== next || listedFonts !== localFonts) {
        const options = new Map(fontOptions.map(option => [option.value, option.label]));
        const presets = new Set(fontOptions.flatMap(option => [option.label.toLowerCase(), option.value]));
        for (const family of localFonts) {
          if (!presets.has(family.toLowerCase())) options.set(family, family);
        }
        if (!options.has(next)) options.set(next, next);
        fontSelect.replaceChildren();
        for (const [name, label] of options) {
          const option = element("option", label);
          option.value = name; option.style.fontFamily = fontStack(name);
          fontSelect.append(option);
        }
        selected = next; listedFonts = localFonts;
      }
      fontSelect.value = selected;
    }
    fontSelect.addEventListener("change", () => { update(fontSelect.value); onChange(selected); });
    const status = element("p", "", "appearance-help");
    status.setAttribute("role", "status");
    /** Keep fallback discovery and permission requests from overwriting each other's status. */
    function showFontStatus() {
      status.textContent = load.disabled ? "Loading system fonts…" : enumerated
        ? `${localFonts.length} system font families loaded.`
        : `${detectionFinished ? `${localFonts.length} font${localFonts.length === 1 ? "" : "s"} detected on this device.`
          : "Finding fonts available on this device…"} ${loadMessage ||
          "Your browser may hide additional installed fonts."}`;
    }
    /** Enumerate from a click or an existing grant; never prompt during automatic detection. */
    async function loadSystemFonts() {
    const busyFeedback = window.SMTOBusy?.action("Loading system fonts…");
    try {
      if (load.disabled) return;
      load.disabled = true; status.textContent = "Loading fonts…";
      try {
        // Call directly from the click: browsers require user activation and local-fonts permission.
        const fonts = await window.queryLocalFonts();
        const families = uniqueFamilies(fonts.map(font => font.family));
        if (families.length) {
          localFonts = families; enumerated = true; loadMessage = "";
          update(selected);
        } else {
          loadMessage = "No fonts were shared. You can still choose a detected font.";
        }
      } catch (_) {
        loadMessage = "Could not load system fonts. You can still choose a detected font.";
      } finally { load.disabled = false; showFontStatus(); }

    } finally { busyFeedback?.finish(); }
  }
    const load = button("Load system fonts", null, loadSystemFonts);
    load.hidden = typeof window.queryLocalFonts !== "function";
    showFontStatus();
    void detectBrowserFonts().then(families => {
      if (!enumerated) localFonts = uniqueFamilies([...localFonts, ...families]);
      detectionFinished = true; update(selected); showFontStatus();
    }).catch(() => {
      detectionFinished = true;
      loadMessage = "Automatic detection is unavailable. Choose a preset or use another font name.";
      showFontStatus();
    });
    if (!load.hidden && navigator.permissions?.query) {
      void navigator.permissions.query({name: "local-fonts"}).then(permission => {
        if (permission.state === "granted" && !enumerated) void loadSystemFonts();
      }).catch(() => {});
    }
    const custom = element("div", "", "appearance-custom-font");
    const input = document.createElement("input");
    input.type = "text"; input.maxLength = 200; input.placeholder = "Font family name";
    input.setAttribute("aria-label", "Font family name");
    input.autocomplete = "off"; input.spellcheck = false;
    /** Apply a validated family from manual entry without requiring enumeration permission. */
    function useFont() {
      const family = familyName(input.value);
      if (!family) {
        input.setCustomValidity("Enter a font family name (up to 200 characters, without control characters).");
        input.reportValidity(); return;
      }
      input.setCustomValidity(""); update(family); onChange(selected);
    }
    input.addEventListener("input", () => input.setCustomValidity(""));
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); useFont(); }
    });
    custom.append(input, button("Use font", null, useFont));
    const more = element("details", "", "appearance-font-manual");
    more.append(element("summary", "Use another font"), custom);
    picker.append(fontSelect, load, status, more);
    picker.select = fontSelect; picker.update = fontSelect.update = update;
    update(value);
    return picker;
  }
  function createEditor({showFontPicker = true} = {}) {
    const editor = element("div", "", "appearance-editor");
    const themes = element("a", "Edit themes, colors and conversation background");
    themes.href = "/theme"; themes.className = "appearance-themes-link";
    if (!localStorageKey) editor.append(themes);
    const fontPicker = showFontPicker ? createFontPicker({value: current()[FAMILY], onChange: value => set(FAMILY, value)}) : null;
    // Text scaling is off by default; the Font size stepper applies only while it is on.
    const scalingRow = element("label", "", "appearance-contrast appearance-scaling");
    const scaling = document.createElement("input");
    scaling.type = "checkbox"; scaling.setAttribute("role", "switch");
    scaling.addEventListener("change", () => set(SCALING, scaling.checked));
    scalingRow.append(scaling, document.createTextNode("Scale text"));
    const scalingHelp = element("p", "Off uses each font's native size, which is sharpest on high-resolution displays.", "appearance-help");
    const title = element("p", "Font size", "appearance-label");
    const stepper = createStepper({value: current()[FONT], onChange: value => set(FONT, value)});
    const label = element("label", "", "appearance-contrast");
    const toggle = document.createElement("input");
    toggle.type = "checkbox"; toggle.setAttribute("role", "switch");
    toggle.addEventListener("change", () => set(CONTRAST, toggle.checked));
    label.append(toggle, document.createTextNode("High contrast"));
    const status = element("p", "", "appearance-status");
    status.setAttribute("role", "status");
    const retry = button("Retry", "Retry saving appearance", save);
    if (fontPicker) editor.append(element("p", "Font", "appearance-label"), fontPicker,
      element("p", "Fonts must be installed on your device. Unavailable fonts use a fallback.", "appearance-help"));
    editor.append(scalingRow, scalingHelp, title, stepper, label,
      element("p", localStorageKey ? "Changes save automatically in this browser for this service." : showFontPicker ? "Font, font size and high contrast are shared across your devices." : "Mobile uses your device’s system font. Text size and high contrast are shared across your devices.", "appearance-help"), status, retry);
    function update() {
      fontPicker?.update(current()[FAMILY]);
      stepper.update(current()[FONT]); toggle.checked = current()[CONTRAST];
      scaling.checked = current()[SCALING];
      stepper.dataset.disabled = String(!current()[SCALING]);
      for (const control of stepper.querySelectorAll("button")) if (!current()[SCALING]) control.disabled = true;
      title.classList.toggle("appearance-label-disabled", !current()[SCALING]);
      status.textContent = error ? "Could not save appearance. Your changes are still shown here."
        : saving || Object.keys(pending).length ? "Saving appearance…" : localStorageKey ? "Saved in this browser." : "";
      if (error && window.SMTOErrors) window.SMTOErrors.mount(status, error.error_detail || error, {profile: "compact"});
      retry.hidden = !error;
    }
    listeners.add(update); update();
    editor.dispose = () => listeners.delete(update);
    return editor;
  }
  function openDialog(returnFocus) {
    const dialog = element("dialog", "", "appearance-dialog");
    dialog.setAttribute("aria-label", "Appearance");
    const header = element("div", "", "appearance-dialog-header");
    header.append(element("h2", "Appearance"), button("×", "Close Appearance", () => dialog.close()));
    const editor = createEditor(); dialog.append(header, editor);
    dialog.addEventListener("close", () => {
      editor.dispose(); dialog.remove(); returnFocus?.focus({preventScroll: true});
    }, {once: true});
    document.body.append(dialog); dialog.showModal();
  }
  // The header choice is shared with other application tabs, including mobile.
  function applyMobileTheme() {
    let choice;
    if (window.SMTOThemePreference) choice = window.SMTOThemePreference.get();
    else try { choice = JSON.parse(localStorage.getItem("smto.agentUi.mobile.appearance")); } catch (_) {}
    if (["light", "dark"].includes(choice)) root.dataset.theme = choice;
    else delete root.dataset.theme;
  }
  // Standalone services have no Agent preference endpoint. Keep their owner explicit.
  function useBrowserStorage(key = "smto.ui.standalone-appearance.v1", defaults = {}) {
    localStorageKey = key;
    const read = () => { try { return JSON.parse(localStorage.getItem(key)) || defaults; } catch (_) { return defaults; } };
    apply(read());
    window.addEventListener("storage", event => { if (event.key === key) apply(read()); });
  }
  window.SMTOAppearance = Object.freeze({apply, current, set, useBrowserStorage, normalizeFamily, createFontPicker,
    createStepper, createEditor, openDialog, applyMobileTheme});

  /** Adapt newly mounted controls without replacing inputs, handlers or native
   * values. Selection/acknowledgement controls retain their checkbox semantics;
   * boolean settings expose switch semantics. CSS tracks checked state directly. */
  function decorateControls(scope = document) {
    // Reuse this observer for native disclosures; never replace their controls,
    // state or content. External buttons opt in at their source owner instead.
    const summaries = [...(scope.matches?.('summary') ? [scope] : []), ...scope.querySelectorAll('summary')];
    for (const summary of summaries) {
      const details = summary.parentElement;
      if (!details?.matches('details') || details.querySelector(':scope > summary') !== summary) continue;
      const separate = details.matches('[data-disclosure-kind="menu"], [data-disclosure-kind="structural"], .settings-details, .completion-handling, .composer-options-dropdown, .overflow-actions, .instance-more, .activity-section-disclosure, .run-section-with-action, .run-artifacts-with-action, .progress-timeline');
      summary.classList.toggle('ui-disclosure-trigger', !separate && !summary.hidden);
    }
    const selector = 'input[type="checkbox"], button[data-setting-toggle], button[role="switch"], select[data-setting-on-values]';
    const controls = [...(scope.matches?.(selector) ? [scope] : []), ...scope.querySelectorAll(selector)];
    for (const control of controls) {
      if (control.matches('input[type="checkbox"]')) {
        const selection = !!control.dataset.controlKind || control.getAttribute('role') === 'checkbox';
        control.classList.toggle('mission-switch', !selection);
        control.classList.toggle('mission-selection', selection);
        if (control.dataset.controlKind) control.setAttribute('role', 'checkbox');
        else if (!control.hasAttribute('role')) control.setAttribute('role', 'switch');
        const label = control.closest('label');
        if (label && control.parentElement === label && label.querySelectorAll('input, select, textarea').length === 1) {
          label.classList.add('mission-switch-row');
        }
      } else if (control.matches('button')) control.classList.add('setting-state-button');
      else {
        const on = new Set(control.dataset.settingOnValues.split(' '));
        for (const option of control.options) option.toggleAttribute('data-setting-on', on.has(option.value));
        const label = control.closest('label');
        if (label && !label.querySelector('.setting-state-dot')) {
          label.classList.add('setting-choice-label');
          const dot = document.createElement('span'); dot.className = 'setting-state-dot'; dot.setAttribute('aria-hidden', 'true'); label.append(dot);
        }
      }
    }
  }
  function observeControls() {
    decorateControls();
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') decorateControls(record.target);
        else {
          if (record.target.matches?.('select[data-setting-on-values]')) decorateControls(record.target);
          for (const child of record.addedNodes) if (child.nodeType === 1) decorateControls(child);
        }
      }
    }).observe(document.body, {subtree: true, childList: true, attributes: true,
      attributeFilter: ['type', 'data-setting-toggle', 'data-setting-on-values', 'data-control-kind', 'data-disclosure-kind']});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeControls, {once: true});
  else observeControls();
})();
