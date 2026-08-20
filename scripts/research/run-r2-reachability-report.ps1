[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(0, 800000)]
  [long]$MonthlyClassAUsed,
  [Parameter(Mandatory = $true)]
  [ValidateRange(0, 8000000)]
  [long]$MonthlyClassBUsed,
  [Parameter(Mandatory = $true)]
  [string]$DashboardObservedAt
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$pinnedNode = "C:\Code\tools\node-v22.23.2-win-x64\node.exe"
$nodeExecutable = if (Test-Path -LiteralPath $pinnedNode) {
  $pinnedNode
} else {
  (Get-Command node -ErrorAction Stop).Source
}

$parsedDashboardObservedAt = [DateTimeOffset]::MinValue
if (-not [DateTimeOffset]::TryParse($DashboardObservedAt, [ref]$parsedDashboardObservedAt)) {
  throw "DashboardObservedAt must be an ISO date-time."
}
$credentialPath = Join-Path $env:LOCALAPPDATA "ProjectIsitusa\credentials\r2-publisher.clixml"
if (-not (Test-Path -LiteralPath $credentialPath)) {
  throw "The user-scoped DPAPI R2 publisher credential is not installed."
}
$credential = Import-Clixml -LiteralPath $credentialPath
if ($credential -isnot [System.Management.Automation.PSCredential]) {
  throw "The R2 publisher credential file is invalid."
}

$env:R2_ACCOUNT_ID = "0fe57401a5fd98319e16832ee97de02d"
$env:R2_BUCKET = "project-isitusa-research"
$env:R2_ACCESS_KEY_ID = $credential.UserName
$env:R2_SECRET_ACCESS_KEY = $credential.GetNetworkCredential().Password
Push-Location -LiteralPath $repoRoot
try {
  & $nodeExecutable --import tsx scripts/report-r2-reachability.ts `
    --monthly-class-a-used $MonthlyClassAUsed.ToString() `
    --monthly-class-b-used $MonthlyClassBUsed.ToString() `
    --dashboard-observed-at $DashboardObservedAt
  if ($LASTEXITCODE -ne 0) { throw "R2 reachability report failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
  Remove-Item Env:R2_ACCOUNT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:R2_BUCKET -ErrorAction SilentlyContinue
  Remove-Item Env:R2_ACCESS_KEY_ID -ErrorAction SilentlyContinue
  Remove-Item Env:R2_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
}
