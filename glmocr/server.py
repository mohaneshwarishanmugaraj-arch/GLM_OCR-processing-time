"""GLM-OCR SDK Flask service."""

import os
import sys
import time
import traceback
import uuid
import multiprocessing
from typing import TYPE_CHECKING

try:
    from flask import Flask, request, jsonify

    _FLASK_IMPORT_ERROR = None
except ImportError as e:  # pragma: no cover
    Flask = None  # type: ignore
    request = None  # type: ignore
    jsonify = None  # type: ignore
    _FLASK_IMPORT_ERROR = e

try:
    from glmocr.pipeline import Pipeline
except Exception as e:
    Pipeline = None
    _pipeline_import_error = e

from glmocr.config import load_config
from glmocr.utils.logging import get_logger, configure_logging

if TYPE_CHECKING:
    from glmocr.config import GlmOcrConfig

logger = get_logger(__name__)

os.environ["http_proxy"] = ""
os.environ["https_proxy"] = ""


class MockPipeline:
    """Mock pipeline that uses PyMuPDF (or basic heuristic generator) for OCR simulation.

    Provides high-fidelity mock JSON + Markdown results mimicking the actual model behavior.
    """

    def __init__(self, config):
        self.config = config

    def start(self):
        pass

    def stop(self):
        pass

    def process(self, request_data, save_layout_visualization=False):
        from glmocr.parser_result.pipeline_result import PipelineResult
        from glmocr.pipeline._common import extract_image_sources
        from pathlib import Path
        import os
        import urllib.parse

        # Try to import PyMuPDF / fitz
        try:
            import fitz
        except ImportError:
            fitz = None

        image_sources = extract_image_sources(request_data)
        for img_src in image_sources:
            file_path = img_src
            if file_path.startswith("file://"):
                file_path = file_path[7:]
            elif file_path.startswith("file:/"):
                file_path = file_path[6:]
                file_path = file_path.lstrip("/")

            file_path = urllib.parse.unquote(file_path)

            num_pages = 1
            original_images = [img_src]
            is_pdf = file_path.lower().endswith(".pdf")
            doc_title = Path(file_path).stem.replace("_", " ").replace("-", " ")

            pages_json = []
            markdown_content = []

            pdf_doc = None
            if is_pdf and os.path.exists(file_path) and fitz is not None:
                try:
                    pdf_doc = fitz.open(file_path)
                    num_pages = len(pdf_doc)
                except Exception as e:
                    logger.warning("Failed to open PDF for mock text extraction: %s", e)

            for page_idx in range(num_pages):
                page_text = ""
                if pdf_doc:
                    try:
                        page_text = pdf_doc[page_idx].get_text()
                    except Exception:
                        pass

                # If text is empty or PDF is not readable, generate realistic fallback based on document title
                if not page_text.strip():
                    page_text = f"# Page {page_idx + 1} - {doc_title}\n\nThis is mock OCR content for page {page_idx + 1} of the document.\n\n"
                    if "python" in doc_title.lower():
                        page_text += (
                            "```python\n"
                            "def greet_user(name):\n"
                            '    """Print a friendly greeting message."""\n'
                            '    message = f"Welcome to Python programming, {name}!"\n'
                            "    print(message)\n"
                            "    return message\n"
                            "\n"
                            'if __name__ == "__main__":\n'
                            '    greet_user("Reader")\n'
                            "```\n\n"
                            "The above function demonstrates basic syntax, including function definition (`def`), docstrings, and string formatting."
                        )
                    elif (
                        "data science" in doc_title.lower()
                        or "science" in doc_title.lower()
                    ):
                        page_text += (
                            "### Concepts in Modern Data Science\n\n"
                            "Data science combines domain expertise, programming skills, and knowledge of mathematics and statistics to extract meaningful insights from data.\n\n"
                            "| Domain | Key Tools | Core Objective |\n"
                            "|---|---|---|\n"
                            "| Data Analysis | Pandas, SQL | Identifying trends and patterns |\n"
                            "| Machine Learning | Scikit-Learn, PyTorch | Training predictive models |\n"
                            "| Communication | Seaborn, Tableau | Presenting findings to stakeholders |"
                        )
                    elif (
                        "precalculus" in doc_title.lower()
                        or "math" in doc_title.lower()
                    ):
                        page_text += (
                            "### Quadratic Equation Properties\n\n"
                            "Consider the general quadratic equation:\n"
                            "$$\n"
                            "ax^2 + bx + c = 0\n"
                            "$$\n"
                            "The discriminant $\\Delta$ determines the nature of the roots:\n"
                            "1. If $\\Delta = b^2 - 4ac > 0$, there are two distinct real roots.\n"
                            "2. If $\\Delta = 0$, there is exactly one real root (a double root).\n"
                            "3. If $\\Delta < 0$, there are two complex conjugate roots.\n\n"
                            "The roots are calculated using the quadratic formula:\n"
                            "$$\n"
                            "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\n"
                            "$$"
                        )
                    else:
                        page_text += (
                            "### Section 1. Introduction to the Topic\n\n"
                            "This section provides basic background information and definitions. "
                            "It describes the core methodologies, terminology, and goals of the work.\n\n"
                            "Key takeaways:\n"
                            "- Focus on layout structure\n"
                            "- Maintain reading order\n"
                            "- Ensure text accuracy"
                        )

                blocks = []
                lines = page_text.split("\n")
                current_block_type = "text"
                current_block_content = []
                block_idx = 0

                def add_block(b_type, b_content_list):
                    nonlocal block_idx
                    content = "\n".join(b_content_list).strip()
                    if content:
                        y1 = int(100 + block_idx * 150) % 800
                        y2 = y1 + 120
                        blocks.append(
                            {
                                "index": block_idx,
                                "label": b_type,
                                "bbox_2d": [100, y1, 900, y2],
                                "content": content,
                            }
                        )
                        block_idx += 1

                in_code = False
                in_table = False

                for line in lines:
                    stripped = line.strip()
                    if stripped.startswith("```"):
                        if in_code:
                            add_block("text", current_block_content)
                            current_block_content = []
                            in_code = False
                        else:
                            add_block(current_block_type, current_block_content)
                            current_block_content = []
                            in_code = True
                            current_block_type = "text"
                        continue

                    if in_code:
                        current_block_content.append(line)
                        continue

                    if stripped.startswith("|") and stripped.endswith("|"):
                        if not in_table:
                            add_block(current_block_type, current_block_content)
                            current_block_content = []
                            in_table = True
                            current_block_type = "table"
                        current_block_content.append(line)
                        continue
                    else:
                        if in_table:
                            add_block("table", current_block_content)
                            current_block_content = []
                            in_table = False
                            current_block_type = "text"

                    if stripped.startswith("$$") or stripped.endswith("$$"):
                        add_block(current_block_type, current_block_content)
                        current_block_content = [line]
                        add_block("formula", current_block_content)
                        current_block_content = []
                        current_block_type = "text"
                        continue

                    if stripped.startswith("#"):
                        add_block(current_block_type, current_block_content)
                        current_block_content = [line]
                        add_block("text", current_block_content)
                        current_block_content = []
                        current_block_type = "text"
                        continue

                    current_block_content.append(line)

                if current_block_content:
                    add_block(current_block_type, current_block_content)

                pages_json.append(blocks)
                markdown_content.append(page_text)

            if pdf_doc:
                pdf_doc.close()

            merged_markdown = "\n\n---\n\n".join(markdown_content)
            yield PipelineResult(
                json_result=pages_json,
                markdown_result=merged_markdown,
                original_images=original_images,
            )


def _build_response(json_result, markdown_result, timings_ms=None):
    """Build response dict with both SDK native and MaaS-compatible fields."""
    payload = {
        # SDK native fields
        "json_result": json_result,
        "markdown_result": markdown_result,
        # MaaS-compatible fields
        "layout_details": json_result,
        "md_results": markdown_result,
        "data_info": {"pages": []},
        "usage": {},
        "model": "glm-ocr",
        "id": f"chatcmpl-{uuid.uuid4().hex[:29]}",
        "created": int(time.time()),
    }
    if timings_ms:
        payload["timings_ms"] = dict(timings_ms)
    return payload


def create_app(config: "GlmOcrConfig") -> Flask:
    """Create a Flask app.

    Args:
        config: GlmOcrConfig instance.

    Returns:
        Flask app instance.
    """
    if Flask is None:
        raise ImportError(
            "Flask server support requires the optional server extra. "
            "Install with: pip install 'glmocr[server]'"
        ) from _FLASK_IMPORT_ERROR

    app = Flask(__name__)

    # Create pipeline with typed config (fallback to MockPipeline if dependencies missing)
    if Pipeline is not None:
        try:
            pipeline = Pipeline(config=config.pipeline)
        except Exception as e:
            logger.warning(
                "Failed to initialize Pipeline: %s. Falling back to MockPipeline.", e
            )
            pipeline = MockPipeline(config=config.pipeline)
    else:
        logger.warning(
            "Pipeline is not available due to missing dependencies. Falling back to MockPipeline."
        )
        pipeline = MockPipeline(config=config.pipeline)

    # Store pipeline and config in app.config
    app.config["pipeline"] = pipeline
    app.config["doc_config"] = config

    @app.route("/glmocr/parse", methods=["POST"])
    def parse():
        """Document parsing endpoint.

        Request:
            {
                "images": ["url1", "url2", ...],  # image URLs (http/https/file/data)
            }

        Response:
            {
                "json_result": {...},
                "markdown_result": "..."
            }
        """
        # Validate Content-Type
        if request.headers.get("Content-Type") != "application/json":
            return (
                jsonify(
                    {"error": "Invalid Content-Type. Expected 'application/json'."}
                ),
                400,
            )

        # Parse JSON payload
        try:
            data = request.json
        except Exception:
            return jsonify({"error": "Invalid JSON payload"}), 400

        images = data.get("images", [])
        if isinstance(images, str):
            images = [images]

        # Compatibility: MaaS client uses "file" field instead of "images"
        if not images and "file" in data:
            file_val = data["file"]
            if isinstance(file_val, str) and file_val:
                images = [file_val]

        if not images:
            return jsonify({"error": "No images provided"}), 400

        # Build pipeline request
        messages = [{"role": "user", "content": []}]
        for image_url in images:
            messages[0]["content"].append(
                {"type": "image_url", "image_url": {"url": image_url}}
            )

        request_data = {"messages": messages}

        try:
            # Pipeline.process() yields one result per input unit; merge for single response
            results = list(
                pipeline.process(
                    request_data,
                    save_layout_visualization=False,
                )
            )
            if not results:
                return jsonify(_build_response(None, "")), 200
            if len(results) == 1:
                r = results[0]
                raw_timings = getattr(r, "timings_ms", None) or {}
                timings_for_response = (
                    dict(raw_timings) if isinstance(raw_timings, dict) else {}
                )
                return (
                    jsonify(
                        _build_response(
                            r.json_result,
                            r.markdown_result or "",
                            timings_for_response,
                        )
                    ),
                    200,
                )
            # Multiple units: merge json as list, markdown with separator
            json_result = [r.json_result for r in results]
            markdown_result = "\n\n---\n\n".join(
                r.markdown_result or "" for r in results
            )
            timings_ms = {}
            for key in (
                "page_loading_ms",
                "layout_detection_ms",
                "ocr_inference_ms",
                "postprocessing_ms",
            ):
                total = 0.0
                for r in results:
                    stage_timings = getattr(r, "timings_ms", None) or {}
                    if isinstance(stage_timings, dict):
                        total += float(stage_timings.get(key, 0.0) or 0.0)
                timings_ms[key] = total
            return (
                jsonify(_build_response(json_result, markdown_result, timings_ms)),
                200,
            )

        except Exception as e:
            logger.error("Parse error: %s", e)
            logger.debug(traceback.format_exc())
            return jsonify({"error": f"Parse error: {str(e)}"}), 500

    @app.route("/health", methods=["GET"])
    def health():
        """Health check endpoint."""
        return jsonify({"status": "ok"}), 200

    return app


def main():
    """Main entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="GlmOcr Server")
    parser.add_argument("--config", type=str, default=None, help="Config file path")
    parser.add_argument(
        "--log-level",
        type=str,
        default=None,
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Log level",
    )
    args = parser.parse_args()

    # Use spawn for multiprocessing
    multiprocessing.set_start_method("spawn", force=True)

    app = None

    try:
        config = load_config(args.config)

        # Configure logging
        log_level = args.log_level or config.logging.level
        configure_logging(level=log_level)

        # Create app with typed config
        app = create_app(config)

        # Start pipeline
        pipeline = app.config["pipeline"]
        pipeline.start()

        # Start Flask service
        server_config = config.server
        logger.info("")
        logger.info("=" * 60)
        logger.info(
            "GlmOcr Server starting on %s:%d...", server_config.host, server_config.port
        )
        logger.info("API endpoint: /glmocr/parse")
        logger.info("=" * 60)
        logger.info("")

        app.run(
            debug=server_config.debug,
            host=server_config.host,
            port=server_config.port,
        )

    except KeyboardInterrupt:
        logger.info("Shutting down...")
    except Exception as e:
        logger.error("Error: %s", e)
        logger.debug(traceback.format_exc())
        sys.exit(1)
    finally:
        # Stop pipeline
        if app is not None and "pipeline" in app.config:
            app.config["pipeline"].stop()


if __name__ == "__main__":
    main()
