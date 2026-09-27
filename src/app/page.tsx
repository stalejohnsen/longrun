import Link from 'next/link'
import { listComponents, type Component } from '../db/components'
import { getDb } from '../db/client'

// Spec 0001 "List": all components by end-of-support date, unknown dates last.

// Only these notices exist; anything else in the URL is ignored.
const NOTICES: Record<string, string> = {
  registered: 'Component registered.',
  'registered-no-date':
    'Component registered. endoflife.date has no announced end of support for this release, so it has no date yet.',
}

function source(component: Component): string {
  if (!component.endOfSupport) return ''
  return component.endOfSupport.source === 'endoflife.date' ? 'endoflife.date' : 'Manual'
}

export default async function ComponentListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { notice } = await searchParams
  const message = typeof notice === 'string' ? NOTICES[notice] : undefined
  const components = await listComponents(getDb())

  return (
    <>
      <h1>Components</h1>
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      <p>
        <Link href="/components/new">Register component</Link>
      </p>
      {components.length === 0 ? (
        <p>No components registered yet.</p>
      ) : (
        <table>
          <caption className="visually-hidden">Registered components</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Version</th>
              <th scope="col">Where used</th>
              <th scope="col">Owner</th>
              <th scope="col">End of support</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {components.map((component) => (
              <tr key={component.id}>
                <td>{component.name}</td>
                <td>{component.version}</td>
                <td>{component.whereUsed}</td>
                <td>{component.owner}</td>
                <td>{component.endOfSupport?.date ?? 'Unknown'}</td>
                <td>{source(component)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
