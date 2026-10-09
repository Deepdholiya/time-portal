import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bell, Clock, CornerDownLeft, FolderKanban, Menu as MenuIcon, Moon, Plus, Search, Sparkles, SquarePen, X } from "lucide-react";
import { Button, IconButton, Kbd, Spinner, Tooltip } from "@/components/ui";
import { get, post } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { toggleTheme } from "@/lib/theme";
import type { Task } from "@/lib/types";
import { navItems } from "./nav";
import { StatusIcon } from "./icons";
import { useShell } from "./shell-context";
import s from "./top-bar.module.css";

interface Result { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void }
interface Answer { answer: string; source: string; links: { label: string; to: string }[] }
export interface TopBarHandle { focus: () => void }

/**
 * Top bar with one search box for pages, projects and tasks, plus "Ask AI" for questions about your own time
 * ("how many hours did I log last week?"). ⌘K or / focuses it.
 */
export const TopBar = forwardRef<TopBarHandle, { onMenu: () => void }>(function TopBar({ onMenu }, ref) {
  const nav = useNavigate();
  const shell = useShell();
  const { can, me } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<{ id: number; name: string; color: string; parentId?: number | null }[]>([]);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<(Answer & { q: string }) | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const dq = useDebounced(q, 150);

  useImperativeHandle(ref, () => ({ focus: () => { input.current?.focus(); setOpen(true); } }), []);
  useEffect(() => { if (open && !projects.length) get<{ projects: typeof projects }>("/options").then((o) => setProjects(o.projects.filter((p) => !p.parentId))).catch(() => {}); }, [open, projects.length]);
  useEffect(() => {
    if (!open || dq.trim().length < 2) { setTasks([]); return; }
    let alive = true;
    get<Task[]>("/tasks", { q: dq, includeDone: true, parent: "all" }).then((t) => alive && setTasks(t.slice(0, 6))).catch(() => {});
    return () => { alive = false; };
  }, [dq, open]);
  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const close = () => { setOpen(false); setAnswer(null); setAskError(null); input.current?.blur(); };
  const go = (to: string) => () => { nav(to); setQ(""); close(); };
  const ask = async () => {
    const question = q.trim();
    if (question.length < 2) return;
    setAsking(true); setAskError(null); setAnswer(null);
    try { setAnswer({ ...(await post<Answer>("/ai/ask", { q: question })), q: question }); }
    catch (e) { setAskError(e instanceof Error ? e.message : "Couldn't get an answer"); }
    finally { setAsking(false); }
  };

  const results = useMemo<Result[]>(() => {
    const t = q.trim().toLowerCase();
    const match = (...xs: (string | undefined)[]) => !t || xs.some((x) => x?.toLowerCase().includes(t));
    const out: Result[] = [];
    if (t.length >= 2) out.push({ id: "ai", group: "Ask AI", label: `Ask AI: “${q.trim()}”`, hint: "About your time and tasks", icon: <Sparkles size={15} />, run: ask });
    if (!t) {
      out.push(
        { id: "log", group: "Actions", label: "Log time", icon: <Clock size={15} />, run: () => { close(); shell.logTime(); } },
        { id: "task", group: "Actions", label: "Create new task", hint: "C", icon: <Plus size={15} />, run: () => { close(); shell.newTask(); } },
        { id: "theme", group: "Actions", label: "Toggle dark mode", hint: "⇧D", icon: <Moon size={15} />, run: () => { close(); toggleTheme(); } },
      );
    }
    out.push(...navItems(can).filter((i) => match(i.label, i.keywords, i.section)).slice(0, t ? 6 : 8).map((i) => ({ id: "nav" + i.to, group: "Go to", label: i.label, hint: i.section, icon: <i.icon size={15} />, run: go(i.to) })));
    if (t) out.push(...projects.filter((p) => match(p.name)).slice(0, 5).map((p) => ({ id: "p" + p.id, group: "Projects", label: p.name, icon: <FolderKanban size={15} color={p.color} />, run: go(`/projects/${p.id}`) })));
    out.push(...tasks.map((tk) => ({ id: "t" + tk.id, group: "Tasks", label: tk.title, hint: tk.key, icon: <StatusIcon status={tk.status} />, run: () => { close(); setQ(""); shell.openTask(tk.id); } })));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, can, projects, tasks]);

  useEffect(() => setHi(0), [q]);
  const showAnswer = asking || answer || askError;

  let lastGroup = "";
  return (
    <header className={s.bar}>
      <IconButton className={s.menuBtn} label="Open menu" icon={<MenuIcon size={18} />} onClick={onMenu} />
      <div className={s.searchWrap} ref={box}>
        <div className={`${s.search} ${open ? s.focused : ""}`}>
          <Search size={15} className="faint" />
          <input
            ref={input}
            value={q}
            placeholder="Search or ask AI about your time…"
            aria-label="Search or ask AI"
            role="combobox"
            aria-expanded={open}
            aria-controls="top-search-results"
            aria-activedescendant={open && !showAnswer && results[hi] ? `sr-${results[hi].id}` : undefined}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setAnswer(null); setAskError(null); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); if (q) setQ(""); else close(); }
              else if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(results.length - 1, h + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); results[hi]?.run(); }
            }}
          />
          {q ? <button type="button" className={s.clear} aria-label="Clear search" onClick={() => { setQ(""); setAnswer(null); input.current?.focus(); }}><X size={13} /></button> : <Kbd>⌘K</Kbd>}
        </div>
        {open && (
          <div className={s.dropdown} id="top-search-results" role="listbox" aria-label="Search results">
            {showAnswer ? (
              <div className={s.answer} aria-live="polite">
                <div className={s.answerHead}><Sparkles size={14} /> <span className="medium">AI answer</span><span className="grow" />{answer && <span className="tiny faint">{answer.source === "claude" ? "Claude" : "Built-in reader"}</span>}</div>
                {asking ? <div className="row gap-4 muted small"><Spinner size={13} /> Looking at your time…</div>
                  : askError ? <div className="small danger">{askError}</div>
                  : answer && (
                    <>
                      <div className="faint small">“{answer.q}”</div>
                      <p className={s.answerText}>{answer.answer}</p>
                      <div className="row gap-4" style={{ flexWrap: "wrap" }}>
                        {answer.links.map((l) => <Button key={l.to} size="sm" variant="secondary" iconRight={<ArrowRight size={13} />} onClick={go(l.to)}>{l.label}</Button>)}
                        <Button size="sm" variant="ghost" onClick={() => { setAnswer(null); input.current?.focus(); }}>Back to results</Button>
                      </div>
                    </>
                  )}
              </div>
            ) : results.length === 0 ? <div className={s.empty}>No matches. Press Enter to ask AI.</div> : results.map((r, i) => {
              const head = r.group !== lastGroup ? <div className={s.group}>{r.group}</div> : null;
              lastGroup = r.group;
              return (
                <div key={r.id}>
                  {head}
                  <div id={`sr-${r.id}`} role="option" aria-selected={i === hi} className={`${s.option} ${i === hi ? s.hi : ""} ${r.id === "ai" ? s.ai : ""}`} onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={r.run}>
                    <span className={s.optIcon}>{r.icon}</span>
                    <span className="ellipsis grow">{r.label}</span>
                    {r.hint && <span className={s.hint}>{r.hint}</span>}
                    {i === hi && <CornerDownLeft size={12} className="faint" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <span className="grow" />
      <div className={s.actions}>
        <Button size="sm" variant="secondary" icon={<Clock size={14} />} onClick={() => shell.logTime()} className={s.hideSm}>Log time</Button>
        <Tooltip content="New task" shortcut="C"><IconButton variant="ghost" className={s.hideSm} label="New task" icon={<SquarePen size={15} />} onClick={() => shell.newTask()} /></Tooltip>
        <Tooltip content="Inbox"><IconButton variant="ghost" label="Inbox" icon={<Bell size={15} />} onClick={() => nav("/inbox")} /></Tooltip>
        <span className={`${s.company} ${s.hideSm}`}>{me?.company.name}</span>
      </div>
    </header>
  );
});
