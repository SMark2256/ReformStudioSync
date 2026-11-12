import React, { useContext } from 'react';
import { createPortal } from 'react-dom';
import { HeaderStatusTargetContext } from '../model/headerStatusTarget';

/**
 * Az oldal saját állapotjelzői a fejléc jobb oldalán (UI-specifikáció 4.3), pl. a recepció
 * kapcsolatjelzői. A tartalom az oldal React-fájában marad, csak a fejlécbe rajzolódik.
 */
export const AppHeaderStatus: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const target = useContext(HeaderStatusTargetContext);
  return target ? createPortal(children, target) : null;
};
