"""검토한 JEV-CPU 소스와 기본 모델을 고정하고 독립 CPU venv를 준비한다."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys

ENGINE_REVISION = "759fa60603a0e312cda38824e63e58f18445c14a"
BRAIN_REVISION = "c1899de289a04d12100db370d81485cdf75e47ca"
BRAIN = "Qwen/Qwen3-0.6B"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-dir", type=Path, required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    args = parser.parse_args()
    runtime, state = args.runtime_dir.resolve(), args.state_dir.resolve()
    if runtime.name != "gratta-ai" or state.name != "gratta-ai":
        parser.error("전용 gratta-ai 경로가 필요합니다.")
    env = os.environ | {"HF_HOME": str(state / "huggingface"), "HF_HUB_DISABLE_TELEMETRY": "1", "DO_NOT_TRACK": "1", "CUDA_VISIBLE_DEVICES": ""}

    def stage(name, **extra):
        data = {"stage": name, "at": datetime.now(timezone.utc).isoformat(), **extra}
        (state / "jev-bootstrap-status.json").write_text(json.dumps(data, indent=2))
        print(json.dumps(data), flush=True)

    def download(python, model, revision, patterns):
        script = "from huggingface_hub import snapshot_download; import sys,json; print(snapshot_download(repo_id=sys.argv[1],revision=sys.argv[2],allow_patterns=json.loads(sys.argv[3]),max_workers=4))"
        return subprocess.check_output([str(python), "-c", script, model, revision, json.dumps(patterns)], env=env, text=True).strip().splitlines()[-1]

    try:
        stage("downloading_reviewed_source")
        source = download(runtime / ".venv/bin/python", "Meanblock/JEV-CPU", ENGINE_REVISION,
                          ["semif_cpu.py", "src/semif_phase1/__init__.py", "src/semif_phase1/core.py", "src/semif_phase1/direct.py", "requirements.txt", "LICENSE", "THIRD_PARTY.md", "README.md"])
        uv_env = env | {"PYTHONPATH": str(runtime / "bootstrap")}
        uv = [sys.executable, "-m", "uv"]
        python = runtime / "jev-venv/bin/python"
        if not python.exists():
            subprocess.run(uv + ["venv", "--python", sys.executable, str(runtime / "jev-venv")], env=uv_env, check=True)
        stage("installing_cpu_dependencies")
        subprocess.run(uv + ["pip", "install", "--python", str(python), "--torch-backend=cpu", "-r", str(Path(source) / "requirements.txt")], env=uv_env, check=True)
        stage("downloading_cpu_model", model=BRAIN, revision=BRAIN_REVISION)
        brain_path = download(python, BRAIN, BRAIN_REVISION, ["*.json", "*.safetensors", "*.txt", "*.jinja", "LICENSE"])
        probe = "import importlib.metadata as m, torch, json; print(json.dumps({'torch':m.version('torch'),'transformers':m.version('transformers'),'accelerate':m.version('accelerate'),'cuda':torch.version.cuda}))"
        versions = json.loads(subprocess.check_output([str(python), "-c", probe], env=env, text=True))
        if versions["cuda"] is not None:
            raise RuntimeError("JEV는 CPU 전용 torch가 필요합니다.")
        manifest = {"engine": "Meanblock/JEV-CPU", "engine_revision": ENGINE_REVISION, "source_path": source,
                    "brain": BRAIN, "brain_revision": BRAIN_REVISION, "brain_path": brain_path, "versions": versions,
                    "runtime_dir": str(runtime), "state_dir": str(state), "device": "cpu", "dtype": "float32"}
        (state / "jev-manifest.json").write_text(json.dumps(manifest, indent=2))
        lock = subprocess.check_output(uv + ["pip", "freeze", "--python", str(python)], env=uv_env, text=True)
        (state / "jev-requirements.lock.txt").write_text(lock)
        stage("ready", **versions)
    except Exception as error:
        stage("failed", error=type(error).__name__)
        raise


if __name__ == "__main__":
    main()
