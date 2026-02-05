import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
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
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  
  // Crear nuevo
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // Expandir evento
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [assignedUsers, setAssignedUsers] = useState<string[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Eventos
      const { data: evData, error: evError } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: false });
      if (evError) throw evError;
      setEvents((evData ?? []) as Event[]);

      // Usuarios
      const { data: usData, error: usError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("email");
      if (usError) throw usError;
      setAllUsers((usData ?? []) as Profile[]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Error cargando datos");
    } finally {
      setLoading(false);
    }
  };

  const createEvent = async () => {
    if (!newName.trim()) {
      Alert.alert("Error", "El nombre es obligatorio");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("events")
        .insert({
          name: newName.trim(),
          location: newLocation.trim() || null,
          event_date: newDate || null,
          start_time: newStart || null,
          end_time: newEnd || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Asignar usuarios
      if (selectedUsers.length > 0 && data) {
        const inserts = selectedUsers.map((uid) => ({
          event_id: data.id,
          user_id: uid,
        }));
        await supabase.from("event_staff").insert(inserts);
      }

      Alert.alert("Éxito", "Evento creado");
      setShowCreate(false);
      setNewName("");
      setNewLocation("");
      setNewDate("");
      setNewStart("");
      setNewEnd("");
      setSelectedUsers([]);
      loadData();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo crear");
    }
  };

  const expandEvent = async (event: Event) => {
    if (expandedId === event.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(event.id);
    setEditName(event.name);
    setEditLocation(event.location || "");
    setEditDate(event.event_date || "");
    setEditStart(event.start_time || "");
    setEditEnd(event.end_time || "");

    // Cargar asignados
    try {
      const { data, error } = await supabase
        .from("event_staff")
        .select("user_id")
        .eq("event_id", event.id);
      if (error) throw error;
      setAssignedUsers((data ?? []).map((s: any) => s.user_id));
    } catch (e: any) {
      setAssignedUsers([]);
    }
  };

  const updateEvent = async () => {
    if (!expandedId || !editName.trim()) {
      Alert.alert("Error", "El nombre es obligatorio");
      return;
    }

    try {
      const { error } = await supabase
        .from("events")
        .update({
          name: editName.trim(),
          location: editLocation.trim() || null,
          event_date: editDate || null,
          start_time: editStart || null,
          end_time: editEnd || null,
        })
        .eq("id", expandedId);

      if (error) throw error;
      Alert.alert("Éxito", "Evento actualizado");
      setExpandedId(null);
      loadData();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo actualizar");
    }
  };

  const toggleAssignment = async (userId: string) => {
    if (!expandedId) return;
    const isAssigned = assignedUsers.includes(userId);

    try {
      if (isAssigned) {
        await supabase
          .from("event_staff")
          .delete()
          .eq("event_id", expandedId)
          .eq("user_id", userId);
        setAssignedUsers((prev) => prev.filter((id) => id !== userId));
      } else {
        await supabase
          .from("event_staff")
          .insert({ event_id: expandedId, user_id: userId });
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
    loadData();
  }, []);

  const getUserLabel = (u: Profile) => u.full_name || u.email || u.id;

  return (
    <View style={s.container}>
      <Text style={s.h1}>Panel Admin</Text>
      <Text style={s.subtitle}>
        Usuario: admin@porvos.com | Rol: ADMIN
      </Text>

      {/* Crear evento */}
      {!showCreate ? (
        <Pressable style={s.btnCreate} onPress={() => setShowCreate(true)}>
          <Text style={s.btnText}>Crear evento</Text>
        </Pressable>
      ) : (
        <View style={s.createBox}>
          <Text style={s.boxTitle}>Crear evento</Text>

          <Text style={s.label}>Nombre del evento</Text>
          <TextInput
            style={s.input}
            value={newName}
            onChangeText={setNewName}
            placeholder="Nombre"
          />

          <Text style={s.label}>Lugar</Text>
          <TextInput
            style={s.input}
            value={newLocation}
            onChangeText={setNewLocation}
            placeholder="Ubicación"
          />

          <Text style={s.label}>Fecha</Text>
          <TextInput
            style={s.input}
            value={newDate}
            onChangeText={setNewDate}
            placeholder="YYYY-MM-DD"
          />

          <View style={s.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Hora de inicio</Text>
              <TextInput
                style={s.input}
                value={newStart}
                onChangeText={setNewStart}
                placeholder="HH:MM"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.label}>Hora de fin (opcional)</Text>
              <TextInput
                style={s.input}
                value={newEnd}
                onChangeText={setNewEnd}
                placeholder="HH:MM"
              />
            </View>
          </View>

          <Text style={s.label}>Asignar a operador (opcional)</Text>
          <Text style={s.subtitle}>
            Operadores encontrados: {allUsers.length} | Seleccionados: {selectedUsers.length}
          </Text>
          <ScrollView horizontal style={s.userScroll}>
            {allUsers.map((u) => {
              const selected = selectedUsers.includes(u.id);
              return (
                <Pressable
                  key={u.id}
                  style={[s.userChip, selected && s.userChipSelected]}
                  onPress={() =>
                    setSelectedUsers((prev) =>
                      prev.includes(u.id)
                        ? prev.filter((id) => id !== u.id)
                        : [...prev, u.id]
                    )
                  }
                >
                  <Text style={[s.userChipText, selected && s.userChipTextSelected]}>
                    {getUserLabel(u)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable style={s.btnSave} onPress={createEvent}>
            <Text style={s.btnText}>Crear y asignar</Text>
          </Pressable>

          <Pressable
            style={s.btnCancel}
            onPress={() => {
              setShowCreate(false);
              setNewName("");
              setNewLocation("");
              setNewDate("");
              setNewStart("");
              setNewEnd("");
              setSelectedUsers([]);
            }}
          >
            <Text style={s.btnText}>Cancelar</Text>
          </Pressable>
        </View>
      )}

      {/* Lista de eventos */}
      <ScrollView style={s.eventsList}>
        {loading ? (
          <Text style={s.empty}>Cargando...</Text>
        ) : events.length === 0 ? (
          <Text style={s.empty}>No hay eventos</Text>
        ) : (
          events.map((ev) => {
            const expanded = expandedId === ev.id;
            return (
              <View key={ev.id} style={s.eventCard}>
                <Pressable onPress={() => expandEvent(ev)}>
                  <Text style={s.eventName}>{ev.name}</Text>
                  <Text style={s.eventInfo}>
                    {ev.event_date || "Sin fecha"} | {ev.location || "Sin ubicación"}
                  </Text>
                </Pressable>

                {expanded && (
                  <View style={s.expandedContent}>
                    <Text style={s.label}>Nombre del evento</Text>
                    <TextInput
                      style={s.input}
                      value={editName}
                      onChangeText={setEditName}
                    />

                    <Text style={s.label}>Lugar</Text>
                    <TextInput
                      style={s.input}
                      value={editLocation}
                      onChangeText={setEditLocation}
                    />

                    <Text style={s.label}>Fecha</Text>
                    <TextInput
                      style={s.input}
                      value={editDate}
                      onChangeText={setEditDate}
                    />

                    <View style={s.timeRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>Hora inicio</Text>
                        <TextInput
                          style={s.input}
                          value={editStart}
                          onChangeText={setEditStart}
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={s.label}>Hora fin</Text>
                        <TextInput
                          style={s.input}
                          value={editEnd}
                          onChangeText={setEditEnd}
                        />
                      </View>
                    </View>

                    <Pressable style={s.btnUpdate} onPress={updateEvent}>
                      <Text style={s.btnText}>Actualizar evento</Text>
                    </Pressable>

                    <Text style={s.label}>Asignar operadores</Text>
                    <ScrollView horizontal style={s.userScroll}>
                      {allUsers.map((u) => {
                        const assigned = assignedUsers.includes(u.id);
                        return (
                          <Pressable
                            key={u.id}
                            style={[s.userChip, assigned && s.userChipSelected]}
                            onPress={() => toggleAssignment(u.id)}
                          >
                            <Text
                              style={[
                                s.userChipText,
                                assigned && s.userChipTextSelected,
                              ]}
                            >
                              {getUserLabel(u)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <Pressable style={s.btnRefresh} onPress={loadData}>
        <Text style={s.btnText}>Actualizar</Text>
      </Pressable>

      <Pressable style={s.btnLogout} onPress={onSignOut}>
        <Text style={s.btnText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f9fafb" },
  h1: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  subtitle: { fontSize: 12, opacity: 0.7, marginBottom: 12 },
  
  btnCreate: {
    backgroundColor: "#16a34a",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  btnText: { color: "white", fontWeight: "700", fontSize: 14 },
  
  createBox: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  boxTitle: { fontSize: 16, fontWeight: "800", marginBottom: 12 },
  
  label: { fontSize: 12, fontWeight: "600", marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
  },
  timeRow: { flexDirection: "row" },
  
  userScroll: { marginTop: 8, marginBottom: 12 },
  userChip: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
  },
  userChipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  userChipText: { fontSize: 12, color: "#374151" },
  userChipTextSelected: { color: "white" },
  
  btnSave: {
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  btnCancel: {
    backgroundColor: "#6b7280",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  
  eventsList: { flex: 1, marginBottom: 12 },
  empty: { fontSize: 14, opacity: 0.7, textAlign: "center", marginTop: 20 },
  
  eventCard: {
    backgroundColor: "white",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 8,
  },
  eventName: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  eventInfo: { fontSize: 12, opacity: 0.7 },
  
  expandedContent: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  btnUpdate: {
    backgroundColor: "#2563eb",
    padding: 10,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 12,
  },
  
  btnRefresh: {
    backgroundColor: "#374151",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  btnLogout: {
    backgroundColor: "#dc2626",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
});