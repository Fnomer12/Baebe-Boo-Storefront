# One-step Windows installer for shop staff.
#
#   Right-click -> "Run with PowerShell", or from a terminal:
#     powershell -ExecutionPolicy Bypass -File install-windows.ps1 [-Port 3210] [-Origins https://...,...] [-InstallDriver]
#
# What it does:
#  1. Ensures a Node 20+ runtime: reuses an installed/bundled node, else tries
#     `winget install OpenJS.NodeJS.LTS`, else downloads official portable
#     Node 22 into the app folder (no admin rights needed for the fallback).
#  2. Copies the bridge + launcher into %LOCALAPPDATA%\baebe-bridge.
#  3. Writes bridge.env (port + allowed origins) next to the launcher.
#  4. With -InstallDriver: downloads the vendored XP-365B driver (SHA-256
#     verified), attempts a silent install, and verifies the spooler queue.
#     Needs one admin elevation for the driver step.
#  5. Adds a Startup shortcut so the connector runs at every login.
#  6. Starts the bridge now and checks http://127.0.0.1:<port>/health.
param(
  [string]$Prefix = (Join-Path $env:LOCALAPPDATA "baebe-bridge"),
  [string]$Port = "3210",
  [string]$Origins = "",
  [switch]$InstallDriver,
  [string]$DriverManifest = ""
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Baebe Boo till printer setup" -ForegroundColor Green
Write-Host "  This takes a few minutes. Please wait until you see DONE at the end." -ForegroundColor Green
Write-Host ""

function Write-Step([string]$Message) { Write-Host "[baebe-bridge] $Message" }

function Get-NodeVersion([string]$NodeExe) {
  try {
    $out = & $NodeExe --version 2>$null
    if ($out -match "^v(\d+)\.") { return [int]$Matches[1] }
  } catch { }
  return 0
}

# --- 1. Node runtime -------------------------------------------------------
$node = $null
foreach ($candidate in @($env:BAEBE_BRIDGE_NODE, (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source))) {
  if ($candidate -and (Test-Path $candidate) -and (Get-NodeVersion $candidate) -ge 20) { $node = $candidate; break }
}
foreach ($candidate in @("$Prefix\node\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe", "$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe")) {
  if (-not $node -and (Test-Path $candidate) -and (Get-NodeVersion $candidate) -ge 20) { $node = $candidate; break }
}

if (-not $node) {
  Write-Step "No Node 20+ found. Trying winget..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    try {
      winget install --silent --accept-package-agreements --accept-source-agreements OpenJS.NodeJS.LTS | Out-Null
      $refreshed = Join-Path $env:ProgramFiles "nodejs\node.exe"
      if ((Test-Path $refreshed) -and (Get-NodeVersion $refreshed) -ge 20) { $node = $refreshed }
    } catch { Write-Step "winget install failed ($($_.Exception.Message)). Falling back to portable Node." }
  }
}

if (-not $node) {
  $nodeVer = "v22.22.2"
  $zipUrl = "https://nodejs.org/dist/$nodeVer/node-$nodeVer-win-x64.zip"
  $tmp = Join-Path ([IO.Path]::GetTempPath()) "baebe-node"
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    Write-Step "Downloading portable Node $nodeVer ..."
    $zip = Join-Path $tmp "node.zip"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $extracted = Join-Path $tmp "node-$nodeVer-win-x64"
    $dest = Join-Path $Prefix "node"
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Move-Item -Path $extracted -Destination $dest
    $node = Join-Path $dest "node.exe"
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
  if ((Get-NodeVersion $node) -lt 20) { throw "Portable Node download did not produce a working Node 20+ runtime." }
  Write-Step "Using portable $(& $node --version)."
} else {
  Write-Step "Found $(& $node --version) at $node."
}

# --- 2+3. Files + config ---------------------------------------------------
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
New-Item -ItemType Directory -Force -Path $Prefix | Out-Null
Copy-Item -Force (Join-Path $src "local-printer-bridge.mjs") $Prefix
Copy-Item -Force (Join-Path $src "baebe-bridge.cmd") $Prefix

$envLines = @("BAEBE_PRINTER_BRIDGE_PORT=$Port")
if ($Origins) { $envLines += "BAEBE_PRINTER_ALLOWED_ORIGINS=$Origins" }
$envLines | Set-Content -Path (Join-Path $Prefix "bridge.env") -Encoding Ascii
Write-Step "Wrote $(Join-Path $Prefix 'bridge.env')."

# --- 4. Printer driver (optional, needs admin) --------------------------------
if ($InstallDriver) {
  $manifestPath = $DriverManifest
  if (-not $manifestPath) { $manifestPath = Join-Path $src "drivers.json" }
  if (-not (Test-Path $manifestPath)) { $manifestPath = Join-Path $Prefix "drivers.json" }
  if (-not (Test-Path $manifestPath)) {
    throw "Driver manifest not found. Re-extract the download (it ships drivers.json) or pass -DriverManifest <path>."
  }
  $entry = (Get-Content -Raw $manifestPath | ConvertFrom-Json).drivers |
    Where-Object { $_.os -eq "windows" -and $_.arch -eq "x64" } |
    Select-Object -First 1
  if (-not $entry) { throw "No Windows x64 driver entry in $manifestPath." }

  $already = Get-PrinterDriver -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*$($entry.driverName)*" }
  if ($already) {
    Write-Step "Driver already present: $($already[0].Name). Skipping install."
  } elseif ($entry.status -ne "verified" -or -not $entry.downloadUrl -or -not $entry.sha256) {
    Write-Step "Driver '$($entry.model)' is not published yet (status: $($entry.status))."
    Write-Step "Get it from the vendor page instead: $($entry.vendorPage)"
    try { Start-Process $entry.vendorPage } catch { }
  } else {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
      throw "Driver install needs one admin elevation. Right-click PowerShell -> 'Run as administrator', then re-run with -InstallDriver."
    }
    Write-Step "Downloading $($entry.model) driver v$($entry.vendorVersion) (~$([math]::Round($entry.sizeBytes / 1MB))MB) ..."
    $drvTmp = Join-Path ([IO.Path]::GetTempPath()) "baebe-driver"
    New-Item -ItemType Directory -Force -Path $drvTmp | Out-Null
    try {
      $payload = Join-Path $drvTmp $entry.fileName
      Invoke-WebRequest -Uri $entry.downloadUrl -OutFile $payload -UseBasicParsing
      $actual = (Get-FileHash -Path $payload -Algorithm SHA256).Hash.ToLower()
      if ($actual -ne $entry.sha256.ToLower()) {
        throw "Driver checksum mismatch (expected $($entry.sha256), got $actual). The file may be tampered with - aborting."
      }
      $pkgDir = Join-Path $drvTmp "pkg"
      New-Item -ItemType Directory -Force -Path $pkgDir | Out-Null
      if ($payload -like "*.zip") {
        Expand-Archive -Path $payload -DestinationPath $pkgDir -Force
      } else {
        # Self-extracting pack: try an unattended extract first, else one guided click.
        Write-Step "Extracting driver pack silently ..."
        Start-Process -FilePath $payload -ArgumentList @("/s", "/x", "/b`"$pkgDir`"", "/v`"/qn`"") -Wait -ErrorAction SilentlyContinue
        if (-not (Get-ChildItem -Recurse -Path $pkgDir -Filter $entry.inf -ErrorAction SilentlyContinue)) {
          Write-Step "Unattended extract did not work. Opening the extractor for one guided click ..."
          Start-Process -FilePath $payload -Wait
          $chosen = Read-Host "Extract the driver pack, then paste the folder it extracted to (Enter to rescan $pkgDir)"
          if ($chosen -and (Test-Path $chosen)) { $pkgDir = $chosen }
        }
      }
      $inf = Get-ChildItem -Recurse -Path $pkgDir -Filter $entry.inf -ErrorAction SilentlyContinue | Select-Object -First 1
      if (-not $inf) { throw "Could not find $($entry.inf) in the driver pack. Re-run and use the guided extract." }

      # Optional: vendor setup with silent flags, verified afterwards like every other path.
      foreach ($setup in @(Get-ChildItem -Path $inf.DirectoryName -Filter "*.exe" -ErrorAction SilentlyContinue)) {
        foreach ($flag in @($entry.silentArgs + @("/S", "/silent", "/quiet", "/VERYSILENT"))) {
          Write-Step "Trying $($setup.Name) $flag ..."
          try { Start-Process -FilePath $setup.FullName -ArgumentList $flag -Wait -ErrorAction Stop } catch { continue }
          Start-Sleep -Seconds 5
          if (Get-PrinterDriver -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*$($entry.driverName)*" }) { break }
        }
      }

      # Deterministic silent path with inbox tools (no GUI, signature-checked via the vendor .cat).
      if (-not (Get-PrinterDriver -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*$($entry.driverName)*" })) {
        Write-Step "Staging driver with pnputil ..."
        $pnputil = (pnputil /add-driver $inf.FullName /install) -join "`n"
        if ($pnputil) { Write-Step $pnputil.Split("`n")[0] }
        try { Add-PrinterDriver -Name $entry.driverName -ErrorAction Stop } catch {
          Write-Step "Add-PrinterDriver note: $($_.Exception.Message)"
        }
      }
      if (Get-PrinterDriver -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*$($entry.driverName)*" }) {
        Write-Step "Driver staged: $($entry.driverName)."
        $queueName = "Baebe Boo $($entry.model)"
        $usbPort = Get-PrinterPort -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "USB*" } | Select-Object -First 1
        if ((-not (Get-Printer -Name $queueName -ErrorAction SilentlyContinue)) -and $usbPort) {
          Add-Printer -Name $queueName -DriverName $entry.driverName -PortName $usbPort.Name
          Write-Step "Print queue '$queueName' created on $($usbPort.Name)."
          try {
            rundll32 printui.dll,PrintUIEntry /k /n "$queueName"
            Write-Step "Windows test page sent to '$queueName'."
          } catch { Write-Step "Queue is ready; print a Windows test page by hand to confirm." }
        } elseif (-not $usbPort) {
          Write-Host "  Driver is staged but no USB printer port exists yet - plug in the powered-on XP-365B," -ForegroundColor Yellow
          Write-Host "  then print a Windows test page. Re-run this installer WITHOUT -InstallDriver afterwards." -ForegroundColor Yellow
        } else {
          Write-Step "Queue '$queueName' already exists."
        }
      } else {
        throw "The driver did not register with the spooler. Run the vendor setup from $pkgDir by hand, then re-run this installer WITHOUT -InstallDriver."
      }
    } finally {
      Remove-Item -Recurse -Force $drvTmp -ErrorAction SilentlyContinue
    }
  }
}

# --- 5. Startup shortcut ----------------------------------------------------
$startup = [IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $startup "Baebe Boo Printer Connector.lnk"))
$shortcut.TargetPath = "$env:SystemRoot\System32\cmd.exe"
$shortcut.Arguments = "/c `"`"$(Join-Path $Prefix 'baebe-bridge.cmd')`"`""
$shortcut.WorkingDirectory = $Prefix
$shortcut.WindowStyle = 7
$shortcut.Description = "Baebe Boo local printer connector"
$shortcut.Save()
Write-Step "Startup shortcut installed."

# --- 6. Start now + verify --------------------------------------------------
Write-Step "Starting the connector..."
Start-Process -FilePath (Join-Path $Prefix "baebe-bridge.cmd") -WorkingDirectory $Prefix -WindowStyle Minimized
$health = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
    if ($health.service) { break }
  } catch { }
}
if (-not $health.service) { throw "The connector did not answer on http://127.0.0.1:$Port/health. Take a photo of this window and send it to support." }
$printerCount = 0
try {
  $listed = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/v1/printers" -TimeoutSec 5
  $printerCount = @($listed.printers).Count
} catch { }
Write-Step "Connector is up on $($env:COMPUTERNAME). Printers found: $printerCount."
Write-Host ""
if ($printerCount -gt 0) {
  Write-Host "  DONE. Go back to the Baebe Boo page and press Refresh on the printer list." -ForegroundColor Green
} else {
  Write-Host "  Connector is running, but no printer is installed yet." -ForegroundColor Yellow
  Write-Host "  Re-run this setup with -InstallDriver, or install the printer driver," -ForegroundColor Yellow
  Write-Host "  print a Windows test page, then run this setup again." -ForegroundColor Yellow
}
Write-Host ""
