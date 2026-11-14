#!/usr/bin/env node
/*
 * Focused checks for the server-region toggle (no dependencies, DOM stubbed).
 * Run: node tests/regions/run_checks.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SCRIPT = path.join(__dirname, "../../public/js/core/regions.js");
const source = fs.readFileSync(SCRIPT, "utf8");

let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

function makeElement(id, extra = {}) {
  const classes = new Set();
  const attributes = Object.assign({}, extra.attributes || {});
  const listeners = {};
  const label = { textContent: "" };
  const buttons = extra.buttons || [];
  const el = Object.assign(
    {
      id,
      hidden: false,
      title: "",
      textContent: "",
      value: "",
      label,
      buttons,
      listeners,
      classes,
      classList: {
        toggle(name, force) {
          if (force === undefined) {
            if (classes.has(name)) classes.delete(name);
            else classes.add(name);
            return classes.has(name);
          }
          if (force) classes.add(name);
          else classes.delete(name);
          return classes.has(name);
        },
        contains(name) {
          return classes.has(name);
        }
      },
      querySelector(selector) {
        return selector === "[data-region-label]" ? label : null;
      },
      querySelectorAll(selector) {
        return selector === "[data-region]" ? buttons : [];
      },
      setAttribute(name, value) {
        attributes[name] = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
      },
      addEventListener(name, cb) {
        if (!listeners[name]) listeners[name] = [];
        listeners[name].push(cb);
      },
      click() {
        for (const cb of listeners.click || []) cb({ type: "click", target: el });
      },
      dispatch(name) {
        for (const cb of listeners[name] || []) cb({ type: name, target: el });
      }
    },
    extra,
    { attributes }
  );
  return el;
}

function load({
  hostname,
  href,
  cookie = "",
  storedName = null,
  joinCode = "",
  roomId = null,
  confirmResult = true
}) {
  let assignedUrl = null;
  let confirmCalls = 0;

  const btnTitleAsia = makeElement("btn-region-asia", { attributes: { "data-region": "asia" } });
  const btnTitleUs = makeElement("btn-region-us", { attributes: { "data-region": "us" } });
  const btnLobbyAsia = makeElement("btn-lobby-region-asia", { attributes: { "data-region": "asia" } });
  const btnLobbyUs = makeElement("btn-lobby-region-us", { attributes: { "data-region": "us" } });

  const elements = {
    "region-toggle": makeElement("region-toggle", { buttons: [btnTitleAsia, btnTitleUs] }),
    "btn-region-asia": btnTitleAsia,
    "btn-region-us": btnTitleUs,
    "lobby-region-badge": makeElement("lobby-region-badge"),
    "lobby-region-switch": makeElement("lobby-region-switch", { buttons: [btnLobbyAsia, btnLobbyUs] }),
    "btn-lobby-region-asia": btnLobbyAsia,
    "btn-lobby-region-us": btnLobbyUs,
    "input-player-name": makeElement("input-player-name", { value: storedName || "" }),
    "input-join-code": makeElement("input-join-code", { value: joinCode })
  };

  const storageData = {};
  if (storedName) storageData.interfellas_name = storedName;
  const storage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null;
    },
    setItem(key, value) {
      storageData[key] = String(value);
    },
    removeItem(key) {
      delete storageData[key];
    }
  };
  const documentListeners = {};
  const document = {
    readyState: "loading",
    cookie,
    getElementById(id) {
      return elements[id] || null;
    },
    addEventListener(name, cb) {
      documentListeners[name] = cb;
    }
  };
  const window = {
    location: {
      hostname,
      href,
      protocol: href.startsWith("http:") ? "http:" : "https:",
      assign(url) {
        assignedUrl = url;
      }
    },
    confirm() {
      confirmCalls++;
      return confirmResult;
    },
    netManager: roomId ? { roomId } : null,
    document
  };
  const context = { window, document, localStorage: storage, URL, WeakSet, console };
  vm.runInNewContext(source, context, { filename: "regions.js" });
  if (documentListeners.DOMContentLoaded) documentListeners.DOMContentLoaded();
  return {
    api: window.LunaspisRegions,
    elements,
    storage,
    document,
    get assignedUrl() {
      return assignedUrl;
    },
    get confirmCalls() {
      return confirmCalls;
    }
  };
}

(function usHost() {
  const r = load({ hostname: "us.lunaspis.com", href: "https://us.lunaspis.com/?room=ABCD" });
  check("US host resolves to the US region", r.api.getCurrentRegion().id === "us");
  check("US host targets Asia as other region", r.api.getOtherRegion().id === "asia");
  check("US toggle is visible", r.elements["region-toggle"].hidden === false);
  check("US toggle label", r.elements["region-toggle"].label.textContent === "SERVER");
  check("US option is active", r.elements["btn-region-us"].classList.contains("is-active") && r.elements["btn-region-us"].getAttribute("aria-pressed") === "true");
  check("ASIA option is inactive on US", !r.elements["btn-region-asia"].classList.contains("is-active") && r.elements["btn-region-asia"].getAttribute("aria-pressed") === "false");
  check("US lobby badge label", r.elements["lobby-region-badge"].hidden === false && r.elements["lobby-region-badge"].textContent === "SERVER: US");
  check(
    "Region URL preserves path and invite code",
    r.api.buildRegionUrl(r.api.getOtherRegion()).toString() === "https://asia.lunaspis.com/?room=ABCD"
  );
  r.elements["btn-region-us"].click();
  check("Clicking already-active US option does not reload", r.assignedUrl === null, r.assignedUrl);
  r.elements["btn-region-asia"].click();
  check(
    "Clicking ASIA on US navigates to asia.lunaspis.com",
    r.assignedUrl === "https://asia.lunaspis.com/?room=ABCD",
    r.assignedUrl
  );
})();

(function asiaHost() {
  const r = load({ hostname: "asia.lunaspis.com", href: "https://asia.lunaspis.com/" });
  check("Asia host resolves to the Asia region", r.api.getCurrentRegion().id === "asia");
  check("Asia host targets US as other region", r.api.getOtherRegion().id === "us");
  check("ASIA option is active", r.elements["btn-region-asia"].classList.contains("is-active") && r.elements["btn-region-asia"].getAttribute("aria-pressed") === "true");
  check("US option is inactive on ASIA", !r.elements["btn-region-us"].classList.contains("is-active"));
  check("Asia lobby badge label", r.elements["lobby-region-badge"].textContent === "SERVER: ASIA");
  r.elements["btn-region-asia"].click();
  check("Clicking already-active ASIA option does not reload", r.assignedUrl === null, r.assignedUrl);
  r.elements["btn-region-us"].click();
  check(
    "Clicking US on ASIA navigates to us.lunaspis.com",
    r.assignedUrl === "https://us.lunaspis.com/",
    r.assignedUrl
  );
})();

(function railwayAliasHost() {
  const r = load({
    hostname: "web-asia-production.up.railway.app",
    href: "https://web-asia-production.up.railway.app/"
  });
  check("Railway Asia host resolves to Asia region", r.api.getCurrentRegion().id === "asia");
  r.elements["btn-region-asia"].click();
  check(
    "Clicking ASIA from Railway Asia alias moves to canonical asia.lunaspis.com",
    r.assignedUrl === "https://asia.lunaspis.com/",
    r.assignedUrl
  );
})();

(function mainDomainHost() {
  const r = load({ hostname: "www.lunaspis.com", href: "https://www.lunaspis.com/" });
  check("Main domain has no active regional server", r.api.getCurrentRegion() === null);
  check("Main domain keeps server toggle visible", r.elements["region-toggle"].hidden === false);
  check("Main domain marks toggle unselected", r.elements["region-toggle"].getAttribute("data-region-state") === "unselected");
  check("Main domain prompts SELECT SERVER", r.elements["region-toggle"].label.textContent === "SELECT SERVER");
  check("Main domain lobby badge shows SERVER: MAIN", r.elements["lobby-region-badge"].hidden === false && r.elements["lobby-region-badge"].textContent === "SERVER: MAIN");
  r.elements["btn-region-asia"].click();
  check(
    "Clicking ASIA on www.lunaspis.com navigates to asia.lunaspis.com",
    r.assignedUrl === "https://asia.lunaspis.com/",
    r.assignedUrl
  );

  const rUs = load({ hostname: "lunaspis.com", href: "https://lunaspis.com/" });
  rUs.elements["btn-region-us"].click();
  check(
    "Clicking US on apex lunaspis.com navigates to us.lunaspis.com",
    rUs.assignedUrl === "https://us.lunaspis.com/",
    rUs.assignedUrl
  );
})();

(function localhostHost() {
  const r = load({ hostname: "localhost", href: "http://localhost:8080/" });
  check("Localhost has no region", r.api.getCurrentRegion() === null);
  check("Localhost keeps server toggle visible", r.elements["region-toggle"].hidden === false);
  r.elements["btn-region-asia"].click();
  check(
    "Clicking ASIA on localhost targets https://asia.lunaspis.com/",
    r.assignedUrl === "https://asia.lunaspis.com/",
    r.assignedUrl
  );
})();

(function lobbySwitchInRoom() {
  const declined = load({
    hostname: "us.lunaspis.com",
    href: "https://us.lunaspis.com/?room=XYZ999",
    roomId: "XYZ999",
    confirmResult: false
  });
  declined.elements["btn-lobby-region-asia"].click();
  check("Declining lobby server confirm cancels navigation", declined.confirmCalls === 1 && declined.assignedUrl === null);

  const accepted = load({
    hostname: "us.lunaspis.com",
    href: "https://us.lunaspis.com/?room=XYZ999",
    roomId: "XYZ999",
    confirmResult: true
  });
  accepted.elements["btn-lobby-region-asia"].click();
  check(
    "Confirming lobby switch leaves old room code out of target URL",
    accepted.confirmCalls === 1 && accepted.assignedUrl === "https://asia.lunaspis.com/",
    accepted.assignedUrl
  );
})();

(function nameCookie() {
  const r = load({
    hostname: "asia.lunaspis.com",
    href: "https://asia.lunaspis.com/",
    cookie: "lunaspis_name=Alex%20Rider"
  });
  check(
    "Shared name cookie seeds localStorage before network.js",
    r.storage.getItem("interfellas_name") === "Alex Rider",
    r.storage.getItem("interfellas_name")
  );

  const r2 = load({ hostname: "us.lunaspis.com", href: "https://us.lunaspis.com/", storedName: "Voss" });
  check(
    "Existing local name is written to the .lunaspis.com cookie when cookie is absent",
    r2.document.cookie.includes("lunaspis_name=Voss") && r2.document.cookie.includes("Domain=.lunaspis.com")
  );

  const r3 = load({
    hostname: "us.lunaspis.com",
    href: "https://us.lunaspis.com/",
    cookie: "lunaspis_name=NewAsiaName",
    storedName: "OldUSName"
  });
  check(
    "Shared name cookie wins over stale origin-local localStorage",
    r3.storage.getItem("interfellas_name") === "NewAsiaName",
    r3.storage.getItem("interfellas_name")
  );

  const r4 = load({
    hostname: "www.lunaspis.com",
    href: "https://www.lunaspis.com/"
  });
  r4.elements["input-player-name"].value = "Kira";
  r4.elements["input-player-name"].dispatch("input");
  check(
    "Typing player name syncs .lunaspis.com cookie immediately",
    r4.document.cookie.includes("lunaspis_name=Kira") && r4.document.cookie.includes("Domain=.lunaspis.com")
  );
})();

(function joinCodeRecovery() {
  const r = load({ hostname: "www.lunaspis.com", href: "https://www.lunaspis.com/", joinCode: " abcd12 " });
  r.elements["btn-region-asia"].click();
  check(
    "Typed join code is carried when choosing ASIA from main domain",
    r.assignedUrl === "https://asia.lunaspis.com/?room=ABCD12",
    r.assignedUrl
  );
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
