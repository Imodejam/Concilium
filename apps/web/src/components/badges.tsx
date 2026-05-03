import type { DecisionValue, RequestStatus, RiskLevel } from '@concilium/shared';

const decisionStyles: Record<DecisionValue, string> = {
  APPROVED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  REJECTED: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  APPROVED_WITH_CONDITIONS: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  NEEDS_MORE_INFO: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
};

const riskStyles: Record<RiskLevel, string> = {
  LOW: 'bg-emerald-500/10 text-emerald-300',
  MEDIUM: 'bg-amber-500/10 text-amber-300',
  HIGH: 'bg-rose-500/10 text-rose-300',
};

const statusStyles: Record<RequestStatus, string> = {
  PENDING:        'bg-zinc-500/20 text-zinc-300',
  IN_PROGRESS:    'bg-sky-500/20 text-sky-300',
  COMPLETED:      'bg-emerald-500/20 text-emerald-300',
  FAILED:         'bg-rose-500/20 text-rose-300',
  NEEDS_MORE_INFO:'bg-amber-500/20 text-amber-300',
};

export function DecisionBadge({ value }: { value: DecisionValue }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${decisionStyles[value]}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export function RiskBadge({ value }: { value: RiskLevel }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide ${riskStyles[value]}`}>
      Risk: {value}
    </span>
  );
}

export function StatusBadge({ value }: { value: RequestStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide ${statusStyles[value]}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}
