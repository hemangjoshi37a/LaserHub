"""
Nesting optimization utilities for laser cutting.
Helps in arranging parts on a sheet to minimize material waste.
"""

from typing import Any, Dict, List

from shapely.affinity import rotate, translate
from shapely.geometry import Polygon


class Nester:
    def __init__(self, sheet_width: float, sheet_height: float, margin: float = 2.0):
        self.sheet_width = sheet_width
        self.sheet_height = sheet_height
        self.margin = margin
        self.sheet_poly = Polygon([
            (0, 0), (sheet_width, 0), (sheet_width, sheet_height), (0, sheet_height)
        ])
        self.placed_parts = []
        self.total_area = sheet_width * sheet_height

    def add_part(self, part_poly: Polygon) -> bool:
        """
        Attempt to place a part on the sheet using a simple Bottom-Left Fill algorithm.
        """
        # Buffer part by margin to ensure spacing
        buffered_part = part_poly.buffer(self.margin / 2)

        # Try different rotations (0, 90, 180, 270)
        best_pos = None
        for angle in [0, 90]:
            rotated_part = rotate(buffered_part, angle, origin='center')

            # Get bounding box of rotated part
            minx, miny, maxx, maxy = rotated_part.bounds
            p_width = maxx - minx
            p_height = maxy - miny

            # Simple grid search for a free spot
            # In a real nester, this would be much more sophisticated (e.g. No-Fit Polygons)
            step = 5.0 # 5mm steps
            for y in range(0, int(self.sheet_height - p_height), int(step)):
                for x in range(0, int(self.sheet_width - p_width), int(step)):
                    candidate = translate(rotated_part, x - minx, y - miny)

                    # Check if candidate is within sheet
                    if not self.sheet_poly.contains(candidate):
                        continue

                    # Check for collisions with already placed parts
                    collision = False
                    for placed in self.placed_parts:
                        if candidate.intersects(placed):
                            collision = True
                            break

                    if not collision:
                        # Found a spot!
                        self.placed_parts.append(candidate)
                        return True

        return False

    def get_efficiency(self) -> float:
        """
        Calculate material usage efficiency.
        """
        if not self.placed_parts:
            return 0.0
        used_area = sum(part.area for part in self.placed_parts)
        return (used_area / self.total_area) * 100

def nest_parts(parts: List[Polygon], sheet_width: float, sheet_height: float) -> Dict[str, Any]:
    """
    Main entry point for nesting multiple parts.
    """
    nester = Nester(sheet_width, sheet_height)

    # Sort parts by area (descending) - common heuristic for better packing
    sorted_parts = sorted(parts, key=lambda p: p.area, reverse=True)

    placed_count = 0
    for part in sorted_parts:
        if nester.add_part(part):
            placed_count += 1

    return {
        "placed_count": placed_count,
        "total_parts": len(parts),
        "efficiency": round(nester.get_efficiency(), 2),
        "sheet_usage": f"{round(nester.get_efficiency(), 2)}%"
    }
