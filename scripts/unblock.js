#!/usr/bin/env node
// Emergency unblock (e.g. if the admin's own IP changed and got blocked). Stop the server first.
//   npm run unblock -- 203.0.113.7      unblock one IP
//   npm run unblock -- --all            clear the whole block list
const fs = require('node:fs');
const path = require('node:path');

const FILE = process.env.STORE_FILE || path.join(__dirname, '..', 'data', 'store.json');
const arg = process.argv[2];
if (!arg) { console.error('usage: npm run unblock -- <ip> | --all'); process.exit(1); }

let state;
try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { console.log('no store file — nothing blocked'); process.exit(0); }
state.blocked = state.blocked || {};
if (arg === '--all') {
  const n = Object.keys(state.blocked).length;
  state.blocked = {};
  console.log(`cleared ${n} blocked IP(s)`);
} else if (state.blocked[arg]) {
  delete state.blocked[arg];
  console.log(`unblocked ${arg}`);
} else {
  console.log(`${arg} was not blocked`);
}
fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
