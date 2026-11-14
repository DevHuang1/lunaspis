# src/world/Infrastructure.gd
# Site infrastructure outside the buildings: street lighting, junction signs,
# the LCC access checkpoint and landscaping.
extends Node3D


func _ready() -> void:
	_build_street_lights()
	_build_junction_signs()
	_build_checkpoint()
	_build_landscaping()


func _build_street_lights() -> void:
	_street_lights(Vector2(-900.0, 40.0), Vector2(-760.0, 250.0), 5, 8.0)
	_street_lights(Vector2(0.0, 95.0), Vector2(300.0, 60.0), 6, 7.0)
	_street_lights(Vector2(-740.0, 246.0), Vector2(-740.0, 360.0), 3, 7.0)


func _street_lights(a: Vector2, b: Vector2, count: int, offset: float) -> void:
	var delta := b - a
	var dir := delta / delta.length()
	var normal := Vector2(-dir.y, dir.x)
	var arm_yaw := rad_to_deg(atan2(-normal.y, normal.x))
	for i in count:
		var p := a + delta * ((float(i) + 0.5) / float(count)) + normal * offset
		BuildKit.cylinder(self, 0.18, 11.0, Vector3(p.x, 5.5, p.y), Mats.mat("steel_grey"), "StreetPole", 8)
		BuildKit.box_rot(self, Vector3(2.4, 0.25, 0.25), Vector3(p.x - normal.x * 1.1, 11.0, p.y - normal.y * 1.1), Vector3(0.0, arm_yaw, 0.0), Mats.mat("steel_grey"), "StreetArm")
		BuildKit.box(self, Vector3(0.9, 0.35, 1.6), Vector3(p.x - normal.x * 2.2, 10.8, p.y - normal.y * 2.2), Mats.mat("lamp"), "StreetLamp")


func _build_junction_signs() -> void:
	var steel := Mats.mat("steel_grey")

	# Stop sign where the LCC access road meets the main road.
	var stop := Vector3(-747.0, 0.0, 258.0)
	BuildKit.cylinder(self, 0.05, 2.4, stop + Vector3(0.0, 1.2, 0.0), steel, "StopPost", 6)
	BuildKit.cylinder(self, 0.45, 0.06, stop + Vector3(0.0, 2.6, 0.0), Mats.mat("red"), "StopSign", 8).rotation_degrees.x = 90.0
	var stop_label := BuildKit.label(self, "STOP", stop + Vector3(0.0, 2.6, 0.04), 0.008, Color(1.0, 1.0, 1.0), "StopLabel")
	stop_label.font_size = 64

	# Directional sign for the LCC.
	var sign_pos := Vector3(-730.0, 0.0, 258.0)
	for x in [-3.0, 3.0]:
		BuildKit.cylinder(self, 0.1, 3.4, sign_pos + Vector3(x, 1.7, 0.0), steel, "SignPost", 8)
	BuildKit.box(self, Vector3(7.0, 1.6, 0.25), sign_pos + Vector3(0.0, 3.6, 0.0), Mats.mat("nasa_blue"), "LCCSignBoard")
	var lcc_label := BuildKit.label(self, "← LCC", sign_pos + Vector3(0.0, 3.6, 0.15), 0.012, Color(0.95, 0.97, 1.0), "LCCSignLabel")
	lcc_label.font_size = 128


func _build_checkpoint() -> void:
	# Guard booth on the east side of the LCC access road, facing the traffic.
	var pos := Vector3(-728.0, 0.0, 330.0)
	BuildKit.box(self, Vector3(2.6, 2.6, 2.6), pos + Vector3(0.0, 1.3, 0.0), Mats.mat("steel_white"), "GuardBooth")
	BuildKit.box(self, Vector3(0.1, 1.2, 2.0), pos + Vector3(-1.32, 1.5, 0.0), Mats.mat("glass"), "GuardWindow")
	BuildKit.box(self, Vector3(3.0, 0.25, 3.0), pos + Vector3(0.0, 2.75, 0.0), Mats.mat("nasa_blue"), "GuardRoof")


func _build_landscaping() -> void:
	var trees := [
		Vector3(-875.0, 0.0, 285.0),
		Vector3(-872.0, 0.0, 320.0),
		Vector3(-858.0, 0.0, 262.0),
		Vector3(-805.0, 0.0, 262.0),
		Vector3(-852.0, 0.0, 360.0),
		Vector3(-872.0, 0.0, 385.0),
		Vector3(-748.0, 0.0, 392.0),
	]
	for i in trees.size():
		var height := 7.0 + float(i % 3)
		_tree(trees[i], height, 2.5 + float(i % 2) * 0.5)


func _tree(pos: Vector3, height: float, radius: float) -> void:
	BuildKit.cylinder(self, 0.35, height * 0.4, pos + Vector3(0.0, height * 0.2, 0.0), Mats.mat("rust"), "Trunk", 6)
	BuildKit.cone(self, radius * 0.25, radius, height * 0.8, pos + Vector3(0.0, height * 0.55, 0.0), Mats.mat("grass"), "Canopy", 8)
