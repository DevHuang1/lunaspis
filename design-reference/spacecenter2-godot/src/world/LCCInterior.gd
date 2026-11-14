# src/world/LCCInterior.gd
# Walkable Launch Control Center: the building shell with a south entrance, and
# interior rooms (lobby, firing room, conference room, restrooms, electrical room).
extends Node3D

const POS := Vector3(-800.0, 0.0, 300.0)
const CEILING := 22.0

var _body: StaticBody3D


func _ready() -> void:
	_body = StaticBody3D.new()
	_body.name = "LCCCollision"
	add_child(_body)
	_build_shell()
	_build_partitions()
	_build_firing_room()
	_build_lobby()
	_build_restrooms_and_electrical()
	_build_conference_room()
	_build_safety()


func _box(local: Vector3, size: Vector3, mat: Material, node_name: String, collide := false) -> void:
	BuildKit.box(self, size, POS + local, mat, node_name)
	if collide:
		BuildKit.collision_box(_body, size, POS + local)


func _wall(x0: float, x1: float, z0: float, z1: float, y0: float, y1: float, mat: Material) -> void:
	_box(Vector3((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5), Vector3(x1 - x0, y1 - y0, z1 - z0), mat, "LCCWall", true)


func _build_shell() -> void:
	var concrete := Mats.mat("concrete")
	_box(Vector3(0.0, 0.1, 0.0), Vector3(70.0, 0.2, 46.0), concrete, "LCCFloor", true)
	_wall(-35.0, 35.0, -23.0, -22.4, 0.0, 24.0, concrete)
	_wall(-35.0, -34.4, -23.0, 23.0, 0.0, 24.0, concrete)
	_wall(34.4, 35.0, -23.0, 23.0, 0.0, 24.0, concrete)
	# South wall with a 10 m entrance opening under a header.
	_wall(-35.0, -5.0, 22.4, 23.0, 0.0, 24.0, concrete)
	_wall(5.0, 35.0, 22.4, 23.0, 0.0, 24.0, concrete)
	_wall(-5.0, 5.0, 22.4, 23.0, 4.4, 24.0, concrete)
	_box(Vector3(0.0, CEILING + 0.1, 0.0), Vector3(68.8, 0.2, 44.8), Mats.mat("steel_white"), "LCCCeiling")


func _build_partitions() -> void:
	var wall := Mats.mat("steel_white")
	var header := CEILING - 5.0
	# West partition between the firing room and the lobby, with a door at z 10..14.
	_wall(-12.3, -11.7, -22.4, 10.0, 0.0, CEILING, wall)
	_wall(-12.3, -11.7, 14.0, 22.4, 0.0, CEILING, wall)
	_wall(-12.3, -11.7, 10.0, 14.0, header, CEILING, wall)
	# East partition between the lobby and the conference room, door at z 14..18.
	_wall(11.7, 12.3, -22.4, 14.0, 0.0, CEILING, wall)
	_wall(11.7, 12.3, 18.0, 22.4, 0.0, CEILING, wall)
	_wall(11.7, 12.3, 14.0, 18.0, header, CEILING, wall)
	# Lobby north wall with restroom and electrical room doors.
	_wall(-11.7, -6.0, 7.7, 8.3, 0.0, CEILING, wall)
	_wall(-3.0, 3.0, 7.7, 8.3, 0.0, CEILING, wall)
	_wall(6.0, 11.7, 7.7, 8.3, 0.0, CEILING, wall)
	_wall(-6.0, -3.0, 7.7, 8.3, header, CEILING, wall)
	_wall(3.0, 6.0, 7.7, 8.3, header, CEILING, wall)
	# Divider between the restroom and the electrical room.
	_wall(-0.3, 0.3, -22.4, 7.7, 0.0, CEILING, wall)


func _build_firing_room() -> void:
	var black := Mats.mat("black")
	var screen := Mats.mat("screen")
	_box(Vector3(-34.1, 12.0, 0.0), Vector3(0.3, 7.0, 30.0), screen, "FiringVideoWall")
	for x in [-28.0, -21.0]:
		for z in [-14.0, -7.0, 0.0, 7.0]:
			_box(Vector3(x, 0.55, z), Vector3(1.6, 1.1, 1.8), black, "Console", true)
			_box(Vector3(x - 0.75, 1.6, z), Vector3(0.1, 0.9, 1.5), screen, "ConsoleScreen")
	for x in [-30.0, -21.0, -14.0]:
		for z in [-12.0, 0.0, 12.0]:
			_box(Vector3(x, CEILING - 0.15, z), Vector3(1.6, 0.1, 3.0), Mats.mat("lamp"), "CeilingLight")
	var label := BuildKit.label(self, "FIRING ROOM", POS + Vector3(-23.0, 19.0, -22.2), 0.02, Color(0.9, 0.95, 1.0), "FiringRoomLabel")
	label.font_size = 128
	for z in [-10.0, 10.0]:
		var light := OmniLight3D.new()
		light.position = POS + Vector3(-25.0, 16.0, z)
		light.light_color = Color(0.85, 0.95, 1.0)
		light.light_energy = 1.6
		light.omni_range = 20.0
		light.shadow_enabled = false
		add_child(light)


func _build_lobby() -> void:
	var white := Mats.mat("steel_white")
	_box(Vector3(0.0, 0.55, 17.0), Vector3(5.0, 1.1, 1.4), Mats.mat("concrete_dark"), "ReceptionDesk", true)
	_box(Vector3(0.0, 1.16, 17.0), Vector3(5.2, 0.12, 1.6), white, "DeskTop")
	for x in [-9.0, 9.0]:
		_box(Vector3(x, 0.45, 19.0), Vector3(3.0, 0.9, 0.8), Mats.mat("black"), "Bench", true)
	var welcome := BuildKit.label(self, "WELCOME", POS + Vector3(0.0, 17.0, 22.2), 0.02, Color(0.06, 0.12, 0.22), "WelcomeSign")
	welcome.rotation_degrees.y = 180.0
	welcome.font_size = 128
	_box(Vector3(0.0, 4.8, 22.25), Vector3(2.0, 0.4, 0.1), Mats.mat("screen"), "ExitSign")
	var light := OmniLight3D.new()
	light.position = POS + Vector3(0.0, 18.0, 14.0)
	light.light_color = Color(1.0, 0.94, 0.82)
	light.light_energy = 2.0
	light.omni_range = 16.0
	light.shadow_enabled = false
	add_child(light)


func _build_restrooms_and_electrical() -> void:
	var white := Mats.mat("steel_white")
	# Restroom: toilets and sinks along the west wall, stall dividers.
	for z in [-18.0, -14.0, -10.0]:
		_box(Vector3(-10.0, 0.5, z), Vector3(0.8, 1.0, 1.0), white, "Toilet")
		_box(Vector3(-2.0, 0.9, z), Vector3(0.6, 0.9, 0.5), white, "Sink")
	for z in [-16.0, -12.0]:
		_box(Vector3(-10.0, 0.9, z), Vector3(3.0, 1.8, 0.1), white, "StallDivider")
	var restroom := BuildKit.label(self, "RESTROOM", POS + Vector3(-4.5, 19.5, 8.35), 0.02, Color(0.9, 0.95, 1.0), "RestroomLabel")
	restroom.font_size = 96
	# Electrical room: a row of switchgear cabinets.
	for z in [-20.0, -16.0, -12.0, -8.0, -4.0, 0.0]:
		_box(Vector3(2.0, 1.1, z), Vector3(1.0, 2.2, 0.8), Mats.mat("steel_grey"), "SwitchgearCabinet")
	var electrical := BuildKit.label(self, "ELECTRICAL", POS + Vector3(4.5, 19.5, 8.35), 0.02, Color(0.9, 0.95, 1.0), "ElectricalLabel")
	electrical.font_size = 96


func _build_conference_room() -> void:
	var steel := Mats.mat("steel_grey")
	_box(Vector3(23.0, 0.35, 0.0), Vector3(12.0, 0.7, 4.0), Mats.mat("black"), "ConferenceTable", true)
	for x in [18.0, 20.5, 23.0, 25.5, 28.0]:
		for z in [-3.0, 3.0]:
			_box(Vector3(x, 0.45, z), Vector3(0.9, 0.9, 0.9), steel, "Chair")
	_box(Vector3(34.1, 7.0, 0.0), Vector3(0.3, 3.0, 8.0), Mats.mat("screen"), "ConferenceScreen")
	var light := OmniLight3D.new()
	light.position = POS + Vector3(23.0, 18.0, 0.0)
	light.light_color = Color(1.0, 0.94, 0.82)
	light.light_energy = 1.8
	light.omni_range = 18.0
	light.shadow_enabled = false
	add_child(light)


func _build_safety() -> void:
	var red := Mats.mat("red")
	_box(Vector3(-11.4, 1.2, 20.0), Vector3(0.4, 1.0, 0.3), red, "Extinguisher")
	_box(Vector3(11.4, 1.2, 20.0), Vector3(0.4, 1.0, 0.3), red, "Extinguisher")
	_box(Vector3(-33.9, 1.2, -20.0), Vector3(0.3, 1.0, 0.4), red, "Extinguisher")
