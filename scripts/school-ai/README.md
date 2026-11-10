# 학교 GPU에서 Qwen 실행

## 현재 접속 · 2026-11-07

현재 서버는 root@203.252.159.20:57076, 키는 이 PC의 Downloads/dont.pem이다. 저장소 루트에서 `ssh -F .tmp/school-ai-ssh.config gratta-school-ai`로 접속한다. 기본 OpenSSH known_hosts로 호스트 키를 검증한다. 아래11월3일 주소는 이전 인스턴스다. 실행 경로 /opt/gratta-ai와 캐시 /mnt/jev_ae63e/gratta-ai, 전용tmux gratta-qwen/gratta-jev를 사용한다. 로컬18080→원격8000,18081→8001 터널을 열고 양쪽 health200을 확인했다. jev_server.py는 기존 페르소나 요청에 더해 `/v1/claim-pair`의 claim-pair-v1 요청을 지원한다. 두 명제와 원문을 넣어 contradiction/compatible/unknown 선택 확률을 반환한다. 합성 명제 추출/판단1쌍 확인, DB 적용은 별도다.

새 인스턴스를 처음부터 준비할 때는 [.agents/AI/instance-setup.md](../../.agents/AI/instance-setup.md)의 단계별 명령을 따른다. 이 문서는 개별 스크립트의 책임과 실행 예시를 설명한다.

## 현재 접속 · 2026-11-03

새 인스턴스는 `root@203.252.159.18:51772`다. 로컬 `~/.ssh/jev-test.pem`으로 접속하며 영구 볼륨 `/mnt/jev_ae63e/gratta-ai`의 모델을 재사용해 `/opt/gratta-ai`의 GPU·CPU 환경을 복구했다. 아래 명령은 저장소 루트의 로컬 PowerShell에서 실행한다.

```powershell
ssh -F .tmp/school-ai-ssh.config gratta-school-ai
```

Git 제외 `.tmp/school-ai-ssh.config`에 현재 주소·포트·로컬 키 경로가 있고, `.tmp/school-ai-known_hosts`에 새 인스턴스의 호스트 키를 기록했다. 개인키 본문은 복사하지 않는다. 두 파일은 현재 PC에만 있으므로 새 체크아웃에는 [초기 접속 절차](../../.agents/AI/instance-setup.md#2-로컬에서-접속-정보-지정파일-전송)를 적용한다. 별도 호스트 키 파일은 [OpenSSH의 UserKnownHostsFile 설정](https://man.openbsd.org/ssh_config#UserKnownHostsFile)을 사용하고 호스트 키 검사는 유지한다.

| 연결 | 로컬 주소 | 원격 주소 |
| --- | --- | --- |
| Qwen3-32B-AWQ | `127.0.0.1:18080` | `127.0.0.1:8000` |
| JEV-CPU / Qwen3-0.6B | `127.0.0.1:18081` | `127.0.0.1:8001` |

PC 재시작 등으로 터널이 종료된 경우 아래 명령을 각각 실행한다. 실행 중인 터널은 중복 생성하지 않는다.

```powershell
./scripts/school-ai/connect.ps1 -Server 203.252.159.18 -SshPort 51772 -IdentityFile "$env:USERPROFILE/.ssh/jev-test.pem" -SshConfigFile .tmp/school-ai-ssh.config
./scripts/school-ai/connect.ps1 -Server 203.252.159.18 -SshPort 51772 -IdentityFile "$env:USERPROFILE/.ssh/jev-test.pem" -SshConfigFile .tmp/school-ai-ssh.config -LocalPort 18081 -RemotePort 8001
```

`connect.ps1`의 선택적 `SshConfigFile`은 지정한 SSH 설정 파일을 사용하며 생략 시 기존 사용법을 유지한다. 서버는 `gratta-qwen`·`gratta-jev` tmux 세션으로 유지된다. 서버 재부팅 시 자동 기동은 구성하지 않았다. 아래 `51201` 예시는 이전 인스턴스의 접속 기록이다.

기존 NestJS의 `QwenDebateHttp`·`QwenHttp`를 바꾸지 않고 `/tokenize`, `/v1/chat/completions`에 연결한다. 공식 Qwen3-32B-AWQ와 vLLM의 설치 버전·모델 리비전은 `bootstrap.py`에 고정한다. 실제 측정·진행 상태는 [.agents/AI](../../.agents/AI/guide.md)를 따른다.

| 파일 | 책임 |
| --- | --- |
| bootstrap.py | 시스템 Python을 유지하고 전용 venv·가중치·설치 manifest·패키지 lock 준비 |
| serve.py | manifest의 고정 모델을127.0.0.1:8000에서 실행. 기본8192토큰·동시2개·토큰 배치256·eager 모드 |
| connect.ps1 | Windows에서 로컬127.0.0.1:18080로 숨김 SSH 터널 생성. 사용 중인 포트/프로세스는 중단하지 않음 |
| bootstrap-jev.py | 검토한 Meanblock/JEV-CPU 소스·기본0.6B 모델과 CPU 전용 의존성을 별도 venv에 고정 |
| jev_server.py | 원본 direct_score를 사용하고5개 선택 확률을 기존 persona-opinion-v1 계약으로 변환 |

현재 서버의 실행 경로는 `/opt/gratta-ai`, 영구 캐시는 `/mnt/jev_ae63e/gratta-ai`다. 후자는 학교 컨테이너에 실제 마운트된 볼륨이며 다른 서버에서 경로를 추측해 사용하지 않는다. bootstrap/serve 파일을 원격 실행 경로에 복사한 뒤 실행한다.

```bash
python3 /opt/gratta-ai/bootstrap.py --runtime-dir /opt/gratta-ai --state-dir /mnt/jev_ae63e/gratta-ai
python3 /opt/gratta-ai/serve.py --state-dir /mnt/jev_ae63e/gratta-ai
```

설치 상태는 영구 캐시의 `bootstrap-status.json`, 모델/리비전/실제 패키지 버전은 `manifest.json`, 의존성 전체는 `requirements.lock.txt`다. 컨테이너를 새로 만들면 `/opt`의 venv는 재설치가 필요할 수 있지만 볼륨의 가중치는 재사용한다. GPU 서버 운영체제의 재부팅 자동 실행은 별도로 구성하지 않는다.

원격 서버를 백그라운드에서 유지할 때 기존 세션·8000포트를 확인하고 `tmux`의 전용 `gratta-qwen` 세션을 사용한다. 요청 본문 로깅은 켜지 않는다. 추론 포트는 서버 loopback만 듣는다.

```powershell
./scripts/school-ai/connect.ps1 -Server 203.252.159.18 -SshPort 51201 -IdentityFile "$env:USERPROFILE/.ssh/jev-test.pem"
```

처음 접속하는 호스트의 키는 일반 SSH 접속 단계에서 먼저 확인한다. 터널 PID와 대상은 Git 제외 `.tmp/school-ai-tunnel-포트.json`, 로그는 같은 이름의 `.err.log`에 기록한다. 최초 GPU 터널의 이전 메타데이터는 `.tmp/school-ai-tunnel-v2.json`에도 남아 있다. 중단이 필요하면 PID가 같은 대상의 본 프로젝트 SSH 명령인지 확인한 뒤 그 프로세스만 종료한다. 비밀 키 본문·학교 서버 인증 키를 저장소에 넣지 않는다.

호스트 NestJS의 기본 주소는 `http://127.0.0.1:18080/v1`, Docker는 `http://host.docker.internal:18080/v1`이다. 필요한 경우 기존 `SCHOOL_AI_BASE_URL`을 이 주소로 설정하고 백엔드를 재시작한다. 모델 ID는 `Qwen/Qwen3-32B-AWQ`다.

JEV-CPU는 독립 CPU venv의 float32 Qwen3-0.6B로 실행한다. 검토한 소스/의존성/모델 리비전은 bootstrap-jev.py에 고정했고 GPU torch와 혼용하지 않는다. 다음 명령은 전용tmux gratta-jev 세션에서 실행할 수 있다.

```bash
python3 /opt/gratta-ai/bootstrap-jev.py --runtime-dir /opt/gratta-ai --state-dir /mnt/jev_ae63e/gratta-ai
/opt/gratta-ai/jev-venv/bin/python /opt/gratta-ai/jev_server.py --state-dir /mnt/jev_ae63e/gratta-ai
```

```powershell
./scripts/school-ai/connect.ps1 -Server 203.252.159.18 -SshPort 51201 -IdentityFile "$env:USERPROFILE/.ssh/jev-test.pem" -LocalPort 18081 -RemotePort 8001
```

JEV_OPINIONS_URL은 호스트에서 `http://127.0.0.1:18081/v1/persona-opinion`, Docker에서 `http://host.docker.internal:18081/v1/persona-opinion`이다. CPU만 사용하고 기존8080 서비스는 건드리지 않는다. /health는 로딩 완료 후200을 반환한다. 기본4096토큰을 넘으면 잘라서 판정하지 않고400을 반환한다. 요청 대기열8개·모델 판정은1개씩 처리한다.

JEV는 선택지 라벨과 그 조건부 확률만 반환한다. 짧은 이유 문장을 생성하지 않는다. 선택 좌표는-1/-0.5/0/0.5/1이며 confidence는 승리 선택지 확률이다. 이 값이 정확도라는 의미는 아니다. JEV가 없으면 최대20명의 상세 응답 실험만 진행하며21명 이상에는 JEV 연결이 필요하다.

실제 DB에서 추출한 합성 페르소나1~20명의 배열 JSON을 Git 제외 경로에 준비한 뒤 다음으로 실험한다. 사용자 대화 원문·Auth를 파일에 넣지 않는다. 아래 fixture는 서비스 사용자 정보가 아닌 합성 페르소나이며 API 형식은 기존 `Persona`다.

```powershell
pnpm --filter @gratta/backend build
pnpm --filter @gratta/backend check:persona-pipeline ../../.tmp/gpu-ai/personas.json ../../.tmp/gpu-ai/report.json
node apps/backend/scripts/check-jev-cpu.cjs .tmp/gpu-ai/personas.json .tmp/gpu-ai/report.json .tmp/gpu-ai/jev-report.json
pnpm --filter @gratta/backend check:persona-pipeline ../../.tmp/gpu-ai/personas-200.json ../../.tmp/gpu-ai/summary-200-report.json --with-jev
```

실험 스크립트는 실제 운영 서비스·실제 Qwen을 사용하며 작업 저장만 메모리로 대체한다. 학교 서버에 보내는 대화는 코드에 고정된 합성 대화다. 문서 검토 대기·버전 저장·명시적 실행·상세 응답·필터 재집계를 확인하고 소요 시간·토큰 수·종료 사유·스키마 검증 결과를 기록한다. 최대200명(상세20+JEV180)이며 원문을 제외한 요약 입력도 검사한다. 실제 학교 JEV 검증은 --with-jev 실행에 포함하지만 DB 영구 저장/실제 로그인 검증과는 구분한다.

공식 근거: [모델·라이선스](https://huggingface.co/Qwen/Qwen3-32B-AWQ), [vLLM GPU 설치](https://docs.vllm.ai/en/stable/getting_started/installation/gpu/), [JEV-CPU](https://huggingface.co/Meanblock/JEV-CPU). 로더·direct/core의 검토한 고정 소스를 외부 캐시에 내려받아 호출하며 원본 LICENSE/THIRD_PARTY를 함께 보존한다.
