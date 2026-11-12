import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  PageHeader,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/ui';
import {
  formatReleaseNoteDate,
  getJiraIssueUrl,
  groupReleaseNotesByVersion,
  isReleaseNoteFilter,
  matchesReleaseNoteFilter,
  RELEASE_NOTE_FILTERS,
  RELEASE_NOTE_KIND_LABELS,
  RELEASE_NOTES,
  type ReceptionMainTab,
  type ReleaseNote,
  type ReleaseNoteFilter,
} from '@/entities/release-note';
import { useReleaseNotesStore } from '../model/releaseNotesStore';

const FILTER_COUNTS = Object.fromEntries(
  RELEASE_NOTE_FILTERS.map(({ value }) => [
    value,
    RELEASE_NOTES.filter((n) => matchesReleaseNoteFilter(n, value)).length,
  ]),
) as Record<ReleaseNoteFilter, number>;

interface WhatsNewPanelProps {
  onOpenReceptionTab: (tab: ReceptionMainTab) => void;
}

export const WhatsNewPanel: React.FC<WhatsNewPanelProps> = ({
  onOpenReceptionTab,
}) => {
  const navigate = useNavigate();
  const { seenIds, markSeen } = useReleaseNotesStore();
  // A megnyitás pillanatában még nem látott tételek „Új” jelölést kapnak erre a látogatásra.
  const [unseenOnOpen] = useState(
    () =>
      new Set(
        RELEASE_NOTES.filter((n) => !seenIds.includes(n.id)).map((n) => n.id),
      ),
  );

  useEffect(() => {
    markSeen(RELEASE_NOTES.map((n) => n.id));
  }, [markSeen]);

  const [filter, setFilter] = useState<ReleaseNoteFilter>('all');
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // Csak a szűrőnek megfelelő bejegyzések; üres verziócsoport nem keletkezik.
  const byVersion = useMemo(
    () =>
      groupReleaseNotesByVersion(
        RELEASE_NOTES.filter((note) => matchesReleaseNoteFilter(note, filter)),
      ),
    [filter],
  );

  const toggleDetails = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const openLink = (note: ReleaseNote) => {
    if (!note.link) return;
    if (note.link.type === 'receptionTab') onOpenReceptionTab(note.link.tab);
    else navigate(note.link.path);
  };

  return (
    <>
      <PageHeader
        title="Újdonságok"
        description="A frissítésekkel bekerült új funkciók és fejlesztések. Ahol az újdonság megtekinthető, egy kattintással odajutsz."
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ToggleGroup
          type="single"
          aria-label="Szűrés típus szerint"
          value={filter}
          // A kijelölt elemre kattintva a csoport kiürülne: az a választás marad.
          onValueChange={(next) => {
            if (isReleaseNoteFilter(next)) setFilter(next);
          }}
        >
          {RELEASE_NOTE_FILTERS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value}>
              {f.label}
              <span className="tabular-nums">{FILTER_COUNTS[f.value]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span
          aria-live="polite"
          className="text-xs text-muted-foreground tabular-nums"
        >
          {FILTER_COUNTS[filter]} bejegyzés
        </span>
      </div>

      <div className="space-y-6">
        {byVersion.map(({ version, date, notes }) => (
          <section
            key={version}
            aria-labelledby={`release-${version}`}
            className="space-y-3"
          >
            <div className="flex items-baseline gap-2">
              <h2
                id={`release-${version}`}
                className="text-sm font-semibold text-foreground"
              >
                v{version}
              </h2>
              <span className="text-xs text-muted-foreground">
                {formatReleaseNoteDate(date)}
              </span>
            </div>

            <ul className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
              {notes.map((note) => {
                const detailsId = `release-note-details-${note.id}`;
                const details = note.details ?? [];
                const hasDetails = details.length > 0;
                const expanded = expandedIds.has(note.id);
                return (
                  <li key={note.id} className="min-w-0">
                    <Card className="flex h-full flex-col">
                      <CardContent className="flex flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" dot={false}>
                            {RELEASE_NOTE_KIND_LABELS[note.kind]}
                          </Badge>
                          {unseenOnOpen.has(note.id) && (
                            <Badge variant="success">Új</Badge>
                          )}
                          {note.jiraKey && (
                            <Button
                              variant="link"
                              size="sm"
                              asChild
                              className="ml-auto font-mono text-xs font-normal"
                            >
                              <a
                                href={getJiraIssueUrl(note.jiraKey)}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`${note.jiraKey} Jira-jegy megnyitása új lapon`}
                              >
                                {note.jiraKey}
                              </a>
                            </Button>
                          )}
                        </div>

                        <h3 className="text-sm font-semibold text-foreground">
                          {note.title}
                        </h3>
                        <p className="text-[13px] text-muted-foreground">
                          {note.summary}
                        </p>
                        {hasDetails && (
                          <ul
                            id={detailsId}
                            hidden={!expanded}
                            className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground"
                          >
                            {details.map((d) => (
                              <li key={d}>{d}</li>
                            ))}
                          </ul>
                        )}

                        {(hasDetails || note.link) && (
                          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1">
                            {hasDetails && (
                              <Button
                                variant="link"
                                className="w-fit"
                                aria-expanded={expanded}
                                aria-controls={detailsId}
                                onClick={() => toggleDetails(note.id)}
                              >
                                {expanded ? 'Kevesebb' : 'Részletek'}
                              </Button>
                            )}
                            {note.link && (
                              <Button
                                variant="link"
                                className="w-fit"
                                onClick={() => openLink(note)}
                              >
                                {note.link.label}
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
};
