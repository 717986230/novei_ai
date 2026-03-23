[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$statePath = Join-Path $root '.runtime\project-state.json'

function Stop-PortProcess {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $connection) {
    return $false
  }

  try {
    Stop-Process -Id $connection.OwningProcess -Force -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Stop-ManagedProcess {
  param($ServiceState)

  if (-not $ServiceState) {
    return
  }

  switch ($ServiceState.mode) {
    'managed' {
      if ($ServiceState.pid) {
        try {
          Stop-Process -Id $ServiceState.pid -Force -ErrorAction Stop
        } catch {
        }
      }
    }
    'direct' {
      if ($ServiceState.pid) {
        try {
          Stop-Process -Id $ServiceState.pid -Force -ErrorAction Stop
        } catch {
        }
      }
    }
    'service' {
      if ($ServiceState.serviceName) {
        try {
          Stop-Service -Name $ServiceState.serviceName -ErrorAction Stop
        } catch {
        }
      }
    }
  }
}

$state = $null
if (Test-Path $statePath) {
  $state = Get-Content $statePath -Raw | ConvertFrom-Json
}

if ($state) {
  Stop-ManagedProcess -ServiceState $state.services.frontend
  Stop-ManagedProcess -ServiceState $state.services.backend
  Stop-ManagedProcess -ServiceState $state.services.mysql
  Remove-Item $statePath -Force -ErrorAction SilentlyContinue
} else {
  Stop-PortProcess -Port 5173 | Out-Null
  Stop-PortProcess -Port 8080 | Out-Null
}

Write-Host ''
Write-Host 'Stop completed.'
Write-Host 'Frontend and backend were stopped. MySQL is only stopped when this script started it.'
