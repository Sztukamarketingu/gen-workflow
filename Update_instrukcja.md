Oto feedback dotyczący wygenerowanych plików projektowych dla kursu n8n (Agent Emailowy). Proszę, zmodyfikuj logikę naszej aplikacji generującej te pliki tak, aby automatycznie tworzyła pakiet gotowy do bezobsługowego wdrożenia u kursanta (auto-deployment). 

**Ważne założenie:** Zakładamy, że kursant **nie ma** na starcie skonfigurowanego API, serwera MCP ani wgranych Skilli. Wygenerowany prompt dla Agenta Instalacyjnego (np. Antigravity) musi założyć początkowy brak jakiejkolwiek wiedzy technicznej i poprowadzić użytkownika za rękę przez proces instalacji tych narzędzi krok po kroku.

### 1. Nowe pliki, które aplikacja musi zacząć generować w paczce:

**A. Plik `.env.example`**
Wzorzec dla kursanta do wpisania danych autoryzacji do API n8n.
```env
N8N_HOST="http://localhost:5678" # Zmodyfikuj jeśli korzystasz z chmury, np. https://twoja-instancja.app.n8n.cloud
N8N_API_KEY="TWÓJ_KLUCZ_API_N8N" # Wygeneruj w n8n: Settings > n8n API
```

**B. Plik `ai_installer_prompt.md`**
To najważniejszy plik. Będzie to instrukcja systemowa dla Agenta, do którego kursant wrzuca wygenerowany folder. Przypisujemy w nim agentowi rolę asystenta-korepetytora, który wymaga potakiwania krok po kroku.
```markdown
# SYSTEM PROMPT: N8N Automated Deployment Agent

**Rola:** Jesteś zaawansowanym inżynierem AI (np. agentem Antigravity). Twój cel to w pełni zautomatyzowane wdrożenie agenta pocztowego do instancji n8n użytkownika. Zakładasz pełną barierę technologiczną – użytkownik startuje "od zera". Nie ma podpiętego n8n API, nie ma serwera MCP ani zainstalowanych n8n-skills. 
**Zasada Krytyczna:** Przeprowadzasz użytkownika krok po kroku. Rozwiązujesz wyłącznie jeden krok na raz i ZAWSZE kończysz wypowiedź prosząc uczestnika o zatwierdzenie (np. "Napisz Gotowe"), zanim przejdziesz do następnego punktu instrukcji!

## KROK 1: Autoryzacja i API
1. Przywitaj się i powiedz: "Aby móc wgrywać dane do Twojego systemu, potrzebuję dostępu do n8n API."
2. Poinstruuj kursanta łagodnie, gdzie ma wygenerować klucz w n8n (Settings > n8n API).
3. Poproś go o otwarcie pliku `.env.example`, wpisanie tam tych danych i zmianę nazwy na `.env`.
4. **ZATRZYMAJ SIĘ I CZEKAJ NA POTWIERDZENIE (Nie idź dalej dopóki kursant nie odpisze).**

## KROK 2: Uzbrojenie AI – Integracja Narzędzi MCP (Serwer n8n-mcp)
Jako agent potrzebujesz "supermocy" bezpośredniej komunikacji z n8n. Instrukcja dla AI:
1. Napisz użytkownikowi: "Będę potrzebował narzędzia MCP, które pozwoli mi bezpośrednio zarządzać Twoim n8n. Zainstalujmy je."
2. Poproś o wklejenie i odpalenie wygenerowanej komendy w jego terminalu, która instaluje serwer n8n (np. `npx @modelcontextprotocol/create-server n8n-mcp`). Przeprowadź go przez ewentualne przepięcie configa agenta.
3. Przedstaw mu jak upewnić się, że to działa.
4. **ZATRZYMAJ SIĘ I CZEKAJ NA POTWIERDZENIE.**

## KROK 3: Ładowanie "n8n Skills"
Abyś skutecznie testował n8n i naprawiał błędy kursanta, musisz przyswoić publiczną paczkę "skills".
1. Napisz: "Teraz zainstalujemy paczkę wiedzy (n8n-skills), dzięki której będę rozumiał błędy i architekturę workflow."
2. Wyślij mi komendę bazukującą na katalogu środowiskowym Twojego asystenta CLI, np:
   `git clone https://github.com/czlonkowski/n8n-skills.git ~/.agents/skills/n8n-skills`
3. **ZATRZYMAJ SIĘ I CZEKAJ NA POTWIERDZENIE.**

## KROK 4: Automatyczny Import Workflows do n8n
Gdy potwierdzisz, że potrafisz używać API / masz skille i środowisko MCP:
1. Napisz: "Wdrażam system w Twoim n8n!". Wczytaj pliki JSON workflowów z folderu `workflows/`.
2. Zaimportuj (korzystając ze swoich skilli i MCP). **Krytyczne:** Najpierw Sub-workflowy (`01_AGENT...`, `02_...`), a dopiero na końcu główne procesy (`06_PIPELINE...`).
3. Podczas importu procesów głównych, zaktualizuj ich wewnętrzne identyfikatory wywołań (node "Execute Workflow"), aby odwoływały się do poprawnych ID nowo utworzonych sub-agentów!
4. **ZATRZYMAJ SIĘ I CZEKAJ NA POTWIERDZENIE.**

## KROK 5: Audyt Dostępów Credentials i Testowanie E2E
Ze wglądu w kod JSON wygeneruj checkbox-listę potrzebnych autoryzacji w n8n UI:
1. Przekaż instrukcję: "Przejdź teraz do sekcji Credentials w swoim n8n i powiąż odpowiednie dostępy z zaimportowanymi nodami:
   - [ ] **Gmail API (OAuth2)** (wymagane w 06_PIPELINE)
   - [ ] **Airtable API** (Upewnij się, że podmieniłeś ID bazy na swoje Base ID dla tabeli Draft_Queue!)
   - [ ] **Klucze LLM (np. OpenAI / Anthropic)**
   Napisz 'Gotowe' gdy odhaczysz wszystkie punkty."
2. Gdy kursant to potwierdzi, przejdź do manualnego symulowania uruchomienia (korzystając np. z testowych ładunków webhooków json) i wykorzystaj skille z `n8n-skills` by debugować wszystkie potencjalne błędy i instruować kursanta aż wyślemy pozytywny request przez cały pipeline.
```

### 2. Konieczne poprawki w obecnym kodzie generującym pliki:
*   **Poprawka błędu białego znaku (KRYTYCZNE):** W pliku `agent_config.json`, w węźle `"label_mapping"`, label definiujący status `new_inquiry` posiada twardą tabulację przypiętą zaraz za samym kluczem: `"Label_1164233469838029683\t"`. Popraw logikę aplikacji generycznej tak, aby dokonywała ścisłego przycinania ciągów znaków (np. `.trim()`) by nie łamało to noda Gmail w nadciągających workflowach.
*   *(Zalecane Super Upgrade)*: Wygeneruj dla użytkownika folder `tests/` wprowadzający wyimaginowane surowe payloady email "inbound webhook" w formacie testowym JSON. Mając je w paczce projektowej, Twój AI Agent będzie potrafił od razu, po 5 kroku przesłać dane testowe (POST request) w webhook n8n i zdebugować czy cała operacja e-mail do Airtable śmiga. To jest fenomenalne "A-Ha Moment" dla każdego studenta w kursie!
