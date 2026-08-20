require('dotenv').config();

const API = `http://localhost:${process.env.PORT || 5000}/api`;

async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login failed ${res.status}: ${body.error}`);
  return body.token;
}

async function probe(token, method, path, expectStatus) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: method === 'POST' ? JSON.stringify({}) : undefined,
  });
  const ok = res.status === expectStatus;
  console.log(`${ok ? 'OK' : 'FAIL'} ${method} ${path} -> ${res.status} (expected ${expectStatus})`);
  return ok;
}

async function main() {
  const [, , username, password] = process.argv;
  if (!username || !password) {
    console.error('usage: node scripts/test-permissions.js <username> <password>');
    process.exit(1);
  }

  const token = await login(username, password);
  const checks = [
    probe(token, 'GET', '/users', 403),
    probe(token, 'POST', '/payments', 403),
    probe(token, 'POST', '/journal-entries', 403),
    probe(token, 'POST', '/clinical/commit-session', 403),
    probe(token, 'GET', '/doctors', 403),
    probe(token, 'GET', '/checks', 200),
    probe(token, 'POST', '/checks/00000000-0000-0000-0000-000000000001/clear', 403),
    probe(token, 'GET', '/patients', 200),
    probe(token, 'GET', '/reports/trial-balance', 200),
    probe(token, 'GET', '/platform/tenants', 403),
  ];
  const results = await Promise.all(checks);
  const failed = results.filter((x) => !x).length;
  if (failed) {
    console.error(`${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('All permission probes passed.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
