[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$statePath = Join-Path $root '.runtime\project-state.json'

function Get-ServiceStatus {
  param(
    [string]$Name,
    [int]$Port,
    [string]$Url
  )

  $processId = $null
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if ($connection) {
    $processId = [int]$connection.OwningProcess
  }

  $httpStatus = $null
  if ($Url) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      $httpStatus = $response.StatusCode
    } catch {
      $httpStatus = 'unreachable'
    }
  }

  [pscustomobject]@{
    name       = $Name
    port       = $Port
    pid        = $processId
    listening  = [bool]$processId
    httpStatus = $httpStatus
  }
}

$services = @(
  (Get-ServiceStatus -Name 'frontend' -Port 5173 -Url 'http://localhost:5173'),
  (Get-ServiceStatus -Name 'backend' -Port 8080 -Url 'http://localhost:8080/api/health'),
  (Get-ServiceStatus -Name 'mysql' -Port 3306 -Url $null)
)

if (Test-Path $statePath) {
  Write-Host "State file: $statePath"
  Write-Host ''
}

$services | Format-Table -AutoSize name, port, pid, listening, httpStatus
