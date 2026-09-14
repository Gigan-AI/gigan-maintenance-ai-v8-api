const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { pool, initPostgres, testClientPostgres } = require("./db-postgres");
const Database = require("better-sqlite3");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const DB_FILE = process.env.DB_FILE || "./gigan_v8.db";
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

const db = new Database(DB_FILE);
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
        clientId||"",
        JSON.stringify(payload||{}),
        now()
      ]
    );

  }catch(error){
    console.error("Erreur PostgreSQL event :",error);
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

app.get("/api/v1/clients",auth,(req,res)=>{
  if(req.user.role!=="admin") return res.json(db.prepare("SELECT id,company,contact,phone,email,address FROM clients WHERE id=?").all(req.user.clientId));
  res.json(db.prepare("SELECT id,company,contact,phone,email,address,created_at,updated_at FROM clients ORDER BY company").all());
});

app.post("/api/v1/clients",auth,(req,res)=>{
  if(req.user.role!=="admin") return res.status(403).json({message:"Admin requis"});
  const b=req.body||{}, cid=b.id||id("GMEM-CLI"), t=now();
  db.prepare(`INSERT INTO clients(id,company,siret,contact,phone,email,address,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(cid,b.company||"Client",b.siret||"",b.contact||"",b.phone||"",b.email||"",b.address||"",t,t);
  event("create","client",cid,cid,b); res.status(201).json(db.prepare("SELECT * FROM clients WHERE id=?").get(cid));
});

app.get("/api/v1/sites",auth,(req,res)=>{
  const cid=requireClient(req,res); if(!cid)return;
  res.json(db.prepare("SELECT * FROM sites WHERE client_id=? ORDER BY name").all(cid));
});

app.get("/api/v1/machines",auth,(req,res)=>{
  const cid=requireClient(req,res); if(!cid)return;
  res.json({items:db.prepare("SELECT * FROM machines WHERE client_id=? ORDER BY name").all(cid)});
});

app.post("/api/v1/machines",auth,(req,res)=>{
  const cid=requireClient(req,res); if(!cid)return;
  const b=req.body||{}, mid=b.id||id("GMEM-MAC"), t=now();
  db.prepare(`INSERT INTO machines(id,client_id,site_id,name,type,brand,model,serial_number,year,location,criticality,technologies,maintenance,documentation,notes,status,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(mid,cid,b.site_id||null,b.name||"Machine",b.type||"",b.brand||"",b.model||"",b.serial_number||"",b.year||"",b.location||"",b.criticality||"Normale",b.technologies||"",b.maintenance||"",b.documentation||"",b.notes||"",b.status||"Active",t,t);
  event("create","machine",mid,cid,b); res.status(201).json(db.prepare("SELECT * FROM machines WHERE id=?").get(mid));
});

app.get("/api/v1/machines/:id",auth,(req,res)=>{
  const m=db.prepare("SELECT * FROM machines WHERE id=?").get(req.params.id);
  if(!m || (req.user.role!=="admin" && m.client_id!==req.user.clientId)) return res.status(404).json({message:"Machine introuvable"});
  res.json(m);
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

app.patch("/api/v1/demands/:id",auth,(req,res)=>{
  const d=db.prepare("SELECT * FROM demands WHERE id=?").get(req.params.id);
  if(!d || (req.user.role!=="admin" && d.client_id!==req.user.clientId)) return res.status(404).json({message:"Demande introuvable"});
  const b=req.body||{}, t=now();
  db.prepare(`UPDATE demands SET status=COALESCE(?,status),ai_status=COALESCE(?,ai_status),technician_note=COALESCE(?,technician_note),priority=COALESCE(?,priority),updated_at=? WHERE id=?`)
    .run(b.status||null,b.ai_status||null,b.technician_note||null,b.priority||null,t,d.id);
  event("update","demand",d.id,d.client_id,b);
  res.json(db.prepare("SELECT * FROM demands WHERE id=?").get(d.id));
});

app.post("/api/v1/interventions",auth,(req,res)=>{
  const cid=requireClient(req,res); if(!cid)return;
  const b=req.body||{}, iid=b.id||id("GMEM-INT"), t=now();
  db.prepare(`INSERT INTO interventions(id,client_id,site_id,machine_id,technician,date,duration_minutes,symptom,diagnosis,measurements,cause,actions,parts,result,recommendations,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(iid,cid,b.site_id||null,b.machine_id||b.machineId||null,b.technician||"",b.date||t,Number(b.duration_minutes||b.durationMinutes||0),b.symptom||"",b.diagnosis||"",b.measurements||"",b.cause||"",b.actions||"",b.parts||"",b.result||"",b.recommendations||"",t,t);
  event("create","intervention",iid,cid,b); res.status(201).json(db.prepare("SELECT * FROM interventions WHERE id=?").get(iid));
});

app.get("/api/v1/interventions",auth,(req,res)=>{
  const cid=requireClient(req,res); if(!cid)return;
  res.json({items:db.prepare("SELECT * FROM interventions WHERE client_id=? ORDER BY date DESC").all(cid)});
});

app.post("/api/v1/knowledge",auth,(req,res)=>{
  const cid=requireClient(req,res); if(!cid)return;
  const b=req.body||{}, kid=b.id||id("GMEM-KNW"), t=now();
  db.prepare(`INSERT INTO knowledge(id,client_id,machine_id,intervention_id,technology,symptom,cause,measurements,diagnosis,solution,part,confidence,source,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(kid,cid,b.machine_id||b.machineId||null,b.intervention_id||b.interventionId||null,b.technology||"",b.symptom||"",b.cause||"",b.measurements||"",b.diagnosis||"",b.solution||"",b.part||"",b.confidence||"A confirmer",b.source||"",t,t);
  event("create","knowledge",kid,cid,b); res.status(201).json(db.prepare("SELECT * FROM knowledge WHERE id=?").get(kid));
});

app.get("/api/v1/knowledge",auth,(req,res)=>{
  const cid=requireClient(req,res); if(!cid)return;
  res.json({items:db.prepare("SELECT * FROM knowledge WHERE client_id=? ORDER BY updated_at DESC").all(cid)});
});

app.get("/api/v1/events",auth,(req,res)=>{
  if(req.user.role!=="admin") return res.status(403).json({message:"Admin requis"});
  res.json(db.prepare("SELECT * FROM api_events ORDER BY id DESC LIMIT 500").all());
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
