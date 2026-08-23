"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Input, Label, Select } from "@/components/ui";

interface User {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "USER";
  isActive: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (data.success) setUsers(data.users);
  }, []);

  useEffect(() => {
    // Defer to a microtask so state updates never happen synchronously in the effect.
    void Promise.resolve().then(load);
  }, [load]);

  const createUser = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        name: form.get("name"),
        password: form.get("password"),
        role: form.get("role"),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.success) {
      setFeedback({ tone: "success", text: "User created." });
      setShowCreate(false);
      load();
    } else {
      setFeedback({ tone: "error", text: data.message || "Failed to create user." });
    }
  };

  const patchUser = async (id: string, body: Record<string, unknown>, okText: string) => {
    setFeedback(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      setFeedback({ tone: "success", text: okText });
      load();
    } else {
      setFeedback({ tone: "error", text: data.message || "Update failed." });
    }
  };

  const resetPassword = async (id: string) => {
    const password = window.prompt("New password (min 10 characters):");
    if (!password) return;
    await patchUser(id, { password }, "Password updated.");
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">Users</h1>
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancel" : "Create user"}
        </Button>
      </div>

      {feedback && (
        <div className="mb-4">
          <Alert tone={feedback.tone}>{feedback.text}</Alert>
        </div>
      )}

      {showCreate && (
        <Card className="mb-6">
          <form onSubmit={createUser} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="u-name">Name</Label>
              <Input id="u-name" name="name" required minLength={2} />
            </div>
            <div>
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" name="email" type="email" required />
            </div>
            <div>
              <Label htmlFor="u-password">Password</Label>
              <Input id="u-password" name="password" type="password" required minLength={10} />
            </div>
            <div>
              <Label htmlFor="u-role">Role</Label>
              <Select id="u-role" name="role" defaultValue="USER">
                <option value="USER">User</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create user"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3 text-gray-600">{user.email}</td>
                <td className="px-4 py-3">
                  <Badge tone={user.role === "SUPER_ADMIN" ? "indigo" : "gray"}>
                    {user.role === "SUPER_ADMIN" ? "Super Admin" : "User"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={user.isActive ? "green" : "red"}>
                    {user.isActive ? "Active" : "Disabled"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        patchUser(
                          user.id,
                          { isActive: !user.isActive },
                          user.isActive ? "User disabled." : "User enabled.",
                        )
                      }
                    >
                      {user.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="secondary" onClick={() => resetPassword(user.id)}>
                      Reset password
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
