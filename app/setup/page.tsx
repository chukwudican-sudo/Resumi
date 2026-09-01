import SetupShell from '../components/setup/SetupShell';
import type { Contact } from '../components/setup/ContactSection';
import type { EntryWithBullets } from '../lib/buildResume';
import { requireUserId } from '../server/auth';
import { getResumeInputs, getUser } from '../server/db/repository';

/** Where a resume gets built and edited. Everything here is typed by hand. */
export default async function SetupPage() {
  const userId = await requireUserId();
  const [{ entryRows, factRows }, user] = await Promise.all([
    getResumeInputs(userId),
    getUser(userId),
  ]);

  const entries: EntryWithBullets[] = entryRows.map((e) => ({
    id: e.id,
    kind: e.kind as EntryWithBullets['kind'],
    title: e.title ?? undefined,
    org: e.org ?? undefined,
    location: e.location ?? undefined,
    datesDisplay: e.datesDisplay ?? undefined,
    orderIndex: e.orderIndex,
    source: e.source as EntryWithBullets['source'],
    bullets: (e.bullets as string[]) ?? [],
    tech: e.tech,
  }));

  const pick = (label: string) =>
    factRows
      .find((f) => f.category === 'identity' && f.text.startsWith(`${label}: `))
      ?.text.slice(label.length + 2) ?? '';

  const contact: Contact = {
    name: pick('Name') || user?.displayName || '',
    email: pick('Email') || user?.email || '',
    phone: pick('Phone'),
    location: pick('Location'),
    linkedin: pick('LinkedIn'),
    website: pick('Website'),
  };

  return <SetupShell initialEntries={entries} initialFacts={factRows} initialContact={contact} />;
}
