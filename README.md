# Gigan Maintenance AI V8 — API + Base de données

## Ce que fournit cette V8
- API REST `/api/v1`
- Base SQLite avec mode WAL
- Clients / sites / machines
- Demandes clients
- Interventions
- Base de connaissances
- Journal des événements API
- Authentification JWT pour les clients
- Token administrateur pour les opérations Gigan
- CORS pour le portail web
- Docker pour déploiement cloud

## Démarrage local
1. Installer Node.js 22 LTS.
2. Dans ce dossier :
   `npm install`
3. Copier `.env.example` vers `.env` et changer les secrets.
4. Initialiser la base :
   `node -e "require('better-sqlite3')"` (test optionnel)
   puis `node seed.js`
5. Lancer :
   `node server.js`

API :
`http://localhost:3000/api/v1/health`

## Test
Le client démo est `GMEM-CLI-00001`.
Le code démo par défaut est `GMEM-DEMO` si CLIENT_ACCESS_CODE n'est pas changé.

## Routes principales
GET  /api/v1/health
POST /api/v1/auth/login
GET  /api/v1/clients
POST /api/v1/clients
GET  /api/v1/sites
GET  /api/v1/machines
POST /api/v1/machines
GET  /api/v1/machines/:id
POST /api/v1/demands
GET  /api/v1/demands?since=...
PATCH /api/v1/demands/:id
POST /api/v1/interventions
GET  /api/v1/interventions
POST /api/v1/knowledge
GET  /api/v1/knowledge
GET  /api/v1/events (admin)

## Déploiement
La base SQLite peut convenir au prototype / petite GMAO. Pour une montée en charge importante,
prévoir PostgreSQL et un stockage objet pour les photos/documents.

Le domaine n'est pas obligatoire : une URL HTTPS fournie par l'hébergeur suffit pour les premiers tests.
Pour Google Play/TWA, le Client V8 doit pointer vers l'URL HTTPS du portail et l'API doit être accessible
en HTTPS.

## Sécurité
- Ne jamais mettre ADMIN_TOKEN dans l'application Client.
- Utiliser un JWT_SECRET aléatoire et long.
- Utiliser HTTPS en production.
- Remplacer le code client de démonstration par un vrai système d'utilisateurs.
- Les photos/documents nécessitent encore un stockage de fichiers sécurisé (S3/R2/etc.) avant production.
