import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { supabase } from "../../src/lib/supabase";

type EventRow = {
  id: string;
  name: string;
  location: string | null;
  event_date: string | null; // YYYY-MM-DD
  start_time: string | null; // HH:mm:ss
  end_time: string | null;   // HH:mm:ss
};

const COLOMBIA_UTC_OFFSET_MIN = -5 * 60; // UTC-5

function toUTCDateFromColombia(dateYYYYMMDD: string, timeHHMMSS: string): Date | null {
  // Construimos un "UTC timestamp" equivalente a (fecha/hora en Colombia)
  // Colombia = UTC-5 => UTC = Colombia + 5 horas
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const [hh, mm, ss] = timeHHMMSS.split(":").map((x) => Number(x ?? 0));

  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return null;

  // Esto crea un Date en UTC a partir de componentes UTC
  // Primero creamos la hora "local Colombia" como si fuera UTC y luego ajustamos +5h
  const baseUTC = Date.UTC(y, m - 1, d, hh, mm, Number.isFinite(ss) ? ss : 0);

  // Colombia -5 => para pasar a UTC sumamos 5 horas (300 min)
  const utcMs = baseUTC - COLOMBIA_UTC_OFFSET_MIN * 60 * 1000;

  const dt = new Date(utcMs);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function endsAtUTC(ev: EventRow): Date | null {
  if (!ev.event_date) return null;
  const time = ev.end_time || ev.start_time;
  if (!time) return null;

  const t = time.length === 5 ? `${time}:00` : time; // HH:mm -> HH:mm:00
  return toUTCDateFromColombia(ev.event_date, t);
}

function isEventPast(ev: EventRow): boolean {
  const endUTC = endsAtUTC(ev);
  if (!endUTC) return false;
  return endUTC.getTime() < Date.now();
}

function fmtEventLine(ev: EventRow) {
  const date = ev.event_date ?? "";
  const st = ev.start_time ? ` | ${String(ev.start_time).slice(0, 5)}` : "";
  const et = ev.end_time ? ` - ${String(ev.end_time).slice(0, 5)}` : "";
  const loc = ev.location ? ` | ${ev.location}` : "";
  return `${date}${st}${et}${loc}`.trim();
}

export default function MyEvents() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);

  const hasEvents = useMemo(() => !loading && events.length > 0, [loading, events]);

  const load = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        router.replace("/login");
        return;
      }

      // 1) traer ids asignados
      const staffRes = await supabase
        .from("event_staff")
        .select("event_id")
        .eq("user_id", uid);

      if (staffRes.error) throw staffRes.error;

      const ids = Array.from(
        new Set((staffRes.data ?? []).map((r: any) => String(r.event_id)).filter(Boolean))
      );

      if (ids.length === 0) {
        setEvents([]);
        return;
      }

      // 2) traer eventos
      const evRes = await supabase
        .from("events")
        .select("id,name,location,event_date,start_time,end_time")
        .in("id", ids);

      if (evRes.error) throw evRes.error;

      // ✅ 3) filtrar: solo pendientes (hora Colombia)
      let list = (evRes.data ?? []) as EventRow[];
      list = list.filter((ev) => !isEventPast(ev));

      // ✅ 4) ordenar: próximos primero (hora Colombia)
      list.sort((a, b) => {
        const ea = endsAtUTC(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const eb = endsAtUTC(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return ea - eb;
      });

      setEvents(list);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Error cargando eventos");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Mis eventos</Text>
      <Text style={styles.small}>{loading ? "Cargando..." : "Sesión activa."}</Text>

      <View style={styles.list}>
        {loading ? null : !hasEvents ? (
          <Text style={styles.empty}>
            No tienes eventos pendientes asignados (o ya terminaron).
          </Text>
        ) : (
          events.map((ev) => (
            <View key={ev.id} style={styles.card}>
              <Text style={styles.title}>{ev.name}</Text>
              <Text style={styles.small}>{fmtEventLine(ev)}</Text>

              <Pressable
                style={[styles.btn, { marginTop: 10 }]}
                onPress={() => router.push(`/(tabs)/attendance`)}
              >
                <Text style={styles.btnText}>Tomar asistencia</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      <Pressable
        style={[styles.btn, { backgroundColor: "#111827" }]}
        onPress={load}
        disabled={loading}
      >
        <Text style={styles.btnText}>{loading ? "Actualizando..." : "Actualizar"}</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, { backgroundColor: "#374151", marginTop: 10 }]}
        onPress={onSignOut}
        disabled={loading}
      >
        <Text style={styles.btnText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingBottom: 24 },
  h1: { fontSize: 22, fontWeight: "800", marginBottom: 6 },
  small: { fontSize: 12, opacity: 0.8 },
  list: { marginTop: 14, flex: 1 },
  empty: { fontSize: 13, opacity: 0.8, marginTop: 10 },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: "white",
  },
  title: { fontSize: 16, fontWeight: "800" },
  btn: { backgroundColor: "#111827", padding: 14, borderRadius: 10, alignItems: "center" },
  btnText: { color: "white", fontWeight: "800" },
});
