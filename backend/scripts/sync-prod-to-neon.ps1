# sync-prod-to-neon.ps1 — Sync Neon dev DB from production VPS
# Usage: .\scripts\sync-prod-to-neon.ps1
#
# Prerequisites:
#   - SSH access to production server (root@37.60.230.148)
#   - psql (PostgreSQL 17 client) installed locally
#   - Neon database accessible (connection details below)

$ErrorActionPreference = "Continue"
$PROD_HOST    = "root@37.60.230.148"
$NEON_HOST    = "ep-patient-tooth-agty0w4k.c-2.eu-central-1.aws.neon.tech"
$NEON_DB      = "neondb"
$NEON_USER    = "neondb_owner"
$NEON_PASS    = "npg_nY9aZ0dCyKRf"
$PSQL         = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$DUMP_REMOTE  = "/tmp/melamedlaw_prod.sql"
$DUMP_LOCAL   = "$PSScriptRoot\..\melamedlaw_prod.sql"
$DUMP_CLEAN   = "$PSScriptRoot\..\melamedlaw_clean.sql"

$NEON_CONNSTR = "postgresql://${NEON_USER}:${NEON_PASS}@${NEON_HOST}:5432/${NEON_DB}?sslmode=require"

Write-Host "`n=== [1/7] Dumping production DB (read-only) ===" -ForegroundColor Cyan
ssh $PROD_HOST "sudo -u postgres pg_dump -d melamedlaw --format=plain --no-owner --no-privileges --encoding=UTF8 > $DUMP_REMOTE 2>/dev/null; echo ROWS:; wc -l $DUMP_REMOTE"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: SSH/dump failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== [2/7] Downloading dump ===" -ForegroundColor Cyan
scp "${PROD_HOST}:${DUMP_REMOTE}" $DUMP_LOCAL
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: SCP failed" -ForegroundColor Red; exit 1 }
$size = [math]::Round((Get-Item $DUMP_LOCAL).Length / 1KB)
Write-Host "Downloaded: ${size}KB"

Write-Host "`n=== [3/7] Cleaning dump for Neon compatibility ===" -ForegroundColor Cyan
# Remove PG16 directives and CREATE EXTENSION vector (Neon must enable it via dashboard)
$reader = [System.IO.StreamReader]::new($DUMP_LOCAL, [System.Text.Encoding]::UTF8)
$writer = [System.IO.StreamWriter]::new($DUMP_CLEAN, $false, (New-Object System.Text.UTF8Encoding $false))
$lineCount = 0
while ($null -ne ($line = $reader.ReadLine())) {
    if ($line.StartsWith('\restrict') -or $line.StartsWith('\unrestrict')) {
        $writer.WriteLine("-- stripped: restrict directive")
    }
    elseif ($line -match '^\s*CREATE EXTENSION.*vector') {
        $writer.WriteLine("-- stripped: CREATE EXTENSION vector (enable via Neon dashboard)")
    }
    else {
        $writer.WriteLine($line)
    }
    $lineCount++
}
$reader.Close()
$writer.Close()
Write-Host "Processed $lineCount lines"

Write-Host "`n=== [4/7] Dropping all Neon tables ===" -ForegroundColor Cyan
$dropFile = Join-Path $PSScriptRoot "drop_all.sql"
@'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO neondb_owner;
'@ | Set-Content -Path $dropFile -Encoding UTF8
& $PSQL $NEON_CONNSTR -f $dropFile 2>&1 | Out-Null
Remove-Item $dropFile -ErrorAction SilentlyContinue
$tableCount = & $PSQL $NEON_CONNSTR -A -t -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
Write-Host "Tables remaining: $($tableCount.Trim())"

Write-Host "`n=== [5/7] Enabling pgvector on Neon ===" -ForegroundColor Cyan
& $PSQL $NEON_CONNSTR -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>&1
Write-Host "pgvector extension ready"

Write-Host "`n=== [6/7] Restoring production data to Neon ===" -ForegroundColor Cyan
$env:PGCLIENTENCODING = "UTF8"
& $PSQL $NEON_CONNSTR -f $DUMP_CLEAN 2>&1 | Select-String "^COPY" | ForEach-Object { $_.Line }

Write-Host "`n=== [7/7] Verifying ===" -ForegroundColor Cyan
$results = & $PSQL $NEON_CONNSTR -A -t -c "SELECT 'users=' || count(*) FROM users; SELECT 'cases=' || count(*) FROM cases; SELECT 'tables=' || count(*) FROM pg_tables WHERE schemaname='public';"
$results | ForEach-Object { if ($_.Trim()) { Write-Host "  $_" -ForegroundColor Green } }

# Cleanup temp files
Remove-Item $DUMP_LOCAL -ErrorAction SilentlyContinue
Remove-Item $DUMP_CLEAN -ErrorAction SilentlyContinue

Write-Host "`n=== Done! Neon dev DB synced from production ===" -ForegroundColor Green
