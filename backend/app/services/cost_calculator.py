"""
Cost calculation service for laser cutting
"""

from typing import Dict

from app.core.config import settings

# ---------------------------------------------------------------------------
# Energy-cost defaults
# ---------------------------------------------------------------------------
# The energy component follows the documented formula:
#     energy_cost = (power_watts * minutes / 60000) * electricity_rate
# i.e. kWh consumed * rate-per-kWh.
#
# Two things kept the energy line stuck at 0.00 in real quotes:
#   1. LASER_POWER_WATTS is the *beam/tube* rating (e.g. 60 W). A laser station's
#      actual wall-plug draw (tube driver + chiller + air-assist/blower + steppers
#      + controller) is several times that, so charging energy on the bare beam
#      wattage massively under-counts and rounds to zero.
#   2. The default ELECTRICITY_RATE (0.12) is a USD-per-kWh leftover, but quotes
#      are rendered in INR (~Rs 8/kWh commercial). 60 W * minutes * 0.12 is sub-cent
#      and disappears at 2-decimal rounding.
#
# Fixes, applied only on the default/fallback path (explicit args are still used
# verbatim so the documented formula and unit tests are unchanged):
#   * Fall back to a sane non-zero beam power when LASER_POWER_WATTS is falsy.
#   * Scale beam power to total machine draw via MACHINE_POWER_FACTOR.
#   * Use the configured ELECTRICITY_RATE, but floor it at an INR-appropriate
#     default when it is falsy or looks like the legacy sub-unit USD default, so
#     the energy line is never silently dead. Operators can set ELECTRICITY_RATE
#     in .env to their real per-kWh tariff and it will be honoured.
DEFAULT_LASER_POWER_WATTS = 80.0      # sane fallback beam power if setting is falsy
DEFAULT_ELECTRICITY_RATE = 8.0        # per kWh, INR commercial default (quotes are in Rs)
MACHINE_POWER_FACTOR = 8.0            # wall-plug draw vs. bare beam wattage (chiller, blower, drives, controller)
MIN_PLAUSIBLE_ELECTRICITY_RATE = 1.0  # below this the configured rate is treated as a leftover USD default


def _effective_machine_watts() -> float:
    """Total machine electrical draw used for energy costing.

    Uses the configured beam power (LASER_POWER_WATTS) scaled to the station's
    real wall-plug draw, falling back to a documented default if the setting is
    falsy/zero. Keeps the documented energy formula; only supplies a realistic
    power input instead of the bare beam wattage.
    """
    beam_watts = settings.LASER_POWER_WATTS or DEFAULT_LASER_POWER_WATTS
    return beam_watts * MACHINE_POWER_FACTOR


def _effective_electricity_rate() -> float:
    """Per-kWh electricity rate used for energy costing.

    Honours the configured ELECTRICITY_RATE when it is a plausible per-kWh value,
    otherwise falls back to an INR-appropriate default (quotes render in Rs). This
    prevents the legacy USD default (0.12) or an unset value from zeroing the line.
    """
    rate = settings.ELECTRICITY_RATE
    if not rate or rate < MIN_PLAUSIBLE_ELECTRICITY_RATE:
        return DEFAULT_ELECTRICITY_RATE
    return rate


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
    # Resolve falsy (None/0/unset) inputs to sane non-zero defaults so the energy
    # line is never silently dead. Explicit non-zero args are used verbatim, which
    # keeps the documented formula and unit tests unchanged.
    if not power_watts:
        power_watts = settings.LASER_POWER_WATTS or DEFAULT_LASER_POWER_WATTS
    if not electricity_rate:
        electricity_rate = settings.ELECTRICITY_RATE or DEFAULT_ELECTRICITY_RATE

    # Convert to kWh: (watts * minutes / 60000) == kWh consumed
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
    energy_cost = calculate_energy_cost(
        laser_time_minutes,
        power_watts=_effective_machine_watts(),
        electricity_rate=_effective_electricity_rate(),
    )

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


def calculate_total_cost_v2(
    area_cm2: float,
    cut_length_mm: float,
    thickness_mm: float,
    rate_per_cm2: float,
    cut_speed_mm_min: float,
    quantity: int = 1,
    setup_fee: float = 5.0,
    tax_rate: float = 0.08
) -> Dict:
    """
    Calculate complete cost breakdown using specific thickness configuration
    """
    # Calculate per-piece costs
    material_cost = area_cm2 * rate_per_cm2

    laser_time_minutes = calculate_laser_time(cut_length_mm, cut_speed_mm_min)
    energy_cost = calculate_energy_cost(
        laser_time_minutes,
        power_watts=_effective_machine_watts(),
        electricity_rate=_effective_electricity_rate(),
    )

    # Laser machine time cost
    machine_rate_per_min = 0.50
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
