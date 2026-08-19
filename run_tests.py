import time
from pathlib import Path

from glmocr.api import GlmOcr


def run_tests():
    input_dir = Path(r"c:\Users\VINOTHINI B\OneDrive\Desktop\GLM - OCR\apps\input")
    pdf_files = list(input_dir.glob("*.pdf"))
    if len(pdf_files) < 2:
        print("Not enough PDFs found")
        return

    test_files = pdf_files[:2]

    print("Testing on:")
    for f in test_files:
        print(f" - {f.name}")

    try:
        with GlmOcr() as parser:
            for f in test_files:
                print(f"Parsing {f.name}...")
                start = time.time()
                result = parser.parse(str(f))
                end = time.time()
                print(f"Total time: {end - start:.2f}s")
                if hasattr(result, "stats"):
                    print(result.stats)
    except Exception as e:
        print("Error during parsing:", e)


if __name__ == "__main__":
    run_tests()
