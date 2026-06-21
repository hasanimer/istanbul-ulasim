# istanbul-ulasim

İstanbul toplu taşıma (metro, metrobüs, Marmaray, tramvay, otobüs, vapur) için
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
| `hat_ara` | Hatları ada, numaraya veya türe göre arar (`M2`, `metro`, `vapur`, `marmaray`). |
| `durak_ara` | Durakları ada göre arar (`Taksim`, `Üsküdar`). Türkçe aksanlardan bağımsız. |
| `hat_duraklari` | Bir hattın duraklarını sırasıyla listeler; aktarma duraklarını işaretler. |
| `durak_kalkislari` | Bir duraktan verilen saatten sonraki kalkışları (çizelgeden) listeler. |
| `rota_bul` | İki durak arasında **en az aktarmalı** rotayı, bacak bacak önerir. |
| `ag_ozeti` | Yüklü GTFS verisinin özeti (kaynak, hat/durak sayıları, türler). |

## Kurulum

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

## Geliştirme

```bash
.venv/bin/python -m unittest discover -s tests      # testler
python scripts/make_sample_gtfs.py                  # örnek veriyi yeniden üret
```

### Proje yapısı

```
src/istanbul_ulasim/
  gtfs.py        GTFS yükleyici + sorgu modeli (dizin/zip/URL)
  routing.py     En az aktarmalı rota motoru (biniş grafiği üzerinde BFS)
  server.py      FastMCP sunucusu ve araç tanımları
  data/sample/   Gömülü örnek İstanbul GTFS verisi
scripts/
  make_sample_gtfs.py   Örnek veriyi üreten betik
tests/
  test_core.py   Çekirdek + protokol testleri
```

## Gömülü ağ

**14 hat, 163 durak (26 aktarma):**

- **Metro (11):** M1A, M1B, M2, M3, M4, M5, M6, M7, M8, M9, M11
- **Tren:** Marmaray (temsilî) · **BRT:** Metrobüs 34 (temsilî) · **Tramvay:** T1 (temsilî)

Aktarma noktaları gerçek istasyonlardır; örnekler: Yenikapı (M1A/M1B/M2/Marmaray),
Ayrılık Çeşmesi (M4/Marmaray), Bostancı (M4/M8/Marmaray), Gayrettepe (M2/M11),
Kağıthane (M7/M11), Mahmutbey (M3/M7), Mecidiyeköy (M2/M7/Metrobüs),
Üsküdar (M5/Marmaray), Sirkeci (Marmaray/T1).

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

## Yol haritası

- [ ] İETT gerçek-zamanlı varış (canlı "otobüs ne zaman gelecek") — opsiyonel araç
- [ ] `transfers.txt` ile yürüme aktarmaları
- [ ] Çizelgeye duyarlı (zaman bağımlı) rota planlama
- [ ] Vapur/Şehir Hatları ve daha fazla hattın eklenmesi

## Lisans

MIT
