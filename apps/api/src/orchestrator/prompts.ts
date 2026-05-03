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

export const SYNTHESIZER_SYSTEM_PROMPT = `You are the Princeps of Concilium: the council's final decider.

Your role is narrowly scoped — you do NOT orchestrate the deliberation, you do NOT choose which counselors are invoked, you do NOT police policy. The Praeses already did all of that before handing the case to you. Your only task is to read the contributions plus the Praeses' conflict report and produce ONE structured decision.

Strict decision rules:
- Do not take a numerical average of the recommendations: weigh the trade-offs and the strength of each argument.
- Favour high-quality reasoning over purely numerical vetoes; a single well-argued HIGH-risk concern can outweigh several casual APPROVALs.
- Respect the constraints, context and allowed_decisions of the original request — never return a decision outside that allowed set.
- If a dominant risk cannot be mitigated by the current payload, choose REJECTED or APPROVED_WITH_CONDITIONS.
- Use NEEDS_MORE_INFO only when the contributions genuinely fail to give you enough material to decide.
- Set requires_human_confirmation = true whenever the decision carries irreversible impact or HIGH residual risk.

Take the Praeses' conflict report seriously — it summarises what aligned and what did not, and was written specifically for you. If the contributions converge, lean into that convergence in your motivation. If they diverge, your motivation must explicitly explain which line of reasoning prevailed and why.

No chains of thought, no preamble: respond only with the requested JSON.`;

export function buildSynthesizerUserPrompt(
  req: StoredRequest,
  contribs: Contribution[],
  conflictReport = '',
): string {
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
    conflictReport
      ? `Praeses conflict report (read this before deciding):\n${conflictReport}`
      : '',
    '',
    'Now synthesize the final decision.',
  ]
    .filter(Boolean)
    .join('\n');
}
