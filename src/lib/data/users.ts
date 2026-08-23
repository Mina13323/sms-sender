import { query } from "@/lib/db";
import { Role } from "@/lib/auth";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function userToPublic(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export async function listUsers(): Promise<UserRow[]> {
  const { rows } = await query<UserRow>(`SELECT * FROM users ORDER BY created_at ASC`);
  return rows;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
}): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [input.email, input.name, input.passwordHash, input.role],
  );
  return rows[0];
}

export async function updateUser(
  id: string,
  input: { name?: string; role?: Role; isActive?: boolean; passwordHash?: string },
): Promise<UserRow | null> {
  const existing = await getUserById(id);
  if (!existing) return null;
  const { rows } = await query<UserRow>(
    `UPDATE users SET
       name = $2, role = $3, is_active = $4, password_hash = $5, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      id,
      input.name ?? existing.name,
      input.role ?? existing.role,
      input.isActive ?? existing.is_active,
      input.passwordHash ?? existing.password_hash,
    ],
  );
  return rows[0] ?? null;
}

export async function countActiveSuperAdmins(excludeId?: string): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM users
      WHERE role = 'SUPER_ADMIN' AND is_active = TRUE ${excludeId ? "AND id <> $1" : ""}`,
    excludeId ? [excludeId] : [],
  );
  return rows[0]?.n ?? 0;
}
