"""
Advanced File parsing utilities for vector formats (DXF, SVG, AI, PDF, EPS)
"""

import logging
import math
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

import ezdxf
from ezdxf import bbox
from PIL import Image
from app.utils.geometry_engine import GeometryEngine

logger = logging.getLogger(__name__)


class FileFormatError(Exception):
    """Raised when a file format cannot be parsed or converted."""

    def __init__(self, message: str, format_type: str = "", details: Dict[str, Any] | None = None):
        super().__init__(message)
        self.format_type = format_type
        self.details = details or {}

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

def _read_svg_source(file_path: str) -> bytes:
    """Read an SVG file as bytes, normalizing UTF-16 exports to UTF-8.

    Some tools (notably Corel Draw 2021) export SVG as UTF-16 with a BOM. The
    Python ElementTree parser will fail on those because it expects the XML
    prolog's encoding declaration to match the byte content. Detect the UTF-16
    BOM, decode to unicode, and re-serialise as UTF-8 with an updated prolog.
    """
    with open(file_path, "rb") as fh:
        raw = fh.read()
    # BOM-sniff first (most reliable)
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        text = raw.decode("utf-16")
    elif raw[:4] in (b"\x00<\x00?", b"<\x00?\x00"):  # UTF-16 without BOM
        text = raw.decode("utf-16-be" if raw[:4] == b"\x00<\x00?" else "utf-16-le")
    else:
        return raw
    # Replace any prolog encoding=... with utf-8 so ET doesn't get confused
    text = re.sub(
        r'(<\?xml[^?]*?)encoding\s*=\s*"[^"]*"',
        r'\1encoding="utf-8"',
        text,
        count=1,
        flags=re.IGNORECASE,
    )
    return text.encode("utf-8")


def parse_svg(file_path: str) -> Dict[str, Any]:
    """
    Improved SVG parser using xml parsing and path data analysis.
    Handles UTF-8 and UTF-16-encoded SVGs (e.g. Corel Draw exports).
    """
    import xml.etree.ElementTree as ET

    try:
        svg_bytes = _read_svg_source(file_path)
        root = ET.fromstring(svg_bytes)
    except Exception as e:
        logger.error(f"Failed to parse SVG {file_path}: {e}")
        raise ValueError(f"Invalid SVG file: {e}")

    # SVG namespaces
    ns = {'svg': 'http://www.w3.org/2000/svg'}

    # Parse dimensions with unit awareness.
    # SVG supports: mm, cm, in, pt, pc, px, %, or no unit (treated as "user unit").
    # We derive physical size (mm) from width/height attrs, and compute the
    # scale factor between user-units (viewBox coords) and mm so cut_length
    # / area are in real-world units regardless of how the file was authored.
    def _to_mm(val_str: str) -> Optional[float]:
        if not val_str:
            return None
        m = re.match(r"\s*([+-]?\d*\.?\d+)\s*([a-zA-Z%]*)\s*$", val_str)
        if not m:
            return None
        num = float(m.group(1))
        unit = m.group(2).lower()
        factors = {
            "mm": 1.0, "cm": 10.0, "in": 25.4, "pt": 25.4 / 72.0, "pc": 25.4 / 6.0,
            "px": 25.4 / 96.0, "": 25.4 / 96.0,  # unitless assumed 96 DPI (SVG spec)
        }
        if unit == "%":
            return None
        return num * factors.get(unit, 25.4 / 96.0)

    w_attr = root.get('width', '')
    h_attr = root.get('height', '')
    viewbox = root.get('viewBox')
    vb_w = vb_h = None
    if viewbox:
        try:
            parts = [float(p) for p in viewbox.replace(',', ' ').split()]
            if len(parts) == 4:
                vb_w, vb_h = parts[2], parts[3]
        except ValueError:
            pass

    width_mm = _to_mm(w_attr)
    height_mm = _to_mm(h_attr)

    # If width/height were unitless or missing, fall back to viewBox treated as px
    if width_mm is None:
        width_mm = (vb_w or 0.0) * (25.4 / 96.0)
    if height_mm is None:
        height_mm = (vb_h or 0.0) * (25.4 / 96.0)

    # Scale factor: 1 user-unit == scale mm. Used to convert path lengths.
    if vb_w and width_mm:
        scale_mm_per_unit = width_mm / vb_w
    else:
        # No viewBox: width/height attrs are already the user-unit range
        scale_mm_per_unit = 1.0 if not w_attr or not _to_mm(w_attr) else (width_mm / (float(re.findall(r"[-+]?\d*\.?\d+", w_attr)[0]) or 1.0))

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

    def _polyline_length(points_attr: str, closed: bool) -> float:
        coords = [float(n) for n in re.findall(r"[-+]?\d*\.?\d+", points_attr)]
        length = 0.0
        for i in range(0, len(coords) - 3, 2):
            dx = coords[i + 2] - coords[i]
            dy = coords[i + 3] - coords[i + 1]
            length += math.sqrt(dx * dx + dy * dy)
        if closed and len(coords) >= 4:
            dx = coords[0] - coords[-2]
            dy = coords[1] - coords[-1]
            length += math.sqrt(dx * dx + dy * dy)
        return length

    for poly in root.iter('{http://www.w3.org/2000/svg}polyline'):
        cut_length += _polyline_length(poly.get('points', ''), closed=False)
    for poly in root.iter('{http://www.w3.org/2000/svg}polygon'):
        cut_length += _polyline_length(poly.get('points', ''), closed=True)

    for el in root.iter('{http://www.w3.org/2000/svg}ellipse'):
        rx = float(el.get('rx', 0))
        ry = float(el.get('ry', 0))
        # Ramanujan's approximation for ellipse perimeter
        h = ((rx - ry) ** 2) / ((rx + ry) ** 2) if (rx + ry) else 0
        cut_length += math.pi * (rx + ry) * (1 + (3 * h) / (10 + math.sqrt(4 - 3 * h)))

    # cut_length was accumulated in viewBox user-units; convert to mm
    cut_length_mm = cut_length * scale_mm_per_unit
    area_cm2 = (width_mm * height_mm) / 100

    return {
        "format": "SVG",
        "width_mm": round(width_mm, 2),
        "height_mm": round(height_mm, 2),
        "area_cm2": round(area_cm2, 2),
        "cut_length_mm": round(cut_length_mm, 2),
        "validation": {"is_valid": True, "warnings": []}
    }

def parse_pdf(file_path: str) -> Dict[str, Any]:
    """
    Extract dimensions and estimate cut length from a PDF file.

    Uses pypdf for page dimensions and attempts to extract vector stream
    operators (m/l/c/v/y) from the content stream to estimate cut length.
    Falls back to a perimeter-based heuristic when stream parsing fails.
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
    area_cm2 = (width_mm * height_mm) / 100

    # Try to extract vector path lengths from the PDF content stream
    cut_length_pt = 0.0
    stream_parsed = False
    try:
        content = page.extract_text() or ""
        # Extract raw content stream for vector operators
        if "/Contents" in (page.get("/Type") or ""):
            pass  # handled below

        # pypdf can give us the page content stream bytes
        raw_content = ""
        try:
            contents = page["/Contents"]
            if contents is not None:
                if hasattr(contents, "get_data"):
                    raw_content = contents.get_data().decode("latin-1", errors="ignore")
                elif hasattr(contents, "__iter__"):
                    # Array of streams
                    parts = []
                    for stream_ref in contents:
                        obj = stream_ref.get_object()
                        if hasattr(obj, "get_data"):
                            parts.append(obj.get_data().decode("latin-1", errors="ignore"))
                    raw_content = "\n".join(parts)
        except Exception:
            raw_content = ""

        if raw_content:
            cut_length_pt = _estimate_pdf_cut_length(raw_content)
            if cut_length_pt > 0:
                stream_parsed = True
    except Exception as exc:
        logger.debug(f"PDF stream parsing failed: {exc}")

    if stream_parsed:
        # Convert points to mm (1 pt = 25.4/72 mm)
        cut_length_mm = cut_length_pt * 25.4 / 72
    else:
        # Heuristic: perimeter of bounding box
        cut_length_mm = 2 * (width_mm + height_mm)

    result: Dict[str, Any] = {
        "format": "PDF",
        "width_mm": round(width_mm, 2),
        "height_mm": round(height_mm, 2),
        "area_cm2": round(area_cm2, 2),
        "cut_length_mm": round(cut_length_mm, 2),
    }
    if not stream_parsed:
        result["notes"] = "Cut length estimated from page boundaries (no vector streams found)."
    return result


def _estimate_pdf_cut_length(stream: str) -> float:
    """
    Walk through a PDF content stream and sum up line/curve segment lengths.

    Recognises the operators: m (moveto), l (lineto), c (curveto),
    v/y (shorthand curves), h (closepath), re (rectangle).
    Returns total length in PDF points.
    """
    # Tokenise: numbers followed by an operator letter
    tokens = re.findall(r'[-+]?\d*\.?\d+|[a-zA-Z]+\*?', stream)

    total_length = 0.0
    num_stack: list[float] = []
    current_x, current_y = 0.0, 0.0
    start_x, start_y = 0.0, 0.0

    for tok in tokens:
        # Try to parse as number
        try:
            num_stack.append(float(tok))
            continue
        except ValueError:
            pass

        op = tok
        ns = num_stack
        num_stack = []

        if op == "m" and len(ns) >= 2:
            current_x, current_y = ns[-2], ns[-1]
            start_x, start_y = current_x, current_y
        elif op == "l" and len(ns) >= 2:
            nx, ny = ns[-2], ns[-1]
            total_length += math.sqrt((nx - current_x) ** 2 + (ny - current_y) ** 2)
            current_x, current_y = nx, ny
        elif op == "c" and len(ns) >= 6:
            # Cubic bezier: approximate with chord length (good enough for cost estimate)
            nx, ny = ns[-2], ns[-1]
            # Better approx: sum of control polygon segments
            cp1x, cp1y = ns[-6], ns[-5]
            cp2x, cp2y = ns[-4], ns[-3]
            seg = (
                math.sqrt((cp1x - current_x) ** 2 + (cp1y - current_y) ** 2)
                + math.sqrt((cp2x - cp1x) ** 2 + (cp2y - cp1y) ** 2)
                + math.sqrt((nx - cp2x) ** 2 + (ny - cp2y) ** 2)
            )
            # Control polygon is always >= arc length; use 0.75 factor as heuristic
            total_length += seg * 0.75
            current_x, current_y = nx, ny
        elif op == "v" and len(ns) >= 4:
            nx, ny = ns[-2], ns[-1]
            total_length += math.sqrt((nx - current_x) ** 2 + (ny - current_y) ** 2)
            current_x, current_y = nx, ny
        elif op == "y" and len(ns) >= 4:
            nx, ny = ns[-2], ns[-1]
            total_length += math.sqrt((nx - current_x) ** 2 + (ny - current_y) ** 2)
            current_x, current_y = nx, ny
        elif op == "re" and len(ns) >= 4:
            rx, ry, rw, rh = ns[-4], ns[-3], ns[-2], ns[-1]
            total_length += 2 * (abs(rw) + abs(rh))
            current_x, current_y = rx, ry
            start_x, start_y = rx, ry
        elif op == "h":
            total_length += math.sqrt(
                (start_x - current_x) ** 2 + (start_y - current_y) ** 2
            )
            current_x, current_y = start_x, start_y

    return total_length

def _parse_postscript_bbox(file_path: str) -> Dict[str, Any]:
    """
    Extract BoundingBox from a PostScript-based file (EPS / legacy AI).

    Looks for %%BoundingBox and %%HiResBoundingBox comments.
    Values are in PostScript points (1/72 inch).

    Handles binary EPS files (with EPSC magic C5 D0 D3 C6 header) by reading
    a larger chunk so we capture the PostScript section that follows the header.
    """
    bbox_match = None
    try:
        # Binary EPS (Photoshop, Illustrator legacy) starts with C5 D0 D3 C6.
        # The PS section may start at byte offset stored in bytes 4–7 of the
        # header.  Reading 32 KB covers the DSC comments for virtually all files.
        with open(file_path, "rb") as fb:
            raw_start = fb.read(4)
            is_binary_eps = raw_start == b"\xc5\xd0\xd3\xc6"
            if is_binary_eps:
                # Read up to 64 KB; PS section starts at offset given in header
                fb.seek(0)
                raw = fb.read(65536)
            else:
                fb.seek(0)
                raw = fb.read(32768)

        header = raw.decode("latin-1", errors="ignore")

        # Prefer HiResBoundingBox (floating point)
        hires = re.search(
            r"%%HiResBoundingBox:\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)",
            header,
        )
        if hires:
            bbox_match = [float(v) for v in hires.groups()]
        else:
            std = re.search(
                r"%%BoundingBox:\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)",
                header,
            )
            if std:
                bbox_match = [float(v) for v in std.groups()]
    except Exception as exc:
        logger.debug(f"Failed to read PS header from {file_path}: {exc}")

    if bbox_match is None:
        return {
            "width_mm": 0.0,
            "height_mm": 0.0,
            "area_cm2": 0.0,
            "cut_length_mm": 0.0,
            "notes": "No BoundingBox found in file header.",
        }

    x1, y1, x2, y2 = bbox_match
    width_pt = x2 - x1
    height_pt = y2 - y1
    width_mm = width_pt * 25.4 / 72
    height_mm = height_pt * 25.4 / 72
    area_cm2 = (width_mm * height_mm) / 100
    cut_length_mm = 2 * (width_mm + height_mm)  # perimeter heuristic

    return {
        "width_mm": round(width_mm, 2),
        "height_mm": round(height_mm, 2),
        "area_cm2": round(area_cm2, 2),
        "cut_length_mm": round(cut_length_mm, 2),
        "notes": "Dimensions from BoundingBox; cut length estimated from perimeter.",
    }


def _try_ghostscript_to_svg_parse(file_path: str) -> Dict[str, Any] | None:
    """
    Convert a PostScript-based vector file (EPS / legacy AI / PS) to SVG and
    parse it for accurate geometry — real per-path cut length, not a bounding
    box estimate. This gives EPS/AI the same pricing accuracy as native SVG.

    Pipeline: ghostscript converts the file to PDF (vector-preserving, cropped
    to the artwork), then pdftocairo (poppler) converts that PDF to SVG, which
    we feed to parse_svg. We deliberately do NOT use ghostscript's old `svg`
    device — it was removed in ghostscript >= 9.55 (10.x raises "Unknown
    device: svg"), which is what made this path silently fail before.

    Returns None if the required tools are unavailable or any step fails, so
    callers fall back to the BoundingBox perimeter heuristic.
    """
    import shutil
    import tempfile

    gs = shutil.which("gs")
    pdftocairo = shutil.which("pdftocairo")
    if not gs or not pdftocairo:
        return None

    tmp_pdf = None
    tmp_svg = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            tmp_pdf = f.name
        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
            tmp_svg = f.name

        # Step 1: EPS/AI/PS -> PDF, cropped to the artwork bounding box so
        # dimensions match the design (not a full page).
        gs_proc = subprocess.run(
            [
                gs, "-dBATCH", "-dNOPAUSE", "-dQUIET", "-dEPSCrop",
                "-sDEVICE=pdfwrite", f"-sOutputFile={tmp_pdf}", file_path,
            ],
            capture_output=True,
            timeout=30,
        )
        if gs_proc.returncode != 0 or Path(tmp_pdf).stat().st_size == 0:
            logger.debug("EPS->PDF (ghostscript) produced no output")
            return None

        # Step 2: PDF -> SVG with vector paths preserved.
        cairo_proc = subprocess.run(
            [pdftocairo, "-svg", tmp_pdf, tmp_svg],
            capture_output=True,
            timeout=30,
        )
        if cairo_proc.returncode != 0 or Path(tmp_svg).stat().st_size == 0:
            logger.debug("PDF->SVG (pdftocairo) produced no output")
            return None

        return parse_svg(tmp_svg)
    except (subprocess.TimeoutExpired, Exception) as exc:
        logger.debug(f"Vector conversion (gs+pdftocairo) failed: {exc}")
        return None
    finally:
        for p in (tmp_pdf, tmp_svg):
            if p:
                try:
                    Path(p).unlink(missing_ok=True)
                except Exception:
                    pass


def parse_eps(file_path: str) -> Dict[str, Any]:
    """
    Parse EPS (Encapsulated PostScript) file.

    Strategy:
    1. Try converting via ghostscript to SVG and parsing that.
    2. Fall back to extracting BoundingBox from file header.
    """
    # Try ghostscript path for accurate results
    gs_result = _try_ghostscript_to_svg_parse(file_path)
    if gs_result is not None:
        gs_result["format"] = "EPS"
        return gs_result

    # Fallback: parse BoundingBox from header
    info = _parse_postscript_bbox(file_path)
    info["format"] = "EPS"
    return info


def parse_ai(file_path: str) -> Dict[str, Any]:
    """
    Parse Adobe Illustrator file.

    Modern AI files (CS+) are PDF-compatible and can be parsed via pypdf.
    Legacy AI files are EPS-based; we fall back to BoundingBox extraction.
    """
    # Try PDF-based parsing first (modern AI)
    try:
        res = parse_pdf(file_path)
        res["format"] = "AI"
        return res
    except Exception:
        pass

    # Try ghostscript SVG conversion
    gs_result = _try_ghostscript_to_svg_parse(file_path)
    if gs_result is not None:
        gs_result["format"] = "AI"
        return gs_result

    # Fall back to EPS-style BoundingBox extraction
    info = _parse_postscript_bbox(file_path)
    info["format"] = "AI (Legacy)"
    if info["width_mm"] == 0.0:
        info["notes"] = "Could not parse AI file. Save as PDF-compatible AI or SVG for best results."
    return info
def validate_geometry(msp) -> Dict[str, Any]:
    """
    Validate if geometry is suitable for laser cutting using GeometryEngine.
    """
    # ezdxf returns Vec3 for point attrs, which doesn't support slicing ([:2]
    # raises "TypeError: an integer is required"). Use explicit .x/.y instead.
    def _xy(p):
        return (p.x, p.y)

    segments = []
    for entity in msp:
        if entity.dxftype() == 'LINE':
            segments.append((_xy(entity.dxf.start), _xy(entity.dxf.end)))
        elif entity.dxftype() in ('POLYLINE', 'LWPOLYLINE'):
            # LWPolyline segments
            for sub in entity.virtual_entities():
                if sub.dxftype() == 'LINE':
                    segments.append((_xy(sub.dxf.start), _xy(sub.dxf.end)))

    open_paths = GeometryEngine.find_open_paths(segments)
    duplicates = GeometryEngine.detect_duplicates(segments)

    # Group findings into single summarised warnings rather than emitting one
    # entry per endpoint/segment (which produced thousands of items + a 0 score).
    warnings = []
    if open_paths:
        warnings.append({
            "code": "OPEN_PATH",
            "message": (
                f"{len(open_paths)} open contour endpoint(s) detected. Common for "
                "engraving/text; close contours that are meant to be cut through."
            ),
            "severity": "info",
            "count": len(open_paths),
        })

    if duplicates:
        warnings.append({
            "code": "DUPLICATE_LINES",
            "message": f"Detected {len(duplicates)} duplicate line(s) (double-cutting risk)",
            "severity": "warning",
            "count": len(duplicates),
        })

    # Proportionate score: open contours are advisory (cosmetic), duplicates are a
    # mild capped warning. Geometry that loads is, by default, cuttable.
    score = 100.0
    if open_paths:
        score -= min(6.0, 2.0)            # cosmetic, flat small cost
    if duplicates:
        score -= min(15.0, 6.0 + len(duplicates) * 0.1)
    health_score = int(max(0, min(100, round(score))))

    return {
        # Open contours alone no longer make geometry "invalid"; only an outright
        # parse/empty failure would (handled by callers). Keep duplicates advisory.
        "is_valid": True,
        "warnings": warnings,
        "health_score": health_score,
    }


def _parse_hpgl(file_path: str) -> Dict[str, Any]:
    """Parse HPGL/PLT files - simple pen plotter format"""
    try:
        with open(file_path, 'r', errors='ignore') as f:
            content = f.read()

        # Extract coordinates from PU (pen up) and PD (pen down) commands
        coords = re.findall(r'P[UD](\d+),(\d+)', content)

        if coords:
            xs = [int(c[0]) for c in coords]
            ys = [int(c[1]) for c in coords]
            # HPGL units are 0.025mm (40 units per mm)
            width_mm = (max(xs) - min(xs)) / 40.0
            height_mm = (max(ys) - min(ys)) / 40.0

            # Estimate cut length from PD moves
            pd_coords = []
            in_pd = False
            coords_str = ""
            for line in content.split(';'):
                line = line.strip()
                if line.startswith('PD'):
                    in_pd = True
                    coords_str = line[2:]
                elif line.startswith('PU'):
                    in_pd = False
                    continue

                if in_pd and coords_str:
                    pairs = re.findall(r'(\d+),(\d+)', coords_str)
                    pd_coords.extend([(int(x)/40.0, int(y)/40.0) for x, y in pairs])

            cut_length = 0.0
            for i in range(1, len(pd_coords)):
                dx = pd_coords[i][0] - pd_coords[i-1][0]
                dy = pd_coords[i][1] - pd_coords[i-1][1]
                cut_length += (dx*dx + dy*dy) ** 0.5

            return {
                "format": "HPGL",
                "width_mm": round(width_mm, 2),
                "height_mm": round(height_mm, 2),
                "area_cm2": round(width_mm * height_mm / 100, 2),
                "cut_length_mm": round(cut_length, 2),
            }
    except Exception:
        pass

    return _default_parse_result("", "HPGL", "HPGL parse failed")


def parse_cdr(file_path: str) -> Dict[str, Any]:
    """Parse a Corel Draw .cdr file.

    Converts to SVG via LibreOffice headless (libcdr import filter) and then
    delegates to parse_svg. Falls back to the generic size heuristic if
    LibreOffice is missing or conversion fails.
    """
    import tempfile
    from app.utils.file_converter import cdr_to_svg
    try:
        svg_text = cdr_to_svg(file_path)
    except Exception as exc:
        logger.warning(f"CDR→SVG failed for {file_path}: {exc}")
        result = _parse_binary_fallback(file_path)
        result["note"] = (
            "CDR conversion unavailable — dimensions estimated. "
            "Install LibreOffice or re-export as SVG/DXF for accurate analysis."
        )
        return result
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".svg", delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(svg_text)
        tmp_path = tmp.name
    try:
        parsed = parse_svg(tmp_path)
        parsed["format"] = "CDR"
        parsed.setdefault("note", "CDR converted to SVG via LibreOffice for analysis.")
        return parsed
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except Exception:
            pass


def _parse_binary_fallback(file_path: str) -> Dict[str, Any]:
    """Fallback for binary formats - extract minimal info"""
    import os
    file_size = os.path.getsize(file_path)
    ext = Path(file_path).suffix.lstrip('.').upper()

    # Rough estimation based on file size
    estimated_area = file_size / 100  # Very rough heuristic

    return {
        "format": ext,
        "width_mm": 100.0,  # Default placeholder
        "height_mm": 100.0,
        "area_cm2": round(estimated_area, 2) if estimated_area < 10000 else 100.0,
        "cut_length_mm": 500.0,  # Default placeholder
        "note": "Binary format - dimensions estimated. Upload SVG or DXF for accurate analysis."
    }


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


# Maximum number of distinct issue entries returned to the UI. Findings are
# already grouped by code (each carries a `count`), so this just guards against
# an unbounded list if many *different* problem types are detected.
_MAX_ISSUES_RETURNED = 12

# Codes that represent genuine, hard blockers for laser cutting. Only these can
# drive the score into the "fix before cutting" range. Everything else is an
# advisory the operator can usually ignore.
_BLOCKER_CODES = {
    "read_failed",
    "raster_image",
    "text_not_path",
    "empty_geometry",
    "zero_size",
    "self_intersection",
    "out_of_bounds",
}

_SEVERITY_RANK = {"error": 0, "warning": 1, "info": 2}


def _score_issues(issues: list) -> int:
    """Turn a list of grouped findings into a sane 0-100 health score.

    Design goals (see bug report):
      * Open paths / fills and other high-frequency advisories must NOT tank the
        score. They are common in real, perfectly-cuttable art.
      * Only genuine blockers (raster images, live text, unreadable/empty/zero-size
        geometry, self-intersections, out-of-bounds) can pull the score low.
      * Penalties use diminishing returns and per-bucket caps, so 1 issue and
        10,000 issues of the same kind land in a similar place — a typical
        multi-path design stays in the 70-100 band.
    """
    blocker_count = 0  # number of distinct blocker *types* present
    blocker_instances = 0
    warning_types = 0
    info_types = 0

    for i in issues:
        sev = i.get("severity", "info")
        code = i.get("code", "")
        cnt = max(1, int(i.get("count", 1) or 1))
        if code in _BLOCKER_CODES or (sev == "error" and code not in _BLOCKER_CODES):
            # Treat any remaining hard "error" as a blocker too, but blockers are
            # what matter — count distinct types and total instances separately.
            if code in _BLOCKER_CODES or sev == "error":
                blocker_count += 1
                blocker_instances += cnt
        elif sev == "warning":
            warning_types += 1
        else:
            info_types += 1

    score = 100.0

    # Blockers: heavy but bounded. First blocker type costs the most; additional
    # types cost less. A handful of duplicated blocker instances add a little.
    if blocker_count:
        score -= 42 + 18 * (blocker_count - 1)        # 42, 60, 78, ... capped below
        score -= min(15.0, (blocker_instances - blocker_count) * 0.5)

    # Warnings (e.g. tiny features): mild, capped. Even many warning *types* only
    # shave a limited amount.
    if warning_types:
        score -= min(18.0, 6.0 + 3.0 * (warning_types - 1))

    # Info advisories (open paths, fills, overlaps, layer notes): cosmetic. They
    # cost almost nothing no matter how many instances exist.
    if info_types:
        score -= min(6.0, 2.0 * info_types)

    return int(max(0, min(100, round(score))))


def validate_laser_cuttable(file_path: str) -> Dict[str, Any]:
    """
    Heuristic validation of SVG/DXF files for laser cutting suitability.

    Returns: {
      "score": 0-100,            # primary cuttability health score
      "health_score": 0-100,     # alias of score (consumed by the upload API)
      "is_valid": bool,          # False only when a genuine blocker is present
      "issues": [{"severity": "error|warning|info", "code": "...", "message": "...", "count": N}],
      "summary": "..."
    }

    The issue list is grouped by code (each entry carries a `count`) and capped,
    so a busy multi-path design surfaces a short, readable list — never thousands
    of duplicate findings.
    """
    ext = Path(file_path).suffix.lower()
    issues: list[Dict[str, Any]] = []

    try:
        if ext == ".svg":
            issues = _validate_svg(file_path)
        elif ext == ".dxf":
            issues = _validate_dxf(file_path)
        else:
            issues = [{
                "severity": "info",
                "code": "format_limited",
                "message": f"Validation for {ext} is limited. Upload SVG or DXF for full checks.",
                "count": 1,
            }]
    except Exception as exc:
        logger.warning(f"validate_laser_cuttable failed for {file_path}: {exc}")
        issues = [{
            "severity": "warning",
            "code": "validation_failed",
            "message": f"Could not fully validate file: {exc}",
            "count": 1,
        }]

    score = _score_issues(issues)

    # Sort errors first, then warnings, then info; cap the visible list.
    issues.sort(key=lambda i: _SEVERITY_RANK.get(i.get("severity", "info"), 3))
    has_blocker = any(
        i.get("code") in _BLOCKER_CODES or i.get("severity") == "error" for i in issues
    )
    if len(issues) > _MAX_ISSUES_RETURNED:
        hidden = len(issues) - _MAX_ISSUES_RETURNED
        issues = issues[:_MAX_ISSUES_RETURNED]
        issues.append({
            "severity": "info",
            "code": "more_issues",
            "message": f"+{hidden} more minor advisories not shown.",
            "count": hidden,
        })

    # Human summary: lead with whether it is cut-ready, then the headline counts.
    distinct = len(issues)
    if distinct == 0:
        summary = "Looks good for laser cutting!"
    elif has_blocker:
        summary = f"{distinct} item{'s' if distinct != 1 else ''} to review before cutting"
    else:
        summary = (
            f"{distinct} advisor{'ies' if distinct != 1 else 'y'} "
            "(safe to cut — informational only)"
        )

    return {
        "score": score,
        "health_score": score,
        "is_valid": not has_blocker,
        "issues": issues,
        "summary": summary,
    }


def _validate_svg(file_path: str) -> list:
    """Validate SVG file for common laser-cutting issues."""
    import xml.etree.ElementTree as ET

    issues: list[Dict[str, Any]] = []

    try:
        # Reuse the UTF-16-aware reader so Corel-exported SVGs validate too
        raw = _read_svg_source(file_path).decode("utf-8", errors="ignore")
    except Exception as exc:
        return [{"severity": "error", "code": "read_failed", "message": str(exc), "count": 1}]

    # Fill detection (regex — handles inline styles and attributes)
    fill_count = 0
    for m in re.finditer(r'\b(?:fill|style)\s*=\s*"([^"]*)"', raw, re.IGNORECASE):
        val = m.group(1).lower()
        if "fill" in val and "fill:none" not in val.replace(" ", "") and "fill=\"none\"" not in val:
            # crude check: non-none fill present
            if "none" not in val:
                fill_count += 1
    if fill_count > 0:
        issues.append({
            "severity": "info",
            "code": "has_fills",
            "message": "Filled shapes detected. Lasers only cut outlines — fills will be ignored or engraved.",
            "count": fill_count,
        })

    # Embedded raster images
    image_count = len(re.findall(r"<\s*image\b", raw, re.IGNORECASE))
    if image_count > 0:
        issues.append({
            "severity": "error",
            "code": "raster_image",
            "message": "Embedded raster images cannot be laser cut. Convert to vector paths.",
            "count": image_count,
        })

    # Text not converted to paths
    text_count = len(re.findall(r"<\s*text\b", raw, re.IGNORECASE))
    if text_count > 0:
        issues.append({
            "severity": "error",
            "code": "text_not_path",
            "message": "Text elements found. Convert text to paths/outlines before cutting.",
            "count": text_count,
        })

    # Parse for path-level checks
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
    except Exception:
        return issues

    ns = "{http://www.w3.org/2000/svg}"
    paths = list(root.iter(f"{ns}path"))

    open_path_count = 0
    tiny_detail_count = 0
    path_bboxes: list[tuple[float, float, float, float]] = []

    for p in paths:
        d = p.get("d", "")
        if not d:
            continue
        # Open path: no Z/z and no explicit close
        if not re.search(r"[Zz]", d):
            open_path_count += 1
        # Tiny detail heuristic: extract coord extent
        nums = [float(n) for n in re.findall(r"[-+]?\d*\.\d+|\d+", d)]
        if len(nums) >= 4:
            xs = nums[0::2]
            ys = nums[1::2]
            if xs and ys:
                bw = max(xs) - min(xs)
                bh = max(ys) - min(ys)
                if 0 < max(bw, bh) < 1.0:
                    tiny_detail_count += 1
                path_bboxes.append((min(xs), min(ys), max(xs), max(ys)))

    if open_path_count > 0:
        # Open paths are extremely common and frequently intentional (engraving,
        # lettering, line-art, score lines). They are NOT a cutting blocker, so we
        # surface them as a single informational note rather than thousands of
        # score-destroying "errors".
        issues.append({
            "severity": "info",
            "code": "open_path",
            "message": (
                "Open paths detected (no explicit close command). This is normal for "
                "engraving, text, or score lines. If these are meant to be cut-through "
                "outlines, make sure each contour is closed."
            ),
            "count": open_path_count,
        })

    if tiny_detail_count > 0:
        issues.append({
            "severity": "warning",
            "code": "tiny_details",
            "message": "Very small details (< 1 mm) may burn away or not cut cleanly.",
            "count": tiny_detail_count,
        })

    # Overlapping paths (simple bbox-overlap heuristic, capped to avoid O(n^2) blow-up)
    overlap = 0
    limit = min(len(path_bboxes), 80)
    for i in range(limit):
        for j in range(i + 1, limit):
            a = path_bboxes[i]
            b = path_bboxes[j]
            if a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]:
                # crude: inner bbox fully inside another counts once
                if a[0] >= b[0] and a[1] >= b[1] and a[2] <= b[2] and a[3] <= b[3]:
                    overlap += 1
                    break
    if overlap > 0:
        issues.append({
            "severity": "info",
            "code": "overlapping_paths",
            "message": "Some paths overlap or are nested — laser will double-cut these areas.",
            "count": overlap,
        })

    return issues


def _validate_dxf(file_path: str) -> list:
    """Validate DXF file for common laser-cutting issues."""
    issues: list[Dict[str, Any]] = []

    try:
        doc = ezdxf.readfile(file_path)
    except Exception as exc:
        return [{"severity": "error", "code": "read_failed", "message": str(exc), "count": 1}]

    msp = doc.modelspace()
    SUPPORTED = {"LINE", "CIRCLE", "ARC", "POLYLINE", "LWPOLYLINE", "SPLINE", "ELLIPSE", "INSERT", "POINT"}

    open_poly = 0
    unsupported: dict[str, int] = {}
    layers: set[str] = set()
    entity_sigs: dict[tuple, int] = {}

    for entity in msp:
        t = entity.dxftype()
        layers.add(getattr(entity.dxf, "layer", "0"))
        if t not in SUPPORTED:
            unsupported[t] = unsupported.get(t, 0) + 1
        if t in ("POLYLINE", "LWPOLYLINE"):
            try:
                if not entity.is_closed:
                    open_poly += 1
            except Exception:
                pass
        # Duplicate detection (by type + key coords)
        try:
            if t == "LINE":
                s = entity.dxf.start
                e = entity.dxf.end
                sig = ("LINE", round(s[0], 3), round(s[1], 3), round(e[0], 3), round(e[1], 3))
            elif t == "CIRCLE":
                c = entity.dxf.center
                sig = ("CIRCLE", round(c[0], 3), round(c[1], 3), round(entity.dxf.radius, 3))
            else:
                sig = None
            if sig is not None:
                entity_sigs[sig] = entity_sigs.get(sig, 0) + 1
        except Exception:
            pass

    duplicates = sum(c - 1 for c in entity_sigs.values() if c > 1)

    if open_poly > 0:
        issues.append({
            "severity": "error",
            "code": "open_polyline",
            "message": "Open polylines detected — close paths to ensure a through cut.",
            "count": open_poly,
        })
    if duplicates > 0:
        issues.append({
            "severity": "warning",
            "code": "duplicate_entities",
            "message": "Duplicate entities found — laser will cut these lines twice.",
            "count": duplicates,
        })
    for utype, cnt in unsupported.items():
        issues.append({
            "severity": "warning",
            "code": "unsupported_entity",
            "message": f"Unsupported entity type '{utype}' may not be cut.",
            "count": cnt,
        })
    if len(layers) > 1:
        issues.append({
            "severity": "info",
            "code": "multiple_layers",
            "message": f"Multiple layers ({len(layers)}) detected — confirm which should be cut vs engraved.",
            "count": len(layers),
        })

    return issues


def parse_image(file_path: str) -> Dict[str, Any]:
    """
    Parse raster images (PNG, JPG, JPEG) to get dimensions.
    Estimates cut length as the perimeter of the image.
    """
    try:
        with Image.open(file_path) as img:
            width_px, height_px = img.size
            # Get DPI (dots per inch) - fallback to 72 if missing
            dpi = img.info.get('dpi', (72, 72))
            if isinstance(dpi, (tuple, list)) and len(dpi) >= 2:
                dpi_x, dpi_y = float(dpi[0]), float(dpi[1])
            else:
                dpi_x, dpi_y = 72.0, 72.0
            
            # Sanity check for DPI (some files have 0 or weird values)
            if dpi_x <= 0: dpi_x = 72.0
            if dpi_y <= 0: dpi_y = 72.0

            width_mm = (width_px / dpi_x) * 25.4
            height_mm = (height_px / dpi_y) * 25.4
            
    except Exception as e:
        logger.error(f"Failed to parse image {file_path}: {e}")
        raise ValueError(f"Invalid image file: {e}")

    area_cm2 = (width_mm * height_mm) / 100
    cut_length_mm = 2 * (width_mm + height_mm) # Perimeter heuristic

    return {
        "format": Path(file_path).suffix.upper()[1:],
        "width_mm": round(width_mm, 2),
        "height_mm": round(height_mm, 2),
        "area_cm2": round(area_cm2, 2),
        "cut_length_mm": round(cut_length_mm, 2),
        "notes": "Raster image detected. Laser will engrave this or cut the boundary."
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
        '.eps': ('EPS', parse_eps),
        '.cdr': ('CDR', parse_cdr),
        '.plt': ('PLT', _parse_hpgl),
        '.hpgl': ('HPGL', _parse_hpgl),
        '.wmf': ('WMF', _parse_binary_fallback),
        '.emf': ('EMF', _parse_binary_fallback),
        '.png': ('PNG', parse_image),
        '.jpg': ('JPG', parse_image),
        '.jpeg': ('JPEG', parse_image),
        '.dwg': ('DWG', _parse_binary_fallback),
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
