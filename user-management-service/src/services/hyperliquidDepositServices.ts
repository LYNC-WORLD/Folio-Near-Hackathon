import { spotSolToUsdc } from "../lib/hyperliquid";
import { prisma } from "../lib/prisma";
import { getSolBalance } from "../lib/solana";

export async function CheckWithdrawRequest() {
  const activeRequest = await prisma.withdrawRequest.findMany({
    where: { conversionCompleted: false },
  });
  await Promise.all(
    activeRequest.map(async (withdrawRequest) => {
      const solAmount = await getSolBalance(
        withdrawRequest.solanaWalletAddress,
      );
      if (!withdrawRequest.withdrawCompleted) {
        if (!(solAmount >= 0.12)) {
          return;
        }
        await prisma.withdrawRequest.update({
          where: { id: withdrawRequest.id },
          data: {
            withdrawCompleted: true,
          },
        });
      }

      const conversionComplete = await spotSolToUsdc(
        (solAmount - 0.01).toString(),
        withdrawRequest.solanaWalletAddress,
        withdrawRequest.solanaWalletId,
      );

      if (!conversionComplete.success) {
        return;
      }

      await prisma.withdrawRequest.update({
        where: { id: withdrawRequest.id },
        data: {
          conversionCompleted: true,
        },
      });
    }),
  );
}
