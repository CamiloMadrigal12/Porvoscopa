import type { Href } from "expo-router";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../src/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    const e = email.trim();
    const p = password;

    if (!e || !p) {
      Alert.alert("Faltan datos", "Escribe tu correo y contraseña.");
      return;
    }

    setLoading(true);

    try {
      // 1) Login Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: e,
        password: p,
      });

      if (error) throw error;
      if (!data.session) throw new Error("No se recibió sesión");

      const userId = data.user.id;

      // 2) Consultar rol en profiles
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (profileError) throw profileError;

      const role = (profile as any)?.role ?? null;

      // ✅ Rutas tipadas (evita subrayado TS)
      const toAdmin: Href = "/(tabs)/admin";
      const toAttendance: Href = "/(tabs)/attendance";
      const toMetrics: Href = "/(tabs)/metrics";
const toIndex: Href = "/(tabs)";
      // 3) Redirección por rol
      if (role === "ADMIN") {
        router.replace(toAdmin);
      } else if (role === "OPERADOR") {
        router.replace(toAttendance);
      } else if (role === "METRICAS") {
        router.replace(toMetrics);
      } else {
        // fallback seguro
        router.replace(toIndex);
      }
    } catch (err: any) {
      Alert.alert("Login falló", err?.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require("../assets/images/porvos-logo.jpg")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>Asistencia a eventos</Text>

      <TextInput
        placeholder="Correo"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />

      <TextInput
        placeholder="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />

      <Pressable style={[styles.button, loading && { opacity: 0.7 }]} onPress={onLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Entrando..." : "Entrar"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  logo: { width: 160, height: 160, alignSelf: "center", marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 24, textAlign: "center" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, marginBottom: 12 },
  button: { backgroundColor: "#111827", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 6 },
  buttonText: { color: "white", fontWeight: "700" },
});
