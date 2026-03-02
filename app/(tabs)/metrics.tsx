import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

function isValidYYYYMMDD(s: string) {
  // formato simple YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test((s || "").trim());
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

  const [eventsCount, setEventsCount] = useState(0);
  const [attendanceCount, setAttendanceCount] = useState(0);

  // ✅ CAMBIO: Ahora guardamos asistencia por evento
  const [byEvent, setByEvent] = useState<EventAttendanceRow[]>([]);

  // ✅ NUEVO: Buscador
  const [searchQuery, setSearchQuery] = useState("");

  /**
   * ✅ CORRECCIÓN:
   * Antes filtrabas automáticamente por el primer día del mes, por eso solo veías “4”.
   * Ahora:
   * - Por defecto NO filtra (histórico completo).
   * - Si quieres filtrar, puedes escribir una fecha YYYY-MM-DD y tocar “Aplicar”.
   */
  const [fromDate, setFromDate] = useState<string>(""); // "" = sin filtro

  const isAllowed = useMemo(() => {
    return me?.role === "METRICAS" || me?.role === "ADMIN";
  }, [me]);

  // ✅ NUEVO: Filtrar eventos por búsqueda
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return byEvent;

    const query = searchQuery.toLowerCase();
    return byEvent.filter((e) => {
      const name = e.event_name.toLowerCase();
      const date = (e.event_date || "").toLowerCase();
      return name.includes(query) || date.includes(query);
    });
  }, [byEvent, searchQuery]);

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
        setEventsCount(0);
        setAttendanceCount(0);
        setByEvent([]);
        return;
      }

      const hasFromDate = isValidYYYYMMDD(fromDate);

      /* 1) Conteo de eventos (histórico o desde fromDate) */
      let evQuery = supabase
        .from("events")
        .select("id", { count: "exact", head: true });

      if (hasFromDate) {
        evQuery = evQuery.gte("event_date", fromDate);
      }

      const evRes = await evQuery;
      if (evRes.error) throw evRes.error;
      setEventsCount(evRes.count ?? 0);

      /* 2) Conteo de asistencias (histórico o desde fromDate) */
      let attQuery = supabase
        .from("attendance")
        .select("id", { count: "exact", head: true });

      if (hasFromDate) {
        attQuery = attQuery.gte("created_at", fromDate);
      }

      const attRes = await attQuery;
      if (attRes.error) throw attRes.error;
      setAttendanceCount(attRes.count ?? 0);

      /* 3) Asistencia por evento (personas por reunión) */
      let eventAttendanceQuery = supabase
        .from("attendance")
        .select(
          `
          event_id,
          event:events (
            name,
            event_date
          )
        `
        );

      if (hasFromDate) {
        eventAttendanceQuery = eventAttendanceQuery.gte("created_at", fromDate);
      }

      const eventAttendanceRes = await eventAttendanceQuery;
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
      setEventsCount(0);
      setAttendanceCount(0);
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

  const applyFromDate = () => {
    const trimmed = (fromDate || "").trim();
    if (trimmed.length === 0) {
      // sin filtro
      loadMetrics();
      return;
    }
    if (!isValidYYYYMMDD(trimmed)) {
      Alert.alert("Fecha inválida", "Usa el formato YYYY-MM-DD (ej: 2026-01-01).");
      return;
    }
    loadMetrics();
  };

  const setMonthStart = () => {
    const now = new Date();
    setFromDate(toYYYYMMDD(new Date(now.getFullYear(), now.getMonth(), 1)));
  };

  const clearFromDate = () => {
    setFromDate("");
  };

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filterLabel = useMemo(() => {
    const trimmed = (fromDate || "").trim();
    if (!isValidYYYYMMDD(trimmed)) return "Histórico (sin filtro)";
    return `Desde: ${trimmed}`;
  }, [fromDate]);

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

          <Pressable
            style={[styles.btnDanger, { marginTop: 10 }]}
            onPress={onSignOut}
          >
            <Text style={styles.btnText}>Cerrar sesión</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.h2}>Filtro</Text>
            <Text style={styles.small}>{filterLabel}</Text>

            <View style={{ marginTop: 10 }}>
              <Text style={[styles.small, { marginBottom: 6, opacity: 0.9 }]}>
                Fecha desde (YYYY-MM-DD) — déjalo vacío para ver todo:
              </Text>

              <View style={styles.dateRow}>
                <TextInput
                  style={styles.dateInput}
                  placeholder="YYYY-MM-DD"
                  value={fromDate}
                  onChangeText={setFromDate}
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Pressable
                  style={[styles.btnGraySm, loading && { opacity: 0.7 }]}
                  onPress={setMonthStart}
                  disabled={loading}
                >
                  <Text style={styles.btnTextSm}>Mes</Text>
                </Pressable>

                <Pressable
                  style={[styles.btnGraySm, loading && { opacity: 0.7 }]}
                  onPress={clearFromDate}
                  disabled={loading}
                >
                  <Text style={styles.btnTextSm}>Todo</Text>
                </Pressable>
              </View>

              <Pressable
                style={[
                  styles.btnGray,
                  { marginTop: 10 },
                  loading && { opacity: 0.7 },
                ]}
                onPress={applyFromDate}
                disabled={loading}
              >
                <Text style={styles.btnText}>
                  {loading ? "Cargando…" : "Aplicar / Actualizar"}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.kpiLabel}>Reuniones ({filterLabel})</Text>
            <Text style={styles.kpiValue}>{loading ? "…" : eventsCount}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.kpiLabel}>Asistentes ({filterLabel})</Text>
            <Text style={styles.kpiValue}>{loading ? "…" : attendanceCount}</Text>
          </View>

          {/* ✅ CAMBIO: Ahora muestra personas por reunión */}
          <View style={styles.card}>
            <Text style={styles.h2}>Asistencia por reunión</Text>

            {/* ✅ NUEVO: Buscador */}
            <View style={styles.searchContainer}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por nombre o fecha..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#9ca3af"
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => setSearchQuery("")}
                  style={styles.clearButton}
                >
                  <Text style={styles.clearText}>✕</Text>
                </Pressable>
              )}
            </View>

            {loading ? (
              <Text style={styles.small}>Cargando…</Text>
            ) : filteredEvents.length === 0 ? (
              <Text style={styles.small}>
                {searchQuery ? "No se encontraron reuniones." : "Sin registros."}
              </Text>
            ) : (
              <>
                {searchQuery && (
                  <Text style={styles.resultCount}>
                    {filteredEvents.length} de {byEvent.length} reuniones
                  </Text>
                )}
                {filteredEvents.map((e) => (
                  <View key={`${e.event_name}-${e.event_date}`} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLeft}>{e.event_name}</Text>
                      <Text style={styles.rowDate}>{e.event_date || "Sin fecha"}</Text>
                    </View>
                    <Text style={styles.rowRight}>{e.total}</Text>
                  </View>
                ))}
              </>
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
              style={[
                styles.btnDanger,
                { marginTop: 12 },
                loading && { opacity: 0.7 },
              ]}
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

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#fff",
  },
  btnGraySm: {
    backgroundColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnTextSm: { color: "white", fontWeight: "800", fontSize: 12 },

  // ✅ NUEVO: Estilos del buscador
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    padding: 0,
  },
  clearButton: {
    padding: 4,
  },
  clearText: {
    fontSize: 18,
    color: "#6b7280",
    fontWeight: "600",
  },
  resultCount: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
    fontStyle: "italic",
  },

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