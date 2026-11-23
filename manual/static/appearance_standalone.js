/* Browser-local appearance for standalone services. No dependency on an Agent API. */
(() => {
  "use strict";
  let defaults = {};
  try {
    const legacy = Number(localStorage.getItem("inference-portal-text-size"));
    if ([14, 16, 18, 20, 22, 24].includes(legacy)) defaults.ui_font_scale_percent = legacy / 16 * 100;
  } catch (_) {}
  window.SMTOAppearance.useBrowserStorage("smto.ui.standalone-appearance.v1", defaults);
  document.addEventListener("DOMContentLoaded", () => {
    for (const button of document.querySelectorAll("[data-standalone-appearance]")) {
      button.addEventListener("click", () => window.SMTOAppearance.openDialog(button));
    }
  });
})();
