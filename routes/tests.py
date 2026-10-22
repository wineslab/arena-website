"""
routes/tests.py — USRP test runner blueprint.

Endpoints (all under /api/test):

POST /usrp                   Start a new internal-loopback test for an IP.
                             Body: {"ip": "192.168.40.18", "opensearch": false}
                             Returns: {"job_id": <int>}

GET  /usrp/<job_id>          Status + result for a single job. While the job
                             is running, the `log` field contains the live tail.

GET  /usrp/history           Latest test per IP, as {ip: summary}.
GET  /usrp/history?ip=...    Up to 20 most recent runs for the given IP.

GET  /usrp/<job_id>/plot/<name>
                             Serve a plot PNG written by the test run.
                             Restricted to .png files inside the run's output_dir.

The runner spawns a daemon thread per request. Concurrent runs targeting the
same USRP IP are blocked (HTTP 409) — the radio is exclusive hardware.

`_run_test` shells out to the USRP_unittest scripts (see paths at the top of
that function), streaming their output into the live log and copying generated
plots into the run's output_dir.
"""
import json
import os
import signal
import subprocess
import threading
from datetime import datetime

from flask import Blueprint, abort, current_app, jsonify, request, send_from_directory

from models import TestResult, db, latest_test_per_ip
from routes.auth import role_required

tests_bp = Blueprint('tests', __name__, url_prefix='/api/test')


# ── In-memory state ──────────────────────────────────────────────────────────
# Live log tail per running job. Cleared once the job finishes and the final
# log is persisted to the DB.
_live_logs = {}              # job_id -> list[str]
_live_logs_lock = threading.Lock()

# One lock per USRP IP so we never run two tests against the same radio at once.
_ip_locks = {}               # ip -> threading.Lock
_ip_locks_lock = threading.Lock()

# Global lock: only one USRP test runs at a time across the whole app.
_global_test_lock = threading.Lock()

# Run-all queue: entries still waiting, plus the one being run right now.
# Tests run strictly one at a time. That is not just the lock below — the test
# scripts all share a single working directory (config.yaml carries the target
# IP, rcd_signal.dat and plotout_*.png are written in place), so two concurrent
# runs would overwrite each other's data.
_queue = []                  # [{'ip', 'job_id', 'output_dir'}] still to run
_queue_current = None        # the entry being run right now, or None
_queue_lock = threading.Lock()

# Fallback per-test estimate, used until there are finished runs to average.
SECONDS_PER_TEST = 40

# Running subprocesses + cancellation flags, so a job can be killed on request
# (Stop button) or when the browser navigates away (refresh/close).
_running_procs = {}          # job_id -> subprocess.Popen
_cancelled = set()           # job_ids the user asked to stop
_procs_lock = threading.Lock()


UHD_FIND_BIN = '/home/aswanth/miniconda3/envs/py_radio/bin/uhd_find_devices'


def _ping(ip, timeout_s=2):
    """Return True if `ip` answers a single ICMP echo within `timeout_s`."""
    try:
        r = subprocess.run(
            ['ping', '-c', '1', '-W', str(timeout_s), ip],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=timeout_s + 1,
        )
        return r.returncode == 0
    except Exception:
        return False


def _uhd_find(ip, timeout_s=12):
    """Probe for a USRP at `ip` with uhd_find_devices.

    Returns (found, output). uhd_find_devices exits 0 even when nothing is
    found (it prints 'No UHD Devices Found'), so success is detected by the
    device address appearing in the output.
    """
    try:
        r = subprocess.run(
            [UHD_FIND_BIN, '--args', f'addr={ip}'],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, timeout=timeout_s,
        )
        out = r.stdout or ''
        found = (f'addr: {ip}' in out) or (ip in out and 'No UHD Devices Found' not in out)
        return found, out
    except subprocess.TimeoutExpired as e:
        return False, (e.output or '') + f'\n[uhd_find_devices timed out after {timeout_s}s]'
    except Exception as e:
        return False, str(e)


def _detect_field(uhd_out, key):
    """Pull `key:` (e.g. 'product', 'serial') from uhd_find_devices output."""
    for line in (uhd_out or '').splitlines():
        s = line.strip()
        if s.lower().startswith(key + ':'):
            return s.split(':', 1)[1].strip()
    return ''


def _detect_model(uhd_out):
    """Pull the device model (e.g. 'X310', 'X410') from uhd_find_devices output."""
    return _detect_field(uhd_out, 'product')


def _as_float(text):
    """'-88.96 dB' -> -88.96, '200.01 KHz' -> 200.01, None if there's no number."""
    try:
        return float(text.split()[0])
    except (ValueError, IndexError):
        return None


def _parse_results(log_text):
    """Pull the per-channel measurements out of the results table the test
    prints, so they're stored with the run instead of living only in the log.

    Rows look like `| peak1      | -88.96 dB   |` (box-drawing characters), one
    set per channel: two for an X310, four for an X410. Returns peak/freq/noise
    keyed by channel number, e.g. {'peak1': -88.96, 'freq1': 200.01, …}.
    """
    labels = {'peak': 'peak', 'frequency': 'freq', 'noise': 'noise'}
    result = {}
    for line in (log_text or '').splitlines():
        cells = [c.strip() for c in line.split('\u2502') if c.strip()]
        if len(cells) != 2:
            continue
        name, value = cells
        for prefix, key in labels.items():
            channel = name[len(prefix):]
            if name.startswith(prefix) and channel.isdigit():
                result[key + channel] = _as_float(value)
    return result


def _append_log(job_id, text):
    """Append `text` to the job's live-log buffer, so the UI can tail a run in
    progress. A finished job has no buffer any more, which is fine to ignore."""
    with _live_logs_lock:
        buf = _live_logs.get(job_id)
        if buf is not None:
            buf.append(text)


def _get_ip_lock(ip):
    """Return this IP's lock, creating it on first use. Guards against two
    tests being pointed at the same radio, which is exclusive hardware."""
    with _ip_locks_lock:
        lock = _ip_locks.get(ip)
        if lock is None:
            lock = threading.Lock()
            _ip_locks[ip] = lock
        return lock


def _kill_proc_tree(proc):
    """Kill the whole process group of `proc`.

    The test launches a child of its own (execute.py -> loopback.py), so killing
    only the direct child would orphan the grandchild and leave the USRP busy.
    Popen sets start_new_session=True, so the group id is the child's pid and a
    single killpg takes the whole tree down.
    """
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        # Already exited, or we can't see its group — fall back to the child.
        try:
            proc.kill()
        except Exception:
            pass


def _avg_test_seconds():
    """Mean wall-clock duration of recent real runs, for the queue estimate.

    Skips cancelled runs, and runs shorter than 10s: those are pre-flight
    failures (no ping, no UHD) that would drag the average well below the time
    a real loopback run takes.
    """
    rows = (TestResult.query
            .filter(TestResult.finished_at.isnot(None))
            .filter(TestResult.status != 'cancelled')
            .order_by(TestResult.started_at.desc())
            .limit(10).all())
    spans = [(r.finished_at - r.started_at).total_seconds() for r in rows]
    spans = [s for s in spans if s > 10]
    if not spans:
        return float(SECONDS_PER_TEST)
    return sum(spans) / len(spans)


def _create_job(ip, status='running'):
    """Insert a TestResult row plus its output dir, return (job_id, output_dir).

    Call inside an app context. `status` is 'queued' for run-all jobs that are
    not started yet, so the rack cards can show them as waiting.
    """
    timestamp = datetime.utcnow().strftime('%Y%m%dT%H%M%S')
    output_dir = os.path.join(current_app.config['USRP_OUTPUT_PATH'],
                              f'{ip}_{timestamp}')
    os.makedirs(output_dir, exist_ok=True)
    row = TestResult(
        usrp_ip=ip,
        test_type='internal_loop',
        status=status,
        output_dir=output_dir,
    )
    db.session.add(row)
    db.session.commit()
    # Create the live-log buffer before any worker appends to it.
    with _live_logs_lock:
        _live_logs[row.id] = []
    return row.id, output_dir


# ── Worker thread ────────────────────────────────────────────────────────────

def _run_test(app, job_id, ip, output_dir, push_opensearch):
    """Run the USRP internal-loopback test for `ip`.

    Streams the test's stdout/stderr into the live log (so the UI can tail it
    while running), copies any plots the run generates into `output_dir` for the
    result view, then persists the final status/log to the DB.

    The test scripts assume their working directory IS the USRP_unittest/ folder (they
    read/write rcd_signal.dat and plotout_*.png relative to cwd), so we run them
    with cwd=USRP_REPO and copy the resulting plots out afterwards.

    Sets `status` to 'success' | 'failure' | 'error' and `error` to a
    human-readable message when status != 'success'.
    """
    import shutil
    import subprocess as sp

    # === Settings (change these to your paths) ===
    USRP_REPO   = '/home/aswanth/usrp-testing/vv-testing/USRP_unittest'
    CONFIG_PATH = os.path.join(USRP_REPO, 'config.yaml')
    SCRIPT_PATH = os.path.join(USRP_REPO, 'execute.py')
    PYTHON_BIN  = '/home/aswanth/miniconda3/envs/py_radio/bin/python3'
    TIMEOUT_S   = 90

    error = None
    log_text = ''
    status   = 'error'
    model    = ''       # filled in by the UHD probe below; needed in `finally`
    uhd_out  = ''

    def note(s):
        """Add a line to both the live log and the preamble kept for the DB."""
        _append_log(job_id, s)
        preamble.append(s)

    preamble = []

    try:
        # Pre-flight checks so we fail fast with a clear message instead of
        # letting the test hang for the full timeout.

        # 1) ICMP ping — is the radio on the network at all?
        note(f'▶ Pinging {ip} …\n')
        if not _ping(ip):
            status = 'failure'
            error = f'USRP unreachable at {ip} — no ping response'
            note('  ✗ no ICMP reply within 2s — check the radio is powered and cabled.\n')
            log_text = ''.join(preamble)
            return   # finally still runs: persists status + releases locks
        note('  ✓ ping ok\n')

        # 2) UHD discovery — is the radio actually answering UHD?
        note(f'▶ Checking UHD discovery (uhd_find_devices) …\n')
        found, uhd_out = _uhd_find(ip)
        if not found:
            status = 'failure'
            error = f'USRP not responding to UHD at {ip}'
            tail = '\n'.join((uhd_out or '').strip().splitlines()[-4:])
            note('  ✗ device not found via UHD — on the network but not answering UHD.\n')
            if tail:
                note(tail + '\n')
            log_text = ''.join(preamble)
            return
        # The model decides which internal loopback antenna the test uses
        # (X410: CAL_LOOPBACK, X310: CAL), so pass it through the config file.
        model = _detect_model(uhd_out)
        note(f'  ✓ UHD device found ({model or "unknown model"})\n')
        note('▶ Running loopback test …\n')

        import yaml
        with open(CONFIG_PATH) as f:
            cfg = yaml.safe_load(f)
        cfg['rf']['ip'] = ip
        cfg['rf']['model'] = model
        with open(CONFIG_PATH, 'w') as f:
            yaml.safe_dump(cfg, f)

        # Clear plots left by the previous run. They live in the shared working
        # directory, so a 4-channel X410 run would otherwise leave loopback-C/D
        # behind for the next 2-channel X310 job to copy up as its own.
        try:
            for fn in os.listdir(USRP_REPO):
                if fn.startswith('plotout_') and fn.lower().endswith('.png'):
                    os.remove(os.path.join(USRP_REPO, fn))
        except OSError as e:
            note(f'  [warn] could not clear old plots: {e}\n')

        # Line-buffered subprocess so output streams into the live log instead
        # of arriving all at once when the process exits. start_new_session puts
        # it (and its own children) in a fresh process group we can kill wholesale.
        #
        # Put the conda env's bin first on PATH so the test scripts' bare tool
        # calls (e.g. usrp_probe.py's `uhd_usrp_probe`) resolve to the working
        # conda UHD, not the broken system /usr/local/bin one (missing libboost).
        conda_bin = os.path.dirname(PYTHON_BIN)
        env = dict(os.environ, PYTHONUNBUFFERED='1',
                   PATH=conda_bin + os.pathsep + os.environ.get('PATH', ''))
        proc = sp.Popen(
            [PYTHON_BIN, SCRIPT_PATH],
            cwd=USRP_REPO,
            stdout=sp.PIPE,
            stderr=sp.STDOUT,
            text=True,
            bufsize=1,
            env=env,
            start_new_session=True,
        )
        with _procs_lock:
            _running_procs[job_id] = proc

        # Watchdog: hard-kill the run if it exceeds the timeout (covers a hang
        # that produces no output, where the read loop below would block).
        timed_out = {'v': False}

        def _kill_on_timeout():
            timed_out['v'] = True
            _kill_proc_tree(proc)

        timer = threading.Timer(TIMEOUT_S, _kill_on_timeout)
        timer.start()

        lines = list(preamble)
        try:
            for line in proc.stdout:
                lines.append(line)
                _append_log(job_id, line)
            proc.wait()
        finally:
            timer.cancel()

        log_text = ''.join(lines)
        with _procs_lock:
            was_cancelled = job_id in _cancelled
        if was_cancelled:
            status = 'cancelled'
            error = 'stopped by user'
        elif timed_out['v']:
            status = 'failure'
            error = f'timed out after {TIMEOUT_S}s'
        elif 'x410' in (model or '').lower() and proc.returncode == 0:
            # No agreed pass/fail limits for the X410 yet — report the measured
            # values and plots without calling it a pass or a fail.
            status = 'tbd'
            error = 'X410 — measurements only, no pass/fail'
        elif proc.returncode == 0:
            status = 'success'
        else:
            status = 'failure'
            error = f'exited with error {proc.returncode}'

        # Copy the plots produced by this run into the job's output_dir so the
        # UI can serve them via /api/test/usrp/<id>/plot/<name>.
        try:
            for fn in os.listdir(USRP_REPO):
                if fn.startswith('plotout_') and fn.lower().endswith('.png'):
                    shutil.copy2(os.path.join(USRP_REPO, fn),
                                 os.path.join(output_dir, fn))
        except OSError as e:
            log_text += f'\n[warn] could not copy plots: {e}'

    except Exception as e:
        error = str(e)
        log_text += f'\n[error] {e}'
    finally:
        with app.app_context():
            row = TestResult.query.get(job_id)
            if row is not None:
                row.status = status
                row.finished_at = datetime.utcnow()
                row.result_json = json.dumps(dict(
                    _parse_results(log_text),
                    USRP_device=model,
                    mb_serial_uhd=_detect_field(uhd_out, 'serial'),
                    fpga_version=_detect_field(uhd_out, 'fpga'),
                ))
                row.log = log_text
                row.error = error
                db.session.commit()
        # Drop the live-log buffer now that the final log is in the DB.
        with _live_logs_lock:
            _live_logs.pop(job_id, None)
        with _procs_lock:
            _running_procs.pop(job_id, None)
            _cancelled.discard(job_id)
        _get_ip_lock(ip).release()
        _global_test_lock.release()


def _run_queue(app, push_opensearch):
    """Run every queued job in turn, then exit.

    Serial on purpose — see the note on `_queue`. Each iteration takes the same
    two locks the single-test endpoint does, and `_run_test` releases them in
    its own `finally`, so a failing run cannot wedge the queue.
    """
    global _queue_current
    while True:
        with _queue_lock:
            if not _queue:
                _queue_current = None
                return
            entry = _queue.pop(0)
            _queue_current = entry

        _global_test_lock.acquire()
        _get_ip_lock(entry['ip']).acquire()
        try:
            # Flip 'queued' -> 'running' now, and stamp started_at at the real
            # start so queue waiting time doesn't inflate _avg_test_seconds().
            # Non-fatal: a failed flip only costs an estimate, not the run.
            with app.app_context():
                row = TestResult.query.get(entry['job_id'])
                if row is not None:
                    row.status = 'running'
                    row.started_at = datetime.utcnow()
                    db.session.commit()
        except Exception:
            pass

        # Releases both locks in its own `finally`, however it ends.
        _run_test(app, entry['job_id'], entry['ip'],
                  entry['output_dir'], push_opensearch)
        with _queue_lock:
            _queue_current = None


# ── HTTP endpoints ───────────────────────────────────────────────────────────

@tests_bp.route('/usrp', methods=['POST'])
@role_required('editor')
def start_test():
    data = request.get_json(silent=True) or {}
    ip = (data.get('ip') or '').strip()
    push_opensearch = bool(data.get('opensearch'))
    if not ip:
        return jsonify({'error': 'ip required'}), 400

    # One test at a time, app-wide.
    if not _global_test_lock.acquire(blocking=False):
        return jsonify({'error': 'a test is already running — wait for it to finish'}), 409

    if not _get_ip_lock(ip).acquire(blocking=False):
        _global_test_lock.release()
        return jsonify({'error': f'a test is already running for {ip}'}), 409

    try:
        job_id, output_dir = _create_job(ip)

        app = current_app._get_current_object()
        threading.Thread(
            target=_run_test,
            args=(app, job_id, ip, output_dir, push_opensearch),
            daemon=True,
            name=f'usrp-test-{ip}-{job_id}',
        ).start()
        return jsonify({'job_id': job_id})
    except Exception:
        # If anything failed before the thread took ownership, release the locks.
        _get_ip_lock(ip).release()
        _global_test_lock.release()
        raise


@tests_bp.route('/usrp/<int:job_id>/cancel', methods=['POST'])
@role_required('editor')
def cancel_test(job_id):
    """Stop a running test: kill its process tree. The worker thread then marks
    the job 'cancelled' and releases the locks. Idempotent / safe to call when
    the job has already finished. Also reachable via navigator.sendBeacon on
    page unload, so a refresh stops the run instead of leaving it hanging."""
    with _procs_lock:
        proc = _running_procs.get(job_id)
        if proc is not None:
            _cancelled.add(job_id)
    if proc is not None:
        _append_log(job_id, '\n[stopped by user]\n')
        _kill_proc_tree(proc)
    return jsonify({'cancelled': proc is not None})


@tests_bp.route('/usrp/run-all', methods=['POST'])
@role_required('editor')
def run_all():
    """Queue an internal-loopback test for every IP given, run one at a time.

    Body: {"ips": ["192.168.40.18", …], "opensearch": false}

    Replies with the queued jobs and a time estimate for the whole run, so the
    rack view can show a countdown. Every job row is created up front as
    'queued', which is what makes each card show its state straight away.
    """
    data = request.get_json(silent=True) or {}
    ips = [str(x).strip() for x in (data.get('ips') or []) if str(x).strip()]
    if not ips:
        return jsonify({'error': 'ips required'}), 400

    with _queue_lock:
        if _queue or _queue_current is not None:
            return jsonify({'error': 'a run-all is already in progress'}), 409

    # A single test started from a card would block the head of the queue.
    if _global_test_lock.locked():
        return jsonify({'error': 'a test is already running — wait for it to finish'}), 409

    per = _avg_test_seconds()
    entries, job_ids = [], {}
    for ip in ips:
        job_id, output_dir = _create_job(ip, status='queued')
        entries.append({'ip': ip, 'job_id': job_id, 'output_dir': output_dir})
        job_ids[ip] = job_id

    with _queue_lock:
        _queue.extend(entries)

    app = current_app._get_current_object()
    threading.Thread(
        target=_run_queue,
        args=(app, bool(data.get('opensearch'))),
        daemon=True,
        name='usrp-run-all',
    ).start()
    return jsonify({
        'queued':           ips,
        'job_ids':          job_ids,
        'seconds_per_test': round(per),
        'estimate_seconds': round(per * len(ips)),
    })


@tests_bp.route('/usrp/queue', methods=['GET'])
@role_required('viewer')
def queue_status():
    """Run-all progress, for the rack header's countdown. `seconds_per_test` is
    also useful when idle, to estimate a run before starting one."""
    with _queue_lock:
        pending = [e['ip'] for e in _queue]
        current = _queue_current['ip'] if _queue_current else None
    per = _avg_test_seconds()
    remaining = len(pending) + (1 if current else 0)
    return jsonify({
        'active':           remaining > 0,
        'current':          current,
        'pending':          pending,
        'remaining':        remaining,
        'seconds_per_test': round(per),
        'estimate_seconds': round(per * remaining),
    })


@tests_bp.route('/usrp/queue/cancel', methods=['POST'])
@role_required('editor')
def cancel_queue():
    """Drop everything still queued and stop the run in flight."""
    with _queue_lock:
        dropped = [e['job_id'] for e in _queue]
        _queue.clear()
        current = _queue_current

    # Mark the never-started jobs so their cards don't sit on 'queued'.
    for job_id in dropped:
        row = TestResult.query.get(job_id)
        if row is not None and row.status == 'queued':
            row.status = 'cancelled'
            row.error = 'run-all cancelled'
            row.finished_at = datetime.utcnow()
    db.session.commit()

    proc = None
    if current is not None:
        with _procs_lock:
            proc = _running_procs.get(current['job_id'])
            if proc is not None:
                _cancelled.add(current['job_id'])
        if proc is not None:
            _append_log(current['job_id'], '\n[run-all cancelled]\n')
            _kill_proc_tree(proc)
    return jsonify({'dropped': len(dropped), 'stopped_current': proc is not None})


@tests_bp.route('/usrp/<int:job_id>', methods=['GET'])
@role_required('viewer')
def get_status(job_id):
    row = TestResult.query.get(job_id)
    if row is None:
        return jsonify({'error': 'job not found'}), 404
    payload = row.to_full()
    if row.status == 'running':
        with _live_logs_lock:
            payload['log'] = ''.join(_live_logs.get(job_id, []))
    if payload.get('output_dir'):
        try:
            files = sorted(
                f for f in os.listdir(payload['output_dir'])
                if f.lower().endswith('.png')
            )
        except OSError:
            files = []
        payload['plots'] = files
    return jsonify(payload)


@tests_bp.route('/usrp/history', methods=['GET'])
@role_required('viewer')
def history():
    ip = request.args.get('ip')
    if ip:
        rows = (TestResult.query
                .filter_by(usrp_ip=ip)
                .order_by(TestResult.started_at.desc())
                .limit(20)
                .all())
        return jsonify([r.to_summary() for r in rows])
    return jsonify(latest_test_per_ip())


@tests_bp.route('/usrp/<int:job_id>/plot/<path:name>', methods=['GET'])
@role_required('viewer')
def plot(job_id, name):
    row = TestResult.query.get(job_id)
    if row is None or not row.output_dir:
        abort(404)
    if '..' in name or name.startswith('/') or not name.lower().endswith('.png'):
        abort(400)
    return send_from_directory(row.output_dir, name)
