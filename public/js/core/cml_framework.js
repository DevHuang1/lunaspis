/**
 * @fileoverview JPL Concept Maturity Levels (CML 1-9) Engineering Framework for Lunaspis.
 *
 * Implements the methodology from:
 *   R. R. Wessen, C. Borden, J. Ziemer, J. Kwok (Jet Propulsion Laboratory / Caltech),
 *   "Space Mission Concept Development Using Concept Maturity Levels" (2013):
 *   - Full CML 1-9 scale with Assigned (KDP-A / MCR / SRR / MDR / PDR / CDR) & Competed (AO / Step 1 / Step 2) gates
 *   - Explicit CML 2-4 iterative trade-space feedback loop (A-Team <-> Team X)
 *   - Complete 24-row x 7-column CML Matrix (Science, Technical, Management, Cost, Other)
 *   - Complete CML Checklists (CML 2-6, including all Figures 8a-8c CML 4 criteria, N/A rules, and 80% Green gate)
 *   - JPL CML 4 Technical Margin checks (>=35% Dry Mass/Power/Energy, >=100% Flight S/W, >=3/6 dB Link, 20-day Launch Period)
 *   - 5x5 Likelihood x Consequence Risk Matrix & Mission Complexity assessment
 *   - 3 Official JPL Caveats (Completeness != Quality, Unweighted Critical Attributes, Independent Assessor Review)
 *
 * Dual UMD export: attaches to `window.CMLFramework` in browser and `module.exports` in Node.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CMLFramework = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CML_CATEGORIES = [
    { id: "science", label: "Science Goals", color: "#38bdf8" },
    { id: "technical", label: "Spacecraft & Tech", color: "#818cf8" },
    { id: "management", label: "Team & Schedule", color: "#fbbf24" },
    { id: "cost", label: "Budget & Cost", color: "#34d399" },
    { id: "other", label: "Safety & Rules", color: "#f472b6" }
  ];

  /**
   * CML 1-9 Definitions, NASA Lifecycle Phases, Gates & Iterative Loop Context (Paper Section II & Fig. 1-2).
   */
  const CML_LEVELS = [
    {
      level: 1,
      name: "The Big Idea",
      shortTitle: "Stage 1 · The Big Idea",
      phase: "Step 0: Dream & Explore (Early Brainstorm)",
      teamContext: "Small Idea Team (Brainstorming)",
      competedGate: "First Idea Sketch",
      assignedGate: "First Idea Sketch",
      hasFormalChecklist: false,
      feedbackLoopGroup: null,
      summary: "Describe what you want to discover in one clear sentence, sketch what the spacecraft might do, and note why this mission is special.",
      keyFocus: "Four Starter Questions: (1) What is the science goal? (2) What makes this mission special? (3) Roughly when could it launch? (4) About how much should it cost?"
    },
    {
      level: 2,
      name: "Sanity Check",
      shortTitle: "Stage 2 · Does the Math Work?",
      phase: "Step 0: Dream & Explore (Early Brainstorm)",
      teamContext: "Small Concept Team",
      competedGate: "Quick Math Check",
      assignedGate: "Quick Math Check",
      hasFormalChecklist: true,
      feedbackLoopGroup: "trade-loop",
      summary: "Turn the quick sketch into real numbers — check if basic physics works, compare with past missions, spot space hazards, and estimate rough cost.",
      keyFocus: "Compare with a similar past mission, check radiation and heat levels, spot brand-new tech that needs testing, and check if the rough budget fits."
    },
    {
      level: 3,
      name: "Compare Options",
      shortTitle: "Stage 3 · Compare Options",
      phase: "Step 0: Dream & Explore (Early Brainstorm)",
      teamContext: "Design Trade Team (Testing What-Ifs)",
      competedGate: "Compare Designs Before Picking One",
      assignedGate: "Compare Designs Before Picking One",
      hasFormalChecklist: true,
      feedbackLoopGroup: "trade-loop",
      summary: "Try different combinations of rockets, orbits, sizes, and science tools to see how each choice affects science results, budget, and risk.",
      keyFocus: "Save a backup 'Option A' snapshot and compare it against new changes so you see what you gain or lose before locking in your design."
    },
    {
      level: 4,
      name: "Chosen Blueprint",
      shortTitle: "Stage 4 · Chosen Blueprint",
      phase: "Step 1: Pick & Lock Plan",
      teamContext: "Full Mission Design Team",
      competedGate: "Concept Ready to Share",
      assignedGate: "Blueprint Review Check",
      hasFormalChecklist: true,
      feedbackLoopGroup: "trade-loop",
      summary: "Pick your best overall design and verify every major part has healthy safety room for weight, power, radio signal, and budget surprises.",
      keyFocus: "Goal & tool match, full parts list, >=35% safety room, 5x5 risk chart, and loop back to Stage 2-3 if any limit fails."
    },
    {
      level: 5,
      name: "Complete Plan",
      shortTitle: "Stage 5 · Complete Plan",
      phase: "Step 1: Pick & Lock Plan",
      teamContext: "Mission Proposal & Leadership Team",
      competedGate: "Full Mission Proposal",
      assignedGate: "Mission Plan Review",
      hasFormalChecklist: true,
      feedbackLoopGroup: null,
      summary: "Add the real-world work plan: who builds each piece, partner agreements, step-by-step testing plan, calendar, and double-checked budget.",
      keyFocus: "Prove the whole plan — science, hardware, team, timeline, and budget — holds together solidly enough for formal review."
    },
    {
      level: 6,
      name: "Fully Connected Plan",
      shortTitle: "Stage 6 · Fully Connected Plan",
      phase: "Step 2: Detailed Building Plan",
      teamContext: "Flight Project Team",
      competedGate: "Final Selection Review & Site Check",
      assignedGate: "Rules Lock Check",
      hasFormalChecklist: true,
      feedbackLoopGroup: null,
      summary: "Lock down detailed building plans, rocket connections, cost proofs, data delivery, and fresh-eyes expert sign-off.",
      keyFocus: "Close all open design choices, confirm rocket hookups, lock minimum-success rules, and pass an independent fresh-eyes review."
    },
    {
      level: 7,
      name: "Ready-to-Build Blueprint",
      shortTitle: "Stage 7 · Ready-to-Build Blueprint",
      phase: "Step 2: Build Readiness Prep",
      teamContext: "Project Office",
      competedGate: "Build Decision Checkpoint",
      assignedGate: "Build Readiness Review",
      hasFormalChecklist: false,
      feedbackLoopGroup: null,
      summary: "Finish early part blueprints, test prototypes in labs, confirm all new tech works reliably, and lock in how risks will be handled.",
      keyFocus: "Move from planning checklists into real hardware testing and official build-readiness approval."
    },
    {
      level: 8,
      name: "Preliminary Build Review (PDR)",
      shortTitle: "Stage 8 · Preliminary Build Review (PDR)",
      phase: "Step 3: Engineering Design (NASA Phase B)",
      teamContext: "Flight Project Office",
      competedGate: "Preliminary Design Review (PDR)",
      assignedGate: "Preliminary Design Review (PDR)",
      hasFormalChecklist: false,
      feedbackLoopGroup: null,
      summary: "Show working lab prototypes (TRL 6+), confirm every requirement flows down to hardware specs, and prove the schedule and cost plan is realistic.",
      keyFocus: "Prove the engineering design satisfies every science and safety goal before cutting final metal and buying flight hardware."
    },
    {
      level: 9,
      name: "Final Build & Manufacturing (CDR)",
      shortTitle: "Stage 9 · Ready to Build Flight Hardware (CDR)",
      phase: "Step 4: Build & Test Hardware (NASA Phase C)",
      teamContext: "Manufacturing & Test Team",
      competedGate: "Critical Design Review (CDR)",
      assignedGate: "Critical Design Review (CDR)",
      hasFormalChecklist: false,
      feedbackLoopGroup: null,
      summary: "All shop drawings, wiring diagrams, and flight software are finalized, reviewed, and cleared to manufacture and assemble the real spacecraft.",
      keyFocus: "Approve final blueprints to build, assemble, test, and launch the actual flight spacecraft."
    }
  ];

  /**
   * Official 3 JPL CML Caveats + Complexity Advisory (Paper Sections V-VII) in plain English.
   */
  const JPL_CML_CAVEATS = [
    {
      id: "completeness_vs_quality",
      title: "1. Ticking Boxes Isn't Enough — Quality Matters",
      summary: "A checklist confirms you have a plan for each topic, not that the math is smart or consistent. Always verify real engineering margins too."
    },
    {
      id: "unweighted_attributes",
      title: "2. Some Items Are Dealbreakers",
      summary: "Every item counts equally toward the 80% score, so you can score 85% and still fail if a Must-Have item (science goal, parts list, or margin) is red."
    },
    {
      id: "no_self_assessment",
      title: "3. Get a Fresh Pair of Eyes",
      summary: "Teams often overlook blind spots in their own design. Have an outside reviewer (Independent Assessor) spend ~30 minutes challenging your plan."
    }
  ];

  /**
   * Full 24-Row x 7-Column Concept Maturity Level Matrix (Paper Figures 3-7).
   */
  const CML_MATRIX_ROWS = [
    // SCIENCE (2 rows)
    {
      id: "sci_objectives",
      category: "science",
      name: "Science Goals & Must-Hit Targets",
      cells: {
        1: "State your main science question in one simple sentence",
        2: "Check how your science goal compares to past space missions and NASA priorities",
        3: "Match each science goal to real measurements; compare science gain vs. cost and risk",
        4: "Build a Goal-to-Sensor Map (STM); list main vs. bare-minimum science goals & key metrics",
        5: "Finish the Science Goals Map & draft the official mission science rules (PLRA)",
        6: "Lock top-level science goals, detailed sensor specs, and pass/fail mission rules",
        7: "Fine-tune science rules and early hardware-level specs if anything changed"
      }
    },
    {
      id: "sci_data_system",
      category: "science",
      name: "Handling & Sharing Science Data",
      cells: {
        1: "—",
        2: "Estimate roughly how much data the cameras and sensors will create",
        3: "Include daily data size and download speed limits when comparing designs",
        4: "Size onboard storage and plan how much data comes down to Earth each day",
        5: "Design how raw signals become public science files and where they are saved",
        6: "Define the full data pipeline (raw data -> calibrated images -> science maps)",
        7: "Same as Stage 6"
      }
    },

    // TECHNICAL (13 rows)
    {
      id: "tech_mission_dev",
      category: "technical",
      name: "Mission Flight Plan & Operations",
      cells: {
        1: "One sentence explaining what makes this mission unique and how it works",
        2: "Put real numbers on orbit, fuel needs, and space hazards; compare to a similar past flight",
        3: "Compare different orbits and flight plans against science value, budget, and risk",
        4: "Map flight phases, fuel (Delta-V) budget, power/radio plan, and backup trim options",
        5: "Prove the full timeline works smoothly across every phase from launch to end-of-life",
        6: "Detail key maneuvers (burns, flybys, communication passes) and ground dish schedules",
        7: "Write out detailed step-by-step flight modes and contingency timelines"
      }
    },
    {
      id: "tech_spacecraft",
      category: "technical",
      name: "Spacecraft Body & Systems",
      cells: {
        1: "—",
        2: "List the main spacecraft parts needed and compare them to proven spacecraft",
        3: "Test how different spacecraft sizes, solar arrays, or batteries change cost and risk",
        4: "Put together a full system layout sketch, parts diagram, and trim/backup options",
        5: "Document each subsystem with safety margins clear enough for outsiders to double-check",
        6: "Lock the main spacecraft design and define how rocket, body, and sensors connect",
        7: "Finalize subsystem blueprints and plans to test early prototypes and order slow parts"
      }
    },
    {
      id: "tech_instrument",
      category: "technical",
      name: "Science Cameras & Sensors",
      cells: {
        1: "—",
        2: "Briefly explain how each camera or sensor works and name similar ones flown before",
        3: "Compare different sensor setups (zoom, wavelengths, mass) against cost and science return",
        4: "Draw sensor layouts, trace every sensor spec to a science goal, and note trim options",
        5: "Show sensor size/power/cooling needs, early test plans, and data quality goals",
        6: "Pick the final sensor hardware and lock exactly where and how it mounts on the craft",
        7: "Finalize sensor blueprints, mounting connections, and plans to close remaining questions"
      }
    },
    {
      id: "tech_ground_mos",
      category: "technical",
      name: "Mission Control & Dish Network",
      cells: {
        1: "—",
        2: "Decide how Mission Control on Earth will talk to the spacecraft",
        3: "Compare what changes on the ground (big vs. small dishes, automated vs. manual ops)",
        4: "Sketch the Mission Control setup and antenna dishes matched to your flight timeline",
        5: "List control center jobs, team facilities, and how crucial event signals get home fast",
        6: "Combine proven ground tools with new software; map data flow from antenna to scientists",
        7: "Specify new custom ground tools needed and finalize software/dish upgrade plans"
      }
    },
    {
      id: "tech_risk",
      category: "technical",
      name: "Spotting & Managing Risks",
      cells: {
        1: "—",
        2: "List the biggest things that could go wrong or break the mission",
        3: "Compare which design options carry higher vs. lower risk and how to soften them",
        4: "Plot your top worries on a 5x5 chart (How Likely vs. How Bad) with backup fixes",
        5: "Score risks before & after fixes, fund lab tests for top worries, and guard safety margins",
        6: "Check deeper part-by-part risks, fold in prototype test results, and lock Risk Plan",
        7: "Run the active project Risk Plan and update ratings as lab hardware tests finish"
      }
    },
    {
      id: "tech_technology",
      category: "technical",
      name: "New Technology Readiness",
      cells: {
        1: "—",
        2: "Spot any brand-new tech that isn't space-proven yet and still needs lab testing",
        3: "Compare new high-tech options vs. safer proven alternatives across designs",
        4: "Justify each tech's readiness level (TRL) and name a proven backup plan for new tech",
        5: "Finish grading every new tech and write the roadmap to prove it works before building",
        6: "Fund lab demonstrations for key new tech and keep the maturation roadmap on track",
        7: "Check prototype test progress to guarantee every new tech reaches flight readiness (TRL 6)"
      }
    },
    {
      id: "tech_inheritance",
      category: "technical",
      name: "Reusing Proven Parts",
      cells: {
        1: "—",
        2: "Note which past mission designs or off-the-shelf hardware you plan to reuse",
        3: "Weigh the savings of reusing old parts against the risk of needing custom changes",
        4: "Pick the main off-the-shelf or proven components (radios, star trackers, thrusters)",
        5: "Double-check that key reused parts are still made, available, and fit this environment",
        6: "Re-verify supplier stock and watch out for discontinued or aging electronics",
        7: "Same as Stage 6"
      }
    },
    {
      id: "tech_mel",
      category: "technical",
      name: "Parts & Weight List (MEL)",
      cells: {
        1: "—",
        2: "—",
        3: "Add up rough weights for major sections (structure, power, fuel, instruments)",
        4: "List every major hardware piece (antenna, tanks, star tracker, sensors) and its weight",
        5: "Expand the parts list and verify weights match the past missions you copied from",
        6: "Detail down to small individual pieces for anything custom or facing harsh radiation/cold",
        7: "Same as Stage 6"
      }
    },
    {
      id: "tech_margins",
      category: "technical",
      name: "Safety Buffers (Technical Margins)",
      cells: {
        1: "—",
        2: "Spot areas prone to surprises (weight growth, tight power) and add rough slack",
        3: "Apply standard NASA safety buffers and test best-case vs. worst-case scenarios",
        4: "Meet NASA buffers: >=35% weight/power/battery, >=100% CPU, >=3/6 dB signal, 20d launch",
        5: "Actively track every resource ledger and define rules for who can spend reserve slack",
        6: "Same as Stage 5",
        7: "Same as Stage 5"
      }
    },
    {
      id: "tech_sys_eng",
      category: "technical",
      name: "Pulling Everything Together (Systems Eng)",
      cells: {
        1: "—",
        2: "Generate a few different high-level mission concepts to explore",
        3: "Score how science, cost, and risk affect each other across the whole spacecraft",
        4: "Finish big-picture trades linking science sensors, spacecraft body, and ground ops",
        5: "Lock the main architecture, write the team's technical rulebook, and list remaining checks",
        6: "Finish big-system debates, map detailed tweaks, and lock the Systems Engineering Plan",
        7: "Close out subsystem design trades and update the engineering rulebook as needed"
      }
    },
    {
      id: "tech_launch_services",
      category: "technical",
      name: "Picking the Rocket",
      cells: {
        1: "—",
        2: "Name a realistic rocket family and check that it can lift the rough mission weight",
        3: "Compare several rockets for lifting power and nose-cone size fit",
        4: "Pick a primary rocket and a backup rocket using official launch service options",
        5: "Talk with launch providers about special needs (cleanrooms, late fueling, orbital accuracy)",
        6: "Confirm rocket vibrations, temperature limits, and fit assumptions still hold",
        7: "Lock down any mission-special rocket prep (contamination control, custom adapters)"
      }
    },
    {
      id: "tech_planetary_protection",
      category: "technical",
      name: "Keeping Space Clean & Safe",
      cells: {
        1: "—",
        2: "Check whether microbes/sterilization rules or space-debris cleanup apply",
        3: "Compare ways to follow sterilization or safe de-orbit / graveyard rules",
        4: "Define the exact plan to avoid polluting other worlds or leaving space junk behind",
        5: "Get a formal early classification letter from Planetary Protection / Debris officers",
        6: "Same as Stage 5",
        7: "Receive formal Planetary Protection / End-of-Mission disposal clearance"
      }
    },
    {
      id: "tech_vnv",
      category: "technical",
      name: "Testing & Proving Before Launch",
      cells: {
        1: "—",
        2: "—",
        3: "Spot any tricky or unusual lab tests the mission will need before launch",
        4: "Plan how new features will be tested, list test rigs/simulators, and count flight computer tasks",
        5: "Schedule test hardware/software benches and count all spacecraft plug-in connections",
        6: "Tie the test lab calendar directly into the main schedule and update plug/computer counts",
        7: "Finish the Preliminary Test Plan and lock in the list of engineering test models"
      }
    },

    // MANAGEMENT (5 rows)
    {
      id: "mgmt_acquisition",
      category: "management",
      name: "Build vs. Buy & Suppliers",
      cells: {
        1: "—",
        2: "—",
        3: "Check who makes the needed parts and decide roughly what to build in-house vs. buy",
        4: "Write up a make-or-buy plan and ask aerospace suppliers for quick capability quotes if needed",
        5: "Sign partner agreements, flag slow-to-build parts, and name likely vendors for major gear",
        6: "Put main industry partners on contract for design work and draft hardware shopping specs",
        7: "Negotiate vendor contracts or capped budgets and detail Phase B build tasks"
      }
    },
    {
      id: "mgmt_org_partnering",
      category: "management",
      name: "Team Roles & Partners",
      cells: {
        1: "—",
        2: "—",
        3: "Explore potential science centers, universities, or international partners",
        4: "Name the Science Lead (PI), core partners, and draft the project org chart",
        5: "Name key managers (PM, Chief Engineer), assign partner duties, and draft team agreements",
        6: "Have all key leaders in place with signed partner agreements and clear management rules",
        7: "Staff the full core team, name hardware contractors, and sign next-phase agreements"
      }
    },
    {
      id: "mgmt_schedules",
      category: "management",
      name: "Timeline & Launch Calendar",
      cells: {
        1: "Pick an approximate target year to launch",
        2: "Find good planetary/launch windows and rough build time using rule-of-thumb benchmarks",
        3: "Test how building faster or slower changes science results, risk, and total mission time",
        4: "Build a high-level project timeline bar chart (Gantt chart) from start to launch",
        5: "Make a month-by-month calendar showing reviews, tests, critical bottlenecks, and spare time",
        6: "Update the month-by-month calendar and verify funded schedule slack",
        7: "Detail subsystem delivery dates plus best/worst-case schedule confidence range"
      }
    },
    {
      id: "mgmt_wbs",
      category: "management",
      name: "Project Task Map (Work Breakdown)",
      cells: {
        1: "—",
        2: "—",
        3: "Group work using NASA's standard project tree down to high-level subsystems",
        4: "Break down the whole project tree (Team, Science, Spacecraft, Sensors) to check nothing is missed",
        5: "Approve the tailored project task tree and definitions for this mission",
        6: "Approve the tailored project task tree and definitions for this mission",
        7: "Approve the tailored project task tree and definitions for this mission"
      }
    },
    {
      id: "mgmt_mission_assurance",
      category: "management",
      name: "Quality & Reliability Checks",
      cells: {
        1: "—",
        2: "—",
        3: "—",
        4: "—",
        5: "Pick the right level of quality inspection based on budget and mission risk tolerance",
        6: "Expand quality, part-screening, and failure-prevention rules for the full study",
        7: "Write the Preliminary Quality & Mission Assurance Plan"
      }
    },

    // COST (1 row)
    {
      id: "cost_estimation",
      category: "cost",
      name: "Budget Estimate & Rainy-Day Reserve",
      cells: {
        1: "—",
        2: "Estimate a rough price range by comparing to similar past space missions",
        3: "Track how design tweaks change cost and estimate rough prices by major section",
        4: "Price out every main area (spacecraft, sensors, ops), add risk-based rainy-day reserves, check yearly cap",
        5: "Double-check the Stage 4 price tag with at least 2 independent cost calculators & reserve checks",
        6: "Build bottom-up quotes + statistical 'worst/likely' cost curves backed by real engineering math",
        7: "Refine the approved budget baseline with clear low-to-high confidence ranges"
      }
    },

    // OTHER (3 rows)
    {
      id: "other_launch_approval",
      category: "other",
      name: "Launch Range & Safety Clearance",
      cells: {
        1: "—",
        2: "—",
        3: "—",
        4: "—",
        5: "Notify launch safety offices (especially for special batteries/nuclear heat) and list clearance steps",
        6: "Document every required launch range and safety approval step",
        7: "Complete the baseline Launch Safety Approval Plan"
      }
    },
    {
      id: "other_nepa",
      category: "other",
      name: "Environmental & Public Safety (NEPA)",
      cells: {
        1: "—",
        2: "Check for radioactive materials, toxic propellants, or public safety impacts",
        3: "Compare cleaner or non-nuclear alternatives if hazardous hardware is considered",
        4: "Review formal environmental impact rules (NEPA) required before launch",
        5: "Document environmental check results and notify the NASA Environmental Office",
        6: "Re-check environmental compliance after final design changes",
        7: "Re-check environmental compliance after final design changes"
      }
    },
    {
      id: "other_export",
      category: "other",
      name: "International Sharing Rules",
      cells: {
        1: "—",
        2: "—",
        3: "—",
        4: "Check with Export Compliance if sharing sensitive rocket/hardware specs with foreign partners",
        5: "Check with Export Compliance if sharing sensitive rocket/hardware specs with foreign partners",
        6: "Put official tech-sharing permits in place before exchanging detailed blueprints overseas",
        7: "Finalize all international tech-sharing permits and compliance plan"
      }
    }
  ];

  /**
   * Stage 1 Informal 4 Starter Questions (no checklist score, seed definitions only).
   */
  const CML_1_SEED_AREAS = [
    { id: "cml1_science", label: "Main Science Goal (1 simple sentence)", field: "stmSummary" },
    { id: "cml1_unique", label: "What Makes It Special / Inspiration", field: "heritageSource" },
    { id: "cml1_timeframe", label: "Rough Launch Year / Timeframe", field: "launchWindow" },
    { id: "cml1_cost_class", label: "Target Budget Tier", field: "costClass" }
  ];

  /**
   * Full CML Checklists for CML 2-6.
   * CML 4 contains every criterion + shaded N/A entry from Figures 8a-8c of the JPL paper.
   * CML 2, 3, 5, 6 items derive directly from the 24x7 CML Matrix rows.
   */
  const CML_CHECKLIST_ITEMS = [
    // ======================= STAGE 2 CHECKLIST =======================
    { id: "c2_sci_obj", level: 2, rowId: "sci_objectives", category: "science", text: "Check how your science goals fit NASA priorities and past space missions", critical: true, na: false, consoleKey: "task_science" },
    { id: "c2_sci_data", level: 2, rowId: "sci_data_system", category: "science", text: "Estimate roughly how much daily data your cameras and sensors create", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c2_mdev_params", level: 2, rowId: "tech_mission_dev", category: "technical", text: "Put numbers on orbit and fuel needs, compared to a similar past mission", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c2_mdev_env", level: 2, rowId: "tech_mission_dev", category: "technical", text: "Check basic space radiation and heat/cold levels along the orbit", critical: false, na: false, consoleKey: "task_lss" },
    { id: "c2_sc_elem", level: 2, rowId: "tech_spacecraft", category: "technical", text: "List core spacecraft parts (body, solar panels, batteries) and basic specs", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c2_inst_tech", level: 2, rowId: "tech_instrument", category: "technical", text: "Pick how you'll measure things (camera/radar/spectrometer) & cite proven examples", critical: true, na: false, consoleKey: "task_science" },
    { id: "c2_gnd_ops", level: 2, rowId: "tech_ground_mos", category: "technical", text: "Pick how Earth ground stations and antennas will talk to the spacecraft", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c2_risk_id", level: 2, rowId: "tech_risk", category: "technical", text: "List the biggest early technical risks and things that could go wrong", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c2_tech_trl", level: 2, rowId: "tech_technology", category: "technical", text: "Spot any brand-new tech that still needs lab testing before building", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c2_inher_src", level: 2, rowId: "tech_inheritance", category: "technical", text: "Note which past mission designs or off-the-shelf hardware you'll reuse", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c2_margin_unc", level: 2, rowId: "tech_margins", category: "technical", text: "Flag tight spots (weight, power, signal) that need extra safety buffer", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c2_se_trades", level: 2, rowId: "tech_sys_eng", category: "technical", text: "Sketch a couple of different early mission design options to test", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c2_lv_id", level: 2, rowId: "tech_launch_services", category: "technical", text: "Pick a rocket capable of lifting your spacecraft to orbit", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c2_pp_need", level: 2, rowId: "tech_planetary_protection", category: "technical", text: "Check if planetary cleanliness (microbe) or space-debris cleanup rules apply", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c2_sched_rot", level: 2, rowId: "mgmt_schedules", category: "management", text: "Pick a target launch timeframe and rough mission lifetime", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c2_cost_range", level: 2, rowId: "cost_estimation", category: "cost", text: "Check rough mission cost against a realistic budget cap & similar past flights", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c2_nepa_screen", level: 2, rowId: "other_nepa", category: "other", text: "Check for toxic fuels, nuclear materials, or public safety issues", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c2_mel_na", level: 2, rowId: "tech_mel", category: "technical", text: "Full Parts & Weight List (MEL) — Not needed yet at Stage 2", critical: false, na: true },
    { id: "c2_vnv_na", level: 2, rowId: "tech_vnv", category: "technical", text: "Pre-Launch Testing Plan — Not needed yet at Stage 2", critical: false, na: true },
    { id: "c2_wbs_na", level: 2, rowId: "mgmt_wbs", category: "management", text: "Project Task Tree (WBS) — Not needed yet at Stage 2", critical: false, na: true },

    // ======================= STAGE 3 CHECKLIST =======================
    { id: "c3_sci_partials", level: 3, rowId: "sci_objectives", category: "science", text: "Compare how changing weight, orbit, or budget changes your science payoff", critical: true, na: false, consoleKey: "task_science" },
    { id: "c3_sci_datarate", level: 3, rowId: "sci_data_system", category: "science", text: "Check daily data size vs. radio download capacity across design choices", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c3_mdev_alt", level: 3, rowId: "tech_mission_dev", category: "technical", text: "Compare alternative orbits & flight plans against science, cost, and risk", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c3_mdev_hazards", level: 3, rowId: "tech_mission_dev", category: "technical", text: "Check that shielding and thermal gear survive space radiation and cold eclipses", critical: false, na: false, consoleKey: "task_lss" },
    { id: "c3_sc_sens", level: 3, rowId: "tech_spacecraft", category: "technical", text: "Save an 'Option A' snapshot to compare spacecraft mass/power tradeoffs", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c3_inst_sens", level: 3, rowId: "tech_instrument", category: "technical", text: "Test different camera/sensor mixes against cost, weight, and science fit", critical: true, na: false, consoleKey: "task_science" },
    { id: "c3_gnd_trades", level: 3, rowId: "tech_ground_mos", category: "technical", text: "Compare spacecraft-to-ground dish options and any new antenna needs", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c3_risk_cmp", level: 3, rowId: "tech_risk", category: "technical", text: "Compare which design options carry higher risk and list ways to reduce it", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c3_tech_cmp", level: 3, rowId: "tech_technology", category: "technical", text: "Compare risky brand-new tech vs. safer proven hardware across options", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c3_inher_eval", level: 3, rowId: "tech_inheritance", category: "technical", text: "Weigh cost savings of reusing old hardware vs. risk of adapting it", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c3_mel_est", level: 3, rowId: "tech_mel", category: "technical", text: "Add up realistic weights for every major section (body, fuel, sensors)", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c3_margin_cases", level: 3, rowId: "tech_margins", category: "technical", text: "Apply NASA safety buffers and check best- vs. worst-case design margins", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c3_se_merits", level: 3, rowId: "tech_sys_eng", category: "technical", text: "Weigh overall performance vs. cost and check how subsystems depend on each other", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c3_lv_fairing", level: 3, rowId: "tech_launch_services", category: "technical", text: "Compare candidate rockets for lifting power and nose-cone size fit", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c3_pp_opts", level: 3, rowId: "tech_planetary_protection", category: "technical", text: "Compare end-of-mission de-orbit or safe cleanup options", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c3_vnv_unique", level: 3, rowId: "tech_vnv", category: "technical", text: "Spot any unusual lab tests or ground simulators this mission will require", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c3_acq_makebuy", level: 3, rowId: "mgmt_acquisition", category: "management", text: "Check suppliers and decide what hardware to build in-house vs. buy", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c3_org_partner", level: 3, rowId: "mgmt_org_partnering", category: "management", text: "List potential partner universities, space agencies, or contractors", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c3_sched_var", level: 3, rowId: "mgmt_schedules", category: "management", text: "Check how changing mission length affects science output and budget", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c3_wbs_l2", level: 3, rowId: "mgmt_wbs", category: "management", text: "Organize project work into main buckets (Team, Science, Spacecraft, Sensors)", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c3_cost_sens", level: 3, rowId: "cost_estimation", category: "cost", text: "Track how design changes affect price tag and budget risk vs. Option A", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c3_nepa_opts", level: 3, rowId: "other_nepa", category: "other", text: "Explore cleaner, non-nuclear, or lower-impact environmental alternatives", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c3_ma_na", level: 3, rowId: "mgmt_mission_assurance", category: "management", text: "Quality & Reliability Rules — Not needed yet at Stage 3", critical: false, na: true },
    { id: "c3_la_na", level: 3, rowId: "other_launch_approval", category: "other", text: "Launch Range Safety Approval — Not needed yet at Stage 3", critical: false, na: true },

    // ======================= STAGE 4 CHECKLIST (CORE BLUEPRINT GATE) =======================
    // Science Goals (6 active)
    { id: "c4_sci_stm", level: 4, rowId: "sci_objectives", category: "science", text: "Build a Goal-to-Sensor Map connecting each question to a camera/sensor (STM)", critical: true, na: false, consoleKey: "task_science" },
    { id: "c4_sci_base", level: 4, rowId: "sci_objectives", category: "science", text: "Define 1 Full-Success Science Goal (what victory looks like)", critical: true, na: false, consoleKey: "task_science" },
    { id: "c4_sci_thresh", level: 4, rowId: "sci_objectives", category: "science", text: "Define 1 Bare-Minimum Science Goal (floor still worth flying)", critical: true, na: false, consoleKey: "task_science" },
    { id: "c4_sci_kpp", level: 4, rowId: "sci_objectives", category: "science", text: "List Key Metrics (resolution, sensitivity, coverage) to prove success (KPPs)", critical: true, na: false, consoleKey: "task_science" },
    { id: "c4_sci_l1", level: 4, rowId: "sci_objectives", category: "science", text: "Capture top-level mission must-haves (Level 1 Requirements)", critical: true, na: false, consoleKey: "task_science" },
    { id: "c4_sci_data_size", level: 4, rowId: "sci_data_system", category: "science", text: "Confirm daily data fits inside Earth radio download capacity (GB/day)", critical: false, na: false, consoleKey: "task_hull" },

    // Technical — Mission Flight Plan (4)
    { id: "c4_mdev_ops", level: 4, rowId: "tech_mission_dev", category: "technical", text: "Map out main mission phases, orbit timeline, and daily operations modes", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c4_mdev_dv", level: 4, rowId: "tech_mission_dev", category: "technical", text: "Calculate fuel needed (Delta-V) to reach orbit, steer, and safely retire", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c4_mdev_ptd", level: 4, rowId: "tech_mission_dev", category: "technical", text: "Show power, radio link, and onboard data plan all work together", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_mdev_descope", level: 4, rowId: "tech_mission_dev", category: "technical", text: "Name backup options you can trim (descope) if weight or budget gets tight", critical: false, na: false, consoleKey: "task_nav" },

    // Technical — Spacecraft Body (2)
    { id: "c4_sc_arch", level: 4, rowId: "tech_spacecraft", category: "technical", text: "Build full spacecraft layout sketch & 3D assembly diagram", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_sc_descope", level: 4, rowId: "tech_spacecraft", category: "technical", text: "List optional spacecraft features that could be simplified if needed", critical: false, na: false, consoleKey: "task_wires" },

    // Technical — Cameras & Sensors (2)
    { id: "c4_inst_config", level: 4, rowId: "tech_instrument", category: "technical", text: "Fit cameras & sensors cleanly onto spacecraft and check pointing/optics", critical: false, na: false, consoleKey: "task_science" },
    { id: "c4_inst_l1trace", level: 4, rowId: "tech_instrument", category: "technical", text: "Verify every camera/sensor spec traces directly back to a top science goal", critical: true, na: false, consoleKey: "task_science" },

    // Technical — Mission Control & Dishes (1)
    { id: "c4_gnd_mos", level: 4, rowId: "tech_ground_mos", category: "technical", text: "Match ground dish network & Mission Control setup to your flight schedule", critical: false, na: false, consoleKey: "task_hull" },

    // Technical — Risk (2)
    { id: "c4_risk_drivers", level: 4, rowId: "tech_risk", category: "technical", text: "List the top things that could go wrong across subsystems", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c4_risk_5x5", level: 4, rowId: "tech_risk", category: "technical", text: "Build a 5x5 Risk Map (How Likely vs. How Bad) with backup fixes", critical: true, na: false, consoleKey: "task_landing" },

    // Technical — New Tech (4)
    { id: "c4_tech_char", level: 4, rowId: "tech_technology", category: "technical", text: "Verify thermal, radio, and propulsion technology choices", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_tech_base", level: 4, rowId: "tech_technology", category: "technical", text: "Justify why your chosen baseline tech beats alternatives", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_tech_trl", level: 4, rowId: "tech_technology", category: "technical", text: "Explain how ready each new tech is (TRL readiness score)", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_tech_fall", level: 4, rowId: "tech_technology", category: "technical", text: "Pick a proven Plan-B backup for every brand-new piece of technology", critical: false, na: false, consoleKey: "task_landing" },

    // Technical — Reusing Parts & Parts List (2)
    { id: "c4_inher_items", level: 4, rowId: "tech_inheritance", category: "technical", text: "Pick major proven off-the-shelf hardware (radios, sensors, past bus)", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_mel_assy", level: 4, rowId: "tech_mel", category: "technical", text: "List every major hardware piece and its weight (Master Equipment List)", critical: true, na: false, consoleKey: "task_wires" },

    // Technical — Safety Buffers (9 active + 3 shaded N/A)
    { id: "c4_mgn_policy", level: 4, rowId: "tech_margins", category: "technical", text: "Follow standard NASA safety buffers so surprises don't break the build", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_mgn_drymass", level: 4, rowId: "tech_margins", category: "technical", text: "Spacecraft Weight / Rocket Lift Safety Buffer >= 35%* (room to grow)", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_mgn_prop_na", level: 4, rowId: "tech_margins", category: "technical", text: "Separate Propellant Buffer — Not tracked separately at Stage 4", critical: false, na: true },
    { id: "c4_mgn_power", level: 4, rowId: "tech_margins", category: "technical", text: "Solar Power Safety Buffer >= 35%* (extra watts over daily demand)", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_mgn_energy", level: 4, rowId: "tech_margins", category: "technical", text: "Battery Reserve Buffer >= 35%* (safe cushion during dark eclipses)", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_mgn_storage_na", level: 4, rowId: "tech_margins", category: "technical", text: "Flash Data Storage Buffer — Not tracked separately at Stage 4", critical: false, na: true },
    { id: "c4_mgn_acs_na", level: 4, rowId: "tech_margins", category: "technical", text: "Pointing / Thruster Buffer — Not tracked separately at Stage 4", critical: false, na: true },
    { id: "c4_mgn_sw", level: 4, rowId: "tech_margins", category: "technical", text: "Flight Computer CPU & Memory Spare Room >= 100% (at least half idle)", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_mgn_rf", level: 4, rowId: "tech_margins", category: "technical", text: "Radio Signal Buffer >= 3 dB (deep space) or >= 6 dB (Earth/Moon orbit)", critical: true, na: false, consoleKey: "task_hull" },
    { id: "c4_mgn_launchwin", level: 4, rowId: "tech_margins", category: "technical", text: "Launch Window stays open >= 20 days (backup days if weather scrubs)", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c4_mgn_sched", level: 4, rowId: "tech_margins", category: "technical", text: "Funded extra time built into schedule in case parts arrive late", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c4_mgn_other", level: 4, rowId: "tech_margins", category: "technical", text: "Verify heat-rejection & radiation-shielding buffers handle worst conditions", critical: false, na: false, consoleKey: "task_lss" },

    // Technical — Integration, Rocket, Space Cleanliness, Testing (8)
    { id: "c4_se_trades", level: 4, rowId: "tech_sys_eng", category: "technical", text: "Finish big-picture design comparisons across science, spacecraft & ground", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_lv_backup", level: 4, rowId: "tech_launch_services", category: "technical", text: "Name primary rocket AND a backup rocket if the first one isn't ready", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c4_lv_nls", level: 4, rowId: "tech_launch_services", category: "technical", text: "Use standard certified launch services options", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c4_pp_approach", level: 4, rowId: "tech_planetary_protection", category: "technical", text: "Define end-of-life disposal (clean de-orbit or safe graveyard orbit)", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c4_vnv_new", level: 4, rowId: "tech_vnv", category: "technical", text: "Explain how you will test every brand-new capability before launch", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_vnv_testbed", level: 4, rowId: "tech_vnv", category: "technical", text: "List lab test rigs, simulators, and prototype models needed", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_vnv_support", level: 4, rowId: "tech_vnv", category: "technical", text: "Confirm facilities and crew exist to run launch & pre-flight tests", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c4_vnv_cdh", level: 4, rowId: "tech_vnv", category: "technical", text: "Count major flight-computer software jobs (boot, pointing, fault-safe)", critical: false, na: false, consoleKey: "task_wires" },

    // Team & Schedule (9 active + 1 N/A)
    { id: "c4_acq_bdm", level: 4, rowId: "mgmt_acquisition", category: "management", text: "Write down key Build vs. Buy reasoning for major hardware", critical: false, na: false },
    { id: "c4_acq_rfi", level: 4, rowId: "mgmt_acquisition", category: "management", text: "Check with potential aerospace suppliers on cost & availability if needed", critical: false, na: false },
    { id: "c4_acq_inhouse", level: 4, rowId: "mgmt_acquisition", category: "management", text: "Decide what your own team builds vs. what outside companies build", critical: false, na: false },
    { id: "c4_org_pi", level: 4, rowId: "mgmt_org_partnering", category: "management", text: "Name the Science Lead, Mission Lead, and main team partners", critical: false, na: false },
    { id: "c4_org_opts", level: 4, rowId: "mgmt_org_partnering", category: "management", text: "Explore team & center partnership options", critical: false, na: false },
    { id: "c4_org_struct", level: 4, rowId: "mgmt_org_partnering", category: "management", text: "Sketch clear team structure & who reports to whom", critical: false, na: false },
    { id: "c4_sched_gantt", level: 4, rowId: "mgmt_schedules", category: "management", text: "Draft a top-level timeline bar chart (Gantt) from design to launch", critical: false, na: false },
    { id: "c4_wbs_l3l4", level: 4, rowId: "mgmt_wbs", category: "management", text: "Break project work into clear sub-tasks (Team, Science, Spacecraft, Sensors)", critical: true, na: false },
    { id: "c4_wbs_scope", level: 4, rowId: "mgmt_wbs", category: "management", text: "Check that every task bucket covers everything needed without gaps", critical: false, na: false },
    { id: "c4_ma_na", level: 4, rowId: "mgmt_mission_assurance", category: "management", text: "Quality & Reliability Plan — Not needed yet at Stage 4", critical: false, na: true },

    // Budget & Cost (4 active)
    { id: "c4_cost_l3l4", level: 4, rowId: "cost_estimation", category: "cost", text: "Estimate costs piece-by-piece (spacecraft, sensors, rocket, ground ops)", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_cost_res", level: 4, rowId: "cost_estimation", category: "cost", text: "Keep a rainy-day budget reserve (>=10% left over) based on risk", critical: true, na: false, consoleKey: "task_landing" },
    { id: "c4_cost_sub", level: 4, rowId: "cost_estimation", category: "cost", text: "Spot which subsystem is most likely to go over budget", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_cost_prof", level: 4, rowId: "cost_estimation", category: "cost", text: "Confirm total mission price fits cleanly within NASA's budget cap", critical: true, na: false, consoleKey: "task_wires" },

    // Safety & Rules (2 active + 1 N/A)
    { id: "c4_la_na", level: 4, rowId: "other_launch_approval", category: "other", text: "Launch Range Safety Approval — Not needed yet at Stage 4", critical: false, na: true },
    { id: "c4_nepa_eval", level: 4, rowId: "other_nepa", category: "other", text: "Check environmental impact & orbital safety rules (NEPA / Clean Launch)", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c4_export_na", level: 4, rowId: "other_export", category: "other", text: "International Tech-Sharing Check (only needed if sharing specs abroad)", critical: false, na: true }
  ];

  /**
   * Stage 5 (Complete Plan) & Stage 6 (Fully Integrated Plan) Checklists.
   */
  const CML_5_AND_6_ITEMS = [
    // STAGE 5 — Complete Plan (MCR / Formal Proposal)
    { id: "c5_sci_stm", level: 5, rowId: "sci_objectives", category: "science", text: "Finalize Science Goals Map & draft official pass/fail science rules", critical: true, na: false, consoleKey: "task_science" },
    { id: "c5_sci_arch", level: 5, rowId: "sci_data_system", category: "science", text: "Define how science data is processed, archived, and shared publicly", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c5_mdev_stable", level: 5, rowId: "tech_mission_dev", category: "technical", text: "Prove the mission timeline works end-to-end across every flight phase", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c5_sc_ext", level: 5, rowId: "tech_spacecraft", category: "technical", text: "Write down subsystem blueprints clear enough for outside experts to cost-check", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c5_inst_qqcl", level: 5, rowId: "tech_instrument", category: "technical", text: "Lock camera/sensor power, cooling, data quality goals & slow-part order plans", critical: false, na: false, consoleKey: "task_science" },
    { id: "c5_gnd_crit", level: 5, rowId: "tech_ground_mos", category: "technical", text: "Size Mission Control staffing & confirm live telemetry coverage during key burns", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c5_risk_prepost", level: 5, rowId: "tech_risk", category: "technical", text: "Score top risks before & after fixes and set clear rules for spending reserves", critical: true, na: false, consoleKey: "task_landing" },
    { id: "c5_tech_tdp", level: 5, rowId: "tech_technology", category: "technical", text: "Write the step-by-step lab testing plan for every brand-new technology", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c5_inher_avail", level: 5, rowId: "tech_inheritance", category: "technical", text: "Confirm reused off-the-shelf hardware is still built and fits this mission", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c5_mel_upd", level: 5, rowId: "tech_mel", category: "technical", text: "Expand the Parts & Weight List and match estimates to proven past flights", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c5_mgn_track", level: 5, rowId: "tech_margins", category: "technical", text: "Track weight, power, fuel & data reserves actively across every flight mode", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c5_se_final", level: 5, rowId: "tech_sys_eng", category: "technical", text: "Lock the spacecraft layout & write the team's technical rulebook", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c5_lv_contact", level: 5, rowId: "tech_launch_services", category: "technical", text: "Contact rocket launch providers & confirm any special pad/cleanroom needs", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c5_pp_letter", level: 5, rowId: "tech_planetary_protection", category: "technical", text: "Get an early Planetary Protection / debris clearance classification", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c5_vnv_sched", level: 5, rowId: "tech_vnv", category: "technical", text: "Schedule lab test benches, list test rigs & count spacecraft wiring plugs", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c5_acq_mou", level: 5, rowId: "mgmt_acquisition", category: "management", text: "Draft partner agreements, flag slow parts & list likely hardware suppliers", critical: false, na: false },
    { id: "c5_org_named", level: 5, rowId: "mgmt_org_partnering", category: "management", text: "Name key managers (PM, Chief Engineer, Instrument Lead) & team agreements", critical: false, na: false },
    { id: "c5_sched_1mo", level: 5, rowId: "mgmt_schedules", category: "management", text: "Build a month-by-month project calendar showing bottlenecks & schedule buffer", critical: true, na: false },
    { id: "c5_wbs_app", level: 5, rowId: "mgmt_wbs", category: "management", text: "Approve the final mission Task Tree (Work Breakdown) & task definitions", critical: false, na: false },
    { id: "c5_ma_class", level: 5, rowId: "mgmt_mission_assurance", category: "management", text: "Set quality & testing rigor matched to the mission's risk tolerance", critical: false, na: false },
    { id: "c5_cost_2model", level: 5, rowId: "cost_estimation", category: "cost", text: "Double-check the Stage 4 price tag using a second independent cost check", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c5_other_la", level: 5, rowId: "other_launch_approval", category: "other", text: "Notify Launch Range Safety office & list pad clearance steps", critical: false, na: false },
    { id: "c5_other_nepa", level: 5, rowId: "other_nepa", category: "other", text: "Document environmental compliance checks & notify NASA safety coordinators", critical: false, na: false },

    // STAGE 6 — Fully Integrated Plan (Requirements Lock Check / SRR)
    { id: "c6_sci_l1", level: 6, rowId: "sci_objectives", category: "science", text: "Lock top-level science rules, detailed sensor targets & minimum pass criteria", critical: true, na: false, consoleKey: "task_science" },
    { id: "c6_sci_l0l2", level: 6, rowId: "sci_data_system", category: "science", text: "Define full data pipeline (raw telemetry -> calibrated files -> science products)", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c6_mdev_crit", level: 6, rowId: "tech_mission_dev", category: "technical", text: "Lock critical maneuvers, burn plans & Earth dish tracking schedules", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c6_sc_if", level: 6, rowId: "tech_spacecraft", category: "technical", text: "Close major design trades & define all rocket, bus, and sensor connections", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c6_inst_final", level: 6, rowId: "tech_instrument", category: "technical", text: "Lock final camera/sensor hardware choices and spacecraft mounting specs", critical: true, na: false, consoleKey: "task_science" },
    { id: "c6_gnd_flow", level: 6, rowId: "tech_ground_mos", category: "technical", text: "Map Mission Control team roles, ground dishes & full data delivery flow", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c6_risk_tier2", level: 6, rowId: "tech_risk", category: "technical", text: "Check deep part-by-part risks, add prototype test results & lock Risk Plan", critical: true, na: false, consoleKey: "task_landing" },
    { id: "c6_tech_invest", level: 6, rowId: "tech_technology", category: "technical", text: "Fund lab demonstrations for new tech so everything matures before flight build", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c6_inher_obs", level: 6, rowId: "tech_inheritance", category: "technical", text: "Re-verify supplier stock & check reused electronics aren't discontinued", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c6_mel_comp", level: 6, rowId: "tech_mel", category: "technical", text: "Detail parts list down to small components for custom or high-stress hardware", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c6_mgn_active", level: 6, rowId: "tech_margins", category: "technical", text: "Actively track every weight, power, and data safety buffer across teams", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c6_se_seip", level: 6, rowId: "tech_sys_eng", category: "technical", text: "Close big system debates & lock the master Systems Engineering Plan", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c6_lv_conf", level: 6, rowId: "tech_launch_services", category: "technical", text: "Confirm final rocket performance, vibration limits & nose-cone fit", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c6_vnv_ims", level: 6, rowId: "tech_vnv", category: "technical", text: "Merge the pre-launch test calendar into the master project schedule", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c6_acq_step2", level: 6, rowId: "mgmt_acquisition", category: "management", text: "Put key industry hardware partners under contract with shopping specs", critical: false, na: false },
    { id: "c6_org_core", level: 6, rowId: "mgmt_org_partnering", category: "management", text: "Staff remaining core engineers, sign partner charters & lock management rules", critical: false, na: false },
    { id: "c6_sched_ims", level: 6, rowId: "mgmt_schedules", category: "management", text: "Update month-by-month calendar with critical path & funded spare time", critical: false, na: false },
    { id: "c6_ma_plan", level: 6, rowId: "mgmt_mission_assurance", category: "management", text: "Expand Quality & Mission Assurance plan for formal requirements check", critical: false, na: false },
    { id: "c6_cost_boe", level: 6, rowId: "cost_estimation", category: "cost", text: "Produce detailed bottom-up cost proofs & best/likely/worst-case budget curves", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c6_other_export", level: 6, rowId: "other_export", category: "other", text: "Put international tech-sharing permits in place if foreign partners participate", critical: false, na: false }
  ];

  const ALL_CHECKLIST_ITEMS = CML_CHECKLIST_ITEMS.concat(CML_5_AND_6_ITEMS);

  function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
  }

  function hasText(val, minLen) {
    return typeof val === "string" && val.trim().length >= (minLen || 2);
  }

  /**
   * Determines whether an orbit/scenario constitutes Deep Space (>= 3 dB RF margin) vs Proximity/LEO/Lunar (6 dB).
   */
  function isDeepSpaceOrbit(orbitId, scenarioId) {
    if (["sun_earth_l2", "europa_flyby", "mars_areostationary"].includes(orbitId)) return true;
    if (["deep_space_telescope", "europa_ocean_probe"].includes(scenarioId)) return true;
    return false;
  }

  /**
   * Computes technical margins against JPL CML 4 Checklist rules (Figure 8a).
   */
  function evaluateTechnicalMargins(telemetry, cmlNotes) {
    const t = telemetry || {};
    const notes = cmlNotes || {};
    const orbitId = t.orbit && t.orbit.id ? t.orbit.id : "";
    const scenarioId = t.scenario && t.scenario.id ? t.scenario.id : "";
    const deepSpace = isDeepSpaceOrbit(orbitId, scenarioId);

    const massMarginPct = Number.isFinite(t.massMarginPct) ? t.massMarginPct : 0;
    const reqMassPct = 35;

    const totalNeedW = Math.max(1, (t.totalPowerLoadW || 0) + (t.rechargePowerNeededW || 0));
    const netPowerW = Number.isFinite(t.netDaylightMarginW) ? t.netDaylightMarginW : 0;
    const powerMarginPct = Math.round((netPowerW / totalNeedW) * 100);
    const reqPowerPct = 35;

    // Effective energy margin: eclipse depth-of-discharge headroom relative to 80% max DoD + capacity reserve
    const dod = Number.isFinite(t.batteryDodPct) ? t.batteryDodPct : 100;
    const energyMarginPct = Math.round(((100 - dod) / Math.max(1, dod)) * 50 + (80 - dod));
    const reqEnergyPct = 35;

    const linkMarginDb = Number.isFinite(t.linkMarginDb) ? t.linkMarginDb : 0;
    const reqLinkDb = deepSpace ? 3.0 : 6.0;

    const launchWindowDays = Number.parseInt(notes.launchWindowDays, 10) || 20;
    const launchWindowOk = launchWindowDays >= 20;

    // CPU & Flight S/W reserve derived from bus & avionics tier + optional user override
    const busId = t.bus && t.bus.id ? t.bus.id : "";
    const baseSwPct = busId === "flagship_octagonal" ? 130 : busId === "modular_hex" ? 110 : 75;
    const swMarginPct = Number.isFinite(Number(notes.swMarginPct)) ? Number(notes.swMarginPct) : baseSwPct;
    const reqSwPct = 100;

    const metrics = [
      {
        id: "mass",
        label: "Weight Growth Buffer (Rocket Lift)",
        actual: `${massMarginPct}%`,
        required: ">= 35%*",
        numericActual: massMarginPct,
        numericRequired: reqMassPct,
        status: massMarginPct >= reqMassPct ? "G" : massMarginPct >= 15 ? "Y" : "R",
        note: t.massOk ? `${t.wetMassKg}/${t.lvCapacityKg} kg used` : "Too heavy for selected rocket"
      },
      {
        id: "power",
        label: "Solar Power Safety Buffer",
        actual: `${powerMarginPct}% (${netPowerW >= 0 ? "+" : ""}${netPowerW}W)`,
        required: ">= 35%*",
        numericActual: powerMarginPct,
        numericRequired: reqPowerPct,
        status: powerMarginPct >= reqPowerPct ? "G" : netPowerW >= 0 ? "Y" : "R",
        note: `${t.daylightGenW || 0}W solar vs ${totalNeedW}W used+charging`
      },
      {
        id: "energy",
        label: "Battery Shadow Reserve",
        actual: `${energyMarginPct}% (${dod}% used)`,
        required: ">= 35%*",
        numericActual: energyMarginPct,
        numericRequired: reqEnergyPct,
        status: dod <= 55 ? "G" : dod <= 75 ? "Y" : "R",
        note: `${t.eclipseEnergyNeedWh || 0} Wh needed in Earth's shadow`
      },
      {
        id: "software",
        label: "Flight Computer Spare Capacity",
        actual: `${swMarginPct}%`,
        required: ">= 100%",
        numericActual: swMarginPct,
        numericRequired: reqSwPct,
        status: swMarginPct >= reqSwPct ? "G" : swMarginPct >= 50 ? "Y" : "R",
        note: `${t.bus ? t.bus.name : "Onboard"} computer headroom`
      },
      {
        id: "telecom",
        label: `Radio Signal Buffer (${deepSpace ? "Deep Space" : "Near Earth"})`,
        actual: `${linkMarginDb} dB`,
        required: `>= ${reqLinkDb} dB`,
        numericActual: linkMarginDb,
        numericRequired: reqLinkDb,
        status: linkMarginDb >= reqLinkDb ? "G" : linkMarginDb >= 3.0 ? "Y" : "R",
        note: `${t.downlinkCapGbPerDay || 0} GB/d pipe vs ${t.dataGeneratedGbPerDay || 0} GB/d needed`
      },
      {
        id: "launch_period",
        label: "Launch Window Days",
        actual: `${launchWindowDays} days`,
        required: ">= 20 days",
        numericActual: launchWindowDays,
        numericRequired: 20,
        status: launchWindowOk ? "G" : launchWindowDays >= 10 ? "Y" : "R",
        note: notes.launchWindow ? String(notes.launchWindow) : "20-day backup launch window assumed"
      }
    ];

    return {
      deepSpace,
      footnote: "*Why 35%? Early space designs always get heavier and hungrier as you build them. NASA requires >=35% spare room at Stage 4 (relaxable later only with proven test hardware).",
      metrics,
      allGreen: metrics.every((m) => m.status === "G"),
      greenCount: metrics.filter((m) => m.status === "G").length
    };
  }

  /**
   * Builds a true 5x5 Likelihood x Consequence Risk Matrix from telemetry + programmatic state.
   */
  function compute5x5RiskMatrix(telemetry, cmlNotes, options) {
    const t = telemetry || {};
    const notes = cmlNotes || {};
    const opts = options || {};
    const risks = [];

    const addRisk = (id, title, likelihood, consequence, owner, mitigation) => {
      const L = clamp(Math.round(likelihood), 1, 5);
      const C = clamp(Math.round(consequence), 1, 5);
      const score = L * C;
      const severity = score >= 15 || (L >= 4 && C >= 3) || (C === 5 && L >= 3)
        ? "HIGH"
        : score >= 6 ? "MED" : "LOW";
      risks.push({ id, title, likelihood: L, consequence: C, score, severity, owner, mitigation });
    };

    // 1. Mass & Launch Lift
    addRisk(
      "r_mass",
      "Spacecraft Too Heavy for Rocket",
      !t.massOk ? 5 : t.massMarginPct < 15 ? 4 : t.massMarginPct < 35 ? 3 : 1,
      4,
      "Spacecraft Lead",
      t.massOk ? "Keep extra weight buffer and note optional trim items." : "Pick a bigger rocket or trim heavy gear right away."
    );

    // 2. Power / Eclipse Energy
    addRisk(
      "r_power",
      "Running Out of Solar Power or Battery",
      !t.powerOk ? 5 : t.batteryDodPct > 65 ? 3 : t.netDaylightMarginW < 250 ? 2 : 1,
      4,
      "Power & Thermal",
      t.powerOk ? "Avoid running heavy cameras during dark eclipses." : "Pick bigger solar panels or a higher-capacity battery."
    );

    // 3. Thermal / Radiation / Optics
    addRisk(
      "r_rad",
      "Heat, Cold, or Space Radiation Damage",
      (!t.thermalOk || !t.radiationOk || !t.telescopeOk) ? 4 : !t.lifetimeOk ? 3 : 2,
      t.radiationOk ? 3 : 5,
      "Thermal & Shielding",
      t.radiationOk ? "Add spot shielding on flight computer and sensitive chips." : "Upgrade radiation shielding or choose a gentler orbit."
    );

    // 4. RF Link / Ground Contact
    addRisk(
      "r_comms",
      "Weak Radio Signal or Data Backlog",
      !t.commsOk ? 4 : t.linkMarginDb < 6.0 ? 3 : 1,
      3,
      "Comms & Dishes",
      t.commsOk ? "Keep high-gain dish pointing safely calibrated." : "Use a stronger radio dish, better ground stations, or fewer images/day."
    );

    // 5. Propulsion & EoM Disposal
    addRisk(
      "r_prop",
      "Fuel Shortfall or Space-Junk Disposal Risk",
      (!t.deltaVOk || !t.disposalOk) ? 5 : (t.achievedDeltaV - t.requiredDeltaV) < 150 ? 3 : 1,
      5,
      "Orbit & Safety",
      t.disposalOk ? "Lock aside final fuel needed to retire cleanly." : "Choose a safe de-orbit burn or graveyard orbit plan."
    );

    // 6. Cost & Budget Reserve
    const budgetRatio = t.budgetCapM ? (t.totalCostM / t.budgetCapM) : 1;
    addRisk(
      "r_cost",
      "Going Over Budget Cap",
      !t.budgetOk ? 5 : budgetRatio > 0.9 ? 3 : 2,
      4,
      "Project & Budget",
      t.budgetOk ? "Protect your rainy-day budget reserve for surprises." : "Simplify instruments or pick a more affordable bus/rocket."
    );

    // 7. Enabling Technology / TRL 6
    const complexCount = (t.selectedInsts ? t.selectedInsts.length : 0) + (t.thm && t.thm.id === "cryo_rad_90" ? 1 : 0);
    addRisk(
      "r_trl",
      "Unproven New Tech Delaying Launch",
      hasText(notes.trlFallback) ? 2 : (complexCount >= 4 ? 4 : 3),
      3,
      "Tech Lead",
      hasText(notes.trlFallback) ? "Watch prototype lab milestones on schedule." : "Note a proven backup option if brand-new tech falls behind."
    );

    // 8. Trade Space Skip Risk (Stage 2-4 feedback loop)
    if (!opts.hasTradeComparison) {
      addRisk(
        "r_trade",
        "Skipped Design Comparisons (No Option A/B Test)",
        3,
        3,
        "Concept Team",
        "Click SAVE OPTION A in the top bar and try one other setup so you know this design is best."
      );
    }

    // Build 5x5 lookup grid (row 5 = Likelihood 5 at top down to Likelihood 1 at bottom; col 1..5 Consequence)
    const cells = {};
    for (let l = 1; l <= 5; l++) {
      for (let c = 1; c <= 5; c++) {
        cells[`${l}x${c}`] = [];
      }
    }
    for (const r of risks) {
      cells[`${r.likelihood}x${r.consequence}`].push(r);
    }

    return {
      risks,
      cells,
      highCount: risks.filter((r) => r.severity === "HIGH").length,
      medCount: risks.filter((r) => r.severity === "MED").length,
      lowCount: risks.filter((r) => r.severity === "LOW").length
    };
  }

  /**
   * Computes Mission Complexity Index (Paper Section VII: complexity obscures real maturity).
   */
  function evaluateComplexity(telemetry, cmlNotes) {
    const t = telemetry || {};
    const notes = cmlNotes || {};
    const factors = [];
    let score = 1;

    const instCount = Array.isArray(t.selectedInsts) ? t.selectedInsts.length : 0;
    if (instCount >= 3) {
      score += 1;
      factors.push(`Many instruments crammed onboard (${instCount} sensors)`);
    }
    if (t.thm && t.thm.id === "cryo_rad_90") {
      score += 1;
      factors.push("Ultra-cold cryogenic optics (<40 K cooling)");
    }
    if (isDeepSpaceOrbit(t.orbit && t.orbit.id, t.scenario && t.scenario.id)) {
      score += 1;
      factors.push("Deep-space distance with long radio delay (L2, Mars, or Jupiter)");
    }
    if (t.orbit && Number(t.orbit.radiationEnvKrad) >= 50) {
      score += 1;
      factors.push(`Extreme space radiation belt (${t.orbit.radiationEnvKrad} krad)`);
    }
    if (t.prop && t.prop.id === "hall_ion_sep") {
      score += 1;
      factors.push("Solar electric ion thrusters (slow spiral trajectories)");
    }
    if (notes.partnerMode && /international|foreign|esa|jaxa|csa/i.test(notes.partnerMode)) {
      score += 1;
      factors.push("International partners & cross-border tech rules");
    }

    const capped = clamp(score, 1, 5);
    const tier = capped >= 4 ? "HIGH" : capped >= 3 ? "MODERATE" : "LOW";
    return {
      score: capped,
      tier,
      factors,
      advisory: tier === "HIGH"
        ? "Complex mission: expect steeper cost surprises — protect >=35% safety buffers and get a Fresh-Eyes expert review."
        : tier === "MODERATE"
          ? "Medium complexity: compare Option A vs Option B in Stage 3 before locking your design."
          : "Focused, clean mission scope: keep good weight records and a solid rainy-day budget."
    };
  }

  /**
   * Maps live Lunaspis telemetry, crew tasks, trade history, and programmatic notes into
   * automatic G/Y/R status & rationale for every CML checklist criterion.
   */
  function autoEvaluateItem(item, ctx) {
    const { t, tasks, completedIds, tradeBaselineA, notes, margins, groundSupport } = ctx;
    const sciReady = (t.scienceScore || 0) >= 65 && (t.matchedTypes || []).length >= 1;
    const sciPartial = (t.scienceScore || 0) >= 40 && (t.selectedInsts || []).length >= 1;
    const hasOptionA = Boolean(tradeBaselineA);
    const taskDone = (id) => completedIds.has(id);
    const orbitSet = Boolean(t.orbit && t.lv);
    const busSet = Boolean(t.bus && t.pwr && t.bat);
    const allSegsOk = t.segments && Object.values(t.segments).every((s) => s.ok);
    const segsCount = t.segments ? Object.values(t.segments).filter((s) => s.ok).length : 0;

    if (item.na) {
      return { autoStatus: "N/A", autoReason: "Not needed yet at this stage" };
    }

    const mById = {};
    for (const m of margins.metrics) mById[m.id] = m;

    switch (item.id) {
      // ---------- STAGE 2 ----------
      case "c2_sci_obj":
        return sciReady ? { autoStatus: "G", autoReason: `Science goal match: ${t.scienceScore}/100` }
          : sciPartial ? { autoStatus: "Y", autoReason: "Match sensors to the required science goals" }
          : { autoStatus: "R", autoReason: "Pick science cameras & sensors" };
      case "c2_sci_data":
        return (t.dataGeneratedGbPerDay || 0) > 0
          ? { autoStatus: t.commsOk ? "G" : "Y", autoReason: `${t.dataGeneratedGbPerDay} GB/day created vs ${t.downlinkCapGbPerDay} GB/day sent home` }
          : { autoStatus: "R", autoReason: "No camera/sensor data rate picked yet" };
      case "c2_mdev_params":
        return orbitSet && t.analogue
          ? { autoStatus: "G", autoReason: `Inspired by: ${t.analogue.name}` }
          : { autoStatus: "Y", autoReason: "Pick orbit, rocket & past reference mission" };
      case "c2_mdev_env":
        return taskDone("task_lss") || (t.thermalOk && t.radiationOk)
          ? { autoStatus: "G", autoReason: `Space radiation (level ${t.orbit ? t.orbit.radiationEnvKrad : 0}) & temperature checked` }
          : { autoStatus: "Y", autoReason: "Check heat & radiation shielding in Freezer & Cooling Lab [5]" };
      case "c2_sc_elem":
        return busSet ? { autoStatus: "G", autoReason: `Spacecraft body: ${t.bus ? t.bus.name : ""}` }
          : { autoStatus: "R", autoReason: "Pick spacecraft body, solar panels & battery" };
      case "c2_inst_tech":
        return (t.selectedInsts || []).length >= 1
          ? { autoStatus: t.telescopeOk ? "G" : "Y", autoReason: `${t.selectedInsts.length} camera/sensor(s) picked` }
          : { autoStatus: "R", autoReason: "Pick at least 1 science camera or sensor" };
      case "c2_gnd_ops":
        return t.gnd ? { autoStatus: "G", autoReason: `Dish network: ${t.gnd.name}` } : { autoStatus: "R", autoReason: "Pick an Earth ground dish network" };
      case "c2_risk_id":
        return Array.isArray(t.riskMatrix) && t.riskMatrix.length > 0
          ? { autoStatus: "G", autoReason: "Top engineering risks spotted" }
          : { autoStatus: "Y", autoReason: "Check risks in Safety & Risks [7]" };
      case "c2_tech_trl":
        return hasText(notes.trlFallback) || taskDone("task_wires")
          ? { autoStatus: "G", autoReason: "New tech notes & Plan-B recorded" }
          : { autoStatus: "Y", autoReason: "Note any new tech & backup in 9-Stage Notes tab" };
      case "c2_inher_src":
        return hasText(notes.heritageSource) || Boolean(t.analogue)
          ? { autoStatus: "G", autoReason: notes.heritageSource || `Past design: ${t.analogue ? t.analogue.name : "Reference"}` }
          : { autoStatus: "Y", autoReason: "Name a past mission or proven parts to copy" };
      case "c2_margin_unc":
        return Number.isFinite(t.massMarginPct) && Number.isFinite(t.netDaylightMarginW)
          ? { autoStatus: "G", autoReason: "Weight, power, battery & radio safety buffers calculated" }
          : { autoStatus: "Y", autoReason: "Calculate rough safety buffers" };
      case "c2_se_trades":
        return segsCount >= 2 ? { autoStatus: "G", autoReason: `${segsCount}/4 main mission areas passing` } : { autoStatus: "Y", autoReason: "Explore early spacecraft & orbit combinations" };
      case "c2_lv_id":
        return t.lv ? { autoStatus: t.massOk ? "G" : "Y", autoReason: `${t.lv.name} (lifts up to ${t.lvCapacityKg} kg)` } : { autoStatus: "R", autoReason: "Pick a rocket" };
      case "c2_pp_need":
        return t.disposalOk ? { autoStatus: "G", autoReason: `Safe retirement: ${t.disposal ? t.disposal.name : "Clean"}` }
          : { autoStatus: "R", autoReason: t.disposalNote || "Fix end-of-mission cleanup plan" };
      case "c2_sched_rot":
        return hasText(notes.launchWindow) || (t.estimatedLifetimeMonths || 0) >= 12
          ? { autoStatus: "G", autoReason: notes.launchWindow || `Planned mission life: ${t.estimatedLifetimeMonths} months` }
          : { autoStatus: "Y", autoReason: "Write down rough target launch timeframe" };
      case "c2_cost_range":
        return t.budgetOk ? { autoStatus: "G", autoReason: `$${t.totalCostM}M <= $${t.budgetCapM}M budget cap` }
          : { autoStatus: "Y", autoReason: `Over budget cap ($${t.totalCostM}M vs $${t.budgetCapM}M)` };
      case "c2_nepa_screen":
        return taskDone("task_landing") || hasText(notes.nepaSummary)
          ? { autoStatus: "G", autoReason: notes.nepaSummary || "Launch safety & environmental impact checked" }
          : { autoStatus: "Y", autoReason: "Check launch safety & cleanup in Safety & Risks [7]" };

      // ---------- STAGE 3 ----------
      case "c3_sci_partials":
        return (hasOptionA && sciReady) ? { autoStatus: "G", autoReason: "Option A vs. current design comparison active" }
          : sciReady ? { autoStatus: "Y", autoReason: "Click SAVE OPTION A in the top bar to compare science vs. cost" }
          : { autoStatus: "R", autoReason: "Match science sensors & save Option A to compare" };
      case "c3_sci_datarate":
        return t.commsOk ? { autoStatus: "G", autoReason: `${t.dataGeneratedGbPerDay}/${t.downlinkCapGbPerDay} GB/day fits radio pipe` }
          : { autoStatus: "Y", autoReason: "Too much daily data for current radio & dish setup" };
      case "c3_mdev_alt":
        return hasOptionA && segsCount >= 3 ? { autoStatus: "G", autoReason: "Alternative orbit/design compared against Option A" }
          : hasOptionA || taskDone("task_nav") ? { autoStatus: "Y", autoReason: "Try a second orbit/body option & compare cost and risk" }
          : { autoStatus: "R", autoReason: "No Option A comparison saved yet" };
      case "c3_mdev_hazards":
        return t.radiationOk && t.thermalOk ? { autoStatus: "G", autoReason: `Radiation vault (${t.thm.radRatingKrad} krad) & cooling look safe` }
          : { autoStatus: "R", autoReason: "Space heat or radiation beats your current protection" };
      case "c3_sc_sens":
        return hasOptionA ? { autoStatus: "G", autoReason: "Option A vs. Option B differences live in top bar" }
          : { autoStatus: "Y", autoReason: "Click SAVE OPTION A in the top tradeoff bar to benchmark" };
      case "c3_inst_sens":
        return (t.matchedTypes || []).length >= (t.scenario && t.scenario.requiredScienceTypes ? t.scenario.requiredScienceTypes.length : 1) && t.telescopeOk
          ? { autoStatus: "G", autoReason: "Sensors match wavelengths & required science goals" }
          : { autoStatus: "Y", autoReason: "Tune cameras & wavelength fit in Science [4]" };
      case "c3_gnd_trades":
        return taskDone("task_hull") || (t.commsOk && t.gnd) ? { autoStatus: "G", autoReason: `${t.gnd.name} ground dish trade checked` }
          : { autoStatus: "Y", autoReason: "Finish Comms & Ground Link [6]" };
      case "c3_risk_cmp":
        return hasOptionA && t.riskMatrix ? { autoStatus: "G", autoReason: "Risks compared across design options" }
          : { autoStatus: "Y", autoReason: "Compare risks between Option A and your current setup" };
      case "c3_tech_cmp":
        return taskDone("task_wires") || hasText(notes.trlFallback) ? { autoStatus: "G", autoReason: "Tech maturity & complexity compared" }
          : { autoStatus: "Y", autoReason: "Compare how unproven vs. proven parts affect risk" };
      case "c3_inher_eval":
        return hasText(notes.heritageSource) ? { autoStatus: "G", autoReason: `Reused design: ${notes.heritageSource}` }
          : { autoStatus: "Y", autoReason: "Note what proven hardware you'll reuse in Journey & Notes tab" };
      case "c3_mel_est":
        return t.bus && (t.selectedInsts || []).length > 0 ? { autoStatus: "G", autoReason: `Fueled: ${t.wetMassKg} kg / Empty: ${t.dryMassKg} kg totaled` }
          : { autoStatus: "R", autoReason: "Section-by-section weight list incomplete" };
      case "c3_margin_cases":
        return (t.overallScore || 0) >= 65 && segsCount >= 3 ? { autoStatus: "G", autoReason: `Mission score ${t.overallScore}/100 with ${segsCount}/4 areas green` }
          : { autoStatus: "Y", autoReason: "Get >=3 main areas green & overall score >=65" };
      case "c3_se_merits":
        return taskDone("task_wires") && segsCount >= 3 ? { autoStatus: "G", autoReason: "Whole-system tradeoffs reviewed" }
          : { autoStatus: "Y", autoReason: "Finish Power & Budget [3]" };
      case "c3_lv_fairing":
        return t.massOk && t.lv ? { autoStatus: "G", autoReason: `${t.lv.name} can lift weight & fit nose-cone` }
          : { autoStatus: "R", autoReason: "Rocket too small or heavy for selected fairing" };
      case "c3_pp_opts":
        return t.disposalOk ? { autoStatus: "G", autoReason: `${t.disposal ? t.disposal.name : "Plan"} follows cleanup rules` }
          : { autoStatus: "R", autoReason: t.disposalNote || "Pick a safe end-of-mission disposal method" };
      case "c3_vnv_unique":
        return hasText(notes.vnvSummary) || taskDone("task_landing") ? { autoStatus: "G", autoReason: notes.vnvSummary || "Key pre-flight tests noted" }
          : { autoStatus: "Y", autoReason: "Note what test rigs/simulators you'll need before launch" };
      case "c3_acq_makebuy":
        return hasText(notes.partnerMode) ? { autoStatus: "G", autoReason: `Team plan: ${notes.partnerMode}` }
          : { autoStatus: "Y", autoReason: "Write down who builds what in Journey & Notes tab" };
      case "c3_org_partner":
        return hasText(notes.partnerMode) ? { autoStatus: "G", autoReason: notes.partnerMode }
          : { autoStatus: "Y", autoReason: "List partner labs, universities, or suppliers" };
      case "c3_sched_var":
        return (t.lifetimeOk || hasText(notes.launchWindow)) ? { autoStatus: "G", autoReason: `${t.estimatedLifetimeMonths} mo lifetime vs ${t.scenario ? t.scenario.targetLifetimeMonths : 24} mo goal` }
          : { autoStatus: "Y", autoReason: "Check how mission length affects science & cost" };
      case "c3_wbs_l2":
        return hasText(notes.wbsSummary) ? { autoStatus: "G", autoReason: notes.wbsSummary } : { autoStatus: "Y", autoReason: "Break mission work into main buckets in Journey & Notes tab" };
      case "c3_cost_sens":
        return t.budgetOk && hasOptionA ? { autoStatus: "G", autoReason: `$${t.totalCostM}M cost compared against Option A` }
          : t.budgetOk ? { autoStatus: "Y", autoReason: "Save Option A to track how choices change total price" }
          : { autoStatus: "R", autoReason: "Over budget cap" };
      case "c3_nepa_opts":
        return taskDone("task_landing") || hasText(notes.nepaSummary) ? { autoStatus: "G", autoReason: "Cleaner / safe environmental options checked" }
          : { autoStatus: "Y", autoReason: "Confirm environmental safety check" };

      // ---------- STAGE 4 ----------
      case "c4_sci_stm":
        return hasText(notes.stmSummary, 6) && sciReady
          ? { autoStatus: "G", autoReason: `Goal-to-Sensor Map: ${notes.stmSummary}` }
          : sciReady
            ? { autoStatus: "Y", autoReason: "Write a 1-line Science Goal summary in Journey & Notes tab" }
            : { autoStatus: "R", autoReason: "Science cameras & goals not matched yet" };
      case "c4_sci_base":
        return sciReady ? { autoStatus: "G", autoReason: `Science fit score: ${t.scienceScore}/100` }
          : { autoStatus: "R", autoReason: "Full-success science goal not yet satisfied" };
      case "c4_sci_thresh":
        return (t.selectedInsts || []).length >= 1 && (t.matchedTypes || []).length >= 1
          ? { autoStatus: hasText(notes.stmSummary) ? "G" : "Y", autoReason: "Bare-minimum science sensor set identified" }
          : { autoStatus: "R", autoReason: "Pick at least 1 science sensor matching the mission goal" };
      case "c4_sci_kpp":
        return taskDone("task_science") && t.telescopeOk && sciReady
          ? { autoStatus: "G", autoReason: "Key science metrics confirmed in Science Lab [4]" }
          : sciPartial
            ? { autoStatus: "Y", autoReason: "Check camera wavelengths & complete Science Lab [4]" }
            : { autoStatus: "R", autoReason: "Key science metrics not quantified yet" };
      case "c4_sci_l1":
        return taskDone("task_science") && hasText(notes.stmSummary, 6)
          ? { autoStatus: "G", autoReason: "Top-level must-have science goals written down" }
          : taskDone("task_science") || hasText(notes.stmSummary)
            ? { autoStatus: "Y", autoReason: "Write top science goal in Notes & finish Science Lab [4]" }
            : { autoStatus: "R", autoReason: "Top-level science rules missing" };
      case "c4_sci_data_size":
        return t.commsOk && (t.downlinkCapGbPerDay || 0) >= (t.dataGeneratedGbPerDay || 0)
          ? { autoStatus: "G", autoReason: `${t.dataGeneratedGbPerDay} <= ${t.downlinkCapGbPerDay} GB/day fits nicely` }
          : { autoStatus: "R", autoReason: "Creating more data per day than dishes can download" };

      case "c4_mdev_ops":
        return taskDone("task_nav") && segsCount >= 3
          ? { autoStatus: "G", autoReason: "Orbit & flight operations timeline checked" }
          : { autoStatus: "Y", autoReason: "Finish Orbit & Rocket [2]" };
      case "c4_mdev_dv":
        return t.deltaVOk ? { autoStatus: "G", autoReason: `Fuel budget OK: ${t.achievedDeltaV} >= ${t.requiredDeltaV} m/s` }
          : { autoStatus: "R", autoReason: `Not enough fuel / Delta-V (${t.achievedDeltaV}/${t.requiredDeltaV} m/s)` };
      case "c4_mdev_ptd":
        return t.powerOk && t.commsOk ? { autoStatus: "G", autoReason: "Power, radio & data budgets all pass" }
          : (!t.powerOk && !t.commsOk) ? { autoStatus: "R", autoReason: "Both power and radio budgets are failing" }
          : { autoStatus: "Y", autoReason: t.powerOk ? "Fix radio link / data budget" : "Fix solar power / battery budget" };
      case "c4_mdev_descope":
        return hasOptionA || hasText(notes.descopeOptions)
          ? { autoStatus: "G", autoReason: notes.descopeOptions || "Backup plan saved via Option A" }
          : { autoStatus: "Y", autoReason: "Write a backup trim plan in Notes or click SAVE OPTION A" };

      case "c4_sc_arch":
        return t.bus && taskDone("task_wires")
          ? { autoStatus: "G", autoReason: `${t.bus.name} layout & 3D assembly verified` }
          : t.bus ? { autoStatus: "Y", autoReason: "Confirm spacecraft layout in Power & Budget [3]" }
          : { autoStatus: "R", autoReason: "Pick a spacecraft body" };
      case "c4_sc_descope":
        return hasText(notes.descopeOptions) || (t.selectedInsts || []).length >= 2
          ? { autoStatus: hasText(notes.descopeOptions) ? "G" : "Y", autoReason: notes.descopeOptions || "Multiple instruments give easy trim options" }
          : { autoStatus: "Y", autoReason: "List a feature you could simplify if weight/cost runs over" };

      case "c4_inst_config":
        return (t.selectedInsts || []).length >= 1 && t.telescopeOk
          ? { autoStatus: "G", autoReason: `${t.selectedInsts.map((i) => i.name).join(", ")}` }
          : { autoStatus: t.telescopeOk ? "R" : "Y", autoReason: (t.telescopeIssues || [])[0] || "Pick & mount cameras cleanly" };
      case "c4_inst_l1trace":
        return sciReady && taskDone("task_science") && hasText(notes.stmSummary)
          ? { autoStatus: "G", autoReason: "Sensors linked cleanly to main science goals" }
          : sciReady ? { autoStatus: "Y", autoReason: "Add 1-line science goal summary in Journey & Notes tab" }
          : { autoStatus: "R", autoReason: "Cameras/sensors not matched to mission goals yet" };

      case "c4_gnd_mos":
        return t.gnd && taskDone("task_hull")
          ? { autoStatus: "G", autoReason: `Dish network (${t.gnd.name}) & Mission Control checked` }
          : t.gnd ? { autoStatus: "Y", autoReason: "Confirm dish link in Comms & Ground [6]" }
          : { autoStatus: "R", autoReason: "Pick a ground dish network" };

      case "c4_risk_drivers":
        return Array.isArray(t.riskMatrix) && t.riskMatrix.length >= 5
          ? { autoStatus: "G", autoReason: `${t.riskMatrix.length} technical risk areas tracked` }
          : { autoStatus: "Y", autoReason: "Check top risks in Safety & Risks [7]" };
      case "c4_risk_5x5":
        return taskDone("task_landing") && (t.engineeringScore || 0) >= 70
          ? { autoStatus: "G", autoReason: "5x5 risk chart & backup fixes confirmed" }
          : { autoStatus: "Y", autoReason: "Inspect the Risk Map tab & finish Safety & Risks [7]" };

      case "c4_tech_char":
        return t.thm && t.prop && t.com ? { autoStatus: "G", autoReason: "Thermal, radio & thrusters selected" }
          : { autoStatus: "Y", autoReason: "Pick cooling, radio & propulsion systems" };
      case "c4_tech_base":
        return segsCount >= 3 && taskDone("task_wires") ? { autoStatus: "G", autoReason: "Chosen hardware holds up across mission rules" }
          : { autoStatus: "Y", autoReason: "Verify your chosen tech in Power & Budget [3]" };
      case "c4_tech_trl":
        return hasText(notes.trlFallback) || (t.analogue && taskDone("task_wires"))
          ? { autoStatus: hasText(notes.trlFallback) ? "G" : "Y", autoReason: notes.trlFallback || "Note why your new tech can reach flight readiness in time" }
          : { autoStatus: "Y", autoReason: "Explain new tech readiness & Plan-B in Notes tab" };
      case "c4_tech_fall":
        return hasText(notes.trlFallback)
          ? { autoStatus: "G", autoReason: `Backup tech: ${notes.trlFallback}` }
          : { autoStatus: "Y", autoReason: "Name a proven backup if any brand-new tech isn't ready" };

      case "c4_inher_items":
        return hasText(notes.heritageSource) || Boolean(t.analogue)
          ? { autoStatus: "G", autoReason: notes.heritageSource || `Proven parts from ${t.analogue.name}` }
          : { autoStatus: "Y", autoReason: "Name which proven spacecraft hardware you'll reuse" };
      case "c4_mel_assy":
        return t.bus && t.pwr && t.bat && t.thm && t.com && t.prop && (t.selectedInsts || []).length >= 1 && taskDone("task_wires")
          ? { autoStatus: "G", autoReason: `Parts list totaled: ${t.dryMassKg} kg empty / ${t.wetMassKg} kg fueled` }
          : (t.bus && t.pwr)
            ? { autoStatus: "Y", autoReason: "Confirm full Parts & Weight List in Power & Budget [3]" }
            : { autoStatus: "R", autoReason: "Spacecraft parts list is still missing pieces" };

      case "c4_mgn_policy":
        return taskDone("task_wires") || margins.greenCount >= 4
          ? { autoStatus: "G", autoReason: `${margins.greenCount}/6 safety buffers are GREEN` }
          : { autoStatus: "Y", autoReason: "Check safety buffers above & complete Power & Budget [3]" };
      case "c4_mgn_drymass":
        return { autoStatus: mById.mass.status, autoReason: `${mById.mass.actual} (needs ${mById.mass.required})` };
      case "c4_mgn_power":
        return { autoStatus: mById.power.status, autoReason: `${mById.power.actual} (needs ${mById.power.required})` };
      case "c4_mgn_energy":
        return { autoStatus: mById.energy.status, autoReason: `${mById.energy.actual} (needs ${mById.energy.required})` };
      case "c4_mgn_sw":
        return { autoStatus: mById.software.status, autoReason: `${mById.software.actual} (needs ${mById.software.required})` };
      case "c4_mgn_rf":
        return { autoStatus: mById.telecom.status, autoReason: `${mById.telecom.actual} (needs ${mById.telecom.required})` };
      case "c4_mgn_launchwin":
        return { autoStatus: mById.launch_period.status, autoReason: `${mById.launch_period.actual} (needs ${mById.launch_period.required})` };
      case "c4_mgn_sched":
        return hasText(notes.scheduleMarginNote) || (t.overallScore || 0) >= 75
          ? { autoStatus: hasText(notes.scheduleMarginNote) ? "G" : "Y", autoReason: notes.scheduleMarginNote || "Confirm spare months built into timeline for surprises" }
          : { autoStatus: "Y", autoReason: "Add extra schedule buffer months in Journey & Notes tab" };
      case "c4_mgn_other":
        return t.thermalOk && t.radiationOk
          ? { autoStatus: "G", autoReason: `Cooling & ${t.thm.radRatingKrad} krad radiation shield have safe room` }
          : { autoStatus: "R", autoReason: "Spacecraft gets too hot/cold or lacks radiation shielding" };

      case "c4_se_trades":
        return hasOptionA && allSegsOk
          ? { autoStatus: "G", autoReason: "Option A/B tested & all 4 mission areas passing" }
          : hasOptionA || segsCount >= 3
            ? { autoStatus: "Y", autoReason: "Save Option A & get all 4 main mission segments green" }
            : { autoStatus: "R", autoReason: "Big-picture design comparisons not done yet" };
      case "c4_lv_backup":
        return t.lv && t.massOk && hasText(notes.backupLv)
          ? { autoStatus: "G", autoReason: `Primary ${t.lv.name}; Backup: ${notes.backupLv}` }
          : t.lv && t.massOk
            ? { autoStatus: "Y", autoReason: `${t.lv.name} fits — name a backup rocket in Journey & Notes tab` }
            : { autoStatus: "R", autoReason: "Selected rocket can't lift this mission cleanly" };
      case "c4_lv_nls":
        return t.lv && taskDone("task_nav") ? { autoStatus: "G", autoReason: "Standard certified rocket path confirmed" }
          : { autoStatus: "Y", autoReason: "Confirm rocket selection in Orbit & Rocket [2]" };
      case "c4_pp_approach":
        return t.disposalOk
          ? { autoStatus: "G", autoReason: `Safe retirement checked (${t.disposal.deorbitYears} yr)` }
          : { autoStatus: "R", autoReason: t.disposalNote || "Fix end-of-life disposal plan" };
      case "c4_vnv_new":
      case "c4_vnv_testbed":
      case "c4_vnv_support":
      case "c4_vnv_cdh": {
        const gs = groundSupport || {};
        const verifiedCount = (gs.systemsPowerVerified ? 1 : 0) + (gs.commsHandoverReady ? 1 : 0) + (gs.padPowerSafe ? 1 : 0) + (gs.rangeGo ? 1 : 0);
        if (hasText(notes.vnvSummary) || verifiedCount >= 2 || taskDone("task_landing")) {
          return { autoStatus: "G", autoReason: notes.vnvSummary || `Pre-launch & ground pad checks (${verifiedCount} ready)` };
        }
        return { autoStatus: "Y", autoReason: "Write how you'll test gear on Earth, or pass Launch Control checks" };
      }

      // Team, Schedule & Budget (Stage 4)
      case "c4_acq_bdm":
      case "c4_acq_rfi":
      case "c4_acq_inhouse":
        return hasText(notes.partnerMode)
          ? { autoStatus: "G", autoReason: `Team build plan: ${notes.partnerMode}` }
          : { autoStatus: "Y", autoReason: "Note who builds what (in-house vs. suppliers) in Notes tab" };
      case "c4_org_pi":
      case "c4_org_opts":
      case "c4_org_struct":
        return taskDone("task_antenna") || hasText(notes.partnerMode)
          ? { autoStatus: "G", autoReason: "Mission Lead & team roles assigned" }
          : { autoStatus: "Y", autoReason: "Finish Mission Brief [1] or note team partners" };
      case "c4_sched_gantt":
        return hasText(notes.launchWindow) && (taskDone("task_nav") || taskDone("task_antenna"))
          ? { autoStatus: "G", autoReason: `Launch target: ${notes.launchWindow}` }
          : { autoStatus: "Y", autoReason: "Add target launch dates & check Orbit [2]" };
      case "c4_wbs_l3l4":
      case "c4_wbs_scope":
        return hasText(notes.wbsSummary)
          ? { autoStatus: "G", autoReason: notes.wbsSummary }
          : { autoStatus: "Y", autoReason: "Summarize project task buckets in Journey & Notes tab" };
      case "c4_cost_l3l4":
        return t.budgetOk && taskDone("task_wires")
          ? { autoStatus: "G", autoReason: `$${t.totalCostM}M priced piece-by-piece` }
          : t.budgetOk ? { autoStatus: "Y", autoReason: "Review cost breakdown in Power & Budget [3]" }
          : { autoStatus: "R", autoReason: `Over budget ($${t.totalCostM}M vs $${t.budgetCapM}M cap)` };
      case "c4_cost_res":
        return t.budgetOk && (t.budgetRemainingM || 0) >= Math.round((t.budgetCapM || 100) * 0.1)
          ? { autoStatus: "G", autoReason: `$${t.budgetRemainingM}M rainy-day reserve kept (>=10%)` }
          : t.budgetOk ? { autoStatus: "Y", autoReason: `Slim reserve ($${t.budgetRemainingM}M left — try to keep >=10%)` }
          : { autoStatus: "R", autoReason: "No money left in reserve (over cap)" };
      case "c4_cost_sub":
        return t.budgetOk && Array.isArray(t.riskMatrix) ? { autoStatus: "G", autoReason: "Cost risks tracked across subsystems" }
          : { autoStatus: "Y", autoReason: "Review which parts might get pricey" };
      case "c4_cost_prof":
        return t.budgetOk
          ? { autoStatus: "G", autoReason: `$${t.totalCostM}M fits inside $${t.budgetCapM}M cap` }
          : { autoStatus: "R", autoReason: "Total cost exceeds mission budget cap" };
      case "c4_nepa_eval":
        return t.disposalOk && (taskDone("task_landing") || hasText(notes.nepaSummary))
          ? { autoStatus: "G", autoReason: notes.nepaSummary || "Environmental & orbital cleanup check clear" }
          : { autoStatus: "Y", autoReason: "Check environmental safety & debris rules" };

      // ---------- STAGES 5 & 6 (advanced gated progression) ----------
      default: {
        // Require stronger baseline + programmatic documentation for Stage 5/6
        const cml5Ready = allSegsOk && (t.overallScore || 0) >= 75 && hasOptionA;
        if (item.level === 5) {
          if (item.id === "c5_cost_2model") {
            return hasText(notes.costModelValidation) && t.budgetOk
              ? { autoStatus: "G", autoReason: notes.costModelValidation }
              : { autoStatus: "Y", autoReason: "Add a 2nd independent cost check in Journey & Notes tab" };
          }
          if (item.id === "c5_sci_stm") {
            return hasText(notes.stmSummary, 8) && sciReady
              ? { autoStatus: "G", autoReason: "Science Goals Map & pass/fail rules lined up" }
              : { autoStatus: "Y", autoReason: "Finish Science Goal summary & match sensors" };
          }
          if (cml5Ready && completedIds.size >= 5) {
            return { autoStatus: "G", autoReason: "Mission hardware & simulation targets satisfied" };
          }
          return { autoStatus: (t.overallScore || 0) >= 60 ? "Y" : "R", autoReason: "Needs solid Stage 4 design, Option A comparison & team plan notes" };
        }
        if (item.level === 6) {
          const srReady = cml5Ready && completedIds.size >= 7 && Boolean(ctx.assessorSignedOff);
          if (srReady && hasText(notes.wbsSummary) && hasText(notes.stmSummary)) {
            return { autoStatus: "G", autoReason: "Full integrated plan checked & Fresh-Eyes signed off!" };
          }
          return { autoStatus: cml5Ready ? "Y" : "R", autoReason: "Finish all 7 ship consoles + Fresh-Eyes Review + Science/Task notes" };
        }
        return { autoStatus: "Y", autoReason: "Waiting on engineering check" };
      }
    }
  }

  /**
   * Evaluates complete CML 1-9 state from telemetry, crew consoles, ground support, and user overrides/notes.
   */
  function evaluateCmlState(telemetry, gameplayState, customCmlState) {
    const t = telemetry || {};
    const gp = gameplayState || {};
    const state = customCmlState || {};
    const notes = state.notes && typeof state.notes === "object" ? state.notes : {};
    const overrides = state.overrides && typeof state.overrides === "object" ? state.overrides : {};
    const tasks = Array.isArray(gp.tasks) ? gp.tasks : [];
    const completedIds = new Set(tasks.filter((x) => x && x.completed).map((x) => x.id));
    const hasOptionA = Boolean(gp.tradeBaselineA);

    const margins = evaluateTechnicalMargins(t, notes);
    const risk5x5 = compute5x5RiskMatrix(t, notes, { hasTradeComparison: hasOptionA });
    const complexity = evaluateComplexity(t, notes);

    const ctx = {
      t,
      tasks,
      completedIds,
      tradeBaselineA: gp.tradeBaselineA || null,
      notes,
      margins,
      groundSupport: gp.groundSupport || {},
      assessorSignedOff: Boolean(state.assessorSignedOff)
    };

    const evaluatedItems = ALL_CHECKLIST_ITEMS.map((item) => {
      const autoRes = autoEvaluateItem(item, ctx);
      const ov = overrides[item.id];
      const validOv = !item.na && (ov === "G" || ov === "Y" || ov === "R") ? ov : null;
      const status = item.na ? "N/A" : (validOv || autoRes.autoStatus);
      return {
        id: item.id,
        level: item.level,
        rowId: item.rowId,
        category: item.category,
        text: item.text,
        critical: Boolean(item.critical),
        na: Boolean(item.na),
        consoleKey: item.consoleKey || null,
        autoStatus: autoRes.autoStatus,
        autoReason: autoRes.autoReason,
        overrideStatus: validOv,
        status
      };
    });

    const levelsSummary = {};
    for (const lvl of [2, 3, 4, 5, 6]) {
      const allLvl = evaluatedItems.filter((i) => i.level === lvl);
      const applicable = allLvl.filter((i) => !i.na);
      const naItems = allLvl.filter((i) => i.na);
      const green = applicable.filter((i) => i.status === "G");
      const yellow = applicable.filter((i) => i.status === "Y");
      const red = applicable.filter((i) => i.status === "R");
      const criticalGaps = applicable.filter((i) => i.critical && i.status !== "G");
      const percentGreen = applicable.length > 0 ? Math.round((green.length / applicable.length) * 100) : 0;
      const thresholdMet = percentGreen >= 80;
      const gateCertified = thresholdMet && criticalGaps.length === 0;

      levelsSummary[lvl] = {
        level: lvl,
        meta: CML_LEVELS.find((l) => l.level === lvl),
        items: allLvl,
        applicableCount: applicable.length,
        naCount: naItems.length,
        greenCount: green.length,
        yellowCount: yellow.length,
        redCount: red.length,
        percentGreen,
        thresholdMet,
        criticalGaps,
        gateCertified
      };
    }

    // CML 1 seed check (informal)
    const cml1Populated = CML_1_SEED_AREAS.filter((s) => hasText(notes[s.field]) || Boolean(t.scenario)).length;

    // Highest contiguous CML achieved (where each preceding checklist level >= 80% Green)
    let reachedCml = 1;
    let certifiedCml = 1;
    for (const lvl of [2, 3, 4, 5, 6]) {
      if (levelsSummary[lvl].thresholdMet) {
        reachedCml = lvl;
        if (levelsSummary[lvl].gateCertified && (lvl < 5 || Boolean(state.assessorSignedOff))) {
          certifiedCml = lvl;
        }
      } else {
        break;
      }
    }

    const targetCml = clamp(Number.parseInt(state.targetCml, 10) || 4, 2, 6);
    const activeSummary = levelsSummary[targetCml] || levelsSummary[4];
    const currentDef = CML_LEVELS.find((l) => l.level === reachedCml) || CML_LEVELS[0];

    // Stage 2-4 iterative feedback-loop diagnostic
    const feedbackAlerts = [];
    if (!hasOptionA) {
      feedbackAlerts.push({
        severity: "WARN",
        title: "Tip: Try Comparing Two Designs First (Option A vs B)",
        detail: "Before locking in a blueprint, save an 'Option A' snapshot and try tweaking your rocket, orbit, or sensors to see if there's a smarter, cheaper choice."
      });
    }
    if (margins.metrics.some((m) => m.status === "R")) {
      const failing = margins.metrics.filter((m) => m.status === "R").map((m) => m.label).join(", ");
      feedbackAlerts.push({
        severity: "ALERT",
        title: "Safety Buffer Too Tight — Adjust Your Design",
        detail: `One or more safety buffers fell into the Red (${failing}). Tweak your spacecraft, solar panels, or rocket to build back safe extra room.`
      });
    }
    if (activeSummary.thresholdMet && activeSummary.criticalGaps.length > 0) {
      feedbackAlerts.push({
        severity: "CAVEAT",
        title: "80% Reached — Wait, Must-Have Dealbreakers Remain",
        detail: `Stage ${targetCml} hit ${activeSummary.percentGreen}% Green (>=80%), but ${activeSummary.criticalGaps.length} Must-Have item(s) still need fixing before advancing.`
      });
    }

    const caveatsStatus = [
      {
        ...JPL_CML_CAVEATS[0],
        flagged: margins.metrics.some((m) => m.status !== "G"),
        liveNote: margins.allGreen
          ? "All 6 safety buffers pass NASA Stage 4 standards — solid math underneath your checklist."
          : `${6 - margins.greenCount} safety buffer(s) are still below the recommended Green target.`
      },
      {
        ...JPL_CML_CAVEATS[1],
        flagged: activeSummary.criticalGaps.length > 0,
        liveNote: activeSummary.criticalGaps.length === 0
          ? `Every Must-Have item is Green at Stage ${targetCml}.`
          : `${activeSummary.criticalGaps.length} Must-Have item(s) still unfinished (e.g., ${activeSummary.criticalGaps[0].text}).`
      },
      {
        ...JPL_CML_CAVEATS[2],
        flagged: !state.assessorSignedOff,
        liveNote: state.assessorSignedOff
          ? `Fresh-Eyes Review signed off${hasText(notes.assessorName) ? ` by ${notes.assessorName}` : ""}.`
          : "Waiting for an outside teammate or Launch Control reviewer to do a Fresh-Eyes check."
      }
    ];

    return {
      levels: CML_LEVELS,
      categories: CML_CATEGORIES,
      matrixRows: CML_MATRIX_ROWS,
      cml1SeedAreas: CML_1_SEED_AREAS,
      cml1PopulatedCount: cml1Populated,
      reachedCml,
      certifiedCml,
      targetCml,
      reachedTitle: currentDef.shortTitle,
      reachedPhase: currentDef.phase,
      activeSummary,
      levelsSummary,
      margins,
      risk5x5,
      complexity,
      feedbackAlerts,
      caveatsStatus,
      assessorSignedOff: Boolean(state.assessorSignedOff),
      notes,
      overrideCount: Object.keys(overrides).length
    };
  }

  /**
   * Builds structured JSON export payload combining telemetry, matrix gate status & checklists.
   */
  function generateCmlReportPayload(telemetry, cmlEval, projectMeta) {
    const t = telemetry || {};
    const e = cmlEval || {};
    return {
      schema: "lunaspis.jpl-cml-assessment.v1",
      reference: "Wessen, Borden, Ziemer, Kwok (JPL/Caltech 2013) - Space Mission Concept Development Using Concept Maturity Levels",
      exportedAt: new Date().toISOString(),
      mission: projectMeta || (t.scenario ? { id: t.scenario.id, name: t.scenario.name, code: t.scenario.code } : null),
      maturitySummary: {
        reachedCml: e.reachedCml,
        certifiedCml: e.certifiedCml,
        targetCml: e.targetCml,
        reachedTitle: e.reachedTitle,
        reachedPhase: e.reachedPhase,
        assessorSignedOff: e.assessorSignedOff,
        complexityTier: e.complexity ? e.complexity.tier : null,
        complexityScore: e.complexity ? e.complexity.score : null
      },
      checklistProgressByLevel: Object.fromEntries(
        Object.entries(e.levelsSummary || {}).map(([k, v]) => [
          `CML_${k}`,
          {
            applicable: v.applicableCount,
            green: v.greenCount,
            yellow: v.yellowCount,
            red: v.redCount,
            na: v.naCount,
            percentGreen: v.percentGreen,
            thresholdMet80Pct: v.thresholdMet,
            gateCertified: v.gateCertified,
            criticalGaps: v.criticalGaps.map((g) => g.text)
          }
        ])
      ),
      technicalMargins: e.margins ? e.margins.metrics : [],
      risk5x5Summary: e.risk5x5 ? e.risk5x5.risks : [],
      caveatsStatus: e.caveatsStatus || [],
      programmaticNotes: e.notes || {}
    };
  }

  /**
   * Formats a beginner-friendly, human-readable Markdown Mission Readiness Report.
   */
  function formatCmlMarkdownReport(telemetry, cmlEval) {
    const t = telemetry || {};
    const e = cmlEval || {};
    const target = e.activeSummary || { level: 4, percentGreen: 0, greenCount: 0, applicableCount: 0, criticalGaps: [], items: [] };
    const lines = [
      `# Space Mission Readiness Guide (JPL Concept Maturity Report) — ${t.scenario ? t.scenario.name : "Mission Concept"}`,
      "",
      `- **Stage Reached (80%+ Checklist Score):** Stage ${e.reachedCml} (${e.reachedTitle})`,
      `- **Verified Stage (Must-Haves + Fresh-Eyes Review):** Stage ${e.certifiedCml}`,
      `- **Active Stage Checklist:** Stage ${target.level} — **${target.percentGreen}% Done** (${target.greenCount}/${target.applicableCount} items Green)`,
      `- **Fresh-Eyes Independent Review:** ${e.assessorSignedOff ? "SIGNED OFF" : "PENDING"}`,
      `- **Mission Complexity:** ${e.complexity ? `${e.complexity.tier} (${e.complexity.score}/5)` : "N/A"}`,
      "",
      "## Safety Buffers (Technical Margin Gate)",
      "| Safety Buffer | Your Design | NASA Target | Status |",
      "|---|---|---|---|",
      ...(e.margins ? e.margins.metrics.map((m) => `| ${m.label} | ${m.actual} | ${m.required} | ${m.status} |`) : []),
      "",
      `## Unfinished Must-Have Items at Stage ${target.level}`
    ];
    if (target.criticalGaps.length === 0) {
      lines.push("- None — every Must-Have item is Green!");
    } else {
      for (const gap of target.criticalGaps) {
        lines.push(`- **[${gap.status}]** ${gap.text} _(${gap.autoReason})_`);
      }
    }
    lines.push("", "## Three Golden Rules (JPL Caveats)");
    for (const cav of e.caveatsStatus || []) {
      lines.push(`- **${cav.title}** [${cav.flagged ? "WATCH" : "CLEAR"}]: ${cav.liveNote}`);
    }
    lines.push("", `## Full Stage ${target.level} Checklist`);
    for (const item of target.items || []) {
      lines.push(`- [${item.status}] (${item.category.toUpperCase()}) ${item.text}${item.critical ? " *(Must-Have)*" : ""} — ${item.autoReason}`);
    }
    return lines.join("\n");
  }

  return {
    CML_CATEGORIES,
    CML_LEVELS,
    CML_MATRIX_ROWS,
    CML_1_SEED_AREAS,
    CML_CHECKLIST_ITEMS: ALL_CHECKLIST_ITEMS,
    JPL_CML_CAVEATS,
    isDeepSpaceOrbit,
    evaluateTechnicalMargins,
    compute5x5RiskMatrix,
    evaluateComplexity,
    evaluateCmlState,
    generateCmlReportPayload,
    formatCmlMarkdownReport
  };
});
