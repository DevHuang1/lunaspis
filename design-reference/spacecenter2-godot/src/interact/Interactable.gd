# src/interact/Interactable.gd
# Attach to any StaticBody3D the player should be able to use with [E].
class_name Interactable
extends StaticBody3D

@export var prompt: String = "Interact"

signal interacted


func interact() -> void:
	interacted.emit()
