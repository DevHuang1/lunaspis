# src/world/WorldBuilder.gd
# Assembles the site from the individual builders.
class_name WorldBuilder
extends Node3D

const InfrastructureScript = preload("res://src/world/Infrastructure.gd")
const SiteDetailsScript = preload("res://src/world/SiteDetails.gd")
const LCCInteriorScript = preload("res://src/world/LCCInterior.gd")

var terrain: TerrainBuilder
var complex: LaunchComplex
var facilities: FacilitiesBuilder
var vehicle: LaunchVehicle


func _ready() -> void:
	terrain = TerrainBuilder.new()
	terrain.name = "Terrain"
	add_child(terrain)

	complex = LaunchComplex.new()
	complex.name = "LaunchComplex39A"
	add_child(complex)
	vehicle = complex.vehicle

	facilities = FacilitiesBuilder.new()
	facilities.name = "Facilities"
	add_child(facilities)

	var infrastructure := InfrastructureScript.new()
	infrastructure.name = "Infrastructure"
	add_child(infrastructure)

	var site_details := SiteDetailsScript.new()
	site_details.name = "SiteDetails"
	add_child(site_details)

	var lcc_interior := LCCInteriorScript.new()
	lcc_interior.name = "LCCInterior"
	add_child(lcc_interior)
