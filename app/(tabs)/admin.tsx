import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";

type Event = {
  id: string;
  name: string;
  location: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
};

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
};

export default function AdminScreen() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  
  // Modal crear/editar
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [eventName, setEventName] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  
  // Modal personal
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [assignedUsers, setAssignedUsers] = useState<string[]>([]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: false });

      if (error) throw error;
      setEvents((data ?? []) as Event[]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Error cargando eventos");
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setSelectedEvent(null);
    setEventName("");
    setEventLocation("");
    setEventDate("");
    setStartTime("");
    setEndTime("");
    setModalOpen(true);
  };

  const openEditModal = (event: Event) => {
    setSelectedEvent(event);
    setEventName(event.name);
    setEventLocation(event.location || "");
    setEventDate(event.event_date || "");
    setStartTime(event.start_time || "");
    setEndTime(event.end_time || "");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedEvent(null);
  };

  const saveEvent = async () => {
    if (!eventName.trim()) {
      Alert.alert("Error", "El nombre es obligatorio");
      return;
    }

    try {
      const payload = {
        name: eventName.trim(),
        location: eventLocation.trim() || null,
        event_date: eventDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
      };

      if (selectedEvent) {
        // Editar
        const { error } = await supabase
          .from("events")
          .update(payload)
          .eq("id", selectedEvent.id);
        if (error) throw error;
      } else {
        // Crear
        const { error } = await supabase.from("events").insert(payload);
        if (error) throw error;
      }

      Alert.alert("Éxito", selectedEvent ? "Evento actualizado" : "Evento creado");
      closeModal();
      loadEvents();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo guardar");
    }
  };

  const openStaffModal = async (event: Event) => {
    setSelectedEvent(event);
    setStaffModalOpen(true);

    try {
      const { data: users, error: usersError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("email");

      if (usersError) throw usersError;
      setAllUsers((users ?? []) as Profile[]);

      const { data: staff, error: staffError } = await supabase
        .from("event_staff")
        .select("user_id")
        .eq("event_id", event.id);

      if (staffError) throw staffError;
      setAssignedUsers((staff ?? []).map((s: any) => s.user_id));
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Error cargando personal");
    }
  };

  const closeStaffModal = () => {
    setStaffModalOpen(false);
    setSelectedEvent(null);
  };

  const toggleUser = async (userId: string) => {
    if (!selectedEvent) return;
    const isAssigned = assignedUsers.includes(userId);

    try {
      if (isAssigned) {
        const { error } = await supabase
          .from("event_staff")
          .delete()
          .eq("event_id", selectedEvent.id)
          .eq("user_id", userId);
        if (error) throw error;
        setAssignedUsers((prev) => prev.filter((id) => id !== userId));
      } else {
        const { error } = await supabase
          .from("event_staff")
          .insert({ event_id: selectedEvent.id, user_id: userId });
        if (error) throw error;
        setAssignedUsers((prev) => [...prev, userId]);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Error");
    }
  };

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  useEffect(() => {
    loadEvents();
  }, []);

  return (
    <View style={s.container}>
      <Text style={s.h1}>Administración</Text>

      <View style={s.topButtons}>
        <Pressable style={[s.btn, s.btnCreate]} onPress={openCreateModal}>
          <Text style={s.btnText}>+ Crear evento</Text>
        </Pressable>

        <Pressable
          style={[s.btn, s.btnRefresh, loading && { opacity: 0.6 }]}
          onPress={loadEvents}
          disabled={loading}
        >
          <Text style={s.btnText}>Actualizar</Text>
        </Pressable>
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        style={s.list}
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.title}>{item.name}</Text>
            <Text style={s.subtitle}>
              {item.event_date || "Sin fecha"} | {item.location || "Sin ubicación"}
            </Text>

            <View style={s.row}>
              <Pressable style={[s.btnSm, s.btnEdit]} onPress={() => openEditModal(item)}>
                <Text style={s.btnSmText}>Editar</Text>
              </Pressable>

              <Pressable style={[s.btnSm, s.btnStaff]} onPress={() => openStaffModal(item)}>
                <Text style={s.btnSmText}>Personal</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={s.empty}>{loading ? "Cargando..." : "Sin eventos"}</Text>
        }
      />

      <Pressable style={[s.btn, s.btnDanger]} onPress={onSignOut}>
        <Text style={s.btnText}>Cerrar sesión</Text>
      </Pressable>

      {/* Modal crear/editar */}
      <Modal visible={modalOpen} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.modal}>
            <ScrollView>
              <Text style={s.h2}>{selectedEvent ? "Editar" : "Crear"} evento</Text>

              <Text style={s.label}>Nombre *</Text>
              <TextInput
                style={s.input}
                value={eventName}
                onChangeText={setEventName}
                placeholder="Nombre del evento"
              />

              <Text style={s.label}>Ubicación</Text>
              <TextInput
                style={s.input}
                value={eventLocation}
                onChangeText={setEventLocation}
                placeholder="Lugar"
              />

              <Text style={s.label}>Fecha (YYYY-MM-DD)</Text>
              <TextInput
                style={s.input}
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="2026-02-05"
              />

              <Text style={s.label}>Hora inicio (HH:MM)</Text>
              <TextInput
                style={s.input}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="14:00"
              />

              <Text style={s.label}>Hora fin (HH:MM)</Text>
              <TextInput
                style={s.input}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="18:00"
              />

              <View style={s.row}>
                <Pressable style={[s.btnSm, s.btnCancel]} onPress={closeModal}>
                  <Text style={s.btnSmText}>Cancelar</Text>
                </Pressable>
                <Pressable style={[s.btnSm, s.btnSave]} onPress={saveEvent}>
                  <Text style={s.btnSmText}>Guardar</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal personal */}
      <Modal visible={staffModalOpen} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.h2}>Personal - {selectedEvent?.name}</Text>

            <FlatList
              data={allUsers}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => {
                const assigned = assignedUsers.includes(item.id);
                return (
                  <Pressable
                    style={[s.userItem, assigned && s.userAssigned]}
                    onPress={() => toggleUser(item.id)}
                  >
                    <Text style={s.userName}>
                      {item.full_name || item.email || item.id}
                    </Text>
                    <Text style={s.userCheck}>{assigned ? "✓" : "○"}</Text>
                  </Pressable>
                );
              }}
            />

            <Pressable style={[s.btn, s.btnClose, { marginTop: 12 }]} onPress={closeStaffModal}>
              <Text style={s.btnText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  h1: { fontSize: 20, fontWeight: "800", marginBottom: 10 },
  h2: { fontSize: 16, fontWeight: "800", marginBottom: 12 },
  
  topButtons: { flexDirection: "row", gap: 8, marginBottom: 10 },
  
  list: { flex: 1 },
  empty: { fontSize: 13, opacity: 0.7, textAlign: "center", marginTop: 16 },
  
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "white",
  },
  title: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  subtitle: { fontSize: 11, opacity: 0.7, marginBottom: 8 },
  
  row: { flexDirection: "row", gap: 6 },
  
  btn: { padding: 10, borderRadius: 6, alignItems: "center" },
  btnCreate: { flex: 1, backgroundColor: "#16a34a" },
  btnRefresh: { flex: 1, backgroundColor: "#374151" },
  btnDanger: { backgroundColor: "#dc2626", marginTop: 8 },
  btnClose: { backgroundColor: "#374151" },
  btnText: { color: "white", fontWeight: "700", fontSize: 13 },
  
  btnSm: { flex: 1, padding: 8, borderRadius: 6, alignItems: "center" },
  btnEdit: { backgroundColor: "#2563eb" },
  btnStaff: { backgroundColor: "#16a34a" },
  btnCancel: { backgroundColor: "#6b7280" },
  btnSave: { backgroundColor: "#16a34a" },
  btnSmText: { color: "white", fontWeight: "700", fontSize: 12 },
  
  label: { fontSize: 11, fontWeight: "600", marginTop: 8, marginBottom: 3 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    fontSize: 13,
  },
  
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 16,
  },
  modal: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    maxHeight: "85%",
  },
  
  userItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    marginBottom: 6,
  },
  userAssigned: { backgroundColor: "#dcfce7", borderColor: "#16a34a" },
  userName: { fontSize: 12, flex: 1 },
  userCheck: { fontSize: 14, fontWeight: "800" },
});