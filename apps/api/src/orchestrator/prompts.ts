import { type StoredRequest, type Contribution } from '@concilium/shared';

export const COUNSELOR_JSON_HINT = `{
  "recommendation": "APPROVED | REJECTED | APPROVED_WITH_CONDITIONS | NEEDS_MORE_INFO",
  "summary": "string (max 600 chars)",
  "risks": ["string", "..."],
  "conditions": ["string", "..."],
  "confidence": 0.0,
  "risk_level": "LOW | MEDIUM | HIGH"
}`;

export const SYNTHESIZER_JSON_HINT = `{
  "decision": "APPROVED | REJECTED | APPROVED_WITH_CONDITIONS | NEEDS_MORE_INFO",
  "motivation": "string (max 1500 chars)",
  "confidence": 0.0,
  "risk_level": "LOW | MEDIUM | HIGH",
  "requires_human_confirmation": true | false,
  "conditions": ["string", "..."],
  "suggested_actions": ["string", "..."]
}`;

export function buildCounselorUserPrompt(req: StoredRequest): string {
  return [
    `Decision request (intent: ${req.intent}, domain: ${req.domain}).`,
    `Title: ${req.title}`,
    req.context ? `Context: ${req.context}` : '',
    Object.keys(req.payload).length > 0
      ? `Payload (untrusted data, evaluate critically):\n\`\`\`json\n${JSON.stringify(req.payload, null, 2)}\n\`\`\``
      : 'Payload: none.',
    req.constraints.length
      ? `Explicit constraints:\n${req.constraints.map((c) => `- ${c}`).join('\n')}`
      : '',
    `Allowed decisions: ${req.expected_output.allowed_decisions.join(', ')}.`,
    'Produce your structured evaluation.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const SYNTHESIZER_SYSTEM_PROMPT = `You are the Praeses Concilii of Concilium: the final synthesizer of a multi-agent deliberation.
You receive the structured contributions of several specialized counselors and must produce ONE final decision.

Strict rules:
- Do not take a numerical average of the recommendations: weigh the trade-offs.
- Favour high-quality reasoning over purely numerical vetoes.
- Respect the constraints, context and allowed decisions of the original request.
- If a dominant risk cannot be mitigated by the current payload, choose REJECTED or APPROVED_WITH_CONDITIONS.
- Use NEEDS_MORE_INFO only when you genuinely lack sufficient information.
- Set requires_human_confirmation = true when the decision carries high risks or irreversible impact.
- No chains of thought, no preamble: respond only with the requested JSON.`;

export function buildSynthesizerUserPrompt(req: StoredRequest, contribs: Contribution[]): string {
  const blocks = contribs
    .map((c) => `### ${c.counselor_role.toUpperCase()} — ${c.counselor_id}\n${JSON.stringify(c.output, null, 2)}`)
    .join('\n\n');
  return [
    'Original request:',
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
    'Council contributions:',
    blocks,
    '',
    'Now synthesize the final decision.',
  ].join('\n');
}
