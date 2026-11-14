# src/world/Terrain.gd
# Merritt Island ground: grass flat, Atlantic to the east, crawlerway and roads.
class_name TerrainBuilder
extends Node3D

const GROUND_CENTER := Vector3(-450.0, -0.6, 0.0)
const GROUND_SIZE := Vector3(1600.0, 1.2, 1600.0)
const SHORE_X := 350.0


func _ready() -> void:
	_build_ground()
	_build_water()
	_build_crawlerway()
	_build_roads()
	_build_palms()
	_build_details()


func _build_ground() -> void:
	BuildKit.box(self, GROUND_SIZE, GROUND_CENTER, Mats.mat("grass"), "Ground")

	# Walkable ground collider (top at y = 0.02).
	var body := StaticBody3D.new()
	body.name = "GroundCollision"
	add_child(body)
	BuildKit.collision_box(body, GROUND_SIZE, Vector3(GROUND_CENTER.x, GROUND_CENTER.y + 0.02, GROUND_CENTER.z))

	# Beach strip where the land meets the Atlantic.
	BuildKit.box(self, Vector3(70.0, 1.3, 1600.0), Vector3(SHORE_X + 15.0, -0.55, 0.0), Mats.mat("sand"), "Beach")

	# Flat site aprons (kept low so they never block walking).
	BuildKit.box(self, Vector3(260.0, 0.1, 360.0), Vector3(0.0, 0.05, 50.0), Mats.mat("apron"), "PadApron")

	# Service apron in front of the VAB.
	BuildKit.box(self, Vector3(240.0, 0.1, 320.0), Vector3(-760.0, 0.05, -80.0), Mats.mat("apron"), "VABApron")


func _build_water() -> void:
	var ocean := BuildKit.box(self, Vector3(24000.0, 0.4, 24000.0), Vector3(0.0, -0.9, 0.0), Mats.mat("water"), "Atlantic")
	ocean.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	# Thin white surf line along the beach.
	BuildKit.box(self, Vector3(6.0, 0.12, 1600.0), Vector3(SHORE_X + 52.0, -0.2, 0.0), Mats.mat("steel_white"), "Surf")


func _build_crawlerway() -> void:
	var gravel := Mats.mat("gravel")
	for z in [-10.0, 10.0]:
		BuildKit.box(self, Vector3(790.0, 0.14, 15.0), Vector3(-425.0, 0.07, z), gravel, "CrawlerLane")
	# Median strip
	BuildKit.box(self, Vector3(790.0, 0.12, 5.0), Vector3(-425.0, 0.06, 0.0), Mats.mat("grass"), "Median")


func _build_roads() -> void:
	_road(Vector2(-760.0, 250.0), Vector2(-40.0, 100.0), 12.0)
	_road(Vector2(-900.0, 40.0), Vector2(-760.0, 250.0), 10.0)
	_road(Vector2(0.0, 95.0), Vector2(300.0, 60.0), 8.0)
	# LCC access road off the main road, running along the east side of the building.
	_road(Vector2(-740.0, 246.0), Vector2(-740.0, 360.0), 8.0)
	_road(Vector2(-740.0, 360.0), Vector2(-752.0, 360.0), 8.0)

	# Parking lot south of the Launch Control Center.
	BuildKit.box(self, Vector3(90.0, 0.1, 46.0), Vector3(-800.0, 0.05, 368.0), Mats.mat("asphalt"), "ParkingLot")


func _road(a: Vector2, b: Vector2, width: float) -> void:
	var delta := b - a
	var length := delta.length()
	var mid := (a + b) * 0.5
	var yaw := atan2(delta.x, delta.y)
	var road := BuildKit.box(self, Vector3(width, 0.1, length), Vector3(mid.x, 0.05, mid.y), Mats.mat("asphalt"), "Road")
	road.rotation_degrees.y = rad_to_deg(yaw)

	# Concrete curbs and white edge lines on both sides.
	var side := Vector2(delta.y, -delta.x) / length
	var white := Mats.mat("steel_white")
	for s in [-1.0, 1.0]:
		var curb_pos: Vector2 = mid + side * (s * (width * 0.5 + 0.15))
		BuildKit.box_rot(self, Vector3(0.3, 0.16, length), Vector3(curb_pos.x, 0.08, curb_pos.y), Vector3(0.0, rad_to_deg(yaw), 0.0), Mats.mat("concrete"), "Curb")
		var edge_pos: Vector2 = mid + side * (s * (width * 0.5 - 0.45))
		BuildKit.box_rot(self, Vector3(0.14, 0.03, length), Vector3(edge_pos.x, 0.118, edge_pos.y), Vector3(0.0, rad_to_deg(yaw), 0.0), white, "EdgeLine")


func _build_palms() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 3901
	for i in 34:
		var z := rng.randf_range(-720.0, 720.0)
		if absf(z) < 40.0:
			continue
		var x := rng.randf_range(SHORE_X - 25.0, SHORE_X + 8.0)
		_palm(Vector3(x, 0.0, z), rng.randf_range(6.5, 11.0), rng)

	# Low scrub between the beach and the pad apron.
	for i in 40:
		var z := rng.randf_range(-780.0, 780.0)
		var x := rng.randf_range(SHORE_X - 90.0, SHORE_X - 20.0)
		var s := rng.randf_range(1.2, 2.6)
		BuildKit.sphere(self, s, Vector3(x, s * 0.5, z), Mats.mat("grass"), "Scrub", 8)


func _palm(pos: Vector3, height: float, rng: RandomNumberGenerator) -> void:
	var trunk := BuildKit.cylinder(self, 0.28, height, pos + Vector3(0.0, height * 0.5, 0.0), Mats.mat("rust"), "PalmTrunk", 8)
	trunk.rotation_degrees = Vector3(rng.randf_range(-5.0, 5.0), 0.0, rng.randf_range(-5.0, 5.0))
	var top := pos + Vector3(0.0, height, 0.0)
	var leaf := Mats.mat("grass")
	for i in 9:
		var angle := TAU * float(i) / 9.0
		var tip := top + Vector3(cos(angle) * 3.4, rng.randf_range(-1.1, -0.3), sin(angle) * 3.4)
		BuildKit.beam(self, top, tip, 0.18, leaf, "Frond")


func _build_details() -> void:
	_build_apron_joints()
	_build_road_markings()
	_build_street_lights()
	_build_press_site()
	_build_turn_basin()
	_build_tree_line()
	_build_dunes()
	_build_road_sign()


func _build_apron_joints() -> void:
	var joint := Mats.mat("concrete")
	for i in range(-6, 7):
		BuildKit.box(self, Vector3(0.25, 0.02, 356.0), Vector3(float(i) * 20.0, 0.11, 50.0), joint, "ApronJoint")
	for j in range(-9, 10):
		BuildKit.box(self, Vector3(260.0, 0.02, 0.25), Vector3(0.0, 0.11, -130.0 + float(j) * 20.0), joint, "ApronJoint")


func _build_road_markings() -> void:
	_dashes(Vector2(-760.0, 250.0), Vector2(-40.0, 100.0))
	_dashes(Vector2(-900.0, 40.0), Vector2(-760.0, 250.0))
	_dashes(Vector2(0.0, 95.0), Vector2(300.0, 60.0))
	_dashes(Vector2(-740.0, 246.0), Vector2(-740.0, 360.0))


func _dashes(a: Vector2, b: Vector2) -> void:
	var delta := b - a
	var length := delta.length()
	var dir := delta / length
	var rot := rad_to_deg(atan2(delta.x, delta.y))
	var count := int(length / 11.0)
	for i in count:
		var p := a + dir * (6.0 + float(i) * 11.0)
		BuildKit.box_rot(self, Vector3(0.32, 0.06, 4.4), Vector3(p.x, 0.11, p.y), Vector3(0.0, rot, 0.0), Mats.mat("steel_white"), "RoadDash")


func _build_street_lights() -> void:
	var a := Vector2(-760.0, 250.0)
	var b := Vector2(-40.0, 100.0)
	var delta := b - a
	var dir := delta / delta.length()
	var normal := Vector2(-dir.y, dir.x)
	for i in 12:
		var p := a + dir * (40.0 + float(i) * 62.0) + normal * 9.0
		BuildKit.cylinder(self, 0.18, 11.0, Vector3(p.x, 5.5, p.y), Mats.mat("steel_grey"), "StreetPole", 8)
		BuildKit.box_rot(self, Vector3(2.4, 0.25, 0.25), Vector3(p.x - normal.x * 1.1, 11.0, p.y - normal.y * 1.1), Vector3(0.0, rad_to_deg(atan2(-normal.y, normal.x)), 0.0), Mats.mat("steel_grey"), "StreetArm")
		BuildKit.box(self, Vector3(0.9, 0.35, 1.6), Vector3(p.x - normal.x * 2.2, 10.8, p.y - normal.y * 2.2), Mats.mat("lamp"), "StreetLamp")


func _build_press_site() -> void:
	var pos := Vector3(118.0, 0.0, 214.0)
	# Raised viewing mound with a concrete apron and a faced retaining edge.
	BuildKit.box(self, Vector3(74.0, 1.6, 46.0), pos + Vector3(0.0, 0.8, 0.0), Mats.mat("grass"), "PressMound")
	BuildKit.box(self, Vector3(66.0, 0.12, 38.0), pos + Vector3(0.0, 1.66, 0.0), Mats.mat("concrete_dark"), "PressApron")
	BuildKit.box(self, Vector3(74.4, 1.7, 0.9), pos + Vector3(0.0, 0.85, 22.6), Mats.mat("concrete"), "MoundFace")
	for side in [-1.0, 1.0]:
		BuildKit.box(self, Vector3(0.9, 1.7, 46.0), pos + Vector3(side * 36.8, 0.85, 0.0), Mats.mat("concrete"), "MoundFace")
	# Three steps up from the access road.
	for i in 3:
		BuildKit.box(self, Vector3(6.0, 0.55, 0.9), pos + Vector3(0.0, 1.33 - float(i) * 0.55, 23.0 + float(i) * 0.9), Mats.mat("concrete"), "MoundStep")

	# Stepped grandstand facing the pad.
	for i in 4:
		BuildKit.box(self, Vector3(40.0, 0.9, 2.6), pos + Vector3(0.0, 2.1 + float(i) * 0.9, -10.0 + float(i) * 2.6), Mats.mat("steel_white"), "GrandstandStep")
	for i in 10:
		BuildKit.box(self, Vector3(0.9, 0.5, 0.9), pos + Vector3(-18.0 + float(i) * 4.0, 2.6, -12.0), Mats.mat("steel_grey"), "PressSeat")

	# Camera stands along the front edge.
	for i in 5:
		var x := -22.0 + float(i) * 11.0
		BuildKit.cylinder(self, 0.12, 2.4, pos + Vector3(x, 2.9, -16.0), Mats.mat("steel_grey"), "Tripod", 6)
		BuildKit.box(self, Vector3(1.1, 0.7, 1.4), pos + Vector3(x, 4.2, -16.0), Mats.mat("black"), "Camera")
		BuildKit.cylinder(self, 0.28, 0.7, pos + Vector3(x, 4.2, -15.2), Mats.mat("glass"), "Lens", 10).rotation_degrees.x = 90.0

	# Press trailers, pulled back so they frame the grandstand instead of
	# walling it off from the road.
	for i in 3:
		var tx := -26.0 + float(i) * 18.0
		var base := pos + Vector3(tx, 3.3, 15.5)
		BuildKit.box(self, Vector3(9.0, 3.2, 3.4), base, Mats.mat("steel_white"), "PressTrailer")
		BuildKit.box(self, Vector3(9.2, 0.4, 3.6), base + Vector3(0.0, 1.4, 0.0), Mats.mat("nasa_blue"), "TrailerStripe")
		# Door, windows and roof plant, on the road-facing side.
		BuildKit.box(self, Vector3(0.9, 2.1, 0.14), base + Vector3(-3.2, -0.5, 1.75), Mats.mat("steel_grey"), "TrailerDoor")
		for j in 3:
			BuildKit.box(self, Vector3(1.5, 0.9, 0.14), base + Vector3(0.2 + float(j) * 1.8, 0.25, 1.75), Mats.mat("glass"), "TrailerWindow")
		BuildKit.box(self, Vector3(1.6, 0.6, 1.2), base + Vector3(1.5, 1.9, 0.0), Mats.mat("steel_grey"), "TrailerAC")
		# Stabiliser jacks.
		for side in [-1.0, 1.0]:
			BuildKit.cylinder(self, 0.09, 0.7, base + Vector3(side * 3.9, -1.9, 0.0), Mats.mat("steel_grey"), "TrailerJack", 6)

	# Countdown clock on a mast, the signature press-site prop.
	var clock_base := pos + Vector3(-34.0, 1.6, 6.0)
	BuildKit.cylinder(self, 0.16, 5.2, clock_base + Vector3(0.0, 2.6, 0.0), Mats.mat("steel_grey"), "ClockMast", 8)
	BuildKit.box(self, Vector3(3.6, 1.5, 0.35), clock_base + Vector3(0.0, 5.4, 0.0), Mats.mat("black"), "ClockCase")
	var clock := BuildKit.label(self, "T-00:09:00", clock_base + Vector3(0.0, 5.4, 0.24), 0.0028, Color(0.95, 0.72, 0.15), "ClockFace")
	clock.font_size = 128
	clock.shaded = false

	# Satellite uplink and a pair of generator/equipment carts.
	BuildKit.cylinder(self, 0.25, 3.0, pos + Vector3(30.0, 3.2, 12.0), Mats.mat("steel_grey"), "DishMast", 8)
	var dish := BuildKit.sphere(self, 2.4, pos + Vector3(30.0, 5.4, 12.0), Mats.mat("steel_white"), "PressDish", 16)
	dish.scale = Vector3(1.0, 0.35, 1.0)
	dish.rotation_degrees.x = 28.0
	for i in 2:
		BuildKit.box(self, Vector3(3.0, 1.8, 2.0), pos + Vector3(20.0 + float(i) * 4.5, 2.6, 16.0), Mats.mat("steel_grey"), "PressCart")

	# "PRESS SITE 39A" board beside the trailers, facing the access road.
	var sign_center := pos + Vector3(31.0, 1.6, 18.0)
	for side in [-1.0, 1.0]:
		BuildKit.cylinder(self, 0.11, 2.6, sign_center + Vector3(side * 3.4, 1.3, 0.0), Mats.mat("steel_grey"), "PressSignPost", 8)
	BuildKit.box(self, Vector3(8.0, 1.5, 0.28), sign_center + Vector3(0.0, 3.1, 0.0), Mats.mat("nasa_blue"), "PressSignBoard")
	var sign := BuildKit.label(self, "PRESS SITE 39A", sign_center + Vector3(0.0, 3.1, 0.2), 0.0026, Color(0.97, 0.98, 1.0), "PressSign")
	sign.font_size = 128
	sign.shaded = false

	# Low fence around the mound, with a gap at the entrance steps.
	for i in 12:
		var fx := -34.0 + float(i) * 6.2
		if absf(fx) < 4.0:
			continue
		BuildKit.cylinder(self, 0.07, 1.4, pos + Vector3(fx, 2.3, 21.0), Mats.mat("steel_grey"), "PressFencePost", 6)
	for side in [-1.0, 1.0]:
		BuildKit.box(self, Vector3(31.0, 0.06, 0.06), pos + Vector3(side * 19.0, 2.9, 21.0), Mats.mat("steel_white"), "PressFenceRail")
	for side in [-1.0, 1.0]:
		BuildKit.cylinder(self, 0.11, 5.0, pos + Vector3(side * 30.0, 1.6, -2.0), Mats.mat("steel_grey"), "PressLightMast", 6)
		BuildKit.box(self, Vector3(1.2, 0.5, 0.4), pos + Vector3(side * 30.0, 4.2, -2.0), Mats.mat("lamp"), "PressLight")


func _build_turn_basin() -> void:
	var pos := Vector3(-930.0, 0.0, 118.0)
	BuildKit.box(self, Vector3(64.0, 0.25, 44.0), pos + Vector3(0.0, 0.06, 0.0), Mats.mat("water"), "TurnBasin")
	BuildKit.box(self, Vector3(68.0, 0.5, 3.0), pos + Vector3(0.0, 0.25, 23.0), Mats.mat("concrete"), "BasinRim")
	BuildKit.box(self, Vector3(68.0, 0.5, 3.0), pos + Vector3(0.0, 0.25, -23.0), Mats.mat("concrete"), "BasinRim")
	BuildKit.box(self, Vector3(3.0, 0.5, 44.0), pos + Vector3(33.0, 0.25, 0.0), Mats.mat("concrete"), "BasinRim")
	BuildKit.box(self, Vector3(3.0, 0.5, 44.0), pos + Vector3(-33.0, 0.25, 0.0), Mats.mat("concrete"), "BasinRim")


func _build_tree_line() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 7712
	var dark := Mats.mat("grass")
	# Western tree line and the northern edge beyond Pad 39B.
	for i in 70:
		var z := -740.0 + float(i) * 21.0 + rng.randf_range(-6.0, 6.0)
		var x := -1160.0 + rng.randf_range(-40.0, 40.0)
		_tree(Vector3(x, 0.0, z), rng, dark)
	for i in 50:
		var x := -1120.0 + float(i) * 29.0 + rng.randf_range(-8.0, 8.0)
		var z := -880.0 + rng.randf_range(-30.0, 30.0)
		_tree(Vector3(x, 0.0, z), rng, dark)


func _tree(pos: Vector3, rng: RandomNumberGenerator, mat: Material) -> void:
	var height := rng.randf_range(9.0, 17.0)
	var radius := rng.randf_range(3.2, 5.6)
	BuildKit.cylinder(self, 0.45, height * 0.4, pos + Vector3(0.0, height * 0.2, 0.0), Mats.mat("rust"), "Trunk", 6)
	BuildKit.cone(self, radius * 0.25, radius, height * 0.8, pos + Vector3(0.0, height * 0.55, 0.0), mat, "Canopy", 8)


func _build_dunes() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 4402
	var sand := Mats.mat("sand")
	for i in 26:
		var z := rng.randf_range(-760.0, 760.0)
		var x := rng.randf_range(SHORE_X - 34.0, SHORE_X + 20.0)
		var s := rng.randf_range(6.0, 14.0)
		var dune := BuildKit.sphere(self, s, Vector3(x, -s * 0.62, z), sand, "Dune", 10)
		dune.scale = Vector3(1.0, 0.35, 1.5)


func _build_road_sign() -> void:
	var pos := Vector3(-392.0, 0.0, 196.0)
	BuildKit.cylinder(self, 0.16, 7.0, pos + Vector3(-3.0, 3.5, 0.0), Mats.mat("steel_grey"), "SignPost", 8)
	BuildKit.cylinder(self, 0.16, 7.0, pos + Vector3(3.0, 3.5, 0.0), Mats.mat("steel_grey"), "SignPost", 8)
	BuildKit.box(self, Vector3(9.0, 3.4, 0.22), pos + Vector3(0.0, 6.4, 0.0), Mats.mat("nasa_blue"), "RoadSign")
	var label := BuildKit.label(self, "LC-39A  →", pos + Vector3(0.0, 6.4, 0.16), 0.014, Color(0.95, 0.97, 1.0), "SignLabel")
	label.font_size = 128
	label.rotation_degrees.y = 180.0
