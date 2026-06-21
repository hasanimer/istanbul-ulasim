# istanbul-ulasim

İstanbul toplu taşıma (metro, metrobüs, Marmaray, tramvay, otobüs) için
**GTFS tabanlı bir MCP (Model Context Protocol) sunucusu**. Claude gibi MCP
destekleyen asistanların "Kadıköy'den Levent'e nasıl giderim?", "Yenikapı'dan
sıradaki metro ne zaman?" gibi soruları doğrudan yanıtlayabilmesini sağlar.

Veri kaynağı [GTFS](https://gtfs.org/) (General Transit Feed Specification)
standardıdır: hat, durak, sefer ve çizelge bilgisi açık CSV dosyalarından okunur.
Depoda **gerçek İstanbul metro ağı gömülü gelir** — 11 metro hattının (M1A–M11)
gerçek istasyonları, ayrıca Marmaray, Metrobüs ve T1'in temsilî alt kümeleri.
Böylece sunucu, canlı bir API'ye ihtiyaç duymadan gerçekçi sonuçlar üretir ve
test edilebilir. Çalışma anında güncel İBB feed'ine de yönlendirilebilir
(aşağıya bakın).

> **Uyarı:** İstasyon dizileri kamuya açık kaynaklardan (metro.istanbul,
> Vikipedi, Moovit; ~Haziran 2026) derlenmiştir. **Sefer saatleri sentetiktir**
> (sabit aralık + sabit duraklar arası süre varsayımı) — resmî tarife değildir.
> Marmaray/Metrobüs/T1 yalnızca ana aktarma duraklarını içerir. Kesin planlama
> için resmî GTFS feed'ini kullanın.

## Araçlar (MCP tools)

| Araç | Açıklama |
|------|----------|
| `hat_ara` | Hatları ada, numaraya veya türe göre arar (`M2`, `metro`, `otobüs`, `marmaray`). |
| `durak_ara` | Durakları ada göre arar (`Taksim`, `Üsküdar`). Türkçe aksanlardan bağımsız. |
| `hat_duraklari` | Bir hattın duraklarını sırasıyla listeler; aktarma duraklarını işaretler. |
| `durak_kalkislari` | Bir duraktan verilen saatten sonraki kalkışları (çizelgeden) listeler. |
| `rota_bul` | İki durak arasında **en az aktarmalı** rotayı, bacak bacak önerir. |
| `ag_ozeti` | Yüklü GTFS verisinin özeti (kaynak, hat/durak sayıları, türler). |
| `entegre_hatlar` | Bir hattın **ücretsiz entegrasyon** (ücretsiz aktarma) hatlarını verir (`M5`, `UM62`, `TM`, `ARN`…). |
| `metro_duyurular` | Metro İstanbul raylı hat **duyurularını** (kesinti/arıza) listeler — *canlı; ağ gerekir*. |
| `metro_haritalari` | Metro İstanbul resmî **harita** bağlantılarını (PDF/görsel) listeler — *canlı; ağ gerekir*. |

## Kullanım örnekleri

MCP istemcisinde (Claude vb.) aşağıdaki gibi doğal dil sorular sorabilirsiniz:

- "M2 hattında hangi duraklar var?" (`hat_duraklari`)
- "Üsküdar durağından 18:30 sonrası kalkışları göster." (`durak_kalkislari`)
- "Kadıköy'den Levent'e en az aktarmayla nasıl giderim?" (`rota_bul`)
- "M5 ile ücretsiz entegre hatlar neler?" (`entegre_hatlar`)
- "Ağ özetini ver." (`ag_ozeti`)

## Kurulum

Gereksinim: Python **3.10+**

```bash
uv venv
uv pip install -e .
```

(`uv` yoksa `python -m venv .venv && .venv/bin/pip install -e .` de olur.)

## Çalıştırma

Sunucu stdio üzerinden konuşur. Kurulumdan sonra çalıştırılabilir:

```bash
istanbul-ulasim-mcp
```

### Claude Desktop / MCP istemci yapılandırması

`claude_desktop_config.json` (veya kullandığınız istemcinin MCP ayarı):

```json
{
  "mcpServers": {
    "istanbul-ulasim": {
      "command": "istanbul-ulasim-mcp"
    }
  }
}
```

Claude Code için:

```bash
claude mcp add istanbul-ulasim -- istanbul-ulasim-mcp
```

### Antigravity ve ChatGPT'ye ekleme

#### Antigravity

Antigravity'de MCP sunucusu ekleme ekranından yeni bir sunucu tanımlayın:

- **Name:** `istanbul-ulasim`
- **Command:** `istanbul-ulasim-mcp`
- **Transport:** `stdio`

Kaydettikten sonra araç listesini yenileyin ve `hat_ara`, `rota_bul` gibi
araçların göründüğünü doğrulayın.

#### ChatGPT

ChatGPT tarafında kullanım, hesabınızdaki özelliklere göre değişebilir:

1. **GPTs > Create** ile yeni bir GPT oluşturun.
2. **Actions/Tools** bölümünde MCP veya harici araç bağlantı adımını açın.
3. Komut/entegrasyon kısmında bu sunucuyu `istanbul-ulasim-mcp` komutuyla bağlayın.
4. Test istemine "Kadıköy'den Levent'e en az aktarmalı rota" yazıp yanıtı kontrol edin.

> Not: ChatGPT arayüzündeki menü adları sürüme göre farklı olabilir; temel
> ihtiyaç, bu MCP sunucusunu `stdio` komutuyla çalıştırıp araçları GPT'ye
> görünür hale getirmektir.

## Gerçek İstanbul GTFS verisini kullanma

Varsayılan olarak gömülü örnek veri kullanılır. Gerçek/güncel feed için ortam
değişkeni verin (dizin, `.zip` ya da URL):

```bash
# yerel dizin veya zip
ISTANBUL_GTFS_PATH=/yol/istanbul-gtfs istanbul-ulasim-mcp
ISTANBUL_GTFS_PATH=/yol/istanbul-gtfs.zip istanbul-ulasim-mcp

# uzak feed (çalışma ortamında dış ağ erişimi gerekir)
ISTANBUL_GTFS_URL=https://ornek-sunucu/istanbul-gtfs.zip istanbul-ulasim-mcp
```

İBB açık verisi `data.ibb.gov.tr` üzerinden yayımlanır; GTFS feed'inin güncel
bağlantısını oradan edinin. (Not: Bu depo geliştirilen ortamda dış ağ kısıtlı
olduğundan canlı feed entegrasyonu yerel olarak doğrulanmamıştır; format
standart GTFS olduğu için yapı uyumludur.)

## İBB Açık Veri (CKAN) ile hazır GTFS

`data.ibb.gov.tr` portalı **hazır GTFS** veri seti yayımlar (ör. "İETT GTFS
Verisi", "Toplu Ulaşım GTFS Verisi"). Bu **en basit yoldur**: GTFS'i indir,
mevcut yükleyici ek koda gerek olmadan okur.

`istanbul_ulasim.ckan` yardımcısı CKAN REST API'sini sarmalar (stdlib, ek
bağımlılık yok):

```bash
# Hazır GTFS kaynağının indirme adresini bul:
python -m istanbul_ulasim.ckan url --dataset iett-gtfs-verisi

# GTFS zip'ini indir ve kullan:
python -m istanbul_ulasim.ckan fetch --dataset iett-gtfs-verisi --out data/iett-gtfs.zip
ISTANBUL_GTFS_PATH=data/iett-gtfs.zip istanbul-ulasim-mcp

# Herhangi bir tablo veri setini SQL ile sorgula:
python -m istanbul_ulasim.ckan sql 'SELECT * FROM "<resource_id>" LIMIT 5'
```

> Ağ erişimi gerekir (`data.ibb.gov.tr`). Portal bazı kaynaklar için API anahtarı
> isteyebilir (`--api-key`). Bu geliştirme ortamından (ağ kısıtı) canlı
> doğrulanamadı; ayrıştırma mantığı mock yanıtlarla test edildi.

## Gerçek İETT verisinden GTFS üretme (SOAP→GTFS)

`istanbul_ulasim.iett` modülü, İETT'nin SOAP web servislerinden gerçek veriyi
çekip GTFS'e dönüştürür. **api.ibb.gov.tr'ye ağ erişimi gerekir** (zeep gibi ek
bağımlılık yoktur, yalnızca stdlib).

```bash
# Tüm ağ (büyük; ister belirli hatlar):
python -m istanbul_ulasim.iett --out data/iett
python -m istanbul_ulasim.iett --hat 500T --hat 34 --out data/iett

# Üretilen feed'i sunucuda kullan:
ISTANBUL_GTFS_PATH=data/iett istanbul-ulasim-mcp
```

Kullanılan servisler (İETT Web Servis Dokümanı V1.5):

| Servis / Metot | Veri | GTFS karşılığı |
|---|---|---|
| `HatDurakGuzergah → GetDurak_json` | Duraklar (koordinatlı) | `stops.txt` |
| `HatDurakGuzergah → GetHat_json` | Hatlar (sefer süresi) | `routes.txt` |
| `ibb.asmx → DurakDetay_GYY` | Hattın sıralı durakları (SIRANO) | desen / `stop_times` |
| `PlanlananSeferSaati → ...json` | Planlanan kalkış saatleri (yön, gün tipi) | `trips`/`calendar` |
| `SeferGerceklesme → GetHatOtoKonum_json` | Canlı araç konumu | (ileride: canlı varış) |

> **Notlar:** (1) Durak-arası saatler, gerçek **uç-terminal kalkışlarına** dayanır;
> ara duraklar `SEFER_SURESI`'ye göre eşit dağıtılır (yaklaşık). (2) `SeferGerceklesme`
> saatte 100 istekle sınırlıdır. (3) Servislerin tam yanıt şekli bu ortamdan
> (ağ kısıtı) canlı doğrulanamadı; ayrıştırıcılar belgelenmiş alanlara göre
> toleranslı yazıldı, ağ erişimli ortamda doğrulanması önerilir.

## Metro İstanbul (raylı sistem) — resmî metadata + duyurular

`istanbul_ulasim.metro`, Metro İstanbul REST API'sini
(`api.ibb.gov.tr/MetroIstanbul`) sarmalar. Statik ağ için CKAN GTFS yeterli
olduğundan bu modül onu **tekrar etmez**; benzersiz katkısı **resmî hat
metadata'sı** (ad/kod/renk) ve **gerçek-zamanlı duyurulardır**.

```bash
python -m istanbul_ulasim.metro lines          # resmî hat metadata (renk/kod)
python -m istanbul_ulasim.metro announcements   # güncel duyurular
python -m istanbul_ulasim.metro maps            # resmî harita bağlantıları (PDF/görsel)
```

`metro_duyurular` ve `metro_haritalari` MCP araçları bunları sunar (canlı; ağ gerekir).

> Duyuru endpoint'inin tam yolu `/MetroIstanbul/Help`'ten doğrulanmalıdır;
> farklıysa `METRO_ANNOUNCEMENTS_PATH` ortam değişkeniyle ayarlayın.

## Geliştirme

Test komutlarını çalıştırmadan önce sanal ortamı etkinleştirin (`source .venv/bin/activate`).

```bash
python -m unittest discover -s tests                # testler
python scripts/make_sample_gtfs.py                  # örnek veriyi yeniden üret
```

### Proje yapısı

```
src/istanbul_ulasim/
  gtfs.py        GTFS yükleyici + sorgu modeli (dizin/zip/URL)
  routing.py     En az aktarmalı rota motoru (biniş grafiği üzerinde BFS)
  integrations.py  Ücretsiz entegrasyon (besleme hattı) sorgu dizini
  iett.py        İETT SOAP istemcisi + SOAP→GTFS dönüştürücü (ağ gerektirir)
  ckan.py        İBB Açık Veri (CKAN) istemcisi + hazır GTFS çözümleme (ağ gerektirir)
  metro.py       Metro İstanbul REST istemcisi: resmî metadata + duyurular (ağ gerektirir)
  server.py      FastMCP sunucusu ve araç tanımları
  data/sample/   Gömülü gerçek İstanbul GTFS verisi
  data/integrations.json   İETT ücretsiz entegrasyon verisi
scripts/
  make_sample_gtfs.py   Örnek veriyi üreten betik
tests/
  test_core.py   Çekirdek + protokol testleri
  test_iett.py   İETT istemcisi + SOAP→GTFS dönüştürücü testleri
  test_ckan.py   İBB CKAN istemcisi testleri
  test_metro.py  Metro İstanbul istemcisi + metro_duyurular aracı testleri
```

## Gömülü ağ

**14 hat, 163 durak (26 aktarma):**

- **Metro (11):** M1A, M1B, M2, M3, M4, M5, M6, M7, M8, M9, M11
- **Tren:** Marmaray (temsilî) · **BRT:** Metrobüs 34 (temsilî) · **Tramvay:** T1 (temsilî)

Aktarma noktaları gerçek istasyonlardır; örnekler: Yenikapı (M1A/M1B/M2/Marmaray),
Ayrılık Çeşmesi (M4/Marmaray), Bostancı (M4/M8/Marmaray), Gayrettepe (M2/M11),
Kağıthane (M7/M11), Mahmutbey (M3/M7), Mecidiyeköy (M2/M7/Metrobüs),
Üsküdar (M5/Marmaray), Sirkeci (Marmaray/T1).

### Ücretsiz entegrasyon (besleme hatları)

`data/integrations.json`, İETT'nin "Metro Entegre Hatlar" verisini içerir:
besleme otobüs hatlarının (UM, KM, MK, TM, 50, ARN… kodlu) hangi metro/
tramvay/otobüs hatlarıyla **ücretsiz aktarma** kapsamında olduğu. `entegre_hatlar`
aracı bunu çift yönlü sorgular (örn. `M5` → besleme hatları; `UM62` → `M5`).
Tek yönlü entegrasyonlar ve hat grupları (`TM`, `50`, `ARN`) ayrıca işaretlenir.

> Bu besleme hatları GTFS rota grafiğinde **yer almaz** (durak verileri yok);
> yalnızca ücretsiz aktarma referansıdır, `rota_bul` bunları kullanmaz.

### Sınırlar

- Rota motoru en az aktarmalı yolu bulur; zaman bağımlı tam bir planlayıcı
  (RAPTOR/CSA) değildir — "hangi hatlarla giderim" sorusuna yanıt verir.
- Sefer saatleri sentetiktir; koordinatlar yalnızca başlıca duraklar için
  verilmiştir. Kesin planlama için resmî GTFS feed'ini kullanın.

### Kaynaklar

İstasyon listeleri kamuya açık kaynaklardan derlenmiştir:
[metro.istanbul](https://www.metro.istanbul/Hatlarimiz),
[İstanbul Metrosu — Vikipedi](https://tr.wikipedia.org/wiki/%C4%B0stanbul_Metrosu),
Moovit. Çapraz doğrulama önerilir.

## Veri ve Sorumluluk

- Bu proje, kamuya açık veri kaynaklarını kullanan bağımsız bir açık kaynak
  çalışmasıdır; herhangi bir resmî kurumun servisi değildir.
- Veri kaynakları ve kullanım koşulları için ilgili sağlayıcıların lisans ve
  hizmet şartları (ToS) geçerlidir; canlı feed entegrasyonunda bu kurallara
  uyma sorumluluğu kullanıcıya aittir.
- Canlı feed kullanımında rate-limit, erişim politikaları ve adil kullanım
  kuralları dikkate alınmalıdır.

## Yol haritası

- [ ] İETT gerçek-zamanlı varış aracı (`iett.IETTClient.hat_oto_konum` hazır; MCP aracı + önbellek kaldı)
- [ ] `transfers.txt` ile yürüme aktarmaları
- [ ] Çizelgeye duyarlı (zaman bağımlı) rota planlama
- [ ] Vapur/Şehir Hatları ve daha fazla hattın eklenmesi

## Lisans

MIT
