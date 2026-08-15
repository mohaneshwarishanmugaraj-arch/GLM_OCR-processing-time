import os
import sys
import time
import subprocess
import threading
from pathlib import Path

# Paths
ROOT_DIR = Path(r"c:\Users\VINOTHINI B\OneDrive\Desktop\GLM - OCR")
BACKEND_DIR = ROOT_DIR / "apps" / "backend"
FRONTEND_DIR = ROOT_DIR / "apps" / "frontend"
VENV_PYTHON = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"

processes = []

def run_service(name, cmd, cwd):
    """Run a subprocess and print its output with a prefix."""
    print(f"[{name}] Starting: {cmd} in {cwd}")
    
    # On Windows, we use shell=True for node/pnpm commands
    is_shell = True if "pnpm" in cmd else False
    
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            shell=is_shell
        )
        processes.append(proc)
        
        # Read stdout in real-time
        for line in iter(proc.stdout.readline, ''):
            print(f"[{name}] {line.strip()}")
            
    except Exception as e:
        print(f"[{name}] Error: {e}")

def main():
    print("==========================================================")
    print("Starting GLM-OCR Application Suite (Frontend, Backend, SDK)")
    print("==========================================================")
    
    # 1. Start SDK Flask Server
    sdk_thread = threading.Thread(
        target=run_service,
        args=("SDK Server", [str(VENV_PYTHON), "-m", "glmocr.server"], ROOT_DIR),
        daemon=True
    )
    
    # 2. Start Backend FastAPI
    backend_thread = threading.Thread(
        target=run_service,
        args=("Backend API", [str(VENV_PYTHON), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], BACKEND_DIR),
        daemon=True
    )
    
    # 3. Start Frontend dev server
    # Resolve pnpm.cmd on Windows to bypass script execution restrictions
    pnpm_cmd = "pnpm.cmd" if os.name == "nt" else "pnpm"
    frontend_thread = threading.Thread(
        target=run_service,
        args=("Frontend UI", [pnpm_cmd, "dev"], FRONTEND_DIR),
        daemon=True
    )
    
    sdk_thread.start()
    time.sleep(2)  # Give SDK time to launch
    backend_thread.start()
    time.sleep(2)  # Give Backend time to launch
    frontend_thread.start()
    
    # Keep the main process running and handle shutdown
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n==========================================================")
        print("Terminating all services...")
        print("==========================================================")
        for proc in processes:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
        print("All processes stopped successfully.")

if __name__ == "__main__":
    main()
