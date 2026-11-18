import { guard, fillWho, logEvent } from './core.js';

const ctx = await guard();
if (ctx) {
  const { user, ip, admin } = ctx;
  fillWho(user);
  if (admin) document.getElementById('adminlink').hidden = false;
  LAB.onComplete = (mod, score) => logEvent(user, ip, 'lab.complete', `L${mod.level} ${mod.id}${score != null ? ' score=' + score : ''}`, { key: 'lab_' + mod.id });
  LAB.start();
  MX.type(document.getElementById('introterm'), [
    `> operator: ${user.email}`,
    `> source ip: ${ip}`,
    `> clearance: ${admin ? 'ADMIN' : 'TRAINEE'}`,
    '> 난이도를 고르고 미션을 시작하세요.',
  ], 14);
}
