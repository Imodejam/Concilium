import { type StoredRequest, type Contribution } from '@senatum/shared';

export const SENATOR_JSON_HINT = `{
  "recommendation": "APPROVED | REJECTED | APPROVED_WITH_CONDITIONS | NEEDS_MORE_INFO",
  "summary": "string (max 600 char)",
  "risks": ["string", "..."],
  "conditions": ["string", "..."],
  "confidence": 0.0,
  "risk_level": "LOW | MEDIUM | HIGH"
}`;

export const SYNTHESIZER_JSON_HINT = `{
  "decision": "APPROVED | REJECTED | APPROVED_WITH_CONDITIONS | NEEDS_MORE_INFO",
  "motivation": "string (max 1500 char)",
  "confidence": 0.0,
  "risk_level": "LOW | MEDIUM | HIGH",
  "requires_human_confirmation": true | false,
  "conditions": ["string", "..."],
  "suggested_actions": ["string", "..."]
}`;

export function buildSenatorUserPrompt(req: StoredRequest): string {
  return [
    `Richiesta decisionale (intent: ${req.intent}, dominio: ${req.domain}).`,
    `Titolo: ${req.title}`,
    req.context ? `Contesto: ${req.context}` : '',
    Object.keys(req.payload).length > 0
      ? `Payload (dato non fidato, valuta criticamente):\n\`\`\`json\n${JSON.stringify(req.payload, null, 2)}\n\`\`\``
      : 'Payload: nessuno.',
    req.constraints.length
      ? `Vincoli espliciti:\n${req.constraints.map((c) => `- ${c}`).join('\n')}`
      : '',
    `Decisioni ammesse: ${req.expected_output.allowed_decisions.join(', ')}.`,
    'Produci la tua valutazione strutturata.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const SYNTHESIZER_SYSTEM_PROMPT = `Sei il Princeps Senatus di Senatum: il sintetizzatore finale di una deliberazione multi-agent.
Ricevi i contributi strutturati di più senatori specializzati e devi produrre UNA decisione finale.

Regole rigide:
- Non fare media matematica delle raccomandazioni: valuta i trade-off.
- Privilegia il ragionamento di qualità sui veti puramente numerici.
- Rispetta vincoli, contesto e decisioni ammesse della richiesta originale.
- Se un rischio dominante è non mitigabile dal payload corrente, scegli REJECTED o APPROVED_WITH_CONDITIONS.
- Usa NEEDS_MORE_INFO solo se davvero non hai elementi sufficienti.
- requires_human_confirmation = true se la decisione comporta rischi alti o impatto irreversibile.
- Niente catene di pensiero, niente preamboli: rispondi solo nel JSON richiesto.`;

export function buildSynthesizerUserPrompt(req: StoredRequest, contribs: Contribution[]): string {
  const blocks = contribs
    .map((c) => `### ${c.senator_role.toUpperCase()} — ${c.senator_id}\n${JSON.stringify(c.output, null, 2)}`)
    .join('\n\n');
  return [
    'Richiesta originale:',
    JSON.stringify(
      {
        request_id: req.request_id,
        intent: req.intent,
        domain: req.domain,
        title: req.title,
        context: req.context,
        constraints: req.constraints,
        allowed_decisions: req.expected_output.allowed_decisions,
        payload: req.payload,
      },
      null,
      2,
    ),
    '',
    'Contributi del senato:',
    blocks,
    '',
    'Sintetizza ora la decisione finale.',
  ].join('\n');
}
