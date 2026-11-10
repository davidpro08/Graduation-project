# 새 인스턴스에서 Qwen·JEV-CPU 준비

프로젝트 루트 `Graduation-project`를 기준으로 **로컬 Windows PowerShell → 원격 Ubuntu Bash → 로컬 연결** 순서로 진행한다. 새 인스턴스의 주소·SSH 포트·영구 볼륨 경로만 실제 할당값으로 바꾸고, 저장소의 설치·실행 스크립트를 사용한다.

2026-11-02 RTX4090에서 실제 성공한 구성에 기반한 절차다. 이 문서 작성 때 새 인스턴스를 생성하거나 재설치하지는 않았다. 현재200명·과거500명 실험은 [측정 기록](gpu-experiments.md), API 규격은 [논쟁 계약](persona-debates.md)을 참조한다.

## 1. 어떤 단계가 필요한가

| 상황 | 필요한 작업 |
| --- | --- |
| 완전히 새 인스턴스 | 아래2~8단계 전체 |
| 새 인스턴스에 기존 영구 볼륨 재연결 | 스크립트 전송·bootstrap2개 재실행. 캐시된 모델은 재사용하고 새 venv/절대경로 manifest를 준비 |
| 같은 인스턴스에서 모델 프로세스만 종료 | 원격 경로 변수 재설정 후5단계 기동·검증 |
| PC 재부팅·SSH 터널 종료 | 원격 서버가 살아 있는지 확인한 뒤6단계 터널 재연결 |
| 서버 주소·SSH 포트 변경 | 새 주소로 접속·검증하고, 의도적으로 전환할 때만 기존 프로젝트 터널을 종료한 뒤 재연결 |

현재 스크립트는 root SSH 계정을 사용한다. 자동 부팅 서비스는 구성하지 않았으며 `tmux`는 SSH 연결이 끊겨도 프로세스를 유지하는 용도다.

## 2. 로컬에서 접속 정보 지정·파일 전송

**로컬 PowerShell**, 프로젝트 루트에서 실행한다. 아래 IP는 문서용 예약 주소이며, SSH 포트·키 파일명도 실제 접속 정보가 아닌 예시다. 새 인스턴스의 실제 주소·포트와 로컬 키 파일 경로로 먼저 교체한다.

```powershell
$GpuServer = '192.0.2.10'
$GpuSshPort = 2222
$GpuKey = (Resolve-Path "$env:USERPROFILE/.ssh/example-key.pem").Path

if (-not (Test-Path './scripts/school-ai/bootstrap.py')) {
  throw 'Graduation-project 루트에서 실행하세요.'
}

ssh -i "$GpuKey" -p $GpuSshPort -o IdentitiesOnly=yes "root@$GpuServer"
```

첫 접속에서 새 호스트 지문을 확인한다. 접속이 되면 `exit`로 로컬 PowerShell에 돌아온다. 같은 주소·포트를 새 인스턴스가 재사용해 호스트 키 불일치가 발생한 경우에는 새 인스턴스가 맞는지 먼저 확인한 뒤 해당 항목만 갱신한다. 키 검사 전체를 끄지 않는다.

```powershell
# 정상적인 인스턴스 교체로 지문이 바뀐 것이 확인된 경우에만 실행
ssh-keygen -R "[$GpuServer]:$GpuSshPort"
ssh -i "$GpuKey" -p $GpuSshPort -o IdentitiesOnly=yes "root@$GpuServer"
```

호스트 키 확인 후 로컬에서 실행 파일4개를 전송한다. 개인 키와 `.env`는 GPU 서버에 복사하지 않는다.

```powershell
ssh -i "$GpuKey" -p $GpuSshPort -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes "root@$GpuServer" 'mkdir -p /opt/gratta-ai'

$GpuFiles = @(
  './scripts/school-ai/bootstrap.py'
  './scripts/school-ai/serve.py'
  './scripts/school-ai/bootstrap-jev.py'
  './scripts/school-ai/jev_server.py'
)
scp -i "$GpuKey" -P $GpuSshPort -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes @GpuFiles "root@${GpuServer}:/opt/gratta-ai/"

ssh -i "$GpuKey" -p $GpuSshPort -o IdentitiesOnly=yes "root@$GpuServer"
```

## 3. 원격 환경·영구 볼륨 확인

여기부터5단계까지는 **원격 Ubuntu Bash**다.

```bash
nvidia-smi
python3 --version
python3 -m pip --version
command -v tmux
command -v curl
df -h
findmnt -rn -t nfs,nfs4 -o TARGET,SOURCE
```

| 확인 항목 | 검증한 기준·판단 |
| --- | --- |
| GPU |RTX4090 24564MiB. 다른 추론 프로세스가 GPU를 사용하는지 확인 |
| OS/Python |Ubuntu24.04.4 / Python3.12.3에서 검증 |
| 드라이버 |595.80에서 검증. `nvidia-smi`가 실패하면 모델 설치 전에 GPU 할당·드라이버 전달 상태 확인 |
| 디스크 |검증 인스턴스의 루트98GB·영구 볼륨100GB 사용. 종료 후 관측 사용량은 각각8.9GB·20GB. 다운로드/설치 중 여유도 필요하며 최소 용량을 검증한 것은 아님 |
| 메모리 |검증 컨테이너 제한124GiB. 더 작은 메모리 구성의 최소 조건은 미검증 |
| 영구 볼륨 |`/mnt/example-volume`은 경로 예시. 새 인스턴스에서는 실제 마운트 지점을 확인 |

pip/tmux/curl이 없는 Ubuntu에서만 필요한 패키지를 설치한다. root 기준이다.

```bash
apt-get update
apt-get install -y python3-pip python3-venv tmux curl ca-certificates
```

다음 블록에서 실제 영구 볼륨 경로를 입력한다. NFS가 아닌 볼륨이면 위 `df -h`와 `findmnt`로 해당 마운트도 확인한다. 에이전트가 비대화형으로 실행할 때는 `read` 대신 확인한 경로를 `GRATTA_VOLUME`에 직접 대입한다.

```bash
set -euo pipefail
read -r -p '확인한 영구 볼륨 마운트 경로: ' GRATTA_VOLUME
mountpoint -q "$GRATTA_VOLUME"
export GRATTA_RUNTIME=/opt/gratta-ai
export GRATTA_STATE="$GRATTA_VOLUME/gratta-ai"
mkdir -p "$GRATTA_RUNTIME" "$GRATTA_STATE"
printf 'runtime=%s\nstate=%s\n' "$GRATTA_RUNTIME" "$GRATTA_STATE"
```

영구 볼륨이 없다면 위 `read` 블록 대신 다음 블록을 사용한다. 이 캐시는 임시이며 인스턴스 삭제 시 다시 다운로드해야 한다. 두 bootstrap은 대상 경로의 마지막 이름이 `gratta-ai`인지 검사한다.

```bash
set -euo pipefail
export GRATTA_RUNTIME=/opt/gratta-ai
export GRATTA_STATE=/opt/gratta-ai/cache/gratta-ai
mkdir -p "$GRATTA_RUNTIME" "$GRATTA_STATE"
```

새 SSH 세션에서는 위 변수들이 사라질 수 있으므로 원격 명령 실행 전에 실제 값으로 다시 `export`한다. 다른 마운트 경로에 남은 옛 manifest만 믿고 바로 기동하지 않는다.

## 4. Qwen → JEV-CPU 순서로 준비

**Qwen bootstrap이 먼저 완료돼야 한다.** JEV bootstrap은 Qwen 설치 단계에서 준비한 uv와 Hugging Face 다운로드 환경을 사용한다.

```bash
set -euo pipefail
python3 "$GRATTA_RUNTIME/bootstrap.py" \
  --runtime-dir "$GRATTA_RUNTIME" --state-dir "$GRATTA_STATE" \
  2>&1 | tee "$GRATTA_RUNTIME/bootstrap.log"

cat "$GRATTA_STATE/bootstrap-status.json"
cat "$GRATTA_STATE/manifest.json"
```

명령이0으로 종료되고 상태가 `ready`인지 확인한 뒤 진행한다. `failed`이면 로그의 원인을 해결한다. 다운로드 중에는 아직 모델 서버가 실행된 상태가 아니다.

```bash
python3 "$GRATTA_RUNTIME/bootstrap-jev.py" \
  --runtime-dir "$GRATTA_RUNTIME" --state-dir "$GRATTA_STATE" \
  2>&1 | tee "$GRATTA_RUNTIME/bootstrap-jev.log"

cat "$GRATTA_STATE/jev-bootstrap-status.json"
cat "$GRATTA_STATE/jev-manifest.json"
```

JEV도 `ready`여야 한다. manifest의 `device`가 `cpu`, `versions.cuda`가 `null`인지 확인한다.

| 항목 | 준비되는 파일·환경 |
| --- | --- |
| GPU venv |`$GRATTA_RUNTIME/.venv`, vLLM0.32.0·uv0.13.6 |
| GPU 모델 |Qwen/Qwen3-32B-AWQ, 리비전 `0499c3ac83fdef8810b907a23894ba91e95eddd8` |
| CPU venv |`$GRATTA_RUNTIME/jev-venv`, 별도의 CPU torch·상위 프로젝트의 고정 requirements |
| CPU 엔진 |Meanblock/JEV-CPU, 리비전 `759fa60603a0e312cda38824e63e58f18445c14a` |
| CPU 모델 |Qwen/Qwen3-0.6B, 리비전 `c1899de289a04d12100db370d81485cdf75e47ca` |
| 캐시 |`$GRATTA_STATE/huggingface`, 새 인스턴스에서도 같은 볼륨이면 재사용 |
| 재현 기록 |manifest.json / jev-manifest.json / requirements.lock.txt / jev-requirements.lock.txt |

GPU bootstrap은 vLLM·uv·모델 리비전을 고정하지만 Torch와 모든 간접 의존성을 완전히 고정한 설치는 아니다. `--torch-backend=auto`로 드라이버에 맞춰 설치하므로 실제 버전을 새 manifest/lock에서 확인한다. 이전 성공 버전은 GPU torch2.13.0+cu132, JEV torch2.10.0+cpu·transformers5.17.0이다. 시스템 Python의 패키지를 바꾸거나 GPU/CPU venv를 합치지 않는다.

## 5. 두 서버 기동·원격 검증

먼저 동일한 세션이나 포트가 이미 사용 중인지 확인한다. `tmux` 세션이 없다는 출력은 최초 실행에서 정상이다. 기존 프로세스가 있다면 정체를 확인하고 새 서버를 중복 실행하지 않는다.

```bash
tmux list-sessions || true
ss -lnt | grep -E ':(8000|8001)[[:space:]]' || true
```

확인한 경로를 안전하게 인용한 명령으로 전용 세션을 만든다.

```bash
printf -v qwen_cmd 'exec python3 %q --state-dir %q > %q 2>&1' \
  "$GRATTA_RUNTIME/serve.py" "$GRATTA_STATE" "$GRATTA_RUNTIME/qwen.log"
tmux new-session -d -s gratta-qwen "$qwen_cmd"

printf -v jev_cmd 'exec %q %q --state-dir %q > %q 2>&1' \
  "$GRATTA_RUNTIME/jev-venv/bin/python" "$GRATTA_RUNTIME/jev_server.py" \
  "$GRATTA_STATE" "$GRATTA_RUNTIME/jev-server.log"
tmux new-session -d -s gratta-jev "$jev_cmd"
```

초기 모델 로딩이 끝날 때까지 로그를 확인한다. `tail -f`는 Ctrl+C로 관찰만 종료하며 tmux의 모델 서버는 계속 실행된다.

```bash
tail -n 30 "$GRATTA_RUNTIME/qwen.log"
tail -n 20 "$GRATTA_RUNTIME/jev-server.log"
tmux list-sessions
nvidia-smi
curl -fsS --max-time 10 -o /dev/null -w 'Qwen health %{http_code}\n' http://127.0.0.1:8000/health
curl -fsS --max-time 10 http://127.0.0.1:8000/v1/models
curl -fsS --max-time 10 http://127.0.0.1:8001/health
```

| 확인 | 기대 결과 |
| --- | --- |
| Qwen health |HTTP200 |
| Qwen models |실제 모델 ID `Qwen/Qwen3-32B-AWQ` |
| JEV health |status=ok, device=cpu, maxTokens=4096 |
| 바인딩 |Qwen127.0.0.1:8000, JEV127.0.0.1:8001 |
| VRAM |이전 실행에서 약23119MiB 사용.8192컨텍스트·토큰 배치256·eager 설정 |

이 프로젝트의 JEV 실행 파일은 `jev_server.py`다. 원본 저장소의 `server.py`는8080 웹 UI와 다른 API이므로 본 백엔드용 실행 명령으로 대체해 쓰지 않는다.

### 실제 추론 최소 확인

아래는 합성 입력이다. 사용자 대화나 DB 키가 필요하지 않다. 모델 로딩 후 실행한다.

```bash
curl -fsS --max-time 90 http://127.0.0.1:8000/v1/chat/completions \
  -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{"model":"Qwen/Qwen3-32B-AWQ","messages":[{"role":"user","content":"준비 완료라고 한국어로 짧게 답하세요."}],"max_tokens":32,"temperature":0,"chat_template_kwargs":{"enable_thinking":false}}
JSON

curl -fsS --max-time 90 http://127.0.0.1:8001/v1/persona-opinion \
  -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{"version":"persona-opinion-v1","topic":{"question":"불가피한 지각의 벌금을 면제할까요?","proposition":"불가피한 사정이 확인된 지각은 벌금을 면제해야 한다.","context":"합성 연결 확인","evidenceMessageIds":[]},"persona":{"id":"00000000000000000000000000000001","persona":"이 합성 인물은 불가피한 사정이 증명된 지각의 벌금 면제를 강하게 지지한다."}}
JSON
```

Qwen은 `finish_reason=stop`과 내용이 있는 응답을 확인한다. JEV는 요청한 personaId·scoreKind=`conditional_option_probability`·합이1인5개 optionProbabilities·metadata.device=`cpu`를 확인한다. 이 판정은 선택지 조건부 확률이며 정확도나 실제 여론조사 결과가 아니다.

## 6. 로컬 SSH 터널 연결

**로컬 PowerShell**, 프로젝트 루트로 돌아온다.2단계에서 지정한 `$GpuServer`, `$GpuSshPort`, `$GpuKey`를 같은 세션에서 사용한다. 새 터미널이면 다시 지정한다.

```powershell
./scripts/school-ai/connect.ps1 -Server $GpuServer -SshPort $GpuSshPort -IdentityFile "$GpuKey"
./scripts/school-ai/connect.ps1 -Server $GpuServer -SshPort $GpuSshPort -IdentityFile "$GpuKey" -LocalPort 18081 -RemotePort 8001

(Invoke-WebRequest 'http://127.0.0.1:18080/health').StatusCode
Invoke-RestMethod 'http://127.0.0.1:18080/v1/models' | ConvertTo-Json -Depth 5
Invoke-RestMethod 'http://127.0.0.1:18081/health'
```

`connect.ps1`은 숨김 SSH 프로세스를 만들고 `.tmp/school-ai-tunnel-18080.json`, `school-ai-tunnel-18081.json`에 PID/대상을 기록한다. 로컬 포트가 사용 중이면 기존 프로세스를 종료하지 않고 실패한다.

### 옛 인스턴스 터널을 의도적으로 교체할 때

먼저 포트와 메타데이터를 확인한다. 다른 서비스나 정체를 확인하지 못한 프로세스를 종료하지 않는다.

```powershell
Get-NetTCPConnection -LocalPort 18080,18081 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
Get-Content '.tmp/school-ai-tunnel-18080.json'
Get-Content '.tmp/school-ai-tunnel-18081.json'
```

기존 프로젝트 터널을 닫고 새 인스턴스로 전환하기로 한 경우 아래는 PID뿐 아니라 실제 SSH 대상·전달 포트까지 일치하는 프로세스만 종료한다. 메타데이터가 없거나 일치하지 않으면 자동 종료하지 않으므로 직접 정체를 확인한다. 그 뒤 위 터널 연결 명령을 다시 실행한다.

```powershell
foreach ($TunnelPort in 18080,18081) {
  $TunnelRecord = ".tmp/school-ai-tunnel-$TunnelPort.json"
  if (-not (Test-Path -LiteralPath $TunnelRecord)) { continue }
  $TunnelState = Get-Content -Raw -LiteralPath $TunnelRecord | ConvertFrom-Json
  $TunnelProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($TunnelState.pid)"
  $ExpectedTarget = "root@$($TunnelState.server)"
  $ExpectedForward = "127.0.0.1:$($TunnelState.localPort):127.0.0.1:$($TunnelState.remotePort)"
  if ($TunnelProcess.Name -eq 'ssh.exe' -and
      $TunnelProcess.CommandLine.Contains($ExpectedTarget) -and
      $TunnelProcess.CommandLine.Contains($ExpectedForward)) {
    Stop-Process -Id $TunnelState.pid
  } else {
    Write-Output "$TunnelRecord 대상 불일치 또는 프로세스 없음: 종료하지 않음"
  }
}
```

## 7. 백엔드 설정·실행

로컬 프로젝트 루트 `.env`의 기존 Supabase 등 설정을 보존하고 아래 항목만 추가/수정한다.

```dotenv
SCHOOL_AI_BASE_URL=http://127.0.0.1:18080/v1
SCHOOL_AI_MODEL=Qwen/Qwen3-32B-AWQ
JEV_OPINIONS_URL=http://127.0.0.1:18081/v1/persona-opinion
```

| 백엔드 실행 위치 | Qwen 주소 | JEV 주소 |
| --- | --- | --- |
| Windows 호스트 |http://127.0.0.1:18080/v1 |http://127.0.0.1:18081/v1/persona-opinion |
| Docker Desktop 컨테이너 |http://host.docker.internal:18080/v1 |http://host.docker.internal:18081/v1/persona-opinion |

`.env` 변경은 실행 중인 백엔드에 자동 반영되지 않는다. 진행 중인 실제 분석을 확인한 뒤 재시작한다. 개발 서버가 꺼져 있다면 다음으로 프론트/백엔드를 함께 시작한다. Docker 경로는 주소 구분이며 이번 GPU 실험에서 컨테이너 전체 실행까지 재검증한 것은 아니다.

```powershell
pnpm dev
```

## 8. 연결 실험과 완료 기준

프로젝트 루트에서 실행한다. `.tmp/gpu-ai/personas.json`은 실제 DB에서 추출한 합성 Persona 배열, `personas-200.json`은 중복 없는200개 배열이어야 한다. `.tmp`는 Git 제외이므로 새 PC/새 체크아웃에서는 파일이 없을 수 있다. 없으면 소유권이 검증된 앱의 표본 API 등으로 합성 Persona 입력을 먼저 준비한다. 새 인스턴스 준비 자체에는 이 파일들이 필요하지 않다.

```powershell
pnpm --filter @gratta/backend build
pnpm --filter @gratta/backend check:persona-pipeline ../../.tmp/gpu-ai/personas.json ../../.tmp/gpu-ai/report.json
node apps/backend/scripts/check-jev-cpu.cjs .tmp/gpu-ai/personas.json .tmp/gpu-ai/report.json .tmp/gpu-ai/jev-report.json
node apps/backend/scripts/check-jev-controls.cjs .tmp/gpu-ai/personas.json .tmp/gpu-ai/report.json .tmp/gpu-ai/jev-controls.json
```

소규모 연결이 확인된 뒤 전체 부하를 실험할 때 실행한다. 현재200명(상세20+JEV180) 실행은 약7분이었다. 이전500명 실행17분15초는 변경 전 기록이며 새 인스턴스의 완료 시간을 보장하지 않는다.

```powershell
pnpm --filter @gratta/backend check:persona-pipeline ../../.tmp/gpu-ai/personas-200.json ../../.tmp/gpu-ai/summary-200-report.json --with-jev
```

| 준비 완료 기준 | 확인 |
| --- | --- |
| 설치 |두 bootstrap 정상 종료·각 status가ready·manifest/lock 생성 |
| 원격 서비스 |Qwen/JEV health200·Qwen 모델ID 일치·JEV device=cpu |
| 로컬 연결 |18080/18081을 통한 health/model 조회 성공 |
| 실제 추론 |Qwen 내용 있는 stop 응답·JEV 유효한5개 확률과 personaId |
| 앱 |백엔드가 새 환경 설정으로 실행됨 |
| 실험 |연결·스키마 성공과 의견 품질을 별도로 기록. 메모리 저장소 실험을 로그인/영구 DB 저장 검증으로 표시하지 않음 |

## 운영·문제 대응

| 증상 | 확인·조치 |
| --- | --- |
| publickey 거절 |새 인스턴스의 계정/포트/등록 공개 키와 로컬 개인 키 경로 확인 |
| 포트18080/18081 사용 중 |6단계에서 기록된 대상 확인. 다른 서비스는 유지하고 확인된 프로젝트 터널만 전환 |
| bootstrap 실패 |bootstrap.log·bootstrap-jev.log와status파일 확인. GPU bootstrap 완료 후 JEV 설치 |
| manifest는 있지만 실행 파일 없음 |새 컨테이너에서venv가 사라진 경우. 현재 경로로bootstrap2개 재실행 |
| Qwen VRAM 부족 |다른 GPU 사용 프로세스 확인·serve.py의 토큰 배치256/eager 기본값 확인. 필요하면 아래처럼 컨텍스트4096으로 재기동 후 재검증 |
| 세션은 있으나 health 실패 |모델 로딩 로그 확인. tmux 목록만으로 준비 완료로 판단하지 않음 |
| JEV400 |필수 입력·JSON 크기·4096토큰 제한 확인. 입력을 조용히 잘라 판정하지 않음 |
| JEV503 |프로세스·로그·대기열/과부하 확인. 현재CPU판정은1개씩, 대기열은8개 |
| 서버health는200인데 백엔드 실패 |터널 대상,host와Docker주소,환경 변수,백엔드 재시작 여부 확인 |

본 프로젝트 모델을 의도적으로 중단할 때만 원격에서 실행한다. 세션/포트가 종료된 것을 확인한 뒤5단계로 다시 시작한다.

```bash
tmux send-keys -t gratta-qwen C-c
tmux send-keys -t gratta-jev C-c
tmux list-sessions || true
ss -lnt | grep -E ':(8000|8001)[[:space:]]' || true
nvidia-smi
```

Qwen 컨텍스트를4096으로 낮춰 다시 시작하는 명령이다. Qwen의 이전 세션이 종료됐는지 먼저 확인한다.

```bash
printf -v qwen_cmd 'exec python3 %q --state-dir %q --max-model-len 4096 > %q 2>&1' \
  "$GRATTA_RUNTIME/serve.py" "$GRATTA_STATE" "$GRATTA_RUNTIME/qwen.log"
tmux new-session -d -s gratta-qwen "$qwen_cmd"
```

기동/중단·설치·실험 스크립트의 책임은 [scripts/school-ai](../../scripts/school-ai/README.md)에 정리했다. 모델/패키지 리비전을 바꿀 때는 설치 기록과 소규모 실험부터 갱신한다.

공식 참고: [vLLM GPU 설치](https://docs.vllm.ai/en/stable/getting_started/installation/gpu/), [Qwen3-32B-AWQ](https://huggingface.co/Qwen/Qwen3-32B-AWQ), [JEV-CPU](https://huggingface.co/Meanblock/JEV-CPU).
