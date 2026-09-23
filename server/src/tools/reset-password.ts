// Forgotten password, Online mode. Run on the shop's own computer — the one the
// server and the database live on.
//
// Why this is a tool on that machine and not a "forgot password?" link in the
// browser: there is no mail server to send a link through, and an owner has
// nobody above them to ask. What the shop does have is the computer holding its
// books, and whoever is sitting at it can already read every bill in Postgres.
// Asking them to run this changes nothing about who can get in — it only spares
// a shop that mistyped its own password on day one from losing the lot.
//
// Staff never need this: the owner sets a staff password from Settings → People.

import { createInterface } from 'node:readline/promises';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/password';
import { control, pool } from '../db/client';
import { sessions, users } from '../db/control-schema';

const MIN_PASSWORD = 4; // same floor the API enforces (auth/validate.ts)

async function main(): Promise<number> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const rows = await control
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        active: users.active,
      })
      .from(users)
      .orderBy(users.id);

    if (!rows.length) {
      console.log('\nNobody has registered on this server yet — open the app and sign up.\n');
      return 1;
    }

    console.log('\nAccounts on this server:\n');
    rows.forEach((u, i) => {
      const bits = [u.role === 'owner' ? 'owner' : 'staff'];
      if (u.email) bits.push(u.email);
      if (!u.active) bits.push('switched off');
      console.log(`  ${i + 1}. ${u.username}  (${bits.join(' · ')})`);
    });

    const picked = (await rl.question('\nWhich one? (number or username): ')).trim();
    const byNumber = Number(picked);
    const user =
      Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= rows.length
        ? rows[byNumber - 1]
        : rows.find((u) => u.username.toLowerCase() === picked.toLowerCase());

    if (!user) {
      console.log(`\nNo account called "${picked}". Nothing changed.\n`);
      return 1;
    }

    const password = (await rl.question(`New password for ${user.username}: `)).trim();
    if (password.length < MIN_PASSWORD) {
      console.log(`\nA password needs at least ${MIN_PASSWORD} characters. Nothing changed.\n`);
      return 1;
    }
    const again = (await rl.question('Type it again: ')).trim();
    if (password !== again) {
      console.log('\nThe two did not match. Nothing changed.\n');
      return 1;
    }

    const hash = await hashPassword(password);
    // Every session of theirs goes too: if the password was forgotten because
    // somebody else changed it, that somebody is signed out by this.
    await control.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id));
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
    });

    console.log(`\nDone. ${user.username} can sign in with the new password.`);
    console.log('Any browser that was still signed in as them has to sign in again.\n');
    return 0;
  } finally {
    rl.close();
    await pool.end();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.log(`\nCould not do it: ${err?.message ?? err}\n`);
    process.exit(1);
  },
);
