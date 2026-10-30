# İstanbul Raylı Ağı

Metro, tramvay, füniküler ve banliyö ray geometrileri üzerinde keşif ve hareket simülasyonu.

## Çalıştırma

```sh
cd ~/Desktop/3d/istanbul-demo
npm install
npm run dev -- --host 127.0.0.1 --port 4621
```

http://127.0.0.1:4621 — harita altlığı için internet gerekir. `npm run build -- --base=./` ile production çıktısı `dist/` içine yazılır. HTML dosyasını çift tıklamak yerine HTTP sunucusu kullanın.

## Kullanım

- **Simgeler** menüsü: RAMS Park, Saracoğlu, Kız Kulesi, İST, SAW.
- **Saracoğlu:** OSM ilişkisi 1735806 (dış hat + çatı açıklığı) ve saha way 128542335'ten konum/yön/ölçü (`data/saracoglu-site.json`, `scripts/build-saracoglu.py`); RAMS Park ile aynı prosedürel stadyum modeli bu zarfa oturtulur (`createStadiumModel(options)`). Yükseklik (~36 m), tribün ve renkler yaklaşıktır. 12numara.org'daki model izin olmadığı için kullanılmadı.
- **SAW ayrıntıları:** fotoğraftan altı tonozlu ana salon çatısı (turkuaz kenar bantları), kırmızı bantlı iskele, kemerli kapı kuleleri ve körükler; terminalin OSM taban izine hizalı, ölçüler tahminî (`details` alanı).

- **Kız Kulesi** düğmesi: OSM bina parçalarından (yükseklik, kubbe, beşik çatı etiketleri; adacık kıyı çizgisi) renkli model (`data/kizkulesi-site.json`, `scripts/build-kizkulesi.py`). Renkler ve çatı eğimi yaklaşıktır. Kartta Görkem Guloglu'nun Sketchfab modeli yalnızca istek üzerine gömülü görüntüleyiciyle açılır; model indirilebilir olmadığı için dosyası projeye alınmamıştır.

- **SAW** düğmesi: Sabiha Gökçen terminal binaları OSM taban izlerinden (`data/saw-terminal.json`, `scripts/build-saw.py`). OSM'de yükseklik etiketi olmadığından yükseklikler tahminidir (ana terminal 24 m, yuvarlatılmış çatı) ve veride `estimatedHeight` olarak işaretlidir.
- **İST** düğmesi: İstanbul Havalimanı terminal binası, OSM 3B bina parçalarından (way 687768729 içindeki 713 `building:part`: 460 kubbe, 180 kolon, gövde ve çatı plakaları) gerçek yükseklikleriyle kurulur (`data/airport-terminal.json`, `scripts/build-airport.py`, `airport-model.js`). Zemin katı (10 m) yaklaşıktır; cephe ve cam ayrıntıları sadeleştirilmiştir. Altlıktaki genel bina blokları gizlenir (RAMS Park ile ortak maske, `building-mask.js`).

- **Metrobüs (34 / 34G koridoru):** Beylikdüzü Sondurak – Söğütlüçeşme, 44 istasyon, 52,6 km. Geometri İETT Hat Güzergahları verisinden (`34G_G_D0`), durak sırası ve uçtan uca süre İETT GTFS'ten (`data/metrobus.json`, `scripts/build-metrobus.py`). Raylı sistem değildir; ayrı "Metrobüs" kategorisindedir, rota planlamasına katılır. Metro İstanbul kesinti servisi metrobüsü kapsamaz.

- **Hizmet durumu:** açılışta Metro İstanbul `GetServiceStatuses` servisinden canlı kesinti duyuruları alınır. "İşletmeye kapalı" duyurusu olan hat askıya alınır (araç ve rota yok); kısmi hizmet duyurusu uyarı olarak gösterilir. Servis erişilemezse `data/service-info.json` içindeki son kayıt kullanılır ve bu belirtilir.
- **Süre tahmini:** hat bazlı ticari hız (İBB GTFS, Mart 2025, medyan) × gerçek güzergâh uzunluğu + aktarma başına 5 dk. Bekleme ve yürüme dahil değil. Yenilemek için: `python3 scripts/build-service-info.py <gtfs-csv-klasörü>`.
- **İstasyon olanakları:** durak kartında asansör / yürüyen merdiven / WC (Metro İstanbul `GetStations`); arıza durumunu göstermez.
- **Rota bul** sekmesi: iki durak arasında en az aktarmalı raylı rota. Rota, hatların gerçek geometrisinden kesilerek haritada çizilir; aktarma durakları işaretlenir. Sefer saati ve yürüme aktarmaları hesaplanmaz; süre tahminidir. Durak kaydı olmayan F2/F3, askıdaki B2 ve Metro İstanbul'un kapalı ilan ettiği hatlar rotalamaya katılmaz.
- **Yeraltı** düğmesi: altlığı karartır, OSM `tunnel=*` etiketli kesimleri yer altında şerit olarak çizer, yeraltı istasyonlarına şaft çizgisi ekler ve araçları tünel seviyesinde gösterir. Derinlik ölçülmüş değildir; okunabilirlik için yakınlaştırmaya göre abartılır.
- Hat kodu, hat adı veya durak adıyla arama; `/` aramayı açar, Escape seçimi/aramayı kapatır.
- Tür filtreleri: metro, tramvay, füniküler ve banliyö.
- Hat satırına tıklayarak odaklanma ve sağlanan durak listesini açma.
- Satırdaki görünürlük düğmesi kamerayı hareket ettirmeden hattı gizler/gösterir.
- Tüm ağ, 2D/3D, zoom/pusula; simülasyonu duraklat/devam ettir ve hız ayarı.
- Mobilde başlangıçta kapalı, açılabilir alt panel. Seçili hat parlak, diğerleri soluk gösterilir.

## Kapsam

24 güzergâh kaydı: 23 hat kodu ve M2'nin ayrı Seyrantepe kolu. M1A/M1B ayrı kayıttır.

- Metro: M1A, M1B, M2 (+ Seyrantepe kolu), M3, M4, M5, M6, M7, M8, M9, M11.
- Tramvay: T1, T2, T3, T4, T5.
- Füniküler: F1, F2, F3, F4.
- Banliyö/kentsel demiryolu: B1 Marmaray, B2 Halkalı–Bahçeşehir ve T6/U3 Sirkeci–Kazlıçeşme. T6 yalnızca bir kez sayılır.

B2, [TCDD'nin resmî duyurusu](https://www.tcddtasimacilik.gov.tr/tr/duyuru/detay/482) nedeniyle **seferlerine ara verilmiş** olarak etiketlenir; kesikli gösterilir ve üzerinde simüle araç çalıştırılmaz. Diğer hatların geçici günlük kesinti durumları canlı takip edilmez. Teleferikler TF1/TF2 raylı olmadığı için bu katmanda yoktur. İnşaat/proje hatları eklenmedi.

M5 geometrisi Sultanbeyli'ye, M11 Halkalı'ya ulaşır. Durak kayıtları OSM kaynağında bulunanları içerir; listeler resmî eksiksiz istasyon/tarife iddiası taşımaz. 24 güzergâhta 317 durak kaydı bulunur; aktarmalarda tekrarlanan kayıtlar vardır. F2/F3 için bu veri setinde durak kayıtları bulunmaz.

## Veri ve sınırlar

`data/rail-network.json`: 5.713 koordinat; gerçek OSM ray way/node dizileri. `data/osm-evidence/`: kullanılan ham XML kanıtları. Kaynak relation/way URL'leri ve lisanslar JSON'un `sourceNotes` alanındadır. Bütün ardışık koordinat çiftleri kaynak ray way kenarlarıyla eşleştirilmiştir; tahminî bağlantı veya duraklar arası spline yoktur.

Tüneller **yüzeye izdüşürülür**; Boğaz altındaki Marmaray güzergâhının su üzerinde görünmesi bu açıkça etiketlenmiş gösterim biçimidir, yüzeyde çalışan tren iddiası değildir. Araçlar canlı konum değil simülasyondur; boyutları görünürlük için büyütülür. OSM hizaları, özellikle yer altında, ölçüm hassasiyetinde değildir.

Kullanıcının `hasanimer/istanbul-ulasim` reposu incelendi; gömülü veri şekil geometrisi içermediğinden ray kaynağı olarak kullanılmadı. Uzak repoya değişiklik gönderilmedi. Eski T1 uygulaması `previous-t1/` altında korunur; eski `main.js` etkin ana ekran değildir. Yeni giriş `index.html` → `network-main.js`.

## Doğrulama

```sh
node --test network-polyline.test.js network-ui.test.js
python3 scripts/verify-network.py
npm run build -- --base=./
```

10 test geçti. 5.689 ardışık koordinat çifti ham OSM ray kenarlarıyla doğrulandı. Build başarılı; büyük bundle uyarısı var. Tarayıcıda 24 güzergâh, 73 simüle araç ve B2'de sıfır araç doğrulandı. Sultanbeyli araması M5'i buldu; odaklanma, görünürlük/kamera bağımsızlığı, duraklatma ve gerçek tıklamayla araç seçimi geçti. 1280×577 masaüstü ve 390×844 mobil kontrol edildi; yatay taşma yok. Mobil panel kapalıyken146px, açıkken yaklaşık549px. Yakalanan error/unhandledrejection yok.

## Atıflar

© OpenStreetMap contributors, ODbL1.0. Altlık: OpenFreeMap / OpenMapTiles / MapLibre. Ortak WebGL bağlamı ve kamera yaklaşımı Mini Tokyo3D (nagix/mini-tokyo-3d, MIT) araştırmasından uyarlanmıştır. Arayüzde kaynak atıfları korunur.
