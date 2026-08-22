// api/client.js
// -----------------------------------------------------------
// نقطة اتصال واحدة بالـ backend. لاحظ عدم وجود أي "fallback
// محلي" هون — لو الطلب فشل، بيرجّع خطأ صريح للمكوّن يلي طلبه،
// وهو المسؤول يعرضه للمستخدم. ممنوع أي "نجاح صامت" محلي.
// -----------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_BASE || (
  typeof window !== 'undefined' && window.location?.hostname
    ? '/api'
    : 'http://[::1]:5000/api'
);

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

/** يدعم Base مطلق (http…) أو نسبي (/api) لنسخة الإنتاج على نفس الدومين */
function resolveApiUrl(path, params) {
  const base = String(API_BASE || '').replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const joined = `${base}${suffix}`;
  const url = /^https?:\/\//i.test(joined)
    ? new URL(joined)
    : new URL(joined, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  }
  return url;
}

function apiHref(path) {
  return resolveApiUrl(path).toString();
}

async function request(path, { method = 'GET', body, params } = {}) {
  const token = getToken();
  const url = resolveApiUrl(path, params);

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
    const fallback = typeof data?.error === 'string' && data.error.trim()
      ? data.error
      : (res.status === 404 ? 'المسار غير موجود — أعد تشغيل السيرفر أو حدّث النظام' : 'حدث خطأ غير متوقع');
    throw new ApiError(fallback, res.status, data);
  }

  return data;
}

async function upload(path, file, fieldName = 'file') {
  const form = new FormData();
  form.append(fieldName, file);
  return uploadForm(path, form);
}

async function uploadForm(path, formData) {
  const token = getToken();
  const res = await fetch(apiHref(path), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty
  }
  if (!res.ok) {
    const fallback = typeof data?.error === 'string' && data.error.trim()
      ? data.error
      : (res.status === 404 ? 'المسار غير موجود — أعد تشغيل السيرفر أو حدّث النظام' : 'حدث خطأ غير متوقع');
    throw new ApiError(fallback, res.status, data);
  }
  return data;
}

/** يجلب ملفًا محميًا بالتوكن ويرجّع object URL (يجب استدعاء revoke لاحقًا) */
async function fetchBlobUrl(path) {
  const token = getToken();
  const res = await fetch(apiHref(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* ignore */ }
    throw new ApiError(data?.error || 'حدث خطأ غير متوقع', res.status, data);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

async function download(path, filename) {
  const token = getToken();
  const res = await fetch(apiHref(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* ignore */ }
    throw new ApiError(data?.error || 'حدث خطأ غير متوقع', res.status, data);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
function newIdempotencyKey() {
  return crypto.randomUUID();
}

export const api = {
  get: (path, params) => request(path, { method: 'GET', params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
  upload,
  uploadForm,
  fetchBlobUrl,
  download,
};

export { ApiError, newIdempotencyKey, getToken, apiHref };
