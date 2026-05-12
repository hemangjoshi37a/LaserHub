"""
File format conversion utilities for LaserHub.

Provides functions to convert vector files (DXF, EPS, AI, PDF) to SVG
for 3D preview rendering, as well as a general-purpose VectorFileConverter
class for converting between supported formats.
"""

import logging
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.utils.file_parser import FileFormatError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Standalone conversion helpers used by the /upload/{file_id}/svg endpoint
# ---------------------------------------------------------------------------


def dxf_to_svg(dxf_path: str) -> str:
    """Convert a DXF file to an SVG string using ezdxf's drawing backend.

    Uses the built-in ``SVGBackend`` from ezdxf.addons.drawing which faithfully
    renders all supported DXF entities (lines, arcs, splines, hatches, etc.).
    """
    import ezdxf
    from ezdxf.addons.drawing import Frontend, RenderContext, svg, layout

    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    backend = svg.SVGBackend()
    ctx = RenderContext(doc)
    frontend = Frontend(ctx, backend)
    frontend.draw_layout(msp)

    # get_string requires a Page; use a default page that fits the content
    page = layout.Page(0, 0, layout.Units.mm, margins=layout.Margins.all(2))
    svg_string = backend.get_string(page)
    return svg_string


def cdr_to_svg(cdr_path: str, timeout: int = 60) -> str:
    """Convert a Corel Draw .cdr file to SVG using LibreOffice headless.

    Returns the SVG contents as a string. Raises FileFormatError if LibreOffice
    is not installed or the conversion fails. LibreOffice ships a CDR import
    filter via libcdr, so this works for CDR 1–16 (and CDX).
    """
    soffice = shutil.which("libreoffice") or shutil.which("soffice")
    if not soffice:
        raise FileFormatError(
            "CDR conversion requires LibreOffice. Install with: sudo apt install libreoffice"
        )

    with tempfile.TemporaryDirectory(prefix="laserhub_cdr_") as tmpdir:
        try:
            result = subprocess.run(
                [soffice, "--headless", "--convert-to", "svg", "--outdir", tmpdir, cdr_path],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise FileFormatError(f"CDR conversion timed out after {timeout}s") from exc

        if result.returncode != 0:
            raise FileFormatError(
                f"LibreOffice CDR conversion failed (exit {result.returncode}): "
                f"{result.stderr.strip() or result.stdout.strip()}"
            )

        # LibreOffice writes <basename>.svg in the output directory
        stem = Path(cdr_path).stem
        svg_out = Path(tmpdir) / f"{stem}.svg"
        if not svg_out.exists():
            # Fallback: pick any .svg in the temp dir (in case stem was munged)
            candidates = list(Path(tmpdir).glob("*.svg"))
            if not candidates:
                raise FileFormatError("LibreOffice ran but produced no SVG output")
            svg_out = candidates[0]
        return svg_out.read_text(encoding="utf-8", errors="replace")


async def postscript_to_svg(ps_path: str) -> str:
    """Convert a PostScript / EPS / AI / PDF file to SVG.

    Tries several strategies in order of quality:
    1. inkscape (best vector fidelity)
    2. ghostscript -> PDF -> cairosvg
    3. ghostscript svg device
    4. BoundingBox-based placeholder SVG
    """
    # 1. Try inkscape
    if shutil.which("inkscape"):
        try:
            import asyncio
            proc = await asyncio.create_subprocess_exec(
                "inkscape", ps_path, "--export-type=svg", "--export-filename=-",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            if proc.returncode == 0 and stdout.strip():
                return stdout.decode("utf-8")
        except (asyncio.TimeoutError, Exception) as exc:
            logger.debug(f"inkscape conversion failed: {exc}")

    # 2. Try ghostscript -> PDF -> cairosvg
    if shutil.which("gs"):
        try:
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
                tmp_pdf_path = tmp_pdf.name

            subprocess.run(
                [
                    "gs", "-dBATCH", "-dNOPAUSE", "-dQUIET",
                    "-sDEVICE=pdfwrite",
                    f"-sOutputFile={tmp_pdf_path}",
                    ps_path,
                ],
                check=True,
                timeout=30,
            )

            try:
                import cairosvg
                svg_bytes = cairosvg.pdf2svg(url=tmp_pdf_path)
                return svg_bytes.decode("utf-8")
            except ImportError:
                logger.debug("cairosvg not available, skipping gs+cairosvg path")
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, Exception) as exc:
            logger.debug(f"gs+cairosvg conversion failed: {exc}")
        finally:
            try:
                Path(tmp_pdf_path).unlink(missing_ok=True)
            except Exception:
                pass

        # 3. Try ghostscript svg device directly
        try:
            with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as tmp_svg:
                tmp_svg_path = tmp_svg.name

            subprocess.run(
                [
                    "gs", "-dBATCH", "-dNOPAUSE", "-dQUIET",
                    "-sDEVICE=svg",
                    f"-sOutputFile={tmp_svg_path}",
                    ps_path,
                ],
                check=True,
                timeout=30,
            )
            svg_content = Path(tmp_svg_path).read_text(encoding="utf-8", errors="ignore")
            if svg_content.strip():
                return svg_content
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, Exception) as exc:
            logger.debug(f"gs svg-device conversion failed: {exc}")
        finally:
            try:
                Path(tmp_svg_path).unlink(missing_ok=True)
            except Exception:
                pass

    # 4. Last resort: extract BoundingBox and return placeholder SVG
    return _extract_bbox_svg(ps_path)


def _extract_bbox_svg(ps_path: str) -> str:
    """Extract %%BoundingBox from a PostScript file and create a minimal SVG.

    Handles binary EPS files (EPSC magic C5 D0 D3 C6) by reading a larger
    chunk so the PostScript DSC comments are captured.
    """
    try:
        with open(ps_path, "rb") as fb:
            raw = fb.read(65536)
        content = raw.decode("latin-1", errors="ignore")
    except Exception:
        content = ""

    match = re.search(
        r"%%BoundingBox:\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)",
        content,
    )
    if match:
        x1, y1, x2, y2 = (float(v) for v in match.groups())
        w, h = x2 - x1, y2 - y1
        suffix = Path(ps_path).suffix.upper().lstrip(".")
        return (
            f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'width="{w}" height="{h}">\n'
            f'  <rect x="0" y="0" width="{w}" height="{h}" fill="none" '
            f'stroke="#666" stroke-width="1" stroke-dasharray="4"/>\n'
            f'  <text x="{w / 2}" y="{h / 2}" text-anchor="middle" '
            f'font-size="14" fill="#999">{suffix} Preview</text>\n'
            f'  <text x="{w / 2}" y="{h / 2 + 20}" text-anchor="middle" '
            f'font-size="11" fill="#bbb">{w} x {h} pts</text>\n'
            f"</svg>"
        )

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" '
        'width="200" height="200">\n'
        '  <text x="100" y="100" text-anchor="middle" font-size="14" '
        'fill="#999">Preview unavailable</text>\n'
        "</svg>"
    )


# ---------------------------------------------------------------------------
# General-purpose VectorFileConverter (class-based, used elsewhere)
# ---------------------------------------------------------------------------


class VectorFileConverter:
    """Convert between different vector file formats."""

    SUPPORTED_CONVERSIONS = {
        (".dxf", ".svg"): True,
        (".dxf", ".pdf"): True,
        (".svg", ".dxf"): True,
        (".svg", ".pdf"): True,
        (".pdf", ".svg"): True,
        (".ai", ".svg"): True,
        (".ai", ".pdf"): True,
        (".eps", ".svg"): True,
        (".eps", ".pdf"): True,
    }

    def __init__(self) -> None:
        self.temp_dir = Path(tempfile.gettempdir()) / "laserhub_conversions"
        self.temp_dir.mkdir(exist_ok=True)

    def is_conversion_supported(self, from_format: str, to_format: str) -> bool:
        from_ext = from_format.lower() if from_format.startswith(".") else f".{from_format.lower()}"
        to_ext = to_format.lower() if to_format.startswith(".") else f".{to_format.lower()}"

        if (from_ext, to_ext) in self.SUPPORTED_CONVERSIONS:
            return True
        if (to_ext, from_ext) in self.SUPPORTED_CONVERSIONS:
            return True
        if (from_ext, ".svg") in self.SUPPORTED_CONVERSIONS and (".svg", to_ext) in self.SUPPORTED_CONVERSIONS:
            return True
        return False

    def convert(
        self,
        input_path: str,
        output_format: str,
        output_path: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Convert *input_path* to *output_format*, returning the output file path."""
        input_path_obj = Path(input_path)
        if not input_path_obj.exists():
            raise FileFormatError(f"Input file not found: {input_path_obj}", format_type=str(input_path_obj.suffix))

        input_ext = input_path_obj.suffix.lower()
        output_ext = f".{output_format.lower()}"

        if not self.is_conversion_supported(input_ext, output_ext):
            raise FileFormatError(
                f"Conversion from {input_ext} to {output_ext} not supported",
                format_type=input_ext,
                details={"supported_conversions": self._get_supported_conversions(input_ext)},
            )

        if output_path is None:
            output_filename = f"{input_path_obj.stem}_converted{output_ext}"
            out = self.temp_dir / output_filename
        else:
            out = Path(output_path)
            if out.suffix.lower() != output_ext:
                out = out.with_suffix(output_ext)

        conversion_key = (input_ext, output_ext)

        if conversion_key == (".dxf", ".svg"):
            svg_str = dxf_to_svg(str(input_path_obj))
            out.write_text(svg_str, encoding="utf-8")
        elif conversion_key in ((".eps", ".svg"), (".ai", ".svg"), (".pdf", ".svg")):
            import asyncio
            svg_str = asyncio.run(postscript_to_svg(str(input_path_obj)))
            out.write_text(svg_str, encoding="utf-8")
        elif conversion_key == (".svg", ".dxf"):
            self._svg_to_dxf(input_path_obj, out, options)
        elif conversion_key == (".dxf", ".pdf"):
            self._dxf_to_pdf(input_path_obj, out, options)
        elif conversion_key == (".svg", ".pdf"):
            self._svg_to_pdf(input_path_obj, out, options)
        elif input_ext in (".ai", ".eps") and output_ext == ".pdf":
            self._ps_to_pdf(input_path_obj, out)
        else:
            # Try via intermediate SVG
            intermediate_svg = self.temp_dir / f"{input_path_obj.stem}_intermediate.svg"
            self.convert(str(input_path_obj), "svg", str(intermediate_svg), options)
            self.convert(str(intermediate_svg), output_format.replace(".", ""), str(out), options)
            if intermediate_svg.exists():
                intermediate_svg.unlink()

        if not out.exists():
            raise FileFormatError("Conversion failed - output file not created", format_type=output_ext)

        return str(out)

    # -- Private helpers ---------------------------------------------------

    def _svg_to_dxf(self, input_path: Path, output_path: Path, options: Optional[Dict] = None) -> None:
        import ezdxf
        import xml.etree.ElementTree as ET

        tree = ET.parse(input_path)
        root = tree.getroot()
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()

        for elem in root.iter():
            tag = elem.tag.split("}")[-1]
            if tag == "line":
                x1, y1 = float(elem.get("x1", 0)), float(elem.get("y1", 0))
                x2, y2 = float(elem.get("x2", 0)), float(elem.get("y2", 0))
                msp.add_line((x1, y1), (x2, y2))
            elif tag == "circle":
                cx, cy = float(elem.get("cx", 0)), float(elem.get("cy", 0))
                r = float(elem.get("r", 0))
                msp.add_circle((cx, cy), r)
            elif tag == "rect":
                x, y = float(elem.get("x", 0)), float(elem.get("y", 0))
                w, h = float(elem.get("width", 0)), float(elem.get("height", 0))
                points = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
                msp.add_lwpolyline(points, close=True)
        doc.saveas(output_path)

    def _dxf_to_pdf(self, input_path: Path, output_path: Path, options: Optional[Dict] = None) -> None:
        intermediate = self.temp_dir / f"{input_path.stem}_temp.svg"
        svg_str = dxf_to_svg(str(input_path))
        intermediate.write_text(svg_str, encoding="utf-8")
        self._svg_to_pdf(intermediate, output_path, options)
        if intermediate.exists():
            intermediate.unlink()

    def _svg_to_pdf(self, input_path: Path, output_path: Path, options: Optional[Dict] = None) -> None:
        try:
            from reportlab.graphics import renderPDF
            from svglib.svglib import svg2rlg

            drawing = svg2rlg(str(input_path))
            renderPDF.drawToFile(drawing, str(output_path))
        except ImportError:
            self._convert_with_external_tool(input_path, output_path, "inkscape", ["--export-type=pdf"])

    def _ps_to_pdf(self, input_path: Path, output_path: Path) -> None:
        if shutil.which("gs"):
            subprocess.run(
                [
                    "gs", "-dBATCH", "-dNOPAUSE", "-dQUIET",
                    "-sDEVICE=pdfwrite",
                    f"-sOutputFile={output_path}",
                    str(input_path),
                ],
                check=True,
                timeout=30,
            )
        else:
            self._convert_with_external_tool(input_path, output_path, "inkscape", ["--export-type=pdf"])

    def _convert_with_external_tool(
        self, input_path: Path, output_path: Path, tool: str, args: Optional[List[str]] = None
    ) -> bool:
        if args is None:
            args = []
        if not shutil.which(tool):
            logger.warning(f"External tool '{tool}' not found")
            return False
        try:
            cmd = [tool] + args + [str(input_path), str(output_path)]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0 and output_path.exists():
                return True
            logger.warning(f"{tool} conversion failed: {result.stderr}")
            return False
        except subprocess.TimeoutExpired:
            logger.warning(f"{tool} conversion timed out")
            return False
        except Exception as e:
            logger.warning(f"{tool} conversion error: {e}")
            return False

    def _get_supported_conversions(self, from_format: str) -> List[str]:
        from_ext = from_format if from_format.startswith(".") else f".{from_format}"
        return [dst for (src, dst) in self.SUPPORTED_CONVERSIONS if src == from_ext]

    def get_available_conversions(self) -> Dict[str, List[str]]:
        conversions: Dict[str, List[str]] = {}
        for src, dst in self.SUPPORTED_CONVERSIONS:
            src_fmt = src.replace(".", "").upper()
            conversions.setdefault(src_fmt, []).append(dst.replace(".", "").upper())
        return conversions


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------

_converter = VectorFileConverter()


def convert_file(
    input_path: str,
    output_format: str,
    output_path: Optional[str] = None,
    options: Optional[Dict[str, Any]] = None,
) -> str:
    """Convert a vector file to another format.

    Example::

        >>> output = convert_file('design.dxf', 'svg')
        >>> print(output)  # Path to converted SVG file
    """
    return _converter.convert(input_path, output_format, output_path, options)


def list_supported_conversions() -> Dict[str, List[str]]:
    """Get all supported format conversions."""
    return _converter.get_available_conversions()


def check_conversion_supported(from_format: str, to_format: str) -> bool:
    """Check if conversion between formats is supported."""
    return _converter.is_conversion_supported(from_format, to_format)


__all__ = [
    "VectorFileConverter",
    "convert_file",
    "dxf_to_svg",
    "postscript_to_svg",
    "list_supported_conversions",
    "check_conversion_supported",
]
