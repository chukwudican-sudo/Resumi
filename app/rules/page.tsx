import AppNav from '../components/AppNav';
import RulesShell, { type Rule } from '../components/rules/RulesShell';
import { requireUserId } from '../server/auth';
import { listRules } from '../server/db/repository';

/**
 * The instructions someone wants applied to every resume they make.
 *
 * These are the closest thing the tool has to memory, and they are deliberately
 * a page rather than something inferred from behaviour: a preference the app
 * worked out on its own is one the person cannot correct, and the first
 * surprising resume would have nothing to point at.
 */
export default async function RulesPage() {
  const userId = await requireUserId();
  const rows = await listRules(userId);

  const rules: Rule[] = rows.map((r) => ({
    id: r.id,
    text: r.text,
    active: r.active,
    source: r.source,
  }));

  return (
    <main className="min-h-screen bg-ground font-sans text-ink">
      <AppNav active="rules" />
      <RulesShell initialRules={rules} />
    </main>
  );
}
