# src/SpaceCenter.gd
# Hub controller: spawn points, location readout, launch console wiring and
# the countdown/launch flow that the rest of the game can hook into.
extends Node3D

const SPAWNS := [
	{"name": "Launch Complex 39A", "pos": Vector3(18.0, 0.2, 150.0), "yaw": 7.0},
	{"name": "Vehicle Assembly Building", "pos": Vector3(-720.0, 0.2, -140.0), "yaw": 90.0},
	{"name": "Launch Control Center", "pos": Vector3(-800.0, 0.2, 335.0), "yaw": 0.0},
	{"name": "Crawler Transporter", "pos": Vector3(-300.0, 0.2, -30.0), "yaw": 0.0},
	{"name": "Beach View", "pos": Vector3(320.0, 0.2, 0.0), "yaw": 90.0},
	{"name": "Communications Room", "pos": Vector3(-910.0, 68.5, -140.0), "yaw": -90.0},
]

@onready var player: PlayerController = $Player
@onready var hud: GameHUD = $HUD
@onready var sun: DirectionalLight3D = $Sun
@onready var world: WorldBuilder = $World

var _vehicle: LaunchVehicle
var _console: Node
var _area_index := -1
var _area_timer := 0.0


func _ready() -> void:
	sun.rotation_degrees = Vector3(-34.0, 42.0, 0.0)
	player.interactable_changed.connect(_on_interactable_changed)

	_vehicle = get_tree().get_first_node_in_group("launch_vehicle") as LaunchVehicle
	_console = get_tree().get_first_node_in_group("launch_console")
	if _console != null:
		_console.connect("interacted", _on_console_interacted)
	if _vehicle != null:
		_vehicle.countdown_tick.connect(_on_countdown_tick)
		_vehicle.liftoff.connect(_on_liftoff)
		_vehicle.ascent_shake.connect(player.add_trauma)
		_vehicle.sequence_finished.connect(_on_sequence_finished)

	teleport_to(0)
	hud.set_status("SITE STATUS: NOMINAL")
	if OS.has_environment("SC_VIEW"):
		var p := OS.get_environment("SC_VIEW").split(",")
		if p.size() >= 5:
			player.global_position = Vector3(float(p[0]), float(p[1]), float(p[2]))
			player.rotation.y = deg_to_rad(float(p[3]))
			player.get_node("Head").rotation.x = deg_to_rad(float(p[4]))


func _process(delta: float) -> void:
	if player.global_position.y < -25.0:
		teleport_to(maxi(_area_index, 0))
		return

	_area_timer -= delta
	if _area_timer > 0.0:
		return
	_area_timer = 0.5

	var best := _area_index
	var best_distance := INF
	for i in SPAWNS.size():
		var point: Vector3 = SPAWNS[i]["pos"]
		var distance := player.global_position.distance_to(point)
		if distance < best_distance:
			best_distance = distance
			best = i
	if best != _area_index and best >= 0:
		_area_index = best
		hud.set_location(SPAWNS[best]["name"])


func _unhandled_input(event: InputEvent) -> void:
	var key_event := event as InputEventKey
	if key_event == null or not key_event.pressed or key_event.echo:
		return
	var key := key_event.physical_keycode
	for i in SPAWNS.size():
		if key == KEY_1 + i:
			teleport_to(i)
			return

	if key == KEY_K and _vehicle != null:
		_vehicle.skip_countdown()
	elif key == KEY_R and _vehicle != null:
		_vehicle.reset_sequence()
		hud.hide_countdown()
		hud.set_status("SITE STATUS: NOMINAL")


func teleport_to(index: int) -> void:
	_area_index = index
	var spawn: Dictionary = SPAWNS[index]
	var pos: Vector3 = spawn["pos"]
	var yaw: float = deg_to_rad(spawn["yaw"])
	player.teleport_to(pos, yaw)
	hud.set_location(spawn["name"])


func _on_interactable_changed(prompt: String) -> void:
	hud.set_prompt(prompt)


func _on_console_interacted() -> void:
	if _vehicle == null or _vehicle.state != LaunchVehicle.State.IDLE:
		return
	hud.set_status("LAUNCH SEQUENCE INITIATED")
	_vehicle.start_countdown()


func _on_countdown_tick(seconds_left: int) -> void:
	if seconds_left > 0:
		hud.show_countdown("T-%02d" % seconds_left)
	else:
		hud.show_countdown("IGNITION")


func _on_liftoff() -> void:
	hud.show_countdown("LIFTOFF")
	hud.set_status("ASCENT  ·  PITCH PROGRAM NOMINAL")
	await get_tree().create_timer(5.0).timeout
	hud.hide_countdown()


func _on_sequence_finished() -> void:
	hud.set_status("ORBIT INSERTION COMPLETE  ·  WARP DRIVE READY")
	hud.show_countdown("ORBIT")
	await get_tree().create_timer(3.0).timeout
	hud.hide_countdown()
