# Arena — Patch Antenna Mapper

A local web app that runs at http://localhost:8080.
All data is stored in a PostgreSQL database (`arena`).

---

## One-time setup

### 1. Install PostgreSQL

```bash
brew install postgresql@17
brew services start postgresql@17
```

PostgreSQL starts automatically on login — no manual start needed after this.

### 2. Add PostgreSQL tools to your PATH

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 3. Create the database

```bash
createdb arena
```

### 4. Install Python dependencies

```bash
pip3 install -r requirements.txt
```

### 5. (Optional) Configure via `.env`

Copy the example file and edit it:

```bash
cp .env.example .env
```

By default the app connects to `postgresql://localhost/arena`.
Set `DATABASE_URL` in `.env` to override (e.g. remote server).

---

## Run

```bash
python3 app.py
```

| URL | Description |
|---|---|
| http://localhost:8080 | Antenna mapper UI |
| http://localhost:8080/db | Read-only database viewer |
| http://localhost:8080/api/health | Health / connectivity check |

---

## Project structure

```
arena-app/
├── app.py              Entry point — Flask app factory, starts server
├── config.py           Configuration (reads DATABASE_URL from env / .env)
├── models.py           SQLAlchemy models + database helper functions
├── routes/
│   ├── api.py          REST API blueprint  (/api/*)
│   └── views.py        HTML page routes    (/, /floorplan, /db)
├── templates/
│   ├── index.html      Main SPA — HTML structure only
│   └── db.html         Database viewer page
├── static/
│   ├── css/main.css    All styles (design tokens, layout, components)
│   ├── js/app.js       Antenna grid, floor plan, USRP rack, form logic
│   ├── js/phone.js     Draggable phone marker
│   └── img/
│       └── floorplan.svg   Floor plan image
├── .env.example        Environment variable template
├── requirements.txt    Python dependencies
└── README.md
```

---

## Working with the database

Open a session:

```bash
psql arena
```

Useful commands inside psql:

| Command | What it does |
|---|---|
| `\dt` | List tables |
| `SELECT * FROM antenna_mappings;` | View all mappings |
| `SELECT * FROM phone_positions;` | View phone position |
| `\q` | Quit |

Backup / restore:

```bash
pg_dump arena > arena_backup.sql   # backup
psql arena < arena_backup.sql      # restore
```

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mappings` | Return all antenna mappings |
| POST | `/api/mappings` | Replace all antenna mappings |
| GET | `/api/phones` | Return phone marker position |
| POST | `/api/phones` | Update phone marker position |
| GET | `/api/export/json` | Download config as JSON |
| GET | `/api/export/csv` | Download config as CSV |
| GET | `/api/health` | DB connectivity check |

---

## Database schema

**`antenna_mappings`** — one row per configured antenna

| Column | Type | Notes |
|---|---|---|
| `antenna_id` | text PK | e.g. `AR2_A1` |
| `p1_serial` | text | USRP IP, Port 1 |
| `p1_model` | text | X410, X310, … |
| `p1_port` | text | A:0, B:1, … |
| `p2_serial` | text | USRP IP, Port 2 |
| `p2_model` | text | |
| `p2_port` | text | |

**`phone_positions`** — single row for the draggable phone marker

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | always 1 |
| `left` | float | % of floor plan width |
| `top` | float | % of floor plan height |
