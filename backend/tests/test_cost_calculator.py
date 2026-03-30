"""
Tests for cost calculator service
"""

import pytest
from app.services.cost_calculator import (
    calculate_material_cost,
    calculate_laser_time,
    calculate_energy_cost,
    calculate_total_cost,
    get_material_rate,
)


class TestMaterialCost:
    """Tests for material cost calculation"""
    
    def test_basic_material_cost(self):
        """Test basic material cost calculation"""
        cost = calculate_material_cost(
            area_cm2=100,
            thickness_mm=3,
            rate_per_cm2_mm=0.05
        )
        assert cost == 15.0  # 100 * 3 * 0.05
    
    def test_zero_area(self):
        """Test with zero area"""
        cost = calculate_material_cost(0, 3, 0.05)
        assert cost == 0.0
    
    def test_zero_thickness(self):
        """Test with zero thickness"""
        cost = calculate_material_cost(100, 0, 0.05)
        assert cost == 0.0


class TestLaserTime:
    """Tests for laser time calculation"""
    
    def test_basic_laser_time(self):
        """Test basic laser time calculation"""
        time = calculate_laser_time(
            cut_length_mm=1000,
            cut_speed_mm_per_min=500
        )
        assert time == 2.0  # 1000 / 500 = 2 minutes
    
    def test_default_speed(self):
        """Test with default cut speed"""
        time = calculate_laser_time(500)
        assert time == 1.0  # 500 / 500 = 1 minute


class TestEnergyCost:
    """Tests for energy cost calculation"""
    
    def test_basic_energy_cost(self):
        """Test basic energy cost calculation"""
        cost = calculate_energy_cost(
            time_minutes=60,
            power_watts=1000,
            electricity_rate=0.12
        )
        assert cost == 0.12  # 1 kWh * 0.12
    
    def test_short_duration(self):
        """Test with short duration"""
        cost = calculate_energy_cost(10, 60, 0.12)
        assert cost == 0.0012  # 60W * 10min / 60000 * 0.12


class TestTotalCost:
    """Tests for total cost calculation"""
    
    def test_complete_calculation(self):
        """Test complete cost calculation"""
        result = calculate_total_cost(
            area_cm2=100,
            cut_length_mm=500,
            thickness_mm=3,
            material_rate=0.05,
            quantity=1,
            setup_fee=5.0,
            tax_rate=0.08
        )
        
        assert "material_cost" in result
        assert "laser_time_cost" in result
        assert "energy_cost" in result
        assert "setup_fee" in result
        assert "subtotal" in result
        assert "tax" in result
        assert "total" in result
        assert result["total"] > 0
    
    def test_quantity_multiplier(self):
        """Test that quantity correctly multiplies costs"""
        result1 = calculate_total_cost(100, 500, 3, 0.05, quantity=1)
        result2 = calculate_total_cost(100, 500, 3, 0.05, quantity=2)
        
        # Material and laser costs should double, but setup fee stays same
        assert result2["material_cost"] > result1["material_cost"]
        assert result2["laser_time_cost"] > result1["laser_time_cost"]


class TestMaterialRates:
    """Tests for material rate lookup"""
    
    def test_acrylic_rate(self):
        """Test acrylic rate"""
        rate = get_material_rate("acrylic")
        assert rate == 0.05
    
    def test_wood_rate(self):
        """Test wood rate"""
        rate = get_material_rate("wood_mdf")
        assert rate == 0.03
    
    def test_unknown_material(self):
        """Test unknown material returns default"""
        rate = get_material_rate("unknown")
        assert rate == 0.05  # Default rate
    
    def test_case_insensitive(self):
        """Test case insensitivity"""
        rate1 = get_material_rate("ACRYLIC")
        rate2 = get_material_rate("acrylic")
        assert rate1 == rate2
