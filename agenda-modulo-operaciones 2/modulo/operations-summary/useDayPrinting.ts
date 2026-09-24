'use client';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/** Permite imprimir el día completo y restaurar los filtros de pantalla al cerrar el diálogo. */
export function useDayPrinting() {
  const [isPrinting, setIsPrinting] = useState(false);
  useEffect(() => {
    const begin = () => flushSync(() => setIsPrinting(true));
    const end = () => setIsPrinting(false);
    window.addEventListener('beforeprint', begin);
    window.addEventListener('afterprint', end);
    return () => {
      window.removeEventListener('beforeprint', begin);
      window.removeEventListener('afterprint', end);
    };
  }, []);
  return isPrinting;
}
