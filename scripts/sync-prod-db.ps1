# sync-prod-db.ps1 — Sync local MelamedLaw DB from production
# Usage: .\scripts\sync-prod-db.ps1
#
# Prerequisites:
#   - SSH access to production server (root@37.60.230.148)
#   - Local PostgreSQL 17 with user liroym
#   - Database MelamedLaw must exist with ENCODING=UTF8
#     (if not: CREATE DATABASE "MelamedLaw" OWNER liroym ENCODING 'UTF8'
#              TEMPLATE template0 LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8')

$ErrorActionPreference = "Continue"
$PROD_HOST   = "root@37.60.230.148"
$LOCAL_DB     = "MelamedLaw"
$LOCAL_USER   = "liroym"
$PSQL         = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$DUMP_REMOTE  = "/tmp/melamedlaw_prod.sql"
$DUMP_LOCAL   = "$PSScriptRoot\..\melamedlaw_prod.sql"
$DUMP_CLEAN   = "$PSScriptRoot\..\melamedlaw_clean.sql"

Write-Host "`n=== [1/7] Dumping production DB (read-only) ===" -ForegroundColor Cyan
ssh $PROD_HOST "sudo -u postgres pg_dump -d melamedlaw --format=plain --no-owner --no-privileges --encoding=UTF8 > $DUMP_REMOTE 2>/dev/null; echo ROWS:; wc -l $DUMP_REMOTE"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: SSH/dump failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== [2/7] Downloading dump ===" -ForegroundColor Cyan
scp "${PROD_HOST}:${DUMP_REMOTE}" $DUMP_LOCAL
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: SCP failed" -ForegroundColor Red; exit 1 }
$size = [math]::Round((Get-Item $DUMP_LOCAL).Length / 1KB)
Write-Host "Downloaded: ${size}KB"

Write-Host "`n=== [3/7] Cleaning PG16 directives (binary-safe UTF-8) ===" -ForegroundColor Cyan
# Use .NET StreamReader/Writer to preserve UTF-8 encoding without BOM corruption
$reader = [System.IO.StreamReader]::new($DUMP_LOCAL, [System.Text.Encoding]::UTF8)
$writer = [System.IO.StreamWriter]::new($DUMP_CLEAN, $false, (New-Object System.Text.UTF8Encoding $false))
$lineCount = 0
while ($null -ne ($line = $reader.ReadLine())) {
    if ($line.StartsWith('\restrict') -or $line.StartsWith('\unrestrict')) {
        $writer.WriteLine("-- stripped")
    } else {
        $writer.WriteLine($line)
    }
    $lineCount++
}
$reader.Close()
$writer.Close()
Write-Host "Processed $lineCount lines"

Write-Host "`n=== [4/7] Checking DB encoding ===" -ForegroundColor Cyan
$encoding = & $PSQL -U $LOCAL_USER -d $LOCAL_DB -A -t -c "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = '$LOCAL_DB';"
$encoding = $encoding.Trim()
if ($encoding -ne "UTF8") {
    Write-Host "WARNING: Database encoding is $encoding, not UTF8!" -ForegroundColor Red
    Write-Host "Recreating database with UTF-8 encoding..." -ForegroundColor Yellow
    & $PSQL -U $LOCAL_USER -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$LOCAL_DB' AND pid <> pg_backend_pid();" 2>$null
    & $PSQL -U $LOCAL_USER -d postgres -c "DROP DATABASE IF EXISTS ""$LOCAL_DB"";" -c "CREATE DATABASE ""$LOCAL_DB"" OWNER $LOCAL_USER ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8';"
    Write-Host "Database recreated with UTF-8" -ForegroundColor Green
} else {
    Write-Host "Encoding: $encoding (OK)"
}

Write-Host "`n=== [5/7] Dropping all local tables ===" -ForegroundColor Cyan
$dropSql = @"
DO `$`$ 
DECLARE r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END `$`$;
DO `$`$
DECLARE r RECORD;
BEGIN
    FOR r IN (SELECT proname, pg_get_function_identity_arguments(oid) as args FROM pg_proc WHERE pronamespace = 'public'::regnamespace) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE';
    END LOOP;
END `$`$;
"@
& $PSQL -U $LOCAL_USER -d $LOCAL_DB -c $dropSql 2>&1 | Out-Null
$tableCount = & $PSQL -U $LOCAL_USER -d $LOCAL_DB -A -t -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
Write-Host "Tables remaining: $($tableCount.Trim())"

Write-Host "`n=== [6/7] Restoring production data ===" -ForegroundColor Cyan
$env:PGCLIENTENCODING = "UTF8"
& $PSQL -U $LOCAL_USER -d $LOCAL_DB -f $DUMP_CLEAN 2>&1 | Select-String "^COPY" | ForEach-Object { $_.Line }

Write-Host "`n=== [7/7] Verifying ===" -ForegroundColor Cyan
$results = & $PSQL -U $LOCAL_USER -d $LOCAL_DB -A -t -c "SELECT 'users=' || count(*) FROM users; SELECT 'cases=' || count(*) FROM cases; SELECT 'tables=' || count(*) FROM pg_tables WHERE schemaname='public';"
$results | ForEach-Object { if ($_.Trim()) { Write-Host "  $_" -ForegroundColor Green } }

# Cleanup temp files
Remove-Item $DUMP_LOCAL -ErrorAction SilentlyContinue
Remove-Item $DUMP_CLEAN -ErrorAction SilentlyContinue

Write-Host "`n=== Done! Local DB synced from production ===" -ForegroundColor Green
