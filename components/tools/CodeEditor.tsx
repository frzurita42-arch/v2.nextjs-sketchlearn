'use client';
/* A lightweight code editor for the "code / worked-answer" activity: a real
 * <textarea> for input sits transparently on top of a syntax-highlighted <pre>
 * overlay (the react-simple-code-editor pattern) — so it behaves like a normal
 * editor: Tab indents (never leaves the box), Enter keeps the indent, and
 * keywords / strings / comments / numbers are colour-coded. No dependencies. */
import { useEffect, useRef } from 'react';

// A broad, multi-language keyword set (Python, JS/TS, C-like, …) — enough to make
// a snippet read like code without a full per-language grammar.
const KEYWORDS = new Set([
  'def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or',
  'import', 'from', 'as', 'class', 'try', 'except', 'finally', 'with', 'lambda',
  'pass', 'break', 'continue', 'is', 'del', 'raise', 'assert', 'global', 'nonlocal',
  'yield', 'async', 'await', 'True', 'False', 'None', 'self',
  'function', 'const', 'let', 'var', 'new', 'this', 'typeof', 'instanceof', 'void',
  'null', 'undefined', 'true', 'false', 'switch', 'case', 'default', 'throw', 'catch',
  'do', 'then', 'end', 'extends', 'super', 'export', 'public', 'private', 'protected',
  'static', 'int', 'float', 'double', 'char', 'string', 'bool', 'boolean', 'long',
  'print', 'echo', 'foreach', 'func', 'struct', 'enum', 'interface', 'type',
]);

const COL = { keyword: '#e6994e', string: '#9fca56', comment: '#8b8578', number: '#d3a15b', func: '#6fb0e0' };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Tokenise into coloured HTML: comments, strings, numbers, keywords, and calls.
function highlight(src: string): string {
  const re = /(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(\b\d[\w.]*\b)|([A-Za-z_$][\w$]*)/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    const [, comment, str, num, ident] = m;
    if (comment != null) out += `<span style="color:${COL.comment};font-style:italic">${esc(comment)}</span>`;
    else if (str != null) out += `<span style="color:${COL.string}">${esc(str)}</span>`;
    else if (num != null) out += `<span style="color:${COL.number}">${esc(num)}</span>`;
    else if (KEYWORDS.has(ident)) out += `<span style="color:${COL.keyword};font-weight:700">${esc(ident)}</span>`;
    else if (src[re.lastIndex] === '(') out += `<span style="color:${COL.func}">${esc(ident)}</span>`;
    else out += esc(ident);
    last = re.lastIndex;
  }
  out += esc(src.slice(last));
  return out;
}

// The box model shared EXACTLY by the textarea and the highlight layer, so the
// caret lines up over the coloured text.
const shared: React.CSSProperties = {
  margin: 0,
  padding: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 14,
  lineHeight: 1.5,
  tabSize: 2,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  border: 'none',
  boxSizing: 'border-box',
};

export function CodeEditor({ value, onChange, placeholder, minHeight = 200 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const caret = useRef<number | null>(null);

  // Restore the caret after a programmatic edit (Tab / auto-indent) once the
  // controlled value has been committed to the DOM.
  useEffect(() => {
    if (caret.current != null && taRef.current) {
      taRef.current.selectionStart = taRef.current.selectionEnd = caret.current;
      caret.current = null;
    }
  }, [value]);

  const syncScroll = () => {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (e.key === 'Tab') {
      // Tab indents by two spaces (Shift+Tab removes up to two leading spaces on
      // the caret's line) — it never moves focus out of the editor.
      e.preventDefault();
      if (e.shiftKey) {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const removed = value.slice(lineStart).match(/^ {1,2}/);
        if (removed) {
          const n = removed[0].length;
          onChange(value.slice(0, lineStart) + value.slice(lineStart + n));
          caret.current = Math.max(lineStart, start - n);
        }
      } else {
        onChange(value.slice(0, start) + '  ' + value.slice(end));
        caret.current = start + 2;
      }
      return;
    }
    if (e.key === 'Enter') {
      // Keep the current line's indentation, and add one level after a ':' or '{'.
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lead = (value.slice(lineStart, start).match(/^[ \t]*/) || [''])[0];
      const extra = /[:{[(]\s*$/.test(value.slice(lineStart, start)) ? '  ' : '';
      if (lead || extra) {
        e.preventDefault();
        const insert = '\n' + lead + extra;
        onChange(value.slice(0, start) + insert + value.slice(end));
        caret.current = start + insert.length;
      }
    }
  };

  const showPlaceholder = !value && placeholder;

  return (
    <div style={{ position: 'relative', minHeight, resize: 'vertical', overflow: 'hidden', borderRadius: 8, border: '2px solid var(--ink)', background: '#2d2a26' }}>
      <pre ref={preRef} aria-hidden style={{ ...shared, position: 'absolute', inset: 0, overflow: 'hidden', color: '#f7f3e9', pointerEvents: 'none' }}>
        {showPlaceholder
          ? <span style={{ color: '#8b8578' }}>{placeholder}</span>
          : <code dangerouslySetInnerHTML={{ __html: highlight(value) + '\n' }} />}
      </pre>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{ ...shared, position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'auto', resize: 'none', outline: 'none', background: 'transparent', color: 'transparent', caretColor: '#f7f3e9' }}
      />
    </div>
  );
}
