param(
    [ValidateSet("start", "stop")]
    [string]$Action = "start"
)

$ErrorActionPreference = "Stop"
$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ComposeFile = Join-Path $RootDir "docker-compose.desktop.yml"
$PortFile = Join-Path $RootDir "data\.desktop-port"
$ProjectName = "infinite-canvas-desktop"
Set-Location $RootDir

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & docker compose -p $ProjectName -f $ComposeFile @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose 执行失败。"
    }
}

function Test-DockerReady {
    & docker info *> $null
    return $LASTEXITCODE -eq 0
}

function Install-DockerDesktop {
    Write-Host "未检测到 Docker Desktop。" -ForegroundColor Yellow
    $answer = Read-Host "是否自动安装或打开安装页面？[Y/n]"
    if ($answer -match '^[nN]$') {
        Start-Process "https://docs.docker.com/desktop/setup/install/windows-install/"
        return
    }
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "正在调用 Windows 软件安装工具……"
        & winget install --exact --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -eq 0) {
            Write-Host "安装完成。请启动 Docker Desktop，然后再次双击启动入口。" -ForegroundColor Green
            return
        }
    }
    Start-Process "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
    Write-Host "已打开 Docker Desktop 安装包。安装并启动后，请再次双击启动入口。"
}

function Wait-DockerReady {
    if (Test-DockerReady) { return $true }
    $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerDesktop) {
        Write-Host "正在启动 Docker Desktop……"
        Start-Process $dockerDesktop
    }
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        Start-Sleep -Seconds 2
        if (Test-DockerReady) { return $true }
    }
    return $false
}

function Get-RunningPort {
    $services = @(& docker compose -p $ProjectName -f $ComposeFile ps --status running --services 2>$null)
    if ($services -notcontains "app") { return $null }
    $published = (& docker compose -p $ProjectName -f $ComposeFile port app 3000 2>$null | Select-Object -First 1)
    if ($published -match ':(\d+)$') { return [int]$Matches[1] }
    return $null
}

function Test-PortFree([int]$Port) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try {
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        $listener.Stop()
    }
}

function Get-AvailablePort {
    if (Test-Path $PortFile) {
        $saved = (Get-Content $PortFile -Raw).Trim()
        if ($saved -match '^\d+$' -and (Test-PortFree ([int]$saved))) { return [int]$saved }
    }
    foreach ($port in 3001..3099) {
        if (Test-PortFree $port) { return $port }
    }
    throw "3001 到 3099 之间没有可用端口。"
}

function Wait-Web([int]$Port) {
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri "http://127.0.0.1:$Port/"
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
        }
        catch {}
        Start-Sleep -Seconds 2
    }
    return $false
}

function Start-Services([int]$Port) {
    $env:INFINITE_CANVAS_PORT = "$Port"
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Invoke-Compose up -d --build
            return
        }
        catch {
            if ($attempt -eq 3) { throw "启动失败。请检查网络和 Docker Desktop，稍后再次双击启动入口。" }
            Write-Host "Docker 下载或构建失败，正在自动重试（$attempt/3）……" -ForegroundColor Yellow
            Start-Sleep -Seconds 5
        }
    }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    if ($Action -eq "stop") {
        Write-Host "无限画布没有运行。"
        exit 0
    }
    Install-DockerDesktop
    exit 1
}

if ($Action -eq "stop") {
    if (Test-DockerReady) { Invoke-Compose stop | Out-Null }
    Write-Host "无限画布已经停止，数据不会被删除。" -ForegroundColor Green
    exit 0
}

if (-not (Wait-DockerReady)) {
    throw "Docker Desktop 尚未准备好，请确认它已经启动后重试。"
}

$port = Get-RunningPort
if ($null -ne $port) {
    Write-Host "无限画布已经在运行，正在打开网页……"
    Start-Process "http://127.0.0.1:$port/"
    exit 0
}

$port = Get-AvailablePort
New-Item -ItemType Directory -Force (Join-Path $RootDir "data") | Out-Null
Set-Content -Encoding ASCII -Path $PortFile -Value $port
if (-not (Test-Path (Join-Path $RootDir ".env"))) {
    Copy-Item (Join-Path $RootDir ".env.example") (Join-Path $RootDir ".env")
}

Write-Host "正在启动无限画布。首次构建可能需要几分钟……"
Start-Services $port

if (-not (Wait-Web $port)) {
    Invoke-Compose logs --tail 80
    throw "服务启动超时，请把当前窗口内容发给维护人员。"
}

Write-Host "启动成功：http://127.0.0.1:$port/" -ForegroundColor Green
Start-Process "http://127.0.0.1:$port/"
