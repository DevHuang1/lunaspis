/**
 * Space Center 2 — shared web-port constants and module registry.
 *
 * The original Godot LC-39A project lives in design-reference/ for reference.
 * Runtime content is built from these modules so terrain, facilities and
 * launch-pad props can be reused independently.
 */
(function (window) {
  "use strict";

  const NS = (window.SpaceCenterModules = window.SpaceCenterModules || {});

  NS.constants = {
    SITE_BOUNDS: { minX: -1050, maxX: 525, minZ: -850, maxZ: 850 },
    PAD: { x: 0, z: 0, radius: 74, topY: 12.2 },
    VAB: {
      x: -30,
      z: 700,
      halfX: 79,
      halfZ: 109,
      height: 160,
      doorHalfWidth: 23,
      doorZ: 591
    },
    LCC: {
      x: -180,
      z: 180,
      halfX: 35,
      halfZ: 23,
      height: 24,
      doorZ: 203
    },
    CRAWLER: { x: 0, z: 500, yaw: Math.PI / 2 },
    PRESS: { x: 118, z: 214 },
    TURN_BASIN: { x: -930, z: 118 },
    ANTENNA: { x: -850, z: 336 },
    SUBSTATION: { x: -706, z: 50 },
    COOLING: { x: -620, z: 58 },
    GENERATOR: { x: -618, z: 18 },
    FIRE_TANK: { x: -596, z: 92 },
    PROPELLANT: { x: -120, z: 88 },
    WATER_TOWER: { x: 96, z: 58 },
    PAD_39B: { x: -120, z: -760 },
    BEACH: { x: 470, z: 0 }
  };

  NS.SITE_TOUR_SPAWNS = [
    { id: "pad", label: "Pad 39A", short: "PAD 39A", x: 24, z: 168, yaw: Math.atan2(-24, -168), pitch: 0.14 },
    { id: "vab", label: "Vehicle Assembly Building", short: "VAB", x: -30, z: 544, yaw: 0.02, pitch: 0.22 },
    { id: "lcc", label: "Launch Control Center", short: "LCC", x: -148, z: 246, yaw: Math.atan2(-32, -66), pitch: 0.04 },
    { id: "crawler", label: "Crawler Transporter", short: "CRAWLER", x: 34, z: 452, yaw: Math.atan2(-34, 48), pitch: 0.06 },
    { id: "beach", label: "Beach View", short: "BEACH", x: 474, z: 18, yaw: Math.PI / 2 - 0.14, pitch: 0.0 },
    { id: "press", label: "Press Site 39A", short: "PRESS", x: 162, z: 214, yaw: Math.atan2(-162, -214) - 0.14, pitch: 0.08 }
  ];

  NS.register = function (name, builder) {
    NS.builders = NS.builders || {};
    NS.builders[name] = builder;
  };
})(window);
