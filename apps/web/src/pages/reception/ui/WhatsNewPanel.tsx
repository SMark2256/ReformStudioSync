import { ArrowRight, ExternalLink, Sparkles, Ticket } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getJiraIssueUrl,
  RELEASE_NOTE_KIND_LABELS,
  RELEASE_NOTES,
  type ReceptionMainTab,
  type ReleaseNote,
  type ReleaseNoteKind,
} from '../model/releaseNotes';
import { useReleaseNotesStore } from '../model/releaseNotesStore';

const KIND_BADGE_CLASSES: Record<ReleaseNoteKind, string> = {
  NEW_PAGE:
    'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30',
  NEW_FEATURE:
    'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
  IMPROVEMENT:
    'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/30',
  FIX: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
};

interface WhatsNewPanelProps {
  onOpenReceptionTab: (tab: ReceptionMainTab) => void;
}

export const WhatsNewPanel: React.FC<WhatsNewPanelProps> = ({ onOpenReceptionTab }) => {
  const navigate = useNavigate();
  const { seenIds, markSeen } = useReleaseNotesStore();
  // A megnyitás pillanatában még nem látott tételek „Új” jelölést kapnak erre a látogatásra.
  const [unseenOnOpen] = useState(
    () => new Set(RELEASE_NOTES.filter((n) => !seenIds.includes(n.id)).map((n) => n.id)),
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30">
          <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
            Újdonságok
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            A frissítések során bekerült új funkciók és fejlesztések. Ahol az újdonság megtekinthető, egy kattintással odaugorhatsz.
          </p>
        </div>
      </div>

      {byVersion.map(([version, notes]) => (
        <section key={version} className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">v{version}</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{notes[0].date}</span>
          </div>

          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {notes.map((note) => {
              return (
                <li
                  key={note.id}
                  className="flex flex-col gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${KIND_BADGE_CLASSES[note.kind]}`}
                    >
                      {RELEASE_NOTE_KIND_LABELS[note.kind]}
                    </span>
                    {unseenOnOpen.has(note.id) && (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        Új
                      </span>
                    )}
                    {note.jiraKey && (
                      <a
                        href={getJiraIssueUrl(note.jiraKey)}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                        title="Jira jegy megnyitása"
                      >
                        <Ticket className="h-3 w-3" />
                        {note.jiraKey}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{note.title}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{note.summary}</p>
                  {note.details && note.details.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-300">
                      {note.details.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}

                  {note.link && (
                    <button
                      type="button"
                      onClick={() => openLink(note)}
                      className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition-colors"
                    >
                      {note.link.label}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};
