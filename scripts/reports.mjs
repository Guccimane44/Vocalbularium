// @ts-check
// The problems reported from the account menu (D336), for the daily agent. It
// connects to the account's database directly, so it works while the API runs.
//
//   npm run reports -- pending            the reports no issue was opened for, oldest first, without page or logs
//   npm run reports -- show <id>          one report in full: the page as it was and the logs, for reproducing it here
//   npm run reports -- issue <id>         the title and body of its GitHub issue, as JSON
//   npm run reports -- filed <id> <issue> records the issue opened for it
//
// An issue carries only the user's text, the screen, the module type and the
// builds: the repository is public, and the page and logs hold captured text,
// prompts and generated output. They stay here; `show` is for this computer only.
import pg from 'pg';

const [command, id, issue] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: run it as `npm run reports`, which reads .env and .env.postgres, as `npm start` does.');
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

/** @param {string} reportId */
async function one(reportId) {
  const { rows: [row] } = await client.query('SELECT * FROM reports WHERE id = $1', [reportId]);
  if (!row) throw new Error(`No report ${reportId}.`);
  return row;
}
/** @param {{ api?: { version: string, commit: string, dirty: boolean } | null, extension?: { version: string, commit: string, dirty: boolean } | null }} builds */
const buildLine = builds => Object.entries(builds).map(([side, build]) => `${side} ${build ? `${build.version} (${build.commit.slice(0, 7)}${build.dirty ? ', uncommitted changes' : ''})` : 'unknown'}`).join(', ');
/** @param {Record<string, any>} row */
const summary = row => ({ id: row.id, createdAt: row.created_at, text: row.text, screen: row.screen, moduleType: row.module_type,
  builds: JSON.parse(row.builds), hasPage: row.page !== null, hasLogs: row.logs !== null, issue: row.issue });

try {
  if (command === 'pending') {
    const { rows } = await client.query('SELECT * FROM reports WHERE issue IS NULL ORDER BY created_at, id');
    console.log(JSON.stringify(rows.map(summary), null, 2));
  } else if (command === 'show' && id) {
    const row = await one(id);
    console.log(JSON.stringify({ ...summary(row), page: row.page && JSON.parse(row.page), logs: row.logs && JSON.parse(row.logs) }, null, 2));
  } else if (command === 'issue' && id) {
    const row = await one(id);
    const firstLine = row.text.split('\n')[0].trim();
    const title = `Report: ${firstLine.length > 70 ? `${firstLine.slice(0, 69)}…` : firstLine}`;
    const about = row.module_type ? `the ${row.module_type} card of a page` : row.screen === 'page' ? 'a whole page' : `the ${row.screen} screen`;
    const body = [`> ${row.text.split('\n').join('\n> ')}`, '',
      `- **About:** ${about}`, `- **Builds:** ${buildLine(JSON.parse(row.builds))}`, `- **Reported:** ${row.created_at}`, `- **Report:** \`${row.id}\``, '',
      `The page as it was${row.logs ? ' and the diagnostic logs of the 15 minutes before' : ''} stay on the owner's computer: \`npm run reports -- show ${row.id}\` there.`].join('\n');
    console.log(JSON.stringify({ title, body }, null, 2));
  } else if (command === 'filed' && id && issue) {
    const number = Number(issue);
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('Give the issue number.');
    const { rowCount } = await client.query('UPDATE reports SET issue = $2 WHERE id = $1 AND issue IS NULL', [id, number]);
    if (!rowCount) throw new Error(`Report ${id} is filed already, or gone.`);
    console.log(`Report ${id} is issue #${number}.`);
  } else {
    throw new Error('Use: npm run reports -- pending | show <id> | issue <id> | filed <id> <issue>');
  }
} finally {
  await client.end();
}
