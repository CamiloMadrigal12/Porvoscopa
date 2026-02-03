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
  event_name: string | null;
  event_date: string | null;
  location: string | null;

  full_name: string | null;
  document: string | null;
  neighborhood: string | null;
  phone: string | null;
  invited_by: string | null;

  scanned_at: string | null;

  // ✅ quién registró
  scanned_by_name?: string | null;
  scanned_by_email?: string | null;

  // opcional si lo tienes en la vista
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
  // ✅ como usamos ;, escapamos ; además de comillas/saltos
  if (/[;\n\r"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ✅ Excel en español: usa ; como delimitador
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
  // "2026-02-02T20:22:34..." -> "2026-02-02 20:22"
  return String(iso).replace("T", " ").slice(0, 16);
}

async function downloadCSV(filename: string, csv: string) {
  // ✅ BOM para Excel (acentos/tildes)
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

  // ✅ control de rol
  const [me, setMe] = useState<Profile | null>(null);

  const [eventsMonth, setEventsMonth] = useState(0);
  const [attendanceMonth, setAttendanceMonth] = useState(0);
  const [byBarrio, setByBarrio] = useState<BarrioRow[]>([]);

  // ✅ desde inicio del mes (solo para métricas en pantalla)
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

      // ✅ permisos: no consultes más si no corresponde
      const allowed = profile?.role === "METRICAS" || profile?.role === "ADMIN";
      if (!profile || !allowed) {
        setEventsMonth(0);
        setAttendanceMonth(0);
        setByBarrio([]);
        return;
      }

      const monthStart = fromDate;

      /* =========================
         1) Eventos desde fromDate
      ==========================*/
      const evRes = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .gte("event_date", monthStart);

      if (evRes.error) throw evRes.error;
      setEventsMonth(evRes.count ?? 0);

      /* =========================
         2) Asistentes desde fromDate
      ==========================*/
      const attRes = await supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart);

      if (attRes.error) throw attRes.error;
      setAttendanceMonth(attRes.count ?? 0);

      /* =========================
         3) Por barrio / vereda (RPC)
      ==========================*/
      const barrioRes = await supabase.rpc("attendance_by_barrio_month", {
        from_date: monthStart,
      });

      if (barrioRes.error) throw barrioRes.error;
      setByBarrio((barrioRes.data ?? []) as BarrioRow[]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudieron cargar métricas");
      setEventsMonth(0);
      setAttendanceMonth(0);
      setByBarrio([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * ✅ ÚNICO EXPORT (el que quieres):
   * CSV PLANO por columnas, Excel-friendly, con "Registrado por"
   *
   * - Descarga TODO histórico (sin filtro)
   * - Si algún día quieres filtrar por mes: descomenta el .gte("created_at", fromDate)
   */
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

      // ✅ Si quieres filtrar solo desde el mes actual, activa esto:
      // query.gte("created_at", fromDate);

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
        { key: "registered_by", label: "Registrado por" },
      ]);

      // ✅ Nombre fijo (menos enredos)
      await downloadCSV("asistencias.csv", csv);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo exportar asistencias");
    }
  };

  const onSignOut = async () => {
    await supabase.auth.signOut();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
          {/* Encabezado + actualizar */}
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

          {/* KPI 1 */}
          <View style={styles.card}>
            <Text style={styles.kpiLabel}>Reuniones desde {fromDate}</Text>
            <Text style={styles.kpiValue}>{loading ? "…" : eventsMonth}</Text>
          </View>

          {/* KPI 2 */}
          <View style={styles.card}>
            <Text style={styles.kpiLabel}>Asistentes desde {fromDate}</Text>
            <Text style={styles.kpiValue}>{loading ? "…" : attendanceMonth}</Text>
          </View>

          {/* Barrio/Vereda */}
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

          {/* ✅ Descargar (solo 1 botón) + cerrar sesión */}
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
  btnDanger: {
    backgroundColor: "#7f1d1d",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "800" },
});
