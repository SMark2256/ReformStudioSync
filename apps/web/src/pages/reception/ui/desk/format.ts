// Pénzösszeg szóközzel tagolva, „Ft” utótaggal (UI-specifikáció 6.5, 7.2).
export const formatHuf = (amount: number) =>
  `${amount.toLocaleString('hu-HU')} Ft`;
