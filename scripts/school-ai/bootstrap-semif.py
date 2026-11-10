"""Prepare pinned upstream SemIF in a dedicated CUDA environment; preserve CPU rollback."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

REVISION = "23cf1f39fc9534fe81437200959b6dfc7106e45a"
BRAIN_REVISION = "c1899de289a04d12100db370d81485cdf75e47ca"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-dir", type=Path, required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    args = parser.parse_args()
    runtime, state = args.runtime_dir.resolve(), args.state_dir.resolve()
    if runtime.name != "gratta-ai" or state.name != "gratta-ai":
        parser.error("Dedicated gratta-ai directories required")
    runtime.mkdir(parents=True, exist_ok=True)
    state.mkdir(parents=True, exist_ok=True)
    # Serialize repeated setup invocations on the Linux GPU host.
    import fcntl
    setup_lock = (runtime / ".semif-setup.lock").open("w")
    fcntl.flock(setup_lock, fcntl.LOCK_EX)
    source = runtime / ("semif-" + REVISION)
    if not source.exists():
        subprocess.run(["git", "clone", "https://github.com/TheoLeeCJ/SemIf.git", str(source)], check=True)
        subprocess.run(["git", "-C", str(source), "checkout", "--detach", REVISION], check=True)
    head = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git", "-C", str(source), "status", "--porcelain"], text=True).strip()
    if head != REVISION or dirty:
        raise RuntimeError("SemIF source revision or worktree mismatch")
    env = os.environ | {"PYTHONPATH": str(runtime / "bootstrap"), "HF_HOME": str(state / "huggingface"), "HF_HUB_DISABLE_TELEMETRY": "1"}
    uv = [sys.executable, "-m", "uv"]
    python = runtime / "semif-venv/bin/python"
    if not python.exists():
        subprocess.run(uv + ["venv", "--python", sys.executable, str(python.parent.parent)], env=env, check=True)
    subprocess.run(uv + ["pip", "install", "--python", str(python), "--torch-backend=auto", "torch==2.13.0", "transformers==5.17.0", "accelerate==1.12.0"], env=env, check=True)
    probe = "import torch; assert torch.cuda.is_available() and torch.cuda.device_count()==1, 'Exactly one CUDA GPU required'; assert torch.cuda.is_bf16_supported(), 'BF16 required'"
    subprocess.run([str(python), "-c", probe], env=env, check=True)
    download = "from huggingface_hub import snapshot_download; import sys; print(snapshot_download('Qwen/Qwen3-0.6B',revision=sys.argv[1],allow_patterns=['*.json','*.safetensors','*.txt','*.jinja','LICENSE']))"
    model = subprocess.check_output([str(python), "-c", download, BRAIN_REVISION], env=env, text=True).strip().splitlines()[-1]
    manifest = {"engine": "TheoLeeCJ/SemIf", "engine_revision": REVISION, "source_path": str(source), "brain": "Qwen/Qwen3-0.6B", "brain_revision": BRAIN_REVISION, "brain_path": model, "device": "cuda", "dtype": "bfloat16"}
    (state / "semif-manifest.json").write_text(json.dumps(manifest, indent=2))
    lock = subprocess.check_output(uv + ["pip", "freeze", "--python", str(python)], env=env, text=True)
    (state / "semif-requirements.lock.txt").write_text(lock)
    print("SemIF CUDA environment ready; serving/coexistence still require validation")


if __name__ == "__main__":
    main()
