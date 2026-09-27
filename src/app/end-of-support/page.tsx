import type { Metadata } from 'next'
import Link from 'next/link'
import { getDb } from '../../db/client'
import { endOfSupportOverview, type Component } from '../../db/components'
import {
  endOfSupportWindow,
  parseWindowMonths,
  WINDOW_MONTHS,
} from '../../domain/end-of-support-window'

export const metadata: Metadata = { title: 'End of support – Longrun' }

// Spec 0001 "End-of-support view": components reaching end of support from today (UTC) up to
// and including today + the chosen window, with already-unsupported ones above. The window
// is in the URL (?months=N) so a view can be bookmarked or shared.

function source(component: Component): string {
  return component.endOfSupport?.source === 'endoflife.date' ? 'endoflife.date' : 'Manual'
}

function ComponentTable({ components, caption }: { components: Component[]; caption: string }) {
  return (
    <table>
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">End of support</th>
          <th scope="col">Name</th>
          <th scope="col">Version</th>
          <th scope="col">Where used</th>
          <th scope="col">Owner</th>
          <th scope="col">Source</th>
        </tr>
      </thead>
      <tbody>
        {components.map((component) => (
          <tr key={component.id}>
            <td>{component.endOfSupport?.date}</td>
            <td>
              <Link href={`/components/${component.id}/edit`}>{component.name}</Link>
            </td>
            <td>{component.version}</td>
            <td>{component.whereUsed}</td>
            <td>{component.owner}</td>
            <td>{source(component)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default async function EndOfSupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { months: raw } = await searchParams
  const { months, adjusted } = parseWindowMonths(typeof raw === 'string' ? raw : undefined)
  const window = endOfSupportWindow(months)
  const overview = await endOfSupportOverview(getDb(), window)
  const monthsLabel = months === 1 ? '1 month' : `${months} months`

  return (
    <>
      <h1>End of support</h1>
      {adjusted ? (
        <p className="notice" role="status">
          The window must be a whole number of months from {WINDOW_MONTHS.min} to{' '}
          {WINDOW_MONTHS.max}. Showing {WINDOW_MONTHS.default} months instead.
        </p>
      ) : null}

      <form method="get" className="window-form">
        <label htmlFor="months">Window (months)</label>
        <input
          id="months"
          name="months"
          type="number"
          min={WINDOW_MONTHS.min}
          max={WINDOW_MONTHS.max}
          step={1}
          defaultValue={months}
          required
        />
        <button type="submit">Show</button>
      </form>

      {overview.alreadyUnsupported.length > 0 ? (
        <section aria-labelledby="already-unsupported">
          <h2 id="already-unsupported">Already unsupported</h2>
          <ComponentTable
            components={overview.alreadyUnsupported}
            caption="Components past their end of support"
          />
        </section>
      ) : null}

      <section aria-labelledby="within-window">
        <h2 id="within-window">
          Ending within {monthsLabel} (until {window.until})
        </h2>
        {overview.withinWindow.length === 0 ? (
          <p>No components reach end of support in this period.</p>
        ) : (
          <ComponentTable
            components={overview.withinWindow}
            caption={`Components reaching end of support within ${monthsLabel}`}
          />
        )}
      </section>

      <p className="without-date">
        {overview.withoutDateCount === 1
          ? '1 component has no end-of-support date and is not shown.'
          : `${overview.withoutDateCount} components have no end-of-support date and are not shown.`}{' '}
        <Link href="/">See all components</Link>
      </p>
      <p className="hint">Today is {window.today} (UTC).</p>
    </>
  )
}
