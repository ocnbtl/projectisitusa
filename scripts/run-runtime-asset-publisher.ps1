[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Preflight, [switch]$Publish)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$node = 'C:\Code\tools\node-v22.23.2-win-x64\node.exe'
$taskArgs = @('scripts/publish-runtime-assets.mjs', '--preflight', $Preflight)
if ($Publish) { $taskArgs += '--publish' }
Push-Location -LiteralPath $repo
try {
  if ($Publish) {
    $credential = Import-Clixml -LiteralPath (Join-Path $env:LOCALAPPDATA 'ProjectIsitusa\credentials\r2-publisher.clixml')
    if ($credential -isnot [System.Management.Automation.PSCredential]) { throw 'Invalid R2 credential.' }
    $env:R2_ACCOUNT_ID='0fe57401a5fd98319e16832ee97de02d'
    $env:R2_BUCKET='project-isitusa-research'
    $env:R2_ACCESS_KEY_ID=$credential.UserName
    $env:R2_SECRET_ACCESS_KEY=$credential.GetNetworkCredential().Password
  }
  & $node @taskArgs
  if ($LASTEXITCODE -ne 0) { throw "Runtime asset publication failed: $LASTEXITCODE" }
} finally {
  Pop-Location
  if ($Publish) { Remove-Item Env:R2_ACCOUNT_ID,Env:R2_BUCKET,Env:R2_ACCESS_KEY_ID,Env:R2_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue }
}
