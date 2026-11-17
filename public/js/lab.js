(async function () {
  const me = await MX.me();
  if (!me) return;
  MX.fillWho(me);
  if (me.admin) document.getElementById('adminlink').hidden = false;
  document.getElementById('logout').addEventListener('click', MX.logout);
  MX.type(document.getElementById('introterm'), [
    `> operator: ${me.email}`,
    `> source ip: ${me.ip}`,
    `> clearance: ${me.admin ? 'ADMIN' : 'TRAINEE'}`,
    '> session secured. welcome to the training grounds.',
  ], 16);
})();
