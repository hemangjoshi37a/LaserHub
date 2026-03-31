"""
File conversion utilities for vector formats
Provides conversion between DXF, SVG, PDF, AI, and EPS formats
"""

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any
import json
from app.utils.file_parser import FileFormatError


class VectorFileConverter:
    """Convert between different vector file formats"""
    
    SUPPORTED_CONVERSIONS = {
        ('.dxf', '.svg'): True,
        ('.dxf', '.pdf'): True,
        ('.svg', '.dxf'): True,
        ('.svg', '.pdf'): True,
        ('.pdf', '.svg'): True,
        ('.ai', '.svg'): True,
        ('.ai', '.pdf'): True,
        ('.eps', '.svg'): True,
        ('.eps', '.pdf'): True,
    }
    
    def __init__(self):
        self.temp_dir = Path(tempfile.gettempdir()) / "laserhub_conversions"
        self.temp_dir.mkdir(exist_ok=True)
    
    def is_conversion_supported(self, from_format: str, to_format: str) -> bool:
        """Check if conversion between formats is supported"""
        from_ext = from_format.lower() if from_format.startswith('.') else f".{from_format.lower()}"
        to_ext = to_format.lower() if to_format.startswith('.') else f".{to_format.lower()}"
        
        # Direct conversion support
        if (from_ext, to_ext) in self.SUPPORTED_CONVERSIONS:
            return True
        
        # Inverse check
        if (to_ext, from_ext) in self.SUPPORTED_CONVERSIONS:
            return True
        
        # SVG is our intermediate format for many conversions
        if (from_ext, '.svg') in self.SUPPORTED_CONVERSIONS and ('.svg', to_ext) in self.SUPPORTED_CONVERSIONS:
            return True
        
        return False
    
    def convert(self, input_path: str, output_format: str, 
                output_path: Optional[str] = None,
                options: Optional[Dict[str, Any]] = None) -> str:
        """
        Convert vector file to target format
        
        Args:
            input_path: Path to input file
            output_format: Target format (e.g., 'svg', 'pdf', 'dxf')
            output_path: Optional output path. If None, uses temp directory
            options: Conversion options dictionary
            
        Returns:
            Path to converted file
        """
        input_path = Path(input_path)
        if not input_path.exists():
            raise FileFormatError(f"Input file not found: {input_path}", format_type=str(input_path.suffix))
        
        input_ext = input_path.suffix.lower()
        output_ext = f".{output_format.lower()}"
        
        # Check if conversion is supported
        if not self.is_conversion_supported(input_ext, output_ext):
            raise FileFormatError(
                f"Conversion from {input_ext} to {output_ext} not supported", 
                format_type=input_ext,
                details={"supported_conversions": self._get_supported_conversions(input_ext)}
            )
        
        # Generate output path if not provided
        if output_path is None:
            output_filename = f"{input_path.stem}_converted{output_ext}"
            output_path = self.temp_dir / output_filename
        else:
            output_path = Path(output_path)
            # Ensure correct extension
            if output_path.suffix.lower() != output_ext:
                output_path = output_path.with_suffix(output_ext)
        
        # Perform conversion based on formats
        conversion_key = (input_ext, output_ext)
        
        if conversion_key == ('.dxf', '.svg'):
            self._dxf_to_svg(input_path, output_path, options)
        elif conversion_key == ('.svg', '.dxf'):
            self._svg_to_dxf(input_path, output_path, options)
        elif conversion_key == ('.dxf', '.pdf'):
            self._dxf_to_pdf(input_path, output_path, options)
        elif conversion_key == ('.svg', '.pdf'):
            self._svg_to_pdf(input_path, output_path, options)
        elif conversion_key == ('.pdf', '.svg'):
            self._pdf_to_svg(input_path, output_path, options)
        elif input_ext == '.ai':
            if output_ext == '.svg':
                self._ai_to_svg(input_path, output_path, options)
            elif output_ext == '.pdf':
                self._ai_to_pdf(input_path, output_path, options)
        elif input_ext == '.eps':
            if output_ext == '.svg':
                self._eps_to_svg(input_path, output_path, options)
            elif output_ext == '.pdf':
                self._eps_to_pdf(input_path, output_path, options)
        else:
            # Try conversion via intermediate SVG
            intermediate_svg = self.temp_dir / f"{input_path.stem}_intermediate.svg"
            
            # First convert to SVG
            self.convert(str(input_path), 'svg', str(intermediate_svg), options)
            
            # Then convert SVG to target
            self.convert(str(intermediate_svg), output_format.replace('.', ''), str(output_path), options)
            
            # Clean up intermediate
            if intermediate_svg.exists():
                intermediate_svg.unlink()
        
        if not output_path.exists():
            raise FileFormatError(f"Conversion failed - output file not created", 
                                  format_type=output_ext)
        
        return str(output_path)
    
    def _dxf_to_svg(self, input_path: Path, output_path: Path, options: Optional[Dict] = None):
        """Convert DXF to SVG using ezdxf"""
        import ezdxf
        from xml.etree import ElementTree as ET
        
        # Read DXF
        doc = ezdxf.readfile(input_path)
        msp = doc.modelspace()
        
        # Get bounds
        from ezdxf import bbox
        extents = bbox.extents(msp)
        min_x, min_y = extents.extmin[0], extents.extmin[1]
        max_x, max_y = extents.extmax[0], extents.extmax[1]
        width = max_x - min_x
        height = max_y - min_y
        
        # Create SVG
        ns = {'svg': 'http://www.w3.org/2000/svg'}
        ET.register_namespace('', 'http://www.w3.org/2000/svg')
        
        svg = ET.Element('svg', {
            'width': f"{width}mm",
            'height': f"{height}mm",
            'viewBox': f"{min_x} {min_y} {width} {height}",
            'xmlns': 'http://www.w3.org/2000/svg'
        })
        
        # Add entities as SVG paths
        for entity in msp:
            if entity.dxftype() == 'LINE':
                line = ET.SubElement(svg, 'line', {
                    'x1': str(entity.dxf.start[0]),
                    'y1': str(entity.dxf.start[1]),
                    'x2': str(entity.dxf.end[0]),
                    'y2': str(entity.dxf.end[1]),
                    'stroke': 'black',
                    'stroke-width': '0.1'
                })
            elif entity.dxftype() == 'CIRCLE':
                cx, cy = entity.dxf.center[0], entity.dxf.center[1]
                r = entity.dxf.radius
                circle = ET.SubElement(svg, 'circle', {
                    'cx': str(cx),
                    'cy': str(cy),
                    'r': str(r),
                    'fill': 'none',
                    'stroke': 'black',
                    'stroke-width': '0.1'
                })
            
            # Add more entity types as needed
        
        tree = ET.ElementTree(svg)
        tree.write(output_path, encoding='utf-8', xml_declaration=True)
    
    def _svg_to_dxf(self, input_path: Path, output_path: Path, options: Optional[Dict] = None):
        """Convert SVG to DXF using ezdxf"""
        import ezdxf
        import xml.etree.ElementTree as ET
        
        # Read SVG
        tree = ET.parse(input_path)
        root = tree.getroot()
        
        # Create DXF
        doc = ezdxf.new('R2010')
        msp = doc.modelspace()
        
        # Process SVG elements
        for elem in root.iter():
            tag = elem.tag.split('}')[-1]  # Remove namespace
            
            if tag == 'line':
                x1 = float(elem.get('x1', 0))
                y1 = float(elem.get('y1', 0))
                x2 = float(elem.get('x2', 0))
                y2 = float(elem.get('y2', 0))
                msp.add_line((x1, y1), (x2, y2))
            
            elif tag == 'circle':
                cx = float(elem.get('cx', 0))
                cy = float(elem.get('cy', 0))
                r = float(elem.get('r', 0))
                msp.add_circle((cx, cy), r)
            
            elif tag == 'rect':
                x = float(elem.get('x', 0))
                y = float(elem.get('y', 0))
                w = float(elem.get('width', 0))
                h = float(elem.get('height', 0))
                points = [(x, y), (x+w, y), (x+w, y+h), (x, y+h)]
                msp.add_lwpolyline(points, close=True)
            
            # Add more elements as needed
        
        doc.saveas(output_path)
    
    def _dxf_to_pdf(self, input_path: Path, output_path: Path, options: Optional[Dict] = None):
        """Convert DXF to PDF via SVG intermediate"""
        # Convert DXF to SVG first
        intermediate = self.temp_dir / f"{input_path.stem}_temp.svg"
        self._dxf_to_svg(input_path, intermediate)
        
        # Then convert SVG to PDF
        self._svg_to_pdf(intermediate, output_path, options)
        
        # Cleanup
        if intermediate.exists():
            intermediate.unlink()
    
    def _svg_to_pdf(self, input_path: Path, output_path: Path, options: Optional[Dict] = None):
        """Convert SVG to PDF using ReportLab"""
        from reportlab.graphics import renderPDF
        from reportlab.graphics.shapes import Drawing
        from svglib.svglib import svg2rlg
        
        try:
            # Use svglib to convert SVG to ReportLab drawing
            drawing = svg2rlg(str(input_path))
            
            # Render to PDF
            renderPDF.drawToFile(drawing, str(output_path))
        except ImportError:
            # Fallback: Try using external tool (if available)
            self._convert_with_external_tool(input_path, output_path, 'svg2pdf')
    
    def _pdf_to_svg(self, input_path: Path, output_path: Path, options: Optional[Dict] = None):
        """Convert PDF to SVG using external tools"""
        # Try using pdf2svg if available
        success = self._convert_with_external_tool(
            input_path, output_path, 'pdf2svg',
            ['--page-width=210', '--page-height=297']  # A4 default
        )
        
        if not success:
            # Fallback using pdfminer and manual SVG creation
            self._pdf_to_svg_manual(input_path, output_path)
    
    def _ai_to_svg(self, input_path: Path, output_path: Path, options: Optional[Dict] = None):
        """Convert AI to SVG using inkscape if available"""
        success = self._convert_with_external_tool(
            input_path, output_path, 'inkscape',
            ['--export-type=svg', '--export-plain-svg', '--export-text-to-path']
        )
        
        if not success:
            # Fallback: AI is often PDF-compatible
            self._convert_with_external_tool(
                input_path, output_path, 'gs',
                ['-sDEVICE=svg', '-o', str(output_path), str(input_path)]
            )
    
    def _ai_to_pdf(self, input_path: Path, output_path: Path, options: Optional[Dict] = None):
        """Convert AI to PDF"""
        success = self._convert_with_external_tool(
            input_path, output_path, 'inkscape',
            ['--export-type=pdf']
        )
        
        if not success:
            # Fallback using ghostscript
            self._convert_with_external_tool(
                input_path, output_path, 'gs',
                ['-sDEVICE=pdf', '-o', str(output_path), str(input_path)]
            )
    
    def _eps_to_svg(self, input_path: Path, output_path: Path, options: Optional[Dict] = None):
        """Convert EPS to SVG"""
        success = self._convert_with_external_tool(
            input_path, output_path, 'inkscape',
            ['--export-type=svg', '--export-plain-svg']
        )
        
        if not success:
            self._convert_with_external_tool(
                input_path, output_path, 'gs',
                ['-sDEVICE=svg', '-o', str(output_path), str(input_path)]
            )
    
    def _eps_to_pdf(self, input_path: Path, output_path: Path, options: Optional[Dict] = None):
        """Convert EPS to PDF"""
        self._convert_with_external_tool(
            input_path, output_path, 'gs',
            ['-sDEVICE=pdf', '-o', str(output_path), str(input_path)]
        )
    
    def _convert_with_external_tool(self, input_path: Path, output_path: Path, 
                                   tool: str, args: list = None) -> bool:
        """
        Attempt conversion using external command-line tool
        Returns True if successful, False otherwise
        """
        import shutil
        
        if args is None:
            args = []
        
        # Check if tool is available
        if not shutil.which(tool):
            logger.warning(f"External tool '{tool}' not found")
            return False
        
        try:
            cmd = [tool] + args + [str(input_path), str(output_path)]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0 and output_path.exists():
                return True
            else:
                logger.warning(f"{tool} conversion failed: {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            logger.warning(f"{tool} conversion timed out")
            return False
        except Exception as e:
            logger.warning(f"{tool} conversion error: {e}")
            return False
    
    def _pdf_to_svg_manual(self, input_path: Path, output_path: Path):
        """Manual PDF to SVG conversion using pdfminer"""
        from app.utils.file_parser import VectorFileParser
        from xml.etree import ElementTree as ET
        
        # Use our own PDF parser
        parser = VectorFileParser()
        pdf_data = parser.parse_pdf(str(input_path))
        
        # Create simple SVG with basic info
        ns = {'svg': 'http://www.w3.org/2000/svg'}
        ET.register_namespace('', 'http://www.w3.org/2000/svg')
        
        width = pdf_data.get('width_mm', 210)
        height = pdf_data.get('height_mm', 297)
        
        svg = ET.Element('svg', {
            'width': f"{width}mm",
            'height': f"{height}mm",
            'viewBox': f"0 0 {width} {height}",
            'xmlns': 'http://www.w3.org/2000/svg'
        })
        
        # Add a rectangle to represent the document bounds
        rect = ET.SubElement(svg, 'rect', {
            'x': '0', 'y': '0', 'width': str(width), 'height': str(height),
            'fill': 'none', 'stroke': 'black', 'stroke-width': '0.1',
            'stroke-dasharray': '5,5'
        })
        
        # Add text with metadata
        text = ET.SubElement(svg, 'text', {
            'x': '10', 'y': '20',
            'font-family': 'Arial', 'font-size': '10',
            'fill': 'black'
        })
        text.text = f"PDF imported - {pdf_data.get('elements_processed', 0)} vector elements"
        
        tree = ET.ElementTree(svg)
        tree.write(output_path, encoding='utf-8', xml_declaration=True)
    
    def _get_supported_conversions(self, from_format: str) -> list:
        """Get list of supported target formats"""
        from_ext = from_format if from_format.startswith('.') else f".{from_format}"
        supported = []
        
        for (src, dst) in self.SUPPORTED_CONVERSIONS.keys():
            if src == from_ext:
                supported.append(dst)
        
        return supported
    
    def get_available_conversions(self) -> Dict[str, list]:
        """Get all available conversions as a dictionary"""
        conversions = {}
        for (src, dst) in self.SUPPORTED_CONVERSIONS.keys():
            src_fmt = src.replace('.', '').upper()
            if src_fmt not in conversions:
                conversions[src_fmt] = []
            conversions[src_fmt].append(dst.replace('.', '').upper())
        return conversions


# Global converter instance
_converter = VectorFileConverter()

def convert_file(input_path: str, output_format: str, 
                output_path: Optional[str] = None,
                options: Optional[Dict[str, Any]] = None) -> str:
    """
    Convert a vector file to another format
    
    Example:
        >>> output = convert_file('design.dxf', 'svg')
        >>> print(output)  # Path to converted SVG file
    """
    return _converter.convert(input_path, output_format, output_path, options)

def list_supported_conversions() -> Dict[str, list]:
    """Get all supported format conversions"""
    return _converter.get_available_conversions()

def check_conversion_supported(from_format: str, to_format: str) -> bool:
    """Check if conversion between formats is supported"""
    return _converter.is_conversion_supported(from_format, to_format)

__all__ = [
    'VectorFileConverter',
    'convert_file',
    'list_supported_conversions',
    'check_conversion_supported'
]