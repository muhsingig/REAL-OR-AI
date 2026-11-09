import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import HostApp from './host/HostApp.jsx';
import PhoneApp from './phone/PhoneApp.jsx';
import { Logo, Icons } from './ui.jsx';

function currentRoute() {
  const params = new URLSearchParams(location.search);
  if (location.pathname.startsWith('/host')) return 'host';
  if (location.pathname.startsWith('/play') || params.has('code')) return 'play';
  return 'home';
}

export function go(path) {
  history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onPop = () => setRoute(currentRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (route === 'host') return <HostApp />;
  if (route === 'play') return <PhoneApp />;
  return <Home />;
}

function Home() {
  const phoneish = typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;
  const host = (
    <motion.button key="host" type="button" className={`choice ${phoneish ? '' : 'primary'}`} onClick={() => go('/host')} whileTap={{ scale: 0.98 }}>
      <Icons.Screen size="30px" />
      <b>Host on this screen</b>
      <span>Open on a laptop or TV everyone can see. Load your group chat, then friends join on their phones.</span>
    </motion.button>
  );
  const join = (
    <motion.button key="join" type="button" className={`choice ${phoneish ? 'primary' : ''}`} onClick={() => go('/play')} whileTap={{ scale: 0.98 }}>
      <Icons.Phone size="30px" />
      <b>Join a game</b>
      <span>Got a room code on the big screen? Tap here and type it in.</span>
    </motion.button>
  );
  return (
    <main className="home">
      <Logo />
      <section className="home-hero">
        <motion.h1 className="display" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 20 }}>
          Your group chat.
          <br />
          Some of it is <span className="ai-word">fake.</span>
        </motion.h1>
        <p className="lede" style={{ fontSize: 'clamp(17px, 2vw, 22px)', maxWidth: '36em' }}>
          The AI reads your WhatsApp group and learns how each friend texts. Then it mixes their real messages with fakes. Spot which is which.
        </p>
        <div className="home-choices">{phoneish ? [join, host] : [host, join]}</div>
      </section>
    </main>
  );
}
