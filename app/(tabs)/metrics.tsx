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

let FileSystem: any = null;
let Sharing: any = null;
if (Platform.OS !== "web") {
  FileSystem = require("expo-file-system");
  Sharing = require("expo-sharing");
}

// ✅ CAMBIO: En lugar de por barrio, ahora por evento/reunión
type EventAttendanceRow = {
  event_name: string;
  event_date: string | null;
  total: number;
};

type Profile = {
  id: string;
  role: "ADMIN" | "OPERADOR" | "METRICAS" | string;
  email: string | null;
  full_name: string | null;
};

type AttendanceExportRow = {
  event_name: string | null;
  event_date: string | null;
  location: string | null;
  full_name: string | null;
  document: string | null;
  neighborhood: string | null;
  phone: string | null;
  invited_by: string | null;
  scanned_at: string | null;
  scanned_by_name?: string | null;
  scanned_by_email?: string | null;
  created_at?: string | null;
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
  if (/[;\n\r"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(
  rows: any[],
  headers: { key: string; label: string }[],
  delimiter: string = ";"
) {
  const head = headers.map((h) => csvEscape(h.label)).join(delimiter);
  const body = rows
    .map((r) => headers.map((h) => csvEscape(r?.[h.key])).join(delimiter))
    .join("\n");
  return `${head}\n${body}\n`;
}

function formatISO(iso: string | null) {
  if (!iso) return "";
  return String(iso).replace("T", " ").slice(0, 16);
}

async function downloadCSV(filename: string, csv: string) {
  const BOM = "\uFEFF";
  const content = BOM + csv;

  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
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
  await FileSystem.writeAsStringAsync(fileUri, content, {
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
  
  // ✅ CAMBIO: Ahora guardamos asistencia por evento
  const [byEvent, setByEvent] = useState<EventAttendanceRow[]>([]);

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

      const allowed = profile?.role === "METRICAS" || profile?.role === "ADMIN";
      if (!profile || !allowed) {
        setEventsMonth(0);
        setAttendanceMonth(0);
        setByEvent([]);
        return;
      }

      const monthStart = fromDate;

      /* 1) Eventos desde fromDate */
      const evRes = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .gte("event_date", monthStart);

      if (evRes.error) throw evRes.error;
      setEventsMonth(evRes.count ?? 0);

      /* 2) Asistentes desde fromDate */
      const attRes = await supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart);

      if (attRes.error) throw attRes.error;
      setAttendanceMonth(attRes.count ?? 0);

      /* ✅ 3) Asistencia por evento (personas por reunión) */
      const eventAttendanceRes = await supabase
        .from("attendance")
        .select(
          `
          event_id,
          event:events (
            name,
            event_date
          )
        `
        )
        .gte("created_at", monthStart);

      if (eventAttendanceRes.error) throw eventAttendanceRes.error;

      // Agrupar manualmente por evento
      const eventMap = new Map<string, EventAttendanceRow>();

      for (const row of eventAttendanceRes.data ?? []) {
        const eventName = (row.event as any)?.name || "Sin nombre";
        const eventDate = (row.event as any)?.event_date || null;
        const key = row.event_id;

        if (!eventMap.has(key)) {
          eventMap.set(key, {
            event_name: eventName,
            event_date: eventDate,
            total: 0,
          });
        }

        const current = eventMap.get(key)!;
        current.total += 1;
      }

      const eventList = Array.from(eventMap.values()).sort(
        (a, b) => b.total - a.total
      );

      setByEvent(eventList);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudieron cargar métricas");
      setEventsMonth(0);
      setAttendanceMonth(0);
      setByEvent([]);
    } finally {
      setLoading(false);
    }
  };

  const exportAttendanceCSV = async () => {
    try {
      if (!isAllowed) {
        Alert.alert("Sin permisos", "No tienes permisos para exportar.");
        return;
      }

      const query = supabase
        .from("v_attendance_with_event")
        .select(
          "event_name,event_date,location,full_name,document,neighborhood,phone,invited_by,scanned_at,scanned_by_name,scanned_by_email"
        )
        .order("event_date", { ascending: false })
        .order("scanned_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as AttendanceExportRow[];

      if (rows.length === 0) {
        Alert.alert("Sin datos", "No hay asistencias para exportar.");
        return;
      }

      const normalized = rows.map((r) => ({
        event_name: r.event_name ?? "",
        event_date: r.event_date ?? "",
        location: r.location ?? "",
        full_name: r.full_name ?? "",
        document: r.document ?? "",
        phone: r.phone ?? "",
        neighborhood: r.neighborhood ?? "",
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
        { key: "phone", label: "Celular" },
        { key: "neighborhood", label: "Barrio/Vereda" },
        { key: "invited_by", label: "Invitado por" },
        { key: "scanned_at", label: "Escaneado en" },
        { key: "registered_by", label: "Registrado por" },
      ]);

      await downloadCSV("asistencias.csv", csv);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo exportar asistencias");
    }
  };

  const onSignOut = async () => {
    await supabase.auth.signOut();
    const { router } = require("expo-router");
    router.replace("/login");
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

          <Pressable style={[styles.btnDanger, { marginTop: 10 }]} onPress={onSignOut}>
            <Text style={styles.btnText}>Cerrar sesión</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.h2}>Métricas del mes</Text>
            <Text style={styles.small}>Desde: {fromDate}</Text>

            <Pressable
              style={[styles.btnGray, { marginTop: 10 }, loading && { opacity: 0.7 }]}
              onPress={loadMetrics}
              disabled={loading}
            >
              <Text style={styles.btnText}>{loading ? "Cargando…" : "Actualizar"}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.kpiLabel}>Reuniones desde {fromDate}</Text>
            <Text style={styles.kpiValue}>{loading ? "…" : eventsMonth}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.kpiLabel}>Asistentes desde {fromDate}</Text>
            <Text style={styles.kpiValue}>{loading ? "…" : attendanceMonth}</Text>
          </View>

          {/* ✅ CAMBIO: Ahora muestra personas por reunión */}
          <View style={styles.card}>
            <Text style={styles.h2}>Asistencia por reunión</Text>

            {loading ? (
              <Text style={styles.small}>Cargando…</Text>
            ) : byEvent.length === 0 ? (
              <Text style={styles.small}>Sin registros.</Text>
            ) : (
              byEvent.map((e) => (
                <View key={`${e.event_name}-${e.event_date}`} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLeft}>{e.event_name}</Text>
                    <Text style={styles.rowDate}>{e.event_date || "Sin fecha"}</Text>
                  </View>
                  <Text style={styles.rowRight}>{e.total}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.h2}>Descargar</Text>

            <Pressable
              style={[styles.btn, loading && { opacity: 0.7 }]}
              onPress={exportAttendanceCSV}
              disabled={loading}
            >
              <Text style={styles.btnText}>Descargar asistencias (CSV)</Text>
            </Pressable>

            <Pressable
              style={[styles.btnDanger, { marginTop: 12 }, loading && { opacity: 0.7 }]}
              onPress={onSignOut}
              disabled={loading}
            >
              <Text style={styles.btnText}>Cerrar sesión</Text>
            </Pressable>
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
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  rowLeft: { fontSize: 13, fontWeight: "700" },
  rowDate: { fontSize: 11, opacity: 0.7, marginTop: 2 },
  rowRight: { fontSize: 16, fontWeight: "800", marginLeft: 8 },

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
  btnDanger: {
    backgroundColor: "#7f1d1d",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "800" },
});