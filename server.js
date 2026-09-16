const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { pool, initPostgres, testClientPostgres } = require("./db-postgres");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_IN_PRODUCTION";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const app = express();

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Gigan-Instance"],
  credentials: false
}));

app.use(express.json());

function now(){ return new Date().toISOString(); }
function id(prefix){ return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`; }
function auth(req,res,next){
  if (ADMIN_TOKEN && req.headers.authorization === `Bearer ${ADMIN_TOKEN}`) {
    req.user={role:"admin"}; return next();
  }
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer ")) return res.status(401).json({message:"Authentification requise"});
  try { req.user=jwt.verify(h.slice(7),JWT_SECRET); next(); }
  catch(e){ return res.status(401).json({message:"Jeton invalide"}); }
}
function clientScope(req){
  if(req.user.role==="admin") return req.query.clientId || req.body?.clientId || null;
  return req.user.clientId;
}
async function event(type,objType,objId,clientId,payload){
  try{
    await pool.query(
      `INSERT INTO api_events
      (
        event_type,
        object_type,
        object_id,
        client_id,
        payload,
        created_at
      )
      VALUES
      ($1,$2,$3,$4,$5,$6)`,
      [
        type,
        objType,
        objId,
        clientId || "",
        JSON.stringify(payload || {}),
        now()
      ]
    );
  }catch(error){
    console.error("Erreur PostgreSQL event :",error);
  }
}

function requireClient(req,res){
  const cid=clientScope(req);

  if(!cid){
    res.status(400).json({
      message:"clientId requis"
    });
    return null;
  }

  return cid;
}
app.get("/api/v1/health",(req,res)=>res.json({status:"ok",service:"Gigan Maintenance AI API",version:"8.0.0",time:now()}));

app.get("/api/v1/admin/db-check",auth,async (req,res)=>{
  if(req.user.role!=="admin"){
    return res.status(403).json({
      message:"Admin requis"
    });
  }

  try{

    // Test direct de la connexion PostgreSQL
    const dbResult=await pool.query(
      `SELECT current_database() AS database,
              current_user AS user,
              NOW() AS server_time`
    );

    // Nombre total de machines
    const countResult=await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM machines`
    );

    // Recherche de notre machine de test
    const testResult=await pool.query(
      `SELECT
         id,
         name,
         model,
         client_id,
         created_at,
         updated_at
       FROM machines
       WHERE name='TEST POSTGRESQL'
       ORDER BY created_at DESC
       LIMIT 1`
    );

    res.json({
      database:"postgresql",
      connected:true,

      database_info:{
        database:dbResult.rows[0].database,
        user:dbResult.rows[0].user,
        server_time:dbResult.rows[0].server_time
      },

      machines_count:countResult.rows[0].count,

      test_machine:testResult.rows[0]||null
    });

  }catch(error){

    console.error(
      "Erreur PostgreSQL DB CHECK :",
      error
    );

    res.status(500).json({
      database:"postgresql",
      connected:false,
      message:"Connexion PostgreSQL ou lecture de la base impossible",
      error:error.message
    });
  }
});

app.post("/api/v1/auth/login", async (req,res)=>{
  const {clientId, accessCode}=req.body||{};

  if(!clientId || !accessCode){
    return res.status(400).json({
      message:"clientId et accessCode requis"
    });
  }

  try{

    const result=await pool.query(
      `SELECT *
       FROM clients
       WHERE id=$1`,
      [clientId]
    );

    const c=result.rows[0];

    // Initialisation volontairement simple :
    // remplacer par un vrai système d'utilisateurs/Hash en production.
    if(
      !c ||
      accessCode !== (process.env.CLIENT_ACCESS_CODE || "GMEM-DEMO")
    ){
      return res.status(401).json({
        message:"Identifiants invalides"
      });
    }

    const token=jwt.sign(
      {
        role:"client",
        clientId:c.id,
        company:c.company
      },
      JWT_SECRET,
      {expiresIn:"12h"}
    );

    res.json({
      token,
      client:{
        id:c.id,
        company:c.company
      }
    });

  }catch(error){

    console.error("Erreur PostgreSQL login :",error);

    res.status(500).json({
      message:"Erreur serveur",
      error:error.message
    });
  }
});

app.get("/api/v1/clients",auth,async (req,res)=>{
  try{

    if(req.user.role!=="admin"){

      const result=await pool.query(
        `SELECT id,company,contact,phone,email,address
         FROM clients
         WHERE id=$1`,
        [req.user.clientId]
      );

      return res.json(result.rows);
    }

    const result=await pool.query(
      `SELECT
         id,
         company,
         contact,
         phone,
         email,
         address,
         created_at,
         updated_at
       FROM clients
       ORDER BY company`
    );

    res.json(result.rows);

  }catch(error){

    console.error("Erreur PostgreSQL GET clients :",error);

    res.status(500).json({
      message:"Erreur récupération clients",
      error:error.message
    });
  }
});

app.post("/api/v1/clients",auth,async (req,res)=>{
  if(req.user.role!=="admin"){
    return res.status(403).json({
      message:"Admin requis"
    });
  }

  const b=req.body||{};
  const cid=b.id||id("GMEM-CLI");
  const t=now();

  try{

    await pool.query(
      `INSERT INTO clients
      (
        id,
        company,
        siret,
        contact,
        phone,
        email,
        address,
        created_at,
        updated_at
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9
      )`,
      [
        cid,
        b.company||"Client",
        b.siret||"",
        b.contact||"",
        b.phone||"",
        b.email||"",
        b.address||"",
        t,
        t
      ]
    );

    await event("create","client",cid,cid,b);

    const result=await pool.query(
      `SELECT *
       FROM clients
       WHERE id=$1`,
      [cid]
    );

    res.status(201).json(result.rows[0]);

  }catch(error){

    console.error("Erreur PostgreSQL POST clients :",error);

    res.status(500).json({
      message:"Erreur serveur",
      error:error.message
    });
  }
});

app.get("/api/v1/sites",auth,async (req,res)=>{
  const cid=requireClient(req,res);
  if(!cid)return;

  try{

    const result=await pool.query(
      `SELECT *
       FROM sites
       WHERE client_id=$1
       ORDER BY name`,
      [cid]
    );

    res.json(result.rows);

  }catch(error){

    console.error("Erreur PostgreSQL GET sites :",error);

    res.status(500).json({
      message:"Erreur récupération sites",
      error:error.message
    });
  }
});

app.get("/api/v1/machines",auth,async (req,res)=>{
  const cid=requireClient(req,res);
  if(!cid)return;

  try{

    const result=await pool.query(
      `SELECT *
       FROM machines
       WHERE client_id=$1
       ORDER BY name`,
      [cid]
    );

    res.json({
      items:result.rows
    });

  }catch(error){

    console.error("Erreur PostgreSQL GET machines :",error);

    res.status(500).json({
      message:"Erreur récupération machines",
      error:error.message
    });
  }
});

app.post("/api/v1/machines",auth,async (req,res)=>{
  const cid=requireClient(req,res);
  if(!cid)return;

  const b=req.body||{};
  const mid=b.id||id("GMEM-MAC");
  const t=now();

  try{

    await pool.query(
      `INSERT INTO machines
      (
        id,
        client_id,
        site_id,
        name,
        type,
        brand,
        model,
        serial_number,
        year,
        location,
        criticality,
        technologies,
        maintenance,
        documentation,
        notes,
        status,
        created_at,
        updated_at
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      )`,
      [
        mid,
        cid,
        b.site_id||b.siteId||null,
        b.name||"Machine",
        b.type||"",
        b.brand||"",
        b.model||"",
        b.serial_number||b.serialNumber||"",
        b.year||"",
        b.location||"",
        b.criticality||"Normale",
        b.technologies||"",
        b.maintenance||"",
        b.documentation||"",
        b.notes||"",
        b.status||"Active",
        t,
        t
      ]
    );

    await event("create","machine",mid,cid,b);

    const result=await pool.query(
      `SELECT *
       FROM machines
       WHERE id=$1`,
      [mid]
    );

    res.status(201).json(result.rows[0]);

  }catch(error){

    console.error("Erreur PostgreSQL POST machines :",error);

    res.status(500).json({
      message:"Erreur serveur",
      error:error.message
    });
  }
});

app.get("/api/v1/machines/:id",auth,async (req,res)=>{
  try{

    const result=await pool.query(
      `SELECT *
       FROM machines
       WHERE id=$1`,
      [req.params.id]
    );

    const m=result.rows[0];

    if(
      !m ||
      (
        req.user.role!=="admin" &&
        m.client_id!==req.user.clientId
      )
    ){
      return res.status(404).json({
        message:"Machine introuvable"
      });
    }

    res.json(m);

  }catch(error){

    console.error("Erreur PostgreSQL GET machine :",error);

    res.status(500).json({
      message:"Erreur récupération machine",
      error:error.message
    });
  }
});

app.patch("/api/v1/machines/:id",auth,async (req,res)=>{
  try{

    /*
     * Recherche de la machine par son identifiant permanent.
     */
    const result=await pool.query(
      `SELECT *
       FROM machines
       WHERE id=$1`,
      [req.params.id]
    );

    const m=result.rows[0];

    /*
     * Vérification de sécurité :
     * un client ne peut modifier que ses propres machines.
     */
    if(
      !m ||
      (
        req.user.role!=="admin" &&
        m.client_id!==req.user.clientId
      )
    ){
      return res.status(404).json({
        message:"Machine introuvable"
      });
    }

    const b=req.body||{};
    const t=now();

    /*
     * Mise à jour de la machine.
     * L'identifiant permanent ne change jamais.
     */
    await pool.query(
      `UPDATE machines
       SET
         site_id=COALESCE($1,site_id),
         name=COALESCE($2,name),
         type=COALESCE($3,type),
         brand=COALESCE($4,brand),
         model=COALESCE($5,model),
         serial_number=COALESCE($6,serial_number),
         year=COALESCE($7,year),
         location=COALESCE($8,location),
         criticality=COALESCE($9,criticality),
         technologies=COALESCE($10,technologies),
         maintenance=COALESCE($11,maintenance),
         documentation=COALESCE($12,documentation),
         notes=COALESCE($13,notes),
         status=COALESCE($14,status),
         updated_at=$15
       WHERE id=$16`,
      [
        b.site_id!==undefined ? b.site_id : b.siteId,
        b.name,
        b.type,
        b.brand,
        b.model,
        b.serial_number!==undefined ? b.serial_number : b.serialNumber,
        b.year,
        b.location,
        b.criticality,
        b.technologies,
        b.maintenance,
        b.documentation!==undefined ? b.documentation : b.documents,
        b.notes,
        b.status,
        t,
        m.id
      ]
    );

    /*
     * Journalisation de la modification.
     */
    await event(
      "update",
      "machine",
      m.id,
      m.client_id,
      b
    );

    /*
     * Retourne la machine réellement enregistrée
     * dans PostgreSQL.
     */
    const updated=await pool.query(
      `SELECT *
       FROM machines
       WHERE id=$1`,
      [m.id]
    );

    console.log(
      "✏️ MACHINE POSTGRESQL MODIFIÉE",
      m.id
    );

    res.json(updated.rows[0]);

  }catch(error){

    console.error(
      "Erreur PostgreSQL PATCH machine :",
      error
    );

    res.status(500).json({
      message:"Erreur modification machine",
      error:error.message
    });
  }
});

app.post("/api/v1/demands",auth,async (req,res)=>{
  const cid=requireClient(req,res);
  if(!cid)return;

  const b=req.body||{};
  const did=b.id||id("GMEM-DEM");
  const t=now();

  try{
    const existing=await pool.query(
      `SELECT id
       FROM demands
       WHERE id=$1`,
      [did]
    );

    if(existing.rows.length){
      await pool.query(
        `UPDATE demands
         SET updated_at=$1,
             status=$2,
             priority=$3,
             symptom=$4,
             contact=$5,
             machine_id=$6,
             machine_name=$7
         WHERE id=$8`,
        [
          t,
          b.status||"Nouvelle",
          b.priority||"Normale",
          b.symptom||"",
          b.contact||"",
          b.machineId||b.machine_id||null,
          b.machineName||b.machine_name||"",
          did
        ]
      );

    }else{

      await pool.query(
        `INSERT INTO demands
        (
          id,
          client_id,
          machine_id,
          machine_name,
          priority,
          contact,
          symptom,
          status,
          ai_status,
          technician_note,
          created_at,
          updated_at,
          synced_at
        )
        VALUES
        (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
        )`,
        [
          did,
          cid,
          b.machineId||b.machine_id||null,
          b.machineName||b.machine_name||"",
          b.priority||"Normale",
          b.contact||"",
          b.symptom||"",
          b.status||"Nouvelle",
          "A analyser",
          "",
          b.createdAt||t,
          t,
          t
        ]
      );
    }

    console.log("DEMANDE POSTGRESQL OK",did,cid);

    const result=await pool.query(
      `SELECT *
       FROM demands
       WHERE id=$1`,
      [did]
    );

    res.status(existing.rows.length?200:201).json(result.rows[0]);

  }catch(error){

    console.error("Erreur PostgreSQL POST demands :",error);

    res.status(500).json({
      message:"Erreur serveur",
      error:error.message
    });
  }
});

app.get("/api/v1/demands",auth,async (req,res)=>{
  const cid=requireClient(req,res); 
  if(!cid)return;

  const since=req.query.since||"1970-01-01T00:00:00.000Z";

  try{
    const result=await pool.query(
      `SELECT *
       FROM demands
       WHERE client_id=$1
       AND updated_at>$2
       ORDER BY updated_at DESC`,
      [cid,since]
    );

    res.json({items:result.rows});

  }catch(error){
    console.error("Erreur PostgreSQL GET demands :",error);
    res.status(500).json({message:"Erreur récupération demandes"});
  }
});

app.patch("/api/v1/demands/:id",auth,async (req,res)=>{
  try{

    const result=await pool.query(
      `SELECT *
       FROM demands
       WHERE id=$1`,
      [req.params.id]
    );

    const d=result.rows[0];

    if(
      !d ||
      (
        req.user.role!=="admin" &&
        d.client_id!==req.user.clientId
      )
    ){
      return res.status(404).json({
        message:"Demande introuvable"
      });
    }

    const b=req.body||{};
    const t=now();

    await pool.query(
      `UPDATE demands
       SET
         status=COALESCE($1,status),
         ai_status=COALESCE($2,ai_status),
         technician_note=COALESCE($3,technician_note),
         priority=COALESCE($4,priority),
         updated_at=$5
       WHERE id=$6`,
      [
        b.status||null,
        b.ai_status||null,
        b.technician_note||null,
        b.priority||null,
        t,
        d.id
      ]
    );

    await event(
      "update",
      "demand",
      d.id,
      d.client_id,
      b
    );

    const updated=await pool.query(
      `SELECT *
       FROM demands
       WHERE id=$1`,
      [d.id]
    );

    res.json(updated.rows[0]);

  }catch(error){

    console.error("Erreur PostgreSQL PATCH demand :",error);

    res.status(500).json({
      message:"Erreur serveur",
      error:error.message
    });
  }
});

app.post("/api/v1/interventions",auth,async (req,res)=>{
  const cid=requireClient(req,res);
  if(!cid)return;

  const b=req.body||{};
  const iid=b.id||id("GMEM-INT");
  const t=now();

  try{

    await pool.query(
      `INSERT INTO interventions
      (
        id,
        client_id,
        site_id,
        machine_id,
        technician,
        date,
        duration_minutes,
        symptom,
        diagnosis,
        measurements,
        cause,
        actions,
        parts,
        result,
        recommendations,
        created_at,
        updated_at
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17
      )`,
      [
        iid,
        cid,
        b.site_id||b.siteId||null,
        b.machine_id||b.machineId||null,
        b.technician||"",
        b.date||t,
        Number(b.duration_minutes||b.durationMinutes||0),
        b.symptom||"",
        b.diagnosis||"",
        b.measurements||"",
        b.cause||"",
        b.actions||"",
        b.parts||"",
        b.result||"",
        b.recommendations||"",
        t,
        t
      ]
    );

    await event("create","intervention",iid,cid,b);

    const result=await pool.query(
      `SELECT *
       FROM interventions
       WHERE id=$1`,
      [iid]
    );

    res.status(201).json(result.rows[0]);

  }catch(error){

    console.error("Erreur PostgreSQL POST interventions :",error);

    res.status(500).json({
      message:"Erreur serveur",
      error:error.message
    });
  }
});

app.get("/api/v1/interventions",auth,async (req,res)=>{
  const cid=requireClient(req,res);
  if(!cid)return;

  try{

    const result=await pool.query(
      `SELECT *
       FROM interventions
       WHERE client_id=$1
       ORDER BY date DESC`,
      [cid]
    );

    res.json({
      items:result.rows
    });

  }catch(error){

    console.error("Erreur PostgreSQL GET interventions :",error);

    res.status(500).json({
      message:"Erreur récupération interventions",
      error:error.message
    });
  }
});

app.post("/api/v1/knowledge",auth,async (req,res)=>{
  const cid=requireClient(req,res);
  if(!cid)return;

  const b=req.body||{};
  const kid=b.id||id("GMEM-KNW");
  const t=now();

  try{

    await pool.query(
      `INSERT INTO knowledge
      (
        id,
        client_id,
        machine_id,
        intervention_id,
        technology,
        symptom,
        cause,
        measurements,
        diagnosis,
        solution,
        part,
        confidence,
        source,
        created_at,
        updated_at
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
      )`,
      [
        kid,
        cid,
        b.machine_id||b.machineId||null,
        b.intervention_id||b.interventionId||null,
        b.technology||"",
        b.symptom||"",
        b.cause||"",
        b.measurements||"",
        b.diagnosis||"",
        b.solution||"",
        b.part||"",
        b.confidence||"A confirmer",
        b.source||"",
        t,
        t
      ]
    );

    await event("create","knowledge",kid,cid,b);

    const result=await pool.query(
      `SELECT *
       FROM knowledge
       WHERE id=$1`,
      [kid]
    );

    res.status(201).json(result.rows[0]);

  }catch(error){

    console.error("Erreur PostgreSQL POST knowledge :",error);

    res.status(500).json({
      message:"Erreur serveur",
      error:error.message
    });
  }
});

app.get("/api/v1/documents",auth,async (req,res)=>{
  const cid=requireClient(req,res);
  if(!cid)return;

  try{

    const result=await pool.query(
      `SELECT *
       FROM documents
       WHERE client_id=$1
       ORDER BY created_at DESC`,
      [cid]
    );

    res.json({
      items:result.rows
    });

  }catch(error){

    console.error("Erreur PostgreSQL GET documents :",error);

    res.status(500).json({
      message:"Erreur récupération documents",
      error:error.message
    });
  }
});

app.get("/api/v1/events",auth,async (req,res)=>{
  if(req.user.role!=="admin"){
    return res.status(403).json({
      message:"Admin requis"
    });
  }

  try{

    const result=await pool.query(
      `SELECT *
       FROM api_events
       ORDER BY id DESC
       LIMIT 500`
    );

    res.json(result.rows);

  }catch(error){

    console.error("Erreur PostgreSQL GET events :",error);

    res.status(500).json({
      message:"Erreur récupération événements",
      error:error.message
    });
  }
});

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(500).json({message:"Erreur serveur"});
});

initPostgres()
  .then(() => {
    console.log("Initialisation PostgreSQL réussie");
    return testClientPostgres();
  })
  .then(() => console.log("Test client PostgreSQL réussi"))
  .catch(err => console.error("Test PostgreSQL échoué :", err.message));

app.listen(PORT,()=>console.log(`Gigan Maintenance AI V8 API listening on port ${PORT}`));
