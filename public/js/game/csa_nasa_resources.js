/**
 * ============================================================================
 * LUNASPIS // SPACE ACTIVITIES, MINI-GAMES & MISSION GUIDES (JARGON-FREE)
 * ============================================================================
 * Turns the 9 NASA & Canadian Space Agency (CSA) educational resources into
 * plain-language, jargon-free interactive activities for everyone:
 *
 * 1. How Space Missions Work (Rocket, Spacecraft, Ground Dishes, Scientists)
 * 2. Flight Plan & Orbit Simulator — Downloadable flight plan & 3D orbit view
 * 3. Step-by-Step Mission Readiness (From First Idea to Ready-to-Fly)
 * 4. Mission Design Workshop — Compare designs & check all 11 parts of your craft
 * 5. 3D Orbit Viewer [U] — Watch your spacecraft travel around Earth and the Moon
 * 6. Build-Your-Own Space Telescope Game — 3 levels of fun challenges
 * 7. Shoebox Satellite (CubeSat) Guide — 5 simple steps students use to build satellites
 * 8. Virtual Reality (VR) View — Step inside the mission in 3D stereo VR
 * 9. Canadian Space Agency (CSA) Games & Activities (asc-csa.gc.ca):
 *    - Earth Radar Game: Help Ship Captains, Flood Rescuers & Farmers
 *    - Asteroid Landing Game: Pick a Safe Spot to Scoop Up Space Rocks
 */

(function (window) {
  "use strict";

  const OFFICIAL_RESOURCES = [
    {
      id: "nasa_science_missions",
      agency: "NASA GUIDE",
      badge: "HOW MISSIONS WORK",
      title: "Designing a Space Mission (4 Simple Parts)",
      url: "https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf?emrc=a454cf",
      summary: "Every space mission has 4 main parts working together: 1) The Rocket that lifts it into space, 2) The Spacecraft & Cameras in orbit, 3) The Ground Dishes on Earth that listen for signals, and 4) The People & Scientists who use the discoveries.",
      inSimFeature: "Every screen shows green/red checkmarks for Rocket, Spacecraft, Ground Dishes, and Science so you always know what needs fixing.",
      actionLabel: "CHOOSE A MISSION GOAL",
      actionType: "console_arch"
    },
    {
      id: "nasa_gmat",
      agency: "NASA ORBITS",
      badge: "FLIGHT PATH TOOL",
      title: "Spacecraft Orbit & Flight Path Planner (GMAT)",
      url: "https://software.nasa.gov/software/GSC-19468-1",
      summary: "NASA's tool for mapping out how a spacecraft travels from Earth to the Moon, asteroids, or deep space, and how much fuel it needs for the trip.",
      inSimFeature: "Automatically writes a real NASA flight-path file based on your spacecraft choices that you can view or download.",
      actionLabel: "VIEW FLIGHT PLAN & CHECKLIST",
      actionType: "tab_gmat"
    },
    {
      id: "nasa_cmls",
      agency: "NASA JPL",
      badge: "STEP-BY-STEP PROGRESS",
      title: "Mission Readiness Steps (Stages 1 to 4)",
      url: "https://dataverse.jpl.nasa.gov/dataset.xhtml?persistentId=hdl:2014/44299",
      summary: "Instead of building a spacecraft all at once, teams go step by step: Stage 1 is a rough idea, Stage 2 checks if it's possible, Stage 3 compares options, and Stage 4 is a complete, ready-to-build design.",
      inSimFeature: "Your Mission Stage automatically levels up from Stage 1 to Stage 4 as you balance your budget, weight, power, and fuel.",
      actionLabel: "CHECK MISSION STAGES",
      actionType: "tab_gmat"
    },
    {
      id: "nasa_mdl",
      agency: "NASA WORKSHOP",
      badge: "TEAM DESIGN LAB",
      title: "Mission Design Workshop (Balancing Trade-Offs)",
      url: "https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab/",
      summary: "A teamwork room where specialists in power, fuel, heat protection, radios, and budget sit together to test 'What if?' choices and build a balanced spacecraft.",
      inSimFeature: "Save any design as 'Design A' to compare costs and weight side-by-side, and preview your spacecraft in 3D.",
      actionLabel: "OPEN QUICK DESIGN DESK",
      actionType: "open_mdl"
    },
    {
      id: "nasa_mission_viz",
      agency: "NASA 3D VIEW",
      badge: "INTERACTIVE 3D MAP",
      title: "3D Space Mission Viewer",
      url: "https://nasa.github.io/mission-viz/",
      summary: "A 3D view of space where you can spin the camera around Earth and the Moon, watch your spacecraft travel along its path, and see when it passes into Earth's shadow or talks to ground stations.",
      inSimFeature: "Press [U] anytime to watch your spacecraft fly along its 3D path and scrub through the mission timeline.",
      actionLabel: "OPEN 3D ORBIT VIEW [U]",
      actionType: "open_viz"
    },
    {
      id: "nasa_telescope_game",
      agency: "NASA WEBB GAME",
      badge: "BUILD A TELESCOPE",
      title: "Build-It-Yourself Space Telescope Game",
      url: "https://science.nasa.gov/mission/webb/game-build-it-yourself/",
      summary: "A fun game where you pick what you want to see in space (like distant galaxies or alien planets), then choose the right light sensor, mirror size, and cooling shield.",
      inSimFeature: "Play 3 difficulty levels in the Telescope Builder tab and see which real space telescope matches your creation.",
      actionLabel: "PLAY TELESCOPE BUILDER",
      actionType: "tab_telescope"
    },
    {
      id: "nasa_cubesat_101",
      agency: "STUDENT SATELLITES",
      badge: "SHOEBOX SATELLITES",
      title: "CubeSat 101 — How Students Build Mini Satellites",
      url: "https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf",
      summary: "A beginner's guide showing how schools and universities build tiny 'shoebox-sized' satellites that hitch a ride on rockets or get launched right out of the Space Station.",
      inSimFeature: "Pick a Small, Medium, or Large mini-satellite box and check off the 5 simple steps from idea to launch.",
      actionLabel: "OPEN MINI-SATELLITE GUIDE",
      actionType: "tab_gmat"
    },
    {
      id: "nasa_vr_challenge",
      agency: "VIRTUAL REALITY",
      badge: "3D VR MODE",
      title: "Explore a Space Mission in Virtual Reality (VR)",
      url: "https://www.spaceappschallenge.org/2023/challenges/visualize-a-space-mission-using-virtual-reality/",
      summary: "Makes space missions easy to picture by letting you step right inside the 3D scene using a VR headset or split-screen phone view.",
      inSimFeature: "Click the VR button anytime to switch into 3D side-by-side stereo view or a VR headset.",
      actionLabel: "TRY 3D VR VIEW",
      actionType: "open_vr"
    },
    {
      id: "csa_digital_games",
      agency: "CANADA IN SPACE",
      badge: "GAMES & ACTIVITIES",
      title: "Canadian Space Agency (CSA) Games & Activities",
      url: "https://www.asc-csa.gc.ca/eng/youth-educators/digital-games-and-activities.asp",
      summary: "Fun, hands-on games for all ages showing how satellites help people on Earth and how lasers map asteroids.",
      inSimFeature: "Play 2 mini-games right here: Earth Radar Helper and Asteroid Landing Spot Picker.",
      actionLabel: "PLAY SPACE MINI-GAMES",
      actionType: "tab_csa"
    }
  ];

  const RCM_SECTORS = {
    maritime_arctic: {
      id: "maritime_arctic",
      role: "1. HELP SHIP CAPTAINS IN THE ICY ARCTIC",
      beamMode: "Wide Ocean & Ice Scanner (Covers 500 km at once)",
      recommendedBeam: "scansar_500",
      targetDesc: "Icebreakers and supply ships need to see thick floating sea ice and safe open-water paths—even in the dark winter or through thick clouds.",
      sarSignature: "What the satellite sees: Thick ice glows bright on the screen, while safe open water looks like a dark blue highway for ships.",
      scienceBonus: 8
    },
    flood_emergency: {
      id: "flood_emergency",
      role: "2. HELP RESCUE TEAMS DURING A FLOOD",
      beamMode: "Close-Up Flood Zoom (Sharp 3-meter detail)",
      recommendedBeam: "spotlight_3m",
      targetDesc: "When heavy rain floods towns and roads, rescue boats need a sharp, close-up map showing exactly which streets and homes are underwater.",
      sarSignature: "What the satellite sees: Flooded areas show up clearly through storm clouds so emergency teams know where to send help first.",
      scienceBonus: 9
    },
    precision_farming: {
      id: "precision_farming",
      role: "3. HELP FARMERS GROW HEALTHY CROPS",
      beamMode: "Soil Moisture & Crop Scanner (Medium 30-meter view)",
      recommendedBeam: "polarimetric_30m",
      targetDesc: "Farmers across the prairies need to know which fields are too dry and which crops are growing well so they can water wisely.",
      sarSignature: "What the satellite sees: Damp, healthy soil reflects a stronger signal than dry soil, creating a colorful moisture map for every farm field.",
      scienceBonus: 7
    }
  };

  const BENNU_CANDIDATE_SITES = {
    nightingale: {
      id: "nightingale",
      name: "Nightingale Crater (Best Choice ★)",
      craterDiamM: 16,
      safeZoneRadiusM: 8.0,
      slopeDeg: 4.2,
      boulderHazard: "SAFE IF CAREFUL: A large rock sits on the eastern edge, but the center floor is flat (only 4.2° tilt).",
      hydrationPct: 94,
      carbonScore: 96,
      tagSafe: true,
      recommended: true,
      summary: "BEST SPOT TO LAND: Fresh, dark soil packed with ancient water-rich clay and building blocks of life, with a flat 4.2° floor."
    },
    osprey: {
      id: "osprey",
      name: "Osprey Crater (Good Backup)",
      craterDiamM: 20,
      safeZoneRadiusM: 10.5,
      slopeDeg: 6.1,
      boulderHazard: "SAFE: Wide 10.5-meter flat landing circle, though the pebbles are a bit chunkier to vacuum up.",
      hydrationPct: 82,
      carbonScore: 88,
      tagSafe: true,
      recommended: false,
      summary: "GOOD BACKUP SPOT: Plenty of room to touch down safely (6.1° tilt) and good carbon-rich rocks, but slightly less water-rich dust."
    },
    kingfisher: {
      id: "kingfisher",
      name: "Kingfisher Crater (Too Steep!)",
      craterDiamM: 8,
      safeZoneRadiusM: 3.5,
      slopeDeg: 14.5,
      boulderHazard: "DANGER — TOO STEEP: The 14.5° tilted ground and giant nearby boulders could tip the spacecraft over!",
      hydrationPct: 89,
      carbonScore: 85,
      tagSafe: false,
      recommended: false,
      summary: "UNSAFE TO LAND: Even though the rocks are scientifically exciting, the 3D laser scan shows the ground tilts at 14.5° (safe limit is 10°)."
    },
    sandpiper: {
      id: "sandpiper",
      name: "Sandpiper Crater (Very Flat, Less Dust)",
      craterDiamM: 63,
      safeZoneRadiusM: 22.0,
      slopeDeg: 3.8,
      boulderHazard: "VERY SAFE: Huge, flat 22-meter landing area with almost no tilt (3.8°).",
      hydrationPct: 64,
      carbonScore: 68,
      tagSafe: true,
      recommended: false,
      summary: "EASY LANDING, LESS SCIENCE: Super flat and safe, but has fewer of the fine, ancient water-rich dust grains scientists want most."
    }
  };

  const TELESCOPE_LEVELS = {
    1: {
      level: 1,
      name: "Level 1 · Starter Telescope (1 Goal)",
      goalCount: 1,
      desc: "Pick 1 thing to study (like bright stars) and match it with a simple camera and mirror.",
      heritage: "Matches: NASA GALEX & Canada's MOST / NEOSSat Mini-Telescopes"
    },
    2: {
      level: 2,
      name: "Level 2 · Advanced Space Telescope (2 Goals)",
      goalCount: 2,
      desc: "Study both stars and planets using a larger mirror, cooling radiators, and Canada's ultra-steady Fine Guidance camera.",
      heritage: "Matches: NASA Hubble & Nancy Grace Roman Space Telescopes"
    },
    3: {
      level: 3,
      name: "Level 3 · Giant Deep-Space Telescope (All Goals)",
      goalCount: 3,
      desc: "See the very first galaxies and alien planet air! Uses a giant folding gold mirror, deep-freeze cooling, and a sun umbrella 1.5 million km from Earth.",
      heritage: "Matches: NASA / ESA / CSA James Webb Space Telescope (JWST)"
    }
  };

  const OPTICAL_SYSTEMS = {
    monolithic_1_2m: {
      id: "monolithic_1_2m",
      name: "Small 1.2-Meter Single Mirror",
      apertureM: 1.2,
      supportedBands: ["uv_optical", "near_ir"],
      minBus: "smallsat_12u",
      explain: "Lightweight and fits inside a small spacecraft. Great for taking wide pictures of visible starlight."
    },
    monolithic_2_4m: {
      id: "monolithic_2_4m",
      name: "Medium 2.4-Meter Hubble-Size Glass Mirror",
      apertureM: 2.4,
      supportedBands: ["uv_optical", "near_ir"],
      minBus: "modular_hex",
      explain: "Sharp, classic space mirror for visible and near-infrared light. Needs a medium or large spacecraft body."
    },
    segmented_6_5m_hex: {
      id: "segmented_6_5m_hex",
      name: "Giant 6.5-Meter Folding Gold Mirror (Webb Style)",
      apertureM: 6.5,
      supportedBands: ["near_ir", "mid_ir"],
      minBus: "modular_hex",
      explain: "18 gold-coated hexagon mirrors that fold up like origami to fit in the rocket, plus Canada's steady-aim sensor."
    },
    grazing_xray_shells: {
      id: "grazing_xray_shells",
      name: "Special Nested X-Ray Mirrors (For Black Holes)",
      apertureM: 1.2,
      supportedBands: ["xray"],
      minBus: "modular_hex",
      explain: "X-rays pass right through normal mirrors! These angled metal cylinders gently bounce X-rays into the camera."
    }
  };

  const CUBESAT_101_PHASES = [
    {
      id: "cs_conops",
      phase: "STEP 1 · PICK YOUR IDEA & BOX SIZE",
      detail: "Decide what your student satellite will measure and choose a Small (shoebox), Medium (cereal box), or Large (briefcase) size."
    },
    {
      id: "cs_licensing",
      phase: "STEP 2 · RADIO PERMISSION & CLEANUP PLAN",
      detail: "Get permission for your radio channel and make sure your satellite will safely burn up in the upper air within 5 years so it doesn't leave space junk."
    },
    {
      id: "cs_testing",
      phase: "STEP 3 · SHAKE & FREEZE TESTS",
      detail: "Test your satellite on a shake table (to mimic a noisy rocket launch) and in a freezer/oven chamber (to mimic space)."
    },
    {
      id: "cs_launch",
      phase: "STEP 4 · PACK & LAUNCH FROM THE SPACE STATION",
      detail: "Slide your satellite into a spring-loaded launcher box and release it gently from the Space Station using the Canadarm2 robot arm."
    },
    {
      id: "cs_ops",
      phase: "STEP 5 · UNFOLD SOLAR PANELS & LISTEN FOR BEEPS",
      detail: "Wait 30 minutes after launch, pop open the solar panels and antenna, and listen for the first 'Hello from space!' radio signal."
    }
  ];

  const MDL_STUDY_STAGES = [
    {
      id: "office_hours",
      name: "Stage 1 · Brainstorming",
      cml: "STAGE 1",
      focus: "Talk through what you want to discover in space and spot the biggest challenges early."
    },
    {
      id: "concept_dev",
      name: "Stage 2 · Basic Reality Check",
      cml: "STAGE 2",
      focus: "Pick a path in space and a rocket size to make sure the idea is physically possible."
    },
    {
      id: "trade_studies",
      name: "Stage 3 · Compare Options",
      cml: "STAGE 3",
      focus: "Test different combinations of solar panels, batteries, cameras, and thrusters to find the best value."
    },
    {
      id: "point_design",
      name: "Stage 4 · Ready-to-Fly Blueprint",
      cml: "STAGE 4",
      focus: "All parts fit within the budget, weight limit, power supply, and fuel tank—ready to launch!"
    }
  ];

  class CsaNasaResourceLab {
    constructor() {
      this.state = {
        activeTab: "csa",
        mdlStageId: "point_design",
        rcmSectorId: "maritime_arctic",
        rcmBeamId: "scansar_500",
        rcmVerifiedSectors: { maritime_arctic: true, flood_emergency: false, precision_farming: false },
        bennuSiteId: "nightingale",
        olaScanResolutionCm: 2,
        telescopeLevel: 3,
        opticalSystemId: "segmented_6_5m_hex",
        csaFgsNirissEnabled: true,
        cubesatPhasesDone: {
          cs_conops: true,
          cs_licensing: true,
          cs_testing: true,
          cs_launch: true,
          cs_ops: true
        }
      };
      this.modalEl = null;
    }

    init() {
      this._bindButtons();
      this.syncGroundLockState();
    }

    _bindButtons() {
      const bind = (id, tab) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.csaBound) {
          el.dataset.csaBound = "1";
          el.addEventListener("click", () => this.openModal(tab || "csa"));
        }
      };
      bind("btn-open-nasa-csa-menu", "csa");
      bind("btn-hud-nasa-csa", "csa");
    }

    _isGroundCrewMember() {
      const sc = window.spaceCenter;
      if (sc && typeof sc._isLocalGroundCrew === "function" && sc._isLocalGroundCrew()) {
        return true;
      }
      const nm = window.netManager;
      if (!nm) return false;
      const local = nm.localPlayer || null;
      const roomPlayers = nm.roomState && nm.roomState.players ? nm.roomState.players : null;
      const playerEntry = local || (roomPlayers && nm.localPlayerId ? roomPlayers[nm.localPlayerId] : null);
      if (!playerEntry) return false;
      if (playerEntry.team === "ground") return true;
      const roleId = playerEntry.role;
      if (window.InterfellasRoles && typeof window.InterfellasRoles.isGroundRole === "function") {
        return !!window.InterfellasRoles.isGroundRole(roleId);
      }
      return roleId === "flight_director" || roleId === "ground_capcom";
    }

    isGroundLocked() {
      const body = document.body;
      if (!body || !body.classList.contains("game-active")) {
        return false;
      }
      if (this._isGroundCrewMember()) {
        return true;
      }
      const inFlightMode =
        body.classList.contains("launch-active") ||
        body.classList.contains("docking-active") ||
        body.classList.contains("interior-active");
      if (inFlightMode) {
        return false;
      }
      const sc = window.spaceCenter;
      const nm = window.netManager;
      const mission =
        (nm && typeof nm.getMission === "function" && nm.getMission()) ||
        (nm && nm.roomState && nm.roomState.mission) ||
        null;
      return Boolean(
        body.classList.contains("ground-mode-active") ||
        (sc && (sc.isGroundMode || sc.siteTourActive)) ||
        (mission && mission.phase === "gantry")
      );
    }

    getGroundLockReason() {
      if (this._isGroundCrewMember()) {
        return "Space Games & Tools are orbital-only and locked for Ground Control crew (Flight Director / Ground CAPCOM).";
      }
      return "Space Games & Tools are locked on the ground. Launch into orbit to unlock them!";
    }

    syncGroundLockState() {
      const locked = this.isGroundLocked();
      if (document.body) {
        document.body.classList.toggle("space-games-ground-locked", locked);
      }
      const hudBtn = document.getElementById("btn-hud-nasa-csa");
      if (hudBtn) {
        hudBtn.setAttribute("aria-hidden", locked ? "true" : "false");
        hudBtn.disabled = locked;
      }
      if (locked && this.modalEl && this.modalEl.style.display !== "none") {
        this.closeModal(true);
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast(this.getGroundLockReason());
        }
      }
      return locked;
    }

    getState() {
      return this.state;
    }

    getMdlDisciplinesTable(t) {
      if (!t) return [];
      return [
        { discipline: "1. Spacecraft Body", Choice: t.bus.name, metric: `${t.dryMassKg} kg empty · Holds ${t.maxInstruments} tools`, status: t.massOk ? "GOOD" : "TOO HEAVY" },
        { discipline: "2. Solar Power & Battery", Choice: `${t.pwr.name} + ${t.bat.name}`, metric: `${t.daylightGenW} W made · ${t.batteryDodPct}% battery used`, status: t.powerOk ? "GOOD" : "LOW POWER" },
        { discipline: "3. Engines & Fuel", Choice: t.prop.name, metric: `Push: ${t.achievedDeltaV} / ${t.requiredDeltaV} needed`, status: t.deltaVOk ? "GOOD" : "NEEDS FUEL" },
        { discipline: "4. Heat Control", Choice: t.thm.name, metric: `Cools up to ${t.thm.thermalCapW} W of heat`, status: t.thermalOk && t.telescopeOk ? "GOOD" : "TOO HOT" },
        { discipline: "5. Radiation Shield", Choice: `${t.thm.radRatingKrad}-level protective case`, metric: `Space weather level: ${t.orbit.radiationEnvKrad}`, status: t.radiationOk ? "GOOD" : "WEAK SHIELD" },
        { discipline: "6. Aiming & Steering", Choice: t.scenario.requiresWavelength && this.state.csaFgsNirissEnabled ? "Spinning Wheels + Canada Steady-Aim Sensor" : "Spinning Balance Wheels + Star Camera", metric: t.scenario.requiresWavelength ? "Ultra-steady lock" : "Points smoothly", status: "GOOD" },
        { discipline: "7. Spacecraft Radio", Choice: t.com.name, metric: `Speed: ${t.com.rateMbps} Mbps · Signal: +${t.linkMarginDb}`, status: t.commsOk ? "GOOD" : "WEAK SIGNAL" },
        { discipline: "8. Earth Dish Network", Choice: t.gnd.name, metric: `Receives ${t.downlinkCapGbPerDay} GB/day (Need ${t.dataGeneratedGbPerDay})`, status: t.commsOk ? "GOOD" : "TOO SLOW" },
        { discipline: "9. Onboard Computer", Choice: "Auto-Safety & Backup Brain", metric: `Runs ${t.selectedInsts.length} science tools`, status: "GOOD" },
        { discipline: "10. Lifespan & Space Cleanup", Choice: t.disposal.name, metric: `Lasts ${t.estimatedLifetimeMonths} months · Cleaned up in ${t.disposal.deorbitYears} yr`, status: t.disposalOk && t.lifetimeOk ? "GOOD" : "CHECK PLAN" },
        { discipline: "11. Total Cost & Budget", Choice: `${t.lv.name.split("(")[0].trim()} + Spacecraft`, metric: `$${t.totalCostM}M spent / $${t.budgetCapM}M limit`, status: t.budgetOk ? "GOOD" : "OVER BUDGET" }
      ];
    }

    generateGmatScript(telemetry) {
      const gp = window.gameplay;
      const t = telemetry || (gp && typeof gp.evaluateMissionDesign === "function" ? gp.evaluateMissionDesign() : null);
      if (!t) return "% Flight plan unavailable";

      const earthRadiusKm = 6378.137;
      let smaKm = earthRadiusKm + t.orbit.altitudeKm;
      let ecc = 0.0012;
      let incDeg = t.orbit.inclinationDeg;
      let raanDeg = t.orbit.id === "sso_705" ? 102.5 : 45.0;
      let aopDeg = 0.0;
      let coordSys = "EarthMJ2000Eq";

      if (t.orbit.id === "gto_heo") {
        const rp = earthRadiusKm + 500;
        const ra = earthRadiusKm + 35786;
        smaKm = (rp + ra) * 0.5;
        ecc = Number(((ra - rp) / (ra + rp)).toFixed(5));
      } else if (t.orbit.id === "lunar_polar_100") {
        smaKm = 1737.4 + 100;
        ecc = 0.004;
        incDeg = 90.0;
        coordSys = "LunaFixed";
      } else if (t.orbit.id === "sun_earth_l2") {
        smaKm = earthRadiusKm + 1500000;
        ecc = 0.28;
        incDeg = 28.5;
      }

      const fuelMass = Math.max(1, Number((t.wetMassKg - t.dryMassKg).toFixed(1)));
      const propDurationSec = Math.round(t.orbit.periodMin * 60 * 2);

      return [
        "% =============================================================================",
        `% NASA FLIGHT PATH & ORBIT PLAN (GMAT SCRIPT)`,
        `% Created by:   LUNASPIS Space Mission Simulator`,
        `% Mission Goal: ${t.scenario.name}`,
        `% Real Match:   ${t.analogue.missions}`,
        `% Created On:   ${new Date().toISOString()}`,
        "% =============================================================================",
        "",
        "% 1. Define Your Spacecraft & Weight",
        "Create Spacecraft LunaspisSC;",
        "GMAT LunaspisSC.DateFormat = UTCGregorian;",
        "GMAT LunaspisSC.Epoch = '14 Nov 2026 12:00:00.000';",
        `GMAT LunaspisSC.CoordinateSystem = ${coordSys};`,
        "GMAT LunaspisSC.DisplayStateType = Keplerian;",
        `GMAT LunaspisSC.SMA = ${smaKm.toFixed(3)};`,
        `GMAT LunaspisSC.ECC = ${ecc};`,
        `GMAT LunaspisSC.INC = ${incDeg.toFixed(2)};`,
        `GMAT LunaspisSC.RAAN = ${raanDeg.toFixed(2)};`,
        `GMAT LunaspisSC.AOP = ${aopDeg.toFixed(2)};`,
        "GMAT LunaspisSC.TA = 0.0;",
        `GMAT LunaspisSC.DryMass = ${t.dryMassKg};`,
        "",
        "% 2. Define Your Fuel Tank",
        "Create ChemicalTank MainPropTank;",
        "GMAT MainPropTank.AllowNegativeFuelMass = false;",
        `GMAT MainPropTank.FuelMass = ${fuelMass};`,
        "GMAT LunaspisSC.Tanks = {MainPropTank};",
        "",
        "% 3. Set Up Gravity (Earth, Moon & Sun)",
        "Create ForceModel MissionForceModel;",
        "GMAT MissionForceModel.CentralBody = Earth;",
        "GMAT MissionForceModel.PrimaryBodies = {Earth};",
        "GMAT MissionForceModel.PointMasses = {Luna, Sun};",
        "GMAT MissionForceModel.SRP = On;",
        "",
        "Create Propagator HighFidelityProp;",
        "GMAT HighFidelityProp.FM = MissionForceModel;",
        "GMAT HighFidelityProp.Type = RungeKutta89;",
        "GMAT HighFidelityProp.InitialStepSize = 30;",
        "",
        "% 4. Engine Boosts (Entering Orbit & Safe End-of-Trip Cleanup)",
        "Create ImpulsiveBurn OrbitInsertionBurn;",
        "GMAT OrbitInsertionBurn.CoordinateSystem = Local;",
        "GMAT OrbitInsertionBurn.Origin = Earth;",
        "GMAT OrbitInsertionBurn.Axes = VNB;",
        `GMAT OrbitInsertionBurn.Element1 = ${(t.orbit.reqInsertionDv / 1000).toFixed(4)};`,
        "GMAT OrbitInsertionBurn.DecrementMass = true;",
        "GMAT OrbitInsertionBurn.Tank = {MainPropTank};",
        `GMAT OrbitInsertionBurn.Isp = ${t.prop.ispSec};`,
        "",
        "Create ImpulsiveBurn EndOfMissionDisposalBurn;",
        "GMAT EndOfMissionDisposalBurn.CoordinateSystem = Local;",
        "GMAT EndOfMissionDisposalBurn.Axes = VNB;",
        `GMAT EndOfMissionDisposalBurn.Element1 = -${(t.disposal.dvCostMs / 1000).toFixed(4)};`,
        "GMAT EndOfMissionDisposalBurn.DecrementMass = true;",
        "GMAT EndOfMissionDisposalBurn.Tank = {MainPropTank};",
        `GMAT EndOfMissionDisposalBurn.Isp = ${t.prop.ispSec};`,
        "",
        "% 5. Run the Flight Step-by-Step",
        "BeginMissionSequence;",
        "Propagate '1. Launch & Coast to Orbit' HighFidelityProp(LunaspisSC) {LunaspisSC.ElapsedSecs = 1800};",
        "Maneuver '2. Fire Engine to Enter Orbit' OrbitInsertionBurn(LunaspisSC);",
        `Propagate '3. Collect Science Data (${t.selectedInsts.length} Tools)' HighFidelityProp(LunaspisSC) {LunaspisSC.ElapsedSecs = ${propDurationSec}};`,
        "Maneuver '4. Safe End-of-Mission Cleanup' EndOfMissionDisposalBurn(LunaspisSC);",
        ""
      ].join("\n");
    }

    exportGmatScript() {
      const gp = window.gameplay;
      const t = gp && typeof gp.evaluateMissionDesign === "function" ? gp.evaluateMissionDesign() : null;
      const scriptText = this.generateGmatScript(t);
      const code = t && t.scenario ? t.scenario.code.toLowerCase() : "mission";
      const blob = new Blob([scriptText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lunaspis_${code}_flight_plan.script`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (gp && typeof gp.showToast === "function") {
        gp.showToast("Downloaded Flight Path Plan (.script)");
      }
    }

    // Renders a plain-language, jargon-free interactive activity widget inside Console 4 (Science Tools)
    renderContextualConsoleWidget(scenarioId) {
      const st = this.state;
      if (this.isGroundLocked()) {
        return "";
      }
      if (scenarioId === "cubesat_101") {
        const doneCount = Object.values(st.cubesatPhasesDone).filter(Boolean).length;
        return `
          <div style="margin-bottom:14px;padding:14px 16px;border-radius:8px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.35);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
              <span style="font-family:monospace;font-size:11.5px;font-weight:700;color:#7dd3fc;letter-spacing:0.6px;">
                🛰️ STUDENT SHOEBOX SATELLITE 5-STEP CHECKLIST (${doneCount}/5)
              </span>
              <button type="button" class="btn-open-csa-lab-inline" data-tab="gmat" style="padding:5px 10px;border-radius:5px;border:1px solid rgba(103,232,249,0.45);background:rgba(103,232,249,0.14);color:#67e8f9;font-family:monospace;font-size:10.5px;font-weight:700;cursor:pointer;">
                VIEW FULL GUIDE
              </button>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${CUBESAT_101_PHASES.map((p) => {
                const on = !!st.cubesatPhasesDone[p.id];
                return `
                  <button type="button" class="cs101-phase-btn" data-id="${p.id}" title="${p.detail}" style="padding:6px 10px;border-radius:5px;border:1px solid ${on ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.16)"};background:${on ? "rgba(22,163,74,0.18)" : "rgba(0,0,0,0.35)"};color:${on ? "#86efac" : "#94a3b8"};font-family:monospace;font-size:10.5px;font-weight:700;cursor:pointer;">
                    ${on ? "☑" : "☐"} ${p.phase}
                  </button>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }

      return "";
    }

    bindContextualConsoleEvents(container, onRerender) {
      if (!container) return;
      const st = this.state;

      container.querySelectorAll(".btn-open-csa-lab-inline").forEach((btn) => {
        btn.addEventListener("click", () => this.openModal(btn.dataset.tab || "csa"));
      });
      container.querySelectorAll(".csa-rcm-sec-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          st.rcmSectorId = btn.dataset.id;
          if (typeof onRerender === "function") onRerender();
        });
      });
      container.querySelectorAll(".csa-rcm-beam-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          st.rcmBeamId = btn.dataset.id;
          const sec = RCM_SECTORS[st.rcmSectorId];
          if (sec && st.rcmBeamId === sec.recommendedBeam) {
            st.rcmVerifiedSectors[st.rcmSectorId] = true;
          }
          if (typeof onRerender === "function") onRerender();
        });
      });
      container.querySelectorAll(".csa-bennu-site-card").forEach((card) => {
        card.addEventListener("click", () => {
          st.bennuSiteId = card.dataset.id;
          if (typeof onRerender === "function") onRerender();
        });
      });
      container.querySelectorAll(".nasa-tel-lvl-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          st.telescopeLevel = Number(btn.dataset.lvl) || 3;
          if (typeof onRerender === "function") onRerender();
        });
      });
      container.querySelectorAll(".nasa-opt-sys-card").forEach((card) => {
        card.addEventListener("click", () => {
          st.opticalSystemId = card.dataset.id;
          if (typeof onRerender === "function") onRerender();
        });
      });
      container.querySelectorAll(".cs101-phase-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id;
          st.cubesatPhasesDone[id] = !st.cubesatPhasesDone[id];
          if (typeof onRerender === "function") onRerender();
        });
      });
    }

    openModal(initialTab = "csa") {
      this.syncGroundLockState();
      if (this.isGroundLocked()) {
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast(this.getGroundLockReason());
        }
        return false;
      }
      this.state.activeTab = initialTab || "csa";
      this._ensureModalDom();
      this.modalEl.style.display = "flex";
      if (window.spaceAudio) window.spaceAudio.playClick();
      this._renderModalContent();
      return true;
    }

    closeModal(silent = false) {
      if (this.modalEl) {
        this.modalEl.style.display = "none";
      }
      if (!silent && window.spaceAudio) window.spaceAudio.playClick();
    }

    _ensureModalDom() {
      if (this.modalEl) return;
      const overlay = document.createElement("div");
      overlay.id = "csa-nasa-lab-modal";
      overlay.style.cssText = `
        display:none;
        position:fixed;
        inset:0;
        z-index:260;
        background:rgba(3,6,14,0.82);
        backdrop-filter:blur(10px);
        align-items:center;
        justify-content:center;
        padding:18px;
      `;

      overlay.innerHTML = `
        <div style="width:min(1120px,96vw);max-height:92dvh;display:flex;flex-direction:column;border-radius:12px;background:#070c18;border:1px solid rgba(103,232,249,0.35);box-shadow:0 24px 64px rgba(0,0,0,0.75);color:#ece7dc;overflow:hidden;">
          <div style="padding:16px 22px;background:rgba(15,23,42,0.92);border-bottom:1px solid rgba(148,163,184,0.2);display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="width:9px;height:9px;border-radius:50%;background:#67e8f9;box-shadow:0 0 8px #67e8f9;flex-shrink:0;"></span>
              <div>
                <div style="font-family:var(--font-mono,monospace);font-size:14px;font-weight:800;letter-spacing:0.8px;color:#f8fafc;">
                  SPACE MINI-GAMES &amp; GUIDES
                </div>
                <div style="font-family:var(--font-mono,monospace);font-size:10px;color:#94a3b8;line-height:1.45;margin-top:3px;letter-spacing:0.55px;">
                  PLAY · BUILD · FLY
                </div>
              </div>
            </div>
            <button type="button" id="btn-close-csa-nasa-lab" style="padding:7px 14px;border-radius:6px;border:1px solid rgba(239,68,68,0.5);background:rgba(239,68,68,0.14);color:#fecaca;font-family:monospace;font-size:12px;font-weight:700;cursor:pointer;">
              CLOSE &times;
            </button>
          </div>
          <div id="csa-nasa-lab-tabs" style="padding:10px 22px;background:rgba(8,13,24,0.95);border-bottom:1px solid rgba(148,163,184,0.16);display:flex;gap:8px;flex-wrap:wrap;"></div>
          <div id="csa-nasa-lab-body" style="padding:18px 22px;overflow-y:auto;flex:1;line-height:1.5;"></div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.modalEl = overlay;

      overlay.querySelector("#btn-close-csa-nasa-lab").addEventListener("click", () => this.closeModal());
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeModal();
      });
    }

    _renderModalContent() {
      if (!this.modalEl) return;
      const tabsBar = this.modalEl.querySelector("#csa-nasa-lab-tabs");
      const body = this.modalEl.querySelector("#csa-nasa-lab-body");
      if (!tabsBar || !body) return;

      const tabs = [
        { id: "csa", label: "1. 🎮 MINI-GAMES" },
        { id: "telescope", label: "2. 🔭 TELESCOPE" },
        { id: "gmat", label: "3. 🛰️ FLIGHT PLAN" },
        { id: "resources", label: "4. 📚 GUIDES" }
      ];

      tabsBar.innerHTML = tabs.map((tab) => {
        const active = this.state.activeTab === tab.id;
        return `
          <button type="button" class="csa-lab-tab-btn" data-tab="${tab.id}" style="padding:9px 14px;border-radius:6px;border:1px solid ${active ? "#67e8f9" : "rgba(148,163,184,0.22)"};background:${active ? "rgba(103,232,249,0.16)" : "rgba(255,255,255,0.03)"};color:${active ? "#f8fafc" : "#94a3b8"};font-family:var(--font-mono,monospace);font-size:11.5px;font-weight:700;cursor:pointer;">
            ${tab.label}
          </button>
        `;
      }).join("");

      tabsBar.querySelectorAll(".csa-lab-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.state.activeTab = btn.dataset.tab;
          if (window.spaceAudio) window.spaceAudio.playClick();
          this._renderModalContent();
        });
      });

      const gp = window.gameplay;
      const t = gp && typeof gp.evaluateMissionDesign === "function" ? gp.evaluateMissionDesign() : null;

      if (this.state.activeTab === "csa") {
        this._renderCsaActivitiesTab(body, t);
      } else if (this.state.activeTab === "telescope") {
        this._renderTelescopeTab(body, t);
      } else if (this.state.activeTab === "gmat") {
        this._renderGmatMdlCubesatTab(body, t);
      } else {
        this._renderOfficialResourcesTab(body, t);
      }
    }

    _renderCsaActivitiesTab(body, t) {
      const st = this.state;
      const sec = RCM_SECTORS[st.rcmSectorId] || RCM_SECTORS.maritime_arctic;
      const beamMatch = st.rcmBeamId === sec.recommendedBeam;
      const site = BENNU_CANDIDATE_SITES[st.bennuSiteId] || BENNU_CANDIDATE_SITES.nightingale;
      const rcmSteps = [
        { label: "1 PICK WHO", state: "is-done" },
        { label: "2 PICK ZOOM", state: beamMatch ? "is-done" : "is-active" },
        { label: "3 MATCH", state: beamMatch ? "is-done" : "" }
      ];
      const bennuSteps = [
        { label: "1 PICK CRATER", state: "is-done" },
        { label: "2 CHECK TILT", state: site.tagSafe ? "is-done" : "is-active" },
        { label: "3 LAND", state: site.recommended ? "is-done" : site.tagSafe ? "is-active" : "" }
      ];
      const bennuGoal = site.recommended ? "BEST SITE FOUND" : site.tagSafe ? "SAFE TO LAND" : "TOO STEEP";

      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;">
          <!-- CARD 1: EARTH RADAR SATELLITE GAME -->
          <div style="padding:16px 18px;border-radius:10px;background:rgba(15,23,42,0.75);border:1px solid rgba(52,211,153,0.35);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
              <span style="font-family:monospace;font-size:12px;font-weight:700;color:#6ee7b7;">
                🇨🇦 GAME 1 · EARTH RADAR
              </span>
              <span style="font-family:monospace;font-size:10.5px;padding:3px 8px;border-radius:4px;background:rgba(52,211,153,0.16);color:#6ee7b7;">
                SEES THROUGH CLOUDS &amp; NIGHT
              </span>
            </div>
            <div class="lab-game-guide">
              <div class="lab-game-guide__head">
                <span class="lab-game-guide__kicker">GOAL</span>
                <span class="lab-game-guide__goal">${beamMatch ? "SECTOR READY" : "MATCH RADAR TO PEOPLE"}</span>
              </div>
              <div class="lab-game-guide__steps">
                ${rcmSteps.map((step) => `<span class="lab-game-step ${step.state}">${step.label}</span>`).join("")}
              </div>
            </div>
            <details class="lab-game-more">
              <summary>WHY RADAR SEES THROUGH CLOUDS</summary>
              <p>Normal cameras can't see through thick storm clouds or in the dark. Canada's <strong>RADARSAT</strong> satellites bounce harmless radio waves off the ground to see day or night.</p>
            </details>
            <div style="height:8px;"></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
              ${Object.values(RCM_SECTORS).map((s) => `
                <button type="button" class="lab-rcm-sec" data-id="${s.id}" style="padding:7px 11px;border-radius:5px;border:1px solid ${st.rcmSectorId === s.id ? "#34d399" : "rgba(255,255,255,0.14)"};background:${st.rcmSectorId === s.id ? "rgba(52,211,153,0.2)" : "rgba(0,0,0,0.35)"};color:#ece7dc;font-family:monospace;font-size:11px;font-weight:700;cursor:pointer;">
                  ${st.rcmVerifiedSectors[s.id] ? "✓ " : ""}${s.role}
                </button>
              `).join("")}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
              ${[
                { id: "scansar_500", label: "Wide Ocean & Ice View (For Ships)" },
                { id: "spotlight_3m", label: "Close-Up Flood Zoom (For Rescuers)" },
                { id: "polarimetric_30m", label: "Soil & Crop Scanner (For Farmers)" }
              ].map((b) => `
                <button type="button" class="lab-rcm-beam" data-id="${b.id}" style="padding:6px 10px;border-radius:5px;border:1px solid ${st.rcmBeamId === b.id ? "#67e8f9" : "rgba(255,255,255,0.14)"};background:${st.rcmBeamId === b.id ? "rgba(103,232,249,0.2)" : "rgba(0,0,0,0.3)"};color:#e2e8f0;font-family:monospace;font-size:11px;cursor:pointer;">
                  ${b.label}
                </button>
              `).join("")}
            </div>
            <canvas id="csa-rcm-canvas" width="440" height="125" style="width:100%;height:130px;border-radius:6px;border:1px solid rgba(52,211,153,0.3);display:block;margin-bottom:10px;"></canvas>
            <div class="sg-readout">
              <span>ZOOM <b>${beamMatch ? "MATCH" : "CHECK"}</b></span>
              <span class="${beamMatch ? "is-target" : ""}">${beamMatch ? "PEOPLE HELPED" : "TRY ANOTHER ZOOM"}</span>
            </div>
            <details class="lab-game-more">
              <summary>WHAT THIS SECTOR NEEDS</summary>
              <p><strong>${sec.role}:</strong> ${sec.targetDesc} ${sec.sarSignature}</p>
            </details>
          </div>

          <!-- CARD 2: ASTEROID SAMPLE SITE PICKER -->
          <div style="padding:16px 18px;border-radius:10px;background:rgba(15,23,42,0.75);border:1px solid rgba(251,191,36,0.35);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
              <span style="font-family:monospace;font-size:12px;font-weight:700;color:#fde047;">
                🇨🇦 GAME 2 · ASTEROID LANDER
              </span>
              <span style="font-family:monospace;font-size:10.5px;padding:3px 8px;border-radius:4px;background:rgba(251,191,36,0.16);color:#fde047;">
                3D LASER SCANNER
              </span>
            </div>
            <div class="lab-game-guide">
              <div class="lab-game-guide__head">
                <span class="lab-game-guide__kicker">GOAL</span>
                <span class="lab-game-guide__goal">${bennuGoal}</span>
              </div>
              <div class="lab-game-guide__steps">
                ${bennuSteps.map((step) => `<span class="lab-game-step ${step.state}">${step.label}</span>`).join("")}
              </div>
            </div>
            <details class="lab-game-more">
              <summary>WHY TILT MATTERS</summary>
              <p>Asteroid Bennu is covered in giant boulders. A Canadian 3D laser scanner maps every rock; the spacecraft can only touch down where the ground is flat enough.</p>
            </details>
            <div style="height:8px;"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
              ${Object.values(BENNU_CANDIDATE_SITES).map((s) => `
                <button type="button" class="lab-bennu-site" data-id="${s.id}" style="padding:9px 11px;border-radius:6px;border:1px solid ${st.bennuSiteId === s.id ? "#fbbf24" : "rgba(255,255,255,0.14)"};background:${st.bennuSiteId === s.id ? "rgba(251,191,36,0.18)" : "rgba(0,0,0,0.35)"};color:#ece7dc;text-align:left;cursor:pointer;">
                  <div style="font-family:monospace;font-size:11.5px;font-weight:700;color:${s.recommended ? "#fde047" : "#ece7dc"};margin-bottom:2px;">${s.name}</div>
                  <div style="font-family:monospace;font-size:10.5px;color:${s.tagSafe ? "#86efac" : "#fca5a5"};">Ground Tilt: ${s.slopeDeg}° · Water Clays: ${s.hydrationPct}%</div>
                </button>
              `).join("")}
            </div>
            <canvas id="csa-ola-canvas" width="440" height="125" style="width:100%;height:130px;border-radius:6px;border:1px solid rgba(251,191,36,0.3);display:block;margin-bottom:10px;"></canvas>
            <div class="sg-readout">
              <span>TILT <b>${site.slopeDeg}°</b></span>
              <span>WATER <b>${site.hydrationPct}%</b></span>
              <span class="${site.tagSafe ? "is-target" : ""}">${site.tagSafe ? "SAFE <10°" : "TOO STEEP"}</span>
            </div>
            <details class="lab-game-more">
              <summary>FULL LASER SCAN</summary>
              <p><strong>${site.name}:</strong> ${site.summary} ${site.boulderHazard}</p>
            </details>
          </div>
        </div>
      `;

      this._drawRcmCanvas(body.querySelector("#csa-rcm-canvas"));
      this._drawOlaCanvas(body.querySelector("#csa-ola-canvas"));

      body.querySelectorAll(".lab-rcm-sec").forEach((btn) => {
        btn.addEventListener("click", () => {
          st.rcmSectorId = btn.dataset.id;
          this._renderModalContent();
        });
      });
      body.querySelectorAll(".lab-rcm-beam").forEach((btn) => {
        btn.addEventListener("click", () => {
          st.rcmBeamId = btn.dataset.id;
          const s = RCM_SECTORS[st.rcmSectorId];
          if (s && st.rcmBeamId === s.recommendedBeam) {
            st.rcmVerifiedSectors[st.rcmSectorId] = true;
          }
          this._renderModalContent();
        });
      });
      body.querySelectorAll(".lab-bennu-site").forEach((btn) => {
        btn.addEventListener("click", () => {
          st.bennuSiteId = btn.dataset.id;
          this._renderModalContent();
        });
      });
    }

    _drawRcmCanvas(canvas) {
      if (!canvas || !canvas.getContext) return;
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      const st = this.state;

      ctx.fillStyle = "#040a14";
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = "rgba(52,211,153,0.16)";
      for (let x = 0; x < w; x += 28) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 24) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      if (st.rcmSectorId === "maritime_arctic") {
        for (let i = 0; i < 24; i++) {
          const ix = (i * 37) % (w - 40) + 15;
          const iy = (i * 53) % (h - 30) + 12;
          ctx.fillStyle = "rgba(148,163,184,0.28)";
          ctx.beginPath();
          ctx.arc(ix, iy, 8 + (i % 9), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = "#0ea5e9";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(20, h * 0.72);
        ctx.bezierCurveTo(w * 0.35, h * 0.45, w * 0.65, h * 0.62, w - 20, h * 0.28);
        ctx.stroke();

        [[w * 0.32, h * 0.56], [w * 0.68, h * 0.44]].forEach(([sx, sy]) => {
          ctx.fillStyle = "#fde047";
          ctx.fillRect(sx - 3, sy - 3, 6, 6);
          ctx.strokeStyle = "#34d399";
          ctx.lineWidth = 1;
          ctx.strokeRect(sx - 8, sy - 8, 16, 16);
        });
      } else if (st.rcmSectorId === "flood_emergency") {
        ctx.fillStyle = "rgba(14,165,233,0.32)";
        ctx.beginPath();
        ctx.moveTo(0, h * 0.35);
        ctx.quadraticCurveTo(w * 0.5, h * 0.85, w, h * 0.4);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "#f87171";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(w * 0.38, h * 0.42, 95, 42);
        ctx.fillStyle = "#fca5a5";
        ctx.font = "bold 9px monospace";
        ctx.fillText("FLOODED TOWN AREA (SEND RESCUE BOATS)", w * 0.34, h * 0.38);
      } else {
        const cols = 10;
        const rows = 4;
        const cw = (w - 30) / cols;
        const ch = (h - 32) / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const v = (r * 7 + c * 13) % 3;
            ctx.fillStyle = v === 0 ? "rgba(16,185,129,0.45)" : v === 1 ? "rgba(56,189,248,0.4)" : "rgba(234,179,8,0.35)";
            ctx.fillRect(15 + c * cw, 18 + r * ch, cw - 3, ch - 3);
          }
        }
      }

      const modeLabels = {
        scansar_500: "WIDE OCEAN & ICE VIEW (500 KM)",
        spotlight_3m: "CLOSE-UP FLOOD ZOOM (3 METER)",
        polarimetric_30m: "SOIL & CROP SCANNER (30 METER)"
      };
      ctx.fillStyle = "#6ee7b7";
      ctx.font = "bold 9.5px monospace";
      ctx.fillText(`SATELLITE RADAR PICTURE · ${modeLabels[st.rcmBeamId] || "RADAR VIEW"}`, 10, 13);
    }

    _drawOlaCanvas(canvas) {
      if (!canvas || !canvas.getContext) return;
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      const site = BENNU_CANDIDATE_SITES[this.state.bennuSiteId] || BENNU_CANDIDATE_SITES.nightingale;

      ctx.fillStyle = "#08070c";
      ctx.fillRect(0, 0, w, h);

      const cx = w * 0.32;
      const cy = h * 0.54;
      for (let r = 46; r >= 10; r -= 9) {
        ctx.strokeStyle = r < 22 && site.tagSafe ? "rgba(74,222,128,0.65)" : "rgba(251,191,36,0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      const boulderCount = site.tagSafe ? 6 : 14;
      for (let i = 0; i < boulderCount; i++) {
        const ang = (i / boulderCount) * Math.PI * 2;
        const rad = site.tagSafe ? 34 + (i % 3) * 6 : 14 + (i % 4) * 7;
        const bx = cx + Math.cos(ang) * rad;
        const by = cy + Math.sin(ang) * rad;
        ctx.fillStyle = site.tagSafe ? "#f59e0b" : "#ef4444";
        ctx.fillRect(bx - 3, by - 3, 6, 6);
      }

      ctx.fillStyle = "#fde047";
      ctx.font = "bold 9.5px monospace";
      ctx.fillText(`3D LASER MAP: ${site.name.split("(")[0].toUpperCase()}`, w * 0.54, 24);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "10.5px monospace";
      ctx.fillText(`Crater Width     : ${site.craterDiamM} meters`, w * 0.54, 44);
      ctx.fillText(`Safe Landing Spot: ${site.safeZoneRadiusM} meters wide`, w * 0.54, 60);
      ctx.fillText(`Ground Tilt      : ${site.slopeDeg}° (Keep under 10°)`, w * 0.54, 76);
      ctx.fillText(`Water-Rich Clays : ${site.hydrationPct}%`, w * 0.54, 92);
      ctx.fillStyle = site.tagSafe ? "#4ade80" : "#f87171";
      ctx.font = "bold 11px monospace";
      ctx.fillText(site.tagSafe ? "SAFE TO TOUCH DOWN & COLLECT!" : "DANGER: TOO STEEP / BOULDERS!", w * 0.54, 112);
    }

    _renderTelescopeTab(body, t) {
      const st = this.state;
      const lvl = TELESCOPE_LEVELS[st.telescopeLevel] || TELESCOPE_LEVELS[3];
      const opt = OPTICAL_SYSTEMS[st.opticalSystemId] || OPTICAL_SYSTEMS.segmented_6_5m_hex;

      body.innerHTML = `
        <div style="padding:16px 18px;border-radius:10px;background:rgba(15,23,42,0.8);border:1px solid rgba(192,132,252,0.35);margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
            <div>
              <div style="font-family:monospace;font-size:13px;font-weight:700;color:#e9d5ff;">
                🔭 BUILD-IT-YOURSELF SPACE TELESCOPE GAME
              </div>
              <div style="font-size:12px;color:#94a3b8;line-height:1.5;margin-top:3px;">
                Pick a complexity level and mirror type below to see how astronomers design telescopes like Hubble and Webb (<a href="https://science.nasa.gov/mission/webb/game-build-it-yourself/" target="_blank" rel="noopener" style="color:#67e8f9;text-decoration:underline;">Play NASA's Webb Game</a>).
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin-bottom:14px;">
            ${Object.values(TELESCOPE_LEVELS).map((l) => `
              <div class="lab-tel-lvl" data-lvl="${l.level}" style="padding:12px 14px;border-radius:8px;border:1px solid ${st.telescopeLevel === l.level ? "#c084fc" : "rgba(255,255,255,0.12)"};background:${st.telescopeLevel === l.level ? "rgba(192,132,252,0.16)" : "rgba(0,0,0,0.35)"};cursor:pointer;">
                <div style="font-family:monospace;font-size:11.5px;font-weight:700;color:#f3e8ff;">${l.name}</div>
                <div style="font-size:12px;color:#cbd5e1;margin:6px 0;line-height:1.5;">${l.desc}</div>
                <div style="font-family:monospace;font-size:11px;color:#fde047;">${l.heritage}</div>
              </div>
            `).join("")}
          </div>

          <div style="font-family:monospace;font-size:11.5px;font-weight:700;color:#67e8f9;margin-bottom:8px;">
            STEP 2 · PICK YOUR TELESCOPE MIRROR (BIGGER MIRRORS COLLECT MORE FAINT STARLIGHT):
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:10px;margin-bottom:14px;">
            ${Object.values(OPTICAL_SYSTEMS).map((o) => `
              <div class="lab-opt-card" data-id="${o.id}" style="padding:12px 14px;border-radius:8px;border:1px solid ${st.opticalSystemId === o.id ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${st.opticalSystemId === o.id ? "rgba(103,232,249,0.15)" : "rgba(0,0,0,0.35)"};cursor:pointer;">
                <div style="font-size:12.5px;font-weight:700;color:#ece7dc;">${o.name}</div>
                <div style="font-family:monospace;font-size:11px;color:#7dd3fc;margin:5px 0;">Mirror Width: ${o.apertureM} meters</div>
                <div style="font-size:11.5px;color:#94a3b8;line-height:1.48;">${o.explain}</div>
              </div>
            `).join("")}
          </div>

          <div style="padding:12px 14px;border-radius:8px;background:rgba(0,0,0,0.4);border:1px solid rgba(103,232,249,0.25);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="font-size:12px;color:#cbd5e1;line-height:1.55;">
              <strong>🇨🇦 Fun Fact — Canada's Eyes on the Webb Telescope:</strong> Canada built the <strong>Steady-Aim Camera (Fine Guidance Sensor)</strong> that keeps the Webb Telescope pointed steadily at distant stars—like holding a laser pointer steady on a dime from 1,000 kilometers away!—plus a special sensor that sniffs out water and air around alien planets.
            </div>
            <span style="font-family:monospace;font-size:11px;font-weight:700;color:#86efac;">
              SELECTED MIRROR: ${opt.apertureM}m · ${lvl.heritage}
            </span>
          </div>
        </div>
      `;

      body.querySelectorAll(".lab-tel-lvl").forEach((el) => {
        el.addEventListener("click", () => {
          st.telescopeLevel = Number(el.dataset.lvl) || 3;
          this._renderModalContent();
        });
      });
      body.querySelectorAll(".lab-opt-card").forEach((el) => {
        el.addEventListener("click", () => {
          st.opticalSystemId = el.dataset.id;
          this._renderModalContent();
        });
      });
    }

    _renderGmatMdlCubesatTab(body, t) {
      const st = this.state;
      const disciplines = this.getMdlDisciplinesTable(t);
      const gmatScript = this.generateGmatScript(t);

      body.innerHTML = `
        <!-- 4 MISSION PLANNING STAGES -->
        <div style="margin-bottom:16px;">
          <div style="font-family:monospace;font-size:11.5px;font-weight:700;color:#93c5fd;margin-bottom:8px;letter-spacing:0.6px;">
            HOW A SPACE MISSION GROWS: 4 SIMPLE STAGES FROM FIRST IDEA TO READY-TO-FLY
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:10px;">
            ${MDL_STUDY_STAGES.map((s) => `
              <div class="lab-mdl-stage" data-id="${s.id}" style="padding:11px 13px;border-radius:8px;border:1px solid ${st.mdlStageId === s.id ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${st.mdlStageId === s.id ? "rgba(103,232,249,0.14)" : "rgba(15,23,42,0.65)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;gap:8px;font-family:monospace;font-size:11.5px;font-weight:700;color:#ece7dc;">
                  <span>${s.name}</span>
                  <span style="color:#67e8f9;">${s.cml}</span>
                </div>
                <div style="font-size:11.5px;color:#94a3b8;margin-top:5px;line-height:1.45;">${s.focus}</div>
              </div>
            `).join("")}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;">
          <!-- 11 SPACECRAFT PARTS CHECKLIST -->
          <div style="padding:14px 16px;border-radius:10px;background:rgba(15,23,42,0.78);border:1px solid rgba(148,163,184,0.22);">
            <div style="font-family:monospace;font-size:11.5px;font-weight:700;color:#67e8f9;margin-bottom:10px;">
              YOUR SPACECRAFT'S 11 PARTS AT A GLANCE
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;font-size:11.5px;">
              ${disciplines.map((d) => `
                <div style="display:grid;grid-template-columns:1.1fr 1.2fr 0.9fr auto;gap:8px;align-items:center;padding:7px 10px;border-radius:5px;background:rgba(0,0,0,0.3);">
                  <strong style="color:#e2e8f0;">${d.discipline}</strong>
                  <span style="color:#cbd5e1;">${d.Choice}</span>
                  <span style="font-family:monospace;font-size:11px;color:#93c5fd;">${d.metric}</span>
                  <span style="font-family:monospace;font-size:10.5px;font-weight:700;color:${d.status === "GOOD" ? "#86efac" : "#fca5a5"};">${d.status}</span>
                </div>
              `).join("")}
            </div>
          </div>

          <!-- FLIGHT PLAN & ORBIT FILE -->
          <div style="padding:14px 16px;border-radius:10px;background:rgba(15,23,42,0.78);border:1px solid rgba(59,130,246,0.35);display:flex;flex-direction:column;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
              <span style="font-family:monospace;font-size:11.5px;font-weight:700;color:#93c5fd;">
                YOUR AUTO-GENERATED FLIGHT PATH PLAN
              </span>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" id="btn-lab-download-gmat" style="padding:6px 11px;border-radius:5px;border:1px solid #67e8f9;background:rgba(103,232,249,0.18);color:#ecfeff;font-family:monospace;font-size:11px;font-weight:700;cursor:pointer;">
                  DOWNLOAD FLIGHT PLAN
                </button>
                <button type="button" id="btn-lab-download-mdl-json" style="padding:6px 11px;border-radius:5px;border:1px solid rgba(167,139,250,0.5);background:rgba(167,139,250,0.16);color:#ddd6fe;font-family:monospace;font-size:11px;font-weight:700;cursor:pointer;">
                  SAVE SUMMARY (.JSON)
                </button>
              </div>
            </div>
            <pre style="margin:0;padding:12px;border-radius:6px;background:#030712;border:1px solid rgba(255,255,255,0.1);color:#a7f3d0;font-family:monospace;font-size:11px;line-height:1.5;max-height:300px;overflow:auto;white-space:pre;">${this._escapeHtml(gmatScript)}</pre>
          </div>
        </div>
      `;

      body.querySelectorAll(".lab-mdl-stage").forEach((el) => {
        el.addEventListener("click", () => {
          st.mdlStageId = el.dataset.id;
          this._renderModalContent();
        });
      });
      const btnGmat = body.querySelector("#btn-lab-download-gmat");
      if (btnGmat) btnGmat.addEventListener("click", () => this.exportGmatScript());
      const btnJson = body.querySelector("#btn-lab-download-mdl-json");
      if (btnJson) {
        btnJson.addEventListener("click", () => {
          if (window.gameplay && typeof window.gameplay.exportMdlPointDesignJson === "function") {
            window.gameplay.exportMdlPointDesignJson();
          }
        });
      }
    }

    _renderOfficialResourcesTab(body) {
      body.innerHTML = `
        <div style="margin-bottom:12px;font-size:12.5px;line-height:1.5;color:#cbd5e1;">
          All 9 official NASA &amp; Canadian Space Agency learning guides are built right into Lunaspis in plain, everyday language. Click any card to try it in the simulator or open the website:
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:14px;">
          ${OFFICIAL_RESOURCES.map((res) => `
            <div style="padding:14px 16px;border-radius:10px;background:rgba(15,23,42,0.8);border:1px solid rgba(148,163,184,0.22);display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
                  <span style="font-family:monospace;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:4px;background:rgba(103,232,249,0.14);color:#67e8f9;">${res.agency} · ${res.badge}</span>
                  <a href="${res.url}" target="_blank" rel="noopener" style="font-family:monospace;font-size:11px;color:#93c5fd;text-decoration:underline;">READ MORE &nearr;</a>
                </div>
                <div style="font-size:13.5px;font-weight:700;color:#f8fafc;margin-bottom:6px;">${res.title}</div>
                <div style="font-size:12px;color:#94a3b8;line-height:1.52;margin-bottom:8px;">${res.summary}</div>
                <div style="font-family:monospace;font-size:11px;line-height:1.45;color:#86efac;background:rgba(22,163,74,0.1);padding:8px 10px;border-radius:5px;border:1px solid rgba(34,197,94,0.25);">
                  HOW TO TRY IT HERE: ${res.inSimFeature}
                </div>
              </div>
              <button type="button" class="lab-res-action-btn" data-action="${res.actionType}" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid rgba(103,232,249,0.45);background:rgba(37,99,235,0.2);color:#e0f2fe;font-family:monospace;font-size:11.5px;font-weight:700;cursor:pointer;">
                ${res.actionLabel}
              </button>
            </div>
          `).join("")}
        </div>
      `;

      body.querySelectorAll(".lab-res-action-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const act = btn.dataset.action;
          if (act === "tab_csa") {
            this.state.activeTab = "csa";
            this._renderModalContent();
          } else if (act === "tab_telescope") {
            this.state.activeTab = "telescope";
            this._renderModalContent();
          } else if (act === "tab_gmat") {
            this.state.activeTab = "gmat";
            this._renderModalContent();
          } else if (act === "open_viz") {
            this.closeModal();
            if (window.missionViz && typeof window.missionViz.open === "function") {
              window.missionViz.open();
            }
          } else if (act === "open_vr") {
            this.closeModal();
            if (window.vrManager && typeof window.vrManager.toggleVR === "function") {
              window.vrManager.toggleVR();
            }
          } else if (act === "open_mdl") {
            this.closeModal();
            if (window.gameplay && typeof window.gameplay.openPreFlightMdlDesk === "function") {
              window.gameplay.openPreFlightMdlDesk("bus");
            }
          } else if (act === "console_arch") {
            this.closeModal();
            if (window.gameplay && typeof window.gameplay.openMissionPlannerFromGround === "function") {
              window.gameplay.openMissionPlannerFromGround();
            }
          }
        });
      });
    }

    _escapeHtml(str) {
      return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  }

  window.CsaNasaResourceLab = CsaNasaResourceLab;
  window.csaNasaLab = new CsaNasaResourceLab();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.csaNasaLab.init());
  } else {
    window.csaNasaLab.init();
  }
})(window);
