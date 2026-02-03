import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";

// ✅ Solo se importan en runtime (evita problemas si no está instalado en web)
let FileSystem: any = null;
let Sharing: any = null;
if (Platform.OS !== "web") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  FileSystem = require("expo-file-system");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sharing = require("expo-sharing");
}

type BarrioRow = {
  neighborhood: string;
  total: number;
};

type Profile = {
  id: string;
  role: "ADMIN" | "OPERADOR" | "METRICAS" | string;
  email: string | null;
  full_name: string | null;
};

type AttendanceExportRow = {
  event_id?: string | null;
  event_name: string | null;
  event_date: string | null;
  location: string | null;

  full_name: string | null;
  document: string | null;
  neighborhood: string | null;
  phone: string | null;
  invited_by: string | null;

  scanned_at: string | null;
  created_at?: string | null;

  // ✅ quien registró
  scanned_by_name?: string | null;
  scanned_by_email?: string | null;
};

function toYYYYMMDD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function csvEscape(v: any) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(rows: any[], headers: { key: string; label: string }[]) {
  const head = headers.map((h) => csvEscape(h.label)).join(",");
  const body = rows
    .map((r) => headers.map((h) => csvEscape(r?.[h.key])).join(","))
    .join("\n");
  return `${head}\n${body}\n`;
}

function formatISO(iso: string | null) {
  if (!iso) return "";
  return String(iso).replace("T", " ").slice(0, 16);
}

async function downloadCSV(filename: string, csv: string) {
  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (!FileSystem || !Sharing) {
    Alert.alert(
      "Falta dependencia",
      "Instala: npx expo install expo-file-system expo-sharing"
    );
    return;
  }

  const fileUri = FileSystem.documentDirectory + filename;
  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    Alert.alert("Listo", `Archivo guardado en: ${fileUri}`);
    return;
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: "text/csv",
    dialogTitle: "Exportar CSV",
  });
}

export default function MetricsScreen() {
  const [loading, setLoading] = useState(true);

  const [me, setMe] = useState<Profile | null>(null);

  const [eventsMonth, setEventsMonth] = useState(0);
  const [attendanceMonth, setAttendanceMonth] = useState(0);
  const [byBarrio, setByBarrio] = useState<BarrioRow[]>([]);

  // ✅ rango (por defecto mes actual)
  const [fromDate] = useState<string>(() => {
    const now = new Date();
    return toYYYYMMDD(new Date(now.getFullYear(), now.getMonth(), 1));
  });

  const isAllowed = useMemo(() => {
    return me?.role === "METRICAS" || me?.role === "ADMIN";
  }, [me]);

  const loadMe = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id,role,email,full_name")
      .eq("id", uid)
      .maybeSingle();

    if (error) throw error;
    return (data as Profile) ?? null;
  };

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const profile = await loadMe();
      setMe(profile);

      if (!profile || !(profile.role === "METRICAS" || profile.role === "ADMIN")) {
        setEventsMonth(0);
        setAttendanceMonth(0);
        setByBarrio([]);
        return;
      }

      const monthStart = fromDate;

      // 1) Eventos desde fromDate
      const evRes = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .gte("event_date", monthStart);

      if (evRes.error) throw evRes.error;
      setEventsMonth(evRes.count ?? 0);

      // 2) Asistentes desde fromDate
      const attRes = await supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart);

      if (attRes.error) throw attRes.error;
      setAttendanceMonth(attRes.count ?? 0);

      // 3) Por barrio / vereda (RPC)
      const barrioRes = await supabase.rpc("attendance_by_barrio_month", {
        from_date: monthStart,
      });

      if (barrioRes.error) throw barrioRes.error;
      setByBarrio((barrioRes.data ?? []) as BarrioRow[]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudieron cargar métricas");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Export 1: resumen básico
  const exportSummaryCSV = async () => {
    try {
      if (!isAllowed)
        return Alert.alert("Sin permisos", "No tienes permisos para exportar.");

      const rows = [
        { metric: "Eventos desde", value: fromDate },
        { metric: "Reuniones (conteo)", value: eventsMonth },
        { metric: "Asistentes (conteo)", value: attendanceMonth },
      ];

      const csv = toCSV(rows, [
        { key: "metric", label: "Metrica" },
        { key: "value", label: "Valor" },
      ]);

      await downloadCSV(`resumen_${fromDate}.csv`, csv);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo exportar");
    }
  };

  // ✅ Export 2: por barrio (tabla)
  const exportByBarrioCSV = async () => {
    try {
      if (!isAllowed)
        return Alert.alert("Sin permisos", "No tienes permisos para exportar.");

      const csv = toCSV(byBarrio, [
        { key: "neighborhood", label: "Barrio/Vereda" },
        { key: "total", label: "Total" },
      ]);

      await downloadCSV(`asistencia_por_barrio_${fromDate}.csv`, csv);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo exportar");
    }
  };

  // ✅ Export 3: asistencias (TABLA) + “Registrado por”
  const exportAttendanceCSV = async () => {
    try {
      if (!isAllowed)
        return Alert.alert("Sin permisos", "No tienes permisos para exportar.");

      const { data, error } = await supabase
        .from("v_attendance_with_event")
        .select(
          "event_name,event_date,location,full_name,document,neighborhood,phone,invited_by,scanned_at,scanned_by_name,scanned_by_email,created_at"
        )
        .gte("created_at", fromDate)
        .order("event_date", { ascending: false })
        .order("scanned_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as AttendanceExportRow[];

      const normalized = rows.map((r) => ({
        event_name: r.event_name ?? "",
        event_date: r.event_date ?? "",
        location: r.location ?? "",
        full_name: r.full_name ?? "",
        document: r.document ?? "",
        neighborhood: r.neighborhood ?? "",
        phone: r.phone ?? "",
        invited_by: r.invited_by ?? "",
        scanned_at: formatISO(r.scanned_at ?? null),
        registered_by: r.scanned_by_name || r.scanned_by_email || "",
      }));

      const csv = toCSV(normalized, [
        { key: "event_name", label: "Evento" },
        { key: "event_date", label: "Fecha evento" },
        { key: "location", label: "Lugar" },
        { key: "full_name", label: "Nombre asistente" },
        { key: "document", label: "Documento" },
        { key: "neighborhood", label: "Barrio/Vereda" },
        { key: "phone", label: "Telefono" },
        { key: "invited_by", label: "Invitado por" },
        { key: "scanned_at", label: "Escaneado en" },
        { key: "registered_by", label: "Registrado por" }, // ✅ NUEVO
      ]);

      await downloadCSV(`asistencias_${fromDate}.csv`, csv);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo exportar asistencias");
    }
  };

  // ✅ Export 4: resumen por evento (TABLA) Evento | Fecha | Lugar | Total
  const exportSummaryByEventCSV = async () => {
    try {
      if (!isAllowed)
        return Alert.alert("Sin permisos", "No tienes permisos para exportar.");

      const { data, error } = await supabase
        .from("v_attendance_with_event")
        .select("event_name,event_date,location,created_at")
        .gte("created_at", fromDate);

      if (error) throw error;

      const rows = (data ?? []) as AttendanceExportRow[];

      const map = new Map<
        string,
        { event_name: string; event_date: string; location: string; total: number }
      >();

      for (const r of rows) {
        const key = `${r.event_name ?? ""}__${r.event_date ?? ""}__${r.location ?? ""}`;
        const curr = map.get(key);
        if (curr) curr.total += 1;
        else {
          map.set(key, {
            event_name: r.event_name ?? "",
            event_date: r.event_date ?? "",
            location: r.location ?? "",
            total: 1,
          });
        }
      }

      const summary = Array.from(map.values()).sort((a, b) =>
        String(b.event_date).localeCompare(String(a.event_date))
      );

      const csv = toCSV(summary, [
        { key: "event_name", label: "Evento" },
        { key: "event_date", label: "Fecha" },
        { key: "location", label: "Lugar" },
        { key: "total", label: "Total asistentes" },
      ]);

      await downloadCSV(`resumen_por_evento_${fromDate}.csv`, csv);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo exportar resumen por evento");
    }
  };

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Métricas</Text>

      <Text style={styles.small}>
        Usuario: {me?.email ?? "-"} | Rol: {me?.role ?? "-"}
      </Text>

      {!isAllowed ? (
        <View style={styles.card}>
          <Text style={styles.warn}>
            No tienes permiso para ver métricas. (Requiere rol METRICAS o ADMIN)
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.h2}>Métricas del mes</Text>
            <Text style={styles.small}>Desde: {fromDate}</Text>

            <Pressable
              style={[styles.btnGray, { marginTop: 10 }]}
              onPress={loadMetrics}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? "Cargando…" : "Actualizar"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.kpiLabel}>Reuniones desde {fromDate}</Text>
            <Text style={styles.kpiValue}>{loading ? "…" : eventsMonth}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.kpiLabel}>Asistentes desde {fromDate}</Text>
            <Text style={styles.kpiValue}>
              {loading ? "…" : attendanceMonth}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.h2}>Asistencia por barrio / vereda</Text>

            {loading ? (
              <Text style={styles.small}>Cargando…</Text>
            ) : byBarrio.length === 0 ? (
              <Text style={styles.small}>Sin registros.</Text>
            ) : (
              byBarrio.map((b) => (
                <View key={b.neighborhood} style={styles.row}>
                  <Text style={styles.rowLeft}>{b.neighborhood}</Text>
                  <Text style={styles.rowRight}>{b.total}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.h2}>Descargar</Text>

            <Pressable style={styles.btn} onPress={exportSummaryCSV} disabled={loading}>
              <Text style={styles.btnText}>Descargar resumen (CSV)</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, { marginTop: 10 }]}
              onPress={exportSummaryByEventCSV}
              disabled={loading}
            >
              <Text style={styles.btnText}>Descargar resumen por evento (CSV)</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, { marginTop: 10 }]}
              onPress={exportByBarrioCSV}
              disabled={loading}
            >
              <Text style={styles.btnText}>Descargar por barrio (CSV)</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, { marginTop: 10 }]}
              onPress={exportAttendanceCSV}
              disabled={loading}
            >
              <Text style={styles.btnText}>Descargar asistencias (CSV)</Text>
            </Pressable>

            <Text style={[styles.small, { marginTop: 8 }]}>
              * Los CSV usan la vista{" "}
              <Text style={{ fontWeight: "800" }}>v_attendance_with_event</Text>.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 30 },
  h1: { fontSize: 22, fontWeight: "800", marginBottom: 10 },
  h2: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  small: { fontSize: 12, opacity: 0.8 },
  warn: { fontSize: 14, fontWeight: "800", color: "#b45309" },

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

  btn: {
    backgroundColor: "#111827",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnGray: {
    backgroundColor: "#374151",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "800" },
});
