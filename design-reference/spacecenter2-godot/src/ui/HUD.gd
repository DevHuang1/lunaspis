# src/ui/HUD.gd
# Minimal heads-up display: location, controls, interaction prompt, countdown.
class_name GameHUD
extends CanvasLayer

@onready var location_label: Label = $Root/LocationLabel
@onready var status_label: Label = $Root/StatusLabel
@onready var prompt_label: Label = $Root/PromptLabel
@onready var countdown_label: Label = $Root/CountdownLabel
@onready var fade_rect: ColorRect = $Root/Fade

var _fade_tween: Tween


func _ready() -> void:
	set_prompt("")
	countdown_label.visible = false
	fade_rect.modulate.a = 0.0


func set_location(title: String) -> void:
	location_label.text = "KENNEDY SPACE CENTER  ·  %s" % title.to_upper()


func set_status(text: String) -> void:
	status_label.text = text


func set_prompt(text: String) -> void:
	prompt_label.text = "" if text.is_empty() else "[E]  %s" % text


func show_countdown(text: String) -> void:
	countdown_label.text = text
	countdown_label.visible = true


func hide_countdown() -> void:
	countdown_label.visible = false


func fade_out(duration := 2.0) -> void:
	if _fade_tween != null:
		_fade_tween.kill()
	_fade_tween = create_tween()
	_fade_tween.tween_property(fade_rect, "modulate:a", 1.0, duration)


func fade_in(duration := 1.5) -> void:
	if _fade_tween != null:
		_fade_tween.kill()
	_fade_tween = create_tween()
	_fade_tween.tween_property(fade_rect, "modulate:a", 0.0, duration)
