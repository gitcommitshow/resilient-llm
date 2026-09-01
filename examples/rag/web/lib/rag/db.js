import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;


export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

//  connection test
pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("PostgreSQL connection error:", err);
});