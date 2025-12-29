Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ConfigValue([string]$Key) {
  $val = (Get-Item -Path "Env:$Key" -ErrorAction SilentlyContinue).Value
  if ($val) { return $val }

  $envFile = Join-Path $PSScriptRoot '.env'
  if (Test-Path $envFile) {
    $raw = Get-Content -Raw -Path $envFile
    $m = [regex]::Match($raw, "(?m)^\s*$([Regex]::Escape($Key))\s*=\s*(.*)$")
    if ($m.Success) {
      $v = $m.Groups[1].Value.Trim()
      if ((($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) -and $v.Length -ge 2) {
        $v = $v.Substring(1, $v.Length - 2)
      }
      if ($v) { return $v }
    }
  }

  return $null
}

function Set-Result([string]$Name, [bool]$Pass, [string]$Notes) {
  $r = 'FAIL'
  if ($Pass) { $r = 'PASS' }
  [PSCustomObject]@{ Check = $Name; Result = $r; Notes = $Notes }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

$results = @()

# Required harness env vars (from env or scripts/e2e/.env)
$baseUrl = Get-ConfigValue 'E2E_API_BASE_URL'
$adminPhone = Get-ConfigValue 'E2E_ADMIN_PHONE'
$adminOtp = Get-ConfigValue 'E2E_ADMIN_OTP'
$userPhone = Get-ConfigValue 'E2E_USER_PHONE'
$userOtp = Get-ConfigValue 'E2E_USER_OTP'

$envOk = ($baseUrl -and $adminPhone -and $adminOtp -and $userPhone -and $userOtp)
$results += Set-Result 'Required env vars present' $envOk 'E2E_API_BASE_URL,E2E_ADMIN_*,E2E_USER_* present via env or scripts/e2e/.env'
$results += Set-Result 'Admin creds present' ([bool]($adminPhone -and $adminOtp)) 'E2E_ADMIN_PHONE and E2E_ADMIN_OTP present'

# JWT/Twilio env presence (backend/.env keys only, no values)
$backendEnv = Join-Path $repoRoot 'backend/.env'
$jwtTwilioOk = $false
$jwtTwilioNote = ''
if (Test-Path $backendEnv) {
  $raw = Get-Content -Raw -Path $backendEnv
  $hasJwt = ($raw -match "(?m)^\s*JWT_SECRET=")
  $hasTwilio = ($raw -match "(?m)^\s*TWILIO_ACCOUNT_SID=") -and ($raw -match "(?m)^\s*TWILIO_AUTH_TOKEN=") -and ($raw -match "(?m)^\s*TWILIO_PHONE_NUMBER=")
  $jwtTwilioOk = $hasJwt -and $hasTwilio
  $jwtTwilioNote = "backend/.env present; JWT_SECRET key=$hasJwt; TWILIO keys=$hasTwilio"
} else {
  $jwtTwilioOk = $false
  $jwtTwilioNote = 'backend/.env missing'
}
$results += Set-Result 'JWT/Twilio env keys present' $jwtTwilioOk $jwtTwilioNote

# Non-production base URL check
$nonProdOk = $false
$nonProdNote = ''
if ($baseUrl) {
  try {
    $u = [Uri]$baseUrl
    $host = $u.Host.ToLowerInvariant()
    $nonProdOk = ($host -eq 'localhost' -or $host -eq '127.0.0.1')
    $nonProdNote = "host=$host"
  } catch {
    $nonProdOk = $false
    $nonProdNote = 'E2E_API_BASE_URL is not a valid URL'
  }
} else {
  $nonProdOk = $false
  $nonProdNote = 'missing E2E_API_BASE_URL'
}
$results += Set-Result 'No production environment used' $nonProdOk $nonProdNote

# Node/npm deps
$nodeOk = $false
$npmOk = $false
$nodeVer = ''
$npmVer = ''
try { $nodeVer = (node -v) } catch { $nodeVer = '' }
try { $npmVer = (npm -v) } catch { $npmVer = '' }
if ($nodeVer -match '^v(\d+)\.') { $nodeOk = ([int]$Matches[1] -ge 18) }
if ($npmVer) { $npmOk = $true }
$results += Set-Result 'Node/npm deps OK' ($nodeOk -and $npmOk) ("node=$nodeVer npm=$npmVer")

# API health reachable
$healthOk = $false
$healthNote = ''
if ($baseUrl) {
  $healthUrl = ($baseUrl -replace '/api/?$','')
  if (-not $healthUrl.EndsWith('/')) { $healthUrl = $healthUrl + '/' }
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -Method GET -TimeoutSec 5
    $healthOk = ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
    $healthNote = "GET $healthUrl -> $($r.StatusCode)"
  } catch {
    $healthOk = $false
    $healthNote = "GET $healthUrl -> NOT_REACHABLE"
  }
} else {
  $healthOk = $false
  $healthNote = 'missing E2E_API_BASE_URL'
}
$results += Set-Result 'API_BASE_URL reachable (health)' $healthOk $healthNote

# DB-backed endpoint reachable (Auth/RequestOtp hits users+otps)
$dbOk = $false
$dbNote = ''
if ($baseUrl -and $adminPhone) {
  try {
    $body = @{ phoneNumber = $adminPhone } | ConvertTo-Json
    $r2 = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/Auth/RequestOtp" -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 8
    $dbOk = ($r2.StatusCode -in 200,404,401,400) -and ($r2.StatusCode -lt 500)
    $dbNote = "POST /Auth/RequestOtp -> $($r2.StatusCode)"
  } catch {
    $resp = $_.Exception.Response
    if ($resp -and $resp.StatusCode) {
      $code = [int]$resp.StatusCode
      $dbOk = ($code -in 200,404,401,400) -and ($code -lt 500)
      $dbNote = "POST /Auth/RequestOtp -> $code"
    } else {
      $dbOk = $false
      $dbNote = 'POST /Auth/RequestOtp -> NOT_REACHABLE'
    }
  }
} else {
  $dbOk = $false
  $dbNote = 'missing E2E_API_BASE_URL or E2E_ADMIN_PHONE'
}
$results += Set-Result 'DB reachable (DB-backed endpoint)' $dbOk $dbNote

''
'=== E2E Harness Prereqs (PASS/FAIL) ==='
$results | Format-Table -AutoSize | Out-String | Write-Host

$allPass = -not ($results | Where-Object { $_.Result -eq 'FAIL' })
if (-not $allPass) {
  Write-Host 'Prereqs FAILED; not running harness.'
  exit 2
}

Write-Host 'Prereqs PASSED; running: npm run e2e:api (once)'

npm run e2e:api
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
  Write-Host "Harness exited with code $exitCode"
  exit $exitCode
}

$outRoot = Join-Path $repoRoot 'scripts/e2e/out'
$latest = Get-ChildItem -Path $outRoot -Directory -ErrorAction Stop | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latest) { throw 'No out/<runPrefix> directory found' }

$summaryPath = Join-Path $latest.FullName 'summary.json'

''
'=== E2E Harness Output Verification ==='
Write-Host ("runDir: scripts/e2e/out/" + $latest.Name)
Write-Host ("summary.json exists: " + (Test-Path $summaryPath))
Write-Host ("auth.json exists: " + (Test-Path (Join-Path $latest.FullName 'auth.json')))
Write-Host ("dashboard.json exists: " + (Test-Path (Join-Path $latest.FullName 'dashboard.json')))
Write-Host ("cases.whatsapp.json exists: " + (Test-Path (Join-Path $latest.FullName 'cases.whatsapp.json')))
Write-Host ("notifications.json exists: " + (Test-Path (Join-Path $latest.FullName 'notifications.json')))
Write-Host ("signing.json exists: " + (Test-Path (Join-Path $latest.FullName 'signing.json')))

if (-not (Test-Path $summaryPath)) { throw 'Missing summary.json' }
$summary = Get-Content -Raw -Path $summaryPath | ConvertFrom-Json
''
Write-Host ("runPrefix: " + $summary.runPrefix)
Write-Host ("evidence: scripts/e2e/out/" + $latest.Name + "/summary.json")
