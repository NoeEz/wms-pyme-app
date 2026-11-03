import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Button, Input } from "../components/ui";
import type { User } from "../types";
import { getLastCompany, login } from "../services/auth";
import { ApiError } from "../services/api";

interface Props {
  onLogin: (user: User, token: string) => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLastCompany().then(last => setCompany(current => current || last));
  }, []);

  async function attemptLogin(loginCompany: string, loginEmail: string, loginPassword: string) {
    setLoading(true);
    setError('');
    try {
      const { user, token } = await login(loginCompany.trim(), loginEmail.trim(), loginPassword);
      onLogin(user, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function handleLogin() {
    if (!company.trim() || !email || !password) {
      setError('Completa todos los campos para continuar.');
      return;
    }
    attemptLogin(company, email, password);
  }

  return (
    <View className="flex-1 bg-[#0F172A]">
      {/* Brand block */}
      <View className="px-6 pt-14 pb-16 items-center">
        <View className="w-14 h-14 rounded-2xl bg-[#4F46E5] items-center justify-center mb-4 shadow-lg shadow-black/30">
          <Text className="text-white text-xl font-extrabold">W</Text>
        </View>
        <View className="flex-row">
          <Text className="text-white text-2xl font-bold tracking-tight">WMS</Text>
          <Text className="text-[#94A3B8] text-2xl font-light"> PyME</Text>
        </View>
        <Text className="text-[#94A3B8] text-sm mt-1">Sistema de gestión de almacén</Text>
      </View>

      {/* Form card */}
      <View className="flex-1 bg-[#F8FAFC] rounded-t-[28px] px-6 pt-8 pb-6 flex flex-col gap-5">
        <Text className="text-[#0F172A] text-lg font-semibold">Iniciar sesión</Text>

        <View className="flex flex-col gap-4">
          <Input
            label="Empresa"
            placeholder="Código de tu empresa, p. ej. nova"
            value={company}
            onChange={v => { setCompany(v); setError(''); }}
            icon="home"
          />
          <Input
            label="Correo electrónico"
            placeholder="usuario@empresa.mx"
            value={email}
            onChange={v => { setEmail(v); setError(''); }}
            icon="user"
            type="email"
          />
          <Input
            label="Contraseña"
            placeholder="••••••••"
            value={password}
            onChange={v => { setPassword(v); setError(''); }}
            type="password"
          />

          {error && (
            <View className="flex-row items-start gap-2 bg-[#FEE2E2] px-4 py-3 rounded-xl">
              <Text className="text-[#7F1D1D] text-sm mt-0.5">⚠</Text>
              <Text className="text-[#7F1D1D] text-sm flex-1">{error}</Text>
            </View>
          )}

          <Button fullWidth loading={loading} onClick={handleLogin} size="lg">
            Ingresar
          </Button>
        </View>

        <View className="flex-1" />
        <Text className="text-center text-xs text-[#94A3B8]">v1.0.0-mvp · WMS PyME</Text>
      </View>
    </View>
  );
}
