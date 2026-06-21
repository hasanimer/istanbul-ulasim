# istanbul-ulasim

İstanbul toplu taşıma (metro, metrobüs, Marmaray, tramvay, otobüs, vapur) için
**GTFS tabanlı bir MCP (Model Context Protocol) sunucusu**. Claude gibi MCP
destekleyen asistanların "Kadıköy'den Levent'e nasıl giderim?", "Yenikapı'dan
sıradaki metro ne zaman?" gibi soruları doğrudan yanıtlayabilmesini sağlar.

Veri kaynağı [GTFS](https://gtfs.org/) (General Transit Feed Specification)
standardıdır: hat, durak, sefer ve çizelge bilgisi açık CSV dosyalarından okunur.
Depoda gerçekçi **gömülü bir örnek İstanbul ağı** gelir; böylece sunucu, canlı
bir API'ye ihtiyaç duymadan çalışır ve test edilebilir. Çalışma anında gerçek
İBB feed'ine yönlendirilebilir (aşağıya bakın).

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

## Örnek ağ ve sınırlar

Gömülü örnek ağ 5 hat ve 32 durak içerir: **M2**, **M1B**, **Marmaray**,
**Metrobüs (34)**, **T1**. Aktarma noktaları gerçektir: Yenikapı (M1B/M2/
Marmaray), Sirkeci (Marmaray/T1), Söğütlüçeşme (Marmaray/Metrobüs).

- Rota motoru en az aktarmalı yolu bulur; zaman bağımlı tam bir planlayıcı
  (RAPTOR/CSA) değildir — "hangi hatlarla giderim" sorusuna yanıt verir.
- Örnek verideki koordinat ve sefer saatleri yaklaşıktır, yalnızca gösterim/
  test içindir. Gerçek planlama için resmî GTFS feed'ini kullanın.

## Yol haritası

- [ ] İETT gerçek-zamanlı varış (canlı "otobüs ne zaman gelecek") — opsiyonel araç
- [ ] `transfers.txt` ile yürüme aktarmaları
- [ ] Çizelgeye duyarlı (zaman bağımlı) rota planlama
- [ ] Vapur/Şehir Hatları ve daha fazla hattın eklenmesi

## Lisans

MIT
