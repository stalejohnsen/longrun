import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDb } from '../../../../db/client'
import { getComponent } from '../../../../db/components'
import { deleteComponentAction } from '../../actions'

export const metadata: Metadata = { title: 'Delete component – Longrun' }

// Spec 0001 "Delete": a confirmation step before a permanent delete. Plain form and
// button, so it works with the keyboard and without client-side JavaScript.
export default async function DeleteComponentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const component = await getComponent(getDb(), id)
  if (!component) redirect('/?notice=not-found')

  return (
    <>
      <h1>Delete {component.name}?</h1>
      <p>
        {component.name} {component.version}, used in {component.whereUsed}, will be removed
        permanently. This cannot be undone.
      </p>
      <form action={deleteComponentAction.bind(null, component.id)}>
        <button type="submit">Delete permanently</button>
      </form>
      <p>
        <Link href={`/components/${component.id}/edit`}>Cancel</Link>
      </p>
    </>
  )
}
