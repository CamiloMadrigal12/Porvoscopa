import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
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

  // ✅ Evita que el tab layout renderice antes de tener rol (sobre todo en web)
  if (!ready) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,

        // ✅ WEB: oculta la barra inferior (para que los botones queden arriba en tus pantallas)
        tabBarStyle: Platform.OS === "web" ? { display: "none" } : undefined,
      }}
    >
      {/* Mis eventos: lo pueden ver todos */}
      <Tabs.Screen name="index" options={{ title: "Mis eventos" }} />

      {/* Asistencia: solo OPERADOR */}
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Asistencia",
          href: role === "OPERADOR" ? undefined : null,
        }}
      />

      {/* Scanner: 100% oculto (no cámara) */}
      <Tabs.Screen name="scanner" options={{ href: null }} />

      {/* Admin: solo ADMIN */}
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          href: role === "ADMIN" ? undefined : null,
        }}
      />
      <Tabs.Screen
  name="metrics"
  options={{
    title: "Métricas",
    href: role === "METRICAS" ? undefined : null,
  }}
/>

      {/* Oculta explore */}
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
