\
const Database=require("better-sqlite3");
const db=new Database(process.env.DB_FILE||"./gigan_v8.db");
const now=()=>new Date().toISOString();
db.exec("PRAGMA foreign_keys=ON;");
const t=now();
const client={id:"GMEM-CLI-00001",company:"Client Démo GMEM",contact:"Contact Démo",phone:"",email:"",address:""};
db.prepare(`INSERT OR IGNORE INTO clients(id,company,siret,contact,phone,email,address,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`)
 .run(client.id,client.company,"",client.contact,client.phone,client.email,client.address,t,t);
db.prepare(`INSERT OR IGNORE INTO sites(id,client_id,name,address,contact,phone,hours,safety_notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
 .run("GMEM-SITE-00001",client.id,"Site Démo","Réunion","Contact Démo","","","",t,t);
db.prepare(`INSERT OR IGNORE INTO machines(id,client_id,site_id,name,type,brand,model,serial_number,year,location,criticality,technologies,maintenance,documentation,notes,status,created_at,updated_at)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
 .run("GMEM-MAC-00001",client.id,"GMEM-SITE-00001","Machine Démo","Électromécanique","GMEM","V8-DEMO","DEMO-001","2026","Atelier","Haute","Électrique / Mécanique","Contrôle préventif","Documentation à compléter","Machine de démonstration","Active",t,t);
console.log("Base V8 initialisée. Client démo: GMEM-CLI-00001");
