# Deploy n8n Generator Web na Hostinger VPS

## Subdomena
`https://gen-workflow.aikuznia.cloud` (HTTPS via Let's Encrypt)

## Wymagania
- Konto Hostinger z VPS
- Domena `aikuznia.cloud` w Hostinger
- Projekt `root` z Traefikiem uruchomiony na VPS

## Wdrożenie

### 1. Push do GitHub
```bash
cd n8n-generator-web
git remote add origin https://github.com/TWOJ_USER/n8n-generator-web.git
git push -u origin main
```

### 2. Utworzenie projektu na VPS (Hostinger MCP)
- `VPS_createNewProjectV1`:
  - `virtualMachineId`: 1174852
  - `project_name`: n8n-generator-web
  - `content`: https://github.com/TWOJ_USER/n8n-generator-web

### 3. Uruchomienie
- `VPS_startProjectV1` – uruchom kontener
- Aplikacja: https://gen-workflow.aikuznia.cloud

## Konfiguracja
- **DNS**: Rekord A `gen-workflow` → 46.202.191.52 (już dodany)
- **Traefik**: Projekt łączy się z siecią `root_default`, certyfikat SSL automatycznie
