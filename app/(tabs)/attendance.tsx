import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";

type EventRow = {
  id: string;
  name: string;
  location: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
};

type AttendanceRow = {
  id: string;
  event_id: string;
  full_name: string | null;
  document: string | null;
  neighborhood: string | null;
  phone: string | null;
  invited_by: string | null;
  scanned_at: string | null;
  event?: {
    id: string;
    name: string;
    event_date: string | null;
    location: string | null;
  } | null;
};

type AttendanceInsert = {
  event_id: string;
  full_name: string;
  document: string;
  neighborhood: string;
  phone: string | null;
  invited_by: string | null;
  scanned_by: string;
  created_by: string;
};

const BARRIOS_VEREDAS: string[] = [
  "La Veta",
  "Zarzal La Luz",
  "Zarzal Curazao",
  "Ancon",
  "El Noral",
  "El Salado",
  "Sabaneta",
  "Quebrada Arriba",
  "Alvarado",
  "Montañita",
  "Peñolcito",
  "Cabuyal",
  "Granizal",
  "El Convento",
  "Fontidueño",
  "Cristo Rey",
  "Simon Bolivar",
  "Obrero",
  "Yarumito",
  "Las Vegas",
  "Tobon Quintero",
  "La Asunción",
  "La Azulita",
  "El Porvenir",
  "Villanueva",
  "El Recreo",
  "El Remanso",
  "Pedregal",
  "La Misericordia",
  "Machado",
  "San Juan",
  "Maria",
  "Tablazo-Canoas",
  "El Mojon",
  "C. Multiple",
  "Fatima",
  "Pedrera",
  "San Francisco",
  "Miraflores",
];

function fmtEventLine(ev: EventRow) {
  const date = ev.event_date ?? "";
  const st = ev.start_time ? `| ${String(ev.start_time).slice(0, 5)}` : "";
  const et = ev.end_time ? `- ${String(ev.end_time).slice(0, 5)}` : "";
  const loc = ev.location ? `| ${ev.location}` : "";
  return `${date} ${st} ${et} ${loc}`.replace(/\s+/g, " ").trim();
}

function endsAtDate(ev: EventRow): Date | null {
  if (!ev.event_date) return null;
  const time = ev.end_time || ev.start_time;
  if (!time) return null;

  const hhmmss = time.length >= 5 ? time : "00:00:00";
  const t = hhmmss.length === 5 ? `${hhmmss}:00` : hhmmss;

  const d = new Date(`${ev.event_date}T${t}`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isEventPast(ev: EventRow): boolean {
  const end = endsAtDate(ev);
  if (!end) return false;
  return end.getTime() < Date.now();
}

export default function AttendanceScreen() {
  const [loading, setLoading] = useState(false);
  const [assignedEvents, setAssignedEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");

  const selectedEvent = useMemo(() => {
    return assignedEvents.find((e) => e.id === selectedEventId) ?? null;
  }, [assignedEvents, selectedEventId]);

  const [attendees, setAttendees] = useState<AttendanceRow[]>([]);

  // ✅ ORDEN NUEVO: Nombre, Documento, Celular, Barrio, Quién invita
  const [fullName, setFullName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [invitedBy, setInvitedBy] = useState("");

  const [showBarrioList, setShowBarrioList] = useState(false);
  const [barrioQuery, setBarrioQuery] = useState("");
  const [showEventList, setShowEventList] = useState(false);

  const canSave = useMemo(() => {
    return (
      fullName.trim() &&
      document.trim() &&
      neighborhood.trim() &&
      !!selectedEventId
    );
  }, [fullName, document, neighborhood, selectedEventId]);

  const barriosFiltrados = useMemo(() => {
    const q = barrioQuery.trim().toLowerCase();
    if (!q) return BARRIOS_VEREDAS;
    return BARRIOS_VEREDAS.filter((b) => b.toLowerCase().includes(q));
  }, [barrioQuery]);

  const loadAssignedEvents = async () => {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) {
        Alert.alert("Sesión", "Sin sesión.");
        return;
      }

      const staffRes = await supabase
        .from("event_staff")
        .select("event_id")
        .eq("user_id", uid);

      if (staffRes.error) throw staffRes.error;

      const ids = Array.from(
        new Set(
          (staffRes.data ?? [])
            .map((r: any) => String(r.event_id))
            .filter(Boolean)
        )
      );

      if (ids.length === 0) {
        setAssignedEvents([]);
        setSelectedEventId("");
        setAttendees([]);
        return;
      }

      const evRes = await supabase
        .from("events")
        .select("id,name,location,event_date,start_time,end_time")
        .in("id", ids);

      if (evRes.error) throw evRes.error;

      let list = (evRes.data ?? []) as EventRow[];
      list = list.filter((ev) => !isEventPast(ev));

      list.sort((a, b) => {
        const ea = endsAtDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const eb = endsAtDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return ea - eb;
      });

      setAssignedEvents(list);

      setSelectedEventId((prev) => {
        if (prev && list.some((x) => x.id === prev)) return prev;
        return list[0]?.id ?? "";
      });

      if (list.length === 0) {
        setSelectedEventId("");
        setAttendees([]);
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Error cargando eventos asignados");
      setAssignedEvents([]);
      setSelectedEventId("");
      setAttendees([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAttendeesForSelectedEvent = async (eventId: string) => {
    if (!eventId) {
      setAttendees([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("attendance")
        .select(
          `
          id,
          event_id,
          full_name,
          document,
          neighborhood,
          phone,
          invited_by,
          scanned_at,
          event:events (
            id,
            name,
            event_date,
            location
          )
        `
        )
        .eq("event_id", eventId)
        .order("scanned_at", { ascending: false })
        .returns<AttendanceRow[]>();

      if (error) throw error;

      setAttendees(data ?? []);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudieron cargar asistentes");
      setAttendees([]);
    }
  };

  useEffect(() => {
    loadAssignedEvents();
  }, []);

  useEffect(() => {
    loadAttendeesForSelectedEvent(selectedEventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  const onSave = async () => {
    if (!selectedEventId) {
      Alert.alert("Sin evento", "Selecciona un evento.");
      return;
    }
    if (!canSave) {
      Alert.alert(
        "Faltan datos",
        "Nombre, documento y barrio/vereda son obligatorios."
      );
      return;
    }

    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) throw new Error("Sin sesión.");

      const payload: AttendanceInsert = {
        event_id: selectedEventId,
        full_name: fullName.trim(),
        document: document.trim(),
        neighborhood: neighborhood.trim(),
        phone: phone.trim() || null,
        invited_by: invitedBy.trim() || null,
        scanned_by: uid,
        created_by: uid,
      };

      const res = await supabase.from("attendance").insert(payload);
      if (res.error) throw res.error;

      Alert.alert(
        "Listo",
        selectedEvent
          ? `Asistente registrado en: ${selectedEvent.name}`
          : "Asistente registrado."
      );

      setFullName("");
      setDocument("");
      setPhone("");
      setNeighborhood("");
      setInvitedBy("");
      setShowBarrioList(false);
      setBarrioQuery("");

      await loadAttendeesForSelectedEvent(selectedEventId);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudo guardar");
    } finally {
      setLoading(false);
    }
  };

  const onSignOut = async () => {
    await supabase.auth.signOut();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { router } = require("expo-router");
    router.replace("/login");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Asistencia</Text>

      {/* Evento asignado */}
      <View style={styles.card}>
        <Text style={styles.h2}>Evento asignado</Text>

        {assignedEvents.length === 0 ? (
          <Text style={styles.small}>
            No tienes eventos pendientes asignados (o ya terminaron).
          </Text>
        ) : (
          <>
            <Text style={styles.label}>Selecciona evento</Text>

            <Pressable
              style={[styles.input, { justifyContent: "center" }]}
              onPress={() => setShowEventList((v) => !v)}
            >
              <Text style={{ opacity: selectedEvent ? 1 : 0.5 }}>
                {selectedEvent ? selectedEvent.name : "Selecciona un evento"}
              </Text>
              {selectedEvent ? (
                <Text style={styles.small}>{fmtEventLine(selectedEvent)}</Text>
              ) : null}
            </Pressable>

            {showEventList && (
              <View style={styles.dropBox}>
                <ScrollView style={{ maxHeight: 220 }}>
                  {assignedEvents.map((ev) => {
                    const active = ev.id === selectedEventId;
                    return (
                      <Pressable
                        key={ev.id}
                        style={[
                          styles.dropItem,
                          active && { backgroundColor: "#f3f4f6" },
                        ]}
                        onPress={() => {
                          setSelectedEventId(ev.id);
                          setShowEventList(false);
                        }}
                      >
                        <Text style={{ fontWeight: "800" }}>{ev.name}</Text>
                        <Text style={styles.small}>{fmtEventLine(ev)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </>
        )}

        <Pressable
          style={[styles.btnGray, loading && { opacity: 0.7 }]}
          onPress={loadAssignedEvents}
          disabled={loading}
        >
          <Text style={styles.btnText}>
            {loading ? "Actualizando..." : "Actualizar eventos asignados"}
          </Text>
        </Pressable>
      </View>

      {/* ✅ ORDEN NUEVO: Nombre → Documento → Celular → Barrio → Quién invita */}
      <View style={styles.card}>
        <Text style={styles.h2}>Registrar asistente</Text>

        <Text style={styles.label}>Nombre</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Nombre completo"
        />

        <Text style={styles.label}>Documento</Text>
        <TextInput
          style={styles.input}
          value={document}
          onChangeText={setDocument}
          placeholder="Cédula / documento"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Celular</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="Número de celular"
          autoCapitalize="none"
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Barrio / Vereda</Text>
        <Pressable
          style={[styles.input, { justifyContent: "center" }]}
          onPress={() => setShowBarrioList((v) => !v)}
        >
          <Text style={{ opacity: neighborhood ? 1 : 0.5 }}>
            {neighborhood || "Selecciona un barrio / vereda"}
          </Text>
        </Pressable>

        {showBarrioList && (
          <View style={styles.dropBox}>
            <TextInput
              style={styles.dropSearch}
              value={barrioQuery}
              onChangeText={setBarrioQuery}
              placeholder="Buscar barrio/vereda…"
              autoCapitalize="none"
            />
            <ScrollView style={{ maxHeight: 240 }}>
              {barriosFiltrados.map((b) => (
                <Pressable
                  key={b}
                  style={styles.dropItem}
                  onPress={() => {
                    setNeighborhood(b);
                    setShowBarrioList(false);
                    setBarrioQuery("");
                  }}
                >
                  <Text>{b}</Text>
                </Pressable>
              ))}
              {barriosFiltrados.length === 0 && (
                <View style={styles.dropEmpty}>
                  <Text style={styles.small}>No hay coincidencias.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        <Text style={styles.label}>Quién lo invita</Text>
        <TextInput
          style={styles.input}
          value={invitedBy}
          onChangeText={setInvitedBy}
          placeholder="Opcional"
        />

        <Pressable
          style={[styles.btn, (!canSave || loading) && { opacity: 0.6 }]}
          onPress={onSave}
          disabled={!canSave || loading}
        >
          <Text style={styles.btnText}>
            {loading ? "Guardando..." : "Guardar asistente"}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.btnDanger,
            { marginTop: 10 },
            loading && { opacity: 0.7 },
          ]}
          onPress={onSignOut}
          disabled={loading}
        >
          <Text style={styles.btnText}>Cerrar sesión</Text>
        </Pressable>
      </View>

      {/* Lista de asistentes del evento */}
      <View style={styles.card}>
        <Text style={styles.h2}>Asistentes del evento</Text>

        {!selectedEventId ? (
          <Text style={styles.small}>
            Selecciona un evento para ver asistentes.
          </Text>
        ) : (
          <>
            <Text style={styles.small}>
              Evento:{" "}
              <Text style={{ fontWeight: "800" }}>
                {selectedEvent?.name ?? "-"}
              </Text>
            </Text>
            <Text style={styles.small}>Total: {attendees.length}</Text>

            {attendees.length === 0 ? (
              <Text style={styles.small}>(Aún no hay registros)</Text>
            ) : (
              attendees.map((a) => (
                <View key={a.id} style={styles.attRow}>
                  <Text style={styles.attTitle}>
                    {a.full_name ?? "(sin nombre)"}{" "}
                    {a.document ? `| ${a.document}` : ""}
                  </Text>
                  <Text style={styles.small}>
                    {a.phone ? `Cel: ${a.phone}` : ""}{" "}
                    {a.neighborhood ? `| ${a.neighborhood}` : ""}
                  </Text>
                  <Text style={styles.small}>
                    {a.invited_by ? `Invita: ${a.invited_by}` : ""}
                  </Text>
                </View>
              ))
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 28 },
  h1: { fontSize: 22, fontWeight: "800", marginBottom: 10 },
  h2: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
  small: { fontSize: 12, opacity: 0.8 },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    backgroundColor: "white",
  },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  btn: {
    backgroundColor: "#111827",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
  },
  btnGray: {
    backgroundColor: "#374151",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  btnDanger: {
    backgroundColor: "#7f1d1d",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "800" },

  dropBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    marginTop: -6,
    marginBottom: 10,
    backgroundColor: "white",
    overflow: "hidden",
  },
  dropSearch: {
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dropItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  dropEmpty: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },

  attRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  attTitle: { fontSize: 14, fontWeight: "800" },
});