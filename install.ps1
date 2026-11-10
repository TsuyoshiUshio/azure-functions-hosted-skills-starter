[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-f]{40}$')]
    [string]$Ref,
    [string]$Destination = (Join-Path (Get-Location) 'my-hosted-skill'),
    [ValidateSet('all', 'copilot', 'claude', 'codex')]
    [string]$Agent = 'all',
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('hosted-skills-' + [Guid]::NewGuid().ToString('N'))
try {
    $null = [IO.Directory]::CreateDirectory($temporary)
    $archive = Join-Path $temporary 'starter.zip'
    # The full source commit pins scripts, manifest and cached template together.
    $url = "https://codeload.github.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/zip/$Ref"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive -TimeoutSec 120
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $temporary)
    $source = Join-Path $temporary "azure-functions-hosted-skills-starter-$Ref"
    $global:LASTEXITCODE = 0
    & (Join-Path $source 'bootstrap.ps1') -Destination $Destination -Agent $Agent -Json:$Json
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
} catch {
    [Console]::Error.WriteLine("Download/bootstrap failed: $($_.Exception.Message). Private repositories require an authenticated checkout; use its bootstrap.ps1 instead.")
    exit 2
} finally {
    # Only the unique download directory created by this invocation is removed.
    if (Test-Path -LiteralPath $temporary) {
        Remove-Item -LiteralPath $temporary -Recurse -Force
    }
}
