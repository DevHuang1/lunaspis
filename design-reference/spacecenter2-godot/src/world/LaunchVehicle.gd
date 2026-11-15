# src/world/LaunchVehicle.gd
# Stylised SLS / Orion stack plus a self-contained launch sequence:
# countdown -> ignition -> ascent, with plume, light and exhaust smoke.
class_name LaunchVehicle
extends Node3D

signal countdown_tick(seconds_left: int)
signal ignition_started
signal liftoff
signal ascent_shake(strength: float)
signal sequence_finished

enum State { IDLE, COUNTDOWN, IGNITION, ASCENT, DONE }

const COUNTDOWN_SECONDS := 10.0
const IGNITION_SECONDS := 3.0
const CUTOFF_ALTITUDE := 1400.0

var state: int = State.IDLE

var _timer := 0.0
var _velocity := 0.0
var _last_tick := -1
var _start_y := 0.0
var _flicker := 0.0
var _plume: MeshInstance3D
var _plume_light: OmniLight3D
var _smoke: GPUParticles3D
var _pad_smoke: GPUParticles3D


func _ready() -> void:
	_start_y = position.y
	add_to_group("launch_vehicle")
	_build_stack()
	_build_effects()


func start_countdown() -> void:
	if state != State.IDLE:
		return
	_start_y = position.y
	state = State.COUNTDOWN
	_timer = COUNTDOWN_SECONDS
	_last_tick = int(ceil(_timer))
	countdown_tick.emit(_last_tick)


func skip_countdown() -> void:
	if state == State.COUNTDOWN:
		_timer = 0.01


func reset_sequence() -> void:
	state = State.IDLE
	position.y = _start_y
	rotation = Vector3.ZERO
	_velocity = 0.0
	_timer = 0.0
	_last_tick = -1
	if _plume:
		_plume.visible = false
	if _smoke:
		_smoke.emitting = false
	if _pad_smoke:
		_pad_smoke.emitting = false
	if _plume_light:
		_plume_light.light_energy = 0.0


func _process(delta: float) -> void:
	_flicker += delta
	match state:
		State.COUNTDOWN:
			_timer -= delta
			var secs := int(ceil(maxf(_timer, 0.0)))
			if secs != _last_tick:
				_last_tick = secs
				countdown_tick.emit(secs)
			if _timer <= 0.0:
				_ignite()
		State.IGNITION:
			_timer -= delta
			_update_plume()
			if _timer <= 0.0:
				_lift_off()
		State.ASCENT:
			_velocity += 8.0 * delta
			position.y += _velocity * delta
			ascent_shake.emit(clampf(0.9 - _velocity / 500.0, 0.08, 0.9))
			_update_plume()
			if position.y - _start_y > 250.0:
				rotate_z(deg_to_rad(-1.2) * delta)
			if position.y - _start_y > CUTOFF_ALTITUDE:
				_finish()


func _ignite() -> void:
	state = State.IGNITION
	_timer = IGNITION_SECONDS
	_plume.visible = true
	_smoke.emitting = true
	if _pad_smoke != null:
		_pad_smoke.emitting = true
	ignition_started.emit()


func _lift_off() -> void:
	state = State.ASCENT
	_velocity = 0.0
	liftoff.emit()


func _finish() -> void:
	state = State.DONE
	_smoke.emitting = false
	if _pad_smoke != null:
		_pad_smoke.emitting = false
	_plume.visible = false
	sequence_finished.emit()


func _update_plume() -> void:
	var flick := 1.0 + sin(_flicker * 41.0) * 0.08 + sin(_flicker * 73.0) * 0.05
	_plume.scale = Vector3(flick, 1.0 + sin(_flicker * 33.0) * 0.14, flick)
	_plume_light.light_energy = 6.0 + sin(_flicker * 47.0) * 2.2


func _build_stack() -> void:
	var foam := Mats.mat("foam")
	var white := Mats.mat("steel_white")
	var grey := Mats.mat("steel_grey")
	var dark := Mats.mat("engine")

	# Core stage (64.6 m).
	BuildKit.cylinder(self, 2.6, 64.6, Vector3(0.0, 32.3, 0.0), foam, "CoreStage", 32)
	for y in [6.0, 20.0, 34.0, 48.0, 62.0]:
		BuildKit.cylinder(self, 2.63, 0.5, Vector3(0.0, y, 0.0), Mats.mat("black"), "CoreBand", 32)

	# Interstage, ICPS upper stage, Orion service module and crew module.
	BuildKit.cylinder(self, 2.6, 3.0, Vector3(0.0, 66.1, 0.0), grey, "Interstage", 32)
	BuildKit.cylinder(self, 2.6, 12.5, Vector3(0.0, 73.85, 0.0), white, "ICPS", 32)
	BuildKit.cylinder(self, 2.2, 4.6, Vector3(0.0, 82.4, 0.0), grey, "ServiceModule", 32)
	BuildKit.cone(self, 0.95, 2.05, 3.2, Vector3(0.0, 86.3, 0.0), white, "CrewModule", 32)
	BuildKit.cylinder(self, 0.35, 3.4, Vector3(0.0, 89.6, 0.0), grey, "LASTruss", 12)
	BuildKit.cone(self, 0.05, 0.7, 2.4, Vector3(0.0, 92.5, 0.0), white, "LASNose", 12)

	# Twin solid rocket boosters.
	for side in [-1.0, 1.0]:
		var x: float = side * 5.4
		BuildKit.cylinder(self, 1.8, 54.0, Vector3(x, 27.0, 0.0), white, "SRB", 24)
		BuildKit.cone(self, 0.35, 1.8, 6.5, Vector3(x, 57.25, 0.0), white, "SRBNose", 24)
		BuildKit.cone(self, 2.0, 1.2, 2.5, Vector3(x, -1.25, 0.0), dark, "SRBNozzle", 20)
		for y in [12.0, 30.0, 46.0]:
			BuildKit.box(self, Vector3(2.6, 0.35, 0.6), Vector3(x * 0.5, y, 0.0), grey, "SRBStrut")

	# Four RS-25 engines under the core stage.
	for i in 4:
		var angle := TAU * float(i) / 4.0 + PI * 0.25
		BuildKit.cone(self, 0.55, 0.95, 3.0, Vector3(cos(angle) * 1.5, -1.5, sin(angle) * 1.5), dark, "RS25", 20)
	BuildKit.cylinder(self, 2.55, 0.8, Vector3(0.0, 0.0, 0.0), grey, "EngineSection", 32)

	# Lunaspis mission marking facing the camera / press site.
	BuildKit.box(self, Vector3(3.2, 1.7, 0.06), Vector3(0.0, 52.0, 2.63), Mats.mat("black"), "MissionMark")
	BuildKit.box(self, Vector3(1.6, 0.22, 0.07), Vector3(0.0, 52.6, 2.64), Mats.mat("yellow"), "MissionMarkAccent")
	BuildKit.label(self, "USA", Vector3(0.0, 43.0, 2.7), 0.012, Color(0.07, 0.08, 0.1), "USALabel").font_size = 200

	# Raceway conduit running up the core stage.
	BuildKit.beam(self, Vector3(2.72, 2.0, 0.0), Vector3(2.72, 62.0, 0.0), 0.28, grey, "Raceway")


func _build_effects() -> void:
	_plume = BuildKit.cone(self, 0.8, 3.2, 26.0, Vector3(0.0, -16.0, 0.0), Mats.mat("flame"), "Plume", 24)
	_plume.visible = false
	_plume.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	_plume_light = OmniLight3D.new()
	_plume_light.name = "PlumeLight"
	_plume_light.position = Vector3(0.0, -4.0, 0.0)
	_plume_light.light_color = Color(1.0, 0.62, 0.28)
	_plume_light.omni_range = 340.0
	_plume_light.light_energy = 0.0
	add_child(_plume_light)

	_smoke = GPUParticles3D.new()
	_smoke.name = "ExhaustSmoke"
	_smoke.amount = 500
	_smoke.lifetime = 5.0
	_smoke.position = Vector3(0.0, -6.0, 0.0)
	_smoke.emitting = false
	_smoke.local_coords = false
	_smoke.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_smoke.visibility_aabb = AABB(Vector3(-120.0, -80.0, -120.0), Vector3(240.0, 240.0, 240.0))

	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	process.emission_sphere_radius = 4.0
	process.direction = Vector3(0.0, -1.0, 0.0)
	process.spread = 35.0
	process.initial_velocity_min = 8.0
	process.initial_velocity_max = 40.0
	process.gravity = Vector3(0.0, 4.0, 0.0)
	process.scale_min = 4.0
	process.scale_max = 11.0
	process.color = Color(0.92, 0.92, 0.95, 0.55)
	_smoke.process_material = process

	var quad := QuadMesh.new()
	quad.size = Vector2(1.0, 1.0)
	quad.material = Mats.mat("smoke")
	_smoke.draw_pass_1 = quad
	add_child(_smoke)

	# Ground-level exhaust cloud: sits at the pad, not on the moving vehicle.
	_pad_smoke = GPUParticles3D.new()
	_pad_smoke.name = "PadExhaust"
	_pad_smoke.amount = 900
	_pad_smoke.lifetime = 7.0
	_pad_smoke.position = Vector3(0.0, 9.0, 0.0)
	_pad_smoke.emitting = false
	_pad_smoke.local_coords = false
	_pad_smoke.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_pad_smoke.visibility_aabb = AABB(Vector3(-300.0, -60.0, -300.0), Vector3(600.0, 320.0, 600.0))

	var pad_process := ParticleProcessMaterial.new()
	pad_process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pad_process.emission_sphere_radius = 14.0
	pad_process.direction = Vector3(0.0, 1.0, 0.0)
	pad_process.spread = 85.0
	pad_process.initial_velocity_min = 3.0
	pad_process.initial_velocity_max = 13.0
	pad_process.gravity = Vector3(0.0, 0.6, 0.0)
	pad_process.scale_min = 10.0
	pad_process.scale_max = 24.0
	pad_process.color = Color(0.94, 0.94, 0.96, 0.45)
	_pad_smoke.process_material = pad_process

	var pad_quad := QuadMesh.new()
	pad_quad.size = Vector2(1.0, 1.0)
	pad_quad.material = Mats.mat("smoke")
	_pad_smoke.draw_pass_1 = pad_quad
	get_parent().add_child(_pad_smoke)
