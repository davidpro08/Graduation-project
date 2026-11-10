"""Synthetic CPU/GPU comparison with identical pinned SemIF code and model."""
import argparse
import gc
import json
from pathlib import Path
import statistics
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    manifest = json.loads((args.state_dir / "semif-manifest.json").read_text())
    sys.path.insert(0, str(Path(manifest["source_path"]) / "src"))
    from semif_phase1.core import load_causal_model
    from semif_phase1.direct import score
    import torch
    torch.set_num_threads(8)
    torch.set_num_interop_threads(1)
    rows = [{"id": "synthetic-" + str(index), "state": {"left": "민수는 11월 6일 회의에 참석했다.", "right": text},
             "question": "같은 사람과 사건에 대한 두 주장이 모순인지 판단하라.",
             "options": [{"id": "contradiction", "description": "모순"}, {"id": "compatible", "description": "양립 가능"}, {"id": "unknown", "description": "판단 불가"}]}
            for index, text in enumerate(["민수는 11월 6일 회의에 참석하지 않았다.", "민수는 11월 6일 회의에 참석했다.", "누가 참석했는지 알 수 없다."])]
    report = {"engineRevision": manifest["engine_revision"], "brainRevision": manifest["brain_revision"], "syntheticOnly": True, "runs": {}}
    for device, dtype in [("cpu", "float32"), ("cuda", "bfloat16")]:
        model, tokenizer, metadata = load_causal_model(manifest["brain_path"], manifest["brain_revision"], device=device, dtype=dtype)
        score(model, tokenizer, rows[0], metadata, max_tokens=4096)
        measurements = []
        for _ in range(3):
            for row in rows:
                start = time.perf_counter()
                result = score(model, tokenizer, row, metadata, max_tokens=4096)
                measurements.append({"id": row["id"], "milliseconds": (time.perf_counter()-start)*1000, "tokens": result["input_tokens"], "probabilities": result["probabilities"]})
        report["runs"][device] = {"dtype": dtype, "medianMilliseconds": statistics.median(x["milliseconds"] for x in measurements), "measurements": measurements}
        del model, tokenizer
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()
    report["speedup"] = report["runs"]["cpu"]["medianMilliseconds"] / report["runs"]["cuda"]["medianMilliseconds"]
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({"cpuMs": report["runs"]["cpu"]["medianMilliseconds"], "gpuMs": report["runs"]["cuda"]["medianMilliseconds"], "speedup": report["speedup"]}), flush=True)


if __name__ == "__main__":
    main()
