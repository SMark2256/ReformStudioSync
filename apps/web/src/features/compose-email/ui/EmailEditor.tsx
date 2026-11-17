import { EMAIL_PLACEHOLDERS, escapeHtml } from '@reform/shared';
import {
  Bold,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';
import { normalizeImageUrl, normalizeLinkUrl } from '../model/emailDraft';

interface EmailEditorProps {
  id: string;
  /** A szerkesztő akadálymentes neve (a fölötte álló címke `id`-ja). */
  labelledBy: string;
  value: string;
  onChange: (html: string) => void;
}

type UrlMode = 'link' | 'image';

const URL_FORM_TEXT: Record<UrlMode, { label: string; placeholder: string; error: string }> = {
  link: {
    label: 'Hivatkozás címe',
    placeholder: 'https://reformstudio.hu',
    error: 'Webcímet (https://…) vagy mailto: címet adj meg.',
  },
  image: {
    label: 'Kép webcíme',
    placeholder: 'https://…/kep.jpg',
    error: 'A kép webcímét (https://…) add meg.',
  },
};

/**
 * Könnyű levélszerkesztő (TICKET-55): félkövér, dőlt, lista, hivatkozás, kép webcímről és
 * személyre szabható mező. A beillesztett szöveg formázás nélkül kerül be; a HTML-t a szerver
 * szanitizálja. A `contenteditable` mezőt a vonalkódolvasó szerkeszthetőnek veszi.
 */
export const EmailEditor: React.FC<EmailEditorProps> = ({ id, labelledBy, value, onChange }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [urlMode, setUrlMode] = useState<UrlMode | null>(null);
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  // Kívülről érkező érték (sablon betöltése): csak akkor írjuk át, ha eltér, hogy a kurzor maradjon.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== value) editor.innerHTML = value;
  }, [value]);

  const emitChange = () => onChange(editorRef.current?.innerHTML ?? '');

  const saveSelection = () => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection || selection.rangeCount === 0 || !editor) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRange.current = range.cloneRange();
  };

  const restoreSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    if (savedRange.current) {
      selection.addRange(savedRange.current);
    } else {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.addRange(range);
    }
  };

  const exec = (command: string, arg?: string) => {
    restoreSelection();
    document.execCommand(command, false, arg);
    saveSelection();
    emitChange();
  };

  const insertPlaceholder = (key: string) => exec('insertText', `{{${key}}}`);

  const openUrlForm = (mode: UrlMode) => {
    saveSelection();
    setUrlMode(mode);
    setUrl('');
    setUrlError(null);
  };

  const submitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlMode) return;
    const normalized = urlMode === 'link' ? normalizeLinkUrl(url) : normalizeImageUrl(url);
    if (!normalized) {
      setUrlError(URL_FORM_TEXT[urlMode].error);
      return;
    }
    if (urlMode === 'image') {
      exec('insertImage', normalized);
    } else if (savedRange.current && !savedRange.current.collapsed) {
      exec('createLink', normalized);
    } else {
      const safe = escapeHtml(normalized);
      exec('insertHTML', `<a href="${safe}">${safe}</a>`);
    }
    setUrlMode(null);
  };

  // Az eszköztár gombja ne vegye el a kijelölést a szerkesztőtől.
  const keepSelection = (e: React.MouseEvent) => e.preventDefault();

  const toolButton = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <Button
      type="button"
      size="icon"
      aria-label={label}
      title={label}
      onMouseDown={keepSelection}
      onClick={onClick}
    >
      {icon}
    </Button>
  );

  return (
    <div className="min-w-0 space-y-2">
      <div role="toolbar" aria-label="Szövegformázás" className="flex flex-wrap items-center gap-1.5">
        {toolButton('Félkövér', <Bold aria-hidden strokeWidth={1.75} />, () => exec('bold'))}
        {toolButton('Dőlt', <Italic aria-hidden strokeWidth={1.75} />, () => exec('italic'))}
        {toolButton('Felsorolás', <List aria-hidden strokeWidth={1.75} />, () =>
          exec('insertUnorderedList'),
        )}
        {toolButton('Számozott lista', <ListOrdered aria-hidden strokeWidth={1.75} />, () =>
          exec('insertOrderedList'),
        )}
        {toolButton('Hivatkozás', <Link2 aria-hidden strokeWidth={1.75} />, () => openUrlForm('link'))}
        {toolButton('Kép webcímről', <ImagePlus aria-hidden strokeWidth={1.75} />, () =>
          openUrlForm('image'),
        )}
        {toolButton('Formázás törlése', <RemoveFormatting aria-hidden strokeWidth={1.75} />, () =>
          exec('removeFormat'),
        )}
        <Select value="" onValueChange={insertPlaceholder}>
          <SelectTrigger
            aria-label="Mező beszúrása"
            className="h-9 w-auto min-w-[150px]"
            onMouseDown={saveSelection}
          >
            <SelectValue placeholder="Mező beszúrása" />
          </SelectTrigger>
          <SelectContent>
            {EMAIL_PLACEHOLDERS.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label} ({`{{${p.key}}}`})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {urlMode && (
        <form
          onSubmit={submitUrl}
          className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/40 p-3"
        >
          <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <Label htmlFor={`${id}-url`}>{URL_FORM_TEXT[urlMode].label}</Label>
            <Input
              id={`${id}-url`}
              autoFocus
              value={url}
              placeholder={URL_FORM_TEXT[urlMode].placeholder}
              aria-invalid={urlError ? true : undefined}
              aria-describedby={urlError ? `${id}-url-error` : undefined}
              onChange={(e) => setUrl(e.target.value)}
            />
            {urlError && (
              <p id={`${id}-url-error`} className="text-xs text-destructive">
                {urlError}
              </p>
            )}
          </div>
          <Button type="button" onClick={() => setUrlMode(null)}>
            Mégse
          </Button>
          <Button type="submit">Beszúrás</Button>
        </form>
      )}

      <div
        ref={editorRef}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelledBy}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={saveSelection}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onPaste={(e) => {
          e.preventDefault();
          exec('insertText', e.clipboardData.getData('text/plain'));
        }}
        className={cn(
          'min-h-[220px] w-full overflow-y-auto rounded-md border border-input bg-card px-3 py-2.5 text-sm text-foreground',
          'focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15',
          '[&_a]:text-primary-text [&_a]:underline [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6',
        )}
      />
    </div>
  );
};
