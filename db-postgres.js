const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

async function testPostgres() {
  const result = await pool.query("SELECT NOW() AS now");
  console.log("PostgreSQL OK :", result.rows[0].now);
}

module.exports = {
  pool,
  testPostgres
};
