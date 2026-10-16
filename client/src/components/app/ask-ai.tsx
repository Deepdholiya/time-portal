import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { Button, IconButton, Sheet, Tooltip } from "@/components/ui";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";
import s from "./ask-ai.module.css";

interface Msg { role: "user" | "assistant"; content: string; links?: { label: string; to: string }[]; source?: string; error?: boolean }

const SUGGESTIONS = [
  "What should I focus on today?",
  "How many hours did I log last week?",
  "What's overdue or due this week?",
  "Which projects are at risk?",
  "Do I need to fix my timesheet?",
  "Is anything waiting on my approval?",
];

/**
 * Ask AI chat, opened from the top bar. Answers questions about the person's own work (time, tasks, timesheet, projects,
 * leave, approvals) from live data, and keeps the conversation until "New chat".
 */
export function AskAi({ open, onClose, question, onQuestionTaken }: { open: boolean; onClose: () => void; question?: string | null; onQuestionTaken?: () => void }) {
  const nav = useNavigate();
  const { me } = useSession();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const send = async (text: string) => {
    const q = text.trim();
    if (q.length < 2 || busy) return;
    const history = [...msgs.filter((m) => !m.error), { role: "user" as const, content: q }];
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setDraft("");
    setBusy(true);
    try {
      const r = await post<{ answer: string; source: string; links: { label: string; to: string }[] }>("/ai/chat", { messages: history.slice(-20).map(({ role, content }) => ({ role, content })) });
      setMsgs((m) => [...m, { role: "assistant", content: r.answer, links: r.links, source: r.source }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : "Couldn't get an answer. Try again.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  // A question typed in the search box arrives here and is sent straight away.
  useEffect(() => {
    if (open && question) { onQuestionTaken?.(); send(question); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, question]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 120); }, [open]);
  useEffect(() => { list.current?.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs, busy]);

  const first = me?.user.name.split(" ")[0];
  return (
    <Sheet
      open={open} onClose={onClose} width={440} title="Ask AI"
      actions={msgs.length > 0 ? <Tooltip content="Start a new chat"><Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => { setMsgs([]); input.current?.focus(); }}>New chat</Button></Tooltip> : undefined}
    >
      <div className={s.chat}>
        <div className={s.list} ref={list} aria-live="polite">
          {!msgs.length && (
            <div className={s.intro}>
              <span className={s.introIcon}><Sparkles size={16} /></span>
              <p className={s.hello}>Hi{first ? ` ${first}` : ""}, what do you want to know?</p>
              <p className={s.sub}>I can read your time, tasks, timesheet, projects, leave and approvals.</p>
              <div className={s.chips}>
                {SUGGESTIONS.map((q) => <button key={q} type="button" className={s.chip} onClick={() => send(q)}>{q}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => m.role === "user" ? (
            <div key={i} className={s.user}>{m.content}</div>
          ) : (
            <div key={i} className={`${s.bot} ${m.error ? s.err : ""}`}>
              <p className={s.text}>{m.content}</p>
              {!!m.links?.length && (
                <div className={s.links}>
                  {m.links.map((l) => <Button key={l.to} size="sm" variant="secondary" iconRight={<ArrowRight size={13} />} onClick={() => { nav(l.to); onClose(); }}>{l.label}</Button>)}
                </div>
              )}
              {m.source && <span className={s.source}>{m.source === "claude" ? "Answered by Claude" : "Answered by the built-in reader"}</span>}
            </div>
          ))}
          {busy && <div className={s.bot}><span className={s.dots} aria-label="Thinking"><i /><i /><i /></span></div>}
        </div>
        <form className={s.composer} onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <textarea
            ref={input} rows={1} value={draft} placeholder="Ask about your time, tasks or projects…" aria-label="Ask AI"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
          />
          <IconButton type="submit" variant="primary" size="sm" label="Send" icon={<ArrowUp size={15} />} disabled={busy || draft.trim().length < 2} />
        </form>
      </div>
    </Sheet>
  );
}
