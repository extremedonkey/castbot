Your SSH/pm2-into-TEST
  answer:
  ssh castbot-blue
   # interactive shell on
  the test box, then:
    pm2 list
    pm2 logs castbot-pm
    pm2 restart castbot-pm

  # one-liners from your
  laptop:
  ssh castbot-blue 'pm2
  list'
  ssh castbot-blue 'pm2
  logs castbot-pm --lines
  80 --nostream'
  npm run logs-test
   # shortcut I just
  added (= the pm2 logs
  one-liner)
  The castbot-blue alias
  (host 13.210.218.153,
  user ubuntu, key ~/.ssh/
  castbot-blue-key.pem) is
  in your ~/.ssh/config.
  Process name is
  castbot-pm, same as
  prod.