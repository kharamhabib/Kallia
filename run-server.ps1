# Runner script for Kallia Backend in background
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $index = $line.IndexOf("=")
            if ($index -gt 0) {
                $key = $line.Substring(0, $index).Trim()
                $value = $line.Substring($index + 1).Trim()
                $value = $value -replace '^"|"$', ''
                $value = $value -replace "^'|'$", ''
                if ($key) {
                    [System.Environment]::SetEnvironmentVariable($key, $value, [System.EnvironmentVariableTarget]::Process)
                }
            }
        }
    }
}
$env:CGO_ENABLED = "1"
$env:CGO_LDFLAGS = "-L.\native -lopus_mlow"
$env:PATH = "$PSScriptRoot\native;" + $env:PATH
& "$PSScriptRoot\kallia.exe" -addr :3001 -debug
