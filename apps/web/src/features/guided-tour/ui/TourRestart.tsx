import { RotateCcw } from 'lucide-react';
import React, { useState } from 'react';
import { useAuthStore } from '@/shared/auth';
import { Button } from '@/shared/ui';
import { useTourStore } from '../model/tourStore';

// A Beállítások gombja: minden oldalbemutató újra felajánlható (a „Többet ne mutass” is törlődik).
export const TourRestart: React.FC = () => {
  const account = useAuthStore((state) => state.user?.id ?? '');
  const reset = useTourStore((state) => state.reset);
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button
        type="button"
        onClick={() => {
          reset(account);
          setDone(true);
        }}
      >
        <RotateCcw aria-hidden strokeWidth={1.75} />
        Bemutatók újraindítása
      </Button>
      {done && (
        <span role="status" className="text-[13px] text-muted-foreground">
          Rendben: az oldalakon újra felajánljuk a bemutatót.
        </span>
      )}
    </div>
  );
};
