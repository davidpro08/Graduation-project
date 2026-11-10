# SemIF GPU 실행

## 현재 서버 확인 · 2026-11-10

새 서버에서 SemIF CUDA 프로세스와 health 응답을 확인했다. 동일 SemIF 코드의 합성 입력 CPU/GPU 속도 비교 결과는 `semif-jev-cpu-comparison.md`에 기록했다. JEV-CPU 실행 환경은 이 서버에서 확인되지 않아 두 엔진의 동일 입력 비교 및 추론 중 CPU 사용량 비교는 미완료다. 아래 접속 실패 기록은 이전 서버에 대한 과거 상태다.

## SemIF CUDA 전환 · 2026-11-10

공식 TheoLeeCJ/SemIf 커밋23cf1f39fc9534fe81437200959b6dfc7106e45a의 CUDA 로더와 direct.score를 사용하도록 브리지를 변경했다. Qwen3-0.6B/기존 모델 리비전은 유지하며 BF16 CUDA로 로드한다. 모든 파라미터가 CUDA인지 확인하고 CPU로 자동 우회하지 않는다. 기존 모순·페르소나 HTTP 계약은 유지하고 모델/health 장치 표시는 실제 manifest를 따른다.

bootstrap-semif.py는 기존 bootstrap.py가 설치한 uv를 사용해 독립 semif-venv와 semif-manifest.json을 준비한다. CPU 환경/manifest는 보존한다. 기본 브리지 manifest는 semif-manifest.json이며 CPU 복구 시 명시적으로 --manifest jev-manifest.json을 사용한다.

```bash
python3 /opt/gratta-ai/bootstrap-semif.py --runtime-dir /opt/gratta-ai --state-dir /mnt/jev_ae63e/gratta-ai
/opt/gratta-ai/semif-venv/bin/python /opt/gratta-ai/jev_server.py --state-dir /mnt/jev_ae63e/gratta-ai
```

경로는 기존 학교 환경 예시이며 새 서버에서 먼저 확인한다. 실제 전환 전 Qwen이 점유한 GPU 메모리와 동시 추론 최대 사용량을 확인해야 한다. 기존 Qwen 메모리 비율0.94에서 소형 모델을 추가할 여유는 보장되지 않는다. 메모리 비율 조정 또는 순차 사용은 실측 후 결정하며 운영 프로세스를 아직 변경하지 않았다.

이번 접속은 기존 dont.pem 부재 및 기존 SSH 접속 실패로 차단됐다. 로컬 Python 계약 테스트6개·구문 검사 통과. 실제 CUDA 로드·속도 대조·Qwen 동시 추론·배포는 미검증이다. 설치 스크립트는 대상 CUDA 호스트에서 실행 검증이 필요하다. 커밋/PR 갱신 없음.

원본: https://github.com/TheoLeeCJ/SemIf/tree/23cf1f39fc9534fe81437200959b6dfc7106e45a


## 새 접속 시도 · 2026-11-10

사용자가 지정한 root@203.252.159.18:63180 및 Downloads/m.pem으로 접속을 시도했다. 키 파일 존재 확인. 일반 SSH와 사용자 SSH config를 제외한 -F NUL 직접 접속 모두 ConnectTimeout(15초/20초)으로 실패했다. 인증 이전 TCP 연결 단계의 실패이며 키 유효성은 검증하지 못했다. 원격 설치·기동·GPU 전환은 실행하지 않았다. 서버 실행 상태와 SSH 공개 주소/포트 확인이 필요하다.
