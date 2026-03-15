import workflow01 from '../templates/workflows/01_AGENT_Email_Classifier.json';
import workflow02 from '../templates/workflows/02_AGENT_Context_Builder.json';
import workflow03 from '../templates/workflows/03_AGENT_Response_Generator.json';
import workflow06 from '../templates/workflows/06_PIPELINE_Mail_Processing.json';
import workflow10 from '../templates/workflows/10_PIPELINE_Approval_Handler.json';
import workflow11 from '../templates/workflows/11_WORKFLOW_Feedback_Loop.json';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Central map to access raw templates
const templates: Record<string, any> = {
    '01_AGENT_Email_Classifier.json': workflow01,
    '02_AGENT_Context_Builder.json': workflow02,
    '03_AGENT_Response_Generator.json': workflow03,
    '06_PIPELINE_Mail_Processing.json': workflow06,
    '10_PIPELINE_Approval_Handler.json': workflow10,
    '11_WORKFLOW_Feedback_Loop.json': workflow11,
};

// 1. Config Builder
export function buildAgentConfig(formData: any) {
    return {
        business: formData.business_profile || {},
        channels: formData.channels_and_tools || {},
        intents: formData.intent_routing?.intents || [],
        label_mapping: (formData.intent_routing?.label_mapping || []).map((m: any) => ({
            intent: (m.intent || '').trim(),
            label_id: (m.label_id || '').trim()
        })),
        policy: formData.knowledge_and_policy || {},
        approval: formData.human_in_the_loop || {},
        security: formData.security_and_compliance || {},
        testing: formData.testing || {}
    };
}

// 2. Transformer
export async function generateWorkflows(config: any) {
    const generatedWorkflows: Record<string, any> = {};
    const extractedPrompts: Record<string, string> = {};

    // Deep clone helper
    const clone = (obj: any) => JSON.parse(JSON.stringify(obj));

    for (const [filename, templateObj] of Object.entries(templates)) {
        const wf = clone(templateObj);

        // Example Node manipulations 
        // 1. Pipeline Mail Processing Modifications
        if (filename.includes('06_PIPELINE_Mail_Processing')) {
            const emailProvider = config.channels?.email_provider || 'gmail';

            wf.nodes.forEach((node: any) => {
                // Find Switch Node for Routing Intents
                if (node.name === 'Mail Supervisor (Switch)' && node.typeVersion === 3) {
                    // Rebuild logic routes based on config.intents
                    const rules = config.intents.map((intent: any, index: number) => ({
                        conditions: {
                            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                            conditions: [{ id: `cond_${index}`, leftValue: '={{ $json.route_intent }}', rightValue: intent.route_key, operator: { type: 'string', operation: 'equals', singleValue: true } }],
                            combinator: 'and'
                        },
                        renameOutput: true,
                        outputKey: intent.route_key
                    }));

                    if (!node.parameters) node.parameters = {};
                    node.parameters.rules = { values: rules };
                }

                // Example logic for Provider change
                if (node.type === 'n8n-nodes-base.gmailTrigger' && emailProvider !== 'gmail') {
                    node.name = `${emailProvider.toUpperCase()} Trigger`;
                    node.type = `n8n-nodes-base.${emailProvider}Trigger`; // Naive mapping
                    delete node.credentials;
                }
            });
        }

        // 2. Extract AI Prompts to separate text files
        wf.nodes.forEach((node: any) => {
            if (node.type === 'n8n-nodes-base.openAi' || node.type === '@n8n/n8n-nodes-langchain.agent') {
                const messageValues = node.parameters?.messages?.messageValues;
                if (Array.isArray(messageValues) && messageValues.length > 0) {
                    const promptStr = messageValues[0].message;
                    if (typeof promptStr === 'string' && promptStr.length > 0) {
                        let processedPrompt = promptStr;
                        if (node.name === 'AI Classifier') {
                            processedPrompt = processedPrompt.replace('{{business_name}}', config.business?.business_name || 'Agencja ABC');
                        }

                        const promptFilename = `${node.name.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
                        extractedPrompts[promptFilename] = processedPrompt;

                        // Replace with explicit instruction placeholder for user/Antygravity
                        node.parameters.messages.messageValues[0].message = `=// UWAGA: Kliknij ikonę trybu "Expression" na tym polu i wklej zawartość pliku "prompts/${promptFilename}" ze swojego ZIPa.\n// Ten node potrzebuje tego promptu do działania.`;
                    }
                }
            }
        });

        generatedWorkflows[filename] = wf;
    }

    return { generatedWorkflows, extractedPrompts };
}

// 2b. ENV Example Generator
export function generateEnvExample(config: any): string {
    const host = config.channels?.n8n_host || 'http://localhost:5678';
    const storage = config.channels?.storage_backend || 'airtable';

    let storageVars = '';
    if (storage === 'airtable') {
        storageVars = `
# === Airtable ===
AIRTABLE_API_TOKEN="TWÓJ_PERSONAL_ACCESS_TOKEN" # Wygeneruj na: https://airtable.com/create/tokens (scope: data.records:read, data.records:write, schema.bases:read)
AIRTABLE_BASE_ID="appXXXXXXXXXXXXXX" # Znajdziesz w URL bazy: https://airtable.com/appXXX.../...
AIRTABLE_TABLE_NAME="Draft_Queue" # Nazwa tabeli z draftami
`;
    } else if (storage === 'postgres') {
        storageVars = `
# === PostgreSQL ===
PG_HOST="localhost"
PG_PORT="5432"
PG_DATABASE="email_agent"
PG_USER="TWÓJ_UŻYTKOWNIK"
PG_PASSWORD="TWOJE_HASŁO"
`;
    } else if (storage === 'google_sheets') {
        storageVars = `
# === Google Sheets ===
GOOGLE_SHEETS_SPREADSHEET_ID="TWOJE_ID_ARKUSZA" # Znajdziesz w URL: https://docs.google.com/spreadsheets/d/ID_TUTAJ/edit
GOOGLE_SHEETS_TAB_NAME="Draft_Queue"
`;
    }

    return `# Konfiguracja środowiska n8n dla: ${config.business?.business_name || 'Twoja Firma'}
# Skopiuj ten plik jako .env i uzupełnij wartości.

# === n8n API ===
N8N_HOST="${host}" # Zmodyfikuj jeśli korzystasz z chmury, np. https://twoja-instancja.app.n8n.cloud
N8N_API_KEY="TWÓJ_KLUCZ_API_N8N" # Wygeneruj w n8n: Settings > n8n API
${storageVars}`;
}

// 2c. AI Installer Prompt Generator
export function generateInstallerPrompt(config: any): string {
    const bizName = config.business?.business_name || 'Twoja Firma';
    const provider = config.channels?.email_provider || 'gmail';
    const storage = config.channels?.storage_backend || 'airtable';
    const approvalChannel = config.channels?.approval_channel || 'slack';

    const workflowFiles = [
        '01_AGENT_Email_Classifier.json',
        '02_AGENT_Context_Builder.json',
        '03_AGENT_Response_Generator.json',
        '06_PIPELINE_Mail_Processing.json',
        '10_PIPELINE_Approval_Handler.json',
        '11_WORKFLOW_Feedback_Loop.json'
    ];

    const credentialsList: string[] = [];
    if (provider === 'gmail') credentialsList.push('- [ ] **Gmail API (OAuth2)** — wymagane w 06_PIPELINE');
    else if (provider === 'outlook') credentialsList.push('- [ ] **Microsoft Outlook (OAuth2)** — wymagane w 06_PIPELINE');
    else credentialsList.push(`- [ ] **${provider.toUpperCase()} (IMAP/SMTP)** — wymagane w 06_PIPELINE`);

    if (storage === 'airtable') credentialsList.push('- [ ] **Airtable API** — Upewnij się, że podmieniłeś ID bazy na swoje Base ID dla tabeli Draft_Queue!');
    else if (storage === 'postgres') credentialsList.push('- [ ] **PostgreSQL** — podłącz bazę danych z tabelą Draft_Queue');
    else if (storage === 'google_sheets') credentialsList.push('- [ ] **Google Sheets (OAuth2)** — podłącz arkusz pełniący rolę Draft_Queue');

    credentialsList.push('- [ ] **Klucze LLM (np. OpenAI / Anthropic)** — wymagane we wszystkich agentach AI');

    if (approvalChannel === 'slack') credentialsList.push('- [ ] **Slack Bot Token** — kanał powiadomień o draftach');
    else if (approvalChannel === 'telegram') credentialsList.push('- [ ] **Telegram Bot API** — do wysyłki draftów do zatwierdzenia');
    else if (approvalChannel === 'google_chat') credentialsList.push('- [ ] **Google Chat Webhook** — kanał akceptacji');

    // Build storage setup step conditionally
    let storageStep = '';
    if (storage === 'airtable') {
        storageStep = `
---

## KROK 4: Konfiguracja Airtable – Baza Danych dla Draftów
Agent pocztowy potrzebuje tabeli w Airtable do przechowywania wygenerowanych odpowiedzi (draftów) przed wysłaniem.

1. Napisz użytkownikowi:
   *"Teraz skonfigurujemy Airtable jako bazę danych dla Twoich draftów e-mail. Przeprowadzę Cię przez to krok po kroku."*

2. **Tworzenie bazy i tabeli:**
   Poinstruuj kursanta:
   - Otwórz [airtable.com](https://airtable.com) i zaloguj się (lub utwórz darmowe konto).
   - Kliknij **"Add a base"** → nadaj jej nazwę np. **"${bizName} – Email Agent"**.
   - W nowej bazie zmień nazwę domyślnej tabeli na **\`Draft_Queue\`**.
   - Utwórz następujące kolumny (podaj kursantowi dokładne nazwy i typy):

   | Nazwa kolumny       | Typ w Airtable       | Opis                                    |
   |---------------------|----------------------|-----------------------------------------|
   | \`email_thread_id\`   | Single line text     | ID wątku email (klucz powiązania)       |
   | \`from_address\`      | Single line text     | Adres nadawcy oryginalnego maila        |
   | \`subject\`           | Single line text     | Temat wiadomości                        |
   | \`draft_body\`        | Long text            | Treść wygenerowanej odpowiedzi          |
   | \`status\`            | Single select        | Wartości: \`pending\`, \`approved\`, \`sent\`, \`rejected\` |
   | \`route_intent\`      | Single line text     | Rozpoznana intencja (np. new_inquiry)   |
   | \`created_at\`        | Created time         | Automatyczny timestamp utworzenia       |
   | \`approved_by\`       | Single line text     | Kto zatwierdził draft                   |

3. **Generowanie klucza API Airtable:**
   Poinstruuj kursanta:
   - Wejdź na [airtable.com/create/tokens](https://airtable.com/create/tokens).
   - Kliknij **"Create new token"**.
   - Nadaj nazwę np. **"n8n-email-agent"**.
   - Dodaj scope'y: \`data.records:read\`, \`data.records:write\`, \`schema.bases:read\`.
   - W sekcji **Access**, dodaj bazę którą właśnie utworzyłeś.
   - Skopiuj wygenerowany token (zaczyna się od \`pat...\`).

4. **Pobranie Base ID:**
   Poinstruuj kursanta:
   - Otwórz swoją bazę w Airtable.
   - Znajdź **Base ID** w URL: \`https://airtable.com/appXXXXXXXXXXXXXX/...\` → \`appXXXXXXXXXXXXXX\` to Twoje Base ID.

5. **Zapisanie danych w \`.env\`:**
   Poinstruuj kursanta:
   - Otwórz plik \`.env\` (który utworzyłeś w Kroku 1).
   - Uzupełnij pola:
     - \`AIRTABLE_API_TOKEN\` → wklej skopiowany token (zaczynający się od \`pat...\`)
     - \`AIRTABLE_BASE_ID\` → wklej Base ID (zaczynające się od \`app...\`)
     - \`AIRTABLE_TABLE_NAME\` → zostaw \`Draft_Queue\` (chyba że zmieniono nazwę tabeli)

6. **🛑 ZATRZYMAJ SIĘ I CZEKAJ NA POTWIERDZENIE.**
   Napisz: *"Potwierdź, że: (1) tabela Draft_Queue jest utworzona z powyższymi kolumnami, (2) token API i Base ID zostały wpisane do pliku .env. Napisz 'Gotowe'."*
`;
    } else if (storage === 'postgres') {
        storageStep = `
---

## KROK 4: Konfiguracja PostgreSQL – Baza Danych dla Draftów
1. Napisz: *"Teraz skonfigurujemy PostgreSQL jako bazę danych dla draftów email."*
2. Poinstruuj kursanta aby utworzył tabelę \`Draft_Queue\` z następującymi kolumnami:
   - \`id\` (SERIAL PRIMARY KEY)
   - \`email_thread_id\` (VARCHAR)
   - \`from_address\` (VARCHAR)
   - \`subject\` (VARCHAR)
   - \`draft_body\` (TEXT)
   - \`status\` (VARCHAR DEFAULT 'pending') — wartości: pending, approved, sent, rejected
   - \`route_intent\` (VARCHAR)
   - \`created_at\` (TIMESTAMP DEFAULT NOW())
   - \`approved_by\` (VARCHAR)
3. Poproś o dane połączenia: host, port, nazwę bazy, użytkownika i hasło.
4. **🛑 ZATRZYMAJ SIĘ I CZEKAJ NA POTWIERDZENIE.**
`;
    } else if (storage === 'google_sheets') {
        storageStep = `
---

## KROK 4: Konfiguracja Google Sheets – Arkusz dla Draftów
1. Napisz: *"Teraz skonfigurujemy Google Sheets jako bazę danych dla draftów email."*
2. Poinstruuj kursanta aby utworzył nowy arkusz Google z nagłówkami: \`email_thread_id\`, \`from_address\`, \`subject\`, \`draft_body\`, \`status\`, \`route_intent\`, \`created_at\`, \`approved_by\`.
3. Poproś o udostępnienie arkusza kontu serwisowemu Google lub podłączenie przez OAuth.
4. **🛑 ZATRZYMAJ SIĘ I CZEKAJ NA POTWIERDZENIE.**
`;
    }

    // Dynamic step numbering based on whether storage step exists
    const hasStorageStep = storageStep.length > 0;
    const importStepNum = hasStorageStep ? 5 : 4;
    const credentialsStepNum = hasStorageStep ? 6 : 5;

    return `# SYSTEM PROMPT: N8N Automated Deployment Agent

**Projekt:** ${bizName}
**Rola:** Jesteś zaawansowanym inżynierem AI (np. agentem Antigravity). Twój cel to w pełni zautomatyzowane wdrożenie agenta pocztowego do instancji n8n użytkownika. Zakładasz pełną barierę technologiczną – użytkownik startuje "od zera". Nie ma podpiętego n8n API, nie ma serwera MCP ani zainstalowanych n8n-skills.

**Zasada Krytyczna:** Przeprowadzasz użytkownika krok po kroku. Rozwiązujesz wyłącznie jeden krok na raz i **ZAWSZE** kończysz wypowiedź prosząc uczestnika o zatwierdzenie (np. *"Napisz Gotowe"*), zanim przejdziesz do następnego punktu instrukcji!

---

## KROK 1: Autoryzacja i API
1. Przywitaj się i powiedz: *"Aby móc wgrywać dane do Twojego systemu, potrzebuję dostępu do n8n API."*
2. Poinstruuj kursanta łagodnie, gdzie ma wygenerować klucz w n8n (**Settings \> n8n API**).
3. Poproś go o otwarcie pliku \`.env.example\`, wpisanie tam tych danych i zmianę nazwy na \`.env\`.
4. **🛑 ZATRZYMAJ SIĘ I CZEKAJ NA POTWIERDZENIE** (Nie idź dalej dopóki kursant nie odpisze).

---

## KROK 2: Uzbrojenie AI – Integracja Narzędzi MCP (Serwer n8n-mcp)
Jako agent potrzebujesz "supermocy" bezpośredniej komunikacji z n8n.
1. Napisz użytkownikowi: *"Będę potrzebował narzędzia MCP, które pozwoli mi bezpośrednio zarządzać Twoim n8n. Zainstalujmy je."*
2. Poproś o wklejenie i odpalenie wygenerowanej komendy w jego terminalu, która instaluje serwer n8n:
   \`\`\`bash
   npx @modelcontextprotocol/create-server n8n-mcp
   \`\`\`
   Przeprowadź go przez ewentualne przepięcie configa agenta.
3. Przedstaw mu jak upewnić się, że to działa (np. wywołanie testowe \`list_workflows\`).
4. **🛑 ZATRZYMAJ SIĘ I CZEKAJ NA POTWIERDZENIE.**

---

## KROK 3: Ładowanie "n8n Skills"
Abyś skutecznie testował n8n i naprawiał błędy, musisz przyswoić publiczną paczkę "skills".
1. Napisz: *"Teraz zainstalujemy paczkę wiedzy (n8n-skills), dzięki której będę rozumiał błędy i architekturę workflow."*
2. Wyślij komendę:
   \`\`\`bash
   git clone https://github.com/czlonkowski/n8n-skills.git ~/.agents/skills/n8n-skills
   \`\`\`
3. **🛑 ZATRZYMAJ SIĘ I CZEKAJ NA POTWIERDZENIE.**
${storageStep}
---

## KROK ${importStepNum}: Automatyczny Import Workflows do n8n
Gdy potwierdzono, że API/MCP/skille działają:
1. Napisz: *"Wdrażam system w Twoim n8n!"*
2. Wczytaj pliki JSON workflow z folderu \`workflows/\`:
${workflowFiles.map(f => `   - \`${f}\``).join('\n')}
3. **Krytyczne:** Najpierw importuj Sub-workflowy (\`01_AGENT...\`, \`02_...\`, \`03_...\`), a dopiero na końcu główne procesy (\`06_PIPELINE...\`, \`10_PIPELINE...\`, \`11_WORKFLOW...\`).
4. Podczas importu procesów głównych, zaktualizuj ich wewnętrzne identyfikatory wywołań (node "Execute Workflow"), aby odwoływały się do poprawnych ID nowo utworzonych sub-agentów!
5. **🛑 ZATRZYMAJ SIĘ I CZEKAJ NA POTWIERDZENIE.**

---

## KROK ${credentialsStepNum}: Audyt Dostępów Credentials i Testowanie E2E
Przekaż instrukcję:
*"Przejdź teraz do sekcji Credentials w swoim n8n i powiąż odpowiednie dostępy z zaimportowanymi nodami:"*

${credentialsList.join('\n')}

*"Napisz 'Gotowe' gdy odhaczysz wszystkie punkty."*

Gdy kursant to potwierdzi:
1. Przejdź do manualnego symulowania uruchomienia, korzystając z testowych ładunków z folderu \`tests/\`.
2. Wyślij POST request na webhook n8n z danymi z \`tests/test_new_inquiry.json\`.
3. Wykorzystaj skille z \`n8n-skills\` by debugować wszystkie potencjalne błędy.
4. Instruuj kursanta aż wyślemy pozytywny request przez cały pipeline.

---

> **Sukces!** Gdy cały pipeline przejdzie poprawnie, pogratuluj kursantowi i podsumuj co zostało wdrożone.
`;
}

// 2d. Test Payloads Generator
export function generateTestPayloads(config: any): Record<string, any> {
    const bizName = config.business?.business_name || 'Firma Testowa';
    const inboxAddress = config.channels?.email_inbox_address || 'kontakt@firma.pl';
    const intents = config.intents || [];

    const basePayload = (overrides: any) => ({
        headers: {
            from: overrides.from || 'klient@example.com',
            to: inboxAddress,
            subject: overrides.subject || 'Temat testowy',
            date: new Date().toISOString(),
            'message-id': `<test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com>`
        },
        body: {
            plain: overrides.body || 'Treść testowa',
            html: `<p>${overrides.body || 'Treść testowa'}</p>`
        },
        metadata: {
            labels: overrides.labels || [],
            thread_id: overrides.thread_id || `thread_${Date.now()}`,
            is_reply: overrides.is_reply || false
        }
    });

    const payloads: Record<string, any> = {};

    // Test 1: New inquiry
    const newInquiryIntent = intents.find((i: any) => i.route_key === 'new_inquiry');
    payloads['test_new_inquiry.json'] = basePayload({
        from: 'jan.kowalski@klient.pl',
        subject: `Zapytanie ofertowe do ${bizName}`,
        body: `Dzień dobry,\n\nChciałbym zapytać o Państwa ofertę. Interesuje mnie współpraca w zakresie usług, które Państwo oferujecie.\n\nProszę o przesłanie szczegółowej oferty cenowej.\n\nZ poważaniem,\nJan Kowalski\nFirma XYZ Sp. z o.o.`,
        labels: [],
        is_reply: false,
        _test_meta: {
            expected_intent: newInquiryIntent?.route_key || 'new_inquiry',
            expected_auto_reply: newInquiryIntent?.auto_reply_enabled ?? true,
            expected_approval: newInquiryIntent?.requires_approval ?? true,
            description: 'Nowe zapytanie ofertowe od potencjalnego klienta'
        }
    });

    // Test 2: Follow up
    const followUpIntent = intents.find((i: any) => i.route_key === 'follow_up');
    payloads['test_follow_up.json'] = basePayload({
        from: 'anna.nowak@partner.com',
        subject: `Re: Współpraca z ${bizName} - dokumenty`,
        body: `Dzień dobry,\n\nDziękuję za wcześniejszą odpowiedź. W nawiązaniu do naszej rozmowy, przesyłam dodatkowe pytania:\n\n1. Jaki jest termin realizacji?\n2. Czy jest możliwość negocjacji warunków?\n\nCzekam na informację.\n\nPozdrawiam,\nAnna Nowak`,
        thread_id: 'thread_existing_123',
        is_reply: true,
        _test_meta: {
            expected_intent: followUpIntent?.route_key || 'follow_up',
            expected_auto_reply: followUpIntent?.auto_reply_enabled ?? true,
            expected_approval: followUpIntent?.requires_approval ?? true,
            description: 'Kontynuacja istniejącego wątku z partnerem'
        }
    });

    // Test 3: Spam / Ignore
    const ignoreIntent = intents.find((i: any) => i.route_key === 'ignore');
    payloads['test_spam_ignore.json'] = basePayload({
        from: 'newsletter@massmailing.com',
        subject: '🔥 MEGA PROMOCJA - Tylko dziś -90%! Nie przegap!',
        body: 'Kliknij tutaj aby odebrać swoją nagrodę! Oferta ważna tylko 24h. Wypisz się klikając link poniżej.',
        labels: [],
        is_reply: false,
        _test_meta: {
            expected_intent: ignoreIntent?.route_key || 'ignore',
            expected_auto_reply: false,
            expected_approval: false,
            description: 'Spam / newsletter - powinien zostać zignorowany'
        }
    });

    return payloads;
}

// 3. Artifact Prompts & Checklist Creator
export function generateArtifacts(config: any) {
    const checklist = `
# N8N Email Agent - Instrukcja Wdrożenia

## 1. Konfiguracja Credentiali
Aplikacja została wygenerowana dla providera: **${config.channels?.email_provider}**. 
- Upewnij się, że w n8n dodałeś odpowiednie klucze dla "${config.channels?.email_inbox_address}".

## 2. Architektura bazy danych (${config.channels?.storage_backend})
Musisz założyć tabelę \`Draft_Queue\` w ${config.channels?.storage_backend} zawierającą kolumny:
- id (string)
- email_thread_id (string)
- draft_body (text)
- status (string)

## 3. Webhooki Akceptacji
Kanał akceptacji to **${config.channels?.approval_channel}**. 
- Podłącz publiczny URL pod Webhook w n8n dla \`10_PIPELINE_Approval_Handler.json\`.
`;

    const kb = `
# Knowledge Base & Polityka
Business: ${config.business?.business_name} (${config.business?.industry})
Ton: ${config.business?.brand_tone}

Zasady twarde:
${config.policy?.must_follow_rules || ''}

Polityka ofertowa/cenowa:
${config.policy?.pricing_and_offer_policy || ''}

SLA: ${config.policy?.sla_response_hours}h

=== Zewnętrzna Baza Wiedzy (FAQ / Materiały) ===
${(config.policy?.knowledge_base_entries || []).map((entry: any) => `
## ${entry.topic || 'Bez Tytułu'}
${entry.content_markdown || ''}
`).join('\\n')}
`;

    return {
        'instrukcja_wdrozenia.md': checklist,
        'knowledge_base.md': kb
    };
}

// 4. Zipper
export async function downloadZip(config: any) {
    const { generatedWorkflows: workflows, extractedPrompts } = await generateWorkflows(config);
    const artifacts = generateArtifacts(config);

    const zip = new JSZip();

    // Folders
    const workflowsFolder = zip.folder("workflows");
    const artifactsFolder = zip.folder("artifacts");
    const promptsFolder = zip.folder("prompts");
    const testsFolder = zip.folder("tests");

    // Add workflows
    for (const [filename, content] of Object.entries(workflows)) {
        workflowsFolder?.file(filename, JSON.stringify(content, null, 2));
    }

    // Add artifacts
    for (const [filename, content] of Object.entries(artifacts)) {
        artifactsFolder?.file(filename, content as string);
    }

    // Add external prompts
    for (const [filename, content] of Object.entries(extractedPrompts)) {
        promptsFolder?.file(filename, content as string);
    }

    // Raw config
    zip.file("agent_config.json", JSON.stringify(config, null, 2));

    // .env.example
    zip.file(".env.example", generateEnvExample(config));

    // AI Installer Prompt (the key step-by-step guide)
    zip.file("ai_installer_prompt.md", generateInstallerPrompt(config));

    // Test payloads
    const testPayloads = generateTestPayloads(config);
    for (const [filename, content] of Object.entries(testPayloads)) {
        testsFolder?.file(filename, JSON.stringify(content, null, 2));
    }

    // Generate and Download
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `n8n-agent-${config.business?.business_name?.replace(/\\s+/g, '-') || 'config'}.zip`);
}
