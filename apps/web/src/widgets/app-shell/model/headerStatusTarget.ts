import { createContext } from 'react';

// A fejléc állapotjelzőinek helye (a dátum és a téma gomb előtt); az `AppShell` adja.
export const HeaderStatusTargetContext = createContext<HTMLElement | null>(null);
