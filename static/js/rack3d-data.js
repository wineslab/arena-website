/* ═══════════════════════════════════════════════════════════════════════════
   rack3d-data.js — Lab equipment shown in the 3D rack / bench view.

   Read-only snapshot of the LibreBooking `resources` table (taken 2026-10-16).
   LibreBooking itself is never modified; edit this file to change what the
   3D view shows. Burlington-site gear, spectrum rooms, PLMN IDs and VMs are
   left out — only hardware physically in the Boston lab is listed.

   status: 'available' | 'unavailable' | 'hidden'  (LibreBooking status 1/2/0)
   ═══════════════════════════════════════════════════════════════════════════ */

/** USRP model per IP, for USRPs that have no antenna mapping yet. */
export const USRP_MODELS = {
  '192.168.40.18': 'X410', '192.168.40.20': 'X410', '192.168.40.24': 'X410',
  '192.168.40.26': 'X410', '192.168.40.28': 'X410', '192.168.40.30': 'X410',
  '192.168.40.34': 'X310', '192.168.40.38': 'X310', '192.168.40.50': 'X310',
  '192.168.40.54': 'X310', '192.168.40.58': 'X310', '192.168.40.62': 'X310',
};

/** LibreBooking status per USRP IP (only non-available ones listed). */
export const USRP_BOOKING_STATUS = {
  '192.168.40.50': 'unavailable',
};

/** Vendor / type tags. Devices on a bench are grouped (in this order) by tag,
 *  and each group gets a coloured tag floating above it. */
export const GROUPS = {
  foxconn:   { label: 'Foxconn',      color: '#4c8df6' },
  wnc:       { label: 'WNC',          color: '#12b5cb' },
  eridan:    { label: 'Eridan',       color: '#f97316' },
  vvdn:      { label: 'VVDN',         color: '#a78bfa' },
  benetel:   { label: 'Benetel',      color: '#ec4899' },
  amplitech: { label: 'Amplitech',    color: '#34a853' },
  gh:        { label: 'Grace Hopper', color: '#76b900' },
  ran:       { label: 'RAN hosts',    color: '#4c8df6' },
  devkit:    { label: 'Devkits',      color: '#f9ab00' },
  keysight:  { label: 'Keysight',     color: '#f9ab00' },
  rf:        { label: 'RF enclosure', color: '#9aa0a6' },
  sim:       { label: 'Simulators',   color: '#a78bfa' },
};

const ru = (name, group, model, info, status = 'available') =>
  ({ name, kind: 'ru', group, model, info, status });

export const BENCHES = [
  {
    id: 'radio',
    name: 'Radio bench',
    subtitle: 'O-RAN radio units',
    devices: [
      ru('Foxconn RU 1', 'foxconn', 'RPQN-7801', 'Band n78 · 10.112.101.51'),
      ru('Foxconn RU 2', 'foxconn', 'RPQN-7801', 'Band n78 · 10.112.101.52'),
      ru('Foxconn RU 3', 'foxconn', 'RPQN-7801', 'Band n78 · 10.112.101.53'),
      ru('Foxconn RU 4', 'foxconn', 'RPQN-7801', 'Band n78 · 10.112.101.54'),
      ru('Foxconn RU 5', 'foxconn', 'RPQN-4800E', 'Band n48 · 10.112.101.55'),
      ru('Foxconn RU 6', 'foxconn', 'RPQN-4800E', 'Band n48 · 10.112.101.56'),
      ru('Foxconn RU 7', 'foxconn', 'unknown', 'Band n77/n78 · 10.112.101.57 · NETCONF unstable'),
      ru('Foxconn RU 8', 'foxconn', 'unknown', 'Band n77 · 10.112.101.58'),
      ru('Foxconn RU 9', 'foxconn', 'unknown', 'Band n77/n78 · 10.112.101.59'),
      ru('WNC-01', 'wnc', 'WNC RU', ''),
      ru('WNC-02', 'wnc', 'WNC RU', ''),
      ru('ERDN-01', 'eridan', 'Eridan RU', ''),
      ru('ERDN-02', 'eridan', 'Eridan RU', ''),
      ru('VVDN', 'vvdn', 'VVDN RU', ''),
      ru('Benetel', 'benetel', 'Benetel RU', '', 'hidden'),
      ru('Amplitech mMIMO', 'amplitech', 'Amplitech mMIMO', 'mMIMO'),
    ],
  },
  {
    id: 'compute',
    name: 'Compute bench',
    subtitle: 'Hosts & devkits',
    devices: [
      { name: 'GH-01',      kind: 'gh',     group: 'gh',     model: 'Grace Hopper', info: '', status: 'available' },
      { name: 'GH-02',      kind: 'gh',     group: 'gh',     model: 'Grace Hopper', info: '', status: 'available' },
      { name: 'x5g-ran-01', kind: 'host',   group: 'ran',    model: 'RAN host',     info: '', status: 'available' },
      { name: 'x5g-ran-02', kind: 'host',   group: 'ran',    model: 'RAN host',     info: '', status: 'available' },
      { name: 'Devkit-01',  kind: 'devkit', group: 'devkit', model: 'Devkit',       info: '', status: 'available' },
      { name: 'Devkit-02',  kind: 'devkit', group: 'devkit', model: 'Devkit',       info: '', status: 'available' },
      { name: 'Devkit-03',  kind: 'devkit', group: 'devkit', model: 'Devkit',       info: '', status: 'available' },
      { name: 'Devkit-04',  kind: 'devkit', group: 'devkit', model: 'Devkit',       info: '', status: 'available' },
      { name: 'Devkit-05',  kind: 'devkit', group: 'devkit', model: 'Devkit',       info: '', status: 'available' },
      { name: 'Devkit-06',  kind: 'devkit', group: 'devkit', model: 'Devkit',       info: '', status: 'available' },
      { name: 'Devkit-07',  kind: 'devkit', group: 'devkit', model: 'Devkit',       info: '', status: 'available' },
    ],
  },
  {
    id: 'test',
    name: 'Test bench',
    subtitle: 'Instruments & simulators',
    devices: [
      { name: 'Keysight EXA',       kind: 'instrument', group: 'keysight', model: 'Spectrum analyzer', info: 'EXP 660 · remotely accessed by agents', status: 'available' },
      { name: 'RFBox',              kind: 'rfbox',      group: 'rf',       model: 'RF enclosure',      info: 'EXP',                                  status: 'available' },
      { name: 'RuSIM-02 (Boston)',  kind: 'sim',        group: 'sim',      model: 'RU simulator',      info: '',                                     status: 'available' },
      { name: 'UESim',              kind: 'sim',        group: 'sim',      model: 'UE simulator',      info: '',                                     status: 'available' },
    ],
  },
];
