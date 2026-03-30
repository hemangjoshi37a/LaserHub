"""
File parsing utilities for vector formats
"""

import os
import re
import math
from typing import Dict, Tuple, Optional
from pathlib import Path


def parse_dxf(file_path: str) -> Dict:
    """
    Parse DXF file and extract dimensions and cut length
    
    Args:
        file_path: Path to DXF file
        
    Returns:
        Dictionary with width, height, area, cut_length
    """
    try:
        import ezdxf
    except ImportError:
        raise ImportError("ezdxf not installed. Install with: pip install ezdxf")
    
    doc = ezdxf.readfile(file_path)
    msp = doc.modelspace()
    
    # Get all entities
    entities = list(msp)
    
    if not entities:
        raise ValueError("No entities found in DXF file")
    
    # Calculate bounding box
    min_x, min_y = float('inf'), float('inf')
    max_x, max_y = float('-inf'), float('-inf')
    
    cut_length = 0.0
    
    for entity in entities:
        try:
            bbox = entity.bbox()
            if bbox is not None:
                min_x = min(min_x, bbox.xmin)
                min_y = min(min_y, bbox.ymin)
                max_x = max(max_x, bbox.xmax)
                max_y = max(max_y, bbox.ymax)
            
            # Calculate cut length based on entity type
            if entity.dxftype() == 'LINE':
                p1 = entity.dxf.start
                p2 = entity.dxf.end
                cut_length += math.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
            elif entity.dxftype() == 'CIRCLE':
                radius = entity.dxf.radius
                cut_length += 2 * math.pi * radius
            elif entity.dxftype() == 'ARC':
                radius = entity.dxf.radius
                angle = entity.dxf.angle
                cut_length += math.pi * radius * angle / 180
            elif entity.dxftype() == 'POLYLINE' or entity.dxftype() == 'LWPOLYLINE':
                vertices = list(entity.vertices())
                for i in range(len(vertices) - 1):
                    p1 = vertices[i]
                    p2 = vertices[i + 1]
                    cut_length += math.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
        except Exception:
            continue
    
    width = max_x - min_x if max_x > min_x else 0
    height = max_y - min_y if max_y > min_y else 0
    
    # Convert to mm (assuming DXF is in mm, if not adjust accordingly)
    width_mm = width
    height_mm = height
    area_cm2 = (width_mm * height_mm) / 100
    cut_length_mm = cut_length
    
    return {
        "width_mm": width_mm,
        "height_mm": height_mm,
        "area_cm2": area_cm2,
        "cut_length_mm": cut_length_mm,
    }


def parse_svg(file_path: str) -> Dict:
    """
    Parse SVG file and extract dimensions and cut length
    
    Args:
        file_path: Path to SVG file
        
    Returns:
        Dictionary with width, height, area, cut_length
    """
    import xml.etree.ElementTree as ET
    
    tree = ET.parse(file_path)
    root = tree.getroot()
    
    # Parse SVG dimensions
    width = 0
    height = 0
    
    # Try to get dimensions from viewBox
    viewbox = root.get('viewBox')
    if viewbox:
        parts = viewbox.split()
        if len(parts) == 4:
            width = float(parts[2])
            height = float(parts[3])
    
    # Try width/height attributes
    if not width or not height:
        width_attr = root.get('width')
        height_attr = root.get('height')
        if width_attr and height_attr:
            # Remove units if present
            width = float(re.sub(r'[^\d.]', '', width_attr))
            height = float(re.sub(r'[^\d.]', '', height_attr))
    
    # Calculate cut length from paths
    cut_length = 0.0
    
    # Find all path elements
    for path in root.iter('{http://www.w3.org/2000/svg}path'):
        d = path.get('d', '')
        cut_length += calculate_path_length(d)
    
    # Find all line elements
    for line in root.iter('{http://www.w3.org/2000/svg}line'):
        x1 = float(line.get('x1', 0))
        y1 = float(line.get('y1', 0))
        x2 = float(line.get('x2', 0))
        y2 = float(line.get('y2', 0))
        cut_length += math.sqrt((x2 - x1)**2 + (y2 - y1)**2)
    
    # Find all circle elements
    for circle in root.iter('{http://www.w3.org/2000/svg}circle'):
        r = float(circle.get('r', 0))
        cut_length += 2 * math.pi * r
    
    # Find all rect elements (perimeter)
    for rect in root.iter('{http://www.w3.org/2000/svg}rect'):
        w = float(rect.get('width', 0))
        h = float(rect.get('height', 0))
        cut_length += 2 * (w + h)
    
    # Assume SVG is in mm, convert area to cm²
    width_mm = width
    height_mm = height
    area_cm2 = (width_mm * height_mm) / 100
    cut_length_mm = cut_length
    
    return {
        "width_mm": width_mm,
        "height_mm": height_mm,
        "area_cm2": area_cm2,
        "cut_length_mm": cut_length_mm,
    }


def calculate_path_length(path_data: str) -> float:
    """
    Calculate length of SVG path
    
    Args:
        path_data: SVG path d attribute
        
    Returns:
        Path length
    """
    length = 0.0
    points = []
    
    # Simple parser for path commands
    commands = re.findall(r'([MmLlLlHhVvCcSsQqTtAaZz])([^MmLlHhVvZz]*)', path_data)
    
    current_x, current_y = 0, 0
    
    for cmd, params in commands:
        nums = [float(x) for x in re.findall(r'[-+]?\d*\.?\d+', params)]
        
        if cmd in 'MmLl':
            if cmd in 'Ll':
                for i in range(0, len(nums) - 1, 2):
                    x = nums[i]
                    y = nums[i + 1]
                    if points:
                        last_x, last_y = points[-1]
                        length += math.sqrt((x - last_x)**2 + (y - last_y)**2)
                    points.append((x, y))
            else:
                for i in range(0, len(nums) - 1, 2):
                    x = nums[i]
                    y = nums[i + 1]
                    if cmd == 'M':
                        points = [(x, y)]
                    else:
                        if points:
                            last_x, last_y = points[-1]
                            length += math.sqrt((x - last_x)**2 + (y - last_y)**2)
                        points.append((x, y))
    
    return length


def parse_generic(file_path: str) -> Dict:
    """
    Generic parser that tries to determine file type and parse accordingly
    
    Args:
        file_path: Path to vector file
        
    Returns:
        Dictionary with dimensions and cut length
    """
    ext = Path(file_path).suffix.lower()
    
    if ext == '.dxf':
        return parse_dxf(file_path)
    elif ext == '.svg':
        return parse_svg(file_path)
    else:
        # For other formats (AI, PDF, EPS), use basic file size estimation
        # In production, you'd use proper libraries for these formats
        file_size = os.path.getsize(file_path)
        
        # Rough estimation based on file size
        # This is a placeholder - proper implementation would parse the actual format
        estimated_area = file_size / 1000  # Very rough estimate
        estimated_cut_length = math.sqrt(estimated_area * 100) * 4
        
        return {
            "width_mm": math.sqrt(estimated_area * 100),
            "height_mm": math.sqrt(estimated_area * 100),
            "area_cm2": estimated_area,
            "cut_length_mm": estimated_cut_length,
        }
