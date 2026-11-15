/**
 * Space Center 2 — NASA Crawler-Transporter (CT-2) on the LC-39A Crawlerway.
 *
 * Eliminates the 99 coplanar deck-girder intersections and bogie/track-belt
 * Z-fighting while adding realistic hydraulic jacks, diesel genset stacks,
 * glazed driver cab, deck safety railings, and pickup piers.
 */
(function (window) {
  "use strict";

  const NS = window.SpaceCenterModules;

  NS.register("crawler", function buildCrawler(site) {
    const g = new window.THREE.Group();
    g.name = "SC2_Crawler";
    site.group.add(g);

    const C = NS.constants;
    const m = (k) => site.mat(k);
    const steel = m("steel_grey");
    const dark = m("black");
    const white = m("steel_white");
    const yellow = m("yellow");
    const orange = m("orange");
    const glass = m("glass");

    const cx = C.CRAWLER.x; // 0
    const cz = C.CRAWLER.z; // 500
    const bedTop = 0.14;

    // Four twin-track bogie assemblies aligned cleanly on x = +/-14 crawlerway lanes
    for (const bx of [-14, 14]) {
      for (const bz of [-16, 16]) {
        const px = cx + bx;
        const pz = cz + bz;

        // Equalizer support housing & hydraulic JEL jacking column
        site.box(g, 8.2, 1.1, 6.2, px, 2.75, pz, steel, "BogieEqualizer");
        site.cyl(g, 1.15, 3.6, px, 4.9, pz, white, 14, "HydraulicJack");
        site.cyl(g, 1.32, 0.7, px, 6.1, pz, yellow, 14, "JackCollar");

        // Twin parallel tracked shoes per corner (inner & outer tracks seated cleanly on bedTop)
        for (const ox of [-2.4, 2.4]) {
          const tx = px + ox;
          // Continuous dark steel track loop
          site.box(g, 2.1, 1.95, 11.6, tx, bedTop + 0.975, pz, dark, "CrawlerTrack");
          // Individual grouser ribs proudly on top/bottom without overlapping roller side hubs
          for (let rz = -4.8; rz <= 4.8; rz += 1.6) {
            site.box(g, 2.22, 0.14, 0.55, tx, bedTop + 2.02, pz + rz, steel, "TrackGrouser");
          }
          // Drive sprocket & idler wheels projecting cleanly outside track frame
          for (const rz of [-5.2, 0, 5.2]) {
            const sprocket = site.cyl(g, 0.88, 2.38, tx, bedTop + 0.98, pz + rz, steel, 12, "DriveSprocket");
            sprocket.rotation.z = Math.PI / 2;
            const hub = site.cyl(g, 0.42, 2.52, tx, bedTop + 0.98, pz + rz, orange, 10, "SprocketHub");
            hub.rotation.z = Math.PI / 2;
          }
          // Side track roller beam proud of track shoe face
          site.box(g, 2.36, 0.42, 9.8, tx, bedTop + 0.98, pz, m("rust"), "RollerBeam");
        }
      }
    }

    // Staggered main frame girders: longitudinal Z beams BELOW transverse X crossbeams (ZERO overlap!)
    for (let x = -18; x <= 18; x += 4.5) {
      site.box(g, 0.56, 0.52, 41, cx + x, 6.52, cz, steel, "DeckGirderZ");
    }
    for (let z = -20; z <= 20; z += 5.0) {
      site.box(g, 36.8, 0.48, 0.56, cx, 7.02, cz + z, white, "DeckGirderX");
    }

    // Main Chassis Upper Hull Deck [y = 7.26..7.86]
    site.box(g, 37.2, 0.6, 41.6, cx, 7.56, cz, steel, "CrawlerMainDeck");
    site.box(g, 37.4, 0.24, 41.8, cx, 7.98, cz, yellow, "DeckSafetyFascia");

    // Four MLP Pickup Pedestal Arms on Upper Deck corners [y = 8.1..9.6]
    for (const px of [-14, 14]) {
      for (const pz of [-13, 13]) {
        site.box(g, 3.6, 1.5, 3.6, cx + px, 8.85, cz + pz, white, "PickupPedestal");
        site.box(g, 3.8, 0.28, 3.8, cx + px, 9.74, cz + pz, orange, "PickupPad");
      }
    }

    // Twin Central Diesel-Electric Generator Houses with louvered bays & exhaust stacks
    for (const gx of [-6.5, 6.5]) {
      site.box(g, 7.8, 3.4, 17, cx + gx, 9.8, cz + 1.5, white, "CrawlerGenset");
      site.box(g, 8.0, 1.4, 14, cx + gx, 9.8, cz + 1.5, dark, "GensetLouvers");
      site.cyl(g, 0.42, 2.2, cx + gx, 12.6, cz - 2.5, steel, 10, "ExhaustStack");
      site.cyl(g, 0.42, 2.2, cx + gx, 12.6, cz + 4.5, steel, 10, "ExhaustStack");
    }

    // Forward & Aft Glass Operator Cabs (proud windows -> ZERO Z-fighting)
    for (const dir of [-1, 1]) {
      const cabZ = cz + dir * 21.8;
      site.box(g, 7.2, 2.9, 4.4, cx - 10, 6.2, cabZ, white, "CrawlerCabShell");
      site.box(g, 6.4, 1.3, 0.16, cx - 10, 6.5, cabZ + dir * 2.28, glass, "CabWindshield");
      site.box(g, 7.4, 0.35, 4.6, cx - 10, 7.8, cabZ, yellow, "CabRoofVisor");
      site.sphere(g, 0.26, cx - 10, 8.18, cabZ, orange, 8, "CabStrobe");
    }

    // Perimeter upper deck catwalk safety railings
    site.railing(g, cx - 18.2, cz - 20.4, cx + 18.2, cz - 20.4, 8.1, yellow);
    site.railing(g, cx - 18.2, cz + 20.4, cx + 18.2, cz + 20.4, 8.1, yellow);
    site.railing(g, cx - 18.2, cz - 20.4, cx - 18.2, cz + 20.4, 8.1, yellow);
    site.railing(g, cx + 18.2, cz - 20.4, cx + 18.2, cz + 20.4, 8.1, yellow);

    // Side Nameplate Banner ("NASA · CT-2")
    site.canvasPlane(
      g,
      14,
      2.2,
      cx + 18.75,
      7.6,
      cz,
      0,
      Math.PI / 2,
      0,
      (ctx, w, h) => {
        ctx.fillStyle = "#0b3d91";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#efeee7";
        ctx.font = "900 72px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("NASA · CRAWLER CT-2", w * 0.5, h * 0.52);
      },
      512,
      128,
      { name: "CrawlerNameplate" }
    );

    site.addBoxCollider(cx, cz, 38, 44, "Crawler transporter");
  });
})(window);
