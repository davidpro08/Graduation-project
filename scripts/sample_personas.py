"""공개 NVIDIA 한국 페르소나의 재현 가능한 5만 레코드 표본 추출."""
import argparse
import collections
import hashlib
import heapq
import json
import pathlib
import random
import urllib.request

DATASET = 'nvidia/Nemotron-Personas-Korea'
REVISION = 'ada0f5b53a38bb5a30cce09358adde883c1ab63a'
SEED = 20261001
BASE_SIZE = 40000
SUPPLEMENT_SIZE = 10000

def age_group(age):
    return '19-29' if age < 30 else f'{age // 10 * 10}-{age // 10 * 10 + 9}' if age < 70 else '70+'

def valid(row):
    return all(row.get(k) not in (None, '') for k in ['uuid', 'age', 'sex', 'province', 'persona']) and row['age'] >= 19

def stratum(row):
    return (age_group(row['age']), row['sex'], row['province'])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', default='.tmp/persona-sample')
    args = parser.parse_args()
    folder = pathlib.Path(args.directory)
    folder.mkdir(parents=True, exist_ok=True)
    import pyarrow.parquet as pq
    files = []
    for i in range(9):
        name = f'train-{i:05d}-of-00009.parquet'
        path = folder / name
        if not path.exists():
            print(f'다운로드 {i + 1}/9: {name}', flush=True)
            url = f'https://huggingface.co/datasets/{DATASET}/resolve/{REVISION}/data/{name}'
            partial = path.with_suffix('.part')
            urllib.request.urlretrieve(url, partial)
            partial.replace(path)
        files.append(path)

    def rows(columns=None):
        for path in files:
            for batch in pq.ParquetFile(path).iter_batches(batch_size=2048, columns=columns):
                yield from batch.to_pylist()

    counts = collections.Counter()
    total = 0
    for row in rows(['uuid', 'age', 'sex', 'province', 'persona']):
        total += 1
        if valid(row):
            counts[stratum(row)] += 1
    eligible = sum(counts.values())
    quotas = {k: int(BASE_SIZE * v / eligible) for k, v in counts.items()}
    order = sorted(counts, key=lambda k: (-(BASE_SIZE * counts[k] / eligible - quotas[k]), k))
    for k in order[:BASE_SIZE - sum(quotas.values())]:
        quotas[k] += 1
    print(f'집계 완료: 전체 {total}, 유효 {eligible}, 층 {len(counts)}', flush=True)

    heaps = collections.defaultdict(list)
    for row in rows(['uuid', 'age', 'sex', 'province', 'persona']):
        if not valid(row):
            continue
        key = stratum(row)
        quota = quotas[key]
        score = int(hashlib.sha256(f'{SEED}:{row["uuid"]}'.encode()).hexdigest(), 16)
        heap = heaps[key]
        item = (-score, row['uuid'])
        if quota and len(heap) < quota:
            heapq.heappush(heap, item)
        elif quota and item > heap[0]:
            heapq.heapreplace(heap, item)
    selected = {uid for heap in heaps.values() for _, uid in heap}
    if len(selected) != BASE_SIZE:
        raise ValueError('기본 표본 UUID 중복 또는 부족')

    # 원본 범주를 보존한다. 추론한 학생/은퇴자/성격 태그를 만들지 않는다.
    axes = ['marital_status', 'family_type', 'occupation', 'education_level', 'district']
    pools = collections.defaultdict(list)
    base_counts = collections.Counter()
    fallback = []
    rng = random.Random(SEED)
    seen = 0
    for row in rows(['uuid', 'age', 'sex', 'province', 'persona'] + axes):
        if not valid(row):
            continue
        uid = row['uuid']
        categories = [(axis, row.get(axis)) for axis in axes if row.get(axis)]
        if uid in selected:
            base_counts.update(categories)
            continue
        score = int(hashlib.sha256(f'{SEED}:supplement:{uid}'.encode()).hexdigest(), 16)
        for category in categories:
            heap = pools[category]
            item = (-score, uid)
            if len(heap) < 100:
                heapq.heappush(heap, item)
            elif item > heap[0]:
                heapq.heapreplace(heap, item)
        seen += 1
        if len(fallback) < 30000:
            fallback.append(uid)
        else:
            index = rng.randrange(seen)
            if index < len(fallback):
                fallback[index] = uid
    candidates = {}
    for category, heap in pools.items():
        for _, uid in heap:
            candidates.setdefault(uid, set()).add(category)
    for row in rows(['uuid'] + axes):
        if row['uuid'] in candidates:
            candidates[row['uuid']] = {(axis, row.get(axis)) for axis in axes if row.get(axis)}
    extra = {}
    coverage = base_counts.copy()
    priorities = [(-sum(max(0, 50 - coverage[c]) for c in categories), hashlib.sha256(f'{SEED}:coverage:{uid}'.encode()).digest(), uid) for uid, categories in candidates.items()]
    heapq.heapify(priorities)
    # 작은 원본 범주도 검토할 수 있도록 범주별 최소 50명을 목표로 보충한다.
    while len(extra) < SUPPLEMENT_SIZE:
        if not priorities:
            break
        old_score, tie, best = heapq.heappop(priorities)
        score = sum(max(0, 50 - coverage[c]) for c in candidates[best])
        if score == 0:
            break
        if priorities and -score > priorities[0][0]:
            heapq.heappush(priorities, (-score, tie, best))
            continue
        reasons = [f'{a}:{v}' for a, v in sorted(candidates[best]) if coverage[(a, v)] < 50]
        extra[best] = reasons
        coverage.update(candidates[best])
    for uid in fallback:
        if len(extra) >= SUPPLEMENT_SIZE:
            break
        if uid not in extra:
            extra[uid] = ['무작위 잔여 보충']
    if len(extra) != SUPPLEMENT_SIZE:
        raise ValueError('보충 표본 부족')

    sample_counts = {axis: collections.Counter() for axis in axes + ['age_group', 'sex', 'province']}
    output = folder / 'sample.jsonl'
    batch_folder = folder / 'batches'
    batch_folder.mkdir(exist_ok=True)
    batch = []
    batch_index = 0
    written = set()
    def write_batch():
        nonlocal batch_index
        (batch_folder / f'{batch_index:04d}.json').write_text(json.dumps(batch, ensure_ascii=False), encoding='utf-8')
        batch_index += 1
        batch.clear()
    with output.open('w', encoding='utf-8') as handle:
        for row in rows():
            uid = row['uuid']
            if uid not in selected and uid not in extra:
                continue
            if uid in written:
                raise ValueError('표본 UUID 중복')
            written.add(uid)
            record = dict(row, age_group=age_group(row['age']), sample_group='base' if uid in selected else 'supplement', sample_reasons=extra.get(uid, []))
            handle.write(json.dumps(record, ensure_ascii=False) + '\n')
            batch.append(record)
            for axis in sample_counts:
                sample_counts[axis][record.get(axis)] += 1
            if len(batch) == 500:
                write_batch()
        if batch:
            write_batch()
    manifest = {'dataset': DATASET, 'revision': REVISION, 'seed': SEED, 'source_rows': total, 'eligible_rows': eligible, 'sample_rows': len(written), 'base_rows': len(selected), 'supplement_rows': len(extra), 'jsonl_bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'batch_count': batch_index, 'counts': {axis: dict(count) for axis, count in sample_counts.items()}}
    (folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in manifest.items() if k != 'counts'}, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
