import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../../src/lib/supabase";


type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "ADMIN" | "OPERADOR" | "OPERARIO" | string;
};

type EventRow = {
  id: string;
  name: string;
  location: string | null;
  event_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  created_at: string;
};

export default function AdminScreen() {
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  // Form (vacío)
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  // ✅ Por ahora texto (WEB): luego se cambia a picker en móvil
  const [eventDate, setEventDate] = useState(""); // YYYY-MM-DD
  const [startTime, setStartTime] = useState(""); // HH:MM
  const [endTime, setEndTime] = useState(""); // HH:MM (opcional)

  // Operadores
  const [operators, setOperators] = useState<Profile[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>("");

  // Eventos creados
  const [myEvents, setMyEvents] = useState<EventRow[]>([]);

  const isAdmin = useMemo(() => me?.role === "ADMIN", [me]);

  const loadMeAndOperators = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) {
      router.replace("/login");
      return;
    }

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id,email,full_name,role")
      .eq("id", uid)
      .maybeSingle();

    if (pErr) {
      Alert.alert("Error", pErr.message);
      return;
    }

    setMe((profile as Profile) ?? null);

    // ✅ Cargar operadores con tolerancia (OPERADOR/OPERARIO + may/min)
    const { data: ops, error: oErr } = await supabase
      .from("profiles")
      .select("id,email,full_name,role")
      .in("role", ["OPERADOR", "OPERARIO", "operador", "operario", "Operador", "Operario"])
      .order("created_at", { ascending: true });

    if (oErr) {
      Alert.alert("Error cargando operadores", oErr.message);
      return;
    }

    setOperators((ops ?? []) as Profile[]);
  };

  const loadMyEvents = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) return;

    const { data, error } = await supabase
      .from("events")
      .select("id,name,location,event_date,start_time,end_time,created_at")
      .eq("created_by", uid)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      Alert.alert("Error cargando eventos", error.message);
      return;
    }

    setMyEvents((data ?? []) as EventRow[]);
  };

  useEffect(() => {
    loadMeAndOperators().then(loadMyEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCreateEvent = async () => {
    if (!isAdmin) {
      Alert.alert("Sin permisos", "Solo ADMIN puede crear eventos.");
      return;
    }

    const n = name.trim();
    if (!n) return Alert.alert("Faltan datos", "Nombre del evento");

    // ✅ Para que puedas crear YA:
    // - fecha/hora opcionales por ahora (web)
    // Si quieres exigirlos luego, se vuelve a poner la validación.
    const d = eventDate.trim();
    const st = startTime.trim();
    const et = endTime.trim();

    // Si el usuario escribe algo, validamos formato
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return Alert.alert("Fecha inválida", "Usa formato YYYY-MM-DD (ej: 2026-01-23)");
    }
    if (st && !/^\d{2}:\d{2}$/.test(st)) {
      return Alert.alert("Hora inicio inválida", "Usa HH:MM (ej: 08:00)");
    }
    if (et && !/^\d{2}:\d{2}$/.test(et)) {
      return Alert.alert("Hora fin inválida", "Usa HH:MM (ej: 12:00)");
    }

    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) throw new Error("Sin sesión.");

      // 1) Crear evento
      const { data: created, error: cErr } = await supabase
        .from("events")
        .insert({
          name: n,
          location: location.trim() || null,
          event_date: d || null, // 👈 si tu columna NO acepta null, cambia por "" y ajustamos BD
          start_time: st ? `${st}:00` : null,
          end_time: et ? `${et}:00` : null,
          created_by: uid,
        })
        .select("id,name")
        .single();

      if (cErr) throw cErr;

      // 2) Asignar operador SOLO si seleccionaste uno
      if (selectedOperatorId) {
        const { error: aErr } = await supabase.from("event_staff").insert({
          event_id: created.id,
          user_id: selectedOperatorId,
        });

        if (aErr) throw aErr;
      }

      Alert.alert(
        "Listo",
        selectedOperatorId ? "Evento creado y asignado." : "Evento creado (sin operador asignado)."
      );

      await loadMyEvents();

      // Limpiar
      setName("");
      setLocation("");
      setEventDate("");
      setStartTime("");
      setEndTime("");
      setSelectedOperatorId("");
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Panel Admin</Text>
      <Text style={styles.small}>
        Usuario: {me?.email ?? "-"} | Rol: {me?.role ?? "-"}
      </Text>

      {!isAdmin ? (
        <View style={styles.card}>
          <Text style={styles.warn}>No eres ADMIN. Esta pantalla es solo para admin.</Text>
          <Pressable style={styles.btn} onPress={onSignOut}>
            <Text style={styles.btnText}>Cerrar sesión</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.h2}>Crear evento</Text>

            <Text style={styles.label}>Nombre del evento</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Ej: Reunión de voluntarios"
            />

            <Text style={styles.label}>Lugar</Text>
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder="Ej: Sede PorVos"
            />

            {/* ✅ WEB temporal: texto */}
            <Text style={styles.label}>Fecha (por ahora escrita)</Text>
            <TextInput
              style={styles.input}
              value={eventDate}
              onChangeText={setEventDate}
              placeholder="YYYY-MM-DD (ej: 2026-01-23)"
              autoCapitalize="none"
            />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Hora de inicio (por ahora escrita)</Text>
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="HH:MM (ej: 08:00)"
                  autoCapitalize="none"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Hora de fin (opcional)</Text>
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="HH:MM (ej: 12:00)"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 6 }]}>Asignar a operador (opcional)</Text>

            {/* ✅ Debug para que veas si realmente están llegando */}
            <Text style={styles.small}>Operadores encontrados: {operators.length}</Text>

            <View style={styles.pills}>
              {operators.length === 0 ? (
                <Text style={styles.small}>No hay OPERADORES/OPERARIOS en profiles (según query).</Text>
              ) : (
                <>
                  <Pressable
                    onPress={() => setSelectedOperatorId("")}
                    style={[styles.pill, !selectedOperatorId && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, !selectedOperatorId && styles.pillTextActive]}>
                      Sin operador
                    </Text>
                  </Pressable>

                  {operators.map((op) => {
                    const active = op.id === selectedOperatorId;
                    return (
                      <Pressable
                        key={op.id}
                        onPress={() => setSelectedOperatorId(op.id)}
                        style={[styles.pill, active && styles.pillActive]}
                      >
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>
                          {(op.full_name || op.email || "Operario").toString()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              )}
            </View>

            <Pressable style={[styles.btn, loading && { opacity: 0.7 }]} onPress={onCreateEvent} disabled={loading}>
              <Text style={styles.btnText}>{loading ? "Creando..." : "Crear y asignar"}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.h2}>Mis eventos creados (admin)</Text>
            {myEvents.length === 0 ? (
              <Text style={styles.small}>Aún no has creado eventos.</Text>
            ) : (
              myEvents.map((ev) => (
                <View key={ev.id} style={styles.eventRow}>
                  <Text style={styles.eventTitle}>{ev.name}</Text>
                  <Text style={styles.small}>
                    {ev.event_date ? ev.event_date : "(sin fecha)"}{" "}
                    {ev.start_time ? `| ${ev.start_time.slice(0, 5)}` : ""}{" "}
                    {ev.end_time ? `- ${ev.end_time.slice(0, 5)}` : ""}{" "}
                    {ev.location ? `| ${ev.location}` : ""}
                  </Text>
                </View>
              ))
            )}
          </View>

          <Pressable style={[styles.btn, { backgroundColor: "#374151" }]} onPress={onSignOut}>
            <Text style={styles.btnText}>Cerrar sesión</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 28 },
  h1: { fontSize: 22, fontWeight: "800", marginBottom: 6 },
  h2: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
  small: { fontSize: 12, opacity: 0.8 },
  warn: { fontSize: 14, fontWeight: "700", marginBottom: 12, color: "#b45309" },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14, marginTop: 14, backgroundColor: "white" },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 10, padding: 12, marginBottom: 10 },
  row: { flexDirection: "row", gap: 10 },
  inputHalf: { flex: 1 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10, marginTop: 8 },
  pill: { borderWidth: 1, borderColor: "#d1d5db", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999 },
  pillActive: { backgroundColor: "#111827", borderColor: "#111827" },
  pillText: { fontSize: 12 },
  pillTextActive: { color: "white", fontWeight: "700" },
  btn: { backgroundColor: "#111827", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 6 },
  btnText: { color: "white", fontWeight: "800" },
  eventRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  eventTitle: { fontSize: 14, fontWeight: "800" },
});
