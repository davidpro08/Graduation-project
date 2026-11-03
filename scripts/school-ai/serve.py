"""준비한 Qwen을 서버 loopback에서 실행한다. 접근은 별도 SSH 터널을 사용한다."""
import argparse
import json
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("--max-model-len", type=int, default=8192)
    parser.add_argument("--memory-fraction", type=float, default=0.94)
    args = parser.parse_args()
    if not 2048 <= args.max_model_len <= 32768 or not 0.5 <= args.memory_fraction <= 0.95:
        parser.error("컨텍스트 또는 GPU 메모리 비율이 허용 범위를 벗어났습니다.")
    manifest = json.loads((args.state_dir / "manifest.json").read_text())
    runtime = Path(manifest["runtime_dir"])
    env = os.environ | {"HF_HOME": str(args.state_dir / "huggingface"), "HF_HUB_DISABLE_TELEMETRY": "1",
                        "VLLM_NO_USAGE_STATS": "1", "DO_NOT_TRACK": "1", "OMP_NUM_THREADS": "8",
                        "TOKENIZERS_PARALLELISM": "false"}
    command = [str(runtime / ".venv/bin/vllm"), "serve", manifest["model_path"],
               "--served-model-name", manifest["model"], "--host", "127.0.0.1", "--port", "8000",
               "--max-model-len", str(args.max_model_len), "--max-num-seqs", "2",
               "--max-num-batched-tokens", "256", "--gpu-memory-utilization", str(args.memory_fraction),
               "--dtype", "half", "--enforce-eager", "--generation-config", "vllm",
               "--default-chat-template-kwargs", '{"enable_thinking":false}']
    print(json.dumps({"model": manifest["model"], "revision": manifest["revision"], "max_model_len": args.max_model_len,
                      "gpu_memory_utilization": args.memory_fraction, "max_num_seqs": 2, "max_num_batched_tokens": 256, "host": "127.0.0.1"}), flush=True)
    os.execvpe(command[0], command, env)


if __name__ == "__main__":
    main()
