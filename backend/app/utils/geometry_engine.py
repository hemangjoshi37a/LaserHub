import math
import logging
from typing import List, Tuple, Dict, Any

logger = logging.getLogger(__name__)

class GeometryEngine:
    """
    Advanced geometry analysis and repair engine for LaserHub.
    Handles path analysis, duplicate detection, and automated repair.
    """
    
    @staticmethod
    def calculate_distance(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        return math.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)

    @staticmethod
    def find_open_paths(segments: List[Tuple[Tuple[float, float], Tuple[float, float]]], tolerance: float = 0.1) -> List[Dict[str, Any]]:
        """
        Identify open paths in a collection of line segments.
        Returns a list of 'endpoint' issues.
        """
        point_counts = {}
        
        def round_point(p):
            return (round(p[0] / tolerance) * tolerance, round(p[1] / tolerance) * tolerance)

        for p1, p2 in segments:
            rp1 = round_point(p1)
            rp2 = round_point(p2)
            point_counts[rp1] = point_counts.get(rp1, 0) + 1
            point_counts[rp2] = point_counts.get(rp2, 0) + 1
            
        open_points = [p for p, count in point_counts.items() if count % 2 != 0]
        
        issues = []
        for p in open_points:
            issues.append({
                "type": "open_path",
                "location": p,
                "message": f"Open path detected near {p}"
            })
            
        return issues

    @staticmethod
    def detect_duplicates(segments: List[Tuple[Tuple[float, float], Tuple[float, float]]], tolerance: float = 0.05) -> List[int]:
        """
        Identify indices of duplicate line segments.
        """
        duplicates = []
        seen = []
        
        def normalize_segment(s):
            p1, p2 = s
            # Sort points to handle reversed lines
            return tuple(sorted([
                (round(p1[0] / tolerance) * tolerance, round(p1[1] / tolerance) * tolerance),
                (round(p2[0] / tolerance) * tolerance, round(p2[1] / tolerance) * tolerance)
            ]))

        for i, seg in enumerate(segments):
            nseg = normalize_segment(seg)
            if nseg in seen:
                duplicates.append(i)
            else:
                seen.append(nseg)
                
        return duplicates

    @staticmethod
    def calculate_complexity(cut_length: float, area: float) -> float:
        """
        Calculate complexity score (0-100).
        High score means lots of cutting in a small area.
        """
        if area <= 0: return 0
        # Ratio of cut length to bounding area
        # A simple rectangle has a ratio of ~2*(w+h)/(w*h)
        ratio = cut_length / area
        # Normalize to 0-100 (heuristic based on common laser parts)
        score = min(100, ratio * 20)
        return round(score, 1)

    @staticmethod
    def suggest_repair(segments: List[Tuple[Tuple[float, float], Tuple[float, float]]], tolerance: float = 0.5) -> List[Tuple[Tuple[float, float], Tuple[float, float]]]:
        """
        Heal a design by snapping nearby endpoints together.
        """
        repaired = list(segments)
        # TODO: Implement point-clustering and snapping
        return repaired
