"""
Cost calculation service for laser cutting
"""

from typing import Dict
from app.core.config import settings


def calculate_material_cost(area_cm2: float, thickness_mm: float, rate_per_cm2_mm: float) -> float:
    """
    Calculate material cost
    
    Args:
        area_cm2: Area in square centimeters
        thickness_mm: Thickness in millimeters
        rate_per_cm2_mm: Cost rate per cm² per mm
        
    Returns:
        Material cost in dollars
    """
    return area_cm2 * thickness_mm * rate_per_cm2_mm


def calculate_laser_time(cut_length_mm: float, cut_speed_mm_per_min: float = None) -> float:
    """
    Calculate estimated laser cutting time
    
    Args:
        cut_length_mm: Total cut length in millimeters
        cut_speed_mm_per_min: Cut speed in mm per minute
        
    Returns:
        Estimated time in minutes
    """
    if cut_speed_mm_per_min is None:
        cut_speed_mm_per_min = settings.CUT_SPEED_MM_PER_MIN
    
    return cut_length_mm / cut_speed_mm_per_min


def calculate_energy_cost(time_minutes: float, power_watts: float = None, 
                          electricity_rate: float = None) -> float:
    """
    Calculate energy cost for laser operation
    
    Args:
        time_minutes: Operation time in minutes
        power_watts: Laser power in watts
        electricity_rate: Electricity rate per kWh
        
    Returns:
        Energy cost in dollars
    """
    if power_watts is None:
        power_watts = settings.LASER_POWER_WATTS
    if electricity_rate is None:
        electricity_rate = settings.ELECTRICITY_RATE
    
    # Convert to kWh
    kwh = (power_watts * time_minutes) / (1000 * 60)
    return kwh * electricity_rate


def calculate_labor_time(area_cm2: float, cut_length_mm: float) -> float:
    """
    Calculate estimated labor/setup time
    
    Args:
        area_cm2: Area in square centimeters
        cut_length_mm: Cut length in millimeters
        
    Returns:
        Labor time in minutes
    """
    # Base setup time + time proportional to complexity
    base_time = 5.0  # minutes
    complexity_factor = (cut_length_mm / 1000) * 2  # 2 min per meter of cut
    return base_time + complexity_factor


def calculate_labor_cost(time_minutes: float, labor_rate: float = 30.0) -> float:
    """
    Calculate labor cost
    
    Args:
        time_minutes: Time in minutes
        labor_rate: Labor rate per hour
        
    Returns:
        Labor cost in dollars
    """
    return (time_minutes / 60) * labor_rate


def calculate_total_cost(
    area_cm2: float,
    cut_length_mm: float,
    thickness_mm: float,
    material_rate: float,
    quantity: int = 1,
    setup_fee: float = 5.0,
    tax_rate: float = 0.08
) -> Dict:
    """
    Calculate complete cost breakdown
    
    Args:
        area_cm2: Area in square centimeters
        cut_length_mm: Total cut length in millimeters
        thickness_mm: Material thickness in millimeters
        material_rate: Material cost rate per cm² per mm
        quantity: Number of pieces
        setup_fee: One-time setup fee
        tax_rate: Tax rate (default 8%)
        
    Returns:
        Dictionary with cost breakdown
    """
    # Calculate per-piece costs
    material_cost = calculate_material_cost(area_cm2, thickness_mm, material_rate)
    
    laser_time_minutes = calculate_laser_time(cut_length_mm)
    energy_cost = calculate_energy_cost(laser_time_minutes)
    
    # Laser machine time cost (depreciation + electricity)
    machine_rate_per_min = 0.50  # $0.50 per minute
    laser_time_cost = laser_time_minutes * machine_rate_per_min
    
    # Calculate totals
    per_piece_subtotal = material_cost + laser_time_cost + energy_cost
    subtotal = per_piece_subtotal * quantity + setup_fee
    tax = subtotal * tax_rate
    total = subtotal + tax
    
    # Production time
    total_cut_time_minutes = laser_time_minutes * quantity
    total_production_time_hours = total_cut_time_minutes / 60
    
    return {
        "material_cost": round(material_cost * quantity, 2),
        "laser_time_cost": round(laser_time_cost * quantity, 2),
        "energy_cost": round(energy_cost * quantity, 2),
        "setup_fee": round(setup_fee, 2),
        "subtotal": round(subtotal, 2),
        "tax": round(tax, 2),
        "total": round(total, 2),
        "estimated_production_time_hours": round(total_production_time_hours, 2),
        "cut_time_per_piece_minutes": round(laser_time_minutes, 2),
    }


def get_material_rate(material_type: str) -> float:
    """
    Get material rate by type
    
    Args:
        material_type: Type of material
        
    Returns:
        Rate per cm² per mm
    """
    rates = {
        "acrylic": 0.05,
        "wood_mdf": 0.03,
        "plywood": 0.04,
        "leather": 0.08,
        "paper": 0.02,
        "aluminum": 0.15,
        "stainless_steel": 0.25,
    }
    return rates.get(material_type.lower(), 0.05)
