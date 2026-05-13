import postgres from "postgres";
import { loadEnv } from "../lib/env.js";

const env = loadEnv();

/**
 * Singleton Postgres client shared across all pipeline modules.
 * 10 connections max; stays within pgvector/Supabase defaults.
 *
 * @author Al Amin Ahamed
 */
export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
});
