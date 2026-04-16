# Arena — Patch Antenna Mapper

A local web app that runs at http://localhost:8080

## Setup (one time)

```bash
cd arena_app
pip3 install -r requirements.txt
```

## Run

```bash
python3 app.py
```

Then open your browser to:

    http://localhost:8080

## Features
- Click any antenna cell to configure USRP serial, port, frequency, gain
- Mappings auto-save to mappings.json on disk — persists between sessions
- Export JSON or CSV from the header buttons (downloads the file)
- Runs fully locally, no internet needed after first load

## Files
- app.py           — Flask server
- templates/       — HTML UI
- mappings.json    — auto-created when you first save a mapping
