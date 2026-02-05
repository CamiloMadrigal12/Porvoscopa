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

type EventStaff = {
  event_id: string;
  user_id: string;
  profiles?: Profile;
};

export default function AdminScreen() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  
  // Modal editar evento
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [eventName, setEventName] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  
  // Modal gestionar staff
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

  const openEditModal = (event: Event) => {
    setSelectedEvent(event);
    setEventName(event.name);
    setEventLocation(event.location || "");
    setEventDate(event.event_date || "");
    setStartTime(event.start_time || "");
    setEndTime(event.end_time || "");
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setSelectedEvent(null);
    setEventName("");
    setEventLocation("");
    setEventDate("");
    setStartTime("");
    setEndTime("");
  };

  const saveEvent = async () => {
    if (!selectedEvent) return;
    if (!eventName.trim()) {
      Alert.alert("Error", "El nombre del evento es obligatorio");
      return;
    }

    try {
      const { error } = await supabase
        .from("events")
        .update({
          name: eventName.trim(),
          location: eventLocation.trim() || null,
          event_date: eventDate || null,
          start_time: startTime || null,
          end_time: endTime || null,
        })
        .eq("id", selectedEvent.id);

      if (error) throw error;

      Alert.alert("Éxito", "Evento actualizado correctamente");
      closeEditModal();
      loadEvents();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo actualizar el evento");
    }
  };

  const openStaffModal = async (event: Event) => {
    setSelectedEvent(event);
    setStaffModalOpen(true);

    try {
      // Cargar todos los usuarios
      const { data: users, error: usersError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("email");

      if (usersError) throw usersError;
      setAllUsers((users ?? []) as Profile[]);

      // Cargar staff asignado a este evento
      const { data: staff, error: staffError } = await supabase
        .from("event_staff")
        .select("user_id")
        .eq("event_id", event.id);

      if (staffError) throw staffError;
      
      const assigned = (staff ?? []).map((s: any) => s.user_id);
      setAssignedUsers(assigned);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Error cargando personal");
    }
  };

  const closeStaffModal = () => {
    setStaffModalOpen(false);
    setSelectedEvent(null);
    setAllUsers([]);
    setAssignedUsers([]);
  };

  const toggleUserAssignment = async (userId: string) => {
    if (!selectedEvent) return;

    const isAssigned = assignedUsers.includes(userId);

    try {
      if (isAssigned) {
        // Quitar
        const { error } = await supabase
          .from("event_staff")
          .delete()
          .eq("event_id", selectedEvent.id)
          .eq("user_id", userId);

        if (error) throw error;
        setAssignedUsers((prev) => prev.filter((id) => id !== userId));
      } else {
        // Agregar
        const { error } = await supabase
          .from("event_staff")
          .insert({ event_id: selectedEvent.id, user_id: userId });

        if (error) throw error;
        setAssignedUsers((prev) => [...prev, userId]);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo actualizar asignación");
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
    <View style={styles.container}>
      <Text style={styles.h1}>Administración</Text>

      <Pressable
        style={[styles.btn, loading && { opacity: 0.7 }]}
        onPress={loadEvents}
        disabled={loading}
      >
        <Text style={styles.btnText}>
          {loading ? "Cargando..." : "Actualizar"}
        </Text>
      </Pressable>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        style={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.small}>
              {item.event_date || "Sin fecha"} | {item.location || "Sin ubicación"}
            </Text>

            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.btnSmall, { backgroundColor: "#2563eb" }]}
                onPress={() => openEditModal(item)}
              >
                <Text style={styles.btnText}>Editar</Text>
              </Pressable>

              <Pressable
                style={[styles.btnSmall, { backgroundColor: "#16a34a" }]}
                onPress={() => openStaffModal(item)}
              >
                <Text style={styles.btnText}>Personal</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading ? "Cargando..." : "No hay eventos"}
          </Text>
        }
      />

      <Pressable style={[styles.btnDanger]} onPress={onSignOut}>
        <Text style={styles.btnText}>Cerrar sesión</Text>
      </Pressable>

      {/* MODAL: Editar evento */}
      <Modal visible={editModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.h2}>Editar evento</Text>

              <Text style={styles.label}>Nombre *</Text>
              <TextInput
                style={styles.input}
                value={eventName}
                onChangeText={setEventName}
                placeholder="Nombre del evento"
              />

              <Text style={styles.label}>Ubicación</Text>
              <TextInput
                style={styles.input}
                value={eventLocation}
                onChangeText={setEventLocation}
                placeholder="Lugar"
              />

              <Text style={styles.label}>Fecha (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="2026-02-05"
              />

              <Text style={styles.label}>Hora inicio (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="14:00"
              />

              <Text style={styles.label}>Hora fin (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="18:00"
              />

              <View style={styles.buttonRow}>
                <Pressable
                  style={[styles.btnSmall, { backgroundColor: "#6b7280" }]}
                  onPress={closeEditModal}
                >
                  <Text style={styles.btnText}>Cancelar</Text>
                </Pressable>

                <Pressable
                  style={[styles.btnSmall, { backgroundColor: "#16a34a" }]}
                  onPress={saveEvent}
                >
                  <Text style={styles.btnText}>Guardar</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL: Gestionar personal */}
      <Modal visible={staffModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.h2}>Personal asignado</Text>
            <Text style={styles.small}>
              Evento: {selectedEvent?.name || ""}
            </Text>

            <FlatList
              data={allUsers}
              keyExtractor={(item) => item.id}
              style={styles.userList}
              renderItem={({ item }) => {
                const isAssigned = assignedUsers.includes(item.id);
                return (
                  <Pressable
                    style={[
                      styles.userItem,
                      isAssigned && styles.userItemAssigned,
                    ]}
                    onPress={() => toggleUserAssignment(item.id)}
                  >
                    <Text style={styles.userName}>
                      {item.full_name || item.email || item.id}
                    </Text>
                    <Text style={styles.userStatus}>
                      {isAssigned ? "✓ Asignado" : "○ Sin asignar"}
                    </Text>
                  </Pressable>
                );
              }}
            />

            <Pressable
              style={[styles.btn, { marginTop: 10 }]}
              onPress={closeStaffModal}
            >
              <Text style={styles.btnText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  h1: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  h2: { fontSize: 18, fontWeight: "800", marginBottom: 12 },
  small: { fontSize: 12, opacity: 0.8, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 10, marginBottom: 4 },
  
  list: { flex: 1, marginTop: 12 },
  empty: { fontSize: 14, opacity: 0.8, textAlign: "center", marginTop: 20 },
  
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: "white",
  },
  title: { fontSize: 16, fontWeight: "800", marginBottom: 4 },
  
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  
  btn: {
    backgroundColor: "#111827",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnSmall: {
    flex: 1,
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  btnDanger: {
    backgroundColor: "#dc2626",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  btnText: { color: "white", fontWeight: "800", fontSize: 14 },
  
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    maxHeight: "80%",
  },
  
  userList: { marginTop: 12, maxHeight: 400 },
  userItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "white",
  },
  userItemAssigned: {
    backgroundColor: "#dcfce7",
    borderColor: "#16a34a",
  },
  userName: { fontSize: 14, fontWeight: "600", flex: 1 },
  userStatus: { fontSize: 12, opacity: 0.8 },
});