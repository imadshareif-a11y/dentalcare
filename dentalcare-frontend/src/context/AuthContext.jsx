// context/AuthContext.jsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api, apiHref, getToken } from '../api/client';
import { changeLocale } from '../i18n';

const AuthContext = createContext(null);

function persistUser(next) {
  localStorage.setItem('auth_user', JSON.stringify(next));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('auth_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarKey, setAvatarKey] = useState(0);

  const applyUser = useCallback((next) => {
    persistUser(next);
    setUser(next);
    if (next?.locale) changeLocale(next.locale);
  }, []);

  const clearAvatarUrl = useCallback(() => {
    setAvatarUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const reloadAvatar = useCallback(async (hasAvatar = user?.hasAvatar) => {
    clearAvatarUrl();
    if (!hasAvatar) return null;
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch(apiHref('/auth/avatar'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAvatarUrl(url);
      return url;
    } catch {
      return null;
    }
  }, [clearAvatarUrl, user?.hasAvatar]);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    localStorage.setItem('auth_token', data.token);
    localStorage.removeItem('last_clinic_slug');
    applyUser(data.user);
    setAvatarKey((k) => k + 1);
  }, [applyUser]);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('platform_admin_token');
    localStorage.removeItem('platform_admin_user');
    clearAvatarUrl();
    setUser(null);
  }, [clearAvatarUrl]);

  const enterSupportSession = useCallback((data) => {
    const currentToken = localStorage.getItem('auth_token');
    const currentUser = localStorage.getItem('auth_user');
    if (currentToken) localStorage.setItem('platform_admin_token', currentToken);
    if (currentUser) localStorage.setItem('platform_admin_user', currentUser);
    localStorage.setItem('auth_token', data.token);
    applyUser(data.user);
    setAvatarKey((k) => k + 1);
  }, [applyUser]);

  const exitSupportSession = useCallback(() => {
    const adminToken = localStorage.getItem('platform_admin_token');
    const adminUserRaw = localStorage.getItem('platform_admin_user');
    if (!adminToken || !adminUserRaw) {
      logout();
      return;
    }
    localStorage.setItem('auth_token', adminToken);
    localStorage.removeItem('platform_admin_token');
    localStorage.removeItem('platform_admin_user');
    try {
      applyUser(JSON.parse(adminUserRaw));
      setAvatarKey((k) => k + 1);
    } catch {
      logout();
    }
  }, [applyUser, logout]);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) return null;
    try {
      const me = await api.get('/auth/me');
      applyUser(me);
      return me;
    } catch {
      return null;
    }
  }, [applyUser]);

  useEffect(() => {
    if (!localStorage.getItem('auth_token')) return undefined;
    refreshUser();
    return undefined;
  }, [refreshUser]);

  useEffect(() => {
    if (!user?.hasAvatar) {
      clearAvatarUrl();
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch(apiHref('/auth/avatar'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setAvatarUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch {
        // keep initials fallback
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.hasAvatar, avatarKey, clearAvatarUrl]);

  const bumpAvatar = useCallback(() => {
    setAvatarKey((k) => k + 1);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      avatarUrl,
      login,
      logout,
      refreshUser,
      reloadAvatar,
      bumpAvatar,
      enterSupportSession,
      exitSupportSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth يجب أن يُستخدم داخل AuthProvider');
  return ctx;
}
