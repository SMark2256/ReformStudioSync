import { Check, Moon, Sun } from 'lucide-react';
import React from 'react';
import { TourRestart } from '@/features/guided-tour';
import {
  SURFACE_COLORS,
  THEME_LABELS,
  getSurfaceName,
  isSurfaceColor,
  saveSurface,
  saveTheme,
  useSurfaceStore,
  useThemeStore,
  type ReceptionTheme,
} from '@/shared/theme';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/ui';

const THEME_OPTIONS: { value: ReceptionTheme; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
];

interface SettingRowProps {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

// Beállítássor (UI-specifikáció 6.9): 220 px leírás + vezérlő; mobilon egymás alatt.
const SettingRow: React.FC<SettingRowProps> = ({
  id,
  title,
  description,
  children,
}) => (
  <div className="grid gap-x-6 gap-y-2.5 py-4 first:pt-0 last:pb-0 md:grid-cols-[220px_minmax(0,1fr)]">
    <div>
      <h3 id={id} className="text-[13px] font-semibold text-foreground">
        {title}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);

// Beállítások (UI-specifikáció 6.9): a megjelenés ezen a gépen mentődik, azonnal érvényes. A
// „Stúdió adatai” kártya külön jegyben készül (nincs még hozzá API).
export const SettingsPage: React.FC = () => {
  const theme = useThemeStore((state) => state.theme);
  const surface = useSurfaceStore((state) => state.surface);

  return (
    <>
      <PageHeader
        title="Beállítások"
        description="A megjelenés ezen a gépen mentődik."
      />
      <Card>
        <CardHeader>
          <CardTitle>Megjelenés</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <SettingRow
            id="settings-theme"
            title="Téma"
            description="Világos vagy sötét felület"
          >
            <ToggleGroup
              type="single"
              aria-labelledby="settings-theme"
              value={theme}
              // A kijelölt elemre kattintva a csoport kiürülne: az a választás marad.
              onValueChange={(next) => {
                if ((next === 'light' || next === 'dark') && next !== theme) {
                  saveTheme(next);
                }
              }}
            >
              {THEME_OPTIONS.map(({ value, icon: Icon }) => (
                <ToggleGroupItem key={value} value={value}>
                  <Icon aria-hidden strokeWidth={1.75} />
                  {THEME_LABELS[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SettingRow>

          <SettingRow
            id="settings-surface"
            title="Felületszín"
            description="Elsődleges gombok, aktív menüpont, jelölők"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <ToggleGroup
                type="single"
                aria-labelledby="settings-surface"
                value={surface}
                onValueChange={(next) => {
                  if (isSurfaceColor(next) && next !== surface) {
                    saveSurface(next);
                  }
                }}
                className="gap-2 overflow-visible rounded-none border-0 bg-transparent shadow-none"
              >
                {/* Minden minta a saját `data-surface`-ével a saját palettáját mutatja. */}
                {SURFACE_COLORS.map((color) => (
                  <ToggleGroupItem
                    key={color.id}
                    value={color.id}
                    data-surface={color.id}
                    aria-label={color.name}
                    title={color.name}
                    className="group size-[30px] flex-none rounded-md border border-border bg-primary p-0 first:border-l hover:bg-primary data-[state=on]:bg-primary data-[state=on]:outline data-[state=on]:outline-2 data-[state=on]:outline-offset-2 data-[state=on]:outline-foreground md:flex-none coarse:size-10 coarse:min-h-10"
                  >
                    <Check
                      aria-hidden
                      strokeWidth={2.25}
                      className="hidden text-primary-foreground group-data-[state=on]:block"
                    />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <span className="text-[13px] text-muted-foreground">
                {getSurfaceName(surface)}
              </span>
            </div>
          </SettingRow>

          <SettingRow
            id="settings-buttons"
            title="Gombstílusok"
            description="A felület három gombtípusa"
          >
            {/* Csak előnézet a felületszínhez: a gombok nem csinálnak semmit. */}
            <div
              role="group"
              aria-labelledby="settings-buttons"
              className="flex flex-wrap items-center gap-2"
            >
              <Button type="button" variant="primary">
                Elsődleges
              </Button>
              <Button type="button" variant="secondary">
                Másodlagos
              </Button>
              <Button type="button" variant="link">
                Link gomb
              </Button>
            </div>
          </SettingRow>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Súgó</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingRow
            id="settings-tours"
            title="Oldalbemutatók"
            description="A már látott vagy elvetett bemutatók újra felajánlása"
          >
            <TourRestart />
          </SettingRow>
        </CardContent>
      </Card>
    </>
  );
};
