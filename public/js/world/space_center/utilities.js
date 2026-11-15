/**
 * Space Center 2 — Power Substation, Cooling Tower, Diesel Generator,
 * Fire Water Tank, Antenna Farm, Overhead Power Grid & Industrial Piping.
 */
(function (window) {
  "use strict";

  const NS = window.SpaceCenterModules;

  NS.register("utilities", function buildUtilities(site) {
    const g = new window.THREE.Group();
    g.name = "SC2_Utilities";
    site.group.add(g);

    const C = NS.constants;
    const m = (k) => site.mat(k);
    const concrete = m("concrete");
    const concreteDark = m("concrete_dark");
    const steel = m("steel_grey");
    const white = m("steel_white");
    const dark = m("black");
    const yellow = m("yellow");

    // -------------------------------------------------------------------------
    // 1. HIGH-VOLTAGE SUBSTATION (Cleanly layered OilPad & Corner-Trimmed Fence)
    // -------------------------------------------------------------------------
    const sub = C.SUBSTATION; // (-706, 50)
    site.box(g, 36, 0.16, 26, sub.x, 0.08, sub.z, concreteDark, "SubstationPad");
    for (let i = -1; i <= 1; i += 2) {
      const tx = sub.x + i * 8;
      // OilPad strictly ABOVE SubstationPad (0.16..0.34)
      site.box(g, 7.6, 0.18, 8.6, tx, 0.25, sub.z, concrete, "OilContainmentPad");
      site.box(g, 5.2, 4.6, 4.2, tx, 2.64, sub.z, steel, "MainTransformer");
      site.box(g, 5.4, 0.4, 4.4, tx, 5.14, sub.z, white, "TransformerCap");
      // Radiator cooling fins
      for (let f = -1.6; f <= 1.6; f += 0.8) {
        site.box(g, 0.18, 3.6, 4.7, tx + f, 2.6, sub.z, dark, "RadiatorFin");
      }
      // High-voltage ceramic bushings
      for (const bz of [-1.2, 0, 1.2]) {
        site.cyl(g, 0.2, 2.2, tx + i * 1.1, 6.4, sub.z + bz, m("rust"), 8, "HVBushing");
        site.sphere(g, 0.24, tx + i * 1.1, 7.6, sub.z + bz, white, 8, "HVTerminal");
      }
    }
    // Busbar gantry frame
    site.box(g, 0.24, 9.2, 0.24, sub.x - 14, 4.68, sub.z - 6, steel, "GantryPost");
    site.box(g, 0.24, 9.2, 0.24, sub.x + 14, 4.68, sub.z - 6, steel, "GantryPost");
    site.box(g, 28.4, 0.3, 0.3, sub.x, 9.1, sub.z - 6, steel, "BusbarCrossbeam");

    // Non-overlapping corner-trimmed chain-link perimeter rails & posts
    for (let x = -17.5; x <= 17.5; x += 5) {
      site.cyl(g, 0.08, 2.8, sub.x + x, 1.48, sub.z - 12.6, steel, 6, "SubFencePost");
      site.cyl(g, 0.08, 2.8, sub.x + x, 1.48, sub.z + 12.6, steel, 6, "SubFencePost");
    }
    site.box(g, 35.4, 0.12, 0.12, sub.x, 2.75, sub.z - 12.6, steel, "SubFenceRailN");
    site.box(g, 35.4, 0.12, 0.12, sub.x, 2.75, sub.z + 12.6, steel, "SubFenceRailS");
    site.box(g, 0.12, 0.12, 25.0, sub.x - 17.6, 2.75, sub.z, steel, "SubFenceRailW");
    site.box(g, 0.12, 0.12, 25.0, sub.x + 17.6, 2.75, sub.z, steel, "SubFenceRailE");
    site.signBoard(
      g,
      sub.x,
      1.5,
      sub.z - 13.0,
      Math.PI,
      5.4,
      1.3,
      (ctx, w, h) => {
        ctx.fillStyle = "#e4ff7e";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 8;
        ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.fillStyle = "#111827";
        ctx.font = "900 40px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("DANGER · HIGH VOLTAGE", w * 0.5, h * 0.54);
      },
      "SubstationDangerSign"
    );
    site.addBoxCollider(sub.x, sub.z, 36, 26, "Substation");

    // -------------------------------------------------------------------------
    // 2. COOLING TOWER, CHEMICAL DOSING TANK & ELEVATED PIPE BRIDGE
    // -------------------------------------------------------------------------
    const cool = C.COOLING; // (-620, 58)
    site.cyl(g, 8.2, 0.24, cool.x, 0.12, cool.z, concreteDark, 20, "CoolingPad");
    site.cone(g, 4.4, 6.2, 8.5, cool.x, 4.49, cool.z, concrete, 20, "CoolingLower");
    site.cone(g, 5.4, 4.4, 7.5, cool.x, 12.49, cool.z, concrete, 20, "CoolingUpper");
    site.cyl(g, 5.45, 0.65, cool.x, 16.5, cool.z, yellow, 20, "CoolingCollar");
    // Service ladder & chemical tank beside cooling tower
    site.box(g, 0.6, 16.2, 0.3, cool.x + 5.2, 8.3, cool.z, steel, "CoolingLadder");
    site.cyl(g, 1.4, 3.6, cool.x - 10, 2.04, cool.z, m("nasa_blue"), 14, "ChemTank");
    // Elevated pipe rack connecting Cooling Tower toward Generator / Substation
    site.cyl(g, 0.36, 36, cool.x, 4.2, cool.z - 20, white, 10, "CoolingPipeBridge").rotation.x = Math.PI / 2;
    site.label(g, "COOLING TOWER", cool.x - 4, 3.6, cool.z + 9.5, { width: 9, height: 1.6, fontSize: 38 });
    site.addCircleCollider(cool.x, cool.z, 5.5, "Cooling tower");

    // -------------------------------------------------------------------------
    // 3. STANDBY DIESEL GENERATOR HOUSE & CORNER-TRIMMED BUND WALL
    // -------------------------------------------------------------------------
    const gen = C.GENERATOR; // (-618, 18)
    site.box(g, 16, 0.18, 12, gen.x, 0.09, gen.z, concreteDark, "GenPad");
    site.box(g, 13.6, 4.8, 9.6, gen.x, 2.58, gen.z, white, "GenBuilding");
    site.box(g, 14.0, 0.5, 10.0, gen.x, 5.23, gen.z, dark, "GenRoof");
    site.box(g, 6.8, 2.4, 0.2, gen.x, 2.8, gen.z + 4.9, steel, "GenLouvers");
    site.cyl(g, 0.34, 4.2, gen.x + 5.2, 7.5, gen.z, steel, 10, "GenExhaustStack");
    // Fuel tank containment bund trimmed at corners -> ZERO overlap
    const tx = gen.x - 13;
    const tz = gen.z;
    site.box(g, 7.6, 0.18, 6.0, tx, 0.09, tz, concreteDark, "DieselBundFloor");
    site.cyl(g, 1.55, 5.0, tx, 2.1, tz, yellow, 16, "DieselTank").rotation.z = Math.PI / 2;
    site.box(g, 7.6, 0.65, 0.35, tx, 0.5, tz - 2.8, concrete, "DieselBermN");
    site.box(g, 7.6, 0.65, 0.35, tx, 0.5, tz + 2.8, concrete, "DieselBermS");
    site.box(g, 0.35, 0.65, 5.2, tx - 3.62, 0.5, tz, concrete, "DieselBermW");
    site.box(g, 0.35, 0.65, 5.2, tx + 3.62, 0.5, tz, concrete, "DieselBermE");
    site.label(g, "GENERATOR", gen.x, 5.8, gen.z + 5.6, { width: 7, height: 1.4, fontSize: 38 });
    site.addBoxCollider(gen.x, gen.z, 14, 10, "Generator house");

    // -------------------------------------------------------------------------
    // 4. FIRE SUPPRESSION WATER TANK (-596, 92)
    // -------------------------------------------------------------------------
    const fire = C.FIRE_TANK;
    site.cyl(g, 6.2, 0.24, fire.x, 0.12, fire.z, concreteDark, 20, "FirePad");
    site.cyl(g, 5.0, 9.6, fire.x, 5.04, fire.z, m("red"), 24, "FireTank");
    site.cyl(g, 5.1, 0.85, fire.x, 7.6, fire.z, white, 24, "FireStripe");
    site.cone(g, 0.4, 5.1, 2.2, fire.x, 10.94, fire.z, white, 24, "FireCap");
    site.label(g, "FIRE WATER", fire.x, 3.6, fire.z + 10.5, { width: 7, height: 1.4, fontSize: 38 });
    site.addCircleCollider(fire.x, fire.z, 4.8, "Fire water tank");

    // -------------------------------------------------------------------------
    // 5. TELEMETRY & TRACKING ANTENNA COMPOUND (-850, 336)
    // -------------------------------------------------------------------------
    const ant = C.ANTENNA;
    site.box(g, 28, 0.18, 22, ant.x, 0.09, ant.z, concreteDark, "AntennaPad");
    // Telemetry comms shelter + HVAC wall unit
    site.box(g, 6.8, 3.2, 4.8, ant.x + 7.5, 1.78, ant.z - 5.5, white, "AntennaShelter");
    site.box(g, 1.1, 0.9, 0.7, ant.x + 7.5, 1.6, ant.z - 8.2, steel, "ShelterAC");
    // Twin tracking parabolic dishes aimed toward launch corridor
    for (const [ox, oz, scale] of [[-6, 1.5, 1.0], [5, 5.5, 0.72]]) {
      const dx = ant.x + ox;
      const dz = ant.z + oz;
      site.cyl(g, 0.85 * scale, 5.2 * scale, dx, 0.18 + 2.6 * scale, dz, steel, 12, "DishPedestal");
      const dish = site.cone(g, 4.4 * scale, 0.7 * scale, 2.4 * scale, dx, 0.18 + 6.4 * scale, dz, white, 20, "ParabolicDish");
      dish.rotation.x = -0.68;
      dish.rotation.z = -0.35;
      site.cyl(g, 0.1 * scale, 3.4 * scale, dx + 0.8 * scale, 0.18 + 7.5 * scale, dz - 1.5 * scale, dark, 8, "DishFeedHorn");
    }
    // Corner-trimmed perimeter fence posts
    for (let x = -13; x <= 13; x += 6.5) {
      site.cyl(g, 0.08, 2.4, ant.x + x, 1.3, ant.z - 10.5, steel, 6, "AntFencePost");
      site.cyl(g, 0.08, 2.4, ant.x + x, 1.3, ant.z + 10.5, steel, 6, "AntFencePost");
    }
    site.label(g, "ANTENNA FARM", ant.x, 3.8, ant.z + 12.2, { width: 9, height: 1.5, fontSize: 36 });
    site.addBoxCollider(ant.x, ant.z, 26, 20, "Antenna farm");

    // -------------------------------------------------------------------------
    // 6. OVERHEAD POWER FEED LINE, TRANSFORMERS & FIRE HYDRANTS
    // -------------------------------------------------------------------------
    for (let px = -560; px <= -140; px += 70) {
      site.cyl(g, 0.24, 15, px, 7.5, 124, m("trunk"), 8, "PowerPole");
      site.box(g, 0.24, 0.26, 4.8, px, 14.3, 124, m("trunk"), "CrossArm");
      for (const iz of [-1.8, 0, 1.8]) {
        site.cyl(g, 0.12, 0.42, px, 14.65, 124 + iz, m("nasa_blue"), 6, "Insulator");
      }
      if (px < -140) {
        site.beam(g, px, 14.7, 124 - 1.8, px + 70, 14.7, 124 - 1.8, 0.09, dark, "PowerWire");
        site.beam(g, px, 14.7, 124 + 1.8, px + 70, 14.7, 124 + 1.8, 0.09, dark, "PowerWire");
      }
    }

    // Fire Hydrants & Pad Distribution Transformers (no overlapping faces!)
    [[-168, 232], [164, 210], [-42, 578], [-64, 118]].forEach(([hx, hz]) => {
      site.cyl(g, 0.24, 1.05, hx, 0.525, hz, m("red"), 8, "Hydrant");
      site.cyl(g, 0.28, 0.22, hx, 1.16, hz, white, 8, "HydrantCap");
    });
    [[98, 224], [-134, 178]].forEach(([tx, tz]) => {
      site.box(g, 3.2, 0.14, 2.4, tx, 0.07, tz, concrete, "TransPad");
      site.box(g, 2.6, 2.0, 1.8, tx, 1.14, tz, m("foliage"), "PadTransformer");
    });
  });
})(window);
