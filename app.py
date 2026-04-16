import json, os
from flask import Flask, render_template, request, jsonify, send_from_directory

app = Flask(__name__)
DATA_FILE = os.path.join(os.path.dirname(__file__), 'mappings.json')

def load_mappings():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            data = json.load(f)
            if 'antennas' in data:
                return data['antennas']
            return data
    return {}

def save_mappings(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

@app.route('/')
def index():
    return render_template('index.html')
@app.route('/floorplan')

def floorplan():
    return send_from_directory(os.path.dirname(__file__), 'image.png')

@app.route('/api/mappings', methods=['GET'])
def get_mappings():
    return jsonify(load_mappings())

@app.route('/api/mappings', methods=['POST'])
def set_mappings():
    data = request.get_json()
    save_mappings(data)
    return jsonify({'status': 'ok', 'saved': len(data)})

@app.route('/api/export/json')
def export_json():
    from flask import Response
    mappings = load_mappings()
    out = {'arena': 'Arena', 'antennas': mappings}
    return Response(json.dumps(out, indent=2),
                    mimetype='application/json',
                    headers={'Content-Disposition': 'attachment; filename=arena_config.json'})

@app.route('/api/export/csv')
def export_csv():
    from flask import Response
    mappings = load_mappings()
    rows = ['antenna_id,p1_serial,p1_model,p1_chan,p1_port,p2_serial,p2_model,p2_chan,p2_port,freq_mhz,gain_db,notes']
    for ant_id, m in mappings.items():
        rows.append(
            f"{ant_id},"
            f"{m.get('p1_serial','')},"
            f"{m.get('p1_model','')},"
            f"{m.get('p1_chan','')},"
            f"{m.get('p1_port','')},"
            f"{m.get('p2_serial','')},"
            f"{m.get('p2_model','')},"
            f"{m.get('p2_chan','')},"
            f"{m.get('p2_port','')},"
            f"{m.get('freq_mhz','')},"
            f"{m.get('gain_db','')},"
            f"{m.get('notes','')}"
        )
    return Response('\n'.join(rows),
                    mimetype='text/csv',
                    headers={'Content-Disposition': 'attachment; filename=arena_config.csv'})

if __name__ == '__main__':
    print("Arena Antenna Mapper running at http://localhost:8080")
    app.run(host='0.0.0.0', port=8080, debug=True)
