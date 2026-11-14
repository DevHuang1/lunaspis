# src/player/Player.gd
# First-person walker for the space center: mouse look, sprint, jump,
# interaction raycast and camera shake for launches.
class_name PlayerController
extends CharacterBody3D

signal interactable_changed(prompt: String)

@export var walk_speed: float = 5.5
@export var sprint_speed: float = 15.0
@export var jump_velocity: float = 5.2
@export var mouse_sensitivity: float = 0.0022
@export var interact_distance: float = 5.0

@onready var head: Node3D = $Head
@onready var camera: Camera3D = $Head/Camera3D
@onready var interact_ray: RayCast3D = $Head/Camera3D/InteractRay

var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")
var _bob_time := 0.0
var _trauma := 0.0
var _focus: Node = null
var _captured := false


func _ready() -> void:
	interact_ray.target_position = Vector3(0.0, 0.0, -interact_distance)
	_capture_mouse(true)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and _captured:
		rotate_y(-event.relative.x * mouse_sensitivity)
		head.rotation.x = clampf(head.rotation.x - event.relative.y * mouse_sensitivity, -1.45, 1.45)
	elif event.is_action_pressed("ui_cancel"):
		_capture_mouse(not _captured)
	elif event.is_action_pressed("interact") and _focus != null:
		if _focus.has_method("interact"):
			_focus.interact()


func _physics_process(delta: float) -> void:
	var input := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var speed := sprint_speed if Input.is_action_pressed("sprint") else walk_speed
	var dir := (transform.basis * Vector3(input.x, 0.0, input.y)).normalized()

	if dir != Vector3.ZERO:
		velocity.x = dir.x * speed
		velocity.z = dir.z * speed
		_bob_time += delta * (speed / walk_speed) * 9.0
	else:
		velocity.x = move_toward(velocity.x, 0.0, speed * 6.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, speed * 6.0 * delta)

	if not is_on_floor():
		velocity.y -= _gravity * delta
	elif Input.is_action_just_pressed("jump"):
		velocity.y = jump_velocity

	move_and_slide()
	_update_head(delta)
	_update_focus()


func _update_head(delta: float) -> void:
	var bob := 0.0
	if is_on_floor() and Vector2(velocity.x, velocity.z).length() > 0.5:
		bob = sin(_bob_time) * 0.035
	head.position.y = lerpf(head.position.y, 1.65 + bob, delta * 12.0)

	_trauma = maxf(_trauma - delta * 1.4, 0.0)
	if _trauma > 0.0:
		var shake := _trauma * _trauma
		camera.h_offset = randf_range(-0.12, 0.12) * shake
		camera.v_offset = randf_range(-0.12, 0.12) * shake
	else:
		camera.h_offset = 0.0
		camera.v_offset = 0.0


func _update_focus() -> void:
	var hit: Node = null
	if interact_ray.is_colliding():
		var collider := interact_ray.get_collider()
		if collider != null and collider.has_method("interact"):
			hit = collider
	if hit == _focus:
		return
	_focus = hit
	interactable_changed.emit(str(hit.get("prompt")) if hit != null else "")


func add_trauma(amount: float) -> void:
	_trauma = clampf(_trauma + amount, 0.0, 1.0)


func teleport_to(target: Vector3, yaw: float) -> void:
	global_position = target
	rotation.y = yaw
	velocity = Vector3.ZERO


func _capture_mouse(capture: bool) -> void:
	_captured = capture
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if capture else Input.MOUSE_MODE_VISIBLE
