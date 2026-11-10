"""학교 GPU 서버의 전용 venv와 고정 리비전 모델을 준비한다. 시스템 Python은 변경하지 않는다."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

VLLM_VERSION = "0.32.0"
UV_VERSION = "0.13.6"
MODEL = "Qwen/Qwen3-32B-AWQ"
REVISION = "0499c3ac83fdef8810b907a23894ba91e95eddd8"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-dir", required=True, type=Path)
    parser.add_argument("--state-dir", required=True, type=Path)
    args = parser.parse_args()
    runtime, state = args.runtime_dir.resolve(), args.state_dir.resolve()
    if runtime.name != "gratta-ai" or state.name != "gratta-ai":
        parser.error("설치 대상은 전용 gratta-ai 디렉터리여야 합니다.")
    runtime.mkdir(parents=True, exist_ok=True)
    state.mkdir(parents=True, exist_ok=True)
    status = state / "bootstrap-status.json"

    def stage(name, **extra):
        value = {"stage": name, "at": datetime.now(timezone.utc).isoformat(), **extra}
        status.write_text(json.dumps(value, ensure_ascii=False, indent=2))
        print(json.dumps(value, ensure_ascii=False), flush=True)

    env = os.environ | {"PIP_DISABLE_PIP_VERSION_CHECK": "1", "HF_HOME": str(state / "huggingface"),
                        "HF_HUB_DISABLE_TELEMETRY": "1", "VLLM_NO_USAGE_STATS": "1", "DO_NOT_TRACK": "1"}
    try:
        stage("installing_uv")
        bootstrap = runtime / "bootstrap"
        if not (bootstrap / "uv").exists():
            subprocess.run([sys.executable, "-m", "pip", "install", "--no-cache-dir", "--target", str(bootstrap), f"uv=={UV_VERSION}"], env=env, check=True)
        uv_env = env | {"PYTHONPATH": str(bootstrap)}
        uv = [sys.executable, "-m", "uv"]
        python = runtime / ".venv/bin/python"
        if not python.exists():
            subprocess.run(uv + ["venv", "--python", sys.executable, str(runtime / ".venv")], env=uv_env, check=True)
        stage("installing_vllm", version=VLLM_VERSION)
        subprocess.run(uv + ["pip", "install", "--python", str(python), "--torch-backend=auto", f"vllm=={VLLM_VERSION}"], env=uv_env, check=True)
        stage("downloading_model", model=MODEL, revision=REVISION)
        download = "from huggingface_hub import snapshot_download; import sys; print(snapshot_download(repo_id=sys.argv[1],revision=sys.argv[2],allow_patterns=['*.json','*.safetensors','*.txt','*.jinja','*.model','*.tiktoken','LICENSE'],max_workers=4))"
        model_path = subprocess.check_output([str(python), "-c", download, MODEL, REVISION], env=env, text=True).strip().splitlines()[-1]
        version_probe = "import importlib.metadata as m, torch, json; print(json.dumps({'vllm':m.version('vllm'),'torch':m.version('torch'),'cuda':torch.version.cuda,'gpu':torch.cuda.get_device_name(0)}))"
        versions = json.loads(subprocess.check_output([str(python), "-c", version_probe], env=env, text=True))
        manifest = {"runtime_dir": str(runtime), "state_dir": str(state), "model": MODEL, "revision": REVISION,
                    "model_path": model_path, "license": "Apache-2.0", "versions": versions}
        (state / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
        lock = subprocess.check_output(uv + ["pip", "freeze", "--python", str(python)], env=uv_env, text=True)
        (state / "requirements.lock.txt").write_text(lock)
        stage("ready", **versions)
    except Exception as error:
        stage("failed", error=type(error).__name__)
        raise


if __name__ == "__main__":
    main()
