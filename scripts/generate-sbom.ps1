$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot "venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
    $python = "python"
}

& $python -m pip_audit `
    --requirement (Join-Path $projectRoot "requirements\base.txt") `
    --format cyclonedx-json `
    --output (Join-Path $projectRoot "sbom.cdx.json")

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
