/*
 * os_plate.js — world-space labels (astronaut nameplates, gantry markers) drawn in the STS_OS style of the
 * HUD's mission tag: square corners, a 1-px ink rule, a solid key cell (ink, or the marker's wayfinding
 * colour) followed by a void cell, Share Tech Mono in upper case. One renderer so every label matches.
 *
 *   OsPlate.sprite({ key: "CDR", text: "VANCE", keyBg: "#ede8dd" }) -> THREE.Sprite (world height ~0.3 m)
 *   window.createNameBadgeSprite(...) is provided for glb_manager's astronaut rigs (same signature);
 *   OsPlate.drawEmote(bubble, def) restyles glb_manager's emote bubble the same way.
 */
(function () {
  "use strict";
  const INK = "#ede8dd", VOID = "rgba(0,0,0,0.82)", LINE = "rgba(237,232,221,0.78)";
  const FONT = '"Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';
  const PX = 44, PAD = 22, H = 76;                                   // canvas px; text cap height ~ 0.58 H

  function draw(canvas, o) {
    const ctx = canvas.getContext("2d");
    ctx.font = `${PX}px ${FONT}`;
    const key = String(o.key || "").toUpperCase(), text = String(o.text || "").toUpperCase();
    const kw = key ? Math.ceil(ctx.measureText(key).width) + PAD * 2 : 0, tw = Math.ceil(ctx.measureText(text).width) + PAD * 2;
    const w = kw + tw + 2;
    if (canvas.width !== w || canvas.height !== H) { canvas.width = w; canvas.height = H; }
    ctx.clearRect(0, 0, w, H);
    ctx.font = `${PX}px ${FONT}`; ctx.textBaseline = "middle";
    ctx.fillStyle = VOID; ctx.fillRect(1, 1, w - 2, H - 2);
    if (key) { ctx.fillStyle = o.keyBg || INK; ctx.fillRect(1, 1, kw, H - 2); ctx.fillStyle = o.keyInk || "#000"; ctx.fillText(key, 1 + PAD, H / 2 + 2); }
    ctx.fillStyle = o.textInk || INK; ctx.fillText(text, 1 + kw + PAD, H / 2 + 2);
    ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, H - 2);
    return w / H;
  }

  function sprite(o) {
    const T = window.THREE, canvas = document.createElement("canvas");
    const tex = new T.CanvasTexture(canvas);
    if (T.sRGBEncoding !== undefined) tex.encoding = T.sRGBEncoding;
    tex.minFilter = T.LinearFilter; tex.generateMipmaps = false;
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    s.renderOrder = 31;
    const height = o.height || 0.3;
    const redraw = (next) => { Object.assign(o, next || {}); const aspect = draw(canvas, o); tex.needsUpdate = true; s.scale.set(height * aspect, height, 1); };
    redraw();
    // the webfont may still be loading on first draw: redraw once it is ready
    if (document.fonts && document.fonts.load) document.fonts.load(`${PX}px "Share Tech Mono"`).then(() => redraw()).catch(() => {});
    s.userData.osPlate = { redraw };
    return s;
  }

  // astronaut nameplate for glb_manager.createAstronautRig: [ROLE] NAME
  window.createNameBadgeSprite = function (name, colorHex, role, isHost) {
    const s = sprite({ key: role || "CREW", text: (isHost ? "* " : "") + (name || "Astronaut"), height: 0.26 });
    s.userData.update = (n, c, r, h) => s.userData.osPlate.redraw({ key: r || "CREW", text: (h ? "* " : "") + (n || "Astronaut") });
    return s;
  };

  // emote callout for glb_manager's crew expressions: [>] WAVE, keyed in the HUD blue, above the nameplate
  function drawEmote(bubble, def) {
    const T = window.THREE, aspect = draw(bubble.canvas, { key: ">", text: def.label || def.id, keyBg: "#5cc2ec" });
    bubble.texture.minFilter = T.LinearFilter; bubble.texture.generateMipmaps = false;
    if (T.sRGBEncoding !== undefined) bubble.texture.encoding = T.sRGBEncoding;
    const m = bubble.sprite.material; m.depthTest = false; m.fog = false; bubble.sprite.renderOrder = 32;
    const h = 0.24; bubble.sx = h * aspect; bubble.sy = h; bubble.baseY = 2.52;
  }

  window.OsPlate = { sprite, draw, drawEmote };
})();
