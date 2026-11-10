[CmdletBinding()]
param(
    [ValidatePattern('^(main|[0-9a-f]{40})$')]
    [string]$Ref = 'main',
    [string]$Destination = (Get-Location).Path,
    [string]$Agent,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('hosted-skills-' + [Guid]::NewGuid().ToString('N'))
try {
    if (-not $Agent) {
        if ($Json) { throw 'Specify -Agent copilot, claude, codex, or all with -Json.' }
        $Agent = Read-Host 'Coding agent (copilot / claude / codex / all)'
    }
    if ($Agent -notin @('copilot', 'claude', 'codex', 'all')) {
        throw "Unknown agent: $Agent"
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $commit = $Ref
    if ($Ref -eq 'main') {
        $response = Invoke-WebRequest -UseBasicParsing -Uri 'https://api.github.com/repos/TsuyoshiUshio/azure-functions-hosted-skills-starter/commits/main' -Headers @{ Accept = 'application/vnd.github.sha' } -TimeoutSec 30
        $content = $response.Content
        if ($content -is [byte[]]) { $content = [Text.Encoding]::UTF8.GetString($content) }
        $commit = ([string]$content).Trim()
        if ($commit -cnotmatch '^[0-9a-f]{40}$') { throw 'GitHub returned an invalid main commit SHA.' }
    }
    $null = [IO.Directory]::CreateDirectory($temporary)
    $archive = Join-Path $temporary 'starter.zip'
    # Resolve main once; the archive and its provenance use only that immutable SHA.
    $url = "https://codeload.github.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/zip/$commit"
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive -TimeoutSec 120
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $temporary)
    $source = Join-Path $temporary "azure-functions-hosted-skills-starter-$commit"
    $cache = Join-Path $source 'cache'
    $record = "{`"repository`":`"TsuyoshiUshio/azure-functions-hosted-skills-starter`",`"ref`":`"$Ref`",`"commit`":`"$commit`"}`n"
    $bytes = [Text.Encoding]::UTF8.GetBytes($record)
    [IO.File]::WriteAllBytes((Join-Path $cache 'installer-source.json'), $bytes)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { $digest = [BitConverter]::ToString($algorithm.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
    [IO.File]::AppendAllText((Join-Path $cache 'files.tsv'),
        "common`t$digest`tinstaller-source.json`t.hosted-skills-bootstrap.json`n",
        (New-Object Text.UTF8Encoding($false)))
    $global:LASTEXITCODE = 0
    & (Join-Path $source 'bootstrap.ps1') -Destination $Destination -Agent $Agent -Json:$Json
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
} catch {
    [Console]::Error.WriteLine("Download/bootstrap failed: $($_.Exception.Message)")
    exit 2
} finally {
    # Only the unique download directory created by this invocation is removed.
    if (Test-Path -LiteralPath $temporary) {
        Remove-Item -LiteralPath $temporary -Recurse -Force
    }
}
