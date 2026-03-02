import { useEffect, useRef, useState } from "react";

// Hook: devuelve true si 'active' permanece true más de 'delay' ms (por defecto 10s)
export default function useTimeout(active, delay = 10000) {
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (active) {
      setTimedOut(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setTimedOut(true), delay);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    } else {
      setTimedOut(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, delay]);

  return timedOut;
}
