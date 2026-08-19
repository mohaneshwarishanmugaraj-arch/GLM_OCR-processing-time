import os
import subprocess
import sys
import threading
import time
from pathlib import Path

# Paths
ROOT_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = ROOT_DIR / "apps" / "backend"
FRONTEND_DIR = ROOT_DIR / "apps" / "frontend"
DEFAULT_PYTHON = Path(sys.executable)
VENV_PYTHON = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"

processes = []


def resolve_python_executable() -> str:
    """Return a valid Python executable for backend and SDK processes."""
    venv_cfg = BACKEND_DIR / ".venv" / "pyvenv.cfg"
    if VENV_PYTHON.exists() and venv_cfg.exists():
        return str(VENV_PYTHON)
    if venv_cfg.exists():
        print(f"[startup] Ignoring incomplete backend venv at {BACKEND_DIR / '.venv'}")
    return str(DEFAULT_PYTHON)


def run_service(name, cmd, cwd):
    """Run a subprocess and print its output with a prefix."""
    print(f"[{name}] Starting: {cmd} in {cwd}")
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            shell=False,
        )
        processes.append(proc)

        for line in iter(proc.stdout.readline, ""):
            if line:
                print(f"[{name}] {line.strip()}")

    except Exception as e:
        print(f"[{name}] Error: {e}")


def main():
    print("==========================================================")
    print("Starting GLM-OCR Application Suite (Frontend, Backend, SDK)")
    print("==========================================================")

    py_exe = resolve_python_executable()
    print(f"Using Python interpreter: {py_exe}")

    sdk_thread = threading.Thread(
        target=run_service,
        args=("SDK Server", [py_exe, "-m", "glmocr.server"], ROOT_DIR),
        daemon=True,
    )

    backend_thread = threading.Thread(
        target=run_service,
        args=(
            "Backend API",
            [
                py_exe,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "8000",
            ],
            BACKEND_DIR,
        ),
        daemon=True,
    )

    pnpm_cmd = "pnpm.cmd" if os.name == "nt" else "pnpm"
    frontend_thread = threading.Thread(
        target=run_service,
        args=("Frontend UI", [pnpm_cmd, "dev"], FRONTEND_DIR),
        daemon=True,
    )

    sdk_thread.start()
    time.sleep(2)
    backend_thread.start()
    time.sleep(2)
    frontend_thread.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n==========================================================")
        print("Terminating all services...")
        print("==========================================================")
        for proc in processes:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
        print("All processes stopped successfully.")


if __name__ == "__main__":
    main()
