/**
 * AUTO-GENERATED FILE — do not edit by hand.
 *
 * Source: public/js/game/gameplay.js (mission-design catalogs + scoring math)
 * Regenerate: node scripts/build_mission_design_core.js
 *
 * This module is the authoritative server-side scorer for LDR mission reports.
 * It deliberately mirrors the browser's preview math so a crew cannot submit
 * impossible designs and have them accepted by the server.
 */
"use strict";

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

function evaluateDesignCore(missionDesign) {
  if (!missionDesign || typeof missionDesign !== "object" || Array.isArray(missionDesign)) {
    throw new TypeError("A mission design object is required.");
  }
  const md = missionDesign;
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


  return {
    scenario,
    difficulty,
    orbit,
    lv,
    bus,
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
    bioOk,
  };
}

module.exports = {
  evaluateDesignCore,
  catalogs: {
    MISSION_SCENARIOS,
    MISSION_ANALOGUES,
    DIFFICULTY_LEVELS,
    ORBIT_OPTIONS,
    LAUNCH_VEHICLES,
    SPACECRAFT_BUSES,
    POWER_SYSTEMS,
    BATTERY_PACKS,
    SCIENTIFIC_INSTRUMENTS,
    THERMAL_RADIATION_PACKAGES,
    COMMS_PACKAGES,
    GROUND_NETWORKS,
    PROPULSION_SYSTEMS,
    WAVELENGTH_BANDS,
    CUBESAT_FORMS,
    DISPOSAL_OPTIONS,
    BIO_ORGANISM_OPTIONS,
    BIO_BAG_CONFIGS,
    BIO_PROTOCOL_OPTIONS,
    BIO_THERMAL_OPTIONS,
  }
};
