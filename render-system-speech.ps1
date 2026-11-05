param([Parameter(Mandatory)][string]$InputPath,[Parameter(Mandatory)][string]$OutputPath)
$ErrorActionPreference='Stop'
$claritySpeechRequest=Get-Content -LiteralPath $InputPath -Raw -Encoding utf8 | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$claritySynth=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $claritySynth.SelectVoice('Microsoft Zira Desktop')
    $clarityRoleRate=if ($claritySpeechRequest.voice -eq 'nova') {0} else {-1}
    $clarityRate=[int]([Math]::Log([double]$claritySpeechRequest.speed,2)*5)+$clarityRoleRate
    $claritySynth.Rate=[Math]::Min(10,[Math]::Max(-10,$clarityRate))
    $claritySynth.SetOutputToWaveFile($OutputPath)
    $claritySynth.Speak([string]$claritySpeechRequest.input)
    $claritySynth.SetOutputToNull()
} finally { $claritySynth.Dispose() }
