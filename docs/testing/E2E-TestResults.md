# E2E Test Sonuçları

Bu dosya, **E2E testlerini yazan ve çalıştıran agent** tarafından güncellenir. Test planı `E2E-TestPlan.md` dosyasında tanımlıdır; burada yalnızca **çalıştırma sonuçları ve notlar** yer alır.

---

## Agent için kısa talimat

- **Ne zaman güncelle:** Yeni spec'ler yazdıktan veya mevcut spec'leri değiştirdikten sonra `npm run test:e2e` (veya `make test-e2e`) çalıştırdığında.
- **Nereye yaz:** Aşağıdaki "Çalıştırma geçmişi" bölümüne yeni bir satır/blok ekle.
- **Ne yaz:** Tarih, ortam (local/CI), hangi spec'lerin çalıştığı, toplam geçen/kalan/skip, hata varsa kısa açıklama ve (varsa) flaky/CI notları.

---

## Çalıştırma geçmişi

Aşağıdaki şablonu kopyalayıp her çalıştırma için doldur. En son çalıştırma en üstte olacak şekilde ekle.

---

### Şablon (bunu kopyala ve doldur)

```markdown
#### YYYY-MM-DD — [Local | CI] — [Kısa açıklama: örn. "Yeni registration + profile spec'leri eklendi"]

- **Ortam:** Local / CI (branch: …)
- **Komut:** `npm run test:e2e` (veya `make test-e2e`)
- **Toplam:** X passed, Y failed, Z skipped
- **Spec'ler:**
  - auth.spec.ts: … passed / … failed
  - registration.spec.ts: … (yeni)
  - …
- **Hatalar (varsa):** [Test adı] — [Kısa hata veya sebep]
- **Flaky / not:** …
```

---

### Örnek giriş

#### 2026-03-08 — Local — İlk sonuç şablonu (gerçek çalıştırma yapılmadı)

- **Ortam:** Local
- **Komut:** `npm run test:e2e`
- **Toplam:** (henüz çalıştırılmadı)
- **Spec'ler:** Mevcut 7 spec (auth, dashboard, service-detail, handshake, chat, group-chat, edit-locks)
- **Hatalar (varsa):** —
- **Flaky / not:** Bu dosya, testleri yazan agent tarafından doldurulacak.

---

## Spec bazlı özet (isteğe bağlı)

Agent isterse aşağıya, her spec dosyası için son durumu özetleyebilir (son çalıştırmadaki pass/fail sayısı).

| Spec | Son çalıştırma tarihi | Passed | Failed | Skipped | Notlar |
|------|----------------------|--------|--------|---------|--------|
| auth.spec.ts | — | — | — | — | — |
| dashboard.spec.ts | — | — | — | — | — |
| service-detail.spec.ts | — | — | — | — | — |
| handshake.spec.ts | — | — | — | — | — |
| chat.spec.ts | — | — | — | — | — |
| group-chat.spec.ts | — | — | — | — | — |
| edit-locks.spec.ts | — | — | — | — | — |
| registration.spec.ts | — | — | — | — | (yazılacak) |
| profile.spec.ts | — | — | — | — | (yazılacak) |
| post-offer-need.spec.ts | — | — | — | — | (yazılacak) |
| forum.spec.ts | — | — | — | — | (yazılacak) |
| transaction-history.spec.ts | — | — | — | — | (yazılacak) |
| notifications.spec.ts | — | — | — | — | (yazılacak) |
| achievements.spec.ts | — | — | — | — | (yazılacak) |
| not-found.spec.ts | — | — | — | — | (yazılacak) |

---

*Bu dosyayı güncelleyen agent, E2E-TestPlan.md'deki "Agent Yönergeleri"ni okumuş ve testleri buna göre yazıp sonuçları buraya işlemiş olmalıdır.*
