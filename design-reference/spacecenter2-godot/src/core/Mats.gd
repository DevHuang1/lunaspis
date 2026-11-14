# src/core/Mats.gd
# Shared material library. Procedural noise textures give the concrete, grass
# and gravel some surface break-up without importing image assets.
class_name Mats
extends RefCounted

static var _cache: Dictionary = {}
static var _noise_cache: Dictionary = {}


static func mat(key: String) -> StandardMaterial3D:
	if _cache.has(key):
		return _cache[key]

	var m := StandardMaterial3D.new()
	match key:
		"concrete":
			_base(m, Color(0.8, 0.79, 0.76), 0.0, 0.94)
			_texture(m, 11, 0.09, Vector3(10, 10, 10))
		"concrete_dark":
			_base(m, Color(0.53, 0.53, 0.51), 0.0, 0.96)
			_texture(m, 12, 0.12, Vector3(6, 6, 6))
		"asphalt":
			_base(m, Color(0.11, 0.11, 0.12), 0.0, 0.92)
			_texture(m, 13, 0.18, Vector3(12, 12, 12))
		"apron":
			_base(m, Color(0.55, 0.55, 0.54), 0.0, 0.95)
			_texture(m, 18, 0.1, Vector3(26, 26, 26))
		"gravel":
			_base(m, Color(0.45, 0.41, 0.35), 0.0, 1.0)
			_texture(m, 14, 0.22, Vector3(20, 20, 20))
		"grass":
			_base(m, Color(0.23, 0.31, 0.16), 0.0, 1.0)
			_texture(m, 15, 0.14, Vector3(160, 160, 160))
		"sand":
			_base(m, Color(0.78, 0.71, 0.55), 0.0, 1.0)
			_texture(m, 16, 0.2, Vector3(40, 40, 40))
		"water":
			_base(m, Color(0.05, 0.2, 0.28), 0.25, 0.14)
			m.emission_enabled = true
			m.emission = Color(0.02, 0.08, 0.12)
			m.emission_energy_multiplier = 0.4
		"steel_white":
			_base(m, Color(0.9, 0.91, 0.92), 0.25, 0.38)
		"steel_grey":
			_base(m, Color(0.52, 0.54, 0.57), 0.7, 0.42)
		"tower":
			_base(m, Color(0.66, 0.67, 0.66), 0.45, 0.62)
		"rust":
			_base(m, Color(0.4, 0.21, 0.13), 0.1, 0.85)
		"foam":
			# SLS core-stage spray-on foam insulation
			_base(m, Color(0.76, 0.42, 0.19), 0.0, 0.82)
			_texture(m, 17, 0.35, Vector3(4, 4, 4))
		"nasa_blue":
			_base(m, Color(0.04, 0.16, 0.45), 0.1, 0.5)
		"red":
			_base(m, Color(0.62, 0.08, 0.1), 0.05, 0.55)
		"yellow":
			_base(m, Color(0.9, 0.7, 0.08), 0.0, 0.6)
		"orange":
			_base(m, Color(0.85, 0.35, 0.05), 0.0, 0.55)
		"black":
			_base(m, Color(0.05, 0.05, 0.06), 0.2, 0.7)
		"glass":
			_base(m, Color(0.03, 0.06, 0.1), 0.9, 0.06)
			m.emission_enabled = true
			m.emission = Color(0.1, 0.18, 0.28)
			m.emission_energy_multiplier = 0.5
		"engine":
			_base(m, Color(0.16, 0.16, 0.18), 0.9, 0.28)
		"lamp":
			_base(m, Color(1.0, 0.94, 0.78), 0.0, 0.3)
			m.emission_enabled = true
			m.emission = Color(1.0, 0.9, 0.7)
			m.emission_energy_multiplier = 4.0
		"screen":
			_base(m, Color(0.02, 0.12, 0.16), 0.1, 0.2)
			m.emission_enabled = true
			m.emission = Color(0.1, 0.75, 0.65)
			m.emission_energy_multiplier = 2.0
		"flame":
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
			m.cull_mode = BaseMaterial3D.CULL_DISABLED
			m.albedo_color = Color(1.0, 0.55, 0.18, 0.55)
			m.emission_enabled = true
			m.emission = Color(1.0, 0.45, 0.1)
			m.emission_energy_multiplier = 6.0
		"smoke":
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
			m.vertex_color_use_as_albedo = true
			m.albedo_texture = _soft_particle()
			m.albedo_color = Color(0.94, 0.94, 0.96, 0.55)
			m.cull_mode = BaseMaterial3D.CULL_DISABLED
		_:
			_base(m, Color(0.7, 0.7, 0.7), 0.0, 0.8)

	_cache[key] = m
	return m


static func _base(m: StandardMaterial3D, color: Color, metallic: float, roughness: float) -> void:
	m.albedo_color = color
	m.metallic = metallic
	m.roughness = roughness


static func _texture(m: StandardMaterial3D, seed_value: int, frequency: float, uv_scale: Vector3) -> void:
	m.albedo_texture = _noise(seed_value, frequency)
	m.uv1_scale = uv_scale
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC


static func _soft_particle() -> GradientTexture2D:
	if _cache.has("soft_particle"):
		return _cache["soft_particle"] as GradientTexture2D
	var gradient := Gradient.new()
	gradient.set_color(0, Color(1.0, 1.0, 1.0, 1.0))
	gradient.set_color(1, Color(1.0, 1.0, 1.0, 0.0))
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1.0, 0.5)
	texture.width = 128
	texture.height = 128
	_cache["soft_particle"] = texture
	return texture


static func _noise(seed_value: int, frequency: float) -> NoiseTexture2D:
	var key := "%d_%.3f" % [seed_value, frequency]
	if _noise_cache.has(key):
		return _noise_cache[key]
	var n := FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.seed = seed_value
	n.frequency = frequency
	n.fractal_octaves = 4
	var t := NoiseTexture2D.new()
	t.width = 256
	t.height = 256
	t.seamless = true
	t.noise = n
	var ramp := Gradient.new()
	ramp.set_color(0, Color(0.88, 0.88, 0.88))
	ramp.set_color(1, Color(1.0, 1.0, 1.0))
	t.color_ramp = ramp
	_noise_cache[key] = t
	return t
