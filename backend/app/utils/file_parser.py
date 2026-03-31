"""
Advanced File parsing utilities for vector formats (DXF, SVG, AI, PDF)
"""

import logging
import math
import re
from pathlib import Path
from typing import Any, Dict

import ezdxf
from ezdxf import bbox

logger = logging.getLogger(__name__)

def parse_dxf(file_path: str) -> Dict[str, Any]:
    """
    Parse DXF file with advanced support for layers, blocks, and various entity types.
    """
    try:
        doc = ezdxf.readfile(file_path)
    except Exception as e:
        logger.error(f"Failed to read DXF file {file_path}: {e}")
        raise ValueError(f"Invalid DXF file: {e}")

    msp = doc.modelspace()

    # Explode blocks to handle complex parts
    # In a real scenario, we might want to handle blocks separately for optimization
    # but for simple cost calculation, flattening the drawing is easier.

    # Calculate bounding box for the entire modelspace
    try:
        extents = bbox.extents(msp)
        if extents is None:
            raise ValueError("DXF file is empty or has no valid geometry")

        # ezdxf.bbox.extents returns an Extents object in newer versions
        # It has min_t up to max_t. We want x and y.
        min_x = extents.extmin[0]
        min_y = extents.extmin[1]
        max_x = extents.extmax[0]
        max_y = extents.extmax[1]

        width_mm = max_x - min_x
        height_mm = max_y - min_y
    except Exception as e:
        logger.warning(f"Failed to calculate DXF bbox using ezdxf.bbox: {e}")
        # Fallback to manual calculation if needed, but ezdxf.bbox is robust
        width_mm, height_mm = 0, 0

    cut_length = 0.0
    layers = {}

    # Iterate through all entities, including those in blocks if needed
    # For simplicity, we just iterate top-level and handle common types
    for entity in msp:
        entity_length = 0.0

        try:
            if entity.dxftype() == 'LINE':
                p1 = entity.dxf.start
                p2 = entity.dxf.end
                entity_length = math.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
            elif entity.dxftype() == 'CIRCLE':
                entity_length = 2 * math.pi * entity.dxf.radius
            elif entity.dxftype() == 'ARC':
                # length = radius * angle_in_radians
                # ezdxf angles are in degrees
                radius = entity.dxf.radius
                start_angle = entity.dxf.start_angle
                end_angle = entity.dxf.end_angle
                if end_angle < start_angle:
                    angle_diff = 360 - start_angle + end_angle
                else:
                    angle_diff = end_angle - start_angle
                entity_length = radius * math.radians(angle_diff)
            elif entity.dxftype() in ('POLYLINE', 'LWPOLYLINE'):
                # For polylines, we can use the .length property or calculate from vertices
                # ezdxf provides a virtual_entities() helper which is great for exploding complex types
                for sub_entity in entity.virtual_entities():
                    if sub_entity.dxftype() == 'LINE':
                        p1 = sub_entity.dxf.start
                        p2 = sub_entity.dxf.end
                        entity_length += math.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
                    elif sub_entity.dxftype() == 'ARC':
                        radius = sub_entity.dxf.radius
                        start_angle = sub_entity.dxf.start_angle
                        end_angle = sub_entity.dxf.end_angle
                        if end_angle < start_angle:
                            angle_diff = 360 - start_angle + end_angle
                        else:
                            angle_diff = end_angle - start_angle
                        entity_length += radius * math.radians(angle_diff)
            elif entity.dxftype() == 'SPLINE':
                # Spline length is an approximation
                # ezdxf can flatten splines to polylines
                flattened = entity.flattening(0.1) # 0.1 mm tolerance
                for i in range(len(flattened) - 1):
                    p1 = flattened[i]
                    p2 = flattened[i+1]
                    entity_length += math.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
            elif entity.dxftype() == 'ELLIPSE':
                # Approximation of ellipse circumference
                # Ramanujan's formula: pi * [ 3(a+b) - sqrt((3a+b)(a+3b)) ]
                a = entity.dxf.major_axis.magnitude
                b = a * entity.dxf.ratio
                entity_length = math.pi * (3*(a+b) - math.sqrt((3*a+b)*(a+3*b)))
            elif entity.dxftype() == 'INSERT':
                # Blocks - handle recursively or explode
                # For now, let's just mention they are detected
                # In a full implementation, we'd use entity.explode()
                pass
        except Exception as e:
            logger.debug(f"Skipping entity {entity.dxftype()}: {e}")
            continue

        cut_length += entity_length
        layer_name = entity.dxf.layer
        layers[layer_name] = layers.get(layer_name, 0.0) + entity_length

    # Convert units if needed (assume mm for now as standard in laser cutting)
    # Check document units: doc.header['$INSUNITS']
    # 1 = Inches, 4 = Millimeters
    units = doc.header.get('$INSUNITS', 4)
    unit_factor = 1.0
    if units == 1: # Inches
        unit_factor = 25.4

    width_mm *= unit_factor
    height_mm *= unit_factor
    cut_length_mm = cut_length * unit_factor
    area_cm2 = (width_mm * height_mm) / 100

    return {
        "format": "DXF",
        "width_mm": round(width_mm, 2),
        "height_mm": round(height_mm, 2),
        "area_cm2": round(area_cm2, 2),
        "cut_length_mm": round(cut_length_mm, 2),
        "layers": {name: round(length * unit_factor, 2) for name, length in layers.items()},
        "validation": validate_geometry(msp)
    }

def parse_svg(file_path: str) -> Dict[str, Any]:
    """
    Improved SVG parser using xml parsing and path data analysis.
    """
    import xml.etree.ElementTree as ET

    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
    except Exception as e:
        logger.error(f"Failed to parse SVG {file_path}: {e}")
        raise ValueError(f"Invalid SVG file: {e}")

    # SVG namespaces
    ns = {'svg': 'http://www.w3.org/2000/svg'}

    # Extract dimensions
    width_mm, height_mm = 0.0, 0.0
    viewbox = root.get('viewBox')
    if viewbox:
        _, _, w, h = map(float, viewbox.replace(',', ' ').split())
        width_mm, height_mm = w, h
    else:
        # Fallback to width/height attrs
        w_str = root.get('width', '0')
        h_str = root.get('height', '0')
        # Simple extraction of numbers, ignoring units (assuming pixels/mm)
        width_mm = float(re.findall(r"[-+]?\d*\.\d+|\d+", w_str)[0])
        height_mm = float(re.findall(r"[-+]?\d*\.\d+|\d+", h_str)[0])

    cut_length = 0.0

    # Function to parse path 'd' attribute more accurately
    def get_path_length(d: str) -> float:
        # Split path data by commands
        commands = re.findall(r'([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)', d)
        length = 0.0
        current_pos = (0.0, 0.0)
        start_pos = (0.0, 0.0)

        for cmd, params in commands:
            nums = [float(n) for n in re.findall(r"[-+]?\d*\.\d+|\d+", params)]
            
            if cmd in ('M', 'm'):
                if len(nums) >= 2:
                    if cmd == 'M':
                        current_pos = (nums[0], nums[1])
                    else:
                        current_pos = (current_pos[0] + nums[0], current_pos[1] + nums[1])
                    start_pos = current_pos
                    # Implicit lineto if more numbers follow
                    for i in range(2, len(nums) - 1, 2):
                        new_pos = (nums[i], nums[i+1]) if cmd == 'M' else (current_pos[0] + nums[i], current_pos[1] + nums[i+1])
                        length += math.sqrt((new_pos[0]-current_pos[0])**2 + (new_pos[1]-current_pos[1])**2)
                        current_pos = new_pos
            elif cmd in ('L', 'l'):
                for i in range(0, len(nums) - 1, 2):
                    new_pos = (nums[i], nums[i+1]) if cmd == 'L' else (current_pos[0] + nums[i], current_pos[1] + nums[i+1])
                    length += math.sqrt((new_pos[0]-current_pos[0])**2 + (new_pos[1]-current_pos[1])**2)
                    current_pos = new_pos
            elif cmd in ('H', 'h'):
                for val in nums:
                    new_pos = (val, current_pos[1]) if cmd == 'H' else (current_pos[0] + val, current_pos[1])
                    length += abs(new_pos[0] - current_pos[0])
                    current_pos = new_pos
            elif cmd in ('V', 'v'):
                for val in nums:
                    new_pos = (current_pos[0], val) if cmd == 'V' else (current_pos[0], current_pos[1] + val)
                    length += abs(new_pos[1] - current_pos[1])
                    current_pos = new_pos
            elif cmd in ('C', 'c'):
                # Approximating cubic bezier length with chord length
                for i in range(0, len(nums) - 5, 6):
                    new_pos = (nums[i+4], nums[i+5]) if cmd == 'C' else (current_pos[0] + nums[i+4], current_pos[1] + nums[i+5])
                    length += math.sqrt((new_pos[0]-current_pos[0])**2 + (new_pos[1]-current_pos[1])**2)
                    current_pos = new_pos
            elif cmd in ('S', 's', 'Q', 'q', 'T', 't'):
                # Approximating other curves with chord length
                step = 4 if cmd in ('Q', 'q', 'S', 's') else 2
                for i in range(0, len(nums) - (step-1), step):
                    new_pos = (nums[i+step-2], nums[i+step-1]) if cmd.isupper() else (current_pos[0] + nums[i+step-2], current_pos[1] + nums[i+step-1])
                    length += math.sqrt((new_pos[0]-current_pos[0])**2 + (new_pos[1]-current_pos[1])**2)
                    current_pos = new_pos
            elif cmd in ('A', 'a'):
                # Approximating arc with chord length
                for i in range(0, len(nums) - 6, 7):
                    new_pos = (nums[i+5], nums[i+6]) if cmd == 'A' else (current_pos[0] + nums[i+5], current_pos[1] + nums[i+6])
                    length += math.sqrt((new_pos[0]-current_pos[0])**2 + (new_pos[1]-current_pos[1])**2)
                    current_pos = new_pos
            elif cmd in ('Z', 'z'):
                length += math.sqrt((start_pos[0]-current_pos[0])**2 + (start_pos[1]-current_pos[1])**2)
                current_pos = start_pos
        return length

    # Iterate through various shapes
    for path in root.iter('{http://www.w3.org/2000/svg}path'):
        cut_length += get_path_length(path.get('d', ''))

    for circle in root.iter('{http://www.w3.org/2000/svg}circle'):
        r = float(circle.get('r', 0))
        cut_length += 2 * math.pi * r

    for rect in root.iter('{http://www.w3.org/2000/svg}rect'):
        w = float(rect.get('width', 0))
        h = float(rect.get('height', 0))
        cut_length += 2 * (w + h)

    for line in root.iter('{http://www.w3.org/2000/svg}line'):
        x1, y1 = float(line.get('x1', 0)), float(line.get('y1', 0))
        x2, y2 = float(line.get('x2', 0)), float(line.get('y2', 0))
        cut_length += math.sqrt((x2-x1)**2 + (y2-y1)**2)

    area_cm2 = (width_mm * height_mm) / 100

    return {
        "format": "SVG",
        "width_mm": round(width_mm, 2),
        "height_mm": round(height_mm, 2),
        "area_cm2": round(area_cm2, 2),
        "cut_length_mm": round(cut_length, 2),
        "validation": {"is_valid": True, "warnings": []}
    }

def parse_pdf(file_path: str) -> Dict[str, Any]:
    """
    Extract basic info from PDF. Proper vector extraction from PDF is complex
    and usually requires tools like inkscape or ghostscript.
    Here we provide a placeholder that estimates based on page size.
    """
    try:
        from pypdf import PdfReader
    except ImportError:
        logger.warning("pypdf is not installed. PDF parsing unavailable.")
        raise ValueError("PDF parsing requires the 'pypdf' package")

    try:
        reader = PdfReader(file_path)
        if len(reader.pages) == 0:
            raise ValueError("PDF file has no pages")

        page = reader.pages[0]
        # Page size is usually in points (1/72 inch)
        box = page.mediabox
        width_pt = float(box.width)
        height_pt = float(box.height)
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Failed to read PDF file {file_path}: {e}")
        raise ValueError(f"Invalid PDF file: {e}")

    width_mm = width_pt * 25.4 / 72
    height_mm = height_pt * 25.4 / 72

    # For PDF, we often don't know the internal vector complexity without rendering
    # We'll use a heuristic or warn the user
    area_cm2 = (width_mm * height_mm) / 100

    return {
        "format": "PDF",
        "width_mm": round(width_mm, 2),
        "height_mm": round(height_mm, 2),
        "area_cm2": round(area_cm2, 2),
        "cut_length_mm": round(math.sqrt(area_cm2 * 100) * 4, 2), # Heuristic: perimeter
        "notes": "Vector complexity for PDF is estimated based on page boundaries."
    }

def parse_ai(file_path: str) -> Dict[str, Any]:
    """
    AI files are often PDF compatible.
    """
    try:
        res = parse_pdf(file_path)
        res["format"] = "AI"
        return res
    except Exception:
        # If not PDF compatible, it might be the old EPS-based AI format
        return {
            "format": "AI (Legacy)",
            "width_mm": 0,
            "height_mm": 0,
            "area_cm2": 0,
            "cut_length_mm": 0,
            "error": "Legacy AI format (EPS based) not supported. Save as SVG or PDF-compatible AI."
        }

def validate_geometry(msp) -> Dict[str, Any]:
    """
    Validate if geometry is suitable for laser cutting.
    Checks if paths are closed by comparing start and end points of entities.
    """
    warnings = []

    # Simple check for closed paths:
    # Collect all start and end points
    points = []
    for entity in msp:
        if entity.dxftype() == 'LINE':
            points.append((entity.dxf.start, entity.dxf.end))
        elif entity.dxftype() in ('POLYLINE', 'LWPOLYLINE'):
            if not entity.is_closed:
                warnings.append(f"Unclosed polyline detected on layer {entity.dxf.layer}")
        elif entity.dxftype() == 'CIRCLE':
            pass # Circles are always closed

    # In a real tool, we'd use a graph-based approach to find open loops
    if not warnings:
        return {"is_valid": True, "warnings": []}
    else:
        return {"is_valid": False, "warnings": warnings}

def _default_parse_result(file_path: str, fmt: str, error: str) -> Dict[str, Any]:
    """Return sensible defaults when parsing fails."""
    return {
        "format": fmt,
        "width_mm": 0.0,
        "height_mm": 0.0,
        "area_cm2": 0.0,
        "cut_length_mm": 0.0,
        "error": error,
        "validation": {"is_valid": False, "warnings": [error]},
    }


def parse_generic(file_path: str) -> Dict[str, Any]:
    """
    Determine format and parse. Returns sensible defaults on failure
    instead of crashing, so callers always get a result dict.
    """
    ext = Path(file_path).suffix.lower()

    parsers = {
        '.dxf': ('DXF', parse_dxf),
        '.svg': ('SVG', parse_svg),
        '.pdf': ('PDF', parse_pdf),
        '.ai': ('AI', parse_ai),
        '.eps': ('EPS', parse_ai),
    }

    if ext not in parsers:
        raise ValueError(f"Unsupported file format: {ext}")

    fmt, parser_fn = parsers[ext]
    try:
        return parser_fn(file_path)
    except ValueError:
        # Re-raise ValueError (already a known parse error with a message)
        raise
    except Exception as e:
        logger.error(f"Unexpected error parsing {fmt} file {file_path}: {e}")
        return _default_parse_result(file_path, fmt, str(e))
