[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Plan,
  [Parameter(Mandatory = $true)]
  [string]$StartedAt,
  [switch]$SemanticDryRun,
  [string]$PreflightOutput,
  [string]$ReconcileDownloadKey
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$pinnedNode = "C:\Code\tools\node-v22.23.2-win-x64\node.exe"
$nodeExecutable = if (Test-Path -LiteralPath $pinnedNode) {
  $pinnedNode
} else {
  (Get-Command node -ErrorAction Stop).Source
}

if (-not ("ProjectIsitusa.NativeCredential" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace ProjectIsitusa {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct NativeCredentialRecord {
    public UInt32 Flags;
    public UInt32 Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }

  public static class NativeCredential {
    [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);

    [DllImport("Advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr credential);
  }
}
"@
}

function Read-ProjectGenericCredential {
  param(
    [Parameter(Mandatory = $true)][string]$Target,
    [switch]$AllowEmptyUserName,
    [switch]$AllowEmptySecret
  )
  $pointer = [IntPtr]::Zero
  if (-not [ProjectIsitusa.NativeCredential]::CredRead($Target, 1, 0, [ref]$pointer)) {
    $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "The user-scoped Windows credential '$Target' is unavailable (Win32 $errorCode)."
  }
  try {
    $record = [Runtime.InteropServices.Marshal]::PtrToStructure(
      $pointer,
      [type][ProjectIsitusa.NativeCredentialRecord]
    )
    $username = [Runtime.InteropServices.Marshal]::PtrToStringUni($record.UserName)
    $secret = if ($record.CredentialBlobSize -gt 0) {
      [Runtime.InteropServices.Marshal]::PtrToStringUni(
        $record.CredentialBlob,
        [int]($record.CredentialBlobSize / 2)
      )
    } else {
      ""
    }
    if (
      (-not $AllowEmptyUserName -and [string]::IsNullOrWhiteSpace($username)) -or
      (-not $AllowEmptySecret -and [string]::IsNullOrEmpty($secret))
    ) {
      throw "The user-scoped Windows credential '$Target' is incomplete."
    }
    [PSCustomObject]@{ UserName = $username; Secret = $secret }
  } finally {
    [ProjectIsitusa.NativeCredential]::CredFree($pointer)
  }
}

$arguments = @(
  "--import", "tsx",
  "scripts/research/run-national-gbif-download.ts",
  "--plan", $Plan,
  "--started-at", ([DateTimeOffset]::Parse($StartedAt).ToUniversalTime().ToString("o")),
  "--semantic-dry-run", $(if ($SemanticDryRun) { "true" } else { "false" })
)
if ($PreflightOutput) {
  if (-not $SemanticDryRun) { throw "-PreflightOutput requires -SemanticDryRun." }
  $arguments += @("--preflight-output", $PreflightOutput)
}
if ($ReconcileDownloadKey) {
  if ($SemanticDryRun) { throw "-ReconcileDownloadKey cannot be combined with -SemanticDryRun." }
  $arguments += @("--reconcile-download-key", $ReconcileDownloadKey)
}

$gbifCredential = Read-ProjectGenericCredential -Target "ProjectIsitusa/GBIF"
$emailCredential = Read-ProjectGenericCredential -Target "ProjectIsitusa/GBIF-Email" -AllowEmptyUserName -AllowEmptySecret
$email = if ($emailCredential.UserName -match "^[^@\s]+@[^@\s]+$") {
  $emailCredential.UserName
} elseif ($emailCredential.Secret -match "^[^@\s]+@[^@\s]+$") {
  $emailCredential.Secret
} else {
  throw "The ProjectIsitusa/GBIF-Email credential does not contain a valid notification address."
}

$env:GBIF_USERNAME = $gbifCredential.UserName
$env:GBIF_PASSWORD = $gbifCredential.Secret
$env:GBIF_EMAIL = $email
Push-Location -LiteralPath $repoRoot
try {
  & $nodeExecutable @arguments
  if ($LASTEXITCODE -ne 0) { throw "GBIF national acquisition failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
  Remove-Item Env:GBIF_USERNAME -ErrorAction SilentlyContinue
  Remove-Item Env:GBIF_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:GBIF_EMAIL -ErrorAction SilentlyContinue
  $gbifCredential = $null
  $emailCredential = $null
  $email = $null
}
