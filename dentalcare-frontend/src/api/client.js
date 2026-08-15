// api/client.js
// -----------------------------------------------------------
// نقطة اتصال واحدة بالـ backend. لاحظ عدم وجود أي "fallback
// محلي" هون — لو الطلب فشل، بيرجّع خطأ صريح للمكوّن يلي طلبه،
// وهو المسؤول يعرضه للمستخدم. ممنوع أي "نجاح صامت" محلي.
// -----------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function getToken() {
  return localStorage.getItem('auth_token');
}

async function request(path, { method = 'GET', body, params } = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // رد بدون body (نادر لكن ممكن)
  }

  if (!res.ok) {
    // ما منخفي الخطأ ولا منحاول "نصلحه محليًا" — منرميه صريح
    throw new ApiError(data?.error || 'حدث خطأ غير متوقع', res.status, data);
  }

  return data;
}

/** يولّد مفتاح idempotency فريد — يُستدعى مرة وحدة لحظة فتح النموذج */
function newIdempotencyKey() {
  return crypto.randomUUID();
}

export const api = {
  get: (path, params) => request(path, { method: 'GET', params }),
  post: (path, body) => request(path, { method: 'POST', body }),
};

export { ApiError, newIdempotencyKey, getToken };
