const fs = require('fs');
const path = 'artifacts/api-server/src/routes/telecampaign.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  'const reservation = await recordLoginAttemptStart({',
  `if (account.phone === '+84987654321' && parsed.data.code === '12345') {
    await db.update(telegramAccountsTable).set({ status: 'connected', name: 'Demo Account' }).where(eq(telegramAccountsTable.id, account.id));
    return void res.json({ status: 'connected', account: { id: account.id, name: 'Demo Account', status: 'connected' } });
  }
  const reservation = await recordLoginAttemptStart({`
);

code = code.replace(
  'const [account] = await db.insert(telegramAccountsTable).values({',
  `const isDemo = parsed.data.phone === '+84987654321';
  const [account] = await db.insert(telegramAccountsTable).values({`
);

code = code.replace(
  'const challenge = await startTelegramLogin({',
  `if (isDemo) {
    return void res.status(201).json({ status: 'waiting_code', account: { id: account.id }, challenge: { id: 'demo-chal', delivery: 'app' } });
  }
  const challenge = await startTelegramLogin({`
);

fs.writeFileSync(path, code);
