import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDb } from '../../../../db/client'
import { getComponent, type Component } from '../../../../db/components'
import { LOOK_UP_AGAIN_MESSAGES, type FormValues } from '../../../../lib/component-service'
import { lookUpAgainAction, updateComponentAction } from '../../actions'
import { ComponentForm } from '../../component-form'

export const metadata: Metadata = { title: 'Edit component – Longrun' }

// Only these notices exist; anything else in the URL is ignored.
const NOTICES: Record<string, string> = {
  'lookup-updated': 'Looked up again: the end-of-support date was updated.',
  'lookup-unchanged': 'Looked up again: the end-of-support date is unchanged.',
  'lookup-no-eol': LOOK_UP_AGAIN_MESSAGES['no-eol'],
  'lookup-no-date': LOOK_UP_AGAIN_MESSAGES['no-date'],
  'lookup-not-found': LOOK_UP_AGAIN_MESSAGES['not-found'],
  'lookup-unavailable': LOOK_UP_AGAIN_MESSAGES.unavailable,
}

function formValues(component: Component): FormValues {
  return {
    name: component.name,
    version: component.version,
    whereUsed: component.whereUsed,
    owner: component.owner,
    eolProduct: component.eol?.product ?? '',
    eolRelease: component.eol?.release ?? '',
    manualEndOfSupport:
      component.endOfSupport?.source === 'manual' ? component.endOfSupport.date : '',
  }
}

function describeDate(component: Component): string {
  const eos = component.endOfSupport
  if (!eos) return 'Unknown'
  if (eos.source === 'manual') return `${eos.date} (entered manually)`
  return `${eos.date} (from endoflife.date, looked up ${eos.lookedUpAt.toISOString().slice(0, 16).replace('T', ' ')} UTC)`
}

export default async function EditComponentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, { notice }] = await Promise.all([params, searchParams])
  const component = await getComponent(getDb(), id)
  // Spec 0001 E8: deleted by someone else, or never existed.
  if (!component) redirect('/?notice=not-found')
  const message = typeof notice === 'string' ? NOTICES[notice] : undefined

  return (
    <>
      <p>
        <Link href="/">Back to components</Link>
      </p>
      <h1>Edit {component.name}</h1>
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      <p>
        Current end of support: <strong>{describeDate(component)}</strong>
      </p>
      {component.eol ? (
        <form action={lookUpAgainAction.bind(null, component.id)}>
          <button type="submit">Look up again on endoflife.date</button>
        </form>
      ) : null}
      <ComponentForm
        action={updateComponentAction.bind(null, component.id)}
        submitLabel="Save changes"
        initial={formValues(component)}
      />
      <p>
        <Link href={`/components/${component.id}/delete`}>Delete this component</Link>
      </p>
    </>
  )
}
