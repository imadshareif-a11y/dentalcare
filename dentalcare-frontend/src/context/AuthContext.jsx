// context/AuthContext.jsx
// -----------------------------------------------------------
// يخزّن هوية المستخدم (من الـ JWT) بس. ما بيخزّن أي رصيد أو
// بيانات مالية بالـ state — هاي دايمًا بتُجلب طازة من السيرفر
// وقت الحاجة، وما بتُحفظ محليًا بعد الاستخدام.
// -----------------------------------------------------------

import { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('auth_user');
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback(async (username, password) => {
    // ما في أي "دخول احتياطي محلي" لو فشل — فشل تسجيل الدخول
    // لازم يظهر كخطأ واضح للمستخدم، مش يمرّره لواجهة وهمية
    const data = await api.post('/auth/login', { username, password });
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('auth_user', JSON.stringify(data.user));
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth يجب أن يُستخدم داخل AuthProvider');
  return ctx;
}
