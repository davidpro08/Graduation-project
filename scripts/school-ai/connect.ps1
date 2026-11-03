param(
  [Parameter(Mandatory = $true)][string]$Server,
  [Parameter(Mandatory = $true)][string]$IdentityFile,
  [int]$SshPort = 22,
  [int]$LocalPort = 18080,
  [int]$RemotePort = 8000
)
$ErrorActionPreference = 'Stop'
$keyPath = (Resolve-Path -LiteralPath $IdentityFile).Path
if (Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue) {
  throw "로컬 $LocalPort 포트가 이미 사용 중입니다. 기존 프로세스는 중단하지 않았습니다."
}
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$stateRoot = Join-Path $taskRoot '.tmp'
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
$errorLog = Join-Path $stateRoot "school-ai-tunnel-$LocalPort.err.log"
$sshArgs = @('-i', ('"' + $keyPath + '"'), '-p', "$SshPort", '-N', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
  '-o', 'IdentitiesOnly=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3',
  '-L', "127.0.0.1:${LocalPort}:127.0.0.1:${RemotePort}", "root@$Server")
$tunnel = Start-Process -FilePath 'ssh' -ArgumentList $sshArgs -WindowStyle Hidden -RedirectStandardError $errorLog -PassThru
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  if ($tunnel.HasExited) { throw "SSH 터널 시작 실패. $errorLog 로그를 확인하세요." }
  if (Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq $tunnel.Id) {
    $state = @{ pid = $tunnel.Id; server = $Server; sshPort = $SshPort; localPort = $LocalPort; remotePort = $RemotePort }
    $state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateRoot "school-ai-tunnel-$LocalPort.json") -Encoding utf8
    Write-Output "SSH tunnel ready: http://127.0.0.1:$LocalPort/v1 (PID $($tunnel.Id))"
    exit 0
  }
  Start-Sleep -Milliseconds 250
}
throw 'SSH 터널 확인 시간이 초과됐습니다. PID와 로그를 확인하세요.'
