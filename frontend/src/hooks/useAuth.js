import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }, [token]);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      setToken(res.access_token);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(
    async (email, password) => {
      setLoading(true);
      setError(null);
      try {
        await api.register(email, password);
        return await login(email, password);
      } catch (e) {
        setError(e.message);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [login]
  );

  const logout = useCallback(() => setToken(null), []);

  return { token, login, register, logout, loading, error };
}
