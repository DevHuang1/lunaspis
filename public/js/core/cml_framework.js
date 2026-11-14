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
    { id: "science", label: "Science", color: "#38bdf8" },
    { id: "technical", label: "Technical", color: "#818cf8" },
    { id: "management", label: "Management", color: "#fbbf24" },
    { id: "cost", label: "Cost", color: "#34d399" },
    { id: "other", label: "Other", color: "#f472b6" }
  ];

  /**
   * CML 1-9 Definitions, NASA Lifecycle Phases, Gates & Iterative Loop Context (Paper Section II & Fig. 1-2).
   */
  const CML_LEVELS = [
    {
      level: 1,
      name: "Cocktail Napkin",
      shortTitle: "CML 1 · Cocktail Napkin",
      phase: "Pre-Phase A: Advanced Studies",
      teamContext: "Proposal Team / JPL A-Team Seed",
      competedGate: "Concept Exploration",
      assignedGate: "Concept Exploration",
      hasFormalChecklist: false,
      feedbackLoopGroup: null,
      summary: "Articulate science questions, proposed observation type, rudimentary sketch, high-level objectives, and unique mission essence.",
      keyFocus: "Four Seed Areas: (1) Science Objective, (2) Unique Mission Characteristics, (3) Approximate Launch Timeframe, (4) Target Cost Class."
    },
    {
      level: 2,
      name: "Initial Feasibility",
      shortTitle: "CML 2 · Initial Feasibility",
      phase: "Pre-Phase A: Advanced Studies",
      teamContext: "JPL A-Team / Systems Architecture",
      competedGate: "Broad Feasibility Screen",
      assignedGate: "Pre-Study Gate",
      hasFormalChecklist: true,
      feedbackLoopGroup: "trade-loop",
      summary: "Expand cocktail-napkin concept and test science, technical, and programmatic feasibility with first-order calculations and heritage analogues.",
      keyFocus: "Quantify key performance parameters, bound space environment, identify TRL < 6 enablers, and form rough analogue cost/schedule ranges."
    },
    {
      level: 3,
      name: "Trade Space",
      shortTitle: "CML 3 · Trade Space",
      phase: "Pre-Phase A: Advanced Studies",
      teamContext: "JPL A-Team / Trade Space Exploration",
      competedGate: "Pre-AO Architecture Freeze",
      assignedGate: "Study Architecture Trade",
      hasFormalChecklist: true,
      feedbackLoopGroup: "trade-loop",
      summary: "Explore architectural trade space relating science objectives, spacecraft, mission design, and ground systems against cost and risk.",
      keyFocus: "Quantify 'science partials' (how science return varies with mass, data volume, orbit) and compare alternative architectures before locking a point design."
    },
    {
      level: 4,
      name: "Point Design",
      shortTitle: "CML 4 · Point Design",
      phase: "Pre-Phase A: Concept Development",
      teamContext: "JPL Team X / NASA GSFC MDL",
      competedGate: "Concept Gate (Draft AO Out)",
      assignedGate: "Mission Study Report / Pre-KDP-A",
      hasFormalChecklist: true,
      feedbackLoopGroup: "trade-loop",
      summary: "Select and refine a preferred point design from the trade space down to major subsystems with JPL/NASA institutional margins and reserves.",
      keyFocus: "Draft STM & L1 reqs, assembly-level MEL, >=35% dry mass/power/energy margins, 5x5 risk matrix, L3/L4 WBS & cost, and loop back to CML 2-3 if margins fail."
    },
    {
      level: 5,
      name: "Baseline Concept",
      shortTitle: "CML 5 · Baseline Concept",
      phase: "Pre-Phase A: Concept Development",
      teamContext: "Proposal Team / Pre-Project Office",
      competedGate: "Final AO -> Proposal -> BCR -> IRR",
      assignedGate: "Baseline Commitment Gate (MCR / KDP-A)",
      hasFormalChecklist: true,
      feedbackLoopGroup: null,
      summary: "Complete implementation approach covering partners, contracting mode, I&T strategy, >=2 model cost validation, and 1-month resolution Gantt schedule.",
      keyFocus: "Prove concept completeness, viability, and stability for Step 1 Proposal or Mission Concept Review (MCR)."
    },
    {
      level: 6,
      name: "Integrated Concept",
      shortTitle: "CML 6 · Integrated Concept",
      phase: "Phase A: Early Formulation",
      teamContext: "Flight Study / Step 2 CSR Team",
      competedGate: "Step 2 Submittal -> CSR -> TMC -> Site Visit",
      assignedGate: "System Requirements Review (SRR)",
      hasFormalChecklist: true,
      feedbackLoopGroup: null,
      summary: "Expand technical, management, BOE/probabilistic cost, L0-L2 science data, and V&V integration details for Concept Study Report or SRR.",
      keyFocus: "Complete major system & payload trades, qualify L/V & external interfaces, baseline PLRA & L1 reqs, and lock Step 2 / SRR commitments."
    },
    {
      level: 7,
      name: "Preliminary Implementation Baseline",
      shortTitle: "CML 7 · Prelim Implementation Baseline",
      phase: "Phase A: Concept & Tech Completion",
      teamContext: "Phase A Project Office (NPR 7120.5E)",
      competedGate: "PMSR / Down-Select / KDP-B",
      assignedGate: "Mission Definition Review (MDR) / KDP-B",
      hasFormalChecklist: false,
      feedbackLoopGroup: null,
      summary: "Establish preliminary system/subsystem designs, verified margins, prototype/testbed closures, Risk Mgmt Plan, and TRL 6 maturation path per NPR 7120.5E.",
      keyFocus: "Transition out of JPL CML checklists into formal NASA NPR 7120.5E gate products (MDR / PMSR)."
    },
    {
      level: 8,
      name: "Integrated Baseline (PDR)",
      shortTitle: "CML 8 · PDR Baseline",
      phase: "Phase B: Preliminary Design & Tech Completion",
      teamContext: "Flight Project Office (NPR 7120.5E)",
      competedGate: "Preliminary Design Review (PDR) -> KDP-C",
      assignedGate: "Preliminary Design Review (PDR) -> KDP-C",
      hasFormalChecklist: false,
      feedbackLoopGroup: null,
      summary: "Preliminary Design Review baseline: TRL >= 6 demonstrated, formal requirements flowed down, and integrated cost/schedule baseline ready for Phase C/D.",
      keyFocus: "Confirm technical baseline meets L1/L2 requirements with acceptable cost/schedule/risk confidence before Final Design."
    },
    {
      level: 9,
      name: "Final Implementation Baseline (CDR)",
      shortTitle: "CML 9 · CDR Baseline",
      phase: "Phase C: Final Design & Fabrication",
      teamContext: "Flight Project Implementation (NPR 7120.5E)",
      competedGate: "Critical Design Review (CDR)",
      assignedGate: "Critical Design Review (CDR)",
      hasFormalChecklist: false,
      feedbackLoopGroup: null,
      summary: "Critical Design Review baseline: build-to drawings, detailed ICDs, certified software/avionics architecture, and production readiness.",
      keyFocus: "Authorize full flight hardware fabrication, assembly, test, and launch campaign preparation."
    }
  ];

  /**
   * Official 3 JPL CML Caveats + Complexity Advisory (Paper Sections V-VII).
   */
  const JPL_CML_CAVEATS = [
    {
      id: "completeness_vs_quality",
      title: "1. Completeness != Quality",
      summary: "Checklists verify that an artifact exists, not its technical rigor or internal consistency. Independent engineering scrutiny is still required."
    },
    {
      id: "unweighted_attributes",
      title: "2. Checklist Attributes Are Unweighted",
      summary: "All Green/Yellow/Red items carry equal weight in the 80% score — missing a critical driver (STM, L1 reqs, MEL, KPP) can stall the concept even above 80%."
    },
    {
      id: "no_self_assessment",
      title: "3. Avoid Self-Assessment Bias",
      summary: "Study teams should not solely self-grade their maturity. Use an Independent Assessor (~30 min review with Proposal Manager & Systems Engineer)."
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
      name: "Science Objectives & System Requirements",
      cells: {
        1: "Science objectives described in one sentence",
        2: "Objectives described to levels allowing comparison with previous investigations & NASA science community documents",
        3: "Objectives linked to investigations & measurements; Science return as a function of cost, risk & programmatics quantified",
        4: "Produce draft Science Traceability Matrix (STM); Initial Level 1 reqs considered; Specify 1 Baseline & 1 Threshold investigation; KPPs listed",
        5: "STM (or equivalent) produced; Preliminary PLRA produced (assigned projects)",
        6: "Proposed Level 1 reqs documented, Level 2 & 3 driving reqs listed; Full & minimum success criteria defined; Baseline PLRA submitted @ SRR",
        7: "Update PLRA if necessary; Preliminary Level 2 & 3 reqs listed"
      }
    },
    {
      id: "sci_data_system",
      category: "science",
      name: "Science Data System",
      cells: {
        1: "—",
        2: "Identify science data drivers",
        3: "Science data rates & volume included in trade space analysis",
        4: "Science data system sizing",
        5: "Science data processing architecture, release & archive approach defined",
        6: "Science data management approach (incl. Level 0, 1, 2 data products) defined",
        7: "Same as CML 6"
      }
    },

    // TECHNICAL (13 rows)
    {
      id: "tech_mission_dev",
      category: "technical",
      name: "Mission Development",
      cells: {
        1: "One sentence description of unique mission & system characteristics",
        2: "Key mission concept parameters & performance reqs quantified; Rudimentary calculations & comparisons to mission analogues; Gross space environment characterization",
        3: "Alternative mission architectures evaluated against science objectives, cost & risk; Quantitatively bounded hazards of space environment",
        4: "Driving reqs, initial high-level scenarios, timelines & ops modes documented; Propellant load & delta-V budget determined; Power, telecom & data approach defined; Descopes & backups identified",
        5: "Concept complete, viable & stable; Mission phases documented showing how science is met; Mission traceability matrix created; Resource use matches ops modes; Mission & risk class determined",
        6: "Expand mission phases to show critical s/c & ground functions; Delta-V & maneuver strategy, comms approach & ground station needs determined",
        7: "Key driving mission scenarios, timelines & modes documented in detail"
      }
    },
    {
      id: "tech_spacecraft",
      category: "technical",
      name: "Spacecraft System Design",
      cells: {
        1: "—",
        2: "Key flight elements, design parameters & performance reqs listed; High-level comparison to similar flight systems documented",
        3: "Unique features distinguishing flight system architectures evaluated; Sensitivity studies to bound performance within trade space performed",
        4: "System architecture with mechanical configuration drawings, block diagrams & descope options compiled",
        5: "Subsystem designs enabling external evaluation & costing documented; System contingencies & margins established",
        6: "Major architectural trades complete & incorporated; All key L/V, s/c & payload I/F qualitatively defined",
        7: "System & subsystem designs and external I/F defined; Plans for closing open issues, maturing tech, long-lead items & prototyping in place"
      }
    },
    {
      id: "tech_instrument",
      category: "technical",
      name: "Instrument System Design",
      cells: {
        1: "—",
        2: "One sentence description of potential measurement technique(s); High-level comparison to similar measurement technique(s)",
        3: "Key instrument performance reqs, measurement techniques & instruments selected against science/mission objectives, cost & risk; Trade space sensitivity studies performed",
        4: "Instrument design with mechanical config drawings, block diagrams & descope options compiled (Earth Sci/Astro); Performance reqs traced to Level 1 reqs",
        5: "Instrument designs sufficient for external eval & costing; Initial accommodations noted; Maturation/long-lead/prototyping plans; Science QQCL reqs, contingencies & margins",
        6: "Major payload trades complete & incorporated; Final instrument designs & accommodations specified",
        7: "Instrument design, accommodation, open issues & external I/F defined"
      }
    },
    {
      id: "tech_ground_mos",
      category: "technical",
      name: "Ground System / Mission Operations System Design",
      cells: {
        1: "—",
        2: "Mission ops approaches defined",
        3: "Mission ops drivers & sensitivities assessed; Major flight/ground trades identified; New ground system capabilities identified",
        4: "MOS / GDS architecture based on ops scenarios described",
        5: "Major MOS responsibilities, block diagrams, facilities & science community I/Fs defined; Sized by ops complexity; Critical events data return approach documented",
        6: "MOS diagrams w/ proposed inheritance compiled; Major flight/ground trades complete; Operational roles, responsibilities & data flow elaborated",
        7: "MOS implementation w/ mission-unique items defined; Plans for upgrading facilities, software & hardware complete"
      }
    },
    {
      id: "tech_risk",
      category: "technical",
      name: "Technical Risk Assessment & Management",
      cells: {
        1: "—",
        2: "Identify risks; Identify areas of major concerns",
        3: "Compare risks across architectures; Identify mitigation strategies for key risks",
        4: "Risk drivers listed; 5x5 matrix w/ relevant risk drivers & selected mitigation/development options",
        5: "Risks & mitigations in baseline; Pre- & post-mitigation likelihood & consequence detailed; Prototyping plans for top risks; Control/release strategies for margins & reserves",
        6: "Risks reassessed; Expanded to 2nd tier subsystem/instrument risks; Initial prototyping results known; Baseline Risk Mgmt Plan @ SRR",
        7: "Update Risk Mgmt Plan if needed; Project risk mgmt process implemented; Update plans based on ongoing prototyping"
      }
    },
    {
      id: "tech_technology",
      category: "technical",
      name: "Technology",
      cells: {
        1: "—",
        2: "Identify enabling technologies / significant development required to reach TRL 6 by PDR",
        3: "Compare technologies & major developments across trade space",
        4: "Technology options characterized; Baseline options selected & justified; Rationale for TRL explained; Fallback options for all new techs identified",
        5: "Tech evaluation for each baseline option (w/ maturation approach) completed; Baseline Tech Dev Plan submitted (assigned)",
        6: "Update Tech Dev Plan if needed; Invest in key technologies",
        7: "Tech assessment, residual risks & recommended closures provided; Update plans to assure TRL 6 by PDR (CDR for tech missions)"
      }
    },
    {
      id: "tech_inheritance",
      category: "technical",
      name: "Inheritance",
      cells: {
        1: "—",
        2: "Identify source of assumed inheritance",
        3: "Early evaluation of inheritance options, benefits & risks across trade space",
        4: "Major inherited assembly items tentatively selected",
        5: "For design-driving assemblies/components, confirm availability, status & document",
        6: "Reconfirm availability & applicability of inherited items; Check for parts obsolescence & pedigree",
        7: "Same as CML 6"
      }
    },
    {
      id: "tech_mel",
      category: "technical",
      name: "Master Equipment Lists",
      cells: {
        1: "—",
        2: "—",
        3: "Mass of major elements quantified from subsystem estimates",
        4: "MEL documented to assembly level (antenna, propellant tank, star tracker, etc.)",
        5: "Expand / update MEL consistent with heritage",
        6: "MEL selectively expanded to component level for minor mods or extreme-environment components",
        7: "Same as CML 6"
      }
    },
    {
      id: "tech_margins",
      category: "technical",
      name: "Technical Margins",
      cells: {
        1: "—",
        2: "Identify high-risk areas needing significant margin; Assess uncertainty",
        3: "Use institutional margins where applicable; Analyze best/worst case scenarios",
        4: "Institutional margin policies followed (>=35% mass/power/energy, >=100% S/W, >=3/6 dB RF, 20d launch); Critical margins estimated",
        5: "Resources defined, tracked & actively managed",
        6: "Same as CML 5",
        7: "Same as CML 5"
      }
    },
    {
      id: "tech_sys_eng",
      category: "technical",
      name: "System Engineering",
      cells: {
        1: "—",
        2: "Initial generation of trade space options",
        3: "Capture relative merits of performance, cost & technical risk over broad architectures; Subsystem dependencies identified",
        4: "High-leverage science, spacecraft & ground system trades completed",
        5: "Architecture finalized; System Engineering approach documented; Additional system trades & closure approach identified",
        6: "System trades complete; Identify subsystem trades; Baseline SEIP written (assigned)",
        7: "Update SEIP if needed; Known subsystem trades complete"
      }
    },
    {
      id: "tech_launch_services",
      category: "technical",
      name: "Launch Services",
      cells: {
        1: "—",
        2: "Launch approach & performance identified",
        3: "Trades for candidate L/Vs showing performance & fairing compatibility",
        4: "Preliminary L/V & backup documented; NASA Launch Services acquisition process used",
        5: "Recommended L/V reqs & capabilities established incl. non-standard services; Launch services contacted",
        6: "Confirm L/V assumptions",
        7: "Identify mission-unique launch needs (injection covariance, contamination control, special access, etc.)"
      }
    },
    {
      id: "tech_planetary_protection",
      category: "technical",
      name: "Planetary Protection",
      cells: {
        1: "—",
        2: "Identify need for Planetary Protection reqs",
        3: "Evaluate expected PP implementation options",
        4: "Planetary Protection approach defined",
        5: "Letter from NASA PP Officer w/ provisional PP Categorization",
        6: "Same as CML 5",
        7: "Final PP Certification received"
      }
    },
    {
      id: "tech_vnv",
      category: "technical",
      name: "Verification & Validation",
      cells: {
        1: "—",
        2: "—",
        3: "Identify any major or unique V&V activities",
        4: "Approach for verifying new & enabling functions defined; System testbeds & prototype models identified; V&V support considered; # of C&DH functions identified",
        5: "V&V approach & schedule defined; Testbeds & prototype equipment list produced; # of flight system interfaces identified",
        6: "V&V schedule integrated with IMS; Update # of C&DH functions & flight interfaces",
        7: "Preliminary Project V&V Plan complete; Testbed & prototype equipment list finalized"
      }
    },

    // MANAGEMENT (5 rows)
    {
      id: "mgmt_acquisition",
      category: "management",
      name: "Acquisition & Surveillance",
      cells: {
        1: "—",
        2: "—",
        3: "Survey international/domestic capabilities; Key make-buy decisions",
        4: "Business Decision Memo (AO); Solicit RFI(s) if needed; System-level in-house vs out-of-house decision",
        5: "Partner MOU completed (AO); Long-lead procurements; Strawman subsystem sources per MEL item",
        6: "Industry contractor on contract for Step 2 (AO); Procurement reqmts package (assigned)",
        7: "Contracts or Bounded Cost-Risk negotiated; Preliminary Acquisition Plan; Update subsystem sources; Phase B Task Plan"
      }
    },
    {
      id: "mgmt_org_partnering",
      category: "management",
      name: "Project Organization, Implementation Mode & Partnering",
      cells: {
        1: "—",
        2: "—",
        3: "Identify partnership options; Implementation mode trades",
        4: "PI, Science team & key partners identified; Program Office approved PI (competed); Org options identified; Project structure created",
        5: "Project Personnel (PM, PSE, FSM, Instrument Mgr) named; Final implementation mode decision; Partner R&Rs defined; Draft org chart; Coop agreements; Phase A Formulation Agreement",
        6: "PM, PSE, FSM in place; Remaining Core Team identified; Doing-org agreements written; Key PM policies in CSR (AO)",
        7: "Org in Prelim Project Plan; Subsystem contractors identified; Core Team in place; Phase B/C/D agreements; Baseline Phase B Formulation Agreement"
      }
    },
    {
      id: "mgmt_schedules",
      category: "management",
      name: "Schedules",
      cells: {
        1: "Identify time frame",
        2: "Potential launch opportunities; Schedule & Cost Rules-of-Thumb for lifecycle duration",
        3: "Assess variations & risks to science, dev schedule & mission duration",
        4: "Top-level Gantt chart generated",
        5: "1-mo resolution Gantt w/ deliverables, reviews, tech dev, instruments, models/sims, long-lead, I&T, critical path; Funded schedule reserves; Prelim Integrated Lifecycle Network Schedule",
        6: "Update Gantt & Network Schedule (w/ critical path & funded reserve)",
        7: "Prelim Integrated Lifecycle Network Schedule w/ subsystem milestones; Schedule estimate range & confidence levels"
      }
    },
    {
      id: "mgmt_wbs",
      category: "management",
      name: "Work Breakdown Structure",
      cells: {
        1: "—",
        2: "—",
        3: "NASA Standard WBS & Dictionary to L2 (L3 for s/c & payload)",
        4: "NASA Standard WBS & Dictionary to L3 (system) & L4 (s/c & payload); Project scope assessed by major WBS elements",
        5: "Tailored WBS & dictionary approved",
        6: "Tailored WBS & dictionary approved",
        7: "Tailored WBS & dictionary approved"
      }
    },
    {
      id: "mgmt_mission_assurance",
      category: "management",
      name: "Mission Assurance Management",
      cells: {
        1: "—",
        2: "—",
        3: "—",
        4: "—",
        5: "Mission assurance approach tailored to mission risk class",
        6: "Mission assurance plan expanded (CSR / actual plan)",
        7: "Preliminary Mission Assurance Plan written"
      }
    },

    // COST (1 row)
    {
      id: "cost_estimation",
      category: "cost",
      name: "Cost Estimation and Cost Risk",
      cells: {
        1: "—",
        2: "Cost estimate range from analogous missions; Cost uncertainty quantified",
        3: "Cost sensitivities across trade space vs major drivers; Initial estimate to L2/L3; Cost uncertainty quantified, system cost risks identified",
        4: "Initial estimate to L3 (system) / L4 (s/c & payload); Recommended reserve level from project risks; Cost risks at subsystem level; Budget consistent w/ NASA funding profile",
        5: "Validate CML 4 estimate w/ >=2 model-based estimates; Validate reserves w/ 2 independent methods",
        6: "Fully supportable Phase B estimate (BOEs at lowest WBS); Grass roots + model-based for C/D/E; Reserves from risk posture + 2 independent methods; Probabilistic cost estimate",
        7: "Refine & validate approved baseline; Range of estimates & confidence levels"
      }
    },

    // OTHER (3 rows)
    {
      id: "other_launch_approval",
      category: "other",
      name: "Launch Approval",
      cells: {
        1: "—",
        2: "—",
        3: "—",
        4: "—",
        5: "Designated launch approval org notified; Launch approval reqs defined",
        6: "Launch approval reqs documented",
        7: "Baseline Launch Approval Engineering Plan"
      }
    },
    {
      id: "other_nepa",
      category: "other",
      name: "NEPA Compliance",
      cells: {
        1: "—",
        2: "Identify nuclear material or public safety issues",
        3: "Explore options (e.g., non-nuclear options)",
        4: "Evaluate Project NEPA reqs (per NPR 8580.1)",
        5: "NEPA reqs documented & NEPA org notified",
        6: "NEPA reqs reassessed",
        7: "NEPA reqs reassessed"
      }
    },
    {
      id: "other_export",
      category: "other",
      name: "Export Compliance",
      cells: {
        1: "—",
        2: "—",
        3: "—",
        4: "Contact Export Compliance Office if detailed technical discussions w/ foreign partners contemplated",
        5: "Contact Export Compliance Office if detailed technical discussions w/ foreign partners contemplated",
        6: "Export authorization in place if needed",
        7: "Export authorization finalized; Prelim Export Compliance Mgmt Plan"
      }
    }
  ];

  /**
   * CML 1 Informal 4 Seed Areas (Paper Fig. 2 — no checklist score, seed definitions only).
   */
  const CML_1_SEED_AREAS = [
    { id: "cml1_science", label: "Science Objective (1 sentence)", field: "stmSummary" },
    { id: "cml1_unique", label: "Unique Mission Characteristics", field: "heritageSource" },
    { id: "cml1_timeframe", label: "Approximate Launch Timeframe", field: "launchWindow" },
    { id: "cml1_cost_class", label: "Target Cost Class / Funding Cap", field: "costClass" }
  ];

  /**
   * Full CML Checklists for CML 2-6.
   * CML 4 contains every criterion + shaded N/A entry from Figures 8a-8c of the JPL paper.
   * CML 2, 3, 5, 6 items derive directly from the 24x7 CML Matrix rows.
   */
  const CML_CHECKLIST_ITEMS = [
    // ======================= CML 2 CHECKLIST =======================
    { id: "c2_sci_obj", level: 2, rowId: "sci_objectives", category: "science", text: "Science objectives compared against NASA community documents & prior investigations", critical: true, na: false, consoleKey: "task_science" },
    { id: "c2_sci_data", level: 2, rowId: "sci_data_system", category: "science", text: "Science data volume & contact rate drivers identified", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c2_mdev_params", level: 2, rowId: "tech_mission_dev", category: "technical", text: "Key mission concept parameters quantified vs. heritage analogue mission", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c2_mdev_env", level: 2, rowId: "tech_mission_dev", category: "technical", text: "Gross characterization of space radiation & thermal environment completed", critical: false, na: false, consoleKey: "task_lss" },
    { id: "c2_sc_elem", level: 2, rowId: "tech_spacecraft", category: "technical", text: "Key flight elements, bus parameters & performance requirements listed", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c2_inst_tech", level: 2, rowId: "tech_instrument", category: "technical", text: "Measurement technique(s) defined & compared with similar payload heritage", critical: true, na: false, consoleKey: "task_science" },
    { id: "c2_gnd_ops", level: 2, rowId: "tech_ground_mos", category: "technical", text: "Initial mission operations & ground network approach defined", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c2_risk_id", level: 2, rowId: "tech_risk", category: "technical", text: "Major risk areas and technical concerns identified", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c2_tech_trl", level: 2, rowId: "tech_technology", category: "technical", text: "Enabling technologies requiring development toward TRL 6 by PDR identified", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c2_inher_src", level: 2, rowId: "tech_inheritance", category: "technical", text: "Source of assumed flight/ground inheritance documented", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c2_margin_unc", level: 2, rowId: "tech_margins", category: "technical", text: "High-risk areas needing significant margin & uncertainty identified", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c2_se_trades", level: 2, rowId: "tech_sys_eng", category: "technical", text: "Initial architectural trade space options generated", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c2_lv_id", level: 2, rowId: "tech_launch_services", category: "technical", text: "Initial launch vehicle approach & orbital lift capacity identified", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c2_pp_need", level: 2, rowId: "tech_planetary_protection", category: "technical", text: "Need for Planetary Protection requirements screened", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c2_sched_rot", level: 2, rowId: "mgmt_schedules", category: "management", text: "Potential launch window & rule-of-thumb development duration established", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c2_cost_range", level: 2, rowId: "cost_estimation", category: "cost", text: "Cost estimate range derived from analogous mission + uncertainty bounded", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c2_nepa_screen", level: 2, rowId: "other_nepa", category: "other", text: "Nuclear material, propellant toxicity & public safety triggers identified", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c2_mel_na", level: 2, rowId: "tech_mel", category: "technical", text: "Master Equipment List (N/A at CML 2)", critical: false, na: true },
    { id: "c2_vnv_na", level: 2, rowId: "tech_vnv", category: "technical", text: "Verification & Validation (N/A at CML 2)", critical: false, na: true },
    { id: "c2_wbs_na", level: 2, rowId: "mgmt_wbs", category: "management", text: "Work Breakdown Structure (N/A at CML 2)", critical: false, na: true },

    // ======================= CML 3 CHECKLIST =======================
    { id: "c3_sci_partials", level: 3, rowId: "sci_objectives", category: "science", text: "Objectives linked to measurements; 'Science Partials' vs. cost, risk & programmatics quantified", critical: true, na: false, consoleKey: "task_science" },
    { id: "c3_sci_datarate", level: 3, rowId: "sci_data_system", category: "science", text: "Science data rates & daily volume included directly in architectural trade space", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c3_mdev_alt", level: 3, rowId: "tech_mission_dev", category: "technical", text: "Alternative mission/orbit architectures compared against science return, cost & risk", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c3_mdev_hazards", level: 3, rowId: "tech_mission_dev", category: "technical", text: "Space radiation, eclipse & orbital debris hazards quantitatively bounded", critical: false, na: false, consoleKey: "task_lss" },
    { id: "c3_sc_sens", level: 3, rowId: "tech_spacecraft", category: "technical", text: "Flight system sensitivities (mass/power/bus) evaluated across trade space (Option A vs B)", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c3_inst_sens", level: 3, rowId: "tech_instrument", category: "technical", text: "Instrument suite & wavelength sensitivities traded against cost & risk", critical: true, na: false, consoleKey: "task_science" },
    { id: "c3_gnd_trades", level: 3, rowId: "tech_ground_mos", category: "technical", text: "Major flight/ground trades & new ground network capabilities identified", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c3_risk_cmp", level: 3, rowId: "tech_risk", category: "technical", text: "Risks compared across competing architectures w/ mitigation strategies", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c3_tech_cmp", level: 3, rowId: "tech_technology", category: "technical", text: "Enabling technologies & development complexity compared across architectures", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c3_inher_eval", level: 3, rowId: "tech_inheritance", category: "technical", text: "Inheritance benefits vs. modification risks evaluated across trade space", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c3_mel_est", level: 3, rowId: "tech_mel", category: "technical", text: "Mass of major elements quantified from subsystem-level estimates", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c3_margin_cases", level: 3, rowId: "tech_margins", category: "technical", text: "Institutional margins applied & best/worst-case envelopes analyzed", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c3_se_merits", level: 3, rowId: "tech_sys_eng", category: "technical", text: "Relative merits of performance, cost & risk captured with subsystem dependencies", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c3_lv_fairing", level: 3, rowId: "tech_launch_services", category: "technical", text: "Candidate launch vehicles traded for lift performance & fairing/form-factor fit", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c3_pp_opts", level: 3, rowId: "tech_planetary_protection", category: "technical", text: "Planetary Protection & End-of-Mission disposal implementation options evaluated", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c3_vnv_unique", level: 3, rowId: "tech_vnv", category: "technical", text: "Major or unique Verification & Validation activities identified", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c3_acq_makebuy", level: 3, rowId: "mgmt_acquisition", category: "management", text: "Domestic/international capabilities surveyed; initial make-buy decisions framed", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c3_org_partner", level: 3, rowId: "mgmt_org_partnering", category: "management", text: "Partnership options & implementation mode trades identified", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c3_sched_var", level: 3, rowId: "mgmt_schedules", category: "management", text: "Schedule & mission duration variations vs. science/risk assessed", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c3_wbs_l2", level: 3, rowId: "mgmt_wbs", category: "management", text: "NASA Standard WBS & Dictionary drafted to L2 (L3 for spacecraft & payload)", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c3_cost_sens", level: 3, rowId: "cost_estimation", category: "cost", text: "Cost sensitivities across trade space to L2/L3 + system cost risks quantified", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c3_nepa_opts", level: 3, rowId: "other_nepa", category: "other", text: "Non-nuclear / lower-environmental-impact options explored per NEPA", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c3_ma_na", level: 3, rowId: "mgmt_mission_assurance", category: "management", text: "Mission Assurance Management (N/A at CML 3)", critical: false, na: true },
    { id: "c3_la_na", level: 3, rowId: "other_launch_approval", category: "other", text: "Launch Approval (N/A at CML 3)", critical: false, na: true },

    // ======================= CML 4 CHECKLIST (EXACT PAPER FIGURES 8a-8c) =======================
    // Science (6 active)
    { id: "c4_sci_stm", level: 4, rowId: "sci_objectives", category: "science", text: "Produce draft Science Traceability Matrix (STM)", critical: true, na: false, consoleKey: "task_science" },
    { id: "c4_sci_base", level: 4, rowId: "sci_objectives", category: "science", text: "Specify 1 Baseline Science Investigation", critical: true, na: false, consoleKey: "task_science" },
    { id: "c4_sci_thresh", level: 4, rowId: "sci_objectives", category: "science", text: "Specify 1 Threshold Science Investigation (minimum mission floor)", critical: true, na: false, consoleKey: "task_science" },
    { id: "c4_sci_kpp", level: 4, rowId: "sci_objectives", category: "science", text: "Key Performance Parameters (KPPs) listed", critical: true, na: false, consoleKey: "task_science" },
    { id: "c4_sci_l1", level: 4, rowId: "sci_objectives", category: "science", text: "Initial Level 1 requirements considered", critical: true, na: false, consoleKey: "task_science" },
    { id: "c4_sci_data_size", level: 4, rowId: "sci_data_system", category: "science", text: "Science data system sizing (GB/day generation vs. downlink)", critical: false, na: false, consoleKey: "task_hull" },

    // Technical — Mission Development (4)
    { id: "c4_mdev_ops", level: 4, rowId: "tech_mission_dev", category: "technical", text: "Driving requirements, initial high-level scenarios, timelines & ops modes documented", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c4_mdev_dv", level: 4, rowId: "tech_mission_dev", category: "technical", text: "Propellant load & Delta-V budget determined", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c4_mdev_ptd", level: 4, rowId: "tech_mission_dev", category: "technical", text: "Power, telecom & data processing approach defined", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_mdev_descope", level: 4, rowId: "tech_mission_dev", category: "technical", text: "Mission-level descopes & backup options identified as needed", critical: false, na: false, consoleKey: "task_nav" },

    // Technical — Spacecraft System Design (2)
    { id: "c4_sc_arch", level: 4, rowId: "tech_spacecraft", category: "technical", text: "System architecture w/ mechanical config drawings & block diagrams compiled", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_sc_descope", level: 4, rowId: "tech_spacecraft", category: "technical", text: "System-level descope options identified", critical: false, na: false, consoleKey: "task_wires" },

    // Technical — Instrument System Design (2)
    { id: "c4_inst_config", level: 4, rowId: "tech_instrument", category: "technical", text: "Instrument design w/ config diagrams & descope options compiled (Earth Sci/Astro)", critical: false, na: false, consoleKey: "task_science" },
    { id: "c4_inst_l1trace", level: 4, rowId: "tech_instrument", category: "technical", text: "Instrument performance requirements traced to Level 1 requirements", critical: true, na: false, consoleKey: "task_science" },

    // Technical — Ground System / MOS (1)
    { id: "c4_gnd_mos", level: 4, rowId: "tech_ground_mos", category: "technical", text: "MOS / GDS architecture based on operational scenarios described", critical: false, na: false, consoleKey: "task_hull" },

    // Technical — Risk (2)
    { id: "c4_risk_drivers", level: 4, rowId: "tech_risk", category: "technical", text: "Technical risk drivers listed", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c4_risk_5x5", level: 4, rowId: "tech_risk", category: "technical", text: "5x5 risk matrix w/ relevant risk drivers & selected mitigation/dev options", critical: true, na: false, consoleKey: "task_landing" },

    // Technical — Technology (4)
    { id: "c4_tech_char", level: 4, rowId: "tech_technology", category: "technical", text: "Technology options characterized", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_tech_base", level: 4, rowId: "tech_technology", category: "technical", text: "Baseline technology options selected & justified", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_tech_trl", level: 4, rowId: "tech_technology", category: "technical", text: "Rationale for Technology Readiness Level (TRL) explained", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_tech_fall", level: 4, rowId: "tech_technology", category: "technical", text: "Fallback options for all new technologies identified", critical: false, na: false, consoleKey: "task_landing" },

    // Technical — Inheritance & MEL (2)
    { id: "c4_inher_items", level: 4, rowId: "tech_inheritance", category: "technical", text: "Major inherited assembly items tentatively selected", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_mel_assy", level: 4, rowId: "tech_mel", category: "technical", text: "MEL documented to assembly level (antenna, propellant tank, star tracker, etc.)", critical: true, na: false, consoleKey: "task_wires" },

    // Technical — Technical Margins (9 active + 3 shaded N/A per Figure 8a)
    { id: "c4_mgn_policy", level: 4, rowId: "tech_margins", category: "technical", text: "Institutional margin policies followed", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_mgn_drymass", level: 4, rowId: "tech_margins", category: "technical", text: "Spacecraft Dry Mass / Lift Capacity margin >= 35%* (or PMSR waiver)", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_mgn_prop_na", level: 4, rowId: "tech_margins", category: "technical", text: "Propellants margin (N/A at CML 4 checklist)", critical: false, na: true },
    { id: "c4_mgn_power", level: 4, rowId: "tech_margins", category: "technical", text: "Power margin >= 35%*", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_mgn_energy", level: 4, rowId: "tech_margins", category: "technical", text: "Energy storage margin >= 35%*", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_mgn_storage_na", level: 4, rowId: "tech_margins", category: "technical", text: "Data Storage margin (N/A at CML 4 checklist)", critical: false, na: true },
    { id: "c4_mgn_acs_na", level: 4, rowId: "tech_margins", category: "technical", text: "Attitude Control margin (N/A at CML 4 checklist)", critical: false, na: true },
    { id: "c4_mgn_sw", level: 4, rowId: "tech_margins", category: "technical", text: "Flight S/W (CPU timing & memory) margin >= 100%", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_mgn_rf", level: 4, rowId: "tech_margins", category: "technical", text: "Telecom link margin >= 3 dB (deep space) or >= 6 dB (proximity links)", critical: true, na: false, consoleKey: "task_hull" },
    { id: "c4_mgn_launchwin", level: 4, rowId: "tech_margins", category: "technical", text: "Launch period is >= 20 days long", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c4_mgn_sched", level: 4, rowId: "tech_margins", category: "technical", text: "Schedule margin calculated per Design Principle DP 6.1.2.2", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c4_mgn_other", level: 4, rowId: "tech_margins", category: "technical", text: "Other critical margins estimated (thermal dissipation, radiation vault)", critical: false, na: false, consoleKey: "task_lss" },

    // Technical — System Engineering, Launch Services, Planetary Protection, V&V (8)
    { id: "c4_se_trades", level: 4, rowId: "tech_sys_eng", category: "technical", text: "High-leverage science, spacecraft & ground system trades completed", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_lv_backup", level: 4, rowId: "tech_launch_services", category: "technical", text: "Preliminary Launch Vehicle & backup vehicle documented", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c4_lv_nls", level: 4, rowId: "tech_launch_services", category: "technical", text: "NASA Launch Services acquisition process used", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c4_pp_approach", level: 4, rowId: "tech_planetary_protection", category: "technical", text: "Planetary Protection & orbital debris EoM approach defined", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c4_vnv_new", level: 4, rowId: "tech_vnv", category: "technical", text: "Approach for verifying new & enabling functions defined", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_vnv_testbed", level: 4, rowId: "tech_vnv", category: "technical", text: "System testbeds & prototype models identified", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_vnv_support", level: 4, rowId: "tech_vnv", category: "technical", text: "Considered how Verification & Validation will be supported", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c4_vnv_cdh", level: 4, rowId: "tech_vnv", category: "technical", text: "Number of C&DH functions identified", critical: false, na: false, consoleKey: "task_wires" },

    // Management (9 active + 1 N/A per Figure 8c)
    { id: "c4_acq_bdm", level: 4, rowId: "mgmt_acquisition", category: "management", text: "Business Decision Memo generated (AO missions)", critical: false, na: false },
    { id: "c4_acq_rfi", level: 4, rowId: "mgmt_acquisition", category: "management", text: "Solicit RFI(s) if needed for partners/subsystems", critical: false, na: false },
    { id: "c4_acq_inhouse", level: 4, rowId: "mgmt_acquisition", category: "management", text: "System-level in-house vs. out-of-house make-buy decision documented", critical: false, na: false },
    { id: "c4_org_pi", level: 4, rowId: "mgmt_org_partnering", category: "management", text: "PI, Science team & key partners identified (Program Office approved PI if competed)", critical: false, na: false },
    { id: "c4_org_opts", level: 4, rowId: "mgmt_org_partnering", category: "management", text: "Implementation organization options identified", critical: false, na: false },
    { id: "c4_org_struct", level: 4, rowId: "mgmt_org_partnering", category: "management", text: "Project structure created", critical: false, na: false },
    { id: "c4_sched_gantt", level: 4, rowId: "mgmt_schedules", category: "management", text: "Top-level Gantt chart generated", critical: false, na: false },
    { id: "c4_wbs_l3l4", level: 4, rowId: "mgmt_wbs", category: "management", text: "NASA Standard WBS & Dictionary to L3 (system) & L4 (s/c & payload)", critical: true, na: false },
    { id: "c4_wbs_scope", level: 4, rowId: "mgmt_wbs", category: "management", text: "Project scope assessed by major WBS elements", critical: false, na: false },
    { id: "c4_ma_na", level: 4, rowId: "mgmt_mission_assurance", category: "management", text: "Mission Assurance Management (N/A at CML 4 checklist)", critical: false, na: true },

    // Cost (4 active per Figure 8c)
    { id: "c4_cost_l3l4", level: 4, rowId: "cost_estimation", category: "cost", text: "Initial cost estimate to L3 (system) / L4 (s/c & payload)", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c4_cost_res", level: 4, rowId: "cost_estimation", category: "cost", text: "Recommended reserve level derived from project risks", critical: true, na: false, consoleKey: "task_landing" },
    { id: "c4_cost_sub", level: 4, rowId: "cost_estimation", category: "cost", text: "Cost risks identified at subsystem level", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c4_cost_prof", level: 4, rowId: "cost_estimation", category: "cost", text: "Budget consistent with NASA funding profile", critical: true, na: false, consoleKey: "task_wires" },

    // Other (2 active/conditional + 1 N/A per Figure 8c)
    { id: "c4_la_na", level: 4, rowId: "other_launch_approval", category: "other", text: "Launch Approval (N/A at CML 4 checklist)", critical: false, na: true },
    { id: "c4_nepa_eval", level: 4, rowId: "other_nepa", category: "other", text: "Project NEPA requirements evaluated (per NPR 8580.1)", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c4_export_na", level: 4, rowId: "other_export", category: "other", text: "Export Compliance Office contacted (if foreign technical discussions planned)", critical: false, na: true }
  ];

  /**
   * CML 5 (Baseline Concept) & CML 6 (Integrated Concept) concise checklists derived from the 24-row Matrix.
   */
  const CML_5_AND_6_ITEMS = [
    // CML 5 — Baseline Concept (MCR / Step 1 Proposal)
    { id: "c5_sci_stm", level: 5, rowId: "sci_objectives", category: "science", text: "Final STM & Preliminary Project Level Requirements Appendix (PLRA) produced", critical: true, na: false, consoleKey: "task_science" },
    { id: "c5_sci_arch", level: 5, rowId: "sci_data_system", category: "science", text: "Science data processing, release & archive approach defined", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c5_mdev_stable", level: 5, rowId: "tech_mission_dev", category: "technical", text: "Concept complete, viable & stable across all mission phases & risk classification", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c5_sc_ext", level: 5, rowId: "tech_spacecraft", category: "technical", text: "Subsystem designs documented for external evaluation & costing w/ contingencies", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c5_inst_qqcl", level: 5, rowId: "tech_instrument", category: "technical", text: "Instrument accommodations, QQCL data reqs & long-lead/maturation plans noted", critical: false, na: false, consoleKey: "task_science" },
    { id: "c5_gnd_crit", level: 5, rowId: "tech_ground_mos", category: "technical", text: "MOS sized by ops complexity + critical-events telemetry return approach documented", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c5_risk_prepost", level: 5, rowId: "tech_risk", category: "technical", text: "Pre/post-mitigation likelihood & consequence + margin/reserve control strategy defined", critical: true, na: false, consoleKey: "task_landing" },
    { id: "c5_tech_tdp", level: 5, rowId: "tech_technology", category: "technical", text: "Tech evaluation & maturation approach completed (Baseline TDP submitted if assigned)", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c5_inher_avail", level: 5, rowId: "tech_inheritance", category: "technical", text: "Availability & heritage status confirmed for all design-driving assemblies", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c5_mel_upd", level: 5, rowId: "tech_mel", category: "technical", text: "MEL expanded & reconciled against assumed heritage", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c5_mgn_track", level: 5, rowId: "tech_margins", category: "technical", text: "Resources defined, tracked & actively managed across modes", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c5_se_final", level: 5, rowId: "tech_sys_eng", category: "technical", text: "Architecture finalized & Systems Engineering closure approach documented", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c5_lv_contact", level: 5, rowId: "tech_launch_services", category: "technical", text: "Launch services contacted & non-standard L/V requirements established", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c5_pp_letter", level: 5, rowId: "tech_planetary_protection", category: "technical", text: "Provisional Planetary Protection Categorization letter requested/obtained", critical: false, na: false, consoleKey: "task_landing" },
    { id: "c5_vnv_sched", level: 5, rowId: "tech_vnv", category: "technical", text: "V&V schedule, testbeds/prototype list & flight system interface count produced", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c5_acq_mou", level: 5, rowId: "mgmt_acquisition", category: "management", text: "Partner MOUs completed, long-lead procurements & strawman MEL vendors listed", critical: false, na: false },
    { id: "c5_org_named", level: 5, rowId: "mgmt_org_partnering", category: "management", text: "Core team named (PM, PSE, FSM, Inst Mgr) & Phase A Formulation Agreement drafted", critical: false, na: false },
    { id: "c5_sched_1mo", level: 5, rowId: "mgmt_schedules", category: "management", text: "1-month resolution Gantt w/ critical path & funded schedule reserves built", critical: true, na: false },
    { id: "c5_wbs_app", level: 5, rowId: "mgmt_wbs", category: "management", text: "Tailored WBS & dictionary approved", critical: false, na: false },
    { id: "c5_ma_class", level: 5, rowId: "mgmt_mission_assurance", category: "management", text: "Mission Assurance approach tailored to NPR 8705.4 mission risk classification", critical: false, na: false },
    { id: "c5_cost_2model", level: 5, rowId: "cost_estimation", category: "cost", text: "CML 4 cost validated w/ >=2 parametric models & reserves validated by 2 methods", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c5_other_la", level: 5, rowId: "other_launch_approval", category: "other", text: "Designated Launch Approval organization notified & requirements defined", critical: false, na: false },
    { id: "c5_other_nepa", level: 5, rowId: "other_nepa", category: "other", text: "NEPA requirements documented & NASA NEPA Coordinator notified", critical: false, na: false },

    // CML 6 — Integrated Concept (SRR / Step 2 CSR)
    { id: "c6_sci_l1", level: 6, rowId: "sci_objectives", category: "science", text: "Baseline PLRA @ SRR; Proposed L1 & driving L2/L3 reqs + full/min success criteria", critical: true, na: false, consoleKey: "task_science" },
    { id: "c6_sci_l0l2", level: 6, rowId: "sci_data_system", category: "science", text: "Science data management defined including Level 0, 1 & 2 products", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c6_mdev_crit", level: 6, rowId: "tech_mission_dev", category: "technical", text: "Critical s/c & ground functions expanded + delta-V maneuver & station plan locked", critical: true, na: false, consoleKey: "task_nav" },
    { id: "c6_sc_if", level: 6, rowId: "tech_spacecraft", category: "technical", text: "Major architectural trades closed; key L/V, s/c & payload interfaces defined", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c6_inst_final", level: 6, rowId: "tech_instrument", category: "technical", text: "Major payload trades complete; final instrument designs & accommodations specified", critical: true, na: false, consoleKey: "task_science" },
    { id: "c6_gnd_flow", level: 6, rowId: "tech_ground_mos", category: "technical", text: "MOS diagrams w/ inheritance + operational roles, responsibilities & data flow elaborated", critical: false, na: false, consoleKey: "task_hull" },
    { id: "c6_risk_tier2", level: 6, rowId: "tech_risk", category: "technical", text: "Risk list expanded to 2nd-tier subsystems w/ initial prototype results; RMP @ SRR", critical: true, na: false, consoleKey: "task_landing" },
    { id: "c6_tech_invest", level: 6, rowId: "tech_technology", category: "technical", text: "Tech Development Plan updated & key TRL-6 maturation investments funded", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c6_inher_obs", level: 6, rowId: "tech_inheritance", category: "technical", text: "Inherited parts pedigree & obsolescence screened & reconfirmed", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c6_mel_comp", level: 6, rowId: "tech_mel", category: "technical", text: "MEL selectively expanded to component level for modifications & harsh environments", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c6_mgn_active", level: 6, rowId: "tech_margins", category: "technical", text: "Margin & resource ledger actively managed across all subsystems", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c6_se_seip", level: 6, rowId: "tech_sys_eng", category: "technical", text: "System trades closed; subsystem trades & Baseline SEIP written", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c6_lv_conf", level: 6, rowId: "tech_launch_services", category: "technical", text: "Launch vehicle assumptions & fairing/env envelopes confirmed", critical: false, na: false, consoleKey: "task_nav" },
    { id: "c6_vnv_ims", level: 6, rowId: "tech_vnv", category: "technical", text: "V&V schedule integrated into IMS w/ updated C&DH functions & interfaces", critical: false, na: false, consoleKey: "task_wires" },
    { id: "c6_acq_step2", level: 6, rowId: "mgmt_acquisition", category: "management", text: "Step 2 industry contractors on contract / Procurement reqs package ready", critical: false, na: false },
    { id: "c6_org_core", level: 6, rowId: "mgmt_org_partnering", category: "management", text: "Remaining core team staffed, doing-org agreements written & PM policies documented", critical: false, na: false },
    { id: "c6_sched_ims", level: 6, rowId: "mgmt_schedules", category: "management", text: "Gantt & Integrated Network Schedule updated w/ critical path & funded reserve", critical: false, na: false },
    { id: "c6_ma_plan", level: 6, rowId: "mgmt_mission_assurance", category: "management", text: "Mission Assurance Plan expanded for CSR / SRR baseline", critical: false, na: false },
    { id: "c6_cost_boe", level: 6, rowId: "cost_estimation", category: "cost", text: "BOEs at lowest WBS, grass-roots + probabilistic S-curve cost & institutional sign-off", critical: true, na: false, consoleKey: "task_wires" },
    { id: "c6_other_export", level: 6, rowId: "other_export", category: "other", text: "Export Control / ITAR authorization in place if international partners involved", critical: false, na: false }
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
        label: "Dry Mass / LV Lift Margin",
        actual: `${massMarginPct}%`,
        required: ">= 35%*",
        numericActual: massMarginPct,
        numericRequired: reqMassPct,
        status: massMarginPct >= reqMassPct ? "G" : massMarginPct >= 15 ? "Y" : "R",
        note: t.massOk ? `${t.wetMassKg}/${t.lvCapacityKg} kg allocated` : "Over LV mass / slot cap"
      },
      {
        id: "power",
        label: "Daylight Power Margin",
        actual: `${powerMarginPct}% (${netPowerW >= 0 ? "+" : ""}${netPowerW}W)`,
        required: ">= 35%*",
        numericActual: powerMarginPct,
        numericRequired: reqPowerPct,
        status: powerMarginPct >= reqPowerPct ? "G" : netPowerW >= 0 ? "Y" : "R",
        note: `${t.daylightGenW || 0}W gen vs ${totalNeedW}W load+recharge`
      },
      {
        id: "energy",
        label: "Battery Energy Reserve",
        actual: `${energyMarginPct}% (${dod}% DoD)`,
        required: ">= 35%*",
        numericActual: energyMarginPct,
        numericRequired: reqEnergyPct,
        status: dod <= 55 ? "G" : dod <= 75 ? "Y" : "R",
        note: `${t.eclipseEnergyNeedWh || 0} Wh eclipse load`
      },
      {
        id: "software",
        label: "Flight S/W (CPU & Memory)",
        actual: `${swMarginPct}%`,
        required: ">= 100%",
        numericActual: swMarginPct,
        numericRequired: reqSwPct,
        status: swMarginPct >= reqSwPct ? "G" : swMarginPct >= 50 ? "Y" : "R",
        note: `${t.bus ? t.bus.name : "Avionics"} C&DH reserve`
      },
      {
        id: "telecom",
        label: `Telecom Link (${deepSpace ? "Deep Space" : "Proximity"})`,
        actual: `${linkMarginDb} dB`,
        required: `>= ${reqLinkDb} dB`,
        numericActual: linkMarginDb,
        numericRequired: reqLinkDb,
        status: linkMarginDb >= reqLinkDb ? "G" : linkMarginDb >= 3.0 ? "Y" : "R",
        note: `${t.downlinkCapGbPerDay || 0}/${t.dataGeneratedGbPerDay || 0} GB/day`
      },
      {
        id: "launch_period",
        label: "Launch Period Window",
        actual: `${launchWindowDays} days`,
        required: ">= 20 days",
        numericActual: launchWindowDays,
        numericRequired: 20,
        status: launchWindowOk ? "G" : launchWindowDays >= 10 ? "Y" : "R",
        note: notes.launchWindow ? String(notes.launchWindow) : "20-day baseline window assumed"
      }
    ];

    return {
      deepSpace,
      footnote: "*JPL CML 4 Note: Margins may relax toward PMSR levels only with formal subsystem rationale & test heritage.",
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
      "Launch Mass / Fairing Margin",
      !t.massOk ? 5 : t.massMarginPct < 15 ? 4 : t.massMarginPct < 35 ? 3 : 1,
      4,
      "Systems Eng",
      t.massOk ? "Maintain dry mass reserve; identify descope mass items." : "Upgrade LV or strip non-critical mass immediately."
    );

    // 2. Power / Eclipse Energy
    addRisk(
      "r_power",
      "Solar Margin / Eclipse DoD",
      !t.powerOk ? 5 : t.batteryDodPct > 65 ? 3 : t.netDaylightMarginW < 250 ? 2 : 1,
      4,
      "Power / Thermal",
      t.powerOk ? "Gate high-power payload duty cycles in eclipse." : "Increase array generation or battery Wh capacity."
    );

    // 3. Thermal / Radiation / Optics
    addRisk(
      "r_rad",
      "Thermal / Radiation / Cryo Optics",
      (!t.thermalOk || !t.radiationOk || !t.telescopeOk) ? 4 : !t.lifetimeOk ? 3 : 2,
      t.radiationOk ? 3 : 5,
      "ECLSS / Radiation",
      t.radiationOk ? "Verify spot shielding on C&DH & focal plane." : "Increase vault rating or relocate from harsh belt."
    );

    // 4. RF Link / Ground Contact
    addRisk(
      "r_comms",
      "RF Link & Data Backlog",
      !t.commsOk ? 4 : t.linkMarginDb < 6.0 ? 3 : 1,
      3,
      "Comms & Ground",
      t.commsOk ? "Maintain Ka/X-band HGA pointing margin." : "Upgrade antenna EIRP, DSN tier, or compress science duty cycle."
    );

    // 5. Propulsion & EoM Disposal
    addRisk(
      "r_prop",
      "Delta-V & EoM Disposal Compliance",
      (!t.deltaVOk || !t.disposalOk) ? 5 : (t.achievedDeltaV - t.requiredDeltaV) < 150 ? 3 : 1,
      5,
      "Navigation / FDIR",
      t.disposalOk ? "Reserve protected post-mission disposal propellant." : "Select compliant deorbit or graveyard burn option."
    );

    // 6. Cost & Budget Reserve
    const budgetRatio = t.budgetCapM ? (t.totalCostM / t.budgetCapM) : 1;
    addRisk(
      "r_cost",
      "Cost Reserve & Funding Profile",
      !t.budgetOk ? 5 : budgetRatio > 0.9 ? 3 : 2,
      4,
      "PM / Cost Lead",
      t.budgetOk ? "Maintain parametric cost reserve per WBS L3/L4." : "Re-scope payload or shift bus/launcher cost class."
    );

    // 7. Enabling Technology / TRL 6
    const complexCount = (t.selectedInsts ? t.selectedInsts.length : 0) + (t.thm && t.thm.id === "cryo_rad_90" ? 1 : 0);
    addRisk(
      "r_trl",
      "Tech Maturation (TRL < 6 by PDR)",
      hasText(notes.trlFallback) ? 2 : (complexCount >= 4 ? 4 : 3),
      3,
      "Chief Technologist",
      hasText(notes.trlFallback) ? "Track prototyping gates in Technology Dev Plan." : "Document TRL rationale & non-developmental fallback."
    );

    // 8. Trade Space Skip Risk (CML 2-4 feedback loop)
    if (!opts.hasTradeComparison) {
      addRisk(
        "r_trade",
        "Sub-Optimal Point Design (No Option A/B Trade)",
        3,
        3,
        "A-Team / Team X",
        "Save Option A & evaluate science-vs-cost partials before freezing baseline."
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
      factors.push(`Multi-instrument accommodation (${instCount} payloads)`);
    }
    if (t.thm && t.thm.id === "cryo_rad_90") {
      score += 1;
      factors.push("Active cryogenic thermal control (<40 K optics)");
    }
    if (isDeepSpaceOrbit(t.orbit && t.orbit.id, t.scenario && t.scenario.id)) {
      score += 1;
      factors.push("Deep-space / high-latency ops (L2, Mars, or Jovian)");
    }
    if (t.orbit && Number(t.orbit.radiationEnvKrad) >= 50) {
      score += 1;
      factors.push(`Severe ionizing radiation (${t.orbit.radiationEnvKrad} krad)`);
    }
    if (t.prop && t.prop.id === "hall_ion_sep") {
      score += 1;
      factors.push("Solar Electric Propulsion (SEP) trajectory coupling");
    }
    if (notes.partnerMode && /international|foreign|esa|jaxa|csa/i.test(notes.partnerMode)) {
      score += 1;
      factors.push("International partnering & Export Control interfaces");
    }

    const capped = clamp(score, 1, 5);
    const tier = capped >= 4 ? "HIGH" : capped >= 3 ? "MODERATE" : "LOW";
    return {
      score: capped,
      tier,
      factors,
      advisory: tier === "HIGH"
        ? "High technical/programmatic complexity: expect steeper cost growth risk; enforce strict >=35% margins & Independent Assessor review."
        : tier === "MODERATE"
          ? "Moderate complexity: validate subsystem dependencies across CML 3->4 trades."
          : "Focused complexity profile: maintain disciplined MEL & reserve hygiene."
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
      return { autoStatus: "N/A", autoReason: "Shaded N/A in JPL CML Checklist at this maturity level" };
    }

    const mById = {};
    for (const m of margins.metrics) mById[m.id] = m;

    switch (item.id) {
      // ---------- CML 2 ----------
      case "c2_sci_obj":
        return sciReady ? { autoStatus: "G", autoReason: `Science alignment ${t.scienceScore}/100` }
          : sciPartial ? { autoStatus: "Y", autoReason: "Match instruments to required science classes" }
          : { autoStatus: "R", autoReason: "Select science instruments" };
      case "c2_sci_data":
        return (t.dataGeneratedGbPerDay || 0) > 0
          ? { autoStatus: t.commsOk ? "G" : "Y", autoReason: `${t.dataGeneratedGbPerDay} GB/day vs ${t.downlinkCapGbPerDay} GB/day downlink` }
          : { autoStatus: "R", autoReason: "No payload data rate characterized" };
      case "c2_mdev_params":
        return orbitSet && t.analogue
          ? { autoStatus: "G", autoReason: `Analogue: ${t.analogue.name}` }
          : { autoStatus: "Y", autoReason: "Quantify orbit & analogue baseline" };
      case "c2_mdev_env":
        return taskDone("task_lss") || (t.thermalOk && t.radiationOk)
          ? { autoStatus: "G", autoReason: `Env ${t.orbit ? t.orbit.radiationEnvKrad : 0} krad bounded` }
          : { autoStatus: "Y", autoReason: "Review thermal/rad vault in Thermal & Rad console" };
      case "c2_sc_elem":
        return busSet ? { autoStatus: "G", autoReason: `Bus: ${t.bus ? t.bus.name : ""}` }
          : { autoStatus: "R", autoReason: "Select spacecraft bus & power" };
      case "c2_inst_tech":
        return (t.selectedInsts || []).length >= 1
          ? { autoStatus: t.telescopeOk ? "G" : "Y", autoReason: `${t.selectedInsts.length} instrument(s) mapped` }
          : { autoStatus: "R", autoReason: "Select payload measurement instruments" };
      case "c2_gnd_ops":
        return t.gnd ? { autoStatus: "G", autoReason: `Ground net: ${t.gnd.name}` } : { autoStatus: "R", autoReason: "Select ground network" };
      case "c2_risk_id":
        return Array.isArray(t.riskMatrix) && t.riskMatrix.length > 0
          ? { autoStatus: "G", autoReason: "5 technical risk domains profiled" }
          : { autoStatus: "Y", autoReason: "Run risk scan in FDIR console" };
      case "c2_tech_trl":
        return hasText(notes.trlFallback) || taskDone("task_wires")
          ? { autoStatus: "G", autoReason: "TRL enablers documented" }
          : { autoStatus: "Y", autoReason: "Document TRL enablers / fallback in CML Spine" };
      case "c2_inher_src":
        return hasText(notes.heritageSource) || Boolean(t.analogue)
          ? { autoStatus: "G", autoReason: notes.heritageSource || `Heritage: ${t.analogue ? t.analogue.name : "Analogue"}` }
          : { autoStatus: "Y", autoReason: "Specify inheritance source" };
      case "c2_margin_unc":
        return Number.isFinite(t.massMarginPct) && Number.isFinite(t.netDaylightMarginW)
          ? { autoStatus: "G", autoReason: "Mass, power, energy & RF margins calculated" }
          : { autoStatus: "Y", autoReason: "Compute margin uncertainty" };
      case "c2_se_trades":
        return segsCount >= 2 ? { autoStatus: "G", autoReason: `${segsCount}/4 mission segments verified` } : { autoStatus: "Y", autoReason: "Generate initial trade options" };
      case "c2_lv_id":
        return t.lv ? { autoStatus: t.massOk ? "G" : "Y", autoReason: `${t.lv.name} (${t.lvCapacityKg} kg)` } : { autoStatus: "R", autoReason: "Select Launch Vehicle" };
      case "c2_pp_need":
        return t.disposalOk ? { autoStatus: "G", autoReason: `Disposal/PP path: ${t.disposal ? t.disposal.name : "Nominal"}` }
          : { autoStatus: "R", autoReason: t.disposalNote || "Non-compliant EoM / PP" };
      case "c2_sched_rot":
        return hasText(notes.launchWindow) || (t.estimatedLifetimeMonths || 0) >= 12
          ? { autoStatus: "G", autoReason: notes.launchWindow || `Target life ${t.estimatedLifetimeMonths} mo` }
          : { autoStatus: "Y", autoReason: "Enter approximate launch timeframe" };
      case "c2_cost_range":
        return t.budgetOk ? { autoStatus: "G", autoReason: `$${t.totalCostM}M <= $${t.budgetCapM}M cap` }
          : { autoStatus: "Y", autoReason: `Over cost cap ($${t.totalCostM}M/$${t.budgetCapM}M)` };
      case "c2_nepa_screen":
        return taskDone("task_landing") || hasText(notes.nepaSummary)
          ? { autoStatus: "G", autoReason: notes.nepaSummary || "NEPA & launch safety screened" }
          : { autoStatus: "Y", autoReason: "Screen NEPA/safety in FDIR or CML notes" };

      // ---------- CML 3 ----------
      case "c3_sci_partials":
        return (hasOptionA && sciReady) ? { autoStatus: "G", autoReason: "Option A vs B science-cost-risk trade active" }
          : sciReady ? { autoStatus: "Y", autoReason: "Save Option A snapshot to capture trade partials" }
          : { autoStatus: "R", autoReason: "Align payload science & run Option A/B trade" };
      case "c3_sci_datarate":
        return t.commsOk ? { autoStatus: "G", autoReason: `${t.dataGeneratedGbPerDay}/${t.downlinkCapGbPerDay} GB/d within cap` }
          : { autoStatus: "Y", autoReason: "Data volume exceeds downlink capacity" };
      case "c3_mdev_alt":
        return hasOptionA && segsCount >= 3 ? { autoStatus: "G", autoReason: "Alternative architecture compared vs Option A" }
          : hasOptionA || taskDone("task_nav") ? { autoStatus: "Y", autoReason: "Evaluate orbit/bus trades against cost & risk" }
          : { autoStatus: "R", autoReason: "No trade-space comparison saved yet" };
      case "c3_mdev_hazards":
        return t.radiationOk && t.thermalOk ? { autoStatus: "G", autoReason: `Rad vault ${t.thm.radRatingKrad} krad OK` }
          : { autoStatus: "R", autoReason: "Space environment hazard exceeds shielding/thermal spec" };
      case "c3_sc_sens":
        return hasOptionA ? { autoStatus: "G", autoReason: "Option A/B sensitivity deltas active" }
          : { autoStatus: "Y", autoReason: "Click SAVE OPTION A in live strip to benchmark" };
      case "c3_inst_sens":
        return (t.matchedTypes || []).length >= (t.scenario && t.scenario.requiredScienceTypes ? t.scenario.requiredScienceTypes.length : 1) && t.telescopeOk
          ? { autoStatus: "G", autoReason: "Payload wavelength & science types matched" }
          : { autoStatus: "Y", autoReason: "Optimize payload mix & wavelength in Science Lab" };
      case "c3_gnd_trades":
        return taskDone("task_hull") || (t.commsOk && t.gnd) ? { autoStatus: "G", autoReason: `${t.gnd.name} trades verified` }
          : { autoStatus: "Y", autoReason: "Complete Comms & Ground Link console" };
      case "c3_risk_cmp":
        return hasOptionA && t.riskMatrix ? { autoStatus: "G", autoReason: "Architecture risks compared across options" }
          : { autoStatus: "Y", autoReason: "Compare risks across Option A vs current design" };
      case "c3_tech_cmp":
        return taskDone("task_wires") || hasText(notes.trlFallback) ? { autoStatus: "G", autoReason: "Tech developments compared" }
          : { autoStatus: "Y", autoReason: "Compare enabling tech readiness" };
      case "c3_inher_eval":
        return hasText(notes.heritageSource) ? { autoStatus: "G", autoReason: `Inherited: ${notes.heritageSource}` }
          : { autoStatus: "Y", autoReason: "Record assumed heritage & risk deltas" };
      case "c3_mel_est":
        return t.bus && (t.selectedInsts || []).length > 0 ? { autoStatus: "G", autoReason: `Wet ${t.wetMassKg} kg / Dry ${t.dryMassKg} kg summed` }
          : { autoStatus: "R", autoReason: "Subsystem mass breakdown incomplete" };
      case "c3_margin_cases":
        return (t.overallScore || 0) >= 65 && segsCount >= 3 ? { autoStatus: "G", autoReason: `Overall score ${t.overallScore}/100` }
          : { autoStatus: "Y", autoReason: "Push >=3 segments GREEN & score >=65" };
      case "c3_se_merits":
        return taskDone("task_wires") && segsCount >= 3 ? { autoStatus: "G", autoReason: "Systems Eng trades reconciled" }
          : { autoStatus: "Y", autoReason: "Complete Systems Eng & Budget console" };
      case "c3_lv_fairing":
        return t.massOk && t.lv ? { autoStatus: "G", autoReason: `${t.lv.name} compatibility OK` }
          : { autoStatus: "R", autoReason: "LV mass/fairing envelope failed" };
      case "c3_pp_opts":
        return t.disposalOk ? { autoStatus: "G", autoReason: `${t.disposal ? t.disposal.name : "Plan"} compliant` }
          : { autoStatus: "R", autoReason: t.disposalNote || "Update EoM disposal / PP" };
      case "c3_vnv_unique":
        return hasText(notes.vnvSummary) || taskDone("task_landing") ? { autoStatus: "G", autoReason: notes.vnvSummary || "Unique V&V risks noted" }
          : { autoStatus: "Y", autoReason: "Identify testbeds & V&V approach" };
      case "c3_acq_makebuy":
        return hasText(notes.partnerMode) ? { autoStatus: "G", autoReason: `Acquisition mode: ${notes.partnerMode}` }
          : { autoStatus: "Y", autoReason: "Select make-buy / partner mode in CML Spine" };
      case "c3_org_partner":
        return hasText(notes.partnerMode) ? { autoStatus: "G", autoReason: notes.partnerMode }
          : { autoStatus: "Y", autoReason: "Identify partnership & implementation mode" };
      case "c3_sched_var":
        return (t.lifetimeOk || hasText(notes.launchWindow)) ? { autoStatus: "G", autoReason: `${t.estimatedLifetimeMonths} mo life vs ${t.scenario ? t.scenario.targetLifetimeMonths : 24} mo` }
          : { autoStatus: "Y", autoReason: "Evaluate mission duration & schedule sensitivity" };
      case "c3_wbs_l2":
        return hasText(notes.wbsSummary) ? { autoStatus: "G", autoReason: notes.wbsSummary } : { autoStatus: "Y", autoReason: "Generate WBS L2/L3 baseline" };
      case "c3_cost_sens":
        return t.budgetOk && hasOptionA ? { autoStatus: "G", autoReason: `$${t.totalCostM}M traded vs Option A` }
          : t.budgetOk ? { autoStatus: "Y", autoReason: "Save Option A to record cost sensitivity" }
          : { autoStatus: "R", autoReason: "Over budget cap" };
      case "c3_nepa_opts":
        return taskDone("task_landing") || hasText(notes.nepaSummary) ? { autoStatus: "G", autoReason: "Non-nuclear / safety options checked" }
          : { autoStatus: "Y", autoReason: "Confirm NEPA safety screening" };

      // ---------- CML 4 (FIGURES 8a-8c) ----------
      case "c4_sci_stm":
        return hasText(notes.stmSummary, 6) && sciReady
          ? { autoStatus: "G", autoReason: `STM drafted: ${notes.stmSummary}` }
          : sciReady
            ? { autoStatus: "Y", autoReason: "Enter Science Traceability Matrix summary in CML Spine" }
            : { autoStatus: "R", autoReason: "Science payload & STM not yet traced" };
      case "c4_sci_base":
        return sciReady ? { autoStatus: "G", autoReason: `Baseline science score ${t.scienceScore}/100` }
          : { autoStatus: "R", autoReason: "Baseline investigation requirements unmet" };
      case "c4_sci_thresh":
        return (t.selectedInsts || []).length >= 1 && (t.matchedTypes || []).length >= 1
          ? { autoStatus: hasText(notes.stmSummary) ? "G" : "Y", autoReason: "Minimum threshold payload floor identified" }
          : { autoStatus: "R", autoReason: "Define threshold minimum science instrument" };
      case "c4_sci_kpp":
        return taskDone("task_science") && t.telescopeOk && sciReady
          ? { autoStatus: "G", autoReason: "KPPs locked in Science Ops Lab" }
          : sciPartial
            ? { autoStatus: "Y", autoReason: "Verify wavelength/aperture & complete Science Lab" }
            : { autoStatus: "R", autoReason: "KPPs not yet quantified" };
      case "c4_sci_l1":
        return taskDone("task_science") && hasText(notes.stmSummary, 6)
          ? { autoStatus: "G", autoReason: "Initial Level 1 requirements captured" }
          : taskDone("task_science") || hasText(notes.stmSummary)
            ? { autoStatus: "Y", autoReason: "Document Level 1 reqs & close Science Ops console" }
            : { autoStatus: "R", autoReason: "Level 1 requirements missing" };
      case "c4_sci_data_size":
        return t.commsOk && (t.downlinkCapGbPerDay || 0) >= (t.dataGeneratedGbPerDay || 0)
          ? { autoStatus: "G", autoReason: `${t.dataGeneratedGbPerDay} <= ${t.downlinkCapGbPerDay} GB/day` }
          : { autoStatus: "R", autoReason: "Data volume exceeds downlink sizing" };

      case "c4_mdev_ops":
        return taskDone("task_nav") && segsCount >= 3
          ? { autoStatus: "G", autoReason: "Orbit/ops scenarios & timeline verified" }
          : { autoStatus: "Y", autoReason: "Complete Mission Ops & Orbit console" };
      case "c4_mdev_dv":
        return t.deltaVOk ? { autoStatus: "G", autoReason: `${t.achievedDeltaV} >= ${t.requiredDeltaV} m/s` }
          : { autoStatus: "R", autoReason: `Delta-V shortfall (${t.achievedDeltaV}/${t.requiredDeltaV} m/s)` };
      case "c4_mdev_ptd":
        return t.powerOk && t.commsOk ? { autoStatus: "G", autoReason: "Power, RF & data budget closed" }
          : (!t.powerOk && !t.commsOk) ? { autoStatus: "R", autoReason: "Power & RF budgets failing" }
          : { autoStatus: "Y", autoReason: t.powerOk ? "Close RF link/data budget" : "Close power/eclipse budget" };
      case "c4_mdev_descope":
        return hasOptionA || hasText(notes.descopeOptions)
          ? { autoStatus: "G", autoReason: notes.descopeOptions || "Backup option benchmarked via Option A" }
          : { autoStatus: "Y", autoReason: "Record descope / backup option or Option A snapshot" };

      case "c4_sc_arch":
        return t.bus && taskDone("task_wires")
          ? { autoStatus: "G", autoReason: `${t.bus.name} config & 3D assembly compiled` }
          : t.bus ? { autoStatus: "Y", autoReason: "Verify bus architecture in Systems Eng console" }
          : { autoStatus: "R", autoReason: "Select spacecraft bus" };
      case "c4_sc_descope":
        return hasText(notes.descopeOptions) || (t.selectedInsts || []).length >= 2
          ? { autoStatus: hasText(notes.descopeOptions) ? "G" : "Y", autoReason: notes.descopeOptions || "Multi-payload descope path available" }
          : { autoStatus: "Y", autoReason: "Specify system-level descope option" };

      case "c4_inst_config":
        return (t.selectedInsts || []).length >= 1 && t.telescopeOk
          ? { autoStatus: "G", autoReason: `${t.selectedInsts.map((i) => i.name).join(", ")}` }
          : { autoStatus: t.telescopeOk ? "R" : "Y", autoReason: (t.telescopeIssues || [])[0] || "Select & accommodate payload" };
      case "c4_inst_l1trace":
        return sciReady && taskDone("task_science") && hasText(notes.stmSummary)
          ? { autoStatus: "G", autoReason: "Payload reqs traced via STM & Science Ops" }
          : sciReady ? { autoStatus: "Y", autoReason: "Confirm L1 traceability in STM field" }
          : { autoStatus: "R", autoReason: "Instruments not traced to mission science" };

      case "c4_gnd_mos":
        return t.gnd && taskDone("task_hull")
          ? { autoStatus: "G", autoReason: `GDS/MOS (${t.gnd.name}) & ground link verified` }
          : t.gnd ? { autoStatus: "Y", autoReason: "Verify MOS/GDS in Comms & Ground console" }
          : { autoStatus: "R", autoReason: "No ground data system selected" };

      case "c4_risk_drivers":
        return Array.isArray(t.riskMatrix) && t.riskMatrix.length >= 5
          ? { autoStatus: "G", autoReason: `${t.riskMatrix.length} technical risk drivers tracked` }
          : { autoStatus: "Y", autoReason: "List risk drivers in FDIR console" };
      case "c4_risk_5x5":
        return taskDone("task_landing") && (t.engineeringScore || 0) >= 70
          ? { autoStatus: "G", autoReason: "5x5 matrix & mitigations baselined in FDIR" }
          : { autoStatus: "Y", autoReason: "Inspect 5x5 tab & verify FDIR Safety console" };

      case "c4_tech_char":
        return t.thm && t.prop && t.com ? { autoStatus: "G", autoReason: "Major subsystem techs characterized" }
          : { autoStatus: "Y", autoReason: "Select thermal, RF & propulsion technologies" };
      case "c4_tech_base":
        return segsCount >= 3 && taskDone("task_wires") ? { autoStatus: "G", autoReason: "Baseline selection justified against mission reqs" }
          : { autoStatus: "Y", autoReason: "Verify baseline selection rationale" };
      case "c4_tech_trl":
        return hasText(notes.trlFallback) || (t.analogue && taskDone("task_wires"))
          ? { autoStatus: hasText(notes.trlFallback) ? "G" : "Y", autoReason: notes.trlFallback || "Document explicit TRL 6 rationale" }
          : { autoStatus: "Y", autoReason: "Explain TRL rationale in CML Spine" };
      case "c4_tech_fall":
        return hasText(notes.trlFallback)
          ? { autoStatus: "G", autoReason: `Fallback: ${notes.trlFallback}` }
          : { autoStatus: "Y", autoReason: "Specify fallback for new enabling technologies" };

      case "c4_inher_items":
        return hasText(notes.heritageSource) || Boolean(t.analogue)
          ? { autoStatus: "G", autoReason: notes.heritageSource || `${t.analogue.name} inherited assemblies` }
          : { autoStatus: "Y", autoReason: "Select inherited assemblies" };
      case "c4_mel_assy":
        return t.bus && t.pwr && t.bat && t.thm && t.com && t.prop && (t.selectedInsts || []).length >= 1 && taskDone("task_wires")
          ? { autoStatus: "G", autoReason: `Complete MEL: ${t.dryMassKg} kg dry / ${t.wetMassKg} kg wet` }
          : (t.bus && t.pwr)
            ? { autoStatus: "Y", autoReason: "Verify assembly-level MEL & complete Systems Eng" }
            : { autoStatus: "R", autoReason: "MEL subsystems incomplete" };

      case "c4_mgn_policy":
        return taskDone("task_wires") || margins.greenCount >= 4
          ? { autoStatus: "G", autoReason: `${margins.greenCount}/6 institutional margins GREEN` }
          : { autoStatus: "Y", autoReason: "Review JPL CML-4 institutional margin policy" };
      case "c4_mgn_drymass":
        return { autoStatus: mById.mass.status, autoReason: `${mById.mass.actual} vs ${mById.mass.required}` };
      case "c4_mgn_power":
        return { autoStatus: mById.power.status, autoReason: `${mById.power.actual} vs ${mById.power.required}` };
      case "c4_mgn_energy":
        return { autoStatus: mById.energy.status, autoReason: `${mById.energy.actual} vs ${mById.energy.required}` };
      case "c4_mgn_sw":
        return { autoStatus: mById.software.status, autoReason: `${mById.software.actual} vs ${mById.software.required}` };
      case "c4_mgn_rf":
        return { autoStatus: mById.telecom.status, autoReason: `${mById.telecom.actual} vs ${mById.telecom.required}` };
      case "c4_mgn_launchwin":
        return { autoStatus: mById.launch_period.status, autoReason: `${mById.launch_period.actual} vs ${mById.launch_period.required}` };
      case "c4_mgn_sched":
        return hasText(notes.scheduleMarginNote) || (t.overallScore || 0) >= 75
          ? { autoStatus: hasText(notes.scheduleMarginNote) ? "G" : "Y", autoReason: notes.scheduleMarginNote || "Confirm funded schedule reserve per DP 6.1.2.2" }
          : { autoStatus: "Y", autoReason: "Record DP 6.1.2.2 schedule margin" };
      case "c4_mgn_other":
        return t.thermalOk && t.radiationOk
          ? { autoStatus: "G", autoReason: `Thermal & ${t.thm.radRatingKrad} krad vault within margin` }
          : { autoStatus: "R", autoReason: "Thermal or radiation margin violated" };

      case "c4_se_trades":
        return hasOptionA && allSegsOk
          ? { autoStatus: "G", autoReason: "Option A/B trades & all 4 segments closed" }
          : hasOptionA || segsCount >= 3
            ? { autoStatus: "Y", autoReason: "Complete Option A trade & pass all 4 segments" }
            : { autoStatus: "R", autoReason: "High-leverage architectural trades not completed" };
      case "c4_lv_backup":
        return t.lv && t.massOk && hasText(notes.backupLv)
          ? { autoStatus: "G", autoReason: `Primary ${t.lv.name}; backup ${notes.backupLv}` }
          : t.lv && t.massOk
            ? { autoStatus: "Y", autoReason: `Primary ${t.lv.name} OK — specify backup LV in CML Spine` }
            : { autoStatus: "R", autoReason: "Launch vehicle failed lift check" };
      case "c4_lv_nls":
        return t.lv && taskDone("task_nav") ? { autoStatus: "G", autoReason: "NLS acquisition path mapped" }
          : { autoStatus: "Y", autoReason: "Confirm Launch Services approach" };
      case "c4_pp_approach":
        return t.disposalOk
          ? { autoStatus: "G", autoReason: `PP/EoM verified (${t.disposal.deorbitYears} yr)` }
          : { autoStatus: "R", autoReason: t.disposalNote || "Non-compliant EoM/PP" };
      case "c4_vnv_new":
      case "c4_vnv_testbed":
      case "c4_vnv_support":
      case "c4_vnv_cdh": {
        const gs = groundSupport || {};
        const verifiedCount = (gs.systemsPowerVerified ? 1 : 0) + (gs.commsHandoverReady ? 1 : 0) + (gs.padPowerSafe ? 1 : 0) + (gs.rangeGo ? 1 : 0);
        if (hasText(notes.vnvSummary) || verifiedCount >= 2 || taskDone("task_landing")) {
          return { autoStatus: "G", autoReason: notes.vnvSummary || `LCC/V&V checks (${verifiedCount} ground verified)` };
        }
        return { autoStatus: "Y", autoReason: "Document V&V testbeds / C&DH count or complete FDIR/LCC check" };
      }

      // Management & Cost (CML 4)
      case "c4_acq_bdm":
      case "c4_acq_rfi":
      case "c4_acq_inhouse":
        return hasText(notes.partnerMode)
          ? { autoStatus: "G", autoReason: `Implementation mode: ${notes.partnerMode}` }
          : { autoStatus: "Y", autoReason: "Document partner / make-buy mode in CML Spine" };
      case "c4_org_pi":
      case "c4_org_opts":
      case "c4_org_struct":
        return taskDone("task_antenna") || hasText(notes.partnerMode)
          ? { autoStatus: "G", autoReason: "Mission Commander / PI & crew roles assigned" }
          : { autoStatus: "Y", autoReason: "Complete Command Brief or specify team structure" };
      case "c4_sched_gantt":
        return hasText(notes.launchWindow) && (taskDone("task_nav") || taskDone("task_antenna"))
          ? { autoStatus: "G", autoReason: `Launch target ${notes.launchWindow}` }
          : { autoStatus: "Y", autoReason: "Record launch window & phase milestones" };
      case "c4_wbs_l3l4":
      case "c4_wbs_scope":
        return hasText(notes.wbsSummary)
          ? { autoStatus: "G", autoReason: notes.wbsSummary }
          : { autoStatus: "Y", autoReason: "Confirm L3/L4 WBS dictionary scope in CML Spine" };
      case "c4_cost_l3l4":
        return t.budgetOk && taskDone("task_wires")
          ? { autoStatus: "G", autoReason: `$${t.totalCostM}M costed across subsystems` }
          : t.budgetOk ? { autoStatus: "Y", autoReason: "Verify cost breakdown in Systems Eng console" }
          : { autoStatus: "R", autoReason: `Exceeds cap ($${t.totalCostM}M/$${t.budgetCapM}M)` };
      case "c4_cost_res":
        return t.budgetOk && (t.budgetRemainingM || 0) >= Math.round((t.budgetCapM || 100) * 0.1)
          ? { autoStatus: "G", autoReason: `$${t.budgetRemainingM}M unallocated reserve (>=10%)` }
          : t.budgetOk ? { autoStatus: "Y", autoReason: `Tight cost reserve ($${t.budgetRemainingM}M remaining)` }
          : { autoStatus: "R", autoReason: "Negative budget reserve" };
      case "c4_cost_sub":
        return t.budgetOk && Array.isArray(t.riskMatrix) ? { autoStatus: "G", autoReason: "Subsystem cost risks identified" }
          : { autoStatus: "Y", autoReason: "Review subsystem cost drivers" };
      case "c4_cost_prof":
        return t.budgetOk
          ? { autoStatus: "G", autoReason: `${t.totalCostM}M fits $${t.budgetCapM}M NASA profile` }
          : { autoStatus: "R", autoReason: "Violates NASA funding cap" };
      case "c4_nepa_eval":
        return t.disposalOk && (taskDone("task_landing") || hasText(notes.nepaSummary))
          ? { autoStatus: "G", autoReason: notes.nepaSummary || "NPR 8580.1 NEPA screening clear" }
          : { autoStatus: "Y", autoReason: "Evaluate NPR 8580.1 NEPA compliance" };

      // ---------- CML 5 & 6 (gated progression) ----------
      default: {
        // Require stronger baseline + programmatic documentation for CML 5/6
        const cml5Ready = allSegsOk && (t.overallScore || 0) >= 75 && hasOptionA;
        if (item.level === 5) {
          if (item.id === "c5_cost_2model") {
            return hasText(notes.costModelValidation) && t.budgetOk
              ? { autoStatus: "G", autoReason: notes.costModelValidation }
              : { autoStatus: "Y", autoReason: "Enter 2nd parametric cost model & reserve check" };
          }
          if (item.id === "c5_sci_stm") {
            return hasText(notes.stmSummary, 8) && sciReady
              ? { autoStatus: "G", autoReason: "STM & Prelim PLRA aligned" }
              : { autoStatus: "Y", autoReason: "Finalize STM & PLRA alignment" };
          }
          if (cml5Ready && completedIds.size >= 5) {
            return { autoStatus: "G", autoReason: "Baseline Commitment telemetry satisfied" };
          }
          return { autoStatus: (t.overallScore || 0) >= 60 ? "Y" : "R", autoReason: "Requires CML 4 point design, Option A trade & programmatic docs" };
        }
        if (item.level === 6) {
          const srReady = cml5Ready && completedIds.size >= 7 && Boolean(ctx.assessorSignedOff);
          if (srReady && hasText(notes.wbsSummary) && hasText(notes.stmSummary)) {
            return { autoStatus: "G", autoReason: "SRR / Step 2 CSR integrated baseline verified" };
          }
          return { autoStatus: cml5Ready ? "Y" : "R", autoReason: "Requires completed crew consoles + Independent Assessor sign-off + full BOE/PLRA" };
        }
        return { autoStatus: "Y", autoReason: "Pending engineering review" };
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

    // CML 2-4 iterative feedback-loop diagnostic
    const feedbackAlerts = [];
    if (!hasOptionA) {
      feedbackAlerts.push({
        severity: "WARN",
        title: "CML 2-4 Feedback Loop Idle",
        detail: "JPL warns against jumping straight to CML 4 without CML 3 trade space comparisons. Save Option A to test science-vs-cost partials."
      });
    }
    if (margins.metrics.some((m) => m.status === "R")) {
      const failing = margins.metrics.filter((m) => m.status === "R").map((m) => m.label).join(", ");
      feedbackAlerts.push({
        severity: "ALERT",
        title: "Loop Back to CML 3 Trade Space",
        detail: `CML 4 margin failures (${failing}) indicate the point design should loop back to CML 3 architecture/bus/orbit trades.`
      });
    }
    if (activeSummary.thresholdMet && activeSummary.criticalGaps.length > 0) {
      feedbackAlerts.push({
        severity: "CAVEAT",
        title: "Unweighted Attribute Caveat Triggered",
        detail: `Target CML ${targetCml} is ${activeSummary.percentGreen}% Green (>=80%), but ${activeSummary.criticalGaps.length} critical item(s) remain unclosed.`
      });
    }

    const caveatsStatus = [
      {
        ...JPL_CML_CAVEATS[0],
        flagged: margins.metrics.some((m) => m.status !== "G"),
        liveNote: margins.allGreen
          ? "Technical margins pass JPL CML-4 gates; confirm BOE/testbed quality."
          : `${6 - margins.greenCount} technical margin metric(s) below JPL CML-4 Green thresholds.`
      },
      {
        ...JPL_CML_CAVEATS[1],
        flagged: activeSummary.criticalGaps.length > 0,
        liveNote: activeSummary.criticalGaps.length === 0
          ? `All critical drivers Green at CML ${targetCml}.`
          : `${activeSummary.criticalGaps.length} critical item(s) still Y/R (e.g., ${activeSummary.criticalGaps[0].text}).`
      },
      {
        ...JPL_CML_CAVEATS[2],
        flagged: !state.assessorSignedOff,
        liveNote: state.assessorSignedOff
          ? `Signed off by Independent Assessor${hasText(notes.assessorName) ? `: ${notes.assessorName}` : ""}.`
          : "Awaiting ~30 min Independent Assessor (FDIR / Ground Control) verification."
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
   * Formats a human-readable Markdown CML Gate Assessment Report for engineering reviews.
   */
  function formatCmlMarkdownReport(telemetry, cmlEval) {
    const t = telemetry || {};
    const e = cmlEval || {};
    const target = e.activeSummary || { level: 4, percentGreen: 0, greenCount: 0, applicableCount: 0, criticalGaps: [], items: [] };
    const lines = [
      `# JPL Concept Maturity Level (CML) Assessment — ${t.scenario ? t.scenario.name : "Mission Concept"}`,
      "",
      `- **Reached CML (80% Green Gate):** CML ${e.reachedCml} (${e.reachedTitle})`,
      `- **Certified CML (Criticals + Assessor):** CML ${e.certifiedCml}`,
      `- **Target Gate Review:** CML ${target.level} — **${target.percentGreen}% Green** (${target.greenCount}/${target.applicableCount} applicable items)`,
      `- **Independent Assessor Sign-off:** ${e.assessorSignedOff ? "SIGNED OFF" : "PENDING"}`,
      `- **Mission Complexity Tier:** ${e.complexity ? `${e.complexity.tier} (${e.complexity.score}/5)` : "N/A"}`,
      "",
      "## Technical Margin Gate (JPL CML 4 Standards)",
      "| Parameter | Actual | JPL CML 4 Threshold | Status |",
      "|---|---|---|---|",
      ...(e.margins ? e.margins.metrics.map((m) => `| ${m.label} | ${m.actual} | ${m.required} | ${m.status} |`) : []),
      "",
      `## Critical Unweighted Attribute Gaps at CML ${target.level}`
    ];
    if (target.criticalGaps.length === 0) {
      lines.push("- None — all critical attributes are Green.");
    } else {
      for (const gap of target.criticalGaps) {
        lines.push(`- **[${gap.status}]** ${gap.text} _(${gap.autoReason})_`);
      }
    }
    lines.push("", "## Official JPL Caveats");
    for (const cav of e.caveatsStatus || []) {
      lines.push(`- **${cav.title}** [${cav.flagged ? "FLAGGED" : "CLEAR"}]: ${cav.liveNote}`);
    }
    lines.push("", "## Checklist Details (CML " + target.level + ")");
    for (const item of target.items || []) {
      lines.push(`- [${item.status}] (${item.category.toUpperCase()}) ${item.text}${item.critical ? " *(Critical)*" : ""} — ${item.autoReason}`);
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
