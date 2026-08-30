param(
  [string]$BackupRoot = "E:\backup\reminder-app\mongo",
  [string]$EnvFile = "$PSScriptRoot\..\server\.env",
  [string]$LocalEnvFile = "$PSScriptRoot\..\server\.env.local",
  [int]$KeepDays = 0
)

$ErrorActionPreference = "Stop"

function Read-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match "^\s*$Name\s*=\s*(.*)\s*$") {
      $value = $Matches[1].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      return $value
    }
  }
  return $null
}

$mongoDump = Get-Command mongodump -ErrorAction SilentlyContinue
if (-not $mongoDump) {
  throw "mongodump was not found. Install MongoDB Database Tools and make sure mongodump is available in PATH."
}

$mongoUri = $env:MONGODB_URI
if (-not $mongoUri) {
  $mongoUri = Read-DotEnvValue -Path $EnvFile -Name "MONGODB_URI"
}
if (-not $mongoUri) {
  $mongoUri = Read-DotEnvValue -Path $LocalEnvFile -Name "MONGODB_URI"
}
if (-not $mongoUri) {
  throw "MONGODB_URI was not found in the environment, $EnvFile, or $LocalEnvFile."
}

$dbName = $env:MONGODB_DB
if (-not $dbName) {
  $dbName = Read-DotEnvValue -Path $EnvFile -Name "MONGODB_DB"
}
if (-not $dbName) {
  $dbName = Read-DotEnvValue -Path $LocalEnvFile -Name "MONGODB_DB"
}
if (-not $dbName) {
  $dbName = "reminder-app"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Force -Path $target | Out-Null

& $mongoDump.Source --uri="$mongoUri" --db="$dbName" --out="$target" | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "mongodump failed with exit code $LASTEXITCODE."
}

if ($KeepDays -gt 0 -and (Test-Path -LiteralPath $BackupRoot)) {
  $cutoff = (Get-Date).AddDays(-$KeepDays)
  Get-ChildItem -LiteralPath $BackupRoot -Directory |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Recurse -Force
}

Write-Host "Mongo backup saved to $target"
