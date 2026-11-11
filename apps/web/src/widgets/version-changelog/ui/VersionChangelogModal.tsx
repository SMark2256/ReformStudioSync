import React, { useState } from 'react';
import {
  formatReleaseNoteDate,
  groupReleaseNotesByVersion,
  RELEASE_NOTE_KIND_LABELS,
  RELEASE_NOTES,
  type ReleaseNoteVersionGroup,
} from '@/entities/release-note';
import { APP_RELEASE_VERSION, APP_VERSION_LABEL } from '@/shared/config';
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui';

// A jelenlegi verzió mindig elöl van, akkor is, ha még nincs bejegyzése (kiadás utáni új verzió).
const buildVersionGroups = (): ReleaseNoteVersionGroup[] => {
  const groups = groupReleaseNotesByVersion(RELEASE_NOTES);
  const current = groups.find((g) => g.version === APP_RELEASE_VERSION) ?? {
    version: APP_RELEASE_VERSION,
    date: '',
    notes: [],
  };
  return [current, ...groups.filter((g) => g !== current)];
};

const VERSION_GROUPS = buildVersionGroups();

const VersionSection: React.FC<{
  group: ReleaseNoteVersionGroup;
  isCurrent: boolean;
}> = ({ group, isCurrent }) => {
  const [open, setOpen] = useState(isCurrent);
  const headingId = `version-${group.version}`;
  const listId = `version-${group.version}-notes`;

  return (
    <section aria-labelledby={headingId} className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3
          id={headingId}
          className="text-[13px] font-semibold text-foreground"
        >
          v{group.version}
        </h3>
        {isCurrent && (
          <Badge variant="secondary" dot={false}>
            Jelenlegi verzió
          </Badge>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">
          {group.date && `${formatReleaseNoteDate(group.date)} · `}
          {group.notes.length} változás
        </span>
        {group.notes.length > 0 && (
          <Button
            variant="link"
            size="sm"
            className="ml-auto"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`v${group.version} változásainak ${open ? 'összecsukása' : 'lenyitása'}`}
            onClick={() => setOpen((prev) => !prev)}
          >
            {open ? 'Összecsukás' : 'Lenyitás'}
          </Button>
        )}
      </div>

      {group.notes.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Ebben a verzióban még nincs bejegyzett változás.
        </p>
      ) : (
        <ul id={listId} hidden={!open} className="space-y-3">
          {group.notes.map((note) => (
            <li
              key={note.id}
              className="space-y-1 border-b border-border pb-3 last:border-b-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" dot={false}>
                  {RELEASE_NOTE_KIND_LABELS[note.kind]}
                </Badge>
                <p className="text-[13px] font-semibold text-foreground">
                  {note.title}
                </p>
              </div>
              <p className="text-[13px] text-muted-foreground">
                {note.summary}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

interface VersionBadgeProps {
  className?: string;
}

// A futó verzió a bejelentkezésnél; kattintásra a verziónkénti változáslista nyílik, amely az
// Újdonságok bejegyzéseiből épül (TICKET-44).
export const VersionBadge: React.FC<VersionBadgeProps> = ({ className }) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button
        variant="link"
        size="sm"
        className={className}
        aria-label={`${APP_VERSION_LABEL} változáslista megnyitása`}
      >
        {APP_VERSION_LABEL}
      </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          ReformStudioSync {APP_VERSION_LABEL} változáslista
        </DialogTitle>
        <DialogDescription>
          Verziónként, mi került be az alkalmazásba. A jelenlegi verzió van
          elöl, a korábbiak lenyithatók.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-5">
        {VERSION_GROUPS.map((group) => (
          <VersionSection
            key={group.version}
            group={group}
            isCurrent={group.version === APP_RELEASE_VERSION}
          />
        ))}
      </DialogBody>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="primary">Bezárás</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
