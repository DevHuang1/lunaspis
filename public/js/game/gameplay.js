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
    artemis_expedition: {
      id: "artemis_expedition",
      name: "Artemis Lunar Expedition (Training)",
      code: "ARTEMIS",
      badge: "LUNAR EXPEDITION",
      isArtemis: true,
      baseBudgetM: 3200,
      targetLifetimeMonths: 1,
      recommendedOrbits: ["lunar_polar_100"],
      requiredScienceTypes: ["optical", "spectrometer"],
      minDeltaV: 3800,
      minRadiationKrad: 55,
      summary: "Launch on SLS, fly Orion to lunar orbit, dock with a Blue Moon-style lander, land at the south pole, return samples, and splash down. Dated training scenario, not an exact reconstruction.",
      tradeoffTip: "This is a flight expedition, not a design study. The mission uses a dated Blue Moon-style lunar-rendezvous architecture and clearly labelled training assumptions."
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

  // Compact, scannable mission identity used by both the lobby and the
  // Mission Architecture desk. The old two-sentence pitches are still
  // available through scenario.summary for briefing/detail views, but the
  // picker leads with destination, job, risk, one short goal and two numbers.
  const STARTER_MISSION_IDS = ["artemis_expedition", "cubesat_101", "bionutrients_2", "sandbox"];

  const MISSION_PRESENTATION = {
    artemis_expedition: {
      title: "ARTEMIS EXPEDITION",
      destination: "MOON",
      job: "LAND & RETURN",
      risk: "DEEP SPACE",
      goal: "Land at the south pole and bring the crew home.",
      accent: "#fbbf24",
      art: "moon",
      riskIcon: "signal"
    },
    cubesat_101: {
      title: "POCKET SAT",
      destination: "LOW ORBIT",
      job: "BUILD SAT",
      risk: "TINY BUDGET",
      goal: "Build a shoebox satellite that lasts.",
      accent: "#7fb8a6",
      art: "cubesat",
      riskIcon: "wallet"
    },
    bionutrients_2: {
      title: "VITAMIN LAB",
      destination: "STATION",
      job: "GROW YEAST",
      risk: "KEEP WARM",
      goal: "Water, warm and freeze yeast for Vitamin A.",
      accent: "#fb7185",
      art: "bio",
      riskIcon: "thermo"
    },
    sandbox: {
      title: "FREE BUILD",
      destination: "ANYWHERE",
      job: "EXPERIMENT",
      risk: "NO LIMITS",
      goal: "Mix any parts with a huge budget.",
      accent: "#94a3b8",
      art: "sandbox",
      riskIcon: "spark"
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
    artemis_expedition: {
      missions: "NASA Artemis Program (Orion & Human Landing System)",
      productTitle: "Crewed South-Pole Landing, Surface Samples & Safe Return",
      agencyTag: "LUNAR EXPEDITION"
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
          role: "specialist",
          resource: "science",
          requires: ["task_hull", "task_lss"],
          completed: false
        }
      ];

      // Complete Space Mission Design State (modifiable across all consoles)
      this.missionDesign = {
        scenarioId: "cubesat_101",
        difficultyId: "engineer",
        orbitId: "iss_cubesat_418",
        launchVehicleId: "electron_light",
        busId: "smallsat_12u",
        powerId: "deployable_rosa",
        batteryId: "li_ion_320",
        instruments: ["inst_multispectral", "inst_mag"],
        thermalId: "passive_mli",
        commsId: "s_band_omni",
        groundNetId: "near_space_net",
        propulsionId: "hydrazine_mono",
        wavelengthId: "near_ir",
        cubesatFormId: "6u",
        disposalId: "drag_sail",
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
      this.missionPickerExpanded = false;

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
      this.nearbyMissionDiorama = false;
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

    getMissionPresentation(scenarioId) {
      const fallback = {
        title: "MISSION",
        destination: "SPACE",
        job: "EXPLORE",
        risk: "UNKNOWN",
        goal: "Choose a destination and a science goal.",
        accent: "#67e8f9",
        art: "moon",
        riskIcon: "signal"
      };
      return Object.assign({}, fallback, MISSION_PRESENTATION[scenarioId] || {});
    }

    getStarterMissionIds() {
      return STARTER_MISSION_IDS.slice();
    }

    renderMissionPickCard(scenario, options = {}) {
      if (!scenario) return "";
      const p = this.getMissionPresentation(scenario.id);
      const active = !!options.active;
      const canSelect = options.canSelect !== false;
      const budgetM = Number.isFinite(options.budgetM)
        ? Math.max(0, Math.round(options.budgetM))
        : Math.max(0, Math.round(Number(scenario.baseBudgetM) || 0));
      const months = Math.max(0, Math.round(Number(scenario.targetLifetimeMonths) || 0));
      const extraClass = options.className ? ` ${options.className}` : "";
      return `
        <button type="button" class="mission-pick-card md-scenario-card${active ? " is-active" : ""}${extraClass}"
          data-id="${this._escapeHtml(scenario.id)}"
          data-scenario-id="${this._escapeHtml(scenario.id)}"
          aria-pressed="${active}"
          aria-disabled="${canSelect ? "false" : "true"}"
          title="${this._escapeHtml(scenario.summary || p.goal)}"
          style="--mission-accent:${this._escapeHtml(p.accent)};">
          <span class="mission-pick-card__visual" aria-hidden="true">
            ${this._missionArt(p.art)}
            <span class="mission-pick-card__dest">${this._escapeHtml(p.destination)}</span>
          </span>
          <span class="mission-pick-card__body">
            <span class="mission-pick-card__top">
              <span class="mission-pick-card__title">${this._escapeHtml(p.title)}</span>
              ${active ? `<span class="mission-pick-card__check" aria-hidden="true">&#10003;</span>` : ""}
            </span>
            <span class="mission-pick-card__goal">${this._escapeHtml(p.goal)}</span>
            <span class="mission-pick-card__signals">
              <span class="mission-pick-signal">${this._missionSignalIcon("target")}${this._escapeHtml(p.job)}</span>
              <span class="mission-pick-signal is-risk">${this._missionSignalIcon(p.riskIcon)}${this._escapeHtml(p.risk)}</span>
            </span>
            <span class="mission-pick-card__stats">
              <span class="mission-pick-stat">${this._missionStatIcon("budget")}<b>$${budgetM}M</b></span>
              <span class="mission-pick-stat">${this._missionStatIcon("clock")}<b>${months} MO</b></span>
            </span>
          </span>
        </button>
      `;
    }

    _missionArt(kind) {
      const common = `viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg"`;
      if (kind === "earth") {
        return `<svg ${common}>
          <circle cx="48" cy="47" r="26" fill="currentColor" opacity=".13"/>
          <path d="M26 37c5-3 11-2 14 2 4 4 2 9 6 12 3 2 7 1 9 5 2 4-1 8-5 10-9 4-19-1-24-9-3-6-3-14 0-20Z" fill="currentColor" opacity=".52"/>
          <path d="M55 25c7 1 12 6 15 11-4 2-8 1-11-1-3-3-4-6-4-10Z" fill="currentColor" opacity=".38"/>
          <path d="M20 65c8 8 19 11 30 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
          <circle cx="48" cy="47" r="26" stroke="currentColor" stroke-width="1.5" opacity=".8"/>
          <ellipse cx="48" cy="48" rx="41" ry="13" transform="rotate(-18 48 48)" stroke="currentColor" stroke-width="1" stroke-dasharray="2 4" opacity=".5"/>
          <circle cx="16" cy="57" r="2" fill="#fde68a"/>
          <path d="M73 24l1.2 3.4L78 28.5l-3.8 1.1L73 33l-1.2-3.4L68 28.5l3.8-1.1L73 24Z" fill="#fde68a"/>
        </svg>`;
      }
      if (kind === "asteroid") {
        return `<svg ${common}>
          <path d="M29 36l10-10 17-3 12 6 8 13-3 17-11 10-18 2-13-9-5-13 3-13Z" fill="currentColor" opacity=".16"/>
          <path d="M29 36l10-10 17-3 12 6 8 13-3 17-11 10-18 2-13-9-5-13 3-13Z" stroke="currentColor" stroke-width="1.5" opacity=".85"/>
          <circle cx="38" cy="38" r="6" fill="currentColor" opacity=".32"/>
          <circle cx="54" cy="55" r="4" fill="currentColor" opacity=".4"/>
          <circle cx="43" cy="57" r="2.5" fill="currentColor" opacity=".28"/>
          <path d="M18 21c12-10 30-12 44-3" stroke="currentColor" stroke-width="1" stroke-dasharray="2 4" opacity=".5"/>
          <path d="M57 16l5 2-2 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
          <path d="M70 20l1.1 3.1L74 24.2l-2.9.9L70 28l-1.1-2.9L66 24.2l2.9-1.1L70 20Z" fill="#fde68a"/>
        </svg>`;
      }
      if (kind === "telescope") {
        return `<svg ${common}>
          <path d="M25 55l27-19 10 15-27 19z" fill="currentColor" opacity=".17"/>
          <path d="M25 55l27-19 10 15-27 19z" stroke="currentColor" stroke-width="1.5" opacity=".9"/>
          <path d="M52 36l6-4 10 15-6 4M25 55l-3 6M62 51l3 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>
          <circle cx="59" cy="31" r="6" fill="currentColor" opacity=".22" stroke="currentColor" stroke-width="1.2"/>
          <path d="M20 72h56M32 72l4-9M64 72l-4-9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>
          <path d="M72 20l1.3 3.5L77 24.8l-3.7 1.3L72 30l-1.3-3.9L67 24.8l3.7-1.3L72 20Z" fill="#fde68a"/>
          <circle cx="80" cy="39" r="1.5" fill="#fde68a"/>
        </svg>`;
      }
      if (kind === "cubesat") {
        return `<svg ${common}>
          <rect x="33" y="38" width="30" height="24" rx="3" fill="currentColor" opacity=".16"/>
          <rect x="33" y="38" width="30" height="24" rx="3" stroke="currentColor" stroke-width="1.5" opacity=".9"/>
          <rect x="35" y="46" width="26" height="8" fill="currentColor" opacity=".35"/>
          <path d="M33 43H18v14h15M63 43h15v14H63" fill="currentColor" opacity=".17"/>
          <path d="M33 43H18v14h15M63 43h15v14H63" stroke="currentColor" stroke-width="1.3" opacity=".8"/>
          <path d="M25 43v14M71 43v14" stroke="currentColor" stroke-width=".9" opacity=".45"/>
          <path d="M48 38V24M48 24l7-5M48 24l-7-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>
          <circle cx="48" cy="19" r="2" fill="#fde68a"/>
          <path d="M20 72c12-6 26-8 40-5" stroke="currentColor" stroke-width="1" stroke-dasharray="2 4" opacity=".4"/>
        </svg>`;
      }
      if (kind === "bio") {
        return `<svg ${common}>
          <circle cx="48" cy="48" r="35" fill="currentColor" opacity=".045"/>
          <path d="M38 24h20l5 44c.7 6.2-3.6 11-9.6 11h-10.8c-6 0-10.3-4.8-9.6-11l5-44Z" fill="currentColor" opacity=".13"/>
          <path d="M38 24h20l5 44c.7 6.2-3.6 11-9.6 11h-10.8c-6 0-10.3-4.8-9.6-11l5-44Z" stroke="currentColor" stroke-width="1.5" opacity=".9"/>
          <path d="M41 30h14" stroke="currentColor" stroke-width="1.1" opacity=".55"/>
          <path d="M27 25c-3.2 4.3-4.8 6.8-4.8 9.1a4.8 4.8 0 0 0 9.6 0c0-2.3-1.6-4.8-4.8-9.1Z" fill="#67e8f9" opacity=".9"/>
          <path d="M25 34c.2 1.2 1 2 2.1 2.3" stroke="#e0f2fe" stroke-width=".8" stroke-linecap="round" opacity=".9"/>
          <circle cx="44" cy="47" r="2" fill="#86efac"/>
          <circle cx="52" cy="55" r="2.4" fill="#fb923c"/>
          <circle cx="45" cy="62" r="1.6" fill="#fb923c"/>
          <circle cx="53" cy="41" r="1.3" fill="#86efac"/>
          <g transform="translate(66 34)">
            <path d="M0 0v18a5 5 0 1 0 6 0V0a3 3 0 0 0-6 0Z" fill="#fbbf24" fill-opacity=".14" stroke="#fbbf24" stroke-width="1.1"/>
            <path d="M3 4v14" stroke="#fbbf24" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="3" cy="22" r="2.6" fill="#fbbf24"/>
          </g>
          <g transform="translate(68 72)" stroke="#67e8f9" stroke-width="1.2" stroke-linecap="round" opacity=".9">
            <path d="M0-6V6M-5.2-3L5.2 3M-5.2 3L5.2-3"/>
          </g>
          <path d="M26 60l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z" fill="#fde68a" opacity=".9"/>
        </svg>`;
      }
      if (kind === "sandbox") {
        return `<svg ${common}>
          <circle cx="48" cy="49" r="25" stroke="currentColor" stroke-width="1" stroke-dasharray="3 4" opacity=".5"/>
          <path d="M31 60l17-27 17 27H31Z" fill="currentColor" opacity=".14"/>
          <path d="M31 60l17-27 17 27H31Z" stroke="currentColor" stroke-width="1.5" linejoin="round" opacity=".85"/>
          <path d="M48 33v19M40 55h16" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".6"/>
          <circle cx="72" cy="27" r="8" stroke="currentColor" stroke-width="1.2" opacity=".65"/>
          <path d="M72 21v12M66 27h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>
          <circle cx="21" cy="36" r="2" fill="#fde68a"/>
          <path d="M26 70l1.1 3.1L30 74.2l-2.9.9L26 78l-1.1-2.9L22 74.2l2.9-1.1L26 70Z" fill="#fde68a"/>
        </svg>`;
      }
      return `<svg ${common}>
        <circle cx="48" cy="45" r="27" fill="currentColor" opacity=".12"/>
        <path d="M22 54c5 14 19 23 34 20 8-1.5 15-6 20-13-8 4-18 5-28 1-9-4-16-11-20-20-4 4-7 8-6 12Z" fill="currentColor" opacity=".22"/>
        <circle cx="48" cy="45" r="27" stroke="currentColor" stroke-width="1.5" opacity=".8"/>
        <circle cx="38" cy="36" r="5" fill="currentColor" opacity=".5"/>
        <circle cx="58" cy="50" r="3.5" fill="currentColor" opacity=".4"/>
        <circle cx="43" cy="57" r="2.5" fill="currentColor" opacity=".35"/>
        <path d="M18 76h60" stroke="currentColor" stroke-width="1" opacity=".25"/>
        <path d="M28 72l4-7 4 7M32 65v11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M65 30l1.2 3.4L70 34.5l-3.8 1.1L65 39l-1.2-3.4L60 34.5l3.8-1.1L65 30Z" fill="#fde68a"/>
      </svg>`;
    }

    renderBioMissionStoryboard(variant = "hub") {
      const panels = [
        {
          kicker: "01 · LAUNCH",
          title: "Fly the yeast kit",
          copy: "Sealed dry yeast pouches ride a cargo ship to the Station.",
          accent: "#67e8f9",
          art: `<svg viewBox="0 0 220 132" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 108c30-2 54-12 72-30 16-16 34-26 58-31" stroke="#67e8f9" stroke-width="1.1" stroke-dasharray="3 5" opacity=".45"/>
            <path d="M8 132c8-24 30-38 58-36" stroke="#38bdf8" stroke-width="1.2" opacity=".3"/>
            <circle cx="25" cy="28" r="1.2" fill="#e2e8f0" opacity=".55"/>
            <circle cx="47" cy="18" r=".9" fill="#e2e8f0" opacity=".4"/>
            <circle cx="188" cy="96" r="1" fill="#e2e8f0" opacity=".45"/>
            <circle cx="205" cy="30" r="1.4" fill="#fde68a" opacity=".8"/>
            <g stroke="#94a3b8" stroke-width="1.2" opacity=".85">
              <rect x="165" y="18" width="34" height="9" rx="2.5" fill="#1e293b"/>
              <path d="M151 22h14M199 22h14M143 14v16M207 14v16" opacity=".65"/>
              <rect x="173" y="9" width="18" height="5" rx="1.5" fill="#334155"/>
            </g>
            <g transform="translate(64 50) rotate(-22)">
              <rect x="0" y="0" width="64" height="28" rx="9" fill="#0f172a" stroke="#cbd5e1" stroke-width="1.3"/>
              <rect x="14" y="-9" width="36" height="9" rx="3" fill="#111827" stroke="#67e8f9" stroke-width="1.2"/>
              <path d="M6 14h52" stroke="#475569" stroke-width="1"/>
              <rect x="17" y="5" width="30" height="17" rx="4" fill="#fb7185" fill-opacity=".14" stroke="#fb7185" stroke-width="1.2"/>
              <circle cx="25" cy="13.5" r="1.7" fill="#fb7185"/>
              <circle cx="32" cy="10" r="1.2" fill="#fb7185"/>
              <circle cx="38" cy="16" r="1.4" fill="#fb7185"/>
              <path d="M-5 6h5v15h-5zM64 6h5v15h-5z" fill="#1d4ed8" fill-opacity=".28" stroke="#60a5fa" stroke-width="1"/>
            </g>
            <g transform="translate(26 72) rotate(7)">
              <rect x="0" y="0" width="26" height="34" rx="6" fill="#fb7185" fill-opacity=".1" stroke="#fb7185" stroke-width="1.2"/>
              <path d="M6 7h14" stroke="#fda4af" stroke-width="1.1" opacity=".8"/>
              <circle cx="10" cy="17" r="1.3" fill="#fda4af"/>
              <circle cx="16" cy="21" r="1.1" fill="#fda4af"/>
              <circle cx="13" cy="27" r="1" fill="#86efac"/>
            </g>
          </svg>`
        },
        {
          kicker: "02 · HYDRATE",
          title: "Add clean water",
          copy: "Filtered water wakes the sleeping yeast inside each pouch.",
          accent: "#38bdf8",
          art: `<svg viewBox="0 0 220 132" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M26 116h168" stroke="#475569" stroke-width="1" opacity=".35"/>
            <path d="M78 30h64l8 69c.8 8-5 14-13 14H83c-8 0-14-6-13-14l8-69Z" fill="#67e8f9" fill-opacity=".06" stroke="#67e8f9" stroke-width="1.5"/>
            <path d="M78 30h64" stroke="#a5f3fc" stroke-width="1.2" opacity=".9"/>
            <rect x="92" y="21" width="36" height="9" rx="3" fill="#0f172a" stroke="#67e8f9" stroke-width="1.1" opacity=".95"/>
            <path d="M74 84c11 4 23 6 36 6 14 0 27-2 39-6l2 15c.8 8-5 14-13 14H83c-8 0-14-6-13-14l2-15Z" fill="#38bdf8" fill-opacity=".18"/>
            <g transform="translate(104 2)">
              <rect x="0" y="0" width="12" height="26" rx="3" fill="#e2e8f0" fill-opacity=".12" stroke="#cbd5e1" stroke-width="1.1"/>
              <rect x="2" y="13" width="8" height="11" rx="2" fill="#67e8f9" fill-opacity=".45"/>
              <path d="M6 26v12" stroke="#cbd5e1" stroke-width="1.3"/>
              <path d="M-2 0h16" stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round"/>
              <path d="M0 4h12" stroke="#94a3b8" stroke-width="1" opacity=".6"/>
            </g>
            <g transform="translate(88 34)">
              <circle cx="0" cy="0" r="8" fill="#0f172a" stroke="#a5f3fc" stroke-width="1.1"/>
              <path d="M-6-4L6 4M-6 4L6-4" stroke="#67e8f9" stroke-width=".8" opacity=".7"/>
            </g>
            <g fill="#86efac">
              <circle cx="96" cy="62" r="2.2"/>
              <circle cx="110" cy="70" r="1.6"/>
              <circle cx="124" cy="60" r="2"/>
              <circle cx="117" cy="83" r="1.4"/>
            </g>
            <g fill="#7dd3fc" opacity=".85">
              <path class="bio-drift" d="M132 52c-2.6 3.4-4 5.6-4 7.5a4 4 0 0 0 8 0c0-1.9-1.4-4.1-4-7.5Z"/>
              <path class="bio-drift bio-drift--slow" d="M91 84c-2 2.6-3 4.3-3 5.8a3 3 0 0 0 6 0c0-1.5-1-3.2-3-5.8Z" opacity=".7"/>
            </g>
            <path d="M146 40c8 2 13 7 16 14" stroke="#67e8f9" stroke-width="1" stroke-dasharray="2 4" opacity=".4"/>
            <circle cx="166" cy="58" r="2" fill="#67e8f9" opacity=".5"/>
          </svg>`
        },
        {
          kicker: "03 · WARM & SHAKE",
          title: "Hold 30°C",
          copy: "Warm the pouches, then shake for one minute at hour six.",
          accent: "#fbbf24",
          art: `<svg viewBox="0 0 220 132" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="22" y="76" width="176" height="40" rx="12" fill="#f59e0b" fill-opacity=".08" stroke="#fbbf24" stroke-opacity=".5"/>
            <path d="M38 96h144" stroke="#fbbf24" stroke-opacity=".18"/>
            <g transform="translate(70 50) rotate(-5)">
              <rect x="0" y="0" width="88" height="44" rx="11" fill="#fb7185" fill-opacity=".1" stroke="#fb7185" stroke-width="1.3"/>
              <path d="M13 9h62" stroke="#fda4af" stroke-width="1.1" opacity=".7"/>
              <circle class="bio-pulse" cx="29" cy="25" r="2.2" fill="#fb923c"/>
              <circle class="bio-pulse bio-pulse--slow" cx="42" cy="31" r="1.6" fill="#fb923c"/>
              <circle class="bio-pulse" cx="53" cy="23" r="1.9" fill="#fb923c"/>
              <circle class="bio-pulse bio-pulse--slow" cx="64" cy="33" r="1.4" fill="#fb923c"/>
              <circle cx="35" cy="36" r="1.3" fill="#86efac"/>
              <circle cx="74" cy="24" r="1.2" fill="#86efac"/>
            </g>
            <g transform="translate(164 26)">
              <circle cx="0" cy="0" r="21" fill="#0f172a" stroke="#fbbf24" stroke-opacity=".65" stroke-width="1.3"/>
              <path d="M0-11V7" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round"/>
              <circle cx="0" cy="11" r="4.4" fill="#fbbf24"/>
              <path d="M-13 12a13 13 0 0 1 26 0" stroke="#fbbf24" stroke-opacity=".3" stroke-width="1.4"/>
              <path d="M-15-8l-3-3M15-8l3-3" stroke="#fbbf24" stroke-opacity=".45" stroke-width="1.2" stroke-linecap="round"/>
            </g>
            <g transform="translate(56 32)" stroke="#fbbf24" stroke-linecap="round">
              <path d="M0 0c-8 6-11 16-7 25" stroke-width="1.2" opacity=".55"/>
              <path d="M0 0c8 6 11 16 7 25" stroke-width="1.2" opacity=".55"/>
              <path d="M-6-6c-12 9-16 24-10 37" stroke-width="1" opacity=".25"/>
              <path d="M-6-6c12 9 16 24 10 37" stroke-width="1" opacity=".25"/>
            </g>
            <g transform="translate(98 16)">
              <circle cx="0" cy="0" r="10" stroke="#fde68a" stroke-width="1.2" opacity=".8"/>
              <path d="M0-5V0l4 2.5" stroke="#fde68a" stroke-width="1.3" stroke-linecap="round"/>
            </g>
            <path d="M26 118c16-5 32-7 48-6" stroke="#fbbf24" stroke-width="1" stroke-dasharray="2 4" opacity=".35"/>
          </svg>`
        },
        {
          kicker: "04 · FREEZE & TEST",
          title: "Save it for Earth",
          copy: "Freeze at −80°C, then measure Vitamin A back in the lab.",
          accent: "#fb7185",
          art: `<svg viewBox="0 0 220 132" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(20 26)">
              <rect x="0" y="0" width="86" height="82" rx="11" fill="#0ea5e9" fill-opacity=".07" stroke="#67e8f9" stroke-opacity=".55" stroke-width="1.3"/>
              <rect x="10" y="12" width="66" height="36" rx="6" fill="#082f49" stroke="#38bdf8" stroke-opacity=".45"/>
              <path d="M20 20h46" stroke="#67e8f9" stroke-opacity=".3"/>
              <rect x="30" y="23" width="26" height="18" rx="4" fill="#fb7185" fill-opacity=".16" stroke="#fb7185" stroke-width="1.1"/>
              <circle cx="37" cy="31" r="1.4" fill="#fda4af"/>
              <circle cx="44" cy="35" r="1.1" fill="#fda4af"/>
              <g transform="translate(43 66)">
                <g class="bio-snow" stroke="#a5f3fc" stroke-width="1.4" stroke-linecap="round">
                  <path d="M0-10V10M-8.6-5L8.6 5M-8.6 5L8.6-5"/>
                  <path d="M0-10l-3 3M0-10l3 3M0 10l-3-3M0 10l3-3" opacity=".65"/>
                </g>
              </g>
              <path d="M14 77h58" stroke="#67e8f9" stroke-opacity=".25"/>
            </g>
            <path d="M112 70h22" stroke="#67e8f9" stroke-width="1.1" stroke-dasharray="3 4" opacity=".7"/>
            <path d="M134 66l6 4-6 4" stroke="#67e8f9" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <g transform="translate(154 26)">
              <path d="M8 2h26v58c0 10-26 10-26 0V2Z" fill="#e2e8f0" fill-opacity=".04" stroke="#94a3b8" stroke-width="1.2"/>
              <path d="M9 43h24v17c0 9-24 9-24 0V43Z" fill="#fb923c" fill-opacity=".55"/>
              <path d="M21 2v11" stroke="#94a3b8" stroke-width="1.1" opacity=".55"/>
              <path d="M8 2h26" stroke="#cbd5e1" stroke-width="1.4"/>
              <circle cx="16" cy="51" r="1.4" fill="#fdba74"/>
              <circle cx="25" cy="56" r="1.1" fill="#fdba74"/>
              <circle cx="20" cy="61" r=".9" fill="#fdba74"/>
              <path d="M0 82c9-6 20-9 31-9" stroke="#38bdf8" stroke-opacity=".3" stroke-width="1"/>
              <path d="M-3 90h40" stroke="#475569" stroke-opacity=".45"/>
            </g>
            <g stroke="#67e8f9" stroke-width="1.1" stroke-linecap="round" opacity=".55">
              <path d="M196 30v10M191 35h10M192.5 31.5l7 7M199.5 31.5l-7 7"/>
            </g>
          </svg>`
        }
      ];
      return `
        <div class="bio-story bio-story--${this._escapeHtml(variant)}" role="list" aria-label="BioNutrients-2 steps: launch, hydrate, warm and shake, freeze and test">
          ${panels.map((panel) => `
            <article class="bio-story__card" role="listitem" style="--step-accent:${panel.accent};">
              <div class="bio-story__visual" aria-hidden="true">${panel.art}</div>
              <div class="bio-story__body">
                <span class="bio-story__kicker">${this._escapeHtml(panel.kicker)}</span>
                <h4>${this._escapeHtml(panel.title)}</h4>
                <p>${this._escapeHtml(panel.copy)}</p>
              </div>
            </article>
          `).join("")}
        </div>
      `;
    }

    _missionSignalIcon(kind) {
      const attrs = `viewBox="0 0 12 12" fill="none" aria-hidden="true"`;
      if (kind === "target") {
        return `<svg ${attrs}><circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.1"/><circle cx="6" cy="6" r="1.3" fill="currentColor"/><path d="M6 0v1.8M6 10.2V12M0 6h1.8M10.2 6H12" stroke="currentColor" stroke-width="1.1"/></svg>`;
      }
      if (kind === "orbit") {
        return `<svg ${attrs}><ellipse cx="6" cy="6" rx="5" ry="2.4" transform="rotate(-24 6 6)" stroke="currentColor" stroke-width="1.1"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/><circle cx="10" cy="3.4" r="1" fill="currentColor"/></svg>`;
      }
      if (kind === "clock") {
        return `<svg ${attrs}><circle cx="6" cy="6" r="4.4" stroke="currentColor" stroke-width="1.1"/><path d="M6 3.2V6l1.9 1.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`;
      }
      if (kind === "thermo") {
        return `<svg ${attrs}><path d="M5 6.7V2a1 1 0 0 1 2 0v4.7a2.5 2.5 0 1 1-2 0Z" stroke="currentColor" stroke-width="1.1"/><path d="M6 4v4.4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`;
      }
      if (kind === "wallet") {
        return `<svg ${attrs}><rect x="1.5" y="3" width="9" height="6.4" rx="1.2" stroke="currentColor" stroke-width="1.1"/><path d="M1.5 4.6h9" stroke="currentColor" stroke-width="1.1"/><circle cx="8.7" cy="7" r=".9" fill="currentColor"/></svg>`;
      }
      if (kind === "spark") {
        return `<svg ${attrs}><path d="M6 1l1.2 3.8L11 6 7.2 7.2 6 11 4.8 7.2 1 6l3.8-1.2L6 1Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
      }
      return `<svg ${attrs}><path d="M2 8.5a4 4 0 0 1 0-5M10 3.5a4 4 0 0 1 0 5M4 7a2 2 0 0 1 0-2M8 5a2 2 0 0 1 0 2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><circle cx="6" cy="6" r="1" fill="currentColor"/></svg>`;
    }

    _missionStatIcon(kind) {
      const attrs = `viewBox="0 0 12 12" fill="none" aria-hidden="true"`;
      if (kind === "budget") {
        return `<svg ${attrs}><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.1"/><path d="M7.4 4.4H5.3a1.2 1.2 0 0 0 0 2.4h1.4a1.2 1.2 0 0 1 0 2.4H4.4M6 3v6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`;
      }
      return `<svg ${attrs}><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.1"/><path d="M6 3.2V6l1.9 1.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`;
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

    // The server sends a live role assignment for the current crew. Fall back
    // to the console's preferred role when an older snapshot has no assignment.
    getTaskRole(task) {
      if (!task) return "all";
      const mission = this.getMissionState();
      const assignments = mission && mission.objectiveAssignments;
      if (assignments && typeof assignments === "object" && assignments[task.id]) {
        return assignments[task.id];
      }
      return task.role || "all";
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
      if (scenarioId === "artemis_expedition") {
        md.orbitId = "lunar_polar_100";
        md.launchVehicleId = "sls_superheavy";
        md.busId = "deep_space_heavy";
        md.powerId = "deployable_rosa";
        md.batteryId = "solid_state_640";
        md.instruments = ["inst_multispectral", "inst_ir_spec"];
        md.thermalId = "pumped_loop_50";
        md.commsId = "x_band_hga";
        md.groundNetId = "dsn_goldstone";
        md.propulsionId = "biprop_nto_mmh";
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
      } else if (scenarioId === "sandbox") {
        md.orbitId = "leo_400";
        md.launchVehicleId = "falcon_medium";
        md.busId = "modular_hex";
        md.powerId = "high_power_wings";
        md.batteryId = "solid_state_640";
        md.instruments = ["inst_multispectral", "inst_ir_spec"];
        md.thermalId = "pumped_loop_50";
        md.commsId = "ka_band_optical";
        md.groundNetId = "near_space_net";
        md.propulsionId = "hydrazine_mono";
        md.disposalId = "drag_sail";
      }
      this._renderResourceMeters();
    }

    // ========================================================================
    // INTEGRATED SYSTEMS ENGINEERING PHYSICS & RESOURCE SOLVER
    // ========================================================================
    _syncMissionDiorama(telemetry) {
      if (!telemetry || !window.shipInterior ||
        typeof window.shipInterior.setMissionDioramaScenario !== "function") return;
      const bio = telemetry.bioTelemetry;
      window.shipInterior.setMissionDioramaScenario(telemetry.scenario.id, {
        bagId: bio && bio.bag ? bio.bag.id : null,
        thermalId: bio && bio.thermal ? bio.thermal.id : null,
        yieldOk: !!(bio && bio.yieldOk),
        incubateTempC: bio && bio.thermal ? bio.thermal.incubateTempC : null,
        storageTempC: bio && bio.thermal ? bio.thermal.storageTempC : null,
        cubesatFormId: telemetry.cubesatForm ? telemetry.cubesatForm.id : null,
        wavelengthId: telemetry.wavelength ? telemetry.wavelength.id : null
      });
    }

    evaluateMissionDesign() {
      const md = this.missionDesign;
      const scenario = MISSION_SCENARIOS[md.scenarioId] || MISSION_SCENARIOS.cubesat_101;
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
        if (!isIssOrbit) bioIssues.push(`Destination must be the Space Station at 418 km (currently ${orbit.name})`);
        if (rawLvCapacityKg <= 0) bioIssues.push(`${lv.name.split("(")[0].trim()} does not fly to ${orbit.name} — pick Space Station Supply Ship`);
        if (!bioOrg.goalAligned) bioIssues.push("This Space Station food mission needs Helpful Yeast that makes Vitamin A");
        if (bioBag.containerMassG >= 250) bioIssues.push(`Empty pouch weight (${bioBag.containerMassG} g) is over the 250 g limit`);
        if (bioBag.kitVolumeMl >= 300) bioIssues.push(`Full kit size (${bioBag.kitVolumeMl} mL) is over the 300 mL limit`);
        if (!bioBag.hasIssNonLuerCover) bioIssues.push("Bag cap is missing the required Station safety lock cap");
        if (!bioBagFilmMatch) bioIssues.push(`${bioOrg.shortLabel} needs the ${bioOrg.id === "yeast_beta_carotene" ? "Thin Clear Pouch" : "Thick Clear Pouch"}`);
        if (bioProto.replicates < 12) bioIssues.push(`Science check needs at least 12 sample bags (currently ${bioProto.replicates})`);
        if (bioProto.sampleVolMl < 30) bioIssues.push(`Water per bag (${bioProto.sampleVolMl} mL) is below the 30 mL minimum`);
        if (!bioProto.sterileFiltered || bioProto.contaminationCfu > 0) bioIssues.push("Missing germ filter step — drinks would not stay clean and germ-free");
        if (bioOrg.requiresSixHourShake && !bioProto.hasSixHourShake) bioIssues.push("Yeast recipe needs a quick 1-minute shake at the 6-hour mark");
        if (!bioTempMatch) bioIssues.push(`Warmer temperature (${bioThm.incubateTempC}°C) does not match ${bioOrg.shortLabel} (${bioOrg.targetTempC}°C)`);
        if (!bioThm.melfiFrozen) bioIssues.push("Missing -80°C ultra-cold freezer storage for the trip home");
        if (betaCaroteneUgMl < 3.0) bioIssues.push(`Vitamin A nutrient score (${betaCaroteneUgMl} mg/L) is below the 3.0 mg/L goal`);
        if (dryCellWeightMg < 1.0) bioIssues.push(`Yeast growth weight (${dryCellWeightMg} mg) is below the 1.0 mg goal`);
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
              label: "IN SPACE",
              ok: powerOk && bioTelemetry.sterileOk && bioTelemetry.replicatesOk && bioTelemetry.sampleVolOk && bioTelemetry.shake6hOk && bioTempMatch && bioTelemetry.melfiOk
            },
            ground: { label: "GROUND", ok: commsOk && bioTempMatch },
            user: {
              label: "RESULTS",
              ok: bioTelemetry.melfiOk && bioTelemetry.yieldOk && bioTelemetry.dcwOk && bioTelemetry.replicatesOk && bioTelemetry.sterileOk
            }
          }
        : {
            launch: { label: "LAUNCH", ok: massOk && budgetOk },
            space: { label: "IN SPACE", ok: massOk && powerOk && deltaVOk && thermalOk && radiationOk && disposalOk && telescopeOk },
            ground: { label: "GROUND", ok: commsOk },
            user: { label: "RESULTS", ok: scienceScore >= 55 && matchedTypes.length >= 1 }
          };

      const completedTasksCount = Array.isArray(this.tasks) ? this.tasks.filter((x) => x.completed).length : 0;
      const segmentsPassed = Object.values(segments).filter((s) => s.ok).length;
      let cmlLevel = 1;
      if (completedTasksCount >= 2 || (orbit && bus && overallScore >= 50)) cmlLevel = 2;
      if (completedTasksCount >= 4 || (segmentsPassed >= 3 && overallScore >= 65)) cmlLevel = 3;
      if (completedTasksCount >= 6 || (segmentsPassed === 4 && overallScore >= 75)) cmlLevel = 4;

      const cmlTitles = {
        1: "Stage 1 · The Big Idea",
        2: "Stage 2 · Does It Work?",
        3: "Stage 3 · Compare Plans",
        4: "Stage 4 · Ready Blueprint"
      };

      const riskMatrix = isBio
        ? [
            {
              subsystem: "Cargo Bag & Size",
              level: (!bioTelemetry.containerMassOk || !bioTelemetry.kitVolumeOk || !massOk) ? "RED" : !bioBagFilmMatch ? "AMBER" : "GREEN",
              likelihood: (!bioTelemetry.containerMassOk || !bioTelemetry.kitVolumeOk) ? "HIGH" : "LOW",
              consequence: "HIGH",
              detail: `${bioBag.containerMassG}g (<250g) · ${bioBag.kitVolumeMl}mL (<300mL)`
            },
            {
              subsystem: "Clean Water & Filter",
              level: !bioTelemetry.sterileOk ? "RED" : "GREEN",
              likelihood: !bioTelemetry.sterileOk ? "HIGH" : "LOW",
              consequence: "HIGH",
              detail: `${bioProto.sterileFiltered ? "Germ Filter ON" : "NO GERM FILTER"} · ${bioBag.hasIssNonLuerCover ? "Station Safety Lock" : "Basic Earth Cap"}`
            },
            {
              subsystem: "30°C Warmth & 6h Shake",
              level: (!bioTempMatch || !bioTelemetry.shake6hOk || !powerOk) ? "RED" : "GREEN",
              likelihood: (!bioTempMatch || !bioTelemetry.shake6hOk) ? "HIGH" : "LOW",
              consequence: "HIGH",
              detail: `${bioThm.incubateTempC}°C (needs ${bioOrg.targetTempC}°C) · ${bioTelemetry.shake6hOk ? "6h Shake OK" : "NEEDS 6h SHAKE"}`
            },
            {
              subsystem: "Radio & -80°C Freezer",
              level: (!commsOk || !bioTelemetry.melfiOk) ? "RED" : linkMarginDb < 6 ? "AMBER" : "GREEN",
              likelihood: (!commsOk || !bioTelemetry.melfiOk) ? "HIGH" : "LOW",
              consequence: "MED",
              detail: `${bioThm.storageTempC}°C freezer · +${linkMarginDb} dB signal`
            },
            {
              subsystem: "Vitamin Yield & Bags",
              level: (!bioTelemetry.yieldOk || !bioTelemetry.dcwOk || !bioTelemetry.replicatesOk || !bioTelemetry.sampleVolOk) ? "RED" : bioProto.replicates === 12 ? "AMBER" : "GREEN",
              likelihood: (!bioTelemetry.yieldOk || !bioTelemetry.replicatesOk) ? "HIGH" : bioProto.replicates === 12 ? "MED" : "LOW",
              consequence: "HIGH",
              detail: `${betaCaroteneUgMl} mg/L · ${bioProto.replicates}×${bioProto.sampleVolMl}mL · ${dryCellWeightMg}mg yeast`
            }
          ]
        : [
            {
              subsystem: "Rocket Weight",
              level: !massOk ? "RED" : massMarginPct < 10 ? "AMBER" : "GREEN",
              likelihood: !massOk ? "HIGH" : massMarginPct < 10 ? "MED" : "LOW",
              consequence: "HIGH",
              detail: `${massMarginPct}% spare lift (${wetMassKg}/${lvCapacityKg} kg)`
            },
            {
              subsystem: "Solar & Battery",
              level: !powerOk ? "RED" : batteryDodPct > 65 ? "AMBER" : "GREEN",
              likelihood: !powerOk ? "HIGH" : batteryDodPct > 65 ? "MED" : "LOW",
              consequence: "HIGH",
              detail: `${batteryDodPct}% battery used · ${netDaylightMarginW >= 0 ? "+" : ""}${netDaylightMarginW}W spare`
            },
            {
              subsystem: "Cooling & Shield",
              level: (!thermalOk || !radiationOk || !telescopeOk) ? "RED" : !lifetimeOk ? "AMBER" : "GREEN",
              likelihood: (!thermalOk || !radiationOk) ? "HIGH" : "LOW",
              consequence: "MED",
              detail: `Shield Level ${thm.radRatingKrad} · ${estimatedLifetimeMonths} mo lifespan`
            },
            {
              subsystem: "Radio & Earth Dish",
              level: !commsOk ? "RED" : linkMarginDb < 6 ? "AMBER" : "GREEN",
              likelihood: !commsOk ? "HIGH" : linkMarginDb < 6 ? "MED" : "LOW",
              consequence: "MED",
              detail: `${linkMarginDb} dB signal · ${downlinkCapGbPerDay}/${dataGeneratedGbPerDay} GB/day`
            },
            {
              subsystem: "Fuel & Safe Cleanup",
              level: (!deltaVOk || !disposalOk) ? "RED" : (achievedDeltaV - requiredDeltaV) < 120 ? "AMBER" : "GREEN",
              likelihood: (!deltaVOk || !disposalOk) ? "HIGH" : "LOW",
              consequence: "HIGH",
              detail: `${achievedDeltaV}/${requiredDeltaV} m/s · ${disposal.deorbitYears} yr cleanup`
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

      this._syncMissionDiorama(baseTelemetry);
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
      const myTeam = window.InterfellasRoles
        ? window.InterfellasRoles.getTeamForRole(myRole)
        : "crew";
      // If nobody currently holds a console's role (for example a solo
      // commander), that role's station may be covered by any flight-crew
      // member. Ground Control cannot take station consoles.
      const isMine = myRole === role || (holders.length === 0 && myTeam !== "ground");
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
        const assign = this._getRoleAssignment(this.getTaskRole(this.activeTask));
        const stripBorder = assign.isMine ? "rgba(59,130,246,0.55)" : "rgba(148,163,184,0.28)";
        const stripBg = assign.isMine ? "rgba(37,99,235,0.14)" : "rgba(15,23,42,0.72)";
        const stripColor = assign.isMine ? "#dbeafe" : "#cbd5e1";
        const stripMsg = assign.isMine
          ? (assign.role === "all"
            ? "EVERYONE CAN HELP · Any station player can run the final check & finish the mission"
            : `[YOUR DESK] ASSIGNED WORKSTATION [${assign.short} ${assign.label}]`)
          : assign.isUnstaffed
            ? `OPEN ROLE [${assign.short} ${assign.label}] · Anyone can fill in here`
            : `ASSIGNED TO: [${assign.short}] ${this._escapeHtml(assign.namesText)} · Only this role can run this station`;
        const gs = (mission && mission.groundSupport) || {};
        const gsTags = [
          gs.dsnLocked ? "DISH LOCKED" : null,
          gs.powerRouted ? "POWER ROUTED" : null,
          gs.scienceCleared ? "SCIENCE READY" : null
        ].filter(Boolean);
        roleStrip = `
          <div style="margin-bottom:10px;padding:9px 12px;border-radius:4px;border:1px solid ${stripBorder};background:${stripBg};color:${stripColor};font-family:var(--font-mono,monospace);font-size:11.5px;font-weight:700;letter-spacing:0.6px;line-height:1.45;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <span>${stripMsg}${gsTags.length ? ` · EARTH HELP: ${gsTags.join(" / ")}` : ""}</span>
            <span>TEAM ROLE: ${assign.short}</span>
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
        <span style="padding:4px 8px;border-radius:3px;font-family:var(--font-mono,monospace);font-size:10.5px;font-weight:700;border:1px solid ${seg.ok ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)"};background:${seg.ok ? "rgba(22,163,74,0.14)" : "rgba(239,68,68,0.12)"};color:${seg.ok ? "#86efac" : "#fca5a5"};">
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
        return `<button type="button" class="btn-cml-pill-jump" data-cml-jump="${lvl}" title="Open Stage ${lvl} in the Readiness Guide" style="padding:4px 8px;border-radius:3px;font-family:var(--font-mono,monospace);font-size:10.5px;font-weight:700;background:${bg};color:${fg};border:1px solid ${bd};cursor:pointer;">STAGE ${lvl}${isTarget ? "*" : ""}</button>`;
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

      const cadetCoachHtml = (window.missionAcademy && typeof window.missionAcademy.getConsoleTipHtml === "function")
        ? window.missionAcademy.getConsoleTipHtml(this.activeTask, this._activeMdlTab)
        : "";
      const spaceGamesLocked = !!(window.csaNasaLab && typeof window.csaNasaLab.isGroundLocked === "function" && window.csaNasaLab.isGroundLocked());

      return `
        ${roleStrip}
        ${cadetCoachHtml}
        <div style="margin-bottom:16px;padding:12px 14px;border-radius:4px;background:rgba(8,13,24,0.82);border:1px solid rgba(148,163,184,0.22);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
            <span style="font-family:var(--font-mono,monospace);font-size:11.5px;font-weight:700;letter-spacing:1.1px;color:#93c5fd;">
              ${t.cmlLabel.toUpperCase()} · ${t.scenario.name.toUpperCase()}
            </span>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <button type="button" id="btn-mdl-snapshot-a" style="padding:5px 10px;border-radius:4px;border:1px solid rgba(148,163,184,0.28);background:rgba(15,23,42,0.85);color:#e2e8f0;font-family:var(--font-mono,monospace);font-size:10.5px;font-weight:700;cursor:pointer;">${this.tradeBaselineA ? "UPDATE PLAN A" : "SAVE PLAN A"}</button>
              <button type="button" id="btn-open-cml-workbench" style="padding:5px 10px;border-radius:4px;border:1px solid rgba(251,191,36,0.55);background:rgba(245,158,11,0.16);color:#fde68a;font-family:var(--font-mono,monospace);font-size:10.5px;font-weight:700;cursor:pointer;" title="Open step-by-step Readiness Guide (Stages 1-9)">READY ${targetPct}% @ S${targetLvl}${critCount ? ` · ${critCount} KEY` : ""}</button>
              ${spaceGamesLocked ? "" : `<button type="button" id="btn-mdl-open-csa-lab" style="padding:5px 10px;border-radius:4px;border:1px solid rgba(52,211,153,0.5);background:rgba(16,185,129,0.16);color:#a7f3d0;font-family:var(--font-mono,monospace);font-size:10.5px;font-weight:700;cursor:pointer;" title="Open Space Games &amp; Activities, 3D Path Builder &amp; Telescope Tool">GAMES &amp; TOOLS</button>`}
              <button type="button" id="btn-mdl-open-viz" style="padding:5px 10px;border-radius:4px;border:1px solid rgba(59,130,246,0.5);background:rgba(37,99,235,0.2);color:#dbeafe;font-family:var(--font-mono,monospace);font-size:10.5px;font-weight:700;cursor:pointer;">3D EARTH MAP [U]</button>
              <span style="font-family:var(--font-mono,monospace);font-size:11.5px;font-weight:700;color:${t.overallScore >= 75 ? "#86efac" : "#fde68a"};">
                SCORE ${t.overallScore}/100 (SCI ${t.scienceScore} · ENG ${t.engineeringScore})
              </span>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              ${cmlPills}
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              ${segBadge(t.segments.launch)}
              ${segBadge(t.segments.space)}
              ${segBadge(t.segments.ground)}
              ${segBadge(t.segments.user)}
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
            ${pill("BUDGET", `$${t.totalCostM}M / $${t.budgetCapM}M`, `${t.budgetRemainingM >= 0 ? `+$${t.budgetRemainingM}M spare` : `$${Math.abs(t.budgetRemainingM)}M OVER LIMIT`}`, t.budgetOk)}
            ${
              t.scenario.isBioPayload
                ? `
                  ${pill("POUCH & KIT SIZE", `${t.bioTelemetry.bag.containerMassG}g / ${t.bioTelemetry.bag.kitVolumeMl}mL`, `Limits: <250g · <300mL`, t.bioTelemetry.containerMassOk && t.bioTelemetry.kitVolumeOk)}
                  ${pill("WARM / FREEZER", `${t.bioTelemetry.thermal.incubateTempC}°C / ${t.bioTelemetry.thermal.storageTempC}°C`, `Power ${t.totalPowerLoadW}W · Needs ${t.bioTelemetry.organism.targetTempC}°C`, t.powerOk && t.bioTelemetry.tempMatch && t.bioTelemetry.melfiOk)}
                  ${pill("BAGS & FILTER", `${t.bioTelemetry.protocol.replicates}×${t.bioTelemetry.protocol.sampleVolMl}mL`, `${t.bioTelemetry.sterileOk ? "Germ Filter + Lock OK" : "NEEDS FILTER/LOCK"} · +${t.linkMarginDb}dB`, t.bioTelemetry.replicatesOk && t.bioTelemetry.sampleVolOk && t.bioTelemetry.sterileOk && t.commsOk)}
                  ${pill("VITAMIN A SCORE", `${t.bioTelemetry.betaCaroteneUgMl} mg/L`, `Goal ≥3.0 · Yeast ${t.bioTelemetry.dryCellWeightMg}mg ≥1`, t.bioTelemetry.yieldOk && t.bioTelemetry.dcwOk)}
                `
                : `
                  ${pill(t.scenario.isCubesat ? `WEIGHT (${t.cubesatForm.shortLabel})` : "TOTAL WEIGHT", `${t.wetMassKg} / ${t.lvCapacityKg} kg`, `Spare: ${t.massMarginPct}% (${t.lv.name.split(" ")[0]})`, t.massOk)}
                  ${pill("SOLAR & BATTERY", `${t.totalPowerLoadW}W / ${t.daylightGenW}W`, `Battery used at night: ${t.batteryDodPct}% (≤80%)`, t.powerOk)}
                  ${pill("RADIO & DATA", `${t.dataGeneratedGbPerDay} / ${t.downlinkCapGbPerDay} GB/d`, `Signal: ${t.linkMarginDb} dB (≥3dB)`, t.commsOk)}
                  ${pill("FUEL & CLEANUP", `${t.achievedDeltaV} / ${t.requiredDeltaV} m/s`, `${t.disposalOk ? `${t.disposal.deorbitYears}yr cleanup` : "CLEANUP FAIL"} · ${t.estimatedLifetimeMonths}/${t.scenario.targetLifetimeMonths} mo`, t.deltaVOk && t.disposalOk && t.lifetimeOk)}
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
          this.showToast("Saved Plan A — change parts now to compare the differences!");
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

      const btnOpenCml = container.querySelector("#btn-open-cml-workbench");
      if (btnOpenCml && !btnOpenCml.dataset.bound) {
        btnOpenCml.dataset.bound = "1";
        btnOpenCml.addEventListener("click", () => {
          this.openCmlWorkbench("checklist", { returnTask: this.activeTask });
        });
      }

      container.querySelectorAll(".btn-cml-pill-jump").forEach((btn) => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", () => {
          const target = Number.parseInt(btn.dataset.cmlJump, 10);
          this.openCmlWorkbench("checklist", {
            returnTask: this.activeTask,
            targetCml: Number.isFinite(target) ? target : undefined
          });
        });
      });

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
        ctx.fillText("GOAL 3.0 mg/L", gx0 + 4, reqY - 4);

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
        ctx.fillText(`VITAMIN A: ${bio.betaCaroteneUgMl} mg/L (${bio.thermal.incubateTempC}°C)`, gx0, h - 7);

        // Right: Plain Checks (Pouches, Water, Bag Weight, Kit Space, Yeast Growth)
        const bx = splitX + 12;
        const bw = w - bx - 14;
        const checks = [
          { label: `Pouches ${bio.protocol.replicates}/12+`, pct: Math.min(1, bio.protocol.replicates / 16), ok: bio.replicatesOk },
          { label: `Water / Pouch ${bio.protocol.sampleVolMl}/30mL+`, pct: Math.min(1, bio.protocol.sampleVolMl / 40), ok: bio.sampleVolOk },
          { label: `Empty Bag ${bio.bag.containerMassG}g (<250g)`, pct: Math.min(1, bio.bag.containerMassG / 350), ok: bio.containerMassOk },
          { label: `Kit Space ${bio.bag.kitVolumeMl}mL (<300mL)`, pct: Math.min(1, bio.bag.kitVolumeMl / 520), ok: bio.kitVolumeOk },
          { label: `Yeast Growth ${bio.dryCellWeightMg}/1.0mg+`, pct: Math.min(1, bio.dryCellWeightMg / 2.5), ok: bio.dcwOk }
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
      } else {
        // Artemis / CubeSat / BioNutrients / Sandbox multi-channel telemetry waveform
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
        name: "Spacecraft Workshop & Blueprint Desk",
        location: "Earth Launch Complex",
        role: "all",
        completed: false
      };
      this.activeTask = synthTask;
      const modal = document.getElementById("task-modal-overlay");
      const title = document.getElementById("task-modal-title");
      const body = document.getElementById("task-modal-content");
      if (!modal || !title || !body) return;

      let activeTab = initialTab || "bus";
      title.textContent = "SPACECRAFT WORKSHOP · PRE-FLIGHT DESIGN DESK";
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
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px;margin-bottom:14px;">
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
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px;margin-bottom:14px;">
              ${Object.values(ORBIT_OPTIONS).map((o) => `
                <div class="mdl-q-orb" data-id="${o.id}" style="padding:9px;border-radius:7px;border:1px solid ${md.orbitId === o.id ? "var(--ui-brand)" : "rgba(255,255,255,0.12)"};background:${md.orbitId === o.id ? "rgba(var(--ui-brand-rgb),0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                  <div style="font-size:11.5px;font-weight:700;color:#efeee7;">${o.name}</div>
                  <div style="font-family:monospace;font-size:9.5px;color:var(--ui-brand);">Req ΔV ${o.reqInsertionDv} m/s · Rad ${o.radiationEnvKrad} krad</div>
                </div>
              `).join("")}
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
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
            <div style="display:grid;grid-template-columns:260px 1fr;gap:14px;align-items:start;">
              <div>
                <div id="mdl-point-design-3d" style="width:100%;height:156px;border-radius:6px;background:#050914;"></div>
                <div style="font-family:monospace;font-size:9px;color:#a7b0ba;text-align:center;margin-top:4px;">LIVE 3D POINT DESIGN (${t.bus.id.toUpperCase()})</div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
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
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
              ${t.riskMatrix.map((r) => `
                <div style="padding:9px 11px;border-radius:5px;background:rgba(0,0,0,0.35);border-left:3px solid ${r.level === "GREEN" ? "#4ade80" : r.level === "AMBER" ? "#fbbf24" : "#ef4444"};">
                  <div style="font-family:monospace;font-size:10.5px;font-weight:700;color:#e2e8f0;">${r.subsystem} (${r.level === "GREEN" ? "GOOD" : r.level === "AMBER" ? "TIGHT" : "NEEDS FIX"})</div>
                  <div style="font-family:monospace;font-size:10.5px;color:#94a3b8;margin-top:3px;line-height:1.4;">${r.detail}</div>
                </div>
              `).join("")}
            </div>
          `;
        }

        this._activeMdlTab = activeTab;
        body.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: renderDesk })}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
            ${mkTab("arch", "1. MISSION GOAL")}
            ${mkTab("orbit", "2. ORBIT & ROCKET")}
            ${mkTab("bus", "3. 3D BODY & POWER")}
            ${mkTab("viz", "4. SAFETY & SCIENCE PREVIEW")}
            <button type="button" id="btn-mdl-open-cml" style="padding:8px 14px;border-radius:5px;border:1px solid rgba(251,191,36,0.55);background:rgba(245,158,11,0.14);color:#fde68a;font-family:monospace;font-size:11.5px;font-weight:700;cursor:pointer;">5. READINESS STAGES (${t.cml ? `${t.cml.activeSummary.percentGreen}% @ Stage ${t.cml.targetCml}` : `Stage ${t.cmlLevel}`})</button>
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
            this.showToast("Mission plan shared across Launch / In Space / Ground / Results team");
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
            <div style="display:flex;justify-content:space-between;font-family:monospace;font-size:10.5px;color:#94a3b8;gap:6px;">
              <span>${this._escapeHtml(m.label)}</span>
              <strong style="color:${c};white-space:nowrap;">${statusWord} (${this._escapeHtml(m.required)})</strong>
            </div>
            <div style="font-family:monospace;font-size:13px;font-weight:700;color:#f8fafc;margin-top:4px;">${this._escapeHtml(m.actual)}</div>
            <div style="font-family:monospace;font-size:10.5px;color:#94a3b8;margin-top:3px;line-height:1.4;">${this._escapeHtml(m.note)}</div>
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
          : `<button type="button" class="cml-toggle-status" data-item-id="${item.id}" data-status="${code}" style="padding:4px 9px;border-radius:3px;border:1px solid ${active ? color : "rgba(148,163,184,0.22)"};background:${active ? bg : "rgba(15,23,42,0.7)"};color:${active ? "#f8fafc" : "#64748b"};font-family:monospace;font-size:10.5px;font-weight:800;cursor:pointer;">${label}</button>`;
        const statusColor = item.status === "G" ? "#4ade80" : item.status === "Y" ? "#fbbf24" : item.status === "R" ? "#f87171" : "#64748b";
        const catTitle = catLabelMap[item.category] || item.category.toUpperCase();
        return `
          <div style="padding:10px 12px;border-radius:5px;background:${item.na ? "rgba(15,23,42,0.35)" : "rgba(15,23,42,0.72)"};border:1px solid rgba(148,163,184,0.16);border-left:3px solid ${statusColor};opacity:${item.na ? "0.62" : "1"};display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="flex:1 1 320px;min-width:220px;">
              <div style="font-size:13px;color:#f1f5f9;font-weight:600;line-height:1.48;">
                <span style="font-family:monospace;font-size:10.5px;color:#93c5fd;margin-right:6px;">[${this._escapeHtml(catTitle)}]</span>
                ${this._escapeHtml(item.text)}
                ${item.critical ? '<span style="margin-left:6px;padding:2px 6px;border-radius:3px;background:rgba(245,158,11,0.2);color:#fde68a;font-family:monospace;font-size:10px;font-weight:800;">MUST-HAVE</span>' : ""}
                ${item.overrideStatus ? '<span style="margin-left:6px;padding:2px 6px;border-radius:3px;background:rgba(56,189,248,0.2);color:#7dd3fc;font-family:monospace;font-size:10px;">EDITED</span>' : ""}
              </div>
              <div style="font-family:monospace;font-size:11px;color:#94a3b8;margin-top:4px;line-height:1.4;">${this._escapeHtml(item.autoReason)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              ${item.consoleKey && !item.na ? `<button type="button" class="cml-jump-console" data-console="${item.consoleKey}" style="padding:4px 9px;border-radius:3px;border:1px solid rgba(103,232,249,0.35);background:rgba(103,232,249,0.1);color:#a5f3fc;font-family:monospace;font-size:10.5px;cursor:pointer;" title="Jump straight to this workstation console">${taskShort[item.consoleKey] || "OPEN"}</button>` : ""}
              ${item.na ? '<span style="padding:4px 10px;border-radius:3px;background:rgba(100,116,139,0.2);color:#94a3b8;font-family:monospace;font-size:10.5px;font-weight:700;">LATER</span>' : `
                ${mkPill("G", "DONE", item.status === "G", "#4ade80", "rgba(22,163,74,0.45)")}
                ${mkPill("Y", "WIP", item.status === "Y", "#fbbf24", "rgba(217,119,6,0.45)")}
                ${mkPill("R", "TODO", item.status === "R", "#f87171", "rgba(220,38,38,0.45)")}
                ${item.overrideStatus ? `<button type="button" class="cml-reset-item" data-item-id="${item.id}" style="padding:4px 8px;border-radius:3px;border:1px solid rgba(148,163,184,0.3);background:transparent;color:#94a3b8;font-family:monospace;font-size:10px;cursor:pointer;" title="Switch back to automatic live spacecraft check">AUTO</button>` : ""}
              `}
            </div>
          </div>
        `;
      }).join("");

      const assessorName = this._escapeHtml((cmlEval.notes && cmlEval.notes.assessorName) || "");
      const assessorNotes = this._escapeHtml((cmlEval.notes && cmlEval.notes.assessorNotes) || "");

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${[2, 3, 4, 5, 6].map((lvl) => {
              const s = cmlEval.levelsSummary[lvl];
              const active = lvl === cmlEval.targetCml;
              return `<button type="button" class="cml-target-lvl" data-lvl="${lvl}" style="padding:6px 11px;border-radius:4px;border:1px solid ${active ? "#fbbf24" : "rgba(148,163,184,0.22)"};background:${active ? "rgba(245,158,11,0.18)" : "rgba(15,23,42,0.75)"};color:${active ? "#fde68a" : "#cbd5e1"};font-family:monospace;font-size:11px;font-weight:700;cursor:pointer;">Stage ${lvl} (${s.percentGreen}%)</button>`;
            }).join("")}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${cats.map((c) => `
              <button type="button" class="cml-cat-filter" data-cat="${c.id}" style="padding:5px 10px;border-radius:4px;border:1px solid ${filterCat === c.id ? "#38bdf8" : "rgba(148,163,184,0.2)"};background:${filterCat === c.id ? "rgba(56,189,248,0.16)" : "transparent"};color:${filterCat === c.id ? "#e0f2fe" : "#94a3b8"};font-family:monospace;font-size:10.5px;font-weight:700;cursor:pointer;">${c.label}</button>
            `).join("")}
          </div>
        </div>

        <div style="padding:10px 12px;border-radius:5px;background:rgba(8,13,24,0.85);border:1px solid rgba(148,163,184,0.2);margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-family:monospace;font-size:11.5px;color:#e2e8f0;margin-bottom:7px;flex-wrap:wrap;gap:8px;line-height:1.45;">
            <span><strong>${this._escapeHtml(target.meta.shortTitle)}</strong> · Checkpoint: ${this._escapeHtml(target.meta.competedGate)}</span>
            <span style="color:${barColor};font-weight:800;">${pct}% DONE (${target.greenCount}/${target.applicableCount} Done · ${target.yellowCount} WIP · ${target.redCount} To-Do · ${target.naCount} Later) · PASS LINE: ${target.thresholdMet ? (target.criticalGaps.length ? "80% MET (MUST-HAVES LEFT!)" : "PASSED >=80%") : "NEED 80%"}</span>
          </div>
          <div style="height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;position:relative;">
            <div style="height:100%;width:${pct}%;background:${barColor};transition:width 0.2s;"></div>
            <div style="position:absolute;left:80%;top:0;bottom:0;width:2px;background:#f8fafc;" title="NASA 80% Pass Line"></div>
          </div>
        </div>

        <div style="font-family:monospace;font-size:10.5px;color:#93c5fd;font-weight:700;margin-bottom:6px;line-height:1.4;">SAFETY BUFFERS — Extra room so surprises don't break your build (${this._escapeHtml(cmlEval.margins.footnote)})</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:8px;margin-bottom:12px;">
          ${marginStrip}
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;padding-right:6px;margin-bottom:12px;">
          ${rowsHtml}
        </div>

        <div style="padding:10px 12px;border-radius:5px;background:rgba(30,41,59,0.65);border:1px solid ${cmlEval.assessorSignedOff ? "rgba(74,222,128,0.45)" : "rgba(251,191,36,0.4)"};display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="flex:1 1 260px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <input id="cml-input-assessor-name" type="text" maxlength="80" placeholder="Fresh-Eyes Reviewer name (teammate or Ground Control)" value="${assessorName}" style="padding:7px 10px;border-radius:4px;border:1px solid rgba(148,163,184,0.3);background:rgba(5,8,16,0.85);color:#f8fafc;font-family:monospace;font-size:11.5px;width:230px;" />
            <input id="cml-input-assessor-notes" type="text" maxlength="320" placeholder="~30-min outside feedback & sanity-check notes..." value="${assessorNotes}" style="padding:7px 10px;border-radius:4px;border:1px solid rgba(148,163,184,0.3);background:rgba(5,8,16,0.85);color:#f8fafc;font-family:monospace;font-size:11.5px;flex:1 1 200px;" />
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button type="button" id="btn-cml-reset-overrides" style="padding:7px 11px;border-radius:4px;border:1px solid rgba(148,163,184,0.3);background:rgba(15,23,42,0.8);color:#cbd5e1;font-family:monospace;font-size:10.5px;cursor:pointer;">RESET EDITS (${cmlEval.overrideCount})</button>
            <button type="button" id="btn-cml-toggle-assessor" style="padding:7px 12px;border-radius:4px;border:1px solid ${cmlEval.assessorSignedOff ? "#4ade80" : "#fbbf24"};background:${cmlEval.assessorSignedOff ? "rgba(22,163,74,0.28)" : "rgba(245,158,11,0.2)"};color:${cmlEval.assessorSignedOff ? "#bbf7d0" : "#fde68a"};font-family:monospace;font-size:11px;font-weight:800;cursor:pointer;">
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
          return `<th style="padding:9px 10px;border:1px solid rgba(148,163,184,0.2);background:${isTarget ? "rgba(245,158,11,0.18)" : isReached ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.92)"};color:${isTarget ? "#fde68a" : "#93c5fd"};font-family:monospace;font-size:10.5px;min-width:190px;">STAGE ${c}${isTarget ? " (ACTIVE)" : isReached ? " (DONE)" : ""}</th>`;
        }).join("");

        const bodyRows = cmlEval.matrixRows.map((row) => `
          <tr>
            <td style="position:sticky;left:0;z-index:2;padding:9px 10px;border:1px solid rgba(148,163,184,0.22);background:#0b1120;color:#f1f5f9;font-size:12px;font-weight:700;min-width:190px;line-height:1.4;">
              <span style="color:${catColor[row.category] || "#93c5fd"};font-family:monospace;font-size:10px;display:block;margin-bottom:2px;">${(cmlEval.categories.find((c) => c.id === row.category)?.label || row.category).toUpperCase()}</span>
              ${this._escapeHtml(row.name)}
            </td>
            ${[1, 2, 3, 4, 5, 6, 7].map((c) => {
              const cellText = row.cells[c] || "—";
              const hl = c === cmlEval.targetCml ? "background:rgba(245,158,11,0.06);" : "";
              return `<td style="padding:9px 10px;border:1px solid rgba(148,163,184,0.16);color:${cellText === "—" ? "#475569" : "#cbd5e1"};font-size:11.5px;line-height:1.45;vertical-align:top;${hl}">${this._escapeHtml(cellText)}</td>`;
            }).join("")}
          </tr>
        `).join("");

        return `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
            <span style="font-family:monospace;font-size:11.5px;color:#cbd5e1;line-height:1.4;">7-STAGE MISSION ROADMAP — Every team area from Quick Idea (Stage 1) to Early Build Blueprint (Stage 7)</span>
            <button type="button" class="cml-matrix-mode" data-mode="column" style="padding:6px 12px;border-radius:4px;border:1px solid #38bdf8;background:rgba(56,189,248,0.14);color:#e0f2fe;font-family:monospace;font-size:10.5px;font-weight:700;cursor:pointer;">VIEW ONE STAGE AT A TIME</button>
          </div>
          <div style="overflow:auto;max-height:380px;border:1px solid rgba(148,163,184,0.22);border-radius:5px;">
            <table style="border-collapse:collapse;width:100%;text-align:left;">
              <thead><tr><th style="position:sticky;left:0;z-index:3;padding:9px 10px;border:1px solid rgba(148,163,184,0.22);background:#0f172a;color:#e2e8f0;font-family:monospace;font-size:10.5px;">MISSION TOPIC (24 AREAS)</th>${headerCols}</tr></thead>
              <tbody>${bodyRows}</tbody>
            </table>
          </div>
        `;
      }

      const colMeta = cmlEval.levels.find((l) => l.level === focusColumn) || cmlEval.levels[3];
      const rowsByCat = cmlEval.categories.map((cat) => {
        const rows = cmlEval.matrixRows.filter((r) => r.category === cat.id);
        return `
          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:11px;font-weight:800;color:${cat.color};letter-spacing:0.8px;margin-bottom:6px;">${cat.label.toUpperCase()} (${rows.length})</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;">
              ${rows.map((r) => `
                <div style="padding:9px 12px;border-radius:4px;background:rgba(15,23,42,0.72);border:1px solid rgba(148,163,184,0.18);">
                  <div style="font-family:monospace;font-size:11.5px;font-weight:700;color:#e2e8f0;">${this._escapeHtml(r.name)}</div>
                  <div style="font-size:12px;color:${r.cells[focusColumn] === "—" ? "#64748b" : "#cbd5e1"};margin-top:4px;line-height:1.45;">${this._escapeHtml(r.cells[focusColumn] || "—")}</div>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }).join("");

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${[1, 2, 3, 4, 5, 6, 7].map((c) => `
              <button type="button" class="cml-matrix-col" data-col="${c}" style="padding:6px 11px;border-radius:4px;border:1px solid ${focusColumn === c ? "#fbbf24" : "rgba(148,163,184,0.22)"};background:${focusColumn === c ? "rgba(245,158,11,0.18)" : "rgba(15,23,42,0.75)"};color:${focusColumn === c ? "#fde68a" : "#cbd5e1"};font-family:monospace;font-size:10.5px;font-weight:700;cursor:pointer;">Stage ${c}</button>
            `).join("")}
          </div>
          <button type="button" class="cml-matrix-mode" data-mode="grid" style="padding:6px 12px;border-radius:4px;border:1px solid #38bdf8;background:rgba(56,189,248,0.14);color:#e0f2fe;font-family:monospace;font-size:10.5px;font-weight:700;cursor:pointer;">VIEW FULL 7-STAGE TABLE</button>
        </div>
        <div style="padding:9px 12px;border-radius:4px;background:rgba(37,99,235,0.12);border:1px solid rgba(59,130,246,0.35);margin-bottom:10px;font-size:12px;line-height:1.45;color:#dbeafe;">
          <strong>${this._escapeHtml(colMeta.shortTitle)}</strong> (${this._escapeHtml(colMeta.phase)}) — Checkpoint: ${this._escapeHtml(colMeta.competedGate)} | Review: ${this._escapeHtml(colMeta.assignedGate)}
        </div>
        <div style="max-height:350px;overflow-y:auto;padding-right:6px;">
          ${rowsByCat}
        </div>
      `;
    }

    _renderCmlSpineTab(cmlEval) {
      const notes = cmlEval.notes || {};
      const spineCards = cmlEval.levels.map((lvl) => {
        const reached = lvl.level <= cmlEval.reachedCml;
        const loopTag = lvl.feedbackLoopGroup === "trade-loop" ? '<span style="color:#fbbf24;font-family:monospace;font-size:10px;font-weight:700;">COMPARE &amp; LOOP (2-4)</span>' : "";
        return `
          <div style="padding:10px 12px;border-radius:5px;background:${reached ? "rgba(37,99,235,0.16)" : "rgba(15,23,42,0.7)"};border:1px solid ${reached ? "rgba(59,130,246,0.55)" : "rgba(148,163,184,0.18)"};">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
              <span style="font-family:monospace;font-size:11.5px;font-weight:800;color:${reached ? "#93c5fd" : "#e2e8f0"};">${this._escapeHtml(lvl.shortTitle)}</span>
              ${loopTag}
            </div>
            <div style="font-family:monospace;font-size:10.5px;color:#94a3b8;margin-top:4px;line-height:1.4;">${this._escapeHtml(lvl.phase)} · ${this._escapeHtml(lvl.teamContext)}</div>
            <div style="font-size:11.5px;color:#cbd5e1;margin-top:5px;line-height:1.45;">${this._escapeHtml(lvl.summary)}</div>
            <div style="font-family:monospace;font-size:10.5px;color:#a5f3fc;margin-top:5px;line-height:1.4;">Pitch Milestone: ${this._escapeHtml(lvl.competedGate)} | Review: ${this._escapeHtml(lvl.assignedGate)}</div>
          </div>
        `;
      }).join("");

      const field = (key, label, placeholder) => `
        <label style="display:flex;flex-direction:column;gap:4px;font-family:monospace;font-size:10.5px;color:#93c5fd;">
          <span>${this._escapeHtml(label)}</span>
          <input type="text" class="cml-note-field" data-note-key="${key}" value="${this._escapeHtml(notes[key] || "")}" placeholder="${this._escapeHtml(placeholder)}" style="padding:7px 10px;border-radius:4px;border:1px solid rgba(148,163,184,0.28);background:rgba(5,8,16,0.85);color:#f8fafc;font-family:monospace;font-size:11.5px;" />
        </label>
      `;

      const caveatsHtml = cmlEval.caveatsStatus.map((cav) => `
        <div style="padding:9px 11px;border-radius:4px;background:rgba(15,23,42,0.75);border-left:3px solid ${cav.flagged ? "#fbbf24" : "#4ade80"};">
          <div style="display:flex;justify-content:space-between;font-family:monospace;font-size:11px;font-weight:700;color:#f1f5f9;">
            <span>${this._escapeHtml(cav.title)}</span>
            <span style="color:${cav.flagged ? "#fde68a" : "#86efac"};">${cav.flagged ? "WATCH" : "GOOD"}</span>
          </div>
          <div style="font-size:11.5px;color:#cbd5e1;margin-top:4px;line-height:1.45;">${this._escapeHtml(cav.liveNote)}</div>
        </div>
      `).join("");

      return `
        <div style="max-height:400px;overflow-y:auto;padding-right:6px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-bottom:12px;">
            ${spineCards}
          </div>
          <div style="padding:12px 14px;border-radius:5px;background:rgba(8,13,24,0.85);border:1px solid rgba(103,232,249,0.25);margin-bottom:12px;">
            <div style="font-family:monospace;font-size:11px;font-weight:800;color:#67e8f9;margin-bottom:8px;">MISSION IDEA &amp; TEAM NOTES (Helps finish planning items in Stages 1-6)</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;">
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
          <div style="padding:11px 13px;border-radius:5px;background:rgba(15,23,42,0.7);border:1px solid rgba(251,191,36,0.28);">
            <div style="font-family:monospace;font-size:11px;font-weight:800;color:#fde68a;margin-bottom:6px;">HOW COMPLEX IS THIS MISSION? ${this._escapeHtml(cmlEval.complexity.tier)} (${cmlEval.complexity.score}/5) &amp; 3 GOLDEN RULES</div>
            <div style="font-size:11.5px;color:#cbd5e1;margin-bottom:8px;line-height:1.45;">${this._escapeHtml(cmlEval.complexity.advisory)}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;">
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
          <td style="padding:6px 8px;border:1px solid rgba(148,163,184,0.2);font-family:monospace;font-size:10.5px;color:#94a3b8;font-weight:700;" title="Likelihood ${l} out of 5">L${l}</td>
          ${[1, 2, 3, 4, 5].map((c) => {
            const list = r5.cells[`${l}x${c}`] || [];
            const chips = list.map((r) => `<span title="${this._escapeHtml(r.title)}" style="display:inline-block;padding:2px 6px;margin:2px;border-radius:3px;background:#0f172a;border:1px solid rgba(255,255,255,0.45);color:#f8fafc;font-family:monospace;font-size:10px;font-weight:800;">#${idxMap.get(r.id)}</span>`).join("");
            return `<td style="width:56px;height:40px;text-align:center;vertical-align:middle;border:1px solid rgba(148,163,184,0.22);background:${cellBg(l, c)};">${chips}</td>`;
          }).join("")}
        </tr>
      `).join("");

      const registerRows = r5.risks.map((r, idx) => {
        const col = r.severity === "HIGH" ? "#fca5a5" : r.severity === "MED" ? "#fde68a" : "#86efac";
        return `
          <div style="padding:9px 11px;border-radius:4px;background:rgba(15,23,42,0.75);border-left:3px solid ${col};">
            <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-family:monospace;font-size:11.5px;color:#f1f5f9;font-weight:700;">
              <span>#${idx + 1} ${this._escapeHtml(r.title)}</span>
              <span style="color:${col};">Likely ${r.likelihood}/5 · Impact ${r.consequence}/5 (${r.severity})</span>
            </div>
            <div style="font-size:11.5px;color:#cbd5e1;margin-top:4px;line-height:1.45;">How to fix (${this._escapeHtml(r.owner)}): ${this._escapeHtml(r.mitigation)}</div>
          </div>
        `;
      }).join("");

      return `
        <div style="display:grid;grid-template-columns:minmax(290px,auto) 1fr;gap:14px;align-items:start;">
          <div>
            <div style="font-family:monospace;font-size:11px;font-weight:700;color:#93c5fd;margin-bottom:4px;">5x5 RISK MAP (${r5.highCount} High · ${r5.medCount} Med · ${r5.lowCount} Low)</div>
            <div style="font-family:monospace;font-size:10.5px;color:#94a3b8;margin-bottom:7px;line-height:1.4;">Rows = How Likely (L1 Rare to L5 Likely) · Cols = How Serious (I1 Tiny to I5 Loss)</div>
            <table style="border-collapse:collapse;">
              <tbody>
                ${gridRows}
                <tr>
                  <td></td>
                  ${[1, 2, 3, 4, 5].map((c) => `<td style="text-align:center;padding:5px;font-family:monospace;font-size:10.5px;color:#94a3b8;font-weight:700;" title="Impact ${c} out of 5">I${c}</td>`).join("")}
                </tr>
              </tbody>
            </table>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;padding-right:6px;">
            ${registerRows}
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);">
          <button type="button" id="btn-cml-export-json" style="padding:8px 13px;border-radius:4px;border:1px solid rgba(56,189,248,0.5);background:rgba(56,189,248,0.14);color:#e0f2fe;font-family:monospace;font-size:11px;font-weight:700;cursor:pointer;">DOWNLOAD SUMMARY (.JSON)</button>
          <button type="button" id="btn-cml-export-md" style="padding:8px 13px;border-radius:4px;border:1px solid rgba(167,139,250,0.5);background:rgba(167,139,250,0.14);color:#ddd6fe;font-family:monospace;font-size:11px;font-weight:700;cursor:pointer;">DOWNLOAD READABLE REPORT (.MD)</button>
          <button type="button" id="btn-cml-export-full-mdl" style="padding:8px 13px;border-radius:4px;border:1px solid rgba(74,222,128,0.5);background:rgba(74,222,128,0.14);color:#bbf7d0;font-family:monospace;font-size:11px;font-weight:700;cursor:pointer;">DOWNLOAD FULL BLUEPRINT (.JSON)</button>
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
          <button type="button" class="cml-wb-tab" data-tab="${id}" style="padding:8px 14px;border-radius:5px;border:1px solid ${activeTab === id ? "#fbbf24" : "rgba(255,255,255,0.14)"};background:${activeTab === id ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.03)"};color:${activeTab === id ? "#fde68a" : "#94a3b8"};font-family:monospace;font-size:11.5px;font-weight:700;cursor:pointer;">${label}</button>
        `;

        const alertsHtml = cmlEval.feedbackAlerts.map((a) => {
          const bd = a.severity === "ALERT" ? "rgba(239,68,68,0.5)" : "rgba(251,191,36,0.45)";
          const bg = a.severity === "ALERT" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.1)";
          return `<div style="padding:7px 10px;border-radius:4px;border:1px solid ${bd};background:${bg};font-size:11.5px;line-height:1.45;color:#f8fafc;"><strong>${this._escapeHtml(a.title)}:</strong> ${this._escapeHtml(a.detail)}</div>`;
        }).join("");

        let tabBody = "";
        if (activeTab === "checklist") tabBody = this._renderCmlChecklistTab(cmlEval, filterCat);
        else if (activeTab === "matrix") tabBody = this._renderCmlMatrixTab(cmlEval, matrixMode, focusColumn);
        else if (activeTab === "spine") tabBody = this._renderCmlSpineTab(cmlEval);
        else tabBody = this._renderCmlRiskTab(cmlEval);

        body.innerHTML = `
          <div style="padding:12px 14px;border-radius:5px;background:rgba(8,13,24,0.88);border:1px solid rgba(56,189,248,0.3);margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
              <div>
                <div style="font-family:monospace;font-size:12px;font-weight:800;color:#7dd3fc;line-height:1.4;">NOW AT: ${this._escapeHtml(cmlEval.reachedTitle.toUpperCase())} · VERIFIED: STAGE ${cmlEval.certifiedCml} · SCORE ${t.overallScore}/100</div>
                <div style="font-family:monospace;font-size:10.5px;color:#94a3b8;margin-top:4px;">${this._escapeHtml(cmlEval.reachedPhase)} · Complexity: ${this._escapeHtml(cmlEval.complexity.tier)} (${cmlEval.complexity.score}/5) · Mission: ${this._escapeHtml(t.scenario.name)}</div>
                <div style="font-size:12px;color:#cbd5e1;margin-top:6px;line-height:1.5;">How it works: NASA grows missions from <strong>Stage 1</strong> (quick idea sketch) to <strong>Stage 9</strong> (ready to build hardware). Reach <strong>80% Done</strong> plus all <strong>Must-Have</strong> items to advance!</div>
              </div>
              <div style="display:flex;gap:7px;flex-wrap:wrap;">
                ${returnTask ? `<button type="button" id="btn-cml-return" style="padding:6px 11px;border-radius:4px;border:1px solid rgba(148,163,184,0.35);background:rgba(15,23,42,0.85);color:#e2e8f0;font-family:monospace;font-size:10.5px;font-weight:700;cursor:pointer;">← BACK</button>` : ""}
                <button type="button" id="btn-cml-mdl-desk" style="padding:6px 11px;border-radius:4px;border:1px solid rgba(103,232,249,0.45);background:rgba(103,232,249,0.12);color:#a5f3fc;font-family:monospace;font-size:10.5px;font-weight:700;cursor:pointer;">DESIGN DESK</button>
                <button type="button" id="btn-cml-sync-all" style="padding:6px 11px;border-radius:4px;border:1px solid #4ade80;background:rgba(22,163,74,0.25);color:#bbf7d0;font-family:monospace;font-size:10.5px;font-weight:800;cursor:pointer;">SAVE TO CREW</button>
              </div>
            </div>
            ${alertsHtml ? `<div style="display:flex;flex-direction:column;gap:6px;margin-top:9px;">${alertsHtml}</div>` : ""}
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
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
        if (data && data.reason === "role") {
          const roleLabel = data.assignedRoleLabel || String(data.assignedRole || "ASSIGNED ROLE").toUpperCase();
          const roleShort = data.assignedRoleShort || "";
          this.showToast(`[ROLE LOCK] ${roleShort ? `${roleShort} · ` : ""}${roleLabel.toUpperCase()} ONLY · THIS CONSOLE IS NOT YOURS`);
          if (mission) this.applyMissionDefinition(mission);
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

      window.netManager.on("mission_validation_failed", (data) => {
        const reasons = (data && Array.isArray(data.reasons)) ? data.reasons : [];
        const first = reasons.length ? reasons[0] : "The LDR report did not pass server validation.";
        this.showToast(`[SERVER VALIDATION] ${first}`);
        const landingTask = this.tasks.find((entry) => entry.id === "task_landing");
        if (landingTask) landingTask.completed = false;
        this.updateTaskListUI();
        this.updateTaskBar();
        if (reasons.length) console.warn("[LDR] Server validation rejected:", reasons);
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
        if (data && data.mission && data.mission.flightProfile === "artemis") return;
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
          if (this.nearbyMissionDiorama) {
            this.inspectMissionDiorama();
          } else if (this.nearbyTask) {
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
          } else if (this.nearbyMissionDiorama) {
            this.inspectMissionDiorama();
          } else if (this.nearbyTask) {
            this.openTaskModal(this.nearbyTask);
          }
        }
      });
    }

    // Allows players to open the Mission Architecture console directly from the Space Center Pad or HUD.
    // The HUB charter objective belongs to the assigned station role; other roles still get the
    // pre-flight design desk without taking that role's station objective.
    openMissionPlannerFromGround() {
      const archTask = this.tasks.find((t) => t.id === "task_antenna") || this.tasks[0];
      if (archTask && this._getRoleAssignment(this.getTaskRole(archTask)).isMine) {
        this.openTaskModal(archTask);
        return;
      }
      this.openPreFlightMdlDesk("arch");
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

      const diorama = window.shipInterior && window.shipInterior.missionDiorama;
      let payloadCloser = false;
      if (diorama && diorama.root && window.shipInterior.isInteriorActive) {
        const payloadDistance = Math.hypot(
          playerPos.x - diorama.root.position.x,
          playerPos.z - diorama.root.position.z
        );
        payloadCloser = payloadDistance < 1.65 && (!closest || payloadDistance < minDistance);
        if (payloadCloser) closest = null;
      }

      this.nearbyTask = closest;
      this.nearbyMissionDiorama = payloadCloser;

      const btnUse = document.getElementById("btn-proximity-use");
      const labelUse = document.getElementById("proximity-task-label");
      const crosshair = document.getElementById("hud-crosshair");

      if (btnUse && labelUse) {
        if (this.nearbyMissionDiorama) {
          btnUse.style.display = "flex";
          labelUse.textContent = "[E] INSPECT MISSION PAYLOAD";
        } else if (closest) {
          const assign = this._getRoleAssignment(this.getTaskRole(closest));
          const tag = assign.isMine
            ? `ASSIGNED · ${assign.badgeText}`
            : `ROLE LOCK · ${assign.short} ONLY`;
          btnUse.style.display = "flex";
          labelUse.textContent = `[E] ${tag} ${closest.completed ? "REVIEW " : ""}${closest.name.toUpperCase()}`;
        } else {
          btnUse.style.display = "none";
        }
      }

      if (crosshair) {
        if (closest || this.nearbyMissionDiorama) {
          crosshair.classList.add("target-locked");
        } else {
          crosshair.classList.remove("target-locked");
        }
      }
    }

    inspectMissionDiorama() {
      const t = this.evaluateMissionDesign();
      this.telemetry = t;
      const presentation = this.getMissionPresentation(t.scenario.id);
      let detail = "";
      if (t.scenario.isBioPayload && t.bioTelemetry) {
        const bio = t.bioTelemetry;
        detail = `${bio.yieldOk ? "VITAMIN A GOAL MET" : "YIELD NEEDS WORK"} · ${bio.thermal.incubateTempC}°C / ${bio.thermal.storageTempC}°C · ${bio.protocol.replicates} BAGS`;
      } else if (t.scenario.isCubesat) {
        detail = `${String(t.cubesatForm.name || "CUBESAT").toUpperCase()} · ${t.dryMassKg} KG · ${t.overallScore}/100`;
      } else if (t.scenario.requiresWavelength) {
        detail = `${t.wavelength.shortLabel} · ${t.telescopeOk ? "COLD OPTICS READY" : "CHECK COOLING"} · ${t.scienceScore}/100 SCI`;
      } else {
        detail = `${t.orbit.name} · ${t.overallScore}/100 · ${t.lv.name}`;
      }
      this.showToast(`${presentation.destination} · ${presentation.title} — ${detail}`);
      if (window.spaceAudio) window.spaceAudio.playClick();
      if (window.shipInterior && typeof window.shipInterior.pingMissionDiorama === "function") {
        window.shipInterior.pingMissionDiorama();
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

      // Role ownership is enforced here for the UI and again on the server for
      // completion, so a crewmate cannot run another role's station.
      const assigned = this._getRoleAssignment(this.getTaskRole(task));
      if (!assigned.isMine) {
        this.showToast(`[ROLE LOCK] ${assigned.label.toUpperCase()} ONLY · ${assigned.namesText} OWNS THIS STATION`);
        if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
        return;
      }

      this._runCleanup();
      this.activeTask = task;
      if (window.csaNasaLab && typeof window.csaNasaLab.syncGroundLockState === "function") {
        window.csaNasaLab.syncGroundLockState();
      }
      const modal = document.getElementById("task-modal-overlay");
      const title = document.getElementById("task-modal-title");
      const body = document.getElementById("task-modal-content");

      if (!modal || !title || !body) return;

      title.textContent = `${task.location} · [${assigned.badgeText}] · ${task.name.toUpperCase()}`;
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

    finishTask(task, stayOpen = false, options = {}) {
      const assigned = this._getRoleAssignment(this.getTaskRole(task));
      if (!assigned.isMine) {
        this.showToast(`[ROLE LOCK] ${assigned.label.toUpperCase()} ONLY · THIS CONSOLE IS NOT YOURS`);
        if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
        return;
      }

      this._runCleanup();
      const evaluation = options && options.evaluation ? options.evaluation : null;
      const wasCompleted = task.completed;
      if (!evaluation) {
        task.completed = true;
      }
      this._renderResourceMeters();

      if (window.spaceAudio) window.spaceAudio.playRadioBeep(false);

      const patch = this.buildDesignPatch(task);
      const hasPatch = patch && Object.keys(patch).length > 0;
      if (window.netManager && (!wasCompleted || hasPatch || evaluation)) {
        window.netManager.completeTask(task.id, task.name, patch, evaluation);
      }
      if (evaluation && typeof this.showToast === "function") {
        this.showToast("LDR report sent to mission control — awaiting server validation…");
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

    buildMissionValidationSnapshot(t, missionEvent, phases, allNominal) {
      return {
        scenarioId: t.scenario.id,
        difficultyId: t.difficulty.id,
        overallScore: t.overallScore,
        scienceScore: t.scienceScore,
        engineeringScore: t.engineeringScore,
        cmlLevel: t.cmlLevel,
        allNominal: !!allNominal,
        budgetOk: !!t.budgetOk,
        massOk: !!t.massOk,
        powerOk: !!t.powerOk,
        commsOk: !!t.commsOk,
        deltaVOk: !!t.deltaVOk,
        thermalOk: !!t.thermalOk,
        radiationOk: !!t.radiationOk,
        lifetimeOk: !!t.lifetimeOk,
        disposalOk: !!t.disposalOk,
        telescopeOk: !!t.telescopeOk,
        bioOk: !!(t.bioTelemetry && t.bioTelemetry.bioOk),
        totalCostM: t.totalCostM,
        budgetCapM: t.budgetCapM,
        budgetRemainingM: t.budgetRemainingM,
        wetMassKg: t.wetMassKg,
        lvCapacityKg: t.lvCapacityKg,
        massMarginPct: t.massMarginPct,
        totalPowerLoadW: t.totalPowerLoadW,
        daylightGenW: t.daylightGenW,
        netDaylightMarginW: t.netDaylightMarginW,
        batteryDodPct: t.batteryDodPct,
        dataGeneratedGbPerDay: t.dataGeneratedGbPerDay,
        downlinkCapGbPerDay: t.downlinkCapGbPerDay,
        linkMarginDb: t.linkMarginDb,
        achievedDeltaV: t.achievedDeltaV,
        requiredDeltaV: t.requiredDeltaV,
        estimatedLifetimeMonths: t.estimatedLifetimeMonths,
        selectedInstCount: (t.selectedInsts || []).length,
        selectedInstTypes: (t.selectedInsts || []).map((instrument) => instrument.type),
        phases: (phases || []).map((phase) => ({
          phase: phase.phase,
          ok: phase.ok === true,
          metric: phase.metric
        })),
        event: missionEvent
          ? {
              id: missionEvent.id,
              severity: missionEvent.severity,
              title: missionEvent.title,
              ok: !!missionEvent.ok,
              metric: missionEvent.metric
            }
          : null,
        design: this.syncFullDesignPatch()
      };
    }

    // ========================================================================
    // CONSOLE 1: MISSION ARCHITECTURE, SCENARIO & 4-ROLE TEAM STRATEGY
    // ========================================================================
    renderMissionArchitectureConsole(container, task) {
      const render = () => {
        const md = this.missionDesign;
        const t = this.evaluateMissionDesign();
        this.telemetry = t;
        this._activeRenderCallback = render;

        const modalTitle = document.getElementById("task-modal-title");
        if (modalTitle) modalTitle.textContent = "MAIN HUB · MISSION GOAL";

        const allScenarios = Object.values(MISSION_SCENARIOS);
        const starterIds = this.getStarterMissionIds();
        let visibleIds = this.missionPickerExpanded
          ? allScenarios.map((sc) => sc.id)
          : starterIds.filter((id) => !!MISSION_SCENARIOS[id]);
        if (!this.missionPickerExpanded && md.scenarioId && !visibleIds.includes(md.scenarioId) && MISSION_SCENARIOS[md.scenarioId]) {
          visibleIds = [md.scenarioId, ...visibleIds.filter((id) => id !== md.scenarioId)].slice(0, Math.max(starterIds.length, 1));
        }
        const scenarioCards = visibleIds
          .map((id) => MISSION_SCENARIOS[id])
          .filter(Boolean)
          .map((sc) => this.renderMissionPickCard(sc, {
            active: md.scenarioId === sc.id,
            budgetM: Math.round(sc.baseBudgetM * t.difficulty.budgetMultiplier)
          }))
          .join("");
        const moreMissions = allScenarios.length > starterIds.length
          ? `<button type="button" class="mission-pick-more" id="btn-md-more-missions" aria-expanded="${this.missionPickerExpanded}" aria-controls="md-mission-pick-grid">
              ${this.missionPickerExpanded
                ? `SHOW ${starterIds.length} STARTERS`
                : `<b>ALL ${allScenarios.length}</b> MISSIONS`}
            </button>`
          : "";

        const DIFF_QUICK = {
          cadet: { label: "Beginner", sub: "Extra room and friendly hints", facts: ["+25% budget", "Friendly hints"] },
          engineer: { label: "Standard", sub: "Real-world budget and limits", facts: ["Standard budget", "Balanced limits"] },
          director: { label: "Expert", sub: "Tighter budget and stricter checks", facts: ["−12% budget", "Strict storm checks"] }
        };
        const diffBtns = Object.values(DIFFICULTY_LEVELS)
          .map((d) => {
            const active = md.difficultyId === d.id;
            const quick = DIFF_QUICK[d.id] || { label: d.name, sub: d.desc, facts: [] };
            return `
              <button type="button" class="md-diff-btn md-diff-card${active ? " is-active" : ""}" data-id="${d.id}" aria-pressed="${active}" title="${this._escapeHtml(d.desc)}">
                <span class="md-diff-top">
                  <span class="md-diff-name">${quick.label}</span>
                  ${active ? `<span class="md-selected-tag">SELECTED</span>` : ""}
                </span>
                <span class="md-diff-sub">${quick.sub}</span>
                <span class="md-facts">
                  ${quick.facts.map((fact) => `<span class="md-fact">${fact}</span>`).join("")}
                </span>
              </button>
            `;
          })
          .join("");

        let specializationHtml = "";
        if (t.scenario.requiresWavelength) {
          const WAVE_QUICK = {
            uv_optical: "No extra cooling needed",
            near_ir: "Needs active cooling",
            mid_ir: "Deep-freeze cooling + shade",
            xray: "Needs active cooling"
          };
          specializationHtml = `
            <section class="md-hub-step" aria-labelledby="md-hub-special-title">
              <div class="md-step-head">
                <span class="md-step-tag">MISSION SPECIAL</span>
                <div class="md-step-titles">
                  <h3 id="md-hub-special-title">Choose what your telescope sees</h3>
                  <p>Different kinds of light need different cooling. Pick the one that matches your science goal.</p>
                </div>
              </div>
              <div class="md-special-grid">
                ${Object.values(WAVELENGTH_BANDS).map((wb) => {
                  const active = md.wavelengthId === wb.id;
                  return `
                    <button type="button" class="md-wave-card md-special-card${active ? " is-active" : ""}" data-id="${wb.id}" aria-pressed="${active}">
                      <span class="md-special-top">
                        <span class="md-special-name">${wb.name}</span>
                        ${active ? `<span class="md-selected-tag">SELECTED</span>` : ""}
                      </span>
                      <span class="md-facts">
                        <span class="md-fact">${WAVE_QUICK[wb.id] || "Check cooling"}</span>
                      </span>
                      <span class="md-special-copy">${wb.explain}</span>
                    </button>
                  `;
                }).join("")}
              </div>
            </section>
          `;
        } else if (t.scenario.isCubesat) {
          specializationHtml = `
            <section class="md-hub-step" aria-labelledby="md-hub-special-title">
              <div class="md-step-head">
                <span class="md-step-tag">MISSION SPECIAL</span>
                <div class="md-step-titles">
                  <h3 id="md-hub-special-title">Pick your mini-satellite size</h3>
                  <p>Bigger sizes carry more tools — and weigh more.</p>
                </div>
              </div>
              <div class="md-special-grid">
                ${Object.values(CUBESAT_FORMS).map((cf) => {
                  const active = md.cubesatFormId === cf.id;
                  return `
                    <button type="button" class="md-csform-card md-special-card${active ? " is-active" : ""}" data-id="${cf.id}" aria-pressed="${active}">
                      <span class="md-special-top">
                        <span class="md-special-name">${cf.name}</span>
                        ${active ? `<span class="md-selected-tag">SELECTED</span>` : ""}
                      </span>
                      <span class="md-facts">
                        <span class="md-fact">${cf.maxMassKg} kg max</span>
                        <span class="md-fact">${cf.maxInst} tools</span>
                      </span>
                      <span class="md-special-copy">${cf.explain}</span>
                    </button>
                  `;
                }).join("")}
              </div>
            </section>
          `;
        } else if (t.scenario.isBioPayload) {
          specializationHtml = `
            <section class="md-hub-step" aria-labelledby="md-hub-special-title">
              <div class="md-step-head">
                <span class="md-step-tag">MISSION SPECIAL</span>
                <div class="md-step-titles">
                  <h3 id="md-hub-special-title">Grow Vitamin A on the Space Station</h3>
                  <p>Four moves: launch dry yeast, wake it with clean water, warm and shake it, then freeze it for Earth lab tests.</p>
                </div>
              </div>
              ${this.renderBioMissionStoryboard("hub")}
              <p class="md-step-note">Goal: 12+ bags · at least 3 mg/L Vitamin A · each bag under 250 g and 300 mL.</p>
              <div class="md-special-grid">
                ${Object.values(BIO_ORGANISM_OPTIONS).map((org) => {
                  const active = md.bioOrganismId === org.id;
                  return `
                    <button type="button" class="md-bioorg-card md-special-card${active ? " is-active" : ""}" data-id="${org.id}" aria-pressed="${active}" title="${this._escapeHtml(org.explain)}">
                      <span class="md-special-top">
                        <span class="md-special-name">${org.name}</span>
                        <span class="md-special-tags">
                          ${org.goalAligned ? `<span class="md-best-tag">BEST MATCH</span>` : ""}
                          ${active ? `<span class="md-selected-tag">SELECTED</span>` : ""}
                        </span>
                      </span>
                      <span class="md-facts">
                        <span class="md-fact">${org.targetTempC}°C warm</span>
                        <span class="md-fact">${org.requiresSixHourShake ? "6h shake" : "No 6h shake"}</span>
                        <span class="md-fact">${org.baseBetaCaroteneUgMl} mg/L</span>
                      </span>
                      <span class="md-special-copy">${org.explain}</span>
                    </button>
                  `;
                }).join("")}
              </div>
            </section>
          `;
        }

        const role = this._getRoleAssignment(this.getTaskRole(task));
        const crewSize = (window.netManager && window.netManager.roomState && Array.isArray(window.netManager.roomState.players))
          ? window.netManager.roomState.players.length
          : 1;
        const roleOwnerText = role.isUnstaffed
          ? (crewSize <= 1 ? "SOLO · YOU COVER THIS DESK" : "OPEN · ANY CREW CAN COVER")
          : this._escapeHtml(role.namesText);
        const difficultyLabel = (DIFF_QUICK[md.difficultyId] || {}).label || md.difficultyId;
        const roleDuties = {
          flight_director: "Earth · launch clearance and docking go-ahead",
          ground_capcom: "Earth · Earth dishes, power, and science links",
          commander: "Space · launch, docking, mission goal, and orbit",
          engineer: "Space · body, solar, radio, and engines",
          scientist: "Space · science tools and cooling",
          specialist: "Space · final test; backup at any desk"
        };
        const rolesHtml = ["flight_director", "ground_capcom", "commander", "engineer", "scientist", "specialist"]
          .map((rId) => {
            const a = this._getRoleAssignment(rId);
            return `
              <div class="md-role-card${a.isMine ? " is-mine" : ""}">
                <span class="md-role-card-head">
                  <strong style="color:${a.color};">[${a.short}] ${this._escapeHtml(a.label)}</strong>
                  <span>${a.isUnstaffed ? (a.isMine ? "OPEN · YOU CAN COVER" : "OPEN") : `${this._escapeHtml(a.namesText)}${a.isMine ? " (YOU)" : ""}`}</span>
                </span>
                <p>${roleDuties[rId] || "Helps across all desks."}</p>
              </div>
            `;
          })
          .join("");

        container.innerHTML = `
          <div class="md-hub">
            <header class="md-hub-hero">
              <div class="md-hub-hero-copy">
                <span class="md-hub-kicker">MISSION SETUP · DESK 1 OF 7</span>
                <h2>Pick a mission.</h2>
                <p>3 starters. Open the full list anytime.</p>
              </div>
              <div class="md-hub-hero-side">
                <button type="button" id="btn-arch-apply-rec" class="md-safe-btn">AUTO-FILL A SAFE PLAN</button>
                <span class="md-hero-hint">FILLS ALL 7 DESKS</span>
              </div>
            </header>

            <div class="md-role-line">
              <span class="md-role-dot" style="background:${role.color};"></span>
              <span><strong>${role.isMine ? "YOUR DESK" : "OPEN ROLE"}</strong> · ${this._escapeHtml(role.label)}</span>
              <span class="md-role-owner">${roleOwnerText}</span>
            </div>

            <section class="md-hub-step" aria-labelledby="md-hub-goal-title">
              <div class="md-step-head">
                <span class="md-step-tag">MISSION GOAL</span>
                <div class="md-step-titles">
                  <h3 id="md-hub-goal-title">Pick a mission</h3>
                  <p>Destination, job, and risk at a glance.</p>
                </div>
              </div>
              <div class="md-scenario-grid mission-pick-grid is-hub" id="md-mission-pick-grid">${scenarioCards}${moreMissions}</div>
            </section>

            ${specializationHtml}

            <section class="md-hub-step" aria-labelledby="md-hub-diff-title">
              <div class="md-step-head">
                <span class="md-step-tag">DIFFICULTY</span>
                <div class="md-step-titles">
                  <h3 id="md-hub-diff-title">How much help?</h3>
                  <p>Changes budget and safety margins.</p>
                </div>
              </div>
              <div class="md-diff-grid">${diffBtns}</div>
            </section>

            <details class="md-team-panel">
              <summary>
                <span class="md-team-title">Who does what on a team</span>
                <span class="md-team-meta">6 roles · open only if you play with friends</span>
              </summary>
              <p class="md-team-intro">Solo? You can run every desk. With a team, each role covers different desks.</p>
              <div class="md-role-grid">${rolesHtml}</div>
            </details>

            <footer class="md-hub-footer">
              <div class="md-hub-summary">
                <span class="md-summary-label">CURRENT SETUP</span>
                <strong>${t.scenario.code} · ${t.scenario.name}</strong>
                <span class="md-summary-meta">$${t.budgetCapM}M budget · ${t.scenario.targetLifetimeMonths} months · ${difficultyLabel}</span>
              </div>
              <button type="button" id="btn-commit-arch" class="md-commit-btn">Save goal &amp; continue →</button>
            </footer>
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

        const moreMissionsBtn = container.querySelector("#btn-md-more-missions");
        if (moreMissionsBtn) {
          moreMissionsBtn.addEventListener("click", () => {
            this.missionPickerExpanded = !this.missionPickerExpanded;
            if (window.spaceAudio) window.spaceAudio.playClick();
            render();
          });
        }

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
            this.showToast("Applied the recommended safe setup for this mission!");
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
              <div class="md-orbit-card" data-id="${orb.id}" style="padding:13px 15px;border-radius:8px;border:1px solid ${active ? "#67e8f9" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(103,232,249,0.10)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px;">
                  <span style="font-size:13.5px;font-weight:700;color:#ece7dc;">${orb.name}</span>
                  ${rec ? `<span style="font-family:monospace;font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(127,184,166,0.18);color:#7fb8a6;font-weight:700;">RECOMMENDED</span>` : ""}
                </div>
                <div style="font-family:monospace;font-size:11px;color:#67e8f9;margin-bottom:6px;line-height:1.45;">
                  Time per Lap: ${orb.periodMin} min · Time in Shadow: ${Math.round(orb.eclipseFraction * 100)}% · Fuel Needed: ${orb.reqInsertionDv} m/s · Shield Needed: Level ${orb.radiationEnvKrad}
                </div>
                <div style="font-size:12px;color:#cbd5e1;line-height:1.48;">${orb.explain}</div>
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

        const isBio = !!t.scenario.isBioPayload;
        const isIssDest = !isBio || t.orbit.id === "iss_cubesat_418" || t.orbit.id === "leo_400";
        const launchReady = t.massOk && isIssDest;
        const compatible = launchReady && t.budgetOk;
        const bioLaunchBanner = isBio
          ? `<div style="margin-bottom:12px;padding:11px 14px;border-radius:7px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.34);font-size:12px;color:#e2e8f0;line-height:1.5;">
              <strong style="color:#fbbf24;">SPACE STATION SUPPLY DELIVERY:</strong> Fly to the <strong>Space Station (418 km)</strong> aboard the <strong>Space Station Supply Ship (Cygnus)</strong>. The experiment kits ride at normal room temperature inside sealed silver pouches (<em>4 Growth Bags + 4 Water Filters per kit</em>) to keep the sleeping yeast dry and fresh.
            </div>`
          : "";

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          ${bioLaunchBanner}
          <div style="margin-bottom:14px;">
            <div style="font-family:monospace;font-size:11.5px;font-weight:700;letter-spacing:1.2px;color:#9aa4ae;margin-bottom:8px;">
              STEP 2A · WHERE IN SPACE ARE WE FLYING?
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:10px;">
              ${orbitCards}
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 2B · SELECT LAUNCH VEHICLE (CHECK MASS vs. ORBIT CAPACITY)
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:10px;">
              ${lvCards}
            </div>
          </div>

          <div style="padding:12px 14px;border-radius:8px;background:${launchReady ? "rgba(127,184,166,0.08)" : "rgba(239,68,68,0.12)"};border:1px solid ${launchReady ? "rgba(127,184,166,0.35)" : "rgba(239,68,68,0.45)"};margin-bottom:16px;font-size:12.5px;line-height:1.5;color:#ece7dc;">
            ${
              !isIssDest
                ? `<strong>[NEEDS FIX] Wrong Destination:</strong> The Space Station Vitamin Maker must fly to the <strong>Space Station Orbit (418 km)</strong>.`
                : t.massOk
                  ? `<strong>[READY] Rocket &amp; Weight Match:</strong> ${t.lv.name} can lift <strong>${t.lvCapacityKg} kg</strong> to ${t.orbit.name}, giving your <strong>${t.wetMassKg} kg</strong> spacecraft <strong>+${t.massMarginPct}%</strong> spare lifting room.`
                  : `<strong>[TOO HEAVY] Rocket Cannot Lift This Weight:</strong> Your spacecraft weighs <strong>${t.wetMassKg} kg</strong>, which is heavier than the <strong>${t.lvCapacityKg} kg</strong> limit of ${t.lv.name} for ${t.orbit.name}. Pick a stronger rocket or lighter parts.`
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
            if (!launchReady) {
              if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
              this.showToast(!isIssDest
                ? "BioNutrients-2 must go to the Space Station (418 km up)!"
                : "Your equipment is too heavy for this rocket to carry to that orbit!");
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
          ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:7px;background:rgba(103,232,249,0.06);border:1px solid rgba(103,232,249,0.28);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
              <span style="font-family:monospace;font-size:11px;font-weight:700;color:#67e8f9;">MINI-SATELLITE SIZE:</span>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${Object.values(CUBESAT_FORMS).map((cf) => `<button type="button" class="md-csform-btn" data-id="${cf.id}" style="padding:5px 11px;border-radius:4px;border:1px solid ${md.cubesatFormId === cf.id ? "#67e8f9" : "rgba(255,255,255,0.16)"};background:${md.cubesatFormId === cf.id ? "rgba(103,232,249,0.22)" : "rgba(0,0,0,0.3)"};color:#ece7dc;font-family:monospace;font-size:11px;font-weight:700;cursor:pointer;">${cf.shortLabel}</button>`).join("")}
              </div>
            </div>`
          : "";

        const isBio = !!t.scenario.isBioPayload;
        const bio = t.bioTelemetry;
        const bioHwOk = !isBio || (bio.containerMassOk && bio.kitVolumeOk && bio.bag.hasIssNonLuerCover);
        const step3Ready = t.powerOk && bioHwOk;
        const bioBagBar = isBio
          ? `<div style="margin-bottom:12px;padding:12px 14px;border-radius:7px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.32);">
              <div style="font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.1px;color:#fbbf24;margin-bottom:6px;">
                PICK YOUR GROWTH POUCH &amp; SAFETY LOCK CAP
              </div>
              <div style="font-size:12px;color:#cbd5e1;margin-bottom:9px;line-height:1.48;">
                Each empty pouch must weigh less than <strong>250 g</strong>, take up less than <strong>300 mL</strong> of space, and include a leak-proof <strong>Space Station safety lock cap</strong> so astronauts can add water safely.
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">
                ${Object.values(BIO_BAG_CONFIGS).map((bag) => {
                  const active = md.bioBagId === bag.id;
                  const specsOk = bag.containerMassG < 250 && bag.kitVolumeMl < 300 && bag.hasIssNonLuerCover;
                  return `
                    <div class="md-biobag-card" data-id="${bag.id}" style="padding:11px 13px;border-radius:7px;border:1px solid ${active ? "#fbbf24" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(245,158,11,0.14)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                        <span style="font-size:12.5px;font-weight:700;color:#ece7dc;">${bag.name}</span>
                        <span style="font-family:monospace;font-size:10.5px;color:${specsOk ? "#86efac" : "#fca5a5"};">${specsOk ? "PASSES" : "CHECK"}</span>
                      </div>
                      <div style="font-family:monospace;font-size:10.5px;color:#fcd34d;margin:4px 0;line-height:1.4;">
                        Empty Weight: ${bag.containerMassG}g (&lt;250g) · Kit Size: ${bag.kitVolumeMl}mL (&lt;300mL) · ${bag.dimensions}
                      </div>
                      <div style="font-size:11.5px;color:#cbd5e1;line-height:1.45;">${bag.explain}</div>
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
          <div style="display:grid;grid-template-columns:260px 1fr;gap:14px;align-items:start;margin-bottom:14px;">
            <div style="padding:10px;border-radius:8px;background:rgba(0,0,0,0.35);border:1px solid rgba(103,232,249,0.24);">
              <div style="font-family:monospace;font-size:10.5px;font-weight:700;letter-spacing:1px;color:#67e8f9;margin-bottom:6px;">LIVE 3D PREVIEW</div>
              <div id="mdl-point-design-3d" style="width:100%;height:156px;border-radius:6px;background:#050914;"></div>
              <div style="font-family:monospace;font-size:10.5px;color:#94a3b8;margin-top:6px;line-height:1.4;">
                ${
                  isBio
                    ? `Pouch: <strong style="color:#ece7dc;">${bio.bag.shortLabel}</strong> · Weight: <strong>${bio.bag.containerMassG}g</strong> · Size: <strong>${bio.bag.kitVolumeMl}mL</strong>`
                    : `Frame: <strong style="color:#ece7dc;">${t.bus.name.split(" ")[0]}</strong> · Empty Weight: <strong>${t.dryMassKg} kg</strong>`
                }
              </div>
            </div>
            <div>
              <div style="font-family:monospace;font-size:11.5px;font-weight:700;letter-spacing:1.2px;color:#9aa4ae;margin-bottom:8px;">
                STEP 3A · PICK YOUR SPACECRAFT BODY FRAME
              </div>
              <div style="display:grid;grid-template-columns:1fr;gap:9px;">
                ${busCards}
              </div>
            </div>
          </div>

          <div style="margin-bottom:10px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 3B · SOLAR ARRAY / RTG POWER GENERATION
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;">
              ${pwrCards}
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 3C · ECLIPSE ENERGY STORAGE (LI-ION / SOLID-STATE BATTERY)
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;">
              ${batCards}
            </div>
          </div>

          <div style="padding:12px 14px;border-radius:8px;background:${step3Ready ? "rgba(127,184,166,0.08)" : "rgba(239,68,68,0.12)"};border:1px solid ${step3Ready ? "rgba(127,184,166,0.35)" : "rgba(239,68,68,0.45)"};margin-bottom:14px;font-size:12px;color:#ece7dc;line-height:1.5;">
            ${
              !bioHwOk
                ? `<strong>[NEEDS FIX] Pouch Size or Cap:</strong> Make sure the empty pouch is under <strong>250 g</strong> (${bio.bag.containerMassG} g), the kit size is under <strong>300 mL</strong> (${bio.bag.kitVolumeMl} mL), and it has the Space Station safety lock cap.`
                : `<strong>Electricity &amp; Battery Check:</strong> Your equipment uses <strong>${t.totalPowerLoadW} W</strong>, plus <strong>${t.rechargePowerNeededW} W</strong> while in sunlight to recharge the battery after each <strong>${(t.eclipseHours * 60).toFixed(0)}-minute</strong> pass through Earth's shadow (<strong>${t.batteryDodPct}% of battery used</strong>). ${t.powerOk ? `[READY] You have <strong>+${t.netDaylightMarginW} W</strong> of spare power and safe battery use (under 80%).` : `[NEEDS MORE POWER] Your tools use too much electricity or drain the battery past 80%. Pick bigger solar panels or a bigger battery.`}`
            }
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <span style="font-family:monospace;font-size:11.5px;color:#94a3b8;">
              ${isBio ? `Pouch: ${bio.bag.containerMassG}/250g · ${bio.bag.kitVolumeMl}/300mL · Spare Power: +${t.netDaylightMarginW}W` : `Tool Slots Used: ${t.selectedInsts.length}/${t.maxInstruments} · Spare Power: ${t.netDaylightMarginW >= 0 ? `+${t.netDaylightMarginW}W` : `${t.netDaylightMarginW}W`}`}
            </span>
            <button type="button" id="btn-commit-bus" style="padding:11px 22px;border-radius:6px;border:1px solid ${step3Ready ? "#67e8f9" : "rgba(239,68,68,0.6)"};background:${step3Ready ? "#ece7dc" : "rgba(239,68,68,0.2)"};color:${step3Ready ? "#05060a" : "#fecaca"};font-family:monospace;font-size:12px;font-weight:700;letter-spacing:1.2px;cursor:pointer;">
              ${step3Ready ? "SAVE BODY, SOLAR &amp; BATTERY" : "FIX POUCH OR POWER SETTINGS"}
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
              this.showToast("Sample pouch must weigh under 250 g, pack under 300 mL, and include the Space Station safety lock cap!");
              return;
            }
            if (!t.powerOk) {
              if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
              this.showToast("Not enough solar power or battery size to last through Earth's dark shadow!");
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

        const isBio = !!t.scenario.isBioPayload;
        const bio = t.bioTelemetry;
        const baysOk = t.selectedInsts.length >= 2 && t.selectedInsts.length <= t.maxInstruments;
        const bioProtoValid = bio.replicatesOk && bio.sampleVolOk && bio.sterileOk && bio.shake6hOk && bio.organism.goalAligned;
        const payloadValid = isBio ? bioProtoValid : (baysOk && t.scienceScore >= 55 && t.telescopeOk);

        const bioProtoBanner = isBio
          ? `<div style="margin-bottom:14px;padding:12px 14px;border-radius:7px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.32);">
              <div style="font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.1px;color:#34d399;margin-bottom:8px;">
                SPACE STATION WATER MIXING &amp; SAMPLE RECIPE GOALS
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:8px;margin-bottom:10px;font-family:monospace;font-size:10.5px;">
                <div style="padding:7px 9px;border-radius:4px;background:rgba(0,0,0,0.35);border-left:3px solid ${bio.replicatesOk ? "#4ade80" : "#ef4444"};">SAMPLE BAGS: <strong>${bio.protocol.replicates}</strong> (Need ≥12)</div>
                <div style="padding:7px 9px;border-radius:4px;background:rgba(0,0,0,0.35);border-left:3px solid ${bio.sampleVolOk ? "#4ade80" : "#ef4444"};">WATER / BAG: <strong>${bio.protocol.sampleVolMl} mL</strong> (Need ≥30 mL)</div>
                <div style="padding:7px 9px;border-radius:4px;background:rgba(0,0,0,0.35);border-left:3px solid ${bio.yieldOk ? "#4ade80" : "#ef4444"};">VITAMIN A: <strong>${bio.betaCaroteneUgMl} mg/L</strong> (≥3.0)</div>
                <div style="padding:7px 9px;border-radius:4px;background:rgba(0,0,0,0.35);border-left:3px solid ${bio.dcwOk ? "#4ade80" : "#ef4444"};">YEAST GROWTH: <strong>${bio.dryCellWeightMg} mg</strong> (≥1.0 mg)</div>
                <div style="padding:7px 9px;border-radius:4px;background:rgba(0,0,0,0.35);border-left:3px solid ${bio.sterileOk ? "#4ade80" : "#ef4444"};">GERM CHECK: <strong>${bio.protocol.contaminationCfu} germs</strong> (Filter)</div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;">
                ${Object.values(BIO_PROTOCOL_OPTIONS).map((pr) => {
                  const active = md.bioProtocolId === pr.id;
                  const protoOk = pr.replicates >= 12 && pr.sampleVolMl >= 30 && pr.sterileFiltered && (!bio.organism.requiresSixHourShake || pr.hasSixHourShake);
                  return `
                    <div class="md-bioproto-card" data-id="${pr.id}" style="padding:11px 13px;border-radius:7px;border:1px solid ${active ? "#34d399" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                        <span style="font-size:12.5px;font-weight:700;color:#ece7dc;">${pr.name}</span>
                        <span style="font-family:monospace;font-size:10px;color:${protoOk ? "#86efac" : "#fca5a5"};">${protoOk ? "PASS" : "FAIL"}</span>
                      </div>
                      <div style="font-family:monospace;font-size:10.5px;color:#6ee7b7;margin:4px 0;line-height:1.4;">
                        ${pr.replicates} bags × ${pr.sampleVolMl}mL · Germ Filter: ${pr.sterileFiltered ? "YES" : "NO"} · 6h Shake: ${pr.hasSixHourShake ? "YES" : "SKIPPED"}
                      </div>
                      <div style="font-size:11.5px;color:#cbd5e1;line-height:1.45;">${pr.explain}</div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>`
          : "";

        const waveBanner = t.scenario.requiresWavelength
          ? `<div style="margin-bottom:12px;padding:11px 14px;border-radius:7px;background:${t.telescopeOk ? "rgba(167,139,250,0.08)" : "rgba(239,68,68,0.12)"};border:1px solid ${t.telescopeOk ? "rgba(167,139,250,0.35)" : "rgba(239,68,68,0.45)"};">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                <span style="font-family:monospace;font-size:11px;font-weight:700;color:#ddd6fe;">LIGHT TYPE TO VIEW:</span>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  ${Object.values(WAVELENGTH_BANDS).map((wb) => `<button type="button" class="md-wave-pill" data-id="${wb.id}" style="padding:5px 10px;border-radius:4px;border:1px solid ${md.wavelengthId === wb.id ? "#c084fc" : "rgba(255,255,255,0.16)"};background:${md.wavelengthId === wb.id ? "rgba(192,132,252,0.22)" : "rgba(0,0,0,0.3)"};color:#ece7dc;font-family:monospace;font-size:10.5px;font-weight:700;cursor:pointer;">${wb.shortLabel}</button>`).join("")}
                </div>
              </div>
              <div style="font-size:12px;line-height:1.45;color:${t.telescopeOk ? "#a7f3d0" : "#fecaca"};">
                ${t.telescopeOk ? `[PASS] Light type (${t.wavelength.shortLabel}), camera, cooling &amp; spot in space all match!` : `[FIX] ${t.telescopeIssues.join(" · ")}`}
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
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
            <span style="font-family:monospace;font-size:11.5px;font-weight:700;letter-spacing:1.2px;color:#9aa4ae;">
              PICK CAMERAS &amp; SENSORS (SLOTS USED: ${t.selectedInsts.length} / ${t.maxInstruments} MAX)
            </span>
            <span style="font-family:monospace;font-size:11.5px;color:#7fb8a6;">
              Matched Goals: ${t.matchedTypes.length} / ${t.scenario.requiredScienceTypes.length}
            </span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:10px;margin-bottom:14px;">
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
                this.showToast(`This spacecraft fits at most ${t.maxInstruments} tools! Upgrade body or remove one.`);
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
                ? "Pick Helpful Yeast, at least 12 bags, 30 mL water each, the germ filter, and the 6-hour shake!"
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

        const isBio = !!t.scenario.isBioPayload;
        const bio = t.bioTelemetry;
        const envSurvived = t.thermalOk && t.radiationOk && t.lifetimeOk;
        const bioThermalSection = isBio
          ? `<div style="margin-bottom:14px;padding:12px 14px;border-radius:7px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.34);">
              <div style="font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1.1px;color:#38bdf8;margin-bottom:8px;">
                SPACE STATION WARMER &amp; -80°C ULTRA-COLD FREEZER SETUP
              </div>
              <div style="font-size:12px;color:#cbd5e1;margin-bottom:9px;line-height:1.48;">
                Target warmth: <strong>Yeast 30°C</strong> (+6-hour shake) · <strong>Yogurt 42°C</strong> · <strong>Kefir Room Temp</strong>. Once grown, wrap each clear pouch and place it in the Station's <strong>-80°C ultra-cold freezer</strong> for the ride home.
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">
                ${Object.values(BIO_THERMAL_OPTIONS).map((bt) => {
                  const active = md.bioThermalId === bt.id;
                  const btOk = bt.incubateTempC === bio.organism.targetTempC && bt.melfiFrozen;
                  return `
                    <div class="md-biothm-card" data-id="${bt.id}" style="padding:11px 13px;border-radius:7px;border:1px solid ${active ? "#38bdf8" : "rgba(255,255,255,0.12)"};background:${active ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.025)"};cursor:pointer;">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                        <span style="font-size:12.5px;font-weight:700;color:#ece7dc;">${bt.name}</span>
                        <span style="font-family:monospace;font-size:10px;color:${btOk ? "#86efac" : "#fca5a5"};">${btOk ? "MATCH" : "MISMATCH"}</span>
                      </div>
                      <div style="font-family:monospace;font-size:10.5px;color:#7dd3fc;margin:4px 0;line-height:1.4;">
                        Warmer: ${bt.incubateTempC}°C (Needs ${bio.organism.targetTempC}°C) · Freezer: ${bt.storageTempC}°C · ${bt.powerW} W
                      </div>
                      <div style="font-size:11.5px;color:#cbd5e1;line-height:1.45;">${bt.explain}</div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>`
          : "";

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          ${bioThermalSection}
          <div style="margin-bottom:14px;">
            <div style="font-family:monospace;font-size:11.5px;font-weight:700;letter-spacing:1.2px;color:#9aa4ae;margin-bottom:8px;">
              PICK COOLING SYSTEM &amp; SPACE RADIATION SHIELDING
            </div>
            <div style="display:grid;grid-template-columns:1fr;gap:10px;">
              ${thmCards}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-bottom:16px;">
            <div style="padding:12px 14px;border-radius:6px;background:rgba(0,0,0,0.35);border:1px solid ${t.thermalOk ? "rgba(127,184,166,0.35)" : "rgba(239,68,68,0.5)"};">
              <div style="font-family:monospace;font-size:10.5px;color:#9aa4ae;">${isBio ? "WARMER &amp; -80°C FREEZER" : "HEAT COOLING"}</div>
              <div style="font-family:monospace;font-size:14.5px;font-weight:700;color:${t.thermalOk ? "#7fb8a6" : "#fca5a5"};margin-top:4px;">
                ${isBio ? `${bio.thermal.incubateTempC}°C / ${bio.thermal.storageTempC}°C` : `${t.thm.thermalCapW} W Cooling vs ${t.totalPowerLoadW} W Used`}
              </div>
              <div style="font-size:11.5px;color:#cbd5e1;margin-top:4px;line-height:1.45;">${isBio ? `Needs ${bio.organism.targetTempC}°C warmer &amp; -80°C freezer (${t.thm.thermalCapW}W cooling).` : "Electricity inside the spacecraft turns into heat that must be cooled down in space."}</div>
            </div>
            <div style="padding:12px 14px;border-radius:6px;background:rgba(0,0,0,0.35);border:1px solid ${t.radiationOk ? "rgba(127,184,166,0.35)" : "rgba(239,68,68,0.5)"};">
              <div style="font-family:monospace;font-size:10.5px;color:#9aa4ae;">RADIATION SHIELDING</div>
              <div style="font-family:monospace;font-size:14.5px;font-weight:700;color:${t.radiationOk ? "#7fb8a6" : "#fca5a5"};margin-top:4px;">
                Level ${t.thm.radRatingKrad} vs Level ${Math.max(t.scenario.minRadiationKrad, t.orbit.radiationEnvKrad)} Needed
              </div>
              <div style="font-size:11.5px;color:#cbd5e1;margin-top:4px;line-height:1.45;">Protects the computer and cameras from solar storms and harsh radiation zones.</div>
            </div>
            <div style="padding:12px 14px;border-radius:6px;background:rgba(0,0,0,0.35);border:1px solid ${t.lifetimeOk ? "rgba(127,184,166,0.35)" : "rgba(239,68,68,0.5)"};">
              <div style="font-family:monospace;font-size:10.5px;color:#9aa4ae;">MISSION LIFESPAN</div>
              <div style="font-family:monospace;font-size:14.5px;font-weight:700;color:${t.lifetimeOk ? "#7fb8a6" : "#fca5a5"};margin-top:4px;">
                ${t.estimatedLifetimeMonths} Months (Goal: ${t.scenario.targetLifetimeMonths} mo)
              </div>
              <div style="font-size:11.5px;color:#cbd5e1;margin-top:4px;line-height:1.45;">Depends on shield thickness, gentle battery use, and extra steering fuel.</div>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <span style="font-family:monospace;font-size:11.5px;color:#94a3b8;">
              ${envSurvived ? (isBio ? "Warmer Temperature, -80°C Freezer & Cooling All Ready" : "Cooling, Radiation Shield & Lifespan Look Great") : (isBio ? "Match warmer temperature & turn on -80°C freezer" : "Upgrade shield or battery to last full mission")}
            </span>
            <button type="button" id="btn-commit-thm" style="padding:11px 22px;border-radius:6px;border:1px solid ${envSurvived ? "#67e8f9" : "rgba(239,68,68,0.6)"};background:${envSurvived ? "#ece7dc" : "rgba(239,68,68,0.2)"};color:${envSurvived ? "#05060a" : "#fecaca"};font-family:monospace;font-size:12px;font-weight:700;letter-spacing:1.2px;cursor:pointer;">
              ${envSurvived ? (isBio ? "SAVE WARMER (30°C) & -80°C FREEZER PLAN" : "SAVE COOLING & SHIELDING PLAN") : "FIX COOLING / FREEZER / SHIELDING"}
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
                ? "This yeast mission needs the 30°C warmer AND the -80°C ultra-cold freezer!"
                : "Cooling or radiation shield isn't strong enough for this flight path!");
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

        const isBio = !!t.scenario.isBioPayload;
        const bio = t.bioTelemetry;
        const systemsReady = t.commsOk && t.deltaVOk && t.disposalOk;
        const bioGroundBanner = isBio
          ? `<div style="margin-bottom:12px;padding:12px 14px;border-radius:7px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.34);font-size:12px;color:#e2e8f0;line-height:1.5;">
              <div style="font-family:monospace;font-size:11px;font-weight:700;color:#c4b5fd;margin-bottom:6px;">
                EARTH SUPPORT &amp; FINAL LAB CHECK ("BEGIN WITH THE END IN MIND")
              </div>
              <div><strong>Earth Monitoring:</strong> Scientists watch astronauts start the kit live on screen (helping with questions in real time) and continuously track <strong>${bio.thermal.incubateTempC}°C warming &amp; ${bio.thermal.storageTempC}°C freezer</strong> logs.</div>
              <div style="margin-top:6px;font-family:monospace;font-size:11px;line-height:1.45;color:${bio.yieldOk && bio.dcwOk ? "#86efac" : "#fca5a5"};">
                EARTH LAB STEPS: 1. Deliver -> 2. Thaw -> 3. Wash -> 4. Spin -> 5. Test Vitamin A (${bio.betaCaroteneUgMl} mg/L, ${bio.dryCellWeightMg} mg yeast) &amp; Share Results
              </div>
            </div>`
          : "";

        container.innerHTML = `
          ${this._renderLiveTradeoffStrip({ onRerender: render })}
          ${bioGroundBanner}
          <div style="margin-bottom:14px;">
            <div style="font-family:monospace;font-size:11.5px;font-weight:700;letter-spacing:1.2px;color:#9aa4ae;margin-bottom:8px;">
              STEP 6A · SPACECRAFT RADIO &amp; DISH
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;">
              ${comCards}
            </div>
          </div>

          <div style="margin-bottom:10px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 6B · GROUND STATION TRACKING NETWORK
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;">
              ${gndCards}
            </div>
          </div>

          <div style="margin-bottom:10px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#a7b0ba;margin-bottom:6px;">
              STEP 6C · ORBITAL PROPULSION & DELTA-V (TSIOLKOVSKY ROCKET EQUATION)
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;">
              ${propCards}
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;color:var(--ui-brand);margin-bottom:6px;">
              STEP 6D · END-OF-MISSION (EoM) DISPOSAL & ORBITAL DEBRIS MITIGATION
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;">
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
              this.showToast("Make sure your radio signal, fuel push, and safe cleanup plan all pass!");
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
          title: "COMPUTER RESTART SURPRISE",
          situation: "A brief glitch restarted the onboard computer mid-flight. The ship must recover without losing science data or going over budget.",
          check: (telemetry) => telemetry.engineeringScore >= 50 && telemetry.budgetOk,
          metric: (telemetry) => `Engineering ${telemetry.engineeringScore}/100 · Reserve $${Math.max(0, telemetry.budgetRemainingM)}M`,
          mitigation: "Keep Engineering score above 50 and leave a little extra budget for surprises."
        },
        {
          id: "station_weather_delay",
          severity: "CADET",
          title: "BAD WEATHER AT GROUND DISH",
          situation: "A storm knocked out our main Earth radio dish for two passes. Backup dishes must still keep a clear signal and leave a small budget buffer.",
          check: (telemetry) => telemetry.budgetRemainingM >= telemetry.budgetCapM * 0.02 && telemetry.linkMarginDb >= 3,
          metric: (telemetry) => `Signal ${telemetry.linkMarginDb} dB (≥3) · Reserve $${Math.max(0, telemetry.budgetRemainingM)}M`,
          mitigation: "Keep at least 3 dB of radio signal margin and 2% of your budget in reserve for delays."
        },
        {
          id: "eclipse_thermal_transient",
          severity: "CADET",
          title: "COLD SHADOW POWER SPIKE",
          situation: "Heaters turned on higher than planned while flying through Earth's dark shadow. Your battery and cooling gear must handle the load.",
          check: (telemetry) => telemetry.batteryDodPct <= 85 && telemetry.thermalOk,
          metric: (telemetry) => `Battery Drain ${telemetry.batteryDodPct}% (≤85%) · Heat Control ${telemetry.thermalOk ? "GOOD" : "FAIL"}`,
          mitigation: "Keep battery drain below 85% and use strong enough heat shields and radiators."
        },
        // Engineer — realistic phase-A anomalies.
        {
          id: "cme_solar_storm",
          severity: "ENGINEER",
          title: "SUN RADIATION STORM",
          situation: "A burst of sun energy hit the ship. Your space shielding, temperature control, and parts lifespan must all hold up.",
          check: (telemetry) => telemetry.radiationOk && telemetry.thermalOk && telemetry.lifetimeOk,
          metric: (telemetry) => `Shield Level ${telemetry.thm.radRatingKrad} · Cooling ${telemetry.thm.thermalCapW} W · Lifespan ${telemetry.estimatedLifetimeMonths} mo`,
          mitigation: "Pick heat and shielding gear strong enough for this zone and keep part lifespan above target."
        },
        {
          id: "dsn_antenna_outage",
          severity: "ENGINEER",
          title: "MAIN EARTH DISH OFFLINE",
          situation: "Our biggest Earth radio dish went down for repairs. Smaller backup dishes must still download at least 85% of your data clearly.",
          check: (telemetry) => telemetry.linkMarginDb >= 6 && telemetry.downlinkCapGbPerDay >= telemetry.dataGeneratedGbPerDay * 0.85,
          metric: (telemetry) => `Signal ${telemetry.linkMarginDb} dB (≥6) · ${telemetry.downlinkCapGbPerDay} / ${telemetry.dataGeneratedGbPerDay} GB/d`,
          mitigation: "Pick a stronger radio dish or more Earth stations, and don't make more data than backup dishes can download."
        },
        {
          id: "reaction_wheel_anomaly",
          severity: "ENGINEER",
          title: "STEERING WHEEL WOBBLE",
          situation: "One steering flywheel started sticking. Your engines need at least 100 m/s of extra fuel push to keep pointing steady.",
          check: (telemetry) => telemetry.deltaVOk && (telemetry.achievedDeltaV - telemetry.requiredDeltaV) >= 100,
          metric: (telemetry) => `Extra Fuel Push ${Math.max(0, telemetry.achievedDeltaV - telemetry.requiredDeltaV)} m/s (≥100)`,
          mitigation: "Pick an engine with at least 100 m/s of extra fuel push beyond what your flight path needs."
        },
        {
          id: "detector_degradation",
          severity: "ENGINEER",
          title: "SENSOR CHANNEL FADE",
          situation: "One camera sensor dimmed after launch. Your remaining tools must still score at least 75/100 in science value.",
          check: (telemetry) => telemetry.scienceScore >= 75 && telemetry.selectedInsts.length >= 2,
          metric: (telemetry) => `Science ${telemetry.scienceScore}/100 (≥75) · ${telemetry.selectedInsts.length} tools`,
          mitigation: "Carry at least two science tools and stay well above the minimum science score."
        },
        {
          id: "launch_window_delay",
          severity: "ENGINEER",
          title: "SOLAR WEATHER LAUNCH DELAY",
          situation: "Sun storms pushed launch back by three weeks. Your plan must cover the delay cost and still last long enough in space.",
          check: (telemetry) => telemetry.budgetRemainingM >= telemetry.budgetCapM * 0.05 && telemetry.lifetimeOk,
          metric: (telemetry) => `Reserve $${Math.max(0, telemetry.budgetRemainingM)}M (≥5%) · Lifespan ${telemetry.estimatedLifetimeMonths} mo`,
          mitigation: "Keep a 5% budget reserve and choose parts that last past the mission target."
        },
        // Director — severe anomalies.
        {
          id: "severe_x_class_cme",
          severity: "DIRECTOR",
          title: "EXTREME SUN STORM",
          situation: "A massive sun storm hit the ship. Shielding, cooling, part lifespan, and radio signal must all survive together.",
          check: (telemetry) => telemetry.radiationOk && telemetry.thermalOk && telemetry.lifetimeOk && telemetry.linkMarginDb >= 8,
          metric: (telemetry) => `Shield Level ${telemetry.thm.radRatingKrad} · Signal ${telemetry.linkMarginDb} dB (≥8) · Lifespan ${telemetry.estimatedLifetimeMonths} mo`,
          mitigation: "Use top-grade heat and radiation shielding, a strong radio link, and extra part lifespan."
        },
        {
          id: "dsn_network_loss",
          severity: "DIRECTOR",
          title: "BACKUP EARTH DISHES ONLY",
          situation: "Major Earth antennas went offline. Your ship must keep an 8 dB signal and send 100% of its science data through remaining dishes.",
          check: (telemetry) => telemetry.linkMarginDb >= 8 && telemetry.downlinkCapGbPerDay >= telemetry.dataGeneratedGbPerDay,
          metric: (telemetry) => `Signal ${telemetry.linkMarginDb} dB (≥8) · ${telemetry.downlinkCapGbPerDay} / ${telemetry.dataGeneratedGbPerDay} GB/d`,
          mitigation: "Build enough radio strength to send 100% of your data with an 8 dB cushion."
        },
        {
          id: "power_bus_arc_fault",
          severity: "DIRECTOR",
          title: "SOLAR WIRING SHORT CIRCUIT",
          situation: "A short circuit weakened one power line. Keep battery drain at 60% or less and hold a 10% extra sunlight power cushion.",
          check: (telemetry) => telemetry.batteryDodPct <= 60 && telemetry.netDaylightMarginW >= telemetry.totalPowerLoadW * 0.1,
          metric: (telemetry) => `Battery Drain ${telemetry.batteryDodPct}% (≤60%) · Cushion ${telemetry.netDaylightMarginW} W (≥10%)`,
          mitigation: "Bring extra solar panels and a larger battery so drain stays way under the normal 80% limit."
        },
        {
          id: "primary_instrument_failure",
          severity: "DIRECTOR",
          title: "MAIN SCIENCE TOOL GLITCH",
          situation: "Your main science tool stopped working. Remaining tools must still deliver at least 85/100 science value.",
          check: (telemetry) => telemetry.scienceScore >= 85 && telemetry.selectedInsts.length >= 3,
          metric: (telemetry) => `Science ${telemetry.scienceScore}/100 (≥85) · ${telemetry.selectedInsts.length} tools`,
          mitigation: "Pack at least three science tools so backup sensors still hit high science scores."
        },
        // BioNutrients — payload-specific anomalies so the low-cost lab scenario
        // remains achievable without the deep-space antenna requirements.
        {
          id: "bio_incubator_drift",
          severity: "CADET",
          bio: true,
          title: "WARMER TEMPERATURE DRIFT",
          situation: "The Space Station yeast warmer drifted slightly off heat. Your power and temp gear must keep yeast at the exact right warmth.",
          check: (telemetry) => telemetry.bioTelemetry.tempMatch && telemetry.powerOk,
          metric: (telemetry) => `Warmer ${telemetry.bioTelemetry.thermal.incubateTempC}°C · Power ${telemetry.powerOk ? "GOOD" : "FAIL"}`,
          mitigation: "Match the 30°C yeast warmth setting and stay within the Station power limit."
        },
        {
          id: "bio_bag_contamination",
          severity: "ENGINEER",
          bio: true,
          title: "GERM CHECK ON SAMPLE BAG",
          situation: "One nutrient bag triggered a germ warning. Your germ filter, bag count, and water amount must still pass the Space Food Lab test.",
          check: (telemetry) => telemetry.bioTelemetry.sterileOk && telemetry.bioTelemetry.replicatesOk && telemetry.bioTelemetry.sampleVolOk,
          metric: (telemetry) => `${telemetry.bioTelemetry.protocol.replicates} bags · ${telemetry.bioTelemetry.protocol.sampleVolMl} mL · ${telemetry.bioTelemetry.protocol.contaminationCfu} germs`,
          mitigation: "Use the ultra-light clear pouch with a germ filter, at least 12 bags, and 30 mL of water per bag."
        },
        {
          id: "bio_freezer_power_loss",
          severity: "DIRECTOR",
          bio: true,
          title: "-80°C FREEZER POWER GLITCH",
          situation: "A brief power dip hit the -80°C freezer. Keep enough power, freezing, and Station signal so samples stay safely frozen.",
          check: (telemetry) => telemetry.bioTelemetry.melfiOk && telemetry.powerOk && telemetry.commsOk,
          metric: (telemetry) => `Freezer ${telemetry.bioTelemetry.thermal.storageTempC}°C · Signal ${telemetry.linkMarginDb} dB`,
          mitigation: "Include the -80°C ultra-cold freezer and keep a clear Earth radio link."
        }
      ];

      const isBio = !!t.isBio;
      const difficultyKey = difficulty.toUpperCase();
      const matchesBio = (event) => !!event.bio === isBio;
      let usable = events.filter((event) => event.severity === difficultyKey && matchesBio(event));
      if (!usable.length) {
        usable = events.filter((event) => event.severity === "ENGINEER" && matchesBio(event));
      }
      if (!usable.length) {
        usable = events.filter(matchesBio);
      }
      if (!usable.length) return null;
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
                phase: "STAGE 1 · TRIP TO SPACE STATION (SUPPLY SHIP)",
                ok: t.segments.launch.ok,
                metric: `${bio.bag.containerMassG}g (<250g) · ${bio.bag.kitVolumeMl}mL (<300mL) · $${t.totalCostM}M/$${t.budgetCapM}M`,
                detail: t.segments.launch.ok
                  ? `${t.lv.name} carried our light clear pouches (4 sample pouches + 4 filters) at room temperature to the Space Station at 418 km, beating older bulky kits.`
                  : `FIX LAUNCH/BAG: Check Space Station 418 km destination, ${t.lv.name.split("(")[0].trim()}, empty pouch under 250g (${bio.bag.containerMassG}g), kit under 300mL (${bio.bag.kitVolumeMl}mL), or Station safety lock cap.`
              },
              {
                phase: "STAGE 2 · ADD WATER & KEEP GERMS OUT (CLEAN WATER -> FILTER -> LOCK CAP)",
                ok: bio.sterileOk && bio.replicatesOk && bio.sampleVolOk && bio.filmMatch,
                metric: `${bio.protocol.replicates}×${bio.protocol.sampleVolMl} mL · ${bio.bag.shortLabel} · ${bio.protocol.contaminationCfu} germs`,
                detail: (bio.sterileOk && bio.replicatesOk && bio.sampleVolOk)
                  ? `Astronauts drew clean Space Station drinking water into a mixing bag, pushed it through a tiny germ filter + safety lock cap, took off the filter, and shook 1 min across ${bio.protocol.replicates} pouches.`
                  : `CLEANLINESS FIX: Pick the Thin Clear Pouch + Station Lock Cap, turn on the germ filter, pack >=12 sample bags, and use >=30 mL water each.`
              },
              {
                phase: "STAGE 3 · KEEP WARM (30°C + 6h SHAKE -> -80°C FREEZER)",
                ok: t.powerOk && bio.tempMatch && bio.shake6hOk && bio.melfiOk,
                metric: `Warmer: ${bio.thermal.incubateTempC}°C (Needs ${bio.organism.targetTempC}°C) · 6h Shake: ${bio.shake6hOk ? "YES" : "NO"} · Freezer: ${bio.thermal.storageTempC}°C`,
                detail: (t.powerOk && bio.tempMatch && bio.shake6hOk && bio.melfiOk)
                  ? `Kept yeast warm at 30°C with a quick 1-minute shake at 6 hours, then wrapped the pouches and froze them at -80°C inside the Station's ultra-cold freezer.`
                  : `WARMER/FREEZER FIX: Match 30°C warmer for Helpful Yeast, include the 6-hour shake, keep enough electricity on, and use the -80°C ultra-cold freezer.`
              },
              {
                phase: "STAGE 4 · EARTH TEAM MONITORING (LIVE CHECK-IN & TEMPERATURE WATCH)",
                ok: t.segments.ground.ok,
                metric: `${t.gnd.name} · +${t.linkMarginDb} dB Signal · ${t.downlinkCapGbPerDay}/${t.dataGeneratedGbPerDay} GB/day`,
                detail: t.segments.ground.ok
                  ? `The Earth support team watched astronauts start the kit live and tracked steady ${bio.thermal.incubateTempC}°C warming & ${bio.thermal.storageTempC}°C freezer logs through ${t.com.name}.`
                  : `RADIO FIX: Radio signal (${t.linkMarginDb} dB) or ground monitoring needs a boost.`
              },
              {
                phase: "STAGE 5 · EARTH LAB CHECK (THAW -> WASH -> SPIN -> MEASURE VITAMINS)",
                ok: t.segments.user.ok,
                metric: `Vitamin A: ${bio.betaCaroteneUgMl} mg/L (≥3.0) · Yeast Wt: ${bio.dryCellWeightMg} mg (≥1.0) · Sci: ${t.scienceScore}/100`,
                detail: t.segments.user.ok
                  ? `Back on Earth, scientists thawed the pouches, washed and spun out the yeast, and measured ${bio.betaCaroteneUgMl} mg/L of Vitamin A nutrient & ${bio.dryCellWeightMg} mg of yeast across ${bio.protocol.replicates} clean, germ-free bags.`
                  : `LAB TEST FAIL: Returned nutrient levels (${bio.betaCaroteneUgMl} mg/L Vitamin A, ${bio.dryCellWeightMg} mg yeast) fell short of mission goals.`
              }
            ]
          : [
              {
                phase: "STAGE 1 · ROCKET LIFTOFF & WEIGHT CHECK",
                ok: t.massOk && t.budgetOk,
                metric: `${t.wetMassKg} / ${t.lvCapacityKg} kg (${t.massMarginPct}% spare) · $${t.totalCostM}M / $${t.budgetCapM}M`,
                detail: t.massOk && t.budgetOk
                  ? `${t.lv.name} lifted off the launch pad and carried your ${t.wetMassKg} kg spacecraft onto its space path with $${Math.max(0, t.budgetRemainingM)}M left in budget.`
                  : !t.massOk
                    ? `TOO HEAVY: Your spacecraft (${t.wetMassKg} kg) exceeds ${t.lv.name} lift limit (${t.lvCapacityKg} kg) for ${t.orbit.name}.`
                    : `OVER BUDGET: Total cost ($${t.totalCostM}M) went past the $${t.budgetCapM}M limit by $${Math.abs(t.budgetRemainingM)}M.`
              },
              {
                phase: "STAGE 2 · ENGINE PUSH & STEERING FUEL",
                ok: t.deltaVOk,
                metric: `Fuel Push: ${t.achievedDeltaV} m/s vs Needed: ${t.requiredDeltaV} m/s`,
                detail: t.deltaVOk
                  ? `${t.prop.name} pushed into your target flight path cleanly, leaving ${t.achievedDeltaV - t.requiredDeltaV} m/s of extra steering fuel.`
                  : `NOT ENOUGH FUEL: ${t.prop.name} only gives ${t.achievedDeltaV} m/s, short of the ${t.requiredDeltaV} m/s needed for ${t.orbit.name}.`
              },
              {
                phase: "STAGE 3 · SOLAR PANELS & NIGHT SHADOW BATTERY",
                ok: t.powerOk,
                metric: `Used: ${t.totalPowerLoadW} W vs Made: ${t.daylightGenW} W · Night Battery Used: ${t.batteryDodPct}%`,
                detail: t.powerOk
                  ? `${t.pwr.name} made ${t.daylightGenW} W in sunlight (+${t.netDaylightMarginW} W spare) and ${t.bat.name} kept everything running through ${Math.round(t.eclipseHours * 60)}-min night shadows using ${t.batteryDodPct}% battery.`
                  : `POWER OUTAGE: Running gear (${t.totalPowerLoadW} W) + charging needed more power than solar panels made, or drained the battery past the safe 80% limit (${t.batteryDodPct}% used).`
              },
              {
                phase: "STAGE 4 · SPACE WEATHER STORM & COOLING CHECK",
                ok: t.thermalOk && t.radiationOk && t.lifetimeOk,
                metric: `Shield Level ${t.thm.radRatingKrad} · Cooling ${t.thm.thermalCapW} W · Life ${t.estimatedLifetimeMonths} mo`,
                detail: t.thermalOk && t.radiationOk && t.lifetimeOk
                  ? `${t.thm.name} protected electronics through a strong solar storm without glitches, lasting a full ${t.estimatedLifetimeMonths} months.`
                  : `DAMAGE RISK: Space radiation or trapped heat (${t.totalPowerLoadW} W) overpowered ${t.thm.name}, cutting life to ${t.estimatedLifetimeMonths} months (goal ${t.scenario.targetLifetimeMonths} mo).`
              },
              {
                phase: "STAGE 5 · SCIENCE CAMERAS & SENDING DATA HOME",
                ok: t.commsOk && t.scienceScore >= 60 && t.matchedTypes.length > 0,
                metric: `${t.downlinkCapGbPerDay} GB/day sent vs ${t.dataGeneratedGbPerDay} GB/day · Signal: ${t.linkMarginDb} dB · Sci: ${t.scienceScore}/100`,
                detail: !t.commsOk
                  ? `SIGNAL TOO WEAK: Signal strength (${t.linkMarginDb} dB) or download speed (${t.downlinkCapGbPerDay} GB/day) couldn't send all ${t.dataGeneratedGbPerDay} GB/day from your tools.`
                  : t.matchedTypes.length === 0
                    ? "SCIENCE GOAL: Choose a mission-priority science tool at the Science desk."
                    : t.scienceScore < 60
                      ? `SCIENCE SCORE: Improve the science payload to reach 60/100 (currently ${t.scienceScore}/100).`
                      : `${t.com.name} connected with ${t.gnd.name} at +${t.linkMarginDb} dB signal strength, sending 100% of ${t.dataGeneratedGbPerDay} GB/day science data from ${t.selectedInsts.length} tools.`
              }
            ];

        // Keep the readiness shown here aligned with the server's final-report
        // requirements, including checks not covered by the BioNutrients stages.
        const finalRequirements = [
          [t.budgetOk, "adjust the budget"],
          [t.massOk, "fix spacecraft mass and launch capacity"],
          [t.powerOk, "fix solar power or the battery"],
          [t.commsOk, "fix the Earth communication link"],
          [t.deltaVOk, "provide enough flight fuel"],
          [t.thermalOk, "improve cooling"],
          [t.radiationOk, "improve radiation shielding"],
          [t.lifetimeOk, "meet the mission lifetime"],
          [t.disposalOk, "choose a safe return or disposal plan"],
          [t.selectedInsts.length > 0, "select a science tool at the Science desk"],
          [isBio || t.matchedTypes.length > 0, "select a mission-priority science tool at the Science desk"],
          [t.telescopeOk, "resolve the telescope setup"],
          [!isBio || bio.bioOk, "finish the BioNutrients recipe"],
          [t.scienceScore >= 40, "improve the science score"],
          [Number.isFinite(t.cmlLevel) && t.cmlLevel >= 1 && t.cmlLevel <= 6, "complete the mission maturity assessment"]
        ];
        const unmetRequirements = finalRequirements.filter(([ok]) => !ok).map(([, action]) => action);
        phases.push({
          phase: `STAGE ${phases.length + 1} · FINAL MISSION REQUIREMENTS`,
          ok: unmetRequirements.length === 0,
          metric: unmetRequirements.length ? `${unmetRequirements.length} requirement(s) need attention` : "All final requirements passed",
          detail: unmetRequirements.length
            ? `Before completing the mission: ${unmetRequirements.join("; ")}.`
            : "The mission design meets the final report requirements."
        });

        if (missionEvent) {
          phases.push({
            phase: `STAGE ${phases.length + 1} · SURPRISE CHALLENGE: ${missionEvent.title}`,
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

          ${missionEvent ? `
            <div style="padding:12px 14px;border-radius:8px;background:${missionEvent.ok ? "rgba(74,222,128,0.07)" : "rgba(239,68,68,0.08)"};border:1px solid ${missionEvent.ok ? "rgba(74,222,128,0.4)" : "rgba(239,68,68,0.45)"};margin-bottom:14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-family:monospace;font-size:11px;font-weight:800;letter-spacing:1.1px;color:${missionEvent.ok ? "#86efac" : "#fca5a5"};">
                  SURPRISE MISSION TEST · ${missionEvent.severity === "CADET" ? "BEGINNER" : missionEvent.severity === "DIRECTOR" ? "EXPERT" : "NORMAL"}
                </span>
                <span style="font-family:monospace;font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:4px;background:${missionEvent.ok ? "rgba(74,222,128,0.16)" : "rgba(239,68,68,0.16)"};color:${missionEvent.ok ? "#4ade80" : "#f87171"};">
                  ${missionEvent.ok ? "SURVIVED" : "FAILED"}
                </span>
              </div>
              <div style="font-size:14.5px;font-weight:700;color:#f8fafc;margin-top:5px;">${missionEvent.title}</div>
              <div style="font-size:12.5px;color:#cbd5e1;line-height:1.5;margin-top:5px;">${missionEvent.situation}</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-top:9px;">
                <div style="font-family:monospace;font-size:11px;line-height:1.45;color:${missionEvent.ok ? "#86efac" : "#fbbf24"};">CHECK: ${missionEvent.metric}</div>
                <div style="font-family:monospace;font-size:11px;line-height:1.45;color:#cbd5e1;">TIP: ${missionEvent.mitigation}</div>
              </div>
            </div>
          ` : ""}

          <div style="padding:14px 16px;border-radius:8px;background:rgba(0,0,0,0.42);border:1px solid rgba(255,255,255,0.12);margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
              <span style="font-family:monospace;font-size:12px;font-weight:700;letter-spacing:1.2px;color:#67e8f9;">
                FULL TEST FLIGHT &amp; MISSION REPORT CARD
              </span>
              <span style="font-family:monospace;font-size:12px;font-weight:700;padding:4px 10px;border-radius:4px;background:${allNominal ? "rgba(74,222,128,0.15)" : "rgba(251,191,36,0.15)"};color:${allNominal ? "#4ade80" : "#fbbf24"};">
                ${allNominal ? "MISSION GRADE: A (READY TO FLY!)" : `MISSION SCORE: ${t.overallScore}/100 (NEEDS TWEAKS)`}
              </span>
            </div>

            <div style="display:flex;flex-direction:column;gap:9px;">
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

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
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
            this.showToast("Walk to any workstation [E] to change your Flight Path, Spacecraft Body, Power, Science Tools, or Engines and re-test!");
          });
        }

        const commitBtn = container.querySelector("#btn-commit-sim");
        if (commitBtn) {
          commitBtn.addEventListener("click", () => {
            if (!allNominal) {
              if (typeof this.showToast === "function") {
                this.showToast("Your mission isn't ready to launch yet — fix any failed test steps or bring your score up to 75+.");
              }
              return;
            }
            this.missionDesign.lastSimulationReport = t;
            const onlineInRoom = !!(window.netManager && window.netManager.connected && window.netManager.roomId);
            const alreadyVictory = !!(window.netManager && window.netManager.roomState && window.netManager.roomState.status === "victory");
            const validation = this.buildMissionValidationSnapshot(t, missionEvent, phases, allNominal);
            this.finishTask(task, false, { evaluation: validation });
            if (!onlineInRoom || alreadyVictory) {
              setTimeout(() => {
                if (alreadyVictory && typeof this.reopenVictory === "function") {
                  this.reopenVictory();
                } else {
                  this.showVictory(
                    `${t.scenario.name} finished with Score ${t.overallScore}/100 (Science ${t.scienceScore}/100 · Engineering ${t.engineeringScore}/100 · Budget $${t.totalCostM}M/$${t.budgetCapM}M · Weight ${t.wetMassKg}/${t.lvCapacityKg} kg · Fuel Push ${t.achievedDeltaV} m/s · Lifespan ${t.estimatedLifetimeMonths} mo).`,
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
        checklistTitle.textContent = "MISSION HUB";
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

      const rolesApi = window.InterfellasRoles;
      const net = window.netManager;
      const myRole = rolesApi && net && net.localPlayer
        ? rolesApi.normalizeRole(net.localPlayer.role, "commander")
        : "commander";
      const localIsGround = !!(net && net.localPlayer && (
        net.localPlayer.team === "ground" ||
        (rolesApi && rolesApi.isGroundRole(myRole))
      ));
      if (typeof window.syncMissionHubRoleFilterForRole === "function") {
        window.syncMissionHubRoleFilterForRole(myRole, localIsGround);
      }
      const roleFilter = typeof window.getMissionHubRoleFilter === "function"
        ? window.getMissionHubRoleFilter()
        : "all";
      const phase = mission && mission.phase;
      const completedSet = new Set((mission && mission.completedObjectives) || []);
      const previousCompleted = this._knownCompletedTasks || new Set();
      const nextCompleted = new Set();

      const entries = this.tasks.map((t, index) => {
        const isCompleted = mission ? completedSet.has(t.id) : t.completed;
        const isNewlyCompleted = isCompleted && !previousCompleted.has(t.id);
        const isAvailable = this.isTaskAvailable(t.id, mission);
        const isLocked = !isCompleted && !isAvailable;
        const lockReason = isLocked ? this.getTaskLockReason(t.id, mission) : "";
        const phaseLocked = !isCompleted && !!phase && phase !== "station" && t.id !== "task_antenna";
        const assign = this._getRoleAssignment(this.getTaskRole(t));
        const roleLocked = !assign.isMine;
        const clickBlocked = !isCompleted && (isLocked || phaseLocked || roleLocked);
        const blockedReason = phaseLocked
          ? "AVAILABLE INSIDE THE STATION"
          : isLocked
            ? lockReason
            : roleLocked
              ? `ASSIGNED TO ${assign.label.toUpperCase()} · ${assign.namesText}`
              : "";
        return {
          task: t,
          order: index + 1,
          isCompleted,
          isAvailable,
          isLocked,
          phaseLocked,
          assign,
          roleId: assign.role,
          roleLocked,
          clickBlocked,
          blockedReason
        };
      });

      const groups = new Map();
      entries.forEach((entry) => {
        if (!groups.has(entry.roleId)) groups.set(entry.roleId, []);
        groups.get(entry.roleId).push(entry);
      });

      const groupOrder = [];
      if (roleFilter !== "all") {
        if (groups.has(roleFilter)) groupOrder.push(roleFilter);
        if (groups.has("all") && roleFilter !== "all") groupOrder.push("all");
      } else {
        const flightOrder = rolesApi && Array.isArray(rolesApi.FLIGHT_ORDER)
          ? rolesApi.FLIGHT_ORDER
          : ["commander", "engineer", "scientist", "specialist"];
        if (groups.has(myRole)) groupOrder.push(myRole);
        flightOrder.forEach((role) => {
          if (role !== myRole && groups.has(role)) groupOrder.push(role);
        });
        if (groups.has("all")) groupOrder.push("all");
        groups.forEach((_, roleId) => {
          if (!groupOrder.includes(roleId)) groupOrder.push(roleId);
        });
      }

      const players = net && net.roomState && Array.isArray(net.roomState.players) ? net.roomState.players : [];
      const groundRolesPresent = new Set(
        players
          .filter((p) => p && (p.team === "ground" || (rolesApi && rolesApi.isGroundRole(p.role))))
          .map((p) => (rolesApi ? rolesApi.normalizeRole(p.role, "commander") : p.role))
      );
      if (rolesApi && rolesApi.isGroundRole(myRole)) groundRolesPresent.add(myRole);
      const groundOrder = rolesApi && Array.isArray(rolesApi.GROUND_ORDER)
        ? rolesApi.GROUND_ORDER
        : ["flight_director", "ground_capcom"];
      const supportRoleIds = roleFilter !== "all"
        ? (rolesApi && rolesApi.isGroundRole(roleFilter) ? [roleFilter] : [])
        : groundOrder.filter((roleId) => groundRolesPresent.has(roleId));

      const groupsHtml = groupOrder
        .map((roleId) => this._renderMissionHubRoleGroup(groups.get(roleId), {
          roleId,
          myRole,
          rolesApi
        }))
        .join("");

      let supportHtml = "";
      supportRoleIds.forEach((roleId) => {
        if (!window.getGroundSupportChecks || typeof window.getGroundSupportChecks !== "function") return;
        const checks = window.getGroundSupportChecks(mission, roleId);
        if (!checks || !checks.length) return;
        supportHtml += this._renderMissionHubSupportGroup(roleId, checks, rolesApi);
      });

      if (!groupsHtml && !supportHtml) {
        container.innerHTML = roleFilter === "all"
          ? `<div class="hub-empty-filter"><span>Mission steps are loading…</span></div>`
          : `
            <div class="hub-empty-filter">
              <span>No mission steps are assigned to this role right now.</span>
              <button type="button" data-hub-clear-filter>SHOW ALL ROLES</button>
            </div>
          `;
      } else {
        container.innerHTML = groupsHtml + supportHtml;
      }

      container.onclick = (event) => {
        const clear = event.target && event.target.closest ? event.target.closest("[data-hub-clear-filter]") : null;
        if (clear) {
          if (typeof window.setMissionHubRoleFilter === "function") window.setMissionHubRoleFilter("all");
          return;
        }
        const item = event.target && event.target.closest ? event.target.closest("[data-hub-task-id]") : null;
        if (!item) return;
        const taskId = item.getAttribute("data-hub-task-id");
        const entry = entries.find((candidate) => candidate.task.id === taskId);
        if (!entry) return;
        if (entry.clickBlocked) {
          const prefix = entry.phaseLocked ? "[ORBIT]" : entry.isLocked ? "[LOCK]" : "[ROLE LOCK]";
          this.showToast(`${prefix} ${entry.blockedReason || "COMPLETE THE PRIOR OBJECTIVE FIRST"}`);
          if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
          return;
        }
        this.openTaskModal(entry.task);
      };

      container.onkeydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const item = event.target && event.target.closest ? event.target.closest("[data-hub-task-id]") : null;
        if (!item) return;
        event.preventDefault();
        item.click();
      };

      container.querySelectorAll("[data-hub-task-id]").forEach((item) => {
        item.setAttribute("aria-disabled", String(item.classList.contains("is-click-blocked")));
      });

      if (typeof window.renderHudCrewRoster === "function") {
        window.renderHudCrewRoster();
      }
    }

    _renderMissionHubRoleGroup(entries, context) {
      if (!entries || !entries.length) return "";
      const rolesApi = context.rolesApi;
      const roleId = context.roleId;
      const meta = roleId === "all"
        ? { short: "ALL", label: "ALL CREW", color: "#9a8fc4" }
        : (rolesApi
          ? rolesApi.getRoleMeta(roleId)
          : { short: String(roleId).slice(0, 4).toUpperCase(), label: String(roleId).toUpperCase(), color: "#93c5fd" });
      const assign = entries[0].assign;
      const isMine = roleId !== "all" && roleId === context.myRole;
      const dutyText = roleId === "all"
        ? "Shared by the whole crew"
        : ((meta.duties && meta.duties.station) || meta.primaryDuty || "");
      const ownerText = `${assign.namesText}${dutyText ? ` · ${dutyText}` : ""}`;
      const doneCount = entries.filter((entry) => entry.isCompleted).length;
      const pct = entries.length ? Math.round((doneCount / entries.length) * 100) : 0;
      const actionable = entries.find((entry) => entry.assign.isMine && !entry.isCompleted && !entry.isLocked && !entry.phaseLocked);
      const actionableId = actionable ? actionable.task.id : null;
      const tasksHtml = entries.map((entry) => {
        return this._renderMissionHubTask(entry, {
          isActionable: entry.task.id === actionableId
        });
      }).join("");
      return `
        <div class="hub-role-group${isMine ? " is-mine" : ""}" style="--role-color:${meta.color};">
          <div class="hub-role-group-head">
            <span class="hub-role-group-badge">${this._escapeHtml(meta.short)}</span>
            <span class="hub-role-group-title">${this._escapeHtml(meta.label)}</span>
            ${isMine ? `<span class="hub-role-group-you">YOUR ROLE</span>` : ""}
            <span class="hub-role-group-count">${doneCount}/${entries.length}</span>
          </div>
          <div class="hub-role-group-owner" title="${this._escapeHtml(ownerText)}">${this._escapeHtml(ownerText)}${assign.isUnstaffed ? " · OPEN SEAT" : ""}</div>
          <div class="hub-role-group-track"><i style="width:${pct}%"></i></div>
          <div class="hub-role-group-tasks">${tasksHtml}</div>
        </div>
      `;
    }

    _renderMissionHubTask(entry, options) {
      const task = entry.task;
      const taskTitle = String(task.name || "Mission step").replace(/^\s*\d+\.\s*/, "");
      const roleMine = entry.assign.isMine;
      const isActionable = !!options.isActionable && roleMine;
      const status = entry.isCompleted
        ? "DONE"
        : entry.phaseLocked
          ? "IN ORBIT"
          : entry.isLocked
            ? "LOCKED"
            : isActionable
              ? "DO THIS"
              : roleMine
                ? "READY"
                : "ASSIGNED";
      const statusClass = entry.isCompleted
        ? "is-done"
        : entry.phaseLocked
          ? "is-orbit"
          : entry.isLocked
            ? "is-locked"
            : isActionable
              ? "is-todo"
              : roleMine
                ? "is-ready"
                : "is-crew";
      const classes = [
        "hub-task-item",
        entry.isCompleted ? "is-complete" : "",
        entry.isLocked || entry.phaseLocked ? "is-locked" : "",
        roleMine ? "is-mine" : "is-other-role",
        isActionable ? "is-actionable" : "",
        entry.clickBlocked ? "is-click-blocked" : ""
      ].filter(Boolean).join(" ");
      const note = entry.phaseLocked
        ? `<div class="hub-task-note">Opens inside the station</div>`
        : entry.isLocked
          ? `<div class="hub-task-note">${this._escapeHtml(entry.blockedReason || "Complete earlier steps first")}</div>`
          : "";
      const title = entry.isCompleted
        ? `Completed — assigned to ${entry.assign.badgeText}`
        : entry.clickBlocked
          ? entry.blockedReason
          : `Owner: ${entry.assign.badgeText} — Click to open console`;
      return `
        <div class="${classes}" data-hub-task-id="${this._escapeHtml(task.id)}" role="button" tabindex="0" title="${this._escapeHtml(title)}">
          <div class="hub-task-number">${String(entry.order).padStart(2, "0")}</div>
          <div class="hub-task-body">
            <div class="hub-task-title-row">
              <span class="hub-task-title">${this._escapeHtml(taskTitle)}</span>
              <span class="hub-task-status ${statusClass}">${status}</span>
            </div>
            <div class="hub-task-meta">
              <span class="hub-task-room">${this._escapeHtml(task.code || task.room || "OPS")}</span>
              <span class="hub-task-loc">${this._escapeHtml(task.location || task.room || "Workstation")}</span>
            </div>
            ${note}
          </div>
        </div>
      `;
    }

    _renderMissionHubSupportGroup(roleId, checks, rolesApi) {
      const meta = rolesApi
        ? rolesApi.getRoleMeta(roleId)
        : { short: String(roleId).slice(0, 4).toUpperCase(), label: String(roleId).toUpperCase(), color: "#93c5fd" };
      const doneCount = checks.filter((check) => check.done).length;
      const pct = checks.length ? Math.round((doneCount / checks.length) * 100) : 0;
      const rows = checks.map((check) => `
        <div class="hub-support-row${check.done ? " is-done" : ""}">
          <span class="hub-support-dot"></span>
          <span class="hub-support-label">${this._escapeHtml(check.label)}</span>
          <span class="hub-support-state">${check.done ? "OK" : "PENDING"}</span>
        </div>
      `).join("");
      return `
        <div class="hub-role-group hub-support-group" style="--role-color:${meta.color};">
          <div class="hub-role-group-head">
            <span class="hub-role-group-badge">${this._escapeHtml(meta.short)}</span>
            <span class="hub-role-group-title">${this._escapeHtml(meta.label)} SUPPORT</span>
            <span class="hub-role-group-count">${doneCount}/${checks.length}</span>
          </div>
          <div class="hub-role-group-owner">Ground Desk [C] · live Earth checks</div>
          <div class="hub-role-group-track"><i style="width:${pct}%"></i></div>
          <div class="hub-support-list">${rows}</div>
        </div>
      `;
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
      const scenarioName = data.scenarioName || "Team Mission";
      const diffNames = { cadet: "BEGINNER", engineer: "NORMAL", director: "EXPERT" };
      const difficulty = diffNames[String(data.difficultyId || "").toLowerCase()] || String(data.difficultyId || "NORMAL").toUpperCase();
      const durationSec = Math.max(0, Math.round((data.durationMs || 0) / 1000));
      const durationText = `${String(Math.floor(durationSec / 60)).padStart(2, "0")}:${String(durationSec % 60).padStart(2, "0")}`;
      const completedCount = Array.isArray(data.completedObjectives) ? data.completedObjectives.length : 0;
      const totalCount = data.totalObjectives || this.tasks.length;

      if (title) {
        title.textContent = `${scenarioCode} · MISSION COMPLETE`;
        title.style.color = "#67e8f9";
      }
      if (icon) icon.textContent = "LUNASPIS // MISSION SUMMARY";
      if (msg) {
        msg.textContent = reason || `${scenarioName} — all ${totalCount} team steps finished and verified.`;
      }

      if (details) {
        const crew = Array.isArray(data.crew) ? data.crew : [];
        const crewRows = crew.map((member) => `
          <div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="color:#ece7dc;">${this._escapeHtml(member.name || "Player")}</span>
            <span style="color:#9aa4ae;font-family:monospace;font-size:11px;">${this._escapeHtml(String(member.role || "crew").toUpperCase())} · ${Number(member.tasksDone || 0)} STEPS</span>
          </div>
        `).join("");
        const evalSummary = this.evaluateMissionDesign();
        const serverResult = data.result && typeof data.result === "object" ? data.result : null;
        const finalScore = serverResult ? serverResult.overallScore : evalSummary.overallScore;
        const finalCmlLevel = serverResult ? serverResult.cmlLevel : evalSummary.cmlLevel;
        const eventInfo = serverResult && serverResult.event ? serverResult.event : this.lastMissionEvent;
        const validationBadge = serverResult
          ? `<span style="font-family:monospace;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:4px;background:rgba(74,222,128,0.14);border:1px solid rgba(74,222,128,0.4);color:#86efac;">SERVER VALIDATED</span>`
          : "";
        details.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:12px;text-align:left;">
            <div style="padding:10px 12px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.03);">
              <div style="font-family:monospace;font-size:10.5px;color:#9aa4ae;letter-spacing:0.9px;">MISSION TIME</div>
              <div style="font-family:monospace;font-size:17px;color:#67e8f9;margin-top:2px;">${durationText}</div>
            </div>
            <div style="padding:10px 12px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.03);">
              <div style="font-family:monospace;font-size:10.5px;color:#9aa4ae;letter-spacing:0.9px;">STEPS &amp; SCORE ${validationBadge}</div>
              <div style="font-family:monospace;font-size:17px;color:#34d399;margin-top:2px;">${completedCount} / ${totalCount} (${finalScore}/100)</div>
            </div>
            <div style="padding:10px 12px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.03);">
              <div style="font-family:monospace;font-size:10.5px;color:#9aa4ae;letter-spacing:0.9px;">LEVEL / READINESS</div>
              <div style="font-family:monospace;font-size:13.5px;color:#fbbf24;margin-top:2px;">${this._escapeHtml(difficulty)} · STAGE ${finalCmlLevel}${!serverResult && evalSummary.cml ? ` (${evalSummary.cml.activeSummary.percentGreen}% @ Stage ${evalSummary.cml.targetCml})` : ""}</div>
            </div>
            <div style="padding:10px 12px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.03);">
              <div style="font-family:monospace;font-size:10.5px;color:#9aa4ae;letter-spacing:0.9px;">TEAM SIZE</div>
              <div style="font-family:monospace;font-size:13.5px;color:#ece7dc;margin-top:2px;">${crew.length} ${crew.length === 1 ? "PLAYER" : "PLAYERS"}</div>
            </div>
          </div>
          <div style="padding:11px 13px;border-radius:6px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.3);margin-bottom:12px;text-align:left;font-size:12.5px;line-height:1.48;color:#e2e8f0;">
            <div style="font-family:monospace;font-size:10.5px;color:#c4b5fd;font-weight:700;letter-spacing:0.8px;margin-bottom:3px;">${evalSummary.analogue.agencyTag} INSPIRATION &amp; SCIENCE GOAL</div>
            <div style="margin-top:3px;"><strong>${evalSummary.analogue.missions}</strong> — ${evalSummary.analogue.productTitle}</div>
            <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
              <span style="font-family:monospace;font-size:11px;color:#86efac;">Clean Finish: ${evalSummary.disposal.name.split("(")[0].trim()} (${evalSummary.disposal.deorbitYears} yr)</span>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" id="btn-victory-open-cml" style="padding:6px 11px;border-radius:4px;border:1px solid rgba(251,191,36,0.55);background:rgba(245,158,11,0.16);color:#fde68a;font-family:monospace;font-size:11px;font-weight:700;cursor:pointer;">READINESS REPORT</button>
                <button type="button" id="btn-victory-export-mdl" style="padding:6px 11px;border-radius:4px;border:1px solid rgba(103,232,249,0.5);background:rgba(103,232,249,0.14);color:#7dd3fc;font-family:monospace;font-size:11px;font-weight:700;cursor:pointer;">DOWNLOAD PLAN (.JSON)</button>
              </div>
            </div>
          </div>
          <div style="font-family:monospace;font-size:10.5px;color:#9aa4ae;letter-spacing:0.8px;margin-bottom:10px;line-height:1.45;text-align:left;">
            LAUNCHED BY: <span style="color:#ece7dc;">${this._escapeHtml(data.launchedBy || "—")}</span>
            &nbsp;·&nbsp; PARKED BY: <span style="color:#ece7dc;">${this._escapeHtml(data.dockedBy || "—")}</span>
          </div>
          ${eventInfo ? `
            <div style="margin-bottom:10px;padding:9px 12px;border-radius:5px;background:${eventInfo.ok ? "rgba(74,222,128,0.08)" : "rgba(239,68,68,0.1)"};border:1px solid ${eventInfo.ok ? "rgba(74,222,128,0.35)" : "rgba(239,68,68,0.4)"};font-family:monospace;font-size:11px;line-height:1.45;color:${eventInfo.ok ? "#86efac" : "#fca5a5"};text-align:left;">
              SURPRISE CHALLENGE · ${this._escapeHtml(eventInfo.title)} · ${eventInfo.ok ? "PASSED" : "NEEDS FIX"} — ${this._escapeHtml(eventInfo.metric || "")}
            </div>
          ` : ""}
          <div style="font-family:monospace;font-size:11px;color:#9aa4ae;letter-spacing:1px;margin-bottom:6px;text-align:left;">TEAM ROSTER</div>
          <div style="text-align:left;max-height:160px;overflow:auto;margin-bottom:8px;">${crewRows}</div>
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
        btnNext.textContent = isHost ? "PLAY ANOTHER MISSION →" : "WAITING FOR HOST...";
        btnNext.onclick = () => {
          if (isHost && window.netManager && typeof window.netManager.returnToLobby === "function") {
            window.netManager.returnToLobby();
          }
        };
      }
      if (btnClose) {
        btnClose.textContent = "WALK AROUND STATION [Y]";
        btnClose.title = "Hide this summary — press [Y] to bring it back";
        btnClose.onclick = () => {
          if (modal) modal.style.display = "none";
        };
      }

      if (modal) {
        modal.style.background = "rgba(3, 7, 18, 0.88)";
        modal.style.display = "flex";
      }
      // Fanfare only on the real victory; re-opening the summary with [Y] stays quiet.
      if (window.spaceAudio && !this._silentVictory) window.spaceAudio.play("victory");
    }

    reopenVictory() {
      if (!this.lastDebrief) return false;
      this._silentVictory = true;
      try {
        this.showVictory(this.lastVictoryReason, this.lastDebrief);
      } finally {
        this._silentVictory = false;
      }
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
      this.nearbyMissionDiorama = false;
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
