import workflow01 from '../templates/workflows/01_AGENT_Email_Classifier.json';
import workflow02 from '../templates/workflows/02_AGENT_Context_Builder.json';
import workflow03 from '../templates/workflows/03_AGENT_Response_Generator.json';
import workflow06 from '../templates/workflows/06_PIPELINE_Mail_Processing.json';
import workflow10 from '../templates/workflows/10_PIPELINE_Approval_Handler.json';
import workflow11 from '../templates/workflows/11_WORKFLOW_Feedback_Loop.json';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const templates: Record<string, any> = {
    '01_AGENT_Email_Classifier.json': workflow01,
    '02_AGENT_Context_Builder.json': workflow02,
    '03_AGENT_Response_Generator.json': workflow03,
    '06_PIPELINE_Mail_Processing.json': workflow06,
    '10_PIPELINE_Approval_Handler.json': workflow10,
    '11_WORKFLOW_Feedback_Loop.json': workflow11,
};

// ─── Config Builder ───────────────────────────────────────────────────────────

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
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clone(obj: any): any {
    return JSON.parse(JSON.stringify(obj));
}

function findNode(nodes: any[], name: string): any | undefined {
    return nodes.find((n: any) => n.name === name);
}

function escapeBacktick(str: string): string {
    return (str || '').replace(/`/g, "'").replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
}

// ─── Knowledge Base String ────────────────────────────────────────────────────

function buildKnowledgeBaseString(config: any): string {
    const lines: string[] = [];

    if (config.policy?.must_follow_rules) {
        lines.push('ZASADY ODPOWIEDZI:');
        lines.push(config.policy.must_follow_rules.trim());
        lines.push('');
    }

    if (config.policy?.pricing_and_offer_policy) {
        lines.push('OFERTA I CENNIK:');
        lines.push(config.policy.pricing_and_offer_policy.trim());
        lines.push('');
    }

    const forbidden = config.policy?.forbidden_phrases || [];
    if (forbidden.length > 0) {
        lines.push('ZWROTY ZAKAZANE (nie używaj ich w żadnej odpowiedzi):');
        lines.push(forbidden.map((f: string) => `- ${f}`).join('\n'));
        lines.push('');
    }

    const intents = config.intents || [];
    if (intents.length > 0) {
        lines.push('INTENCJE I ROUTING:');
        intents.forEach((i: any) => {
            const approval = i.requires_approval ? 'wymaga akceptacji' : 'bez akceptacji';
            const reply = i.auto_reply_enabled ? 'odpowiada AI' : 'ignoruje';
            lines.push(`- ${i.route_key}: ${i.description} [${reply}, ${approval}]`);
        });
        lines.push('');
    }

    const entries = config.policy?.knowledge_base_entries || [];
    if (entries.length > 0) {
        lines.push('=== BAZA WIEDZY (FAQ) ===');
        entries.forEach((e: any) => {
            if (e.topic) lines.push(`\n## ${e.topic}`);
            if (e.content_markdown) lines.push(e.content_markdown.trim());
        });
    }

    return lines.join('\n').trim();
}

// ─── Normalize Intent Code ────────────────────────────────────────────────────

function buildNormalizeIntentCode(config: any): string {
    const intents = config.intents || [];
    const allRouteKeys = intents.map((i: any) => i.route_key);
    const ignoreKeys = intents
        .filter((i: any) => !i.auto_reply_enabled)
        .map((i: any) => i.route_key);
    const defaultIgnore = ignoreKeys[0] || 'ignore';
    const defaultReply = intents.find((i: any) => i.auto_reply_enabled)?.route_key || 'new_inquiry';

    const labelsObj: Record<string, string> = {};
    (config.label_mapping || []).forEach((m: any) => {
        if (m.intent && m.label_id) labelsObj[m.intent] = m.label_id;
    });

    return `const item = $input.first().json || {};
const cls = item.classification || {};
const intent = String(cls.intent || '').toLowerCase();
const configuredIntents = ${JSON.stringify(allRouteKeys)};
const ignoreKeys = ${JSON.stringify(ignoreKeys)};
const defaultIgnore = ${JSON.stringify(defaultIgnore)};
const defaultReply = ${JSON.stringify(defaultReply)};
const LABELS = ${JSON.stringify(labelsObj)};

const email = ($('Get Full Email').item || {}).json || {};
const senderRaw = String(email.from || email.From || '').toLowerCase();
const subject = String(email.subject || email.Subject || '').toLowerCase();
const nonBusiness = ['noreply', 'no-reply', 'google cloud', 'cloudplatform', 'security-noreply', 'account-security', 'policy update'];
const isSystem = nonBusiness.some(function(p) { return senderRaw.indexOf(p) !== -1 || subject.indexOf(p) !== -1; });

let route_intent = defaultReply;
if (isSystem) {
  route_intent = defaultIgnore;
} else if (configuredIntents.indexOf(intent) !== -1) {
  route_intent = intent;
} else if (intent === 'follow_up' || intent === 'followup' || intent === 'reply') {
  route_intent = configuredIntents.indexOf('follow_up') !== -1 ? 'follow_up' : defaultReply;
} else if (intent === 'formalnosci' || intent === 'confirmation') {
  route_intent = configuredIntents.indexOf('formalnosci') !== -1 ? 'formalnosci' : defaultReply;
} else if (ignoreKeys.indexOf(intent) !== -1) {
  route_intent = intent;
}

const label_id = (item.classification || {}).label_id || LABELS[route_intent] || '';
return {
  json: Object.assign({}, item, {
    classification: Object.assign({}, item.classification, { label_id: label_id }),
    route_intent: route_intent,
    route_reason: isSystem ? 'system_or_non_business' : 'intent_based'
  })
};`;
}

// ─── Switch Rules ─────────────────────────────────────────────────────────────

function buildSwitchRules(config: any): any[] {
    const intents = config.intents || [];
    return intents.map((intent: any, index: number) => ({
        conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
            conditions: [{
                id: `cond_${index}`,
                leftValue: '={{ $json.route_intent }}',
                rightValue: intent.route_key,
                operator: { type: 'string', operation: 'equals', singleValue: true }
            }],
            combinator: 'and'
        },
        renameOutput: true,
        outputKey: intent.route_key
    }));
}

// ─── Prepare for Draft Auditor code ──────────────────────────────────────────

function buildPrepareForDraftAuditorCode(config: any): string {
    const sig = escapeBacktick(config.business?.email_signature || 'Z poważaniem');
    return `const handler = ($('Merge Handler Outputs').item || {}).json || {};
const rg = $input.first().json || {};
const routeIntent = String(handler.route_intent || '').toLowerCase();
const isFormalnosci = routeIntent === 'formalnosci' || routeIntent === 'confirmation';
let subj = handler.draft && handler.draft.draft_subject ? handler.draft.draft_subject : ('RE: ' + ((handler.email && (handler.email.subject || handler.email.Subject)) || ''));
if (!isFormalnosci && rg.draft_subject) subj = rg.draft_subject;
const SIGNATURE = \`${sig}\`;
const FORMALNOSCI_BODY = 'Dzień dobry,\\n\\nPotwierdzam odbiór wiadomości. Dziękuję.\\n\\n' + SIGNATURE;
let body = rg.draft_body;
if (isFormalnosci) {
  body = FORMALNOSCI_BODY;
} else if (!body) {
  body = 'Dzień dobry,\\n\\nDziękuję za wiadomość. Wrócę z odpowiedzią.\\n\\n' + SIGNATURE;
}
const draft = { draft_subject: subj, draft_body: body };
return { json: Object.assign({}, handler, { draft: draft }) };`;
}

// ─── Draft Auditor code ───────────────────────────────────────────────────────

function buildDraftAuditorCode(config: any): string {
    const sig = escapeBacktick(config.business?.email_signature || 'Z poważaniem');
    return `const item = $input.first().json || {};
const draft = item.draft || {};
const cls = item.classification || {};
const routeIntent = String(item.route_intent || '').toLowerCase();
let subject = String(draft.draft_subject || '').trim();
let body = String(draft.draft_body || '').replace(/\\\\n/g, '\\n').replace(/\\r\\n/g, '\\n').trim();
const SIGNATURE = \`${sig}\`;
if (!subject) {
  const src = (item.email && (item.email.subject || item.email.Subject)) || item.subject || 'Wiadomość';
  subject = 'RE: ' + src;
}
if (!body) {
  body = 'Dzień dobry,\\n\\nDziękuję za wiadomość. Wrócę z odpowiedzią najszybciej jak to możliwe.\\n\\n' + SIGNATURE;
}
function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const draft_body_html = body.split(/\\n\\n+/).map(function(p) { return p.trim(); }).filter(Boolean).map(function(p) { return '<p>' + escHtml(p) + '</p>'; }).join('');
return { json: Object.assign({}, item, { draft: Object.assign({}, draft, { draft_subject: subject, draft_body: body, draft_body_html: draft_body_html }), audit: { formatted: true, route_intent: routeIntent } }) };`;
}

// ─── Inject Workflow 06 ───────────────────────────────────────────────────────

function injectWorkflow06(wf: any, config: any): void {
    const nodes = wf.nodes;

    // Load Knowledge — replace KB
    const loadKnowledge = findNode(nodes, 'Load Knowledge');
    if (loadKnowledge) {
        const kb = escapeBacktick(buildKnowledgeBaseString(config));
        loadKnowledge.parameters.jsCode = `const item = $input.first().json || {};\nconst KB = \`${kb}\`;\nreturn { json: Object.assign({}, item, { knowledge_context: KB }) };`;
    }

    // Resolve Label ID — inject label mapping
    const resolveLabel = findNode(nodes, 'Resolve Label ID');
    if (resolveLabel) {
        const labelsObj: Record<string, string> = {};
        (config.label_mapping || []).forEach((m: any) => {
            if (m.intent && m.label_id) labelsObj[m.intent] = m.label_id;
        });
        resolveLabel.parameters.jsCode = `const item = $input.first().json || {};\nconst cls = item.classification || {};\nconst intent = String(cls.intent || '').toLowerCase();\nconst LABELS = ${JSON.stringify(labelsObj)};\nconst label_id = cls.label_id || LABELS[intent] || '';\nreturn { json: Object.assign({}, item, { classification: Object.assign({}, cls, { label_id: label_id }) }) };`;
    }

    // Normalize Intent — rebuild with user's intents
    const normalizeIntent = findNode(nodes, 'Normalize Intent');
    if (normalizeIntent) {
        normalizeIntent.parameters.jsCode = buildNormalizeIntentCode(config);
    }

    // Mail Supervisor Switch — rebuild rules
    const mailSupervisor = findNode(nodes, 'Mail Supervisor (Switch)');
    if (mailSupervisor) {
        if (!mailSupervisor.parameters) mailSupervisor.parameters = {};
        mailSupervisor.parameters.rules = { values: buildSwitchRules(config) };
    }

    // Handlers — fix optional chaining
    const handlerNodes = ['HANDLER: New Inquiry', 'HANDLER: Follow-up', 'HANDLER: Artist Response', 'HANDLER: Formalnosci'];
    handlerNodes.forEach(name => {
        const node = findNode(nodes, name);
        if (node && node.parameters?.jsCode) {
            node.parameters.jsCode = node.parameters.jsCode
                .replace(/\$\('([^']+)'\)\.item\?\./g, "(\$('$1').item || {}).")
                .replace(/\?\./g, ' && ');
        }
    });

    // IGNORE: Non-Business — fix optional chaining
    const ignoreNode = findNode(nodes, 'IGNORE: Non-Business');
    if (ignoreNode && ignoreNode.parameters?.jsCode) {
        ignoreNode.parameters.jsCode = ignoreNode.parameters.jsCode
            .replace(/\$\('([^']+)'\)\.item\?\./g, "(\$('$1').item || {}).")
            .replace(/\?\./g, ' && ');
    }

    // Prepare for Draft Auditor — inject signature, fix optional chaining
    const prepareNode = findNode(nodes, 'Prepare for Draft Auditor');
    if (prepareNode) {
        prepareNode.parameters.jsCode = buildPrepareForDraftAuditorCode(config);
    }

    // Draft Auditor — inject signature
    const auditorNode = findNode(nodes, 'Draft Auditor');
    if (auditorNode) {
        auditorNode.parameters.jsCode = buildDraftAuditorCode(config);
    }

    // Execute Response Generator — fix optional chaining in expressions
    const execRespGen = findNode(nodes, 'Execute Response Generator');
    if (execRespGen) {
        const vals = (execRespGen.parameters?.workflowInputs?.value) || {};
        if (vals.artists) {
            vals.artists = "={{ $json.matched_artists || [] }}";
        }
        if (vals.tone) {
            vals.tone = "={{ (($json.classification || {}).detected_tone || 'semi_formal') }}";
        }
        if (vals.email_subject) {
            vals.email_subject = "={{ (($json.email || {}).subject || ($json.email || {}).Subject || '') }}";
        }
        if (vals.knowledge_context) {
            vals.knowledge_context = "={{ ($('Prepare Analyzer Input').item || {}).json && ($('Prepare Analyzer Input').item || {}).json.knowledge_context || '' }}";
        }
    }

    // Add Gmail Label — fix optional chaining in labelIds
    const addLabelNode = findNode(nodes, 'Add Gmail Label');
    if (addLabelNode && addLabelNode.parameters?.labelIds) {
        addLabelNode.parameters.labelIds = "={{ ((($('Resolve Label ID').item || {}).json || {}).classification || {}).label_id || '' }}";
    }

    // Store Draft in Airtable — inject base ID
    const storeNode = findNode(nodes, 'Store Draft in Airtable');
    if (storeNode) {
        storeNode.parameters.base = config.channels?.airtable_base_id || 'appXXXXXXXXXXXXXX';
    }

    // Send Interactive Approval Card — inject space ID
    const chatNode = findNode(nodes, 'Send Interactive Approval Card');
    if (chatNode) {
        const spaceId = config.channels?.google_chat_space_id || 'spaces/YOUR_SPACE_ID';
        chatNode.parameters.spaceId = spaceId;
    }

    // IF Has Label ID — fix optional chaining in condition expression
    const ifLabel = findNode(nodes, 'IF Has Label ID');
    if (ifLabel) {
        const conditions = (ifLabel.parameters?.conditions?.conditions) || [];
        conditions.forEach((c: any) => {
            if (c.leftValue && c.leftValue.includes('?.')) {
                c.leftValue = "={{ ($json.classification || {}).label_id || '' }}";
            }
        });
    }
}

// ─── Inject Workflow 10 ───────────────────────────────────────────────────────

function injectWorkflow10(wf: any, config: any): void {
    const nodes = wf.nodes;
    const baseId = config.channels?.airtable_base_id || 'appXXXXXXXXXXXXXX';
    const spaceId = config.channels?.google_chat_space_id || 'spaces/YOUR_SPACE_ID';
    const prefix = (config.channels?.webhook_prefix || 'agent').replace(/[^a-z0-9-]/gi, '-').toLowerCase();

    // Webhook path
    const webhookNode = findNode(nodes, 'Google Chat Action Webhook');
    if (webhookNode) {
        webhookNode.parameters.path = `${prefix}-approval`;
        webhookNode.webhookId = `${prefix}-approval-webhook`;
    }

    // Airtable base ID in all nodes
    nodes.forEach((node: any) => {
        if (node.type === 'n8n-nodes-base.airtable' && node.parameters?.base) {
            node.parameters.base = baseId;
        }
    });

    // APPROVE: Send Gmail — add HTML formatting
    const sendGmail = findNode(nodes, 'APPROVE: Send Gmail');
    if (sendGmail) {
        sendGmail.parameters.message = "={{ ('<p>' + ($json.draft_body || '')).split('\\n\\n').join('</p><p>').split('\\n').join('<br>') + '</p>' }}";
        if (!sendGmail.parameters.options) sendGmail.parameters.options = {};
        sendGmail.parameters.options.bodyContentType = 'html';
    }

    // EDIT: Show Feedback Form — inject space URL
    const editNode = findNode(nodes, 'EDIT: Show Feedback Form');
    if (editNode) {
        editNode.parameters.url = `https://chat.googleapis.com/v1/${spaceId}/messages`;
    }

    // Fix optional chaining in Parse Action Data
    const parseNode = findNode(nodes, 'Parse Action Data');
    if (parseNode && parseNode.parameters?.jsCode) {
        parseNode.parameters.jsCode = parseNode.parameters.jsCode.replace(/\?\./g, ' && (') + ')';
        // Use a cleaner replacement
        parseNode.parameters.jsCode = `const webhook = $input.first().json;
const action = (webhook.action && webhook.action.function) || (webhook.commonEventObject && webhook.commonEventObject.invokedFunction) || 'unknown';
const params = (webhook.action && webhook.action.parameters) || (webhook.commonEventObject && webhook.commonEventObject.parameters) || [];
let draft_id;
if (Array.isArray(params)) {
  const draftParam = params.find(function(p) { return p.key === 'draft_id'; });
  draft_id = draftParam && draftParam.value;
} else {
  draft_id = params.draft_id;
}
const user_email = (webhook.user && webhook.user.email) || (webhook.user && webhook.user.name) || 'unknown';
const user_name = (webhook.user && webhook.user.displayName) || (webhook.user && webhook.user.name) || 'Unknown User';
return {
  json: {
    action: action.replace('_draft', ''),
    draft_id: draft_id,
    user_email: user_email,
    user_name: user_name,
    raw_webhook: webhook
  }
};`;
    }

    // Fix optional chaining in EDIT: Call Feedback Loop workflowInputs
    const feedbackLoopNode = findNode(nodes, 'EDIT: Call Feedback Loop');
    if (feedbackLoopNode) {
        const vals = (feedbackLoopNode.parameters?.workflowInputs?.value) || {};
        if (vals.feedback_text && vals.feedback_text.includes('?.')) {
            const base = "(($('Parse Action Data').item || {}).json || {}).raw_webhook || {}";
            vals.feedback_text = `={{ (((((${base}).commonEventObject || {}).formInputs || {}).feedback || {}).stringInputs || {}).value || [])[0] || 'Brak danych' }}`;
        }
    }
}

// ─── Inject Workflow 11 ───────────────────────────────────────────────────────

function injectWorkflow11(wf: any, config: any): void {
    const nodes = wf.nodes;
    const baseId = config.channels?.airtable_base_id || 'appXXXXXXXXXXXXXX';
    const spaceId = config.channels?.google_chat_space_id || 'spaces/YOUR_SPACE_ID';

    // Airtable base ID in all airtable nodes
    nodes.forEach((node: any) => {
        if (node.type === 'n8n-nodes-base.airtable' && node.parameters?.base) {
            node.parameters.base = baseId;
        }
    });

    // Send Updated Draft for Approval — inject space URL
    const sendNode = findNode(nodes, 'Send Updated Draft for Approval');
    if (sendNode) {
        sendNode.parameters.url = `https://chat.googleapis.com/v1/${spaceId}/messages`;
    }
}

// ─── AI Prompt Generators ─────────────────────────────────────────────────────

function generateClassifierPrompt(config: any): string {
    const bizName = config.business?.business_name || 'firma';
    const intents = config.intents || [];
    const intentLines = intents.map((i: any) => `- ${i.route_key} — ${i.description}`).join('\n');
    const labelLines = (config.label_mapping || []).length > 0
        ? '\n**LABEL_ID (Gmail — przypisz do intent):**\n' + config.label_mapping.map((m: any) => `- ${m.label_id} = ${m.intent}`).join('\n')
        : '';

    return `Analizuj TYLKO aktualną wiadomość (treść i temat). Klasyfikuj email dla firmy: ${bizName}.

**INTENCJE — wybierz jedną:**
${intentLines}

**SENDER_ROLE:** client | partner | vendor | other
**DETECTED_TONE:** formal | semi_formal | informal
**CONVERSATION_STAGE:** initial | negotiation | closing | follow_up
**URGENCY:** low | medium | high | urgent
${labelLines}

{{ $('Execute Workflow Trigger').first().json.knowledge_context ? '**ZASADY DO STOSOWANIA:**\\n' + $('Execute Workflow Trigger').first().json.knowledge_context + '\\n\\n' : '' }}

**EMAIL:**
Od: {{ $('Execute Workflow Trigger').first().json.sender_email }}
Temat: {{ $('Execute Workflow Trigger').first().json.subject }}

Treść:
{{ $('Execute Workflow Trigger').first().json.content }}

---

Zwróć TYLKO JSON (bez dodatkowego tekstu):

{
  "intent": "${intents[0]?.route_key || 'new_inquiry'}",
  "sender_role": "client",
  "detected_tone": "semi_formal",
  "conversation_stage": "initial",
  "urgency": "medium",
  "label_id": "",
  "confidence": 0.9
}`;
}

function generateContextBuilderPrompt(config: any): string {
    const bizName = config.business?.business_name || 'firma';
    const lang = config.business?.language_primary || 'pl';

    return `SYSTEM: Jesteś ekspertem w analizie emaili dla firmy ${bizName}.
Ekstrahuj dane, przygotuj podsumowanie i wygeneruj response_guidance — wytyczne jak odpowiadać.
Odpowiadaj w języku: ${lang}.

{{ $('Execute Workflow Trigger').first().json.knowledge_context ? '**ZASADY DO STOSOWANIA (BAZA WIEDZY):**\\n' + $('Execute Workflow Trigger').first().json.knowledge_context + '\\n\\n' : '' }}

**INPUT:**
Klasyfikacja: {{ JSON.stringify($('Execute Workflow Trigger').first().json.classification) }}

Email:
Od: {{ $('Execute Workflow Trigger').first().json.sender_email || '' }}
Temat: {{ $('Execute Workflow Trigger').first().json.subject || '' }}

Treść:
{{ $('Execute Workflow Trigger').first().json.content }}

{{ $('Execute Workflow Trigger').first().json.thread_history ? 'Historia wątku:\\n' + $('Execute Workflow Trigger').first().json.thread_history : '' }}

---

Zwróć JSON z polami:
- summary: podsumowanie (2-3 zdania)
- participants: [{email, name, role}]
- key_information: {dates_mentioned[], questions_asked[], requirements[]}
- client_name, client_email, client_phone
- is_continuation: bool
- missing_information: []
- recommended_next_actions: []
- response_guidance:
    must_include: [] (co MUSI być w odpowiedzi)
    should_avoid: [] (czego NIE pisać)
    suggested_actions: [] (konkretne kroki)
- priority: low|medium|high`;
}

function generateResponseGeneratorPrompt(config: any): string {
    const bizName = config.business?.business_name || 'firma';
    const lang = config.business?.language_primary || 'pl';
    const tone = config.business?.brand_tone || 'semi_formal';
    const sig = config.business?.email_signature || 'Z poważaniem';

    const toneDesc: Record<string, string> = {
        formal: 'bardzo formalny, pełne zwroty grzecznościowe, bez skrótów',
        semi_formal: 'profesjonalny ale przyjazny, rzeczowy',
        informal: 'przyjazny, bezpośredni, ale nadal uprzejmy'
    };

    return `SYSTEM: Jesteś asystentem email firmy ${bizName}.
Generujesz profesjonalne odpowiedzi na emaile klientów i partnerów.
Język odpowiedzi: ${lang}. Ton: ${tone}.

{{ $('Execute Workflow Trigger').first().json.knowledge_context ? '**ZASADY OBOWIĄZKOWE (BAZA WIEDZY):**\\n' + $('Execute Workflow Trigger').first().json.knowledge_context + '\\n\\n' : '' }}

{{ $('Execute Workflow Trigger').first().json.previous_draft ? '**POPRZEDNI DRAFT:**\\n' + $('Execute Workflow Trigger').first().json.previous_draft + '\\n\\n**FEEDBACK DO POPRAWY:**\\n' + $('Execute Workflow Trigger').first().json.correction_feedback + '\\n\\nWażne: zachowaj co było dobre, zmień tylko to co wskazano w feedback.\\n\\n' : '' }}

**KONTEKST:**
{{ JSON.stringify($('Execute Workflow Trigger').first().json.context) }}

{{ $('Execute Workflow Trigger').first().json.response_guidance ? '**RESPONSE GUIDANCE:**\\nMust Include: ' + (($('Execute Workflow Trigger').first().json.response_guidance.must_include || []).join('; ')) + '\\nShould Avoid: ' + (($('Execute Workflow Trigger').first().json.response_guidance.should_avoid || []).join('; ')) + '\\n\\n' : '' }}

**TYP ODPOWIEDZI:** {{ $('Execute Workflow Trigger').first().json.template_type }}
**TON:** {{ $('Execute Workflow Trigger').first().json.tone || '${tone}' }}

---

**ZASADY PISANIA:**
1. Język: ${lang}
2. Ton: ${toneDesc[tone] || toneDesc.semi_formal}
3. Zwięźle — maksymalnie 150-200 słów
4. Nie wymyślaj informacji których nie masz
5. Zakończ podpisem:
${sig}

---

Wygeneruj TYLKO JSON:

{
  "draft_subject": "RE: temat oryginalnego maila",
  "draft_body": "Treść odpowiedzi...\\n\\n${sig}",
  "confidence": 0.9
}`;
}

// ─── Main Workflow Generator ──────────────────────────────────────────────────

export async function generateWorkflows(config: any) {
    const generatedWorkflows: Record<string, any> = {};

    // Generate AI prompts
    const classifierPrompt = generateClassifierPrompt(config);
    const contextBuilderPrompt = generateContextBuilderPrompt(config);
    const responseGeneratorPrompt = generateResponseGeneratorPrompt(config);

    for (const [filename, templateObj] of Object.entries(templates)) {
        const wf = clone(templateObj);

        // Inject prompts into agent nodes
        if (filename.includes('01_AGENT')) {
            const aiNode = findNode(wf.nodes, 'AI Classifier');
            if (aiNode) aiNode.parameters.text = `=${classifierPrompt}`;
        }
        if (filename.includes('02_AGENT')) {
            const aiNode = findNode(wf.nodes, 'AI Context Builder');
            if (aiNode) aiNode.parameters.text = `=${contextBuilderPrompt}`;
        }
        if (filename.includes('03_AGENT')) {
            const aiNode = findNode(wf.nodes, 'AI Response Generator');
            if (aiNode) aiNode.parameters.text = `=${responseGeneratorPrompt}`;
        }

        // Inject pipeline data
        if (filename.includes('06_PIPELINE')) {
            injectWorkflow06(wf, config);
        }
        if (filename.includes('10_PIPELINE')) {
            injectWorkflow10(wf, config);
        }
        if (filename.includes('11_WORKFLOW')) {
            injectWorkflow11(wf, config);
        }

        generatedWorkflows[filename] = wf;
    }

    return { generatedWorkflows };
}

// ─── ENV Example ──────────────────────────────────────────────────────────────

export function generateEnvExample(config: any): string {
    const host = 'http://localhost:5678';
    const bizName = config.business?.business_name || 'Twoja Firma';

    return `# Konfiguracja środowiska n8n dla: ${bizName}
# Skopiuj ten plik jako .env i uzupełnij wartości.

# === n8n API ===
N8N_HOST="${host}" # Zmień jeśli używasz chmury, np. https://twoja-instancja.app.n8n.cloud
N8N_API_KEY="TWÓJ_KLUCZ_API_N8N" # Wygeneruj w n8n: Settings > n8n API

# === Airtable ===
AIRTABLE_API_TOKEN="TWÓJ_PERSONAL_ACCESS_TOKEN" # Wygeneruj na: https://airtable.com/create/tokens
AIRTABLE_BASE_ID="${config.channels?.airtable_base_id || 'appXXXXXXXXXXXXXX'}"
AIRTABLE_TABLE_NAME="Draft_Queue"

# === Google Chat ===
GOOGLE_CHAT_SPACE_ID="${config.channels?.google_chat_space_id || 'spaces/YOUR_SPACE_ID'}"

# === Gmail ===
GMAIL_INBOX="${config.channels?.email_inbox_address || 'kontakt@firma.pl'}"

# === OpenAI ===
OPENAI_API_KEY="sk-..."
`;
}

// ─── Installer Prompt ─────────────────────────────────────────────────────────

export function generateInstallerPrompt(config: any): string {
    const bizName = config.business?.business_name || 'Twoja Firma';
    const approvalChannel = config.channels?.approval_channel || 'none';
    const airtableBaseId = config.channels?.airtable_base_id || 'appXXXXXXXXXXXXXX';
    const prefix = (config.channels?.webhook_prefix || 'agent').replace(/[^a-z0-9-]/gi, '-').toLowerCase();

    const workflowFiles = [
        '01_AGENT_Email_Classifier.json',
        '02_AGENT_Context_Builder.json',
        '03_AGENT_Response_Generator.json',
        '06_PIPELINE_Mail_Processing.json',
        '10_PIPELINE_Approval_Handler.json',
        '11_WORKFLOW_Feedback_Loop.json'
    ];

    const approvalNote = approvalChannel === 'google_chat'
        ? `Kanał akceptacji: **Google Chat**. Space ID: \`${config.channels?.google_chat_space_id || 'spaces/...'}\`\n\nWebhook URL approval handlera będzie miał format: \`https://TWOJ_N8N/webhook/${prefix}-approval\` — ten adres wpisz jako webhook URL in Google Chat App konfiguracji.`
        : `Kanał akceptacji: **none** — drafty zapisywane są do Airtable, ale powiadomienia nie są wysyłane. Możesz ręcznie zatwierdzić z poziomu Airtable.`;

    const credentialsList = [
        `- [ ] **Gmail OAuth2** — skrzynka: \`${config.channels?.email_inbox_address || 'kontakt@firma.pl'}\``,
        `- [ ] **Airtable Personal Access Token** — base ID: \`${airtableBaseId}\``,
        `- [ ] **OpenAI API** — klucz do modeli gpt-4o i gpt-4o-mini`,
        ...(approvalChannel === 'google_chat' ? [`- [ ] **Google Chat OAuth2** — wymagane dla kanału akceptacji`] : [])
    ].join('\n');

    return `# SYSTEM PROMPT: Antigravity — N8N Deployment Agent

Wczytaj ten plik jako pierwszy komunikat do Antigravity (jako nową rozmowę lub wklej treść poniżej jako wiadomość startową).

---

**Projekt:** ${bizName}

**Twoja rola (dla Antigravity):**
Jesteś inżynierem-wdrożeniowcem. Masz przed sobą gotowy pakiet plików agenta mailowego n8n dla firmy **${bizName}**. Twoim zadaniem jest wdrożenie go krok po kroku w instancji n8n użytkownika. Zakładasz, że użytkownik jest kursantem i może nie mieć wiedzy technicznej — prowadź go za rękę.

**Zasada krytyczna:** Rozwiązujesz **wyłącznie jeden krok naraz**. Po każdym kroku **CZEKASZ na potwierdzenie** od użytkownika (np. „Gotowe"), zanim przejdziesz dalej.

---

## KROK 1: Dostęp do API n8n

1. Przywitaj się i wyjaśnij: *„Zanim zacznę wdrożenie, potrzebuję dostępu do Twojego n8n API."*
2. Poproś użytkownika o:
   - Otworzenie n8n → **Settings → n8n API → Create API Key**
   - Skopiowanie wygenerowanego klucza
   - Otworzenie pliku \`.env.example\` w tym folderze, wpisanie danych i zapisanie go jako \`.env\`
3. Sam odczytaj plik \`.env\` — będziesz potrzebować \`N8N_HOST\` i \`N8N_API_KEY\` w kolejnych krokach.
4. Potwierdź użytkownikowi że widzisz dane: *„Widzę Twój N8N_HOST i klucz API. Możemy ruszać!"*

**🛑 CZEKAJ NA POTWIERDZENIE.**

---

## KROK 2: Uzbrojenie AI – Integracja Narzędzi MCP (Serwer n8n-mcp)

Jako agent potrzebujesz "supermocy" bezpośredniej komunikacji z n8n.

1. Powiedz: *„Będę potrzebował narzędzia MCP, które pozwoli mi bezpośrednio zarządzać Twoim n8n. Zainstalujmy je."*
2. Poproś użytkownika o uruchomienie skryptu \`setup_agent_tools.sh\` w terminalu (lub zrób to sam, jeśli masz uprawnienia):
\`\`\`bash
bash setup_agent_tools.sh
\`\`\`
3. Wyjaśnij, że to zainstaluje serwer n8n-mcp i skonfiguruje narzędzia agenta.

**🛑 CZEKAJ NA POTWIERDZENIE.**

---

## KROK 3: Ładowanie "n8n Skills" dla Antigravity

Aby móc efektywnie debugować błędy n8n i rozumieć architekturę workflow, musisz załadować paczkę wiedzy n8n-skills.

1. Powiedz: *„Instaluję paczkę wiedzy n8n-skills, dzięki której będę rozumiał Twój system."*
2. Uruchom komendę w terminalu (użyj narzędzia run_command):
\`\`\`bash
git clone https://github.com/czlonkowski/n8n-skills.git ~/.agents/skills/n8n-skills
\`\`\`
3. Jeśli folder już istnieje, uruchom:
\`\`\`bash
cd ~/.agents/skills/n8n-skills && git pull
\`\`\`
4. Po zakończeniu powiedz: *„Załadowałem wiedzę o n8n. Znam teraz architekturę Twoich workflow."*

**🛑 CZEKAJ NA POTWIERDZENIE.**

---

## KROK 4: Przygotowanie Airtable

Base ID: \`${airtableBaseId}\`

1. Powiedz: *„Teraz skonfigurujemy Airtable — to tu będą trafiać szkice odpowiedzi do akceptacji."*
2. Poproś użytkownika o stworzenie bazy Airtable z tabelą **\`Draft_Queue\`** i następującymi kolumnami:

| Kolumna | Typ |
|---|---|
| \`draft_id\` | Single line text |
| \`email_thread_id\` | Single line text |
| \`email_from\` | Single line text |
| \`email_subject\` | Single line text |
| \`draft_subject\` | Single line text |
| \`draft_body\` | Long text |
| \`draft_gmail_id\` | Single line text |
| \`classification\` | Long text |
| \`context\` | Long text |
| \`status\` | Single select: \`pending_approval\`, \`sent\`, \`rejected\` |
| \`edit_count\` | Number |
| \`approved_by\` | Single line text |

Oraz drugą tabelę **\`Draft_Corrections\`** z kolumnami:
\`correction_id\`, \`draft_id\`, \`original_draft\`, \`feedback_text\`, \`corrected_draft\`, \`correction_type\`, \`classification_intent\`, \`classification_tone\`, \`corrected_by\`

3. Poproś o wygenerowanie Personal Access Token na [airtable.com/create/tokens](https://airtable.com/create/tokens) (zakres: \`data.records:read\`, \`data.records:write\`, \`schema.bases:read\`).

**🛑 CZEKAJ NA POTWIERDZENIE.**

---

## KROK 5: Import Workflows do n8n przez API

Teraz wgrasz wszystkie 6 plików JSON do n8n bezpośrednio przez REST API.

1. Powiedz: *„Importuję Twoje workflow do n8n!"*
2. Odczytaj \`N8N_HOST\` i \`N8N_API_KEY\` z pliku \`.env\`.
3. Importuj pliki z folderu \`workflows/\` w **ściśle określonej kolejności** (AGENT-y przed PIPELINE-ami):

${workflowFiles.map((f, i) => `   ${i + 1}. \`${f}\``).join('\n')}

4. Dla każdego pliku wykonaj import przez API n8n:
\`\`\`bash
curl -s -X POST "$N8N_HOST/api/v1/workflows" \\
  -H "X-N8N-API-KEY: $N8N_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d @workflows/NAZWA_PLIKU.json
\`\`\`
   Zapisz **ID** każdego zaimportowanego workflow (pole \`"id"\` w odpowiedzi JSON).

5. Po imporcie wszystkich 6 plików zaktualizuj węzły **Execute Workflow** w pipeline'ach (06, 10, 11) tak, aby odwoływały się do poprawnych ID nowo zaimportowanych sub-agentów (01, 02, 03). Użyj:
\`\`\`bash
curl -s -X PATCH "$N8N_HOST/api/v1/workflows/ID_PIPELINE" \\
  -H "X-N8N-API-KEY: $N8N_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "nodes": [...zaktualizowane węzły...] }'
\`\`\`
6. Aktywuj każdy workflow:
\`\`\`bash
curl -s -X POST "$N8N_HOST/api/v1/workflows/ID_WORKFLOW/activate" \\
  -H "X-N8N-API-KEY: $N8N_API_KEY"
\`\`\`

**🛑 CZEKAJ NA POTWIERDZENIE.**

---

## KROK 6: Konfiguracja Credentiali w n8n

1. Powiedz: *„Teraz musisz podłączyć swoje klucze API w n8n."*
2. Poproś użytkownika aby przeszedł do **Settings → Credentials** w n8n i skonfigurował:

${credentialsList}

${approvalNote}

3. Po skonfigurowaniu credentiali poproś użytkownika o przypisanie ich do odpowiednich workflow w n8n (otwórz każdy workflow → kliknij węzeł → wybierz credential).

**🛑 CZEKAJ NA POTWIERDZENIE.**

---

## KROK 7: Test End-to-End

1. Powiedz: *„Czas przetestować system! Wyślę testowe zapytanie emailowe."*
2. Odczytaj webhookURL z zaimportowanego \`06_PIPELINE_Mail_Processing\` (endpoint trigger node).
3. Wyślij testowy payload:
\`\`\`bash
curl -s -X POST "WEBHOOK_URL_PIPELINE_06" \\
  -H "Content-Type: application/json" \\
  -d @tests/test_new_inquiry.json
\`\`\`
4. Sprawdź kolejno:
   - Czy pipeline się uruchomił? (n8n → Executions)
   - Czy w Airtable tabela \`Draft_Queue\` ma nowy rekord?
   - Czy przyszło powiadomienie w Google Chat? (jeśli skonfigurowane)
5. Jeśli cokolwiek nie działa — użyj wiedzy z n8n-skills aby zdiagnozować błąd i naprawić go.
6. Pogratuluj użytkownikowi i podsumuj co zostało wdrożone.

---

> **🎉 Sukces!** System **${bizName}** jest gotowy. Agent mailowy przetworzy każdy nowy email: sklasyfikuje intencję, zbuduje kontekst, wygeneruje draft odpowiedzi i wyśle do akceptacji${approvalChannel === 'google_chat' ? ' przez Google Chat' : ' w Airtable'}.
`;
}


// ─── Test Payloads ────────────────────────────────────────────────────────────

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
            thread_id: overrides.thread_id || `thread_${Date.now()}`,
            is_reply: overrides.is_reply || false
        },
        _test_meta: overrides._test_meta || {}
    });

    const payloads: Record<string, any> = {};

    const newInquiryIntent = intents.find((i: any) => i.route_key === 'new_inquiry');
    payloads['test_new_inquiry.json'] = basePayload({
        from: 'jan.kowalski@klient.pl',
        subject: `Zapytanie ofertowe — ${bizName}`,
        body: `Dzień dobry,\n\nChciałbym zapytać o Państwa ofertę. Interesuje mnie współpraca i chciałbym poznać dostępne opcje oraz orientacyjne ceny.\n\nProszę o kontakt.\n\nZ poważaniem,\nJan Kowalski`,
        _test_meta: {
            expected_intent: newInquiryIntent?.route_key || 'new_inquiry',
            description: 'Nowe zapytanie ofertowe od potencjalnego klienta'
        }
    });

    const followUpIntent = intents.find((i: any) => i.route_key === 'follow_up');
    payloads['test_follow_up.json'] = basePayload({
        from: 'anna.nowak@partner.com',
        subject: `Re: Oferta — ${bizName}`,
        body: `Dzień dobry,\n\nDziękuję za poprzednią odpowiedź. Mam kilka dodatkowych pytań:\n\n1. Jaki jest termin realizacji?\n2. Czy istnieje możliwość negocjacji?\n\nCzekam na informację.\n\nPozdrawiam,\nAnna Nowak`,
        thread_id: 'thread_existing_123',
        is_reply: true,
        _test_meta: {
            expected_intent: followUpIntent?.route_key || 'follow_up',
            description: 'Kontynuacja rozmowy'
        }
    });

    const ignoreIntent = intents.find((i: any) => !i.auto_reply_enabled);
    payloads['test_spam_ignore.json'] = basePayload({
        from: 'newsletter@massmailing.com',
        subject: '🔥 MEGA PROMOCJA — Tylko dziś -90%!',
        body: 'Kliknij tutaj aby odebrać nagrodę! Oferta ważna tylko 24h.',
        _test_meta: {
            expected_intent: ignoreIntent?.route_key || 'ignore',
            description: 'Spam — powinien zostać zignorowany'
        }
    });

    return payloads;
}

// ─── Artifacts ────────────────────────────────────────────────────────────────

export function generateArtifacts(config: any) {
    const bizName = config.business?.business_name || 'Twoja Firma';
    const prefix = (config.channels?.webhook_prefix || 'agent').replace(/[^a-z0-9-]/gi, '-').toLowerCase();

    const checklist = `# ${bizName} — Instrukcja wdrożenia agenta mailowego

## Architektura systemu
- **3 agenty AI**: Klasyfikator, Context Builder, Generator odpowiedzi
- **3 pipeline'y**: Mail Processing, Approval Handler, Feedback Loop
- **Storage**: Airtable (tabela Draft_Queue)
- **Kanał akceptacji**: ${config.channels?.approval_channel || 'none'}

## Webhook URL
Approval Handler nasłuchuje na: \`/webhook/${prefix}-approval\`

## Kolejność importu workflows (OBOWIĄZKOWA)
1. 01_AGENT_Email_Classifier.json
2. 02_AGENT_Context_Builder.json
3. 03_AGENT_Response_Generator.json
4. 06_PIPELINE_Mail_Processing.json
5. 10_PIPELINE_Approval_Handler.json
6. 11_WORKFLOW_Feedback_Loop.json

## Intencje skonfigurowane
${(config.intents || []).map((i: any) => `- **${i.route_key}**: ${i.description} (${i.requires_approval ? 'wymaga akceptacji' : 'bez akceptacji'})`).join('\n')}

## Airtable
Base ID: \`${config.channels?.airtable_base_id || 'appXXXXXXXXXXXXXX'}\`
Tabela 1: \`Draft_Queue\`
Tabela 2: \`Draft_Corrections\`
`;

    const kb = `# Baza wiedzy — ${bizName}

## Zasady odpowiedzi
${config.policy?.must_follow_rules || ''}

## Oferta i cennik
${config.policy?.pricing_and_offer_policy || ''}

${(config.policy?.forbidden_phrases || []).length > 0 ? `## Zwroty zakazane\n${(config.policy?.forbidden_phrases || []).map((f: string) => `- ${f}`).join('\n')}` : ''}

${(config.policy?.knowledge_base_entries || []).map((e: any) => `## ${e.topic || 'Temat'}\n${e.content_markdown || ''}`).join('\n\n')}
`;

    return {
        'instrukcja_wdrozenia.md': checklist,
        'knowledge_base.md': kb
    };
}

// ─── Setup Script Generator ───────────────────────────────────────────────────

export function generateSetupScript(config: any): string {
    const bizName = config.business?.business_name || 'Agent N8N';
    return `#!/bin/bash
echo "Installing environment for: ${bizName}..."

# 1. Install n8n MCP Server
echo "Installing n8n MCP Server..."
# Using npx to ensure we have the latest version of MCP server tools
npx @modelcontextprotocol/create-server n8n-mcp

# 2. Setup n8n-skills
SKILLS_DIR="$HOME/.agents/skills/n8n-skills"
if [ -d "$SKILLS_DIR" ]; then
    echo "Updating n8n-skills..."
    cd "$SKILLS_DIR" && git pull
else
    echo "Cloning n8n-skills..."
    git clone https://github.com/czlonkowski/n8n-skills.git "$SKILLS_DIR"
fi

echo "Done! Environment is ready."
`;
}


// ─── ZIP Builder ──────────────────────────────────────────────────────────────

export async function downloadZip(config: any) {
    const { generatedWorkflows } = await generateWorkflows(config);
    const artifacts = generateArtifacts(config);
    const testPayloads = generateTestPayloads(config);

    const zip = new JSZip();
    const workflowsFolder = zip.folder('workflows');
    const artifactsFolder = zip.folder('artifacts');
    const testsFolder = zip.folder('tests');

    for (const [filename, content] of Object.entries(generatedWorkflows)) {
        workflowsFolder?.file(filename, JSON.stringify(content, null, 2));
    }

    for (const [filename, content] of Object.entries(artifacts)) {
        artifactsFolder?.file(filename, content as string);
    }

    for (const [filename, content] of Object.entries(testPayloads)) {
        testsFolder?.file(filename, JSON.stringify(content, null, 2));
    }

    zip.file('agent_config.json', JSON.stringify(config, null, 2));
    zip.file('.env.example', generateEnvExample(config));
    zip.file('ai_installer_prompt.md', generateInstallerPrompt(config));
    zip.file('setup_agent_tools.sh', generateSetupScript(config));

    const content = await zip.generateAsync({ type: 'blob' });
    const safeName = (config.business?.business_name || 'agent').replace(/\s+/g, '-').toLowerCase();
    saveAs(content, `n8n-agent-${safeName}.zip`);
}
