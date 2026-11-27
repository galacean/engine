extends SceneTree

const BRUSH_NAMES := ["hill1", "hill2", "mountain1", "mountain2", "mountain3", "mountain4"]


func _init() -> void:
	var arguments := OS.get_cmdline_user_args()
	if arguments.size() != 2:
		push_error("Usage: godot --headless --script convert-terrain3d-height-brushes.gd -- <Terrain3D brushes> <output.r16>")
		quit(2)
		return

	var source_directory: String = arguments[0]
	var output_path: String = arguments[1]
	var encoded_brushes: Array[PackedByteArray] = []
	var resolutions: Array[int] = []
	for brush_name in BRUSH_NAMES:
		var source_path := source_directory.path_join(brush_name + ".exr")
		var image := Image.load_from_file(source_path)
		if image.is_empty() or image.get_width() != image.get_height():
			push_error("Terrain3D brush must be a non-empty square image: " + source_path)
			quit(3)
			return
		var samples := PackedByteArray()
		samples.resize(image.get_width() * image.get_height() * 2)
		var minimum := INF
		var maximum := -INF
		for y in image.get_height():
			for x in image.get_width():
				var value := clampf(image.get_pixel(x, y).r, 0.0, 1.0)
				minimum = minf(minimum, value)
				maximum = maxf(maximum, value)
				samples.encode_u16((y * image.get_width() + x) * 2, roundi(value * 65535.0))
		encoded_brushes.append(samples)
		resolutions.append(image.get_width())
		print("Converted %s: %dx%d, min=%f, max=%f" % [brush_name, image.get_width(), image.get_height(), minimum, maximum])

	var output := FileAccess.open(output_path, FileAccess.WRITE)
	if output == null:
		push_error("Cannot open generated output: " + output_path)
		quit(4)
		return
	output.store_buffer("SWHB".to_ascii_buffer())
	output.store_16(1)
	output.store_16(encoded_brushes.size())
	for index in encoded_brushes.size():
		output.store_16(resolutions[index])
		output.store_16(0)
		output.store_32(encoded_brushes[index].size())
		output.store_buffer(encoded_brushes[index])
	output.close()
	quit()
