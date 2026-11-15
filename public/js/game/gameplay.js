/**
 * ============================================================================
 * NASA SPACE MISSION DESIGN, SYSTEMS ENGINEERING & SIMULATION CONSOLES
 * ============================================================================
 * Replaces arcade twitch mini-games with a realistic, understandable Space
 * Mission Design & Systems Engineering simulator across all 7 station consoles:
 * 1. [HUB] Mission Architecture, Scenario & 4-Role Team Strategy (`task_antenna`)
 * 2. [CMD] Orbit Selection, Launch Vehicle & Delta-V Compatibility (`task_nav`)
 * 3. [PWR] Spacecraft Bus, Solar/RTG Power & Eclipse Battery Sizing (`task_wires`)
 * 4. [LSS-SCI] Scientific Payload & Instrument Trade-Off Lab (`task_science`)
 * 5. [LSS-ECLSS] Thermal Rejection, Radiation Shielding & Life Support (`task_lss`)
 * 6. [HULL] Communications Link Budget, Ground Network & Propulsion (`task_hull`)
 * 7. [LDR] Full Mission Simulation, Orbital Stress Events & Evaluation (`task_landing`)
 *
 * Every decision updates live telemetry across 6 interconnected resources:
 * - BUDGET ($M) vs. Mission Cap
 * - MASS (kg) vs. Launch Vehicle Capacity to Target Orbit
 * - POWER (W) Daylight Generation & Battery Depth-of-Discharge in Eclipse
 * - DATA (GB/day) Generated vs. Ground Station Downlink Capacity
 * - COMMS LINK MARGIN (dB) & Propulsive Delta-V (m/s)
 * - MISSION LIFETIME (Months) & Scientific Return Score
 */

(function (window) {
  "use strict";

  // ==========================================================================
  // REAL-WORLD AEROSPACE CATALOGS & TRADE-OFF DATABASES
  // ==========================================================================

  const MISSION_SCENARIOS = {
    earth_climate: {
      id: "earth_climate",
      name: "Earth Climate & Cryosphere Observatory",
      code: "EARTH-EO",
      badge: "EARTH OBSERVATION",
      baseBudgetM: 380,
      targetLifetimeMonths: 36,
      recommendedOrbits: ["sso_705", "leo_400"],
      requiredScienceTypes: ["optical", "radar", "altimetry", "spectrometer"],
      minDeltaV: 420,
      minRadiationKrad: 25,
      summary: "Monitor polar ice sheet mass balance, sea-surface height, and greenhouse gas columns with global sun-synchronous coverage.",
      tradeoffTip: "Sun-Synchronous Orbit (705 km) gives consistent lighting and global polar coverage, while SAR + Laser Altimeter provide all-weather ice thickness data at the cost of high power and data rates."
    },
    lunar_south_pole: {
      id: "lunar_south_pole",
      name: "Artemis Lunar South Pole Volatiles Orbiter",
      code: "ARTEMIS-LSP",
      badge: "LUNAR EXPLORATION",
      baseBudgetM: 500,
      targetLifetimeMonths: 24,
      recommendedOrbits: ["lunar_polar_100", "gto_heo"],
      requiredScienceTypes: ["neutron", "altimetry", "spectrometer", "optical"],
      minDeltaV: 1150,
      minRadiationKrad: 50,
      summary: "Map water-ice deposits inside permanently shadowed craters at Shackleton & Shoemaker and characterize landing hazards for crewed Artemis surface missions.",
      tradeoffTip: "Lunar Polar Orbit requires high Delta-V (>1,150 m/s) for lunar orbit insertion and a Deep-Space X/Ka-Band link across 384,400 km."
    },
    asteroid_rendezvous: {
      id: "asteroid_rendezvous",
      name: "Near-Earth Asteroid (Bennu/Apophis) Rendezvous",
      code: "NEA-PROBE",
      badge: "DEEP SPACE",
      baseBudgetM: 540,
      targetLifetimeMonths: 48,
      recommendedOrbits: ["gto_heo", "lunar_polar_100"],
      requiredScienceTypes: ["spectrometer", "altimetry", "magnetometer", "neutron"],
      minDeltaV: 1650,
      minRadiationKrad: 75,
      summary: "Rendezvous with a carbon-rich Near-Earth Asteroid to map regolith composition, gravity field anomalies, and Yarkovsky orbital drift.",
      tradeoffTip: "Long 48-month deep-space lifetime demands high radiation shielding (75+ krad), Hall-Effect Ion or Bipropellant propulsion, and Deep Space Network (DSN) communications."
    },
    space_telescope: {
      id: "space_telescope",
      name: "Deep-Space Infrared & Exoplanet Observatory",
      code: "COSMOS-L2",
      badge: "ASTROPHYSICS",
      requiresWavelength: true,
      baseBudgetM: 620,
      targetLifetimeMonths: 60,
      recommendedOrbits: ["sun_earth_l2", "sso_705"],
      requiredScienceTypes: ["optical", "spectrometer"],
      minDeltaV: 1480,
      minRadiationKrad: 55,
      summary: "Couple astrophysics targets to wavelength bands, cryo-optics, and sunshield geometry in a Sun-Earth L2 halo orbit.",
      tradeoffTip: "Like NASA's JWST & Hubble build-it-yourself simulation, Mid-IR / Near-IR wavelengths require cryogenic cooling and deep-space cold sky away from Earth's thermal glow."
    },
    cubesat_101: {
      id: "cubesat_101",
      name: "CSLI 6U/12U CubeSat 101 Pathfinder",
      code: "CUBESAT-101",
      badge: "SMALLSAT / CSLI",
      isCubesat: true,
      baseBudgetM: 105,
      targetLifetimeMonths: 18,
      recommendedOrbits: ["iss_cubesat_418", "leo_400", "sso_705"],
      requiredScienceTypes: ["optical", "magnetometer"],
      minDeltaV: 85,
      minRadiationKrad: 15,
      summary: "Design a mass-constrained university CubeSat from ConOps through ISS/rideshare deployment and 5-year deorbit compliance.",
      tradeoffTip: "Choose 3U, 6U, or 12U form factors to balance mass, volume, and power while meeting NASA CSLI rideshare & 5-year End-of-Mission disposal rules."
    },
    sandbox: {
      id: "sandbox",
      name: "Open Engineering Sandbox (Custom Mission)",
      code: "SANDBOX",
      badge: "UNCONSTRAINED LAB",
      baseBudgetM: 950,
      targetLifetimeMonths: 24,
      recommendedOrbits: ["leo_400", "iss_cubesat_418", "sso_705", "gto_heo", "lunar_polar_100", "sun_earth_l2"],
      requiredScienceTypes: ["optical", "spectrometer"],
      minDeltaV: 300,
      minRadiationKrad: 20,
      summary: "Experiment freely with spacecraft buses, instruments, launchers, and orbital regimes without strict budget caps.",
      tradeoffTip: "Use Sandbox Mode to test extreme payload combinations and see how Tsiolkovsky's rocket equation and link budgets behave."
    }
  };

  const WAVELENGTH_BANDS = {
    uv_optical: {
      id: "uv_optical",
      name: "Ultraviolet & Visible (0.1–0.8 µm · Hubble / HabWorlds)",
      shortLabel: "UV / VISIBLE",
      reqThermal: null,
      avoidLowEarthThermal: false,
      minBus: "smallsat_12u",
      preferredInstIds: ["inst_multispectral", "inst_lidar"],
      explain: "Captures hot young stars, aurorae, and exoplanet reflected spectra. Operates near room temperature (~290 K) in LEO, SSO, or L2."
    },
    near_ir: {
      id: "near_ir",
      name: "Near-Infrared (0.6–5.0 µm · JWST NIRCam / Roman)",
      shortLabel: "NEAR-IR",
      reqThermal: "pumped_loop_50",
      avoidLowEarthThermal: false,
      minBus: "modular_hex",
      preferredInstIds: ["inst_ir_spec", "inst_multispectral"],
      explain: "Peeks through cosmic dust clouds to measure high-redshift galaxies and exoplanet atmospheres. Requires active heat rejection + IR Spectrometer."
    },
    mid_ir: {
      id: "mid_ir",
      name: "Mid-Infrared Cryo (5–28 µm · JWST MIRI)",
      shortLabel: "MID-IR CRYO",
      reqThermal: "cryo_rad_90",
      avoidLowEarthThermal: true,
      minBus: "modular_hex",
      preferredInstIds: ["inst_ir_spec"],
      explain: "Observes protoplanetary disks and biosignature molecules. Strictly requires the Two-Phase Cryo-Cooler Loop and a cold L2/deep-space orbit away from Earth's 290 K heat."
    },
    xray: {
      id: "xray",
      name: "Soft X-Ray High-Energy (0.1–10 keV · Chandra)",
      shortLabel: "X-RAY",
      reqThermal: "pumped_loop_50",
      avoidLowEarthThermal: false,
      minBus: "modular_hex",
      preferredInstIds: ["inst_neutron", "inst_mag"],
      explain: "Grazing-incidence nested mirrors trace black hole accretion disks and supernova remnants. Needs large hexagonal/heavy optical bench + active thermal control."
    }
  };

  const CUBESAT_FORMS = {
    "3u": {
      id: "3u",
      name: "3U Standard CubeSat (10×10×34 cm · Max 6 kg)",
      shortLabel: "3U (6 kg)",
      maxMassKg: 6,
      maxInst: 2,
      costFactor: 0.34,
      massScale: 0.022,
      powerScale: 0.16,
      explain: "Ultra-compact university form factor (~6 kg). Ideal for Kibo Canadarm2 / Nanoracks ISS deployment; fits at most 2 lightweight instruments."
    },
    "6u": {
      id: "6u",
      name: "6U Exploration CubeSat (10×20×34 cm · Max 14 kg)",
      shortLabel: "6U (14 kg)",
      maxMassKg: 14,
      maxInst: 3,
      costFactor: 0.44,
      massScale: 0.032,
      powerScale: 0.28,
      explain: "Workhorse NASA CSLI science bus (~14 kg) supporting deployable solar wings, X-band patch or cold-gas/monoprop propulsion."
    },
    "12u": {
      id: "12u",
      name: "12U Deep-Space MicroSat (20×20×34 cm · Max 28 kg)",
      shortLabel: "12U (28 kg)",
      maxMassKg: 28,
      maxInst: 3,
      costFactor: 0.54,
      massScale: 0.068,
      powerScale: 0.45,
      explain: "High-volume CubeSat (~28 kg) capable of cislunar rideshares, gimbaled high-gain dishes, and 3-instrument science suites."
    }
  };

  const DISPOSAL_OPTIONS = {
    none_drift: {
      id: "none_drift",
      name: "No End-of-Mission Disposal (Uncontrolled Drift)",
      dvCostMs: 0,
      massKg: 0,
      costM: 0,
      deorbitYears: 85,
      leoOnly: false,
      explain: "Leaves spacecraft derelict for ~85 years — non-compliant with FCC 5-Year & NASA-STD-8719.14 orbital debris mitigation standards."
    },
    drag_sail: {
      id: "drag_sail",
      name: "Passive Gossamer Drag Sail / Tether (<5 yr LEO Reentry)",
      dvCostMs: 15,
      massKg: 4,
      costM: 4,
      deorbitYears: 3.5,
      leoOnly: true,
      explain: "Lightweight deployable membrane deorbits LEO/ISS/SSO spacecraft within 3.5 years without heavy fuel reserves (ineffective above 750 km)."
    },
    controlled_deorbit: {
      id: "controlled_deorbit",
      name: "Propulsive Deorbit / Safe Graveyard Disposal Burn",
      dvCostMs: 95,
      massKg: 10,
      costM: 9,
      deorbitYears: 0.2,
      leoOnly: false,
      explain: "Reserves +95 m/s ΔV for targeted atmospheric demise (Point Nemo) or safe graveyard / heliocentric disposal in any orbit."
    }
  };

  const MISSION_ANALOGUES = {
    earth_climate: {
      missions: "NASA/CNES SWOT, ICESat-2 & CSA RADARSAT Constellation",
      productTitle: "Polar Ice-Sheet Freeboard & Sea-Level Anomaly Swath",
      agencyTag: "NASA / CSA EO"
    },
    lunar_south_pole: {
      missions: "NASA Lunar Reconnaissance Orbiter (LRO) & Lunar Trailblazer",
      productTitle: "Shackleton Crater Permanent-Shadow Water-Ice PSR Map",
      agencyTag: "NASA ARTEMIS"
    },
    asteroid_rendezvous: {
      missions: "NASA OSIRIS-REx (with CSA OLA Laser Altimeter) & APEX",
      productTitle: "Regolith Hydration Spectrum & Shape Model Altimetry",
      agencyTag: "NASA / CSA"
    },
    space_telescope: {
      missions: "NASA/ESA/CSA James Webb Space Telescope & Roman Space Telescope",
      productTitle: "Deep-Field Diffraction Image & Exoplanet Transmission Spectrum",
      agencyTag: "NASA / ESA / CSA"
    },
    cubesat_101: {
      missions: "NASA CSLI CAPSTONE / Dellingr & CSA NEOSSat (Kibo/Canadarm2)",
      productTitle: "Multi-Pass Beacon Link Closure & Earth-Limb Nadir Strip",
      agencyTag: "NASA CSLI / CSA"
    },
    sandbox: {
      missions: "NASA Goddard Mission Design Lab (MDL) Rapid Concept Archive",
      productTitle: "Multi-Discipline Systems Envelope & Trade-Space Projection",
      agencyTag: "NASA GSFC MDL"
    }
  };

  const DIFFICULTY_LEVELS = {
    cadet: {
      id: "cadet",
      name: "Cadet (Guided Systems)",
      budgetMultiplier: 1.25,
      massMarginPct: 5,
      desc: "+25% funding reserve and forgiving mass/power margins with plain-language engineering hints."
    },
    engineer: {
      id: "engineer",
      name: "Systems Engineer (Standard NASA Phase-A)",
      budgetMultiplier: 1.0,
      massMarginPct: 10,
      desc: "Realistic NASA Phase-A mission design constraints requiring balanced trade-offs across all subsystems."
    },
    director: {
      id: "director",
      name: "Flight Director (Strict Margins & Anomalies)",
      budgetMultiplier: 0.88,
      massMarginPct: 15,
      desc: "Tighter budget cap (-12%), strict 15% dry-mass reserve requirement, and severe orbital solar storm stress tests."
    }
  };

  const ORBIT_OPTIONS = {
    leo_400: {
      id: "leo_400",
      name: "Low Earth Orbit (LEO · 400 km · 51.6° ISS)",
      altitudeKm: 400,
      inclinationDeg: 51.6,
      periodMin: 92.6,
      eclipseFraction: 0.36,
      reqInsertionDv: 380,
      radiationEnvKrad: 20,
      pathLossDb: 152,
      contactMinPerDay: 110,
      solarFluxFactor: 1.0,
      explain: "Low altitude maximizes launch vehicle payload capacity and optical resolution, but atmospheric drag requires regular reboost and ground station passes are short (~9 min each)."
    },
    sso_705: {
      id: "sso_705",
      name: "Sun-Synchronous Polar Orbit (SSO · 705 km · 98.2°)",
      altitudeKm: 705,
      inclinationDeg: 98.2,
      periodMin: 98.8,
      eclipseFraction: 0.28,
      reqInsertionDv: 540,
      radiationEnvKrad: 35,
      pathLossDb: 157,
      contactMinPerDay: 145,
      solarFluxFactor: 1.0,
      explain: "Precesses at 0.9856°/day to match Earth's orbit around the Sun, crossing every latitude at the exact same local solar time—ideal for global climate & polar ice mapping."
    },
    gto_heo: {
      id: "gto_heo",
      name: "High Elliptical / Geostationary Transfer (HEO · 500×35,786 km)",
      altitudeKm: 35786,
      inclinationDeg: 27.0,
      periodMin: 635.0,
      eclipseFraction: 0.14,
      reqInsertionDv: 1250,
      radiationEnvKrad: 65,
      pathLossDb: 188,
      contactMinPerDay: 420,
      solarFluxFactor: 1.0,
      explain: "Long dwell time over hemisphere apogee with short eclipses, but passes twice per orbit through the Van Allen radiation belts (requiring heavy shielding and high Delta-V)."
    },
    lunar_polar_100: {
      id: "lunar_polar_100",
      name: "Lunar Polar Mapping Orbit (LPO · 100 km · 90.0°)",
      altitudeKm: 384400,
      inclinationDeg: 90.0,
      periodMin: 118.0,
      eclipseFraction: 0.32,
      reqInsertionDv: 1380,
      radiationEnvKrad: 55,
      pathLossDb: 211,
      contactMinPerDay: 540,
      solarFluxFactor: 1.0,
      explain: "Orbits directly over the Lunar North and South Poles every 118 minutes. Requires Trans-Lunar Injection + Lunar Orbit Insertion burn and high-gain deep-space communications."
    },
    iss_cubesat_418: {
      id: "iss_cubesat_418",
      name: "ISS Kibo / Nanoracks CubeSat Orbit (418 km · 51.6°)",
      altitudeKm: 418,
      inclinationDeg: 51.6,
      periodMin: 92.9,
      eclipseFraction: 0.36,
      reqInsertionDv: 65,
      radiationEnvKrad: 18,
      pathLossDb: 152,
      contactMinPerDay: 120,
      solarFluxFactor: 1.0,
      explain: "Deployed directly from the ISS Kibo airlock via CSA Canadarm2 & NRCSD. Low insertion ΔV, <5 yr natural decay, ideal for CSLI university CubeSats."
    },
    sun_earth_l2: {
      id: "sun_earth_l2",
      name: "Sun-Earth L2 Halo Orbit (1,500,000 km · Cryo Dark-Sky)",
      altitudeKm: 1500000,
      inclinationDeg: 0.0,
      periodMin: 180.0,
      eclipseFraction: 0.04,
      reqInsertionDv: 1480,
      radiationEnvKrad: 60,
      pathLossDb: 218,
      contactMinPerDay: 680,
      solarFluxFactor: 0.99,
      explain: "Deep-space gravitational balance point 1.5M km anti-sunward (JWST / Roman). Keeps Earth and Sun on one side of the sunshield for cryogenic infrared astronomy."
    }
  };

  const LAUNCH_VEHICLES = {
    electron_light: {
      id: "electron_light",
      name: "Light Commercial Launcher (Electron / Minotaur Class)",
      costM: 28,
      fairingM: 1.8,
      reliabilityPct: 95,
      capacityKg: { leo_400: 320, iss_cubesat_418: 310, sso_705: 220, gto_heo: 90, lunar_polar_100: 55, sun_earth_l2: 45 },
      explain: "Low-cost dedicated smallsat launcher. Great for budget missions, but strictly limits total spacecraft wet mass to under 320 kg in LEO."
    },
    falcon_medium: {
      id: "falcon_medium",
      name: "Medium Reusable Workhorse (Falcon 9 / Vulcan Class)",
      costM: 72,
      fairingM: 5.2,
      reliabilityPct: 99,
      capacityKg: { leo_400: 2200, iss_cubesat_418: 2150, sso_705: 1650, gto_heo: 950, lunar_polar_100: 680, sun_earth_l2: 640 },
      explain: "Industry-standard partially reusable orbital workhorse with 99% flight heritage and generous payload capacity across LEO, SSO, and Lunar transfer."
    },
    ariane_heavy: {
      id: "ariane_heavy",
      name: "Heavy Deep-Space Launcher (Falcon Heavy / New Glenn Class)",
      costM: 118,
      fairingM: 5.4,
      reliabilityPct: 98,
      capacityKg: { leo_400: 4800, iss_cubesat_418: 4700, sso_705: 3600, gto_heo: 2200, lunar_polar_100: 1600, sun_earth_l2: 1550 },
      explain: "High-energy multi-core launch vehicle capable of injecting heavy multi-instrument observatories directly into high-energy lunar or deep-space trajectories."
    },
    sls_superheavy: {
      id: "sls_superheavy",
      name: "Super-Heavy Exploration Stack (SLS Block 1B / Starship Class)",
      costM: 175,
      fairingM: 8.4,
      reliabilityPct: 97,
      capacityKg: { leo_400: 9500, iss_cubesat_418: 9400, sso_705: 7500, gto_heo: 4800, lunar_polar_100: 3800, sun_earth_l2: 3600 },
      explain: "Maximum lift capacity and 8.4m fairing volume for flagship missions, but consumes a major share of total mission budget ($175M)."
    }
  };

  const SPACECRAFT_BUSES = {
    smallsat_12u: {
      id: "smallsat_12u",
      name: "12U / ESPA MicroSat Bus",
      glbId: "modular_spacecraft_bus_smallsat",
      dryMassKg: 85,
      costM: 22,
      maxInstruments: 3,
      basePowerLoadW: 65,
      structuralRating: 75,
      explain: "Compact, agile aluminum-lithium microsatellite bus. Low mass and cost, but limited to 3 instruments and modest internal volume."
    },
    modular_hex: {
      id: "modular_hex",
      name: "Modular Hexagonal Standard Bus",
      glbId: "modular_spacecraft_bus_hex",
      dryMassKg: 240,
      costM: 52,
      maxInstruments: 4,
      basePowerLoadW: 135,
      structuralRating: 92,
      explain: "Balanced NASA/ESA hexagonal composite bus with 3-axis reaction wheels, star trackers, and 4 instrument bays."
    },
    deep_space_heavy: {
      id: "deep_space_heavy",
      name: "Flagship Deep-Space Heavy Bus",
      glbId: "modular_spacecraft_bus_heavy",
      dryMassKg: 460,
      costM: 94,
      maxInstruments: 6,
      basePowerLoadW: 210,
      structuralRating: 99,
      explain: "Redundant avionics, dual star-tracker optical navigation, and 6 payload bays built for flagship lunar and interplanetary missions."
    }
  };

  const POWER_SYSTEMS = {
    body_solar: {
      id: "body_solar",
      name: "Body-Mounted Triple-Junction GaAs Solar Panels",
      genW: 260,
      massKg: 18,
      costM: 14,
      isNuclear: false,
      explain: "Lightweight and mechanically simple with zero deployment failure risk, but limits continuous payload power to ~260 W."
    },
    deployable_rosa: {
      id: "deployable_rosa",
      name: "Dual Roll-Out Solar Arrays (ROSA · 2-Axis Gimbal)",
      genW: 680,
      massKg: 46,
      costM: 34,
      isNuclear: false,
      explain: "High-efficiency sun-tracking solar wings generating 680 W in sunlight. Requires battery storage during orbital eclipse."
    },
    high_power_wings: {
      id: "high_power_wings",
      name: "Quad High-Power concentrator Solar Wings + MMRTG Aux",
      genW: 1180,
      massKg: 88,
      costM: 68,
      isNuclear: true,
      explain: "Combines 4 solar wings with a continuous radioisotope baseline—ideal for power-hungry Radar (SAR) and LiDAR payloads."
    }
  };

  const BATTERY_PACKS = {
    li_ion_120: {
      id: "li_ion_120",
      name: "120 Wh Aerospace Li-Ion Pack",
      capacityWh: 120,
      massKg: 12,
      costM: 8,
      explain: "Ultra-light battery for low-power instruments, but risks deep discharge (>80% DoD) if high-draw sensors run during eclipse."
    },
    li_ion_320: {
      id: "li_ion_320",
      name: "320 Wh Redundant Li-Ion Battery Bank",
      capacityWh: 320,
      massKg: 28,
      costM: 19,
      explain: "Standard flight battery bank keeping eclipse Depth-of-Discharge under 50% for long battery cycle life (36+ months)."
    },
    solid_state_640: {
      id: "solid_state_640",
      name: "640 Wh High-Density Solid-State Array",
      capacityWh: 640,
      massKg: 52,
      costM: 36,
      explain: "Supports continuous Radar/LiDAR operation right through shadowed lunar craters and long orbital eclipses."
    }
  };

  const SCIENTIFIC_INSTRUMENTS = [
    {
      id: "inst_multispectral",
      name: "High-Res Multispectral Optical Imager",
      type: "optical",
      massKg: 38,
      powerW: 55,
      costM: 32,
      dataMbps: 42,
      scienceVal: 26,
      explain: "0.5m resolution visible/near-IR pushbroom camera for surface geology, ice sheet fractures, and landing site hazard mapping."
    },
    {
      id: "inst_sar",
      name: "L-Band Synthetic Aperture Radar (SAR Interferometer)",
      type: "radar",
      massKg: 115,
      powerW: 210,
      costM: 68,
      dataMbps: 95,
      scienceVal: 38,
      explain: "Penetrates clouds, polar night, and regolith to measure millimeter-scale surface deformation and subsurface ice—very high mass, power, and data volume."
    },
    {
      id: "inst_lidar",
      name: "Topographic Laser Altimeter (Multi-Beam LiDAR)",
      type: "altimetry",
      massKg: 64,
      powerW: 110,
      costM: 45,
      dataMbps: 28,
      scienceVal: 31,
      explain: "Fires 10,000 laser pulses/sec to measure 3D elevation of polar ice sheets, lunar crater slopes, and asteroid shape models with 10 cm vertical precision."
    },
    {
      id: "inst_ir_spec",
      name: "Thermal & Near-IR Fourier Spectrometer",
      type: "spectrometer",
      massKg: 42,
      powerW: 65,
      costM: 38,
      dataMbps: 22,
      scienceVal: 29,
      explain: "Identifies mineral composition, OH/H₂O absorption bands at 3.0 µm, and atmospheric greenhouse gas profiles (CO₂ / CH₄)."
    },
    {
      id: "inst_neutron",
      name: "Neutron & Gamma-Ray Volatiles Spectrometer",
      type: "neutron",
      massKg: 34,
      powerW: 38,
      costM: 30,
      dataMbps: 8,
      scienceVal: 28,
      explain: "Detects hydrogen and water-ice buried up to 1 meter beneath the lunar or asteroid surface by measuring cosmic-ray neutron moderation."
    },
    {
      id: "inst_mag",
      name: "Deployable Fluxgate Magnetometer & Plasma Boom",
      type: "magnetometer",
      massKg: 19,
      powerW: 22,
      costM: 18,
      dataMbps: 5,
      scienceVal: 20,
      explain: "Low-mass, low-power 6-meter boom measuring planetary magnetic anomalies, solar wind interaction, and space weather radiation events."
    }
  ];

  const THERMAL_RADIATION_PACKAGES = {
    passive_mli: {
      id: "passive_mli",
      name: "Passive MLI Blankets & Base Spot Shielding (25 krad)",
      massKg: 22,
      powerW: 12,
      costM: 12,
      radRatingKrad: 25,
      thermalCapW: 380,
      lifetimeBonusMonths: 0,
      explain: "Multi-Layer Insulation and local tantalum spot-shielding suitable for short LEO missions inside Earth's protective magnetosphere."
    },
    pumped_loop_50: {
      id: "pumped_loop_50",
      name: "Deployable Ammonia Heat-Pipe Radiators + 50 krad Vault",
      massKg: 54,
      powerW: 28,
      costM: 28,
      radRatingKrad: 55,
      thermalCapW: 820,
      lifetimeBonusMonths: 12,
      explain: "Actively rejects up to 820 W of waste heat and protects avionics up to 55 krad Total Ionizing Dose for SSO and Lunar Polar orbits."
    },
    cryo_rad_90: {
      id: "cryo_rad_90",
      name: "Two-Phase Cryo-Cooler Loop + 90 krad Deep-Space Vault",
      massKg: 92,
      powerW: 48,
      costM: 48,
      radRatingKrad: 95,
      thermalCapW: 1400,
      lifetimeBonusMonths: 24,
      explain: "Cryogenic thermal stability for IR spectrometers plus hardened 95 krad avionics enclosure for multi-year Van Allen belt or deep-space operations."
    }
  };

  const COMMS_PACKAGES = {
    s_band_omni: {
      id: "s_band_omni",
      name: "S-Band Patch Antenna (2 GHz · Low-Rate Telemetry)",
      rateMbps: 8,
      eirpDbw: 162,
      massKg: 9,
      powerW: 18,
      costM: 10,
      explain: "Wide-beam antenna that works even if spacecraft attitude drifts, but only transmits 8 Mbps—too slow for high-resolution Radar or Imagers."
    },
    x_band_hga: {
      id: "x_band_hga",
      name: "X-Band 0.8m High-Gain Parabolic Dish (8.4 GHz)",
      rateMbps: 120,
      eirpDbw: 186,
      massKg: 26,
      powerW: 45,
      costM: 26,
      explain: "Standard science downlink dish delivering 120 Mbps and strong link margin across LEO, SSO, and cislunar distances."
    },
    ka_band_optical: {
      id: "ka_band_optical",
      name: "Ka-Band Gimbaled Dish + Optical Lasercomm Terminal",
      rateMbps: 450,
      eirpDbw: 204,
      massKg: 48,
      powerW: 78,
      costM: 46,
      explain: "Ultra-high-bandwidth 450 Mbps downlink with 204 dBW effective isotropic radiated power for SAR interferometry and deep-space missions."
    }
  };

  const GROUND_NETWORKS = {
    regional_vhs: {
      id: "regional_vhs",
      name: "University / Regional Ground Network (3 Stations)",
      gainDb: 18,
      contactMultiplier: 0.65,
      costM: 8,
      explain: "Low operational cost, but limited contact windows per day."
    },
    near_space_net: {
      id: "near_space_net",
      name: "NASA Near Space Network + Polar Svalbard/McMurdo",
      gainDb: 34,
      contactMultiplier: 1.15,
      costM: 22,
      explain: "High-latitude polar ground stations provide frequent passes every orbit for LEO and Sun-Synchronous satellites."
    },
    dsn_goldstone: {
      id: "dsn_goldstone",
      name: "NASA Deep Space Network (34m/70m Goldstone · Madrid · Canberra)",
      gainDb: 52,
      contactMultiplier: 1.6,
      costM: 42,
      explain: "Three 70m/34m dish complexes spaced 120° around Earth provide continuous 24/7 coverage and +52 dB receiver gain for Lunar and Asteroid missions."
    }
  };

  const PROPULSION_SYSTEMS = {
    cold_gas: {
      id: "cold_gas",
      name: "Cold-Gas Nitrogen Thrusters (Isp = 72 s)",
      ispSec: 72,
      dryMassKg: 14,
      propellantKg: 35,
      costM: 10,
      powerW: 10,
      explain: "Simple, clean thrusters for basic attitude desaturation, but very low specific impulse (72 s) yields minimal Delta-V."
    },
    hydrazine_mono: {
      id: "hydrazine_mono",
      name: " Catalyzed Monopropellant Hydrazine (Isp = 230 s)",
      ispSec: 230,
      dryMassKg: 32,
      propellantKg: 140,
      costM: 24,
      powerW: 18,
      explain: "Reliable orbital insertion and drag-make-up propulsion providing moderate Delta-V for LEO and SSO missions."
    },
    biprop_nto_mmh: {
      id: "biprop_nto_mmh",
      name: "Hypergolic Bipropellant Main Engine (MMH/NTO · Isp = 318 s)",
      ispSec: 318,
      dryMassKg: 58,
      propellantKg: 380,
      costM: 44,
      powerW: 28,
      explain: "High-thrust chemical propulsion essential for rapid Lunar Orbit Insertion (LOI) and deep-space trajectory maneuvers."
    },
    hall_ion_sep: {
      id: "hall_ion_sep",
      name: "Solar Electric Xenon Hall-Effect Thruster (Isp = 1,850 s)",
      ispSec: 1850,
      dryMassKg: 64,
      propellantKg: 135,
      costM: 58,
      powerW: 145,
      explain: "Uses electric fields to accelerate Xenon ions to 18 km/s—achieving huge Delta-V (>2,200 m/s) with minimal fuel mass, at the cost of 145 W continuous power."
    }
  };

  class GameplayEngine {
    constructor() {
      // Retain exact 7 task IDs and station coordinates for 100% server & 6-room map compatibility
      this.tasks = [
        {
          id: "task_antenna",
          kind: "mission-architecture",
          stationId: "hub",
          code: "HUB",
          name: "Mission Charter",
          location: "Transit Hub [HUB]",
          pos: [0.0, 0.0, 1.5],
          role: "commander",
          resource: "budget",
          requires: [],
          completed: false
        },
        {
          id: "task_nav",
          kind: "orbit-launch",
          stationId: "command",
          code: "CMD",
          name: "Orbit & Launch",
          location: "Command Deck [CMD]",
          pos: [0.0, 0.0, -9.5],
          role: "commander",
          resource: "mass",
          requires: ["task_antenna"],
          completed: false
        },
        {
          id: "task_wires",
          kind: "bus-power",
          stationId: "power",
          code: "PWR",
          name: "Power & Bus",
          location: "Power Bay [PWR]",
          pos: [-9.5, 0.0, 0.0],
          role: "engineer",
          resource: "power",
          requires: ["task_antenna"],
          completed: false
        },
        {
          id: "task_science",
          kind: "science-payload",
          stationId: "life-support",
          code: "SCI",
          name: "Science Payload",
          location: "Science Lab [SCI]",
          pos: [8.5, 0.0, -2.2],
          role: "scientist",
          resource: "data",
          requires: ["task_antenna"],
          completed: false
        },
        {
          id: "task_lss",
          kind: "thermal-radiation",
          stationId: "life-support",
          code: "LSS",
          name: "Thermal & ECLSS",
          location: "Life Support [LSS]",
          pos: [9.5, 0.0, 0.0],
          role: "scientist",
          resource: "lifetime",
          requires: ["task_wires", "task_science"],
          completed: false
        },
        {
          id: "task_hull",
          kind: "comms-propulsion",
          stationId: "hull",
          code: "HULL",
          name: "Comms & Propulsion",
          location: "Engineering Bay [ENG]",
          pos: [0.0, 0.0, 9.1],
          role: "engineer",
          resource: "comms",
          requires: ["task_nav", "task_wires"],
          completed: false
        },
        {
          id: "task_landing",
          kind: "mission-simulation",
          stationId: "lander",
          code: "LDR",
          name: "Mission Simulation",
          location: "Simulation Deck [SIM]",
          pos: [0.0, 0.0, 17.4],
          role: "all",
          resource: "science",
          requires: ["task_hull", "task_lss"],
          completed: false
        }
      ];

      // Complete Space Mission Design State (modifiable across all consoles)
      this.missionDesign = {
        scenarioId: "lunar_south_pole",
        difficultyId: "engineer",
        orbitId: "lunar_polar_100",
        launchVehicleId: "falcon_medium",
        busId: "modular_hex",
        powerId: "deployable_rosa",
        batteryId: "li_ion_320",
        instruments: ["inst_multispectral", "inst_lidar", "inst_neutron"],
        thermalId: "pumped_loop_50",
        commsId: "x_band_hga",
        groundNetId: "dsn_goldstone",
        propulsionId: "biprop_nto_mmh",
        wavelengthId: "near_ir",
        cubesatFormId: "6u",
        disposalId: "controlled_deorbit",
        lastSimulationReport: null
      };

      this.tradeBaselineA = null;
      this._pdRenderer = null;
      this._pdScene = null;
      this._pdCamera = null;
      this._pdGroup = null;
      this._pdLastKey = "";
      this._pdAnimId = 0;

      this.telemetry = this.evaluateMissionDesign();
      this.resources = {
        hull: 96,
        power: 92,
        oxygen: 95,
        fuel: 94
      };
      this._criticalResources = {};
      this._knownCompletedTasks = new Set();

      this.activeTask = null;
      this.nearbyTask = null;
      this.activeCleanup = null;
    }

    init() {
      this.bindUI();
      this.setupNetwork();
      this._buildResourceMetersBar();
      this.updateTaskListUI();
      if (window.shipInterior && typeof window.shipInterior.syncStationFaults === "function") {
        window.shipInterior.syncStationFaults(this.tasks);
      }
    }

    // ========================================================================
    // SHARED MISSION DEFINITION, OBJECTIVE LOCKS & DESIGN SYNC
    // ========================================================================
    getScenarioCatalog() {
      return Object.values(MISSION_SCENARIOS).map((scenario) => ({
        id: scenario.id,
        name: scenario.name,
        code: scenario.code,
        badge: scenario.badge,
        summary: scenario.summary,
        baseBudgetM: scenario.baseBudgetM,
        targetLifetimeMonths: scenario.targetLifetimeMonths,
        recommendedOrbits: (scenario.recommendedOrbits || []).map(
          (orbitId) => (ORBIT_OPTIONS[orbitId] && ORBIT_OPTIONS[orbitId].name) || orbitId
        ),
        requiredScienceTypes: scenario.requiredScienceTypes || [],
        minDeltaV: scenario.minDeltaV,
        minRadiationKrad: scenario.minRadiationKrad
      }));
    }

    getDifficultyCatalog() {
      return Object.values(DIFFICULTY_LEVELS).map((difficulty) => ({
        id: difficulty.id,
        name: difficulty.name,
        budgetMultiplier: difficulty.budgetMultiplier,
        massMarginPct: difficulty.massMarginPct,
        desc: difficulty.desc
      }));
    }

    syncTasksFromMission(mission) {
      if (!mission || !Array.isArray(mission.completedObjectives)) return;
      const completed = new Set(mission.completedObjectives);
      this.tasks.forEach((task) => {
        task.completed = completed.has(task.id);
      });
      this.lastSyncedTaskCount = completed.size;
    }

    syncMissionUi(mission) {
      if (!mission) return;
      // Merge remote mission-design edits even while a local console is open.
      // Do not re-render the active console body (it may be mid-edit); the
      // underlying design and HUD telemetry stay authoritative.
      if (mission.design && typeof mission.design === "object") {
        const design = Object.assign({}, mission.design);
        if (Array.isArray(design.instruments)) design.instruments = design.instruments.slice();
        Object.assign(this.missionDesign, design);
      }
      this.syncTasksFromMission(mission);
      this.telemetry = this.evaluateMissionDesign();
      this._renderResourceMeters();
      this.updateTaskListUI();
      const completed = Array.isArray(mission.completedObjectives) ? mission.completedObjectives.length : 0;
      this.updateTaskBar({ completed, total: this.tasks.length });
    }

    applyMissionDefinition(mission) {
      if (!mission) return;
      if (mission.scenarioId && MISSION_SCENARIOS[mission.scenarioId]) {
        this.missionDesign.scenarioId = mission.scenarioId;
      }
      if (mission.difficultyId && DIFFICULTY_LEVELS[mission.difficultyId]) {
        this.missionDesign.difficultyId = mission.difficultyId;
      }
      if (mission.design && typeof mission.design === "object") {
        const design = Object.assign({}, mission.design);
        if (Array.isArray(design.instruments)) design.instruments = design.instruments.slice();
        Object.assign(this.missionDesign, design);
      }
      this.syncTasksFromMission(mission);
      this.telemetry = this.evaluateMissionDesign();
      this._renderResourceMeters();
      this.updateTaskListUI();
      this.updateTaskBar();
    }

    getMissionState() {
      return window.netManager && typeof window.netManager.getMission === "function"
        ? window.netManager.getMission()
        : null;
    }

    isTaskAvailable(taskId, mission) {
      if (!mission || !Array.isArray(mission.availableObjectives)) return true;
      return mission.availableObjectives.indexOf(taskId) !== -1;
    }

    getTaskLockReason(taskId, mission) {
      if (!mission || !Array.isArray(mission.objectives)) return "";
      const def = mission.objectives.find((objective) => objective.id === taskId);
      if (!def) return "";
      const completed = new Set(mission.completedObjectives || []);
      const missing = (def.dependsOn || []).filter((dependency) => !completed.has(dependency));
      if (!missing.length) return "";
      const titles = missing.map((dependency) => {
        const dep = mission.objectives.find((objective) => objective.id === dependency);
        return dep ? dep.title : dependency;
      });
      return `Requires ${titles.join(" + ")}`;
    }

    buildDesignPatch(task) {
      const md = this.missionDesign;
      switch (task.id) {
        case "task_antenna":
          return {
            scenarioId: md.scenarioId,
            difficultyId: md.difficultyId,
            wavelengthId: md.wavelengthId,
            cubesatFormId: md.cubesatFormId
          };
        case "task_nav":
          return { orbitId: md.orbitId, launchVehicleId: md.launchVehicleId };
        case "task_wires":
          return {
            busId: md.busId,
            powerId: md.powerId,
            batteryId: md.batteryId,
            cubesatFormId: md.cubesatFormId
          };
        case "task_science":
          return {
            instruments: (md.instruments || []).slice(),
            wavelengthId: md.wavelengthId
          };
        case "task_lss":
          return { thermalId: md.thermalId };
        case "task_hull":
          return {
            commsId: md.commsId,
            groundNetId: md.groundNetId,
            propulsionId: md.propulsionId,
            disposalId: md.disposalId
          };
        default:
          return null;
      }
    }

    syncFullDesignPatch() {
      const md = this.missionDesign;
      return {
        scenarioId: md.scenarioId,
        difficultyId: md.difficultyId,
        orbitId: md.orbitId,
        launchVehicleId: md.launchVehicleId,
        busId: md.busId,
        powerId: md.powerId,
        batteryId: md.batteryId,
        instruments: (md.instruments || []).slice(),
        thermalId: md.thermalId,
        commsId: md.commsId,
        groundNetId: md.groundNetId,
        propulsionId: md.propulsionId,
        wavelengthId: md.wavelengthId,
        cubesatFormId: md.cubesatFormId,
        disposalId: md.disposalId
      };
    }

    applyRecommendedScenarioBaseline(scenarioId) {
      const md = this.missionDesign;
      if (scenarioId === "earth_climate") {
        md.orbitId = "sso_705";
        md.launchVehicleId = "falcon_medium";
        md.busId = "smallsat_12u";
        md.powerId = "deployable_rosa";
        md.batteryId = "li_ion_320";
        md.instruments = ["inst_multispectral", "inst_ir_spec"];
        md.thermalId = "pumped_loop_50";
        md.commsId = "ka_band_optical";
        md.groundNetId = "near_space_net";
        md.propulsionId = "hydrazine_mono";
        md.disposalId = "drag_sail";
      } else if (scenarioId === "lunar_south_pole") {
        md.orbitId = "lunar_polar_100";
        md.launchVehicleId = "ariane_heavy";
        md.busId = "modular_hex";
        md.powerId = "deployable_rosa";
        md.batteryId = "solid_state_640";
        md.instruments = ["inst_multispectral", "inst_lidar", "inst_neutron"];
        md.thermalId = "pumped_loop_50";
        md.commsId = "x_band_hga";
        md.groundNetId = "dsn_goldstone";
        md.propulsionId = "biprop_nto_mmh";
        md.disposalId = "controlled_deorbit";
      } else if (scenarioId === "asteroid_rendezvous") {
        md.orbitId = "lunar_polar_100";
        md.launchVehicleId = "ariane_heavy";
        md.busId = "modular_hex";
        md.powerId = "high_power_wings";
        md.batteryId = "li_ion_320";
        md.instruments = ["inst_ir_spec", "inst_mag", "inst_neutron"];
        md.thermalId = "cryo_rad_90";
        md.commsId = "x_band_hga";
        md.groundNetId = "dsn_goldstone";
        md.propulsionId = "hall_ion_sep";
        md.disposalId = "controlled_deorbit";
      } else if (scenarioId === "space_telescope") {
        md.wavelengthId = "mid_ir";
        md.orbitId = "sun_earth_l2";
        md.launchVehicleId = "ariane_heavy";
        md.busId = "deep_space_heavy";
        md.powerId = "high_power_wings";
        md.batteryId = "li_ion_320";
        md.instruments = ["inst_multispectral", "inst_ir_spec"];
        md.thermalId = "cryo_rad_90";
        md.commsId = "ka_band_optical";
        md.groundNetId = "dsn_goldstone";
        md.propulsionId = "hall_ion_sep";
        md.disposalId = "controlled_deorbit";
      } else if (scenarioId === "cubesat_101") {
        md.cubesatFormId = "6u";
        md.orbitId = "iss_cubesat_418";
        md.launchVehicleId = "electron_light";
        md.busId = "smallsat_12u";
        md.powerId = "deployable_rosa";
        md.batteryId = "li_ion_320";
        md.instruments = ["inst_multispectral", "inst_mag"];
        md.thermalId = "passive_mli";
        md.commsId = "s_band_omni";
        md.groundNetId = "near_space_net";
        md.propulsionId = "hydrazine_mono";
        md.disposalId = "drag_sail";
      }
      this._renderResourceMeters();
    }

    // ========================================================================
    // INTEGRATED SYSTEMS ENGINEERING PHYSICS & RESOURCE SOLVER
    // ========================================================================
    evaluateMissionDesign() {
      const md = this.missionDesign;
      const scenario = MISSION_SCENARIOS[md.scenarioId] || MISSION_SCENARIOS.lunar_south_pole;
      const difficulty = DIFFICULTY_LEVELS[md.difficultyId] || DIFFICULTY_LEVELS.engineer;
      const orbit = ORBIT_OPTIONS[md.orbitId] || ORBIT_OPTIONS.lunar_polar_100;
      const lv = LAUNCH_VEHICLES[md.launchVehicleId] || LAUNCH_VEHICLES.falcon_medium;
      const bus = SPACECRAFT_BUSES[md.busId] || SPACECRAFT_BUSES.modular_hex;
      const pwr = POWER_SYSTEMS[md.powerId] || POWER_SYSTEMS.deployable_rosa;
      const bat = BATTERY_PACKS[md.batteryId] || BATTERY_PACKS.li_ion_320;
      const thm = THERMAL_RADIATION_PACKAGES[md.thermalId] || THERMAL_RADIATION_PACKAGES.pumped_loop_50;
      const com = COMMS_PACKAGES[md.commsId] || COMMS_PACKAGES.x_band_hga;
      const gnd = GROUND_NETWORKS[md.groundNetId] || GROUND_NETWORKS.dsn_goldstone;
      const prop = PROPULSION_SYSTEMS[md.propulsionId] || PROPULSION_SYSTEMS.biprop_nto_mmh;
      const wavelength = WAVELENGTH_BANDS[md.wavelengthId] || WAVELENGTH_BANDS.near_ir;
      const cubesatForm = CUBESAT_FORMS[md.cubesatFormId] || CUBESAT_FORMS["6u"];
      const disposal = DISPOSAL_OPTIONS[md.disposalId] || DISPOSAL_OPTIONS.controlled_deorbit;

      const selectedInsts = SCIENTIFIC_INSTRUMENTS.filter((inst) => md.instruments.includes(inst.id));

      // 1. BUDGET ($M)
      const budgetCapM = Math.round(scenario.baseBudgetM * difficulty.budgetMultiplier);
      const instCostM = selectedInsts.reduce((acc, i) => acc + i.costM, 0);
      const rawTotalCostM = lv.costM + bus.costM + pwr.costM + bat.costM + thm.costM + com.costM + gnd.costM + prop.costM + instCostM + disposal.costM;
      const totalCostM = scenario.isCubesat
        ? Math.max(12, Math.round(rawTotalCostM * cubesatForm.costFactor))
        : rawTotalCostM;
      const budgetRemainingM = budgetCapM - totalCostM;
      const budgetOk = totalCostM <= budgetCapM;

      // 2. MASS (kg) & LAUNCH VEHICLE / CUBESAT FORM FACTOR COMPATIBILITY
      const instMassKg = selectedInsts.reduce((acc, i) => acc + i.massKg, 0);
      const rawDryMassKg = bus.dryMassKg + pwr.massKg + bat.massKg + thm.massKg + com.massKg + prop.dryMassKg + instMassKg + disposal.massKg;
      const rawWetMassKg = rawDryMassKg + prop.propellantKg;
      const massScale = scenario.isCubesat ? cubesatForm.massScale : 1.0;
      const dryMassKg = scenario.isCubesat ? Number((rawDryMassKg * massScale).toFixed(1)) : rawDryMassKg;
      const wetMassKg = scenario.isCubesat ? Number((rawWetMassKg * massScale).toFixed(1)) : rawWetMassKg;
      const rawLvCapacityKg = (lv.capacityKg && lv.capacityKg[orbit.id]) ? lv.capacityKg[orbit.id] : 500;
      const lvCapacityKg = scenario.isCubesat ? Math.min(rawLvCapacityKg, cubesatForm.maxMassKg) : rawLvCapacityKg;
      const maxInstruments = scenario.isCubesat ? Math.min(bus.maxInstruments, cubesatForm.maxInst) : bus.maxInstruments;
      const massMarginPct = Math.round(((lvCapacityKg - wetMassKg) / Math.max(1, lvCapacityKg)) * 100);
      const massOk = wetMassKg <= lvCapacityKg && selectedInsts.length <= maxInstruments;

      // 3. POWER (W) & ECLIPSE BATTERY DEPTH-OF-DISCHARGE (%)
      const pwrScale = scenario.isCubesat ? cubesatForm.powerScale : 1.0;
      const instPowerW = selectedInsts.reduce((acc, i) => acc + i.powerW, 0);
      const totalPowerLoadW = Math.round((bus.basePowerLoadW + thm.powerW + com.powerW + prop.powerW + instPowerW) * pwrScale);
      const daylightGenW = Math.round(pwr.genW * orbit.solarFluxFactor * pwrScale);
      const effBatteryWh = Math.round(bat.capacityWh * pwrScale);
      const eclipseHours = (orbit.periodMin * orbit.eclipseFraction) / 60;
      const daylightHours = (orbit.periodMin * (1 - orbit.eclipseFraction)) / 60;
      // Solar-electric Xenon ion propulsion only coasts in eclipse (no solar thrust in shadow)
      const eclipseLoadW = totalPowerLoadW - (prop.id === "hall_ion_sep" ? Math.round(prop.powerW * pwrScale) : 0);
      const eclipseEnergyNeedWh = Math.round(eclipseLoadW * eclipseHours);
      const batteryDodPct = Math.round((eclipseEnergyNeedWh / Math.max(1, effBatteryWh)) * 100);
      const rechargePowerNeededW = eclipseHours > 0 ? Math.round((eclipseEnergyNeedWh * 1.15) / Math.max(0.2, daylightHours)) : 0;
      const netDaylightMarginW = daylightGenW - (totalPowerLoadW + rechargePowerNeededW);
      const powerOk = netDaylightMarginW >= 0 && batteryDodPct <= 80;

      // 4. DATA GENERATION vs. DOWNLINK CAPACITY (GB/day) & LINK MARGIN (dB)
      const instDataMbps = selectedInsts.reduce((acc, i) => acc + i.dataMbps, 0);
      const dataDuty = scenario.isCubesat ? 0.015 : 0.35;
      const dataGeneratedGbPerDay = Number(((instDataMbps * dataDuty * 86400) / 8000).toFixed(1));
      const effectiveContactMin = Math.round(orbit.contactMinPerDay * gnd.contactMultiplier);
      const downlinkCapGbPerDay = Number(((com.rateMbps * (effectiveContactMin * 60)) / 8000).toFixed(1));
      const linkMarginDb = Number((com.eirpDbw + gnd.gainDb - orbit.pathLossDb - 18.5).toFixed(1));
      const commsOk = linkMarginDb >= 3.0 && downlinkCapGbPerDay >= dataGeneratedGbPerDay;

      // 5. PROPULSION DELTA-V (Tsiolkovsky Rocket Equation: dV = Isp * g0 * ln(m0 / mf))
      const g0 = 9.80665;
      const achievedDeltaV = Math.round(prop.ispSec * g0 * Math.log(wetMassKg / Math.max(0.1, dryMassKg)));
      const requiredDeltaV = Math.max(scenario.minDeltaV, orbit.reqInsertionDv) + disposal.dvCostMs;
      const deltaVOk = achievedDeltaV >= requiredDeltaV;

      // 6. END-OF-MISSION DISPOSAL & DEBRIS COMPLIANCE
      const isLowOrbit = ["leo_400", "iss_cubesat_418", "sso_705"].includes(orbit.id);
      let disposalOk = disposal.id !== "none_drift";
      let disposalNote = `${disposal.deorbitYears} yr post-mission disposal`;
      if (disposal.id === "none_drift") {
        disposalNote = "No deorbit / graveyard plan — fails FCC 5-yr & NASA-STD-8719.14 compliance";
      } else if (disposal.leoOnly && !isLowOrbit) {
        disposalOk = false;
        disposalNote = "Drag sail only effective in <=750 km LEO/SSO — select Propulsive Disposal";
      }

      // 7. TELESCOPE WAVELENGTH–OPTICS–THERMAL COMPATIBILITY (COSMOS-L2)
      const telescopeIssues = [];
      if (scenario.requiresWavelength) {
        if (wavelength.reqThermal === "cryo_rad_90" && thm.id !== "cryo_rad_90") {
          telescopeIssues.push(`${wavelength.shortLabel} optics require Two-Phase Cryo-Cooler thermal control (<40 K)`);
        } else if (wavelength.reqThermal === "pumped_loop_50" && thm.id === "passive_mli") {
          telescopeIssues.push(`${wavelength.shortLabel} focal plane requires active Heat-Pipe or Cryo thermal control`);
        }
        if (wavelength.avoidLowEarthThermal && (orbit.id === "leo_400" || orbit.id === "iss_cubesat_418")) {
          telescopeIssues.push(`${wavelength.shortLabel} blinded by Earth IR glow in 400 km LEO — move to Sun-Earth L2`);
        }
        if (wavelength.minBus === "modular_hex" && bus.id === "smallsat_12u") {
          telescopeIssues.push(`${wavelength.shortLabel} aperture exceeds 12U smallsat volume — upgrade Bus`);
        }
        const hasPreferredDetector = selectedInsts.some((i) => wavelength.preferredInstIds.includes(i.id));
        if (!hasPreferredDetector) {
          telescopeIssues.push(`Select compatible detector for ${wavelength.shortLabel}`);
        }
      }
      const telescopeOk = telescopeIssues.length === 0;

      // 8. THERMAL, RADIATION & MISSION LIFETIME (Months)
      const thermalCapScaled = Math.round(thm.thermalCapW * (scenario.isCubesat ? 0.35 : 1.0));
      const thermalOk = thermalCapScaled >= totalPowerLoadW;
      const radiationOk = thm.radRatingKrad >= Math.max(scenario.minRadiationKrad, orbit.radiationEnvKrad);
      let estimatedLifetimeMonths = 18 + thm.lifetimeBonusMonths;
      if (radiationOk) estimatedLifetimeMonths += 12;
      else estimatedLifetimeMonths = Math.max(6, estimatedLifetimeMonths - 12);
      if (batteryDodPct <= 60) estimatedLifetimeMonths += 6;
      else if (batteryDodPct > 85) estimatedLifetimeMonths = Math.max(4, estimatedLifetimeMonths - 14);
      if (scenario.requiresWavelength && wavelength.id === "mid_ir" && thm.id === "cryo_rad_90") estimatedLifetimeMonths += 12;
      if (!deltaVOk) estimatedLifetimeMonths = Math.min(estimatedLifetimeMonths, 9);
      const lifetimeOk = estimatedLifetimeMonths >= scenario.targetLifetimeMonths;

      // 9. SCIENTIFIC VALUE, 4-SEGMENT READINESS & CML 1–4
      const matchedTypes = scenario.requiredScienceTypes.filter((reqType) =>
        selectedInsts.some((inst) => inst.type === reqType)
      );
      const rawSciencePoints = selectedInsts.reduce((acc, i) => acc + i.scienceVal, 0);
      const alignmentBonus = Math.round((matchedTypes.length / Math.max(1, scenario.requiredScienceTypes.length)) * 35);
      const orbitMatchBonus = scenario.recommendedOrbits.includes(orbit.id) ? 15 : 4;
      const telescopeBonus = scenario.requiresWavelength ? (telescopeOk ? 12 : -18) : 0;
      const scienceScore = Math.max(0, Math.min(100, rawSciencePoints + alignmentBonus + orbitMatchBonus + telescopeBonus));

      let engineeringScore = 100;
      if (!budgetOk) engineeringScore -= Math.min(35, Math.round(((totalCostM - budgetCapM) / budgetCapM) * 100));
      if (!massOk) engineeringScore -= 28;
      if (!powerOk) engineeringScore -= 20;
      if (!commsOk) engineeringScore -= 16;
      if (!deltaVOk) engineeringScore -= 22;
      if (!thermalOk || !radiationOk) engineeringScore -= 14;
      if (!disposalOk) engineeringScore -= 10;
      if (!telescopeOk) engineeringScore -= 16;
      engineeringScore = Math.max(0, engineeringScore);

      const overallScore = Math.round(engineeringScore * 0.55 + scienceScore * 0.45);

      const segments = {
        launch: { label: "LAUNCH", ok: massOk && budgetOk },
        space: { label: "SPACE", ok: massOk && powerOk && deltaVOk && thermalOk && radiationOk && disposalOk && telescopeOk },
        ground: { label: "GROUND", ok: commsOk },
        user: { label: "USER", ok: scienceScore >= 55 && matchedTypes.length >= 1 }
      };

      const completedTasksCount = Array.isArray(this.tasks) ? this.tasks.filter((x) => x.completed).length : 0;
      const segmentsPassed = Object.values(segments).filter((s) => s.ok).length;
      let cmlLevel = 1;
      if (completedTasksCount >= 2 || (orbit && bus && overallScore >= 50)) cmlLevel = 2;
      if (completedTasksCount >= 4 || (segmentsPassed >= 3 && overallScore >= 65)) cmlLevel = 3;
      if (completedTasksCount >= 6 || (segmentsPassed === 4 && overallScore >= 75)) cmlLevel = 4;

      const cmlTitles = {
        1: "CML 1 · Concept Idea",
        2: "CML 2 · Initial Feasibility",
        3: "CML 3 · Trade Space & Margins",
        4: "CML 4 · MDL Point Design"
      };

      const riskMatrix = [
        {
          subsystem: "Launch & Mass",
          level: !massOk ? "RED" : massMarginPct < 10 ? "AMBER" : "GREEN",
          likelihood: !massOk ? "HIGH" : massMarginPct < 10 ? "MED" : "LOW",
          consequence: "HIGH",
          detail: `${massMarginPct}% mass margin (${wetMassKg}/${lvCapacityKg} kg)`
        },
        {
          subsystem: "Power / Eclipse",
          level: !powerOk ? "RED" : batteryDodPct > 65 ? "AMBER" : "GREEN",
          likelihood: !powerOk ? "HIGH" : batteryDodPct > 65 ? "MED" : "LOW",
          consequence: "HIGH",
          detail: `${batteryDodPct}% DoD · ${netDaylightMarginW >= 0 ? "+" : ""}${netDaylightMarginW}W margin`
        },
        {
          subsystem: "Thermal / Rad",
          level: (!thermalOk || !radiationOk || !telescopeOk) ? "RED" : !lifetimeOk ? "AMBER" : "GREEN",
          likelihood: (!thermalOk || !radiationOk) ? "HIGH" : "LOW",
          consequence: "MED",
          detail: `${thm.radRatingKrad} krad vault · ${estimatedLifetimeMonths} mo life`
        },
        {
          subsystem: "RF Link / Ground",
          level: !commsOk ? "RED" : linkMarginDb < 6 ? "AMBER" : "GREEN",
          likelihood: !commsOk ? "HIGH" : linkMarginDb < 6 ? "MED" : "LOW",
          consequence: "MED",
          detail: `${linkMarginDb} dB margin · ${downlinkCapGbPerDay}/${dataGeneratedGbPerDay} GB/d`
        },
        {
          subsystem: "Propulsion & EoM",
          level: (!deltaVOk || !disposalOk) ? "RED" : (achievedDeltaV - requiredDeltaV) < 120 ? "AMBER" : "GREEN",
          likelihood: (!deltaVOk || !disposalOk) ? "HIGH" : "LOW",
          consequence: "HIGH",
          detail: `${achievedDeltaV}/${requiredDeltaV} m/s · ${disposal.deorbitYears} yr EoM`
        }
      ];

      const analogue = MISSION_ANALOGUES[scenario.id] || MISSION_ANALOGUES.sandbox;

      return {
        scenario,
        difficulty,
        orbit,
        lv,
        bus,
        maxInstruments,
        pwr,
        bat,
        thm,
        com,
        gnd,
        prop,
        wavelength,
        cubesatForm,
        disposal,
        analogue,
        selectedInsts,
        budgetCapM,
        totalCostM,
        budgetRemainingM,
        budgetOk,
        dryMassKg,
        wetMassKg,
        lvCapacityKg,
        massMarginPct,
        massOk,
        totalPowerLoadW,
        daylightGenW,
        rechargePowerNeededW,
        netDaylightMarginW,
        eclipseHours,
        eclipseEnergyNeedWh,
        batteryDodPct,
        powerOk,
        dataGeneratedGbPerDay,
        downlinkCapGbPerDay,
        linkMarginDb,
        commsOk,
        achievedDeltaV,
        requiredDeltaV,
        deltaVOk,
        disposalOk,
        disposalNote,
        telescopeIssues,
        telescopeOk,
        thermalOk,
        radiationOk,
        estimatedLifetimeMonths,
        lifetimeOk,
        matchedTypes,
        scienceScore,
        engineeringScore,
        overallScore,
        segments,
        cmlLevel,
        cmlLabel: cmlTitles[cmlLevel],
        riskMatrix
      };
    }

    // ========================================================================
    // LIVE 6-RESOURCE TELEMETRY HUD BAR
    // ========================================================================
    _buildResourceMetersBar() {
      const existing = document.getElementById("lunaspis-resource-meters");
      if (existing) return;

      const bar = document.createElement("div");
      bar.id = "lunaspis-resource-meters";
      this._applyResourceBarLayout(bar);
      document.body.appendChild(bar);
      this._renderResourceMeters();

      window.addEventListener("resize", () => this._applyResourceBarLayout(bar));
      window.addEventListener("orientationchange", () => this._applyResourceBarLayout(bar));
    }

    _applyResourceBarLayout(bar) {
      if (!bar) return;
      bar.style.display = window.isGameStarted ? "" : "none";
      this._renderResourceMeters();
    }

    _renderResourceMeters() {
      const bar = document.getElementById("lunaspis-resource-meters");
      if (!bar) return;
      const t = this.evaluateMissionDesign();
      this.telemetry = t;

      const isPhone = window.innerWidth <= 540;
      const metrics = [
        {
          key: "budget",
          label: isPhone ? "BUDG" : "BUDGET",
          val: `$${t.totalCostM}/${t.budgetCapM}M`,
          pct: Math.min(100, Math.round((t.totalCostM / Math.max(1, t.budgetCapM)) * 100)),
          target: 100,
          ok: t.budgetOk,
          color: t.budgetOk ? "#63e6a8" : "#ff6b6b",
          tip: "Mission cost versus the scenario budget cap."
        },
        {
          key: "mass",
          label: isPhone ? "MASS" : "MASS",
          val: `${t.wetMassKg}/${t.lvCapacityKg}kg`,
          pct: Math.min(100, Math.round((t.wetMassKg / Math.max(1, t.lvCapacityKg)) * 100)),
          target: 100,
          ok: t.massOk,
          color: t.massOk ? "#63e6a8" : "#ff6b6b",
          tip: "Wet spacecraft mass versus launch vehicle capacity."
        },
        {
          key: "power",
          label: isPhone ? "PWR" : "POWER",
          val: `${t.totalPowerLoadW}/${t.daylightGenW}W`,
          pct: Math.min(100, Math.round((t.totalPowerLoadW / Math.max(1, t.daylightGenW)) * 100)),
          target: 100,
          ok: t.powerOk,
          color: t.powerOk ? "#63e6a8" : "#ff6b6b",
          tip: "Power load versus daylight generation. Watch eclipse battery DoD."
        },
        {
          key: "data",
          label: isPhone ? "DATA" : "COMMS/DATA",
          val: `${t.linkMarginDb}dB`,
          pct: Math.min(100, Math.max(10, Math.round((t.downlinkCapGbPerDay / Math.max(1, t.dataGeneratedGbPerDay)) * 55))),
          target: 100,
          ok: t.commsOk,
          color: t.commsOk ? "#a7b0ba" : "#f5c451",
          tip: "Downlink capacity versus generated science data."
        },
        {
          key: "delta-v",
          label: isPhone ? "ΔV" : "DELTA-V",
          val: `${t.achievedDeltaV}m/s`,
          pct: Math.min(100, Math.round((t.achievedDeltaV / Math.max(1, t.requiredDeltaV)) * 80)),
          target: 80,
          ok: t.deltaVOk,
          color: t.deltaVOk ? "#63e6a8" : "#ff6b6b",
          tip: "Achieved delta-v versus the mission requirement."
        },
        {
          key: "science",
          label: isPhone ? "SCI" : "SCIENCE",
          val: `${t.scienceScore}/100`,
          pct: t.scienceScore,
          target: 60,
          ok: t.scienceScore >= 60,
          color: t.scienceScore >= 60 ? "#63e6a8" : "#f5c451",
          tip: "Science value score. The mission objective requires at least 60."
        }
      ];
      const previousCritical = this._criticalResources || {};
      const previousPct = this._resourcePct || {};
      const nextCritical = {};

      bar.innerHTML = metrics
        .map((m) => {
          nextCritical[m.key] = !m.ok;
          const isNewCritical = !m.ok && !previousCritical[m.key];
          return `
          <div class="lunaspis-res-item${m.ok ? "" : " is-critical"}${isNewCritical ? " is-new-critical" : ""}" data-res-key="${m.key}" title="${this._escapeHtml(m.tip)}">
            <div class="lunaspis-res-head">
              <span style="color:${m.color};font-weight:700;">${m.label}</span>
              <span>${m.val}</span>
            </div>
            <div class="lunaspis-res-track">
              <div class="lunaspis-res-fill" style="width:${previousPct[m.key] === undefined ? 0 : previousPct[m.key]}%;background:${m.color};"></div>
              <span class="lunaspis-res-target" style="left:${Math.max(0, Math.min(100, m.target))}%"></span>
            </div>
          </div>
        `;
        })
        .join("");
      requestAnimationFrame(() => {
        metrics.forEach((m) => {
          const fill = bar.querySelector(`[data-res-key="${m.key}"] .lunaspis-res-fill`);
          if (fill) fill.style.width = `${m.pct}%`;
        });
      });
      this._resourcePct = Object.fromEntries(metrics.map((m) => [m.key, m.pct]));
      this._criticalResources = nextCritical;
    }

    _getRoleAssignment(roleId) {
      const role = roleId === "all" ? "all" : (
        window.InterfellasRoles ? window.InterfellasRoles.normalizeRole(roleId, "commander") : (roleId || "commander")
      );
      const nm = window.netManager;
      const myRole = window.InterfellasRoles && nm && nm.localPlayer
        ? window.InterfellasRoles.normalizeRole(nm.localPlayer.role, "commander")
        : "commander";
      const players = nm && nm.roomState && Array.isArray(nm.roomState.players) ? nm.roomState.players : [];

      if (role === "all") {
        return {
          role: "all",
          short: "ALL",
          label: "ALL CREW",
          color: "#a7b0ba",
          holders: players,
          namesText: players.length ? `${players.length} crew` : "CREW",
          isMine: true,
          isUnstaffed: false,
          badgeText: "ALL CREW"
        };
      }

      const meta = window.InterfellasRoles
        ? window.InterfellasRoles.getRoleMeta(role)
        : { short: role.slice(0, 3).toUpperCase(), label: role.toUpperCase(), color: "#a7b0ba" };
      const grouped = window.InterfellasRoles
        ? window.InterfellasRoles.getCrewByRole(players)
        : { [role]: [] };
      const holders = grouped[role] || [];
      const isMine = myRole === role;
      const isUnstaffed = holders.length === 0;
      const namesText = holders.length > 0
        ? holders.map((p) => (p.id === (nm && nm.socketId) ? "YOU" : (p.name || "Crew"))).join(", ")
        : "OPEN";

      return {
        role,
        short: meta.short,
        label: meta.label,
        color: meta.color,
        holders,
        namesText,
        isMine,
        isUnstaffed,
        badgeText: `${meta.short} · ${namesText}`
      };
    }

    // Shared header banner inside every console showing live 6-resource trade-off bars,
    // CML 1-4 readiness, 4 Mission Segments (Launch/Space/Ground/User), & Option A Comparison
    _renderLiveTradeoffStrip(options = {}) {
      const t = this.evaluateMissionDesign();
      this.telemetry = t;
      this._activeRenderCallback = typeof options.onRerender === "function" ? options.onRerender : null;

      let roleStrip = "";
      if (this.activeTask && !this.activeTask.isPreFlightMdl) {
        const assign = this._getRoleAssignment(this.activeTask.role);
        const stripMsg = assign.isMine
          ? (assign.role === "all" ? "JOINT CONSOLE" : "YOUR CONSOLE")
          : assign.isUnstaffed
            ? "UNSTAFFED · SUPPORT"
            : `OWNER: ${this._escapeHtml(assign.namesText)}`;
        roleStrip = `
          <div class="console-role-strip ${assign.isMine ? "is-mine" : "is-support"}">
            <span>${stripMsg}</span>
          </div>
        `;
      }

      const pill = (label, value, sub, ok) => `
        <div style="padding:7px 9px;border-radius:6px;background:rgba(0,0,0,0.38);border:1px solid ${ok ? "rgba(99,230,168,0.32)" : "rgba(255,107,107,0.55)"};">
          <div style="display:flex;justify-content:space-between;align-items:center;font-family:monospace;font-size:9px;color:#a7b0ba;letter-spacing:0.8px;">
            <span>${label}</span>
            <span style="color:${ok ? "#63e6a8" : "#ff6b6b"};font-weight:700;">${ok ? "NOMINAL" : "CONSTRAINT"}</span>
          </div>
          <div style="font-family:monospace;font-size:12px;font-weight:700;color:#efeee7;margin-top:2px;">${value}</div>
          <div style="font-family:monospace;font-size:9px;color:#a7b0ba;margin-top:1px;">${sub}</div>
        </div>
      `;

      const segBadge = (seg) => `
        <span style="padding:2px 6px;border-radius:4px;font-family:monospace;font-size:9px;font-weight:700;border:1px solid ${seg.ok ? "rgba(74,222,128,0.45)" : "rgba(255,107,107,0.45)"};background:${seg.ok ? "rgba(74,222,128,0.12)" : "rgba(255,107,107,0.12)"};color:${seg.ok ? "#63e6a8" : "#ff6b6b"};">
          ${seg.ok ? "✓" : "!"} ${seg.label}
        </span>
      `;

      const cmlPills = [1, 2, 3, 4].map((lvl) => {
        const active = lvl <= t.cmlLevel;
        return `<span style="padding:2px 5px;border-radius:3px;font-family:monospace;font-size:8.5px;font-weight:700;background:${active ? "rgba(var(--ui-brand-rgb),0.22)" : "rgba(255,255,255,0.05)"};color:${active ? "var(--ui-brand)" : "#7a8490"};border:1px solid ${active ? "rgba(var(--ui-brand-rgb),0.5)" : "rgba(255,255,255,0.08)"};">CML ${lvl}</span>`;
      }).join("");

      let tradeDeltaHtml = "";
      if (this.tradeBaselineA) {
        const a = this.tradeBaselineA;
        const fmtDelta = (val, unit, lowerBetter = false) => {
          if (val === 0) return `<span style="color:#a7b0ba;">0${unit}</span>`;
          const good = lowerBetter ? val < 0 : val > 0;
          const sign = val > 0 ? "+" : "";
          return `<span style="color:${good ? "#63e6a8" : "#ff6b6b"};font-weight:700;">${sign}${val}${unit}</span>`;
        };
        const dCost = Number((t.totalCostM - a.totalCostM).toFixed(0));
        const dMass = Number((t.wetMassKg - a.wetMassKg).toFixed(1));
        const dPwr = Number((t.netDaylightMarginW - a.netDaylightMarginW).toFixed(0));
        const dDv = Number((t.achievedDeltaV - a.achievedDeltaV).toFixed(0));
        const dSci = Number((t.scienceScore - a.scienceScore).toFixed(0));
        const dScore = Number((t.overallScore - a.overallScore).toFixed(0));
        tradeDeltaHtml = `
          <div style="margin-top:8px;padding:6px 9px;border-radius:6px;background:rgba(var(--ui-brand-rgb),0.08);border:1px solid rgba(var(--ui-brand-rgb),0.35);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-family:monospace;font-size:9.5px;">
            <span style="color:var(--ui-brand-strong);font-weight:700;">MDL TRADE Δ (vs Option A: ${this._escapeHtml(a.scenario.code)} / ${this._escapeHtml(a.orbit.id.toUpperCase())})</span>
            <span style="color:#efeee7;">
              Cost ${fmtDelta(dCost, "M", true)} · Mass ${fmtDelta(dMass, "kg", true)} · Pwr ${fmtDelta(dPwr, "W")} · ΔV ${fmtDelta(dDv, "m/s")} · Sci ${fmtDelta(dSci, "pt")} · Grade ${fmtDelta(dScore, "pt")}
            </span>
            <button type="button" id="btn-mdl-clear-a" style="padding:2px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.35);color:#efeee7;font-family:inherit;font-size:8.5px;cursor:pointer;">CLEAR A</button>
          </div>
        `;
      }

      if (typeof queueMicrotask === "function") {
        queueMicrotask(() => this._syncConsoleWidgets());
      }

      return `
        ${roleStrip}
        <div style="margin-bottom:14px;padding:10px 12px;border-radius:8px;background:rgba(var(--ui-brand-rgb),0.04);border:1px solid rgba(255,255,255,0.12);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
            <span style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--ui-brand);">
              ${t.cmlLabel.toUpperCase()} · ${t.scenario.name.toUpperCase()}
            </span>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <button type="button" id="btn-mdl-snapshot-a" style="padding:3px 7px;border-radius:4px;border:1px solid rgba(var(--ui-brand-rgb),0.45);background:rgba(var(--ui-brand-rgb),0.12);color:var(--ui-brand-strong);font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">📸 ${this.tradeBaselineA ? "UPDATE OPTION A" : "SAVE OPTION A"}</button>
              <button type="button" id="btn-mdl-open-viz" style="padding:3px 7px;border-radius:4px;border:1px solid rgba(var(--ui-brand-rgb),0.5);background:rgba(var(--ui-brand-rgb),0.14);color:var(--ui-brand);font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">🛰️ 3D ORBIT VIZ [U]</button>
              <span style="font-family:monospace;font-size:10px;font-weight:700;color:${t.overallScore >= 75 ? "#63e6a8" : "#f5c451"};">
                SCORE ${t.overallScore}/100 (SCI ${t.scienceScore} · ENG ${t.engineeringScore})
              </span>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
              ${cmlPills}
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
              ${segBadge(t.segments.launch)}
              ${segBadge(t.segments.space)}
              ${segBadge(t.segments.ground)}
              ${segBadge(t.segments.user)}
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:7px;">
            ${pill("BUDGET", `$${t.totalCostM}M / $${t.budgetCapM}M`, `${t.budgetRemainingM >= 0 ? `+$${t.budgetRemainingM}M reserve` : `$${Math.abs(t.budgetRemainingM)}M OVER CAP`}`, t.budgetOk)}
            ${pill(t.scenario.isCubesat ? `MASS (${t.cubesatForm.shortLabel})` : "WET MASS", `${t.wetMassKg} / ${t.lvCapacityKg} kg`, `Margin: ${t.massMarginPct}% (${t.lv.name.split(" ")[0]})`, t.massOk)}
            ${pill("POWER / DoD", `${t.totalPowerLoadW}W / ${t.daylightGenW}W`, `Eclipse DoD: ${t.batteryDodPct}% (≤80%)`, t.powerOk)}
            ${pill("DATA & LINK", `${t.dataGeneratedGbPerDay} / ${t.downlinkCapGbPerDay} GB/d`, `Link Margin: ${t.linkMarginDb} dB (≥3dB)`, t.commsOk)}
            ${pill("ΔV & EoM DISPOSAL", `${t.achievedDeltaV} / ${t.requiredDeltaV} m/s`, `${t.disposalOk ? `${t.disposal.deorbitYears}yr EoM` : "EoM FAIL"} · ${t.estimatedLifetimeMonths}/${t.scenario.targetLifetimeMonths} mo`, t.deltaVOk && t.disposalOk && t.lifetimeOk)}
          </div>
          ${tradeDeltaHtml}
        </div>
      `;
    }

    _syncConsoleWidgets() {
      const container = document.getElementById("task-modal-content");
      if (!container) return;

      const btnSnap = container.querySelector("#btn-mdl-snapshot-a");
      if (btnSnap && !btnSnap.dataset.bound) {
        btnSnap.dataset.bound = "1";
        btnSnap.addEventListener("click", () => {
          this.tradeBaselineA = JSON.parse(JSON.stringify(this.evaluateMissionDesign()));
          if (window.spaceAudio) window.spaceAudio.playClick();
          this.showToast("📸 Baseline Option A captured — adjust subsystems to see live MDL trade deltas!");
          if (typeof this._activeRenderCallback === "function") {
            this._activeRenderCallback();
          } else {
            const modalBody = document.getElementById("task-modal-content");
            if (modalBody && this.activeTask) this.openTaskModal(this.activeTask);
          }
        });
      }

      const btnClearA = container.querySelector("#btn-mdl-clear-a");
      if (btnClearA && !btnClearA.dataset.bound) {
        btnClearA.dataset.bound = "1";
        btnClearA.addEventListener("click", () => {
          this.tradeBaselineA = null;
          if (window.spaceAudio) window.spaceAudio.playClick();
          if (typeof this._activeRenderCallback === "function") {
            this._activeRenderCallback();
          } else if (this.activeTask) {
            this.openTaskModal(this.activeTask);
          }
        });
      }

      const btnViz = container.querySelector("#btn-mdl-open-viz");
      if (btnViz && !btnViz.dataset.bound) {
        btnViz.dataset.bound = "1";
        btnViz.addEventListener("click", () => {
          if (window.missionViz && typeof window.missionViz.open === "function") {
            this.closeTaskModal();
            window.missionViz.open();
          }
        });
      }

      const pdSlot = container.querySelector("#mdl-point-design-3d");
      if (pdSlot) {
        this._mountPointDesign3DPreview(pdSlot);
      }

      const sciCanvas = container.querySelector("#sim-science-canvas");
      if (sciCanvas) {
        this._renderSimulatedScienceCanvas(sciCanvas);
      }
    }

    _ensurePointDesignRenderer() {
      if (this._pdRenderer || typeof THREE === "undefined") return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(260, 156, false);
      renderer.setClearColor(0x050914, 1);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 260 / 156, 0.1, 100);
      camera.position.set(2.8, 2.0, 3.2);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.AmbientLight(0xdbeafe, 0.8));
      const key = new THREE.DirectionalLight(0xffffff, 1.35);
      key.position.set(4, 6, 4);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x38bdf8, 0.65);
      rim.position.set(-4, -2, -3);
      scene.add(rim);

      const grid = new THREE.GridHelper(4.2, 8, 0x334155, 0x1e293b);
      grid.position.y = -0.9;
      scene.add(grid);

      const group = new THREE.Group();
      scene.add(group);

      this._pdRenderer = renderer;
      this._pdScene = scene;
      this._pdCamera = camera;
      this._pdGroup = group;
    }

    _mountPointDesign3DPreview(slotEl) {
      if (!slotEl || typeof THREE === "undefined") return;
      this._ensurePointDesignRenderer();
      if (!this._pdRenderer) return;

      const t = this.evaluateMissionDesign();
      const key = [
        t.scenario.id, t.bus.id, t.pwr.id, t.com.id,
        t.thm.id, t.prop.id, t.disposal.id, t.cubesatForm.id,
        t.selectedInsts.map((i) => i.id).join(",")
      ].join("|");

      if (key !== this._pdLastKey) {
        this._pdLastKey = key;
        this._rebuildPointDesignMesh(t);
      }

      const canvas = this._pdRenderer.domElement;
      canvas.style.cssText = "width:100%;height:156px;display:block;border-radius:6px;border:1px solid rgba(var(--ui-brand-rgb),0.3);";
      slotEl.innerHTML = "";
      slotEl.appendChild(canvas);

      if (!this._pdAnimId) {
        const tick = () => {
          if (!document.body.contains(this._pdRenderer.domElement)) {
            this._pdAnimId = 0;
            return;
          }
          if (this._pdGroup) this._pdGroup.rotation.y += 0.009;
          this._pdRenderer.render(this._pdScene, this._pdCamera);
          this._pdAnimId = requestAnimationFrame(tick);
        };
        this._pdAnimId = requestAnimationFrame(tick);
      }
    }

    _rebuildPointDesignMesh(t) {
      const group = this._pdGroup;
      if (!group) return;
      while (group.children.length > 0) {
        const child = group.children.pop();
        if (child.traverse) {
          child.traverse((o) => {
            if (o.geometry && o.geometry.dispose) o.geometry.dispose();
          });
        }
      }

      const foilMat = new THREE.MeshStandardMaterial({ color: 0xd4a446, metalness: 0.78, roughness: 0.25 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.65, roughness: 0.35 });
      const solarMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, emissive: 0x0f172a, metalness: 0.55, roughness: 0.2 });
      const cryoMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.4, roughness: 0.45 });
      const cyanMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0891b2, emissiveIntensity: 0.45 });

      const scale = t.scenario.isCubesat
        ? (t.cubesatForm.id === "3u" ? 0.65 : t.cubesatForm.id === "12u" ? 0.92 : 0.78)
        : (t.bus.id === "smallsat_12u" ? 0.75 : t.bus.id === "deep_space_heavy" ? 1.15 : 0.95);

      const core = new THREE.Group();
      core.scale.setScalar(scale);

      // Bus geometry (or CubeSat stack)
      const sides = t.scenario.isCubesat || t.bus.id === "smallsat_12u" ? 4 : (t.bus.id === "deep_space_heavy" ? 8 : 6);
      const busHeight = t.scenario.isCubesat ? (t.cubesatForm.id === "3u" ? 1.2 : t.cubesatForm.id === "6u" ? 1.0 : 0.95) : 0.95;
      const busMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.46, 0.48, busHeight, sides),
        t.thm.id === "passive_mli" ? foilMat : darkMat
      );
      if (sides === 4) busMesh.rotation.y = Math.PI / 4;
      core.add(busMesh);

      // JWST-style layered sunshield & hex primary mirror for Space Telescope scenario
      if (t.scenario.requiresWavelength) {
        for (let l = 0; l < 3; l++) {
          const shield = new THREE.Mesh(
            new THREE.BoxGeometry(2.1 - l * 0.14, 0.025, 1.3 - l * 0.08),
            new THREE.MeshStandardMaterial({ color: 0xc084fc, metalness: 0.7, roughness: 0.2 })
          );
          shield.position.y = -0.35 - l * 0.07;
          core.add(shield);
        }
        const mirror = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.55, 0.08, 6),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.92, roughness: 0.12 })
        );
        mirror.rotation.x = Math.PI / 2;
        mirror.position.set(0, 0.45, 0.25);
        core.add(mirror);
      }

      // Power wings
      if (t.pwr.id === "body_solar") {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.65, 0.05), solarMat);
        panel.position.z = 0.48;
        core.add(panel);
      } else {
        const span = t.pwr.id === "high_power_wings" ? 2.1 : 1.55;
        const wingL = new THREE.Mesh(new THREE.BoxGeometry(span, 0.03, 0.56), solarMat);
        wingL.position.x = -(0.55 + span * 0.5);
        core.add(wingL);
        const wingR = wingL.clone();
        wingR.position.x = 0.55 + span * 0.5;
        core.add(wingR);
        if (t.pwr.isNuclear) {
          const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.6, 8), cryoMat);
          rtg.rotation.z = Math.PI / 3;
          rtg.position.set(0.45, -0.35, -0.35);
          core.add(rtg);
        }
      }

      // Thermal radiator fins
      if (t.thm.id !== "passive_mli") {
        const rad = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.75, 0.7), cryoMat);
        rad.position.set(0, 0.1, -0.68);
        core.add(rad);
      }

      // Comms Dish
      if (t.com.id === "s_band_omni") {
        const patch = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 12), cyanMat);
        patch.position.set(0, busHeight * 0.5 + 0.04, 0);
        core.add(patch);
      } else {
        const dishRadius = t.com.id === "ka_band_optical" ? 0.52 : 0.38;
        const dish = new THREE.Mesh(
          new THREE.ConeGeometry(dishRadius, 0.2, 20, 1, true),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, side: THREE.DoubleSide, metalness: 0.45 })
        );
        dish.rotation.x = Math.PI;
        dish.position.set(0, busHeight * 0.5 + 0.2, 0.1);
        core.add(dish);
      }

      // Propulsion Nozzle / Ion plume glow
      const nozzle = new THREE.Mesh(
        new THREE.ConeGeometry(t.prop.id === "hall_ion_sep" ? 0.22 : 0.16, 0.28, 12),
        t.prop.id === "hall_ion_sep" ? cyanMat : darkMat
      );
      nozzle.position.y = -(busHeight * 0.5 + 0.12);
      core.add(nozzle);

      // Selected instruments pods
      t.selectedInsts.forEach((inst, idx) => {
        const pod = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.18, 0.22),
          new THREE.MeshStandardMaterial({ color: idx % 2 === 0 ? 0x34d399 : 0xfbbf24, metalness: 0.5 })
        );
        const angle = (idx / Math.max(1, t.selectedInsts.length)) * Math.PI * 2;
        pod.position.set(Math.cos(angle) * 0.5, -0.1, Math.sin(angle) * 0.5);
        core.add(pod);
      });

      // Drag sail wireframe indicator if drag sail selected
      if (t.disposal.id === "drag_sail") {
        const sail = new THREE.Mesh(
          new THREE.PlaneGeometry(1.7, 1.7),
          new THREE.MeshBasicMaterial({ color: 0xfde047, wireframe: true, transparent: true, opacity: 0.35 })
        );
        sail.position.set(0, 0, -0.65);
        core.add(sail);
      }

      group.add(core);
    }

    _renderSimulatedScienceCanvas(canvas) {
      if (!canvas || !canvas.getContext) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const t = this.evaluateMissionDesign();
      const theme = (window.UITheme && window.UITheme.palette) || {};
      const brand = theme.brand || "#c9f04b";
      const brandStrong = theme.brandStrong || "#e4ff7e";
      const brandRgb = theme.brandRgb || "201, 240, 75";

      ctx.fillStyle = "#060b17";
      ctx.fillRect(0, 0, w, h);

      // Subtle grid
      ctx.strokeStyle = `rgba(${brandRgb},0.12)`;
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 36) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 28) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      const scId = t.scenario.id;
      if (scId === "space_telescope") {
        // Synthetic deep-field stars + Exoplanet Absorption Spectrum right half
        const halfW = Math.floor(w * 0.45);
        const rng = (i) => Math.abs(Math.sin(i * 12.9898 + t.scienceScore * 0.1) * 43758.5453) % 1;
        for (let i = 0; i < 65; i++) {
          const sx = 10 + rng(i) * (halfW - 20);
          const sy = 14 + rng(i + 99) * (h - 28);
          const r = rng(i + 200) * 2.2 + 0.5;
          ctx.fillStyle = i % 5 === 0 ? brand : (i % 3 === 0 ? brand : "#efeee7");
          ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
          if (i < 6) {
            ctx.strokeStyle = `rgba(${brandRgb},0.5)`;
            ctx.beginPath(); ctx.moveTo(sx - 6, sy); ctx.lineTo(sx + 6, sy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(sx, sy - 6); ctx.lineTo(sx, sy + 6); ctx.stroke();
          }
        }
        // Spectral plot
        ctx.strokeStyle = t.telescopeOk ? "#63e6a8" : "#ff6b6b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = halfW + 14; x < w - 12; x += 4) {
          const norm = (x - halfW - 14) / Math.max(1, w - halfW - 26);
          const dip1 = Math.exp(-Math.pow((norm - 0.32) / 0.06, 2)) * 34;
          const dip2 = Math.exp(-Math.pow((norm - 0.68) / 0.08, 2)) * 42;
          const noise = (1 - t.scienceScore / 120) * 8 * Math.sin(x * 0.7);
          const y = h * 0.34 + dip1 + dip2 + noise;
          if (x === halfW + 14) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = brandStrong;
        ctx.font = "bold 10px monospace";
        ctx.fillText(`BAND: ${t.wavelength.shortLabel} · H2O / CO2 ABSORPTION LINES`, halfW + 14, h - 10);
      } else if (scId === "lunar_south_pole") {
        // Shackleton Crater PSR Neutron Hydrogen Heatmap + Altimetry Profile
        const cx = w * 0.25;
        const cy = h * 0.54;
        const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 52);
        grad.addColorStop(0, `rgba(${brandRgb},0.9)`);
        grad.addColorStop(0.55, "rgba(30,64,175,0.45)");
        grad.addColorStop(1, "rgba(15,23,42,0.05)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#a7b0ba";
        ctx.strokeRect(cx - 56, cy - 52, 112, 100);
        // Altimetry curve
        ctx.strokeStyle = brand;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = w * 0.5; x < w - 14; x += 4) {
          const u = (x - w * 0.5) / Math.max(1, w * 0.5 - 14);
          const profile = Math.exp(-Math.pow((u - 0.5) / 0.22, 2)) * 48 - 10 * Math.exp(-Math.pow((u - 0.25) / 0.08, 2));
          const y = h * 0.34 + profile;
          if (x === w * 0.5) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = brand;
        ctx.font = "bold 10px monospace";
        ctx.fillText("SHACKLETON PSR ICE (NEUTRON) + LIDAR DEPTH PROFILE", w * 0.48, h - 10);
      } else {
        // Earth Climate / Cubesat / Asteroid / Sandbox Multi-channel telemetry waveform
        ctx.strokeStyle = brand;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 14; x < w - 14; x += 4) {
          const phase = (x / w) * Math.PI * 4;
          const y = h * 0.56 + Math.sin(phase) * 24 + Math.cos(phase * 2.3) * 10;
          if (x === 14) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = "#63e6a8";
        ctx.beginPath();
        for (let x = 14; x < w - 14; x += 4) {
          const phase = (x / w) * Math.PI * 4;
          const y = h * 0.58 + Math.cos(phase * 1.4) * 18;
          if (x === 14) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = "#63e6a8";
        ctx.font = "bold 10px monospace";
        ctx.fillText(`${t.analogue.productTitle.toUpperCase()} · SNR +${Math.max(4, t.linkMarginDb)} dB`, 14, h - 10);
      }

      ctx.fillStyle = brand;
      ctx.font = "bold 10px monospace";
      ctx.fillText(`USER SEGMENT SCIENCE PRODUCT · SCI SCORE ${t.scienceScore}/100`, 10, 14);
    }

    exportMdlPointDesignJson() {
      const t = this.evaluateMissionDesign();
      const payload = {
        exportedAt: new Date().toISOString(),
        generator: "LUNASPIS // NASA Space Apps MDL & Mission Viz Engine",
        cmlLevel: t.cmlLevel,
        cmlLabel: t.cmlLabel,
        scenario: t.scenario.id,
        scenarioCode: t.scenario.code,
        orbit: t.orbit.id,
        launchVehicle: t.lv.id,
        spacecraftBus: t.bus.id,
        wavelengthBand: t.scenario.requiresWavelength ? t.wavelength.id : null,
        cubesatFormFactor: t.scenario.isCubesat ? t.cubesatForm.id : null,
        powerSystem: t.pwr.id,
        batteryPack: t.bat.id,
        instruments: t.selectedInsts.map((i) => i.id),
        thermalRadiation: t.thm.id,
        commsPackage: t.com.id,
        groundNetwork: t.gnd.id,
        propulsionSystem: t.prop.id,
        endOfMissionDisposal: t.disposal.id,
        summaryMetrics: {
          overallScore: t.overallScore,
          scienceScore: t.scienceScore,
          engineeringScore: t.engineeringScore,
          totalCostM: t.totalCostM,
          budgetCapM: t.budgetCapM,
          wetMassKg: t.wetMassKg,
          lvCapacityKg: t.lvCapacityKg,
          achievedDeltaVMs: t.achievedDeltaV,
          requiredDeltaVMs: t.requiredDeltaV,
          linkMarginDb: t.linkMarginDb,
          estimatedLifetimeMonths: t.estimatedLifetimeMonths,
          segments: t.segments,
          riskMatrix: t.riskMatrix,
          nasaCsaAnalogue: t.analogue
        }
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lunaspis_mdl_${t.scenario.code.toLowerCase()}_cml${t.cmlLevel}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast("💾 Exported MDL Point-Design Specification (.JSON)");
    }

    // Allows crew on the Ground (VAB High Bay, LCC Firing Room, or LC-39A) to explore
    // & iterate pre-flight Mission Design across all subsystems + sync via netManager
    openPreFlightMdlDesk(initialTab = "bus") {
      this._runCleanup();
      const synthTask = {
        id: "preflight_mdl",
        kind: "preflight-mdl",
        isPreFlightMdl: true,
        name: "NASA MDL Pre-Flight Point Design Desk",
        location: "VAB / LCC / PAD LC-39A",
        role: "all",
        completed: false
      };
      this.activeTask = synthTask;
      const modal = document.getElementById("task-modal-overlay");
      const title = document.getElementById("task-modal-title");
      const body = document.getElementById("task-modal-content");
      if (!modal || !title || !body) return;

      let activeTab = initialTab || "bus";
      title.textContent = "NASA GSFC MISSION DESIGN LAB (MDL) · PRE-FLIGHT TRADE DESK";
      modal.style.display = "flex";
      if (window.spaceAudio) window.spaceAudio.playClick();

      const renderDesk = () => {
        const md = this.missionDesign;
        const t = this.evaluateMissionDesign();
        const mkTab = (id, label) => `
          <button type="button" class="mdl-desk-tab" data-tab="${id}" style="padding:6px 10px;border-radius:5px;border:1px solid ${activeTab === id ? "var(--ui-brand)" : "rgba(255,255,255,0.14)"};background:${activeTab === id ? "rgba(var(--ui-brand-rgb),0.16)" : "rgba(255,255,255,0.03)"};color:${activeTab === id ? "#efeee7" : "#a7b0ba"};font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
            ${label}
          </button>
        `;

        let tabContent = "";
        if (activeTab === "arch") {
          tabContent = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin-bottom:10px;">
              ${Object.values(MISSION_SCENARIOS).map((sc) => `
                <div class="mdl-q-sc" data-id="${sc.id}" style="padding:9px;border-radius:7px;border:1px solid ${md.scenarioId === sc.id ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${md.scenarioId === sc.id ? "rgba(var(--ui-brand-rgb),0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                  <div style="font-family:monospace;font-size:9px;color:var(--ui-brand);font-weight:700;">${sc.badge} · $${sc.baseBudgetM}M</div>
                  <div style="font-size:12px;font-weight:700;color:#efeee7;margin:2px 0;">${sc.name}</div>
                  <div style="font-size:10px;color:#a7b0ba;">${sc.summary}</div>
                </div>
              `).join("")}
            </div>
            <button type="button" id="btn-mdl-auto-baseline" style="padding:6px 12px;border-radius:5px;border:1px solid rgba(74,222,128,0.5);background:rgba(74,222,128,0.14);color:#63e6a8;font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
              ⚡ APPLY RECOMMENDED BASELINE FOR ${t.scenario.code}
            </button>
          `;
        } else if (activeTab === "orbit") {
          tabContent = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px;margin-bottom:10px;">
              ${Object.values(ORBIT_OPTIONS).map((o) => `
                <div class="mdl-q-orb" data-id="${o.id}" style="padding:9px;border-radius:7px;border:1px solid ${md.orbitId === o.id ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${md.orbitId === o.id ? "rgba(var(--ui-brand-rgb),0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                  <div style="font-size:11.5px;font-weight:700;color:#efeee7;">${o.name}</div>
                  <div style="font-family:monospace;font-size:9.5px;color:var(--ui-brand);">Req ΔV ${o.reqInsertionDv} m/s · Rad ${o.radiationEnvKrad} krad</div>
                </div>
              `).join("")}
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">
              ${Object.values(LAUNCH_VEHICLES).map((v) => `
                <div class="mdl-q-lv" data-id="${v.id}" style="padding:9px;border-radius:7px;border:1px solid ${md.launchVehicleId === v.id ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${md.launchVehicleId === v.id ? "rgba(var(--ui-brand-rgb),0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                  <div style="font-size:11px;font-weight:700;color:#efeee7;">${v.name}</div>
                  <div style="font-family:monospace;font-size:9.5px;color:var(--ui-brand);">$${v.costM}M · Lift: ${v.capacityKg[md.orbitId] || 0} kg</div>
                </div>
              `).join("")}
            </div>
          `;
        } else if (activeTab === "bus") {
          tabContent = `
            <div style="display:grid;grid-template-columns:260px 1fr;gap:12px;align-items:start;">
              <div>
                <div id="mdl-point-design-3d" style="width:100%;height:156px;border-radius:6px;background:#050914;"></div>
                <div style="font-family:monospace;font-size:9px;color:#a7b0ba;text-align:center;margin-top:4px;">LIVE 3D POINT DESIGN (${t.bus.id.toUpperCase()})</div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:7px;">
                ${Object.values(SPACECRAFT_BUSES).map((b) => `
                  <div class="mdl-q-bus" data-id="${b.id}" style="padding:8px;border-radius:6px;border:1px solid ${md.busId === b.id ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${md.busId === b.id ? "rgba(var(--ui-brand-rgb),0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                    <div style="font-size:11px;font-weight:700;color:#efeee7;">${b.name}</div>
                    <div style="font-family:monospace;font-size:9px;color:var(--ui-brand);">$${b.costM}M · ${b.dryMassKg} kg · ${b.maxInstruments} bays</div>
                  </div>
                `).join("")}
                ${Object.values(POWER_SYSTEMS).map((p) => `
                  <div class="mdl-q-pwr" data-id="${p.id}" style="padding:8px;border-radius:6px;border:1px solid ${md.powerId === p.id ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${md.powerId === p.id ? "rgba(var(--ui-brand-rgb),0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                    <div style="font-size:11px;font-weight:700;color:#efeee7;">${p.name}</div>
                    <div style="font-family:monospace;font-size:9px;color:#63e6a8;">+$${p.costM}M · +${p.genW} W</div>
                  </div>
                `).join("")}
              </div>
            </div>
          `;
        } else {
          tabContent = `
            <canvas id="sim-science-canvas" width="680" height="150" style="width:100%;height:150px;border-radius:6px;border:1px solid rgba(var(--ui-brand-rgb),0.3);margin-bottom:8px;display:block;"></canvas>
            <div style="font-family:monospace;font-size:10px;color:var(--ui-brand-strong);margin-bottom:6px;">
              REAL NASA / CSA ANALOGUE: <strong style="color:#efeee7;">${t.analogue.missions}</strong>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;">
              ${t.riskMatrix.map((r) => `
                <div style="padding:6px;border-radius:5px;background:rgba(0,0,0,0.35);border-left:3px solid ${r.level === "GREEN" ? "#63e6a8" : r.level === "AMBER" ? "#f5c451" : "#ff6b6b"};">
                  <div style="font-family:monospace;font-size:9px;font-weight:700;color:#efeee7;">${r.subsystem} (${r.level})</div>
                  <div style="font-family:monospace;font-size:8.5px;color:#a7b0ba;">L:${r.likelihood} / C:${r.consequence}</div>
                </div>
              `).join("")}
            </div>
          `;
        }

        body.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: renderDesk })}
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
            ${mkTab("arch", "1. SCENARIO")}
            ${mkTab("orbit", "2. ORBIT & LAUNCH")}
            ${mkTab("bus", "3. 3D BUS & POWER")}
            ${mkTab("viz", "4. RISK & SCIENCE PREVIEW")}
          </div>
          ${tabContent}
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);">
            <button type="button" id="btn-mdl-export-json" style="padding:8px 12px;border-radius:5px;border:1px solid rgba(var(--ui-brand-rgb),0.5);background:rgba(var(--ui-brand-rgb),0.12);color:var(--ui-brand-strong);font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
              💾 EXPORT POINT DESIGN (.JSON)
            </button>
            <button type="button" id="btn-mdl-sync-crew" style="padding:9px 18px;border-radius:6px;border:1px solid var(--ui-brand);background:#efeee7;color:#05070a;font-family:monospace;font-size:10.5px;font-weight:800;letter-spacing:1.2px;cursor:pointer;">
              SYNC POINT DESIGN TO CREW & CLOSE
            </button>
          </div>
        `;

        body.querySelectorAll(".mdl-desk-tab").forEach((b) => {
          b.addEventListener("click", () => { activeTab = b.dataset.tab; renderDesk(); });
        });
        body.querySelectorAll(".mdl-q-sc").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.scenarioId = c.dataset.id;
            this._renderResourceMeters();
            renderDesk();
          });
        });
        const btnAuto = body.querySelector("#btn-mdl-auto-baseline");
        if (btnAuto) {
          btnAuto.addEventListener("click", () => {
            this.applyRecommendedScenarioBaseline(this.missionDesign.scenarioId);
            renderDesk();
          });
        }
        body.querySelectorAll(".mdl-q-orb").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.orbitId = c.dataset.id;
            this._renderResourceMeters();
            renderDesk();
          });
        });
        body.querySelectorAll(".mdl-q-lv").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.launchVehicleId = c.dataset.id;
            this._renderResourceMeters();
            renderDesk();
          });
        });
        body.querySelectorAll(".mdl-q-bus").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.busId = c.dataset.id;
            this._renderResourceMeters();
            renderDesk();
          });
        });
        body.querySelectorAll(".mdl-q-pwr").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.powerId = c.dataset.id;
            this._renderResourceMeters();
            renderDesk();
          });
        });
        const btnExp = body.querySelector("#btn-mdl-export-json");
        if (btnExp) btnExp.addEventListener("click", () => this.exportMdlPointDesignJson());
        const btnSync = body.querySelector("#btn-mdl-sync-crew");
        if (btnSync) {
          btnSync.addEventListener("click", () => {
            if (window.netManager && typeof window.netManager.syncMissionDesign === "function") {
              window.netManager.syncMissionDesign(this.syncFullDesignPatch());
            }
            this.showToast("📡 Point Design synchronized across Launch / Space / Ground / User crew");
            this.closeTaskModal();
          });
        }
      };

      renderDesk();
    }

    setupNetwork() {
      if (!window.netManager) return;

      window.netManager.on("task_completed", (data) => {
        this.updateTaskBar(data.tasks);
        if (data.mission) {
          this.applyMissionDefinition(data.mission);
        } else {
          if (data.taskId) {
            const t = this.tasks.find((x) => x.id === data.taskId);
            if (t) t.completed = true;
          }
          this.updateTaskListUI();
        }
        if (!data.alreadyCompleted) {
          this.showToast(`✅ [MISSION] ${data.playerName} verified: ${data.taskName}`);
        }
      });

      window.netManager.on("objective_locked", (data) => {
        const mission = (data && data.mission) || this.getMissionState();
        if (data && data.reason === "station_phase") {
          this.showToast("🛰️ THIS CONSOLE IS AVAILABLE INSIDE THE STATION — FOLLOW THE BOARDING MARKERS AND LAUNCH FIRST");
          if (mission) this.syncMissionUi(mission);
          return;
        }
        const names = ((data && data.missing) || []).map((id) => {
          const def = mission && Array.isArray(mission.objectives)
            ? mission.objectives.find((objective) => objective.id === id)
            : null;
          const task = this.tasks.find((entry) => entry.id === id);
          return def ? def.title : (task ? task.name : id);
        });
        this.showToast(`🔒 OBJECTIVE LOCKED — COMPLETE ${names.join(" + ") || "PRIOR OBJECTIVES"} FIRST`);
        if (mission) this.applyMissionDefinition(mission);
      });

      window.netManager.on("state_sync", (data) => {
        if (!data || !data.tasks) return;
        const completed = data.tasks.completed || 0;
        if (completed !== this.lastSyncedTaskCount) {
          this.lastSyncedTaskCount = completed;
          this.updateTaskBar(data.tasks);
        }
      });

      window.netManager.on("game_started", (data) => {
        this.resetTasks();
        if (data && data.mission) this.applyMissionDefinition(data.mission);
      });

      window.netManager.on("crew_victory", (data) => {
        if (data && data.mission) this.applyMissionDefinition(data.mission);
        this.showVictory(data.reason, data.debrief);
      });
    }

    bindUI() {
      const toggleChecklist = document.getElementById("hud-checklist-toggle");
      const checklistPanel = document.getElementById("hud-checklist-panel");
      if (toggleChecklist && checklistPanel) {
        const toggleCollapse = () => {
          const collapsed = checklistPanel.classList.toggle("collapsed");
          toggleChecklist.setAttribute("aria-expanded", collapsed ? "false" : "true");
          if (window.spaceAudio) window.spaceAudio.playClick();
        };
        toggleChecklist.addEventListener("click", toggleCollapse);
        toggleChecklist.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleCollapse();
          }
        });
      }

      const btnUse = document.getElementById("btn-proximity-use");
      if (btnUse) {
        btnUse.addEventListener("click", () => {
          if (this.nearbyTask) {
            this.openTaskModal(this.nearbyTask);
          }
        });
      }

      const btnCloseTask = document.getElementById("task-modal-close");
      if (btnCloseTask) {
        btnCloseTask.addEventListener("click", () => {
          this.closeTaskModal();
        });
      }

      window.addEventListener("keydown", (e) => {
        if (!window.isGameStarted) return;
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
        if (window.missionViz && window.missionViz.isActive) return;
        if (window.issShowcase && window.issShowcase.isActive) return;
        if (window.vrManager && window.vrManager.isAnyVRActive) return;
        if (window.launchCutscene && window.launchCutscene.isPlaying) return;
        if (window.dockingSim && window.dockingSim.isActive) return;
        if (window.spaceCenter && window.spaceCenter.siteTourActive) return;
        const briefingEl = document.getElementById("mission-briefing-overlay");
        if (briefingEl && briefingEl.style.display === "flex") return;
        const victoryEl = document.getElementById("victory-overlay");
        if (victoryEl && victoryEl.style.display === "flex") return;
        if (e.code === "KeyE") {
          // Do not intercept [E] when at Space Center LC-39A (Space Center uses [E] to board the spacecraft)
          if (window.spaceCenter && window.spaceCenter.isGroundMode) return;
          if (this.activeTask) {
            this.closeTaskModal();
          } else if (this.nearbyTask) {
            this.openTaskModal(this.nearbyTask);
          }
        }
      });
    }

    // Allows players to open the Mission Architecture console directly from the Space Center Pad or HUD
    openMissionPlannerFromGround() {
      const archTask = this.tasks.find((t) => t.id === "task_antenna") || this.tasks[0];
      if (archTask) {
        this.openTaskModal(archTask);
      }
    }

    updateProximity(playerPos) {
      if (this.activeTask) return;

      const mission = this.getMissionState();
      const completed = new Set((mission && mission.completedObjectives) || []);
      let closest = null;
      let minDistance = 3.0;

      // Allow opening even completed consoles so players can iterate & refine their mission design at any time!
      for (let i = 0; i < this.tasks.length; i++) {
        const t = this.tasks[i];
        const isCompleted = mission ? completed.has(t.id) : t.completed;
        const isAvailable = this.isTaskAvailable(t.id, mission);
        if (!isCompleted && !isAvailable) continue;
        const dx = playerPos.x - t.pos[0];
        const dz = playerPos.z - t.pos[2];
        const dist = Math.hypot(dx, dz);
        if (dist < minDistance) {
          minDistance = dist;
          closest = t;
        }
      }

      this.nearbyTask = closest;

      const btnUse = document.getElementById("btn-proximity-use");
      const labelUse = document.getElementById("proximity-task-label");
      const crosshair = document.getElementById("hud-crosshair");

      if (btnUse && labelUse) {
        const touchUI = !!(window.isMobileDevice || document.body.classList.contains("touch-ui") ||
          (window.matchMedia && window.matchMedia("(pointer: coarse), (hover: none)").matches));
        const useKey = touchUI ? "" : "[E] ";
        const badge = btnUse.querySelector(".prox-key-badge");
        if (badge) badge.textContent = touchUI ? "TAP" : "E";
        if (closest) {
          const assign = this._getRoleAssignment(closest.role);
          const tag = assign.isMine ? `[★ ${assign.badgeText}]` : `[${assign.badgeText}]`;
          btnUse.style.display = "flex";
          labelUse.textContent = `${useKey}${tag} ${closest.completed ? "REVIEW " : ""}${closest.name.toUpperCase()}`;
        } else {
          btnUse.style.display = "none";
        }
      }

      if (crosshair) {
        if (closest) {
          crosshair.classList.add("target-locked");
        } else {
          crosshair.classList.remove("target-locked");
        }
      }
    }

    openTaskModal(task) {
      const mission = this.getMissionState();
      const isCompleted = mission && Array.isArray(mission.completedObjectives)
        ? mission.completedObjectives.indexOf(task.id) !== -1
        : task.completed;
      const phase = mission && mission.phase;
      const stationOnly = phase && phase !== "station" && task.id !== "task_antenna";
      if (!isCompleted && stationOnly) {
        this.showToast("🛰️ THIS CONSOLE IS AVAILABLE INSIDE THE STATION — FOLLOW THE BOARDING MARKERS AND LAUNCH FIRST");
        if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
        return;
      }
      if (!isCompleted && !this.isTaskAvailable(task.id, mission)) {
        this.showToast(`🔒 ${this.getTaskLockReason(task.id, mission) || "COMPLETE THE PRIOR OBJECTIVE FIRST"}`);
        if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
        return;
      }

      this._runCleanup();
      this.activeTask = task;
      const modal = document.getElementById("task-modal-overlay");
      const title = document.getElementById("task-modal-title");
      const body = document.getElementById("task-modal-content");

      if (!modal || !title || !body) return;

      const assign = this._getRoleAssignment(task.role);
      title.textContent = task.name.replace(/^\d+\.\s*/, "").toUpperCase();
      body.innerHTML = "";
      modal.style.display = "flex";

      if (window.spaceAudio) window.spaceAudio.playClick();

      switch (task.kind) {
        case "mission-architecture":
          this.renderMissionArchitectureConsole(body, task);
          break;
        case "orbit-launch":
          this.renderOrbitAndLaunchConsole(body, task);
          break;
        case "bus-power":
          this.renderBusAndPowerConsole(body, task);
          break;
        case "science-payload":
          this.renderSciencePayloadConsole(body, task);
          break;
        case "thermal-radiation":
          this.renderThermalRadiationConsole(body, task);
          break;
        case "comms-propulsion":
          this.renderCommsPropulsionConsole(body, task);
          break;
        case "mission-simulation":
          this.renderMissionSimulationConsole(body, task);
          break;
        default:
          this.renderMissionArchitectureConsole(body, task);
          break;
      }
    }

    _runCleanup() {
      if (typeof this.activeCleanup === "function") {
        try {
          this.activeCleanup();
        } catch (e) {}
        this.activeCleanup = null;
      }
    }

    closeTaskModal() {
      this._runCleanup();
      this.activeTask = null;
      this._activeRenderCallback = null;
      if (this._pdAnimId) {
        cancelAnimationFrame(this._pdAnimId);
        this._pdAnimId = 0;
      }
      const modal = document.getElementById("task-modal-overlay");
      if (modal) modal.style.display = "none";
      this._renderResourceMeters();
      if (window.spaceAudio) window.spaceAudio.playClick();
    }

    finishTask(task, stayOpen = false) {
      this._runCleanup();
      const wasCompleted = task.completed;
      task.completed = true;
      this._renderResourceMeters();

      if (window.spaceAudio) window.spaceAudio.playRadioBeep(false);

      const patch = this.buildDesignPatch(task);
      const hasPatch = patch && Object.keys(patch).length > 0;
      if (window.netManager && (!wasCompleted || hasPatch)) {
        window.netManager.completeTask(task.id, task.name, patch);
      }

      this.updateTaskListUI();
      this.updateTaskBar();
      if (typeof window.renderHudCrewRoster === "function") window.renderHudCrewRoster();

      if (!stayOpen) {
        setTimeout(() => {
          this.closeTaskModal();
        }, 420);
      }
    }

    // ========================================================================
    // CONSOLE 1: MISSION ARCHITECTURE, SCENARIO & 4-ROLE TEAM STRATEGY
    // ========================================================================
    renderMissionArchitectureConsole(container, task) {
      const render = () => {
        const md = this.missionDesign;
        const t = this.evaluateMissionDesign();

        const scenarioIcons = {
          earth_climate: "globe",
          lunar_south_pole: "moon",
          asteroid_rendezvous: "asteroid",
          space_telescope: "telescope",
          cubesat_101: "cubesat",
          sandbox: "flask"
        };
        const scenarioCards = Object.values(MISSION_SCENARIOS)
          .map((sc) => {
            const active = md.scenarioId === sc.id;
            const icon = window.uiIcon ? window.uiIcon(scenarioIcons[sc.id] || "orbit", "ui-icon ui-icon--lg") : "";
            return `
              <div class="md-scenario-card mission-card${active ? " is-active" : ""}" data-id="${sc.id}" role="button" tabindex="0" aria-pressed="${active ? "true" : "false"}" title="${sc.name} — ${sc.summary}">
                <div class="mission-card__header">
                  <span class="mission-card__icon" aria-hidden="true">${icon}</span>
                  <span class="mission-card__titles">
                    <span class="mission-card__title">${sc.name}</span>
                    <span class="ui-eyebrow">${sc.code}</span>
                  </span>
                  ${active ? `<span class="mission-card__check" aria-hidden="true">${window.uiIcon ? window.uiIcon("check", "ui-icon ui-icon--sm") : ""}</span>` : ""}
                </div>
                <dl class="mission-card__stats">
                  <div class="mission-card__stat"><dt>BUDGET</dt><dd>$${Math.round(sc.baseBudgetM * t.difficulty.budgetMultiplier)}M</dd></div>
                  <div class="mission-card__stat"><dt>DURATION</dt><dd>${sc.targetLifetimeMonths} MO</dd></div>
                </dl>
              </div>
            `;
          })
          .join("");

        const diffBtns = Object.values(DIFFICULTY_LEVELS)
          .map((d) => {
            const active = md.difficultyId === d.id;
            return `
              <button type="button" class="md-diff-btn difficulty-card${active ? " is-active" : ""}" data-id="${d.id}" aria-pressed="${active ? "true" : "false"}">
                <span class="difficulty-card__title">${d.name}</span>
                <span class="difficulty-card__desc">${d.desc}</span>
              </button>
            `;
          })
          .join("");

        let specializationHtml = "";
        if (t.scenario.requiresWavelength) {
          specializationHtml = `
            <div style="margin-bottom:12px;">
              <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:var(--ui-brand-strong);margin-bottom:6px;">
                STEP 1C · TELESCOPE OBSERVING WAVELENGTH (CONSTRAINS OPTICS, ORBIT & CRYO THERMAL)
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">
                ${Object.values(WAVELENGTH_BANDS).map((wb) => {
                  const active = md.wavelengthId === wb.id;
                  return `
                    <div class="md-wave-card" data-id="${wb.id}" style="padding:10px;border-radius:7px;border:1px solid ${active ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(var(--ui-brand-rgb),0.14)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                      <div style="font-size:11.5px;font-weight:700;color:#efeee7;">${wb.name}</div>
                      <div style="font-size:10px;color:#a7b0ba;margin-top:3px;line-height:1.35;">${wb.explain}</div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
          `;
        } else if (t.scenario.isCubesat) {
          specializationHtml = `
            <div style="margin-bottom:12px;">
              <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:var(--ui-brand);margin-bottom:6px;">
                STEP 1C · NASA CSLI CUBESAT FORM FACTOR (CONSTRAINS MASS, VOLUME & POWER)
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">
                ${Object.values(CUBESAT_FORMS).map((cf) => {
                  const active = md.cubesatFormId === cf.id;
                  return `
                    <div class="md-csform-card" data-id="${cf.id}" style="padding:10px;border-radius:7px;border:1px solid ${active ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(var(--ui-brand-rgb),0.14)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                      <div style="font-size:11.5px;font-weight:700;color:#efeee7;">${cf.name}</div>
                      <div style="font-family:monospace;font-size:9.5px;color:#63e6a8;margin:3px 0;">Max Mass: ${cf.maxMassKg} kg · Max Bays: ${cf.maxInst}</div>
                      <div style="font-size:10px;color:#a7b0ba;line-height:1.35;">${cf.explain}</div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
          `;
        }

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
              <span style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;">
                STEP 1A · SELECT PRIMARY MISSION OBJECTIVE & SCENARIO
              </span>
              <button type="button" id="btn-arch-apply-rec" style="padding:4px 9px;border-radius:5px;border:1px solid rgba(74,222,128,0.45);background:rgba(74,222,128,0.12);color:#63e6a8;font-family:monospace;font-size:9.5px;font-weight:700;cursor:pointer;">
                ⚡ APPLY RECOMMENDED BASELINE FOR ${t.scenario.code}
              </button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px;">
              ${scenarioCards}
            </div>
          </div>

          ${specializationHtml}

          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 1B · ENGINEERING CONSTRAINTS & DIFFICULTY TIER
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${diffBtns}
            </div>
          </div>

          <div style="padding:10px 12px;border-radius:8px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.1);margin-bottom:14px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.3px;color:var(--ui-brand);margin-bottom:6px;">
              ACTIVE 3-ROLE CREW DUTY ROSTER (CLICK A ROLE TO SWITCH DUTY)
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;font-size:10.5px;color:#efeee7;margin-top:6px;">
              ${(["commander", "engineer", "scientist"]).map((rId) => {
                const a = this._getRoleAssignment(rId);
                const duties = rId === "commander"
                  ? "Pad Launch Auth [L] · Docking Pilot · Console 1 [HUB], Console 2 [CMD] & Sim"
                  : rId === "engineer"
                    ? "Pad Access Arm [F] · Docking RCS [1/2] · Console 3 [PWR] & Console 6 [ENG]"
                    : "Docking Boresight [3/4] · Console 4 [SCI] & Console 5 [LSS ECLSS]";
                return `
                  <div style="padding:8px 10px;border-radius:6px;border:1px solid ${a.isMine ? a.color : "rgba(255,255,255,0.12)"};background:${a.isMine ? "rgba(var(--ui-brand-rgb),0.08)" : "rgba(0,0,0,0.25)"};display:flex;flex-direction:column;gap:4px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                      <strong style="color:${a.color};">[${a.short}] ${this._escapeHtml(a.label)}</strong>
                      <span style="font-family:monospace;font-size:9px;color:${a.isUnstaffed ? "#f5c451" : "#63e6a8"};">${this._escapeHtml(a.namesText)}</span>
                    </div>
                    <div style="font-size:10px;color:#efeee7;line-height:1.35;">${duties}</div>
                    <button type="button" class="md-switch-role-btn" data-role="${rId}" style="margin-top:2px;padding:4px 8px;border-radius:4px;border:1px solid ${a.isMine ? a.color : "rgba(255,255,255,0.2)"};background:${a.isMine ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)"};color:#efeee7;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">
                      ${a.isMine ? "★ YOUR ACTIVE ROLE" : `ASSUME ${a.short}`}
                    </button>
                  </div>
                `;
              }).join("")}
            </div>
            <div style="font-size:11px;color:#63e6a8;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);">
              💡 <strong>Engineering Insight:</strong> ${t.scenario.tradeoffTip}
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <span style="font-family:monospace;font-size:10px;color:#a7b0ba;">
              Active Objective: <strong style="color:#efeee7;">${t.scenario.code}</strong> · Budget Cap: <strong style="color:#63e6a8;">$${t.budgetCapM}M</strong>
            </span>
            <button type="button" id="btn-commit-arch" class="btn-primary">
              LOCK MISSION CHARTER & CONTINUE
            </button>
          </div>
        `;

        container.querySelectorAll(".md-scenario-card").forEach((card) => {
          const selectScenario = () => {
            this.missionDesign.scenarioId = card.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          };
          card.addEventListener("click", selectScenario);
          card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectScenario();
            }
          });
        });

        const btnRec = container.querySelector("#btn-arch-apply-rec");
        if (btnRec) {
          btnRec.addEventListener("click", () => {
            this.applyRecommendedScenarioBaseline(this.missionDesign.scenarioId);
            if (window.spaceAudio) window.spaceAudio.playClick();
            this.showToast(`⚡ Applied recommended baseline configuration for ${t.scenario.code}`);
            render();
          });
        }

        container.querySelectorAll(".md-wave-card").forEach((card) => {
          card.addEventListener("click", () => {
            this.missionDesign.wavelengthId = card.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        container.querySelectorAll(".md-csform-card").forEach((card) => {
          card.addEventListener("click", () => {
            this.missionDesign.cubesatFormId = card.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        container.querySelectorAll(".md-switch-role-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const targetRole = btn.getAttribute("data-role");
            if (window.netManager && typeof window.netManager.customizeAstronaut === "function") {
              window.netManager.explicitRoleSelected = true;
              window.netManager.customizeAstronaut(null, null, targetRole, null, null, null, { explicitRole: true });
            }
            if (typeof window.buildLocalAstronaut === "function") {
              const col = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.color) || "#c9f04b";
              window.buildLocalAstronaut(col, targetRole);
            }
            if (typeof window.syncLobbySelectionUI === "function") window.syncLobbySelectionUI();
            if (typeof window.renderHudCrewRoster === "function") window.renderHudCrewRoster();
            this.updateTaskListUI();
            if (window.spaceAudio) window.spaceAudio.playClick();
            render();
          });
        });

        container.querySelectorAll(".md-diff-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            this.missionDesign.difficultyId = btn.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        const commitBtn = container.querySelector("#btn-commit-arch");
        if (commitBtn) {
          commitBtn.addEventListener("click", () => {
            this.finishTask(task);
          });
        }
      };

      render();
    }

    // ========================================================================
    // CONSOLE 2: ORBIT SELECTION & LAUNCH VEHICLE COMPATIBILITY (`task_nav`)
    // ========================================================================
    renderOrbitAndLaunchConsole(container, task) {
      const render = () => {
        const md = this.missionDesign;
        const t = this.evaluateMissionDesign();

        const orbitCards = Object.values(ORBIT_OPTIONS)
          .map((orb) => {
            const active = md.orbitId === orb.id;
            const rec = t.scenario.recommendedOrbits.includes(orb.id);
            return `
              <div class="md-orbit-card" data-id="${orb.id}" style="padding:11px;border-radius:8px;border:1px solid ${active ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(var(--ui-brand-rgb),0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                  <span style="font-size:12px;font-weight:700;color:#efeee7;">${orb.name}</span>
                  ${rec ? `<span style="font-family:monospace;font-size:8.5px;padding:2px 6px;border-radius:4px;background:rgba(99,230,168,0.18);color:#63e6a8;font-weight:700;">RECOMMENDED</span>` : ""}
                </div>
                <div style="font-family:monospace;font-size:10px;color:var(--ui-brand);margin-bottom:5px;">
                  Period: ${orb.periodMin} min · Eclipse: ${Math.round(orb.eclipseFraction * 100)}% · Insertion ΔV: ${orb.reqInsertionDv} m/s · Rad: ${orb.radiationEnvKrad} krad
                </div>
                <div style="font-size:10.5px;color:#a7b0ba;line-height:1.4;">${orb.explain}</div>
              </div>
            `;
          })
          .join("");

        const lvCards = Object.values(LAUNCH_VEHICLES)
          .map((veh) => {
            const active = md.launchVehicleId === veh.id;
            const capForOrbit = veh.capacityKg[md.orbitId] || 0;
            const fits = t.wetMassKg <= capForOrbit;
            return `
              <div class="md-lv-card" data-id="${veh.id}" style="padding:11px;border-radius:8px;border:1px solid ${active ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(var(--ui-brand-rgb),0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                  <span style="font-size:12px;font-weight:700;color:#efeee7;">${veh.name}</span>
                  <span style="font-family:monospace;font-size:10.5px;font-weight:700;color:var(--ui-brand);">$${veh.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:10px;color:${fits ? "#63e6a8" : "#ff6b6b"};margin-bottom:5px;">
                  Max Lift to Selected Orbit: ${capForOrbit} kg (Your Spacecraft: ${t.wetMassKg} kg) · Fairing: ${veh.fairingM}m
                </div>
                <div style="font-size:10.5px;color:#a7b0ba;line-height:1.4;">${veh.explain}</div>
              </div>
            `;
          })
          .join("");

        const compatible = t.massOk && t.budgetOk;

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 2A · SELECT TARGET ORBITAL REGIME
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;">
              ${orbitCards}
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 2B · SELECT LAUNCH VEHICLE (CHECK MASS vs. ORBIT CAPACITY)
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;">
              ${lvCards}
            </div>
          </div>

          <div style="padding:10px 12px;border-radius:8px;background:${t.massOk ? "rgba(99,230,168,0.08)" : "rgba(255,107,107,0.12)"};border:1px solid ${t.massOk ? "rgba(99,230,168,0.35)" : "rgba(255,107,107,0.45)"};margin-bottom:14px;font-size:11.5px;color:#efeee7;">
            ${
              t.massOk
                ? `✅ <strong>Launch Compatibility Verified:</strong> ${t.lv.name} can inject <strong>${t.lvCapacityKg} kg</strong> into ${t.orbit.name}, giving your <strong>${t.wetMassKg} kg</strong> spacecraft a <strong>+${t.massMarginPct}%</strong> launch mass margin.`
                : `⚠️ <strong>Launch Vehicle Overload:</strong> Your spacecraft wet mass (<strong>${t.wetMassKg} kg</strong>) exceeds the <strong>${t.lvCapacityKg} kg</strong> capacity of ${t.lv.name} to ${t.orbit.name}, or exceeds bus instrument bays. Choose a heavier launcher, a lower orbit, or lighter subsystems.`
            }
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <span style="font-family:monospace;font-size:10px;color:#a7b0ba;">
              ${compatible ? "Trajectory & Lift Margins Nominal" : "Resolve mass or budget constraint before locking"}
            </span>
            <button type="button" id="btn-commit-orbit" style="padding:10px 20px;border-radius:6px;border:1px solid ${t.massOk ? "var(--ui-brand)" : "rgba(255,107,107,0.6)"};background:${t.massOk ? "#efeee7" : "rgba(255,107,107,0.2)"};color:${t.massOk ? "#05070a" : "#ff6b6b"};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.4px;cursor:pointer;">
              ${t.massOk ? "CONFIRM ORBIT & LAUNCHER" : "REQUIRE MASS ≤ LIFT CAPACITY"}
            </button>
          </div>
        `;

        container.querySelectorAll(".md-orbit-card").forEach((card) => {
          card.addEventListener("click", () => {
            this.missionDesign.orbitId = card.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        container.querySelectorAll(".md-lv-card").forEach((card) => {
          card.addEventListener("click", () => {
            this.missionDesign.launchVehicleId = card.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        const commitBtn = container.querySelector("#btn-commit-orbit");
        if (commitBtn) {
          commitBtn.addEventListener("click", () => {
            if (!t.massOk) {
              if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
              this.showToast("⚠️ Spacecraft mass exceeds Launch Vehicle lift capacity for this orbit!");
              return;
            }
            this.finishTask(task);
          });
        }
      };

      render();
    }

    // ========================================================================
    // CONSOLE 3: SPACECRAFT BUS, SOLAR/RTG POWER & BATTERY STORAGE (`task_wires`)
    // ========================================================================
    renderBusAndPowerConsole(container, task) {
      const render = () => {
        const md = this.missionDesign;
        const t = this.evaluateMissionDesign();

        const busCards = Object.values(SPACECRAFT_BUSES)
          .map((b) => {
            const active = md.busId === b.id;
            return `
              <div class="md-bus-card" data-id="${b.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(var(--ui-brand-rgb),0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#efeee7;">
                  <span>${b.name}</span>
                  <span style="font-family:monospace;color:var(--ui-brand);">$${b.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:var(--ui-brand);margin:4px 0;">
                  Dry Mass: ${b.dryMassKg} kg · Base Load: ${b.basePowerLoadW} W · Max Instruments: ${b.maxInstruments}
                </div>
                <div style="font-size:10px;color:#a7b0ba;line-height:1.35;">${b.explain}</div>
              </div>
            `;
          })
          .join("");

        const pwrCards = Object.values(POWER_SYSTEMS)
          .map((p) => {
            const active = md.powerId === p.id;
            return `
              <div class="md-pwr-card" data-id="${p.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(var(--ui-brand-rgb),0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#efeee7;">
                  <span>${p.name}</span>
                  <span style="font-family:monospace;color:var(--ui-brand);">$${p.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:#63e6a8;margin:4px 0;">
                  Output: +${p.genW} W · Mass: ${p.massKg} kg
                </div>
                <div style="font-size:10px;color:#a7b0ba;line-height:1.35;">${p.explain}</div>
              </div>
            `;
          })
          .join("");

        const batCards = Object.values(BATTERY_PACKS)
          .map((b) => {
            const active = md.batteryId === b.id;
            return `
              <div class="md-bat-card" data-id="${b.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "#63e6a8" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(99,230,168,0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#efeee7;">
                  <span>${b.name}</span>
                  <span style="font-family:monospace;color:var(--ui-brand);">$${b.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:var(--ui-brand);margin:4px 0;">
                  Storage: ${b.capacityWh} Wh · Mass: ${b.massKg} kg
                </div>
                <div style="font-size:10px;color:#a7b0ba;line-height:1.35;">${b.explain}</div>
              </div>
            `;
          })
          .join("");

        const csFormBar = t.scenario.isCubesat
          ? `<div style="margin-bottom:10px;padding:8px 10px;border-radius:7px;background:rgba(var(--ui-brand-rgb),0.06);border:1px solid rgba(var(--ui-brand-rgb),0.28);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <span style="font-family:monospace;font-size:9.5px;font-weight:700;color:var(--ui-brand);">CUBESAT FORM FACTOR:</span>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${Object.values(CUBESAT_FORMS).map((cf) => `<button type="button" class="md-csform-btn" data-id="${cf.id}" style="padding:4px 9px;border-radius:4px;border:1px solid ${md.cubesatFormId === cf.id ? "var(--ui-brand)" : "rgba(255,255,255,0.16)"};background:${md.cubesatFormId === cf.id ? "rgba(var(--ui-brand-rgb),0.22)" : "rgba(0,0,0,0.3)"};color:#efeee7;font-family:monospace;font-size:9.5px;font-weight:700;cursor:pointer;">${cf.shortLabel}</button>`).join("")}
              </div>
            </div>`
          : "";

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          ${csFormBar}
          <div style="display:grid;grid-template-columns:260px 1fr;gap:12px;align-items:start;margin-bottom:10px;">
            <div style="padding:8px;border-radius:8px;background:rgba(0,0,0,0.35);border:1px solid rgba(var(--ui-brand-rgb),0.24);">
              <div style="font-family:monospace;font-size:9px;font-weight:700;letter-spacing:1px;color:var(--ui-brand);margin-bottom:5px;">LIVE 3D POINT DESIGN</div>
              <div id="mdl-point-design-3d" style="width:100%;height:156px;border-radius:6px;background:#050914;"></div>
              <div style="font-family:monospace;font-size:9px;color:#a7b0ba;margin-top:5px;">
                Bus: <strong style="color:#efeee7;">${t.bus.name.split(" ")[0]}</strong> · Dry: <strong>${t.dryMassKg} kg</strong>
              </div>
            </div>
            <div>
              <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
                STEP 3A · SPACECRAFT PRIMARY STRUCTURE & AVIONICS BUS
              </div>
              <div style="display:grid;grid-template-columns:1fr;gap:7px;">
                ${busCards}
              </div>
            </div>
          </div>

          <div style="margin-bottom:10px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 3B · SOLAR ARRAY / RTG POWER GENERATION
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
              ${pwrCards}
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 3C · ECLIPSE ENERGY STORAGE (LI-ION / SOLID-STATE BATTERY)
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
              ${batCards}
            </div>
          </div>

          <div style="padding:10px 12px;border-radius:8px;background:${t.powerOk ? "rgba(99,230,168,0.08)" : "rgba(255,107,107,0.12)"};border:1px solid ${t.powerOk ? "rgba(99,230,168,0.35)" : "rgba(255,107,107,0.45)"};margin-bottom:12px;font-size:11px;color:#efeee7;line-height:1.45;">
            <strong>Electrical Power Balance Equation:</strong> Continuous spacecraft + instrument load is <strong>${t.totalPowerLoadW} W</strong>, plus <strong>${t.rechargePowerNeededW} W</strong> needed during daylight to recharge the battery after each <strong>${(t.eclipseHours * 60).toFixed(0)}-minute</strong> orbital eclipse (${t.eclipseEnergyNeedWh} Wh drawn, <strong>${t.batteryDodPct}% Depth-of-Discharge</strong>).
            ${t.powerOk ? `✅ Net daylight power margin is <strong>+${t.netDaylightMarginW} W</strong> and Battery DoD is safe (≤80%).` : `⚠️ Power deficit or excessive battery discharge (>80% DoD). Select larger solar wings/RTG or a higher-capacity battery bank.`}
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <span style="font-family:monospace;font-size:10px;color:#a7b0ba;">
              Bus Bays Used: ${t.selectedInsts.length}/${t.maxInstruments} · Net Margin: ${t.netDaylightMarginW >= 0 ? `+${t.netDaylightMarginW}W` : `${t.netDaylightMarginW}W`}
            </span>
            <button type="button" id="btn-commit-bus" style="padding:10px 20px;border-radius:6px;border:1px solid ${t.powerOk ? "var(--ui-brand)" : "rgba(255,107,107,0.6)"};background:${t.powerOk ? "#efeee7" : "rgba(255,107,107,0.2)"};color:${t.powerOk ? "#05070a" : "#ff6b6b"};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.4px;cursor:pointer;">
              ${t.powerOk ? "LOCK BUS & ELECTRICAL POWER SYSTEM" : "RESOLVE POWER / BATTERY DEFICIT"}
            </button>
          </div>
        `;

        container.querySelectorAll(".md-csform-btn").forEach((b) => {
          b.addEventListener("click", () => {
            this.missionDesign.cubesatFormId = b.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        container.querySelectorAll(".md-bus-card").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.busId = c.dataset.id;
            if (window.glbManager) {
              const busObj = SPACECRAFT_BUSES[c.dataset.id];
              if (busObj) window.glbManager.selectedStationModelId = busObj.glbId;
            }
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        container.querySelectorAll(".md-pwr-card").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.powerId = c.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        container.querySelectorAll(".md-bat-card").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.batteryId = c.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        const commitBtn = container.querySelector("#btn-commit-bus");
        if (commitBtn) {
          commitBtn.addEventListener("click", () => {
            if (!t.powerOk) {
              if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
              this.showToast("⚠️ Power generation or battery capacity is insufficient for orbital eclipse!");
              return;
            }
            this.finishTask(task);
          });
        }
      };

      render();
    }

    // ========================================================================
    // CONSOLE 4: SCIENTIFIC PAYLOAD & INSTRUMENT TRADE-OFFS (`task_science`)
    // ========================================================================
    renderSciencePayloadConsole(container, task) {
      const render = () => {
        const md = this.missionDesign;
        const t = this.evaluateMissionDesign();

        const instCards = SCIENTIFIC_INSTRUMENTS.map((inst) => {
          const selected = md.instruments.includes(inst.id);
          const isPriority = t.scenario.requiredScienceTypes.includes(inst.type);
          return `
            <div class="md-inst-card" data-id="${inst.id}" style="padding:11px;border-radius:8px;border:1px solid ${selected ? "#63e6a8" : "rgba(255,255,255,0.12)"};background:${selected ? "rgba(74,222,128,0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-size:12px;font-weight:700;color:#efeee7;">${selected ? "☑ " : "☐ "}${inst.name}</span>
                ${isPriority ? `<span style="font-family:monospace;font-size:8.5px;padding:2px 6px;border-radius:4px;background:rgba(var(--ui-brand-rgb),0.16);color:var(--ui-brand);font-weight:700;">MISSION PRIORITY</span>` : ""}
              </div>
              <div style="font-family:monospace;font-size:9.5px;color:var(--ui-brand);margin-bottom:5px;">
                Mass: ${inst.massKg} kg · Power: ${inst.powerW} W · Cost: $${inst.costM}M · Data: ${inst.dataMbps} Mbps · Sci: +${inst.scienceVal}
              </div>
              <div style="font-size:10px;color:#a7b0ba;line-height:1.35;">${inst.explain}</div>
            </div>
          `;
        }).join("");

        const baysOk = t.selectedInsts.length >= 2 && t.selectedInsts.length <= t.maxInstruments;
        const payloadValid = baysOk && t.scienceScore >= 55 && t.telescopeOk;

        const waveBanner = t.scenario.requiresWavelength
          ? `<div style="margin-bottom:10px;padding:9px 11px;border-radius:7px;background:${t.telescopeOk ? "rgba(var(--ui-brand-rgb),0.08)" : "rgba(255,107,107,0.12)"};border:1px solid ${t.telescopeOk ? "rgba(var(--ui-brand-rgb),0.35)" : "rgba(255,107,107,0.45)"};">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
                <span style="font-family:monospace;font-size:9.5px;font-weight:700;color:var(--ui-brand-strong);">TELESCOPE WAVELENGTH BAND:</span>
                <div style="display:flex;gap:5px;flex-wrap:wrap;">
                  ${Object.values(WAVELENGTH_BANDS).map((wb) => `<button type="button" class="md-wave-pill" data-id="${wb.id}" style="padding:3px 7px;border-radius:4px;border:1px solid ${md.wavelengthId === wb.id ? "var(--ui-brand)" : "rgba(255,255,255,0.16)"};background:${md.wavelengthId === wb.id ? "rgba(var(--ui-brand-rgb),0.22)" : "rgba(0,0,0,0.3)"};color:#efeee7;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">${wb.shortLabel}</button>`).join("")}
                </div>
              </div>
              <div style="font-size:10.5px;color:${t.telescopeOk ? "#63e6a8" : "#ff6b6b"};">
                ${t.telescopeOk ? `✅ Wavelength (${t.wavelength.shortLabel}), Detectors, Thermal Control & Orbit are optically compatible.` : `⚠️ ${t.telescopeIssues.join(" · ")}`}
              </div>
            </div>`
          : "";

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          ${waveBanner}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
            <span style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;">
              SELECT SCIENTIFIC INSTRUMENTS (BAYS USED: ${t.selectedInsts.length} / ${t.maxInstruments} MAX ON ${t.bus.name.toUpperCase()})
            </span>
            <span style="font-family:monospace;font-size:10px;color:#63e6a8;">
              Matched Priority Objectives: ${t.matchedTypes.length} / ${t.scenario.requiredScienceTypes.length}
            </span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;margin-bottom:12px;">
            ${instCards}
          </div>

          <div style="padding:10px 12px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);margin-bottom:12px;font-size:11px;color:#efeee7;line-height:1.45;">
            <strong>Payload Trade-Off Analysis:</strong> Your ${t.selectedInsts.length} selected instruments draw <strong>${t.selectedInsts.reduce((a, b) => a + b.powerW, 0)} W</strong>, weigh <strong>${t.selectedInsts.reduce((a, b) => a + b.massKg, 0)} kg</strong>, cost <strong>$${t.selectedInsts.reduce((a, b) => a + b.costM, 0)}M</strong>, and generate <strong>${t.dataGeneratedGbPerDay} GB/day</strong> of raw science telemetry. Adding high-value instruments like the L-Band SAR increases science return to <strong>${t.scienceScore}/100</strong>, but requires higher solar power and Ka/X-Band downlink capacity.
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <span style="font-family:monospace;font-size:10px;color:#a7b0ba;">
              Science Value Score: <strong style="color:#63e6a8;">${t.scienceScore}/100</strong> (Min 55 required)
            </span>
            <button type="button" id="btn-commit-science" style="padding:10px 20px;border-radius:6px;border:1px solid ${payloadValid ? "var(--ui-brand)" : "rgba(255,107,107,0.6)"};background:${payloadValid ? "#efeee7" : "rgba(255,107,107,0.2)"};color:${payloadValid ? "#05070a" : "#ff6b6b"};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.4px;cursor:pointer;">
              ${payloadValid ? "INTEGRATE SCIENCE PAYLOAD SUITE" : (!t.telescopeOk ? "RESOLVE WAVELENGTH / OPTICS CONFLICT" : `SELECT 2–${t.maxInstruments} INSTRUMENTS (SCI ≥ 55)`)}
            </button>
          </div>
        `;

        container.querySelectorAll(".md-wave-pill").forEach((btn) => {
          btn.addEventListener("click", () => {
            this.missionDesign.wavelengthId = btn.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        container.querySelectorAll(".md-inst-card").forEach((card) => {
          card.addEventListener("click", () => {
            const id = card.dataset.id;
            const idx = this.missionDesign.instruments.indexOf(id);
            if (idx >= 0) {
              if (this.missionDesign.instruments.length > 1) {
                this.missionDesign.instruments.splice(idx, 1);
              }
            } else {
              if (this.missionDesign.instruments.length >= t.maxInstruments) {
                this.showToast(`⚠️ Current bus/form supports at most ${t.maxInstruments} instruments! Upgrade or deselect one.`);
                if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
                return;
              }
              this.missionDesign.instruments.push(id);
            }
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        const commitBtn = container.querySelector("#btn-commit-science");
        if (commitBtn) {
          commitBtn.addEventListener("click", () => {
            if (!payloadValid) {
              if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
              this.showToast(!t.telescopeOk
                ? `⚠️ ${t.telescopeIssues[0]}`
                : "⚠️ Select 2 to " + t.maxInstruments + " instruments with at least 55 Science Value!");
              return;
            }
            this.finishTask(task);
          });
        }
      };

      render();
    }

    // ========================================================================
    // CONSOLE 5: THERMAL REJECTION, RADIATION SHIELDING & ECLSS (`task_lss`)
    // ========================================================================
    renderThermalRadiationConsole(container, task) {
      const render = () => {
        const md = this.missionDesign;
        const t = this.evaluateMissionDesign();

        const thmCards = Object.values(THERMAL_RADIATION_PACKAGES)
          .map((pkg) => {
            const active = md.thermalId === pkg.id;
            return `
              <div class="md-thm-card" data-id="${pkg.id}" style="padding:12px;border-radius:8px;border:1px solid ${active ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(var(--ui-brand-rgb),0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                  <span style="font-size:12px;font-weight:700;color:#efeee7;">${pkg.name}</span>
                  <span style="font-family:monospace;font-size:11px;font-weight:700;color:var(--ui-brand);">$${pkg.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:#63e6a8;margin-bottom:5px;">
                  Heat Rejection Cap: ${pkg.thermalCapW} W · Radiation Vault: ${pkg.radRatingKrad} krad · Mass: ${pkg.massKg} kg · Power: ${pkg.powerW} W
                </div>
                <div style="font-size:10.5px;color:#a7b0ba;line-height:1.4;">${pkg.explain}</div>
              </div>
            `;
          })
          .join("");

        const envSurvived = t.thermalOk && t.radiationOk && t.lifetimeOk;

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              SELECT THERMAL REJECTION RADIATORS & AVIONICS RADIATION SHIELDING
            </div>
            <div style="display:grid;grid-template-columns:1fr;gap:8px;">
              ${thmCards}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:14px;">
            <div style="padding:10px;border-radius:6px;background:rgba(0,0,0,0.35);border:1px solid ${t.thermalOk ? "rgba(99,230,168,0.35)" : "rgba(255,107,107,0.5)"};">
              <div style="font-family:monospace;font-size:9.5px;color:#a7b0ba;">THERMAL DISSIPATION</div>
              <div style="font-family:monospace;font-size:13px;font-weight:700;color:${t.thermalOk ? "#63e6a8" : "#ff6b6b"};margin-top:2px;">
                ${t.thm.thermalCapW} W Cap vs ${t.totalPowerLoadW} W Load
              </div>
              <div style="font-size:10px;color:#a7b0ba;margin-top:2px;">All electrical power consumed onboard turns into waste heat that must be radiated to space.</div>
            </div>
            <div style="padding:10px;border-radius:6px;background:rgba(0,0,0,0.35);border:1px solid ${t.radiationOk ? "rgba(99,230,168,0.35)" : "rgba(255,107,107,0.5)"};">
              <div style="font-family:monospace;font-size:9.5px;color:#a7b0ba;">TOTAL IONIZING DOSE (TID)</div>
              <div style="font-family:monospace;font-size:13px;font-weight:700;color:${t.radiationOk ? "#63e6a8" : "#ff6b6b"};margin-top:2px;">
                ${t.thm.radRatingKrad} krad vs ${Math.max(t.scenario.minRadiationKrad, t.orbit.radiationEnvKrad)} krad Req
              </div>
              <div style="font-size:10px;color:#a7b0ba;margin-top:2px;">Protects flight computers and focal-plane sensors from solar protons and Van Allen belt electrons.</div>
            </div>
            <div style="padding:10px;border-radius:6px;background:rgba(0,0,0,0.35);border:1px solid ${t.lifetimeOk ? "rgba(99,230,168,0.35)" : "rgba(255,107,107,0.5)"};">
              <div style="font-family:monospace;font-size:9.5px;color:#a7b0ba;">OPERATIONAL LIFETIME</div>
              <div style="font-family:monospace;font-size:13px;font-weight:700;color:${t.lifetimeOk ? "#63e6a8" : "#ff6b6b"};margin-top:2px;">
                ${t.estimatedLifetimeMonths} Months (Target: ${t.scenario.targetLifetimeMonths} mo)
              </div>
              <div style="font-size:10px;color:#a7b0ba;margin-top:2px;">Determined by radiation shielding, battery cycle depth-of-discharge, and propellant reserve.</div>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <span style="font-family:monospace;font-size:10px;color:#a7b0ba;">
              ${envSurvived ? "Thermal, Radiation & Lifetime Margins Verified" : "Upgrade shielding or battery to meet mission lifetime"}
            </span>
            <button type="button" id="btn-commit-thm" style="padding:10px 20px;border-radius:6px;border:1px solid ${envSurvived ? "var(--ui-brand)" : "rgba(255,107,107,0.6)"};background:${envSurvived ? "#efeee7" : "rgba(255,107,107,0.2)"};color:${envSurvived ? "#05070a" : "#ff6b6b"};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.4px;cursor:pointer;">
              ${envSurvived ? "QUALIFY THERMAL & RADIATION SHIELDING" : "RESOLVE THERMAL / RADIATION / LIFETIME"}
            </button>
          </div>
        `;

        container.querySelectorAll(".md-thm-card").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.thermalId = c.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        const commitBtn = container.querySelector("#btn-commit-thm");
        if (commitBtn) {
          commitBtn.addEventListener("click", () => {
            if (!envSurvived) {
              if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
              this.showToast("⚠️ Thermal radiator capacity or radiation shielding is below orbital requirements!");
              return;
            }
            this.finishTask(task);
          });
        }
      };

      render();
    }

    // ========================================================================
    // CONSOLE 6: COMMS LINK BUDGET & PROPULSION DELTA-V (`task_hull`)
    // ========================================================================
    renderCommsPropulsionConsole(container, task) {
      const render = () => {
        const md = this.missionDesign;
        const t = this.evaluateMissionDesign();

        const comCards = Object.values(COMMS_PACKAGES)
          .map((c) => {
            const active = md.commsId === c.id;
            return `
              <div class="md-com-card" data-id="${c.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(var(--ui-brand-rgb),0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:#efeee7;">
                  <span>${c.name}</span>
                  <span style="font-family:monospace;color:var(--ui-brand);">$${c.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:var(--ui-brand);margin:3px 0;">
                  Downlink: ${c.rateMbps} Mbps · Mass: ${c.massKg} kg · Power: ${c.powerW} W
                </div>
                <div style="font-size:10px;color:#a7b0ba;line-height:1.35;">${c.explain}</div>
              </div>
            `;
          })
          .join("");

        const gndCards = Object.values(GROUND_NETWORKS)
          .map((g) => {
            const active = md.groundNetId === g.id;
            return `
              <div class="md-gnd-card" data-id="${g.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "#a7b0ba" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(154,143,196,0.14)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:#efeee7;">
                  <span>${g.name}</span>
                  <span style="font-family:monospace;color:var(--ui-brand);">$${g.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:var(--ui-brand-strong);margin:3px 0;">
                  Receiver Gain: +${g.gainDb} dB · Pass Coverage: ${g.contactMultiplier}x
                </div>
                <div style="font-size:10px;color:#a7b0ba;line-height:1.35;">${g.explain}</div>
              </div>
            `;
          })
          .join("");

        const propCards = Object.values(PROPULSION_SYSTEMS)
          .map((p) => {
            const active = md.propulsionId === p.id;
            return `
              <div class="md-prop-card" data-id="${p.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "#63e6a8" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(99,230,168,0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:#efeee7;">
                  <span>${p.name}</span>
                  <span style="font-family:monospace;color:var(--ui-brand);">$${p.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:#63e6a8;margin:3px 0;">
                  Isp: ${p.ispSec} s · Fuel: ${p.propellantKg} kg · Dry: ${p.dryMassKg} kg · Power: ${p.powerW} W
                </div>
                <div style="font-size:10px;color:#a7b0ba;line-height:1.35;">${p.explain}</div>
              </div>
            `;
          })
          .join("");

        const dispCards = Object.values(DISPOSAL_OPTIONS)
          .map((d) => {
            const active = md.disposalId === d.id;
            return `
              <div class="md-disp-card" data-id="${d.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(var(--ui-brand-rgb),0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#efeee7;">
                  <span>${d.name}</span>
                  <span style="font-family:monospace;color:var(--ui-brand);">$${d.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9px;color:${d.id === "none_drift" ? "#ff6b6b" : "#63e6a8"};margin:3px 0;">
                  Deorbit: ${d.deorbitYears} yr · Mass: ${d.massKg} kg · Req ΔV: +${d.dvCostMs} m/s
                </div>
                <div style="font-size:10px;color:#a7b0ba;line-height:1.35;">${d.explain}</div>
              </div>
            `;
          })
          .join("");

        const systemsReady = t.commsOk && t.deltaVOk && t.disposalOk;

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          <div style="margin-bottom:10px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 6A · SPACECRAFT TRANSCEIVER & HIGH-GAIN ANTENNA
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
              ${comCards}
            </div>
          </div>

          <div style="margin-bottom:10px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 6B · GROUND STATION TRACKING NETWORK
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
              ${gndCards}
            </div>
          </div>

          <div style="margin-bottom:10px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 6C · ORBITAL PROPULSION & DELTA-V (TSIOLKOVSKY ROCKET EQUATION)
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">
              ${propCards}
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:var(--ui-brand);margin-bottom:6px;">
              STEP 6D · END-OF-MISSION (EoM) DISPOSAL & ORBITAL DEBRIS MITIGATION
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
              ${dispCards}
            </div>
          </div>

          <div style="padding:10px 12px;border-radius:8px;background:${systemsReady ? "rgba(99,230,168,0.08)" : "rgba(255,107,107,0.12)"};border:1px solid ${systemsReady ? "rgba(99,230,168,0.35)" : "rgba(255,107,107,0.45)"};margin-bottom:12px;font-size:11px;color:#efeee7;line-height:1.45;">
            <div><strong>1. Link Budget & Data Balance:</strong> Link Margin is <strong>${t.linkMarginDb} dB</strong> (min 3.0 dB required for carrier lock at ${t.orbit.altitudeKm.toLocaleString()} km) and daily downlink capacity is <strong>${t.downlinkCapGbPerDay} GB/day</strong> vs. <strong>${t.dataGeneratedGbPerDay} GB/day</strong> generated by your instruments.</div>
            <div style="margin-top:4px;"><strong>2. Tsiolkovsky Rocket Equation (Δv = I_sp · g₀ · ln(m₀ / m_f)):</strong> With wet mass m₀ = <strong>${t.wetMassKg} kg</strong> and dry mass m_f = <strong>${t.dryMassKg} kg</strong>, your propulsion delivers <strong>${t.achievedDeltaV} m/s</strong> vs. <strong>${t.requiredDeltaV} m/s</strong> required (incl. +${t.disposal.dvCostMs} m/s EoM disposal).</div>
            <div style="margin-top:4px;"><strong>3. Debris Compliance:</strong> ${t.disposalOk ? `✅ ${t.disposalNote}` : `⚠️ ${t.disposalNote}`}</div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <span style="font-family:monospace;font-size:10px;color:#a7b0ba;">
              Link: ${t.linkMarginDb} dB · ΔV: ${t.achievedDeltaV}/${t.requiredDeltaV} m/s · EoM: ${t.disposalOk ? "PASS" : "FAIL"}
            </span>
            <button type="button" id="btn-commit-comms" style="padding:10px 20px;border-radius:6px;border:1px solid ${systemsReady ? "var(--ui-brand)" : "rgba(255,107,107,0.6)"};background:${systemsReady ? "#efeee7" : "rgba(255,107,107,0.2)"};color:${systemsReady ? "#05070a" : "#ff6b6b"};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.4px;cursor:pointer;">
              ${systemsReady ? "LOCK COMMS, PROPULSION & EoM DISPOSAL" : "RESOLVE LINK, DELTA-V OR EoM DISPOSAL"}
            </button>
          </div>
        `;

        container.querySelectorAll(".md-com-card").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.commsId = c.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        container.querySelectorAll(".md-gnd-card").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.groundNetId = c.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        container.querySelectorAll(".md-prop-card").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.propulsionId = c.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        container.querySelectorAll(".md-disp-card").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.disposalId = c.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        const commitBtn = container.querySelector("#btn-commit-comms");
        if (commitBtn) {
          commitBtn.addEventListener("click", () => {
            if (!systemsReady) {
              if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
              this.showToast("⚠️ Ensure Link Margin, Delta-V, and End-of-Mission disposal requirements all pass!");
              return;
            }
            this.finishTask(task);
          });
        }
      };

      render();
    }

    // ========================================================================
    // CONSOLE 7: FULL MISSION SIMULATION & POST-MISSION EVALUATION (`task_landing`)
    // ========================================================================
    renderMissionSimulationConsole(container, task) {
      const render = () => {
        const t = this.evaluateMissionDesign();

        // Build 5-stage simulation log evaluating every engineering trade-off
        const phases = [
          {
            phase: "PHASE 1 · LAUNCH & ASCENT",
            ok: t.massOk && t.budgetOk,
            metric: `${t.wetMassKg} / ${t.lvCapacityKg} kg (${t.massMarginPct}% margin) · $${t.totalCostM}M / $${t.budgetCapM}M`,
            detail: t.massOk && t.budgetOk
              ? `${t.lv.name} cleared the tower at LC-39A and injected the ${t.wetMassKg} kg spacecraft onto its transfer trajectory with $${Math.max(0, t.budgetRemainingM)}M budget reserve.`
              : !t.massOk
                ? `FAILURE: Spacecraft wet mass (${t.wetMassKg} kg) exceeded ${t.lv.name} capacity (${t.lvCapacityKg} kg) for ${t.orbit.name}.`
                : `BUDGET OVERRUN: Total cost ($${t.totalCostM}M) exceeded the $${t.budgetCapM}M cap by $${Math.abs(t.budgetRemainingM)}M.`
          },
          {
            phase: "PHASE 2 · ORBITAL INSERTION & PROPULSION BURN",
            ok: t.deltaVOk,
            metric: `Achieved ΔV: ${t.achievedDeltaV} m/s vs Required: ${t.requiredDeltaV} m/s`,
            detail: t.deltaVOk
              ? `${t.prop.name} executed orbital insertion burn cleanly, leaving ${t.achievedDeltaV - t.requiredDeltaV} m/s of station-keeping propellant reserve.`
              : `FAILURE: ${t.prop.name} only provided ${t.achievedDeltaV} m/s, falling short of the ${t.requiredDeltaV} m/s required to capture into ${t.orbit.name}.`
          },
          {
            phase: "PHASE 3 · SOLAR ARRAY DEPLOYMENT & ECLIPSE POWER TEST",
            ok: t.powerOk,
            metric: `Load: ${t.totalPowerLoadW} W vs Gen: ${t.daylightGenW} W · Eclipse DoD: ${t.batteryDodPct}%`,
            detail: t.powerOk
              ? `${t.pwr.name} generated ${t.daylightGenW} W in sunlight (+${t.netDaylightMarginW} W net margin) and ${t.bat.name} sustained all instruments through ${Math.round(t.eclipseHours * 60)}-min eclipses at ${t.batteryDodPct}% DoD.`
              : `BROWNOUT: Continuous payload load (${t.totalPowerLoadW} W) + recharge exceeded solar capacity or drained battery past 80% Depth-of-Discharge (${t.batteryDodPct}%).`
          },
          {
            phase: "PHASE 4 · SPACE WEATHER EVENT (CME SOLAR PARTICLE STORM)",
            ok: t.thermalOk && t.radiationOk && t.lifetimeOk,
            metric: `Vault: ${t.thm.radRatingKrad} krad · Heat Cap: ${t.thm.thermalCapW} W · Life: ${t.estimatedLifetimeMonths} mo`,
            detail: t.thermalOk && t.radiationOk && t.lifetimeOk
              ? `${t.thm.name} absorbed a Coronal Mass Ejection solar storm without single-event latchup, sustaining full operations across ${t.estimatedLifetimeMonths} months.`
              : `DEGRADATION: Radiation dose or waste heat (${t.totalPowerLoadW} W) exceeded ${t.thm.name} limits, shortening lifetime to ${t.estimatedLifetimeMonths} months (target ${t.scenario.targetLifetimeMonths} mo).`
          },
          {
            phase: "PHASE 5 · SCIENCE CAMPAIGN & DEEP-SPACE DATA DOWNLINK",
            ok: t.commsOk && t.scienceScore >= 60,
            metric: `${t.downlinkCapGbPerDay} GB/d Downlink vs ${t.dataGeneratedGbPerDay} GB/d · Link: ${t.linkMarginDb} dB · Sci: ${t.scienceScore}/100`,
            detail: t.commsOk
              ? `${t.com.name} linked with ${t.gnd.name} at +${t.linkMarginDb} dB carrier margin, transmitting 100% of ${t.dataGeneratedGbPerDay} GB/day science telemetry from ${t.selectedInsts.length} instruments.`
              : `DATA BOTTLENECK: Link margin (${t.linkMarginDb} dB) or downlink capacity (${t.downlinkCapGbPerDay} GB/d) could not transmit the ${t.dataGeneratedGbPerDay} GB/d generated by the payload.`
          }
        ];

        const allNominal = phases.every((p) => p.ok) && t.disposalOk && t.telescopeOk && t.overallScore >= 75;

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}

          <div style="padding:10px 12px;border-radius:8px;background:rgba(var(--ui-brand-rgb),0.06);border:1px solid rgba(var(--ui-brand-rgb),0.28);margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
              <span style="font-family:monospace;font-size:9.5px;font-weight:700;color:var(--ui-brand-strong);">
                ${t.analogue.agencyTag} HERITAGE MATCH: <strong style="color:#efeee7;">${t.analogue.missions}</strong>
              </span>
              <span style="font-family:monospace;font-size:9.5px;color:var(--ui-brand);">
                ${t.disposalOk ? `✓ EoM ${t.disposal.deorbitYears} yr COMPLIANT` : "⚠️ EoM NON-COMPLIANT"}
              </span>
            </div>
            <canvas id="sim-science-canvas" width="700" height="150" style="width:100%;height:150px;border-radius:6px;border:1px solid rgba(var(--ui-brand-rgb),0.28);display:block;margin-bottom:8px;"></canvas>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;">
              ${t.riskMatrix.map((r) => `
                <div style="padding:5px 7px;border-radius:5px;background:rgba(0,0,0,0.35);border-left:3px solid ${r.level === "GREEN" ? "#63e6a8" : r.level === "AMBER" ? "#f5c451" : "#ff6b6b"};">
                  <div style="font-family:monospace;font-size:8.5px;font-weight:700;color:#efeee7;">${r.subsystem} (${r.level})</div>
                  <div style="font-family:monospace;font-size:8px;color:#a7b0ba;">L:${r.likelihood} / C:${r.consequence}</div>
                </div>
              `).join("")}
            </div>
          </div>

          <div style="padding:12px;border-radius:8px;background:rgba(0,0,0,0.42);border:1px solid rgba(255,255,255,0.12);margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
              <span style="font-family:monospace;font-size:10.5px;font-weight:700;letter-spacing:1.4px;color:var(--ui-brand);">
                INTEGRATED FLIGHT SIMULATION & POST-MISSION ENGINEERING REPORT
              </span>
              <span style="font-family:monospace;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:${allNominal ? "rgba(74,222,128,0.15)" : "rgba(var(--ui-brand-rgb),0.15)"};color:${allNominal ? "#63e6a8" : "var(--ui-brand)"};">
                ${allNominal ? "MISSION RATING: GRADE A (FLIGHT QUALIFIED)" : `MISSION RATING: ${t.overallScore}/100 (NEEDS REFINEMENT)`}
              </span>
            </div>

            <div style="display:flex;flex-direction:column;gap:7px;">
              ${phases
                .map(
                  (p) => `
                  <div style="padding:9px 11px;border-radius:6px;background:rgba(255,255,255,0.025);border-left:3px solid ${p.ok ? "#63e6a8" : "#ff6b6b"};">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                      <span style="font-family:monospace;font-size:10px;font-weight:700;color:${p.ok ? "#63e6a8" : "#ff6b6b"};">
                        ${p.ok ? "✅ " : "❌ "}${p.phase}
                      </span>
                      <span style="font-family:monospace;font-size:9.5px;color:#efeee7;">${p.metric}</span>
                    </div>
                    <div style="font-size:11px;color:#a7b0ba;margin-top:3px;line-height:1.4;">${p.detail}</div>
                  </div>
                `
                )
                .join("")}
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" id="btn-sim-lunar-3d" style="padding:9px 12px;border-radius:6px;border:1px solid rgba(var(--ui-brand-rgb),0.5);background:rgba(var(--ui-brand-rgb),0.12);color:var(--ui-brand-strong);font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
                🌕 LUNAR 3D [K]
              </button>
              <button type="button" id="btn-sim-export-json" style="padding:9px 12px;border-radius:6px;border:1px solid rgba(var(--ui-brand-rgb),0.5);background:rgba(var(--ui-brand-rgb),0.12);color:var(--ui-brand);font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
                💾 EXPORT MDL (.JSON)
              </button>
              <button type="button" id="btn-sim-edit-arch" style="padding:9px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#efeee7;font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
                ⚙️ EDIT DESIGN
              </button>
            </div>
            <button type="button" id="btn-commit-sim" style="padding:10px 22px;border-radius:6px;border:1px solid ${allNominal ? "#63e6a8" : "var(--ui-brand)"};background:${allNominal ? "#efeee7" : "rgba(var(--ui-brand-rgb),0.22)"};color:${allNominal ? "#05070a" : "var(--ui-brand-strong)"};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.4px;cursor:pointer;">
              ${allNominal ? "LAUNCH FULL MISSION SIMULATION & COMPLETE" : "COMPLETE WITH CURRENT DESIGN (" + t.overallScore + "/100)"}
            </button>
          </div>
        `;

        const btnExportSim = container.querySelector("#btn-sim-export-json");
        if (btnExportSim) {
          btnExportSim.addEventListener("click", () => this.exportMdlPointDesignJson());
        }

        const btnLunar = container.querySelector("#btn-sim-lunar-3d");
        if (btnLunar) {
          btnLunar.addEventListener("click", () => {
            this.closeTaskModal();
            if (window.shipInterior && typeof window.shipInterior.toggleMoonLandingScene === "function") {
              window.shipInterior.toggleMoonLandingScene(true);
            }
          });
        }

        const btnEdit = container.querySelector("#btn-sim-edit-arch");
        if (btnEdit) {
          btnEdit.addEventListener("click", () => {
            this.closeTaskModal();
            this.showToast("Walk to any station console [E] to adjust Orbit, Bus, Power, Instruments, or Propulsion and re-simulate!");
          });
        }

        const commitBtn = container.querySelector("#btn-commit-sim");
        if (commitBtn) {
          commitBtn.addEventListener("click", () => {
            this.missionDesign.lastSimulationReport = t;
            const onlineInRoom = !!(window.netManager && window.netManager.connected && window.netManager.roomId);
            const alreadyVictory = !!(window.netManager && window.netManager.roomState && window.netManager.roomState.status === "victory");
            this.finishTask(task, false);
            if (!onlineInRoom || alreadyVictory) {
              setTimeout(() => {
                if (alreadyVictory && typeof this.reopenVictory === "function") {
                  this.reopenVictory();
                } else {
                  this.showVictory(
                    `${t.scenario.name} completed with Overall Score ${t.overallScore}/100 (Science ${t.scienceScore}/100 · Engineering ${t.engineeringScore}/100 · Budget $${t.totalCostM}M/$${t.budgetCapM}M · Mass ${t.wetMassKg}/${t.lvCapacityKg} kg · ΔV ${t.achievedDeltaV} m/s · Lifetime ${t.estimatedLifetimeMonths} mo).`,
                    this.lastDebrief
                  );
                }
              }, 500);
            }
          });
        }
      };

      render();
    }

    updateTaskBar(taskData) {
      if (!taskData && window.netManager && window.netManager.roomState && window.netManager.roomState.tasks) {
        taskData = window.netManager.roomState.tasks;
      }
      const doneCount = this.tasks.filter((t) => t.completed).length;
      const tasks = taskData || { completed: doneCount, total: this.tasks.length };

      const scoreCoop = document.getElementById("race-score-coop");
      const fillCoop = document.getElementById("race-fill-coop");

      if (scoreCoop && fillCoop) {
        const done = Math.max(doneCount, tasks.completed || 0);
        const total = tasks.total || 7;
        const pct = Math.min(100, Math.round((done / total) * 100));
        scoreCoop.textContent = `${done} / ${total}`;
        fillCoop.style.width = `${pct}%`;
      }
    }

    updateTaskListUI() {
      const container = document.getElementById("hud-task-list");
      const countPill = document.getElementById("hud-checklist-count");
      const checklistTitle = document.getElementById("hud-checklist-title");
      const mission = this.getMissionState();

      if (mission) this.syncTasksFromMission(mission);

      if (checklistTitle) {
        checklistTitle.textContent = "OBJECTIVES";
      }

      let completedCount = 0;
      this.tasks.forEach((t) => {
        if (t.completed) completedCount++;
      });
      if (countPill) {
        const nextCountText = `${completedCount}/${this.tasks.length}`;
        if (countPill.textContent !== nextCountText) {
          countPill.textContent = nextCountText;
          countPill.classList.remove("is-bumped");
          void countPill.offsetWidth;
          countPill.classList.add("is-bumped");
          setTimeout(() => countPill.classList.remove("is-bumped"), 340);
        }
      }
      const progressFill = document.getElementById("hud-checklist-progress-fill");
      if (progressFill) {
        const progressPct = this.tasks.length ? Math.round((completedCount / this.tasks.length) * 100) : 0;
        progressFill.style.width = `${progressPct}%`;
      }

      if (window.shipInterior && typeof window.shipInterior.syncStationFaults === "function") {
        window.shipInterior.syncStationFaults(this.tasks);
      }

      if (!container) return;
      container.innerHTML = "";

      const completedSet = new Set((mission && mission.completedObjectives) || []);
      const previousCompleted = this._knownCompletedTasks || new Set();
      const nextCompleted = new Set();

      this.tasks.forEach((t) => {
        const isCompleted = mission ? completedSet.has(t.id) : t.completed;
        const isNewlyCompleted = isCompleted && !previousCompleted.has(t.id);
        const isAvailable = this.isTaskAvailable(t.id, mission);
        const isLocked = !isCompleted && !isAvailable;
        const lockReason = isLocked ? this.getTaskLockReason(t.id, mission) : "";
        const phase = mission && mission.phase;
        const phaseLocked = !isCompleted && !!phase && phase !== "station" && t.id !== "task_antenna";
        const isBlocked = isLocked || phaseLocked;
        const blockedReason = phaseLocked ? "Station only" : lockReason;

        const assign = this._getRoleAssignment(t.role);
        const item = document.createElement("div");
        if (isCompleted) nextCompleted.add(t.id);
        item.className = `objective-card${isCompleted ? " is-done" : ""}${isNewlyCompleted ? " is-newly-done" : ""}${isBlocked ? " is-locked" : ""}${assign.isMine && !isCompleted && !isBlocked ? " is-mine" : ""}`;
        item.style.setProperty("--i", String(this.tasks.indexOf(t)));
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", isBlocked ? "-1" : "0");
        item.setAttribute("aria-disabled", isBlocked ? "true" : "false");
        item.title = isBlocked
          ? blockedReason
          : (isCompleted ? `Completed — click to review (${assign.badgeText})` : `Owner: ${assign.badgeText} — Click to open console`);

        let badgeCls = "badge-all";
        if (assign.role === "commander") badgeCls = "badge-cmd";
        else if (assign.role === "engineer") badgeCls = "badge-eng";
        else if (assign.role === "scientist") badgeCls = "badge-sci";
        const roleBadge = `<span class="task-badge ${badgeCls}" title="${this._escapeHtml(assign.label || assign.badgeText || "")}">${this._escapeHtml(assign.role === "all" ? "ALL" : assign.short)}</span>`;

        const statusName = isCompleted ? "check" : phaseLocked ? "orbit" : isLocked ? "lock" : "play";
        const statusIcon = `<svg class="ui-icon" aria-hidden="true" focusable="false"><use href="#i-${statusName}"></use></svg>`;
        const statusLabel = isCompleted ? "Complete" : isBlocked ? "Locked" : "Available";
        const stateLabel = isCompleted ? "COMPLETE" : phaseLocked ? "ORBIT" : isLocked ? "LOCKED" : "OPEN";

        item.innerHTML = `
          <span class="objective-card__status" aria-label="${statusLabel}">${statusIcon}</span>
          <span class="objective-card__content">
            <span class="objective-card__title-row">
              <span class="objective-card__title">${this._escapeHtml(t.name)}</span>
              <span class="objective-card__state">${stateLabel}</span>
              ${roleBadge}
            </span>
            <span class="objective-card__meta">
              <svg class="ui-icon" aria-hidden="true" focusable="false"><use href="#i-pin"></use></svg>
              ${this._escapeHtml(t.location)}
            </span>
          </span>
        `;
        const openTask = () => {
          if (isBlocked) {
            if (window.gameplay) window.gameplay.showToast(`${phaseLocked ? "🛰️" : "🔒"} ${blockedReason || "COMPLETE THE PRIOR OBJECTIVE FIRST"}`);
            if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
            return;
          }
          this.openTaskModal(t);
        };
        item.addEventListener("click", openTask);
        item.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openTask();
          }
        });
        container.appendChild(item);
      });
      this._knownCompletedTasks = nextCompleted;
      if (typeof window.renderHudCrewRoster === "function") {
        window.renderHudCrewRoster();
      }
    }

    _escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    showVictory(reason, debrief) {
      const modal = document.getElementById("victory-overlay");
      const msg = document.getElementById("victory-msg");
      const title = document.getElementById("victory-title");
      const icon = document.getElementById("victory-icon");
      const details = document.getElementById("victory-debrief");
      const btnNext = document.getElementById("btn-victory-next");
      const btnClose = document.getElementById("btn-victory-close");

      this.lastDebrief = debrief || null;
      this.lastVictoryReason = reason || "";

      const data = debrief || {};
      const scenarioCode = data.scenarioCode || "LUNASPIS";
      const scenarioName = data.scenarioName || "Co-op Expedition";
      const difficulty = String(data.difficultyId || "engineer").toUpperCase();
      const durationSec = Math.max(0, Math.round((data.durationMs || 0) / 1000));
      const durationText = `${String(Math.floor(durationSec / 60)).padStart(2, "0")}:${String(durationSec % 60).padStart(2, "0")}`;
      const completedCount = Array.isArray(data.completedObjectives) ? data.completedObjectives.length : 0;
      const totalCount = data.totalObjectives || this.tasks.length;

      if (title) {
        title.textContent = `${scenarioCode} · MISSION COMPLETE`;
      }
      if (icon) icon.textContent = "MISSION DEBRIEF";
      if (msg) {
        msg.textContent = reason || `${scenarioName} complete.`;
      }

      if (details) {
        const crew = Array.isArray(data.crew) ? data.crew : [];
        const crewRows = crew.map((member) => `
          <div class="debrief-crew-row">
            <span class="debrief-crew-row__name">${this._escapeHtml(member.name || "Astronaut")}</span>
            <span class="debrief-crew-row__meta">${this._escapeHtml(String(member.role || "crew").slice(0, 3).toUpperCase())}</span>
          </div>
        `).join("");
        details.innerHTML = `
          <div class="debrief-grid">
            <div class="debrief-stat">
              <div class="debrief-stat__label">MISSION TIME</div>
              <div class="debrief-stat__value debrief-stat__value--accent">${durationText}</div>
            </div>
            <div class="debrief-stat">
              <div class="debrief-stat__label">COMPLETED</div>
              <div class="debrief-stat__value debrief-stat__value--sage">${completedCount}/${totalCount}</div>
            </div>
            <div class="debrief-stat">
              <div class="debrief-stat__label">DIFFICULTY</div>
              <div class="debrief-stat__value debrief-stat__value--amber">${this._escapeHtml(difficulty)}</div>
            </div>
          </div>
          <div class="debrief-section-label">CREW</div>
          <div class="debrief-crew-list">${crewRows}</div>
          <button type="button" id="btn-victory-export-mdl" class="btn-secondary btn-compact debrief-export">EXPORT DESIGN</button>
        `;
        const btnVExp = details.querySelector("#btn-victory-export-mdl");
        if (btnVExp) {
          btnVExp.addEventListener("click", () => this.exportMdlPointDesignJson());
        }
      }

      const isHost = !!(window.netManager && window.netManager.isHost);
      if (btnNext) {
        btnNext.disabled = !isHost;
        btnNext.textContent = isHost ? "NEXT →" : "WAITING FOR HOST";
        btnNext.onclick = () => {
          if (isHost && window.netManager && typeof window.netManager.returnToLobby === "function") {
            window.netManager.returnToLobby();
          }
        };
      }
      if (btnClose) {
        btnClose.textContent = "REVIEW";
        btnClose.title = "Hide the debrief — press [Y] to reopen it";
        btnClose.onclick = () => {
          if (modal) modal.style.display = "none";
        };
      }

      if (modal) {
        modal.style.display = "flex";
      }
      if (window.spaceAudio) window.spaceAudio.playWormholeJump();
    }

    reopenVictory() {
      if (!this.lastDebrief) return false;
      this.showVictory(this.lastVictoryReason, this.lastDebrief);
      return true;
    }

    resetTasks() {
      this.tasks.forEach((t) => {
        t.completed = false;
      });
      this._renderResourceMeters();
      this.activeTask = null;
      this.nearbyTask = null;
      this.lastSyncedTaskCount = 0;
      if (window.shipInterior && window.shipInterior.isMoonLandingActive) {
        window.shipInterior.toggleMoonLandingScene(false);
      }
      const victoryOverlay = document.getElementById("victory-overlay");
      if (victoryOverlay) victoryOverlay.style.display = "none";
      this.updateTaskListUI();
      this.updateTaskBar({ completed: 0, total: this.tasks.length });
    }

    showToast(text) {
      const toast = document.getElementById("action-toast");
      if (!toast) return;
      toast.textContent = text;
      toast.style.display = "block";
      clearTimeout(this._tId);
      this._tId = setTimeout(() => {
        toast.style.display = "none";
      }, 3600);
    }
  }

  window.GameplayEngine = GameplayEngine;
  window.gameplay = new GameplayEngine();
  window.showActionToast = (text) => {
    if (window.gameplay && typeof window.gameplay.showToast === "function") {
      window.gameplay.showToast(text);
    }
  };
})(window);
