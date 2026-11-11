import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, CardContent, PageHeader } from '@/shared/ui';
import {
  getJiraIssueUrl,
  RELEASE_NOTE_KIND_LABELS,
  RELEASE_NOTES,
  type ReceptionMainTab,
  type ReleaseNote,
} from '../model/releaseNotes';
import { useReleaseNotesStore } from '../model/releaseNotesStore';

const formatNoteDate = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

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

  const byVersion = useMemo(() => {
    const groups = new Map<string, ReleaseNote[]>();
    for (const note of RELEASE_NOTES) {
      groups.set(note.version, [...(groups.get(note.version) ?? []), note]);
    }
    return Array.from(groups.entries());
  }, []);

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

      <div className="space-y-6">
        {byVersion.map(([version, notes]) => (
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
                {formatNoteDate(notes[0].date)}
              </span>
            </div>

            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {notes.map((note) => (
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
                      {note.details && note.details.length > 0 && (
                        <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
                          {note.details.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      )}

                      {note.link && (
                        <Button
                          variant="link"
                          className="mt-auto w-fit"
                          onClick={() => openLink(note)}
                        >
                          {note.link.label}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
};
