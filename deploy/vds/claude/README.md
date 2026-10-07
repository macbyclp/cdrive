# Claude yardımcısı (kenar çubuğundaki Claude düğmesi)

Kullanıcılar Cdrive'da kenar çubuğunun üstündeki **Claude** düğmesine basıp dosyalarında arama yaptırabilir, belgelerini
okutup özetletebilir ve **düz metin dosyaları için düzenleme önerisi** isteyebilir. Claude, sunucuda çalışan **Claude CLI**'dır.

## Nasıl çalışır

```
Tarayıcı ──► cdrive (uygulama) ──HTTP+Bearer──► cdrive-claude (sidecar) ──► Claude CLI
                 ▲                                                            │ MCP (stdio)
                 └──────────── /api/claude/tools/* (kullanıcıya bağlı kısa ömürlü belirteç) ◄┘
```

- **Claude dosyalara diskten erişmez.** Yalnızca 5 araç kullanır: `list_folder`, `search_files`, `read_file`, `propose_edit`,
  `propose_new_file`. Hepsi Cdrive API'sine, **sohbeti başlatan kullanıcının yetkileriyle** istek atar; yani Claude kullanıcının
  göremediği bir dosyayı göremez (ADMIN her şeyi görür). İzinler, kota, denetim kaydı ve sürümleme aynen işler.
- **Claude hiçbir dosyaya doğrudan yazamaz.** Düzenlemeler *öneri*dir; panelde fark (diff) görünür, kullanıcı **Uygula**
  derse **yeni sürüm** olarak kaydedilir (her zaman geri alınabilir, denetim kaydına "Claude önerisi" yazılır). Uygulama anında
  yetki yeniden doğrulanır; dosya öneriden sonra değiştiyse öneri uygulanmaz.
- Claude'un yerleşik araçları (Bash, dosya yazma, web…) **kapalıdır** (`--tools ""`); yalnızca yukarıdaki 5 araç açıktır.
- Okunabilen biçimler: metin/JSON/CSV, PDF (metin katmanı), Word, Excel, PowerPoint. **Düzenlenebilen:** düz metin türleri
  (txt, md, csv, json, html, kod dosyaları…). Word/Excel/PDF için yeni bir metin dosyası önerilebilir.

## Güvenlik modeli

| Katman | Önlem |
| --- | --- |
| Ağ | Sidecar yalnızca `claude_net` üzerinde; veritabanına ve diğer servislere ulaşamaz. Port yayınlanmaz. |
| Yetki | Her araç çağrısı kullanıcıya bağlı, 12 dk ömürlü imzalı belirteçle yapılır; kullanıcı pasifleşirse çalışmaz. |
| Konteyner | Root dışı kullanıcı, salt-okunur kök dosya sistemi, `cap_drop: ALL`, `no-new-privileges`, bellek/CPU sınırı. |
| Prompt injection | Dosya içerikleri **veri** olarak etiketlenir; Claude yazamaz, yalnızca öneri kaydeder → kötü niyetli bir dosya bile onay olmadan hiçbir şeyi değiştiremez. |
| Kötüye kullanım | Kullanıcı başına dakikada 12 sohbet, en çok 2 eşzamanlı; bekleyen öneri sayısı sınırlı; çalıştırma zaman aşımı 240 sn. |

**Bilinen sınırlar:** Claude kullanıcının yetkisi dahilindeki dosya içeriklerini Anthropic API'sine gönderir (KVKK/veri
politikanızı kontrol edin). Bir dosyanın içine gizlenmiş talimatlar Claude'u yanıltabilir; bu yüzden hiçbir değişiklik
onaysız uygulanmaz — **Uygula'ya basmadan önce farkı okuyun.**

## Kurulum

1. `deploy/vds/docker-compose.yml` şablonundaki `cdrive-claude` servisini, `claude_net` ağını ve `cdrive` servisindeki
   `CLAUDE_URL` / `CLAUDE_TOKEN` / `networks` satırlarını sunucudaki compose dosyanıza ekleyin. **`CLAUDE_TOKEN` iki serviste aynı
   olmalı** (`openssl rand -hex 32`); örnek `replace-with-…` değeriyle servis başlamaz.
2. Başlatın:
   ```bash
   docker compose up -d --build cdrive cdrive-claude
   ```
3. **Claude CLI'a bir kez giriş yapın** (kimlik bilgisi yalnızca `cdrive_claude_home` volume'ünde kalır):
   ```bash
   docker exec -it cdrive-claude claude login
   ```
   Ekrana çıkan bağlantıyı tarayıcıda açıp Anthropic hesabınızla yetkilendirin ve kodu terminale yapıştırın.
   (Abonelik yerine API anahtarı isterseniz `ANTHROPIC_API_KEY` ortam değişkenini verin; kullanım başına ücretlendirilir.)
4. Doğrulayın:
   ```bash
   docker exec cdrive-app sh -c 'wget -qO- --header="Authorization: Bearer $CLAUDE_TOKEN" http://cdrive-claude:9100/auth'
   ```
   `{"loggedIn":true,...}` dönmeli. Sonra Cdrive'da Claude düğmesine basın.

## Sorun giderme

- Panelde "henüz kurulu değil": `CLAUDE_URL`/`CLAUDE_TOKEN` cdrive servisinde ayarlı değil.
- "Claude servisine ulaşılamıyor": `docker compose ps`, `docker logs cdrive-claude`; iki serviste de `claude_net` ağı ve aynı token var mı?
- "Claude beklenmedik şekilde kapandı … giriş yapılmamış olabilir": 3. adımdaki `claude login` yapılmadı ya da süresi doldu.
- **Abonelik kullanıyorsanız** panel de aboneliğin kullanım limitini tüketir; çok kullanıcılı kurumsal kullanımda Anthropic'in
  kullanım koşullarını ve limitleri kontrol edin (kurumsal için API anahtarı daha uygun olabilir).
- Yerelde denemek için: `CLAUDE_TOKEN=<24+ karakter> CDRIVE_URL=http://localhost:3000 node deploy/vds/claude/server.mjs`
  (Cdrive tarafında aynı `CLAUDE_URL`/`CLAUDE_TOKEN`).
