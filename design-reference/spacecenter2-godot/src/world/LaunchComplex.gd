# src/world/LaunchComplex.gd
# Launch Complex 39A: hardstand, mobile launcher, fixed service structure,
# lightning protection masts, water tower, propellant farm and the launch console.
class_name LaunchComplex
extends Node3D

const PAD_TOP := 6.0
const VEHICLE_BASE_Y := 15.0
const TOWER_X := 26.0
const TOWER_HEIGHT := 108.0

const InteractableScript = preload("res://src/interact/Interactable.gd")

var vehicle: LaunchVehicle


func _ready() -> void:
	_build_hardstand()
	_build_collision()
	_build_tower()
	_build_lightning_masts()
	_build_water_tower()
	_build_propellant_farm()
	_build_pad_lights()
	_build_console()
	_build_details()

	vehicle = LaunchVehicle.new()
	vehicle.name = "LaunchVehicle"
	vehicle.position = Vector3(0.0, VEHICLE_BASE_Y, 0.0)
	add_child(vehicle)


func _build_hardstand() -> void:
	var concrete := Mats.mat("concrete")
	BuildKit.box(self, Vector3(130.0, PAD_TOP, 130.0), Vector3(0.0, PAD_TOP * 0.5, 0.0), concrete, "Hardstand")

	# Grass embankment around the mound, with the concrete ramp cut into the
	# south side so the pad reads as a raised mound instead of a wall.
	var slope := Mats.mat("grass")
	var rise := rad_to_deg(atan2(PAD_TOP, 20.0))
	BuildKit.box_rot(self, Vector3(20.0, 0.6, 130.0), Vector3(75.0, 3.0, 0.0), Vector3(0.0, 0.0, -rise), slope, "SlopeEast")
	# West embankment, split so the crawlerway climbs onto the pad through a concrete ramp.
	BuildKit.box_rot(self, Vector3(20.0, 0.6, 53.0), Vector3(-75.0, 3.0, -38.5), Vector3(0.0, 0.0, rise), slope, "SlopeWest")
	BuildKit.box_rot(self, Vector3(20.0, 0.6, 53.0), Vector3(-75.0, 3.0, 38.5), Vector3(0.0, 0.0, rise), slope, "SlopeWest")
	BuildKit.box_rot(self, Vector3(20.0, 0.6, 24.0), Vector3(-75.0, 3.0, 0.0), Vector3(0.0, 0.0, rise), concrete, "CrawlerRamp")
	BuildKit.box_rot(self, Vector3(130.0, 0.6, 20.0), Vector3(0.0, 3.0, -75.0), Vector3(-rise, 0.0, 0.0), slope, "SlopeNorth")
	BuildKit.box_rot(self, Vector3(57.0, 0.6, 20.0), Vector3(-36.5, 3.0, 75.0), Vector3(rise, 0.0, 0.0), slope, "SlopeSouthWest")
	BuildKit.box_rot(self, Vector3(57.0, 0.6, 20.0), Vector3(36.5, 3.0, 75.0), Vector3(rise, 0.0, 0.0), slope, "SlopeSouthEast")

	# Concrete vehicle ramp up the south face.
	var ramp := BuildKit.box_rot(self, Vector3(16.0, 0.6, 20.0), Vector3(0.0, 3.0, 75.0), Vector3(rise, 0.0, 0.0), concrete, "Ramp")
	ramp.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	for x in [-8.2, 8.2]:
		BuildKit.box_rot(self, Vector3(0.5, 0.9, 20.0), Vector3(x, 3.45, 75.0), Vector3(rise, 0.0, 0.0), Mats.mat("steel_white"), "RampCurb")

	# Flame trench opening under the mount.
	BuildKit.box(self, Vector3(30.0, 0.3, 30.0), Vector3(0.0, PAD_TOP + 0.02, 0.0), Mats.mat("black"), "FlameTrench")

	# Launch mount + mobile launcher platform.
	BuildKit.box(self, Vector3(28.0, 4.0, 28.0), Vector3(0.0, 8.0, 0.0), Mats.mat("concrete_dark"), "LaunchMount")
	BuildKit.box(self, Vector3(42.0, 2.5, 42.0), Vector3(0.0, 11.25, 0.0), Mats.mat("steel_grey"), "MobileLauncher")
	BuildKit.box(self, Vector3(38.0, 0.4, 38.0), Vector3(0.0, 12.6, 0.0), Mats.mat("tower"), "MLPDeck")

	# Hold-down posts around the core stage.
	for x in [-5.6, 5.6]:
		for z in [-5.6, 5.6]:
			BuildKit.box(self, Vector3(1.4, 2.6, 1.4), Vector3(x, 13.6, z), Mats.mat("rust"), "HoldDown")

	# Launch mount deck clutter.
	for i in 6:
		var angle := TAU * float(i) / 6.0
		BuildKit.box(self, Vector3(1.2, 1.6, 1.2), Vector3(cos(angle) * 17.0, 13.4, sin(angle) * 17.0), Mats.mat("steel_grey"), "MountBox")

	# Railing around the MLP deck.
	for side in 4:
		var angle := TAU * float(side) / 4.0
		var rail := BuildKit.box(self, Vector3(38.0, 0.12, 0.12), Vector3(cos(angle) * 19.0, 14.2, sin(angle) * 19.0), Mats.mat("steel_white"), "Rail")
		rail.rotation_degrees.y = rad_to_deg(angle)


func _build_collision() -> void:
	var body := StaticBody3D.new()
	body.name = "PadCollision"
	add_child(body)
	var rise := rad_to_deg(atan2(PAD_TOP, 20.0))
	BuildKit.collision_box(body, Vector3(130.0, PAD_TOP, 130.0), Vector3(0.0, PAD_TOP * 0.5, 0.0))
	BuildKit.collision_box(body, Vector3(16.0, 0.6, 20.0), Vector3(0.0, 3.0, 75.0), Vector3(rise, 0.0, 0.0))
	BuildKit.collision_box(body, Vector3(20.0, 0.6, 130.0), Vector3(75.0, 3.0, 0.0), Vector3(0.0, 0.0, -rise))
	BuildKit.collision_box(body, Vector3(20.0, 0.6, 53.0), Vector3(-75.0, 3.0, -38.5), Vector3(0.0, 0.0, rise))
	BuildKit.collision_box(body, Vector3(20.0, 0.6, 53.0), Vector3(-75.0, 3.0, 38.5), Vector3(0.0, 0.0, rise))
	BuildKit.collision_box(body, Vector3(20.0, 0.6, 24.0), Vector3(-75.0, 3.0, 0.0), Vector3(0.0, 0.0, rise))
	BuildKit.collision_box(body, Vector3(130.0, 0.6, 20.0), Vector3(0.0, 3.0, -75.0), Vector3(-rise, 0.0, 0.0))
	BuildKit.collision_box(body, Vector3(57.0, 0.6, 20.0), Vector3(-36.5, 3.0, 75.0), Vector3(rise, 0.0, 0.0))
	BuildKit.collision_box(body, Vector3(57.0, 0.6, 20.0), Vector3(36.5, 3.0, 75.0), Vector3(rise, 0.0, 0.0))
	BuildKit.collision_box(body, Vector3(28.0, 4.0, 28.0), Vector3(0.0, 8.0, 0.0))
	BuildKit.collision_box(body, Vector3(42.0, 2.5, 42.0), Vector3(0.0, 11.25, 0.0))
	BuildKit.collision_box(body, Vector3(3.6, TOWER_HEIGHT, 3.6), Vector3(TOWER_X, PAD_TOP + TOWER_HEIGHT * 0.5, 0.0))


func _build_tower() -> void:
	var tower_mat := Mats.mat("tower")
	var base := Vector3(TOWER_X, PAD_TOP, 0.0)
	var half_bottom := 5.5
	var half_top := 2.5

	# Elevator / core column.
	BuildKit.box(self, Vector3(3.6, TOWER_HEIGHT, 3.6), base + Vector3(0.0, TOWER_HEIGHT * 0.5, 0.0), Mats.mat("steel_grey"), "TowerCore")

	# Four tapering legs.
	var corners: Array[Vector2] = [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]
	for c in corners:
		var a := base + Vector3(c.x * half_bottom, 0.0, c.y * half_bottom)
		var b := base + Vector3(c.x * half_top, TOWER_HEIGHT, c.y * half_top)
		BuildKit.beam(self, a, b, 0.55, tower_mat, "TowerLeg")

	# Ring beams + diagonal bracing.
	var levels := 9
	for level in range(levels + 1):
		var t := float(level) / float(levels)
		var y := base.y + TOWER_HEIGHT * t
		var half := lerpf(half_bottom, half_top, t)
		for i in 4:
			var c0 := corners[i]
			var c1 := corners[(i + 1) % 4]
			var p0 := Vector3(base.x + c0.x * half, y, base.z + c0.y * half)
			var p1 := Vector3(base.x + c1.x * half, y, base.z + c1.y * half)
			BuildKit.beam(self, p0, p1, 0.32, tower_mat, "Ring")

	for level in range(levels):
		var t0 := float(level) / float(levels)
		var t1 := float(level + 1) / float(levels)
		var h0 := lerpf(half_bottom, half_top, t0)
		var h1 := lerpf(half_bottom, half_top, t1)
		var y0 := base.y + TOWER_HEIGHT * t0
		var y1 := base.y + TOWER_HEIGHT * t1
		for i in 4:
			var c0 := corners[i]
			var c1 := corners[(i + 1) % 4]
			var p0 := Vector3(base.x + c0.x * h0, y0, base.z + c0.y * h0)
			var p1 := Vector3(base.x + c1.x * h1, y1, base.z + c1.y * h1)
			BuildKit.beam(self, p0, p1, 0.22, tower_mat, "Brace")

	# Top platform + hammerhead crane.
	BuildKit.box(self, Vector3(16.0, 0.9, 16.0), base + Vector3(0.0, TOWER_HEIGHT + 0.4, 0.0), Mats.mat("steel_grey"), "TowerTop")
	BuildKit.box(self, Vector3(30.0, 1.4, 2.2), base + Vector3(0.0, TOWER_HEIGHT + 2.4, 0.0), Mats.mat("rust"), "CraneJib")
	BuildKit.box(self, Vector3(6.0, 4.0, 3.0), base + Vector3(-12.0, TOWER_HEIGHT + 0.6, 0.0), Mats.mat("concrete_dark"), "Counterweight")
	BuildKit.beam(self, base + Vector3(13.0, TOWER_HEIGHT + 2.4, 0.0), base + Vector3(13.0, TOWER_HEIGHT - 26.0, 0.0), 0.15, Mats.mat("black"), "CraneCable")

	# Service arms reaching to the vehicle.
	for arm_y in [24.0, 42.0, 60.0, 78.0, 94.0]:
		var z := 0.0
		var arm := BuildKit.box(self, Vector3(20.0, 2.4, 3.2), Vector3(TOWER_X - 10.0, PAD_TOP + arm_y, z), Mats.mat("steel_white"), "ServiceArm")
		arm.rotation_degrees.z = 0.0
		BuildKit.box(self, Vector3(1.2, 3.0, 3.8), Vector3(TOWER_X - 20.0, PAD_TOP + arm_y, z), Mats.mat("steel_grey"), "ArmTip")

	# Pad designation mounted on the tower core between two decks.
	BuildKit.box(self, Vector3(5.2, 3.0, 0.22), base + Vector3(0.0, 61.0, 1.9), Mats.mat("nasa_blue"), "PadSignBoard")
	BuildKit.box(self, Vector3(5.4, 0.18, 0.3), base + Vector3(0.0, 62.6, 1.9), Mats.mat("steel_white"), "PadSignTrim")
	BuildKit.box(self, Vector3(5.4, 0.18, 0.3), base + Vector3(0.0, 59.4, 1.9), Mats.mat("steel_white"), "PadSignTrim")
	var sign := BuildKit.label(self, "39A", base + Vector3(0.0, 61.0, 2.06), 0.022, Color(0.95, 0.96, 1.0), "PadSign")
	sign.no_depth_test = false
	for x in [-6.0, 6.0]:
		var beacon := BuildKit.sphere(self, 0.35, base + Vector3(x, TOWER_HEIGHT + 1.2, 0.0), Mats.mat("red"), "Beacon", 8)
		beacon.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _build_lightning_masts() -> void:
	var tops: Array[Vector3] = []
	for i in 3:
		var angle := deg_to_rad(30.0 + 120.0 * float(i))
		var pos := Vector3(cos(angle) * 88.0, 0.0, sin(angle) * 88.0)
		var mast := BuildKit.cone(self, 0.5, 1.2, 118.0, pos + Vector3(0.0, 59.0, 0.0), Mats.mat("steel_white"), "LightningMast", 12)
		mast.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		BuildKit.cone(self, 0.05, 0.5, 14.0, pos + Vector3(0.0, 125.0, 0.0), Mats.mat("steel_grey"), "MastSpike", 8)
		BuildKit.cylinder(self, 3.0, 1.2, pos + Vector3(0.0, 0.6, 0.0), Mats.mat("concrete_dark"), "MastBase", 12)
		tops.append(pos + Vector3(0.0, 130.0, 0.0))

	# Catenary wires between the masts and down to ground anchors.
	for i in 3:
		_wire(tops[i], tops[(i + 1) % 3], 14.0)
		var anchor := tops[i] * 0.0 + Vector3(cos(deg_to_rad(30.0 + 120.0 * float(i))) * 175.0, 0.0, sin(deg_to_rad(30.0 + 120.0 * float(i))) * 175.0)
		_wire(tops[i], anchor, 8.0)


func _wire(a: Vector3, b: Vector3, sag: float) -> void:
	var mid := (a + b) * 0.5 - Vector3(0.0, sag, 0.0)
	BuildKit.beam(self, a, mid, 0.12, Mats.mat("black"), "Wire")
	BuildKit.beam(self, mid, b, 0.12, Mats.mat("black"), "Wire")


func _build_water_tower() -> void:
	var pos := Vector3(96.0, 0.0, 58.0)
	var legs: Array[Vector2] = [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]
	for c in legs:
		BuildKit.beam(self, pos + Vector3(c.x * 7.0, 0.0, c.y * 7.0), pos + Vector3(c.x * 2.8, 42.0, c.y * 2.8), 0.55, Mats.mat("steel_grey"), "TowerLeg")

	BuildKit.cylinder(self, 7.5, 10.0, pos + Vector3(0.0, 47.0, 0.0), Mats.mat("steel_white"), "WaterTank", 24)
	BuildKit.cone(self, 7.5, 1.6, 5.0, pos + Vector3(0.0, 39.5, 0.0), Mats.mat("steel_white"), "TankBase", 24)
	BuildKit.cylinder(self, 7.55, 0.9, pos + Vector3(0.0, 47.0, 0.0), Mats.mat("steel_grey"), "TankBand", 24)
	BuildKit.cone(self, 1.0, 7.5, 4.0, pos + Vector3(0.0, 54.0, 0.0), Mats.mat("steel_white"), "TankCap", 24)
	# Riser down the side of the tower, then a main along the ground to the pad.
	BuildKit.cylinder(self, 0.45, 40.0, pos + Vector3(-9.0, 20.0, -9.0), Mats.mat("steel_grey"), "WaterRiser", 8)
	BuildKit.beam(self, pos + Vector3(-9.0, 0.5, -9.0), Vector3(66.0, 0.5, 30.0), 0.7, Mats.mat("steel_grey"), "WaterMain")

	# Maintenance ladder up one leg to the tank.
	var ladder := pos + Vector3(8.6, 0.0, 8.6)
	for x in [-0.3, 0.3]:
		BuildKit.beam(self, ladder + Vector3(x, 0.0, 0.0), ladder + Vector3(x, 39.0, 0.0), 0.08, Mats.mat("steel_grey"), "TankLadderRail")
	for i in 65:
		BuildKit.box(self, Vector3(0.7, 0.05, 0.05), ladder + Vector3(0.0, 0.5 + float(i) * 0.6, 0.0), Mats.mat("steel_grey"), "TankLadderRung")


func _build_propellant_farm() -> void:
	for i in 2:
		var pos := Vector3(-120.0 + float(i) * 34.0, 0.0, 88.0)
		BuildKit.sphere(self, 7.0, pos + Vector3(0.0, 13.0, 0.0), Mats.mat("steel_white"), "TankSphere", 24)
		BuildKit.cylinder(self, 7.2, 1.2, pos + Vector3(0.0, 13.0, 0.0), Mats.mat("steel_grey"), "TankBand", 24)
		for c in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
			BuildKit.beam(self, pos + Vector3(c.x * 4.2, 0.0, c.y * 4.2), pos + Vector3(c.x * 2.0, 7.0, c.y * 2.0), 0.4, Mats.mat("steel_grey"), "TankLeg")

	# Feed line running to the pad.
	BuildKit.beam(self, Vector3(-100.0, 2.0, 88.0), Vector3(-30.0, 2.0, 55.0), 0.9, Mats.mat("steel_grey"), "FeedLine")
	BuildKit.beam(self, Vector3(-30.0, 2.0, 55.0), Vector3(-14.0, 6.5, 20.0), 0.9, Mats.mat("steel_grey"), "FeedLine")


func _build_pad_lights() -> void:
	for i in 8:
		var angle := TAU * (float(i) + 0.5) / 8.0
		var pos := Vector3(cos(angle) * 72.0, 0.0, sin(angle) * 72.0)
		BuildKit.cylinder(self, 0.35, 24.0, pos + Vector3(0.0, 12.0, 0.0), Mats.mat("steel_grey"), "LightPole", 8)
		BuildKit.box(self, Vector3(1.8, 0.9, 0.9), pos + Vector3(0.0, 24.4, 0.0), Mats.mat("lamp"), "LightHead")
		var light := OmniLight3D.new()
		light.position = pos + Vector3(0.0, 23.6, 0.0)
		light.light_color = Color(1.0, 0.92, 0.78)
		light.light_energy = 2.0
		light.omni_range = 34.0
		light.shadow_enabled = false
		add_child(light)


func _build_console() -> void:
	var body := StaticBody3D.new()
	body.name = "LaunchConsole"
	body.position = Vector3(24.0, 0.0, 126.0)
	body.rotation_degrees.y = -12.0
	body.set_script(InteractableScript)
	body.set("prompt", "Access Launch Console")
	body.add_to_group("launch_console")
	add_child(body)

	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(2.2, 1.8, 1.2)
	shape.shape = box
	shape.position = Vector3(0.0, 0.9, 0.0)
	body.add_child(shape)

	BuildKit.box(body, Vector3(1.8, 1.0, 1.0), Vector3(0.0, 0.5, 0.0), Mats.mat("steel_grey"), "ConsoleBase")
	BuildKit.box_rot(body, Vector3(1.6, 0.95, 0.1), Vector3(0.0, 1.2, 0.05), Vector3(-18.0, 0.0, 0.0), Mats.mat("screen"), "ConsoleScreen")
	BuildKit.box(body, Vector3(1.9, 0.1, 1.1), Vector3(0.0, 1.0, 0.0), Mats.mat("steel_white"), "ConsoleLip")

	var label := BuildKit.label(body, "LAUNCH CONSOLE", Vector3(0.0, 1.75, 0.0), 0.0045, Color(0.85, 0.95, 1.0), "ConsoleLabel")
	label.font_size = 48

	var light := OmniLight3D.new()
	light.position = Vector3(0.0, 1.4, 0.4)
	light.light_color = Color(0.2, 1.0, 0.8)
	light.light_energy = 1.2
	light.omni_range = 5.0
	body.add_child(light)


func _build_details() -> void:
	_build_tower_decks()
	_build_tower_ladder()
	_build_tail_service_masts()
	_build_deluge()
	_build_hardstand_railings()
	_build_trench_exits()
	_build_pad_props()
	_build_pad_markings()
	_build_propellant_details()


func _build_propellant_details() -> void:
	var wall := Mats.mat("concrete")
	# Containment berm around the two propellant spheres.
	BuildKit.box(self, Vector3(74.0, 1.4, 1.2), Vector3(-103.0, 0.7, 70.0), wall, "BermNorth")
	BuildKit.box(self, Vector3(74.0, 1.4, 1.2), Vector3(-103.0, 0.7, 98.0), wall, "BermSouth")
	BuildKit.box(self, Vector3(1.2, 1.4, 36.0), Vector3(-140.0, 0.7, 88.0), wall, "BermWest")
	BuildKit.box(self, Vector3(1.2, 1.4, 28.0), Vector3(-66.0, 0.7, 84.0), wall, "BermEast")

	# Hazard placard on the north berm wall.
	BuildKit.box(self, Vector3(4.2, 1.2, 0.1), Vector3(-103.0, 1.0, 69.35), Mats.mat("red"), "PropellantPlacard")
	var placard := BuildKit.label(self, "NO OPEN FLAME", Vector3(-103.0, 1.0, 69.25), 0.005, Color(0.97, 0.97, 1.0), "PlacardText")
	placard.font_size = 96
	placard.rotation_degrees.y = 180.0

	# Control shack outside the south berm.
	BuildKit.box(self, Vector3(4.0, 3.0, 3.0), Vector3(-152.0, 1.5, 100.0), Mats.mat("steel_white"), "PropellantShack")
	BuildKit.box(self, Vector3(4.2, 0.3, 3.2), Vector3(-152.0, 3.15, 100.0), Mats.mat("steel_grey"), "PropellantShackRoof")
	BuildKit.box(self, Vector3(0.1, 1.4, 1.8), Vector3(-154.0, 1.6, 100.0), Mats.mat("glass"), "PropellantShackWindow")


func _build_tower_decks() -> void:
	var deck_mat := Mats.mat("steel_grey")
	var rail_mat := Mats.mat("steel_white")
	for level in [1, 3, 5, 7, 9]:
		var t := float(level) / 9.0
		var y := PAD_TOP + TOWER_HEIGHT * t
		var half := lerpf(5.5, 2.5, t) + 1.0
		BuildKit.box(self, Vector3(half * 2.0, 0.22, half * 2.0), Vector3(TOWER_X, y, 0.0), deck_mat, "TowerDeck")
		for side in 4:
			var angle := TAU * float(side) / 4.0
			var rail := BuildKit.box(self, Vector3(half * 2.0, 0.07, 0.07), Vector3(TOWER_X + cos(angle) * half, y + 0.95, sin(angle) * half), rail_mat, "DeckRail")
			rail.rotation_degrees.y = rad_to_deg(angle) + 90.0


func _build_tower_ladder() -> void:
	var mat := Mats.mat("steel_grey")
	for x in [-0.45, 0.45]:
		BuildKit.beam(self, Vector3(TOWER_X + x, PAD_TOP, -2.25), Vector3(TOWER_X + x, PAD_TOP + TOWER_HEIGHT, -2.25), 0.1, mat, "LadderRail")
	for i in 36:
		BuildKit.box(self, Vector3(1.0, 0.07, 0.12), Vector3(TOWER_X, PAD_TOP + 2.0 + float(i) * 3.0, -2.25), mat, "LadderRung")


func _build_tail_service_masts() -> void:
	for side in [-1.0, 1.0]:
		var x: float = side * 9.5
		BuildKit.box(self, Vector3(1.6, 20.0, 1.6), Vector3(x, 16.0, 6.0), Mats.mat("steel_grey"), "TailServiceMast")
		BuildKit.box(self, Vector3(6.0, 1.2, 1.2), Vector3(x - side * 3.5, 22.0, 2.0), Mats.mat("steel_white"), "UmbilicalArm")
		BuildKit.box(self, Vector3(1.0, 2.4, 1.6), Vector3(x - side * 6.5, 22.0, 1.0), Mats.mat("rust"), "UmbilicalPlate")
		BuildKit.sphere(self, 0.25, Vector3(x, 26.2, 6.0), Mats.mat("red"), "TSMBeacon", 8)


func _build_deluge() -> void:
	var pipe := Mats.mat("steel_grey")
	for i in 24:
		var a0 := TAU * float(i) / 24.0
		var a1 := TAU * float(i + 1) / 24.0
		var p0 := Vector3(cos(a0) * 24.0, PAD_TOP + 0.45, sin(a0) * 24.0)
		var p1 := Vector3(cos(a1) * 24.0, PAD_TOP + 0.45, sin(a1) * 24.0)
		BuildKit.beam(self, p0, p1, 0.45, pipe, "DelugeRing")
	for i in 8:
		var angle := TAU * float(i) / 8.0
		var base := Vector3(cos(angle) * 24.0, PAD_TOP, sin(angle) * 24.0)
		var head := Vector3(cos(angle) * 17.0, PAD_TOP + 5.0, sin(angle) * 17.0)
		BuildKit.beam(self, base, head, 0.35, pipe, "DelugeRiser")


func _build_hardstand_railings() -> void:
	_railing_line(Vector3(-65.0, PAD_TOP, -65.0), Vector3(65.0, PAD_TOP, -65.0))
	_railing_line(Vector3(65.0, PAD_TOP, -65.0), Vector3(65.0, PAD_TOP, 65.0))
	_railing_line(Vector3(-65.0, PAD_TOP, 65.0), Vector3(-65.0, PAD_TOP, 12.0))
	_railing_line(Vector3(-65.0, PAD_TOP, -12.0), Vector3(-65.0, PAD_TOP, -65.0))
	_railing_line(Vector3(-65.0, PAD_TOP, 65.0), Vector3(-9.0, PAD_TOP, 65.0))
	_railing_line(Vector3(9.0, PAD_TOP, 65.0), Vector3(65.0, PAD_TOP, 65.0))


func _railing_line(a: Vector3, b: Vector3) -> void:
	var mat := Mats.mat("steel_white")
	var length := a.distance_to(b)
	var segments := maxi(2, int(length / 9.0))
	for i in range(segments + 1):
		var p := a.lerp(b, float(i) / float(segments))
		BuildKit.box(self, Vector3(0.1, 1.1, 0.1), p + Vector3(0.0, 0.55, 0.0), mat, "RailPost")
	BuildKit.beam(self, a + Vector3(0.0, 1.05, 0.0), b + Vector3(0.0, 1.05, 0.0), 0.08, mat, "RailTop")
	BuildKit.beam(self, a + Vector3(0.0, 0.6, 0.0), b + Vector3(0.0, 0.6, 0.0), 0.06, mat, "RailMid")


func _build_trench_exits() -> void:
	BuildKit.box(self, Vector3(1.2, 4.2, 18.0), Vector3(65.2, 4.0, 0.0), Mats.mat("black"), "TrenchExit")


func _build_pad_props() -> void:
	_truck(Vector3(38.0, 0.0, 100.0), Mats.mat("red"), "FireTruck")
	_truck(Vector3(47.0, 0.0, 100.0), Mats.mat("steel_white"), "ServiceTruck")
	_cherry_picker(Vector3(-32.0, 0.0, 92.0))

	for i in 2:
		var reel := BuildKit.cylinder(self, 1.2, 0.8, Vector3(30.0 + float(i) * 3.0, 1.2, 66.0), Mats.mat("rust"), "CableReel", 12)
		reel.rotation_degrees.z = 90.0
	for i in 3:
		BuildKit.box(self, Vector3(2.2, 1.4, 1.4), Vector3(36.0 + float(i) * 3.0, 0.7, 58.0), Mats.mat("steel_grey"), "Generator")
	for i in 16:
		BuildKit.box(self, Vector3(3.0, 0.9, 0.8), Vector3(-96.0 + float(i) * 12.0, 0.45, 126.0), Mats.mat("concrete"), "JerseyBarrier")


func _truck(pos: Vector3, body_mat: Material, node_name: String) -> void:
	BuildKit.box(self, Vector3(6.0, 2.0, 2.4), pos + Vector3(0.0, 1.7, 0.0), body_mat, node_name)
	BuildKit.box(self, Vector3(2.2, 1.6, 2.3), pos + Vector3(2.4, 2.5, 0.0), Mats.mat("glass"), "Cab")
	BuildKit.box(self, Vector3(6.2, 0.22, 2.45), pos + Vector3(0.0, 2.2, 0.0), Mats.mat("steel_white"), "Stripe")
	BuildKit.box(self, Vector3(1.2, 0.25, 1.6), pos + Vector3(2.4, 3.45, 0.0), Mats.mat("lamp"), "LightBar")
	for x in [-2.0, 2.0]:
		for z in [-1.1, 1.1]:
			var wheel := BuildKit.cylinder(self, 0.55, 0.4, pos + Vector3(x, 0.55, z), Mats.mat("black"), "Wheel", 10)
			wheel.rotation_degrees.z = 90.0


func _cherry_picker(pos: Vector3) -> void:
	BuildKit.box(self, Vector3(6.0, 1.8, 2.4), pos + Vector3(0.0, 1.2, 0.0), Mats.mat("steel_white"), "LiftBase")
	for x in [-2.0, 2.0]:
		for z in [-1.1, 1.1]:
			var wheel := BuildKit.cylinder(self, 0.5, 0.4, pos + Vector3(x, 0.5, z), Mats.mat("black"), "Wheel", 10)
			wheel.rotation_degrees.z = 90.0
	BuildKit.beam(self, pos + Vector3(0.0, 2.2, 0.0), pos + Vector3(5.5, 12.0, 2.0), 0.5, Mats.mat("yellow"), "LiftArm")
	BuildKit.box(self, Vector3(1.8, 1.2, 1.4), pos + Vector3(5.5, 12.6, 2.0), Mats.mat("steel_grey"), "Basket")


func _build_pad_markings() -> void:
	var number := BuildKit.label(self, "39A", Vector3(20.0, 0.16, 141.0), 0.06, Color(0.86, 0.86, 0.83), "ApronNumber")
	number.rotation_degrees.x = -90.0
	number.shaded = false

	# Faded taxi lines on the apron, leading up to the ramp.
	for x in [-14.0, 14.0]:
		BuildKit.box(self, Vector3(0.4, 0.06, 34.0), Vector3(x, 0.14, 116.0), Mats.mat("yellow"), "ApronLine")

	var rise := rad_to_deg(atan2(PAD_TOP, 20.0))
	for i in 10:
		var z := 67.0 + float(i) * 1.8
		var surface := 3.0 + (75.0 - z) * (PAD_TOP / 20.0)
		var mat := Mats.mat("yellow") if i % 2 == 0 else Mats.mat("black")
		for x in [-8.2, 8.2]:
			BuildKit.box_rot(self, Vector3(0.5, 0.06, 1.4), Vector3(x, surface + 0.95, z), Vector3(rise, 0.0, 0.0), mat, "HazardStripe")
