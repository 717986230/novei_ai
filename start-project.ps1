[CmdletBinding()]
param(
  [switch]$ForceRestart
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $root '.runtime'
$logsDir = Join-Path $runtimeDir 'logs'
$statePath = Join-Path $runtimeDir 'project-state.json'

$frontendDir = Join-Path $root 'frontend'
$backendDir = Join-Path $root 'backend-java'

$frontendStdout = Join-Path $logsDir 'frontend.stdout.log'
$frontendStderr = Join-Path $logsDir 'frontend.stderr.log'
$backendStdout = Join-Path $logsDir 'backend.stdout.log'
$backendStderr = Join-Path $logsDir 'backend.stderr.log'
$mysqlStdout = Join-Path $logsDir 'mysql.stdout.log'
$mysqlStderr = Join-Path $logsDir 'mysql.stderr.log'

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Get-ListeningProcessId {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if ($connection) {
    return [int]$connection.OwningProcess
  }

  return $null
}

function Wait-ForPort {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $processId = Get-ListeningProcessId -Port $Port
    if ($processId) {
      return $processId
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  throw "Port $Port did not start within $TimeoutSeconds seconds."
}

function Wait-ForHttpOk {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $response.StatusCode
      }
    } catch {
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  throw "Endpoint $Url did not respond within $TimeoutSeconds seconds."
}

function Get-MySqlServiceConfig {
  $services = @('MySQL57', 'MySQL80', 'MySQL', 'MariaDB')

  foreach ($serviceName in $services) {
    $output = sc.exe qc $serviceName 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $output) {
      continue
    }

    $line = $output | Where-Object { $_ -match 'BINARY_PATH_NAME' } | Select-Object -First 1
    if (-not $line) {
      continue
    }

    $match = [regex]::Match($line, 'BINARY_PATH_NAME\s+:\s+"(?<exe>[^"]+)"\s+--defaults-file="(?<ini>[^"]+)"')
    if ($match.Success) {
      return [pscustomobject]@{
        ServiceName  = $serviceName
        Executable   = $match.Groups['exe'].Value
        DefaultsFile = $match.Groups['ini'].Value
      }
    }
  }

  return $null
}

function Start-MySqlIfNeeded {
  $existingPid = Get-ListeningProcessId -Port 3306
  if ($existingPid) {
    return [pscustomobject]@{
      pid    = $existingPid
      mode   = 'existing'
      target = 3306
    }
  }

  $serviceConfig = Get-MySqlServiceConfig
  if (-not $serviceConfig) {
    throw 'No usable MySQL service configuration was found.'
  }

  try {
    Start-Service -Name $serviceConfig.ServiceName -ErrorAction Stop
    $servicePid = Wait-ForPort -Port 3306 -TimeoutSeconds 20
    return [pscustomobject]@{
      pid         = $servicePid
      mode        = 'service'
      serviceName = $serviceConfig.ServiceName
      target      = 3306
    }
  } catch {
  }

  $mysqlProcess = Start-Process -FilePath $serviceConfig.Executable `
    -ArgumentList "--defaults-file=$($serviceConfig.DefaultsFile)", '--console' `
    -WorkingDirectory (Split-Path -Parent $serviceConfig.Executable) `
    -RedirectStandardOutput $mysqlStdout `
    -RedirectStandardError $mysqlStderr `
    -PassThru

  $mysqlPid = Wait-ForPort -Port 3306 -TimeoutSeconds 20
  return [pscustomobject]@{
    pid          = $mysqlPid
    launchedPid  = $mysqlProcess.Id
    mode         = 'direct'
    serviceName  = $serviceConfig.ServiceName
    executable   = $serviceConfig.Executable
    defaultsFile = $serviceConfig.DefaultsFile
    target       = 3306
  }
}

function Start-OrReuseProcess {
  param(
    [int]$Port,
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory,
    [string]$StdoutPath,
    [string]$StderrPath,
    [string]$HealthUrl
  )

  $existingPid = Get-ListeningProcessId -Port $Port
  if ($existingPid) {
    if ($ForceRestart) {
      Stop-Process -Id $existingPid -Force
      Start-Sleep -Seconds 1
    } else {
      if ($HealthUrl) {
        Wait-ForHttpOk -Url $HealthUrl -TimeoutSeconds 10 | Out-Null
      }
      return [pscustomobject]@{
        pid    = $existingPid
        mode   = 'existing'
        target = $Port
      }
    }
  }

  $process = Start-Process -FilePath $FilePath `
    -ArgumentList $ArgumentList `
    -WorkingDirectory $WorkingDirectory `
    -RedirectStandardOutput $StdoutPath `
    -RedirectStandardError $StderrPath `
    -PassThru

  $listeningPid = Wait-ForPort -Port $Port -TimeoutSeconds 30
  if ($HealthUrl) {
    Wait-ForHttpOk -Url $HealthUrl -TimeoutSeconds 30 | Out-Null
  }

  return [pscustomobject]@{
    pid         = $listeningPid
    launchedPid = $process.Id
    mode        = 'managed'
    target      = $Port
  }
}

$mysql = Start-MySqlIfNeeded
$backend = Start-OrReuseProcess `
  -Port 8080 `
  -FilePath 'mvn.cmd' `
  -ArgumentList @('spring-boot:run') `
  -WorkingDirectory $backendDir `
  -StdoutPath $backendStdout `
  -StderrPath $backendStderr `
  -HealthUrl 'http://localhost:8080/api/health'

$frontend = Start-OrReuseProcess `
  -Port 5173 `
  -FilePath 'npm.cmd' `
  -ArgumentList @('run', 'dev', '--', '--host', '0.0.0.0') `
  -WorkingDirectory $frontendDir `
  -StdoutPath $frontendStdout `
  -StderrPath $frontendStderr `
  -HealthUrl 'http://localhost:5173'

$state = [pscustomobject]@{
  updatedAt = (Get-Date).ToString('o')
  root      = $root
  services  = [pscustomobject]@{
    mysql    = $mysql
    backend  = $backend
    frontend = $frontend
  }
}

$state | ConvertTo-Json -Depth 6 | Set-Content -Path $statePath -Encoding UTF8

Write-Host ''
Write-Host 'Project is ready.'
Write-Host "  Frontend: http://localhost:5173  (PID: $($frontend.pid), mode: $($frontend.mode))"
Write-Host "  Backend : http://localhost:8080  (PID: $($backend.pid), mode: $($backend.mode))"
Write-Host "  MySQL   : 127.0.0.1:3306         (PID: $($mysql.pid), mode: $($mysql.mode))"
Write-Host ''
Write-Host "State file: $statePath"
