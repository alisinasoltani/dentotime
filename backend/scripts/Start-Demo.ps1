[CmdletBinding()]
param([switch]$Reset, [switch]$Stop)

$ErrorActionPreference = 'Stop'
if ($Reset -and $Stop) { throw 'Use either -Reset or -Stop.' }
$demoBackend = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$demoCompose = Join-Path $demoBackend 'docker-compose.demo.yml'
$demoArgs = @('compose', '--project-name', 'dentotime-demo', '--file', $demoCompose)

function Invoke-DemoDocker {
    param([string[]]$DockerArgs)
    & docker @demoArgs @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Demo Docker command failed (exit $LASTEXITCODE)." }
}

Invoke-DemoDocker -DockerArgs @('config', '--quiet')
if ($Stop) {
    Invoke-DemoDocker -DockerArgs @('stop')
    return
}
if ($Reset) {
    # Fixed project/file and project-scoped volumes; never use the review compose stack.
    Write-Host 'Resetting only dentotime-demo: its sample accounts, uploads and presentation changes will be deleted.'
    Invoke-DemoDocker -DockerArgs @('down', '--volumes')
}
Invoke-DemoDocker -DockerArgs @('up', '-d', '--build', '--wait', '--wait-timeout', '180')
Invoke-DemoDocker -DockerArgs @('ps', '-a')
Write-Host 'Demo: http://localhost:3100/login | Password: DentoDemo2026!'
Write-Host "Accounts and scenarios: $(Join-Path $demoBackend 'docs\demo.md')"
