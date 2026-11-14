# src/world/SiteDetails.gd
# Per-building infrastructure: transformers, pipes and valves, signs, fencing,
# bollards, hydrants, light poles, ladders and containment around each facility.
extends Node3D

const LCC_POS := Vector3(-800.0, 0.0, 300.0)


func _ready() -> void:
	_vab_site()
	_low_bay_site()
	_lcc_site()
	_substation_site()
	_cooling_tower_site()
	_generator_site()
	_fire_tank_site()
	_antenna_site()
	_propellant_site()
	_water_tower_site()
	_turn_basin_site()
	_console_site()


func _vab_site() -> void:
	var steel := Mats.mat("steel_grey")
	_bollards(Vector3(-812.0, 0.0, -186.0), Vector3(-812.0, 0.0, -96.0), 12)
	_sign(Vector3(-808.0, 0.0, -182.0), "VEHICLE ASSEMBLY BUILDING", 12.0, 90.0, "nasa_blue")
	_hydrant(Vector3(-810.0, 0.0, -230.0))
	_hydrant(Vector3(-804.0, 0.0, -44.0))
	_transformer(Vector3(-1000.0, 0.0, -272.0))
	_transformer(Vector3(-976.0, 0.0, -272.0))
	_tube(Vector3(-976.0, 3.0, -272.0), Vector3(-976.0, 3.0, -250.5), 0.25, steel)
	_tube(Vector3(-1000.0, 3.0, -272.0), Vector3(-1000.0, 3.0, -250.5), 0.25, steel)
	for x in [-1000.0, -976.0]:
		BuildKit.cylinder(self, 0.12, 3.0, Vector3(x, 1.5, -262.0), steel, "ConduitPost", 6)


func _low_bay_site() -> void:
	var steel := Mats.mat("steel_grey")
	# Roll-up vehicle doors on the west face, each with a hood.
	for z in [-100.0, -78.0, -56.0]:
		BuildKit.box(self, Vector3(0.3, 5.0, 4.5), Vector3(-1086.2, 2.5, z), steel, "RollUpDoor")
		BuildKit.box(self, Vector3(0.6, 0.4, 4.8), Vector3(-1086.2, 5.2, z), Mats.mat("steel_white"), "DoorHood")
	# Rooftop air handlers.
	for x in [-1060.0, -1040.0, -1020.0, -1000.0]:
		BuildKit.box(self, Vector3(6.0, 2.5, 3.0), Vector3(x, 64.3, -78.0), Mats.mat("steel_white"), "AirHandler")
	_sign(Vector3(-1094.0, 0.0, -78.0), "LOW BAY", 8.0, -90.0, "nasa_blue")


func _lcc_site() -> void:
	var pos := LCC_POS
	var steel := Mats.mat("steel_grey")
	_transformer(Vector3(-846.0, 0.0, 314.0))
	_tube(Vector3(-844.5, 2.4, 314.0), Vector3(-835.2, 2.4, 314.0), 0.2, steel)
	for x in [-34.6, 34.6]:
		for z in [-22.6, 22.6]:
			BuildKit.cylinder(self, 0.15, 24.0, pos + Vector3(x, 12.0, z), steel, "Downspout", 8)
	_genset(Vector3(-846.0, 0.0, 282.0))


func _substation_site() -> void:
	var pos := Vector3(-706.0, 0.0, 50.0)
	var copper := Mats.mat("rust")
	# Grounding grid under the gravel.
	for i in 7:
		BuildKit.box(self, Vector3(34.0, 0.05, 0.12), pos + Vector3(0.0, 0.16, -12.0 + float(i) * 4.0), copper, "GroundingConductor")
	for x in [-16.0, -8.0, 0.0, 8.0, 16.0]:
		BuildKit.box(self, Vector3(0.12, 0.05, 24.0), pos + Vector3(x, 0.16, 0.0), copper, "GroundingConductor")
	_pole_light(pos + Vector3(-14.0, 0.0, 9.0))
	# Danger placards on the south fence.
	for x in [-8.0, 8.0]:
		BuildKit.box(self, Vector3(1.2, 0.8, 0.06), pos + Vector3(x, 1.9, 13.1), Mats.mat("red"), "DangerPlacard")
		var text := BuildKit.label(self, "DANGER", pos + Vector3(x, 1.9, 13.16), 0.01, Color(1.0, 1.0, 1.0), "DangerText")
		text.font_size = 64


func _cooling_tower_site() -> void:
	var pos := Vector3(-620.0, 0.0, 58.0)
	var steel := Mats.mat("steel_grey")
	var white := Mats.mat("steel_white")
	_vertical_ladder(pos + Vector3(5.5, 0.0, 0.0), 12.0)
	_tube(pos + Vector3(6.6, 1.2, -1.0), pos + Vector3(9.0, 1.2, -4.0), 0.3, steel)
	BuildKit.cylinder(self, 0.9, 2.5, pos + Vector3(16.0, 1.25, 8.0), white, "ChemTank", 12)
	BuildKit.cylinder(self, 0.95, 0.15, pos + Vector3(16.0, 2.5, 8.0), Mats.mat("yellow"), "ChemTankBand", 12)
	_sign(pos + Vector3(-4.0, 0.0, 9.0), "COOLING TOWER", 7.0, 0.0, "nasa_blue")


func _generator_site() -> void:
	var pos := Vector3(-618.0, 0.0, 18.0)
	var concrete := Mats.mat("concrete")
	var c := pos + Vector3(12.0, 0.0, 3.0)
	# Containment berm around the diesel tank.
	BuildKit.box(self, Vector3(8.6, 0.6, 0.5), c + Vector3(0.0, 0.3, -4.0), concrete, "BermWall")
	BuildKit.box(self, Vector3(8.6, 0.6, 0.5), c + Vector3(0.0, 0.3, 4.0), concrete, "BermWall")
	BuildKit.box(self, Vector3(0.5, 0.6, 8.6), c + Vector3(-4.0, 0.3, 0.0), concrete, "BermWall")
	BuildKit.box(self, Vector3(0.5, 0.6, 8.6), c + Vector3(4.0, 0.3, 0.0), concrete, "BermWall")
	# Fuel fill standpipe and vent on top of the tank.
	BuildKit.cylinder(self, 0.12, 1.2, c + Vector3(-2.0, 2.5, 0.0), Mats.mat("red"), "FuelFill", 8)
	BuildKit.cylinder(self, 0.08, 1.0, c + Vector3(2.0, 2.4, 0.0), Mats.mat("steel_grey"), "FuelVent", 8)
	# Air intake louvres on the east wall.
	for i in 4:
		BuildKit.box(self, Vector3(0.25, 0.22, 6.0), pos + Vector3(7.1, 2.0 + float(i) * 0.6, 0.0), Mats.mat("black"), "LouvreSlat")
	_sign(pos + Vector3(0.0, 0.0, 27.0), "DIESEL FUEL  ·  NO SMOKING", 8.0, 0.0, "red")


func _fire_tank_site() -> void:
	var pos := Vector3(-596.0, 0.0, 92.0)
	var steel := Mats.mat("steel_white")
	# Protective bollard ring around the tank.
	for i in 8:
		var a := TAU * float(i) / 8.0
		BuildKit.cylinder(self, 0.2, 1.0, pos + Vector3(cos(a) * 6.4, 0.5, sin(a) * 6.4), Mats.mat("yellow"), "TankBollard", 8)
	# Valve house with a roof and a hose reel.
	BuildKit.box(self, Vector3(3.0, 2.4, 3.0), Vector3(-604.0, 1.2, 104.0), steel, "ValveHouse")
	BuildKit.box(self, Vector3(3.2, 0.25, 3.2), Vector3(-604.0, 2.55, 104.0), Mats.mat("red"), "ValveHouseRoof")
	var reel := BuildKit.cylinder(self, 0.45, 0.9, Vector3(-601.5, 1.2, 104.0), Mats.mat("red"), "HoseReel", 10)
	reel.rotation_degrees.z = 90.0
	_hydrant(Vector3(-590.0, 0.0, 98.0))
	_sign(Vector3(-596.0, 0.0, 110.0), "FIRE WATER", 6.0, 0.0, "red")


func _antenna_site() -> void:
	var pos := Vector3(-850.0, 0.0, 336.0)
	# Lightning mast beside the compound and a service box on the south side.
	BuildKit.cylinder(self, 0.2, 14.0, pos + Vector3(-17.0, 7.0, -6.0), Mats.mat("steel_white"), "LightningMast", 8)
	BuildKit.box(self, Vector3(1.2, 1.6, 0.5), pos + Vector3(10.0, 0.8, 11.0), Mats.mat("steel_grey"), "ServiceBox")
	_sign(Vector3(-850.0, 0.0, 346.0), "ANTENNA FARM", 8.0, 0.0, "nasa_blue")


func _propellant_site() -> void:
	# Valves along the feed line toward the pad.
	for t in [0.25, 0.5, 0.75]:
		_valve(Vector3(-100.0, 2.0, 88.0).lerp(Vector3(-30.0, 2.0, 55.0), t))
	# Nitrogen bottle rack outside the west berm.
	for i in 4:
		BuildKit.cylinder(self, 0.35, 2.2, Vector3(-148.0, 1.1, 76.0 + float(i) * 4.0), Mats.mat("steel_white"), "N2Bottle", 10)
	# Product labels on the sphere faces.
	for x in [-120.0, -86.0]:
		var label := BuildKit.label(self, "PROPELLANT", Vector3(x, 13.0, 80.9), 0.012, Color(1.0, 0.85, 0.2), "TankLabel")
		label.font_size = 64
		label.rotation_degrees.y = 180.0


func _water_tower_site() -> void:
	var concrete := Mats.mat("concrete")
	var steel := Mats.mat("steel_grey")
	BuildKit.box(self, Vector3(4.0, 3.0, 3.0), Vector3(112.0, 1.5, 46.0), concrete, "WaterPumpHouse")
	BuildKit.box(self, Vector3(4.2, 0.25, 3.2), Vector3(112.0, 3.12, 46.0), steel, "WaterPumpRoof")
	_sign(Vector3(96.0, 0.0, 42.0), "WATER TANK 39A", 8.0, 0.0, "nasa_blue")


func _turn_basin_site() -> void:
	var pos := Vector3(-930.0, 0.0, 118.0)
	var concrete := Mats.mat("concrete")
	BuildKit.box(self, Vector3(5.0, 3.0, 4.0), pos + Vector3(0.0, 1.5, 30.0), concrete, "BasinPumpHouse")
	BuildKit.box(self, Vector3(5.3, 0.25, 4.3), pos + Vector3(0.0, 3.12, 30.0), Mats.mat("steel_grey"), "BasinPumpRoof")
	for x in [-36.0, 36.0]:
		for z in [-26.0, 26.0]:
			_pole_light(pos + Vector3(x, 0.0, z))
	_sign(pos + Vector3(-22.0, 0.0, 33.0), "TURN BASIN", 7.0, 0.0, "nasa_blue")


func _console_site() -> void:
	# Canopy over the launch console kiosk, built in the console's own frame.
	var holder := Node3D.new()
	holder.name = "ConsoleCanopy"
	holder.position = Vector3(24.0, 0.0, 126.0)
	holder.rotation_degrees.y = -12.0
	add_child(holder)
	var steel := Mats.mat("steel_grey")
	for x in [-1.9, 1.9]:
		for z in [-0.9, 0.9]:
			BuildKit.cylinder(holder, 0.07, 2.9, Vector3(x, 1.45, z), steel, "CanopyPost", 6)
	BuildKit.box(holder, Vector3(4.4, 0.25, 3.0), Vector3(0.0, 3.0, 0.0), Mats.mat("steel_white"), "CanopyRoof")


func _transformer(p: Vector3) -> void:
	BuildKit.box(self, Vector3(3.0, 0.2, 2.6), p + Vector3(0.0, 0.1, 0.0), Mats.mat("concrete"), "TransformerPad")
	BuildKit.box(self, Vector3(2.4, 1.8, 2.0), p + Vector3(0.0, 1.1, 0.0), Mats.mat("steel_white"), "PadTransformer")
	for x in [-0.6, 0.0, 0.6]:
		BuildKit.cylinder(self, 0.1, 0.8, p + Vector3(x, 2.2, 0.0), Mats.mat("concrete"), "Bushing", 6)
	BuildKit.box(self, Vector3(1.6, 0.9, 0.08), p + Vector3(0.0, 1.1, 1.04), Mats.mat("red"), "HVWarning")


func _genset(p: Vector3) -> void:
	BuildKit.box(self, Vector3(4.6, 0.2, 2.6), p + Vector3(0.0, 0.1, 0.0), Mats.mat("concrete"), "GensetPad")
	BuildKit.box(self, Vector3(4.0, 2.2, 2.0), p + Vector3(0.0, 1.3, 0.0), Mats.mat("steel_grey"), "Genset")
	BuildKit.cylinder(self, 0.15, 2.5, p + Vector3(1.5, 3.45, 0.0), Mats.mat("black"), "GensetExhaust", 8)


func _valve(p: Vector3) -> void:
	var steel := Mats.mat("steel_grey")
	BuildKit.box(self, Vector3(0.5, 0.5, 0.5), p, steel, "Valve")
	BuildKit.cylinder(self, 0.04, 0.5, p + Vector3(0.0, 0.45, 0.0), steel, "ValveStem", 6)
	BuildKit.cylinder(self, 0.25, 0.05, p + Vector3(0.0, 0.75, 0.0), Mats.mat("red"), "ValveWheel", 10)


func _hydrant(p: Vector3) -> void:
	var red := Mats.mat("red")
	BuildKit.cylinder(self, 0.18, 0.9, p + Vector3(0.0, 0.45, 0.0), red, "Hydrant", 8)
	BuildKit.cylinder(self, 0.12, 0.35, p + Vector3(0.0, 1.0, 0.0), red, "HydrantCap", 8)
	BuildKit.box(self, Vector3(0.5, 0.14, 0.14), p + Vector3(0.25, 0.7, 0.0), red, "HydrantNozzle")


func _pole_light(p: Vector3) -> void:
	BuildKit.cylinder(self, 0.15, 9.0, p + Vector3(0.0, 4.5, 0.0), Mats.mat("steel_grey"), "SitePole", 8)
	BuildKit.box(self, Vector3(1.6, 0.4, 0.8), p + Vector3(0.0, 9.2, 0.0), Mats.mat("lamp"), "SiteLamp")


func _bollards(a: Vector3, b: Vector3, count: int) -> void:
	for i in count:
		var t := float(i) / float(count - 1)
		BuildKit.cylinder(self, 0.2, 1.0, a.lerp(b, t) + Vector3(0.0, 0.5, 0.0), Mats.mat("yellow"), "Bollard", 8)


func _sign(pos: Vector3, text: String, width: float, yaw: float, board: String) -> void:
	var holder := Node3D.new()
	holder.name = "Sign"
	holder.position = pos
	holder.rotation_degrees.y = yaw
	add_child(holder)
	var steel := Mats.mat("steel_grey")
	for x in [-width * 0.4, width * 0.4]:
		BuildKit.cylinder(holder, 0.1, 2.0, Vector3(x, 1.0, 0.0), steel, "SignPost", 6)
	BuildKit.box(holder, Vector3(width, 1.1, 0.15), Vector3(0.0, 2.0, 0.0), Mats.mat(board), "SignBoard")
	var label := BuildKit.label(holder, text, Vector3(0.0, 2.0, 0.1), 0.01, Color(0.97, 0.98, 1.0), "SignText")
	label.font_size = 64
	label.pixel_size = minf(width * 0.8 / (float(text.length()) * 36.0), 0.012)


func _tube(a: Vector3, b: Vector3, radius: float, mat: Material) -> void:
	var dir := (b - a).normalized()
	var mi := BuildKit.cylinder(self, radius, a.distance_to(b), (a + b) * 0.5, mat, "Pipe", 8)
	var side := dir.cross(Vector3.UP).normalized() if absf(dir.y) < 0.99 else Vector3.RIGHT
	mi.basis = Basis(side, dir, side.cross(dir))


func _vertical_ladder(base: Vector3, height: float) -> void:
	var steel := Mats.mat("steel_white")
	for x in [-0.3, 0.3]:
		BuildKit.beam(self, base + Vector3(x, 0.0, 0.0), base + Vector3(x, height, 0.0), 0.08, steel, "LadderRail")
	for i in int(height / 0.6):
		BuildKit.box(self, Vector3(0.7, 0.05, 0.05), base + Vector3(0.0, 0.3 + float(i) * 0.6, 0.0), steel, "LadderRung")
