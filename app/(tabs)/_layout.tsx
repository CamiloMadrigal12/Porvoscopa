import { Tabs } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { supabase } from "../../src/lib/supabase";

export default function TabLayout() {
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;

        if (!uid) {
          setRole(null);
          setReady(true);
          return;
        }

        const { data: p, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();

        if (!error) setRole((p as any)?.role ?? null);
      } finally {
        setReady(true);
      }
    };

    run();
  }, []);

  // ✅ Evita render antes de tener rol
  if (!ready) return null;

  // ✅ flags por rol (más legible y fácil de mantener)
  const canSeeAttendance = useMemo(() => role === "OPERADOR", [role]);
  const canSeeAdmin = useMemo(() => role === "ADMIN", [role]);
  const canSeeMetrics = useMemo(() => role === "METRICAS" || role === "ADMIN", [role]);

  // ⚙️ Decide si METRICAS también ve "Mis eventos"
  const metricsCanSeeIndex = false; // <- cambia a true si quieres que METRICAS vea "Mis eventos"
  const canSeeIndex = useMemo(() => {
    if (role === "OPERADOR" || role === "ADMIN") return true;
    if (role === "METRICAS") return metricsCanSeeIndex;
    return false;
  }, [role]);

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        // ✅ WEB: oculta la barra inferior
        tabBarStyle: Platform.OS === "web" ? { display: "none" } : undefined,
      }}
    >
      {/* Mis eventos */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Mis eventos",
          href: canSeeIndex ? undefined : null,
        }}
      />

      {/* Asistencia */}
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Asistencia",
          href: canSeeAttendance ? undefined : null,
        }}
      />

      {/* Scanner: oculto */}
      <Tabs.Screen name="scanner" options={{ href: null }} />

      {/* Admin */}
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          href: canSeeAdmin ? undefined : null,
        }}
      />

      {/* Métricas */}
      <Tabs.Screen
        name="metrics"
        options={{
          title: "Métricas",
          href: canSeeMetrics ? undefined : null,
        }}
      />

      {/* Explore oculto */}
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
