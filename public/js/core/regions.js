/**
 * Server-region selection for the split Lunaspis deployments.
 *
 * Each region is a separate Railway service with its own in-memory room
 * registry, so changing region is a full navigation to that origin. Active
 * rooms never migrate between regions. The player's display name follows the
 * player through a cookie scoped to lunaspis.com; everything else reconnects
 * fresh.
 */
(function () {
  "use strict";

  const REGIONS = Object.freeze([
    Object.freeze({ id: "us", label: "US", host: "us.lunaspis.com" }),
    Object.freeze({ id: "asia", label: "ASIA", host: "asia.lunaspis.com" })
  ]);

  const NAME_COOKIE = "lunaspis_name";
  const COOKIE_DOMAIN = ".lunaspis.com";
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

  function readCookie(name) {
    try {
      const prefix = `${name}=`;
      const parts = String(document.cookie || "").split(";");
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith(prefix)) {
          return decodeURIComponent(trimmed.slice(prefix.length)) || null;
        }
      }
    } catch (e) {}
    return null;
  }

  function writeNameCookie(name) {
    const clean = String(name || "").replace(/[\r\n;]/g, "").trim().slice(0, 16);
    if (!clean) return;
    try {
      const host = window.location.hostname.toLowerCase();
      const isLunaspis = host === "lunaspis.com" || host.endsWith(".lunaspis.com");
      if (!isLunaspis) return;
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie =
        `${NAME_COOKIE}=${encodeURIComponent(clean)}; Domain=${COOKIE_DOMAIN}; ` +
        `Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
    } catch (e) {}
  }

  function getStoredName() {
    try {
      return localStorage.getItem("interfellas_name") || "";
    } catch (e) {
      return "";
    }
  }

  // NetworkManager reads localStorage in its constructor, so this migration
  // has to run before network.js loads. It also seeds the cookie from an
  // existing name on the current region.
  function migrateName() {
    try {
      const stored = getStoredName().trim();
      const saved = readCookie(NAME_COOKIE);
      if (stored) {
        writeNameCookie(stored);
      } else if (saved) {
        localStorage.setItem("interfellas_name", saved);
      }
    } catch (e) {}
  }

  function getCurrentRegion() {
    const host = window.location.hostname.toLowerCase();
    return REGIONS.find((region) => host === region.host || host.endsWith(`.${region.host}`)) || null;
  }

  function getOtherRegion() {
    const current = getCurrentRegion();
    return REGIONS.find((region) => !current || region.id !== current.id) || null;
  }

  function buildRegionUrl(region) {
    if (!region || !/^[a-z0-9.-]+$/i.test(region.host)) return null;
    const url = new URL(window.location.href);
    url.protocol = "https:";
    url.host = region.host;
    url.port = "";
    // Recover a typed join code after a wrong-region failure. Keeping it in
    // ?room= lets the target region's normal auto-join flow retry it.
    const joinInput = document.getElementById("input-join-code");
    const typedCode = joinInput && joinInput.value ? joinInput.value.trim().toUpperCase() : "";
    if (/^[A-Z0-9]{4,8}$/.test(typedCode) && !url.searchParams.get("room")) {
      url.searchParams.set("room", typedCode);
    }
    return url;
  }

  function switchToRegion(regionId) {
    const region = REGIONS.find((item) => item.id === regionId);
    if (!region) return;
    const input = document.getElementById("input-player-name");
    const typedName = input && input.value ? input.value.trim() : "";
    writeNameCookie(typedName || getStoredName());
    const url = buildRegionUrl(region);
    if (url) window.location.assign(url.toString());
  }

  function setupUI() {
    const current = getCurrentRegion();
    const other = getOtherRegion();

    const nameInput = document.getElementById("input-player-name");
    if (nameInput) {
      nameInput.addEventListener("change", () => writeNameCookie(nameInput.value));
    }

    const toggle = document.getElementById("btn-region-toggle");
    if (toggle) {
      if (!current || !other) {
        toggle.hidden = true;
      } else {
        const label = toggle.querySelector("[data-region-label]");
        if (label) label.textContent = `SERVER: ${current.label}`;
        toggle.hidden = false;
        toggle.title =
          `You are on the ${current.label} server. Switch to ${other.label} ` +
          `(reloads the page; rooms stay on the region where they were created).`;
        toggle.setAttribute("aria-label", toggle.title);
        toggle.addEventListener("click", () => switchToRegion(other.id));
      }
    }

    const badge = document.getElementById("lobby-region-badge");
    if (badge) {
      if (current) {
        badge.textContent = `SERVER: ${current.label}`;
        badge.title = `This room is hosted on the ${current.label} server`;
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    }
  }

  migrateName();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupUI, { once: true });
  } else {
    setupUI();
  }

  window.LunaspisRegions = {
    REGIONS,
    getCurrentRegion,
    getOtherRegion,
    buildRegionUrl,
    switchToRegion,
    rememberPlayerName: writeNameCookie
  };
})();
