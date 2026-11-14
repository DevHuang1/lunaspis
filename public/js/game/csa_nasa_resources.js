/**
 * ============================================================================
 * LUNASPIS // NASA & CSA SPACE APPS RESOURCES, DIGITAL GAMES & GMAT LAB
 * ============================================================================
 * Integrates the 9 official NASA & Canadian Space Agency (CSA) resources into
 * interactive in-game engineering tools, mini-simulations, and GMAT exports:
 *
 * 1. NASA Design & Develop Science Missions (Launch, Space, Ground, User segments)
 * 2. NASA General Mission Analysis Tool (GMAT) — Live .script generator & burn table
 * 3. NASA JPL Concept Maturity Levels (CML 1–4 progression & gate criteria)
 * 4. NASA GSFC Mission Design Lab (MDL) — Office Hours, Concept Dev, Trade Studies,
 *    Point Design & 11-Discipline Master Equipment List (MEL)
 * 5. NASA Mission Viz — 3D spatial/temporal trajectory & ground link theater [U]
 * 6. NASA Build-It-Yourself Space Telescope Game — Levels 1, 2, 3 complexity,
 *    optical mirror geometry, wavelength coupling & CSA JWST FGS/NIRISS lock
 * 7. NASA CSLI CubeSat 101 — 5-Phase lifecycle checklist & Kibo/Canadarm2 deployment
 * 8. Visualize a Space Mission Using VR — WebXR & Side-by-Side Stereo VR [VR]
 * 9. CSA Digital Games & Activities (asc-csa.gc.ca):
 *    - RADARSAT Constellation Mission (RCM) Maritime / Flood / Agriculture SAR Game
 *    - OSIRIS-REx Laser Altimeter (OLA) Asteroid Bennu Sample-Site Selection Game
 *    - Mission: Astronaut — Canadarm2 / Dextre Robotics & Tomatosphere™ ECLSS Lab
 */

(function (window) {
  "use strict";

  const OFFICIAL_RESOURCES = [
    {
      id: "nasa_science_missions",
      agency: "NASA",
      badge: "SYSTEMS ENGINEERING",
      title: "Design and Develop Science Missions",
      url: "https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf?emrc=a454cf",
      summary: "Systems-engineering progression from initial scientific need through requirements definition, design, verification, and implementation across Launch, Space, Ground, and User segments.",
      inSimFeature: "Live 4-Segment Readiness (LAUNCH / SPACE / GROUND / USER) in every station console & synthetic User Segment science plots.",
      actionLabel: "OPEN CONSOLE 1 [ARCH]",
      actionType: "console_arch"
    },
    {
      id: "nasa_gmat",
      agency: "NASA GSFC",
      badge: "TRAJECTORY & ORBITS",
      title: "General Mission Analysis Tool (GMAT)",
      url: "https://software.nasa.gov/software/GSC-19468-1",
      summary: "Open-source enterprise trajectory design, orbit propagation, manoeuvre planning, launch-window analysis, and trade-off reporting across LEO, SSO, HEO, Lunar, L2, and deep space.",
      inSimFeature: "Live GMAT .script file generator (Spacecraft, Tanks, ForceModel, Propagator, ImpulsiveBurn) + 3D trajectory propagation.",
      actionLabel: "GENERATE GMAT .SCRIPT",
      actionType: "tab_gmat"
    },
    {
      id: "nasa_cmls",
      agency: "NASA JPL",
      badge: "MATURITY FRAMEWORK",
      title: "Concept Maturity Levels (CML 1–4)",
      url: "https://dataverse.jpl.nasa.gov/dataset.xhtml?persistentId=hdl:2014/44299",
      summary: "JPL framework measuring progressive mission maturity from CML 1 (Initial Idea) through CML 2 (Initial Feasibility), CML 3 (Trade Space), and CML 4 (Point Design).",
      inSimFeature: "Real-time CML 1–4 gate tracker in the telemetry header and post-mission debrief.",
      actionLabel: "INSPECT MDL & CML GATES",
      actionType: "tab_gmat"
    },
    {
      id: "nasa_mdl",
      agency: "NASA GSFC",
      badge: "CONCURRENT DESIGN",
      title: "Mission Design Lab (MDL)",
      url: "https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab/",
      summary: "Rapid concurrent engineering across Office Hours, Concept Development, Trade Studies, and Point Design covering Power, Propulsion, Thermal, Structures, Avionics, Comms, ADCS, Software, Reliability, Cost, and Risk.",
      inSimFeature: "Option A vs. Option B Trade Delta bar, 3D Point Design CAD preview, 11-Discipline table, and JSON/GMAT export.",
      actionLabel: "OPEN MDL TRADE DESK",
      actionType: "open_mdl"
    },
    {
      id: "nasa_mission_viz",
      agency: "NASA",
      badge: "3D VISUALIZATION",
      title: "NASA Mission Viz",
      url: "https://nasa.github.io/mission-viz/",
      summary: "Interactive 3D web visualization of celestial bodies, spacecraft trajectories, spatial/temporal dynamics, camera perspectives, and mission timeline events.",
      inSimFeature: "3D Mission Viz & GMAT Trajectory Theater [U] with Earth umbra cone, Van Allen belts, DSN cones, and timeline scrubber.",
      actionLabel: "LAUNCH 3D MISSION VIZ [U]",
      actionType: "open_viz"
    },
    {
      id: "nasa_telescope_game",
      agency: "NASA WEBB",
      badge: "ASTROPHYSICS GAME",
      title: "A Learning Game About Telescopes (Build-It-Yourself)",
      url: "https://science.nasa.gov/mission/webb/game-build-it-yourself/",
      summary: "3-level interactive simulation demonstrating how cosmic science objectives constrain wavelengths, optical mirror systems, cryogenic cooling, and real NASA/CSA mission matches.",
      inSimFeature: "3-Level Telescope Complexity Builder + CSA JWST FGS/NIRISS exoplanet transit spectroscopy lab.",
      actionLabel: "PLAY TELESCOPE BUILDER",
      actionType: "tab_telescope"
    },
    {
      id: "nasa_cubesat_101",
      agency: "NASA CSLI",
      badge: "SMALLSAT GUIDE",
      title: "CubeSat 101 — Basic Concepts for First-Time Developers",
      url: "https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf",
      summary: "Complete CubeSat mission guide covering ConOps, 1U/3U/6U/12U dispenser specs, FCC/ITU licensing, Vibe/TVAC environmental testing, ISS Kibo deployment, and 5-year deorbit rules.",
      inSimFeature: "3U/6U/12U CubeSat 101 scenario, 5-Phase CSLI readiness checklist, and passive drag-sail / propulsive deorbit verifier.",
      actionLabel: "OPEN CUBESAT 101 LAB",
      actionType: "tab_gmat"
    },
    {
      id: "nasa_vr_challenge",
      agency: "NASA SPACE APPS",
      badge: "IMMERSIVE XR / VR",
      title: "Visualize a Space Mission Using Virtual Reality",
      url: "https://www.spaceappschallenge.org/2023/challenges/visualize-a-space-mission-using-virtual-reality/",
      summary: "Interactive VR visualization of an end-to-end space mission: concept, orbital trajectories, mission event timeline, and 3D spatial exploration.",
      inSimFeature: "WebXR immersive-vr + Desktop/Mobile Side-by-Side Stereo VR with adjustable IPD across Mission Viz, ISS 3D, and Station.",
      actionLabel: "ENTER STEREO / WEBXR VR",
      actionType: "open_vr"
    },
    {
      id: "csa_digital_games",
      agency: "CSA (CANADA)",
      badge: "PARTNER RESOURCES",
      title: "CSA Digital Games and Activities",
      url: "https://www.asc-csa.gc.ca/eng/youth-educators/digital-games-and-activities.asp",
      summary: "Interactive Canadian Space Agency games and activities highlighting Canada's role in space: RADARSAT Constellation Mission, OSIRIS-REx OLA LiDAR, Mission: Astronaut, Canadarm2/Dextre, JWST FGS/NIRISS, and Tomatosphere™.",
      inSimFeature: "Playable CSA RADARSAT SAR Triage, OSIRIS-REx OLA Bennu Sample-Site Scanner, Canadarm2 Grapple, and Tomatosphere™ ECLSS.",
      actionLabel: "PLAY CSA ACTIVITIES",
      actionType: "tab_csa"
    }
  ];

  const RCM_SECTORS = {
    maritime_arctic: {
      id: "maritime_arctic",
      role: "MARITIME CAPTAIN · ARCTIC NORTHWEST PASSAGE",
      beamMode: "ScanSAR Wide (500 km swath · 50m res · Dual HH+HV Polarization)",
      recommendedBeam: "scansar_500",
      targetDesc: "Detect multi-year sea-ice ridges and open-water leads for Canadian Coast Guard icebreakers and northern supply vessels through polar night and cloud cover.",
      sarSignature: "Multi-year ice floes show strong volume-scattering HV depolarization; open shipping channels appear as dark specular radar corridors.",
      scienceBonus: 8
    },
    flood_emergency: {
      id: "flood_emergency",
      role: "EMERGENCY FIRST RESPONDER · RED RIVER & COASTAL FLOODING",
      beamMode: "Spotlight High-Resolution (3m res · 20 km swath · Rapid 4-Day Repeat)",
      recommendedBeam: "spotlight_3m",
      targetDesc: "Map inundated floodplains, dike breaches, and washed-out evacuation roads in real time during heavy storm cloud cover to guide rescue boats.",
      sarSignature: "Calm floodwater acts as a specular reflector (low backscatter dark polygons) contrasting sharply against bright urban corner reflectors.",
      scienceBonus: 9
    },
    precision_farming: {
      id: "precision_farming",
      role: "PRECISION FARMER · CANADIAN PRAIRIES SOIL & CROP MONITOR",
      beamMode: "Compact Polarimetry Medium-Res (30m res · 125 km swath · CP Mode)",
      recommendedBeam: "polarimetric_30m",
      targetDesc: "Measure volumetric surface soil moisture and crop canopy biomass across Saskatchewan & Manitoba to optimize irrigation and forecast harvest yields.",
      sarSignature: "High dielectric constant of moist soil increases C-band radar backscatter (σ°), while canopy structure shifts circular-polarization phase.",
      scienceBonus: 7
    }
  };

  const BENNU_CANDIDATE_SITES = {
    nightingale: {
      id: "nightingale",
      name: "Nightingale (Hokioi Crater · 56°N, 43°E)",
      craterDiamM: 16,
      safeZoneRadiusM: 8.0,
      slopeDeg: 4.2,
      boulderHazard: "MODERATE (Mount Doom 10m boulder on eastern rim — requires CSA OLA 3D hazard map + Natural Feature Tracking)",
      hydrationPct: 94,
      carbonScore: 96,
      tagSafe: true,
      recommended: true,
      summary: "PRIMARY NASA/CSA SELECTION: Young, freshly exposed northern crater rich in hydrated phyllosilicates and organic carbon with a flat 4.2° floor."
    },
    osprey: {
      id: "osprey",
      name: "Osprey (Equatorial Crater · 11°N, 89°E)",
      craterDiamM: 20,
      safeZoneRadiusM: 10.5,
      slopeDeg: 6.1,
      boulderHazard: "LOW-MODERATE (Clear central dark patch surrounded by meter-scale cobbles)",
      hydrationPct: 82,
      carbonScore: 88,
      tagSafe: true,
      recommended: false,
      summary: "BACKUP TAG SITE: Strong carbon-rich spectral signature and wider 10.5m safe touchdown circle, though slightly coarser regolith grain size."
    },
    kingfisher: {
      id: "kingfisher",
      name: "Kingfisher (Equatorial Boulder Crater · 11°N, 56°E)",
      craterDiamM: 8,
      safeZoneRadiusM: 3.5,
      slopeDeg: 14.5,
      boulderHazard: "HIGH (Steep 14.5° crater walls and adjacent 15m monolithic boulders exceed 10° TAG tilt limit)",
      hydrationPct: 89,
      carbonScore: 85,
      tagSafe: false,
      recommended: false,
      summary: "HIGH HAZARD: Strong water-bearing mineral signature, but CSA OLA 2cm laser altimetry reveals unsafe >14° slope and narrow 3.5m clearance."
    },
    sandpiper: {
      id: "sandpiper",
      name: "Sandpiper (Southern Hemisphere · 47°S, 322°E)",
      craterDiamM: 63,
      safeZoneRadiusM: 22.0,
      slopeDeg: 3.8,
      boulderHazard: "LOW (Wide flat basin, but fewer fine sub-2cm sampleable regolith particles)",
      hydrationPct: 64,
      carbonScore: 68,
      tagSafe: true,
      recommended: false,
      summary: "SAFE GEOMETRY / LOWER SCIENCE: Very flat 3.8° floor mapped by CSA OLA, but lower concentration of unaltered hydrated volatiles."
    }
  };

  const TELESCOPE_LEVELS = {
    1: {
      level: 1,
      name: "Level 1 · Single-Objective Explorer (Cadet)",
      goalCount: 1,
      desc: "Match 1 primary cosmic objective to a compatible wavelength band and primary mirror.",
      heritage: "NASA GALEX / CSA MOST & NEOSSat Space Telescopes"
    },
    2: {
      level: 2,
      name: "Level 2 · Multi-Band Survey Observatory (Engineer)",
      goalCount: 2,
      desc: "Combine 2 scientific objectives across optical/IR bands with active cooling and CSA Fine Guidance Sensor (FGS).",
      heritage: "NASA Hubble / Nancy Grace Roman Space Telescope"
    },
    3: {
      level: 3,
      name: "Level 3 · Flagship Deep-Space L2 Cryo Observatory (PI)",
      goalCount: 3,
      desc: "Coordinate 3 flagship objectives (First Galaxies, Exoplanet Biosignatures, Protoplanetary Disks) at L2 with 6.5m segmented gold optics + CSA NIRISS.",
      heritage: "NASA / ESA / CSA James Webb Space Telescope (JWST)"
    }
  };

  const OPTICAL_SYSTEMS = {
    monolithic_1_2m: {
      id: "monolithic_1_2m",
      name: "1.2m Monolithic Silicon-Carbide (SiC) Mirror",
      apertureM: 1.2,
      supportedBands: ["uv_optical", "near_ir"],
      minBus: "smallsat_12u",
      explain: "Compact, rigid wide-field mirror ideal for LEO/SSO surveys and Level 1 missions."
    },
    monolithic_2_4m: {
      id: "monolithic_2_4m",
      name: "2.4m Hubble/Roman-Class Monolithic ULE Glass Mirror",
      apertureM: 2.4,
      supportedBands: ["uv_optical", "near_ir"],
      minBus: "modular_hex",
      explain: "Diffraction-limited UV/Visible/Near-IR primary mirror for exoplanet coronagraphy and dark-energy galaxy surveys."
    },
    segmented_6_5m_hex: {
      id: "segmented_6_5m_hex",
      name: "6.5m 18-Segment Gold-Coated Beryllium Mirror + CSA FGS/NIRISS",
      apertureM: 6.5,
      supportedBands: ["near_ir", "mid_ir"],
      minBus: "modular_hex",
      explain: "JWST origami-folding 18-hexagon mirror optimized for 0.6–28 µm infrared light, paired with Canada's Fine Guidance Sensor (FGS) & NIRISS."
    },
    grazing_xray_shells: {
      id: "grazing_xray_shells",
      name: "Nested Iridium-Coated Grazing-Incidence Wolter-I Shells",
      apertureM: 1.2,
      supportedBands: ["xray"],
      minBus: "modular_hex",
      explain: "Focuses high-energy X-ray photons at shallow grazing angles (<1°) onto high-resolution microcalorimeter detectors."
    }
  };

  const CUBESAT_101_PHASES = [
    {
      id: "cs_conops",
      phase: "PHASE 1 · CONOPS & CSLI PROPOSAL",
      detail: "Define primary science/tech-demo objective, 1U/3U/6U/12U envelope, and ground educational outreach plan."
    },
    {
      id: "cs_licensing",
      phase: "PHASE 2 · DISPENSER, RF LICENSING & DEORBIT PLAN",
      detail: "Verify P-POD / NRCSD rail tolerances, coordinate FCC/ITU amateur or science UHF/S-Band frequencies, and certify <5-year orbital decay."
    },
    {
      id: "cs_testing",
      phase: "PHASE 3 · ENVIRONMENTAL QUALIFICATION (VIBE & TVAC)",
      detail: "Pass random vibration launch-load testing, thermal-vacuum cycling (-20°C to +60°C), and inhibit deployment switch checks."
    },
    {
      id: "cs_launch",
      phase: "PHASE 4 · DISPENSER INTEGRATION & KIBO / CANADARM2 DEPLOY",
      detail: "Integrate into Nanoracks / CSLI dispenser; deploy from ISS Kibo airlock via CSA Canadarm2 or dedicated commercial rideshare."
    },
    {
      id: "cs_ops",
      phase: "PHASE 5 · ON-ORBIT BEACON LOCK & SCIENCE OPERATIONS",
      detail: "Wait 30-min post-ejection timer, deploy solar wings & antenna, lock telemetry beacon, and downlink student science packets."
    }
  ];

  const MDL_STUDY_STAGES = [
    {
      id: "office_hours",
      name: "1. MDL Office Hours",
      cml: "CML 1",
      focus: "Rapid brainstorming with GSFC systems engineers to clarify science goals and identify tall-pole technology challenges."
    },
    {
      id: "concept_dev",
      name: "2. Concept Development",
      cml: "CML 2",
      focus: "Initial physics feasibility check: orbital regime, launch vehicle class, order-of-magnitude mass/power/cost envelope."
    },
    {
      id: "trade_studies",
      name: "3. Architecture Trade Studies",
      cml: "CML 3",
      focus: "Compare Option A vs. Option B across propulsion (Chemical vs. SEP), power (Solar vs. RTG), and comms (X-Band vs. Ka/Optical)."
    },
    {
      id: "point_design",
      name: "4. Integrated Point Design",
      cml: "CML 4",
      focus: "Converged 11-discipline baseline with 3D CAD geometry, Master Equipment List (MEL), link/ΔV margins, risk matrix, and GMAT trajectory."
    }
  ];

  class CsaNasaResourceLab {
    constructor() {
      this.state = {
        activeTab: "csa",
        mdlStageId: "point_design",
        // CSA RADARSAT Constellation Game state
        rcmSectorId: "maritime_arctic",
        rcmBeamId: "scansar_500",
        rcmVerifiedSectors: { maritime_arctic: true, flood_emergency: false, precision_farming: false },
        // CSA OSIRIS-REx OLA Bennu Sample Site state
        bennuSiteId: "nightingale",
        olaScanResolutionCm: 2,
        // CSA Canadarm2 & Tomatosphere state
        canadarmPitchErrorDeg: 0.2,
        canadarmLocked: true,
        tomatosphereActive: true,
        tomatosphereGerminationPct: 91,
        // NASA Build-It-Yourself Telescope state
        telescopeLevel: 3,
        opticalSystemId: "segmented_6_5m_hex",
        csaFgsNirissEnabled: true,
        // NASA CubeSat 101 5-Phase state
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

    getState() {
      return this.state;
    }

    getMdlDisciplinesTable(t) {
      if (!t) return [];
      return [
        { discipline: "1. Structures & Mechanisms",Choice: t.bus.name, metric: `${t.dryMassKg} kg dry · ${t.maxInstruments} bays`, status: t.massOk ? "NOMINAL" : "OVERLOAD" },
        { discipline: "2. Electrical Power (EPS)", Choice: `${t.pwr.name} + ${t.bat.name}`, metric: `${t.daylightGenW} W gen · ${t.batteryDodPct}% DoD`, status: t.powerOk ? "NOMINAL" : "DEFICIT" },
        { discipline: "3. Propulsion & Consumables", Choice: t.prop.name, metric: `Isp ${t.prop.ispSec}s · ΔV ${t.achievedDeltaV}/${t.requiredDeltaV} m/s`, status: t.deltaVOk ? "NOMINAL" : "LOW ΔV" },
        { discipline: "4. Thermal Control", Choice: t.thm.name, metric: `${t.thm.thermalCapW} W heat rejection cap`, status: t.thermalOk && t.telescopeOk ? "NOMINAL" : "THERMAL WARN" },
        { discipline: "5. Avionics & Radiation", Choice: `${t.thm.radRatingKrad} krad shielded vault`, metric: `Env: ${t.orbit.radiationEnvKrad} krad`, status: t.radiationOk ? "NOMINAL" : "RAD WARN" },
        { discipline: "6. Attitude Control (ADCS)", Choice: t.scenario.requiresWavelength && this.state.csaFgsNirissEnabled ? "3-Axis RW + CSA JWST FGS (0.8 mas)" : "3-Axis Reaction Wheels + Star Tracker", metric: t.scenario.requiresWavelength ? "Sub-arcsec lock" : "0.01° nadir point", status: "NOMINAL" },
        { discipline: "7. RF / Optical Comms", Choice: t.com.name, metric: `${t.com.rateMbps} Mbps · +${t.linkMarginDb} dB margin`, status: t.commsOk ? "NOMINAL" : "LINK WARN" },
        { discipline: "8. Ground Systems & Ops", Choice: t.gnd.name, metric: `${t.downlinkCapGbPerDay} GB/d cap vs ${t.dataGeneratedGbPerDay} GB/d`, status: t.commsOk ? "NOMINAL" : "BOTTLENECK" },
        { discipline: "9. Flight Software & Autonomy", Choice: "CFS Fault-Protection + Auto-Safe Mode", metric: `${t.selectedInsts.length} payload streams`, status: "NOMINAL" },
        { discipline: "10. Reliability & EoM Disposal", Choice: t.disposal.name, metric: `${t.estimatedLifetimeMonths} mo life · ${t.disposal.deorbitYears} yr EoM`, status: t.disposalOk && t.lifetimeOk ? "NOMINAL" : "REVIEW" },
        { discipline: "11. Cost & Programmatic Risk", Choice: `${t.lv.name.split("(")[0].trim()} + Bus/Payload`, metric: `$${t.totalCostM}M / $${t.budgetCapM}M cap (${t.cmlLabel})`, status: t.budgetOk ? "NOMINAL" : "OVERRUN" }
      ];
    }

    generateGmatScript(telemetry) {
      const gp = window.gameplay;
      const t = telemetry || (gp && typeof gp.evaluateMissionDesign === "function" ? gp.evaluateMissionDesign() : null);
      if (!t) return "% GMAT Script unavailable";

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
        `% NASA GENERAL MISSION ANALYSIS TOOL (GMAT R2022a+) MISSION SCRIPT`,
        `% Generated by: LUNASPIS // NASA & CSA Space Apps Mission Design Lab`,
        `% Mission:      ${t.scenario.name} (${t.scenario.code}) — ${t.cmlLabel}`,
        `% Analogue:     ${t.analogue.missions}`,
        `% Timestamp:    ${new Date().toISOString()}`,
        "% =============================================================================",
        "",
        "%----------------------------------------",
        "%---------- Spacecraft & Propulsion",
        "%----------------------------------------",
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
        "GMAT LunaspisSC.Cd = 2.2;",
        "GMAT LunaspisSC.Cr = 1.8;",
        `GMAT LunaspisSC.DragArea = ${t.scenario.isCubesat ? 0.08 : 6.4};`,
        `GMAT LunaspisSC.SRPArea = ${t.scenario.isCubesat ? 0.24 : 14.5};`,
        "",
        "Create ChemicalTank MainPropTank;",
        "GMAT MainPropTank.AllowNegativeFuelMass = false;",
        `GMAT MainPropTank.FuelMass = ${fuelMass};`,
        "GMAT LunaspisSC.Tanks = {MainPropTank};",
        "",
        "%----------------------------------------",
        "%---------- Force Model & Propagator",
        "%----------------------------------------",
        "Create ForceModel MissionForceModel;",
        "GMAT MissionForceModel.CentralBody = Earth;",
        "GMAT MissionForceModel.PrimaryBodies = {Earth};",
        "GMAT MissionForceModel.PointMasses = {Luna, Sun};",
        "GMAT MissionForceModel.SRP = On;",
        "GMAT MissionForceModel.GravityField.Earth.Degree = 8;",
        "GMAT MissionForceModel.GravityField.Earth.Order = 8;",
        "",
        "Create Propagator HighFidelityProp;",
        "GMAT HighFidelityProp.FM = MissionForceModel;",
        "GMAT HighFidelityProp.Type = RungeKutta89;",
        "GMAT HighFidelityProp.InitialStepSize = 30;",
        "",
        "%----------------------------------------",
        "%---------- Impulsive Maneuvers (Insertion & EoM Disposal)",
        "%----------------------------------------",
        "Create ImpulsiveBurn OrbitInsertionBurn;",
        "GMAT OrbitInsertionBurn.CoordinateSystem = Local;",
        "GMAT OrbitInsertionBurn.Origin = Earth;",
        "GMAT OrbitInsertionBurn.Axes = VNB;",
        `GMAT OrbitInsertionBurn.Element1 = ${(t.orbit.reqInsertionDv / 1000).toFixed(4)}; % km/s (${t.orbit.reqInsertionDv} m/s)`,
        "GMAT OrbitInsertionBurn.DecrementMass = true;",
        "GMAT OrbitInsertionBurn.Tank = {MainPropTank};",
        `GMAT OrbitInsertionBurn.Isp = ${t.prop.ispSec};`,
        "",
        "Create ImpulsiveBurn EndOfMissionDisposalBurn;",
        "GMAT EndOfMissionDisposalBurn.CoordinateSystem = Local;",
        "GMAT EndOfMissionDisposalBurn.Axes = VNB;",
        `GMAT EndOfMissionDisposalBurn.Element1 = -${(t.disposal.dvCostMs / 1000).toFixed(4)}; % km/s (-${t.disposal.dvCostMs} m/s EoM)`,
        "GMAT EndOfMissionDisposalBurn.DecrementMass = true;",
        "GMAT EndOfMissionDisposalBurn.Tank = {MainPropTank};",
        `GMAT EndOfMissionDisposalBurn.Isp = ${t.prop.ispSec};`,
        "",
        "%----------------------------------------",
        "%---------- 3D Visualization & Reports",
        "%----------------------------------------",
        "Create OrbitView MissionViz3D;",
        "GMAT MissionViz3D.Add = {LunaspisSC, Earth, Luna, Sun};",
        "GMAT MissionViz3D.DrawOrbit = true;",
        "",
        "%----------------------------------------",
        "%---------- Mission Sequence",
        "%----------------------------------------",
        "BeginMissionSequence;",
        `Propagate 'Ascent & Coast to Perigee' HighFidelityProp(LunaspisSC) {LunaspisSC.ElapsedSecs = 1800};`,
        "Maneuver 'Execute Orbital Insertion' OrbitInsertionBurn(LunaspisSC);",
        `Propagate 'Primary Science Campaign (${t.selectedInsts.length} Instruments)' HighFidelityProp(LunaspisSC) {LunaspisSC.ElapsedSecs = ${propDurationSec}};`,
        "Maneuver 'Execute 5-Yr Compliant EoM Disposal' EndOfMissionDisposalBurn(LunaspisSC);",
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
      a.download = `lunaspis_${code}_gmat.script`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (gp && typeof gp.showToast === "function") {
        gp.showToast("Exported NASA GMAT Trajectory & Maneuver Script (.script)");
      }
    }

    // Renders contextual CSA / NASA interactive sub-panel directly inside Console 4 (Science Payload)
    renderContextualConsoleWidget(scenarioId) {
      const st = this.state;
      if (scenarioId === "earth_climate") {
        const sec = RCM_SECTORS[st.rcmSectorId] || RCM_SECTORS.maritime_arctic;
        const beamMatch = st.rcmBeamId === sec.recommendedBeam;
        return `
          <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:rgba(16,185,129,0.07);border:1px solid rgba(52,211,153,0.35);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
              <span style="font-family:monospace;font-size:10px;font-weight:700;color:#6ee7b7;letter-spacing:1px;">
                🇨🇦 CSA RADARSAT CONSTELLATION MISSION (RCM) · C-BAND SAR TRIAGE CHALLENGE
              </span>
              <button type="button" class="btn-open-csa-lab-inline" data-tab="csa" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(103,232,249,0.45);background:rgba(103,232,249,0.14);color:#67e8f9;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">
                OPEN FULL CSA LAB
              </button>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
              ${Object.values(RCM_SECTORS).map((s) => `
                <button type="button" class="csa-rcm-sec-btn" data-id="${s.id}" style="padding:4px 8px;border-radius:4px;border:1px solid ${st.rcmSectorId === s.id ? "#34d399" : "rgba(255,255,255,0.15)"};background:${st.rcmSectorId === s.id ? "rgba(52,211,153,0.2)" : "rgba(0,0,0,0.35)"};color:#ece7dc;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">
                  ${s.role.split("·")[0].trim()}
                </button>
              `).join("")}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
              ${[
                { id: "scansar_500", label: "ScanSAR 500km (Arctic Ships/Ice)" },
                { id: "spotlight_3m", label: "Spotlight 3m (Flood Rescue)" },
                { id: "polarimetric_30m", label: "Compact Polarimetry 30m (Crops/Soil)" }
              ].map((b) => `
                <button type="button" class="csa-rcm-beam-btn" data-id="${b.id}" style="padding:3px 7px;border-radius:4px;border:1px solid ${st.rcmBeamId === b.id ? "#67e8f9" : "rgba(255,255,255,0.14)"};background:${st.rcmBeamId === b.id ? "rgba(103,232,249,0.18)" : "rgba(0,0,0,0.3)"};color:#cbd5e1;font-family:monospace;font-size:8.5px;cursor:pointer;">
                  ${b.label}
                </button>
              `).join("")}
            </div>
            <div style="font-size:10.5px;color:${beamMatch ? "#a7f3d0" : "#fde68a"};">
              ${beamMatch ? `[PASS] Optimal RCM Beam Mode matched for ${sec.role}: ${sec.sarSignature}` : `[TIP] Select the matching RCM SAR swath mode for ${sec.role} (${sec.beamMode}).`}
            </div>
          </div>
        `;
      }

      if (scenarioId === "asteroid_rendezvous") {
        const site = BENNU_CANDIDATE_SITES[st.bennuSiteId] || BENNU_CANDIDATE_SITES.nightingale;
        return `
          <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.35);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
              <span style="font-family:monospace;font-size:10px;font-weight:700;color:#fde047;letter-spacing:1px;">
                🇨🇦 CSA OSIRIS-REx LASER ALTIMETER (OLA) · BENNU TAG SAMPLE-SITE SELECTION
              </span>
              <button type="button" class="btn-open-csa-lab-inline" data-tab="csa" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(103,232,249,0.45);background:rgba(103,232,249,0.14);color:#67e8f9;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">
                3D OLA SCANNER
              </button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;margin-bottom:6px;">
              ${Object.values(BENNU_CANDIDATE_SITES).map((s) => `
                <div class="csa-bennu-site-card" data-id="${s.id}" style="padding:6px 8px;border-radius:5px;border:1px solid ${st.bennuSiteId === s.id ? "#fbbf24" : "rgba(255,255,255,0.12)"};background:${st.bennuSiteId === s.id ? "rgba(251,191,36,0.16)" : "rgba(0,0,0,0.35)"};cursor:pointer;">
                  <div style="font-family:monospace;font-size:9.5px;font-weight:700;color:#ece7dc;">${s.name.split("(")[0].trim()}</div>
                  <div style="font-family:monospace;font-size:8.5px;color:${s.tagSafe ? "#86efac" : "#fca5a5"};">Slope ${s.slopeDeg}° · Hydr ${s.hydrationPct}%</div>
                </div>
              `).join("")}
            </div>
            <div style="font-size:10.5px;color:${site.tagSafe ? "#a7f3d0" : "#fecaca"};">
              <strong>${site.name}:</strong> ${site.summary}
            </div>
          </div>
        `;
      }

      if (scenarioId === "space_telescope") {
        const lvl = TELESCOPE_LEVELS[st.telescopeLevel] || TELESCOPE_LEVELS[3];
        const opt = OPTICAL_SYSTEMS[st.opticalSystemId] || OPTICAL_SYSTEMS.segmented_6_5m_hex;
        return `
          <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:rgba(192,132,252,0.08);border:1px solid rgba(192,132,252,0.35);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
              <span style="font-family:monospace;font-size:10px;font-weight:700;color:#e9d5ff;letter-spacing:1px;">
                🔭 NASA BUILD-IT-YOURSELF TELESCOPE (LEVELS 1–3) + 🇨🇦 CSA JWST FGS / NIRISS
              </span>
              <div style="display:flex;gap:5px;flex-wrap:wrap;">
                ${[1, 2, 3].map((n) => `
                  <button type="button" class="nasa-tel-lvl-btn" data-lvl="${n}" style="padding:3px 7px;border-radius:4px;border:1px solid ${st.telescopeLevel === n ? "#c084fc" : "rgba(255,255,255,0.16)"};background:${st.telescopeLevel === n ? "rgba(192,132,252,0.24)" : "rgba(0,0,0,0.3)"};color:#ece7dc;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">
                    LEVEL ${n}
                  </button>
                `).join("")}
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:6px;margin-bottom:6px;">
              ${Object.values(OPTICAL_SYSTEMS).map((o) => `
                <div class="nasa-opt-sys-card" data-id="${o.id}" style="padding:6px 8px;border-radius:5px;border:1px solid ${st.opticalSystemId === o.id ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${st.opticalSystemId === o.id ? "rgba(103,232,249,0.14)" : "rgba(0,0,0,0.3)"};cursor:pointer;">
                  <div style="font-size:9.5px;font-weight:700;color:#ece7dc;">${o.name}</div>
                  <div style="font-family:monospace;font-size:8.5px;color:#7dd3fc;">Aperture: ${o.apertureM}m · Bands: ${o.supportedBands.join("/").toUpperCase()}</div>
                </div>
              `).join("")}
            </div>
            <div style="font-size:10px;color:#cbd5e1;">
              <strong>${lvl.name}:</strong> ${opt.explain} · Heritage Match: <strong style="color:#fde047;">${lvl.heritage}</strong>
            </div>
          </div>
        `;
      }

      if (scenarioId === "cubesat_101") {
        const doneCount = Object.values(st.cubesatPhasesDone).filter(Boolean).length;
        return `
          <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.35);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
              <span style="font-family:monospace;font-size:10px;font-weight:700;color:#7dd3fc;letter-spacing:1px;">
                🛰️ NASA CSLI CUBESAT 101 LIFECYCLE &amp; 🇨🇦 CSA CANADARM2 / KIBO DEPLOYMENT (${doneCount}/5)
              </span>
              <button type="button" class="btn-open-csa-lab-inline" data-tab="gmat" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(103,232,249,0.45);background:rgba(103,232,249,0.14);color:#67e8f9;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">
                CUBESAT 101 GUIDE
              </button>
            </div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;">
              ${CUBESAT_101_PHASES.map((p) => {
                const on = !!st.cubesatPhasesDone[p.id];
                return `
                  <button type="button" class="cs101-phase-btn" data-id="${p.id}" title="${p.detail}" style="padding:4px 8px;border-radius:4px;border:1px solid ${on ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.16)"};background:${on ? "rgba(22,163,74,0.18)" : "rgba(0,0,0,0.35)"};color:${on ? "#86efac" : "#94a3b8"};font-family:monospace;font-size:8.5px;font-weight:700;cursor:pointer;">
                    ${on ? "☑" : "☐"} ${p.phase.split("·")[1].trim()}
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
      this.state.activeTab = initialTab || "csa";
      this._ensureModalDom();
      this.modalEl.style.display = "flex";
      if (window.spaceAudio) window.spaceAudio.playClick();
      this._renderModalContent();
    }

    closeModal() {
      if (this.modalEl) {
        this.modalEl.style.display = "none";
      }
      if (window.spaceAudio) window.spaceAudio.playClick();
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
        padding:14px;
      `;

      overlay.innerHTML = `
        <div style="width:min(1040px,96vw);max-height:90dvh;display:flex;flex-direction:column;border-radius:10px;background:#070c18;border:1px solid rgba(103,232,249,0.35);box-shadow:0 24px 64px rgba(0,0,0,0.75);color:#ece7dc;overflow:hidden;">
          <div style="padding:12px 16px;background:rgba(15,23,42,0.92);border-bottom:1px solid rgba(148,163,184,0.2);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="width:8px;height:8px;border-radius:50%;background:#67e8f9;box-shadow:0 0 8px #67e8f9;"></span>
              <div>
                <div style="font-family:var(--font-mono,monospace);font-size:11.5px;font-weight:800;letter-spacing:1.3px;color:#f8fafc;">
                  LUNASPIS // NASA &amp; CSA SPACE APPS INTERACTIVE RESOURCE LAB
                </div>
                <div style="font-family:var(--font-mono,monospace);font-size:9.5px;color:#94a3b8;">
                  CSA Digital Games &amp; Activities (RADARSAT · OSIRIS-REx OLA · Canadarm2 · Tomatosphere™) + NASA MDL, CML 1–4, GMAT &amp; Webb Telescope
                </div>
              </div>
            </div>
            <button type="button" id="btn-close-csa-nasa-lab" style="padding:5px 11px;border-radius:5px;border:1px solid rgba(239,68,68,0.5);background:rgba(239,68,68,0.14);color:#fecaca;font-family:monospace;font-size:11px;font-weight:700;cursor:pointer;">
              CLOSE &times;
            </button>
          </div>
          <div id="csa-nasa-lab-tabs" style="padding:8px 16px;background:rgba(8,13,24,0.95);border-bottom:1px solid rgba(148,163,184,0.16);display:flex;gap:6px;flex-wrap:wrap;"></div>
          <div id="csa-nasa-lab-body" style="padding:14px 16px;overflow-y:auto;flex:1;"></div>
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
        { id: "csa", label: "1. 🇨🇦 CSA DIGITAL GAMES & ACTIVITIES" },
        { id: "telescope", label: "2. 🔭 WEBB TELESCOPE GAME & CSA FGS/NIRISS" },
        { id: "gmat", label: "3. 🛰️ GMAT SCRIPT, MDL 11-DISCIPLINES & CUBESAT 101" },
        { id: "resources", label: "4. 📚 ALL 9 NASA & CSA OFFICIAL RESOURCES" }
      ];

      tabsBar.innerHTML = tabs.map((tab) => {
        const active = this.state.activeTab === tab.id;
        return `
          <button type="button" class="csa-lab-tab-btn" data-tab="${tab.id}" style="padding:7px 12px;border-radius:5px;border:1px solid ${active ? "#67e8f9" : "rgba(148,163,184,0.22)"};background:${active ? "rgba(103,232,249,0.16)" : "rgba(255,255,255,0.03)"};color:${active ? "#f8fafc" : "#94a3b8"};font-family:var(--font-mono,monospace);font-size:10px;font-weight:700;cursor:pointer;">
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

      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:12px;">
          <!-- CARD 1: CSA RADARSAT CONSTELLATION MISSION GAME -->
          <div style="padding:12px;border-radius:8px;background:rgba(15,23,42,0.75);border:1px solid rgba(52,211,153,0.35);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-family:monospace;font-size:10.5px;font-weight:700;color:#6ee7b7;">
                🇨🇦 ACTIVITY 1 · CSA RADARSAT CONSTELLATION MISSION (RCM)
              </span>
              <span style="font-family:monospace;font-size:9px;padding:2px 6px;border-radius:4px;background:rgba(52,211,153,0.16);color:#6ee7b7;">
                C-BAND SAR (3 SATELLITES)
              </span>
            </div>
            <p style="font-size:11px;color:#cbd5e1;margin:0 0 8px 0;line-height:1.4;">
              Inspired by the <a href="https://www.asc-csa.gc.ca/eng/youth-educators/digital-games-and-activities.asp" target="_blank" rel="noopener" style="color:#67e8f9;text-decoration:underline;">CSA Digital Games &amp; Activities</a> RADARSAT challenge: task Canada's 3-satellite C-Band Synthetic Aperture Radar constellation to assist Maritime Captains, Emergency Flood Responders, and Prairie Farmers.
            </p>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
              ${Object.values(RCM_SECTORS).map((s) => `
                <button type="button" class="lab-rcm-sec" data-id="${s.id}" style="padding:5px 8px;border-radius:5px;border:1px solid ${st.rcmSectorId === s.id ? "#34d399" : "rgba(255,255,255,0.14)"};background:${st.rcmSectorId === s.id ? "rgba(52,211,153,0.2)" : "rgba(0,0,0,0.35)"};color:#ece7dc;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">
                  ${st.rcmVerifiedSectors[s.id] ? "✓ " : ""}${s.role.split("·")[0].trim()}
                </button>
              `).join("")}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
              ${[
                { id: "scansar_500", label: "ScanSAR 500km (Ships & Ice)" },
                { id: "spotlight_3m", label: "Spotlight 3m (Flooding)" },
                { id: "polarimetric_30m", label: "Compact Polarimetry 30m (Soil/Crops)" }
              ].map((b) => `
                <button type="button" class="lab-rcm-beam" data-id="${b.id}" style="padding:4px 8px;border-radius:4px;border:1px solid ${st.rcmBeamId === b.id ? "#67e8f9" : "rgba(255,255,255,0.14)"};background:${st.rcmBeamId === b.id ? "rgba(103,232,249,0.2)" : "rgba(0,0,0,0.3)"};color:#e2e8f0;font-family:monospace;font-size:9px;cursor:pointer;">
                  ${b.label}
                </button>
              `).join("")}
            </div>
            <canvas id="csa-rcm-canvas" width="440" height="125" style="width:100%;height:125px;border-radius:6px;border:1px solid rgba(52,211,153,0.3);display:block;margin-bottom:6px;"></canvas>
            <div style="font-size:10.5px;color:${beamMatch ? "#86efac" : "#fde68a"};line-height:1.35;">
              <strong>${sec.role}:</strong> ${sec.targetDesc}<br/>
              <span style="color:#94a3b8;">${sec.sarSignature}</span>
            </div>
          </div>

          <!-- CARD 2: CSA OSIRIS-REx OLA BENNU SAMPLE SITE SELECTION -->
          <div style="padding:12px;border-radius:8px;background:rgba(15,23,42,0.75);border:1px solid rgba(251,191,36,0.35);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-family:monospace;font-size:10.5px;font-weight:700;color:#fde047;">
                🇨🇦 ACTIVITY 2 · CSA OSIRIS-REx LASER ALTIMETER (OLA)
              </span>
              <span style="font-family:monospace;font-size:9px;padding:2px 6px;border-radius:4px;background:rgba(251,191,36,0.16);color:#fde047;">
                3D LIDAR TAG SCANNER
              </span>
            </div>
            <p style="font-size:11px;color:#cbd5e1;margin:0 0 8px 0;line-height:1.4;">
              Canada's <strong>OSIRIS-REx Laser Altimeter (OLA)</strong> fired 10,000 laser pulses/sec to build a 2cm 3D topography map of Asteroid Bennu. Select a candidate crater to evaluate boulder tilt (&lt;10° required) and hydrated carbon richness:
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
              ${Object.values(BENNU_CANDIDATE_SITES).map((s) => `
                <button type="button" class="lab-bennu-site" data-id="${s.id}" style="padding:6px 8px;border-radius:5px;border:1px solid ${st.bennuSiteId === s.id ? "#fbbf24" : "rgba(255,255,255,0.14)"};background:${st.bennuSiteId === s.id ? "rgba(251,191,36,0.18)" : "rgba(0,0,0,0.35)"};color:#ece7dc;text-align:left;cursor:pointer;">
                  <div style="font-family:monospace;font-size:9.5px;font-weight:700;color:${s.recommended ? "#fde047" : "#ece7dc"};">${s.name.split("(")[0].trim()} ${s.recommended ? "★" : ""}</div>
                  <div style="font-family:monospace;font-size:8.5px;color:${s.tagSafe ? "#86efac" : "#fca5a5"};">Slope: ${s.slopeDeg}° · Carbon: ${s.carbonScore}%</div>
                </button>
              `).join("")}
            </div>
            <canvas id="csa-ola-canvas" width="440" height="125" style="width:100%;height:125px;border-radius:6px;border:1px solid rgba(251,191,36,0.3);display:block;margin-bottom:6px;"></canvas>
            <div style="font-size:10.5px;color:${site.tagSafe ? "#a7f3d0" : "#fecaca"};line-height:1.35;">
              <strong>${site.name}:</strong> ${site.summary}<br/>
              <span style="color:#94a3b8;">Hazard Assessment: ${site.boulderHazard}</span>
            </div>
          </div>
        </div>

        <!-- CARD 3: MISSION: ASTRONAUT — CANADARM2 / DEXTRE ROBOTICS & TOMATOSPHERE ECLSS -->
        <div style="margin-top:12px;padding:12px;border-radius:8px;background:rgba(15,23,42,0.75);border:1px solid rgba(103,232,249,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
            <span style="font-family:monospace;font-size:10.5px;font-weight:700;color:#67e8f9;">
              🇨🇦 ACTIVITY 3 · CSA "MISSION: ASTRONAUT" — CANADARM2 / DEXTRE ROBOTICS &amp; TOMATOSPHERE™ SPACE AGRICULTURE
            </span>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" id="btn-lab-open-iss-canadarm" style="padding:4px 9px;border-radius:4px;border:1px solid rgba(103,232,249,0.5);background:rgba(103,232,249,0.14);color:#67e8f9;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">
                INSPECT CANADARM2 IN 3D ISS [J]
              </button>
              <button type="button" id="btn-lab-apply-csa-preset" style="padding:4px 9px;border-radius:4px;border:1px solid rgba(52,211,153,0.5);background:rgba(52,211,153,0.16);color:#86efac;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">
                SYNC CSA PAYLOADS TO ACTIVE MISSION
              </button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;font-size:11px;color:#cbd5e1;">
            <div style="padding:9px;border-radius:6px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);">
              <div style="font-family:monospace;font-size:9.5px;font-weight:700;color:#93c5fd;margin-bottom:4px;">MOBILE SERVICING SYSTEM (CANADARM2 · DEXTRE · MBS)</div>
              <div>7-DOF robotic arm (17.6m reach, 116,000 kg payload capacity) walks end-over-end across the ISS Mobile Base System to grapple visiting vehicles and deploy CubeSats from Kibo.</div>
              <div style="margin-top:6px;font-family:monospace;font-size:9.5px;color:#86efac;">STATUS: LEE LATCH LOCKED (±0.2° alignment) · Dextre SPDM Ready</div>
            </div>
            <div style="padding:9px;border-radius:6px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);">
              <div style="font-family:monospace;font-size:9.5px;font-weight:700;color:#86efac;margin-bottom:4px;">TOMATOSPHERE™ BIOREGENERATIVE LIFE SUPPORT (ECLSS)</div>
              <div>Over 4 million students have compared space-flown vs. control tomato seeds through CSA's Tomatosphere™ program to study photosynthesis, O₂ production, and fresh food in microgravity/Mars habitats.</div>
              <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-family:monospace;font-size:9.5px;color:#fde047;">Germination Yield: ${st.tomatosphereGerminationPct}% (+CO₂ Scrubbing)</span>
                <button type="button" id="btn-toggle-tomatosphere" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(74,222,128,0.45);background:rgba(22,163,74,0.2);color:#86efac;font-family:monospace;font-size:9px;cursor:pointer;">
                  ${st.tomatosphereActive ? "CHAMBER ACTIVE" : "ACTIVATE CHAMBER"}
                </button>
              </div>
            </div>
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
      const btnIss = body.querySelector("#btn-lab-open-iss-canadarm");
      if (btnIss) {
        btnIss.addEventListener("click", () => {
          this.closeModal();
          if (window.issShowcase && typeof window.issShowcase.open === "function") {
            window.issShowcase.open();
            if (typeof window.issShowcase.selectModuleById === "function") {
              window.issShowcase.selectModuleById("canadarm2");
            }
          }
        });
      }
      const btnTom = body.querySelector("#btn-toggle-tomatosphere");
      if (btnTom) {
        btnTom.addEventListener("click", () => {
          st.tomatosphereActive = !st.tomatosphereActive;
          this._renderModalContent();
        });
      }
      const btnSync = body.querySelector("#btn-lab-apply-csa-preset");
      if (btnSync) {
        btnSync.addEventListener("click", () => {
          if (window.gameplay) {
            const md = window.gameplay.missionDesign;
            if (md.scenarioId === "earth_climate" && !md.instruments.includes("inst_sar")) {
              if (md.instruments.length < 3) md.instruments.push("inst_sar");
            } else if (md.scenarioId === "asteroid_rendezvous" && !md.instruments.includes("inst_lidar")) {
              if (md.instruments.length < 4) md.instruments.push("inst_lidar");
            }
            window.gameplay._renderResourceMeters();
            window.gameplay.showToast("CSA RADARSAT SAR & OSIRIS-REx OLA LiDAR parameters synced to Mission Design!");
          }
        });
      }
    }

    _drawRcmCanvas(canvas) {
      if (!canvas || !canvas.getContext) return;
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      const st = this.state;

      ctx.fillStyle = "#040a14";
      ctx.fillRect(0, 0, w, h);

      // Synthetic SAR radar swath grid
      ctx.strokeStyle = "rgba(52,211,153,0.16)";
      for (let x = 0; x < w; x += 28) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 24) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      if (st.rcmSectorId === "maritime_arctic") {
        // Sea ice floes + dark open shipping lead + bright ship target returns
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

        // Bright ship corner reflectors
        [[w * 0.32, h * 0.56], [w * 0.68, h * 0.44]].forEach(([sx, sy]) => {
          ctx.fillStyle = "#fde047";
          ctx.fillRect(sx - 3, sy - 3, 6, 6);
          ctx.strokeStyle = "#34d399";
          ctx.lineWidth = 1;
          ctx.strokeRect(sx - 8, sy - 8, 16, 16);
        });
      } else if (st.rcmSectorId === "flood_emergency") {
        // River flood inundation dark specular mask + bright flooded town structures
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
        ctx.fillText("FLOOD EXTENT PERIMETER", w * 0.39, h * 0.38);
      } else {
        // Agricultural field checkerboard soil-moisture heatmap
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

      ctx.fillStyle = "#6ee7b7";
      ctx.font = "bold 9.5px monospace";
      ctx.fillText(`RCM C-BAND SAR · ${st.rcmBeamId.toUpperCase()} · INCIDENCE 34°`, 10, 13);
    }

    _drawOlaCanvas(canvas) {
      if (!canvas || !canvas.getContext) return;
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      const site = BENNU_CANDIDATE_SITES[this.state.bennuSiteId] || BENNU_CANDIDATE_SITES.nightingale;

      ctx.fillStyle = "#08070c";
      ctx.fillRect(0, 0, w, h);

      // OLA LiDAR point-cloud elevation rings around crater
      const cx = w * 0.32;
      const cy = h * 0.54;
      for (let r = 46; r >= 10; r -= 9) {
        ctx.strokeStyle = r < 22 && site.tagSafe ? "rgba(74,222,128,0.65)" : "rgba(251,191,36,0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Boulders around crater rim
      const boulderCount = site.tagSafe ? 6 : 14;
      for (let i = 0; i < boulderCount; i++) {
        const ang = (i / boulderCount) * Math.PI * 2;
        const rad = site.tagSafe ? 34 + (i % 3) * 6 : 14 + (i % 4) * 7;
        const bx = cx + Math.cos(ang) * rad;
        const by = cy + Math.sin(ang) * rad;
        ctx.fillStyle = site.tagSafe ? "#f59e0b" : "#ef4444";
        ctx.fillRect(bx - 3, by - 3, 6, 6);
      }

      // Right side OLA slope & hydration profile
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 9.5px monospace";
      ctx.fillText(`CSA OLA 2cm LIDAR SCAN: ${site.name.split("(")[0].toUpperCase()}`, w * 0.54, 24);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "9.5px monospace";
      ctx.fillText(`Crater Diameter : ${site.craterDiamM} m`, w * 0.54, 44);
      ctx.fillText(`Safe TAG Radius : ${site.safeZoneRadiusM} m`, w * 0.54, 60);
      ctx.fillText(`Local Tilt Slope: ${site.slopeDeg}° (Max 10°)`, w * 0.54, 76);
      ctx.fillText(`Hydrated Clay   : ${site.hydrationPct}%`, w * 0.54, 92);
      ctx.fillStyle = site.tagSafe ? "#4ade80" : "#f87171";
      ctx.font = "bold 10px monospace";
      ctx.fillText(site.tagSafe ? "TAG STATUS: GO FOR SAMPLING" : "TAG STATUS: BOULDER / SLOPE HAZARD", w * 0.54, 112);
    }

    _renderTelescopeTab(body, t) {
      const st = this.state;
      const lvl = TELESCOPE_LEVELS[st.telescopeLevel] || TELESCOPE_LEVELS[3];
      const opt = OPTICAL_SYSTEMS[st.opticalSystemId] || OPTICAL_SYSTEMS.segmented_6_5m_hex;
      const gp = window.gameplay;
      const md = gp ? gp.missionDesign : { wavelengthId: "mid_ir" };

      body.innerHTML = `
        <div style="padding:12px;border-radius:8px;background:rgba(15,23,42,0.8);border:1px solid rgba(192,132,252,0.35);margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
            <div>
              <div style="font-family:monospace;font-size:11px;font-weight:700;color:#e9d5ff;">
                🔭 NASA "BUILD-IT-YOURSELF" SPACE TELESCOPE SIMULATOR + 🇨🇦 CSA JWST FGS / NIRISS
              </div>
              <div style="font-size:10.5px;color:#94a3b8;">
                Progress through 3 levels of increasing scientific &amp; optical engineering complexity (<a href="https://science.nasa.gov/mission/webb/game-build-it-yourself/" target="_blank" rel="noopener" style="color:#67e8f9;text-decoration:underline;">NASA Webb Telescope Game</a>).
              </div>
            </div>
            <button type="button" id="btn-tel-apply-to-mission" style="padding:6px 12px;border-radius:5px;border:1px solid #c084fc;background:rgba(192,132,252,0.2);color:#f3e8ff;font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
              LOAD INTO COSMOS-L2 MISSION
            </button>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin-bottom:10px;">
            ${Object.values(TELESCOPE_LEVELS).map((l) => `
              <div class="lab-tel-lvl" data-lvl="${l.level}" style="padding:9px;border-radius:6px;border:1px solid ${st.telescopeLevel === l.level ? "#c084fc" : "rgba(255,255,255,0.12)"};background:${st.telescopeLevel === l.level ? "rgba(192,132,252,0.16)" : "rgba(0,0,0,0.35)"};cursor:pointer;">
                <div style="font-family:monospace;font-size:10px;font-weight:700;color:#f3e8ff;">${l.name}</div>
                <div style="font-size:10px;color:#cbd5e1;margin:4px 0;">${l.desc}</div>
                <div style="font-family:monospace;font-size:9px;color:#fde047;">Match: ${l.heritage}</div>
              </div>
            `).join("")}
          </div>

          <div style="font-family:monospace;font-size:10px;font-weight:700;color:#67e8f9;margin-bottom:6px;">
            SELECT PRIMARY OPTICAL MIRROR ASSEMBLY (COUPLED TO WAVELENGTH &amp; BUS VOLUME):
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-bottom:10px;">
            ${Object.values(OPTICAL_SYSTEMS).map((o) => `
              <div class="lab-opt-card" data-id="${o.id}" style="padding:9px;border-radius:6px;border:1px solid ${st.opticalSystemId === o.id ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${st.opticalSystemId === o.id ? "rgba(103,232,249,0.15)" : "rgba(0,0,0,0.35)"};cursor:pointer;">
                <div style="font-size:10.5px;font-weight:700;color:#ece7dc;">${o.name}</div>
                <div style="font-family:monospace;font-size:9px;color:#7dd3fc;margin:3px 0;">Aperture: ${o.apertureM}m · Bands: ${o.supportedBands.join(", ").toUpperCase()}</div>
                <div style="font-size:9.5px;color:#94a3b8;">${o.explain}</div>
              </div>
            `).join("")}
          </div>

          <div style="padding:9px 11px;border-radius:6px;background:rgba(0,0,0,0.4);border:1px solid rgba(103,232,249,0.25);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div style="font-size:10.5px;color:#cbd5e1;">
              <strong>🇨🇦 Canadian Contribution to Webb (FGS / NIRISS):</strong> The CSA provided JWST's <strong>Fine Guidance Sensor (FGS)</strong> (holding the 6.5m mirror steady to 0.8 milliarcseconds) and the <strong>Near-Infrared Imager and Slitless Spectrograph (NIRISS)</strong> to detect H₂O, CO₂, and CH₄ in exoplanet atmospheres.
            </div>
            <span style="font-family:monospace;font-size:9.5px;font-weight:700;color:#86efac;">
              CURRENT OPTICS: ${opt.apertureM}m · ${lvl.heritage}
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
      const btnLoad = body.querySelector("#btn-tel-apply-to-mission");
      if (btnLoad) {
        btnLoad.addEventListener("click", () => {
          if (window.gameplay) {
            window.gameplay.missionDesign.scenarioId = "space_telescope";
            window.gameplay.applyRecommendedScenarioBaseline("space_telescope");
            if (st.opticalSystemId === "grazing_xray_shells") {
              window.gameplay.missionDesign.wavelengthId = "xray";
            } else if (st.opticalSystemId === "monolithic_1_2m" || st.opticalSystemId === "monolithic_2_4m") {
              window.gameplay.missionDesign.wavelengthId = "uv_optical";
            } else {
              window.gameplay.missionDesign.wavelengthId = "mid_ir";
            }
            window.gameplay._renderResourceMeters();
            window.gameplay.showToast(`Configured COSMOS-L2 Space Telescope (${lvl.name} · ${opt.apertureM}m Optics)`);
            this.closeModal();
          }
        });
      }
    }

    _renderGmatMdlCubesatTab(body, t) {
      const st = this.state;
      const disciplines = this.getMdlDisciplinesTable(t);
      const gmatScript = this.generateGmatScript(t);

      body.innerHTML = `
        <!-- 4 MDL STUDY LEVELS -->
        <div style="margin-bottom:12px;">
          <div style="font-family:monospace;font-size:10px;font-weight:700;color:#93c5fd;margin-bottom:6px;letter-spacing:1px;">
            NASA GSFC MISSION DESIGN LAB (MDL) · 4 STUDY LEVELS &amp; JPL CONCEPT MATURITY LEVELS (CML 1–4)
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
            ${MDL_STUDY_STAGES.map((s) => `
              <div class="lab-mdl-stage" data-id="${s.id}" style="padding:8px 10px;border-radius:6px;border:1px solid ${st.mdlStageId === s.id ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${st.mdlStageId === s.id ? "rgba(103,232,249,0.14)" : "rgba(15,23,42,0.65)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-family:monospace;font-size:9.5px;font-weight:700;color:#ece7dc;">
                  <span>${s.name}</span>
                  <span style="color:#67e8f9;">${s.cml}</span>
                </div>
                <div style="font-size:9.5px;color:#94a3b8;margin-top:3px;line-height:1.35;">${s.focus}</div>
              </div>
            `).join("")}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:12px;">
          <!-- 11 MDL DISCIPLINES TABLE -->
          <div style="padding:10px 12px;border-radius:8px;background:rgba(15,23,42,0.78);border:1px solid rgba(148,163,184,0.22);">
            <div style="font-family:monospace;font-size:10px;font-weight:700;color:#67e8f9;margin-bottom:6px;">
              MDL 11-DISCIPLINE MASTER EQUIPMENT &amp; SUBSYSTEM ASSESSMENT
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;font-size:10px;">
              ${disciplines.map((d) => `
                <div style="display:grid;grid-template-columns:1.1fr 1.2fr 0.9fr auto;gap:6px;align-items:center;padding:4px 6px;border-radius:4px;background:rgba(0,0,0,0.3);">
                  <strong style="color:#e2e8f0;">${d.discipline}</strong>
                  <span style="color:#cbd5e1;">${d.Choice}</span>
                  <span style="font-family:monospace;font-size:9px;color:#93c5fd;">${d.metric}</span>
                  <span style="font-family:monospace;font-size:8.5px;font-weight:700;color:${d.status === "NOMINAL" ? "#86efac" : "#fca5a5"};">${d.status}</span>
                </div>
              `).join("")}
            </div>
          </div>

          <!-- LIVE GMAT SCRIPT PREVIEW & EXPORT -->
          <div style="padding:10px 12px;border-radius:8px;background:rgba(15,23,42,0.78);border:1px solid rgba(59,130,246,0.35);display:flex;flex-direction:column;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="font-family:monospace;font-size:10px;font-weight:700;color:#93c5fd;">
                NASA GMAT (GSC-19468-1) MISSION SCRIPT (.SCRIPT)
              </span>
              <div style="display:flex;gap:6px;">
                <button type="button" id="btn-lab-download-gmat" style="padding:4px 9px;border-radius:4px;border:1px solid #67e8f9;background:rgba(103,232,249,0.18);color:#ecfeff;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">
                  DOWNLOAD .SCRIPT
                </button>
                <button type="button" id="btn-lab-download-mdl-json" style="padding:4px 9px;border-radius:4px;border:1px solid rgba(167,139,250,0.5);background:rgba(167,139,250,0.16);color:#ddd6fe;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">
                  EXPORT MDL .JSON
                </button>
              </div>
            </div>
            <pre style="margin:0;padding:8px;border-radius:6px;background:#030712;border:1px solid rgba(255,255,255,0.1);color:#a7f3d0;font-family:monospace;font-size:9px;line-height:1.35;max-height:260px;overflow:auto;white-space:pre;">${this._escapeHtml(gmatScript)}</pre>
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
        <div style="margin-bottom:8px;font-size:11px;color:#cbd5e1;">
          Every official NASA &amp; Canadian Space Agency (CSA) Space Apps resource is directly integrated into Lunaspis. Click any resource below to launch its interactive in-sim module or open the official agency documentation:
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(295px,1fr));gap:10px;">
          ${OFFICIAL_RESOURCES.map((res) => `
            <div style="padding:11px;border-radius:8px;background:rgba(15,23,42,0.8);border:1px solid rgba(148,163,184,0.22);display:flex;flex-direction:column;justify-content:space-between;gap:8px;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                  <span style="font-family:monospace;font-size:8.5px;font-weight:700;padding:2px 6px;border-radius:3px;background:rgba(103,232,249,0.14);color:#67e8f9;">${res.agency} · ${res.badge}</span>
                  <a href="${res.url}" target="_blank" rel="noopener" style="font-family:monospace;font-size:9px;color:#93c5fd;text-decoration:underline;">OFFICIAL LINK &nearr;</a>
                </div>
                <div style="font-size:12px;font-weight:700;color:#f8fafc;margin-bottom:4px;">${res.title}</div>
                <div style="font-size:10px;color:#94a3b8;line-height:1.38;margin-bottom:6px;">${res.summary}</div>
                <div style="font-family:monospace;font-size:9px;color:#86efac;background:rgba(22,163,74,0.1);padding:5px 7px;border-radius:4px;border:1px solid rgba(34,197,94,0.25);">
                  IN LUNASPIS: ${res.inSimFeature}
                </div>
              </div>
              <button type="button" class="lab-res-action-btn" data-action="${res.actionType}" style="width:100%;padding:6px 10px;border-radius:5px;border:1px solid rgba(103,232,249,0.45);background:rgba(37,99,235,0.2);color:#e0f2fe;font-family:monospace;font-size:9.5px;font-weight:700;cursor:pointer;">
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
