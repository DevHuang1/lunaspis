/**
 * ============================================================================
 * SPACE MISSION DESIGNER & SCIENCE SIMULATOR CONSOLES
 * ============================================================================
 * Interactive, plain-English mission building and science simulator across 7 stations:
 * 1. [HUB] Mission Goal, Pick & Team Plan (`task_antenna`)
 * 2. [CMD] Orbit Path & Rocket Ride (`task_nav`)
 * 3. [PWR] Frame, Bags, Solar Power & Batteries (`task_wires`)
 * 4. [LSS-SCI] Science Tools & Experiment Setup (`task_science`)
 * 5. [LSS-ECLSS] Heating, Freezing & Radiation Shielding (`task_lss`)
 * 6. [HULL] Earth Antennas, Steering Fuel & Safe Return (`task_hull`)
 * 7. [LDR] Full Mission Test Run & Results (`task_landing`)
 *
 * Every choice updates live gauges across 6 everyday mission limits:
 * - BUDGET ($M) vs. Available Money
 * - WEIGHT (kg) vs. What Your Rocket Can Lift
 * - POWER (W) Daylight Electricity & Shadow Battery Drain (%)
 * - DATA (GB/day) Collected vs. Ground Dish Download Limit
 * - SIGNAL CLARITY (dB) & Steering Speed Boost (m/s)
 * - MISSION LIFE (Months) & Science Quality Score
 */

(function (window) {
  "use strict";

  // ==========================================================================
  // PLAIN-ENGLISH SPACE & SCIENCE EQUIPMENT CATALOGS
  // ==========================================================================

  const MISSION_SCENARIOS = {
    earth_climate: {
      id: "earth_climate",
      name: "Earth Weather & Melting Ice Watcher",
      code: "EARTH WATCH",
      badge: "EARTH & CLIMATE",
      baseBudgetM: 380,
      targetLifetimeMonths: 36,
      recommendedOrbits: ["sso_705", "leo_400"],
      requiredScienceTypes: ["optical", "radar", "altimetry", "spectrometer"],
      minDeltaV: 420,
      minRadiationKrad: 25,
      summary: "Watch polar ice sheets, sea levels, and greenhouse gases across the whole Earth from space.",
      tradeoffTip: "The Pole-to-Pole Daylight Orbit (705 km) sees all of Earth in steady sunlight. Pairing Cloud-Seeing Radar with the Laser Height Scanner tracks ice thickness day and night."
    },
    lunar_south_pole: {
      id: "lunar_south_pole",
      name: "Moon South Pole Water-Ice Hunter",
      code: "MOON ICE",
      badge: "MOON MISSION",
      baseBudgetM: 500,
      targetLifetimeMonths: 24,
      recommendedOrbits: ["lunar_polar_100", "gto_heo"],
      requiredScienceTypes: ["neutron", "altimetry", "spectrometer", "optical"],
      minDeltaV: 1150,
      minRadiationKrad: 50,
      summary: "Search dark craters at the Moon's South Pole for hidden water ice and safe landing zones for future astronauts.",
      tradeoffTip: "Circling the Moon takes extra steering push (1,150+ m/s) and a strong radio link to reach Earth across 384,400 km."
    },
    asteroid_rendezvous: {
      id: "asteroid_rendezvous",
      name: "Asteroid Rock & Dust Explorer",
      code: "ASTEROID",
      badge: "DEEP SPACE",
      baseBudgetM: 540,
      targetLifetimeMonths: 48,
      recommendedOrbits: ["gto_heo", "lunar_polar_100"],
      requiredScienceTypes: ["spectrometer", "altimetry", "magnetometer", "neutron"],
      minDeltaV: 1650,
      minRadiationKrad: 75,
      summary: "Fly alongside a rocky asteroid to map its surface minerals, gravity pull, and slow path drift.",
      tradeoffTip: "A 4-year deep-space trip needs heavy radiation shielding (level 75+), high-efficiency fuel, and giant NASA dishes on Earth."
    },
    space_telescope: {
      id: "space_telescope",
      name: "Deep-Space Star & Planet Telescope",
      code: "SPACE TELESCOPE",
      badge: "STARS & PLANETS",
      requiresWavelength: true,
      baseBudgetM: 620,
      targetLifetimeMonths: 60,
      recommendedOrbits: ["sun_earth_l2", "sso_705"],
      requiredScienceTypes: ["optical", "spectrometer"],
      minDeltaV: 1480,
      minRadiationKrad: 55,
      summary: "Choose what type of light your telescope sees, keep its mirrors super cold, and block Earth's glow in deep space.",
      tradeoffTip: "Heat-glow cameras need active cooling pipes and a cold dark spot far from warm Earth so stray heat does not blur faint planets."
    },
    cubesat_101: {
      id: "cubesat_101",
      name: "Pocket-Size Student Satellite",
      code: "MINI SATELLITE",
      badge: "MINI SATELLITE",
      isCubesat: true,
      baseBudgetM: 105,
      targetLifetimeMonths: 18,
      recommendedOrbits: ["iss_cubesat_418", "leo_400", "sso_705"],
      requiredScienceTypes: ["optical", "magnetometer"],
      minDeltaV: 85,
      minRadiationKrad: 15,
      summary: "Build a compact shoebox-size science satellite, catch a shared ride to orbit, and make sure it burns up cleanly within 5 years.",
      tradeoffTip: "Pick Shoebox (6 kg), Briefcase (14 kg), or Backpack (28 kg) size to fit your budget and follow clean-orbit end-of-mission safety rules."
    },
    bionutrients_2: {
      id: "bionutrients_2",
      name: "Space Station Vitamin Maker (BioNutrients-2)",
      code: "BIONUTRIENTS-2",
      badge: "SPACE STATION SCIENCE",
      isBioPayload: true,
      baseBudgetM: 18,
      targetLifetimeMonths: 12,
      recommendedOrbits: ["iss_cubesat_418", "leo_400"],
      requiredScienceTypes: ["optical", "spectrometer"],
      minDeltaV: 120,
      minRadiationKrad: 10,
      summary: "Launch light soft bags of sleeping yeast to the Space Station, add clean drinking water through a germ-blocking filter, warm at 30°C (+ 6-hour shake) to make beta-carotene (Vitamin A nutrient), and freeze at -80°C — using less weight (<250 g) and space (<300 mL) per bag.",
      tradeoffTip: "Pick the thin breathable bag with its Space Station safety lock cap, add the germ-blocking filter, warm to 30°C, do the 6-hour shake, and store in the -80°C ultra-cold freezer so 12+ bags hit 3.0+ mg/L Vitamin A nutrient."
    },
    sandbox: {
      id: "sandbox",
      name: "Free-Build Test Lab (Custom Mission)",
      code: "FREE PLAY",
      badge: "OPEN PLAYGROUND",
      baseBudgetM: 950,
      targetLifetimeMonths: 24,
      recommendedOrbits: ["leo_400", "iss_cubesat_418", "sso_705", "gto_heo", "lunar_polar_100", "sun_earth_l2"],
      requiredScienceTypes: ["optical", "spectrometer"],
      minDeltaV: 300,
      minRadiationKrad: 20,
      summary: "Mix and match any frames, rockets, science tools, and orbits freely with a huge budget.",
      tradeoffTip: "Use Free-Build mode to experiment without limits and see how weight, electricity, signal strength, and fuel trade off."
    }
  };

  const WAVELENGTH_BANDS = {
    uv_optical: {
      id: "uv_optical",
      name: "Visible & UV Light (Like Hubble)",
      shortLabel: "VISIBLE LIGHT",
      reqThermal: null,
      avoidLowEarthThermal: false,
      minBus: "smallsat_12u",
      preferredInstIds: ["inst_multispectral", "inst_lidar"],
      explain: "Captures crisp color and ultraviolet photos of bright young stars and planets. Works comfortably near normal room temperature."
    },
    near_ir: {
      id: "near_ir",
      name: "Warm Heat-Glow Light (Near-Infrared)",
      shortLabel: "HEAT-GLOW LIGHT",
      reqThermal: "pumped_loop_50",
      avoidLowEarthThermal: false,
      minBus: "modular_hex",
      preferredInstIds: ["inst_ir_spec", "inst_multispectral"],
      explain: "Sees through dusty space clouds to study distant galaxies and planet air. Needs Pipe Heat Coolers plus the Mineral & Gas Light Reader."
    },
    mid_ir: {
      id: "mid_ir",
      name: "Deep-Cold Heat Light (Mid-Infrared)",
      shortLabel: "DEEP-COLD LIGHT",
      reqThermal: "cryo_rad_90",
      avoidLowEarthThermal: true,
      minBus: "modular_hex",
      preferredInstIds: ["inst_ir_spec"],
      explain: "Spots newborn planets and signs of life. Strictly requires Deep-Freeze Cooling Pipes and a cold spot far away from Earth's warmth."
    },
    xray: {
      id: "xray",
      name: "High-Energy X-Ray Light",
      shortLabel: "X-RAY LIGHT",
      reqThermal: "pumped_loop_50",
      avoidLowEarthThermal: false,
      minBus: "modular_hex",
      preferredInstIds: ["inst_neutron", "inst_mag"],
      explain: "Special mirrors track black holes and exploding stars. Needs at least a Medium Frame and active Pipe Heat Coolers."
    }
  };

  const CUBESAT_FORMS = {
    "3u": {
      id: "3u",
      name: "Shoebox Size (10×10×34 cm · Max 6 kg)",
      shortLabel: "SHOEBOX (6 kg)",
      maxMassKg: 6,
      maxInst: 2,
      costFactor: 0.34,
      massScale: 0.022,
      powerScale: 0.16,
      explain: "Tiny student satellite (~6 kg). Great for release from the Space Station robot arm; holds at most 2 small science tools."
    },
    "6u": {
      id: "6u",
      name: "Briefcase Size (10×20×34 cm · Max 14 kg)",
      shortLabel: "BRIEFCASE (14 kg)",
      maxMassKg: 14,
      maxInst: 3,
      costFactor: 0.44,
      massScale: 0.032,
      powerScale: 0.28,
      explain: "Popular mini-satellite (~14 kg) with fold-out solar panels and room for up to 3 lightweight science tools."
    },
    "12u": {
      id: "12u",
      name: "Backpack Size (20×20×34 cm · Max 28 kg)",
      shortLabel: "BACKPACK (28 kg)",
      maxMassKg: 28,
      maxInst: 3,
      costFactor: 0.54,
      massScale: 0.068,
      powerScale: 0.45,
      explain: "Roomy mini-satellite (~28 kg) capable of shared Moon rides, motorized radio dishes, and 3 science tools."
    }
  };

  const DISPOSAL_OPTIONS = {
    none_drift: {
      id: "none_drift",
      name: "Leave Drifting (No Cleanup Plan)",
      dvCostMs: 0,
      massKg: 0,
      costM: 0,
      deorbitYears: 85,
      leoOnly: false,
      explain: "Leaves the dead spacecraft circling Earth for ~85 years — breaks clean-space 5-year safety rules."
    },
    drag_sail: {
      id: "drag_sail",
      name: "Pop-Out Drag Sail (Burns Up in <5 Years)",
      dvCostMs: 15,
      massKg: 4,
      costM: 4,
      deorbitYears: 3.5,
      leoOnly: true,
      explain: "Opens a thin sheet like a kite that catches faint upper air and brings low satellites down to burn up safely in 3.5 years (does not work above 750 km)."
    },
    controlled_deorbit: {
      id: "controlled_deorbit",
      name: "Steered Safe Return / Graveyard Parking",
      dvCostMs: 95,
      massKg: 10,
      costM: 9,
      deorbitYears: 0.2,
      leoOnly: false,
      explain: "Saves extra steering fuel (+95 m/s) to aim cleanly over open ocean or park safely away from working orbits."
    }
  };

  const MISSION_ANALOGUES = {
    earth_climate: {
      missions: "Earth Ice & Ocean Satellites (ICESat-2, SWOT, RADARSAT)",
      productTitle: "Polar Ice Sheet Height & Sea-Level Change Over Time",
      agencyTag: "EARTH SCIENCE"
    },
    lunar_south_pole: {
      missions: "Moon Polar Scout Satellites (Lunar Reconnaissance Orbiter)",
      productTitle: "Dark Moon Crater Hidden Water-Ice Map",
      agencyTag: "MOON MISSION"
    },
    asteroid_rendezvous: {
      missions: "Asteroid Sample-Return Explorer (OSIRIS-REx)",
      productTitle: "Asteroid Rock Water Map & 3D Shape Scan",
      agencyTag: "ASTEROID LAB"
    },
    space_telescope: {
      missions: "James Webb & Hubble Space Telescopes",
      productTitle: "Sharp Starlight Photo & Distant Planet Air Reading",
      agencyTag: "SPACE TELESCOPE"
    },
    cubesat_101: {
      missions: "Student Mini-Satellites Released from the Space Station",
      productTitle: "Daily Radio Check-In & Earth Horizon Photo",
      agencyTag: "MINI SATELLITE"
    },
    bionutrients_2: {
      missions: "NASA BioNutrients-2 Supply Flight (Space Station Lab)",
      productTitle: "Vitamin A Nutrient (3.0+ mg/L) & Yeast Weight Check",
      agencyTag: "SPACE STATION LAB"
    },
    sandbox: {
      missions: "NASA Mission Playground",
      productTitle: "Custom Spacecraft Limits & Output Chart",
      agencyTag: "OPEN LAB"
    }
  };

  // BioNutrients-2 Yeast, Bag, Recipe & Freezer Choices (grounded in NASA 2025 PDF)
  const BIO_ORGANISM_OPTIONS = {
    yeast_beta_carotene: {
      id: "yeast_beta_carotene",
      name: "Vitamin-Making Yeast Spores (Mission Target)",
      shortLabel: "YEAST (30°C + 6h SHAKE)",
      targetTempC: 30,
      recommendedBagId: "fep_3mil_iss_002",
      recommendedThermalId: "inc_30c_melfi_80c",
      requiresSixHourShake: true,
      goalAligned: true,
      baseBetaCaroteneUgMl: 4.4,
      baseDcwMg: 2.3,
      explain: "Main BioNutrients-2 goal: wake up sleeping yeast with clean drinking water on the Space Station so they make at least 3.0 mg/L of beta-carotene (Vitamin A nutrient). Needs the thin breathable bag, 30°C warmer, and a 1-minute shake at 6 hours."
    },
    yogurt_culture: {
      id: "yogurt_culture",
      name: "Warm Yogurt Culture (42°C)",
      shortLabel: "YOGURT (42°C)",
      targetTempC: 42,
      recommendedBagId: "fep_5mil_hd_002",
      recommendedThermalId: "inc_42c_melfi_80c",
      requiresSixHourShake: false,
      goalAligned: false,
      baseBetaCaroteneUgMl: 0.2,
      baseDcwMg: 1.7,
      explain: "Follow-up probiotic yogurt test in thick bags warmed at 42°C (no 6-hour shake needed). Great for yogurt bacteria, but does NOT make the yeast Vitamin A nutrient."
    },
    kefir_culture: {
      id: "kefir_culture",
      name: "Room-Temp Kefir Culture (22°C)",
      shortLabel: "KEFIR (ROOM TEMP)",
      targetTempC: 22,
      recommendedBagId: "fep_5mil_hd_002",
      recommendedThermalId: "ambient_melfi_80c",
      requiresSixHourShake: false,
      goalAligned: false,
      baseBetaCaroteneUgMl: 0.1,
      baseDcwMg: 1.5,
      explain: "Room-temperature fermented drink test (thick bag, zero heater electricity). Useful low-power probiotic test, but does NOT make the yeast Vitamin A nutrient."
    }
  };

  const BIO_BAG_CONFIGS = {
    fep_3mil_iss_002: {
      id: "fep_3mil_iss_002",
      name: "Thin Breathable Plastic Bag + Safety Lock Valve (Station Ready)",
      shortLabel: "THIN BAG + LOCK CAP",
      filmMil: 3,
      dimensions: '8.5" L × 3.25" W',
      containerMassG: 42,
      kitVolumeMl: 185,
      hasIssNonLuerCover: true,
      sterileInterfaceOk: true,
      costM: 2,
      yeastGrowthFactor: 1.0,
      explain: "Thin breathable plastic pouch (8.5\"×3.25\") with a wipe-clean snap valve, leak-proof Space Station safety lock cap, color border, and protective silver storage pouch. Empty bag weighs 42 g (<250 g limit) and kit takes 185 mL (<300 mL limit)."
    },
    fep_5mil_hd_002: {
      id: "fep_5mil_hd_002",
      name: "Thick Sturdy Plastic Bag + Safety Lock Valve",
      shortLabel: "THICK BAG + LOCK CAP",
      filmMil: 5,
      dimensions: '8.5" L × 3.25" W',
      containerMassG: 54,
      kitVolumeMl: 210,
      hasIssNonLuerCover: true,
      sterileInterfaceOk: true,
      costM: 2,
      yeastGrowthFactor: 0.66,
      explain: "Thicker plastic pouch built for yogurt and kefir. Meets the <250 g weight and <300 mL space limits, but lets less oxygen through, lowering yeast Vitamin A nutrient output."
    },
    fep_earth_001: {
      id: "fep_earth_001",
      name: "Thin Plastic Bag — Earth Test Only (Missing Lock Cap)",
      shortLabel: "EARTH TEST BAG",
      filmMil: 3,
      dimensions: '8.5" L × 3.25" W',
      containerMassG: 40,
      kitVolumeMl: 180,
      hasIssNonLuerCover: false,
      sterileInterfaceOk: false,
      costM: 1,
      yeastGrowthFactor: 0.95,
      explain: "Earth ground-lab test bag without the special leak-proof Space Station valve cover. Fails Space Station clean water tap safety inspection."
    },
    bn1_legacy_canister: {
      id: "bn1_legacy_canister",
      name: "Old BioNutrients-1 Hard Plastic Canister",
      shortLabel: "OLD HARD CANISTER",
      filmMil: 0,
      dimensions: "Rigid Plastic Housing",
      containerMassG: 340,
      kitVolumeMl: 520,
      hasIssNonLuerCover: true,
      sterileInterfaceOk: true,
      costM: 4,
      yeastGrowthFactor: 0.9,
      explain: "Older hard canister from the earlier BioNutrients-1 flight (340 g empty weight, 520 mL space taken). Breaks the upgrade goal (<250 g weight and <300 mL size)."
    }
  };

  const BIO_PROTOCOL_OPTIONS = {
    pwd_syringe_filter_6h_16rep: {
      id: "pwd_syringe_filter_6h_16rep",
      name: "Full Space Recipe · 16 Bags × 35 mL + Germ Filter + 6h Shake",
      shortLabel: "16 BAGS · FILTER · 6h SHAKE",
      replicates: 16,
      sampleVolMl: 35,
      sterileFiltered: true,
      hasSixHourShake: true,
      crewTimeMin: 65,
      contaminationCfu: 0,
      yieldFactor: 1.0,
      dcwFactor: 1.0,
      explain: "Full Space Station steps: fill transfer bag from clean water tap -> push with syringe through germ-blocking filter -> remove filter -> 1-min shake -> warm -> 1-min shake at 6 hours -> seal in foil pouch -> freeze at -80°C."
    },
    pwd_12rep_30ml_std: {
      id: "pwd_12rep_30ml_std",
      name: "Minimum Passing Recipe · 12 Bags × 30 mL + Germ Filter + 6h Shake",
      shortLabel: "12 BAGS · MIN PASSING",
      replicates: 12,
      sampleVolMl: 30,
      sterileFiltered: true,
      hasSixHourShake: true,
      crewTimeMin: 48,
      contaminationCfu: 0,
      yieldFactor: 0.82,
      dcwFactor: 0.72,
      explain: "Meets exact scientific publication rules (12 bags, 30 mL each, germ filter, 6-hour shake), making ~3.6 mg/L Vitamin A nutrient, with zero spare bags if one leaks."
    },
    skip_6h_shake_protocol: {
      id: "skip_6h_shake_protocol",
      name: "Skip the 6-Hour Shake · 16 Bags × 35 mL",
      shortLabel: "SKIP 6h SHAKE",
      replicates: 16,
      sampleVolMl: 35,
      sterileFiltered: true,
      hasSixHourShake: false,
      crewTimeMin: 44,
      contaminationCfu: 0,
      yieldFactor: 0.42,
      dcwFactor: 0.38,
      explain: "Skips stirring the yeast bags at hour 6. In weightless space, yeast settles into clumps and cannot reach fresh nutrients, dropping Vitamin A (<3.0 mg/L) and yeast weight (<1 mg)."
    },
    low_rep_6_unfiltered: {
      id: "low_rep_6_unfiltered",
      name: "Too Few Bags & No Filter · 6 Bags × 20 mL",
      shortLabel: "6 BAGS · NO FILTER",
      replicates: 6,
      sampleVolMl: 20,
      sterileFiltered: false,
      hasSixHourShake: true,
      crewTimeMin: 25,
      contaminationCfu: 140,
      yieldFactor: 0.55,
      dcwFactor: 0.5,
      explain: "Fails minimum test count (<12 bags), too little water (<30 mL per bag) for lab tests back on Earth, and skipping the germ filter lets unwanted bacteria contaminate the yeast."
    }
  };

  const BIO_THERMAL_OPTIONS = {
    inc_30c_melfi_80c: {
      id: "inc_30c_melfi_80c",
      name: "Warm at 30°C + Protective Pouch + -80°C Ultra-Cold Freezer",
      shortLabel: "30°C + -80°C FREEZER",
      incubateTempC: 30,
      storageTempC: -80,
      melfiFrozen: true,
      powerW: 115,
      preservationFactor: 1.0,
      explain: "Exact yeast heating & freezing plan: warm gently at 30°C while Earth watches live, seal inside protective foil pouches, and freeze in the -80°C ultra-cold freezer until lab testing back on Earth."
    },
    inc_42c_melfi_80c: {
      id: "inc_42c_melfi_80c",
      name: "Hot Warmer 42°C + -80°C Ultra-Cold Freezer",
      shortLabel: "42°C + -80°C FREEZER",
      incubateTempC: 42,
      storageTempC: -80,
      melfiFrozen: true,
      powerW: 155,
      preservationFactor: 0.45,
      explain: "Hotter 42°C temperature made for yogurt. Too hot for engineered yeast and sharply lowers Vitamin A nutrient output."
    },
    ambient_melfi_80c: {
      id: "ambient_melfi_80c",
      name: "Room Temperature (~22°C) + -80°C Ultra-Cold Freezer",
      shortLabel: "22°C ROOM + -80°C FREEZER",
      incubateTempC: 22,
      storageTempC: -80,
      melfiFrozen: true,
      powerW: 12,
      preservationFactor: 0.48,
      explain: "Uses normal cabin air (~22°C) plus -80°C freezer. Saves heater power for kefir, but too cool for yeast to make enough Vitamin A nutrient."
    },
    inc_30c_coldbag_4c: {
      id: "inc_30c_coldbag_4c",
      name: "Warm at 30°C + Cool +4°C Ice Bag (Skip Ultra-Cold Freezer)",
      shortLabel: "30°C + +4°C COOL BAG",
      incubateTempC: 30,
      storageTempC: 4,
      melfiFrozen: false,
      powerW: 105,
      preservationFactor: 0.52,
      explain: "Skips the -80°C ultra-cold freezer in favor of a +4°C fridge bag. Yeast keeps drifting and breaking down Vitamin A nutrient before Earth lab tests."
    }
  };

  const DIFFICULTY_LEVELS = {
    cadet: {
      id: "cadet",
      name: "Beginner (Extra Room & Hints)",
      budgetMultiplier: 1.25,
      massMarginPct: 5,
      desc: "+25% extra budget and forgiving limits with friendly everyday explanations."
    },
    engineer: {
      id: "engineer",
      name: "Standard (Real-World Budget)",
      budgetMultiplier: 1.0,
      massMarginPct: 10,
      desc: "Balanced real-world limits where every weight, cost, and power choice matters."
    },
    director: {
      id: "director",
      name: "Expert (Tight Budget & Space Storms)",
      budgetMultiplier: 0.88,
      massMarginPct: 15,
      desc: "12% tighter budget, strict 15% safety reserves, and tougher space storm checks."
    }
  };

  const ORBIT_OPTIONS = {
    leo_400: {
      id: "leo_400",
      name: "Low Orbit Around Earth (400 km · Space Station Height)",
      altitudeKm: 400,
      inclinationDeg: 51.6,
      periodMin: 92.6,
      eclipseFraction: 0.36,
      reqInsertionDv: 380,
      radiationEnvKrad: 20,
      pathLossDb: 152,
      contactMinPerDay: 110,
      solarFluxFactor: 1.0,
      explain: "Close to Earth so rockets can carry heavy gear and cameras see sharp detail, though faint upper air pulls it down over time and passes over antennas are short (~9 min)."
    },
    sso_705: {
      id: "sso_705",
      name: "Pole-to-Pole Daylight Orbit (705 km · Global Map)",
      altitudeKm: 705,
      inclinationDeg: 98.2,
      periodMin: 98.8,
      eclipseFraction: 0.28,
      reqInsertionDv: 540,
      radiationEnvKrad: 35,
      pathLossDb: 157,
      contactMinPerDay: 145,
      solarFluxFactor: 1.0,
      explain: "Circles over both North and South Poles at the same local time of day every pass — ideal for tracking Earth ice, forests, and oceans."
    },
    gto_heo: {
      id: "gto_heo",
      name: "Tall Stretched Oval Orbit (500–35,786 km)",
      altitudeKm: 35786,
      inclinationDeg: 27.0,
      periodMin: 635.0,
      eclipseFraction: 0.14,
      reqInsertionDv: 1250,
      radiationEnvKrad: 65,
      pathLossDb: 188,
      contactMinPerDay: 420,
      solarFluxFactor: 1.0,
      explain: "Spends hours high over one side of Earth with short shadows, but flies twice per lap through strong radiation belts — needs tough shielding and extra fuel."
    },
    lunar_polar_100: {
      id: "lunar_polar_100",
      name: "Moon North-to-South Orbit (100 km above Moon)",
      altitudeKm: 384400,
      inclinationDeg: 90.0,
      periodMin: 118.0,
      eclipseFraction: 0.32,
      reqInsertionDv: 1380,
      radiationEnvKrad: 55,
      pathLossDb: 211,
      contactMinPerDay: 540,
      solarFluxFactor: 1.0,
      explain: "Flies over both poles of the Moon every 2 hours. Needs big braking burns to enter Moon orbit and a strong long-distance radio dish."
    },
    iss_cubesat_418: {
      id: "iss_cubesat_418",
      name: "Space Station Orbit (418 km · Resupply & Release)",
      altitudeKm: 418,
      inclinationDeg: 51.6,
      periodMin: 92.9,
      eclipseFraction: 0.36,
      reqInsertionDv: 65,
      radiationEnvKrad: 18,
      pathLossDb: 152,
      contactMinPerDay: 120,
      solarFluxFactor: 1.0,
      explain: "Orbits right with the International Space Station at 418 km. Low steering fuel needed, low space radiation, and clean 5-year safe reentry."
    },
    sun_earth_l2: {
      id: "sun_earth_l2",
      name: "Deep-Space Cold Balance Point (1,500,000 km)",
      altitudeKm: 1500000,
      inclinationDeg: 0.0,
      periodMin: 180.0,
      eclipseFraction: 0.04,
      reqInsertionDv: 1480,
      radiationEnvKrad: 60,
      pathLossDb: 218,
      contactMinPerDay: 680,
      solarFluxFactor: 0.99,
      explain: "Quiet gravity balance spot 1.5 million km past Earth (where Webb orbits). Keeps both Earth and Sun behind your heat shield for super-cold telescopes."
    }
  };

  const LAUNCH_VEHICLES = {
    cygnus_ng18: {
      id: "cygnus_ng18",
      name: "Space Station Supply Ship (Cygnus Cargo Flight)",
      costM: 48,
      fairingM: 3.0,
      reliabilityPct: 98,
      capacityKg: { leo_400: 3750, iss_cubesat_418: 3750, sso_705: 0, gto_heo: 0, lunar_polar_100: 0, sun_earth_l2: 0 },
      explain: "NASA cargo ship that delivered BioNutrients-2 to the Space Station: carries soft-packed experiment kits kept away from oxygen and moisture up to 418 km."
    },
    electron_light: {
      id: "electron_light",
      name: "Small Dedicated Rocket (Electron Class)",
      costM: 28,
      fairingM: 1.8,
      reliabilityPct: 95,
      capacityKg: { leo_400: 320, iss_cubesat_418: 310, sso_705: 220, gto_heo: 90, lunar_polar_100: 55, sun_earth_l2: 45 },
      explain: "Budget-friendly small rocket. Great for lightweight craft, but strictly caps total fueled weight below 320 kg in low Earth orbit."
    },
    falcon_medium: {
      id: "falcon_medium",
      name: "Medium Reusable Rocket (Falcon 9 Class)",
      costM: 72,
      fairingM: 5.2,
      reliabilityPct: 99,
      capacityKg: { leo_400: 2200, iss_cubesat_418: 2150, sso_705: 1650, gto_heo: 950, lunar_polar_100: 680, sun_earth_l2: 640 },
      explain: "Dependable workhorse rocket with a 99% safety record and roomy lift capacity to Earth, Polar, and Moon orbits."
    },
    ariane_heavy: {
      id: "ariane_heavy",
      name: "Heavy Deep-Space Rocket (Falcon Heavy Class)",
      costM: 118,
      fairingM: 5.4,
      reliabilityPct: 98,
      capacityKg: { leo_400: 4800, iss_cubesat_418: 4700, sso_705: 3600, gto_heo: 2200, lunar_polar_100: 1600, sun_earth_l2: 1550 },
      explain: "Multi-booster heavy rocket able to launch big science telescopes directly toward the Moon or deep space."
    },
    sls_superheavy: {
      id: "sls_superheavy",
      name: "Giant Mega-Rocket (SLS / Starship Class)",
      costM: 175,
      fairingM: 8.4,
      reliabilityPct: 97,
      capacityKg: { leo_400: 9500, iss_cubesat_418: 9400, sso_705: 7500, gto_heo: 4800, lunar_polar_100: 3800, sun_earth_l2: 3600 },
      explain: "Biggest lift power and cargo nose cone (8.4 m wide) for giant flagship missions, though it uses a huge piece of the budget ($175M)."
    }
  };

  const SPACECRAFT_BUSES = {
    smallsat_12u: {
      id: "smallsat_12u",
      name: "Compact Mini Frame",
      glbId: "modular_spacecraft_bus_smallsat",
      dryMassKg: 85,
      costM: 22,
      maxInstruments: 3,
      basePowerLoadW: 65,
      structuralRating: 75,
      explain: "Light, affordable aluminum frame. Saves launch money, but only holds up to 3 science tools and a small computer bay."
    },
    modular_hex: {
      id: "modular_hex",
      name: "Medium 6-Sided Frame",
      glbId: "modular_spacecraft_bus_hex",
      dryMassKg: 240,
      costM: 52,
      maxInstruments: 4,
      basePowerLoadW: 135,
      structuralRating: 92,
      explain: "Well-balanced 6-sided frame with precision aiming wheels, star cameras, and 4 science bays."
    },
    deep_space_heavy: {
      id: "deep_space_heavy",
      name: "Heavy Deep-Space Frame",
      glbId: "modular_spacecraft_bus_heavy",
      dryMassKg: 460,
      costM: 94,
      maxInstruments: 6,
      basePowerLoadW: 210,
      structuralRating: 99,
      explain: "Backup computers, twin star navigation cameras, and 6 science bays made for tough Moon and deep-space trips."
    }
  };

  const POWER_SYSTEMS = {
    body_solar: {
      id: "body_solar",
      name: "Flat Body-Mounted Solar Panels",
      genW: 260,
      massKg: 18,
      costM: 14,
      isNuclear: false,
      explain: "Simple solar cells glued right onto the body — nothing can jam unfolding, but caps steady electricity around 260 W."
    },
    deployable_rosa: {
      id: "deployable_rosa",
      name: "Fold-Out Sun-Tracking Solar Wings",
      genW: 680,
      massKg: 46,
      costM: 34,
      isNuclear: false,
      explain: "Two flexible solar wings that turn toward the Sun for 680 W of power. Relies on batteries whenever Earth casts a shadow."
    },
    high_power_wings: {
      id: "high_power_wings",
      name: "4 Large Solar Wings + Nuclear Heat Battery",
      genW: 1180,
      massKg: 88,
      costM: 68,
      isNuclear: true,
      explain: "Combines 4 big solar wings with steady nuclear heat power — built for power-hungry Cloud Radar and Laser Scanners."
    }
  };

  const BATTERY_PACKS = {
    li_ion_120: {
      id: "li_ion_120",
      name: "Small 120 Wh Battery Pack",
      capacityWh: 120,
      massKg: 12,
      costM: 8,
      explain: "Featherweight battery for simple sensors, but drains dangerously low (>80% used) if heavy tools stay on in Earth's shadow."
    },
    li_ion_320: {
      id: "li_ion_320",
      name: "Standard 320 Wh Dual Battery Pack",
      capacityWh: 320,
      massKg: 28,
      costM: 19,
      explain: "Dependable flight battery that stays safely above half charge in darkness so it lasts 3+ years."
    },
    solid_state_640: {
      id: "solid_state_640",
      name: "Heavy-Duty 640 Wh High-Capacity Battery",
      capacityWh: 640,
      massKg: 52,
      costM: 36,
      explain: "Powers hungry Cloud Radar and Laser Scanners nonstop through dark lunar craters and long orbital nights."
    }
  };

  const SCIENTIFIC_INSTRUMENTS = [
    {
      id: "inst_multispectral",
      name: "High-Detail Color & Light Camera",
      type: "optical",
      massKg: 38,
      powerW: 55,
      costM: 32,
      dataMbps: 42,
      scienceVal: 26,
      explain: "Sharp half-meter color camera for mapping cracks in polar ice, surface geology, and safe landing ground."
    },
    {
      id: "inst_sar",
      name: "Cloud-Seeing Ground Radar",
      type: "radar",
      massKg: 115,
      powerW: 210,
      costM: 68,
      dataMbps: 95,
      scienceVal: 38,
      explain: "Sees right through clouds, polar night, and surface dust to measure tiny ground shifts and buried ice — uses lots of weight, power, and data."
    },
    {
      id: "inst_lidar",
      name: "3D Laser Height Scanner",
      type: "altimetry",
      massKg: 64,
      powerW: 110,
      costM: 45,
      dataMbps: 28,
      scienceVal: 31,
      explain: "Pulses harmless laser beams 10,000 times per second to build 10-cm accurate 3D height maps of ice sheets, crater cliffs, and asteroids."
    },
    {
      id: "inst_ir_spec",
      name: "Mineral & Gas Light Reader",
      type: "spectrometer",
      massKg: 42,
      powerW: 65,
      costM: 38,
      dataMbps: 22,
      scienceVal: 29,
      explain: "Reads hidden color fingerprints in reflected light to identify minerals, water traces, and greenhouse gases (CO₂ and methane)."
    },
    {
      id: "inst_neutron",
      name: "Underground Water & Ice Finder",
      type: "neutron",
      massKg: 34,
      powerW: 38,
      costM: 30,
      dataMbps: 8,
      scienceVal: 28,
      explain: "Detects hydrogen and frozen water hidden up to 1 meter under Moon or asteroid dust using tiny background space particles."
    },
    {
      id: "inst_mag",
      name: "Magnetic Field Sensor Boom",
      type: "magnetometer",
      massKg: 19,
      powerW: 22,
      costM: 18,
      dataMbps: 5,
      scienceVal: 20,
      explain: "Light, low-power 6-meter arm measuring magnetic fields, solar wind gusts, and incoming space storms."
    }
  ];

  const THERMAL_RADIATION_PACKAGES = {
    passive_mli: {
      id: "passive_mli",
      name: "Foil Heat Blankets + Basic Radiation Shield (Level 25)",
      massKg: 22,
      powerW: 12,
      costM: 12,
      radRatingKrad: 25,
      thermalCapW: 380,
      lifetimeBonusMonths: 0,
      explain: "Reflective gold-style foil blankets and light computer armor meant for short low-Earth trips safely inside Earth's magnetic bubble."
    },
    pumped_loop_50: {
      id: "pumped_loop_50",
      name: "Pipe Heat Coolers + Medium Radiation Vault (Level 55)",
      massKg: 54,
      powerW: 28,
      costM: 28,
      radRatingKrad: 55,
      thermalCapW: 820,
      lifetimeBonusMonths: 12,
      explain: "Pumps waste heat out through cooling fins (up to 820 W) and shields electronics to level 55 for Polar and Moon missions."
    },
    cryo_rad_90: {
      id: "cryo_rad_90",
      name: "Deep-Freeze Cooling Pipes + Heavy Radiation Vault (Level 95)",
      massKg: 92,
      powerW: 48,
      costM: 48,
      radRatingKrad: 95,
      thermalCapW: 1400,
      lifetimeBonusMonths: 24,
      explain: "Super-cold cooling pipes for sensitive telescopes plus heavy armor (level 95) built for multi-year deep space and radiation belts."
    }
  };

  const COMMS_PACKAGES = {
    s_band_omni: {
      id: "s_band_omni",
      name: "Basic Wide-Beam Radio (8 Mbps · Slower Data)",
      rateMbps: 8,
      eirpDbw: 162,
      massKg: 9,
      powerW: 18,
      costM: 10,
      explain: "Wide radio beam that stays connected even if the craft tilts, but downloads only 8 Mbps — too slow for heavy radar or crisp cameras."
    },
    x_band_hga: {
      id: "x_band_hga",
      name: "Fast Science Dish Radio (120 Mbps)",
      rateMbps: 120,
      eirpDbw: 186,
      massKg: 26,
      powerW: 45,
      costM: 26,
      explain: "Dependable 0.8m science dish delivering 120 Mbps with clear signal from Earth orbit out to the Moon."
    },
    ka_band_optical: {
      id: "ka_band_optical",
      name: "Ultra-Fast Aimable Dish + Space Laser (450 Mbps)",
      rateMbps: 450,
      eirpDbw: 204,
      massKg: 48,
      powerW: 78,
      costM: 46,
      explain: "High-speed 450 Mbps radio + laser link with giant signal boost for heavy radar maps and deep-space missions."
    }
  };

  const GROUND_NETWORKS = {
    regional_vhs: {
      id: "regional_vhs",
      name: "Local College Dish Network (3 Stations)",
      gainDb: 18,
      contactMultiplier: 0.65,
      costM: 8,
      explain: "Low cost to operate, but your spacecraft passes out of sight for long stretches."
    },
    near_space_net: {
      id: "near_space_net",
      name: "Global North & South Pole Dish Network",
      gainDb: 34,
      contactMultiplier: 1.15,
      costM: 22,
      explain: "Dishes near Earth's poles catch passing satellites every single lap around Earth."
    },
    dsn_goldstone: {
      id: "dsn_goldstone",
      name: "Giant Deep-Space Dishes (California · Spain · Australia)",
      gainDb: 52,
      contactMultiplier: 1.6,
      costM: 42,
      explain: "Three huge 70m/34m antenna sites spaced around the globe give nonstop 24/7 contact and massive +52 dB listening boost for Moon and asteroid trips."
    }
  };

  const PROPULSION_SYSTEMS = {
    cold_gas: {
      id: "cold_gas",
      name: "Gentle Compressed-Air Jets (Efficiency: 72 s)",
      ispSec: 72,
      dryMassKg: 14,
      propellantKg: 35,
      costM: 10,
      powerW: 10,
      explain: "Simple, safe nitrogen puffs for gentle aiming and balance, with only a small amount of push speed."
    },
    hydrazine_mono: {
      id: "hydrazine_mono",
      name: "Standard Liquid Steering Thruster (Efficiency: 230 s)",
      ispSec: 230,
      dryMassKg: 32,
      propellantKg: 140,
      costM: 24,
      powerW: 18,
      explain: "Tried-and-true liquid rocket thruster giving medium steering power to hold steady low Earth orbits."
    },
    biprop_nto_mmh: {
      id: "biprop_nto_mmh",
      name: "Strong Two-Fuel Main Engine (Efficiency: 318 s)",
      ispSec: 318,
      dryMassKg: 58,
      propellantKg: 380,
      costM: 44,
      powerW: 28,
      explain: "High-power main rocket engine needed for big braking burns into Moon orbit and deep-space course changes."
    },
    hall_ion_sep: {
      id: "hall_ion_sep",
      name: "Super-Efficient Electric Ion Engine (Efficiency: 1,850 s)",
      ispSec: 1850,
      dryMassKg: 64,
      propellantKg: 135,
      costM: 58,
      powerW: 145,
      explain: "Uses solar electricity to push Xenon gas at huge speed — reaches massive distance (>2,200 m/s) with little fuel weight, using 145 W steady power."
    }
  };

  class GameplayEngine {
    constructor() {
      // Stable task IDs preserve mission and multiplayer compatibility.
      this.tasks = [
        {
          id: "task_antenna",
          kind: "mission-architecture",
          stationId: "hub",
          code: "HUB",
          name: "1. Pick Mission Goal & Team Plan",
          location: "Main Hub Desk",
          pos: [0, 0.0, 2],
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
          name: "2. Orbit Path & Rocket Ride",
          location: "Navigation Desk",
          pos: [0.0, 0.0, -3.5],
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
          name: "3. Body Frame, Bags, Solar & Battery",
          location: "Power & Hardware Bay",
          pos: [-4.6, 0.0, -3.8],
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
          name: "4. Science Tools & Experiment Recipe",
          location: "Experiment Lab",
          pos: [6.3, 0.0, -3.5],
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
          name: "5. Heating, Freezing & Radiation Shield",
          location: "Freezer & Cooling Lab",
          pos: [8.9, 0.0, -3.5],
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
          name: "6. Earth Antennas, Fuel & Safe Return",
          location: "Radio & Engine Bay",
          pos: [7.5, 0.0, 8.7],
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
          name: "7. Full Mission Test Run & Results",
          location: "Mission Test Simulator",
          pos: [0, 0.0, 24.0],
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
        bioOrganismId: "yeast_beta_carotene",
        bioBagId: "fep_3mil_iss_002",
        bioProtocolId: "pwd_syringe_filter_6h_16rep",
        bioThermalId: "inc_30c_melfi_80c",
        lastSimulationReport: null
      };

      this.tradeBaselineA = null;
      this.lastMissionEvent = null;
      this.cmlState = {
        targetCml: 4,
        assessorSignedOff: false,
        overrides: {},
        notes: {
          launchWindowDays: "20"
        }
      };
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
        minRadiationKrad: scenario.minRadiationKrad,
        isBioPayload: !!scenario.isBioPayload,
        tradeoffTip: scenario.tradeoffTip || ""
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
        this._applyCmlDesignFields(design);
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
      const prevScenarioId = this.missionDesign.scenarioId;
      if (mission.scenarioId && MISSION_SCENARIOS[mission.scenarioId]) {
        this.missionDesign.scenarioId = mission.scenarioId;
      }
      if (mission.difficultyId && DIFFICULTY_LEVELS[mission.difficultyId]) {
        this.missionDesign.difficultyId = mission.difficultyId;
      }
      const hasExplicitOrbit = !!(mission.design && typeof mission.design === "object" && mission.design.orbitId);
      if (mission.scenarioId && MISSION_SCENARIOS[mission.scenarioId] && mission.scenarioId !== prevScenarioId && !hasExplicitOrbit) {
        this.applyRecommendedScenarioBaseline(mission.scenarioId);
      }
      if (mission.design && typeof mission.design === "object") {
        const design = Object.assign({}, mission.design);
        if (Array.isArray(design.instruments)) design.instruments = design.instruments.slice();
        Object.assign(this.missionDesign, design);
        this._applyCmlDesignFields(design);
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
            cubesatFormId: md.cubesatFormId,
            bioOrganismId: md.bioOrganismId
          };
        case "task_nav":
          return { orbitId: md.orbitId, launchVehicleId: md.launchVehicleId };
        case "task_wires":
          return {
            busId: md.busId,
            powerId: md.powerId,
            batteryId: md.batteryId,
            cubesatFormId: md.cubesatFormId,
            bioBagId: md.bioBagId
          };
        case "task_science":
          return {
            instruments: (md.instruments || []).slice(),
            wavelengthId: md.wavelengthId,
            bioProtocolId: md.bioProtocolId
          };
        case "task_lss":
          return { thermalId: md.thermalId, bioThermalId: md.bioThermalId };
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
        disposalId: md.disposalId,
        bioOrganismId: md.bioOrganismId,
        bioBagId: md.bioBagId,
        bioProtocolId: md.bioProtocolId,
        bioThermalId: md.bioThermalId,
        cmlTargetLevel: this.cmlState ? this.cmlState.targetCml : 4,
        cmlAssessorSignedOff: Boolean(this.cmlState && this.cmlState.assessorSignedOff),
        cmlOverrides: Object.assign({}, (this.cmlState && this.cmlState.overrides) || {}),
        cmlNotes: Object.assign({}, (this.cmlState && this.cmlState.notes) || {})
      };
    }

    _applyCmlDesignFields(design) {
      if (!design || typeof design !== "object") return;
      if (!this.cmlState) {
        this.cmlState = { targetCml: 4, assessorSignedOff: false, overrides: {}, notes: { launchWindowDays: "20" } };
      }
      if (design.cmlTargetLevel != null) {
        const parsed = Number.parseInt(design.cmlTargetLevel, 10);
        if (Number.isFinite(parsed)) this.cmlState.targetCml = Math.max(2, Math.min(6, parsed));
      }
      if (typeof design.cmlAssessorSignedOff === "boolean") {
        this.cmlState.assessorSignedOff = design.cmlAssessorSignedOff;
      }
      if (design.cmlOverrides && typeof design.cmlOverrides === "object" && !Array.isArray(design.cmlOverrides)) {
        this.cmlState.overrides = Object.assign({}, design.cmlOverrides);
      }
      if (design.cmlNotes && typeof design.cmlNotes === "object" && !Array.isArray(design.cmlNotes)) {
        this.cmlState.notes = Object.assign({ launchWindowDays: "20" }, design.cmlNotes);
      }
    }

    syncCmlStateToNetwork() {
      if (!window.netManager || typeof window.netManager.syncMissionDesign !== "function") return;
      window.netManager.syncMissionDesign({
        cmlTargetLevel: this.cmlState.targetCml,
        cmlAssessorSignedOff: Boolean(this.cmlState.assessorSignedOff),
        cmlOverrides: Object.assign({}, this.cmlState.overrides),
        cmlNotes: Object.assign({}, this.cmlState.notes)
      });
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
      } else if (scenarioId === "bionutrients_2") {
        md.bioOrganismId = "yeast_beta_carotene";
        md.bioBagId = "fep_3mil_iss_002";
        md.bioProtocolId = "pwd_syringe_filter_6h_16rep";
        md.bioThermalId = "inc_30c_melfi_80c";
        md.orbitId = "iss_cubesat_418";
        md.launchVehicleId = "cygnus_ng18";
        md.busId = "smallsat_12u";
        md.powerId = "deployable_rosa";
        md.batteryId = "li_ion_320";
        md.instruments = ["inst_multispectral", "inst_ir_spec"];
        md.thermalId = "pumped_loop_50";
        md.commsId = "x_band_hga";
        md.groundNetId = "near_space_net";
        md.propulsionId = "hydrazine_mono";
        md.disposalId = "controlled_deorbit";
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
      const bioOrg = BIO_ORGANISM_OPTIONS[md.bioOrganismId] || BIO_ORGANISM_OPTIONS.yeast_beta_carotene;
      const bioBag = BIO_BAG_CONFIGS[md.bioBagId] || BIO_BAG_CONFIGS.fep_3mil_iss_002;
      const bioProto = BIO_PROTOCOL_OPTIONS[md.bioProtocolId] || BIO_PROTOCOL_OPTIONS.pwd_syringe_filter_6h_16rep;
      const bioThm = BIO_THERMAL_OPTIONS[md.bioThermalId] || BIO_THERMAL_OPTIONS.inc_30c_melfi_80c;
      const isBio = !!scenario.isBioPayload;

      const selectedInsts = SCIENTIFIC_INSTRUMENTS.filter((inst) => md.instruments.includes(inst.id));

      // 1. BUDGET ($M)
      const budgetCapM = Math.round(scenario.baseBudgetM * difficulty.budgetMultiplier);
      const instCostM = selectedInsts.reduce((acc, i) => acc + i.costM, 0);
      const rawTotalCostM = lv.costM + bus.costM + pwr.costM + bat.costM + thm.costM + com.costM + gnd.costM + prop.costM + instCostM + disposal.costM;
      const bioLvCost = lv.id === "cygnus_ng18" ? 5 : Math.max(4, Math.round(lv.costM * 0.12));
      const bioSubCost = Math.round((bus.costM + pwr.costM + bat.costM + thm.costM + com.costM + gnd.costM) * 0.04) + Math.round(instCostM * 0.015);
      const totalCostM = isBio
        ? bioLvCost + bioBag.costM + bioSubCost
        : (scenario.isCubesat ? Math.max(12, Math.round(rawTotalCostM * cubesatForm.costFactor)) : rawTotalCostM);
      const budgetRemainingM = budgetCapM - totalCostM;
      const budgetOk = totalCostM <= budgetCapM;

      // 2. MASS (kg) & LAUNCH VEHICLE / CUBESAT / BIONUTRIENTS CONTAINER COMPATIBILITY
      const instMassKg = selectedInsts.reduce((acc, i) => acc + i.massKg, 0);
      const rawDryMassKg = bus.dryMassKg + pwr.massKg + bat.massKg + thm.massKg + com.massKg + prop.dryMassKg + instMassKg + disposal.massKg;
      const rawWetMassKg = rawDryMassKg + prop.propellantKg;
      const massScale = scenario.isCubesat ? cubesatForm.massScale : 1.0;
      const bioDryKg = Number((((bioBag.containerMassG * bioProto.replicates) / 1000) + 2.5 + (bus.dryMassKg * 0.04)).toFixed(2));
      const bioWetKg = Number((bioDryKg + ((bioProto.replicates * bioProto.sampleVolMl) / 1000)).toFixed(2));
      const dryMassKg = isBio ? bioDryKg : (scenario.isCubesat ? Number((rawDryMassKg * massScale).toFixed(1)) : rawDryMassKg);
      const wetMassKg = isBio ? bioWetKg : (scenario.isCubesat ? Number((rawWetMassKg * massScale).toFixed(1)) : rawWetMassKg);
      const rawLvCapacityKg = (lv.capacityKg && typeof lv.capacityKg[orbit.id] === "number") ? lv.capacityKg[orbit.id] : 500;
      const lvCapacityKg = scenario.isCubesat ? Math.min(rawLvCapacityKg, cubesatForm.maxMassKg) : rawLvCapacityKg;
      const maxInstruments = scenario.isCubesat ? Math.min(bus.maxInstruments, cubesatForm.maxInst) : bus.maxInstruments;
      const massMarginPct = rawLvCapacityKg > 0
        ? Math.round(((lvCapacityKg - wetMassKg) / Math.max(1, lvCapacityKg)) * 100)
        : -100;
      const massOk = isBio
        ? (rawLvCapacityKg > 0 && wetMassKg <= lvCapacityKg && bioBag.containerMassG < 250 && bioBag.kitVolumeMl < 300)
        : (rawLvCapacityKg > 0 && wetMassKg <= lvCapacityKg && selectedInsts.length <= maxInstruments);

      // 3. POWER (W) & ECLIPSE BATTERY DEPTH-OF-DISCHARGE (%)
      const pwrScale = scenario.isCubesat ? cubesatForm.powerScale : 1.0;
      const instPowerW = selectedInsts.reduce((acc, i) => acc + i.powerW, 0);
      const totalPowerLoadW = isBio
        ? (bioThm.powerW + 42)
        : Math.round((bus.basePowerLoadW + thm.powerW + com.powerW + prop.powerW + instPowerW) * pwrScale);
      const daylightGenW = Math.round(pwr.genW * orbit.solarFluxFactor * pwrScale);
      const effBatteryWh = Math.round(bat.capacityWh * pwrScale);
      const eclipseHours = (orbit.periodMin * orbit.eclipseFraction) / 60;
      const daylightHours = (orbit.periodMin * (1 - orbit.eclipseFraction)) / 60;
      // Solar-electric Xenon ion propulsion only coasts in eclipse (no solar thrust in shadow)
      const eclipseLoadW = totalPowerLoadW - (!isBio && prop.id === "hall_ion_sep" ? Math.round(prop.powerW * pwrScale) : 0);
      const eclipseEnergyNeedWh = Math.round(eclipseLoadW * eclipseHours);
      const batteryDodPct = Math.round((eclipseEnergyNeedWh / Math.max(1, effBatteryWh)) * 100);
      const rechargePowerNeededW = eclipseHours > 0 ? Math.round((eclipseEnergyNeedWh * 1.15) / Math.max(0.2, daylightHours)) : 0;
      const netDaylightMarginW = daylightGenW - (totalPowerLoadW + rechargePowerNeededW);
      const powerOk = netDaylightMarginW >= 0 && batteryDodPct <= 80;

      // 4. DATA GENERATION vs. DOWNLINK CAPACITY (GB/day) & LINK MARGIN (dB)
      const instDataMbps = selectedInsts.reduce((acc, i) => acc + i.dataMbps, 0);
      const dataDuty = isBio ? 0.025 : (scenario.isCubesat ? 0.015 : 0.35);
      const dataGeneratedGbPerDay = Number((((isBio ? 0.85 : instDataMbps) * dataDuty * 86400) / 8000).toFixed(1));
      const effectiveContactMin = Math.round(orbit.contactMinPerDay * gnd.contactMultiplier);
      const downlinkCapGbPerDay = Number(((com.rateMbps * (effectiveContactMin * 60)) / 8000).toFixed(1));
      const linkMarginDb = Number((com.eirpDbw + gnd.gainDb - orbit.pathLossDb - 18.5).toFixed(1));
      const commsOk = linkMarginDb >= 3.0 && downlinkCapGbPerDay >= dataGeneratedGbPerDay;

      // 5. PROPULSION DELTA-V (Tsiolkovsky Rocket Equation or Cygnus CRS Rendezvous)
      const g0 = 9.80665;
      const isLowOrbit = ["leo_400", "iss_cubesat_418", "sso_705"].includes(orbit.id);
      const isIssOrbit = orbit.id === "iss_cubesat_418" || orbit.id === "leo_400";
      const requiredDeltaV = isBio
        ? (isIssOrbit ? 140 : Math.max(scenario.minDeltaV, orbit.reqInsertionDv))
        : (Math.max(scenario.minDeltaV, orbit.reqInsertionDv) + disposal.dvCostMs);
      const achievedDeltaV = isBio
        ? (rawLvCapacityKg > 0 && isIssOrbit ? Math.max(requiredDeltaV + 45, 185) : 45)
        : Math.round(prop.ispSec * g0 * Math.log(wetMassKg / Math.max(0.1, dryMassKg)));
      const deltaVOk = achievedDeltaV >= requiredDeltaV;

      // 6. END-OF-MISSION CLEANUP / STATION ULTRA-COLD RETURN
      let disposalOk = isBio ? (isIssOrbit && bioThm.melfiFrozen && disposal.id !== "none_drift") : (disposal.id !== "none_drift");
      let disposalNote = isBio
        ? (disposalOk ? "-80°C ultra-cold storage + cargo flight back to Earth labs" : "Needs Space Station orbit + -80°C ultra-cold freezer so Earth labs can test it")
        : `${disposal.deorbitYears} yr safe cleanup`;
      if (!isBio) {
        if (disposal.id === "none_drift") {
          disposalNote = "No cleanup plan — fails space safety rules to clear orbit after mission";
        } else if (disposal.leoOnly && !isLowOrbit) {
          disposalOk = false;
          disposalNote = "Braking sail only works in low orbit (750 km or lower) — pick Backup Thrusters";
        }
      }

      // 7. TELESCOPE LIGHT–MIRROR–COOLING COMPATIBILITY (COSMOS-L2)
      const telescopeIssues = [];
      if (scenario.requiresWavelength) {
        if (wavelength.reqThermal === "cryo_rad_90" && thm.id !== "cryo_rad_90") {
          telescopeIssues.push(`${wavelength.shortLabel} cameras need the Deep-Freeze Cooler to stay icy cold`);
        } else if (wavelength.reqThermal === "pumped_loop_50" && thm.id === "passive_mli") {
          telescopeIssues.push(`${wavelength.shortLabel} sensor needs Active Liquid Cooling or Deep-Freeze Cooler`);
        }
        if (wavelength.avoidLowEarthThermal && (orbit.id === "leo_400" || orbit.id === "iss_cubesat_418")) {
          telescopeIssues.push(`${wavelength.shortLabel} is blinded by Earth's warm glow near 400 km — move to Far Deep Space`);
        }
        if (wavelength.minBus === "modular_hex" && bus.id === "smallsat_12u") {
          telescopeIssues.push(`${wavelength.shortLabel} mirror is too wide for Mini Cube-Box body — pick a bigger body`);
        }
        const hasPreferredDetector = selectedInsts.some((i) => wavelength.preferredInstIds.includes(i.id));
        if (!hasPreferredDetector) {
          telescopeIssues.push(`Pick a matching camera or sensor for ${wavelength.shortLabel}`);
        }
      }
      const telescopeOk = telescopeIssues.length === 0;

      // 7B. BIONUTRIENTS-2 REQUIREMENTS & CONOPS VERIFICATION (NASA PDF Slides 12–23)
      const bioTempMatch = bioOrg.targetTempC === bioThm.incubateTempC;
      const bioBagFilmMatch = bioOrg.id === "yeast_beta_carotene" ? bioBag.filmMil === 3 : bioBag.filmMil === 5;
      const bioBagGrowthFactor = bioOrg.id === "yeast_beta_carotene"
        ? bioBag.yeastGrowthFactor
        : (bioBag.filmMil === 5 ? 1.0 : 0.85);
      const betaCaroteneUgMl = Number((
        bioOrg.baseBetaCaroteneUgMl *
        bioBagGrowthFactor *
        bioProto.yieldFactor *
        (bioTempMatch ? 1.0 : 0.45) *
        bioThm.preservationFactor
      ).toFixed(2));
      const dryCellWeightMg = Number((
        bioOrg.baseDcwMg *
        bioProto.dcwFactor *
        bioBagGrowthFactor *
        (bioTempMatch ? 1.0 : 0.55) *
        bioThm.preservationFactor
      ).toFixed(2));

      const bioIssues = [];
      if (isBio) {
        if (!isIssOrbit) bioIssues.push(`Target destination must be ISS 418 km / LEO (currently ${orbit.name})`);
        if (rawLvCapacityKg <= 0) bioIssues.push(`${lv.name.split("(")[0].trim()} does not service ${orbit.name} — use Cygnus NG-18 CRS`);
        if (!bioOrg.goalAligned) bioIssues.push("BioNutrients-2 primary goals require Engineered Yeast producing targeted beta-carotene");
        if (bioBag.containerMassG >= 250) bioIssues.push(`Empty container mass (${bioBag.containerMassG} g) fails <250 g requirement vs BioNutrients-1`);
        if (bioBag.kitVolumeMl >= 300) bioIssues.push(`Total kit volume (${bioBag.kitVolumeMl} mL) fails <300 mL requirement vs BioNutrients-1`);
        if (!bioBag.hasIssNonLuerCover) bioIssues.push("Valve configuration lacks ISS non-Luer thread cover (-002 required)");
        if (!bioBagFilmMatch) bioIssues.push(`${bioOrg.shortLabel} specifies ${bioOrg.id === "yeast_beta_carotene" ? "3mil" : "5mil"} FEP bag thickness`);
        if (bioProto.replicates < 12) bioIssues.push(`Publication requires >=12 replicates (currently ${bioProto.replicates})`);
        if (bioProto.sampleVolMl < 30) bioIssues.push(`Sample volume (${bioProto.sampleVolMl} mL) below >=30 mL requirement`);
        if (!bioProto.sterileFiltered || bioProto.contaminationCfu > 0) bioIssues.push("Missing 0.2 µm sterile filtration step — microbial contamination risk");
        if (bioOrg.requiresSixHourShake && !bioProto.hasSixHourShake) bioIssues.push("Yeast protocol requires ~1 min mid-incubation shake at 6 hours");
        if (!bioTempMatch) bioIssues.push(`Incubator setpoint (${bioThm.incubateTempC}°C) mismatches ${bioOrg.shortLabel} (${bioOrg.targetTempC}°C)`);
        if (!bioThm.melfiFrozen) bioIssues.push("Missing MELFI (-80°C) freezer storage for post-incubation return preservation");
        if (betaCaroteneUgMl < 3.0) bioIssues.push(`Beta-carotene yield (${betaCaroteneUgMl} µg/mL) below >=3.0 µg/mL requirement`);
        if (dryCellWeightMg < 1.0) bioIssues.push(`Dry cell weight (${dryCellWeightMg} mg) below >=1.0 mg requirement`);
      }
      const bioOk = bioIssues.length === 0;
      const bioTelemetry = {
        organism: bioOrg,
        bag: bioBag,
        protocol: bioProto,
        thermal: bioThm,
        tempMatch: bioTempMatch,
        filmMatch: bioBagFilmMatch,
        betaCaroteneUgMl,
        dryCellWeightMg,
        replicatesOk: bioProto.replicates >= 12,
        sampleVolOk: bioProto.sampleVolMl >= 30,
        yieldOk: betaCaroteneUgMl >= 3.0,
        dcwOk: dryCellWeightMg >= 1.0,
        sterileOk: bioProto.sterileFiltered && bioBag.hasIssNonLuerCover && bioProto.contaminationCfu === 0,
        containerMassOk: bioBag.containerMassG < 250,
        kitVolumeOk: bioBag.kitVolumeMl < 300,
        melfiOk: bioThm.melfiFrozen,
        shake6hOk: !bioOrg.requiresSixHourShake || bioProto.hasSixHourShake,
        issues: bioIssues,
        bioOk
      };

      // 8. THERMAL, RADIATION & MISSION LIFETIME (Months)
      const thermalCapScaled = Math.round(thm.thermalCapW * (scenario.isCubesat ? 0.35 : 1.0));
      const thermalOk = isBio ? (bioTempMatch && bioThm.melfiFrozen && thermalCapScaled >= totalPowerLoadW) : (thermalCapScaled >= totalPowerLoadW);
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
      let scienceScore = Math.max(0, Math.min(100, rawSciencePoints + alignmentBonus + orbitMatchBonus + telescopeBonus));
      if (isBio) {
        let bioSci = 0;
        if (bioOrg.goalAligned) bioSci += 20;
        if (bioTelemetry.replicatesOk) bioSci += 15;
        if (bioTelemetry.sampleVolOk) bioSci += 12;
        if (bioTelemetry.yieldOk) bioSci += 22;
        if (bioTelemetry.dcwOk) bioSci += 12;
        if (bioTelemetry.sterileOk) bioSci += 10;
        if (bioProto.replicates >= 16) bioSci += 5;
        if (bioTelemetry.melfiOk) bioSci += 4;
        scienceScore = Math.max(0, Math.min(100, bioSci));
      }

      let engineeringScore = 100;
      if (!budgetOk) engineeringScore -= Math.min(35, Math.round(((totalCostM - budgetCapM) / budgetCapM) * 100));
      if (!massOk) engineeringScore -= 28;
      if (!powerOk) engineeringScore -= 20;
      if (!commsOk) engineeringScore -= 16;
      if (!deltaVOk) engineeringScore -= 22;
      if (!thermalOk || !radiationOk) engineeringScore -= 14;
      if (!disposalOk) engineeringScore -= 10;
      if (!telescopeOk) engineeringScore -= 16;
      if (isBio && !bioOk) engineeringScore -= Math.min(45, bioIssues.length * 8);
      engineeringScore = Math.max(0, engineeringScore);

      const overallScore = Math.round(engineeringScore * 0.55 + scienceScore * 0.45);

      const segments = isBio
        ? {
            launch: {
              label: "LAUNCH",
              ok: massOk && budgetOk && isIssOrbit && rawLvCapacityKg > 0 && bioTelemetry.containerMassOk && bioTelemetry.kitVolumeOk && bioBag.hasIssNonLuerCover
            },
            space: {
              label: "SPACE",
              ok: powerOk && bioTelemetry.sterileOk && bioTelemetry.replicatesOk && bioTelemetry.sampleVolOk && bioTelemetry.shake6hOk && bioTempMatch && bioTelemetry.melfiOk
            },
            ground: { label: "GROUND", ok: commsOk && bioTempMatch },
            user: {
              label: "USER",
              ok: bioTelemetry.melfiOk && bioTelemetry.yieldOk && bioTelemetry.dcwOk && bioTelemetry.replicatesOk && bioTelemetry.sterileOk
            }
          }
        : {
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
        1: "Stage 1 · The Big Idea (CML 1)",
        2: "Stage 2 · Does the Physics Work? (CML 2)",
        3: "Stage 3 · Compare Options (CML 3)",
        4: "Stage 4 · Chosen Blueprint (CML 4)"
      };

      const riskMatrix = isBio
        ? [
            {
              subsystem: "NG-18 Stow & Container",
              level: (!bioTelemetry.containerMassOk || !bioTelemetry.kitVolumeOk || !massOk) ? "RED" : !bioBagFilmMatch ? "AMBER" : "GREEN",
              likelihood: (!bioTelemetry.containerMassOk || !bioTelemetry.kitVolumeOk) ? "HIGH" : "LOW",
              consequence: "HIGH",
              detail: `${bioBag.containerMassG}g (<250g) · ${bioBag.kitVolumeMl}mL (<300mL)`
            },
            {
              subsystem: "PWD Filter & Sterility",
              level: !bioTelemetry.sterileOk ? "RED" : "GREEN",
              likelihood: !bioTelemetry.sterileOk ? "HIGH" : "LOW",
              consequence: "HIGH",
              detail: `${bioProto.sterileFiltered ? "0.2µm Filter" : "UNFILTERED"} · ${bioBag.hasIssNonLuerCover ? "-002 Non-Luer" : "-001 Earth"}`
            },
            {
              subsystem: "30°C & 6h Agitation",
              level: (!bioTempMatch || !bioTelemetry.shake6hOk || !powerOk) ? "RED" : "GREEN",
              likelihood: (!bioTempMatch || !bioTelemetry.shake6hOk) ? "HIGH" : "LOW",
              consequence: "HIGH",
              detail: `${bioThm.incubateTempC}°C (req ${bioOrg.targetTempC}°C) · ${bioTelemetry.shake6hOk ? "6h Shake OK" : "NO 6h SHAKE"}`
            },
            {
              subsystem: "Ground & MELFI -80°C",
              level: (!commsOk || !bioTelemetry.melfiOk) ? "RED" : linkMarginDb < 6 ? "AMBER" : "GREEN",
              likelihood: (!commsOk || !bioTelemetry.melfiOk) ? "HIGH" : "LOW",
              consequence: "MED",
              detail: `${bioThm.storageTempC}°C · +${linkMarginDb} dB live console`
            },
            {
              subsystem: "User Yield & Reps",
              level: (!bioTelemetry.yieldOk || !bioTelemetry.dcwOk || !bioTelemetry.replicatesOk || !bioTelemetry.sampleVolOk) ? "RED" : bioProto.replicates === 12 ? "AMBER" : "GREEN",
              likelihood: (!bioTelemetry.yieldOk || !bioTelemetry.replicatesOk) ? "HIGH" : bioProto.replicates === 12 ? "MED" : "LOW",
              consequence: "HIGH",
              detail: `${betaCaroteneUgMl} µg/mL · ${bioProto.replicates}×${bioProto.sampleVolMl}mL · ${dryCellWeightMg}mg`
            }
          ]
        : [
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

      const baseTelemetry = {
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
        bioTelemetry,
        analogue,
        isBio,
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

      if (window.CMLFramework && typeof window.CMLFramework.evaluateCmlState === "function") {
        const missionState = typeof this.getMissionState === "function" ? this.getMissionState() : null;
        const cmlEval = window.CMLFramework.evaluateCmlState(
          baseTelemetry,
          {
            tasks: this.tasks,
            tradeBaselineA: this.tradeBaselineA,
            groundSupport: (missionState && missionState.groundSupport) || {}
          },
          this.cmlState
        );
        baseTelemetry.cml = cmlEval;
        baseTelemetry.cmlLevel = cmlEval.reachedCml;
        baseTelemetry.cmlLabel = cmlEval.reachedTitle;
      }

      return baseTelemetry;
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
          label: isPhone ? "BUDG" : "BUDGET",
          val: `$${t.totalCostM}/${t.budgetCapM}M`,
          pct: Math.min(100, Math.round((t.totalCostM / Math.max(1, t.budgetCapM)) * 100)),
          ok: t.budgetOk,
          color: t.budgetOk ? "#7fb8a6" : "#ef4444",
          tip: "Total mission cost vs the scenario budget. Cheaper parts leave reserve for upgrades or unexpected fixes."
        },
        {
          label: isPhone ? "MASS" : "MASS",
          val: `${t.wetMassKg}/${t.lvCapacityKg}kg`,
          pct: Math.min(100, Math.round((t.wetMassKg / Math.max(1, t.lvCapacityKg)) * 100)),
          ok: t.massOk,
          color: t.massOk ? "#67e8f9" : "#ef4444",
          tip: "Wet mass (spacecraft + propellant + instruments) must fit under the selected rocket's lift capacity to this orbit."
        },
        {
          label: isPhone ? "PWR" : "POWER",
          val: `${t.totalPowerLoadW}/${t.daylightGenW}W`,
          pct: Math.min(100, Math.round((t.totalPowerLoadW / Math.max(1, t.daylightGenW)) * 100)),
          ok: t.powerOk,
          color: t.powerOk ? "#d0a15c" : "#ef4444",
          tip: "Solar generation must run all loads and recharge the battery for eclipse. Battery depth-of-discharge must stay at or below 80%."
        },
        {
          label: isPhone ? "DATA" : "COMMS/DATA",
          val: `${t.linkMarginDb}dB`,
          pct: Math.min(100, Math.max(10, Math.round((t.downlinkCapGbPerDay / Math.max(1, t.dataGeneratedGbPerDay)) * 55))),
          ok: t.commsOk,
          color: t.commsOk ? "#9a8fc4" : "#f59e0b",
          tip: "Instruments generate data; the antenna and ground network must downlink it with a link margin above 3 dB."
        },
        {
          label: isPhone ? "ΔV" : "DELTA-V",
          val: `${t.achievedDeltaV}m/s`,
          pct: Math.min(100, Math.round((t.achievedDeltaV / Math.max(1, t.requiredDeltaV)) * 80)),
          ok: t.deltaVOk,
          color: t.deltaVOk ? "#38bdf8" : "#ef4444",
          tip: "Propulsion must cover orbit insertion plus end-of-mission disposal. Ion engines are efficient but power-hungry."
        },
        {
          label: isPhone ? "SCI" : "SCIENCE",
          val: `${t.scienceScore}/100`,
          pct: t.scienceScore,
          ok: t.scienceScore >= 60,
          color: "#4ade80",
          tip: "Science score rises when the selected instruments cover the scenario's required science types."
        }
      ];

      bar.innerHTML = metrics
        .map((m) => `
          <div class="lunaspis-res-item" title="${m.tip}" style="cursor:help;">
            <div class="lunaspis-res-head">
              <span style="color:${m.color};font-weight:700;">${m.label}</span>
              <span>${m.val}</span>
            </div>
            <div class="lunaspis-res-track">
              <div style="height:100%;width:${m.pct}%;background:${m.color};transition:width 0.25s;"></div>
            </div>
          </div>
        `)
        .join("");
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
          color: "#9a8fc4",
          holders: players,
          namesText: players.length ? `${players.length} crew` : "CREW",
          isMine: true,
          isUnstaffed: false,
          badgeText: "ALL CREW"
        };
      }

      const meta = window.InterfellasRoles
        ? window.InterfellasRoles.getRoleMeta(role)
        : { short: role.slice(0, 3).toUpperCase(), label: role.toUpperCase(), color: "#67e8f9" };
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
      const mission = this.getMissionState();
      this.telemetry = t;
      this._activeRenderCallback = typeof options.onRerender === "function" ? options.onRerender : null;

      let roleStrip = "";
      if (this.activeTask && !this.activeTask.isPreFlightMdl) {
        const assign = this._getRoleAssignment(this.activeTask.role);
        const stripBorder = assign.isMine ? "rgba(59,130,246,0.55)" : "rgba(148,163,184,0.28)";
        const stripBg = assign.isMine ? "rgba(37,99,235,0.14)" : "rgba(15,23,42,0.72)";
        const stripColor = assign.isMine ? "#dbeafe" : "#cbd5e1";
        const stripMsg = assign.isMine
          ? (assign.role === "all"
            ? "JOINT CREW CONSOLE · Any flight crewmember may run final evaluation & commit mission"
            : `[ASSIGNED] YOUR STATION CONSOLE [${assign.short} ${assign.label}]`)
          : assign.isUnstaffed
            ? `UNSTAFFED ROLE [${assign.short} ${assign.label}] · Cross-role support active`
            : `PRIMARY OWNER: [${assign.short}] ${this._escapeHtml(assign.namesText)} · Co-review allowed`;
        const gs = (mission && mission.groundSupport) || {};
        const gsTags = [
          gs.dsnLocked ? "DSN LOCKED" : null,
          gs.powerRouted ? "EPS ROUTED" : null,
          gs.scienceCleared ? "SCI CLEARED" : null
        ].filter(Boolean);
        roleStrip = `
          <div style="margin-bottom:8px;padding:7px 10px;border-radius:4px;border:1px solid ${stripBorder};background:${stripBg};color:${stripColor};font-family:var(--font-mono,monospace);font-size:10px;font-weight:700;letter-spacing:0.6px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <span>${stripMsg}${gsTags.length ? ` · LCC SUPPORT: ${gsTags.join(" / ")}` : ""}</span>
            <span>DUTY: ${assign.short}</span>
          </div>
        `;
      }

      const pill = (label, value, sub, ok) => `
        <div style="padding:7px 9px;border-radius:4px;background:rgba(5,8,16,0.72);border:1px solid ${ok ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.55)"};">
          <div style="display:flex;justify-content:space-between;align-items:center;font-family:var(--font-mono,monospace);font-size:9px;color:#94a3b8;letter-spacing:0.8px;">
            <span>${label}</span>
            <span style="color:${ok ? "#86efac" : "#fca5a5"};font-weight:700;">${ok ? "NOMINAL" : "CONSTRAINT"}</span>
          </div>
          <div style="font-family:var(--font-mono,monospace);font-size:12px;font-weight:700;color:#f8fafc;margin-top:2px;">${value}</div>
          <div style="font-family:var(--font-mono,monospace);font-size:9px;color:#94a3b8;margin-top:1px;">${sub}</div>
        </div>
      `;

      const segBadge = (seg) => `
        <span style="padding:2px 6px;border-radius:3px;font-family:var(--font-mono,monospace);font-size:9px;font-weight:700;border:1px solid ${seg.ok ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)"};background:${seg.ok ? "rgba(22,163,74,0.14)" : "rgba(239,68,68,0.12)"};color:${seg.ok ? "#86efac" : "#fca5a5"};">
          ${seg.ok ? "OK" : "!"} ${seg.label}
        </span>
      `;

      const cmlEval = t.cml || null;
      const reachedLvl = cmlEval ? cmlEval.reachedCml : t.cmlLevel;
      const targetLvl = cmlEval ? cmlEval.targetCml : 4;
      const targetPct = cmlEval && cmlEval.activeSummary ? cmlEval.activeSummary.percentGreen : 0;
      const critCount = cmlEval && cmlEval.activeSummary ? cmlEval.activeSummary.criticalGaps.length : 0;
      const cmlPills = [1, 2, 3, 4, 5, 6, 7].map((lvl) => {
        const active = lvl <= reachedLvl;
        const isTarget = lvl === targetLvl;
        const bg = active ? "rgba(37,99,235,0.24)" : "rgba(255,255,255,0.04)";
        const fg = active ? "#93c5fd" : isTarget ? "#fde68a" : "#64748b";
        const bd = isTarget ? "rgba(251,191,36,0.75)" : (active ? "rgba(59,130,246,0.55)" : "rgba(148,163,184,0.18)");
        return `<button type="button" class="btn-cml-pill-jump" data-cml-jump="${lvl}" title="Open Stage ${lvl} in the Mission Readiness Guide" style="padding:2px 5px;border-radius:3px;font-family:var(--font-mono,monospace);font-size:8.5px;font-weight:700;background:${bg};color:${fg};border:1px solid ${bd};cursor:pointer;">STAGE ${lvl}${isTarget ? "*" : ""}</button>`;
      }).join("");

      let tradeDeltaHtml = "";
      if (this.tradeBaselineA) {
        const a = this.tradeBaselineA;
        const fmtDelta = (val, unit, lowerBetter = false) => {
          if (val === 0) return `<span style="color:#94a3b8;">0${unit}</span>`;
          const good = lowerBetter ? val < 0 : val > 0;
          const sign = val > 0 ? "+" : "";
          return `<span style="color:${good ? "#86efac" : "#fca5a5"};font-weight:700;">${sign}${val}${unit}</span>`;
        };
        const dCost = Number((t.totalCostM - a.totalCostM).toFixed(0));
        const dMass = Number((t.wetMassKg - a.wetMassKg).toFixed(1));
        const dPwr = Number((t.netDaylightMarginW - a.netDaylightMarginW).toFixed(0));
        const dDv = Number((t.achievedDeltaV - a.achievedDeltaV).toFixed(0));
        const dSci = Number((t.scienceScore - a.scienceScore).toFixed(0));
        const dScore = Number((t.overallScore - a.overallScore).toFixed(0));
        tradeDeltaHtml = `
          <div style="margin-top:8px;padding:6px 9px;border-radius:4px;background:rgba(37,99,235,0.1);border:1px solid rgba(59,130,246,0.35);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-family:var(--font-mono,monospace);font-size:9.5px;">
            <span style="color:#bfdbfe;font-weight:700;">MDL TRADE Δ (vs Option A: ${this._escapeHtml(a.scenario.code)} / ${this._escapeHtml(a.orbit.id.toUpperCase())})</span>
            <span style="color:#cbd5e1;">
              Cost ${fmtDelta(dCost, "M", true)} · Mass ${fmtDelta(dMass, "kg", true)} · Pwr ${fmtDelta(dPwr, "W")} · ΔV ${fmtDelta(dDv, "m/s")} · Sci ${fmtDelta(dSci, "pt")} · Grade ${fmtDelta(dScore, "pt")}
            </span>
            <button type="button" id="btn-mdl-clear-a" style="padding:2px 6px;border-radius:3px;border:1px solid rgba(148,163,184,0.28);background:rgba(5,8,16,0.6);color:#cbd5e1;font-family:inherit;font-size:8.5px;cursor:pointer;">CLEAR A</button>
          </div>
        `;
      }

      if (typeof queueMicrotask === "function") {
        queueMicrotask(() => this._syncConsoleWidgets());
      }

      const cadetCoachHtml = (window.missionAcademy && typeof window.missionAcademy.getConsoleTipHtml === "function")
        ? window.missionAcademy.getConsoleTipHtml(this.activeTask, this._activeMdlTab)
        : "";

      return `
        ${roleStrip}
        ${cadetCoachHtml}
        <div style="margin-bottom:14px;padding:10px 12px;border-radius:4px;background:rgba(8,13,24,0.82);border:1px solid rgba(148,163,184,0.22);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
            <span style="font-family:var(--font-mono,monospace);font-size:10px;font-weight:700;letter-spacing:1.2px;color:#93c5fd;">
              ${t.cmlLabel.toUpperCase()} · ${t.scenario.name.toUpperCase()}
            </span>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <button type="button" id="btn-mdl-snapshot-a" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(148,163,184,0.28);background:rgba(15,23,42,0.85);color:#e2e8f0;font-family:var(--font-mono,monospace);font-size:9px;font-weight:700;cursor:pointer;">${this.tradeBaselineA ? "UPDATE OPTION A" : "SAVE OPTION A"}</button>
              <button type="button" id="btn-open-cml-workbench" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(251,191,36,0.55);background:rgba(245,158,11,0.16);color:#fde68a;font-family:var(--font-mono,monospace);font-size:9px;font-weight:700;cursor:pointer;" title="Open step-by-step Mission Readiness Guide (Stages 1-9)">READY ${targetPct}% @ S${targetLvl}${critCount ? ` · ${critCount} KEY` : ""}</button>
              <button type="button" id="btn-mdl-open-csa-lab" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(52,211,153,0.5);background:rgba(16,185,129,0.16);color:#a7f3d0;font-family:var(--font-mono,monospace);font-size:9px;font-weight:700;cursor:pointer;" title="Open CSA Digital Games & Activities, GMAT Script Generator & Webb Telescope Lab">CSA / NASA LAB</button>
              <button type="button" id="btn-mdl-open-viz" style="padding:3px 8px;border-radius:4px;border:1px solid rgba(59,130,246,0.5);background:rgba(37,99,235,0.2);color:#dbeafe;font-family:var(--font-mono,monospace);font-size:9px;font-weight:700;cursor:pointer;">3D ORBIT VIZ [U]</button>
              <span style="font-family:var(--font-mono,monospace);font-size:10px;font-weight:700;color:${t.overallScore >= 75 ? "#86efac" : "#fde68a"};">
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
            ${
              t.scenario.isBioPayload
                ? `
                  ${pill("CONTAINER & VOL", `${t.bioTelemetry.bag.containerMassG}g / ${t.bioTelemetry.bag.kitVolumeMl}mL`, `Caps: <250g · <300mL (vs BN-1)`, t.bioTelemetry.containerMassOk && t.bioTelemetry.kitVolumeOk)}
                  ${pill("INCUBATE / MELFI", `${t.bioTelemetry.thermal.incubateTempC}°C / ${t.bioTelemetry.thermal.storageTempC}°C`, `Load ${t.totalPowerLoadW}W · Req ${t.bioTelemetry.organism.targetTempC}°C`, t.powerOk && t.bioTelemetry.tempMatch && t.bioTelemetry.melfiOk)}
                  ${pill("SAMPLES & FILTER", `${t.bioTelemetry.protocol.replicates}×${t.bioTelemetry.protocol.sampleVolMl}mL`, `${t.bioTelemetry.sterileOk ? "0.2µm + -002 OK" : "STERILE FAIL"} · +${t.linkMarginDb}dB`, t.bioTelemetry.replicatesOk && t.bioTelemetry.sampleVolOk && t.bioTelemetry.sterileOk && t.commsOk)}
                  ${pill("BETA-CAROTENE", `${t.bioTelemetry.betaCaroteneUgMl} µg/mL`, `Req ≥3.0 · DCW ${t.bioTelemetry.dryCellWeightMg}mg ≥1`, t.bioTelemetry.yieldOk && t.bioTelemetry.dcwOk)}
                `
                : `
                  ${pill(t.scenario.isCubesat ? `MASS (${t.cubesatForm.shortLabel})` : "WET MASS", `${t.wetMassKg} / ${t.lvCapacityKg} kg`, `Margin: ${t.massMarginPct}% (${t.lv.name.split(" ")[0]})`, t.massOk)}
                  ${pill("POWER / DoD", `${t.totalPowerLoadW}W / ${t.daylightGenW}W`, `Eclipse DoD: ${t.batteryDodPct}% (≤80%)`, t.powerOk)}
                  ${pill("DATA & LINK", `${t.dataGeneratedGbPerDay} / ${t.downlinkCapGbPerDay} GB/d`, `Link Margin: ${t.linkMarginDb} dB (≥3dB)`, t.commsOk)}
                  ${pill("ΔV & EoM DISPOSAL", `${t.achievedDeltaV} / ${t.requiredDeltaV} m/s`, `${t.disposalOk ? `${t.disposal.deorbitYears}yr EoM` : "EoM FAIL"} · ${t.estimatedLifetimeMonths}/${t.scenario.targetLifetimeMonths} mo`, t.deltaVOk && t.disposalOk && t.lifetimeOk)}
                `
            }
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
          this.showToast("Baseline Option A captured — adjust subsystems to see live MDL trade deltas.");
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

      const btnCsaLab = container.querySelector("#btn-mdl-open-csa-lab");
      if (btnCsaLab && !btnCsaLab.dataset.bound) {
        btnCsaLab.dataset.bound = "1";
        btnCsaLab.addEventListener("click", () => {
          if (window.csaNasaLab && typeof window.csaNasaLab.openModal === "function") {
            window.csaNasaLab.openModal("csa");
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
        t.bioTelemetry.organism.id, t.bioTelemetry.bag.id, t.bioTelemetry.protocol.id, t.bioTelemetry.thermal.id,
        t.selectedInsts.map((i) => i.id).join(",")
      ].join("|");

      if (key !== this._pdLastKey) {
        this._pdLastKey = key;
        this._rebuildPointDesignMesh(t);
      }

      const canvas = this._pdRenderer.domElement;
      canvas.style.cssText = "width:100%;height:156px;display:block;border-radius:6px;border:1px solid rgba(103,232,249,0.3);";
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

      if (t.scenario.isBioPayload && t.bioTelemetry) {
        const bio = t.bioTelemetry;
        const bioGroup = new THREE.Group();
        const isLegacy = bio.bag.id === "bn1_legacy_canister";
        const trayMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.72, roughness: 0.28 });
        // Metallic oxygen/moisture barrier pouch sleeve / incubator carrier tray
        const sleeve = new THREE.Mesh(
          new THREE.BoxGeometry(isLegacy ? 1.55 : 1.75, isLegacy ? 0.45 : 0.08, isLegacy ? 1.15 : 0.92),
          isLegacy ? darkMat : trayMat
        );
        sleeve.position.set(0, -0.32, 0);
        bioGroup.add(sleeve);

        if (isLegacy) {
          // Bulky rigid BioNutrients-1 canister pack comparison
          for (let i = -1; i <= 1; i++) {
            const pack = new THREE.Mesh(
              new THREE.CylinderGeometry(0.22, 0.22, 0.68, 12),
              new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.45, roughness: 0.35 })
            );
            pack.position.set(i * 0.46, 0.22, 0);
            bioGroup.add(pack);
          }
        } else {
          // Instant Systems 8.5" x 3.25" FEP Bag (3mil thin vs 5mil heavy) with internal nutrient/yeast fluid
          const thickness = bio.bag.filmMil >= 5 ? 0.14 : 0.1;
          const liquidColor = bio.organism.id === "yeast_beta_carotene"
            ? (bio.yieldOk ? 0xf59e0b : 0xb45309)
            : 0xf1f5f9;
          const fepMat = new THREE.MeshStandardMaterial({
            color: 0xe0f2fe,
            transparent: true,
            opacity: bio.bag.filmMil >= 5 ? 0.5 : 0.36,
            metalness: 0.15,
            roughness: 0.12
          });
          const fepBag = new THREE.Mesh(new THREE.BoxGeometry(1.58, thickness, 0.68), fepMat);
          fepBag.position.set(0, -0.05, 0);
          bioGroup.add(fepBag);

          const cultureCore = new THREE.Mesh(
            new THREE.BoxGeometry(1.26, thickness * 0.68, 0.52),
            new THREE.MeshStandardMaterial({
              color: liquidColor,
              emissive: bio.yieldOk ? 0x92400e : 0x1e293b,
              emissiveIntensity: 0.35,
              roughness: 0.3
            })
          );
          cultureCore.position.set(-0.08, -0.05, 0);
          bioGroup.add(cultureCore);

          // Color-coded P/N 110596-002 label strip
          const labelStrip = new THREE.Mesh(
            new THREE.BoxGeometry(0.32, 0.02, 0.46),
            new THREE.MeshStandardMaterial({ color: bio.bag.hasIssNonLuerCover ? 0x22c55e : 0xef4444 })
          );
          labelStrip.position.set(-0.56, thickness * 0.5 - 0.03, 0);
          bioGroup.add(labelStrip);

          // Needlefree Swabable Barb Valve + Non-Luer Thread Cover (-002 ISS vs -001 Ground)
          const barb = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.075, 0.24, 12),
            new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.2, roughness: 0.3 })
          );
          barb.rotation.z = Math.PI / 2;
          barb.position.set(0.9, -0.05, 0);
          bioGroup.add(barb);

          if (bio.bag.hasIssNonLuerCover) {
            const cover = new THREE.Mesh(
              new THREE.CylinderGeometry(0.085, 0.085, 0.12, 12),
              cyanMat
            );
            cover.rotation.z = Math.PI / 2;
            cover.position.set(1.04, -0.05, 0);
            bioGroup.add(cover);
          }

          // 0.2 µm sterile syringe filter (when sterile filtration enabled)
          if (bio.protocol.sterileFiltered) {
            const filterDisc = new THREE.Mesh(
              new THREE.CylinderGeometry(0.16, 0.16, 0.08, 16),
              new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x065f46, emissiveIntensity: 0.3 })
            );
            filterDisc.rotation.z = Math.PI / 2;
            filterDisc.position.set(0.45, 0.26, 0.18);
            bioGroup.add(filterDisc);

            const syringeBody = new THREE.Mesh(
              new THREE.CylinderGeometry(0.075, 0.075, 0.62, 12),
              fepMat
            );
            syringeBody.rotation.z = Math.PI / 2;
            syringeBody.position.set(0.02, 0.26, 0.18);
            bioGroup.add(syringeBody);
          }
        }

        // MELFI -80°C cryo-ring indicator underneath when cryopreservation enabled
        if (bio.melfiOk) {
          const cryoRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.95, 0.025, 8, 28),
            cyanMat
          );
          cryoRing.rotation.x = Math.PI / 2;
          cryoRing.position.set(0, -0.42, 0);
          bioGroup.add(cryoRing);
        }

        bioGroup.rotation.x = 0.22;
        group.add(bioGroup);
        return;
      }

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

      ctx.fillStyle = "#060b17";
      ctx.fillRect(0, 0, w, h);

      // Subtle grid
      ctx.strokeStyle = "rgba(103,232,249,0.12)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 36) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 28) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      const scId = t.scenario.id;
      if (scId === "bionutrients_2" && t.bioTelemetry) {
        const bio = t.bioTelemetry;
        const splitX = Math.floor(w * 0.52);

        // Left: 24h Yeast Incubation Growth & Beta-Carotene Curve (with 6h Shake inflection)
        const gx0 = 24;
        const gy0 = h - 24;
        const gw = splitX - 38;
        const gh = h - 46;

        // 3.0 µg/mL requirement threshold dashed line
        const reqY = gy0 - (3.0 / 5.5) * gh;
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "#f59e0b";
        ctx.beginPath();
        ctx.moveTo(gx0, reqY);
        ctx.lineTo(gx0 + gw, reqY);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = "#fcd34d";
        ctx.font = "9px monospace";
        ctx.fillText("REQ 3.0 µg/mL", gx0 + 4, reqY - 4);

        // Growth curve 0h -> 24h (inflection bump at t = 0.25 -> 6 hours)
        ctx.strokeStyle = bio.yieldOk ? "#fbbf24" : "#f87171";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const u = i / 40;
          const shakeBoost = bio.shake6hOk && u >= 0.25 ? (u - 0.25) * 0.45 : 0;
          const growth = Math.min(1.0, (1 / (1 + Math.exp(-9 * (u - 0.38)))) + shakeBoost * 0.35);
          const val = growth * bio.betaCaroteneUgMl;
          const px = gx0 + u * gw;
          const py = gy0 - Math.min(5.2, val) / 5.5 * gh;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // 6-hour shake marker
        const shakeX = gx0 + 0.25 * gw;
        ctx.strokeStyle = bio.shake6hOk ? "rgba(52,211,153,0.7)" : "rgba(239,68,68,0.65)";
        ctx.beginPath();
        ctx.moveTo(shakeX, gy0);
        ctx.lineTo(shakeX, 24);
        ctx.stroke();
        ctx.fillStyle = bio.shake6hOk ? "#6ee7b7" : "#fca5a5";
        ctx.fillText("6h SHAKE", shakeX + 3, 33);

        ctx.fillStyle = "#cbd5e1";
        ctx.font = "bold 9.5px monospace";
        ctx.fillText(`BETA-CAROTENE: ${bio.betaCaroteneUgMl} µg/mL (${bio.thermal.incubateTempC}°C)`, gx0, h - 7);

        // Right: Verification Bar Check (Reps, Sample Vol, Mass vs <250g, Kit Vol vs <300mL, DCW)
        const bx = splitX + 12;
        const bw = w - bx - 14;
        const checks = [
          { label: `Replicates ${bio.protocol.replicates}/12+`, pct: Math.min(1, bio.protocol.replicates / 16), ok: bio.replicatesOk },
          { label: `Sample Vol ${bio.protocol.sampleVolMl}/30mL+`, pct: Math.min(1, bio.protocol.sampleVolMl / 40), ok: bio.sampleVolOk },
          { label: `Container ${bio.bag.containerMassG}g (<250g)`, pct: Math.min(1, bio.bag.containerMassG / 350), ok: bio.containerMassOk },
          { label: `Kit Vol ${bio.bag.kitVolumeMl}mL (<300mL)`, pct: Math.min(1, bio.bag.kitVolumeMl / 520), ok: bio.kitVolumeOk },
          { label: `Dry Cell Wt ${bio.dryCellWeightMg}/1.0mg+`, pct: Math.min(1, bio.dryCellWeightMg / 2.5), ok: bio.dcwOk }
        ];
        checks.forEach((c, idx) => {
          const rowY = 26 + idx * 23;
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.fillRect(bx, rowY + 8, bw, 7);
          ctx.fillStyle = c.ok ? "#34d399" : "#ef4444";
          ctx.fillRect(bx, rowY + 8, Math.max(6, bw * c.pct), 7);
          ctx.fillStyle = c.ok ? "#e2e8f0" : "#fecaca";
          ctx.font = "9px monospace";
          ctx.fillText(c.label, bx, rowY + 5);
        });
      } else if (scId === "space_telescope") {
        // Synthetic deep-field stars + Exoplanet Absorption Spectrum right half
        const halfW = Math.floor(w * 0.45);
        const rng = (i) => Math.abs(Math.sin(i * 12.9898 + t.scienceScore * 0.1) * 43758.5453) % 1;
        for (let i = 0; i < 65; i++) {
          const sx = 10 + rng(i) * (halfW - 20);
          const sy = 14 + rng(i + 99) * (h - 28);
          const r = rng(i + 200) * 2.2 + 0.5;
          ctx.fillStyle = i % 5 === 0 ? "#f59e0b" : (i % 3 === 0 ? "#7dd3fc" : "#f8fafc");
          ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
          if (i < 6) {
            ctx.strokeStyle = "rgba(250,204,21,0.5)";
            ctx.beginPath(); ctx.moveTo(sx - 6, sy); ctx.lineTo(sx + 6, sy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(sx, sy - 6); ctx.lineTo(sx, sy + 6); ctx.stroke();
          }
        }
        // Spectral plot
        ctx.strokeStyle = t.telescopeOk ? "#34d399" : "#f87171";
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
        ctx.fillStyle = "#c4b5fd";
        ctx.font = "bold 10px monospace";
        ctx.fillText(`BAND: ${t.wavelength.shortLabel} · H2O / CO2 ABSORPTION LINES`, halfW + 14, h - 10);
      } else if (scId === "lunar_south_pole") {
        // Shackleton Crater PSR Neutron Hydrogen Heatmap + Altimetry Profile
        const cx = w * 0.25;
        const cy = h * 0.54;
        const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 52);
        grad.addColorStop(0, "rgba(56,189,248,0.9)");
        grad.addColorStop(0.55, "rgba(30,64,175,0.45)");
        grad.addColorStop(1, "rgba(15,23,42,0.05)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#94a3b8";
        ctx.strokeRect(cx - 56, cy - 52, 112, 100);
        // Altimetry curve
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = w * 0.5; x < w - 14; x += 4) {
          const u = (x - w * 0.5) / Math.max(1, w * 0.5 - 14);
          const profile = Math.exp(-Math.pow((u - 0.5) / 0.22, 2)) * 48 - 10 * Math.exp(-Math.pow((u - 0.25) / 0.08, 2));
          const y = h * 0.34 + profile;
          if (x === w * 0.5) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = "#7dd3fc";
        ctx.font = "bold 10px monospace";
        ctx.fillText("SHACKLETON PSR ICE (NEUTRON) + LIDAR DEPTH PROFILE", w * 0.48, h - 10);
      } else {
        // Earth Climate / Cubesat / Asteroid / Sandbox Multi-channel telemetry waveform
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 14; x < w - 14; x += 4) {
          const phase = (x / w) * Math.PI * 4;
          const y = h * 0.56 + Math.sin(phase) * 24 + Math.cos(phase * 2.3) * 10;
          if (x === 14) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = "#34d399";
        ctx.beginPath();
        for (let x = 14; x < w - 14; x += 4) {
          const phase = (x / w) * Math.PI * 4;
          const y = h * 0.58 + Math.cos(phase * 1.4) * 18;
          if (x === 14) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = "#a7f3d0";
        ctx.font = "bold 10px monospace";
        ctx.fillText(`${t.analogue.productTitle.toUpperCase()} · SNR +${Math.max(4, t.linkMarginDb)} dB`, 14, h - 10);
      }

      ctx.fillStyle = "#67e8f9";
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
        bioNutrients2: t.scenario.isBioPayload && t.bioTelemetry
          ? {
              organism: t.bioTelemetry.organism.id,
              bagConfig: t.bioTelemetry.bag.id,
              protocol: t.bioTelemetry.protocol.id,
              thermalChain: t.bioTelemetry.thermal.id,
              betaCaroteneUgMl: t.bioTelemetry.betaCaroteneUgMl,
              dryCellWeightMg: t.bioTelemetry.dryCellWeightMg,
              replicates: t.bioTelemetry.protocol.replicates,
              sampleVolumeMl: t.bioTelemetry.protocol.sampleVolMl,
              containerMassG: t.bioTelemetry.bag.containerMassG,
              totalVolumeMl: t.bioTelemetry.bag.kitVolumeMl,
              bioIssues: t.bioTelemetry.issues
            }
          : null,
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
        },
        cmlAssessment: (window.CMLFramework && t.cml)
          ? window.CMLFramework.generateCmlReportPayload(t, t.cml, {
              id: t.scenario.id,
              name: t.scenario.name,
              code: t.scenario.code
            })
          : null
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
      this.showToast("Downloaded Full Mission Blueprint & Readiness Report (.JSON)");
    }

    exportCmlReport(format = "json") {
      if (!window.CMLFramework) {
        this.showToast("Mission Readiness Guide is still loading.");
        return;
      }
      const t = this.evaluateMissionDesign();
      const cmlEval = t.cml;
      const code = (t.scenario && t.scenario.code ? t.scenario.code : "lunaspis").toLowerCase();
      let content = "";
      let mime = "application/json";
      let ext = "json";
      if (format === "md") {
        content = window.CMLFramework.formatCmlMarkdownReport(t, cmlEval);
        mime = "text/markdown";
        ext = "md";
      } else {
        const payload = window.CMLFramework.generateCmlReportPayload(t, cmlEval, {
          id: t.scenario.id,
          name: t.scenario.name,
          code: t.scenario.code
        });
        content = JSON.stringify(payload, null, 2);
      }
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lunaspis_cml_gate_${code}_cml${cmlEval.targetCml}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast(`Downloaded Mission Readiness Report (.${ext.toUpperCase()})`);
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
          <button type="button" class="mdl-desk-tab" data-tab="${id}" style="padding:6px 10px;border-radius:5px;border:1px solid ${activeTab === id ? "#67e8f9" : "rgba(255,255,255,0.14)"};background:${activeTab === id ? "rgba(103,232,249,0.16)" : "rgba(255,255,255,0.03)"};color:${activeTab === id ? "#ecfeff" : "#94a3b8"};font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
            ${label}
          </button>
        `;

        let tabContent = "";
        if (activeTab === "arch") {
          tabContent = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin-bottom:10px;">
              ${Object.values(MISSION_SCENARIOS).map((sc) => `
                <div class="mdl-q-sc" data-id="${sc.id}" style="padding:9px;border-radius:7px;border:1px solid ${md.scenarioId === sc.id ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${md.scenarioId === sc.id ? "rgba(103,232,249,0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                  <div style="font-family:monospace;font-size:9px;color:#67e8f9;font-weight:700;">${sc.badge} · $${sc.baseBudgetM}M</div>
                  <div style="font-size:12px;font-weight:700;color:#ece7dc;margin:2px 0;">${sc.name}</div>
                  <div style="font-size:10px;color:#94a3b8;">${sc.summary}</div>
                </div>
              `).join("")}
            </div>
            <button type="button" id="btn-mdl-auto-baseline" style="padding:6px 12px;border-radius:5px;border:1px solid rgba(74,222,128,0.5);background:rgba(74,222,128,0.14);color:#86efac;font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
              APPLY RECOMMENDED BASELINE FOR ${t.scenario.code}
            </button>
          `;
        } else if (activeTab === "orbit") {
          tabContent = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px;margin-bottom:10px;">
              ${Object.values(ORBIT_OPTIONS).map((o) => `
                <div class="mdl-q-orb" data-id="${o.id}" style="padding:9px;border-radius:7px;border:1px solid ${md.orbitId === o.id ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${md.orbitId === o.id ? "rgba(103,232,249,0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                  <div style="font-size:11.5px;font-weight:700;color:#ece7dc;">${o.name}</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#67e8f9;">Req ΔV ${o.reqInsertionDv} m/s · Rad ${o.radiationEnvKrad} krad</div>
                </div>
              `).join("")}
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">
              ${Object.values(LAUNCH_VEHICLES).map((v) => `
                <div class="mdl-q-lv" data-id="${v.id}" style="padding:9px;border-radius:7px;border:1px solid ${md.launchVehicleId === v.id ? "#d0a15c" : "rgba(255,255,255,0.12)"};background:${md.launchVehicleId === v.id ? "rgba(208,161,92,0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                  <div style="font-size:11px;font-weight:700;color:#ece7dc;">${v.name}</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#d0a15c;">$${v.costM}M · Lift: ${v.capacityKg[md.orbitId] || 0} kg</div>
                </div>
              `).join("")}
            </div>
          `;
        } else if (activeTab === "bus") {
          tabContent = `
            <div style="display:grid;grid-template-columns:260px 1fr;gap:12px;align-items:start;">
              <div>
                <div id="mdl-point-design-3d" style="width:100%;height:156px;border-radius:6px;background:#050914;"></div>
                <div style="font-family:monospace;font-size:9px;color:#94a3b8;text-align:center;margin-top:4px;">LIVE 3D POINT DESIGN (${t.bus.id.toUpperCase()})</div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:7px;">
                ${Object.values(SPACECRAFT_BUSES).map((b) => `
                  <div class="mdl-q-bus" data-id="${b.id}" style="padding:8px;border-radius:6px;border:1px solid ${md.busId === b.id ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${md.busId === b.id ? "rgba(103,232,249,0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                    <div style="font-size:11px;font-weight:700;color:#ece7dc;">${b.name}</div>
                    <div style="font-family:monospace;font-size:9px;color:#67e8f9;">$${b.costM}M · ${b.dryMassKg} kg · ${b.maxInstruments} bays</div>
                  </div>
                `).join("")}
                ${Object.values(POWER_SYSTEMS).map((p) => `
                  <div class="mdl-q-pwr" data-id="${p.id}" style="padding:8px;border-radius:6px;border:1px solid ${md.powerId === p.id ? "#d0a15c" : "rgba(255,255,255,0.12)"};background:${md.powerId === p.id ? "rgba(208,161,92,0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                    <div style="font-size:11px;font-weight:700;color:#ece7dc;">${p.name}</div>
                    <div style="font-family:monospace;font-size:9px;color:#7fb8a6;">+$${p.costM}M · +${p.genW} W</div>
                  </div>
                `).join("")}
              </div>
            </div>
          `;
        } else {
          tabContent = `
            <canvas id="sim-science-canvas" width="680" height="150" style="width:100%;height:150px;border-radius:6px;border:1px solid rgba(103,232,249,0.3);margin-bottom:8px;display:block;"></canvas>
            <div style="font-family:monospace;font-size:10px;color:#c4b5fd;margin-bottom:6px;">
              REAL NASA / CSA ANALOGUE: <strong style="color:#ece7dc;">${t.analogue.missions}</strong>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;">
              ${t.riskMatrix.map((r) => `
                <div style="padding:6px;border-radius:5px;background:rgba(0,0,0,0.35);border-left:3px solid ${r.level === "GREEN" ? "#4ade80" : r.level === "AMBER" ? "#fbbf24" : "#ef4444"};">
                  <div style="font-family:monospace;font-size:9px;font-weight:700;color:#e2e8f0;">${r.subsystem} (${r.level})</div>
                  <div style="font-family:monospace;font-size:8.5px;color:#94a3b8;">L:${r.likelihood} / C:${r.consequence}</div>
                </div>
              `).join("")}
            </div>
          `;
        }

        this._activeMdlTab = activeTab;
        body.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: renderDesk })}
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
            ${mkTab("arch", "1. SCENARIO")}
            ${mkTab("orbit", "2. ORBIT & LAUNCH")}
            ${mkTab("bus", "3. 3D BUS & POWER")}
            ${mkTab("viz", "4. RISK & SCIENCE PREVIEW")}
            <button type="button" id="btn-mdl-open-cml" style="padding:6px 10px;border-radius:5px;border:1px solid rgba(251,191,36,0.55);background:rgba(245,158,11,0.14);color:#fde68a;font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">5. READINESS STAGES (${t.cml ? `${t.cml.activeSummary.percentGreen}% @ S${t.cml.targetCml}` : `Stage ${t.cmlLevel}`})</button>
          </div>
          ${tabContent}
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);">
            <button type="button" id="btn-mdl-export-json" style="padding:8px 12px;border-radius:5px;border:1px solid rgba(167,139,250,0.5);background:rgba(167,139,250,0.12);color:#ddd6fe;font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
              EXPORT POINT DESIGN (.JSON)
            </button>
            <button type="button" id="btn-mdl-sync-crew" style="padding:9px 18px;border-radius:6px;border:1px solid #67e8f9;background:#ece7dc;color:#05060a;font-family:monospace;font-size:10.5px;font-weight:800;letter-spacing:1.2px;cursor:pointer;">
              SYNC POINT DESIGN TO CREW & CLOSE
            </button>
          </div>
        `;

        body.querySelectorAll(".mdl-desk-tab").forEach((b) => {
          b.addEventListener("click", () => { activeTab = b.dataset.tab; renderDesk(); });
        });
        body.querySelectorAll(".mdl-q-sc").forEach((c) => {
          c.addEventListener("click", () => {
            const nextId = c.dataset.id;
            const changed = this.missionDesign.scenarioId !== nextId;
            this.missionDesign.scenarioId = nextId;
            if (changed && nextId === "bionutrients_2") {
              this.applyRecommendedScenarioBaseline(nextId);
            } else {
              this._renderResourceMeters();
            }
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
        const btnOpenCml = body.querySelector("#btn-mdl-open-cml");
        if (btnOpenCml) {
          btnOpenCml.addEventListener("click", () => {
            this.openCmlWorkbench("checklist", { returnTask: synthTask });
          });
        }
        const btnExp = body.querySelector("#btn-mdl-export-json");
        if (btnExp) btnExp.addEventListener("click", () => this.exportMdlPointDesignJson());
        const btnSync = body.querySelector("#btn-mdl-sync-crew");
        if (btnSync) {
          btnSync.addEventListener("click", () => {
            if (window.netManager && typeof window.netManager.syncMissionDesign === "function") {
              window.netManager.syncMissionDesign(this.syncFullDesignPatch());
            }
            this.showToast("Point Design synchronized across Launch / Space / Ground / User crew");
            this.closeTaskModal();
          });
        }
      };

      renderDesk();
    }

    // ========================================================================
    // JPL CONCEPT MATURITY LEVELS (CML 1-9) WORKBENCH
    // ========================================================================
    _jumpFromCmlToConsole(consoleKey) {
      const task = this.tasks.find((x) => x.id === consoleKey);
      const mission = this.getMissionState();
      const phase = mission && mission.phase;
      const inOrbit = !phase || phase === "station";
      if (task && (inOrbit || task.id === "task_antenna") && this.isTaskAvailable(task.id, mission)) {
        this.openTaskModal(task);
        return;
      }
      const fallbackTab = {
        task_antenna: "arch",
        task_nav: "orbit",
        task_wires: "bus",
        task_science: "viz",
        task_lss: "bus",
        task_hull: "bus",
        task_landing: "viz"
      }[consoleKey] || "bus";
      this.openPreFlightMdlDesk(fallbackTab);
    }

    _renderCmlChecklistTab(cmlEval, filterCat) {
      const target = cmlEval.activeSummary;
      const cats = [
        { id: "all", label: "ALL" },
        ...cmlEval.categories.map((c) => ({ id: c.id, label: c.label.toUpperCase() }))
      ];
      const catLabelMap = Object.fromEntries((cmlEval.categories || []).map((c) => [c.id, c.label.toUpperCase()]));
      const filtered = target.items.filter((i) => filterCat === "all" || i.category === filterCat);
      const pct = target.percentGreen;
      const barColor = target.gateCertified ? "#4ade80" : target.thresholdMet ? "#fbbf24" : "#38bdf8";

      const marginStrip = (cmlEval.margins.metrics || []).map((m) => {
        const c = m.status === "G" ? "#86efac" : m.status === "Y" ? "#fde68a" : "#fca5a5";
        const statusWord = m.status === "G" ? "GOOD" : m.status === "Y" ? "TIGHT" : "LOW";
        const bd = m.status === "G" ? "rgba(74,222,128,0.4)" : m.status === "Y" ? "rgba(251,191,36,0.45)" : "rgba(239,68,68,0.55)";
        return `
          <div style="padding:6px 8px;border-radius:4px;background:rgba(5,8,16,0.72);border:1px solid ${bd};">
            <div style="display:flex;justify-content:space-between;font-family:monospace;font-size:8.5px;color:#94a3b8;gap:4px;">
              <span>${this._escapeHtml(m.label)}</span>
              <strong style="color:${c};white-space:nowrap;">${statusWord} (${this._escapeHtml(m.required)})</strong>
            </div>
            <div style="font-family:monospace;font-size:11px;font-weight:700;color:#f8fafc;margin-top:2px;">${this._escapeHtml(m.actual)}</div>
            <div style="font-family:monospace;font-size:8.5px;color:#94a3b8;margin-top:1px;">${this._escapeHtml(m.note)}</div>
          </div>
        `;
      }).join("");

      const taskShort = {
        task_antenna: "BRIEF [1]",
        task_nav: "ORBIT [2]",
        task_wires: "POWER [3]",
        task_science: "SCIENCE [4]",
        task_lss: "COOL/RAD [5]",
        task_hull: "COMMS [6]",
        task_landing: "RISKS [7]"
      };

      const rowsHtml = filtered.map((item) => {
        const mkPill = (code, label, active, color, bg) => item.na
          ? ""
          : `<button type="button" class="cml-toggle-status" data-item-id="${item.id}" data-status="${code}" style="padding:2px 6px;border-radius:3px;border:1px solid ${active ? color : "rgba(148,163,184,0.22)"};background:${active ? bg : "rgba(15,23,42,0.7)"};color:${active ? "#f8fafc" : "#64748b"};font-family:monospace;font-size:9px;font-weight:800;cursor:pointer;">${label}</button>`;
        const statusColor = item.status === "G" ? "#4ade80" : item.status === "Y" ? "#fbbf24" : item.status === "R" ? "#f87171" : "#64748b";
        const catTitle = catLabelMap[item.category] || item.category.toUpperCase();
        return `
          <div style="padding:7px 9px;border-radius:5px;background:${item.na ? "rgba(15,23,42,0.35)" : "rgba(15,23,42,0.72)"};border:1px solid rgba(148,163,184,0.16);border-left:3px solid ${statusColor};opacity:${item.na ? "0.62" : "1"};display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div style="flex:1 1 320px;min-width:220px;">
              <div style="font-size:11px;color:#f1f5f9;font-weight:600;line-height:1.3;">
                <span style="font-family:monospace;font-size:8.5px;color:#93c5fd;margin-right:4px;">[${this._escapeHtml(catTitle)}]</span>
                ${this._escapeHtml(item.text)}
                ${item.critical ? '<span style="margin-left:5px;padding:1px 4px;border-radius:3px;background:rgba(245,158,11,0.2);color:#fde68a;font-family:monospace;font-size:8px;font-weight:800;">MUST-HAVE</span>' : ""}
                ${item.overrideStatus ? '<span style="margin-left:4px;padding:1px 4px;border-radius:3px;background:rgba(56,189,248,0.2);color:#7dd3fc;font-family:monospace;font-size:8px;">EDITED</span>' : ""}
              </div>
              <div style="font-family:monospace;font-size:9px;color:#94a3b8;margin-top:2px;">${this._escapeHtml(item.autoReason)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
              ${item.consoleKey && !item.na ? `<button type="button" class="cml-jump-console" data-console="${item.consoleKey}" style="padding:2px 6px;border-radius:3px;border:1px solid rgba(103,232,249,0.35);background:rgba(103,232,249,0.1);color:#a5f3fc;font-family:monospace;font-size:8.5px;cursor:pointer;" title="Jump straight to this workstation console">${taskShort[item.consoleKey] || "OPEN"}</button>` : ""}
              ${item.na ? '<span style="padding:2px 8px;border-radius:3px;background:rgba(100,116,139,0.2);color:#94a3b8;font-family:monospace;font-size:9px;font-weight:700;">LATER</span>' : `
                ${mkPill("G", "DONE", item.status === "G", "#4ade80", "rgba(22,163,74,0.45)")}
                ${mkPill("Y", "WIP", item.status === "Y", "#fbbf24", "rgba(217,119,6,0.45)")}
                ${mkPill("R", "TODO", item.status === "R", "#f87171", "rgba(220,38,38,0.45)")}
                ${item.overrideStatus ? `<button type="button" class="cml-reset-item" data-item-id="${item.id}" style="padding:2px 5px;border-radius:3px;border:1px solid rgba(148,163,184,0.3);background:transparent;color:#94a3b8;font-family:monospace;font-size:8px;cursor:pointer;" title="Switch back to automatic live spacecraft check">AUTO</button>` : ""}
              `}
            </div>
          </div>
        `;
      }).join("");

      const assessorName = this._escapeHtml((cmlEval.notes && cmlEval.notes.assessorName) || "");
      const assessorNotes = this._escapeHtml((cmlEval.notes && cmlEval.notes.assessorNotes) || "");

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${[2, 3, 4, 5, 6].map((lvl) => {
              const s = cmlEval.levelsSummary[lvl];
              const active = lvl === cmlEval.targetCml;
              return `<button type="button" class="cml-target-lvl" data-lvl="${lvl}" style="padding:5px 8px;border-radius:4px;border:1px solid ${active ? "#fbbf24" : "rgba(148,163,184,0.22)"};background:${active ? "rgba(245,158,11,0.18)" : "rgba(15,23,42,0.75)"};color:${active ? "#fde68a" : "#cbd5e1"};font-family:monospace;font-size:9.5px;font-weight:700;cursor:pointer;">Stage ${lvl} (${s.percentGreen}%)</button>`;
            }).join("")}
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${cats.map((c) => `
              <button type="button" class="cml-cat-filter" data-cat="${c.id}" style="padding:4px 7px;border-radius:4px;border:1px solid ${filterCat === c.id ? "#38bdf8" : "rgba(148,163,184,0.2)"};background:${filterCat === c.id ? "rgba(56,189,248,0.16)" : "transparent"};color:${filterCat === c.id ? "#e0f2fe" : "#94a3b8"};font-family:monospace;font-size:8.5px;font-weight:700;cursor:pointer;">${c.label}</button>
            `).join("")}
          </div>
        </div>

        <div style="padding:8px 10px;border-radius:5px;background:rgba(8,13,24,0.85);border:1px solid rgba(148,163,184,0.2);margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-family:monospace;font-size:10px;color:#e2e8f0;margin-bottom:5px;flex-wrap:wrap;gap:6px;">
            <span><strong>${this._escapeHtml(target.meta.shortTitle)}</strong> · Checkpoint: ${this._escapeHtml(target.meta.competedGate)}</span>
            <span style="color:${barColor};font-weight:800;">${pct}% DONE (${target.greenCount}/${target.applicableCount} Done · ${target.yellowCount} WIP · ${target.redCount} To-Do · ${target.naCount} Later) · PASS LINE: ${target.thresholdMet ? (target.criticalGaps.length ? "80% MET (MUST-HAVES LEFT!)" : "PASSED >=80%") : "NEED 80%"}</span>
          </div>
          <div style="height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;position:relative;">
            <div style="height:100%;width:${pct}%;background:${barColor};transition:width 0.2s;"></div>
            <div style="position:absolute;left:80%;top:0;bottom:0;width:2px;background:#f8fafc;" title="NASA 80% Pass Line"></div>
          </div>
        </div>

        <div style="font-family:monospace;font-size:9px;color:#93c5fd;font-weight:700;margin-bottom:4px;">SAFETY BUFFERS — Extra room so surprises don't break your build (${this._escapeHtml(cmlEval.margins.footnote)})</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px;margin-bottom:10px;">
          ${marginStrip}
        </div>

        <div style="display:flex;flex-direction:column;gap:5px;max-height:255px;overflow-y:auto;padding-right:4px;margin-bottom:10px;">
          ${rowsHtml}
        </div>

        <div style="padding:8px 10px;border-radius:5px;background:rgba(30,41,59,0.65);border:1px solid ${cmlEval.assessorSignedOff ? "rgba(74,222,128,0.45)" : "rgba(251,191,36,0.4)"};display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="flex:1 1 260px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <input id="cml-input-assessor-name" type="text" maxlength="80" placeholder="Fresh-Eyes Reviewer name (teammate or Ground Control)" value="${assessorName}" style="padding:5px 7px;border-radius:4px;border:1px solid rgba(148,163,184,0.3);background:rgba(5,8,16,0.85);color:#f8fafc;font-family:monospace;font-size:10px;width:210px;" />
            <input id="cml-input-assessor-notes" type="text" maxlength="320" placeholder="~30-min outside feedback & sanity-check notes..." value="${assessorNotes}" style="padding:5px 7px;border-radius:4px;border:1px solid rgba(148,163,184,0.3);background:rgba(5,8,16,0.85);color:#f8fafc;font-family:monospace;font-size:10px;flex:1 1 180px;" />
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <button type="button" id="btn-cml-reset-overrides" style="padding:5px 8px;border-radius:4px;border:1px solid rgba(148,163,184,0.3);background:rgba(15,23,42,0.8);color:#cbd5e1;font-family:monospace;font-size:9px;cursor:pointer;">RESET EDITS (${cmlEval.overrideCount})</button>
            <button type="button" id="btn-cml-toggle-assessor" style="padding:6px 10px;border-radius:4px;border:1px solid ${cmlEval.assessorSignedOff ? "#4ade80" : "#fbbf24"};background:${cmlEval.assessorSignedOff ? "rgba(22,163,74,0.28)" : "rgba(245,158,11,0.2)"};color:${cmlEval.assessorSignedOff ? "#bbf7d0" : "#fde68a"};font-family:monospace;font-size:9.5px;font-weight:800;cursor:pointer;">
              ${cmlEval.assessorSignedOff ? "FRESH-EYES REVIEW PASSED" : "SIGN OFF FRESH-EYES REVIEW"}
            </button>
          </div>
        </div>
      `;
    }

    _renderCmlMatrixTab(cmlEval, matrixMode, focusColumn) {
      const catColor = Object.fromEntries(cmlEval.categories.map((c) => [c.id, c.color]));
      if (matrixMode === "grid") {
        const headerCols = [1, 2, 3, 4, 5, 6, 7].map((c) => {
          const isReached = c === cmlEval.reachedCml;
          const isTarget = c === cmlEval.targetCml;
          return `<th style="padding:6px;border:1px solid rgba(148,163,184,0.2);background:${isTarget ? "rgba(245,158,11,0.18)" : isReached ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.92)"};color:${isTarget ? "#fde68a" : "#93c5fd"};font-family:monospace;font-size:9px;min-width:165px;">STAGE ${c}${isTarget ? " (ACTIVE)" : isReached ? " (DONE)" : ""}</th>`;
        }).join("");

        const bodyRows = cmlEval.matrixRows.map((row) => `
          <tr>
            <td style="position:sticky;left:0;z-index:2;padding:6px 8px;border:1px solid rgba(148,163,184,0.22);background:#0b1120;color:#f1f5f9;font-size:10px;font-weight:700;min-width:170px;">
              <span style="color:${catColor[row.category] || "#93c5fd"};font-family:monospace;font-size:8.5px;display:block;">${(cmlEval.categories.find((c) => c.id === row.category)?.label || row.category).toUpperCase()}</span>
              ${this._escapeHtml(row.name)}
            </td>
            ${[1, 2, 3, 4, 5, 6, 7].map((c) => {
              const cellText = row.cells[c] || "—";
              const hl = c === cmlEval.targetCml ? "background:rgba(245,158,11,0.06);" : "";
              return `<td style="padding:6px;border:1px solid rgba(148,163,184,0.16);color:${cellText === "—" ? "#475569" : "#cbd5e1"};font-size:9.5px;vertical-align:top;${hl}">${this._escapeHtml(cellText)}</td>`;
            }).join("")}
          </tr>
        `).join("");

        return `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
            <span style="font-family:monospace;font-size:10px;color:#cbd5e1;">7-STAGE MISSION ROADMAP — Every team area from Quick Idea (Stage 1) to Early Build Blueprint (Stage 7)</span>
            <button type="button" class="cml-matrix-mode" data-mode="column" style="padding:4px 9px;border-radius:4px;border:1px solid #38bdf8;background:rgba(56,189,248,0.14);color:#e0f2fe;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">VIEW ONE STAGE AT A TIME</button>
          </div>
          <div style="overflow:auto;max-height:360px;border:1px solid rgba(148,163,184,0.22);border-radius:5px;">
            <table style="border-collapse:collapse;width:100%;text-align:left;">
              <thead><tr><th style="position:sticky;left:0;z-index:3;padding:6px 8px;border:1px solid rgba(148,163,184,0.22);background:#0f172a;color:#e2e8f0;font-family:monospace;font-size:9px;">MISSION TOPIC (24 AREAS)</th>${headerCols}</tr></thead>
              <tbody>${bodyRows}</tbody>
            </table>
          </div>
        `;
      }

      const colMeta = cmlEval.levels.find((l) => l.level === focusColumn) || cmlEval.levels[3];
      const rowsByCat = cmlEval.categories.map((cat) => {
        const rows = cmlEval.matrixRows.filter((r) => r.category === cat.id);
        return `
          <div style="margin-bottom:8px;">
            <div style="font-family:monospace;font-size:9.5px;font-weight:800;color:${cat.color};letter-spacing:0.8px;margin-bottom:4px;">${cat.label.toUpperCase()} (${rows.length})</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:6px;">
              ${rows.map((r) => `
                <div style="padding:6px 8px;border-radius:4px;background:rgba(15,23,42,0.72);border:1px solid rgba(148,163,184,0.18);">
                  <div style="font-family:monospace;font-size:9.5px;font-weight:700;color:#e2e8f0;">${this._escapeHtml(r.name)}</div>
                  <div style="font-size:10px;color:${r.cells[focusColumn] === "—" ? "#64748b" : "#cbd5e1"};margin-top:2px;">${this._escapeHtml(r.cells[focusColumn] || "—")}</div>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }).join("");

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${[1, 2, 3, 4, 5, 6, 7].map((c) => `
              <button type="button" class="cml-matrix-col" data-col="${c}" style="padding:4px 8px;border-radius:4px;border:1px solid ${focusColumn === c ? "#fbbf24" : "rgba(148,163,184,0.22)"};background:${focusColumn === c ? "rgba(245,158,11,0.18)" : "rgba(15,23,42,0.75)"};color:${focusColumn === c ? "#fde68a" : "#cbd5e1"};font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">Stage ${c}</button>
            `).join("")}
          </div>
          <button type="button" class="cml-matrix-mode" data-mode="grid" style="padding:4px 9px;border-radius:4px;border:1px solid #38bdf8;background:rgba(56,189,248,0.14);color:#e0f2fe;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">VIEW FULL 7-STAGE TABLE</button>
        </div>
        <div style="padding:7px 9px;border-radius:4px;background:rgba(37,99,235,0.12);border:1px solid rgba(59,130,246,0.35);margin-bottom:8px;font-size:10.5px;color:#dbeafe;">
          <strong>${this._escapeHtml(colMeta.shortTitle)}</strong> (${this._escapeHtml(colMeta.phase)}) — Checkpoint: ${this._escapeHtml(colMeta.competedGate)} | Review: ${this._escapeHtml(colMeta.assignedGate)}
        </div>
        <div style="max-height:330px;overflow-y:auto;padding-right:4px;">
          ${rowsByCat}
        </div>
      `;
    }

    _renderCmlSpineTab(cmlEval) {
      const notes = cmlEval.notes || {};
      const spineCards = cmlEval.levels.map((lvl) => {
        const reached = lvl.level <= cmlEval.reachedCml;
        const loopTag = lvl.feedbackLoopGroup === "trade-loop" ? '<span style="color:#fbbf24;font-family:monospace;font-size:8px;font-weight:700;">COMPARE &amp; LOOP (2-4)</span>' : "";
        return `
          <div style="padding:7px 9px;border-radius:5px;background:${reached ? "rgba(37,99,235,0.16)" : "rgba(15,23,42,0.7)"};border:1px solid ${reached ? "rgba(59,130,246,0.55)" : "rgba(148,163,184,0.18)"};">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
              <span style="font-family:monospace;font-size:10px;font-weight:800;color:${reached ? "#93c5fd" : "#e2e8f0"};">${this._escapeHtml(lvl.shortTitle)}</span>
              ${loopTag}
            </div>
            <div style="font-family:monospace;font-size:8.5px;color:#94a3b8;margin-top:2px;">${this._escapeHtml(lvl.phase)} · ${this._escapeHtml(lvl.teamContext)}</div>
            <div style="font-size:9.5px;color:#cbd5e1;margin-top:3px;">${this._escapeHtml(lvl.summary)}</div>
            <div style="font-family:monospace;font-size:8.5px;color:#a5f3fc;margin-top:3px;">Pitch Milestone: ${this._escapeHtml(lvl.competedGate)} | Review: ${this._escapeHtml(lvl.assignedGate)}</div>
          </div>
        `;
      }).join("");

      const field = (key, label, placeholder) => `
        <label style="display:flex;flex-direction:column;gap:2px;font-family:monospace;font-size:8.5px;color:#93c5fd;">
          <span>${this._escapeHtml(label)}</span>
          <input type="text" class="cml-note-field" data-note-key="${key}" value="${this._escapeHtml(notes[key] || "")}" placeholder="${this._escapeHtml(placeholder)}" style="padding:5px 7px;border-radius:4px;border:1px solid rgba(148,163,184,0.28);background:rgba(5,8,16,0.85);color:#f8fafc;font-family:monospace;font-size:10px;" />
        </label>
      `;

      const caveatsHtml = cmlEval.caveatsStatus.map((cav) => `
        <div style="padding:6px 8px;border-radius:4px;background:rgba(15,23,42,0.75);border-left:3px solid ${cav.flagged ? "#fbbf24" : "#4ade80"};">
          <div style="display:flex;justify-content:space-between;font-family:monospace;font-size:9.5px;font-weight:700;color:#f1f5f9;">
            <span>${this._escapeHtml(cav.title)}</span>
            <span style="color:${cav.flagged ? "#fde68a" : "#86efac"};">${cav.flagged ? "WATCH" : "GOOD"}</span>
          </div>
          <div style="font-size:9.5px;color:#cbd5e1;margin-top:2px;">${this._escapeHtml(cav.liveNote)}</div>
        </div>
      `).join("");

      return `
        <div style="max-height:385px;overflow-y:auto;padding-right:4px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px;margin-bottom:10px;">
            ${spineCards}
          </div>
          <div style="padding:9px 10px;border-radius:5px;background:rgba(8,13,24,0.85);border:1px solid rgba(103,232,249,0.25);margin-bottom:10px;">
            <div style="font-family:monospace;font-size:9.5px;font-weight:800;color:#67e8f9;margin-bottom:6px;">MISSION IDEA &amp; TEAM NOTES (Helps finish planning items in Stages 1-6)</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:7px;">
              ${field("stmSummary", "Main Science Goal & Target Metrics (Q #1)", "e.g. Map water ice in Moon craters -> crisp 50m photos")}
              ${field("heritageSource", "Similar Past Mission / Reused Parts (Q #2)", "e.g. Based on Lunar Reconnaissance Orbiter flight parts")}
              ${field("launchWindow", "Target Launch Dates (Q #3)", "e.g. Nov 2027 (21-day launch window)")}
              ${field("launchWindowDays", "Launch Window Length (Days >= 20)", "20")}
              ${field("costClass", "Target Budget Tier (Q #4)", "e.g. Medium Discovery class ($350M max cap)")}
              ${field("backupLv", "Backup Rocket (if #1 has delays)", "e.g. Vulcan Centaur / Ariane 64")}
              ${field("partnerMode", "Team & Suppliers (Build vs. Buy)", "e.g. Build main bus in-house, buy solar arrays & sensors")}
              ${field("descopeOptions", "Backup Plan: What Can We Trim?", "e.g. Drop 1 secondary sensor to save 18 kg & $20M")}
              ${field("trlFallback", "New Tech Readiness & Plan-B", "e.g. If cold camera lags, swap in proven warmer sensor")}
              ${field("wbsSummary", "Work Breakdown (Science / Craft / Ground)", "e.g. Divided into Science, Spacecraft, Sensors, Dishes")}
              ${field("vnvSummary", "Earth Test Plan & Test Rigs", "e.g. Lab electronics bench test + 24 flight computer modes")}
              ${field("nepaSummary", "Environmental & Debris Safety Check", "e.g. Solar powered (non-nuclear); clean Earth de-orbit")}
              ${field("scheduleMarginNote", "Extra Buffer Time Built Into Schedule", "e.g. 6.5 extra spare months before launch deadline")}
              ${field("costModelValidation", "2nd Independent Budget Sanity Check", "e.g. Checked with 2 cost models — within 8% of each other")}
              ${field("swMarginPct", "Flight Computer Spare Capacity % (>=100%)", "110")}
            </div>
          </div>
          <div style="padding:8px 10px;border-radius:5px;background:rgba(15,23,42,0.7);border:1px solid rgba(251,191,36,0.28);">
            <div style="font-family:monospace;font-size:9.5px;font-weight:800;color:#fde68a;margin-bottom:5px;">HOW COMPLEX IS THIS MISSION? ${this._escapeHtml(cmlEval.complexity.tier)} (${cmlEval.complexity.score}/5) &amp; 3 GOLDEN RULES</div>
            <div style="font-size:9.5px;color:#cbd5e1;margin-bottom:6px;">${this._escapeHtml(cmlEval.complexity.advisory)}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px;">
              ${caveatsHtml}
            </div>
          </div>
        </div>
      `;
    }

    _renderCmlRiskTab(cmlEval) {
      const r5 = cmlEval.risk5x5;
      const cellBg = (l, c) => {
        const s = l * c;
        if (s >= 15 || (l >= 4 && c >= 3) || (c === 5 && l >= 3)) return "rgba(220,38,38,0.34)";
        if (s >= 6) return "rgba(217,119,6,0.28)";
        return "rgba(22,163,74,0.25)";
      };
      const idxMap = new Map();
      r5.risks.forEach((r, idx) => idxMap.set(r.id, idx + 1));

      const gridRows = [5, 4, 3, 2, 1].map((l) => `
        <tr>
          <td style="padding:4px 6px;border:1px solid rgba(148,163,184,0.2);font-family:monospace;font-size:9px;color:#94a3b8;font-weight:700;" title="Likelihood ${l} out of 5">L${l}</td>
          ${[1, 2, 3, 4, 5].map((c) => {
            const list = r5.cells[`${l}x${c}`] || [];
            const chips = list.map((r) => `<span title="${this._escapeHtml(r.title)}" style="display:inline-block;padding:1px 4px;margin:1px;border-radius:3px;background:#0f172a;border:1px solid rgba(255,255,255,0.45);color:#f8fafc;font-family:monospace;font-size:8.5px;font-weight:800;">#${idxMap.get(r.id)}</span>`).join("");
            return `<td style="width:52px;height:36px;text-align:center;vertical-align:middle;border:1px solid rgba(148,163,184,0.22);background:${cellBg(l, c)};">${chips}</td>`;
          }).join("")}
        </tr>
      `).join("");

      const registerRows = r5.risks.map((r, idx) => {
        const col = r.severity === "HIGH" ? "#fca5a5" : r.severity === "MED" ? "#fde68a" : "#86efac";
        return `
          <div style="padding:6px 8px;border-radius:4px;background:rgba(15,23,42,0.75);border-left:3px solid ${col};">
            <div style="display:flex;justify-content:space-between;font-family:monospace;font-size:9.5px;color:#f1f5f9;font-weight:700;">
              <span>#${idx + 1} ${this._escapeHtml(r.title)}</span>
              <span style="color:${col};">Likely ${r.likelihood}/5 · Impact ${r.consequence}/5 (${r.severity})</span>
            </div>
            <div style="font-size:9.5px;color:#cbd5e1;margin-top:2px;">How to fix (${this._escapeHtml(r.owner)}): ${this._escapeHtml(r.mitigation)}</div>
          </div>
        `;
      }).join("");

      return `
        <div style="display:grid;grid-template-columns:minmax(270px,auto) 1fr;gap:12px;align-items:start;">
          <div>
            <div style="font-family:monospace;font-size:9.5px;font-weight:700;color:#93c5fd;margin-bottom:2px;">5x5 RISK MAP (${r5.highCount} High · ${r5.medCount} Med · ${r5.lowCount} Low)</div>
            <div style="font-family:monospace;font-size:8.5px;color:#94a3b8;margin-bottom:5px;">Rows = How Likely (L1 Rare to L5 Likely) · Cols = How Serious (I1 Tiny to I5 Loss)</div>
            <table style="border-collapse:collapse;">
              <tbody>
                ${gridRows}
                <tr>
                  <td></td>
                  ${[1, 2, 3, 4, 5].map((c) => `<td style="text-align:center;padding:3px;font-family:monospace;font-size:9px;color:#94a3b8;font-weight:700;" title="Impact ${c} out of 5">I${c}</td>`).join("")}
                </tr>
              </tbody>
            </table>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;max-height:260px;overflow-y:auto;padding-right:4px;">
            ${registerRows}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);">
          <button type="button" id="btn-cml-export-json" style="padding:7px 11px;border-radius:4px;border:1px solid rgba(56,189,248,0.5);background:rgba(56,189,248,0.14);color:#e0f2fe;font-family:monospace;font-size:9.5px;font-weight:700;cursor:pointer;">DOWNLOAD SUMMARY (.JSON)</button>
          <button type="button" id="btn-cml-export-md" style="padding:7px 11px;border-radius:4px;border:1px solid rgba(167,139,250,0.5);background:rgba(167,139,250,0.14);color:#ddd6fe;font-family:monospace;font-size:9.5px;font-weight:700;cursor:pointer;">DOWNLOAD READABLE REPORT (.MD)</button>
          <button type="button" id="btn-cml-export-full-mdl" style="padding:7px 11px;border-radius:4px;border:1px solid rgba(74,222,128,0.5);background:rgba(74,222,128,0.14);color:#bbf7d0;font-family:monospace;font-size:9.5px;font-weight:700;cursor:pointer;">DOWNLOAD FULL BLUEPRINT (.JSON)</button>
        </div>
      `;
    }

    openCmlWorkbench(initialTab = "checklist", options = {}) {
      if (!window.CMLFramework) {
        this.showToast("Mission Readiness Guide is still loading.");
        return;
      }
      this._runCleanup();
      const returnTask = options.returnTask || null;
      const assessorFocus = Boolean(options.assessorMode);
      const cmlTask = {
        id: "cml_workbench",
        kind: "cml-workbench",
        isCmlWorkbench: true,
        isPreFlightMdl: true,
        name: "Mission Readiness Guide (Stages 1-9)",
        location: assessorFocus ? "LAUNCH CONTROL // FRESH-EYES REVIEW" : "DESIGN STUDIO // READINESS STAGES",
        role: "all",
        completed: false
      };
      this.activeTask = cmlTask;

      const modal = document.getElementById("task-modal-overlay");
      const title = document.getElementById("task-modal-title");
      const body = document.getElementById("task-modal-content");
      if (!modal || !title || !body) return;

      if (options.targetCml >= 2 && options.targetCml <= 6) {
        this.cmlState.targetCml = options.targetCml;
      }

      let activeTab = initialTab || "checklist";
      let filterCat = "all";
      let matrixMode = "column";
      let focusColumn = Number(options.focusColumn) || this.cmlState.targetCml || 4;

      title.textContent = assessorFocus
        ? "FRESH-EYES MISSION REVIEW (GET AN OUTSIDE CHECK)"
        : "MISSION READINESS GUIDE (9 STAGES FROM IDEA TO LAUNCH)";
      modal.style.display = "flex";
      if (window.spaceAudio) window.spaceAudio.playClick();

      const renderCml = () => {
        const t = this.evaluateMissionDesign();
        const cmlEval = t.cml;
        const mkTab = (id, label) => `
          <button type="button" class="cml-wb-tab" data-tab="${id}" style="padding:6px 10px;border-radius:5px;border:1px solid ${activeTab === id ? "#fbbf24" : "rgba(255,255,255,0.14)"};background:${activeTab === id ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.03)"};color:${activeTab === id ? "#fde68a" : "#94a3b8"};font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">${label}</button>
        `;

        const alertsHtml = cmlEval.feedbackAlerts.map((a) => {
          const bd = a.severity === "ALERT" ? "rgba(239,68,68,0.5)" : "rgba(251,191,36,0.45)";
          const bg = a.severity === "ALERT" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.1)";
          return `<div style="padding:5px 8px;border-radius:4px;border:1px solid ${bd};background:${bg};font-size:10px;color:#f8fafc;"><strong>${this._escapeHtml(a.title)}:</strong> ${this._escapeHtml(a.detail)}</div>`;
        }).join("");

        let tabBody = "";
        if (activeTab === "checklist") tabBody = this._renderCmlChecklistTab(cmlEval, filterCat);
        else if (activeTab === "matrix") tabBody = this._renderCmlMatrixTab(cmlEval, matrixMode, focusColumn);
        else if (activeTab === "spine") tabBody = this._renderCmlSpineTab(cmlEval);
        else tabBody = this._renderCmlRiskTab(cmlEval);

        body.innerHTML = `
          <div style="padding:9px 11px;border-radius:5px;background:rgba(8,13,24,0.88);border:1px solid rgba(56,189,248,0.3);margin-bottom:9px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
              <div>
                <div style="font-family:monospace;font-size:10.5px;font-weight:800;color:#7dd3fc;">NOW AT: ${this._escapeHtml(cmlEval.reachedTitle.toUpperCase())} · VERIFIED: STAGE ${cmlEval.certifiedCml} · SCORE ${t.overallScore}/100</div>
                <div style="font-family:monospace;font-size:9px;color:#94a3b8;margin-top:2px;">${this._escapeHtml(cmlEval.reachedPhase)} · Complexity: ${this._escapeHtml(cmlEval.complexity.tier)} (${cmlEval.complexity.score}/5) · Mission: ${this._escapeHtml(t.scenario.name)}</div>
                <div style="font-size:10px;color:#cbd5e1;margin-top:4px;">How it works: NASA grows missions from <strong>Stage 1</strong> (quick idea sketch) to <strong>Stage 9</strong> (ready to build hardware). Reach <strong>80% Done</strong> plus all <strong>Must-Have</strong> items to advance!</div>
              </div>
              <div style="display:flex;gap:5px;flex-wrap:wrap;">
                ${returnTask ? `<button type="button" id="btn-cml-return" style="padding:4px 8px;border-radius:4px;border:1px solid rgba(148,163,184,0.35);background:rgba(15,23,42,0.85);color:#e2e8f0;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">← BACK</button>` : ""}
                <button type="button" id="btn-cml-mdl-desk" style="padding:4px 8px;border-radius:4px;border:1px solid rgba(103,232,249,0.45);background:rgba(103,232,249,0.12);color:#a5f3fc;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">DESIGN DESK</button>
                <button type="button" id="btn-cml-sync-all" style="padding:4px 9px;border-radius:4px;border:1px solid #4ade80;background:rgba(22,163,74,0.25);color:#bbf7d0;font-family:monospace;font-size:9px;font-weight:800;cursor:pointer;">SAVE TO CREW</button>
              </div>
            </div>
            ${alertsHtml ? `<div style="display:flex;flex-direction:column;gap:4px;margin-top:7px;">${alertsHtml}</div>` : ""}
          </div>

          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px;">
            ${mkTab("checklist", `1. STAGE ${cmlEval.targetCml} CHECKLIST (${cmlEval.activeSummary.percentGreen}%)`)}
            ${mkTab("matrix", "2. 7-STAGE ROADMAP (24 TOPICS)")}
            ${mkTab("spine", "3. 9-STAGE JOURNEY & NOTES")}
            ${mkTab("risk", `4. RISK MAP (${cmlEval.risk5x5.highCount} HIGH) & DOWNLOAD`)}
          </div>

          ${tabBody}
        `;

        // Bind tab navigation
        body.querySelectorAll(".cml-wb-tab").forEach((b) => {
          b.addEventListener("click", () => { activeTab = b.dataset.tab; renderCml(); });
        });

        const btnReturn = body.querySelector("#btn-cml-return");
        if (btnReturn && returnTask) {
          btnReturn.addEventListener("click", () => {
            if (returnTask.id === "preflight_mdl") this.openPreFlightMdlDesk("bus");
            else this.openTaskModal(returnTask);
          });
        }
        const btnMdl = body.querySelector("#btn-cml-mdl-desk");
        if (btnMdl) btnMdl.addEventListener("click", () => this.openPreFlightMdlDesk("bus"));
        const btnSync = body.querySelector("#btn-cml-sync-all");
        if (btnSync) {
          btnSync.addEventListener("click", () => {
            this.syncCmlStateToNetwork();
            this._renderResourceMeters();
            this.showToast("Mission Readiness progress saved & shared with crew.");
          });
        }

        // Bind checklist tab events
        body.querySelectorAll(".cml-target-lvl").forEach((b) => {
          b.addEventListener("click", () => {
            this.cmlState.targetCml = Number.parseInt(b.dataset.lvl, 10) || 4;
            this.syncCmlStateToNetwork();
            this._renderResourceMeters();
            renderCml();
          });
        });
        body.querySelectorAll(".cml-cat-filter").forEach((b) => {
          b.addEventListener("click", () => { filterCat = b.dataset.cat || "all"; renderCml(); });
        });
        body.querySelectorAll(".cml-toggle-status").forEach((b) => {
          b.addEventListener("click", () => {
            this.cmlState.overrides[b.dataset.itemId] = b.dataset.status;
            this.syncCmlStateToNetwork();
            this._renderResourceMeters();
            renderCml();
          });
        });
        body.querySelectorAll(".cml-reset-item").forEach((b) => {
          b.addEventListener("click", () => {
            delete this.cmlState.overrides[b.dataset.itemId];
            this.syncCmlStateToNetwork();
            this._renderResourceMeters();
            renderCml();
          });
        });
        body.querySelectorAll(".cml-jump-console").forEach((b) => {
          b.addEventListener("click", () => this._jumpFromCmlToConsole(b.dataset.console));
        });

        const btnResetAll = body.querySelector("#btn-cml-reset-overrides");
        if (btnResetAll) {
          btnResetAll.addEventListener("click", () => {
            this.cmlState.overrides = {};
            this.syncCmlStateToNetwork();
            this._renderResourceMeters();
            renderCml();
          });
        }

        const inAssessorName = body.querySelector("#cml-input-assessor-name");
        const inAssessorNotes = body.querySelector("#cml-input-assessor-notes");
        const syncAssessorInputs = () => {
          if (inAssessorName) this.cmlState.notes.assessorName = inAssessorName.value;
          if (inAssessorNotes) this.cmlState.notes.assessorNotes = inAssessorNotes.value;
        };
        if (inAssessorName) inAssessorName.addEventListener("change", () => { syncAssessorInputs(); this.syncCmlStateToNetwork(); });
        if (inAssessorNotes) inAssessorNotes.addEventListener("change", () => { syncAssessorInputs(); this.syncCmlStateToNetwork(); });

        const btnAssessorToggle = body.querySelector("#btn-cml-toggle-assessor");
        if (btnAssessorToggle) {
          btnAssessorToggle.addEventListener("click", () => {
            syncAssessorInputs();
            this.cmlState.assessorSignedOff = !this.cmlState.assessorSignedOff;
            this.syncCmlStateToNetwork();
            this._renderResourceMeters();
            renderCml();
          });
        }

        // Bind matrix tab events
        body.querySelectorAll(".cml-matrix-mode").forEach((b) => {
          b.addEventListener("click", () => { matrixMode = b.dataset.mode; renderCml(); });
        });
        body.querySelectorAll(".cml-matrix-col").forEach((b) => {
          b.addEventListener("click", () => { focusColumn = Number.parseInt(b.dataset.col, 10) || 4; renderCml(); });
        });

        // Bind programmatic note inputs on Spine tab
        body.querySelectorAll(".cml-note-field").forEach((inp) => {
          inp.addEventListener("change", () => {
            const key = inp.dataset.noteKey;
            if (!key) return;
            const val = inp.value.trim();
            if (val) this.cmlState.notes[key] = val;
            else delete this.cmlState.notes[key];
            this.syncCmlStateToNetwork();
            this._renderResourceMeters();
            renderCml();
          });
        });

        // Bind exports on Risk tab
        const bJson = body.querySelector("#btn-cml-export-json");
        const bMd = body.querySelector("#btn-cml-export-md");
        const bFull = body.querySelector("#btn-cml-export-full-mdl");
        if (bJson) bJson.addEventListener("click", () => this.exportCmlReport("json"));
        if (bMd) bMd.addEventListener("click", () => this.exportCmlReport("md"));
        if (bFull) bFull.addEventListener("click", () => this.exportMdlPointDesignJson());
      };

      renderCml();
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
          this.showToast(`[VERIFIED] ${data.playerName}: ${data.taskName}`);
        }
      });

      window.netManager.on("objective_locked", (data) => {
        const mission = (data && data.mission) || this.getMissionState();
        if (data && data.reason === "station_phase") {
          this.showToast("THIS CONSOLE IS AVAILABLE INSIDE THE STATION · FOLLOW THE BOARDING MARKERS AND LAUNCH FIRST");
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
        this.showToast(`[LOCKED] OBJECTIVE LOCKED — COMPLETE ${names.join(" + ") || "PRIOR OBJECTIVES"} FIRST`);
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
        toggleChecklist.addEventListener("click", () => {
          checklistPanel.classList.toggle("collapsed");
          if (window.spaceAudio) window.spaceAudio.playClick();
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
        if (window.solarSystem && window.solarSystem.isActive) return;
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
        if (closest) {
          const assign = this._getRoleAssignment(closest.role);
          const tag = assign.isMine ? `[ASSIGNED · ${assign.badgeText}]` : `[${assign.badgeText}]`;
          btnUse.style.display = "flex";
          labelUse.textContent = `[E] ${tag} ${closest.completed ? "REVIEW " : ""}${closest.name.toUpperCase()}`;
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
        this.showToast("THIS CONSOLE IS AVAILABLE INSIDE THE STATION · FOLLOW THE BOARDING MARKERS AND LAUNCH FIRST");
        if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
        return;
      }
      if (!isCompleted && !this.isTaskAvailable(task.id, mission)) {
        this.showToast(`[LOCKED] ${this.getTaskLockReason(task.id, mission) || "COMPLETE THE PRIOR OBJECTIVE FIRST"}`);
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
      title.textContent = `${task.location} · [${assign.badgeText}] · ${task.name.toUpperCase()}`;
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

        const scenarioCards = Object.values(MISSION_SCENARIOS)
          .map((sc) => {
            const active = md.scenarioId === sc.id;
            return `
              <div class="md-scenario-card" data-id="${sc.id}" style="padding:12px;border-radius:8px;border:1px solid ${active ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(103,232,249,0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;transition:all 0.15s;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                  <span style="font-family:monospace;font-size:9px;font-weight:700;color:#67e8f9;letter-spacing:1px;">${sc.badge}</span>
                  <span style="font-family:monospace;font-size:10px;font-weight:700;color:#d0a15c;">Cap: $${Math.round(sc.baseBudgetM * t.difficulty.budgetMultiplier)}M · ${sc.targetLifetimeMonths} mo</span>
                </div>
                <div style="font-size:13px;font-weight:700;color:#ece7dc;margin-bottom:4px;">${sc.name}</div>
                <div style="font-size:11px;color:#94a3b8;line-height:1.45;margin-bottom:6px;">${sc.summary}</div>
                <div style="font-family:monospace;font-size:9.5px;color:#7fb8a6;">
                  ${
                    sc.isBioPayload
                      ? "Goals: Yeast Beta-Carotene ≥3µg/mL · ≥12 Reps · <250g · <300mL · MELFI -80°C"
                      : `Priority Sensors: ${sc.requiredScienceTypes.map((x) => x.toUpperCase()).join(" · ")} | Min ΔV: ${sc.minDeltaV} m/s`
                  }
                </div>
              </div>
            `;
          })
          .join("");

        const diffBtns = Object.values(DIFFICULTY_LEVELS)
          .map((d) => {
            const active = md.difficultyId === d.id;
            return `
              <button type="button" class="md-diff-btn" data-id="${d.id}" style="flex:1;min-width:160px;padding:9px 10px;border-radius:6px;border:1px solid ${active ? "#d0a15c" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(208,161,92,0.14)" : "rgba(255,255,255,0.03)"};color:#ece7dc;text-align:left;cursor:pointer;">
                <div style="font-family:monospace;font-size:10px;font-weight:700;color:${active ? "#fde047" : "#ece7dc"};">${d.name}</div>
                <div style="font-size:10px;color:#94a3b8;margin-top:2px;line-height:1.35;">${d.desc}</div>
              </button>
            `;
          })
          .join("");

        let specializationHtml = "";
        if (t.scenario.requiresWavelength) {
          specializationHtml = `
            <div style="margin-bottom:12px;">
              <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#c4b5fd;margin-bottom:6px;">
                STEP 1C · TELESCOPE OBSERVING WAVELENGTH (CONSTRAINS OPTICS, ORBIT & CRYO THERMAL)
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">
                ${Object.values(WAVELENGTH_BANDS).map((wb) => {
                  const active = md.wavelengthId === wb.id;
                  return `
                    <div class="md-wave-card" data-id="${wb.id}" style="padding:10px;border-radius:7px;border:1px solid ${active ? "#c084fc" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(192,132,252,0.14)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                      <div style="font-size:11.5px;font-weight:700;color:#ece7dc;">${wb.name}</div>
                      <div style="font-size:10px;color:#94a3b8;margin-top:3px;line-height:1.35;">${wb.explain}</div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
          `;
        } else if (t.scenario.isCubesat) {
          specializationHtml = `
            <div style="margin-bottom:12px;">
              <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#67e8f9;margin-bottom:6px;">
                STEP 1C · NASA CSLI CUBESAT FORM FACTOR (CONSTRAINS MASS, VOLUME & POWER)
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">
                ${Object.values(CUBESAT_FORMS).map((cf) => {
                  const active = md.cubesatFormId === cf.id;
                  return `
                    <div class="md-csform-card" data-id="${cf.id}" style="padding:10px;border-radius:7px;border:1px solid ${active ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(103,232,249,0.14)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                      <div style="font-size:11.5px;font-weight:700;color:#ece7dc;">${cf.name}</div>
                      <div style="font-family:monospace;font-size:9.5px;color:#7fb8a6;margin:3px 0;">Max Mass: ${cf.maxMassKg} kg · Max Bays: ${cf.maxInst}</div>
                      <div style="font-size:10px;color:#94a3b8;line-height:1.35;">${cf.explain}</div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
          `;
        } else if (t.scenario.isBioPayload) {
          specializationHtml = `
            <div style="margin-bottom:12px;">
              <div style="padding:10px 12px;border-radius:7px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.32);margin-bottom:9px;font-size:10.5px;color:#e2e8f0;line-height:1.45;">
                <div style="font-family:monospace;font-size:9.5px;font-weight:700;color:#fbbf24;margin-bottom:4px;">
                  NASA ACCESS TO SPACE CONOPS · BIONUTRIENTS-2 NEED, GOALS &amp; 4 SEGMENTS
                </div>
                <div><strong>Need:</strong> Rapid, safe &amp; reliable in-place production of dietary nutrients using minimal mass, power &amp; volume for long-duration missions.</div>
                <div style="margin-top:3px;"><strong>Goals:</strong> (1) Enable yeast growth · (2) Produce beta-carotene on ISS · (3) Slash mass (&lt;250g) &amp; volume (&lt;300mL) vs BioNutrients-1.</div>
                <div style="margin-top:4px;font-family:monospace;font-size:9px;color:#93c5fd;">
                  LAUNCH (NG-18 Ambient Foil Kit) -> SPACE (PWD Hydration -> Syringe/Filter -> Shake -> Incubate + 6h Shake -> MELFI -80°C) -> GROUND (Live Console) -> USER (Thaw -> Wash -> Centrifuge -> Analyze)
                </div>
              </div>
              <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#fbbf24;margin-bottom:6px;">
                STEP 1C · SELECT TARGET ORGANISM &amp; BIOPRODUCTION PROFILE (SLIDES 12 &amp; 21)
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">
                ${Object.values(BIO_ORGANISM_OPTIONS).map((org) => {
                  const active = md.bioOrganismId === org.id;
                  return `
                    <div class="md-bioorg-card" data-id="${org.id}" style="padding:10px;border-radius:7px;border:1px solid ${active ? "#fbbf24" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(245,158,11,0.14)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                        <span style="font-size:11.5px;font-weight:700;color:#ece7dc;">${org.name}</span>
                        ${org.goalAligned ? `<span style="font-family:monospace;font-size:8px;padding:2px 5px;border-radius:3px;background:rgba(74,222,128,0.18);color:#86efac;font-weight:700;">PRIMARY GOAL</span>` : ""}
                      </div>
                      <div style="font-family:monospace;font-size:9.5px;color:#fcd34d;margin:3px 0;">Incubate: ${org.targetTempC}°C · 6h Shake: ${org.requiresSixHourShake ? "MANDATORY" : "No"} · Base Yield: ${org.baseBetaCaroteneUgMl} µg/mL</div>
                      <div style="font-size:10px;color:#94a3b8;line-height:1.35;">${org.explain}</div>
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
              <span style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9aa4ae;">
                STEP 1A · SELECT PRIMARY MISSION OBJECTIVE & SCENARIO
              </span>
              <button type="button" id="btn-arch-apply-rec" style="padding:4px 9px;border-radius:5px;border:1px solid rgba(74,222,128,0.45);background:rgba(74,222,128,0.12);color:#86efac;font-family:monospace;font-size:9.5px;font-weight:700;cursor:pointer;">
                APPLY RECOMMENDED BASELINE FOR ${t.scenario.code}
              </button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px;">
              ${scenarioCards}
            </div>
          </div>

          ${specializationHtml}

          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9aa4ae;margin-bottom:6px;">
              STEP 1B · ENGINEERING CONSTRAINTS & DIFFICULTY TIER
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${diffBtns}
            </div>
          </div>

          <div style="padding:10px 12px;border-radius:4px;background:rgba(8,13,24,0.78);border:1px solid rgba(148,163,184,0.22);margin-bottom:14px;">
            <div style="font-family:var(--font-mono,monospace);font-size:10px;font-weight:700;letter-spacing:1.3px;color:#93c5fd;margin-bottom:6px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">
              <span>6-ROLE GROUND &amp; FLIGHT DUTY ROSTER</span>
              <span style="color:#94a3b8;font-weight:500;">Assigned randomly · Trade seats via Crew Roster [SWAP]</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;font-size:10.5px;color:#cbd5e1;margin-top:6px;">
              ${(["flight_director", "ground_capcom", "commander", "engineer", "scientist", "specialist"]).map((rId) => {
                const a = this._getRoleAssignment(rId);
                const dutiesMap = {
                  flight_director: "KSC LCC · GO/NO-GO Launch Release & Docking Corridor Clearance",
                  ground_capcom: "KSC LCC · DSN Telemetry Lock, EPS Route & Science Downlink",
                  commander: "Flight Crew · Pad Launch Auth [L], Docking Pilot & Station Command",
                  engineer: "Flight Crew · Pad Access Arm [F], RCS [1/2] & Power/Propulsion",
                  scientist: "Flight Crew · Docking Boresight [3/4], Payload Lab & Thermal ECLSS",
                  specialist: "Flight Crew · Orbital EVA Support & Cross-Console Contingency Ops"
                };
                return `
                  <div style="padding:8px 10px;border-radius:4px;border:1px solid ${a.isMine ? "#2563eb" : "rgba(148,163,184,0.2)"};background:${a.isMine ? "rgba(37,99,235,0.14)" : "rgba(5,8,16,0.55)"};display:flex;flex-direction:column;gap:4px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                      <strong style="color:${a.color};">[${a.short}] ${this._escapeHtml(a.label)}</strong>
                      <span style="font-family:var(--font-mono,monospace);font-size:9px;color:${a.isUnstaffed ? "#94a3b8" : "#86efac"};">${this._escapeHtml(a.namesText)}${a.isMine ? " (YOU)" : ""}</span>
                    </div>
                    <div style="font-size:10px;color:#94a3b8;line-height:1.35;">${dutiesMap[rId] || "Cross-mission support"}</div>
                  </div>
                `;
              }).join("")}
            </div>
            <div style="font-size:11px;color:#cbd5e1;margin-top:8px;padding-top:6px;border-top:1px solid rgba(148,163,184,0.16);">
              <strong style="color:#93c5fd;">Engineering Insight:</strong> ${t.scenario.tradeoffTip}
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <span style="font-family:var(--font-mono,monospace);font-size:10px;color:#94a3b8;">
              Active Objective: <strong style="color:#f8fafc;">${t.scenario.code}</strong> · Budget Cap: <strong style="color:#86efac;">$${t.budgetCapM}M</strong>
            </span>
            <button type="button" id="btn-commit-arch" style="padding:9px 18px;border-radius:4px;border:1px solid #f8fafc;background:#f8fafc;color:#050810;font-family:var(--font-mono,monospace);font-size:11px;font-weight:700;letter-spacing:1.3px;cursor:pointer;">
              LOCK MISSION CHARTER &amp; CONTINUE
            </button>
          </div>
        `;

        container.querySelectorAll(".md-scenario-card").forEach((card) => {
          card.addEventListener("click", () => {
            const nextId = card.dataset.id;
            const changed = this.missionDesign.scenarioId !== nextId;
            this.missionDesign.scenarioId = nextId;
            if (changed && nextId === "bionutrients_2") {
              this.applyRecommendedScenarioBaseline(nextId);
            } else {
              this._renderResourceMeters();
            }
            if (window.spaceAudio) window.spaceAudio.playClick();
            render();
          });
        });

        container.querySelectorAll(".md-bioorg-card").forEach((card) => {
          card.addEventListener("click", () => {
            this.missionDesign.bioOrganismId = card.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

        const btnRec = container.querySelector("#btn-arch-apply-rec");
        if (btnRec) {
          btnRec.addEventListener("click", () => {
            this.applyRecommendedScenarioBaseline(this.missionDesign.scenarioId);
            if (window.spaceAudio) window.spaceAudio.playClick();
            this.showToast(`Applied recommended baseline configuration for ${t.scenario.code}`);
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
              <div class="md-orbit-card" data-id="${orb.id}" style="padding:11px;border-radius:8px;border:1px solid ${active ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(103,232,249,0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                  <span style="font-size:12px;font-weight:700;color:#ece7dc;">${orb.name}</span>
                  ${rec ? `<span style="font-family:monospace;font-size:8.5px;padding:2px 6px;border-radius:4px;background:rgba(127,184,166,0.18);color:#7fb8a6;font-weight:700;">RECOMMENDED</span>` : ""}
                </div>
                <div style="font-family:monospace;font-size:10px;color:#67e8f9;margin-bottom:5px;">
                  Period: ${orb.periodMin} min · Eclipse: ${Math.round(orb.eclipseFraction * 100)}% · Insertion ΔV: ${orb.reqInsertionDv} m/s · Rad: ${orb.radiationEnvKrad} krad
                </div>
                <div style="font-size:10.5px;color:#94a3b8;line-height:1.4;">${orb.explain}</div>
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
              <div class="md-lv-card" data-id="${veh.id}" style="padding:11px;border-radius:8px;border:1px solid ${active ? "#d0a15c" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(208,161,92,0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                  <span style="font-size:12px;font-weight:700;color:#ece7dc;">${veh.name}</span>
                  <span style="font-family:monospace;font-size:10.5px;font-weight:700;color:#d0a15c;">$${veh.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:10px;color:${fits ? "#7fb8a6" : "#fca5a5"};margin-bottom:5px;">
                  Max Lift to Selected Orbit: ${capForOrbit} kg (Your Spacecraft: ${t.wetMassKg} kg) · Fairing: ${veh.fairingM}m
                </div>
                <div style="font-size:10.5px;color:#94a3b8;line-height:1.4;">${veh.explain}</div>
              </div>
            `;
          })
          .join("");

        const isBio = !!t.scenario.isBioPayload;
        const isIssDest = !isBio || t.orbit.id === "iss_cubesat_418" || t.orbit.id === "leo_400";
        const launchReady = t.massOk && isIssDest;
        const compatible = launchReady && t.budgetOk;
        const bioLaunchBanner = isBio
          ? `<div style="margin-bottom:10px;padding:9px 11px;border-radius:7px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.34);font-size:10.5px;color:#e2e8f0;line-height:1.45;">
              <strong style="color:#fbbf24;">BIONUTRIENTS-2 LAUNCH SEGMENT (SLIDE 17):</strong> Target ISS 418 km (51.6°) aboard <strong>Cygnus NG-18 CRS</strong>. Kits are <strong>soft-stowed at room (ambient) temperature</strong> in protective metallic foil pouches (<em>4 Production Bags + 4 Filters</em>) to shield dehydrated yeast spores from O₂ &amp; moisture.
            </div>`
          : "";

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          ${bioLaunchBanner}
          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9aa4ae;margin-bottom:6px;">
              STEP 2A · SELECT TARGET ORBITAL REGIME
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;">
              ${orbitCards}
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9aa4ae;margin-bottom:6px;">
              STEP 2B · SELECT LAUNCH VEHICLE (CHECK MASS vs. ORBIT CAPACITY)
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;">
              ${lvCards}
            </div>
          </div>

          <div style="padding:10px 12px;border-radius:8px;background:${launchReady ? "rgba(127,184,166,0.08)" : "rgba(239,68,68,0.12)"};border:1px solid ${launchReady ? "rgba(127,184,166,0.35)" : "rgba(239,68,68,0.45)"};margin-bottom:14px;font-size:11.5px;color:#ece7dc;">
            ${
              !isIssDest
                ? `<strong>[WARN] Wrong Destination for BioNutrients-2:</strong> BioNutrients-2 must operate aboard the <strong>International Space Station (418 km ISS LEO)</strong>. Select ISS 418 km or 400 km LEO.`
                : t.massOk
                  ? `<strong>[PASS] Launch Compatibility Verified:</strong> ${t.lv.name} can inject <strong>${t.lvCapacityKg} kg</strong> into ${t.orbit.name}, giving your <strong>${t.wetMassKg} kg</strong> payload a <strong>+${t.massMarginPct}%</strong> launch mass margin.`
                  : `<strong>[WARN] Launch Vehicle Overload:</strong> Payload mass (<strong>${t.wetMassKg} kg</strong>) exceeds <strong>${t.lvCapacityKg} kg</strong> capacity of ${t.lv.name} to ${t.orbit.name}, or exceeds kit limits. Select Cygnus NG-18 CRS to ISS 418 km.`
            }
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <span style="font-family:monospace;font-size:10px;color:#94a3b8;">
              ${compatible ? "Trajectory & Lift Margins Nominal" : "Resolve destination, mass or budget constraint before locking"}
            </span>
            <button type="button" id="btn-commit-orbit" style="padding:10px 20px;border-radius:6px;border:1px solid ${launchReady ? "#67e8f9" : "rgba(239,68,68,0.6)"};background:${launchReady ? "#ece7dc" : "rgba(239,68,68,0.2)"};color:${launchReady ? "#05060a" : "#fecaca"};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.4px;cursor:pointer;">
              ${launchReady ? (isBio ? "CONFIRM ISS NG-18 CARGO MANIFEST" : "CONFIRM ORBIT & LAUNCHER") : (isIssDest ? "REQUIRE MASS ≤ LIFT CAPACITY" : "SELECT ISS 418 km LEO DESTINATION")}
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
            if (!launchReady) {
              if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
              this.showToast(!isIssDest
                ? "BioNutrients-2 must be manifested to ISS 418 km LEO!"
                : "Payload mass exceeds Launch Vehicle lift capacity for this orbit!");
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
              <div class="md-bus-card" data-id="${b.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(103,232,249,0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#ece7dc;">
                  <span>${b.name}</span>
                  <span style="font-family:monospace;color:#d0a15c;">$${b.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:#67e8f9;margin:4px 0;">
                  Dry Mass: ${b.dryMassKg} kg · Base Load: ${b.basePowerLoadW} W · Max Instruments: ${b.maxInstruments}
                </div>
                <div style="font-size:10px;color:#94a3b8;line-height:1.35;">${b.explain}</div>
              </div>
            `;
          })
          .join("");

        const pwrCards = Object.values(POWER_SYSTEMS)
          .map((p) => {
            const active = md.powerId === p.id;
            return `
              <div class="md-pwr-card" data-id="${p.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "#d0a15c" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(208,161,92,0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#ece7dc;">
                  <span>${p.name}</span>
                  <span style="font-family:monospace;color:#d0a15c;">$${p.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:#7fb8a6;margin:4px 0;">
                  Output: +${p.genW} W · Mass: ${p.massKg} kg
                </div>
                <div style="font-size:10px;color:#94a3b8;line-height:1.35;">${p.explain}</div>
              </div>
            `;
          })
          .join("");

        const batCards = Object.values(BATTERY_PACKS)
          .map((b) => {
            const active = md.batteryId === b.id;
            return `
              <div class="md-bat-card" data-id="${b.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "#7fb8a6" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(127,184,166,0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#ece7dc;">
                  <span>${b.name}</span>
                  <span style="font-family:monospace;color:#d0a15c;">$${b.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:#67e8f9;margin:4px 0;">
                  Storage: ${b.capacityWh} Wh · Mass: ${b.massKg} kg
                </div>
                <div style="font-size:10px;color:#94a3b8;line-height:1.35;">${b.explain}</div>
              </div>
            `;
          })
          .join("");

        const csFormBar = t.scenario.isCubesat
          ? `<div style="margin-bottom:10px;padding:8px 10px;border-radius:7px;background:rgba(103,232,249,0.06);border:1px solid rgba(103,232,249,0.28);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <span style="font-family:monospace;font-size:9.5px;font-weight:700;color:#67e8f9;">CUBESAT FORM FACTOR:</span>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${Object.values(CUBESAT_FORMS).map((cf) => `<button type="button" class="md-csform-btn" data-id="${cf.id}" style="padding:4px 9px;border-radius:4px;border:1px solid ${md.cubesatFormId === cf.id ? "#67e8f9" : "rgba(255,255,255,0.16)"};background:${md.cubesatFormId === cf.id ? "rgba(103,232,249,0.22)" : "rgba(0,0,0,0.3)"};color:#ece7dc;font-family:monospace;font-size:9.5px;font-weight:700;cursor:pointer;">${cf.shortLabel}</button>`).join("")}
              </div>
            </div>`
          : "";

        const isBio = !!t.scenario.isBioPayload;
        const bio = t.bioTelemetry;
        const bioHwOk = !isBio || (bio.containerMassOk && bio.kitVolumeOk && bio.bag.hasIssNonLuerCover);
        const step3Ready = t.powerOk && bioHwOk;
        const bioBagBar = isBio
          ? `<div style="margin-bottom:10px;padding:10px 12px;border-radius:7px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.32);">
              <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.2px;color:#fbbf24;margin-bottom:6px;">
                BIONUTRIENTS-2 HARDWARE DESIGN · FEP PRODUCTION BAG &amp; SWABABLE BARB VALVE (SLIDES 19–20)
              </div>
              <div style="font-size:10.5px;color:#cbd5e1;margin-bottom:7px;line-height:1.4;">
                Goal #3 requires slashing empty container mass (<strong>&lt;250 g</strong>) and total occupied kit volume (<strong>&lt;300 mL</strong>) vs BioNutrients-1, with polycarbonate/silicone needlefree swabable barb valves &amp; ISS non-Luer covers (<code>P/N 110596-002</code>).
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:7px;">
                ${Object.values(BIO_BAG_CONFIGS).map((bag) => {
                  const active = md.bioBagId === bag.id;
                  const specsOk = bag.containerMassG < 250 && bag.kitVolumeMl < 300 && bag.hasIssNonLuerCover;
                  return `
                    <div class="md-biobag-card" data-id="${bag.id}" style="padding:9px 10px;border-radius:7px;border:1px solid ${active ? "#fbbf24" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(245,158,11,0.14)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                        <span style="font-size:11px;font-weight:700;color:#ece7dc;">${bag.name}</span>
                        <span style="font-family:monospace;font-size:9px;color:${specsOk ? "#86efac" : "#fca5a5"};">${specsOk ? "SPEC PASS" : "SPEC WARN"}</span>
                      </div>
                      <div style="font-family:monospace;font-size:9px;color:#fcd34d;margin:3px 0;">
                        Container: ${bag.containerMassG}g (&lt;250g) · Kit Vol: ${bag.kitVolumeMl}mL (&lt;300mL) · ${bag.dimensions}
                      </div>
                      <div style="font-size:9.8px;color:#94a3b8;line-height:1.35;">${bag.explain}</div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>`
          : "";

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          ${csFormBar}
          ${bioBagBar}
          <div style="display:grid;grid-template-columns:260px 1fr;gap:12px;align-items:start;margin-bottom:10px;">
            <div style="padding:8px;border-radius:8px;background:rgba(0,0,0,0.35);border:1px solid rgba(103,232,249,0.24);">
              <div style="font-family:monospace;font-size:9px;font-weight:700;letter-spacing:1px;color:#67e8f9;margin-bottom:5px;">LIVE 3D POINT DESIGN</div>
              <div id="mdl-point-design-3d" style="width:100%;height:156px;border-radius:6px;background:#050914;"></div>
              <div style="font-family:monospace;font-size:9px;color:#94a3b8;margin-top:5px;">
                ${
                  isBio
                    ? `Bag: <strong style="color:#ece7dc;">${bio.bag.shortLabel}</strong> · Container: <strong>${bio.bag.containerMassG}g</strong> · Vol: <strong>${bio.bag.kitVolumeMl}mL</strong>`
                    : `Bus: <strong style="color:#ece7dc;">${t.bus.name.split(" ")[0]}</strong> · Dry: <strong>${t.dryMassKg} kg</strong>`
                }
              </div>
            </div>
            <div>
              <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9aa4ae;margin-bottom:6px;">
                STEP 3A · SPACECRAFT PRIMARY STRUCTURE & AVIONICS BUS
              </div>
              <div style="display:grid;grid-template-columns:1fr;gap:7px;">
                ${busCards}
              </div>
            </div>
          </div>

          <div style="margin-bottom:10px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9aa4ae;margin-bottom:6px;">
              STEP 3B · SOLAR ARRAY / RTG POWER GENERATION
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
              ${pwrCards}
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9aa4ae;margin-bottom:6px;">
              STEP 3C · ECLIPSE ENERGY STORAGE (LI-ION / SOLID-STATE BATTERY)
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
              ${batCards}
            </div>
          </div>

          <div style="padding:10px 12px;border-radius:8px;background:${step3Ready ? "rgba(127,184,166,0.08)" : "rgba(239,68,68,0.12)"};border:1px solid ${step3Ready ? "rgba(127,184,166,0.35)" : "rgba(239,68,68,0.45)"};margin-bottom:12px;font-size:11px;color:#ece7dc;line-height:1.45;">
            ${
              !bioHwOk
                ? `<strong>[WARN] BioNutrients-2 Hardware Violation:</strong> Ensure empty sample container is <strong>&lt;250 g</strong> (${bio.bag.containerMassG} g), kit occupied volume is <strong>&lt;300 mL</strong> (${bio.bag.kitVolumeMl} mL), and valve uses ISS <code>-002</code> non-Luer thread cover.`
                : `<strong>Electrical Power Balance Equation:</strong> Continuous rack/payload load is <strong>${t.totalPowerLoadW} W</strong>, plus <strong>${t.rechargePowerNeededW} W</strong> needed during daylight to recharge the battery after each <strong>${(t.eclipseHours * 60).toFixed(0)}-minute</strong> orbital eclipse (${t.eclipseEnergyNeedWh} Wh drawn, <strong>${t.batteryDodPct}% Depth-of-Discharge</strong>). ${t.powerOk ? `[PASS] Net daylight power margin is <strong>+${t.netDaylightMarginW} W</strong> and Battery DoD is safe (≤80%).` : `[WARN] Power deficit or excessive battery discharge (>80% DoD). Select larger solar wings/RTG or a higher-capacity battery bank.`}`
            }
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <span style="font-family:monospace;font-size:10px;color:#94a3b8;">
              ${isBio ? `vs BioNutrients-1: ${bio.bag.containerMassG}/250g · ${bio.bag.kitVolumeMl}/300mL · Margin: +${t.netDaylightMarginW}W` : `Bus Bays Used: ${t.selectedInsts.length}/${t.maxInstruments} · Net Margin: ${t.netDaylightMarginW >= 0 ? `+${t.netDaylightMarginW}W` : `${t.netDaylightMarginW}W`}`}
            </span>
            <button type="button" id="btn-commit-bus" style="padding:10px 20px;border-radius:6px;border:1px solid ${step3Ready ? "#67e8f9" : "rgba(239,68,68,0.6)"};background:${step3Ready ? "#ece7dc" : "rgba(239,68,68,0.2)"};color:${step3Ready ? "#05060a" : "#fecaca"};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.4px;cursor:pointer;">
              ${step3Ready ? (isBio ? "LOCK FEP BAG HARDWARE & RACK POWER" : "LOCK BUS & ELECTRICAL POWER SYSTEM") : "RESOLVE HARDWARE / POWER CONSTRAINTS"}
            </button>
          </div>
        `;

        container.querySelectorAll(".md-biobag-card").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.bioBagId = c.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

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
            if (!bioHwOk) {
              if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
              this.showToast("BioNutrients-2 FEP bag must stay <250 g, <300 mL, and include ISS -002 non-Luer cover!");
              return;
            }
            if (!t.powerOk) {
              if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
              this.showToast("Power generation or battery capacity is insufficient for orbital eclipse!");
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
            <div class="md-inst-card" data-id="${inst.id}" style="padding:11px;border-radius:8px;border:1px solid ${selected ? "#4ade80" : "rgba(255,255,255,0.12)"};background:${selected ? "rgba(74,222,128,0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-size:12px;font-weight:700;color:#ece7dc;">${selected ? "☑ " : "☐ "}${inst.name}</span>
                ${isPriority ? `<span style="font-family:monospace;font-size:8.5px;padding:2px 6px;border-radius:4px;background:rgba(103,232,249,0.16);color:#67e8f9;font-weight:700;">MISSION PRIORITY</span>` : ""}
              </div>
              <div style="font-family:monospace;font-size:9.5px;color:#d0a15c;margin-bottom:5px;">
                Mass: ${inst.massKg} kg · Power: ${inst.powerW} W · Cost: $${inst.costM}M · Data: ${inst.dataMbps} Mbps · Sci: +${inst.scienceVal}
              </div>
              <div style="font-size:10px;color:#94a3b8;line-height:1.35;">${inst.explain}</div>
            </div>
          `;
        }).join("");

        const isBio = !!t.scenario.isBioPayload;
        const bio = t.bioTelemetry;
        const baysOk = t.selectedInsts.length >= 2 && t.selectedInsts.length <= t.maxInstruments;
        const bioProtoValid = bio.replicatesOk && bio.sampleVolOk && bio.sterileOk && bio.shake6hOk && bio.organism.goalAligned;
        const payloadValid = isBio ? bioProtoValid : (baysOk && t.scienceScore >= 55 && t.telescopeOk);

        const bioProtoBanner = isBio
          ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:7px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.32);">
              <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.2px;color:#34d399;margin-bottom:6px;">
                BIONUTRIENTS-2 ISS SPACE PROTOCOL &amp; PUBLICATION REQUIREMENTS (SLIDES 16, 18, 21)
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:6px;margin-bottom:8px;font-family:monospace;font-size:9px;">
                <div style="padding:5px 7px;border-radius:4px;background:rgba(0,0,0,0.35);border-left:3px solid ${bio.replicatesOk ? "#4ade80" : "#ef4444"};">REPLICATES: <strong>${bio.protocol.replicates}</strong> (Req ≥12)</div>
                <div style="padding:5px 7px;border-radius:4px;background:rgba(0,0,0,0.35);border-left:3px solid ${bio.sampleVolOk ? "#4ade80" : "#ef4444"};">VOLUME: <strong>${bio.protocol.sampleVolMl} mL</strong> (Req ≥30 mL)</div>
                <div style="padding:5px 7px;border-radius:4px;background:rgba(0,0,0,0.35);border-left:3px solid ${bio.yieldOk ? "#4ade80" : "#ef4444"};">BETA-CAROTENE: <strong>${bio.betaCaroteneUgMl} µg/mL</strong> (≥3)</div>
                <div style="padding:5px 7px;border-radius:4px;background:rgba(0,0,0,0.35);border-left:3px solid ${bio.dcwOk ? "#4ade80" : "#ef4444"};">DRY CELL WT: <strong>${bio.dryCellWeightMg} mg</strong> (≥1 mg)</div>
                <div style="padding:5px 7px;border-radius:4px;background:rgba(0,0,0,0.35);border-left:3px solid ${bio.sterileOk ? "#4ade80" : "#ef4444"};">STERILITY: <strong>${bio.protocol.contaminationCfu} CFU</strong> (0.2µm Filter)</div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:7px;">
                ${Object.values(BIO_PROTOCOL_OPTIONS).map((pr) => {
                  const active = md.bioProtocolId === pr.id;
                  const protoOk = pr.replicates >= 12 && pr.sampleVolMl >= 30 && pr.sterileFiltered && (!bio.organism.requiresSixHourShake || pr.hasSixHourShake);
                  return `
                    <div class="md-bioproto-card" data-id="${pr.id}" style="padding:9px 10px;border-radius:7px;border:1px solid ${active ? "#34d399" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                        <span style="font-size:11px;font-weight:700;color:#ece7dc;">${pr.name}</span>
                        <span style="font-family:monospace;font-size:8.5px;color:${protoOk ? "#86efac" : "#fca5a5"};">${protoOk ? "PASS" : "FAIL"}</span>
                      </div>
                      <div style="font-family:monospace;font-size:9px;color:#6ee7b7;margin:3px 0;">
                        ${pr.replicates} bags × ${pr.sampleVolMl}mL · 0.2µm Filter: ${pr.sterileFiltered ? "YES" : "NO"} · 6h Shake: ${pr.hasSixHourShake ? "YES" : "SKIPPED"}
                      </div>
                      <div style="font-size:9.8px;color:#94a3b8;line-height:1.35;">${pr.explain}</div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>`
          : "";

        const waveBanner = t.scenario.requiresWavelength
          ? `<div style="margin-bottom:10px;padding:9px 11px;border-radius:7px;background:${t.telescopeOk ? "rgba(167,139,250,0.08)" : "rgba(239,68,68,0.12)"};border:1px solid ${t.telescopeOk ? "rgba(167,139,250,0.35)" : "rgba(239,68,68,0.45)"};">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
                <span style="font-family:monospace;font-size:9.5px;font-weight:700;color:#ddd6fe;">TELESCOPE WAVELENGTH BAND:</span>
                <div style="display:flex;gap:5px;flex-wrap:wrap;">
                  ${Object.values(WAVELENGTH_BANDS).map((wb) => `<button type="button" class="md-wave-pill" data-id="${wb.id}" style="padding:3px 7px;border-radius:4px;border:1px solid ${md.wavelengthId === wb.id ? "#c084fc" : "rgba(255,255,255,0.16)"};background:${md.wavelengthId === wb.id ? "rgba(192,132,252,0.22)" : "rgba(0,0,0,0.3)"};color:#ece7dc;font-family:monospace;font-size:9px;font-weight:700;cursor:pointer;">${wb.shortLabel}</button>`).join("")}
                </div>
              </div>
              <div style="font-size:10.5px;color:${t.telescopeOk ? "#a7f3d0" : "#fecaca"};">
                ${t.telescopeOk ? `[PASS] Wavelength (${t.wavelength.shortLabel}), Detectors, Thermal Control & Orbit are optically compatible.` : `[WARN] ${t.telescopeIssues.join(" · ")}`}
              </div>
            </div>`
          : "";

        const csaContextualHtml = window.csaNasaLab && typeof window.csaNasaLab.renderContextualConsoleWidget === "function"
          ? window.csaNasaLab.renderContextualConsoleWidget(t.scenario.id)
          : "";

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          ${waveBanner}
          ${bioProtoBanner}
          ${csaContextualHtml}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
            <span style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9aa4ae;">
              SELECT SCIENTIFIC INSTRUMENTS (BAYS USED: ${t.selectedInsts.length} / ${t.maxInstruments} MAX ON ${t.bus.name.toUpperCase()})
            </span>
            <span style="font-family:monospace;font-size:10px;color:#7fb8a6;">
              Matched Priority Objectives: ${t.matchedTypes.length} / ${t.scenario.requiredScienceTypes.length}
            </span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;margin-bottom:12px;">
            ${instCards}
          </div>

          <div style="padding:10px 12px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);margin-bottom:12px;font-size:11px;color:#cbd5e1;line-height:1.45;">
            <strong>Payload Trade-Off Analysis:</strong> Your ${t.selectedInsts.length} selected instruments draw <strong>${t.selectedInsts.reduce((a, b) => a + b.powerW, 0)} W</strong>, weigh <strong>${t.selectedInsts.reduce((a, b) => a + b.massKg, 0)} kg</strong>, cost <strong>$${t.selectedInsts.reduce((a, b) => a + b.costM, 0)}M</strong>, and generate <strong>${t.dataGeneratedGbPerDay} GB/day</strong> of raw science telemetry. Adding high-value instruments like the L-Band SAR increases science return to <strong>${t.scienceScore}/100</strong>, but requires higher solar power and Ka/X-Band downlink capacity.
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <span style="font-family:monospace;font-size:10px;color:#94a3b8;">
              Science Value Score: <strong style="color:#4ade80;">${t.scienceScore}/100</strong> (Min 55 required)
            </span>
            <button type="button" id="btn-commit-science" style="padding:10px 20px;border-radius:6px;border:1px solid ${payloadValid ? "#67e8f9" : "rgba(239,68,68,0.6)"};background:${payloadValid ? "#ece7dc" : "rgba(239,68,68,0.2)"};color:${payloadValid ? "#05060a" : "#fecaca"};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.4px;cursor:pointer;">
              ${payloadValid ? (isBio ? "LOCK PWD HYDRATION &amp; 6H SHAKE PROTOCOL" : "INTEGRATE SCIENCE PAYLOAD SUITE") : (isBio ? "RESOLVE REPLICATES / FILTER / 6H SHAKE" : (!t.telescopeOk ? "RESOLVE WAVELENGTH / OPTICS CONFLICT" : `SELECT 2–${t.maxInstruments} INSTRUMENTS (SCI ≥ 55)`))}
            </button>
          </div>
        `;

        if (window.csaNasaLab && typeof window.csaNasaLab.bindContextualConsoleEvents === "function") {
          window.csaNasaLab.bindContextualConsoleEvents(container, render);
        }

        container.querySelectorAll(".md-bioproto-card").forEach((card) => {
          card.addEventListener("click", () => {
            this.missionDesign.bioProtocolId = card.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

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
                this.showToast(`Current bus/form supports at most ${t.maxInstruments} instruments! Upgrade or deselect one.`);
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
              this.showToast(isBio
                ? "BioNutrients-2 requires Yeast target, ≥12 replicates, ≥30 mL/sample, 0.2µm sterile filter, and 6h shake!"
                : (!t.telescopeOk
                  ? `[WARN] ${t.telescopeIssues[0]}`
                  : "Select 2 to " + t.maxInstruments + " instruments with at least 55 Science Value!"));
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
              <div class="md-thm-card" data-id="${pkg.id}" style="padding:12px;border-radius:8px;border:1px solid ${active ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(103,232,249,0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                  <span style="font-size:12px;font-weight:700;color:#ece7dc;">${pkg.name}</span>
                  <span style="font-family:monospace;font-size:11px;font-weight:700;color:#d0a15c;">$${pkg.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:#7fb8a6;margin-bottom:5px;">
                  Heat Rejection Cap: ${pkg.thermalCapW} W · Radiation Vault: ${pkg.radRatingKrad} krad · Mass: ${pkg.massKg} kg · Power: ${pkg.powerW} W
                </div>
                <div style="font-size:10.5px;color:#94a3b8;line-height:1.4;">${pkg.explain}</div>
              </div>
            `;
          })
          .join("");

        const isBio = !!t.scenario.isBioPayload;
        const bio = t.bioTelemetry;
        const envSurvived = t.thermalOk && t.radiationOk && t.lifetimeOk;
        const bioThermalSection = isBio
          ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:7px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.34);">
              <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.2px;color:#38bdf8;margin-bottom:6px;">
                BIONUTRIENTS-2 INCUBATION &amp; MELFI (-80°C) COLD-CHAIN PROFILE (SLIDES 16, 21, 23)
              </div>
              <div style="font-size:10.5px;color:#cbd5e1;margin-bottom:7px;line-height:1.4;">
                Target temperatures: <strong>Yeast 30°C</strong> (+6h shake) · <strong>Yogurt 42°C</strong> · <strong>Kefir Ambient</strong>. After incubation, pack each FEP bag in protective overwrap &amp; store in ISS <strong>MELFI (-80°C)</strong> freezer for return.
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:7px;">
                ${Object.values(BIO_THERMAL_OPTIONS).map((bt) => {
                  const active = md.bioThermalId === bt.id;
                  const btOk = bt.incubateTempC === bio.organism.targetTempC && bt.melfiFrozen;
                  return `
                    <div class="md-biothm-card" data-id="${bt.id}" style="padding:9px 10px;border-radius:7px;border:1px solid ${active ? "#38bdf8" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                        <span style="font-size:11px;font-weight:700;color:#ece7dc;">${bt.name}</span>
                        <span style="font-family:monospace;font-size:8.5px;color:${btOk ? "#86efac" : "#fca5a5"};">${btOk ? "MATCH" : "MISMATCH"}</span>
                      </div>
                      <div style="font-family:monospace;font-size:9px;color:#7dd3fc;margin:3px 0;">
                        Incubator: ${bt.incubateTempC}°C (Req ${bio.organism.targetTempC}°C) · Freezer: ${bt.storageTempC}°C · ${bt.powerW} W
                      </div>
                      <div style="font-size:9.8px;color:#94a3b8;line-height:1.35;">${bt.explain}</div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>`
          : "";

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          ${bioThermalSection}
          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9aa4ae;margin-bottom:6px;">
              SELECT THERMAL REJECTION RADIATORS & AVIONICS RADIATION SHIELDING
            </div>
            <div style="display:grid;grid-template-columns:1fr;gap:8px;">
              ${thmCards}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:14px;">
            <div style="padding:10px;border-radius:6px;background:rgba(0,0,0,0.35);border:1px solid ${t.thermalOk ? "rgba(127,184,166,0.35)" : "rgba(239,68,68,0.5)"};">
              <div style="font-family:monospace;font-size:9.5px;color:#9aa4ae;">${isBio ? "INCUBATION & MELFI LOOP" : "THERMAL DISSIPATION"}</div>
              <div style="font-family:monospace;font-size:13px;font-weight:700;color:${t.thermalOk ? "#7fb8a6" : "#fca5a5"};margin-top:2px;">
                ${isBio ? `${bio.thermal.incubateTempC}°C / ${bio.thermal.storageTempC}°C` : `${t.thm.thermalCapW} W Cap vs ${t.totalPowerLoadW} W Load`}
              </div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${isBio ? `Req ${bio.organism.targetTempC}°C incubator & MELFI -80°C freezer (${t.thm.thermalCapW}W loop).` : "All electrical power consumed onboard turns into waste heat that must be radiated to space."}</div>
            </div>
            <div style="padding:10px;border-radius:6px;background:rgba(0,0,0,0.35);border:1px solid ${t.radiationOk ? "rgba(127,184,166,0.35)" : "rgba(239,68,68,0.5)"};">
              <div style="font-family:monospace;font-size:9.5px;color:#9aa4ae;">TOTAL IONIZING DOSE (TID)</div>
              <div style="font-family:monospace;font-size:13px;font-weight:700;color:${t.radiationOk ? "#7fb8a6" : "#fca5a5"};margin-top:2px;">
                ${t.thm.radRatingKrad} krad vs ${Math.max(t.scenario.minRadiationKrad, t.orbit.radiationEnvKrad)} krad Req
              </div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Protects flight computers and focal-plane sensors from solar protons and Van Allen belt electrons.</div>
            </div>
            <div style="padding:10px;border-radius:6px;background:rgba(0,0,0,0.35);border:1px solid ${t.lifetimeOk ? "rgba(127,184,166,0.35)" : "rgba(239,68,68,0.5)"};">
              <div style="font-family:monospace;font-size:9.5px;color:#9aa4ae;">OPERATIONAL LIFETIME</div>
              <div style="font-family:monospace;font-size:13px;font-weight:700;color:${t.lifetimeOk ? "#7fb8a6" : "#fca5a5"};margin-top:2px;">
                ${t.estimatedLifetimeMonths} Months (Target: ${t.scenario.targetLifetimeMonths} mo)
              </div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Determined by radiation shielding, battery cycle depth-of-discharge, and propellant reserve.</div>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <span style="font-family:monospace;font-size:10px;color:#94a3b8;">
              ${envSurvived ? (isBio ? "Incubation Setpoint, MELFI -80°C & Rack Thermal Verified" : "Thermal, Radiation & Lifetime Margins Verified") : (isBio ? "Match incubator temperature & enable MELFI (-80°C)" : "Upgrade shielding or battery to meet mission lifetime")}
            </span>
            <button type="button" id="btn-commit-thm" style="padding:10px 20px;border-radius:6px;border:1px solid ${envSurvived ? "#67e8f9" : "rgba(239,68,68,0.6)"};background:${envSurvived ? "#ece7dc" : "rgba(239,68,68,0.2)"};color:${envSurvived ? "#05060a" : "#fecaca"};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.4px;cursor:pointer;">
              ${envSurvived ? (isBio ? "LOCK INCUBATOR (30°C) & MELFI (-80°C) COLD CHAIN" : "QUALIFY THERMAL & RADIATION SHIELDING") : "RESOLVE THERMAL / MELFI / RADIATION"}
            </button>
          </div>
        `;

        container.querySelectorAll(".md-biothm-card").forEach((c) => {
          c.addEventListener("click", () => {
            this.missionDesign.bioThermalId = c.dataset.id;
            if (window.spaceAudio) window.spaceAudio.playClick();
            this._renderResourceMeters();
            render();
          });
        });

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
              this.showToast(isBio
                ? "BioNutrients-2 Yeast requires 30°C incubator match and MELFI (-80°C) storage!"
                : "Thermal radiator capacity or radiation shielding is below orbital requirements!");
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
              <div class="md-com-card" data-id="${c.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(103,232,249,0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:#ece7dc;">
                  <span>${c.name}</span>
                  <span style="font-family:monospace;color:#d0a15c;">$${c.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:#67e8f9;margin:3px 0;">
                  Downlink: ${c.rateMbps} Mbps · Mass: ${c.massKg} kg · Power: ${c.powerW} W
                </div>
                <div style="font-size:10px;color:#94a3b8;line-height:1.35;">${c.explain}</div>
              </div>
            `;
          })
          .join("");

        const gndCards = Object.values(GROUND_NETWORKS)
          .map((g) => {
            const active = md.groundNetId === g.id;
            return `
              <div class="md-gnd-card" data-id="${g.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "#9a8fc4" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(154,143,196,0.14)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:#ece7dc;">
                  <span>${g.name}</span>
                  <span style="font-family:monospace;color:#d0a15c;">$${g.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:#c4b5fd;margin:3px 0;">
                  Receiver Gain: +${g.gainDb} dB · Pass Coverage: ${g.contactMultiplier}x
                </div>
                <div style="font-size:10px;color:#94a3b8;line-height:1.35;">${g.explain}</div>
              </div>
            `;
          })
          .join("");

        const propCards = Object.values(PROPULSION_SYSTEMS)
          .map((p) => {
            const active = md.propulsionId === p.id;
            return `
              <div class="md-prop-card" data-id="${p.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "#7fb8a6" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(127,184,166,0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:#ece7dc;">
                  <span>${p.name}</span>
                  <span style="font-family:monospace;color:#d0a15c;">$${p.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9.5px;color:#7fb8a6;margin:3px 0;">
                  Isp: ${p.ispSec} s · Fuel: ${p.propellantKg} kg · Dry: ${p.dryMassKg} kg · Power: ${p.powerW} W
                </div>
                <div style="font-size:10px;color:#94a3b8;line-height:1.35;">${p.explain}</div>
              </div>
            `;
          })
          .join("");

        const dispCards = Object.values(DISPOSAL_OPTIONS)
          .map((d) => {
            const active = md.disposalId === d.id;
            return `
              <div class="md-disp-card" data-id="${d.id}" style="padding:10px;border-radius:8px;border:1px solid ${active ? "#fbbf24" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#ece7dc;">
                  <span>${d.name}</span>
                  <span style="font-family:monospace;color:#d0a15c;">$${d.costM}M</span>
                </div>
                <div style="font-family:monospace;font-size:9px;color:${d.id === "none_drift" ? "#fca5a5" : "#86efac"};margin:3px 0;">
                  Deorbit: ${d.deorbitYears} yr · Mass: ${d.massKg} kg · Req ΔV: +${d.dvCostMs} m/s
                </div>
                <div style="font-size:10px;color:#94a3b8;line-height:1.35;">${d.explain}</div>
              </div>
            `;
          })
          .join("");

        const isBio = !!t.scenario.isBioPayload;
        const bio = t.bioTelemetry;
        const systemsReady = t.commsOk && t.deltaVOk && t.disposalOk;
        const bioGroundBanner = isBio
          ? `<div style="margin-bottom:10px;padding:10px 12px;border-radius:7px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.34);font-size:10.5px;color:#e2e8f0;line-height:1.45;">
              <div style="font-family:monospace;font-size:9.5px;font-weight:700;color:#c4b5fd;margin-bottom:4px;">
                GROUND SEGMENT &amp; USER SEGMENT ("BEGIN WITH THE END IN MIND" · SLIDES 15, 16, 23)
              </div>
              <div><strong>Ground Ops:</strong> Scientists &amp; engineers watch ISS initiation live on console (supporting crew questions &amp; anomaly resolution) and continuously monitor <strong>${bio.thermal.incubateTempC}°C incubation &amp; ${bio.thermal.storageTempC}°C MELFI</strong> temperatures.</div>
              <div style="margin-top:4px;font-family:monospace;font-size:9.5px;color:${bio.yieldOk && bio.dcwOk ? "#86efac" : "#fca5a5"};">
                USER LAB WORKFLOW: 1. Delivery -> 2. Thaw -> 3. Empty &amp; Wash -> 4. Centrifuge -> 5. Beta-Carotene Assay (${bio.betaCaroteneUgMl} µg/mL, ${bio.dryCellWeightMg} mg DCW) &amp; Publish
              </div>
            </div>`
          : "";

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          ${bioGroundBanner}
          <div style="margin-bottom:10px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9aa4ae;margin-bottom:6px;">
              STEP 6A · SPACECRAFT TRANSCEIVER & HIGH-GAIN ANTENNA
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
              ${comCards}
            </div>
          </div>

          <div style="margin-bottom:10px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9aa4ae;margin-bottom:6px;">
              STEP 6B · GROUND STATION TRACKING NETWORK
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
              ${gndCards}
            </div>
          </div>

          <div style="margin-bottom:10px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9aa4ae;margin-bottom:6px;">
              STEP 6C · ORBITAL PROPULSION & DELTA-V (TSIOLKOVSKY ROCKET EQUATION)
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">
              ${propCards}
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#fbbf24;margin-bottom:6px;">
              STEP 6D · END-OF-MISSION (EoM) DISPOSAL & ORBITAL DEBRIS MITIGATION
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
              ${dispCards}
            </div>
          </div>

          <div style="padding:10px 12px;border-radius:8px;background:${systemsReady ? "rgba(127,184,166,0.08)" : "rgba(239,68,68,0.12)"};border:1px solid ${systemsReady ? "rgba(127,184,166,0.35)" : "rgba(239,68,68,0.45)"};margin-bottom:12px;font-size:11px;color:#ece7dc;line-height:1.45;">
            <div><strong>1. Link Budget & Data Balance:</strong> Link Margin is <strong>${t.linkMarginDb} dB</strong> (min 3.0 dB required for carrier lock at ${t.orbit.altitudeKm.toLocaleString()} km) and daily downlink capacity is <strong>${t.downlinkCapGbPerDay} GB/day</strong> vs. <strong>${t.dataGeneratedGbPerDay} GB/day</strong> generated by your instruments.</div>
            <div style="margin-top:4px;"><strong>2. Tsiolkovsky Rocket Equation (Δv = I_sp · g₀ · ln(m₀ / m_f)):</strong> With wet mass m₀ = <strong>${t.wetMassKg} kg</strong> and dry mass m_f = <strong>${t.dryMassKg} kg</strong>, your propulsion delivers <strong>${t.achievedDeltaV} m/s</strong> vs. <strong>${t.requiredDeltaV} m/s</strong> required (incl. +${t.disposal.dvCostMs} m/s EoM disposal).</div>
            <div style="margin-top:4px;"><strong>3. Debris Compliance:</strong> ${t.disposalOk ? `[PASS] ${t.disposalNote}` : `[WARN] ${t.disposalNote}`}</div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <span style="font-family:monospace;font-size:10px;color:#94a3b8;">
              Link: ${t.linkMarginDb} dB · ΔV: ${t.achievedDeltaV}/${t.requiredDeltaV} m/s · EoM: ${t.disposalOk ? "PASS" : "FAIL"}
            </span>
            <button type="button" id="btn-commit-comms" style="padding:10px 20px;border-radius:6px;border:1px solid ${systemsReady ? "#67e8f9" : "rgba(239,68,68,0.6)"};background:${systemsReady ? "#ece7dc" : "rgba(239,68,68,0.2)"};color:${systemsReady ? "#05060a" : "#fecaca"};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.4px;cursor:pointer;">
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
              this.showToast("Ensure Link Margin, Delta-V, and End-of-Mission disposal requirements all pass!");
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
    getMissionEvent(seed, t) {
      if (!t) return null;
      const difficulty = (t.difficulty && t.difficulty.id) || "engineer";
      const events = [
        // Cadet — unexpected but survivable operational hiccups.
        {
          id: "software_safe_mode",
          severity: "CADET",
          title: "FLIGHT COMPUTER SAFE-MODE RESET",
          situation: "A transient software fault reset the flight computer during cruise. The spacecraft must recover without losing the science campaign or overrunning the budget.",
          check: (telemetry) => telemetry.engineeringScore >= 50 && telemetry.budgetOk,
          metric: (telemetry) => `Engineering ${telemetry.engineeringScore}/100 · Reserve $${Math.max(0, telemetry.budgetRemainingM)}M`,
          mitigation: "Keep the engineering score above 50 and preserve a small budget reserve for contingency operations."
        },
        {
          id: "station_weather_delay",
          severity: "CADET",
          title: "GROUND STATION WEATHER DELAY",
          situation: "A storm closed the primary ground station for two passes. The remaining network must still close the link and preserve a small schedule reserve.",
          check: (telemetry) => telemetry.budgetRemainingM >= telemetry.budgetCapM * 0.02 && telemetry.linkMarginDb >= 3,
          metric: (telemetry) => `Link ${telemetry.linkMarginDb} dB (≥3) · Reserve $${Math.max(0, telemetry.budgetRemainingM)}M`,
          mitigation: "Keep at least a 3 dB link margin and a 2% budget reserve for weather or scheduling delays."
        },
        {
          id: "eclipse_thermal_transient",
          severity: "CADET",
          title: "ECLIPSE THERMAL TRANSIENT",
          situation: "An unexpected heater load appeared during eclipse. The battery and thermal system must absorb it without a brownout.",
          check: (telemetry) => telemetry.batteryDodPct <= 85 && telemetry.thermalOk,
          metric: (telemetry) => `Battery DoD ${telemetry.batteryDodPct}% (≤85%) · Thermal ${telemetry.thermalOk ? "NOMINAL" : "FAIL"}`,
          mitigation: "Keep battery depth-of-discharge below 85% and pair the payload with adequate thermal rejection."
        },
        // Engineer — realistic phase-A anomalies.
        {
          id: "cme_solar_storm",
          severity: "ENGINEER",
          title: "CME SOLAR PARTICLE STORM",
          situation: "A coronal mass ejection swept the spacecraft. Radiation shielding, thermal control and lifetime margin must all survive the storm.",
          check: (telemetry) => telemetry.radiationOk && telemetry.thermalOk && telemetry.lifetimeOk,
          metric: (telemetry) => `Rad ${telemetry.thm.radRatingKrad} krad · Heat ${telemetry.thm.thermalCapW} W · Life ${telemetry.estimatedLifetimeMonths} mo`,
          mitigation: "Choose a thermal/radiation package rated for the mission environment and keep the lifetime margin positive."
        },
        {
          id: "dsn_antenna_outage",
          severity: "ENGINEER",
          title: "DSN 70 m ANTENNA OUTAGE",
          situation: "The primary Deep Space Network dish went offline for maintenance. The remaining network must still downlink at least 85% of the science data with a healthy link margin.",
          check: (telemetry) => telemetry.linkMarginDb >= 6 && telemetry.downlinkCapGbPerDay >= telemetry.dataGeneratedGbPerDay * 0.85,
          metric: (telemetry) => `Link ${telemetry.linkMarginDb} dB (≥6) · ${telemetry.downlinkCapGbPerDay} / ${telemetry.dataGeneratedGbPerDay} GB/d`,
          mitigation: "Use a higher-gain antenna or a denser ground network, and avoid generating more data than the backup network can carry."
        },
        {
          id: "reaction_wheel_anomaly",
          severity: "ENGINEER",
          title: "REACTION WHEEL BEARING ANOMALY",
          situation: "One reaction wheel began drawing excess current. Propulsion must provide at least 100 m/s of attitude-control reserve while still completing the orbit insertion budget.",
          check: (telemetry) => telemetry.deltaVOk && (telemetry.achievedDeltaV - telemetry.requiredDeltaV) >= 100,
          metric: (telemetry) => `ΔV reserve ${Math.max(0, telemetry.achievedDeltaV - telemetry.requiredDeltaV)} m/s (≥100)`,
          mitigation: "Select a propulsion system with at least 100 m/s of reserve above the orbit-insertion requirement."
        },
        {
          id: "detector_degradation",
          severity: "ENGINEER",
          title: "PAYLOAD DETECTOR DEGRADATION",
          situation: "One detector channel degraded after launch. The remaining instruments must still deliver at least 75/100 science value.",
          check: (telemetry) => telemetry.scienceScore >= 75 && telemetry.selectedInsts.length >= 2,
          metric: (telemetry) => `Science ${telemetry.scienceScore}/100 (≥75) · ${telemetry.selectedInsts.length} instruments`,
          mitigation: "Carry at least two instruments and maintain science margin above the mission's required coverage."
        },
        {
          id: "launch_window_delay",
          severity: "ENGINEER",
          title: "LAUNCH WINDOW SOLAR ACTIVITY DELAY",
          situation: "Solar activity delayed the launch by three weeks. The mission must absorb the schedule cost while preserving its lifetime margin.",
          check: (telemetry) => telemetry.budgetRemainingM >= telemetry.budgetCapM * 0.05 && telemetry.lifetimeOk,
          metric: (telemetry) => `Reserve $${Math.max(0, telemetry.budgetRemainingM)}M (≥5%) · Life ${telemetry.estimatedLifetimeMonths} mo`,
          mitigation: "Keep a 5% budget reserve and select components that meet the target lifetime with margin."
        },
        // Director — severe anomalies.
        {
          id: "severe_x_class_cme",
          severity: "DIRECTOR",
          title: "SEVERE X-CLASS CME",
          situation: "An X-class solar storm struck the spacecraft. Shielding, thermal control, lifetime margin and the communications link must all survive simultaneously.",
          check: (telemetry) => telemetry.radiationOk && telemetry.thermalOk && telemetry.lifetimeOk && telemetry.linkMarginDb >= 8,
          metric: (telemetry) => `Rad ${telemetry.thm.radRatingKrad} krad · Link ${telemetry.linkMarginDb} dB (≥8) · Life ${telemetry.estimatedLifetimeMonths} mo`,
          mitigation: "Use a hardened thermal/radiation package, a high-gain link and extra lifetime margin."
        },
        {
          id: "dsn_network_loss",
          severity: "DIRECTOR",
          title: "DEEP SPACE NETWORK LOSS",
          situation: "A network-wide failure removed the backup DSN assets. The spacecraft must close an 8 dB link and downlink 100% of its generated data using the remaining capacity.",
          check: (telemetry) => telemetry.linkMarginDb >= 8 && telemetry.downlinkCapGbPerDay >= telemetry.dataGeneratedGbPerDay,
          metric: (telemetry) => `Link ${telemetry.linkMarginDb} dB (≥8) · ${telemetry.downlinkCapGbPerDay} / ${telemetry.dataGeneratedGbPerDay} GB/d`,
          mitigation: "Design for full data downlink with an 8 dB margin, not just the 3 dB minimum."
        },
        {
          id: "power_bus_arc_fault",
          severity: "DIRECTOR",
          title: "POWER BUS ARC FAULT",
          situation: "An arc fault degraded one power bus. The spacecraft must hold battery depth-of-discharge at or below 60% and retain a 10% daylight power margin.",
          check: (telemetry) => telemetry.batteryDodPct <= 60 && telemetry.netDaylightMarginW >= telemetry.totalPowerLoadW * 0.1,
          metric: (telemetry) => `DoD ${telemetry.batteryDodPct}% (≤60%) · Margin ${telemetry.netDaylightMarginW} W (≥10%)`,
          mitigation: "Oversize solar generation and battery capacity beyond the standard 80% DoD limit."
        },
        {
          id: "primary_instrument_failure",
          severity: "DIRECTOR",
          title: "PRIMARY INSTRUMENT FAILURE",
          situation: "The primary science instrument failed. The remaining payload must still deliver at least 85/100 science value across the required science types.",
          check: (telemetry) => telemetry.scienceScore >= 85 && telemetry.selectedInsts.length >= 3,
          metric: (telemetry) => `Science ${telemetry.scienceScore}/100 (≥85) · ${telemetry.selectedInsts.length} instruments`,
          mitigation: "Carry at least three instruments and keep science value well above the minimum threshold."
        }
      ];

      const pool = events.filter((event) => event.severity === difficulty.toUpperCase());
      const usable = pool.length ? pool : events.filter((event) => event.severity === "ENGINEER");
      let hash = (Number(seed) || 1) >>> 0;
      hash ^= difficulty === "director" ? 0x9e3779b9 : difficulty === "cadet" ? 0x85ebca6b : 0xc2b2ae35;
      hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
      hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
      hash = (hash ^ (hash >>> 16)) >>> 0;
      const chosen = usable[hash % usable.length];
      const ok = !!chosen.check(t);
      return {
        id: chosen.id,
        severity: chosen.severity,
        title: chosen.title,
        situation: chosen.situation,
        mitigation: chosen.mitigation,
        ok,
        metric: chosen.metric(t),
        detail: ok
          ? `ANOMALY SURVIVED: ${chosen.title} was handled without losing the mission.`
          : `ANOMALY FAILURE: ${chosen.title} exceeded the current design margins. ${chosen.mitigation}`
      };
    }

    renderMissionSimulationConsole(container, task) {
      const render = () => {
        const t = this.evaluateMissionDesign();
        const missionState = this.getMissionState();
        const missionSeed = (missionState && missionState.seed) || 1;
        const missionEvent = this.getMissionEvent(missionSeed, t);
        this.lastMissionEvent = missionEvent;

        const isBio = !!t.scenario.isBioPayload;
        const bio = t.bioTelemetry;
        // Build 5-stage simulation log evaluating every engineering trade-off
        const phases = isBio
          ? [
              {
                phase: "PHASE 1 · LAUNCH SEGMENT (CYGNUS NG-18 AMBIENT STOW)",
                ok: t.segments.launch.ok,
                metric: `${bio.bag.containerMassG}g (<250g) · ${bio.bag.kitVolumeMl}mL (<300mL) · $${t.totalCostM}M/$${t.budgetCapM}M`,
                detail: t.segments.launch.ok
                  ? `${t.lv.name} carried BioNutrients-2 soft-stowed foil kits (4 Production Bags + 4 Filters) at room temperature to ISS 418 km, slashing mass & volume vs BioNutrients-1.`
                  : `LAUNCH/HARDWARE HOLD: Check ISS LEO destination, ${t.lv.name.split("(")[0].trim()}, container mass (${bio.bag.containerMassG}g < 250g), volume (${bio.bag.kitVolumeMl}mL < 300mL), or -002 cover.`
              },
              {
                phase: "PHASE 2 · SPACE HYDRATION & STERILITY (PWD -> FILTER -> VALVE)",
                ok: bio.sterileOk && bio.replicatesOk && bio.sampleVolOk && bio.filmMatch,
                metric: `${bio.protocol.replicates}×${bio.protocol.sampleVolMl} mL · ${bio.bag.shortLabel} · ${bio.protocol.contaminationCfu} CFU`,
                detail: (bio.sterileOk && bio.replicatesOk && bio.sampleVolOk)
                  ? `ISS crew drew PWD water into 1L bag, syringe-injected through 0.2µm sterile filter + needlefree swabable barb valve (-002), removed filter & shook 1 min across ${bio.protocol.replicates} replicates.`
                  : `HYDRATION/STERILITY FAIL: Verify 3mil FEP (-002), 0.2µm sterile filtration, >=12 replicates, and >=30 mL sample volume.`
              },
              {
                phase: "PHASE 3 · SPACE INCUBATION (30°C + 6h SHAKE -> MELFI -80°C)",
                ok: t.powerOk && bio.tempMatch && bio.shake6hOk && bio.melfiOk,
                metric: `Incubator: ${bio.thermal.incubateTempC}°C (Req ${bio.organism.targetTempC}°C) · 6h Shake: ${bio.shake6hOk ? "YES" : "NO"} · MELFI: ${bio.thermal.storageTempC}°C`,
                detail: (t.powerOk && bio.tempMatch && bio.shake6hOk && bio.melfiOk)
                  ? `Incubated yeast at 30°C with ~1 min shake at 6 hours, then packed bags inside protective overwrap & cryopreserved at -80°C inside ISS MELFI.`
                  : `INCUBATION/FREEZE HOLD: Ensure 30°C incubator match for Yeast, mandatory 6-hour shake, adequate rack power, and MELFI (-80°C) freezer storage.`
              },
              {
                phase: "PHASE 4 · GROUND CONSOLE (REAL-TIME INITIATION & TELEMETRY)",
                ok: t.segments.ground.ok,
                metric: `${t.gnd.name} · +${t.linkMarginDb} dB Link · ${t.downlinkCapGbPerDay}/${t.dataGeneratedGbPerDay} GB/d`,
                detail: t.segments.ground.ok
                  ? `Science & engineering team monitored live crew initiation on console and verified continuous ${bio.thermal.incubateTempC}°C & -80°C MELFI thermal logs via ${t.com.name}.`
                  : `TELEMETRY HOLD: Insufficient RF link margin (${t.linkMarginDb} dB) or ground thermal monitoring mismatch.`
              },
              {
                phase: "PHASE 5 · USER SEGMENT (THAW -> WASH -> CENTRIFUGE -> ANALYZE)",
                ok: t.segments.user.ok,
                metric: `Beta-Carotene: ${bio.betaCaroteneUgMl} µg/mL (≥3) · DCW: ${bio.dryCellWeightMg} mg (≥1) · Sci: ${t.scienceScore}/100`,
                detail: t.segments.user.ok
                  ? `Post-flight Earth lab completed Delivery -> Thaw -> Empty & Wash -> Centrifuge -> Assay, measuring ${bio.betaCaroteneUgMl} µg/mL beta-carotene & ${bio.dryCellWeightMg} mg dry cell weight across ${bio.protocol.replicates} zero-contamination replicates.`
                  : `ASSAY FAILURE: Returned sample metrics (${bio.betaCaroteneUgMl} µg/mL beta-carotene, ${bio.dryCellWeightMg} mg DCW) fell below BioNutrients-2 publication thresholds.`
              }
            ]
          : [
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

        if (missionEvent) {
          phases.push({
            phase: `PHASE ${phases.length + 1} · SEEDED ANOMALY: ${missionEvent.title}`,
            ok: missionEvent.ok,
            metric: missionEvent.metric,
            detail: missionEvent.detail
          });
        }

        const allNominal = isBio
          ? (phases.every((p) => p.ok) && bio.bioOk && t.overallScore >= 75)
          : (phases.every((p) => p.ok) && t.disposalOk && t.telescopeOk && t.overallScore >= 75);

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}

          <div style="padding:10px 12px;border-radius:8px;background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.28);margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
              <span style="font-family:monospace;font-size:9.5px;font-weight:700;color:#ddd6fe;">
                ${t.analogue.agencyTag} HERITAGE MATCH: <strong style="color:#ffffff;">${t.analogue.missions}</strong>
              </span>
              <span style="font-family:monospace;font-size:9.5px;color:#7dd3fc;">
                ${t.disposalOk ? `PASS EoM ${t.disposal.deorbitYears} yr COMPLIANT` : "WARN EoM NON-COMPLIANT"}
              </span>
            </div>
            <canvas id="sim-science-canvas" width="700" height="150" style="width:100%;height:150px;border-radius:6px;border:1px solid rgba(103,232,249,0.28);display:block;margin-bottom:8px;"></canvas>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;">
              ${t.riskMatrix.map((r) => `
                <div style="padding:5px 7px;border-radius:5px;background:rgba(0,0,0,0.35);border-left:3px solid ${r.level === "GREEN" ? "#4ade80" : r.level === "AMBER" ? "#fbbf24" : "#ef4444"};">
                  <div style="font-family:monospace;font-size:8.5px;font-weight:700;color:#e2e8f0;">${r.subsystem} (${r.level})</div>
                  <div style="font-family:monospace;font-size:8px;color:#94a3b8;">L:${r.likelihood} / C:${r.consequence}</div>
                </div>
              `).join("")}
            </div>
          </div>

          ${missionEvent ? `
            <div style="padding:10px 12px;border-radius:8px;background:${missionEvent.ok ? "rgba(74,222,128,0.07)" : "rgba(239,68,68,0.08)"};border:1px solid ${missionEvent.ok ? "rgba(74,222,128,0.4)" : "rgba(239,68,68,0.45)"};margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-family:monospace;font-size:9.5px;font-weight:800;letter-spacing:1.1px;color:${missionEvent.ok ? "#86efac" : "#fca5a5"};">
                  SEEDED MISSION ANOMALY · ${missionEvent.severity} · SEED ${missionSeed}
                </span>
                <span style="font-family:monospace;font-size:9px;font-weight:800;padding:2px 7px;border-radius:4px;background:${missionEvent.ok ? "rgba(74,222,128,0.16)" : "rgba(239,68,68,0.16)"};color:${missionEvent.ok ? "#4ade80" : "#f87171"};">
                  ${missionEvent.ok ? "SURVIVED" : "FAILED"}
                </span>
              </div>
              <div style="font-size:13px;font-weight:700;color:#f8fafc;margin-top:3px;">${missionEvent.title}</div>
              <div style="font-size:11px;color:#cbd5e1;line-height:1.45;margin-top:3px;">${missionEvent.situation}</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:6px;margin-top:7px;">
                <div style="font-family:monospace;font-size:9.5px;color:${missionEvent.ok ? "#86efac" : "#fbbf24"};">CONSTRAINT: ${missionEvent.metric}</div>
                <div style="font-family:monospace;font-size:9.5px;color:#94a3b8;">MITIGATION: ${missionEvent.mitigation}</div>
              </div>
            </div>
          ` : ""}

          <div style="padding:12px;border-radius:8px;background:rgba(0,0,0,0.42);border:1px solid rgba(255,255,255,0.12);margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
              <span style="font-family:monospace;font-size:10.5px;font-weight:700;letter-spacing:1.4px;color:#67e8f9;">
                INTEGRATED FLIGHT SIMULATION & POST-MISSION ENGINEERING REPORT
              </span>
              <span style="font-family:monospace;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:${allNominal ? "rgba(74,222,128,0.15)" : "rgba(251,191,36,0.15)"};color:${allNominal ? "#4ade80" : "#fbbf24"};">
                ${allNominal ? "MISSION RATING: GRADE A (FLIGHT QUALIFIED)" : `MISSION RATING: ${t.overallScore}/100 (NEEDS REFINEMENT)`}
              </span>
            </div>

            <div style="display:flex;flex-direction:column;gap:7px;">
              ${phases
                .map(
                  (p) => `
                  <div style="padding:9px 11px;border-radius:6px;background:rgba(255,255,255,0.025);border-left:3px solid ${p.ok ? "#4ade80" : "#ef4444"};">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                      <span style="font-family:monospace;font-size:10px;font-weight:700;color:${p.ok ? "#a7f3d0" : "#fca5a5"};">
                        ${p.ok ? "[PASS] " : "[FAIL] "}${p.phase}
                      </span>
                      <span style="font-family:monospace;font-size:9.5px;color:#cbd5e1;">${p.metric}</span>
                    </div>
                    <div style="font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.4;">${p.detail}</div>
                  </div>
                `
                )
                .join("")}
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" id="btn-sim-lunar-3d" style="padding:9px 12px;border-radius:4px;border:1px solid rgba(56,189,248,0.45);background:rgba(37,99,235,0.14);color:#93c5fd;font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
                LUNAR 3D [K]
              </button>
              <button type="button" id="btn-sim-export-json" style="padding:9px 12px;border-radius:4px;border:1px solid rgba(148,163,184,0.28);background:rgba(255,255,255,0.04);color:#cbd5e1;font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
                EXPORT MDL (.JSON)
              </button>
              <button type="button" id="btn-sim-export-gmat" style="padding:9px 12px;border-radius:4px;border:1px solid rgba(103,232,249,0.45);background:rgba(103,232,249,0.12);color:#67e8f9;font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
                EXPORT GMAT (.SCRIPT)
              </button>
              <button type="button" id="btn-sim-edit-arch" style="padding:9px 12px;border-radius:4px;border:1px solid rgba(148,163,184,0.28);background:rgba(255,255,255,0.04);color:#f8fafc;font-family:monospace;font-size:10px;font-weight:700;cursor:pointer;">
                EDIT DESIGN
              </button>
            </div>
            <button type="button" id="btn-commit-sim" style="padding:10px 22px;border-radius:6px;border:1px solid ${allNominal ? "#4ade80" : "#fbbf24"};background:${allNominal ? "#ece7dc" : "rgba(251,191,36,0.22)"};color:${allNominal ? "#05060a" : "#fef08a"};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.4px;cursor:pointer;">
              ${allNominal ? "LAUNCH FULL MISSION SIMULATION & COMPLETE" : "COMPLETE WITH CURRENT DESIGN (" + t.overallScore + "/100)"}
            </button>
          </div>
        `;

        const btnExportSim = container.querySelector("#btn-sim-export-json");
        if (btnExportSim) {
          btnExportSim.addEventListener("click", () => this.exportMdlPointDesignJson());
        }

        const btnExportGmat = container.querySelector("#btn-sim-export-gmat");
        if (btnExportGmat) {
          btnExportGmat.addEventListener("click", () => {
            if (window.csaNasaLab && typeof window.csaNasaLab.exportGmatScript === "function") {
              window.csaNasaLab.exportGmatScript();
            }
          });
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
        checklistTitle.textContent = window.isMobileDevice ? "OBJECTIVES" : "MISSION OBJECTIVES";
      }

      let completedCount = 0;
      this.tasks.forEach((t) => {
        if (t.completed) completedCount++;
      });
      if (countPill) {
        countPill.textContent = `${completedCount}/${this.tasks.length}`;
      }

      if (window.shipInterior && typeof window.shipInterior.syncStationFaults === "function") {
        window.shipInterior.syncStationFaults(this.tasks);
      }

      if (!container) return;
      container.innerHTML = "";

      const completedSet = new Set((mission && mission.completedObjectives) || []);

      this.tasks.forEach((t) => {
        const isCompleted = mission ? completedSet.has(t.id) : t.completed;
        const isAvailable = this.isTaskAvailable(t.id, mission);
        const isLocked = !isCompleted && !isAvailable;
        const lockReason = isLocked ? this.getTaskLockReason(t.id, mission) : "";
        const phase = mission && mission.phase;
        const phaseLocked = !isCompleted && !!phase && phase !== "station" && t.id !== "task_antenna";
        const isBlocked = isLocked || phaseLocked;
        const blockedReason = phaseLocked ? "AVAILABLE INSIDE THE STATION" : lockReason;

        const assign = this._getRoleAssignment(t.role);
        const item = document.createElement("div");
        item.className = `task-checklist-item ${isCompleted ? "done" : ""} ${isBlocked ? "locked" : ""} ${assign.isMine && !isCompleted ? "is-my-role" : ""}`;
        item.style.cursor = isBlocked ? "not-allowed" : "pointer";
        item.style.opacity = isBlocked ? "0.5" : "1";
        if (assign.isMine && !isCompleted && !isBlocked) {
          item.style.borderColor = "rgba(103, 232, 249, 0.45)";
        }
        item.title = isBlocked
          ? blockedReason
          : (isCompleted ? `Completed — click to review (${assign.badgeText})` : `Owner: ${assign.badgeText} — Click to open console`);

        let badgeCls = "badge-all";
        if (assign.role === "flight_director") badgeCls = "badge-fdir";
        else if (assign.role === "ground_capcom") badgeCls = "badge-cap";
        else if (assign.role === "commander") badgeCls = "badge-cmd";
        else if (assign.role === "engineer") badgeCls = "badge-eng";
        else if (assign.role === "scientist") badgeCls = "badge-sci";
        else if (assign.role === "specialist") badgeCls = "badge-spc";
        const roleBadge = `<span class="task-badge ${badgeCls}">${this._escapeHtml(assign.badgeText)}</span>`;

        let statusIcon = "[ ]";
        if (isCompleted) statusIcon = "DONE";
        else if (phaseLocked) statusIcon = "ORBIT";
        else if (isLocked) statusIcon = "LOCK";
        else statusIcon = "OPEN";

        item.innerHTML = `
          <div class="task-status-icon" style="font-size:8px;font-family:var(--font-mono,monospace);font-weight:700;letter-spacing:0.4px;width:auto;min-width:34px;color:${isCompleted ? "#86efac" : isBlocked ? "#94a3b8" : "#93c5fd"};">${statusIcon}</div>
          <div class="task-item-content">
            <div class="task-title-row">
              <span class="task-title-text">${t.name}</span>
              ${roleBadge}
            </div>
            <div class="task-location-row">
              <span class="task-loc-pin">LOC</span>
              <span class="task-loc-text">${t.location}</span>
            </div>
            ${isBlocked && blockedReason ? `<div class="task-location-row" style="color:#fbbf24;font-size:9px;">[${phaseLocked ? "ORBIT" : "LOCK"}] ${blockedReason}</div>` : ""}
          </div>
        `;
        item.addEventListener("click", () => {
          if (isBlocked) {
            if (window.gameplay) window.gameplay.showToast(`${phaseLocked ? "[ORBIT]" : "[LOCK]"} ${blockedReason || "COMPLETE THE PRIOR OBJECTIVE FIRST"}`);
            if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
            return;
          }
          this.openTaskModal(t);
        });
        container.appendChild(item);
      });
      if (typeof window.renderHudCrewRoster === "function") {
        window.renderHudCrewRoster();
      }
    }

    getGroundTelemetrySummary() {
      const completed = Array.isArray(this.tasks) ? this.tasks.filter((t) => t && t.completed).length : 0;
      const total = Array.isArray(this.tasks) ? this.tasks.length : 0;
      let readiness = 0;
      try {
        const evalSummary = this.evaluateMissionDesign();
        readiness = evalSummary && Number.isFinite(evalSummary.overallScore) ? evalSummary.overallScore : 0;
      } catch (e) {
        readiness = 0;
      }
      return { completed, total, readiness };
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
        title.style.color = "#67e8f9";
      }
      if (icon) icon.textContent = "LUNASPIS // MISSION DEBRIEF";
      if (msg) {
        msg.textContent = reason || `${scenarioName} — all ${totalCount} shared objectives verified by the crew.`;
      }

      if (details) {
        const crew = Array.isArray(data.crew) ? data.crew : [];
        const crewRows = crew.map((member) => `
          <div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="color:#ece7dc;">${this._escapeHtml(member.name || "Astronaut")}</span>
            <span style="color:#9aa4ae;font-family:monospace;font-size:10px;">${this._escapeHtml(String(member.role || "crew").toUpperCase())} · ${Number(member.tasksDone || 0)} TASKS</span>
          </div>
        `).join("");
        const evalSummary = this.evaluateMissionDesign();
        details.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(2,minmax(150px,1fr));gap:8px;margin-bottom:10px;text-align:left;">
            <div style="padding:8px 10px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.03);">
              <div style="font-family:monospace;font-size:9px;color:#9aa4ae;letter-spacing:1px;">MISSION TIME</div>
              <div style="font-family:monospace;font-size:15px;color:#67e8f9;">${durationText}</div>
            </div>
            <div style="padding:8px 10px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.03);">
              <div style="font-family:monospace;font-size:9px;color:#9aa4ae;letter-spacing:1px;">OBJECTIVES & SCORE</div>
              <div style="font-family:monospace;font-size:15px;color:#34d399;">${completedCount} / ${totalCount} (${evalSummary.overallScore}/100)</div>
            </div>
            <div style="padding:8px 10px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.03);">
              <div style="font-family:monospace;font-size:9px;color:#9aa4ae;letter-spacing:1px;">DIFFICULTY / READINESS</div>
              <div style="font-family:monospace;font-size:12px;color:#fbbf24;">${this._escapeHtml(difficulty)} · STAGE ${evalSummary.cmlLevel}${evalSummary.cml ? ` (${evalSummary.cml.activeSummary.percentGreen}% @ Stage ${evalSummary.cml.targetCml})` : ""}</div>
            </div>
            <div style="padding:8px 10px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.03);">
              <div style="font-family:monospace;font-size:9px;color:#9aa4ae;letter-spacing:1px;">FLIGHT CREW</div>
              <div style="font-family:monospace;font-size:12px;color:#ece7dc;">${crew.length} ASTRONAUTS</div>
            </div>
          </div>
          <div style="padding:8px 10px;border-radius:6px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.3);margin-bottom:10px;text-align:left;font-size:11px;color:#e2e8f0;">
            <div style="font-family:monospace;font-size:9px;color:#c4b5fd;font-weight:700;letter-spacing:0.8px;">${evalSummary.analogue.agencyTag} INSPIRATION &amp; SCIENCE GOAL</div>
            <div style="margin-top:2px;"><strong>${evalSummary.analogue.missions}</strong> — ${evalSummary.analogue.productTitle}</div>
            <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-family:monospace;font-size:9.5px;color:#86efac;">Clean Retirement: ${evalSummary.disposal.name.split("(")[0].trim()} (${evalSummary.disposal.deorbitYears} yr)</span>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button type="button" id="btn-victory-open-cml" style="padding:4px 9px;border-radius:4px;border:1px solid rgba(251,191,36,0.55);background:rgba(245,158,11,0.16);color:#fde68a;font-family:monospace;font-size:9.5px;font-weight:700;cursor:pointer;">READINESS REPORT</button>
                <button type="button" id="btn-victory-export-mdl" style="padding:4px 9px;border-radius:4px;border:1px solid rgba(103,232,249,0.5);background:rgba(103,232,249,0.14);color:#7dd3fc;font-family:monospace;font-size:9.5px;font-weight:700;cursor:pointer;">DOWNLOAD BLUEPRINT (.JSON)</button>
              </div>
            </div>
          </div>
          <div style="font-family:monospace;font-size:9px;color:#9aa4ae;letter-spacing:0.8px;margin-bottom:8px;text-align:left;">
            LAUNCH: <span style="color:#ece7dc;">${this._escapeHtml(data.launchedBy || "—")}</span>
            &nbsp;·&nbsp; DOCKING: <span style="color:#ece7dc;">${this._escapeHtml(data.dockedBy || "—")}</span>
          </div>
          ${this.lastMissionEvent ? `
            <div style="margin-bottom:8px;padding:7px 10px;border-radius:5px;background:${this.lastMissionEvent.ok ? "rgba(74,222,128,0.08)" : "rgba(239,68,68,0.1)"};border:1px solid ${this.lastMissionEvent.ok ? "rgba(74,222,128,0.35)" : "rgba(239,68,68,0.4)"};font-family:monospace;font-size:9.5px;color:${this.lastMissionEvent.ok ? "#86efac" : "#fca5a5"};text-align:left;">
              SEEDED ANOMALY · ${this._escapeHtml(this.lastMissionEvent.title)} · ${this.lastMissionEvent.ok ? "SURVIVED" : "FAILED"} — ${this._escapeHtml(this.lastMissionEvent.metric)}
            </div>
          ` : ""}
          <div style="font-family:monospace;font-size:10px;color:#9aa4ae;letter-spacing:1px;margin-bottom:4px;text-align:left;">CREW MANIFEST</div>
          <div style="text-align:left;max-height:130px;overflow:auto;margin-bottom:6px;">${crewRows}</div>
        `;
        const btnVCml = details.querySelector("#btn-victory-open-cml");
        if (btnVCml) {
          btnVCml.addEventListener("click", () => {
            if (modal) modal.style.display = "none";
            this.openCmlWorkbench("checklist");
          });
        }
        const btnVExp = details.querySelector("#btn-victory-export-mdl");
        if (btnVExp) {
          btnVExp.addEventListener("click", () => this.exportMdlPointDesignJson());
        }
      }

      const isHost = !!(window.netManager && window.netManager.isHost);
      if (btnNext) {
        btnNext.disabled = !isHost;
        btnNext.style.opacity = isHost ? "1" : "0.5";
        btnNext.style.cursor = isHost ? "pointer" : "not-allowed";
        btnNext.textContent = isHost ? "NEXT MISSION →" : "WAITING FOR HOST...";
        btnNext.onclick = () => {
          if (isHost && window.netManager && typeof window.netManager.returnToLobby === "function") {
            window.netManager.returnToLobby();
          }
        };
      }
      if (btnClose) {
        btnClose.textContent = "REVIEW STATION [Y]";
        btnClose.title = "Hide the debrief — press [Y] to reopen it";
        btnClose.onclick = () => {
          if (modal) modal.style.display = "none";
        };
      }

      if (modal) {
        modal.style.background = "rgba(3, 7, 18, 0.88)";
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
      this.cmlState = {
        targetCml: 4,
        assessorSignedOff: false,
        overrides: {},
        notes: { launchWindowDays: "20" }
      };
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
