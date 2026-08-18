/**
 * Recriptografa logins SALIC legados (texto puro) para AES-256-GCM.
 *
 *   npx tsx scripts/encrypt-credentials.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import {
  decryptCredential,
  encryptCredential,
  looksEncrypted,
} from "../src/lib/crypto";

async function main() {
  const accounts = await prisma.salicAccount.findMany({
    select: { id: true, name: true, salicUsernameEnc: true, salicPasswordEnc: true },
  });

  let usernameFixed = 0;
  let passwordChecked = 0;

  for (const account of accounts) {
    if (account.salicUsernameEnc && !looksEncrypted(account.salicUsernameEnc)) {
      const plain = decryptCredential(account.salicUsernameEnc);
      await prisma.salicAccount.update({
        where: { id: account.id },
        data: { salicUsernameEnc: encryptCredential(plain) },
      });
      usernameFixed += 1;
      console.log(`Login criptografado: ${account.name}`);
    }

    if (account.salicPasswordEnc) {
      if (!looksEncrypted(account.salicPasswordEnc)) {
        const plain = decryptCredential(account.salicPasswordEnc);
        await prisma.salicAccount.update({
          where: { id: account.id },
          data: { salicPasswordEnc: encryptCredential(plain) },
        });
        console.log(`Senha criptografada (legado): ${account.name}`);
      }
      passwordChecked += 1;
    }
  }

  console.log(
    `Concluído. Logins recriptografados: ${usernameFixed}. Contas com senha: ${passwordChecked}/${accounts.length}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
