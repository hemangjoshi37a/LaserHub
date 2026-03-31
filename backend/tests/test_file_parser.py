"""
Tests for file parsing utilities
"""

import ezdxf
import pytest

from app.utils.file_parser import parse_dxf, parse_generic, parse_svg


@pytest.fixture
def sample_svg(tmp_path):
    """Create a sample SVG file for testing"""
    svg_content = """<?xml version="1.0" encoding="UTF-8"?>
<svg width="100mm" height="100mm" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="80" height="80" fill="none" stroke="black"/>
  <circle cx="50" cy="50" r="20" fill="none" stroke="black"/>
  <line x1="0" y1="0" x2="100" y2="100" stroke="black"/>
</svg>
"""
    file_path = tmp_path / "test.svg"
    file_path.write_text(svg_content)
    return str(file_path)

@pytest.fixture
def sample_dxf(tmp_path):
    """Create a sample DXF file for testing using ezdxf"""
    doc = ezdxf.new('R2010')
    msp = doc.modelspace()
    # 80x80 rectangle (perimeter 320)
    msp.add_lwpolyline([(10, 10), (90, 10), (90, 90), (10, 90)], close=True)
    # Circle with r=20 (circumference ~125.66)
    msp.add_circle((50, 50), 20)
    # Line from 0,0 to 100,100 (length ~141.42)
    msp.add_line((0, 0), (100, 100))

    file_path = tmp_path / "test.dxf"
    doc.saveas(str(file_path))
    return str(file_path)

@pytest.fixture
def sample_pdf(tmp_path):
    """Create a dummy PDF file (note: parsing only metadata in current impl)"""
    # This might fail if pypdf can't read a completely empty file,
    # but our current parse_pdf requires pypdf.
    # We'll just mock it if needed, but let's try a simple file if possible.
    # Actually, let's skip real PDF creation for now and just check if it handles it.
    pass

class TestSVGParser:
    def test_parse_svg_dimensions(self, sample_svg):
        result = parse_svg(sample_svg)
        assert result["width_mm"] == 100.0
        assert result["height_mm"] == 100.0
        assert result["area_cm2"] == 100.0 # (100*100)/100

    def test_parse_svg_cut_length(self, sample_svg):
        result = parse_svg(sample_svg)
        # rect: 2*(80+80)=320, circle: 2*pi*20~125.66, line: sqrt(100^2+100^2)~141.42
        # total: 320 + 125.66 + 141.42 = 587.08
        assert result["cut_length_mm"] == pytest.approx(587.08, 0.1)

class TestDXFParser:
    def test_parse_dxf_dimensions(self, sample_dxf):
        result = parse_dxf(sample_dxf)
        assert result["width_mm"] == 100.0
        assert result["height_mm"] == 100.0

    def test_parse_dxf_cut_length(self, sample_dxf):
        result = parse_dxf(sample_dxf)
        # polyline: 320, circle: ~125.66, line: ~141.42
        assert result["cut_length_mm"] == pytest.approx(587.08, 0.1)

    def test_parse_dxf_validation(self, sample_dxf):
        result = parse_dxf(sample_dxf)
        assert result["validation"]["is_valid"] is True

class TestGenericParser:
    def test_generic_svg(self, sample_svg):
        result = parse_generic(sample_svg)
        assert result["format"] == "SVG"

    def test_generic_dxf(self, sample_dxf):
        result = parse_generic(sample_dxf)
        assert result["format"] == "DXF"

    def test_unsupported_format(self):
        with pytest.raises(ValueError):
            parse_generic("test.txt")
