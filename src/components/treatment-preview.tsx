import { describeTreatment } from "@/lib/engine/treatment";
import type { MasterData, TxnDraft } from "@/lib/engine/types";
import { inr } from "@/lib/format";

/** "Show Proposed Accounting Treatment" — the Dr/Cr lines the user approves before posting. */
export function TreatmentPreview({ draft, master }: { draft: TxnDraft; master: MasterData }) {
  const treatment = describeTreatment(draft, master);
  if (!treatment) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-ink-3">
        Proposed accounting treatment appears once the required details are filled in.
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2.5" aria-label="Proposed accounting treatment">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Proposed treatment</p>
      <table className="w-full text-sm">
        <tbody>
          {treatment.lines.map((l, i) => (
            <tr key={i}>
              <td className="w-8 py-0.5 font-mono text-xs text-ink-3">{l.side === "DR" ? "Dr" : "Cr"}</td>
              <td className={`py-0.5 ${l.side === "CR" ? "pl-4" : ""}`}>{l.head}</td>
              <td className="py-0.5 text-right tabular">{inr(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-xs text-ink-2">{treatment.summary}</p>
    </div>
  );
}
