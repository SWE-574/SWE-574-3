# Geolocation encryption posture (NFR-19c)

Status: **Accepted** — 2026-05-04
Closes: #326

## Decision

Transport-layer TLS is the chosen encryption boundary for user geolocation
coordinates (`Service.location_lat` / `location_lng`,
`Service.session_exact_location_lat` / `_lng`,
`Service.location` PostGIS PointField). **Field-level encryption at rest is
out of scope at MVP.**

## What "encrypted" already covers

- **In transit**: HTTPS-only via HSTS (`SECURE_HSTS_SECONDS = 31_536_000`,
  `SECURE_HSTS_INCLUDE_SUBDOMAINS=True`). The reverse proxy terminates TLS
  and forwards `X-Forwarded-Proto`, validated by
  `SECURE_PROXY_SSL_HEADER`. Coordinates leaving the API are always over
  TLS in production.
- **Access-controlled at read time**: `ServiceSerializer.to_representation`
  applies a deterministic ~1 km FNV-1a fuzz to `location_lat` / `location_lng`
  for everyone other than the owner. Distance values in the discovery feed
  are rounded to 500 m (#319 follow-up). Exact coordinates in
  `session_exact_location_*` are gated behind an accepted handshake.

## Why field-level encryption is **not** in scope

1. **Threat model.** Our concern is external attackers via the API surface,
   not a privileged DB attacker. For the latter, field-level encryption at
   rest only buys real protection if the keys live in a separate
   service (Vault transit, KMS) — we have neither today.
2. **Lossy data is the access control.** The fuzz happens on read, but the
   blur is large enough (~1 km) that even raw DB access yields imprecise
   coordinates from anyone except the owner. The "secret" worth protecting
   is mostly already obfuscated.
3. **PostGIS interaction.** `Service.location` is a PostGIS `PointField` used
   by the proximity filter and ranking pipeline. Encrypting it would force
   either application-side decryption before every spatial query (kills
   performance) or a sidecar plaintext column (defeats the point). Neither
   is acceptable at our scale.
4. **Operational cost.** Adding `django-encrypted-model-fields` or pgcrypto
   would introduce a key-rotation story, a backfill migration, and a CI
   secret to manage. None of that fits MVP.

## When to revisit

Re-open this ADR if **any** of the following becomes true:

- We add features whose threat model includes DB exfiltration as a primary
  vector (e.g. holding government-issued IDs or precise home addresses).
- Compliance requires encryption-at-rest for location data specifically
  (KVKK currently does not, given the fuzz layer).
- We add a managed KMS / Vault transit service to the platform; at that
  point, field-level encryption is cheap to opt into.

## Implementation notes for the future

If this ADR is reversed and field-level encryption is added:

- Use `django-cryptography` or pgcrypto-backed columns for `location_lat`
  and `location_lng`. Leave `Service.location` (PostGIS) un-encrypted to
  preserve spatial-index queryability, document the asymmetry, and
  treat the encrypted columns as the **canonical** source — `Service.location`
  becomes derived state, not authoritative.
- Decrypt at read time in `Service` model managers, before the fuzz logic
  in `ServiceSerializer` runs. The fuzz must operate on the plaintext
  value or it produces stable but useless output.
- Add a migration that decrypts → re-encrypts under the new key when the
  key rotates. Keep the old key around for 90 days.

## References

- `backend/hive_project/settings.py` — see the comment at the
  `SECURE_HSTS_SECONDS` block for a pointer back to this ADR.
- `backend/api/serializers.py` — `ServiceSerializer.to_representation` is
  where the fuzz is applied; any future encryption must run before it.
