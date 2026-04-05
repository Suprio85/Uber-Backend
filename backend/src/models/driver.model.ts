import pool from '../../db/pool';

export interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  license_plate: string;
  rating: number;
  created_at: Date;
}

export async function getDriverById(id: string): Promise<Driver | null> {
  const result = await pool.query('SELECT * FROM drivers WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function getRandomDriver(): Promise<Driver | null> {
  const result = await pool.query('SELECT * FROM drivers ORDER BY RANDOM() LIMIT 1');
  return result.rows[0] ?? null;
}

