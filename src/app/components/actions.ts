'use server'

import { redirect } from 'next/navigation'
import { deleteComponent } from '../../db/components'
import { requireUser } from '../../lib/auth/require-user'
import {
  editComponent,
  lookUpAgain,
  registerComponent,
  type FormState,
} from '../../lib/component-service'
import { serviceDeps } from '../../lib/services'

// Spec 0001 server actions. Thin wrappers: check the user, call the service, redirect.
// Redirects carry only fixed notice codes, never user input.

export async function createComponentAction(
  _previous: FormState | null,
  formData: FormData,
): Promise<FormState | null> {
  await requireUser()
  const result = await registerComponent(serviceDeps(), formData)
  if (!result.ok) {
    return 'state' in result ? result.state : null
  }
  redirect(result.notice === 'eol-no-date' ? '/?notice=registered-no-date' : '/?notice=registered')
}

// Bound to the component id on the edit page (Next.js forms guide: passing additional
// arguments). The id is validated by the data layer; an unknown id is "not found" (E8).
export async function updateComponentAction(
  id: string,
  _previous: FormState | null,
  formData: FormData,
): Promise<FormState | null> {
  await requireUser()
  const result = await editComponent(serviceDeps(), id, formData)
  if (!result.ok) {
    if ('notFound' in result) redirect('/?notice=not-found')
    return result.state
  }
  redirect(result.notice === 'eol-no-date' ? '/?notice=updated-no-date' : '/?notice=updated')
}

export async function lookUpAgainAction(id: string): Promise<void> {
  await requireUser()
  const result = await lookUpAgain(serviceDeps(), id)
  if (!result.ok && 'notFound' in result) redirect('/?notice=not-found')
  const notice = result.ok
    ? result.changed
      ? 'lookup-updated'
      : 'lookup-unchanged'
    : `lookup-${result.reason}`
  redirect(`/components/${encodeURIComponent(id)}/edit?notice=${notice}`)
}

export async function deleteComponentAction(id: string): Promise<void> {
  await requireUser()
  const deleted = await deleteComponent(serviceDeps().db, id)
  redirect(deleted ? '/?notice=deleted' : '/?notice=not-found')
}
