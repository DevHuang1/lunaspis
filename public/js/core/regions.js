/**
 * Server-region selection for the split Lunaspis deployments.
 *
 * Each regional deployment (asia.lunaspis.com, us.lunaspis.com) runs its own
 * Socket.IO server and in-memory room registry, so room creation, solo rooms,
 * invite links, and voice signaling happen on whichever region the browser is
 * connected to. Switching regions navigates to that subdomain while preserving
 * the player's name via a shared .lunaspis.com cookie (and any typed room code).
 */
(function () {
  "use strict";

  const REGIONS = Object.freeze([
    Object.freeze({
      id: "asia",
      label: "ASIA",
      host: "asia.lunaspis.com",
      aliases: Object.freeze(["web-asia-production.up.railway.app"])
    }),
    Object.freeze({
      id: "us",
      label: "US",
      host: "us.lunaspis.com",
      aliases: Object.freeze(["web-us-production.up.railway.app"])
    })
  ]);

  const NAME_COOKIE = "lunaspis_name";
  const COOKIE_DOMAIN = ".lunaspis.com";
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
  const boundElements = new WeakSet();

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
  // runs before network.js loads. The .lunaspis.com cookie represents the most
  // recently used name across subdomains; if absent, seed it from localStorage.
  function migrateName() {
    try {
      const saved = readCookie(NAME_COOKIE);
      const stored = getStoredName().trim();
      if (saved) {
        if (saved !== stored) {
          localStorage.setItem("interfellas_name", saved);
        }
      } else if (stored) {
        writeNameCookie(stored);
      }
    } catch (e) {}
  }

  function matchesHost(hostname, candidate) {
    return hostname === candidate || hostname.endsWith(`.${candidate}`);
  }

  function getCurrentRegion() {
    const host = String((window.location && window.location.hostname) || "").toLowerCase();
    if (!host) return null;
    return (
      REGIONS.find(
        (region) =>
          matchesHost(host, region.host) ||
          (Array.isArray(region.aliases) && region.aliases.some((alias) => matchesHost(host, alias)))
      ) || null
    );
  }

  function getOtherRegion() {
    const current = getCurrentRegion();
    return REGIONS.find((region) => !current || region.id !== current.id) || null;
  }

  function buildRegionUrl(region, options) {
    if (!region || !/^[a-z0-9.-]+$/i.test(region.host)) return null;
    const opts = options || {};
    const url = new URL(window.location.href);
    url.protocol = "https:";
    url.host = region.host;
    url.port = "";
    if (opts.dropRoom) {
      url.searchParams.delete("room");
      return url;
    }
    // Recover a typed join code after a wrong-region failure or when picking
    // a server from the main domain. Keeping it in ?room= triggers auto-join.
    const joinInput = document.getElementById("input-join-code");
    const typedCode = joinInput && joinInput.value ? joinInput.value.trim().toUpperCase() : "";
    if (/^[A-Z0-9]{4,8}$/.test(typedCode) && !url.searchParams.get("room")) {
      url.searchParams.set("room", typedCode);
    }
    return url;
  }

  function switchToRegion(regionId, options) {
    const region = REGIONS.find((item) => item.id === regionId);
    if (!region) return false;
    const opts = options || {};
    const host = String((window.location && window.location.hostname) || "").toLowerCase();
    const current = getCurrentRegion();
    if (current && current.id === region.id && host === region.host) {
      return false;
    }

    const activeRoomId = window.netManager && window.netManager.roomId;
    if (opts.confirmIfInRoom && activeRoomId && typeof window.confirm === "function") {
      const currentLabel = current ? current.label : "MAIN";
      const ok = window.confirm(
        `You are currently in room ${activeRoomId} on ${currentLabel}. ` +
        `Switch to ${region.label} (${region.host})? This leaves your current room ` +
        `because rooms only exist on the server where they were created.`
      );
      if (!ok) return false;
    }

    const input = document.getElementById("input-player-name");
    const typedName = input && input.value ? input.value.trim() : "";
    writeNameCookie(typedName || getStoredName());

    const dropRoom = !!activeRoomId || !!opts.dropRoom;
    const url = buildRegionUrl(region, { dropRoom });
    if (!url) return false;
    window.location.assign(url.toString());
    return true;
  }

  function getButtonRegionId(btn) {
    if (!btn) return "";
    if (typeof btn.getAttribute === "function") {
      const attr = btn.getAttribute("data-region");
      if (attr) return attr;
    }
    if (btn.attributes && btn.attributes["data-region"]) {
      return btn.attributes["data-region"];
    }
    return (btn.dataset && btn.dataset.region) || "";
  }

  function syncToggleContainer(container, current, options) {
    if (!container) return;
    const opts = options || {};
    container.hidden = false;
    container.setAttribute("data-region-state", current ? current.id : "unselected");

    const label = container.querySelector && container.querySelector("[data-region-label]");
    if (label) {
      label.textContent = current ? "SERVER" : "SELECT SERVER";
    }

    const buttons = container.querySelectorAll ? Array.from(container.querySelectorAll("[data-region]")) : [];
    for (const btn of buttons) {
      const regionId = getButtonRegionId(btn);
      const region = REGIONS.find((r) => r.id === regionId);
      if (!region) continue;
      const isActive = !!(current && current.id === region.id);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      if (btn.classList && typeof btn.classList.toggle === "function") {
        btn.classList.toggle("is-active", isActive);
      }
      const actionDesc = isActive
        ? `Connected to ${region.label} server (${region.host}). Rooms you create or join run on ${region.host}.`
        : `Switch to ${region.label} server (${region.host}). Opens ${region.host} so room creation and gameplay run in ${region.label}.`;
      btn.title = actionDesc;
      btn.setAttribute("aria-label", actionDesc);
      if (!boundElements.has(btn)) {
        boundElements.add(btn);
        btn.addEventListener("click", () => switchToRegion(region.id, { confirmIfInRoom: !!opts.confirmIfInRoom }));
      }
    }
  }

  function setupUI() {
    const current = getCurrentRegion();
    const other = getOtherRegion();

    const nameInput = document.getElementById("input-player-name");
    if (nameInput && !boundElements.has(nameInput)) {
      boundElements.add(nameInput);
      const syncCookie = () => writeNameCookie(nameInput.value);
      nameInput.addEventListener("input", syncCookie);
      nameInput.addEventListener("change", syncCookie);
    }

    const toggle = document.getElementById("region-toggle");
    if (toggle) {
      syncToggleContainer(toggle, current, { confirmIfInRoom: false });
    }

    // Legacy single-button fallback if still present in custom markup/tests
    const legacyToggle = document.getElementById("btn-region-toggle");
    if (legacyToggle) {
      const target = other || REGIONS[0];
      const label = legacyToggle.querySelector("[data-region-label]");
      if (label) label.textContent = current ? `SERVER: ${current.label}` : `SWITCH TO ${target.label}`;
      legacyToggle.hidden = false;
      legacyToggle.title = current
        ? `Connected to ${current.label} (${current.host}). Click to switch to ${target.label} (${target.host}).`
        : `Switch to ${target.label} (${target.host}).`;
      legacyToggle.setAttribute("aria-label", legacyToggle.title);
      if (!boundElements.has(legacyToggle)) {
        boundElements.add(legacyToggle);
        legacyToggle.addEventListener("click", () => switchToRegion(target.id));
      }
    }

    const badge = document.getElementById("lobby-region-badge");
    if (badge) {
      const regionLabel = current ? current.label : "MAIN";
      badge.textContent = `SERVER: ${regionLabel}`;
      badge.setAttribute("data-region-state", current ? current.id : "unselected");
      badge.title = current
        ? `This room is hosted on the ${current.label} server (${current.host})`
        : "Connected to the main server. Use ASIA or US to switch to a regional subdomain.";
      badge.hidden = false;
    }

    const lobbySwitch = document.getElementById("lobby-region-switch");
    if (lobbySwitch) {
      syncToggleContainer(lobbySwitch, current, { confirmIfInRoom: true });
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
