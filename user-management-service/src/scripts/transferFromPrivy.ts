// import { PrivyClient } from "@privy-io/node";
// import dotenv from "dotenv";

// dotenv.config();

// const privy = new PrivyClient({
//   appId: process.env.PRIVY_APP_ID!,
//   appSecret: process.env.PRIVY_APP_SECRET!,
// });

// const walletId = "pujv1iur1isxk6sver3eejnw";

// const userJwt =
//   "";

// const serverPublicKey = "re34yprv3nby9s25jlee4qy4";

// async function transferUSDC() {
//   const result = await privy.wallets().update(walletId, {
//     owner: { public_key: serverPublicKey },
//     authorization_context: {
//       user_jwts: [userJwt],
//     },
//   });
//   console.log(result);
// }

// // transferUSDC().catch(console.error);
