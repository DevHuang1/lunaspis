/*
 * ksc_scene.js — the team's detailed Kennedy Space Center (LC-39A, VAB, LCC, crawler, utilities),
 * built from remote-main's SpaceCenterManager builders and space_center/ modules, adapted to the
 * Shuttle mission's own stack:
 *   - no UI, no stack, no sky dome/sun/clouds (ShuttleView draws the sky, the real stack comes
 *     from the simulation snapshot), no dynamic lights (the near scene's sun lights everything);
 *   - the fixed service structure stands on the orbiter's PORT side (east: the sim's pad attitude
 *     has the dorsal side north), turned so its access arm + White Room meet the crew hatch.
 *     Its base sits in the pad apron so the gantry deck is level with the hatch.
 * One unit = 1 m. Group origin = pad centre on the ground; +X east, +Y up, +Z south (the
 * ShuttleView ground-tile convention, which the remote site already uses: ocean east, VAB south,
 * pad 39B north). Layout constants shared with the server live in pad_layout.js.
 */
(function () {
  "use strict";
  const T = window.THREE, L = window.PadLayout;

  function build(renderer, opts) {
    opts = opts || {};
    const sc = new window.SpaceCenterManager();
    sc.renderer = renderer || null; sc.scene = null; sc.camera = null;
    sc.group = new T.Group(); sc.group.name = "KSC_LC39A";
    sc.unitBoxGeo = new T.BoxGeometry(1, 1, 1);
    sc.steelMat = new T.MeshStandardMaterial({ color: 0x7f2d22, roughness: 0.7, metalness: 0.36 });
    sc.darkSteelMat = new T.MeshStandardMaterial({ color: 0x323c46, roughness: 0.72, metalness: 0.48 });
    sc.deckMat = new T.MeshStandardMaterial({ color: 0x3f4a54, roughness: 0.82, metalness: 0.28 });
    const step = (name, fn) => { try { fn(); } catch (e) { console.warn(`[KSC] ${name} skipped:`, e.message); } };
    step("terrain", () => sc._buildCoastalTerrain());
    step("pad", () => sc._buildLaunchPad39A());
    step("tower", () => sc._buildLaunchTowerAndBoardingDock());
    step("deluge", () => sc._buildWaterDelugeSystem());
    step("guidance", () => sc._buildBoardingGuidance());
    step("lighting", () => sc._buildPerimeterLighting());
    if (window.SpaceCenterSite) step("site", () => { sc.site = new window.SpaceCenterSite(sc); sc.site.build(); });

    // sky dome, sun sprite and clouds belong to the stand-alone remote scene; ShuttleView has its own sky
    const drop = [];
    sc.group.traverse((o) => {
      if (o.name === "SpaceCenterSkyDome" || o === sc.skySunSprite || (sc.clouds && sc.clouds.includes(o))) drop.push(o);
      if (o.isLight) drop.push(o);
    });
    for (const o of drop) if (o.parent) o.parent.remove(o);
    // the remote shadow setup needs the remote renderer config: render without shadows here
    sc.group.traverse((o) => { if (o.isMesh || o.isInstancedMesh) { o.castShadow = false; o.receiveShadow = false; } });
    // facility terminals (VAB desk, LCC consoles) open remote-only tools: hide them for good
    (sc.facilityTerminals || []).forEach((t) => { if (t.marker && t.marker.parent) t.marker.parent.remove(t.marker); });

    // gantry marker labels in the STS_OS plate style (os_plate.js), keyed in the ring's wayfinding colour
    if (window.OsPlate) {
      const relabel = (m, key, text, col) => {
        if (!m || !m.userData.label) return;
        const old = m.userData.label, plate = window.OsPlate.sprite({ key, text, keyBg: col, height: 0.42 });
        plate.position.copy(old.position); m.remove(old); m.add(plate); m.userData.label = plate;
      };
      const gm = sc.guidanceMarkers || {};
      relabel(gm.arm, "1", "Access arm control", "#fbbf24");
      relabel(gm.hatch, "2", "Board orbiter", "#67e8f9");
    }
    // move the fixed service structure to the orbiter's port side (see pad_layout.js)
    const tw = sc.towerGroup;
    tw.position.set(L.TOWER.pos[0], L.TOWER.pos[1], L.TOWER.pos[2]); tw.rotation.y = L.TOWER.yaw;
    sc.armPivotGroup.rotation.y = L.ARM.retracted;
    sc.group.updateMatrixWorld(true);

    const ksc = {
      group: sc.group, sc, tower: tw, arm: sc.armPivotGroup, armAngle: L.ARM.retracted, armTarget: L.ARM.retracted,
      markers: sc.guidanceMarkers || {},
      t: 0,
      setArmExtended(on) { this.armTarget = on ? L.ARM.extended : L.ARM.retracted; },
      armReady() { return Math.abs(this.armAngle - L.ARM.extended) < 0.01; },
      update(dt, show) {
        this.t += dt;
        const d = this.armTarget - this.armAngle, max = L.ARM.swingRate * dt;
        this.armAngle += Math.max(-max, Math.min(max, d));
        this.arm.rotation.y = this.armAngle;
        // collar extends once the arm is locked
        if (sc.dockCollarMesh) sc.dockCollarMesh.scale.y = this.armReady() ? 1 : 0.15;
        if (sc.dockStatusLightMat) { const c = this.armReady() ? 0x22c55e : 0xf59e0b; sc.dockStatusLightMat.color.setHex(c); sc.dockStatusLightMat.emissive.setHex(c); }
        // boarding markers: bob/pulse; only shown while someone is walking
        const m = this.markers, s = show || {};
        if (m.arm) { m.arm.visible = !!s.arm; m.arm.position.y = (m.arm.userData.baseY || 0) + Math.sin(this.t * 2.2) * 0.08; }
        if (m.hatch) { m.hatch.visible = !!s.hatch; m.hatch.position.y = (m.hatch.userData.baseY || 0) + Math.sin(this.t * 2.2 + 1) * 0.08; }
        if (sc.oceanTex) sc.oceanTex.offset.y = (sc.oceanTex.offset.y + dt * 0.008) % 1;
      },
    };
    return ksc;
  }

  window.KscScene = { build };
})();
