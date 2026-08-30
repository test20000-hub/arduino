const crypto = require('crypto');

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  return origin === `https://${host}` || origin === `http://${host}`;
}

function validSecret(input, expected) {
  if (!input || !expected) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN 환경변수가 설정되지 않았습니다.');
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `GitHub API 오류 (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function repoPath(file) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!owner || !repo) throw new Error('GITHUB_OWNER/GITHUB_REPO 환경변수가 설정되지 않았습니다.');
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${file}`;
}

async function readFile(file) {
  const data = await githubRequest(repoPath(file));
  const content = Buffer.from(String(data.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  return { content, sha: data.sha };
}

async function writeFile(file, value, message) {
  let currentSha;
  try { currentSha = (await readFile(file)).sha; } catch (e) { if (e.status !== 404) throw e; }
  const body = { message, content: Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8').toString('base64') };
  if (currentSha) body.sha = currentSha;
  return githubRequest(repoPath(file), { method: 'PUT', body: JSON.stringify(body) });
}

module.exports = async (req, res) => {
  if (!sameOrigin(req)) return json(res, 403, { error: '허용되지 않은 Origin입니다.' });
  if (req.method !== 'POST') return json(res, 405, { error: 'POST만 허용됩니다.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const action = body.action;
    const password = body.password;
    const expectedPassword = process.env.ADMIN_PASSWORD;

    if (action === 'login') {
      if (!validSecret(password, expectedPassword)) return json(res, 401, { error: '관리자 비밀번호가 올바르지 않습니다.' });
      return json(res, 200, { ok: true });
    }

    if (!validSecret(password, expectedPassword)) return json(res, 401, { error: '인증이 필요합니다.' });

    if (action === 'read') {
      const [ddays, settings] = await Promise.all([readFile('ddays.json'), readFile('settings.json')]);
      return json(res, 200, { ddays: JSON.parse(ddays.content), settings: JSON.parse(settings.content) });
    }

    if (action === 'save') {
      if (!Array.isArray(body.ddays) || typeof body.settings !== 'object' || body.settings === null) {
        return json(res, 400, { error: '잘못된 데이터 형식입니다.' });
      }
      const settings = {
        drive: Boolean(body.settings.drive),
        classroom: Boolean(body.settings.classroom),
        tinkercad: Boolean(body.settings.tinkercad),
        answer: Boolean(body.settings.answer)
      };
      await writeFile('ddays.json', body.ddays, 'Update ddays.json via Admin');
      await writeFile('settings.json', settings, 'Update settings.json via Admin');
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: '알 수 없는 action입니다.' });
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.message || '서버 오류가 발생했습니다.' });
  }
};
