import { randomUUID } from "crypto";
import { PoolClient } from "pg";
import { pool } from "../config/postgres";
export const newId = (prefix: string) => `${prefix}_${randomUUID()}`;
export function requireValue(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw Object.assign(new Error(message), { status });
}
export async function transaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export const appointmentTransitions: Record<string, string[]> = {
  Requested: ["Confirmed", "Rejected", "Cancelled"],
  Confirmed: ["Checked-in", "Cancelled"],
  Waiting: ["Checked-in", "In Consultation", "Cancelled"],
  "Checked-in": ["In Consultation", "Cancelled"],
  "In Consultation": ["Completed"],
  Completed: [],
  Rejected: [],
  Cancelled: [],
};
