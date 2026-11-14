#!/usr/bin/env node
/*
 * Focused checks for the server-region selector (no dependencies, DOM stubbed).
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
  return Object.assign(
    {
      id,
      hidden: true,
      title: "",
      textContent: "",
      value: "",
      attributes: {},
      listeners: {},
      label: { textContent: "" },
      querySelector(selector) {
        return selector === "[data-region-label]" ? this.label : null;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      addEventListener(name, cb) {
        this.listeners[name] = cb;
      }
    },
    extra
  );
}

function load({ hostname, href, cookie = "", storedName = null, joinCode = "" }) {
  let assignedUrl = null;
  const elements = {
    "btn-region-toggle": makeElement("btn-region-toggle"),
    "lobby-region-badge": makeElement("lobby-region-badge"),
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
      protocol: "https:",
      assign(url) {
        assignedUrl = url;
      }
    },
    document
  };
  const context = { window, document, localStorage: storage, URL, console };
  vm.runInNewContext(source, context, { filename: "regions.js" });
  if (documentListeners.DOMContentLoaded) documentListeners.DOMContentLoaded();
  return {
    api: window.LunaspisRegions,
    elements,
    storage,
    document,
    get assignedUrl() {
      return assignedUrl;
    }
  };
}

(function usHost() {
  const r = load({ hostname: "us.lunaspis.com", href: "https://us.lunaspis.com/?room=ABCD" });
  check("US host resolves to the US region", r.api.getCurrentRegion().id === "us");
  check("US host targets Asia on toggle", r.api.getOtherRegion().id === "asia");
  check("US selector is visible", r.elements["btn-region-toggle"].hidden === false);
  check("US selector label", r.elements["btn-region-toggle"].label.textContent === "SERVER: US");
  check("US lobby badge label", r.elements["lobby-region-badge"].textContent === "SERVER: US");
  check(
    "Region URL preserves path and invite code",
    r.api.buildRegionUrl(r.api.getOtherRegion()).toString() === "https://asia.lunaspis.com/?room=ABCD"
  );
  r.elements["btn-region-toggle"].listeners.click();
  check(
    "Clicking the selector navigates to the other region",
    r.assignedUrl === "https://asia.lunaspis.com/?room=ABCD",
    r.assignedUrl
  );
})();

(function asiaHost() {
  const r = load({ hostname: "asia.lunaspis.com", href: "https://asia.lunaspis.com/" });
  check("Asia host resolves to the Asia region", r.api.getCurrentRegion().id === "asia");
  check("Asia host targets US on toggle", r.api.getOtherRegion().id === "us");
  check("Asia selector label", r.elements["btn-region-toggle"].label.textContent === "SERVER: ASIA");
  check("Asia lobby badge label", r.elements["lobby-region-badge"].textContent === "SERVER: ASIA");
})();

(function unknownHost() {
  const r = load({ hostname: "localhost", href: "http://localhost:3000/" });
  check("Unknown host has no region", r.api.getCurrentRegion() === null);
  check("Unknown host hides the selector", r.elements["btn-region-toggle"].hidden === true);
  check("Unknown host hides the lobby badge", r.elements["lobby-region-badge"].hidden === true);
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
    "Existing local name is written to the .lunaspis.com cookie",
    r2.document.cookie.includes("lunaspis_name=Voss") && r2.document.cookie.includes("Domain=.lunaspis.com")
  );
})();

(function joinCodeRecovery() {
  const r = load({ hostname: "us.lunaspis.com", href: "https://us.lunaspis.com/", joinCode: " abcd12 " });
  check(
    "Typed join code is carried to the other region",
    r.api.buildRegionUrl(r.api.getOtherRegion()).toString() === "https://asia.lunaspis.com/?room=ABCD12"
  );
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
