[CmdletBinding()]
param(
  [ValidateSet("plan", "publish", "verify")]
  [string]$Mode = "plan",
  [ValidateSet("head", "full")]
  [string]$Verification = "head",
  [ValidateRange(1, 8)]
  [int]$Concurrency = 4,
  [long]$MonthlyClassAUsed = -1,
  [long]$MonthlyClassBUsed = -1,
  [switch]$Promote,
  [string]$PublicOrigin
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$pinnedNode = "C:\Code\tools\node-v22.23.2-win-x64\node.exe"
$nodeExecutable = if (Test-Path -LiteralPath $pinnedNode) {
  $pinnedNode
} else {
  (Get-Command node -ErrorAction Stop).Source
}

$publisherArguments = @(
  "--import", "tsx",
  "scripts/publish-research-to-r2.ts",
  "--mode", $Mode,
  "--verification", $Verification,
  "--concurrency", $Concurrency.ToString()
)

if ($Mode -eq "plan") {
  Push-Location -LiteralPath $repoRoot
  try {
    & $nodeExecutable @publisherArguments
    if ($LASTEXITCODE -ne 0) { throw "R2 publication plan failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }
  exit 0
}

if ($MonthlyClassAUsed -lt 0 -or $MonthlyClassBUsed -lt 0) {
  throw "Network modes require explicit current-period MonthlyClassAUsed and MonthlyClassBUsed values from Cloudflare Billable Usage."
}

$credentialPath = Join-Path $env:LOCALAPPDATA "ProjectIsitusa\credentials\r2-publisher.clixml"
if (-not (Test-Path -LiteralPath $credentialPath)) {
  throw "The user-scoped DPAPI R2 publisher credential is not installed."
}
$credential = Import-Clixml -LiteralPath $credentialPath
if ($credential -isnot [System.Management.Automation.PSCredential]) {
  throw "The R2 publisher credential file is invalid."
}

$publisherArguments += @(
  "--monthly-class-a-used", $MonthlyClassAUsed.ToString(),
  "--monthly-class-b-used", $MonthlyClassBUsed.ToString()
)
if ($Promote) { $publisherArguments += "--promote" }
if ($PublicOrigin) { $publisherArguments += @("--public-origin", $PublicOrigin) }

$env:R2_ACCOUNT_ID = "0fe57401a5fd98319e16832ee97de02d"
$env:R2_BUCKET = "project-isitusa-research"
$env:R2_ACCESS_KEY_ID = $credential.UserName
$env:R2_SECRET_ACCESS_KEY = $credential.GetNetworkCredential().Password
Push-Location -LiteralPath $repoRoot
try {
  & $nodeExecutable @publisherArguments
  if ($LASTEXITCODE -ne 0) { throw "R2 publication failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
  Remove-Item Env:R2_ACCOUNT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:R2_BUCKET -ErrorAction SilentlyContinue
  Remove-Item Env:R2_ACCESS_KEY_ID -ErrorAction SilentlyContinue
  Remove-Item Env:R2_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
}
