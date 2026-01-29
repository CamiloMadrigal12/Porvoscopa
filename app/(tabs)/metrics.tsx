import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { supabase } from "../../src/lib/supabase";

type CountRow = { count: number };

type BarrioRow = {
  neighborhood: string;
  total: number;
};

export default function MetricsScreen() {
  const [loading, setLoading] = useState(true);
  const [eventsMonth, setEventsMonth] = useState(0);
  const [attendanceMonth, setAttendanceMonth] = useState(0);
  const [byBarrio, setByBarrio] = useState<BarrioRow[]>([]);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10);

      /* =========================
         1) Eventos del mes
      ==========================*/
      const evRes = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .gte("event_date", monthStart);

      if (evRes.error) throw evRes.error;
      setEventsMonth(evRes.count ?? 0);

      /* =========================
         2) Asistentes del mes
      ==========================*/
      const attRes = await supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart);

      if (attRes.error) throw attRes.error;
      setAttendanceMonth(attRes.count ?? 0);

      /* =========================
         3) Por barrio / vereda
      ==========================*/
      const barrioRes = await supabase.rpc("attendance_by_barrio_month", {
        from_date: monthStart,
      });

      if (barrioRes.error) throw barrioRes.error;
      setByBarrio(barrioRes.data ?? []);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudieron cargar métricas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Métricas del mes</Text>

      <View style={styles.card}>
        <Text style={styles.kpiLabel}>Reuniones este mes</Text>
        <Text style={styles.kpiValue}>{loading ? "…" : eventsMonth}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.kpiLabel}>Asistentes registrados</Text>
        <Text style={styles.kpiValue}>{loading ? "…" : attendanceMonth}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Asistencia por barrio / vereda</Text>

        {loading ? (
          <Text style={styles.small}>Cargando…</Text>
        ) : byBarrio.length === 0 ? (
          <Text style={styles.small}>Sin registros este mes.</Text>
        ) : (
          byBarrio.map((b) => (
            <View key={b.neighborhood} style={styles.row}>
              <Text style={styles.rowLeft}>{b.neighborhood}</Text>
              <Text style={styles.rowRight}>{b.total}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 30 },
  h1: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  h2: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  small: { fontSize: 12, opacity: 0.8 },

  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "white",
  },

  kpiLabel: { fontSize: 13, opacity: 0.8 },
  kpiValue: { fontSize: 28, fontWeight: "900", marginTop: 4 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  rowLeft: { fontSize: 13 },
  rowRight: { fontSize: 13, fontWeight: "800" },
});
