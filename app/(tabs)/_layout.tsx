import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
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

  // ✅ flags por rol (sin hooks)
  const canSeeAttendance = role === "OPERADOR";
  const canSeeAdmin = role === "ADMIN";
  const canSeeMetrics = role === "METRICAS" || role === "ADMIN";

  // ⚙️ si quieres que METRICAS también vea "Mis eventos", ponlo en true
  const metricsCanSeeIndex = false;

  const canSeeIndex =
    role === "OPERADOR" ||
    role === "ADMIN" ||
    (role === "METRICAS" && metricsCanSeeIndex);

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        // ✅ IMPORTANTE: NO ocultar tabs en web
        // Antes lo tenías oculto y por eso no podías ir a Métricas.
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

      {/* Scanner oculto */}
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
