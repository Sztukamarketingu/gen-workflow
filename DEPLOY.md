# Deploy n8n Generator Web na Hostinger VPS

## Subdomena
`gen-workflow.aikuznia.cloud`

## Wymagania
- Konto Hostinger z VPS
- Domena `aikuznia.cloud` zarządzana w Hostinger (DNS)
- Hostinger MCP skonfigurowany

## Wdrożenie

### 1. Push do GitHub
```bash
cd n8n-generator-web
git add .
git commit -m "Initial commit: n8n generator web"
git remote add origin https://github.com/TWOJ_USER/n8n-generator-web.git
git branch -M main
git push -u origin main
```

### 2. Utworzenie projektu na VPS
- Pobierz ID VM: `VPS_getVirtualMachinesV1`
- Utwórz projekt: `VPS_createNewProjectV1`
  - `virtualMachineId`: ID Twojego VPS
  - `project_name`: `n8n-generator-web`
  - `content`: `https://github.com/TWOJ_USER/n8n-generator-web`

### 3. Konfiguracja DNS (subdomena)
Dodaj rekord A dla `gen-workflow.aikuznia.cloud` wskazujący na IP Twojego VPS:
- `DNS_updateDNSRecordsV1` dla domeny `aikuznia.cloud`
- Rekord: `gen-workflow` → typ A → IP VPS

### 4. Uruchomienie projektu
- `VPS_startProjectV1` – uruchom kontener
- Aplikacja dostępna na: `http://gen-workflow.aikuznia.cloud` (po propagacji DNS)

## Lokalne testowanie Docker
```bash
docker-compose up --build
# Aplikacja: http://localhost:80
```
