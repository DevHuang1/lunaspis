# src/core/BuildKit.gd
# Primitive helpers: the whole complex is generated from boxes, cylinders and
# spheres so the scene needs zero imported meshes to run.
class_name BuildKit
extends RefCounted


static func box(parent: Node3D, size: Vector3, pos: Vector3, mat: Material, node_name := "Box") -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	return _spawn(parent, mesh, pos, mat, node_name)


static func box_rot(parent: Node3D, size: Vector3, pos: Vector3, rot_deg: Vector3, mat: Material, node_name := "Box") -> MeshInstance3D:
	var mi := box(parent, size, pos, mat, node_name)
	mi.rotation_degrees = rot_deg
	return mi


static func cylinder(parent: Node3D, radius: float, height: float, pos: Vector3, mat: Material, node_name := "Cylinder", segments := 24) -> MeshInstance3D:
	return cone(parent, radius, radius, height, pos, mat, node_name, segments)


static func cone(parent: Node3D, top_radius: float, bottom_radius: float, height: float, pos: Vector3, mat: Material, node_name := "Cone", segments := 24) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.top_radius = top_radius
	mesh.bottom_radius = bottom_radius
	mesh.height = height
	mesh.radial_segments = segments
	mesh.rings = 1
	return _spawn(parent, mesh, pos, mat, node_name)


static func sphere(parent: Node3D, radius: float, pos: Vector3, mat: Material, node_name := "Sphere", segments := 24) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	mesh.radial_segments = segments
	mesh.rings = maxi(6, segments / 2)
	return _spawn(parent, mesh, pos, mat, node_name)


static func torus(parent: Node3D, inner_radius: float, outer_radius: float, pos: Vector3, mat: Material, node_name := "Torus") -> MeshInstance3D:
	var mesh := TorusMesh.new()
	mesh.inner_radius = inner_radius
	mesh.outer_radius = outer_radius
	mesh.rings = 24
	mesh.ring_segments = 12
	return _spawn(parent, mesh, pos, mat, node_name)


## Box stretched between two points — used for lattice legs, braces and wires.
static func beam(parent: Node3D, a: Vector3, b: Vector3, thickness: float, mat: Material, node_name := "Beam") -> MeshInstance3D:
	var delta := b - a
	var length := delta.length()
	if length < 0.001:
		return null
	var dir := delta / length
	var reference := Vector3.UP if absf(dir.dot(Vector3.UP)) < 0.99 else Vector3.RIGHT
	var side := reference.cross(dir).normalized()
	var up := side.cross(dir)
	var mesh := BoxMesh.new()
	mesh.size = Vector3(thickness, length, thickness)
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = mesh
	mi.material_override = mat
	mi.transform = Transform3D(Basis(side, dir, up), (a + b) * 0.5)
	parent.add_child(mi)
	return mi


## Box collision shape. Must be parented to a CollisionObject3D (StaticBody3D).
static func collision_box(parent: Node3D, size: Vector3, pos: Vector3, rot_deg := Vector3.ZERO) -> CollisionShape3D:
	var shape := BoxShape3D.new()
	shape.size = size
	var cs := CollisionShape3D.new()
	cs.shape = shape
	cs.position = pos
	cs.rotation_degrees = rot_deg
	parent.add_child(cs)
	return cs


static func label(parent: Node3D, text: String, pos: Vector3, pixel_size: float, color: Color, node_name := "Label") -> Label3D:
	var l := Label3D.new()
	l.name = node_name
	l.text = text
	l.position = pos
	l.pixel_size = pixel_size
	l.modulate = color
	l.outline_size = 0
	l.font_size = 128
	l.double_sided = true
	l.shaded = true
	parent.add_child(l)
	return l


static func _spawn(parent: Node3D, mesh: Mesh, pos: Vector3, mat: Material, node_name: String) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	parent.add_child(mi)
	return mi
