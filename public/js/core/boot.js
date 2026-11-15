/**
 * Early boot script (external so the page needs no inline script under CSP).
 * Applies the saved theme before first paint and exposes the per-request CSP
 * nonce to dynamically-created <style> elements.
 */
(function () {
  "use strict";
  window.__lunaspisBootStart =
    window.performance && typeof performance.now === "function" ? performance.now() : Date.now();
  try {
    var theme = localStorage.getItem("lunaspis_ui_theme");
    if (theme === "gloss-silver" || theme === "flight-lime" || theme === "lunar-champagne") {
      document.documentElement.dataset.theme = theme;
    }
  } catch (_) {
    /* storage can be unavailable in private modes */
  }
  try {
    var meta = document.querySelector('meta[name="lunaspis-csp-nonce"]');
    window.__lunaspisCspNonce = meta && meta.content ? meta.content : "";
  } catch (_) {
    window.__lunaspisCspNonce = "";
  }
})();
