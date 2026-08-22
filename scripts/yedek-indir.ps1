# Cdrive yedeklerini VDS'ten bu bilgisayara indirir (off-site kopya).
#
# Neden gerekli: VDS'teki backup-all.sh yedekleri /root/cdrive-deploy/backups
# altina, yani YEDEKLEDIGI SUNUCUNUN KENDISINE yaziyor. Sunucu kaybedilirse
# (disk arizasi, hesap kapanmasi, fidye yazilimi) yedekler de birlikte gider.
# Bu script en az bir kopyanin baska bir fiziksel yerde durmasini saglar.
#
# Kullanim:
#   .\scripts\yedek-indir.ps1
#   .\scripts\yedek-indir.ps1 -Hedef "D:\Yedekler\Cdrive"
#
# Haftada bir calistirmak yeterli (yedekler sunucuda 30 gun duruyor).

param(
    [string]$Hedef = "$env:USERPROFILE\Cdrive-Yedekler",
    [string]$SunucuAdresi = "root@185.157.46.129",
    [string]$AnahtarYolu = "$env:USERPROFILE\.ssh\kayizer_vds_ed25519",
    # Sunucuda ne kadar geriye gidilecegi degil, YERELDE ne kadar saklanacagi.
    # Sunucudaki rotasyon 30 gun; yerelde daha uzun tutmak mantikli.
    [int]$YerelSaklamaGunu = 90
)

$ErrorActionPreference = "Stop"
$UzakKlasor = "/root/cdrive-deploy/backups"

if (-not (Test-Path $AnahtarYolu)) {
    Write-Error "SSH anahtari bulunamadi: $AnahtarYolu"
}
if (-not (Test-Path $Hedef)) {
    New-Item -ItemType Directory -Path $Hedef -Force | Out-Null
    Write-Host "Hedef klasor olusturuldu: $Hedef"
}

Write-Host "Sunucudaki yedekler listeleniyor..." -ForegroundColor Cyan
$uzakDosyalar = & ssh -i $AnahtarYolu -o StrictHostKeyChecking=no $SunucuAdresi `
    "ls -1 $UzakKlasor/*.gz 2>/dev/null"
if (-not $?) { Write-Error "Sunucuya baglanilamadi veya yedek klasoru okunamadi." }

$indirilen = 0
$atlanan = 0
foreach ($uzak in $uzakDosyalar) {
    $uzak = $uzak.Trim()
    if (-not $uzak) { continue }
    $ad = Split-Path $uzak -Leaf
    $yerel = Join-Path $Hedef $ad

    # Zaten indirilmis dosyayi tekrar cekme (bandwidth israfi).
    if (Test-Path $yerel) { $atlanan++; continue }

    Write-Host "  indiriliyor: $ad"
    & scp -i $AnahtarYolu -o StrictHostKeyChecking=no "${SunucuAdresi}:${uzak}" $yerel
    if ($?) { $indirilen++ } else { Write-Warning "  BASARISIZ: $ad" }
}

# Yerelde cok eskimis kopyalari temizle.
$sinir = (Get-Date).AddDays(-$YerelSaklamaGunu)
$silinen = 0
Get-ChildItem -Path $Hedef -Filter "*.gz" -File | Where-Object { $_.LastWriteTime -lt $sinir } | ForEach-Object {
    Remove-Item $_.FullName -Force
    $silinen++
}

$toplam = (Get-ChildItem -Path $Hedef -Filter "*.gz" -File | Measure-Object -Property Length -Sum)
$boyutMB = [math]::Round($toplam.Sum / 1MB, 1)

Write-Host ""
Write-Host "Bitti." -ForegroundColor Green
Write-Host "  indirilen : $indirilen"
Write-Host "  zaten var : $atlanan"
Write-Host "  silinen   : $silinen ($YerelSaklamaGunu gunden eski)"
Write-Host "  toplam    : $($toplam.Count) dosya, $boyutMB MB"
Write-Host "  konum     : $Hedef"
