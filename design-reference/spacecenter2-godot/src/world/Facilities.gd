# src/world/Facilities.gd
# Support facilities around the pad: VAB, Launch Control Center, crawler
# transporter, perimeter fence, distant Pad 39B and site props.
class_name FacilitiesBuilder
extends Node3D

const LCC_POS := Vector3(-800.0, 0.0, 300.0)
const CRAWLER_POS := Vector3(-300.0, 0.0, 42.0)


func _ready() -> void:
	_build_vab()
	_build_lcc()
	_build_crawler()
	_build_collision()
	_build_fence()
	_build_pad_39b()
	_build_props()
	_build_details()


func _build_collision() -> void:
	var body := StaticBody3D.new()
	body.name = "FacilityCollision"
	add_child(body)

	# VAB shell: walls only, so the high-bay door is a real opening.
	BuildKit.collision_box(body, Vector3(158.0, 160.0, 2.0), Vector3(-900.0, 80.0, -248.0))
	BuildKit.collision_box(body, Vector3(158.0, 160.0, 2.0), Vector3(-900.0, 80.0, -32.0))
	BuildKit.collision_box(body, Vector3(2.0, 160.0, 218.0), Vector3(-978.0, 80.0, -140.0))
	BuildKit.collision_box(body, Vector3(2.0, 160.0, 86.0), Vector3(-820.0, 80.0, -74.0))
	BuildKit.collision_box(body, Vector3(2.0, 160.0, 86.0), Vector3(-820.0, 80.0, -206.0))
	BuildKit.collision_box(body, Vector3(20.0, 80.0, 18.0), Vector3(-895.0, 40.0, -140.0))
	BuildKit.collision_box(body, Vector3(12.0, 22.0, 56.0), Vector3(-815.0, 11.0, -64.0))

	BuildKit.collision_box(body, Vector3(104.0, 62.0, 76.0), Vector3(-1034.0, 31.0, -78.0))
	BuildKit.collision_box(body, Vector3(4.0, 3.2, 10.0), Vector3(-838.0, 1.6, -200.0))
	BuildKit.collision_box(body, Vector3(4.0, 3.2, 6.0), Vector3(-838.0, 1.6, -180.0))
	BuildKit.collision_box(body, Vector3(8.0, 3.6, 4.0), Vector3(-706.0, 1.8, 42.5))
	BuildKit.collision_box(body, Vector3(14.0, 6.0, 10.0), Vector3(-618.0, 3.0, 18.0))
	BuildKit.collision_box(body, Vector3(5.0, 3.5, 4.0), Vector3(-588.0, 1.75, 83.0))
	BuildKit.collision_box(body, Vector3(10.0, 3.2, 4.5), Vector3(-850.0, 1.6, 329.0))
	BuildKit.collision_box(body, Vector3(14.0, 0.4, 12.0), Vector3(-910.0, 68.0, -140.0))
	BuildKit.collision_box(body, Vector3(6.0, 0.4, 2.4), Vector3(-901.0, 68.0, -140.0))
	BuildKit.collision_box(body, Vector3(0.3, 3.4, 12.0), Vector3(-915.85, 69.9, -140.0))
	BuildKit.collision_box(body, Vector3(12.0, 3.4, 0.3), Vector3(-910.0, 69.9, -144.85))
	BuildKit.collision_box(body, Vector3(12.0, 3.4, 0.3), Vector3(-910.0, 69.9, -135.15))
	BuildKit.collision_box(body, Vector3(0.3, 3.4, 3.75), Vector3(-904.15, 69.9, -143.125))
	BuildKit.collision_box(body, Vector3(0.3, 3.4, 3.75), Vector3(-904.15, 69.9, -136.875))
	BuildKit.collision_box(body, Vector3(6.0, 11.0, 6.0), Vector3(-895.0, 65.5, -140.0))
	BuildKit.collision_box(body, Vector3(44.0, 10.0, 38.0), CRAWLER_POS + Vector3(0.0, 7.0, 0.0))



func _build_vab() -> void:
	var pos := Vector3(-900.0, 0.0, -140.0)
	var hx := 79.0
	var hz := 109.0
	var height := 160.0
	var concrete := Mats.mat("concrete")
	var dark := Mats.mat("concrete_dark")

	# Shell, not a solid block: four walls, floor and roof, with the east wall
	# split around the high-bay door so the player can walk inside.
	BuildKit.box(self, Vector3(hx * 2.0, 0.1, hz * 2.0), Vector3(pos.x, -0.03, pos.z), concrete, "VABFloor")
	BuildKit.box(self, Vector3(hx * 2.0, 2.0, hz * 2.0), Vector3(pos.x, height - 1.0, pos.z), concrete, "VABRoof")
	BuildKit.box(self, Vector3(hx * 2.0, height, 2.0), Vector3(pos.x, height * 0.5, pos.z - hz + 1.0), concrete, "VABWall")
	BuildKit.box(self, Vector3(hx * 2.0, height, 2.0), Vector3(pos.x, height * 0.5, pos.z + hz - 1.0), concrete, "VABWall")
	BuildKit.box(self, Vector3(2.0, height, hz * 2.0), Vector3(pos.x - hx + 1.0, height * 0.5, pos.z), concrete, "VABWall")

	# East wall: two side panels plus a header over the 46 m door opening.
	var door_half := 23.0
	var panel_w := hz - door_half
	BuildKit.box(self, Vector3(2.0, height, panel_w), Vector3(pos.x + hx - 1.0, height * 0.5, pos.z + door_half + panel_w * 0.5), concrete, "VABWall")
	BuildKit.box(self, Vector3(2.0, height, panel_w), Vector3(pos.x + hx - 1.0, height * 0.5, pos.z - door_half - panel_w * 0.5), concrete, "VABWall")
	BuildKit.box(self, Vector3(2.0, 20.0, door_half * 2.0), Vector3(pos.x + hx - 1.0, height - 10.0, pos.z), concrete, "VABDoorHeader")

	# Door jamb and header trim so the opening reads as a real portal.
	for side in [-1.0, 1.0]:
		BuildKit.box(self, Vector3(2.4, 142.0, 1.4), Vector3(pos.x + hx + 1.2, 71.0, pos.z + side * 23.4), Mats.mat("yellow"), "DoorJamb")
	BuildKit.box(self, Vector3(2.4, 1.6, 48.0), Vector3(pos.x + hx + 1.2, 141.6, pos.z), Mats.mat("yellow"), "DoorHeaderTrim")

	# Retracted door leaves parked either side of the opening.
	for side in [-1.0, 1.0]:
		BuildKit.box(self, Vector3(1.4, 140.0, 21.0), Vector3(pos.x + hx + 0.9, 70.0, pos.z + side * 34.0), Mats.mat("black"), "VABDoorLeaf")
		BuildKit.box(self, Vector3(1.6, 1.2, 21.2), Vector3(pos.x + hx + 1.0, 140.6, pos.z + side * 34.0), Mats.mat("yellow"), "DoorLeafTrim")
		for i in 6:
			BuildKit.box(self, Vector3(1.55, 0.4, 21.0), Vector3(pos.x + hx + 1.0, 20.0 + float(i) * 20.0, pos.z + side * 34.0), Mats.mat("steel_grey"), "DoorLeafSeam")
		BuildKit.box(self, Vector3(1.6, 2.0, 21.2), Vector3(pos.x + hx + 1.0, 70.0, pos.z + side * 34.0), Mats.mat("yellow"), "DoorLeafStripe")

	# Vertical ribs on the east face, skipping the door opening.
	for i in 18:
		var z := pos.z - 104.0 + float(i) * 12.0
		if absf(z - pos.z) < 27.0:
			continue
		BuildKit.box(self, Vector3(1.6, 158.0, 1.6), Vector3(pos.x + hx, 80.0, z), dark, "VABRib")

	BuildKit.box(self, Vector3(1.8, 2.0, hz * 2.0), Vector3(pos.x + hx, 152.0, pos.z), dark, "VABBelt")
	BuildKit.box(self, Vector3(1.6, 1.2, 56.0), Vector3(pos.x + hx + 0.4, 142.0, pos.z), Mats.mat("steel_grey"), "DoorTrack")

	# Low bay annex.
	BuildKit.box(self, Vector3(104.0, 62.0, 76.0), Vector3(pos.x - 134.0, 31.0, pos.z + 62.0), dark, "VABLowBay")
	BuildKit.box(self, Vector3(100.0, 2.0, 72.0), Vector3(pos.x - 134.0, 62.0, pos.z + 62.0), Mats.mat("steel_grey"), "LowBayRoof")

	# Roof plant.
	BuildKit.box(self, Vector3(30.0, 6.0, 40.0), Vector3(pos.x - 30.0, 163.0, pos.z - 40.0), Mats.mat("steel_grey"), "RoofPlant")

	_build_vab_interior(pos)
	_build_comms_room(pos)
	_build_vab_necessities(pos)


func _build_vab_interior(pos: Vector3) -> void:
	var hx := 79.0
	var hz := 109.0
	var steel := Mats.mat("steel_grey")
	var white := Mats.mat("steel_white")

	# One open high bay: the vehicle stands on the centre line so it is framed
	# by the door when the player walks in from the crawlerway.
	# Work platforms along both long walls, with railings.
	for level in [24.0, 46.0, 68.0, 90.0, 112.0, 132.0]:
		for z in [pos.z - hz + 6.0, pos.z + hz - 6.0]:
			BuildKit.box(self, Vector3(150.0, 0.3, 9.0), Vector3(pos.x, level, z), steel, "WorkPlatform")
			BuildKit.beam(self, Vector3(pos.x - 74.0, level + 1.1, z), Vector3(pos.x + 74.0, level + 1.1, z), 0.1, white, "PlatformRail")
			BuildKit.beam(self, Vector3(pos.x - 74.0, level + 0.6, z), Vector3(pos.x + 74.0, level + 0.6, z), 0.08, white, "PlatformRail")
		# West wall platform.
		BuildKit.box(self, Vector3(9.0, 0.3, 190.0), Vector3(pos.x - hx + 6.0, level, pos.z), steel, "WorkPlatform")

	# Vertical support columns inside.
	for z in [pos.z - hz + 14.0, pos.z + hz - 14.0]:
		for x in [pos.x - 60.0, pos.x - 20.0, pos.x + 20.0, pos.x + 60.0]:
			BuildKit.box(self, Vector3(1.2, 158.0, 1.2), Vector3(x, 79.0, z), steel, "BayColumn")

	# Bridge crane rails and two cranes.
	for z in [pos.z - hz + 18.0, pos.z + hz - 18.0]:
		BuildKit.box(self, Vector3(150.0, 0.6, 0.6), Vector3(pos.x, 138.0, z), Mats.mat("rust"), "CraneRail")
	for z in [pos.z - 40.0, pos.z + 40.0]:
		BuildKit.box(self, Vector3(150.0, 2.0, 3.0), Vector3(pos.x, 139.5, z), Mats.mat("yellow"), "BridgeCrane")
		BuildKit.box(self, Vector3(3.0, 2.5, 4.0), Vector3(pos.x - 10.0, 137.0, z), steel, "CraneTrolley")
		BuildKit.beam(self, Vector3(pos.x - 10.0, 135.5, z), Vector3(pos.x - 10.0, 126.0, z), 0.12, Mats.mat("black"), "CraneCable")
		BuildKit.box(self, Vector3(1.6, 1.2, 1.6), Vector3(pos.x - 10.0, 125.4, z), Mats.mat("rust"), "CraneHook")

	# Bay lighting.
	for i in 6:
		var x := pos.x - 60.0 + float(i) * 24.0
		for z in [pos.z - 70.0, pos.z + 70.0]:
			BuildKit.box(self, Vector3(6.0, 0.35, 2.0), Vector3(x, 136.0, z), Mats.mat("lamp"), "BayLamp")
	for i in 4:
		var light := OmniLight3D.new()
		light.position = Vector3(pos.x - 50.0 + float(i) * 34.0, 100.0, pos.z)
		light.light_color = Color(1.0, 0.95, 0.85)
		light.light_energy = 2.4
		light.omni_range = 120.0
		light.shadow_enabled = false
		add_child(light)

	# Floor markings and bay number.
	for z in [pos.z - 30.0, pos.z + 30.0]:
		BuildKit.box(self, Vector3(120.0, 0.05, 0.5), Vector3(pos.x, 0.05, z), Mats.mat("yellow"), "BayLine")
	var bay_one := BuildKit.label(self, "HIGH BAY 1", Vector3(pos.x, 0.1, pos.z + 78.0), 0.06, Color(0.88, 0.72, 0.12), "BayLabel")
	bay_one.rotation_degrees.x = -90.0
	bay_one.shaded = false

	# A second SLS stack waiting inside the high bay.
	_build_indoor_stack(Vector3(pos.x + 5.0, 0.0, pos.z))


func _build_indoor_stack(base: Vector3) -> void:
	# Build into a rig rotated 90 degrees so the boosters sit left/right of the
	# core from the door, framing the orange core stage.
	var rig := Node3D.new()
	rig.name = "IndoorVehicle"
	rig.position = base
	rig.rotation_degrees.y = 90.0
	add_child(rig)

	var foam := Mats.mat("foam")
	var white := Mats.mat("steel_white")
	var grey := Mats.mat("steel_grey")

	BuildKit.cylinder(rig, 3.0, 60.0, Vector3(0.0, 30.0, 0.0), foam, "IndoorCore", 24)
	for y in [14.0, 34.0, 52.0]:
		BuildKit.cylinder(rig, 3.03, 0.5, Vector3(0.0, y, 0.0), Mats.mat("black"), "IndoorBand", 24)
	BuildKit.cylinder(rig, 3.0, 11.0, Vector3(0.0, 65.5, 0.0), white, "IndoorUpperStage", 24)
	BuildKit.cone(rig, 1.0, 2.2, 6.0, Vector3(0.0, 74.0, 0.0), white, "IndoorAdapter", 24)
	for side in [-1.0, 1.0]:
		var x: float = side * 6.2
		BuildKit.cylinder(rig, 2.0, 50.0, Vector3(x, 25.0, 0.0), white, "IndoorSRB", 20)
		BuildKit.cone(rig, 0.4, 2.0, 6.0, Vector3(x, 53.0, 0.0), white, "IndoorSRBNose", 20)
		BuildKit.cone(rig, 2.2, 1.4, 2.5, Vector3(x, -1.0, 0.0), Mats.mat("engine"), "IndoorNozzle", 16)

	# Transport stand under the stack.
	BuildKit.box(rig, Vector3(18.0, 1.4, 14.0), Vector3(0.0, 0.7, 0.0), Mats.mat("rust"), "IndoorStand")
	BuildKit.box(rig, Vector3(16.0, 0.3, 12.0), Vector3(0.0, 1.55, 0.0), grey, "IndoorStandDeck")


func _build_vab_necessities(pos: Vector3) -> void:
	var steel := Mats.mat("steel_grey")
	var white := Mats.mat("steel_white")
	var red := Mats.mat("red")
	var teal := Mats.mat("screen")
	# Illuminated exit signs on the inside of each wall, near the emergency doors.
	BuildKit.box(self, Vector3(0.2, 0.6, 1.8), Vector3(pos.x - 76.8, 6.0, -200.0), teal, "ExitSign")
	BuildKit.box(self, Vector3(0.2, 0.6, 1.8), Vector3(pos.x - 76.8, 6.0, -80.0), teal, "ExitSign")
	BuildKit.box(self, Vector3(1.8, 0.6, 0.2), Vector3(pos.x + 0.0, 6.0, pos.z - 106.7), teal, "ExitSign")
	BuildKit.box(self, Vector3(1.8, 0.6, 0.2), Vector3(pos.x + 0.0, 6.0, pos.z + 106.6), teal, "ExitSign")
	# Fire extinguisher cabinets on the walls.
	for p in [Vector3(pos.x + 40.0, 1.2, pos.z - 106.4), Vector3(pos.x - 40.0, 1.2, pos.z - 106.4), Vector3(pos.x + 30.0, 1.2, pos.z + 106.6)]:
		BuildKit.box(self, Vector3(0.9, 1.6, 0.4), p, red, "ExtinguisherCabinet")
	BuildKit.box(self, Vector3(0.4, 1.6, 0.9), Vector3(pos.x - 76.6, 1.2, pos.z + 40.0), red, "ExtinguisherCabinet")
	# Floor drains across the bay floor.
	for x in [-950.0, -920.0, -890.0, -860.0]:
		for z in [-200.0, -80.0]:
			BuildKit.box(self, Vector3(1.2, 0.03, 1.2), Vector3(x, 0.12, z), steel, "FloorDrain")
	# Site office and restroom modules beside the high-bay door.
	BuildKit.box(self, Vector3(4.0, 3.2, 10.0), Vector3(-838.0, 1.6, -200.0), white, "OfficeModule")
	BuildKit.box(self, Vector3(4.2, 0.2, 10.2), Vector3(-838.0, 3.3, -200.0), steel, "OfficeModuleRoof")
	BuildKit.box(self, Vector3(0.1, 1.6, 1.4), Vector3(-835.9, 1.2, -200.0), Mats.mat("glass"), "OfficeWindow")
	var office := BuildKit.label(self, "OPERATIONS", Vector3(-835.8, 2.6, -200.0), 0.02, Color(0.9, 0.95, 1.0), "OfficeLabel")
	office.rotation_degrees.y = 90.0
	office.font_size = 96
	BuildKit.box(self, Vector3(4.0, 3.2, 6.0), Vector3(-838.0, 1.6, -180.0), white, "RestroomModule")
	BuildKit.box(self, Vector3(4.2, 0.2, 6.2), Vector3(-838.0, 3.3, -180.0), steel, "RestroomModuleRoof")
	var restroom := BuildKit.label(self, "RESTROOM", Vector3(-835.8, 2.6, -180.0), 0.02, Color(0.9, 0.95, 1.0), "RestroomModuleLabel")
	restroom.rotation_degrees.y = 90.0
	restroom.font_size = 96


func _build_comms_room(pos: Vector3) -> void:
	# Steel mezzanine beside the indoor stack, with a crew access bridge to the upper stage.
	var steel := Mats.mat("steel_grey")
	var white := Mats.mat("steel_white")
	var glass := Mats.mat("glass")
	var deck := Vector3(pos.x - 10.0, 68.0, pos.z)
	BuildKit.box(self, Vector3(14.0, 0.4, 12.0), deck, steel, "CommsDeck")
	for x in [-6.5, 6.5]:
		for z in [-5.5, 5.5]:
			BuildKit.box(self, Vector3(0.8, 68.0, 0.8), deck + Vector3(x, -34.0, z), steel, "CommsColumn")

	# Room shell with a door opening on the east wall toward the vehicle.
	var wall_y := 69.9
	BuildKit.box(self, Vector3(0.3, 3.4, 12.0), Vector3(-915.85, wall_y, -140.0), white, "CommsWall")
	BuildKit.box(self, Vector3(12.0, 3.4, 0.3), Vector3(-910.0, wall_y, -144.85), white, "CommsWall")
	BuildKit.box(self, Vector3(12.0, 3.4, 0.3), Vector3(-910.0, wall_y, -135.15), white, "CommsWall")
	BuildKit.box(self, Vector3(0.3, 3.4, 3.75), Vector3(-904.15, wall_y, -143.125), white, "CommsWall")
	BuildKit.box(self, Vector3(0.3, 3.4, 3.75), Vector3(-904.15, wall_y, -136.875), white, "CommsWall")
	BuildKit.box(self, Vector3(0.3, 1.2, 2.5), Vector3(-904.15, 71.0, -140.0), white, "CommsDoorHeader")
	BuildKit.box(self, Vector3(11.4, 2.0, 0.1), Vector3(-910.0, 69.8, -145.0), glass, "CommsWindow")
	BuildKit.box(self, Vector3(12.4, 0.3, 10.4), Vector3(-910.0, 71.75, -140.0), steel, "CommsRoof")
	var label := BuildKit.label(self, "COMMS", Vector3(-910.0, 70.6, -145.2), 0.03, Color(0.95, 0.97, 1.0), "CommsLabel")
	label.rotation_degrees.y = 180.0
	label.font_size = 128

	# Operator consoles along the west wall, with screens facing the room.
	for z in [-143.0, -140.0, -137.0]:
		BuildKit.box(self, Vector3(1.2, 0.9, 2.0), Vector3(-914.0, 68.65, z), Mats.mat("black"), "CommsConsole")
		BuildKit.box(self, Vector3(0.1, 0.8, 1.6), Vector3(-913.4, 69.6, z), Mats.mat("screen"), "CommsScreen")
	for z in [-142.0, -138.0]:
		BuildKit.box(self, Vector3(3.0, 0.1, 0.6), Vector3(-910.0, 71.45, z), Mats.mat("lamp"), "CommsLight")
	var light := OmniLight3D.new()
	light.position = Vector3(-910.0, 70.5, -140.0)
	light.light_color = Color(0.85, 0.95, 1.0)
	light.light_energy = 1.4
	light.omni_range = 12.0
	light.shadow_enabled = false
	add_child(light)

	# Antenna mast and dish on the roof.
	BuildKit.cylinder(self, 0.06, 4.0, Vector3(-907.0, 73.9, -140.0), steel, "CommsMast", 6)
	var dish := BuildKit.sphere(self, 1.2, Vector3(-907.0, 76.0, -140.0), white, "CommsDish", 16)
	dish.scale = Vector3(1.0, 0.35, 1.0)

	# Crew access bridge from the room to the indoor vehicle's upper stage.
	BuildKit.box(self, Vector3(6.0, 0.4, 2.4), Vector3(-901.0, 68.0, -140.0), steel, "CrewBridgeFloor")
	BuildKit.box(self, Vector3(6.0, 0.2, 2.4), Vector3(-901.0, 70.3, -140.0), white, "CrewBridgeRoof")
	for z in [-141.2, -138.8]:
		BuildKit.box(self, Vector3(6.0, 2.0, 0.15), Vector3(-901.0, 69.2, z), glass, "CrewBridgeWall")
	var hatch := BuildKit.cylinder(self, 1.1, 0.2, Vector3(-898.0, 69.2, -140.0), Mats.mat("yellow"), "CrewHatch", 16)
	hatch.rotation_degrees.z = 90.0


func _build_lcc() -> void:
	var pos := LCC_POS
	# Walls, floors and rooms come from LCCInterior.gd so the building can be entered.
	BuildKit.box(self, Vector3(74.0, 1.2, 50.0), pos + Vector3(0.0, 24.6, 0.0), Mats.mat("steel_grey"), "LCCRoof")

	# Window bands on the south face.
	for y in [7.0, 13.5, 20.0]:
		BuildKit.box(self, Vector3(64.0, 2.6, 0.4), pos + Vector3(0.0, y, 23.2), Mats.mat("glass"), "LCCWindows")

	# Entrance canopy.
	BuildKit.box(self, Vector3(16.0, 0.7, 8.0), pos + Vector3(0.0, 5.2, 27.0), Mats.mat("steel_white"), "Canopy")
	for x in [-6.0, 6.0]:
		BuildKit.cylinder(self, 0.25, 5.0, pos + Vector3(x, 2.6, 30.0), Mats.mat("steel_grey"), "CanopyPost", 8)

	# Roof antenna.
	BuildKit.cylinder(self, 0.3, 6.0, pos + Vector3(24.0, 28.0, -8.0), Mats.mat("steel_grey"), "AntennaMast", 8)
	var dish := BuildKit.sphere(self, 2.2, pos + Vector3(24.0, 31.0, -8.0), Mats.mat("steel_white"), "AntennaDish", 16)
	dish.scale = Vector3(1.0, 0.4, 1.0)

	var label := BuildKit.label(self, "LAUNCH CONTROL CENTER", pos + Vector3(0.0, 22.8, 23.5), 0.012, Color(0.95, 0.97, 1.0), "LCCLabel")
	label.font_size = 96


func _build_crawler() -> void:
	var pos := CRAWLER_POS
	var steel := Mats.mat("steel_grey")
	var white := Mats.mat("steel_white")
	var black := Mats.mat("black")
	var yellow := Mats.mat("yellow")

	# Four track bogies, long along the direction of travel (x) on the crawlerway.
	for x in [-14.0, 14.0]:
		for z in [-12.5, 12.5]:
			var bogie := pos + Vector3(x, 0.0, z)
			BuildKit.box(self, Vector3(18.0, 2.0, 3.4), bogie + Vector3(0.0, 1.0, 0.0), black, "TrackBelt")
			BuildKit.box(self, Vector3(14.0, 1.0, 4.0), bogie + Vector3(0.0, 3.0, 0.0), steel, "BogieFrame")
			for ex in [-8.5, 8.5]:
				var sprocket := BuildKit.cylinder(self, 1.3, 3.6, bogie + Vector3(ex, 2.2, 0.0), steel, "Sprocket", 12)
				sprocket.rotation_degrees.x = 90.0
			for i in 12:
				BuildKit.box(self, Vector3(1.3, 0.2, 3.6), bogie + Vector3(-7.975 + float(i) * 1.45, 2.1, 0.0), Mats.mat("rust"), "TrackShoe")

	# Lower truss plenum, main deck and a girder grid on top.
	BuildKit.box(self, Vector3(40.0, 2.5, 34.0), pos + Vector3(0.0, 4.25, 0.0), steel, "DeckPlenum")
	BuildKit.box(self, Vector3(44.0, 0.5, 38.0), pos + Vector3(0.0, 6.25, 0.0), steel, "CrawlerDeck")
	for i in 11:
		BuildKit.box(self, Vector3(0.5, 0.6, 38.0), pos + Vector3(-20.0 + float(i) * 4.0, 6.8, 0.0), white, "DeckGirder")
	for i in 9:
		BuildKit.box(self, Vector3(44.0, 0.6, 0.5), pos + Vector3(0.0, 6.8, -16.0 + float(i) * 4.0), white, "DeckGirder")

	# Hydraulic leveling jacks at the deck corners.
	for x in [-18.0, 18.0]:
		for z in [-15.0, 15.0]:
			BuildKit.cylinder(self, 0.9, 4.2, pos + Vector3(x, 3.1, z), yellow, "LevelingJack", 12)

	# Operator cab on the front-left corner, glazed on the travel-facing side.
	var cab := pos + Vector3(-16.0, 0.0, 14.0)
	BuildKit.box(self, Vector3(6.0, 4.0, 5.0), cab + Vector3(0.0, 8.5, 0.0), white, "CrawlerCab")
	BuildKit.box(self, Vector3(0.1, 2.2, 4.2), cab + Vector3(-3.05, 9.0, 0.0), Mats.mat("glass"), "CabGlazing")
	BuildKit.box(self, Vector3(6.2, 0.3, 5.2), cab + Vector3(0.0, 10.75, 0.0), steel, "CabRoof")

	# Diesel generator sets and hydraulic power units on the deck.
	for x in [8.0, 16.0]:
		BuildKit.box(self, Vector3(5.5, 3.0, 4.0), pos + Vector3(x, 8.0, -12.0), black, "GensetHousing")
	BuildKit.box(self, Vector3(6.0, 2.0, 4.0), pos + Vector3(0.0, 7.5, 12.0), steel, "HydraulicPowerUnit")


func _build_fence() -> void:
	var post_mat := Mats.mat("steel_grey")
	var rail_mat := Mats.mat("steel_white")

	# South and east perimeter only, so the crawlerway stays open.
	for i in 14:
		var x := -130.0 + float(i) * 20.0
		BuildKit.cylinder(self, 0.12, 3.0, Vector3(x, 1.5, 130.0), post_mat, "FencePost", 6)
		BuildKit.cylinder(self, 0.12, 3.0, Vector3(130.0, 1.5, x), post_mat, "FencePost", 6)

	BuildKit.box(self, Vector3(260.0, 0.08, 0.08), Vector3(0.0, 2.8, 130.0), rail_mat, "FenceRail")
	BuildKit.box(self, Vector3(260.0, 0.08, 0.08), Vector3(0.0, 1.7, 130.0), rail_mat, "FenceRail")
	BuildKit.box(self, Vector3(0.08, 0.08, 260.0), Vector3(130.0, 2.8, 0.0), rail_mat, "FenceRail")
	BuildKit.box(self, Vector3(0.08, 0.08, 260.0), Vector3(130.0, 1.7, 0.0), rail_mat, "FenceRail")


func _build_pad_39b() -> void:
	# Distant sister pad: silhouette only.
	var pos := Vector3(-120.0, 0.0, -760.0)
	BuildKit.box(self, Vector3(90.0, 5.0, 90.0), pos + Vector3(0.0, 2.5, 0.0), Mats.mat("concrete_dark"), "Pad39B")
	BuildKit.box(self, Vector3(8.0, 92.0, 8.0), pos + Vector3(0.0, 51.0, 0.0), Mats.mat("tower"), "Tower39B")
	BuildKit.box(self, Vector3(4.0, 76.0, 4.0), pos + Vector3(0.0, 43.0, 0.0), Mats.mat("steel_grey"), "TowerCore39B")
	BuildKit.box(self, Vector3(26.0, 1.2, 2.0), pos + Vector3(-10.0, 96.0, 0.0), Mats.mat("rust"), "Crane39B")
	BuildKit.cylinder(self, 0.8, 110.0, pos + Vector3(-55.0, 55.0, 30.0), Mats.mat("steel_white"), "Mast39B", 8)


func _build_props() -> void:
	# Site vehicles give the complex a sense of scale.
	var spots: Array[Vector3] = [
		Vector3(-700.0, 0.0, -20.0),
		Vector3(-660.0, 0.0, 60.0),
		Vector3(60.0, 0.0, 120.0),
	]
	for spot in spots:
		BuildKit.box(self, Vector3(5.0, 1.6, 2.2), spot + Vector3(0.0, 1.1, 0.0), Mats.mat("steel_white"), "SiteVan")
		BuildKit.box(self, Vector3(2.0, 1.2, 2.1), spot + Vector3(-1.2, 2.4, 0.0), Mats.mat("glass"), "VanCab")
		for x in [-1.6, 1.6]:
			for z in [-0.9, 0.9]:
				var wheel := BuildKit.cylinder(self, 0.45, 0.35, spot + Vector3(x, 0.45, z), Mats.mat("black"), "Wheel", 8)
				wheel.rotation_degrees.z = 90.0

	# Flagpole by the LCC.
	var pole := Vector3(-852.0, 0.0, 300.0)
	BuildKit.cylinder(self, 0.18, 24.0, pole + Vector3(0.0, 12.0, 0.0), Mats.mat("steel_white"), "Flagpole", 8)
	BuildKit.box(self, Vector3(3.2, 2.0, 0.08), pole + Vector3(1.7, 22.6, 0.0), Mats.mat("red"), "Flag")
	BuildKit.box(self, Vector3(1.4, 1.1, 0.09), pole + Vector3(0.8, 23.0, 0.0), Mats.mat("ops_blue"), "FlagCanton")


func _build_details() -> void:
	_build_vab_details()
	_build_lcc_details()
	_build_crawler_details()
	_build_parking()
	_build_utilities()
	_build_site_details()


func _build_vab_details() -> void:
	var pos := Vector3(-900.0, 0.0, -140.0)
	var band := Mats.mat("concrete_dark")
	var east := pos.x + 79.6
	var west := pos.x - 79.6
	var north := pos.z - 109.2
	var south := pos.z + 109.2

	# Horizontal construction bands on all four faces. East bands stop at the door.
	for i in range(1, 8):
		var y := float(i) * 20.0
		BuildKit.box(self, Vector3(0.5, 0.7, 86.0), Vector3(east, y, pos.z - 66.0), band, "VABBand")
		BuildKit.box(self, Vector3(0.5, 0.7, 86.0), Vector3(east, y, pos.z + 66.0), band, "VABBand")
		BuildKit.box(self, Vector3(0.5, 0.7, 218.0), Vector3(west, y, pos.z), band, "VABBand")
		BuildKit.box(self, Vector3(158.0, 0.7, 0.5), Vector3(pos.x, y, north), band, "VABBand")
		BuildKit.box(self, Vector3(158.0, 0.7, 0.5), Vector3(pos.x, y, south), band, "VABBand")

	# Corner pilasters on all four faces.
	for z in [pos.z - 108.0, pos.z + 108.0]:
		BuildKit.box(self, Vector3(2.2, 160.0, 2.2), Vector3(east, 80.0, z), band, "VABPilaster")
		BuildKit.box(self, Vector3(2.2, 160.0, 2.2), Vector3(west, 80.0, z), band, "VABPilaster")
	for x in [pos.x - 78.0, pos.x + 78.0]:
		BuildKit.box(self, Vector3(2.2, 160.0, 2.2), Vector3(x, 80.0, north), band, "VABPilaster")
		BuildKit.box(self, Vector3(2.2, 160.0, 2.2), Vector3(x, 80.0, south), band, "VABPilaster")

	# Vertical fins on the north, south and west faces.
	for i in 13:
		var x := pos.x - 72.0 + float(i) * 12.0
		BuildKit.box(self, Vector3(1.6, 158.0, 1.6), Vector3(x, 80.0, north - 0.2), band, "VABFin")
		BuildKit.box(self, Vector3(1.6, 158.0, 1.6), Vector3(x, 80.0, south + 0.2), band, "VABFin")
		var z := pos.z - 96.0 + float(i) * 16.0
		BuildKit.box(self, Vector3(1.6, 158.0, 1.6), Vector3(west - 0.2, 80.0, z), band, "VABFin")

	# High-bay door leaf seams and the track the doors slide on.
	for i in 6:
		BuildKit.box(self, Vector3(0.35, 0.5, 46.0), Vector3(pos.x + 80.1, 22.0 + float(i) * 22.0, pos.z), Mats.mat("steel_grey"), "DoorLeaf")
	BuildKit.box(self, Vector3(0.6, 1.2, 56.0), Vector3(pos.x + 80.2, 142.0, pos.z), Mats.mat("steel_grey"), "DoorTrack")

	# Low bay vehicle door.
	BuildKit.box(self, Vector3(1.0, 34.0, 26.0), Vector3(pos.x - 82.2, 17.0, pos.z + 62.0), Mats.mat("black"), "LowBayDoor")
	for i in 3:
		BuildKit.box(self, Vector3(1.2, 34.0, 0.6), Vector3(pos.x - 82.0, 17.0, pos.z + 53.0 + float(i) * 9.0), Mats.mat("steel_grey"), "LowBaySeam")

	# Roof crane rail and a service crane.
	BuildKit.box(self, Vector3(150.0, 0.6, 1.4), Vector3(pos.x, 161.5, pos.z - 20.0), Mats.mat("rust"), "RoofRail")
	BuildKit.box(self, Vector3(150.0, 0.6, 1.4), Vector3(pos.x, 161.5, pos.z + 20.0), Mats.mat("rust"), "RoofRail")
	BuildKit.box(self, Vector3(8.0, 5.0, 6.0), Vector3(pos.x + 20.0, 164.0, pos.z), Mats.mat("yellow"), "RoofCrane")

	# Rooftop flag and vents.
	BuildKit.cylinder(self, 0.2, 18.0, Vector3(pos.x + 60.0, 169.0, pos.z + 80.0), Mats.mat("steel_white"), "VABFlagpole", 8)
	BuildKit.box(self, Vector3(3.0, 1.9, 0.08), Vector3(pos.x + 61.6, 177.0, pos.z + 80.0), Mats.mat("red"), "VABFlag")
	for i in 6:
		BuildKit.box(self, Vector3(4.0, 1.4, 4.0), Vector3(pos.x - 50.0 + float(i) * 18.0, 161.0, pos.z + 90.0), Mats.mat("steel_grey"), "RoofVent")

	# Lightning protection masts around the high bay.
	for offset in [Vector3(-95.0, 0.0, 120.0), Vector3(95.0, 0.0, 120.0), Vector3(-95.0, 0.0, -120.0)]:
		var base: Vector3 = pos + offset
		BuildKit.cylinder(self, 0.45, 150.0, base + Vector3(0.0, 75.0, 0.0), Mats.mat("steel_white"), "VABMast", 10)
		BuildKit.cylinder(self, 2.6, 1.0, base + Vector3(0.0, 0.5, 0.0), Mats.mat("concrete_dark"), "VABMastBase", 10)

	# Utility pipes running along the east wall.
	for i in 3:
		BuildKit.cylinder(self, 0.3, 150.0, Vector3(east + 1.4, 80.0, pos.z - 90.0 + float(i) * 3.0), Mats.mat("steel_grey"), "VABPipe", 8)

	var steel := Mats.mat("steel_grey")
	var white := Mats.mat("steel_white")
	var glass := Mats.mat("glass")

	# Door sill and Lunaspis wordmark on the high-bay face.
	BuildKit.box(self, Vector3(4.0, 0.6, 46.0), Vector3(pos.x + 81.0, 0.3, pos.z), steel, "DoorSill")
	var wordmark := BuildKit.label(self, "LUNASPIS", Vector3(pos.x + 79.4, 108.0, pos.z - 55.0), 0.06, Color(0.96, 0.97, 1.0), "LunaspisLabel")
	wordmark.rotation_degrees.y = 90.0
	wordmark.font_size = 200

	# American flag hung on the north face.
	var flag_x := pos.x + 45.0
	var flag_z := pos.z - 109.6
	var stripe := 10.0 / 13.0
	BuildKit.box(self, Vector3(20.6, 10.6, 0.5), Vector3(flag_x, 120.0, pos.z - 109.25), steel, "FlagBacking")
	for i in 13:
		var y := 125.0 - (float(i) + 0.5) * stripe
		BuildKit.box(self, Vector3(20.0, stripe, 0.15), Vector3(flag_x, y, flag_z), Mats.mat("red" if i % 2 == 0 else "steel_white"), "FlagStripe")
	BuildKit.box(self, Vector3(8.0, 5.4, 0.18), Vector3(flag_x + 6.0, 122.3, flag_z), Mats.mat("ops_blue"), "FlagCanton")

	# Roof parapet, penthouse, exhaust stacks and chiller units.
	BuildKit.box(self, Vector3(158.4, 1.2, 0.4), Vector3(pos.x, 160.6, north), band, "RoofParapet")
	BuildKit.box(self, Vector3(158.4, 1.2, 0.4), Vector3(pos.x, 160.6, south), band, "RoofParapet")
	BuildKit.box(self, Vector3(0.4, 1.2, 218.4), Vector3(west, 160.6, pos.z), band, "RoofParapet")
	BuildKit.box(self, Vector3(0.4, 1.2, 218.4), Vector3(east, 160.6, pos.z), band, "RoofParapet")
	BuildKit.box(self, Vector3(20.0, 5.0, 18.0), Vector3(pos.x + 35.0, 162.5, pos.z - 70.0), white, "RoofPenthouse")
	for x in [pos.x + 28.0, pos.x + 42.0]:
		BuildKit.cylinder(self, 0.9, 7.0, Vector3(x, 168.5, pos.z - 70.0), steel, "RoofStack", 12)
		BuildKit.cylinder(self, 1.2, 0.5, Vector3(x, 172.2, pos.z - 70.0), band, "RoofStackCap", 12)
	for i in 4:
		BuildKit.box(self, Vector3(8.0, 3.0, 5.0), Vector3(pos.x - 60.0 + float(i) * 20.0, 161.5, pos.z + 40.0), white, "RoofChiller")

	# Two-storey white annex on the east face, south of the door.
	var annex_z := pos.z + 76.0
	BuildKit.box(self, Vector3(12.0, 22.0, 56.0), Vector3(pos.x + 85.0, 11.0, annex_z), white, "VABAnnex")
	BuildKit.box(self, Vector3(12.6, 0.6, 56.6), Vector3(pos.x + 85.0, 22.3, annex_z), steel, "VABAnnexRoof")
	for y in [8.0, 16.0]:
		BuildKit.box(self, Vector3(0.3, 3.0, 50.0), Vector3(pos.x + 91.1, y, annex_z), glass, "AnnexWindows")
	for i in 9:
		BuildKit.box(self, Vector3(0.4, 11.0, 0.3), Vector3(pos.x + 91.2, 12.0, annex_z - 25.0 + float(i) * 6.25), steel, "AnnexMullion")

	# Window strip on the low bay's west face.
	BuildKit.box(self, Vector3(0.3, 3.0, 66.0), Vector3(pos.x - 186.1, 40.0, pos.z + 62.0), glass, "LowBayWindows")

	# Apron light poles on the east side of the high bay.
	for z in [pos.z - 90.0, pos.z, pos.z + 90.0]:
		var base := Vector3(pos.x + 110.0, 0.0, z)
		BuildKit.cylinder(self, 0.2, 14.0, base + Vector3(0.0, 7.0, 0.0), steel, "ApronPole", 8)
		BuildKit.box(self, Vector3(5.0, 0.3, 0.3), base + Vector3(-2.5, 13.8, 0.0), steel, "ApronPoleArm")
		BuildKit.box(self, Vector3(1.6, 0.4, 0.9), base + Vector3(-4.8, 13.5, 0.0), Mats.mat("lamp"), "ApronLamp")

	# Caged ladders climbing between the high-bay work platforms.
	var levels := [0.0, 24.0, 46.0, 68.0, 90.0, 112.0, 132.0]
	for i in range(levels.size() - 1):
		_ladder(Vector3(pos.x - 66.0, levels[i], pos.z + 97.0), levels[i + 1] - levels[i])


func _ladder(base: Vector3, height: float) -> void:
	var steel := Mats.mat("steel_white")
	for x in [-0.3, 0.3]:
		BuildKit.beam(self, base + Vector3(x, 0.0, 0.0), base + Vector3(x, height + 1.1, 0.0), 0.08, steel, "LadderRail")
	for i in int(height / 0.6):
		BuildKit.box(self, Vector3(0.7, 0.05, 0.05), base + Vector3(0.0, 0.3 + float(i) * 0.6, 0.0), steel, "LadderRung")


func _build_lcc_details() -> void:
	var pos := LCC_POS
	var south := pos.z + 23.2
	var glass := Mats.mat("glass")

	# Window mullions over the glass bands.
	for band_y in [7.0, 13.5, 20.0]:
		for i in range(0, 17):
			var x := -30.0 + float(i) * 3.75
			BuildKit.box(self, Vector3(0.22, 2.6, 0.5), Vector3(pos.x + x, band_y, south + 0.1), Mats.mat("steel_white"), "Mullion")
		BuildKit.box(self, Vector3(64.0, 0.3, 0.55), Vector3(pos.x, band_y + 1.4, south + 0.1), Mats.mat("steel_white"), "MullionSill")

	# Main entrance doors.
	for x in [-3.0, 3.0]:
		BuildKit.box(self, Vector3(2.6, 4.2, 0.35), Vector3(pos.x + x, 2.1, south + 0.3), glass, "LCCDoor")
		BuildKit.box(self, Vector3(3.0, 0.25, 0.45), Vector3(pos.x + x, 4.3, south + 0.3), Mats.mat("steel_white"), "DoorFrame")

	# Rooftop units.
	for i in 5:
		BuildKit.box(self, Vector3(4.0, 1.8, 3.0), Vector3(pos.x - 26.0 + float(i) * 13.0, 26.1, pos.z - 12.0), Mats.mat("steel_grey"), "RoofUnit")
	for i in 2:
		BuildKit.cylinder(self, 1.4, 2.2, Vector3(pos.x - 20.0 + float(i) * 40.0, 27.0, pos.z + 14.0), Mats.mat("steel_white"), "RoofFan", 16)

	# Back wall service door and conduit.
	BuildKit.box(self, Vector3(4.0, 4.0, 0.3), Vector3(pos.x + 26.0, 2.0, pos.z - 23.2), Mats.mat("steel_grey"), "LCCServiceDoor")
	for i in 3:
		BuildKit.cylinder(self, 0.14, 22.0, Vector3(pos.x + 32.0 + float(i) * 0.7, 11.0, pos.z - 23.0), Mats.mat("steel_grey"), "Conduit", 6)

	# Security bollards along the front.
	for i in 10:
		var x := -36.0 + float(i) * 8.0
		BuildKit.cylinder(self, 0.22, 1.0, Vector3(pos.x + x, 0.5, pos.z + 40.0), Mats.mat("yellow"), "Bollard", 8)

	# Open, lit entrance vestibule under the canopy.
	var vz := pos.z + 25.4
	BuildKit.box(self, Vector3(11.0, 0.2, 4.6), Vector3(pos.x, 0.1, vz), Mats.mat("concrete"), "VestibuleFloor")
	BuildKit.box(self, Vector3(11.0, 0.3, 4.6), Vector3(pos.x, 4.45, vz), Mats.mat("steel_white"), "VestibuleRoof")
	for side in [-1.0, 1.0]:
		BuildKit.box(self, Vector3(0.3, 4.3, 4.6), Vector3(pos.x + side * 5.35, 2.15, vz), Mats.mat("steel_white"), "VestibuleWall")


func _build_utilities() -> void:
	_build_substation()
	_build_cooling_tower()
	_build_generator_house()
	_build_fire_tank()
	_build_antenna_farm()
	_build_power_line()
	_build_hydrants()


func _build_substation() -> void:
	var pos := Vector3(-706.0, 0.0, 50.0)
	BuildKit.box(self, Vector3(36.0, 0.14, 26.0), pos + Vector3(0.0, 0.07, 0.0), Mats.mat("gravel"), "SubstationPad")

	# Fence around the compound.
	for i in 10:
		var x := -18.0 + float(i) * 4.0
		for z in [-13.0, 13.0]:
			BuildKit.cylinder(self, 0.08, 2.4, pos + Vector3(x, 1.2, z), Mats.mat("steel_grey"), "SubFencePost", 6)
	for i in 7:
		var z := -13.0 + float(i) * 4.33
		for x in [-18.0, 18.0]:
			BuildKit.cylinder(self, 0.08, 2.4, pos + Vector3(x, 1.2, z), Mats.mat("steel_grey"), "SubFencePost", 6)
	BuildKit.box(self, Vector3(36.0, 0.06, 0.06), pos + Vector3(0.0, 2.3, -13.0), Mats.mat("steel_white"), "SubFenceRail")
	BuildKit.box(self, Vector3(36.0, 0.06, 0.06), pos + Vector3(0.0, 2.3, 13.0), Mats.mat("steel_white"), "SubFenceRail")

	# Two transformer banks with bushings and cooling fins.
	for i in 2:
		var tp := pos + Vector3(-7.0 + float(i) * 14.0, 0.0, 0.0)
		BuildKit.box(self, Vector3(5.0, 3.4, 4.0), tp + Vector3(0.0, 1.8, 0.0), Mats.mat("steel_grey"), "Transformer")
		BuildKit.box(self, Vector3(5.2, 0.3, 4.2), tp + Vector3(0.0, 3.55, 0.0), Mats.mat("steel_white"), "TransformerTop")
		for j in 3:
			BuildKit.cylinder(self, 0.16, 1.1, tp + Vector3(-1.4 + float(j) * 1.4, 4.1, 0.0), Mats.mat("concrete"), "Bushing", 8)
		for side in [-1.0, 1.0]:
			for j in 3:
				BuildKit.box(self, Vector3(0.2, 2.4, 0.5), tp + Vector3(side * 2.6, 1.8, -1.0 + float(j) * 1.0), Mats.mat("steel_grey"), "CoolingFin")

	# Bus gantry over the banks.
	for x in [-11.0, 3.0]:
		BuildKit.cylinder(self, 0.18, 7.0, pos + Vector3(x, 3.5, 6.0), Mats.mat("steel_grey"), "GantryPost", 8)
	BuildKit.beam(self, pos + Vector3(-11.0, 7.0, 6.0), pos + Vector3(3.0, 7.0, 6.0), 0.22, Mats.mat("steel_grey"), "GantryBeam")
	for i in 4:
		BuildKit.cylinder(self, 0.1, 0.5, pos + Vector3(-9.0 + float(i) * 3.0, 6.8, 6.0), Mats.mat("concrete"), "Insulator", 6)

	var warn := BuildKit.label(self, "DANGER  ·  HIGH VOLTAGE", pos + Vector3(0.0, 1.5, -13.1), 0.0055, Color(0.95, 0.85, 0.2), "SubSign")
	warn.font_size = 96


func _build_cooling_tower() -> void:
	var pos := Vector3(-620.0, 0.0, 58.0)
	BuildKit.cylinder(self, 5.0, 12.0, pos + Vector3(0.0, 6.0, 0.0), Mats.mat("concrete"), "CoolingTower", 20)
	for i in 3:
		BuildKit.cylinder(self, 5.15, 0.5, pos + Vector3(0.0, 2.5 + float(i) * 3.5, 0.0), Mats.mat("concrete_dark"), "TowerBand", 20)
	BuildKit.cone(self, 4.2, 5.2, 3.0, pos + Vector3(0.0, 13.5, 0.0), Mats.mat("steel_grey"), "TowerCap", 20)
	for i in 4:
		var angle := TAU * float(i) / 4.0 + PI * 0.25
		BuildKit.beam(self, pos + Vector3(cos(angle) * 4.0, 0.0, sin(angle) * 4.0), pos + Vector3(cos(angle) * 4.0, 1.6, sin(angle) * 4.0), 0.4, Mats.mat("steel_grey"), "TowerLeg")
	BuildKit.beam(self, pos + Vector3(5.0, 1.5, 0.0), Vector3(-706.0, 1.5, 52.0), 0.7, Mats.mat("steel_grey"), "CoolingPipe")


func _build_generator_house() -> void:
	var pos := Vector3(-618.0, 0.0, 18.0)
	BuildKit.box(self, Vector3(14.0, 6.0, 10.0), pos + Vector3(0.0, 3.0, 0.0), Mats.mat("concrete"), "GeneratorHouse")
	BuildKit.box(self, Vector3(15.0, 0.5, 11.0), pos + Vector3(0.0, 6.25, 0.0), Mats.mat("steel_grey"), "GeneratorRoof")
	BuildKit.box(self, Vector3(3.0, 4.0, 0.3), pos + Vector3(-2.0, 2.0, 5.1), Mats.mat("steel_grey"), "GeneratorDoor")
	BuildKit.box(self, Vector3(2.0, 2.0, 0.2), pos + Vector3(2.5, 4.0, 5.1), Mats.mat("black"), "GeneratorVent")
	for i in 2:
		BuildKit.cylinder(self, 0.35, 5.0, pos + Vector3(-3.0 + float(i) * 3.0, 8.0, -2.0), Mats.mat("black"), "GeneratorStack", 10)
		BuildKit.cylinder(self, 0.5, 0.6, pos + Vector3(-3.0 + float(i) * 3.0, 10.6, -2.0), Mats.mat("rust"), "StackCap", 10)

	# Diesel tank beside the house.
	BuildKit.cylinder(self, 2.2, 6.0, pos + Vector3(12.0, 2.6, 3.0), Mats.mat("steel_white"), "FuelTank", 16).rotation_degrees.z = 90.0
	for x in [9.2, 14.8]:
		BuildKit.box(self, Vector3(0.4, 1.6, 2.0), pos + Vector3(x, 0.8, 3.0), Mats.mat("concrete_dark"), "TankSaddle")


func _build_fire_tank() -> void:
	var pos := Vector3(-596.0, 0.0, 92.0)
	BuildKit.cylinder(self, 4.5, 10.0, pos + Vector3(0.0, 6.0, 0.0), Mats.mat("steel_white"), "FireTank", 20)
	BuildKit.cylinder(self, 4.6, 0.7, pos + Vector3(0.0, 8.0, 0.0), Mats.mat("red"), "FireTankBand", 20)
	BuildKit.cone(self, 1.0, 4.5, 2.4, pos + Vector3(0.0, 12.2, 0.0), Mats.mat("steel_white"), "FireTankCap", 20)
	for i in 4:
		var angle := TAU * float(i) / 4.0 + PI * 0.25
		BuildKit.beam(self, pos + Vector3(cos(angle) * 3.4, 0.0, sin(angle) * 3.4), pos + Vector3(cos(angle) * 3.4, 1.0, sin(angle) * 3.4), 0.4, Mats.mat("steel_grey"), "FireTankLeg")
	BuildKit.beam(self, pos + Vector3(0.0, 0.6, 0.0), Vector3(-618.0, 0.6, 24.0), 0.5, Mats.mat("red"), "FireMain")


func _build_antenna_farm() -> void:
	var pos := Vector3(-850.0, 0.0, 336.0)
	BuildKit.box(self, Vector3(26.0, 0.12, 20.0), pos + Vector3(0.0, 0.06, 0.0), Mats.mat("concrete_dark"), "AntennaPad")
	for i in 3:
		var ap := pos + Vector3(-8.0 + float(i) * 8.0, 0.0, 0.0)
		var height := 6.0 + float(i) * 1.5
		BuildKit.cylinder(self, 0.3, height, ap + Vector3(0.0, height * 0.5, 0.0), Mats.mat("steel_grey"), "DishMast", 10)
		var dish := BuildKit.sphere(self, 2.6 + float(i) * 0.4, ap + Vector3(0.0, height + 1.6, 0.0), Mats.mat("steel_white"), "AntennaDish", 16)
		dish.scale = Vector3(1.0, 0.35, 1.0)
		dish.rotation_degrees.x = 22.0
		BuildKit.cylinder(self, 0.18, 1.6, ap + Vector3(0.0, height + 1.8, -1.6), Mats.mat("steel_grey"), "DishFeed", 8).rotation_degrees.x = 68.0

	# Equipment cabinets and cable trays.
	for i in 4:
		BuildKit.box(self, Vector3(1.6, 2.2, 1.2), pos + Vector3(-10.0 + float(i) * 6.0, 1.1, 7.0), Mats.mat("steel_grey"), "EquipmentCabinet")
	BuildKit.box(self, Vector3(24.0, 0.2, 0.6), pos + Vector3(0.0, 0.5, 5.5), Mats.mat("rust"), "CableTray")


func _build_power_line() -> void:
	var a := Vector2(-760.0, 250.0)
	var b := Vector2(-40.0, 100.0)
	var delta := b - a
	var dir := delta / delta.length()
	var normal := Vector2(-dir.y, dir.x)
	var tops: Array[Vector3] = []
	for i in 9:
		var p := a + dir * (30.0 + float(i) * 82.0) - normal * 9.0
		var base := Vector3(p.x, 0.0, p.y)
		BuildKit.cylinder(self, 0.22, 12.0, base + Vector3(0.0, 6.0, 0.0), Mats.mat("rust"), "PowerPole", 8)
		BuildKit.beam(self, base + Vector3(-normal.x * 2.0, 11.2, -normal.y * 2.0), base + Vector3(normal.x * 2.0, 11.2, normal.y * 2.0), 0.18, Mats.mat("rust"), "Crossarm")
		tops.append(base + Vector3(0.0, 11.2, 0.0))

	for i in range(tops.size() - 1):
		for side in [-1.0, 1.0]:
			var offset := Vector3(normal.x * 1.8 * side, 0.0, normal.y * 1.8 * side)
			BuildKit.beam(self, tops[i] + offset, tops[i + 1] + offset, 0.06, Mats.mat("black"), "PowerLine")


func _build_hydrants() -> void:
	var spots: Array[Vector3] = [
		Vector3(-700.0, 0.0, 246.0),
		Vector3(-420.0, 0.0, 186.0),
		Vector3(60.0, 0.0, 128.0),
		Vector3(-640.0, 0.0, -96.0),
	]
	for spot in spots:
		BuildKit.cylinder(self, 0.18, 0.9, spot + Vector3(0.0, 0.45, 0.0), Mats.mat("red"), "Hydrant", 8)
		BuildKit.cylinder(self, 0.12, 0.35, spot + Vector3(0.0, 1.0, 0.0), Mats.mat("red"), "HydrantCap", 8)
		BuildKit.box(self, Vector3(0.9, 0.14, 0.14), spot + Vector3(0.0, 0.7, 0.0), Mats.mat("red"), "HydrantArm")


func _build_crawler_details() -> void:
	var pos := CRAWLER_POS
	var steel := Mats.mat("steel_grey")

	# Deck railings and handrails.
	for side in [-1.0, 1.0]:
		var rail_z: float = side * 19.0
		BuildKit.box(self, Vector3(44.0, 0.1, 0.1), pos + Vector3(0.0, 7.4, rail_z), Mats.mat("steel_white"), "CrawlerRail")
		for i in 11:
			BuildKit.box(self, Vector3(0.1, 1.2, 0.1), pos + Vector3(-20.0 + float(i) * 4.0, 6.8, rail_z), Mats.mat("steel_white"), "CrawlerPost")

	# Floodlights on the front edge and an amber beacon on the cab.
	for z in [-6.0, 6.0]:
		BuildKit.box(self, Vector3(0.7, 0.7, 1.0), pos + Vector3(-22.4, 7.6, z), Mats.mat("lamp"), "CrawlerLamp")
	BuildKit.sphere(self, 0.35, pos + Vector3(-16.0, 11.1, 14.0), Mats.mat("yellow"), "CabBeacon", 8)

	# Exhaust stacks on the generator sets.
	for x in [8.0, 16.0]:
		BuildKit.cylinder(self, 0.4, 4.5, pos + Vector3(x + 2.0, 11.25, -12.0), Mats.mat("black"), "CrawlerStack", 10)
		BuildKit.cylinder(self, 0.5, 0.4, pos + Vector3(x + 2.0, 13.7, -12.0), Mats.mat("rust"), "StackCap", 10)

	# Umbilical / power cable reels on the deck.
	for x in [-8.0, 0.0]:
		var reel := BuildKit.cylinder(self, 1.6, 1.0, pos + Vector3(x, 7.6, -14.0), Mats.mat("rust"), "CrawlerReel", 12)
		reel.rotation_degrees.z = 90.0


func _build_parking() -> void:
	var lot := Vector3(-800.0, 0.0, 368.0)
	var colors := ["steel_white", "black", "red", "steel_grey", "ops_blue", "yellow"]
	var index := 0
	for row in 2:
		for i in 7:
			var x := lot.x - 30.0 + float(i) * 8.0
			var z := lot.z - 8.0 + float(row) * 12.0
			var car_color: String = colors[index % colors.size()]
			index += 1
			_car(Vector3(x, 0.0, z), Mats.mat(car_color))

	# Lot light poles and wheel stops.
	for x in [-32.0, 0.0, 32.0]:
		BuildKit.cylinder(self, 0.16, 9.0, Vector3(lot.x + x, 4.5, lot.z + 16.0), Mats.mat("steel_grey"), "LotPole", 8)
		BuildKit.box(self, Vector3(1.4, 0.4, 0.8), Vector3(lot.x + x, 9.2, lot.z + 16.0), Mats.mat("lamp"), "LotLamp")
	for i in 7:
		BuildKit.box(self, Vector3(2.2, 0.3, 0.4), Vector3(lot.x - 30.0 + float(i) * 8.0, 0.15, lot.z - 14.0), Mats.mat("concrete"), "WheelStop")


func _car(pos: Vector3, body_mat: Material) -> void:
	BuildKit.box(self, Vector3(4.4, 1.1, 1.9), pos + Vector3(0.0, 0.85, 0.0), body_mat, "Car")
	BuildKit.box(self, Vector3(2.4, 0.85, 1.7), pos + Vector3(-0.2, 1.8, 0.0), Mats.mat("glass"), "CarGlass")
	BuildKit.box(self, Vector3(2.5, 0.12, 1.75), pos + Vector3(-0.2, 2.26, 0.0), body_mat, "CarRoof")
	for x in [-1.4, 1.4]:
		for z in [-0.95, 0.95]:
			var wheel := BuildKit.cylinder(self, 0.36, 0.28, pos + Vector3(x, 0.36, z), Mats.mat("black"), "CarWheel", 8)
			wheel.rotation_degrees.z = 90.0


func _build_site_details() -> void:
	_build_lcc_site()
	_build_substation_details()
	_build_cooling_details()
	_build_generator_details()
	_build_fire_details()
	_build_antenna_details()


func _build_lcc_site() -> void:
	var pos := LCC_POS
	var concrete := Mats.mat("concrete")
	var steel := Mats.mat("steel_grey")
	var white := Mats.mat("steel_white")
	var grass := Mats.mat("grass")

	# Sunshades over each window band on the south face.
	for y in [7.0, 13.5, 20.0]:
		BuildKit.box(self, Vector3(64.0, 0.3, 1.4), pos + Vector3(0.0, y + 1.6, 23.9), steel, "LCCSunshade")
	for x in [-8.0, 8.0]:
		BuildKit.box(self, Vector3(0.4, 0.6, 0.3), pos + Vector3(x, 3.4, 23.4), Mats.mat("lamp"), "LCCSconce")

	# Loading dock with roll-up doors on the north face.
	BuildKit.box(self, Vector3(40.0, 0.5, 6.0), pos + Vector3(-6.0, 0.25, -26.0), concrete, "LoadingDock")
	for x in [-20.0, 8.0]:
		BuildKit.box(self, Vector3(4.6, 4.0, 0.3), pos + Vector3(x, 2.0, -23.3), steel, "RollUpDoor")
		BuildKit.box(self, Vector3(4.8, 0.3, 0.4), pos + Vector3(x, 4.15, -23.3), white, "DoorHood")

	# Clipped hedges around the building and a walkway to the entrance.
	BuildKit.box(self, Vector3(1.4, 1.6, 48.0), pos + Vector3(-38.0, 0.8, 0.0), grass, "LCCHedge")
	BuildKit.box(self, Vector3(1.4, 1.6, 48.0), pos + Vector3(38.0, 0.8, 0.0), grass, "LCCHedge")
	BuildKit.box(self, Vector3(72.0, 1.6, 1.4), pos + Vector3(0.0, 0.8, -31.0), grass, "LCCHedge")
	BuildKit.box(self, Vector3(3.0, 0.12, 16.0), pos + Vector3(0.0, 0.06, 37.5), concrete, "LCCWalkway")

	# Painted parking bays in the lot south of the building.
	var lot := Vector3(-800.0, 0.0, 368.0)
	for i in 11:
		BuildKit.box(self, Vector3(0.12, 0.02, 40.0), lot + Vector3(-37.0 + float(i) * 8.0, 0.112, 0.0), white, "ParkingStripe")


func _build_substation_details() -> void:
	var pos := Vector3(-706.0, 0.0, 50.0)
	var concrete := Mats.mat("concrete")
	var steel := Mats.mat("steel_grey")
	var white := Mats.mat("steel_white")

	# Oil containment pads under each transformer.
	for i in 2:
		BuildKit.box(self, Vector3(6.4, 0.2, 5.4), pos + Vector3(-7.0 + float(i) * 14.0, 0.1, 0.0), concrete, "OilPad")

	# Control house with a window, door, rooftop HVAC and a whip antenna.
	var house := pos + Vector3(0.0, 0.0, -7.5)
	BuildKit.box(self, Vector3(8.0, 3.6, 4.0), house + Vector3(0.0, 1.8, 0.0), concrete, "ControlHouse")
	BuildKit.box(self, Vector3(8.4, 0.3, 4.4), house + Vector3(0.0, 3.75, 0.0), steel, "ControlHouseRoof")
	BuildKit.box(self, Vector3(5.0, 1.6, 0.1), house + Vector3(-1.2, 2.0, 2.02), Mats.mat("glass"), "ControlWindow")
	BuildKit.box(self, Vector3(1.0, 2.4, 0.1), house + Vector3(2.8, 1.2, 2.02), steel, "ControlDoor")
	BuildKit.box(self, Vector3(1.8, 0.9, 1.4), house + Vector3(-2.4, 4.2, 0.0), white, "ControlHVAC")
	BuildKit.cylinder(self, 0.04, 3.0, house + Vector3(2.5, 5.3, 0.0), steel, "WhipAntenna", 6)

	# Lightning rods at the fence corners.
	for x in [-17.0, 17.0]:
		for z in [-12.0, 12.0]:
			BuildKit.cylinder(self, 0.1, 9.0, pos + Vector3(x, 4.5, z), steel, "LightningRod", 6)

	# Breaker cabinets along the north fence.
	for i in 3:
		BuildKit.box(self, Vector3(1.2, 2.2, 1.0), pos + Vector3(-15.0 + float(i) * 1.6, 1.1, -9.0), steel, "BreakerCabinet")


func _build_cooling_details() -> void:
	var pos := Vector3(-620.0, 0.0, 58.0)
	var steel := Mats.mat("steel_grey")

	# Cold-water basin around the tower base, with water inside.
	BuildKit.cylinder(self, 6.8, 0.5, pos + Vector3(0.0, 0.25, 0.0), Mats.mat("concrete"), "TowerBasin", 24)
	BuildKit.cylinder(self, 6.2, 0.05, pos + Vector3(0.0, 0.52, 0.0), Mats.mat("water"), "BasinWater", 24)

	# Air-intake louvres at the base of the shell.
	for i in 3:
		BuildKit.cylinder(self, 5.05, 0.25, pos + Vector3(0.0, 1.0 + float(i) * 0.5, 0.0), Mats.mat("black"), "Louvre", 20)

	# Pump house with a roof and door.
	var pump := pos + Vector3(10.0, 0.0, -4.0)
	BuildKit.box(self, Vector3(4.0, 3.2, 3.6), pump + Vector3(0.0, 1.6, 0.0), Mats.mat("concrete"), "PumpHouse")
	BuildKit.box(self, Vector3(4.2, 0.3, 3.8), pump + Vector3(0.0, 3.35, 0.0), steel, "PumpHouseRoof")
	BuildKit.box(self, Vector3(0.9, 2.2, 0.1), pump + Vector3(0.0, 1.1, -1.85), steel, "PumpHouseDoor")


func _build_generator_details() -> void:
	var pos := Vector3(-618.0, 0.0, 18.0)
	var black := Mats.mat("black")

	# Concrete pad, louvres on the west wall and a stencilled sign.
	BuildKit.box(self, Vector3(18.0, 0.2, 14.0), pos + Vector3(0.0, 0.1, 0.0), Mats.mat("concrete"), "GeneratorPad")
	for i in 5:
		BuildKit.box(self, Vector3(0.25, 0.22, 6.0), pos + Vector3(-7.1, 2.0 + float(i) * 0.6, 0.0), black, "LouvreSlat")
	var sign := BuildKit.label(self, "GENERATOR", pos + Vector3(0.0, 5.2, 5.3), 0.01, Color(0.97, 0.97, 1.0), "GeneratorSign")
	sign.font_size = 96

	# Cable tray carrying power from the generators to the substation.
	var tray_start := pos + Vector3(-7.6, 4.6, 0.0)
	var tray_end := Vector3(-690.0, 4.6, 36.0)
	BuildKit.beam(self, tray_start, tray_end, 0.5, Mats.mat("steel_grey"), "CableTray")
	for t in [0.33, 0.66]:
		var p := tray_start.lerp(tray_end, t)
		BuildKit.cylinder(self, 0.15, 4.6, Vector3(p.x, 2.3, p.z), Mats.mat("steel_grey"), "CableTrayPost", 6)


func _build_fire_details() -> void:
	var pump := Vector3(-588.0, 0.0, 83.0)
	BuildKit.box(self, Vector3(5.0, 3.5, 4.0), pump + Vector3(0.0, 1.75, 0.0), Mats.mat("concrete"), "FirePumpHouse")
	BuildKit.box(self, Vector3(5.3, 0.3, 4.3), pump + Vector3(0.0, 3.65, 0.0), Mats.mat("red"), "FirePumpRoof")
	BuildKit.box(self, Vector3(1.0, 2.2, 0.1), pump + Vector3(1.2, 1.1, 2.02), Mats.mat("red"), "FirePumpDoor")
	var sign := BuildKit.label(self, "FIRE PUMP", pump + Vector3(0.0, 3.0, 2.2), 0.01, Color(0.97, 0.97, 1.0), "FirePumpSign")
	sign.font_size = 96
	BuildKit.cylinder(self, 0.18, 0.9, Vector3(-584.0, 0.45, 80.0), Mats.mat("red"), "FireHydrant", 8)
	BuildKit.cylinder(self, 0.12, 0.35, Vector3(-584.0, 1.0, 80.0), Mats.mat("red"), "FireHydrantCap", 8)


func _build_antenna_details() -> void:
	var pos := Vector3(-850.0, 0.0, 336.0)
	var white := Mats.mat("steel_white")
	var steel := Mats.mat("steel_grey")

	# Equipment shelter behind the dishes, with a door.
	BuildKit.box(self, Vector3(10.0, 3.2, 4.5), pos + Vector3(0.0, 1.6, -7.0), white, "EquipmentShelter")
	BuildKit.box(self, Vector3(10.4, 0.3, 4.9), pos + Vector3(0.0, 3.35, -7.0), steel, "ShelterRoof")
	BuildKit.box(self, Vector3(1.2, 2.2, 0.1), pos + Vector3(-3.0, 1.1, -4.7), steel, "ShelterDoor")

	# Security fence around the compound.
	_fence_run(pos + Vector3(-13.0, 0.0, -10.0), pos + Vector3(13.0, 0.0, -10.0), 2.4)
	_fence_run(pos + Vector3(-13.0, 0.0, 10.0), pos + Vector3(13.0, 0.0, 10.0), 2.4)
	_fence_run(pos + Vector3(-13.0, 0.0, -10.0), pos + Vector3(-13.0, 0.0, 10.0), 2.4)
	_fence_run(pos + Vector3(13.0, 0.0, -10.0), pos + Vector3(13.0, 0.0, 10.0), 2.4)


func _fence_run(a: Vector3, b: Vector3, height: float) -> void:
	var steel := Mats.mat("steel_grey")
	var segments := maxi(1, int(a.distance_to(b) / 3.0))
	for i in range(segments + 1):
		var p := a.lerp(b, float(i) / float(segments))
		BuildKit.cylinder(self, 0.05, height, p + Vector3(0.0, height * 0.5, 0.0), steel, "FencePost", 6)
	BuildKit.beam(self, a + Vector3(0.0, height, 0.0), b + Vector3(0.0, height, 0.0), 0.05, steel, "FenceTop")
	BuildKit.beam(self, a + Vector3(0.0, 0.1, 0.0), b + Vector3(0.0, 0.1, 0.0), 0.05, steel, "FenceBottom")
