# E2E Frontend Test Plan

Bu belge, SWE-574-3 frontend için **Playwright E2E testlerinin** ne yazılacağını tanımlar. Testleri **yazan agent** bu dosyayı tek kaynak (source of truth) olarak kullanacak; yazdığı testlerin çalıştırma sonuçlarını ise **ayrı bir dosyada** raporlayacaktır.

---

## Agent Yönergeleri (Testleri Yazacak Agent İçin)

### Bu dosyayı okuduktan sonra yapman gerekenler

1. **Bu dosyayı (E2E-TestPlan.md) oku**  
   Tüm "Test Özellikleri" ve "Senaryo Listesi" bölümlerini incele. Mevcut spec'ler `frontend/tests/e2e/*.spec.ts` ve helper `frontend/tests/e2e/helpers/auth.ts` ile uyumlu ol.

2. **Sadece planda "Yazılacak" veya "Eklenecek" işaretli senaryoları implement et.**  
   "Mevcut" olarak işaretlenen senaryolar zaten var; onları silme veya yeniden yazma (sadece gerekirse refactor).

3. **Testleri yazarken:**
   - **Konum:** Tüm E2E spec'ler `frontend/tests/e2e/` altında, örn. `auth.spec.ts`, `registration.spec.ts`.
   - **Helper:** Demo kullanıcılar ve `loginAs`, `expectToast` için `./helpers/auth.ts` kullan. Yeni ortak sabitler (servis adları vb.) için `./helpers/demo-data.ts` oluşturabilirsin.
   - **Selector:** Öncelik sırası: `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText`. Gerekmedikçe `data-testid` ekleme.
   - **Demo veri:** Tüm testler `setup_demo.py` ile seed edilen kullanıcı/servis isimlerine dayanır (örn. `elif@demo.com`, "Traditional Manti Cooking Workshop"). [AGENTS.md](../../AGENTS.md) ve [auth.ts](../../frontend/tests/e2e/helpers/auth.ts) referans al.

4. **Testleri çalıştır:**  
   Proje kökünden `make test-e2e` veya `frontend/` içinde `npm run test:e2e`. Stack’in (backend, nginx, frontend) ayağa kalkmış ve demo seed’in yapılmış olması gerekir.

5. **Sonuçları raporla:**  
   **Test sonuçlarını ve notlarını `docs/testing/E2E-TestResults.md` dosyasına yaz.** Bu dosyada:
   - Hangi spec dosyalarını eklediğin / güncellediğin
   - Her spec için çalıştırma tarihi, geçen/kalan/skip sayısı
   - Hata alan testler varsa kısa açıklama ve (varsa) çözüm
   - Flaky veya CI’da dikkat edilmesi gereken testler

**Özet:** Bu MD = ne yazılacak; E2E-TestResults.md = ne çalıştırıldı, sonuç ne.

---

## Ortam ve Bağımlılıklar

| Öğe | Açıklama |
|-----|-----------|
| **Framework** | Playwright (`@playwright/test`), `frontend/playwright.config.ts` |
| **Test dizini** | `frontend/tests/e2e/` |
| **Demo veri** | `backend/setup_demo.py` — kullanıcılar: elif, cem, ayse, mehmet, zeynep, can, deniz, burak (@demo.com, şifre: demo123) |
| **Base URL** | CI: `http://localhost` (nginx); lokal: `PLAYWRIGHT_BASE_URL` ile override edilebilir |
| **Paralel** | `fullyParallel: false`, `workers: 1` (paylaşılan DB) |

---

## Run Takılıyorsa / Docker'da E2E (Sorun Giderme)

**Belirti:** `npm run test:e2e` veya Playwright çalıştırınca hiç ilerleme yok, süreç takılı kalıyor.

| Olası neden | Çözüm |
|-------------|--------|
| **Uygulama adresi yanlış** | Playwright `baseURL`'e gidemiyor. **Makinede (host) çalıştırıyorsan:** Önce stack ayakta olmalı (`make dev` veya `make docker-up`). Sonra `PLAYWRIGHT_BASE_URL=http://localhost` ile çalıştır (nginx 80’te ise `http://localhost`, sadece frontend 5173’te ise `http://localhost:5173`). |
| **Docker container *içinden* E2E çalıştırıyorsan** | Container içinde `localhost` = container’ın kendisi; uygulama orada yok. `PLAYWRIGHT_BASE_URL`’i uygulamanın gerçekten erişilebilir olduğu adrese ver: Linux’ta `http://host.docker.internal` (port gerekirse `:80`), aynı compose ağındaysa `http://nginx:80`. |
| **Chromium / bağımlılıklar yok** | Container veya minimal ortamda tarayıcı kurulmamış olabilir. Aynı ortamda (aynı container / aynı shell) şunu çalıştır: `npx playwright install --with-deps chromium`. |
| **Nerede takıldığını görmek** | `DEBUG=pw:api` ile çalıştır: `DEBUG=pw:api PLAYWRIGHT_BASE_URL=http://localhost npm run test:e2e`. Playwright’ın hangi isteği/navigation’ı beklediği loglarda görünür. |

**Önerilen çalıştırma (stack host’ta):**

```bash
# 1) Stack’i başlat (birini kullan)
make dev          # veya
make docker-up    # + gerekirse demo: make docker-demo

# 2) E2E’yi host’ta çalıştır (Docker kullanıyorsan port 80, native dev ise 5173)
cd frontend
npx playwright install --with-deps chromium
PLAYWRIGHT_BASE_URL=http://localhost npm run test:e2e
```

**Tam otomatik (stack + seed + E2E):** Proje kökünde `./scripts/quick-ci.sh e2e` — stack’i ayağa kaldırır, demo seed yapar, sonra Playwright’ı host’ta çalıştırır.

---

## Mevcut Spec Dosyaları (Değiştirme Sadece Gerekirse)

| Dosya | Kapsam |
|-------|--------|
| `auth.spec.ts` | Login (valid/invalid/empty), logout, protected redirect (/profile, /messages) |
| `dashboard.spec.ts` | Kartlar, lazy images, arama, filtre sekmeleri, polling crash yok |
| `service-detail.spec.ts` | Karttan tıklama, başlık/açıklama, lazy images, creator, direct URL |
| `handshake.spec.ts` | İlgi gösterme, toast, /messages’da konuşma, provider gelen istek, konuşma açma |
| `chat.spec.ts` | Liste, konuşma seçimi, mesaj gönderme, input temizleme |
| `group-chat.spec.ts` | GROUP badge, grup thread, mesaj gönderme |
| `edit-locks.spec.ts` | Sahip Offer oluşturma, düzenleme, handshake sonrası edit kilidi |

---

## Test Özellikleri ve Senaryo Listesi

Aşağıdaki tablolarda her modül için:
- **Mevcut:** Zaten yazılmış (sadece refactor/ci fix).
- **Eklenecek:** Mevcut spec dosyasına yeni test case ekle.
- **Yazılacak:** Yeni spec dosyası oluştur ve listelenen senaryoları yaz.

---

### 1. Auth (`auth.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 1.1 | Geçerli e-posta/şifre ile giriş → dashboard’a yönlendirme | Mevcut | FR-AUTH-01 | — |
| 1.2 | Yanlış şifre → hata mesajı, login sayfasında kalma | Mevcut | — | — |
| 1.3 | Boş e-posta → client-side validasyon, submit engelli | Mevcut | — | — |
| 1.4 | Giriş yapmış kullanıcı logout → korumalı sayfadan çıkış | Mevcut | FR-AUTH-02 | — |
| 1.5 | Giriş yapmadan /profile → /login redirect | Mevcut | FR-AUTH-05 | — |
| 1.6 | Giriş yapmadan /messages → /login redirect | Mevcut | FR-AUTH-05 | — |
| 1.7 | **Kayıt (register) happy path:** Form doldur (e-posta, şifre, ad soyad), submit → verify-email-sent veya dashboard’a yönlendirme | **Eklenecek** | FR-AUTH-03 | Backend e-posta doğrulama açıksa verify-email-sent sayfasına gidebilir. |

---

### 2. Registration (yeni spec: `registration.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 2.1 | /register sayfası açılır, form alanları (e-posta, şifre, ad, soyad) görünür | Yazılacak | FR-AUTH-03 | — |
| 2.2 | Zorunlu alan boş bırakılınca submit engellenir veya hata mesajı gösterilir | Yazılacak | — | — |
| 2.3 | Geçerli bilgilerle kayıt → başarı mesajı veya yönlendirme (verify-email-sent / dashboard) | Yazılacak | FR-AUTH-03 | Demo ortamda e-posta gönderimi yoksa doğrudan giriş de olabilir. |
| 2.4 | "Already have an account? Sign in" (veya benzeri) linki → /login’e gider | Yazılacak | — | — |

---

### 3. Dashboard (`dashboard.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 3.1 | Giriş yapmış kullanıcı servis kartları görür | Mevcut | — | — |
| 3.2 | Kartlardaki img’lerde loading="lazy" | Mevcut | — | — |
| 3.3 | Arama çubuğu var ve filtreler (örn. "Chess" yazınca ilgili kart görünür) | Mevcut | — | — |
| 3.4 | Filtre sekmeleri (All / Offers / Needs / Events) görünür ve tıklanabilir | Mevcut | — | — |
| 3.5 | Polling sayfa hatası oluşturmaz | Mevcut | — | — |
| 3.6 | **Offers sekmesi seçilince sadece Offer kartları (veya ilgili içerik) görünür** | Eklenecek | — | İsteğe bağlı; demo veriye bağlı. |

---

### 4. Service Detail (`service-detail.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 4.1 | Dashboard’dan kart tıklanınca /service-detail/:id açılır | Mevcut | AC: offer/request detail | — |
| 4.2 | Detay sayfasında başlık, açıklama, tip (Offer/Need/Event) görünür | Mevcut | — | — |
| 4.3 | Detay sayfasındaki img’ler loading="lazy" | Mevcut | — | — |
| 4.4 | Servis sahibi (creator) bilgisi görünür | Mevcut | — | — |
| 4.5 | Direct URL ile sayfa açılınca crash olmaz | Mevcut | — | — |
| 4.6 | **Servis sahibi giriş yapmışsa "Edit Listing" butonu görünür** | Eklenecek | — | Owner-only. |
| 4.7 | **Yorumlar bölümü yüklenir (en az boş liste veya mevcut yorumlar)** | Eklenecek | — | GET /services/:id/comments/ |

---

### 5. Handshake (`handshake.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 5.1 | İstekçi (requester) "Request this Service" / "Offer to Help" tıklar → toast, (idempotent ise "View Chat") | Mevcut | AC: exchange PENDING, chat opens | — |
| 5.2 | İstekçi /messages’da ilgili konuşmayı görür | Mevcut | — | — |
| 5.3 | Sağlayıcı (provider) kendi servis detayında gelen istekleri görür | Mevcut | — | — |
| 5.4 | Konuşma satırına tıklanınca mesaj thread’i ve input açılır | Mevcut | — | — |
| 5.5 | **Provider "Accept" tıklar → durum değişir (örn. Pending → Accepted), UI güncellenir veya toast** | Yazılacak | AC: provider accept | Demo’da bekleyen bir handshake ile test edilebilir. |
| 5.6 | **(Opsiyonel) Accept sonrası "Initiate" (tarih/yer) formu görünür veya doldurulabilir** | Yazılacak | AC: provider submit location/time | Zaman sınırı varsa atlanabilir. |

---

### 6. Chat (`chat.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 6.1 | /messages’da konuşma listesi yüklenir | Mevcut | — | — |
| 6.2 | Konuşma seçilince mesaj alanı (textarea) görünür | Mevcut | — | — |
| 6.3 | Mesaj yazıp Enter ile gönderilince thread’de görünür | Mevcut | — | — |
| 6.4 | Gönderim sonrası input temizlenir | Mevcut | — | — |
| 6.5 | Konuşma tıklanınca mesajlar ve input görünür | Mevcut | — | — |

---

### 7. Group Chat (`group-chat.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 7.1 | Çok katılımcılı serviste "GROUP" badge görünür | Mevcut | — | — |
| 7.2 | Grup satırına tıklanınca grup thread ve mesaj input’u açılır | Mevcut | — | — |
| 7.3 | Grup thread’ine mesaj gönderilir ve listede görünür | Mevcut | — | — |

---

### 8. Edit Locks (`edit-locks.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 8.1 | Sahip, kilitsiz Offer oluşturur, sonra düzenler, kaydeder → toast ve güncel başlık | Mevcut | — | — |
| 8.2 | Sahip, handshake sonrası ilgili kilitleri görür / düzenleyemez (mevcut akış) | Mevcut | — | — |

---

### 9. Profile (yeni spec: `profile.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 9.1 | /profile korumalı; giriş yapmadan erişim → /login | Yazılacak | FR-AUTH-05 | — |
| 9.2 | Giriş yapmış kullanıcı /profile’da kendi bilgilerini görür (ad, avatar veya balance alanı) | Yazılacak | FR-PRO-07 | — |
| 9.3 | Profil sekme/alanları (Offers, Needs, History vb.) görünür veya tıklanabilir | Yazılacak | — | — |
| 9.4 | /public-profile/:id ile başka kullanıcı profili açılır; sayfa başlığı veya kullanıcı adı görünür | Yazılacak | FR-PRO-09 | Demo’da elif, cem vb. id’leri kullanılabilir. |
| 9.5 | Public profilde "Message" (veya benzeri) butonu görünür (giriş yapmış kullanıcı için) | Yazılacak | — | — |

---

### 10. Post Offer / Post Need (yeni spec: `post-offer-need.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 10.1 | /post-offer korumalı; giriş yapmadan → /login | Yazılacak | FR-AUTH-05 | — |
| 10.2 | Giriş yapmış kullanıcı Post Offer formunu görür (title, description, duration, location type vb.) | Yazılacak | — | — |
| 10.3 | Zorunlu alanlar boşken submit engellenir veya hata gösterilir | Yazılacak | — | — |
| 10.4 | Geçerli Offer gönderilir → service-detail’e yönlendirme, toast; dashboard’da yeni kart görünür (veya liste yenilenir) | Yazılacak | AC: listing appears on public feed | edit-locks’taki form doldurma pattern’i referans al. |
| 10.5 | /post-need korumalı; form görünür | Yazılacak | — | — |
| 10.6 | Geçerli Need gönderilir → service-detail’e yönlendirme | Yazılacak | AC: request appears on feed | — |

---

### 11. Forum (yeni spec: `forum.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 11.1 | /forum (veya forum ana sayfası) açılır; kategori listesi veya topic listesi görünür | Yazılacak | — | Route yapısına göre /forum veya /forum/category/:slug. |
| 11.2 | Bir kategoriye tıklanınca topic listesi yüklenir | Yazılacak | — | — |
| 11.3 | Bir topic’e tıklanınca topic detay sayfası açılır (başlık, ilk post) | Yazılacak | — | — |
| 11.4 | Giriş yapmış kullanıcı "New Topic" (veya benzeri) butonunu görür; tıklanınca form sayfasına gider | Yazılacak | — | Protected route. |

---

### 12. Transaction History (yeni spec: `transaction-history.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 12.1 | /transaction-history korumalı; giriş yapmadan → /login | Yazılacak | FR-AUTH-05 | — |
| 12.2 | Giriş yapmış kullanıcı sayfayı açar; "Time Available" veya balance/ödeme ile ilgili başlık/kart görünür | Yazılacak | — | Time Activity sayfası. |
| 12.3 | Filtre veya sekme (All / Received / Shared vb.) görünür | Yazılacak | — | — |
| 12.4 | Liste (boş veya dolu) veya boş state mesajı görünür | Yazılacak | — | — |

---

### 13. Notifications (yeni spec: `notifications.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 13.1 | /notifications korumalı; giriş yapmadan → /login | Yazılacak | FR-AUTH-05 | — |
| 13.2 | Giriş yapmış kullanıcı bildirim listesini görür (boş veya dolu) | Yazılacak | — | — |
| 13.3 | (Opsiyonel) "Mark all as read" tıklanınca UI güncellenir veya toast | Yazılacak | — | — |

---

### 14. Achievements (yeni spec: `achievements.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 14.1 | /achievements korumalı; giriş yapmadan → /login | Yazılacak | FR-AUTH-05 | — |
| 14.2 | Giriş yapmış kullanıcı sayfayı açar; başarı/rozet kartları veya boş state görünür | Yazılacak | — | — |

---

### 15. Not Found (yeni spec: `not-found.spec.ts`)

| # | Senaryo | Durum | SRS/AC | Notlar |
|---|---------|--------|--------|--------|
| 15.1 | Bilinmeyen path (örn. /xyznonexistent) → 404 sayfası; "Go to Home" veya "Browse Services" (veya benzeri) linki görünür | Yazılacak | — | NotFoundPage. |

---

### 16. Opsiyonel / İleri Aşama

| # | Senaryo | Durum | Notlar |
|---|---------|--------|--------|
| 16.1 | Post Event formu ve event feed’de görünme | Opsiyonel | post-event.spec.ts |
| 16.2 | Admin kullanıcı ile /admin dashboard (smoke) | Opsiyonel | admin.spec.ts; demo’da admin kullanıcı gerekir. |
| 16.3 | Forgot password formu submit (e-posta gönderimi mock değilse sadece "request sent" mesajı) | Opsiyonel | auth veya forgot-password.spec.ts |

---

## Sonuç Raporlama (Agent İçin Tekrar)

Testleri yazıp çalıştırdıktan sonra:

1. **Dosya:** `docs/testing/E2E-TestResults.md`
2. **İçerik:** Tarih, spec adı, geçen/kalan/skip sayıları, hata özeti, flaky veya CI notları.
3. **Güncelle:** Her E2E çalıştırması veya önemli değişiklik sonrası bu dosyayı güncelle.

Şablon ve alanlar `E2E-TestResults.md` dosyasında verilmiştir.
