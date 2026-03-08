# Playwright MCP — Docker'da Çalıştırma

Cursor (veya başka MCP istemcisi) ile **Playwright MCP** sunucusunu Docker container olarak kullanmak için.

## Neden "Run" deyince kapanıyor?

Container inspect çıktısında `AttachStdin: false` / `OpenStdin: false` ise, MCP **stdio** (stdin/stdout) ile konuşamaz. Stdin kapalı olunca process hemen EOF alıp çıkar (ExitCode 0). Çözüm: **`-i`** (interactive) ile stdin’i açık tutmak.

## Doğru komut

Container’ın **sürekli açık kalıp** MCP protokolünü dinlemesi için stdin bağlı olmalı. Cursor bunu kendisi başlatır; elle denemek için:

```bash
docker run -i --rm mcp/playwright:latest
```

- **`-i`** — stdin’i açık tutar (MCP için zorunlu).
- **`--rm`** — bittiğinde container’ı siler.
- Image içinde zaten `--headless --browser chromium --no-sandbox` entrypoint ile geliyor.

Bu komutu terminalde çalıştırırsan process bekler (Cursor bağlanana kadar). Cursor’da kullanmak için aşağıdaki MCP ayarını kullan.

## Cursor MCP ayarı

Cursor’da Playwright MCP’yi Docker ile kullanmak için **Settings → Tools & MCP → Edit Config** (veya proje `.cursor/mcp.json` / kullanıcı MCP config):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "mcp/playwright:latest"
      ]
    }
  }
}
```

Cursor, bu komutu kendisi çalıştırır ve stdin/stdout’u MCP bağlantısına yönlendirir. `-i` sayesinde container kapanmaz.

## İsteğe bağlı: shared memory

Chromium bazen `/dev/shm` boyutundan şikayet eder. Hata alırsan:

```json
"args": [
  "run",
  "-i",
  "--rm",
  "--shm-size=256m",
  "mcp/playwright:latest"
]
```

## Özet

| Sorun | Çözüm |
|-------|--------|
| Container hemen exited (ExitCode 0) | `docker run`’a **`-i`** ekle. |
| Cursor’da MCP görünmüyor | MCP config’e yukarıdaki `command` + `args` ile ekle; Cursor’ı yeniden başlat. |
| Chromium /dev/shm hatası | `--shm-size=256m` ekle. |
