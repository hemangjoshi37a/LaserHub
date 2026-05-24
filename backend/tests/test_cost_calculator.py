"""
Tests for cost calculator service
"""

from app.services.cost_calculator import (
    calculate_energy_cost,
    calculate_laser_time,
    calculate_material_cost,
    calculate_total_cost,
    calculate_total_cost_v2,
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


class TestTotalCostV2:
    """Tests for the v2 cost calculation that takes an explicit per-thickness rate.

    The old hardcoded ``get_material_rate`` lookup was removed during a refactor;
    material rates now live in the DB (Material.rate_per_cm2_mm / MaterialConfig
    .rate_per_cm2) and are passed straight into ``calculate_total_cost_v2`` as
    ``rate_per_cm2``. These tests exercise that current equivalent: that the
    supplied rate drives the material cost and flows through the full breakdown.
    """

    def test_complete_calculation(self):
        """Test complete v2 cost calculation returns full breakdown"""
        result = calculate_total_cost_v2(
            area_cm2=100,
            cut_length_mm=500,
            thickness_mm=3,
            rate_per_cm2=0.15,
            cut_speed_mm_min=500,
            quantity=1,
            setup_fee=5.0,
            tax_rate=0.08,
        )

        for key in (
            "material_cost",
            "laser_time_cost",
            "energy_cost",
            "setup_fee",
            "subtotal",
            "tax",
            "total",
        ):
            assert key in result
        assert result["total"] > 0

    def test_rate_drives_material_cost(self):
        """Material cost should equal area_cm2 * rate_per_cm2 (rate replaces the
        old per-material lookup)."""
        result = calculate_total_cost_v2(
            area_cm2=100,
            cut_length_mm=500,
            thickness_mm=3,
            rate_per_cm2=0.05,
            cut_speed_mm_min=500,
            quantity=1,
        )
        # 100 cm² * 0.05 = 5.0
        assert result["material_cost"] == 5.0

    def test_higher_rate_costs_more(self):
        """A higher per-cm² rate must yield a higher material cost."""
        cheap = calculate_total_cost_v2(100, 500, 3, 0.03, 500, quantity=1)
        pricey = calculate_total_cost_v2(100, 500, 3, 0.25, 500, quantity=1)
        assert pricey["material_cost"] > cheap["material_cost"]

    def test_quantity_multiplier(self):
        """Quantity multiplies per-piece costs while setup fee stays fixed."""
        result1 = calculate_total_cost_v2(100, 500, 3, 0.05, 500, quantity=1)
        result2 = calculate_total_cost_v2(100, 500, 3, 0.05, 500, quantity=2)

        assert result2["material_cost"] > result1["material_cost"]
        assert result2["laser_time_cost"] > result1["laser_time_cost"]
        assert result2["setup_fee"] == result1["setup_fee"]
