import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-10">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand text-2xl text-black">✏</div>
      <h1 className="mt-4 text-[26px] font-bold tracking-tight">About SketchLearn</h1>
      <div className="mt-4 space-y-4 text-[14px] leading-relaxed text-mut">
        <p>
          SketchLearn turns anything you want to <b className="text-ink">learn</b> — or anything you want to{" "}
          <b className="text-ink">display</b> — into a living path of AI-generated slide presentations.
        </p>
        <p>
          The platform&apos;s spine is a single relationship: a <b className="text-ink">repository</b> organises
          a course (or a menu, catalog or portfolio) as nested cards — units contain lessons, and each
          lesson&apos;s objective is a <b className="text-ink">prompt</b>. A reusable{" "}
          <b className="text-ink">slide tool</b> turns each prompt into a playable presentation with templated
          components: prose, formulas, charts, diagrams, tables, sticky notes, images, code and worked steps —
          each chosen to match the subject, with a quiz on every slide.
        </p>
        <p>
          The part that makes it feel alive: <b className="text-ink">cross-lesson memory</b>. When you finish a
          lesson, a compact log of what was taught — and what you answered — is written back to the repository.
          The next lesson&apos;s generation reads those logs and is told: <i>“previously taught — build on this
          like a later chapter; don&apos;t re-explain it.”</i> Lesson 2 never re-teaches Lesson 1; the course
          advances instead of repeating. The loop is <span className="font-mono text-brand">repo ⇄ slide tool ⇄ lesson log</span>.
        </p>
        <p>
          Guests can browse. Signed-in users create and play with a token balance. Teachers, moderators and
          admins get progressively more control, and subscriptions are activated through a simple manual
          payment review — built for places where card processors aren&apos;t an option.
        </p>
      </div>
      <div className="mt-8 flex gap-2">
        <Link href="/" className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-black hover:brightness-110">
          Talk to the Coach →
        </Link>
        <Link href="/path" className="rounded-lg border border-line2 px-4 py-2 text-[13px] text-ink hover:bg-panel2">
          Build a Lesson Path
        </Link>
      </div>
    </div>
  );
}
