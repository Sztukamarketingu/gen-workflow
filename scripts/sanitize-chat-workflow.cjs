/**
 * Kopiuje workflow Chat Feedback z artifacts, czyści sekrety i zapisuje jako szablon.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(
  root,
  '..',
  'n8n-agent-impresariat-koncertowy',
  'artifacts',
  'workflow_nowe',
  '[PIPELINE] Chat Feedback & Approval.json'
);
const out = path.join(root, 'src', 'templates', 'workflows', '10_PIPELINE_Chat_Feedback_Approval.json');

if (!fs.existsSync(src)) {
  console.error('Brak pliku źródłowego:', src);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(src, 'utf8'));

const CRED_MAP = {
  airtableTokenApi: { id: 'YOUR_AIRTABLE_CREDENTIAL_ID', name: 'Airtable PAT' },
  gmailOAuth2: { id: 'YOUR_GMAIL_CREDENTIAL_ID', name: 'Gmail OAuth2' },
  openAiApi: { id: 'YOUR_OPENAI_CREDENTIAL_ID', name: 'OpenAI API' },
  googleChatOAuth2Api: { id: 'YOUR_GOOGLE_CHAT_CREDENTIAL_ID', name: 'Google Chat OAuth2' },
};

for (const node of data.nodes || []) {
  if (node.credentials) {
    for (const k of Object.keys(node.credentials)) {
      node.credentials[k] = { ...(CRED_MAP[k] || { id: 'YOUR_CREDENTIAL_ID', name: 'Credential' }) };
    }
  }
  if (node.type === 'n8n-nodes-base.httpRequest' && node.name === 'Store in Pinecone') {
    node.parameters.url = 'https://YOUR_PINECONE_HOST/vectors/upsert';
    const headers = node.parameters.headerParameters?.parameters;
    if (Array.isArray(headers)) {
      for (const h of headers) {
        if (/key|secret|token|pcsk|api-key/i.test(String(h.name))) {
          h.value = 'YOUR_PINECONE_API_KEY';
        }
      }
    }
  }
}

const execCorr = (data.nodes || []).find((n) => n.name === 'Execute Correction');
if (execCorr?.parameters?.workflowId) {
  execCorr.parameters.workflowId = {
    __rl: true,
    value: 'ZASTĄP_ID_WORKFLOW_03_RESPONSE_GENERATOR',
    mode: 'list',
    cachedResultName: '[AGENT] Response Generator v2',
  };
}
if (execCorr?.parameters?.workflowInputs?.value?.tone) {
  execCorr.parameters.workflowInputs.value.tone =
    "={{ ($('Build Correction Context').item.json.classification || {}).detected_tone || 'semi_formal' }}";
}

delete data.id;
delete data.versionId;
if (data.meta) {
  data.meta = { templateCredsSetupCompleted: false };
}

fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
console.log('Zapisano:', out);
