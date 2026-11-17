(async function () {
  const me = await MX.me();
  if (!me) return;
  MX.fillWho(me);
  if (me.admin) document.getElementById('adminlink').hidden = false;
  document.getElementById('logout').addEventListener('click', MX.logout);
  LAB.start();
  MX.type(document.getElementById('introterm'), [
    `> operator: ${me.email}`,
    `> source ip: ${me.ip}`,
    `> clearance: ${me.admin ? 'ADMIN' : 'TRAINEE'}`,
    '> 난이도를 고르고 미션을 시작하세요.',
  ], 14);
})();
