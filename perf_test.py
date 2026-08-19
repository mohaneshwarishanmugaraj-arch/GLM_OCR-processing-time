import sys
import time
import json
import csv
import math
import os
from pathlib import Path
import requests

# Fix unicode print errors on Windows
if sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

# Configuration
INPUT_DIR = Path("input")
OUTPUT_DIR = Path("output/results")
CONFIG_FILE = Path("perf_config.json")

# Endpoints
API_BASE_URL = os.getenv("GLMOCR_TASK_API_URL", "http://localhost:8000/api/v1")
UPLOAD_URL = f"{API_BASE_URL}/tasks/upload"
STATUS_URL = f"{API_BASE_URL}/tasks/{{}}"


def get_config():
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading config: {e}")
    return {"exclude_files": [], "exclude_extensions": []}


def calculate_percentile(data, p):
    if not data:
        return 0.0
    data_sorted = sorted(data)
    k = (len(data_sorted) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return data_sorted[int(k)]
    d0 = data_sorted[int(f)] * (c - k)
    d1 = data_sorted[int(c)] * (k - f)
    return d0 + d1


def format_ms(seconds):
    return f"{seconds * 1000:,.0f} ms"


def run_performance_test():
    total_start_time = time.perf_counter()
    config = get_config()

    # 1. Input Discovery
    discovery_start = time.perf_counter()
    if not INPUT_DIR.exists():
        print(f"Input directory '{INPUT_DIR}' does not exist. Creating it...")
        INPUT_DIR.mkdir(parents=True, exist_ok=True)
        print("Please place files in the 'input/' directory and run again.")
        return

    all_files = []
    for p in INPUT_DIR.rglob("*"):
        if p.is_file():
            if p.name in config.get("exclude_files", []):
                continue
            if p.suffix in config.get("exclude_extensions", []):
                continue
            all_files.append(p)

    discovery_time = time.perf_counter() - discovery_start

    print("========================================")
    print("PERFORMANCE TEST INITIALIZATION")
    print("========================================")
    print(f"Input folder: {INPUT_DIR.absolute()}")
    print(f"Files discovered: {len(all_files)}")

    if not all_files:
        print("No files to process.")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    raw_results_file = OUTPUT_DIR / "raw_timings.csv"
    summary_file = OUTPUT_DIR / "summary.txt"

    csv_file = open(raw_results_file, "w", newline="", encoding="utf-8")
    csv_writer = csv.writer(csv_file)
    csv_writer.writerow(
        [
            "Seq",
            "File",
            "Size(MB)",
            "Success",
            "Status Code",
            "Error Msg",
            "Discovery(s)",
            "Loading(s)",
            "Prep(s)",
            "Execution(s)",
            "Response(s)",
            "Output Processing(s)",
            "Page Loading(s)",
            "Layout Detection(s)",
            "VLM Inference(s)",
            "Post-processing(s)",
            "EndToEnd(s)",
        ]
    )

    results = []

    print("\nStarting SEQUENTIAL execution...")

    for seq_idx, file_path in enumerate(all_files, 1):
        print(f"\n[{seq_idx}/{len(all_files)}] Processing {file_path.name}...")
        file_start_time = time.perf_counter()

        file_size_mb = file_path.stat().st_size / (1024 * 1024)

        # 2. File Loading
        load_start = time.perf_counter()
        try:
            with open(file_path, "rb") as f:
                file_content = f.read()
        except Exception as e:
            print(f"  Error loading file: {e}")
            continue
        load_time = time.perf_counter() - load_start

        # 3. Request preparation
        prep_start = time.perf_counter()
        files = {"file": (file_path.name, file_content)}
        data = {"processing_mode": "pipeline"}
        prep_time = time.perf_counter() - prep_start

        # 4. Request Start / Execution (Upload + Poll)
        exec_start = time.perf_counter()
        success = False
        error_msg = ""
        status_code = 0
        internal_timings = {}

        try:
            print("  Uploading...")
            # We don't timeout on upload to allow huge files (e.g. 500MB)
            resp = requests.post(UPLOAD_URL, files=files, data=data)
            status_code = resp.status_code
            if resp.status_code in (200, 201):
                resp_data = resp.json()
                if resp_data.get("success"):
                    task_id = resp_data["data"]["task_id"]
                    print(
                        f"  Upload successful. Task ID: {task_id}. Polling for completion..."
                    )

                    # Poll
                    while True:
                        poll_resp = requests.get(STATUS_URL.format(task_id))
                        if poll_resp.status_code == 200:
                            poll_data = poll_resp.json()
                            if poll_data.get("success"):
                                status = poll_data["data"]["status"]
                                if status == "completed":
                                    success = True
                                    metadata = (
                                        poll_data.get("data", {}).get("metadata", {})
                                        or {}
                                    )
                                    internal_timings = metadata.get("timings", {}) or {}
                                    break
                                elif status == "failed":
                                    error_msg = poll_data["data"].get(
                                        "error_message", "Task failed"
                                    )
                                    break
                        time.sleep(1)  # Poll interval
                else:
                    error_msg = resp_data.get(
                        "message", "Upload returned success=False"
                    )
            else:
                error_msg = f"HTTP {resp.status_code}: {resp.text[:100]}"
        except Exception as e:
            error_msg = str(e)

        exec_time = time.perf_counter() - exec_start

        # 5. Response Processing
        resp_process_start = time.perf_counter()
        resp_process_time = time.perf_counter() - resp_process_start

        # 6. Output Processing
        output_process_start = time.perf_counter()
        output_process_time = time.perf_counter() - output_process_start
        end_to_end = time.perf_counter() - file_start_time

        csv_writer.writerow(
            [
                seq_idx,
                file_path.name,
                f"{file_size_mb:.2f}",
                str(success),
                status_code,
                error_msg,
                discovery_time / len(all_files),
                load_time,
                prep_time,
                exec_time,
                resp_process_time,
                output_process_time,
                internal_timings.get("page_loading_ms", 0.0) / 1000.0,
                internal_timings.get("layout_detection_ms", 0.0) / 1000.0,
                internal_timings.get("ocr_inference_ms", 0.0) / 1000.0,
                internal_timings.get("postprocessing_ms", 0.0) / 1000.0,
                end_to_end,
            ]
        )
        csv_file.flush()

        print(f"  {'SUCCESS' if success else 'FAILED'} in {format_ms(end_to_end)}")
        if not success:
            print(f"  Error: {error_msg}")

        results.append(
            {
                "seq": seq_idx,
                "success": success,
                "latency": exec_time,
                "e2e": end_to_end,
                "discovery": discovery_time / len(all_files),
                "loading": load_time,
                "preparation": prep_time,
                "execution": exec_time,
                "response": resp_process_time,
                "output": output_process_time,
                "internal_timings": internal_timings,
            }
        )

    csv_file.close()

    total_time = time.perf_counter() - total_start_time

    if not results:
        print("No results collected.")
        return

    # Calculate statistics
    latencies = [r["latency"] for r in results]
    success_count = sum(1 for r in results if r["success"])
    fail_count = len(results) - success_count

    # Checkpoint medians
    ckpts = [
        "discovery",
        "loading",
        "preparation",
        "execution",
        "response",
        "output",
        "e2e",
    ]
    medians = {k: calculate_percentile([r[k] for r in results], 50) for k in ckpts}

    # ASCII Report
    report = []
    report.append("========================================")
    report.append("PERFORMANCE TEST SUMMARY")
    report.append("========================================")
    report.append(f"Input folder: {INPUT_DIR.absolute()}")
    report.append(f"Files discovered: {len(all_files)}")
    report.append(f"Files processed: {len(results)}")
    report.append("Execution mode: SEQUENTIAL")
    report.append(f"Total processing time: {total_time:.2f} seconds")
    report.append("")
    report.append("REQUEST LATENCY")
    report.append("----------------------------------------")
    report.append(f"Min: {format_ms(min(latencies))}")
    report.append(f"Median: {format_ms(calculate_percentile(latencies, 50))}")
    report.append(f"p50: {format_ms(calculate_percentile(latencies, 50))}")
    report.append(f"p90: {format_ms(calculate_percentile(latencies, 90))}")
    report.append(f"p95: {format_ms(calculate_percentile(latencies, 95))}")
    report.append(f"p99: {format_ms(calculate_percentile(latencies, 99))}")
    report.append(f"Max: {format_ms(max(latencies))}")
    report.append(f"Average: {format_ms(sum(latencies)/len(latencies))}")
    report.append("")
    report.append("SEQUENTIAL PROCESSING")
    report.append("----------------------------------------")
    report.append(f"Total requests: {len(results)}")
    report.append(f"Successful requests: {success_count}")
    report.append(f"Failed requests: {fail_count}")
    report.append(f"Error rate: {(fail_count/len(results))*100:.2f}%")
    report.append(
        f"Median request time: {format_ms(calculate_percentile(latencies, 50))}"
    )
    report.append(f"p99 request time: {format_ms(calculate_percentile(latencies, 99))}")
    report.append(f"Total sequential time: {total_time:.2f} sec")
    report.append("")
    report.append("CHECKPOINT MEDIANS")
    report.append("----------------------------------------")
    report.append(f"Input discovery: {format_ms(medians['discovery'])}")
    report.append(f"File loading: {format_ms(medians['loading'])}")
    report.append(f"Request preparation: {format_ms(medians['preparation'])}")
    internal_stage_names = {
        "page_loading_ms": "Page loading",
        "layout_detection_ms": "Layout detection",
        "ocr_inference_ms": "VLM inference",
        "postprocessing_ms": "Post-processing/Markdown generation",
    }
    for timing_key, label in internal_stage_names.items():
        values = [
            float(result["internal_timings"].get(timing_key, 0.0) or 0.0) / 1000
            for result in results
        ]
        report.append(f"{label}: {format_ms(calculate_percentile(values, 50))}")
    report.append(f"End-to-end: {format_ms(medians['e2e'])}")
    report.append("")
    report.append("THROUGHPUT")
    report.append("----------------------------------------")
    report.append(f"Requests/sec: {len(results)/total_time:.2f}")
    report.append("========================================")

    summary_text = "\n".join(report)
    print("\n" + summary_text)

    with open(summary_file, "w", encoding="utf-8") as f:
        f.write(summary_text)

    print(f"\nRaw results saved to: {raw_results_file}")
    print(f"Summary saved to: {summary_file}")


if __name__ == "__main__":
    run_performance_test()
