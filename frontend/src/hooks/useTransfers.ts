// Spot <-> perp transfers wired for <TransferSheet />: both polling hooks, plus the
// "TRANSFER CONFIRMED" / "Transfer issue" toasts. Spread the result into the sheet:
//   const transfers = useTransfers(refresh);
//   <TransferSheet {...transfers} onClose={...} />
// The host screen must mount <PerpToast /> for the toasts to show.
import { useEffect } from "react";
import { money } from "@/lib/format";
import { useSpotToPerpDeposit } from "./useSpotToPerpDeposit";
import { usePerpToSpotDeposit } from "./perps/usePerpToSpotDeposit";
import { toast } from "@/components/perps/PerpToast";

export function useTransfers(onSettled?: () => void) {
  const dep = useSpotToPerpDeposit();
  const wd = usePerpToSpotDeposit();

  useEffect(() => {
    if (dep.phase === "done") {
      toast(`Moved ${money(dep.amount)} to perp`, "TRANSFER CONFIRMED");
      onSettled?.();
      dep.reset();
    } else if (dep.phase === "error" && dep.error) {
      toast("Transfer issue", dep.error.toUpperCase());
      dep.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep.phase]);

  useEffect(() => {
    if (wd.phase === "done") {
      toast(`Moved ${money(wd.amount)} to spot`, "TRANSFER CONFIRMED");
      onSettled?.();
      wd.reset();
    } else if (wd.phase === "error" && wd.error) {
      toast("Transfer issue", wd.error.toUpperCase());
      wd.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wd.phase]);

  return {
    onDeposit: dep.deposit,
    onWithdraw: wd.withdraw,
    depositStatus: { phase: dep.phase, amount: dep.amount, error: dep.error },
    withdrawStatus: { phase: wd.phase, amount: wd.amount, error: wd.error },
  };
}
