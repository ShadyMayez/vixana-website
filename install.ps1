# Vixana command line installer for Windows (PowerShell 5.1 or 7).
#
#   irm https://YOUR-SITE/install.ps1 | iex
#
# What it does, all inside your user profile (no administrator rights):
#   1. downloads Vixana's source (or copies it from $env:VIXANA_SOURCE),
#   2. makes a Python environment with the CPU engine's packages,
#   3. adds a `vixana` command and puts its folder on your user PATH.
# To remove Vixana: delete %LOCALAPPDATA%\Vixana\cli, %LOCALAPPDATA%\Vixana\venvs\cli and %LOCALAPPDATA%\Vixana\bin,
# and remove that bin folder from your user PATH.
#
# Settings (environment variables): VIXANA_VERSION (default 6.1.0), VIXANA_SOURCE (a .zip URL or a local folder;
# default that release's vixana-cli-<version>.zip from github.com/ShadyMayez/vixana-website/releases),
# VIXANA_HOME (default %LOCALAPPDATA%\Vixana), VIXANA_PYTHON (path to python.exe 3.11-3.13).

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest is very slow with the progress bar on 5.1

function Stop-Install([string]$message) { Write-Host "Vixana install stopped: $message" -ForegroundColor Red; throw $message }

$releases = "https://github.com/ShadyMayez/vixana-website/releases"
$version = if ($env:VIXANA_VERSION) { $env:VIXANA_VERSION } else { "6.1.0" }
$source = if ($env:VIXANA_SOURCE) { $env:VIXANA_SOURCE } else { "$releases/download/v$version/vixana-cli-$version.zip" }
$vhome = if ($env:VIXANA_HOME) { $env:VIXANA_HOME } else { Join-Path $env:LOCALAPPDATA "Vixana" }
$app = Join-Path $vhome "cli"
$venv = Join-Path $vhome "venvs\cli"
$bin = Join-Path $vhome "bin"

Write-Host "Installing the Vixana command line into $vhome"

# ---- Python 3.11 to 3.13 ----
# A Python command is an executable plus its arguments, e.g. "py -3.12" (the Windows launcher) or "python".
function Invoke-Python([string[]]$cmd, [string[]]$arguments) {
    $exe = $cmd[0]
    $pre = @($cmd | Select-Object -Skip 1)
    & $exe @pre @arguments
}
function Test-Python([string[]]$cmd) {
    try {
        Invoke-Python $cmd @("-c", "import sys, venv; sys.exit(0 if (3, 11) <= sys.version_info[:2] <= (3, 13) else 1)") 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}
$python = $null
if ($env:VIXANA_PYTHON) { $python = @($env:VIXANA_PYTHON) }
else {
    foreach ($candidate in "py -3.12", "py -3.13", "py -3.11", "python") {
        $cmd = $candidate -split " "
        if (Test-Python $cmd) { $python = $cmd; break }
    }
}
$useUv = $false
if (-not $python) {
    if (Get-Command uv -ErrorAction SilentlyContinue) { $useUv = $true }
    else { Stop-Install "Vixana needs Python 3.11, 3.12 or 3.13. Install Python 3.12 from https://www.python.org/downloads/ (or: winget install Python.Python.3.12), or install uv, then run this again." }
}

# ---- source ----
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("vixana-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    if (Test-Path $source -PathType Container) {
        Write-Host "Copying the source from $source"
        $src = (Resolve-Path $source).Path
    } else {
        Write-Host "Downloading $source"
        $zip = Join-Path $tmp "src.zip"
        Invoke-WebRequest -Uri $source -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp "src")
        $src = (Get-ChildItem (Join-Path $tmp "src") -Directory | Select-Object -First 1).FullName
    }
    if (-not (Test-Path (Join-Path $src "vixana_cli\__main__.py"))) { Stop-Install "$source does not look like the Vixana source (no vixana_cli)" }

    # Keep only what the command line runs: the engine, the CLI, and the engines' frozen settings.
    $new = "$app.new"
    if (Test-Path $new) { Remove-Item -Recurse -Force $new }
    New-Item -ItemType Directory -Force -Path "$new\docs\release", "$new\docs\research", "$new\requirements" | Out-Null
    foreach ($d in "backend", "vixana_cli") { Copy-Item -Recurse (Join-Path $src $d) (Join-Path $new $d) }
    Copy-Item (Join-Path $src "docs\release\v6.0.0_freeze.json") "$new\docs\release\"
    foreach ($n in "amlb_unseen_options", "core_v5_7_freeze", "core_v5_7_1_freeze", "core_v5_7_1_final_freeze",
                   "v5_2_portfolio", "vs_autogluon_v2_options", "core_g1_final_freeze") {
        Copy-Item (Join-Path $src "docs\research\$n.json") "$new\docs\research\"
    }
    Copy-Item (Join-Path $src "backend\requirements.txt"), (Join-Path $src "deploy\server\requirements-server.txt") "$new\requirements\"
    if (Test-Path (Join-Path $src "LICENSE.md")) { Copy-Item (Join-Path $src "LICENSE.md") $new }
    Get-ChildItem $new -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force
    if (Test-Path $app) { Remove-Item -Recurse -Force $app }
    Move-Item $new $app
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

# ---- Python environment ----
$venvPython = Join-Path $venv "Scripts\python.exe"
New-Item -ItemType Directory -Force -Path (Split-Path $venv) | Out-Null
if (-not (Test-Path $venvPython)) {
    Write-Host "Making the Python environment"
    if ($useUv) { uv venv --quiet --python 3.12 $venv } else { Invoke-Python $python @("-m", "venv", $venv) }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $venvPython)) {
        Stop-Install "could not make a Python environment with '$($python -join ' ')' in $venv"
    }
}
Write-Host "Installing the engine's packages (a few minutes the first time)"
$req = Join-Path $app "requirements\requirements-server.txt"
if ($useUv) {
    uv pip install --quiet --python $venvPython --extra-index-url https://download.pytorch.org/whl/cpu -r $req
} else {
    & $venvPython -m pip install --quiet --disable-pip-version-check --upgrade pip | Out-Null
    & $venvPython -m pip install --quiet --disable-pip-version-check --extra-index-url https://download.pytorch.org/whl/cpu -r $req
}
if ($LASTEXITCODE -ne 0) { Stop-Install "package install failed (see the messages above)" }

# ---- the command ----
New-Item -ItemType Directory -Force -Path $bin | Out-Null
@"
@echo off
rem Vixana command line (installed by install.ps1)
set "PYTHONPATH=$app;%PYTHONPATH%"
if not defined VIXANA_HOME set "VIXANA_HOME=$vhome"
"$venvPython" -m vixana_cli %*
"@ | Set-Content -Encoding ASCII (Join-Path $bin "vixana.cmd")

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $userPath) { $userPath = "" }
if (-not (($userPath -split ";") -contains $bin)) {
    [Environment]::SetEnvironmentVariable("Path", (($userPath.TrimEnd(";"), $bin) -join ";").TrimStart(";"), "User")
    $env:Path = "$env:Path;$bin"
    $pathNote = "Open a new terminal so the vixana command is found."
}

& (Join-Path $bin "vixana.cmd") --version | Out-Null
if ($LASTEXITCODE -ne 0) { Stop-Install "the command was installed but does not start; run $bin\vixana.cmd --version to see why" }

Write-Host ""
Write-Host "Vixana is installed. Try:"
Write-Host "  vixana            open the interactive session"
Write-Host "  vixana doctor     check this computer"
if ($pathNote) { Write-Host ""; Write-Host $pathNote }
