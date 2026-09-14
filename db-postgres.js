const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

async function initPostgres() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      siret TEXT DEFAULT '',
      contact TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT DEFAULT '',
      contact TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      hours TEXT DEFAULT '',
      safety_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      site_id TEXT,
      name TEXT NOT NULL,
      type TEXT DEFAULT '',
      brand TEXT DEFAULT '',
      model TEXT DEFAULT '',
      serial_number TEXT DEFAULT '',
      year TEXT DEFAULT '',
      location TEXT DEFAULT '',
      criticality TEXT DEFAULT 'Normale',
      technologies TEXT DEFAULT '',
      maintenance TEXT DEFAULT '',
      documentation TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'Active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS demands (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      machine_id TEXT,
      machine_name TEXT DEFAULT '',
      priority TEXT DEFAULT 'Normale',
      contact TEXT DEFAULT '',
      symptom TEXT DEFAULT '',
      status TEXT DEFAULT 'Nouvelle',
      ai_status TEXT DEFAULT 'A analyser',
      technician_note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS interventions (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      site_id TEXT,
      machine_id TEXT,
      technician TEXT DEFAULT '',
      date TEXT DEFAULT '',
      duration_minutes INTEGER DEFAULT 0,
      symptom TEXT DEFAULT '',
      diagnosis TEXT DEFAULT '',
      measurements TEXT DEFAULT '',
      cause TEXT DEFAULT '',
      actions TEXT DEFAULT '',
      parts TEXT DEFAULT '',
      result TEXT DEFAULT '',
      recommendations TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      machine_id TEXT,
      intervention_id TEXT,
      technology TEXT DEFAULT '',
      symptom TEXT DEFAULT '',
      cause TEXT DEFAULT '',
      measurements TEXT DEFAULT '',
      diagnosis TEXT DEFAULT '',
      solution TEXT DEFAULT '',
      part TEXT DEFAULT '',
      confidence TEXT DEFAULT 'A confirmer',
      source TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      machine_id TEXT,
      demand_id TEXT,
      intervention_id TEXT,
      filename TEXT NOT NULL,
      mime_type TEXT DEFAULT '',
      storage_ref TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_events (
      id SERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      object_type TEXT DEFAULT '',
      object_id TEXT DEFAULT '',
      client_id TEXT DEFAULT '',
      payload TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_machines_client
      ON machines(client_id);

    CREATE INDEX IF NOT EXISTS idx_demands_client
      ON demands(client_id);

    CREATE INDEX IF NOT EXISTS idx_demands_updated
      ON demands(updated_at);

    CREATE INDEX IF NOT EXISTS idx_interventions_machine
      ON interventions(machine_id);

    CREATE INDEX IF NOT EXISTS idx_knowledge_machine
      ON knowledge(machine_id);
  `);

  console.log("Tables PostgreSQL créées ou déjà présentes");
}

module.exports = {
  pool,
  initPostgres
};
