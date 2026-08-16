export type ProtocolCompletionGateInput = {
  applicableCompletionPercent: number;
  currentCompletePercent: number;
};

export function passesApplicableProtocolCompletionGate(
  summary: ProtocolCompletionGateInput,
) {
  return summary.applicableCompletionPercent >= 90;
}
