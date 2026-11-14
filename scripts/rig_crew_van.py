"""
Blender Python Script: Rig OrbitForge Crew Van HD
Creates a complete vehicle control hierarchy:
- CTRL_Van_Root (master vehicle position and heading + UI property sliders)
- CTRL_Van_Body (chassis suspension roll, pitch, and bounce)
- CTRL_Van_Steer (steering controller linked to front wheels and cockpit steering wheel)
- CTRL_Van_Roll (master wheel roll controller linked to all 4 wheels)
- 4 Wheel Assemblies (FL, FR, RL, RR) with accurate center pivots and parented parts
- 6-Passenger Seats hierarchy parented to chassis
- Cleanly organized Blender Collections
"""

import bpy
import math
import sys
import os
from mathutils import Vector, Matrix


def log(msg):
    print(f"[RIG_VAN] {msg}")


def is_wheel_part(name):
    n = name.lower()
    if any(k in n for k in ['tread', 'alloy spoke', 'lug nut', 'machined rim', 'wheel hub', 'wheel inset']):
        return True
    if n.startswith('tire') and 'tread' not in n:
        return True
    return False


def get_or_create_collection(name, parent_col=None):
    if name in bpy.data.collections:
        col = bpy.data.collections[name]
    else:
        col = bpy.data.collections.new(name)
        if parent_col:
            parent_col.children.link(col)
        else:
            bpy.context.scene.collection.children.link(col)
    return col


def move_to_collection(obj, target_col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    if obj.name not in target_col.objects:
        target_col.objects.link(obj)


def set_parent_keep_transform(child, parent):
    bpy.context.view_layer.update()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.context.view_layer.update()


def main():
    blend_path = sys.argv[-1] if len(sys.argv) > 1 and sys.argv[-1].endswith(".blend") else None
    if blend_path and os.path.exists(blend_path):
        log(f"Opening blend file: {blend_path}")
        bpy.ops.wm.open_mainfile(filepath=blend_path)
    
    log(f"Initial objects in scene: {len(bpy.data.objects)}")

    # 1. Setup Collections
    collections = {
        "controls": get_or_create_collection("00_CONTROLS"),
        "body": get_or_create_collection("01_BODY_EXTERIOR"),
        "glass": get_or_create_collection("02_GLASS"),
        "interior": get_or_create_collection("03_INTERIOR"),
        "seats": get_or_create_collection("04_SEATS"),
        "wheels_fl": get_or_create_collection("05_WHEELS_FRONT_LEFT"),
        "wheels_fr": get_or_create_collection("06_WHEELS_FRONT_RIGHT"),
        "wheels_rl": get_or_create_collection("07_WHEELS_REAR_LEFT"),
        "wheels_rr": get_or_create_collection("08_WHEELS_REAR_RIGHT"),
        "lights": get_or_create_collection("09_LIGHTS"),
    }

    # 2. Partition Wheel Objects
    quad_objects = {"FL": [], "FR": [], "RL": [], "RR": []}
    for obj in bpy.data.objects:
        if is_wheel_part(obj.name):
            if obj.type == "MESH":
                center = sum((obj.matrix_world @ Vector(c) for c in obj.bound_box), Vector()) / 8.0
            else:
                center = obj.location
            is_front = center.x < 0
            is_left = center.y > 0
            quad = ("F" if is_front else "R") + ("L" if is_left else "R")
            quad_objects[quad].append(obj)

    log(f"Partitioned wheel parts: FL={len(quad_objects['FL'])}, FR={len(quad_objects['FR'])}, RL={len(quad_objects['RL'])}, RR={len(quad_objects['RR'])}")

    # 3. Create Master Control Empties
    # CTRL_Van_Root
    ctrl_root = bpy.data.objects.new("CTRL_Van_Root", None)
    ctrl_root.empty_display_type = "CIRCLE"
    ctrl_root.empty_display_size = 3.2
    ctrl_root.location = Vector((0.0, 0.0, 0.0))
    collections["controls"].objects.link(ctrl_root)

    # Custom properties on CTRL_Van_Root for quick slider access in Sidebar/N-panel
    ctrl_root["Steering"] = 0.0
    ctrl_root.id_properties_ui("Steering").update(
        min=-35.0, max=35.0, soft_min=-35.0, soft_max=35.0,
        description="Steering Angle in Degrees (-35 to +35)"
    )

    ctrl_root["Wheel_Roll"] = 0.0
    ctrl_root.id_properties_ui("Wheel_Roll").update(
        description="Master Wheel Roll in Degrees"
    )

    ctrl_root["Suspension"] = 0.0
    ctrl_root.id_properties_ui("Suspension").update(
        min=-0.3, max=0.3, soft_min=-0.3, soft_max=0.3,
        description="Chassis Suspension Offset in Meters (-0.3m to +0.3m)"
    )

    # CTRL_Van_Body (Chassis / suspension control)
    ctrl_body = bpy.data.objects.new("CTRL_Van_Body", None)
    ctrl_body.empty_display_type = "CUBE"
    ctrl_body.empty_display_size = 1.2
    ctrl_body.location = Vector((0.0, 0.0, 1.0))
    collections["controls"].objects.link(ctrl_body)
    set_parent_keep_transform(ctrl_body, ctrl_root)

    # Drive body Z location from ctrl_root["Suspension"]
    d_body = ctrl_body.driver_add("location", 2)
    v_body = d_body.driver.variables.new()
    v_body.name = "susp"
    v_body.type = "SINGLE_PROP"
    v_body.targets[0].id = ctrl_root
    v_body.targets[0].data_path = '["Suspension"]'
    d_body.driver.expression = "1.0 + susp"

    # CTRL_Van_Steer (Steering controller)
    ctrl_steer = bpy.data.objects.new("CTRL_Van_Steer", None)
    ctrl_steer.empty_display_type = "CIRCLE"
    ctrl_steer.empty_display_size = 0.7
    ctrl_steer.location = Vector((-3.1, 0.0, 0.6))
    ctrl_steer.rotation_euler = (0, 0, 0)
    collections["controls"].objects.link(ctrl_steer)
    set_parent_keep_transform(ctrl_steer, ctrl_root)

    # Drive steer Z rotation from ctrl_root["Steering"]
    d_steer = ctrl_steer.driver_add("rotation_euler", 2)
    v_steer = d_steer.driver.variables.new()
    v_steer.name = "deg"
    v_steer.type = "SINGLE_PROP"
    v_steer.targets[0].id = ctrl_root
    v_steer.targets[0].data_path = '["Steering"]'
    d_steer.driver.expression = "radians(deg)"

    # CTRL_Van_Roll (Master wheel roll controller)
    ctrl_roll = bpy.data.objects.new("CTRL_Van_Roll", None)
    ctrl_roll.empty_display_type = "CIRCLE"
    ctrl_roll.empty_display_size = 0.5
    ctrl_roll.location = Vector((-3.1, 0.0, 0.47))
    ctrl_roll.rotation_euler = (0, 0, 0)
    collections["controls"].objects.link(ctrl_roll)
    set_parent_keep_transform(ctrl_roll, ctrl_root)

    # Drive roll Y rotation from ctrl_root["Wheel_Roll"]
    d_roll = ctrl_roll.driver_add("rotation_euler", 1)
    v_roll = d_roll.driver.variables.new()
    v_roll.name = "deg"
    v_roll.type = "SINGLE_PROP"
    v_roll.targets[0].id = ctrl_root
    v_roll.targets[0].data_path = '["Wheel_Roll"]'
    d_roll.driver.expression = "radians(deg)"

    # 4. Wheel Centers and Rigging
    wheel_coords = {
        "FL": Vector((-1.58, 1.072, 0.47)),
        "FR": Vector((-1.58, -1.072, 0.47)),
        "RL": Vector((1.53, 1.072, 0.47)),
        "RR": Vector((1.53, -1.072, 0.47)),
    }

    wheel_roll_empties = {}

    for quad, coords in wheel_coords.items():
        is_front = quad.startswith("F")
        target_col = collections[f"wheels_{quad.lower()}"]

        # Create Roll Empty
        roll_empty = bpy.data.objects.new(f"Wheel_Roll_{quad}", None)
        roll_empty.empty_display_type = "CIRCLE"
        roll_empty.empty_display_size = 0.48
        roll_empty.location = coords
        roll_empty.rotation_euler = (0, 0, 0)
        target_col.objects.link(roll_empty)
        wheel_roll_empties[quad] = roll_empty

        if is_front:
            # Create Steering Pivot Empty
            steer_pivot = bpy.data.objects.new(f"Pivot_Steer_{quad}", None)
            steer_pivot.empty_display_type = "ARROWS"
            steer_pivot.empty_display_size = 0.4
            steer_pivot.location = coords
            steer_pivot.rotation_euler = (0, 0, 0)
            target_col.objects.link(steer_pivot)

            set_parent_keep_transform(steer_pivot, ctrl_root)
            set_parent_keep_transform(roll_empty, steer_pivot)

            # Copy rotation from CTRL_Van_Steer (Z-axis in local space)
            con_steer = steer_pivot.constraints.new(type="COPY_ROTATION")
            con_steer.name = "Steer_Link"
            con_steer.target = ctrl_steer
            con_steer.use_x = False
            con_steer.use_y = False
            con_steer.use_z = True
            con_steer.owner_space = "LOCAL"
            con_steer.target_space = "LOCAL"
        else:
            set_parent_keep_transform(roll_empty, ctrl_root)

        # Copy rotation from CTRL_Van_Roll (Y-axis in local space)
        con_roll = roll_empty.constraints.new(type="COPY_ROTATION")
        con_roll.name = "Roll_Link"
        con_roll.target = ctrl_roll
        con_roll.use_x = False
        con_roll.use_y = True
        con_roll.use_z = False
        con_roll.owner_space = "LOCAL"
        con_roll.target_space = "LOCAL"

        # Parent all 61 wheel parts to roll_empty
        for part in quad_objects[quad]:
            set_parent_keep_transform(part, roll_empty)
            move_to_collection(part, target_col)

    log("4 Wheel assemblies rigged with roll and steer pivots.")

    # 5. Seat Rigging
    seat_map = {
        "Driver seat": ["Driver Cushion", "Driver Backrest", "Driver Headrest"],
        "Front passenger seat": ["Front passenger Cushion", "Front passenger Backrest", "Front passenger Headrest"],
        "Row 2 left seat": ["Row 2 left Cushion", "Row 2 left Backrest", "Row 2 left Headrest"],
        "Row 2 right seat": ["Row 2 right Cushion", "Row 2 right Backrest", "Row 2 right Headrest"],
        "Row 3 left seat": ["Row 3 left Cushion", "Row 3 left Backrest", "Row 3 left Headrest"],
        "Row 3 right seat": ["Row 3 right Cushion", "Row 3 right Backrest", "Row 3 right Headrest"]
    }

    for seat_name, mesh_names in seat_map.items():
        seat_empty = bpy.data.objects.get(seat_name)
        if not seat_empty:
            continue
        move_to_collection(seat_empty, collections["seats"])
        set_parent_keep_transform(seat_empty, ctrl_body)
        for mname in mesh_names:
            mesh = bpy.data.objects.get(mname)
            if mesh:
                set_parent_keep_transform(mesh, seat_empty)
                move_to_collection(mesh, collections["seats"])

    log("6 Seats rigged with cushions/backrests/headrests parented.")

    # 6. Cockpit Steering Wheel Linkage
    steering_wheel = bpy.data.objects.get("Driver steering wheel")
    if steering_wheel:
        move_to_collection(steering_wheel, collections["interior"])
        set_parent_keep_transform(steering_wheel, ctrl_body)

        # Steering wheel constraint linked to CTRL_Van_Steer
        con_sw = steering_wheel.constraints.new(type="TRANSFORM")
        con_sw.name = "Cockpit_Steering_Link"
        con_sw.target = ctrl_steer
        con_sw.use_motion_extrapolate = True
        con_sw.map_from = "ROTATION"
        con_sw.from_min_z_rot = -math.radians(35)
        con_sw.from_max_z_rot = math.radians(35)
        con_sw.map_to = "ROTATION"
        con_sw.map_to_z_from = "Z"
        con_sw.to_min_z_rot = -math.radians(140)
        con_sw.to_max_z_rot = math.radians(140)
        con_sw.owner_space = "LOCAL"
        con_sw.target_space = "LOCAL"

    # 7. Categorize Remaining Objects & Parent to CTRL_Van_Body
    for obj in bpy.data.objects:
        if obj in [ctrl_root, ctrl_body, ctrl_steer, ctrl_roll]:
            continue
        if is_wheel_part(obj.name) or obj.name.startswith("Wheel_Roll_") or obj.name.startswith("Pivot_Steer_"):
            continue
        if any(s in obj.name.lower() for s in ["seat", "cushion", "backrest", "headrest"]):
            continue
        if obj.name == "Driver steering wheel":
            continue

        n = obj.name.lower()
        if "lamp" in n or "led" in n or "light" in n:
            target_col = collections["lights"]
        elif any(g in n for g in ["glass", "glazing", "windshield"]):
            target_col = collections["glass"]
        elif "dashboard" in n or "floor" in n:
            target_col = collections["interior"]
        else:
            target_col = collections["body"]

        move_to_collection(obj, target_col)
        set_parent_keep_transform(obj, ctrl_body)

    # 8. Unlink any remaining objects from the scene root collection if already in a subcollection
    for obj in bpy.data.objects:
        if len(obj.users_collection) > 1 and bpy.context.scene.collection in obj.users_collection:
            bpy.context.scene.collection.objects.unlink(obj)

    bpy.context.view_layer.update()
    log("Scene update complete. Verifying scene hierarchy...")

    # Verification checks
    orphans = [o.name for o in bpy.data.objects if o.parent is None and o != ctrl_root]
    log(f"Orphan objects (should be only []): {orphans}")

    # Save to Rigged file and overwrite input
    out_rigged = blend_path.replace(".blend", "-Rigged.blend") if blend_path else "OrbitForge-Crew-Van-HD-Rigged.blend"
    log(f"Saving rigged model to: {out_rigged}")
    bpy.ops.wm.save_as_mainfile(filepath=out_rigged)

    if blend_path and blend_path != out_rigged:
        log(f"Updating main blend file: {blend_path}")
        bpy.ops.wm.save_as_mainfile(filepath=blend_path)

    log("Rigging successfully completed!")


if __name__ == "__main__":
    main()
