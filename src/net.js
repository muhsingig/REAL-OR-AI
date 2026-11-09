import { useCallback, useEffect, useRef, useState } from 'react';

function makeStore(area) {
  return {
    get(key) {
      try {
        return JSON.parse(window[area].getItem(key) ?? 'null');
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        if (value === null) window[area].removeItem(key);
        else window[area].setItem(key, JSON.stringify(value));
      } catch {
        // Private mode or blocked storage: the game still works, it just can't resume after a refresh.
      }
    },
  };
}

export const store = makeStore('localStorage');
// Per tab, so a refresh keeps your seat but two tabs on one device are two players.
export const tabStore = makeStore('sessionStorage');

// One WebSocket to the game server, reconnecting on its own. `hello()` returns the
// message to send every time the socket (re)opens, so a refresh resumes the same seat.
export function useConnection({ hello, onMessage }) {
  const [state, setState] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const helloRef = useRef(hello);
  const onMessageRef = useRef(onMessage);
  helloRef.current = hello;
  onMessageRef.current = onMessage;

  useEffect(() => {
    let closed = false;
    let retry = 0;
    let timer;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        setStatus('open');
        const first = helloRef.current?.();
        if (first) ws.send(JSON.stringify(first));
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.t === 'state') {
          setState({ ...msg.state, receivedAt: performance.now() });
          setError(null);
        } else if (msg.t === 'error') {
          setError(msg.message);
        }
        onMessageRef.current?.(msg, ws);
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus('reconnecting');
        timer = setTimeout(connect, Math.min(4000, 400 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
  }, []);

  return { state, setState, status, error, setError, send };
}

// Milliseconds left on a server timer, ticking locally between state updates.
export function useRemaining(remainingMs, receivedAt, interval = 100) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (remainingMs == null) return undefined;
    const id = setInterval(() => setNow(performance.now()), interval);
    return () => clearInterval(id);
  }, [remainingMs, receivedAt, interval]);
  if (remainingMs == null) return null;
  return Math.max(0, remainingMs - (Math.max(now, receivedAt) - receivedAt));
}
